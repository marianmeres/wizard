import { createStore, type StoreLike } from "@marianmeres/store";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Human readable label - can be a simple string, i18n-like object { locale: label },
 * or a function returning string
 */
export type Label = string | Record<string, string> | (() => string);

/**
 * Logger function signature for debugging
 */
export type Logger = (...args: unknown[]) => void;

/**
 * Values that can be updated on a step via the `update()` method
 */
export interface StepUpdateValues<TData> {
	/** Step data - can be a direct value or an updater function receiving current data */
	data?: TData | ((current: TData) => TData);
	/** Error state - set to null to clear, Error or string to set */
	error?: Error | string | null;
	/** Whether navigation to next step is allowed */
	canGoNext?: boolean;
}

/**
 * Hook context passed to all pre-action hooks
 */
export interface HookContext<TData, TContext> {
	/** Global context object shared across all steps */
	context: TContext;
	/** Update function to modify step state */
	update: (values: StepUpdateValues<TData>) => void;
	/** Reference to the wizard instance */
	wizard: Wizard<TData, TContext>;
}

/**
 * Pre-action hook function signature
 */
export type PreHook<TData, TContext> = (
	data: TData,
	ctx: HookContext<TData, TContext>,
) => Promise<void> | void;

/**
 * Configuration for a single wizard step
 */
export interface WizardStepConfig<TData, TContext> {
	/** Human readable step label */
	label: Label;
	/** Step-specific data, will be reset to initial state on reset */
	data?: TData;
	/**
	 * Flag indicating whether wizard can proceed from this step.
	 * Defaults to true. The step should modify this once business conditions are met.
	 */
	canGoNext?: boolean;
	/** Called before moving to next step */
	preNext?: PreHook<TData, TContext>;
	/** Called before moving to previous step */
	prePrevious?: PreHook<TData, TContext>;
	/** Called before reset */
	preReset?: PreHook<TData, TContext>;
}

/**
 * Runtime step instance with computed properties and bound update method
 */
export interface WizardStep<TData, TContext>
	extends Omit<WizardStepConfig<TData, TContext>, "data"> {
	/** Zero-based index of this step */
	index: number;
	/** Step data (always initialized, never undefined at runtime) */
	data: TData;
	/** Current error state (null if no error) */
	error: Error | string | null;
	/** Whether this is the first step */
	isFirst: boolean;
	/** Whether this is the last step */
	isLast: boolean;
	/** Update this step's state (data, error, canGoNext) */
	update: (values: StepUpdateValues<TData>) => void;
}

/**
 * Options for creating a wizard store
 */
export interface CreateWizardOptions<TData, TContext> {
	/** Array of step configurations (minimum 2 required) */
	steps: WizardStepConfig<TData, TContext>[];
	/**
	 * Global context object accessible to all steps.
	 * Can be modified but won't be reset on reset/previous actions.
	 */
	context?: TContext;
	/** Called after all step preReset hooks during reset */
	preReset?: (
		ctx: { context: TContext; wizard: Wizard<TData, TContext> },
	) => Promise<void> | void;
	/** Called when next() is invoked on the last step */
	onDone: (ctx: {
		context: TContext;
		steps: WizardStep<TData, TContext>[];
		wizard: Wizard<TData, TContext>;
		update: (values: StepUpdateValues<TData>) => void;
	}) => Promise<void> | void;
	/** Optional logger for debugging */
	logger?: Logger;
}

/**
 * The value shape emitted by the wizard store
 */
export interface WizardStoreValue<TData, TContext> {
	/** Current active step */
	step: WizardStep<TData, TContext>;
	/** All steps array */
	steps: WizardStep<TData, TContext>[];
	/** Whether an async operation is in progress */
	inProgress: boolean;
}

/**
 * The wizard instance returned by createWizard
 */
export interface Wizard<TData, TContext> {
	/** Get current store value */
	get: () => WizardStoreValue<TData, TContext>;
	/** Subscribe to store changes */
	subscribe: StoreLike<WizardStoreValue<TData, TContext>>["subscribe"];
	/** Global context object */
	context: TContext;
	/** Wizard label */
	label: Label;
	/** Move to next step, optionally passing data to merge */
	next: (currentStepData?: Partial<TData>) => Promise<number>;
	/** Move to previous step */
	previous: () => Promise<number>;
	/** Reset wizard to initial state */
	reset: () => Promise<number>;
	/** Jump to specific step index */
	goto: (
		targetIndex: number,
		stepsData?: (Partial<TData> | null)[],
		assert?: boolean,
	) => Promise<number>;
	/** Allow free navigation by setting all canGoNext to true */
	allowCanGoNext: () => number;
	/** Reset canGoNext flags to their initial values */
	resetCanGoNext: () => number;
	/** Explicitly publish current state (triggers subscribers) */
	publish: () => number;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

const isFn = (v: unknown): v is (...args: unknown[]) => unknown =>
	typeof v === "function";

/**
 * Deep clone using structuredClone with fallback to JSON for edge cases
 */
function deepClone<T>(data: T): T {
	try {
		return structuredClone(data);
	} catch {
		// Fallback for non-cloneable data (functions, etc.)
		return JSON.parse(JSON.stringify(data));
	}
}

/**
 * Creates a wizard store for managing multi-step flows.
 *
 * @typeParam TData - The shape of step data (shared across all steps)
 * @typeParam TContext - The shape of the global context object
 * @param label - Human-readable wizard identifier
 * @param options - Wizard configuration options
 * @returns A wizard instance with navigation methods and store interface
 * @throws {TypeError} If less than 2 steps are provided
 *
 * @example
 * ```typescript
 * interface StepData {
 *   name?: string;
 *   email?: string;
 *   agreed?: boolean;
 * }
 *
 * interface Context {
 *   userId: string;
 * }
 *
 * const wizard = createWizard<StepData, Context>('registration', {
 *   steps: [
 *     { label: 'Personal Info', data: { name: '', email: '' } },
 *     { label: 'Terms', canGoNext: false, data: { agreed: false } },
 *     { label: 'Confirmation' },
 *   ],
 *   context: { userId: '123' },
 *   onDone: async ({ steps, context }) => {
 *     // Submit registration
 *   },
 * });
 *
 * wizard.subscribe(({ step, steps, inProgress }) => {
 *   // Update UI
 * });
 * ```
 */
export function createWizard<
	TData = Record<string, unknown>,
	TContext = Record<string, unknown>,
>(
	label: Label,
	options: CreateWizardOptions<TData, TContext>,
): Wizard<TData, TContext> {
	const {
		steps: stepConfigs = [],
		context = {} as TContext,
		preReset: globalPreReset,
		onDone,
		logger,
	} = options;

	if (!Array.isArray(stepConfigs) || stepConfigs.length < 2) {
		throw new TypeError(`${label}: expecting array of at least 2 step configs.`);
	}

	const log: Logger = (...args) => {
		if (logger) logger(...args);
	};

	// Track if we're inside a pre-hook (to prevent reset during hooks)
	let inPreHook = false;

	// Wrap pre-hooks to track execution state
	const wrapPreHook = <T extends PreHook<TData, TContext> | undefined>(
		hook: T,
	): PreHook<TData, TContext> => {
		const fn = isFn(hook) ? hook : () => {};
		return async (data, ctx) => {
			inPreHook = true;
			try {
				await fn(data, ctx);
			} finally {
				inPreHook = false;
			}
		};
	};

	// Current step index
	let current = 0;
	const maxIndex = stepConfigs.length - 1;

	// Backups for reset
	const dataBackup: TData[] = [];
	const canGoNextBackup: boolean[] = [];

	// Wrapped pre-hooks
	const preHooks: {
		preNext: PreHook<TData, TContext>;
		prePrevious: PreHook<TData, TContext>;
		preReset: PreHook<TData, TContext>;
	}[] = [];

	// In-progress flag
	let inProgress = false;

	// Initialize steps array
	const steps: WizardStep<TData, TContext>[] = stepConfigs.map((config, index) => {
		const data = (config.data ?? {}) as TData;
		const canGoNext = config.canGoNext ?? true;

		// Store backups
		dataBackup[index] = deepClone(data);
		canGoNextBackup[index] = canGoNext;

		// Store wrapped hooks
		preHooks[index] = {
			preNext: wrapPreHook(config.preNext),
			prePrevious: wrapPreHook(config.prePrevious),
			preReset: wrapPreHook(config.preReset),
		};

		return {
			...config,
			label: config.label || `${index + 1}`,
			index,
			data,
			canGoNext,
			error: null,
			isFirst: index === 0,
			isLast: index === maxIndex,
			// Will be properly bound after wizard is created
			update: () => {},
		};
	});

	// Create the store
	const getStoreValue = (): WizardStoreValue<TData, TContext> => ({
		steps,
		step: steps[current],
		inProgress,
	});

	const store = createStore<WizardStoreValue<TData, TContext>>(getStoreValue());

	// Low-level update for a specific step index
	const updateStep = (index: number, values: StepUpdateValues<TData>): void => {
		log(`  updateStep(${index})`, values);

		let changed = false;
		const step = steps[index];

		if (values.data !== undefined) {
			const newData: TData = typeof values.data === "function"
				? (values.data as (current: TData) => TData)(step.data)
				: values.data;
			if (step.data !== newData) {
				step.data = newData;
				changed = true;
			}
		}

		if (values.error !== undefined && step.error !== values.error) {
			step.error = values.error;
			changed = true;
		}

		if (values.canGoNext !== undefined) {
			const val = !!values.canGoNext;
			if (step.canGoNext !== val) {
				step.canGoNext = val;
				changed = true;
			}
		}

		if (changed) {
			store.set(getStoreValue());
		}
	};

	// Set inProgress and publish
	const setInProgress = (value: boolean): void => {
		if (inProgress !== value) {
			inProgress = value;
			store.set(getStoreValue());
		}
	};

	// Publish current state
	const publish = (): number => {
		store.set(getStoreValue());
		return current;
	};

	// Update for current step
	const updateCurrent = (values: StepUpdateValues<TData>): void => {
		updateStep(current, values);
	};

	// Forward reference for wizard (needed for hook context)
	// deno-lint-ignore prefer-const
	let wizard: Wizard<TData, TContext>;

	// Create hook context
	const createHookContext = (index: number): HookContext<TData, TContext> => ({
		context,
		update: (values) => updateStep(index, values),
		wizard,
	});

	// Helper to check if navigation is allowed
	const assertNotInHook = (method: string): void => {
		if (inPreHook) {
			throw new TypeError(
				`Cannot call ${method}() from inside pre-hooks. Use setTimeout to defer if needed.`,
			);
		}
	};

	// Navigation: next
	const next = async (currentStepData?: Partial<TData>): Promise<number> => {
		assertNotInHook("next");
		log(`next()`, { current });
		const idx = current;

		// Merge data
		steps[idx].data = {
			...dataBackup[idx],
			...(steps[idx].data || {}),
			...(currentStepData || {}),
		} as TData;

		// Clear error
		steps[idx].error = null;

		setInProgress(true);

		// Run preNext hook
		try {
			await preHooks[idx].preNext(steps[idx].data, createHookContext(idx));
		} catch (e) {
			steps[idx].error = e instanceof Error ? e : new Error(String(e));
			log(`  error in preNext(${idx})`, steps[idx].error);
		}

		// Check canGoNext
		if (!steps[idx].canGoNext) {
			steps[idx].error ??=
				`Step (${idx}): Cannot proceed. (Hint: check 'canGoNext' flag)`;
		}

		// If last step and no error, call onDone
		if (!steps[idx].error && steps[idx].isLast) {
			try {
				await onDone({
					context,
					steps,
					wizard,
					update: updateCurrent,
				});
			} catch (e) {
				steps[idx].error = e instanceof Error ? e : new Error(String(e));
				log(`  error in onDone()`, steps[idx].error);
			}
		}

		setInProgress(false);

		// Move forward if no error
		if (!steps[idx].error) {
			current = Math.min(maxIndex, current + 1);
			log(`  incremented pointer to ${current}`);
			// Clear any historical error on the new step
			steps[current].error = null;
		}

		return publish();
	};

	// Navigation: previous
	const previous = async (): Promise<number> => {
		assertNotInHook("previous");
		log(`previous()`, { current });
		const idx = current;

		setInProgress(true);

		try {
			await preHooks[idx].prePrevious(steps[idx].data, createHookContext(idx));
		} catch (e) {
			steps[idx].error = e instanceof Error ? e : new Error(String(e));
			log(`  error in prePrevious(${idx})`, steps[idx].error);
		}

		setInProgress(false);

		// Always go back regardless of error
		current = Math.max(0, current - 1);
		log(`  decremented pointer to ${current}`);

		return publish();
	};

	// Navigation: goto
	const goto = async (
		targetIndex: number,
		stepsData: (Partial<TData> | null)[] = [],
		assert = true,
	): Promise<number> => {
		assertNotInHook("goto");
		log(`goto(${targetIndex})`, { current });

		if (targetIndex < 0 || targetIndex > maxIndex) {
			throw new RangeError(`Invalid step index ${targetIndex}`);
		}

		if (targetIndex === current) {
			return current;
		}

		let movedToIdx = current;
		let lastErrIdx: number | undefined;

		if (targetIndex < current) {
			// Going back
			for (let i = current; i > targetIndex; i--) {
				movedToIdx = await previous();
				if (steps[i].error) {
					log(`  error in goto back loop (index ${i})`, steps[i].error);
					lastErrIdx = i;
					break;
				}
			}
		} else {
			// Going forward
			for (let i = current; i < targetIndex; i++) {
				movedToIdx = await next(stepsData[i] ?? undefined);
				if (steps[i].error) {
					log(`  error in goto forward loop (index ${i})`, steps[i].error);
					lastErrIdx = i;
					break;
				}
			}
		}

		if (assert && lastErrIdx !== undefined) {
			throw new Error(
				`The 'goto(${targetIndex})' command did not succeed. Check step[${lastErrIdx}]'s error.`,
			);
		}

		return movedToIdx;
	};

	// Reset
	const reset = async (): Promise<number> => {
		assertNotInHook("reset");
		log(`reset()`, { current });

		// Reset from current back to start
		for (let i = current; i >= 0; i--) {
			current = i;
			setInProgress(true);
			try {
				await preHooks[i].preReset(steps[i].data, createHookContext(i));
			} catch (e) {
				// Silence errors during reset
				log(`  swallowed error in preReset(${i})`, e);
			}
			setInProgress(false);
		}

		// Global preReset
		if (globalPreReset) {
			try {
				await globalPreReset({ context, wizard });
			} catch (e) {
				log(`  swallowed error in global preReset()`, e);
			}
		}

		// Restore initial data and flags
		for (let i = 0; i < steps.length; i++) {
			steps[i].data = deepClone(dataBackup[i]);
			steps[i].error = null;
			steps[i].canGoNext = canGoNextBackup[i];
		}

		current = 0;
		return publish();
	};

	// Allow free navigation
	const allowCanGoNext = (): number => {
		for (const step of steps) {
			step.canGoNext = true;
		}
		return publish();
	};

	// Reset canGoNext to initial values
	const resetCanGoNext = (): number => {
		for (let i = 0; i < steps.length; i++) {
			steps[i].canGoNext = canGoNextBackup[i];
		}
		return publish();
	};

	// Bind update method to each step
	for (let i = 0; i < steps.length; i++) {
		steps[i].update = (values) => updateStep(i, values);
	}

	// Create wizard instance
	wizard = {
		get: store.get,
		subscribe: store.subscribe,
		context,
		label,
		next,
		previous,
		reset,
		goto,
		allowCanGoNext,
		resetCanGoNext,
		publish,
	};

	return wizard;
}
