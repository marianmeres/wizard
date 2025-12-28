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
- Step validation with `canGoNext` flag
- Pre-action hooks (`preNext`, `prePrevious`, `preReset`)
- Global context shared across all steps
- Full TypeScript support with generics

## Example usage

```typescript
import { createWizard } from "@marianmeres/wizard";

// Define your data and context types for full type safety
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
			preNext: async (data, { update, context }) => {
				// Validate before proceeding
				if (!data.agreed) {
					throw new Error("You must agree to the terms");
				}
				update({ canGoNext: true });
			},
			prePrevious: async (_data, { update }) => {
				// Reset validation state when going back
				update({ canGoNext: false, data: { agreed: false } });
			},
		},
		{ label: "Confirmation" },
	],
	context: { apiUrl: "https://api.example.com" },
	onDone: async ({ steps, context }) => {
		// Called when next() is invoked on the last step
		const formData = steps.map((s) => s.data);
		console.log("Submitting to", context.apiUrl, formData);
	},
});

// Subscribe to state changes
wizard.subscribe(({ step, steps, inProgress }) => {
	// Step properties
	const { label, index, data, canGoNext, error, isFirst, isLast } = step;

	// Update step state
	step.update({ data: { name: "John" } });
	step.update({ canGoNext: true });
	step.update({ error: null });

	// Functional updates
	step.update({ data: (prev) => ({ ...prev, email: "john@example.com" }) });
});

// Wizard navigation API
await wizard.next(); // Move to next step
await wizard.next({ name: "John" }); // Move with data merge
await wizard.previous(); // Move to previous step
await wizard.reset(); // Reset to initial state
await wizard.goto(2); // Jump to step index 2
await wizard.goto(2, [null, { agreed: true }]); // Jump with step data

// Utility methods
wizard.allowCanGoNext(); // Enable free navigation
wizard.resetCanGoNext(); // Restore initial canGoNext values
wizard.publish(); // Force state emission

// Access context and label
wizard.context; // { apiUrl: "https://api.example.com" }
wizard.label; // "registration"
```

## API Overview

### `createWizard<TData, TContext>(label, options)`

Creates a wizard instance with full TypeScript support.

**Key options:**

- `steps` - Array of step configurations (minimum 2 required)
- `context` - Global context object (optional)
- `onDone` - Callback when completing the last step

**Navigation methods:**

- `next(data?)` - Move to next step
- `previous()` - Move to previous step
- `reset()` - Reset to initial state
- `goto(index, stepsData?, assert?)` - Jump to specific step

**Utilities:**

- `allowCanGoNext()` / `resetCanGoNext()` - Control navigation flags
- `subscribe(callback)` - React to state changes
- `get()` - Get current state synchronously

For complete API documentation including all types and interfaces, see
**[API.md](API.md)**.

## Hook Safety

Navigation methods (`next()`, `previous()`, `goto()`, `reset()`) **cannot be called from
inside pre-hooks**. Attempting to do so will throw a `TypeError`.

```typescript
// ❌ This will throw TypeError
const wizard = createWizard("foo", {
	steps: [
		{
			label: "one",
			preNext: async (_data, { wizard }) => {
				await wizard.next(); // TypeError: Cannot call next() from inside pre-hooks
			},
		},
		{ label: "two" },
	],
	onDone: async () => {},
});
```

### Safe operations inside hooks

- `update()` - Modify step state (data, error, canGoNext)
- `wizard.get()` - Read current state
- `wizard.context` - Access/modify context
- `wizard.label` - Read wizard label
- `wizard.allowCanGoNext()` - Enable free navigation
- `wizard.resetCanGoNext()` - Restore initial canGoNext values
- `wizard.publish()` - Force state emission

### Deferred navigation

If you need to trigger navigation based on hook logic, defer it using `setTimeout`:

```typescript
preNext: (async (_data, { wizard }) => {
	// Deferred navigation (runs after hook completes)
	setTimeout(() => wizard.reset(), 0);
});
```

## Migration from v1.x

```typescript
// v1.x
import { createWizardStore } from "@marianmeres/wizard";
const wizard = createWizardStore("foo", { ... });
step.set({ canGoNext: true });
await step.next(data);

// v2.x
import { createWizard } from "@marianmeres/wizard";
const wizard = createWizard<MyData, MyContext>("foo", { ... });
step.update({ canGoNext: true });
await wizard.next(data); // navigation only via wizard, not step
```

Key changes:

- `createWizardStore` → `createWizard`
- `step.set()` → `step.update()`
- `step.next()` / `step.previous()` removed (use `wizard.next()` / `wizard.previous()`)
- `set` in hook context → `update`
- Full generic type support

## License

MIT
