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
            preNext: async (data, { context, wizard, set }) => {
                set({ canGoNext: data.hey === context.hey })
            },
            prePrevious: async (data, { set }) => {
                set({ canGoNext: false, data: {} });
            },
            preReset: async (data, { context, wizard, set }) => {
                // ...
            }
        },
        { label: 'three' },
        { label: 'four' },
    ],
    context: { hey: 'ho' },
    done: async ({ steps, context }) => '...', // will be called on last .next()
});

wizard.subscribe(async ({ step, steps }) => {
    // step props
    const { label, index, data, canGoNext, error, isFirst, isLast } = step;

    // do something here...

    // step api
    step.set(/*{ data, error, canGoNext }*/)

    await step.next(data);
    await step.previous();
});

// wizard api
wizard.context; // reference to context object
await wizard.next(/*data*/);
await wizard.previous();
await wizard.reset();
await wizard.goto(index, stepsData);

```

See [tests](./tests/wizard.test.ts) for more...
