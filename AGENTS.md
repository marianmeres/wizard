# @marianmeres/wizard - Agent Guide

Multi-step wizard flow state management. UI/framework agnostic. Store-compatible for
reactive frameworks.

## Quick Reference

- **Stack**: Deno + TypeScript, npm build for Node.js
- **Run**: `deno test` | **Build**: `deno task npm:build` | **Format**: `deno fmt`
- **Entry**: `src/mod.ts` → exports from `src/wizard.ts`
- **Main Export**: `createWizard<TData, TContext>(label, options)`
- **Dependency**: `@marianmeres/store`

## Project Structure

```
src/
├── mod.ts          # Entry point, re-exports from wizard.ts
└── wizard.ts       # All implementation (types + createWizard function)

tests/
└── wizard.test.ts  # Deno test suite (21 tests)
```

## Critical Conventions

1. **Minimum 2 steps** required (throws TypeError otherwise)
2. **No navigation inside hooks** - `next()`, `previous()`, `goto()`, `reset()` throw
   TypeError if called within `preNext/prePrevious/preReset` hooks
3. **canGoNext=false blocks next()** - step must enable it via
   `update({ canGoNext: true })`
4. **Context persists** - not reset on `reset()`, unlike step data

## Before Making Changes

- [ ] Review existing patterns in `src/wizard.ts`
- [ ] Run `deno test` to verify tests pass
- [ ] Check API.md for type documentation

## Documentation Index

- [API.md](./API.md) - Complete type reference and method documentation
- [README.md](./README.md) - Usage examples and quick start

---

## Architecture

### Wizard = State Machine

A wizard is a linear state machine with:

- **Steps**: Array of step configs (minimum 2)
- **Current Index**: Zero-based, starts at 0
- **Direction**: Forward (next), backward (previous), or jump (goto)
- **Completion**: `onDone` callback fires when `next()` called on last step

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

### Hook Safety

Navigation methods **throw TypeError** inside hooks:

- **PROHIBITED**: `next()`, `previous()`, `reset()`, `goto()`
- **ALLOWED**: `update()`, `get()`, `publish()`, `allowCanGoNext()`, `resetCanGoNext()`
- **Workaround**: `setTimeout(() => wizard.reset(), 0)`

### Error Handling

| Hook          | Effect                                              |
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

## TypeScript Generics

```typescript
createWizard<TData, TContext>(label, options);
```

- `TData` - Shape of step data (shared across all steps)
- `TContext` - Shape of global context object
- Both default to `Record<string, unknown>`
