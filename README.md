# wizard

Utility for managing [wizard-like](https://en.wikipedia.org/wiki/Wizard_(software)) data.
Agnostic of the actual UI framework. [Store](https://github.com/marianmeres/store) compatible.

Provides `validate`, `next`, `previous`, `reset` ... (async) api. See tests for more.

## Install
```shell
$ npm i @marianmeres/wizard
```

## Usage

```typescript

interface WizardStep extends Record<string, any> {
    label: Label;
    validate?: (stepState, { context, wizardStore }) => Promise<any>;
    preNextHook?: (stepState, { context, setCurrentStepData, wizardStore }) => Promise<any>;
    prePreviousHook?: (stepState, { context, setCurrentStepData, wizardStore }) => Promise<any>;
    preResetHook?: (stepState, { context, setCurrentStepData, wizardStore }) => Promise<any>;
}

interface CreateWizardStoreOptions {
    steps: WizardStep[];
    context?: any;
    preResetHook?: ({ context, wizardStore }) => Promise<any>;
}

// createWizardStore = (label: Label, options: CreateWizardStoreOptions);

// example usage
const wizard = createWizardStore('My wizard', {
    steps: [
        { label: 'one', /*...*/ },
        { label: 'two', /*...*/ },
        { label: 'three', /*...*/ },
    ],
    context: { /*...*/ }
});

//
wizard.subscribe(({ step, steps, current, context }) => {
    // `step` is:
    // label: string;
    // data: any; // local writable step data
    // error: null | { validate: any }; // validate results
    // index: number; // step index
    // isFirst: boolean;
    // isLast: boolean;
    // methods (see WizardStep signatures above)
    // validate, preNextHook, prePreviousHook, preResetHook

	// `steps` is array of all `step` object describe above
    // `current` is current step's index
	// `context` is a reference to "global" factory context option

    // e.g render current step
    someRenderFunction(step);
});

// control flow via:
wizard.next(data);
wizard.previous();
wizard.reset();
wizard.goto(stepIndex, stepsData = []);

```
