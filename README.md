# @marianmeres/wizard

Utility for high level management of [wizard](https://en.wikipedia.org/wiki/Wizard_(software))
data. Agnostic of the actual business or rendering. [Store](https://github.com/marianmeres/store)
compatible.

## Install
```shell
$ npm i @marianmeres/wizard
```

## Example usage

```typescript
const wizard = createWizardStore('foo', {
    steps: [
        { label: 'one', foo: 123 },
        {
            label: 'two',
            canGoNext: false,
            preNext: async (
                data,
                { context, wizard, setData, setError, setContext, setCanGoNext, touch }
            ) => {
                setCanGoNext(data.hey === context.hey)
            },
            prePrevious: async (data, { /*...*/ }) => {
                setCanGoNext(false);
                setData({});
            },
            preReset: async (data, { /*...*/ }) => {
                // ...
            }
        },
        { label: 'three' },
        { label: 'four' },
    ],
    context: { hey: 'ho' },
});

wizard.subscribe(async ({ step, steps, context }) => {
    // step props
    const { label, index, data, canGoNext, error, isFirst, isLast } = step;

    // do something here...

    // step api
    step.setData(/*data*/);
    step.setError(/*error*/);
    step.setContext(/*context*/);
    step.setCanGoNext(/*bool*/);
    step.touch(/*{ data, error, context, canGoNext }*/)

    await step.next(data);
    await step.previous();
});

// wizard api
await wizard.next(/*data*/);
await wizard.previous();
await wizard.reset();
await wizard.goto(index, stepsData);
wizard.isDone();

```

See [tests](./tests/wizard.test.ts) for more...
