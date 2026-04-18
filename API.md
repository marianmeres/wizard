# API Reference

Complete API documentation for `@marianmeres/wizard`.

## Table of Contents

- [Functions](#functions)
  - [createWizard](#createwizard)
  - [resolveLabel](#resolvelabel)
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
- [Behavior](#behavior)

---

## Functions

### createWizard

```typescript
function createWizard<TData, TContext>(
	label: Label,
	options: CreateWizardOptions<TData, TContext>,
): Wizard<TData, TContext>;
```

Creates a wizard store for managing multi-step flows.

#### Type Parameters

| Parameter  | Default                   | Description                                      |
| ---------- | ------------------------- | ------------------------------------------------ |
| `TData`    | `Record<string, unknown>` | The shape of step data (shared across all steps) |
| `TContext` | `Record<string, unknown>` | The shape of the global context object           |

#### Parameters

| Parameter | Type                                   | Description                      |
| --------- | -------------------------------------- | -------------------------------- |
| `label`   | `Label`                                | Human-readable wizard identifier |
| `options` | `CreateWizardOptions<TData, TContext>` | Wizard configuration options     |

#### Returns

`Wizard<TData, TContext>` — A wizard instance with navigation methods and store interface.

#### Throws

- `TypeError` — If less than 2 steps are provided.

#### Example

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

wizard.subscribe(({ step, steps, inProgress, isDone }) => {
	// Update UI
});
```

---

### resolveLabel

```typescript
function resolveLabel(label: Label, locale?: string): string;
```

Resolves a [`Label`](#label) to a plain string.

#### Parameters

| Parameter | Type      | Description                                              |
| --------- | --------- | -------------------------------------------------------- |
| `label`   | `Label`   | The label to resolve                                     |
| `locale`  | `string?` | Optional locale key for `Record<string,string>` variants |

#### Returns

`string` — The resolved label. Returns `""` if the label cannot be resolved.

#### Resolution rules

- `string` — returned as-is
- `() => string` — invoked and result returned
- `Record<string, string>` — value for `locale` if present, else first value, else `""`

#### Example

```typescript
resolveLabel("Step 1"); // "Step 1"
resolveLabel(() => "Step 1"); // "Step 1"
resolveLabel({ en: "Step 1", de: "Schritt 1" }, "de"); // "Schritt 1"
resolveLabel({ en: "Step 1", de: "Schritt 1" }, "fr"); // "Step 1" (first)
resolveLabel({ en: "Step 1" }); // "Step 1"
```

---

## Types

### Label

```typescript
type Label = string | Record<string, string> | (() => string);
```

Human readable label. Use [`resolveLabel()`](#resolvelabel) to obtain a string.

---

### Logger

```typescript
type Logger = (...args: unknown[]) => void;
```

Logger function signature for debugging. Receives arbitrary arguments.

---

### StepUpdateValues

```typescript
interface StepUpdateValues<TData> {
	data?: TData | ((current: TData) => TData);
	error?: Error | string | null;
	canGoNext?: boolean;
	canGoPrevious?: boolean;
}
```

Values that can be updated on a step via the `update()` method.

| Property        | Type                                   | Description                                                                                                  |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `data`          | `TData \| ((current: TData) => TData)` | Step data — direct value or updater function. **Always publishes when present** (see [Behavior](#behavior)). |
| `error`         | `Error \| string \| null`              | Error state — `null` clears, `Error` or `string` sets                                                        |
| `canGoNext`     | `boolean`                              | Whether forward navigation is allowed                                                                        |
| `canGoPrevious` | `boolean`                              | Whether backward navigation is allowed                                                                       |

#### Examples

```typescript
step.update({ data: { name: "John" } });
step.update({ data: (prev) => ({ ...prev, count: prev.count + 1 }) });
step.update({ error: new Error("Validation failed") });
step.update({ error: null });
step.update({ canGoNext: true });
step.update({ canGoPrevious: false });
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
| `update`  | `(values: StepUpdateValues<TData>) => void` | Update function scoped to the hook's step     |
| `wizard`  | `Wizard<TData, TContext>`                   | Reference to the wizard instance              |

**Note:** Calling navigation methods (`next`, `previous`, `goto`, `reset`) from inside a
hook is silently ignored — see [Behavior: concurrent navigation](#concurrent-navigation).

---

### PreHook

```typescript
type PreHook<TData, TContext> = (
	data: TData,
	ctx: HookContext<TData, TContext>,
) => Promise<void> | void;
```

Pre-action hook function. Hooks may validate data (throw to record an error), update step
state via `ctx.update()`, read/mutate `ctx.context`, and perform async work.

#### Example

```typescript
const preNext: PreHook<MyData, MyContext> = async (data, { update, context }) => {
	if (!data.email) throw new Error("Email is required");
	const isValid = await validateEmail(data.email, context.apiUrl);
	if (!isValid) throw new Error("Invalid email address");
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
	canGoPrevious?: boolean;
	preNext?: PreHook<TData, TContext>;
	prePrevious?: PreHook<TData, TContext>;
	preReset?: PreHook<TData, TContext>;
}
```

Configuration for a single wizard step.

| Property        | Type                       | Default    | Description                                           |
| --------------- | -------------------------- | ---------- | ----------------------------------------------------- |
| `label`         | `Label`                    | _required_ | Human readable step label                             |
| `data`          | `TData`                    | `{}`       | Step-specific data, restored on reset                 |
| `canGoNext`     | `boolean`                  | `true`     | Whether forward navigation is allowed from this step  |
| `canGoPrevious` | `boolean`                  | `true`     | Whether backward navigation is allowed from this step |
| `preNext`       | `PreHook<TData, TContext>` | —          | Called before moving to next step                     |
| `prePrevious`   | `PreHook<TData, TContext>` | —          | Called before moving to previous step                 |
| `preReset`      | `PreHook<TData, TContext>` | —          | Called before reset                                   |

---

### WizardStep

```typescript
interface WizardStep<TData, TContext> {
	label: Label;
	index: number;
	data: TData;
	error: Error | string | null;
	canGoNext: boolean;
	canGoPrevious: boolean;
	isFirst: boolean;
	isLast: boolean;
	update: (values: StepUpdateValues<TData>) => void;
	clearError: () => void;
}
```

Runtime step instance. The raw hook functions (`preNext`, `prePrevious`, `preReset`) are
**not** exposed here — they are held internally.

| Property        | Type                                        | Description                            |
| --------------- | ------------------------------------------- | -------------------------------------- |
| `label`         | `Label`                                     | Human readable step label              |
| `index`         | `number`                                    | Zero-based index of this step          |
| `data`          | `TData`                                     | Step data                              |
| `error`         | `Error \| string \| null`                   | Current error state (null if no error) |
| `canGoNext`     | `boolean`                                   | Whether forward navigation is allowed  |
| `canGoPrevious` | `boolean`                                   | Whether backward navigation is allowed |
| `isFirst`       | `boolean`                                   | Whether this is the first step         |
| `isLast`        | `boolean`                                   | Whether this is the last step          |
| `update`        | `(values: StepUpdateValues<TData>) => void` | Update this step's state               |
| `clearError`    | `() => void`                                | Convenience: clear this step's error   |

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

| Property   | Type                                  | Required | Description                                                 |
| ---------- | ------------------------------------- | -------- | ----------------------------------------------------------- |
| `steps`    | `WizardStepConfig<TData, TContext>[]` | Yes      | Array of step configurations (minimum 2 required)           |
| `context`  | `TContext`                            | No       | Global context object. Mutable; not reset on `reset()`      |
| `preReset` | `(ctx) => Promise<void> \| void`      | No       | Called after all per-step `preReset` hooks during `reset()` |
| `onDone`   | `(ctx) => Promise<void> \| void`      | Yes      | Called when `next()` is invoked on the last step            |
| `logger`   | `Logger`                              | No       | Optional logger for debugging                               |

---

### WizardStoreValue

```typescript
interface WizardStoreValue<TData, TContext> {
	step: WizardStep<TData, TContext>;
	steps: WizardStep<TData, TContext>[];
	inProgress: boolean;
	isDone: boolean;
}
```

| Property     | Type                            | Description                                                                         |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------- |
| `step`       | `WizardStep<TData, TContext>`   | Current active step                                                                 |
| `steps`      | `WizardStep<TData, TContext>[]` | All steps                                                                           |
| `inProgress` | `boolean`                       | Whether an async operation (hook/onDone/reset) is in progress                       |
| `isDone`     | `boolean`                       | `true` after `onDone` completes successfully. Cleared by `previous()` and `reset()` |

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

#### Properties

| Property  | Type       | Description                     |
| --------- | ---------- | ------------------------------- |
| `context` | `TContext` | Global context object (mutable) |
| `label`   | `Label`    | Wizard label                    |

#### Methods

##### `get()`

```typescript
get(): WizardStoreValue<TData, TContext>
```

Get current store value synchronously.

##### `subscribe(callback)`

```typescript
subscribe(callback: (value: WizardStoreValue<TData, TContext>) => void): () => void
```

Subscribe to store changes. Callback is called immediately with current value and on every
subsequent change. Returns an unsubscribe function.

##### `next(currentStepData?)`

```typescript
next(currentStepData?: Partial<TData>): Promise<number>
```

Move to next step, optionally passing data to merge with current step's data. Returns the
resulting step index.

- Runs the current step's `preNext` hook
- If `canGoNext` is false or the hook sets/throws an error, navigation is blocked (step
  stays current)
- On the last step, runs `onDone`. If it succeeds, sets `isDone = true`
- When `isDone` is true, subsequent `next()` calls are no-ops until `previous()` or
  `reset()` is called
- Clears any existing error on the destination step after a successful advance

##### `previous()`

```typescript
previous(): Promise<number>
```

Move to previous step. Returns the resulting step index.

- Runs the current step's `prePrevious` hook
- Blocked silently if `canGoPrevious` is `false` on the current step
- `prePrevious` errors are captured on the current step but do NOT block navigation
  (consistent with v2)
- Clears the destination step's error on arrival
- Clears `isDone` when actually moving

##### `reset()`

```typescript
reset(): Promise<number>
```

Reset wizard to initial state. Returns `0`.

- Runs each per-step `preReset` hook (in reverse order, from current down to 0)
- Runs the global `preReset` hook
- Restores all step `data`, `canGoNext`, and `canGoPrevious` to their configured values
- Clears all step errors and `isDone`
- Errors in `preReset` hooks are swallowed (logged when a `logger` is provided)
- Emits a single state transition to step `0` (no per-step intermediate flicker)

##### `goto(targetIndex, stepsData?, assert?)`

```typescript
goto(
  targetIndex: number,
  stepsData?: (Partial<TData> | null)[],
  assert?: boolean
): Promise<number>
```

Jump to specific step index. Returns the actual index reached.

| Parameter     | Type                         | Default | Description                                                                                                           |
| ------------- | ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `targetIndex` | `number`                     | —       | Target step index (zero-based). Throws `RangeError` if out of bounds                                                  |
| `stepsData`   | `(Partial<TData> \| null)[]` | `[]`    | Data to merge per step during **forward** navigation. Indexed by **absolute step index**. Ignored when going backward |
| `assert`      | `boolean`                    | `true`  | If `true`, throws `Error` when navigation is blocked                                                                  |

- Forward: iteratively calls `next()` for each step with the corresponding `stepsData`
  entry
- Backward: iteratively calls `previous()`. Respects `canGoPrevious` — blocked if any
  intermediate step disallows going back
- Throws `RangeError` when `targetIndex` is out of range
- Throws `Error` if navigation cannot progress toward the target (when `assert` is `true`)

##### `allowCanGoNext()`

```typescript
allowCanGoNext(): number
```

Set all steps' `canGoNext` to `true`. Returns current step index.

##### `resetCanGoNext()`

```typescript
resetCanGoNext(): number
```

Restore all `canGoNext` flags to their configured initial values. Returns current step
index.

##### `publish()`

```typescript
publish(): number
```

Force a state emission. Returns current step index.

---

## Behavior

### Concurrent navigation

All navigation methods (`next`, `previous`, `goto`, `reset`) are serialized via a single
in-flight guard. While one call is executing, further calls — **including calls made from
inside hooks or `onDone`** — are silently ignored and return the current step index.

- Clicking a "Next" button twice will only advance once.
- Calling `wizard.reset()` from inside a `preNext` hook has no effect.

If you need deferred navigation from a hook, schedule it:

```typescript
preNext: ((_data, { wizard }) => {
	setTimeout(() => wizard.reset(), 0);
});
```

### `update({ data })` always publishes

When `data` is present in `update()`, subscribers are notified unconditionally — even if
the value is the same reference as before. This prevents a common pitfall where in-place
mutation (`step.data.items.push(...)`) combined with `update({ data: step.data })` would
silently no-op.

### Error handling

Errors thrown from hooks are captured in `step.error`:

| Hook / Callback  | Captured on  | Blocks navigation?                         |
| ---------------- | ------------ | ------------------------------------------ |
| `preNext`        | Current step | Yes — forward blocked                      |
| `prePrevious`    | Current step | No — back still proceeds                   |
| `preReset`       | —            | No (swallowed; logger can see)             |
| `onDone`         | Last step    | Yes — stays on last step, `isDone` not set |
| `globalPreReset` | —            | No (swallowed)                             |

### `isDone` lifecycle

- Initially `false`.
- Set to `true` when `onDone` completes successfully.
- While `true`, `next()` is a no-op.
- Cleared by any successful `previous()` or `reset()`.

### Store compatibility

The wizard implements a store-compatible interface (`get`, `subscribe`) suitable for
reactive UI frameworks:

```typescript
// Svelte
$: ({ step, steps, inProgress, isDone } = $wizard);

// Vanilla JS
const unsubscribe = wizard.subscribe(({ step }) => render(step));
```
