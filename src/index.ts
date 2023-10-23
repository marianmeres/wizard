import { createStore } from '@marianmeres/store';

type stringify = () => string;

// human readable label (or i18n like shape { locale: label }, or fn )
type Label = string | Record<string, string> | stringify | object;

type StepValues =
	| { data?: any; error?: any; canGoNext?: boolean; inProgress?: boolean }
	| true;

interface WizardStepConfig extends Record<string, any> {
	label: Label;
	// arbitrary step data, will be reset to initial state on reset action
	data?: any;
	// optional helper flag (will default to true if undefined) to indicate whether
	// wizard can proceed blindly from current to next step. It is a responsibility of the
	// step to modify this flag once next business conditions are met.
	canGoNext?: boolean;
	// wizard action hooks, will be called just before the action. They still can modify
	// steps state, which can prevent the action (where applicable).
	preNext?: (data, { context, set, wizard }) => Promise<any>;
	prePrevious?: (data, { context, set, wizard }) => Promise<any>;
	preReset?: (data, { context, set, wizard }) => Promise<any>;
}

interface WizardStep extends WizardStepConfig {
	index: number;
	error: Error | null;
	isFirst: boolean;
	isLast: boolean;
	next: (currentStepData: any) => Promise<any>;
	previous: CallableFunction;
	set: (values: StepValues) => void;
}

interface CreateWizardStoreOptions {
	steps: WizardStepConfig[];
	// arbitrary global object accessible to all steps, can be modified, but will not be
	// reset on reset or previous actions (so should be considered more as readonly)
	context?: any;
	// optional, for various cleanups if necessary, will be called last (after each step's
	// preReset)
	preReset?: ({ context, wizard }) => Promise<any>;
	//
	onDone: ({ context, steps, wizard, set }) => Promise<any>;
}

interface WizardStoreVal {
	step: WizardStep;
	steps: WizardStep[];
	inProgress: boolean;
}

const isFn = (v) => typeof v === 'function';
const deepClone = (data) => JSON.parse(JSON.stringify(data)); // poor man's deep clone

export const createWizardStore = (label: Label, options: CreateWizardStoreOptions) => {
	let { steps, context, preReset, onDone } = {
		steps: [],
		context: {},
		preReset: () => null,
		onDone: () => null,
		...(options || {}),
	};

	if (!Array.isArray(steps) || steps.length < 2) {
		throw new TypeError(`${label}: expecting array of at least 2 steps configs.`);
	}

	//
	let _inPre = false;
	const _normalizePreFn = (step, name): any => {
		const fn = isFn(step[name]) ? step[name] : () => true;
		return async (data, { context, set, wizard }) => {
			_inPre = true;
			try {
				await fn(data, { context, set, wizard });
			} catch (error) {
				throw error;
			} finally {
				_inPre = false;
			}
		};
	};

	// current step index
	let current = 0;
	const maxIndex = steps.length - 1;

	// used for resets
	let stepsDataBackup = [];
	let stepsCanGoNextBackup = [];

	// "pre" actions
	const pre = [];

	//
	let inProgress = false;
	const outShape = () => ({ steps, step: steps[current], inProgress } as WizardStoreVal);

	// "low level" setter
	const _set = (idx: number, values: StepValues) => {
		// return early special case force flag
		if (values === true) {
			stateStore.set(outShape());
			return idx;
		}

		let { data, error, canGoNext } = values || {};
		if (canGoNext !== undefined) canGoNext = !!canGoNext;

		//
		let changed = 0;
		Object.entries({ data, error, canGoNext }).forEach(([k, v]) => {
			if (v !== undefined && steps[idx][k] !== v) {
				steps[idx][k] = v;
				changed++;
			}
		});

		//
		if (values.inProgress !== undefined && values.inProgress !== inProgress) {
			inProgress = values.inProgress;
			changed++;
		}

		//
		changed && stateStore.set(outShape());
		return idx;
	};

	// a.k.a. publish
	const set = (values: StepValues = null) => _set(current, values);

	// idea of `currentStepData` is e.g. form values...
	const next = async (currentStepData = null): Promise<number> => {
		steps[current].data = {
			// always initial (if any)
			...stepsDataBackup[current],
			// with whatever previous modifications (if any)
			...(steps[current].data || {}),
			// with current parameter (if any)
			...(currentStepData || {}),
		};

		// make sure current step error is reset now
		steps[current].error = null;

		set({ inProgress: true });

		//
		try {
			await pre[current].preNext(steps[current].data, { context, wizard, set });
		} catch (e) {
			steps[current].error = e;
		}

		let wasLast = false;
		if (!steps[current].error && steps[current].canGoNext) {
			wasLast = steps[current].isLast;
			current = Math.min(maxIndex, current + 1);
			steps[current].error = null;
			// are we done?
			if (wasLast) {
				try {
					await onDone({ context, steps, wizard, set });
				} catch (e) {
					steps[current].error = e;
				}
			}
		} else {
			// add system custom error if not exist
			steps[current].error ||= [
				`Step (${current}): Cannot proceed.`,
				`(Hint: check if the 'canGoNext' step prop is re/set correctly)`,
			].join(' ');
		}

		return set({ inProgress: false });
	};

	//
	const previous = async (): Promise<number> => {
		// always can go back, but it's up to the step to take care of the data
		// modifications (if needed), such as e.g. reset step data and/or error, etc...
		set({ inProgress: true });
		try {
			await pre[current].prePrevious(steps[current].data, { context, wizard, set });
		} catch (e) {
			steps[current].error = e;
		}
		current = Math.max(0, current - 1);
		return set({ inProgress: false });
	};

	// returned string should be considered as error message
	const goto = async (index: number, stepsData = []): Promise<string | number> => {
		if (index < 0 || index > maxIndex) return `Invalid step index ${index}`;

		// going nowhere?
		if (index === current) return;

		// going back...
		if (index < current) {
			for (let i = current; i > index; i--) {
				await previous();
			}
		}
		// going forward...
		else {
			for (let i = current; i <= index; i++) {
				await next(stepsData[i]);
				if (steps[i].error) return i;
			}
		}

		return current;
	};

	//
	const reset = async (): Promise<number> => {
		// sanity check to avoid accidental logical flow errors
		if (_inPre) {
			throw new TypeError(`Cannot reset wizard state from inside of "pre" handlers.`);
		}

		set({ inProgress: true });

		// reset all (even if current is not at the end)
		// for (let i = steps.length - 1; i >= 0; i--) {
		for (let i = current; i >= 0; i--) {
			try {
				current = i;
				await pre[i].preReset(steps[i].data, { context, wizard, set });
			} catch (e) {
				// special case silence on reset
			}
		}

		try {
			await preReset({ context, wizard });
		} catch (e) {
			// special case silence on reset
		}

		stepsDataBackup.forEach((data, idx) => {
			steps[idx].data = data;
			steps[idx].error = null;
			steps[idx].canGoNext = stepsCanGoNextBackup[idx];
		});

		set({ inProgress: false });
		return current;
	};

	// normalize steps shapes
	steps = steps.map((step, _index) => {
		const data = step.data || {};
		const canGoNext = step.canGoNext === undefined ? true : !!step.canGoNext;

		stepsDataBackup[_index] = deepClone(data);
		stepsCanGoNextBackup[_index] = canGoNext;

		pre[_index] = {
			preNext: _normalizePreFn(step, 'preNext'),
			prePrevious: _normalizePreFn(step, 'prePrevious'),
			preReset: _normalizePreFn(step, 'preReset'),
		};
		return {
			...step,
			label: step.label || `${_index + 1}`,
			index: _index,
			data,
			canGoNext,
			error: null,
			isFirst: _index === 0,
			isLast: _index === maxIndex,
			// note: important to note here, that these are evaled in the context of "current"
			next,
			previous,
			// importatnt to "bind" the setter to the step's index, not "current"
			set: (values: StepValues = null) => _set(_index, values),
		};
	});

	//
	const stateStore = createStore<{
		step: WizardStep;
		steps: WizardStep[];
		inProgress: boolean;
	}>(outShape());

	//
	const wizard = {
		get: stateStore.get,
		subscribe: stateStore.subscribe,
		context,
		next,
		previous,
		reset,
		goto,
		label,
	};

	return wizard;
};
