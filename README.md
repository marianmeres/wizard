# @marianmeres/wizard

[![NPM version](https://img.shields.io/npm/v/@marianmeres/wizard.svg)](https://www.npmjs.com/package/@marianmeres/wizard)
[![JSR version](https://jsr.io/badges/@marianmeres/wizard)](https://jsr.io/@marianmeres/wizard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Utility for high-level management of
[wizard](https://en.wikipedia.org/wiki/Wizard_(software)) flows. Agnostic of actual
business logic or rendering. [Store](https://github.com/marianmeres/store) compatible.

## Install

```shell
deno add jsr:@marianmeres/wizard
```

```shell
npm i @marianmeres/wizard
```

## Features

- Multi-step wizard flow management
- Reactive state via store subscriptions
- Forward and backward step gating (`canGoNext`, `canGoPrevious`)
- Pre-action hooks (`preNext`, `prePrevious`, `preReset`)
- Global context shared across all steps
- Concurrent-navigation safe — double-clicks and hook re-entry are silently ignored
- Terminal `isDone` flag with double-completion protection
- Full TypeScript support with generics

## Example usage

```typescript
import { createWizard } from "@marianmeres/wizard";

interface StepData {
	name?: string;
	email?: string;
	agreed?: boolean;
}

interface Context {
	apiUrl: string;
}

const wizard = createWizard<StepData, Context>("registration", {
	steps: [
		{ label: "Personal Info", data: { name: "", email: "" } },
		{
			label: "Terms & Conditions",
			canGoNext: false, // must be explicitly enabled
			preNext: async (data, { update }) => {
				if (!data.agreed) throw new Error("You must agree to the terms");
				update({ canGoNext: true });
			},
			prePrevious: async (_data, { update }) => {
				update({ canGoNext: false, data: { agreed: false } });
			},
		},
		{ label: "Confirmation" },
	],
	context: { apiUrl: "https://api.example.com" },
	onDone: async ({ steps, context }) => {
		const formData = steps.map((s) => s.data);
		await fetch(context.apiUrl, {
			method: "POST",
			body: JSON.stringify(formData),
		});
	},
});

wizard.subscribe(({ step, steps, inProgress, isDone }) => {
	const { label, index, data, canGoNext, canGoPrevious, error, isFirst, isLast } = step;

	step.update({ data: { name: "John" } });
	step.update({ canGoNext: true });
	step.update({ error: null });
	step.clearError(); // convenience

	step.update({ data: (prev) => ({ ...prev, email: "john@example.com" }) });
});

await wizard.next();
await wizard.next({ name: "John" });
await wizard.previous();
await wizard.reset();
await wizard.goto(2);
await wizard.goto(2, [null, { agreed: true }]);

wizard.allowCanGoNext();
wizard.resetCanGoNext();
wizard.publish();

wizard.context;
wizard.label;
```

## API overview

### `createWizard<TData, TContext>(label, options)`

Creates a wizard instance.

**Key options:**

- `steps` — array of step configurations (minimum 2 required)
- `context` — global context object (optional)
- `onDone` — callback when completing the last step
- `preReset` — global reset callback (optional)

**Navigation methods:**

- `next(data?)` — move to next step
- `previous()` — move to previous step (respects `canGoPrevious`)
- `reset()` — reset to initial state
- `goto(index, stepsData?, assert?)` — jump to specific step

**Store methods:**

- `get()` — synchronous snapshot
- `subscribe(cb)` — react to state changes
- `publish()` — force a state emission

**Utilities:**

- `allowCanGoNext()` / `resetCanGoNext()` — control forward gating flags
- `step.update(values)` — update data / error / canGoNext / canGoPrevious
- `step.clearError()` — clear step error
- `resolveLabel(label, locale?)` — resolve a `Label` to a string

For complete API documentation, see **[API.md](API.md)**.

## Concurrency and hook safety

Navigation is **serialized**: while `next`, `previous`, `goto`, or `reset` is in-flight,
any further navigation call — including a call made from inside a hook or `onDone` — is
silently ignored and returns the current step index.

```typescript
// Double-click safe — only advances once.
button.onclick = () => wizard.next();

// Inside a hook: silently ignored (does NOT throw, does NOT recurse).
preNext: (async (_data, { wizard }) => {
	await wizard.reset(); // no-op
});
```

### Deferred navigation

To navigate from a hook, schedule it for the next tick:

```typescript
preNext: ((_data, { wizard }) => {
	setTimeout(() => wizard.reset(), 0);
});
```

## `isDone` and double-completion protection

When `next()` is invoked on the last step and `onDone` completes successfully, `isDone`
becomes `true`. Subsequent `next()` calls are no-ops until `previous()` or `reset()` is
invoked.

```typescript
wizard.subscribe(({ isDone }) => {
	if (isDone) showSuccessScreen();
});

await wizard.next(); // triggers onDone; isDone → true
await wizard.next(); // no-op; onDone NOT re-invoked
await wizard.reset(); // isDone → false
```

If `onDone` throws, `isDone` stays `false`, allowing the user to retry.

## Error handling

Errors thrown from hooks are captured on `step.error`:

| Hook              | Captured on  | Blocks navigation?                          |
| ----------------- | ------------ | ------------------------------------------- |
| `preNext`         | Current step | Yes (forward)                               |
| `prePrevious`     | Current step | No (back still proceeds)                    |
| `preReset`        | —            | No (swallowed, logged if `logger` provided) |
| `onDone`          | Last step    | Yes (stays on last step, `isDone` not set)  |
| Global `preReset` | —            | No (swallowed)                              |

## Migration from v2.x → v3.x

v3 is a bug-fix / design-cleanup release. The API surface is mostly unchanged but several
behaviors changed. Review each item:

### Behavior changes (BC)

1. **Navigation from inside hooks no longer throws `TypeError`** — calls are silently
   ignored. Use `setTimeout(...)` if you need deferred navigation. If you were catching
   `TypeError` from hook-reentry, remove the catch.

2. **`next()` on the last step no longer re-runs `onDone`** after a successful completion.
   `isDone` tracks completion. Call `reset()` or `previous()` to re-enable forward
   navigation.

3. **`step.update({ data: X })` always publishes** — the reference-equality short-circuit
   was removed. In-place mutation plus `update({ data: step.data })` now publishes
   correctly. Subscribers should already be idempotent.

4. **`reset()` emits one transition** — previously, reset walked through each step index
   and published every intermediate state. Now subscribers see `inProgress=true` then the
   final reset state (step 0).

5. **`previous()` respects the new `canGoPrevious` flag** on the current step (default
   `true`; existing code is unaffected unless explicitly opted in).

### New additions

- `canGoPrevious?: boolean` on step config and `WizardStep`
- `isDone: boolean` on the store value
- `clearError()` on step
- `resolveLabel(label, locale?)` helper
- `step.update({ canGoPrevious })` support

### Type-surface changes

- `WizardStep` no longer extends `WizardStepConfig`. The raw hook properties (`preNext`,
  `prePrevious`, `preReset`) are **not** present on the runtime step object. If your code
  accessed them, switch to configuring them in step config.

## License

MIT
