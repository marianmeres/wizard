import { createStore } from '@marianmeres/store';

type stringify = () => string;

// human readable label (or i18n like shape { locale: label }, or fn )
type Label = string | Record<string, string> | stringify | object;

interface WizardStep extends Record<string, any> {
	label: Label;
	// wizard action hooks
	preNextHook?: (stepState, { context, setCurrentStepData, wizardStore }) => Promise<any>; // called before validate)
	prePreviousHook?: (
		stepState,
		{ context, setCurrentStepData, wizardStore }
	) => Promise<any>;
	preResetHook?: (
		stepState,
		{ context, setCurrentStepData, wizardStore }
	) => Promise<any>;
	// optional fn to validate current step (and effectively dis/allow to continue)
	validate?: (stepState, { context, wizardStore }) => Promise<any>;
}

interface CreateWizardStoreOptions {
	steps: WizardStep[];
	// **should** be considered readonly... for writable data use step data
	context?: any;
	preResetHook?: ({ context, wizardStore }) => Promise<any>;
}

const isFn = (v) => typeof v === 'function';

export const createWizardStore = (label: Label, options: CreateWizardStoreOptions) => {
	let { steps, context, preResetHook } = {
		steps: [],
		context: {},
		preResetHook: () => null,
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

	// normalize steps configs
	steps = steps.map((step, _index) => {
		const data = step.data || {};
		stepsDataBackup[_index] = _deepClone(data);
		return {
			...step,
			label: step.label || `${_index + 1}`,
			data,
			validate: _normalizeFn(step, 'validate'),
			preNextHook: _normalizeFn(step, 'preNextHook'),
			prePreviousHook: _normalizeFn(step, 'prePreviousHook'),
			preResetHook: _normalizeFn(step, 'preResetHook'),
			error: null,
			index: _index,
			isFirst: _index === 0,
			isLast: _index === maxIndex,
		};
	});

	const outShape = (steps, current) => ({
		steps,
		current,
		step: steps[current],
		context,
	});
	const stateStore = createStore(outShape(steps, current));
	const publish = (steps, current) => stateStore.set(outShape(steps, current));

	// idea of `currentStepData` is e.g. form values...
	const next = async (currentStepData = null): Promise<number> => {
		// return early if done
		if (wizardStore.isDone()) return current;

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

		// there might have been a custom step action hook...
		await steps[current].preNextHook(steps[current].data, {
			context,
			wizardStore,
			setCurrentStepData: (data) => (steps[current].data = data),
		});

		//
		const validate = await steps[current].validate(steps[current].data, {
			context,
			wizardStore,
		});

		// only explicit `true` result is considered valid
		if (validate === true) {
			current = Math.min(maxIndex, current + 1);
			steps[current].error = null;
		}
		// everything else is considered invalid
		else {
			steps[current].error = { validate };
		}

		publish([...steps], current);
		return current;
	};

	//
	const previous = async (): Promise<number> => {
		// always can go back, but it's up to the step to take care of the data
		// modifications (if needed), such as e.g. reset step data and/or error, etc...
		await steps[current].prePreviousHook(steps[current].data, {
			context,
			wizardStore,
			setCurrentStepData: (data) => (steps[current].data = data),
		});

		//
		current = Math.max(0, current - 1);
		publish([...steps], current);
		return current;
	};

	// returned string should be considered as error message
	const goto = async (index: number, stepsData = []): Promise<string | number> => {
		if (index < 0 || index > maxIndex) return `Invalid step index ${index}`;

		// goin nowhere?
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
				if (steps[i].error) {
					return i;
				}
			}
		}

		return current;
	};

	//
	const reset = async (): Promise<number> => {
		for (let i = current; i >= 0; i--) {
			current = i;
			await steps[current].preResetHook(steps[current].data, {
				context,
				wizardStore,
				setCurrentStepData: (data) => (steps[current].data = data),
			});
		}
		await preResetHook({ context, wizardStore });
		stepsDataBackup.forEach((data, idx) => (steps[idx].data = data));
		publish([...steps], current);
		return current;
	};

	//
	const wizardStore = {
		get: stateStore.get,
		subscribe: stateStore.subscribe,
		next,
		previous,
		reset,
		goto,
		isDone: () => current === maxIndex,
	};

	return wizardStore;
};
