const e=e=>"function"==typeof e,r=(r,t="")=>{if(!e(r))throw new TypeError(`${t} Expecting function arg`.trim())},s=(t=undefined,s=null)=>{const n=r=>e(s?.persist)&&s.persist(r);let c=(()=>{const e=new Map,r=r=>(e.has(r)||e.set(r,new Set),e.get(r)),t=(e,t)=>{if("function"!=typeof t)throw new TypeError("Expecting callback function as second argument");return r(e).add(t),()=>r(e).delete(t)};return {publish:(e,t={})=>{r(e).forEach((e=>e(t)));},subscribe:t,subscribeOnce:(e,r)=>{const s=t(e,(e=>{r(e),s();}));return s},unsubscribeAll:r=>e.delete(r)}})(),i=t;n(i);const u=()=>i,o=e=>{i!==e&&(i=e,n(i),c.publish("change",i));};return {set:o,get:u,update:e=>{r(e,"[update]"),o(e(u()));},subscribe:e=>(r(e,"[subscribe]"),e(i),c.subscribe("change",e))}};

const isFn = (v) => typeof v === 'function';
const createWizardStore = (label, options) => {
    let { steps, context, preReset } = {
        steps: [],
        context: {},
        preReset: () => null,
        ...(options || {}),
    };
    if (!Array.isArray(steps) || steps.length < 2) {
        throw new TypeError(`${label}: expecting array of at least 2 steps configs.`);
    }
    const _normalizeFn = (step, name) => (isFn(step[name]) ? step[name] : () => true);
    const _deepClone = (data) => JSON.parse(JSON.stringify(data));
    let current = 0;
    const maxIndex = steps.length - 1;
    let stepsDataBackup = [];
    const outShape = () => ({ steps, step: steps[current], context });
    const touch = (values = null) => {
        const { data, error, canGoNext } = values || {};
        if (data !== undefined)
            steps[current].data = data;
        if (error !== undefined)
            steps[current].error = error;
        if (canGoNext !== undefined)
            steps[current].canGoNext = !!canGoNext;
        if (values?.context !== undefined)
            context = values.context;
        steps = [...steps];
        stateStore.set(outShape());
        return current;
    };
    const setData = (data) => touch({ data });
    const setError = (error) => touch({ error });
    const setContext = (context) => touch({ context });
    const setCanGoNext = (canGoNext) => touch({ canGoNext });
    const next = async (currentStepData = null) => {
        if (wizard.isDone())
            return current;
        steps[current].data = {
            ...stepsDataBackup[current],
            ...(steps[current].data || {}),
            ...(currentStepData || {}),
        };
        steps[current].error = null;
        await steps[current].preNext(steps[current].data, { context, wizard, setData, setError, setContext, setCanGoNext, touch });
        if (steps[current].canGoNext) {
            current = Math.min(maxIndex, current + 1);
            steps[current].error = null;
        }
        else {
            steps[current].error ||=
                'Cannot proceed. Check your step state and/or `canGoNext` flag.';
        }
        return touch();
    };
    const previous = async () => {
        await steps[current].prePrevious(steps[current].data, { context, wizard, setData, setError, setContext, setCanGoNext, touch });
        current = Math.max(0, current - 1);
        return touch();
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
        for (let i = current; i >= 0; i--) {
            current = i;
            await steps[current].preReset(steps[current].data, { context, wizard, setData, setError, setContext, setCanGoNext, touch });
        }
        await preReset({ context, wizard });
        stepsDataBackup.forEach((data, idx) => (steps[idx].data = data));
        touch();
        return current;
    };
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
    const stateStore = s(outShape());
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

export { createWizardStore };
