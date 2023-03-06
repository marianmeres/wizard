import { createStore } from '@marianmeres/store';

type stringify = () => string;

// human readable label (or i18n like shape { locale: label }, or fn )
type Label = string | Record<string, string> | stringify | object;

interface WizardStepConfig extends Record<string, any> {
	label: Label;
	// arbitrary step data, will be reset to initial state on reset action
	data?: any;
	// optional helper flag (will default to true if undefined) to indicate whether
	// wizard can proceed blindly from current to next step. It is a responsibility of the
	// step to modify this flag once next business conditions are met.
	canGoNext?: boolean;
	// wizard action hooks, will be called just before the action. They still can modify
	// steps state, which can prevent the action (where aplicable).
	preNext?: (data, { context, set, wizard }) => Promise<any>;
	prePrevious?: (data, { context, set, wizard }) => Promise<any>;
	preReset?: (data, { context, set, wizard }) => Promise<any>;
}

interface WizardStep extends WizardStepConfig {}

interface CreateWizardStoreOptions {
	steps: WizardStepConfig[];
	// arbitrary global object accessible to all steps, can be modified, but will not be
	// reset on reset or previous actions (so should be considered more as readonly)
	context?: any;
	// optional, for various cleanups if necessary, will be called last (after each step's
	// preReset)
	preReset?: ({ context, wizard }) => Promise<any>;
	//
	done: ({ context, steps }) => Promise<any>;
}

const isFn = (v) => typeof v === 'function';

export const createWizardStore = (label: Label, options: CreateWizardStoreOptions) => {
	let { steps, context, preReset, done } = {
		steps: [],
		context: {},
		preReset: () => null,
		done: () => null,
		...(options || {}),
	};

	if (!Array.isArray(steps) || steps.length < 2) {
		throw new TypeError(`${label}: expecting array of at least 2 steps configs.`);
	}

	const _normalizeFn = (step, name): any => (isFn(step[name]) ? step[name] : () => true);
	const _deepClone = (data) => JSON.parse(JSON.stringify(data)); // poor man's deep clone

	// current step index
	let current = 0;
	const maxIndex = steps.length - 1;

	// used for resets
	let stepsDataBackup = [];
	let stepsCanGoNextBackup = [];

	// "pre" actions
	const pre = [];

	//
	const outShape = () => ({ steps, step: steps[current] });

	// a.k.a. publish
	const set = (values: { data: any; error: any; canGoNext: boolean } | true = null) => {
		// return early special case force flag
		if (values === true) {
			stateStore.set(outShape());
			return current;
		}

		let { data, error, canGoNext } = values || {};
		canGoNext = !!canGoNext;

		//
		let changed = 0;
		Object.entries({ data, error, canGoNext }).forEach(([k, v]) => {
			if (v !== undefined && steps[current][k] !== v) {
				steps[current][k] = v;
				changed++;
			}
		});

		//
		changed && stateStore.set(outShape());
		return current;
	};

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

		// prettier-ignore
		await pre[current].preNext(steps[current].data, { context, wizard, set });

		let wasLast = false;
		if (steps[current].canGoNext) {
			wasLast = steps[current].isLast;
			current = Math.min(maxIndex, current + 1);
			steps[current].error = null;
		} else {
			// add system custom error if not exist
			steps[current].error ||=
				'Cannot proceed. Check your step state and/or `canGoNext` flag.';
		}

		// are we done?
		if (wasLast) await done({ context, steps });

		return set(true);
	};

	//
	const previous = async (): Promise<number> => {
		// always can go back, but it's up to the step to take care of the data
		// modifications (if needed), such as e.g. reset step data and/or error, etc...
		await pre[current].prePrevious(steps[current].data, { context, wizard, set });

		//
		current = Math.max(0, current - 1);
		return set(true);
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
		for (let i = current; i >= 0; i--) {
			current = i;
			await pre[current].preReset(steps[current].data, { context, wizard, set });
		}
		await preReset({ context, wizard });
		stepsDataBackup.forEach((data, idx) => {
			steps[idx].data = data;
			steps[idx].error = null;
			steps[idx].canGoNext = stepsCanGoNextBackup[idx];
		});
		set(true);
		return current;
	};

	// normalize steps shapes
	steps = steps.map((step, _index) => {
		const data = step.data || {};
		const canGoNext = step.canGoNext === undefined ? true : !!step.canGoNext;

		stepsDataBackup[_index] = _deepClone(data);
		stepsCanGoNextBackup[_index] = canGoNext;

		pre[_index] = {
			preNext: _normalizeFn(step, 'preNext'),
			prePrevious: _normalizeFn(step, 'prePrevious'),
			preReset: _normalizeFn(step, 'preReset'),
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
			set,
			next,
			previous,
		};
	});

	//
	const stateStore = createStore(outShape());

	//
	const wizard = {
		get: stateStore.get,
		subscribe: stateStore.subscribe,
		context,
		next,
		previous,
		reset,
		goto,
	};

	return wizard;
};
