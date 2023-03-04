type stringify = () => string;
type Label = string | Record<string, string> | stringify | object;
interface WizardStep extends Record<string, any> {
    label: Label;
    preNextHook?: (stepState: any, { context, setCurrentStepData, wizardStore }: {
        context: any;
        setCurrentStepData: any;
        wizardStore: any;
    }) => Promise<any>;
    prePreviousHook?: (stepState: any, { context, setCurrentStepData, wizardStore }: {
        context: any;
        setCurrentStepData: any;
        wizardStore: any;
    }) => Promise<any>;
    preResetHook?: (stepState: any, { context, setCurrentStepData, wizardStore }: {
        context: any;
        setCurrentStepData: any;
        wizardStore: any;
    }) => Promise<any>;
    validate?: (stepState: any, { context, wizardStore }: {
        context: any;
        wizardStore: any;
    }) => Promise<any>;
}
interface CreateWizardStoreOptions {
    steps: WizardStep[];
    context?: any;
    preResetHook?: ({ context, wizardStore }: {
        context: any;
        wizardStore: any;
    }) => Promise<any>;
}
export declare const createWizardStore: (label: Label, options: CreateWizardStoreOptions) => {
    context: any;
    get: Function;
    subscribe: (cb: Function) => Function;
    next: (currentStepData?: any) => Promise<number>;
    previous: () => Promise<number>;
    reset: () => Promise<number>;
    goto: (index: number, stepsData?: any[]) => Promise<string | number>;
    isDone: () => boolean;
};
export {};
