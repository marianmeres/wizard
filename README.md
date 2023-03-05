# wizard

Utility for high level management of [wizard](https://en.wikipedia.org/wiki/Wizard_(software))
data. Agnostic of the actual business or rendering. [Store](https://github.com/marianmeres/store)
compatible.

## Install
```shell
$ npm i @marianmeres/wizard
```

## Usage

```typescript
const wizard = createWizardStore('foo', {
    steps: [
        { label: 'one', foo: 123 },
        {
            label: 'two',
            canGoNext: false,
            preNext: async (data, { context, wizard, setData, setError, setContext, setCanGoNext, touch }) => {
                setCanGoNext(data.hey === context.hey)
            },
            prePrevious: async (data, { context, wizard, setData, setError, setContext, setCanGoNext, touch }) => {
                setCanGoNext(false);
                setData({});
            },
            preReset: async (data, { context, wizard, setData, setError, setContext, setCanGoNext, touch }) => {
                // ...
            }
        },
        { label: 'three' },
        { label: 'four' },
    ],
    context: { hey: 'ho' },
});

wizard.subscribe(async ({ step, steps, context }) => {
    // do something...

	// step props
	const { label, index, data, canGoNext, error, isFirst, isLast } = step;

	// step api
    step.setData(/*data*/);
    step.setError(/*error*/);
    step.setContext(/*context*/);
    step.setCanGoNext(/*bool*/);
    step.touch(/*{ data, error, context, canGoNext }*/)

	step.next(data);
    step.previous();
});

// wizard api
wizard.next(/*data*/);
wizard.previous();
wizard.reset();
wizard.goto(index, stepsData);
wizard.isDone();

```

For now, just see [tests](./tests)...
