'use strict';

const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},n=(r=undefined,n=null)=>{const s=t=>e(n?.persist)&&n.persist(t);let i=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return {publish:(e,r={})=>{t(e).forEach((e=>e(r)));},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n();}));return n},unsubscribeAll:t=>e.delete(t)}})(),c=r;s(c);const o=()=>c,u=e=>{c!==e&&(c=e,s(c),i.publish("change",c));};return {set:u,get:o,update:e=>{t(e,"[update]"),u(e(o()));},subscribe:e=>(t(e,"[subscribe]"),e(c),i.subscribe("change",e))}};

const isFn = (v) => typeof v === 'function';
const deepClone = (data) => JSON.parse(JSON.stringify(data));
const createWizardStore = (label, options) => {
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
    let _inPre = false;
    const _normalizePreFn = (step, name) => {
        const fn = isFn(step[name]) ? step[name] : () => true;
        return async (data, { context, set, wizard }) => {
            _inPre = true;
            try {
                await fn(data, { context, set, wizard });
            }
            catch (error) {
                throw error;
            }
            finally {
                _inPre = false;
            }
        };
    };
    let current = 0;
    const maxIndex = steps.length - 1;
    const incrementPointer = () => {
        current = Math.min(maxIndex, current + 1);
        log(`  ... incremented pointer to ${current}`);
    };
    const decrementPointer = () => {
        current = Math.max(0, current - 1);
        log(`  ... decremented pointer to ${current}`);
    };
    let stepsDataBackup = [];
    let stepsCanGoNextBackup = [];
    const pre = [];
    let inProgress = false;
    const outShape = () => ({ steps, step: steps[current], inProgress });
    const _set = (idx, values) => {
        log(`  _set(${idx})`, values);
        if (values === true) {
            stateStore.set(outShape());
            return idx;
        }
        let { data, error, canGoNext } = values || {};
        if (canGoNext !== undefined)
            canGoNext = !!canGoNext;
        let changed = 0;
        Object.entries({ data, error, canGoNext }).forEach(([k, v]) => {
            if (v !== undefined && (steps[idx][k] !== v || isFn(v))) {
                if (isFn(v))
                    v = v(steps[idx][k]);
                steps[idx][k] = v;
                changed++;
            }
        });
        if (values.inProgress !== undefined && values.inProgress !== inProgress) {
            inProgress = values.inProgress;
            changed++;
        }
        changed && stateStore.set(outShape());
        return idx;
    };
    const set = (values = null) => {
        log('set() ...');
        return _set(current, values);
    };
    const next = async (currentStepData = null) => {
        log(`next() ...`, { current });
        const _current = current;
        steps[_current].data = {
            ...stepsDataBackup[_current],
            ...(steps[_current].data || {}),
            ...(currentStepData || {}),
        };
        steps[_current].error = null;
        _set(_current, { inProgress: true });
        try {
            await pre[_current].preNext(steps[_current].data, { context, wizard, set });
        }
        catch (e) {
            steps[_current].error = e;
            log(`  error in next:preNext(${_current})`, e.toString());
        }
        if (!steps[_current].canGoNext) {
            steps[_current].error ||= [
                `Step (${_current}): Cannot proceed.`,
                `(Hint: check if the 'canGoNext' step prop is re/set correctly)`,
            ].join(' ');
        }
        if (!steps[_current].error && steps[_current].isLast) {
            try {
                await onDone({ context, steps, wizard, set });
            }
            catch (e) {
                steps[_current].error = e;
                log(`  error in next:onDone()`, { current: _current }, e.toString());
            }
        }
        _set(_current, { inProgress: false });
        if (!steps[_current].error) {
            incrementPointer();
            steps[current].error = null;
        }
        return set(true);
    };
    const previous = async () => {
        log('previous() ...', { current });
        const _current = current;
        _set(_current, { inProgress: true });
        try {
            await pre[_current].prePrevious(steps[_current].data, { context, wizard, set });
        }
        catch (e) {
            steps[_current].error = e;
            log(`  error in previous()`, { current: _current }, e.toString());
        }
        _set(_current, { inProgress: false });
        decrementPointer();
        return set(true);
    };
    const goto = async (targetIndex, stepsData = [], assert = true) => {
        log(`goto(${targetIndex}) ...`, { current });
        if (targetIndex < 0 || targetIndex > maxIndex) {
            throw new RangeError(`Invalid step index ${targetIndex}`);
        }
        if (targetIndex === current)
            return;
        let _movedToIdx;
        let _lastErrIdx;
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
        if (assert && _lastErrIdx !== undefined) {
            throw new Error([
                `The 'goto(${targetIndex}, ...)' command did not succeed.`,
                `Check step[${_lastErrIdx}]'s error.`,
            ].join(' '));
        }
        return _movedToIdx;
    };
    const reset = async () => {
        log('reset() ...', { current });
        if (_inPre) {
            throw new TypeError(`Cannot reset wizard state from inside of "pre" handlers.`);
        }
        for (let i = current; i >= 0; i--) {
            try {
                current = i;
                _set(i, { inProgress: true });
                await pre[i].preReset(steps[i].data, { context, wizard, set });
            }
            catch (e) {
                log(`  swallowed error inside reset loop (preReset(${i}))`, e.toString());
            }
            finally {
                _set(i, { inProgress: false });
            }
        }
        try {
            await preReset({ context, wizard });
        }
        catch (e) {
            log(`  swallowed error inside global preReset()`, e.toString());
        }
        stepsDataBackup.forEach((data, idx) => {
            steps[idx].data = data;
            steps[idx].error = null;
            steps[idx].canGoNext = stepsCanGoNextBackup[idx];
        });
        return set(true);
    };
    const resetCanGoNext = () => {
        steps = steps.map((step, i) => ({ ...step, canGoNext: stepsCanGoNextBackup[i] }));
        return set(true);
    };
    const allowCanGoNext = () => {
        steps = steps.map((step, i) => ({ ...step, canGoNext: true }));
        return set(true);
    };
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
            next,
            previous,
            set: (values = null) => {
                log('step.set() ...');
                _set(_index, values);
            },
        };
    });
    const stateStore = n(outShape());
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

exports.createWizardStore = createWizardStore;
