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
	//
	logger?: (...args: any[]) => undefined;
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

	const log = (...args) => {
		if (isFn(options.logger)) {
			options.logger.apply(options.logger, args);
		}
	};

	// wrap "pre" handlers, co we can track actions called from inside those handlers
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

	// current step index... (should not be changed directly, but via de/increment fns below)
	let current = 0;
	const maxIndex = steps.length - 1;

	// a.k.a. go next (note that pointer change by itself does not "publish" the change)
	const incrementPointer = () => {
		current = Math.min(maxIndex, current + 1);
		log(`  ... incremented pointer to ${current}`);
	};

	// a.k.a. go previous (note that pointer change by itself does not "publish" the change)
	const decrementPointer = () => {
		current = Math.max(0, current - 1);
		log(`  ... decremented pointer to ${current}`);
	};

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
		log(`  _set(${idx})`, values);

		// explicit true is understood as "publish current" flag
		if (values === true) {
			stateStore.set(outShape());
			return idx;
		}

		let { data, error, canGoNext } = values || {};
		if (canGoNext !== undefined) canGoNext = !!canGoNext;

		//
		let changed = 0;
		Object.entries({ data, error, canGoNext }).forEach(([k, v]) => {
			if (v !== undefined && (steps[idx][k] !== v || isFn(v))) {
				// support for fn value... handy for updates, e.g.:
				// set({ data: (old) => ({ ...old, foo: 'bar' }) })
				if (isFn(v)) v = v(steps[idx][k]);
				//
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

	// a.k.a. publish/update store
	const set = (values: StepValues = null): number => {
		log('set() ...');
		return _set(current, values);
	};

	// idea of `currentStepData` is e.g. form values...
	const next = async (currentStepData: any = null): Promise<number> => {
		log(`next() ...`, { current });
		const _current = current; // freeze

		//
		steps[_current].data = {
			// always initial (if any)
			...stepsDataBackup[_current],
			// with whatever previous modifications (if any)
			...(steps[_current].data || {}),
			// with current parameter (if any)
			...(currentStepData || {}),
		};

		// make sure current step error is reset now
		steps[_current].error = null;

		_set(_current, { inProgress: true });

		//
		try {
			await pre[_current].preNext(steps[_current].data, { context, wizard, set });
		} catch (e) {
			steps[_current].error = e;
			log(`  error in next:preNext(${_current})`, e.toString());
		}

		if (!steps[_current].canGoNext) {
			// add system custom error if not exist
			steps[_current].error ||= [
				`Step (${_current}): Cannot proceed.`,
				`(Hint: check if the 'canGoNext' step prop is re/set correctly)`,
			].join(' ');
		}

		//
		if (!steps[_current].error && steps[_current].isLast) {
			try {
				await onDone({ context, steps, wizard, set });
			} catch (e) {
				steps[_current].error = e;
				log(`  error in next:onDone()`, { current: _current }, e.toString());
			}
		}

		// done next-ing...
		_set(_current, { inProgress: false });

		// finally, if no error, move pointer to the next step
		if (!steps[_current].error) {
			incrementPointer();
			// if there was historically an error in the next step, make sure to reset it now
			steps[current].error = null;
		}

		// "publish" the change
		return set(true);
	};

	//
	const previous = async (): Promise<number> => {
		log('previous() ...', { current });
		const _current = current;
		// always can go back, but it's up to the step to take care of the data
		// modifications (if needed), such as e.g. reset step data and/or error, etc...
		_set(_current, { inProgress: true });
		try {
			await pre[_current].prePrevious(steps[_current].data, { context, wizard, set });
		} catch (e) {
			steps[_current].error = e;
			log(`  error in previous()`, { current: _current }, e.toString());
		}

		// done previous-ing...
		_set(_current, { inProgress: false });

		// do not care for error here, move pointer downwards anyway
		decrementPointer();

		// "publish" the change
		return set(true);
	};

	//
	const goto = async (
		targetIndex: number,
		stepsData = [],
		assert = true
	): Promise<number> => {
		log(`goto(${targetIndex}) ...`, { current });

		if (targetIndex < 0 || targetIndex > maxIndex) {
			throw new RangeError(`Invalid step index ${targetIndex}`);
		}

		// going nowhere?
		if (targetIndex === current) return;

		let _movedToIdx;
		let _lastErrIdx;

		// going back...
		if (targetIndex < current) {
			for (let i = current; i > targetIndex; i--) {
				_movedToIdx = await previous();
				if (steps[i].error) {
					log(`  error detected in goto back loop (index ${i})`, steps[i].error);
					_lastErrIdx = i;
					break;
				}
			}
		}
		// going forward...
		else {
			for (let i = current; i < targetIndex; i++) {
				_movedToIdx = await next(stepsData[i]);
				if (steps[i].error) {
					log(`  error detected in goto forward loop (index ${i})`, steps[i].error);
					_lastErrIdx = i;
					break;
				}
			}
		}

		// did not make it successfully...
		if (assert && _lastErrIdx !== undefined) {
			// prettier-ignore
			throw new Error([
				`The 'goto(${targetIndex}, ...)' command did not succeed.`,
				// do not edit, as this is easily parsable (yet ugly and hackish) if truly needed
				// /step\[(\d+)\]/
				`Check step[${_lastErrIdx}]'s error.`,
			].join(' '));
		}

		return _movedToIdx;
	};

	//
	const reset = async (): Promise<number> => {
		log('reset() ...', { current });

		// sanity check to avoid accidental logical flow errors
		if (_inPre) {
			throw new TypeError(`Cannot reset wizard state from inside of "pre" handlers.`);
		}

		// reset all (even if current is not at the end)
		// for (let i = steps.length - 1; i >= 0; i--) {
		for (let i = current; i >= 0; i--) {
			try {
				current = i;
				_set(i, { inProgress: true });
				await pre[i].preReset(steps[i].data, { context, wizard, set });
			} catch (e) {
				// special case silence on reset
				log(`  swallowed error inside reset loop (preReset(${i}))`, e.toString());
			} finally {
				_set(i, { inProgress: false });
			}
		}

		try {
			await preReset({ context, wizard });
		} catch (e) {
			// special case silence on reset
			log(`  swallowed error inside global preReset()`, e.toString());
		}

		stepsDataBackup.forEach((data, idx) => {
			steps[idx].data = data;
			steps[idx].error = null;
			steps[idx].canGoNext = stepsCanGoNextBackup[idx];
		});

		// "publish" the change
		return set(true);
	};

	// "softer" version of reset - will not touch steps data (call pre handlers),
	// just reset the `canGoNext` flags to their initial values...
	const resetCanGoNext = () => {
		steps = steps.map((step, i) => ({ ...step, canGoNext: stepsCanGoNextBackup[i] }));
		return set(true);
	};

	// it might be desired to just allow jumping up/down without any state business...
	const allowCanGoNext = () => {
		steps = steps.map((step, i) => ({ ...step, canGoNext: true }));
		return set(true);
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
			label: step.label || `${_index + 1}`, // defaults to "1" based human readable index
			index: _index,
			data,
			canGoNext,
			error: null,
			isFirst: _index === 0,
			isLast: _index === maxIndex,
			// note: important to note here, that these are evaluated in the context of "current"
			next,
			previous,
			// importatnt to "bind" the setter to the step's index, not "current"
			set: (values: StepValues = null) => {
				log('step.set() ...');
				_set(_index, values);
			},
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
		allowCanGoNext,
		resetCanGoNext,
	};

	return wizard;
};
