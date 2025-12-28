# API Reference

Complete API documentation for `@marianmeres/wizard`.

## Table of Contents

- [createWizard](#createwizard)
- [Types](#types)
  - [Label](#label)
  - [Logger](#logger)
  - [StepUpdateValues](#stepupdatevalues)
  - [HookContext](#hookcontext)
  - [PreHook](#prehook)
  - [WizardStepConfig](#wizardstepconfig)
  - [WizardStep](#wizardstep)
  - [CreateWizardOptions](#createwizardoptions)
  - [WizardStoreValue](#wizardstorevalue)
  - [Wizard](#wizard)

---

## createWizard

```typescript
function createWizard<TData, TContext>(
	label: Label,
	options: CreateWizardOptions<TData, TContext>,
): Wizard<TData, TContext>;
```

Creates a wizard store for managing multi-step flows.

### Type Parameters

| Parameter  | Default                   | Description                                      |
| ---------- | ------------------------- | ------------------------------------------------ |
| `TData`    | `Record<string, unknown>` | The shape of step data (shared across all steps) |
| `TContext` | `Record<string, unknown>` | The shape of the global context object           |

### Parameters

| Parameter | Type                                   | Description                      |
| --------- | -------------------------------------- | -------------------------------- |
| `label`   | `Label`                                | Human-readable wizard identifier |
| `options` | `CreateWizardOptions<TData, TContext>` | Wizard configuration options     |

### Returns

`Wizard<TData, TContext>` - A wizard instance with navigation methods and store interface.

### Throws

- `TypeError` - If less than 2 steps are provided

### Example

```typescript
interface StepData {
	name?: string;
	email?: string;
	agreed?: boolean;
}

interface Context {
	userId: string;
}

const wizard = createWizard<StepData, Context>("registration", {
	steps: [
		{ label: "Personal Info", data: { name: "", email: "" } },
		{ label: "Terms", canGoNext: false, data: { agreed: false } },
		{ label: "Confirmation" },
	],
	context: { userId: "123" },
	onDone: async ({ steps, context }) => {
		// Submit registration
	},
});

wizard.subscribe(({ step, steps, inProgress }) => {
	// Update UI
});
```

---

## Types

### Label

```typescript
type Label = string | Record<string, string> | (() => string);
```

Human readable label - can be a simple string, i18n-like object `{ locale: label }`, or a
function returning string.

**Examples:**

```typescript
// Simple string
const label1: Label = "Step 1";

// i18n object
const label2: Label = { en: "Step 1", de: "Schritt 1" };

// Function
const label3: Label = () => `Step ${getStepNumber()}`;
```

---

### Logger

```typescript
type Logger = (...args: unknown[]) => void;
```

Logger function signature for debugging. Receives arbitrary arguments that can be logged
for debugging purposes.

---

### StepUpdateValues

```typescript
interface StepUpdateValues<TData> {
	data?: TData | ((current: TData) => TData);
	error?: Error | string | null;
	canGoNext?: boolean;
}
```

Values that can be updated on a step via the `update()` method.

| Property    | Type                                   | Description                                                                     |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `data`      | `TData \| ((current: TData) => TData)` | Step data - can be a direct value or an updater function receiving current data |
| `error`     | `Error \| string \| null`              | Error state - set to `null` to clear, `Error` or string to set                  |
| `canGoNext` | `boolean`                              | Whether navigation to next step is allowed                                      |

**Examples:**

```typescript
// Direct value update
step.update({ data: { name: "John" } });

// Functional update
step.update({ data: (prev) => ({ ...prev, count: prev.count + 1 }) });

// Set error
step.update({ error: new Error("Validation failed") });

// Clear error
step.update({ error: null });

// Enable navigation
step.update({ canGoNext: true });
```

---

### HookContext

```typescript
interface HookContext<TData, TContext> {
	context: TContext;
	update: (values: StepUpdateValues<TData>) => void;
	wizard: Wizard<TData, TContext>;
}
```

Hook context passed to all pre-action hooks (`preNext`, `prePrevious`, `preReset`).

| Property  | Type                                        | Description                                   |
| --------- | ------------------------------------------- | --------------------------------------------- |
| `context` | `TContext`                                  | Global context object shared across all steps |
| `update`  | `(values: StepUpdateValues<TData>) => void` | Update function to modify step state          |
| `wizard`  | `Wizard<TData, TContext>`                   | Reference to the wizard instance              |

**Note:** Navigation methods (`next()`, `previous()`, `goto()`, `reset()`) cannot be
called from within hooks. Attempting to do so throws a `TypeError`. Use `setTimeout` if
you need deferred navigation.

---

### PreHook

```typescript
type PreHook<TData, TContext> = (
	data: TData,
	ctx: HookContext<TData, TContext>,
) => Promise<void> | void;
```

Pre-action hook function signature. Hooks are called before navigation actions and can:

- Validate data and throw errors to prevent navigation
- Update step state using `ctx.update()`
- Access global context via `ctx.context`
- Perform async operations (return a Promise)

**Example:**

```typescript
const preNext: PreHook<MyData, MyContext> = async (data, { update, context }) => {
	if (!data.email) {
		throw new Error("Email is required");
	}

	// Validate with external service
	const isValid = await validateEmail(data.email, context.apiUrl);
	if (!isValid) {
		throw new Error("Invalid email address");
	}

	update({ canGoNext: true });
};
```

---

### WizardStepConfig

```typescript
interface WizardStepConfig<TData, TContext> {
	label: Label;
	data?: TData;
	canGoNext?: boolean;
	preNext?: PreHook<TData, TContext>;
	prePrevious?: PreHook<TData, TContext>;
	preReset?: PreHook<TData, TContext>;
}
```

Configuration for a single wizard step.

| Property      | Type                       | Default    | Description                                                 |
| ------------- | -------------------------- | ---------- | ----------------------------------------------------------- |
| `label`       | `Label`                    | _required_ | Human readable step label                                   |
| `data`        | `TData`                    | `{}`       | Step-specific data, will be reset to initial state on reset |
| `canGoNext`   | `boolean`                  | `true`     | Flag indicating whether wizard can proceed from this step   |
| `preNext`     | `PreHook<TData, TContext>` | -          | Called before moving to next step                           |
| `prePrevious` | `PreHook<TData, TContext>` | -          | Called before moving to previous step                       |
| `preReset`    | `PreHook<TData, TContext>` | -          | Called before reset                                         |

---

### WizardStep

```typescript
interface WizardStep<TData, TContext> {
	label: Label;
	index: number;
	data: TData;
	error: Error | string | null;
	canGoNext: boolean;
	isFirst: boolean;
	isLast: boolean;
	preNext?: PreHook<TData, TContext>;
	prePrevious?: PreHook<TData, TContext>;
	preReset?: PreHook<TData, TContext>;
	update: (values: StepUpdateValues<TData>) => void;
}
```

Runtime step instance with computed properties and bound update method.

| Property    | Type                                        | Description                                                |
| ----------- | ------------------------------------------- | ---------------------------------------------------------- |
| `label`     | `Label`                                     | Human readable step label                                  |
| `index`     | `number`                                    | Zero-based index of this step                              |
| `data`      | `TData`                                     | Step data (always initialized, never undefined at runtime) |
| `error`     | `Error \| string \| null`                   | Current error state (null if no error)                     |
| `canGoNext` | `boolean`                                   | Whether navigation to next step is allowed                 |
| `isFirst`   | `boolean`                                   | Whether this is the first step                             |
| `isLast`    | `boolean`                                   | Whether this is the last step                              |
| `update`    | `(values: StepUpdateValues<TData>) => void` | Update this step's state                                   |

---

### CreateWizardOptions

```typescript
interface CreateWizardOptions<TData, TContext> {
	steps: WizardStepConfig<TData, TContext>[];
	context?: TContext;
	preReset?: (
		ctx: { context: TContext; wizard: Wizard<TData, TContext> },
	) => Promise<void> | void;
	onDone: (ctx: {
		context: TContext;
		steps: WizardStep<TData, TContext>[];
		wizard: Wizard<TData, TContext>;
		update: (values: StepUpdateValues<TData>) => void;
	}) => Promise<void> | void;
	logger?: Logger;
}
```

Options for creating a wizard store.

| Property   | Type                                  | Required | Description                                                                                                 |
| ---------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `steps`    | `WizardStepConfig<TData, TContext>[]` | Yes      | Array of step configurations (minimum 2 required)                                                           |
| `context`  | `TContext`                            | No       | Global context object accessible to all steps. Can be modified but won't be reset on reset/previous actions |
| `preReset` | `(ctx) => Promise<void> \| void`      | No       | Called after all step preReset hooks during reset                                                           |
| `onDone`   | `(ctx) => Promise<void> \| void`      | Yes      | Called when `next()` is invoked on the last step                                                            |
| `logger`   | `Logger`                              | No       | Optional logger for debugging                                                                               |

---

### WizardStoreValue

```typescript
interface WizardStoreValue<TData, TContext> {
	step: WizardStep<TData, TContext>;
	steps: WizardStep<TData, TContext>[];
	inProgress: boolean;
}
```

The value shape emitted by the wizard store.

| Property     | Type                            | Description                               |
| ------------ | ------------------------------- | ----------------------------------------- |
| `step`       | `WizardStep<TData, TContext>`   | Current active step                       |
| `steps`      | `WizardStep<TData, TContext>[]` | All steps array                           |
| `inProgress` | `boolean`                       | Whether an async operation is in progress |

---

### Wizard

```typescript
interface Wizard<TData, TContext> {
	get: () => WizardStoreValue<TData, TContext>;
	subscribe: StoreLike<WizardStoreValue<TData, TContext>>["subscribe"];
	context: TContext;
	label: Label;
	next: (currentStepData?: Partial<TData>) => Promise<number>;
	previous: () => Promise<number>;
	reset: () => Promise<number>;
	goto: (
		targetIndex: number,
		stepsData?: (Partial<TData> | null)[],
		assert?: boolean,
	) => Promise<number>;
	allowCanGoNext: () => number;
	resetCanGoNext: () => number;
	publish: () => number;
}
```

The wizard instance returned by `createWizard`.

#### Properties

| Property  | Type       | Description                     |
| --------- | ---------- | ------------------------------- |
| `context` | `TContext` | Global context object (mutable) |
| `label`   | `Label`    | Wizard label                    |

#### Methods

##### get()

```typescript
get(): WizardStoreValue<TData, TContext>
```

Get current store value synchronously.

##### subscribe()

```typescript
subscribe(callback: (value: WizardStoreValue<TData, TContext>) => void): () => void
```

Subscribe to store changes. The callback is called immediately with current value and on
every subsequent change. Returns an unsubscribe function.

##### next()

```typescript
next(currentStepData?: Partial<TData>): Promise<number>
```

Move to next step, optionally passing data to merge with current step's data. Returns the
new step index.

- Runs the current step's `preNext` hook
- If `canGoNext` is false after hook, sets an error and stays on current step
- If on last step, calls `onDone` instead of advancing
- Clears any existing error on successful navigation

##### previous()

```typescript
previous(): Promise<number>
```

Move to previous step. Returns the new step index.

- Runs the current step's `prePrevious` hook
- Always goes back regardless of errors (errors are captured but don't prevent navigation)
- Does nothing if already on first step

##### reset()

```typescript
reset(): Promise<number>
```

Reset wizard to initial state. Returns 0 (first step index).

- Runs `preReset` hook for each step from current to first
- Runs global `preReset` hook
- Restores all step data and `canGoNext` flags to initial values
- Errors in hooks are swallowed (logged if logger provided)

##### goto()

```typescript
goto(
  targetIndex: number,
  stepsData?: (Partial<TData> | null)[],
  assert?: boolean
): Promise<number>
```

Jump to specific step index. Returns the actual step index reached.

| Parameter     | Type                         | Default | Description                                                  |
| ------------- | ---------------------------- | ------- | ------------------------------------------------------------ |
| `targetIndex` | `number`                     | -       | Target step index (zero-based)                               |
| `stepsData`   | `(Partial<TData> \| null)[]` | `[]`    | Optional data to pass to each step during forward navigation |
| `assert`      | `boolean`                    | `true`  | If true, throws error when navigation is blocked             |

- When going forward: calls `next()` for each step with provided data
- When going backward: calls `previous()` for each step
- Throws `RangeError` if index is out of bounds
- Throws `Error` if blocked and `assert` is true

##### allowCanGoNext()

```typescript
allowCanGoNext(): number
```

Allow free navigation by setting all `canGoNext` flags to true. Returns current step
index.

##### resetCanGoNext()

```typescript
resetCanGoNext(): number
```

Reset `canGoNext` flags to their initial values. Returns current step index.

##### publish()

```typescript
publish(): number
```

Explicitly publish current state (triggers subscribers). Returns current step index.

---

## Hook Safety

Navigation methods (`next()`, `previous()`, `goto()`, `reset()`) **cannot be called from
inside pre-hooks**. This prevents infinite loops and unpredictable state.

```typescript
// This will throw TypeError
preNext: (async (_data, { wizard }) => {
	await wizard.next(); // TypeError!
});
```

### Safe Operations Inside Hooks

- `update()` - Modify step state
- `wizard.get()` - Read current state
- `wizard.context` - Access/modify context
- `wizard.label` - Read wizard label
- `wizard.allowCanGoNext()` - Enable free navigation
- `wizard.resetCanGoNext()` - Restore initial flags
- `wizard.publish()` - Force state emission

### Deferred Navigation

If you need navigation based on hook logic:

```typescript
preNext: (async (_data, { wizard }) => {
	setTimeout(() => wizard.reset(), 0);
});
```

---

## Error Handling

Errors in hooks are captured and stored in `step.error`:

```typescript
wizard.subscribe(({ step }) => {
	if (step.error) {
		console.error("Step error:", step.error);
	}
});
```

- `preNext` errors: Prevent forward navigation, step stays current
- `prePrevious` errors: Captured but navigation proceeds
- `preReset` errors: Swallowed (logged if logger provided)
- `onDone` errors: Captured on last step

---

## Store Compatibility

The wizard implements a store-compatible interface, making it work with reactive UI
frameworks:

```typescript
// Svelte
$: ({ step, steps, inProgress } = $wizard);

// React (with @marianmeres/store adapter)
const { step, steps, inProgress } = useStore(wizard);

// Vanilla JS
const unsubscribe = wizard.subscribe(({ step }) => {
	render(step);
});
```
