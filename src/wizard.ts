import { createStore, type StoreLike } from "@marianmeres/store";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Human readable label - can be a simple string, i18n-like object { locale: label },
 * or a function returning string. Use `resolveLabel()` to obtain a string.
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
	/** Whether navigation to previous step is allowed */
	canGoPrevious?: boolean;
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
	 * Defaults to true. Set to false to require the step to enable it
	 * (e.g. from within `preNext` via `update({ canGoNext: true })`).
	 */
	canGoNext?: boolean;
	/**
	 * Flag indicating whether wizard can navigate back from this step.
	 * Defaults to true. Set to false to prevent `previous()` from moving.
	 */
	canGoPrevious?: boolean;
	/** Called before moving to next step */
	preNext?: PreHook<TData, TContext>;
	/** Called before moving to previous step */
	prePrevious?: PreHook<TData, TContext>;
	/** Called before reset */
	preReset?: PreHook<TData, TContext>;
}

/**
 * Runtime step instance with computed properties and bound update method.
 *
 * Note: The raw hook functions (`preNext`, `prePrevious`, `preReset`) are
 * intentionally NOT exposed on the runtime step object — they are held
 * internally and invoked through the wizard's lifecycle so that lifecycle
 * guards and error capture are always applied.
 */
export interface WizardStep<TData, TContext> {
	/** Human readable step label */
	label: Label;
	/** Zero-based index of this step */
	index: number;
	/** Step data (always initialized, never undefined at runtime) */
	data: TData;
	/** Current error state (null if no error) */
	error: Error | string | null;
	/** Whether navigation to next step is allowed */
	canGoNext: boolean;
	/** Whether navigation to previous step is allowed */
	canGoPrevious: boolean;
	/** Whether this is the first step */
	isFirst: boolean;
	/** Whether this is the last step */
	isLast: boolean;
	/** Update this step's state (data, error, canGoNext, canGoPrevious) */
	update: (values: StepUpdateValues<TData>) => void;
	/** Convenience: clear this step's error */
	clearError: () => void;
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
	/**
	 * True after `onDone` has completed successfully. Subsequent `next()`
	 * calls on the last step are no-ops until `reset()` or `previous()` is
	 * called.
	 */
	isDone: boolean;
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
// Helpers
// -----------------------------------------------------------------------------

const isFn = (v: unknown): v is (...args: unknown[]) => unknown =>
	typeof v === "function";

/**
 * Deep clone using structuredClone with fallback to JSON for edge cases.
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
 * Resolves a {@link Label} to a plain string.
 *
 * - `string`           → returned as-is
 * - `() => string`     → invoked and result returned
 * - `Record<string,string>` → value for `locale` if present, else first value,
 *   else empty string
 *
 * @example
 * ```ts
 * resolveLabel("Step 1");                         // "Step 1"
 * resolveLabel({ en: "Step 1", de: "Schritt 1" }, "de"); // "Schritt 1"
 * resolveLabel({ en: "Step 1" });                 // "Step 1"
 * resolveLabel(() => "Step 1");                   // "Step 1"
 * ```
 */
export function resolveLabel(label: Label, locale?: string): string {
	if (typeof label === "string") return label;
	if (typeof label === "function") return label();
	if (label && typeof label === "object") {
		if (locale && locale in label) return label[locale];
		const values = Object.values(label);
		return values[0] ?? "";
	}
	return "";
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

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
 * wizard.subscribe(({ step, steps, inProgress, isDone }) => {
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

	// Concurrency guard — true while a top-level navigation (next/previous/
	// goto/reset) is in-flight. Concurrent calls (including calls made from
	// inside pre-hooks/onDone/globalPreReset) are silently ignored and simply
	// return `current`. This also subsumes the former "cannot call navigation
	// from inside pre-hooks" check — the two cases are indistinguishable from
	// flag state alone, so they collapse into one consistent rule.
	let isNavigating = false;

	let current = 0;
	const maxIndex = stepConfigs.length - 1;

	const dataBackup: TData[] = [];
	const canGoNextBackup: boolean[] = [];
	const canGoPreviousBackup: boolean[] = [];

	const preHooks: {
		preNext: (data: TData, ctx: HookContext<TData, TContext>) => Promise<void>;
		prePrevious: (
			data: TData,
			ctx: HookContext<TData, TContext>,
		) => Promise<void>;
		preReset: (data: TData, ctx: HookContext<TData, TContext>) => Promise<void>;
	}[] = [];

	let inProgress = false;
	let isDone = false;

	// Thin wrapper that normalizes optional callbacks to always-callable
	// async functions — no lifecycle flag is toggled here; reentrancy is
	// handled by the concurrency guard on the public methods.
	const wrapOptional = <TArgs extends unknown[], TRet>(
		fn: ((...args: TArgs) => TRet | Promise<TRet>) | undefined,
	): (...args: TArgs) => Promise<TRet | undefined> => {
		const actual = isFn(fn)
			? (fn as (...args: TArgs) => TRet | Promise<TRet>)
			: undefined;
		return async (...args: TArgs) => {
			if (!actual) return undefined;
			return await actual(...args);
		};
	};

	const wrappedOnDone = wrapOptional(onDone);
	const wrappedGlobalPreReset = wrapOptional(globalPreReset);

	// Build steps WITHOUT spreading the raw config — raw hooks must not leak
	// onto the runtime step object, because calling them directly would
	// bypass lifecycle tracking and error capture.
	const steps: WizardStep<TData, TContext>[] = stepConfigs.map((config, index) => {
		const data = (config.data ?? {}) as TData;
		const canGoNext = config.canGoNext ?? true;
		const canGoPrevious = config.canGoPrevious ?? true;

		dataBackup[index] = deepClone(data);
		canGoNextBackup[index] = canGoNext;
		canGoPreviousBackup[index] = canGoPrevious;

		preHooks[index] = {
			preNext: wrapOptional(config.preNext) as (
				data: TData,
				ctx: HookContext<TData, TContext>,
			) => Promise<void>,
			prePrevious: wrapOptional(config.prePrevious) as (
				data: TData,
				ctx: HookContext<TData, TContext>,
			) => Promise<void>,
			preReset: wrapOptional(config.preReset) as (
				data: TData,
				ctx: HookContext<TData, TContext>,
			) => Promise<void>,
		};

		return {
			label: config.label || `${index + 1}`,
			index,
			data,
			canGoNext,
			canGoPrevious,
			error: null,
			isFirst: index === 0,
			isLast: index === maxIndex,
			update: () => {},
			clearError: () => {},
		};
	});

	const getStoreValue = (): WizardStoreValue<TData, TContext> => ({
		steps,
		step: steps[current],
		inProgress,
		isDone,
	});

	const store = createStore<WizardStoreValue<TData, TContext>>(getStoreValue());

	// Low-level update for a specific step index.
	// Note: when `data` is present, we always publish — the user's intent is
	// "commit this value". Reference-equality short-circuits were removed
	// because in-place mutation + same-reference passing previously produced
	// silent no-ops (a common footgun).
	const updateStep = (index: number, values: StepUpdateValues<TData>): void => {
		log(`  updateStep(${index})`, values);

		let changed = false;
		const step = steps[index];

		if (values.data !== undefined) {
			const newData: TData = typeof values.data === "function"
				? (values.data as (current: TData) => TData)(step.data)
				: values.data;
			step.data = newData;
			changed = true;
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

		if (values.canGoPrevious !== undefined) {
			const val = !!values.canGoPrevious;
			if (step.canGoPrevious !== val) {
				step.canGoPrevious = val;
				changed = true;
			}
		}

		if (changed) {
			store.set(getStoreValue());
		}
	};

	const setInProgress = (value: boolean): void => {
		if (inProgress !== value) {
			inProgress = value;
			store.set(getStoreValue());
		}
	};

	const publish = (): number => {
		store.set(getStoreValue());
		return current;
	};

	const updateCurrent = (values: StepUpdateValues<TData>): void => {
		updateStep(current, values);
	};

	// Forward reference for wizard (needed for hook context)
	// deno-lint-ignore prefer-const
	let wizard: Wizard<TData, TContext>;

	const createHookContext = (index: number): HookContext<TData, TContext> => ({
		context,
		update: (values) => updateStep(index, values),
		wizard,
	});

	// -------------------------------------------------------------------------
	// Internal navigation — no concurrency guards. Public wrappers below
	// enforce them. Separating the two avoids re-entrancy issues when `goto`
	// needs to call `next`/`previous` while its own guard is held.
	// -------------------------------------------------------------------------

	const _next = async (currentStepData?: Partial<TData>): Promise<number> => {
		log(`next()`, { current });
		const idx = current;

		// Defensive: public `next` already short-circuits when isDone. Kept
		// here in case `_next` is reached through another path in the future.
		if (isDone) return current;

		steps[idx].data = {
			...dataBackup[idx],
			...(steps[idx].data || {}),
			...(currentStepData || {}),
		} as TData;

		steps[idx].error = null;

		setInProgress(true);

		try {
			await preHooks[idx].preNext(steps[idx].data, createHookContext(idx));
		} catch (e) {
			steps[idx].error = e instanceof Error ? e : new Error(String(e));
			log(`  error in preNext(${idx})`, steps[idx].error);
		}

		if (!steps[idx].canGoNext) {
			steps[idx].error ??=
				`Step (${idx}): Cannot proceed. (Hint: check 'canGoNext' flag)`;
		}

		if (!steps[idx].error && steps[idx].isLast) {
			try {
				await wrappedOnDone({
					context,
					steps,
					wizard,
					update: updateCurrent,
				});
				isDone = true;
			} catch (e) {
				steps[idx].error = e instanceof Error ? e : new Error(String(e));
				log(`  error in onDone()`, steps[idx].error);
			}
		}

		setInProgress(false);

		// Explicit `!isLast` — previously the increment was clamped by
		// Math.min(maxIndex, current + 1), which masked state-corruption bugs
		// where onDone (or any captured reference) mutated `current`.
		if (!steps[idx].error && !steps[idx].isLast) {
			current += 1;
			log(`  incremented pointer to ${current}`);
			steps[current].error = null;
		}

		return publish();
	};

	const _previous = async (): Promise<number> => {
		log(`previous()`, { current });
		const idx = current;

		// Clear leaving step's error before running prePrevious (symmetric
		// with _next — both publish a clean error slate before invoking the
		// user's hook).
		steps[idx].error = null;

		setInProgress(true);

		try {
			await preHooks[idx].prePrevious(steps[idx].data, createHookContext(idx));
		} catch (e) {
			steps[idx].error = e instanceof Error ? e : new Error(String(e));
			log(`  error in prePrevious(${idx})`, steps[idx].error);
		}

		setInProgress(false);

		// canGoPrevious blocks backward navigation. prePrevious hook errors
		// do NOT block — they are captured but navigation still proceeds,
		// which preserves the documented "back always works" semantic unless
		// the step explicitly opts out via `canGoPrevious: false`.
		if (steps[idx].canGoPrevious && !steps[idx].isFirst) {
			current -= 1;
			log(`  decremented pointer to ${current}`);
			// Clear destination step's stale error on arrival (symmetric
			// with _next's forward arrival).
			steps[current].error = null;
			// Navigating away from the completed state.
			isDone = false;
		}

		return publish();
	};

	const _reset = async (): Promise<number> => {
		log(`reset()`, { current });

		// Single inProgress transition instead of toggling per step (avoids
		// subscriber flicker through intermediate step indices).
		setInProgress(true);

		// Run per-step preReset hooks in reverse order. Do NOT mutate
		// `current` during the walk — subscribers should observe reset as a
		// single transition from "wherever we were" to "step 0".
		for (let i = current; i >= 0; i--) {
			try {
				await preHooks[i].preReset(steps[i].data, createHookContext(i));
			} catch (e) {
				log(`  swallowed error in preReset(${i})`, e);
			}
		}

		try {
			await wrappedGlobalPreReset({ context, wizard });
		} catch (e) {
			log(`  swallowed error in global preReset()`, e);
		}

		for (let i = 0; i < steps.length; i++) {
			steps[i].data = deepClone(dataBackup[i]);
			steps[i].error = null;
			steps[i].canGoNext = canGoNextBackup[i];
			steps[i].canGoPrevious = canGoPreviousBackup[i];
		}

		current = 0;
		isDone = false;
		// Direct assignment (not setInProgress) — avoids a duplicate publish;
		// the final `publish()` below emits the new state as a single event.
		inProgress = false;

		return publish();
	};

	// -------------------------------------------------------------------------
	// Public navigation — enforces lifecycle and concurrency guards.
	// -------------------------------------------------------------------------

	const next = async (currentStepData?: Partial<TData>): Promise<number> => {
		if (isNavigating) {
			log(`next() ignored — navigation already in progress`);
			return current;
		}
		if (isDone) {
			log(`next() ignored — wizard is already done`);
			return current;
		}
		isNavigating = true;
		try {
			return await _next(currentStepData);
		} finally {
			isNavigating = false;
		}
	};

	const previous = async (): Promise<number> => {
		if (isNavigating) {
			log(`previous() ignored — navigation already in progress`);
			return current;
		}
		isNavigating = true;
		try {
			return await _previous();
		} finally {
			isNavigating = false;
		}
	};

	const reset = async (): Promise<number> => {
		if (isNavigating) {
			log(`reset() ignored — navigation already in progress`);
			return current;
		}
		isNavigating = true;
		try {
			return await _reset();
		} finally {
			isNavigating = false;
		}
	};

	const goto = async (
		targetIndex: number,
		stepsData: (Partial<TData> | null)[] = [],
		assert = true,
	): Promise<number> => {
		if (isNavigating) {
			log(`goto() ignored — navigation already in progress`);
			return current;
		}

		log(`goto(${targetIndex})`, { current });

		if (targetIndex < 0 || targetIndex > maxIndex) {
			throw new RangeError(`Invalid step index ${targetIndex}`);
		}

		if (targetIndex === current) {
			return current;
		}

		isNavigating = true;
		try {
			let lastErrIdx: number | undefined;

			// Loop while progress is made. If `current` fails to advance
			// toward `targetIndex`, the loop exits (either on an explicit
			// error on the step, or on a silent block e.g. canGoPrevious=false).
			if (targetIndex < current) {
				while (current > targetIndex) {
					const idx = current;
					await _previous();
					if (current === idx) {
						lastErrIdx = idx;
						break;
					}
					if (steps[idx].error) {
						log(`  error in goto back loop (index ${idx})`, steps[idx].error);
						lastErrIdx = idx;
						break;
					}
				}
			} else {
				while (current < targetIndex) {
					const idx = current;
					await _next(stepsData[idx] ?? undefined);
					if (current === idx) {
						lastErrIdx = idx;
						break;
					}
					if (steps[idx].error) {
						log(
							`  error in goto forward loop (index ${idx})`,
							steps[idx].error,
						);
						lastErrIdx = idx;
						break;
					}
				}
			}

			if (assert && lastErrIdx !== undefined) {
				throw new Error(
					`The 'goto(${targetIndex})' command did not succeed. Check step[${lastErrIdx}]'s error.`,
				);
			}

			return current;
		} finally {
			isNavigating = false;
		}
	};

	const allowCanGoNext = (): number => {
		for (const step of steps) {
			step.canGoNext = true;
		}
		return publish();
	};

	const resetCanGoNext = (): number => {
		for (let i = 0; i < steps.length; i++) {
			steps[i].canGoNext = canGoNextBackup[i];
		}
		return publish();
	};

	// Bind update / clearError to each step.
	for (let i = 0; i < steps.length; i++) {
		steps[i].update = (values) => updateStep(i, values);
		steps[i].clearError = () => updateStep(i, { error: null });
	}

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
