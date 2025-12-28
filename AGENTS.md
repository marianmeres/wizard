# @marianmeres/wizard - Agent Reference

## Package Overview

- **Name:** `@marianmeres/wizard`
- **Purpose:** Multi-step wizard flow state management
- **Runtime:** Deno + Node.js (via npm build)
- **License:** MIT
- **Main Export:** `createWizard<TData, TContext>(label, options)`

## Architecture

```
src/
├── mod.ts          # Entry point, re-exports from wizard.ts
└── wizard.ts       # All implementation (types + createWizard function)

tests/
└── wizard.test.ts  # Deno test suite (21 tests)
```

## Core Concepts

### Wizard = State Machine

A wizard is a linear state machine with:

- **Steps:** Array of step configs (minimum 2)
- **Current Index:** Zero-based, starts at 0
- **Direction:** Forward (next), backward (previous), or jump (goto)
- **Completion:** `onDone` callback fires when `next()` called on last step

### State Shape

```typescript
{
  step: WizardStep,      // Current step object
  steps: WizardStep[],   // All step objects
  inProgress: boolean    // True during async hook execution
}
```

### Step Object

```typescript
{
  label: Label,
  index: number,
  data: TData,
  error: Error | string | null,
  canGoNext: boolean,
  isFirst: boolean,
  isLast: boolean,
  update: (values) => void  // Bound to this step
}
```

## Key Behaviors

### Navigation Rules

| Method        | Behavior                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| `next(data?)` | Runs `preNext` hook, advances if `canGoNext=true` and no error            |
| `previous()`  | Runs `prePrevious` hook, always goes back (errors captured, not blocking) |
| `reset()`     | Runs all `preReset` hooks from current to 0, restores initial state       |
| `goto(n)`     | Calls `next()` or `previous()` iteratively to reach index n               |

### Hook Lifecycle

```
next() called
  └─> step.error = null
  └─> merge currentStepData into step.data
  └─> inProgress = true
  └─> await preNext(step.data, { update, context, wizard })
  └─> inProgress = false
  └─> if step.canGoNext && !step.error
        └─> if isLast: await onDone({ context, steps, wizard, update })
        └─> else: current++, clear new step's error
  └─> publish()
```

### Hook Safety Constraint

Navigation methods **throw TypeError** if called inside hooks:

- `next()`, `previous()`, `reset()`, `goto()` - PROHIBITED in hooks
- `update()`, `get()`, `publish()`, `allowCanGoNext()`, `resetCanGoNext()` - ALLOWED

Workaround: `setTimeout(() => wizard.reset(), 0)`

### Error Handling

| Hook          | Error Effect                                        |
| ------------- | --------------------------------------------------- |
| `preNext`     | Captured in `step.error`, prevents navigation       |
| `prePrevious` | Captured in `step.error`, navigation proceeds       |
| `preReset`    | Swallowed (logged if logger provided)               |
| `onDone`      | Captured in `step.error`, wizard stays on last step |

### Data Reset Behavior

On `reset()`:

- `step.data` → restored to initial config value (deep cloned)
- `step.error` → set to null
- `step.canGoNext` → restored to initial config value
- `context` → NOT reset (mutable, persists)

## TypeScript Generics

```typescript
createWizard<TData, TContext>(label, options);
```

- `TData` - Shape of step data (shared across all steps)
- `TContext` - Shape of global context object
- Both default to `Record<string, unknown>`

## Dependencies

- `@marianmeres/store` - Reactive store implementation

## Testing

```bash
deno test              # Run all tests
deno test --watch      # Watch mode
```

## Building for npm

```bash
deno task npm:build    # Build to .npm-dist/
deno task npm:publish  # Build and publish
```

## Common Patterns

### Conditional Next

```typescript
{
  label: "Terms",
  canGoNext: false,
  preNext: async (data, { update }) => {
    if (data.agreed) update({ canGoNext: true });
  }
}
```

### Validation with Error

```typescript
{
  label: "Email",
  preNext: async (data) => {
    if (!isValidEmail(data.email)) {
      throw new Error("Invalid email");
    }
  }
}
```

### Cross-Step Data Access

```typescript
wizard.subscribe(({ steps }) => {
	const allData = steps.map((s) => s.data);
});
```

### Programmatic Navigation

```typescript
await wizard.goto(2, [null, { skipValidation: true }]);
```

## File Locations

- Entry point: `src/mod.ts`
- Implementation: `src/wizard.ts`
- Tests: `tests/wizard.test.ts`
- Config: `deno.json`
