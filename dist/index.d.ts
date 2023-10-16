type stringify = () => string;
type Label = string | Record<string, string> | stringify | object;
interface WizardStepConfig extends Record<string, any> {
    label: Label;
    data?: any;
    canGoNext?: boolean;
    preNext?: (data: any, { context, set, wizard }: {
        context: any;
        set: any;
        wizard: any;
    }) => Promise<any>;
    prePrevious?: (data: any, { context, set, wizard }: {
        context: any;
        set: any;
        wizard: any;
    }) => Promise<any>;
    preReset?: (data: any, { context, set, wizard }: {
        context: any;
        set: any;
        wizard: any;
    }) => Promise<any>;
}
interface CreateWizardStoreOptions {
    steps: WizardStepConfig[];
    context?: any;
    preReset?: ({ context, wizard }: {
        context: any;
        wizard: any;
    }) => Promise<any>;
    onDone: ({ context, steps, wizard, set }: {
        context: any;
        steps: any;
        wizard: any;
        set: any;
    }) => Promise<any>;
}
export declare const createWizardStore: (label: Label, options: CreateWizardStoreOptions) => {
    get: () => unknown;
    subscribe: (cb: import("@marianmeres/store").Subscribe<unknown>) => import("@marianmeres/store").Unsubscribe;
    context: any;
    next: (currentStepData?: any) => Promise<number>;
    previous: () => Promise<number>;
    reset: () => Promise<number>;
    goto: (index: number, stepsData?: any[]) => Promise<string | number>;
};
export {};
