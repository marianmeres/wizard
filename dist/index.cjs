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
    let stepsDataBackup = [];
    let stepsCanGoNextBackup = [];
    const pre = [];
    let inProgress = false;
    const outShape = () => ({ steps, step: steps[current], inProgress });
    const _set = (idx, values) => {
        if (values === true) {
            stateStore.set(outShape());
            return idx;
        }
        let { data, error, canGoNext } = values || {};
        if (canGoNext !== undefined)
            canGoNext = !!canGoNext;
        let changed = 0;
        Object.entries({ data, error, canGoNext }).forEach(([k, v]) => {
            if (v !== undefined && steps[idx][k] !== v) {
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
    const set = (values = null) => _set(current, values);
    const next = async (currentStepData = null) => {
        steps[current].data = {
            ...stepsDataBackup[current],
            ...(steps[current].data || {}),
            ...(currentStepData || {}),
        };
        steps[current].error = null;
        set({ inProgress: true });
        try {
            await pre[current].preNext(steps[current].data, { context, wizard, set });
        }
        catch (e) {
            steps[current].error = e;
        }
        let wasLast = false;
        if (!steps[current].error && steps[current].canGoNext) {
            wasLast = steps[current].isLast;
            current = Math.min(maxIndex, current + 1);
            steps[current].error = null;
            if (wasLast) {
                try {
                    await onDone({ context, steps, wizard, set });
                }
                catch (e) {
                    steps[current].error = e;
                }
            }
        }
        else {
            steps[current].error ||= [
                `Step (${current}): Cannot proceed.`,
                `(Hint: check if the 'canGoNext' step prop is re/set correctly)`,
            ].join(' ');
        }
        return set({ inProgress: false });
    };
    const previous = async () => {
        set({ inProgress: true });
        try {
            await pre[current].prePrevious(steps[current].data, { context, wizard, set });
        }
        catch (e) {
            steps[current].error = e;
        }
        current = Math.max(0, current - 1);
        return set({ inProgress: false });
    };
    const goto = async (index, stepsData = []) => {
        if (index < 0 || index > maxIndex)
            return `Invalid step index ${index}`;
        if (index === current)
            return;
        if (index < current) {
            for (let i = current; i > index; i--) {
                await previous();
            }
        }
        else {
            for (let i = current; i <= index; i++) {
                await next(stepsData[i]);
                if (steps[i].error)
                    return i;
            }
        }
        return current;
    };
    const reset = async () => {
        if (_inPre) {
            throw new TypeError(`Cannot reset wizard state from inside of "pre" handlers.`);
        }
        set({ inProgress: true });
        for (let i = current; i >= 0; i--) {
            try {
                current = i;
                await pre[i].preReset(steps[i].data, { context, wizard, set });
            }
            catch (e) {
            }
        }
        try {
            await preReset({ context, wizard });
        }
        catch (e) {
        }
        stepsDataBackup.forEach((data, idx) => {
            steps[idx].data = data;
            steps[idx].error = null;
            steps[idx].canGoNext = stepsCanGoNextBackup[idx];
        });
        set({ inProgress: false });
        return current;
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
            set: (values = null) => _set(_index, values),
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
    };
    return wizard;
};

exports.createWizardStore = createWizardStore;
