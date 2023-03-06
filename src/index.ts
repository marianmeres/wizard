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
	preNext?: (
		data,
		{ context, setData, setError, setContext, setCanGoNext, touch, wizard }
	) => Promise<any>;
	prePrevious?: (
		data,
		{ context, setData, setError, setContext, setCanGoNext, touch, wizard }
	) => Promise<any>;
	preReset?: (
		data,
		{ context, setData, setError, setContext, setCanGoNext, touch, wizard }
	) => Promise<any>;
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
}

const isFn = (v) => typeof v === 'function';

export const createWizardStore = (label: Label, options: CreateWizardStoreOptions) => {
	let { steps, context, preReset } = {
		steps: [],
		context: {},
		preReset: () => null,
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

	//
	const outShape = () => ({ steps, step: steps[current], context });

	// a.k.a. publish
	const touch = (values = null) => {
		// return early special case force flag
		if (values === true) {
			stateStore.set(outShape());
			return current;
		}

		let { data, error, canGoNext } = values || {};
		let changed = 0;
		//
		if (data !== undefined && steps[current].data !== data) {
			steps[current].data = data;
			changed++;
		}
		//
		if (error !== undefined && steps[current].error !== error) {
			steps[current].error = error;
			changed++;
		}
		//
		canGoNext = !!canGoNext;
		if (canGoNext !== undefined && steps[current].canGoNext !== canGoNext) {
			steps[current].canGoNext = canGoNext;
			changed++;
		}
		//
		if (values?.context !== undefined && values.context !== context) {
			context = values.context;
			changed++;
		}
		//
		changed && stateStore.set(outShape());
		return current;
	};

	const setData = (data) => touch({ data });
	const setError = (error) => touch({ error });
	const setContext = (context) => touch({ context });
	const setCanGoNext = (canGoNext: boolean = true) => touch({ canGoNext });

	// idea of `currentStepData` is e.g. form values...
	const next = async (currentStepData = null): Promise<number> => {
		// return early if done
		if (wizard.isDone()) return current;

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
		await steps[current].preNext(
			steps[current].data,
			{ context, wizard, setData, setError, setContext, setCanGoNext, touch }
		);

		if (steps[current].canGoNext) {
			current = Math.min(maxIndex, current + 1);
			steps[current].error = null;
		} else {
			// add system custom error if not exist
			steps[current].error ||=
				'Cannot proceed. Check your step state and/or `canGoNext` flag.';
		}

		return touch(true);
	};

	//
	const previous = async (): Promise<number> => {
		// always can go back, but it's up to the step to take care of the data
		// modifications (if needed), such as e.g. reset step data and/or error, etc...
		// prettier-ignore
		await steps[current].prePrevious(
			steps[current].data,
			{ context, wizard, setData, setError, setContext, setCanGoNext, touch }
		);

		//
		current = Math.max(0, current - 1);
		return touch(true);
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
			// prettier-ignore
			await steps[current].preReset(
				steps[current].data,
				{ context, wizard, setData, setError, setContext, setCanGoNext, touch }
			);
		}
		await preReset({ context, wizard });
		stepsDataBackup.forEach((data, idx) => {
			steps[idx].data = data;
			steps[idx].error = null;
		});
		touch(true);
		return current;
	};

	// normalize steps shapes
	steps = steps.map((step, _index) => {
		const data = step.data || {};
		stepsDataBackup[_index] = _deepClone(data);
		return {
			...step,
			label: step.label || `${_index + 1}`,
			index: _index,
			data,
			canGoNext: step.canGoNext === undefined ? true : !!step.canGoNext,
			error: null,
			isFirst: _index === 0,
			isLast: _index === maxIndex,
			preNext: _normalizeFn(step, 'preNext'),
			prePrevious: _normalizeFn(step, 'prePrevious'),
			preReset: _normalizeFn(step, 'preReset'),
			setData,
			setError,
			setContext,
			setCanGoNext,
			touch,
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
		next,
		previous,
		reset,
		goto,
		isDone: () => current === maxIndex,
	};

	return wizard;
};
