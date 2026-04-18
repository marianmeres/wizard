# @marianmeres/wizard — Agent Guide

Multi-step wizard flow state management. UI/framework agnostic. Store-compatible for
reactive frameworks.

## Quick Reference

- **Stack**: Deno + TypeScript, npm build for Node.js
- **Run**: `deno test` | **Build**: `deno task npm:build` | **Format**: `deno fmt`
- **Entry**: `src/mod.ts` → exports from `src/wizard.ts`
- **Main Export**: `createWizard<TData, TContext>(label, options)`
- **Helper Export**: `resolveLabel(label, locale?)`
- **Dependency**: `@marianmeres/store`

## Project Structure

```
src/
├── mod.ts          # Entry point, re-exports from wizard.ts
└── wizard.ts       # All implementation (types + createWizard + resolveLabel)

tests/
└── wizard.test.ts  # Deno test suite (35 tests)
```

## Critical Conventions

1. **Minimum 2 steps** required (throws `TypeError` otherwise).
2. **Navigation is serialized.** While `next`/`previous`/`goto`/`reset` is in-flight,
   further calls — including calls from inside hooks or `onDone` — are **silently
   ignored** and return the current step index. They do NOT throw.
3. **Forward gating via `canGoNext`** (default `true`). When `false`, `next()` sets an
   auto error on the step.
4. **Backward gating via `canGoPrevious`** (default `true`). When `false`, `previous()` is
   a silent no-op.
5. **`preNext` errors block forward** navigation; captured on `step.error`.
6. **`prePrevious` errors are captured but do NOT block** backward navigation.
7. **`isDone`** becomes `true` after `onDone` succeeds. While `true`, `next()` is a no-op.
   Cleared by `previous()` or `reset()`.
8. **Context persists** — not reset on `reset()`, unlike step data.
9. **`update({ data })` always publishes** — no reference-equality short-circuit. Pass the
   same reference back after mutating in place and it still notifies subscribers.

## Before Making Changes

- [ ] Review existing patterns in `src/wizard.ts`.
- [ ] Run `deno test` (expect 35/35 passing).
- [ ] Check [API.md](./API.md) for type documentation.

## Documentation Index

- [API.md](./API.md) — Complete type reference and method documentation.
- [README.md](./README.md) — Usage examples and migration notes.

---

## Architecture

### Wizard = State Machine

A wizard is a linear state machine with:

- **Steps**: Array of step configs (minimum 2).
- **Current Index**: Zero-based, starts at 0.
- **Direction**: Forward (`next`), backward (`previous`), or jump (`goto`).
- **Completion**: `onDone` callback fires when `next()` called on last step; `isDone` flag
  is set on success.

### Store Value Shape

```typescript
{
  step: WizardStep,      // Current step object
  steps: WizardStep[],   // All step objects
  inProgress: boolean,   // True during async hook / onDone / reset work
  isDone: boolean        // True after onDone completes successfully
}
```

### Step Object (runtime)

```typescript
{
  label: Label,
  index: number,
  data: TData,
  error: Error | string | null,
  canGoNext: boolean,
  canGoPrevious: boolean,
  isFirst: boolean,
  isLast: boolean,
  update: (values) => void,  // scoped to this step
  clearError: () => void,    // convenience
}
```

Note: raw hook properties (`preNext`, `prePrevious`, `preReset`) are NOT present on the
runtime step — they are held internally.

## Key Behaviors

### Navigation Rules

| Method        | Behavior                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `next(data?)` | Runs `preNext`; advances if `canGoNext` and no error. On last step: runs `onDone`; on success sets `isDone`.        |
| `previous()`  | Runs `prePrevious`; goes back unless `canGoPrevious=false` or on first step. Clears `isDone`.                       |
| `reset()`     | Runs all `preReset` hooks (current → 0), then global `preReset`, restores initial state. Emits a single transition. |
| `goto(n)`     | Iteratively calls `_next`/`_previous`. Respects `canGoPrevious` on backward walks.                                  |

### Hook Lifecycle (next on non-last step)

```
next() called
  └─> concurrency / isDone guard → if triggered, no-op return
  └─> isNavigating = true
  └─> step.error = null
  └─> merge currentStepData into step.data
  └─> inProgress = true
  └─> await preNext(step.data, { update, context, wizard })
  └─> inProgress = false
  └─> if !canGoNext: set auto error
  └─> if !step.error && isLast:
        └─> await onDone({ context, steps, wizard, update })
        └─> on success: isDone = true
  └─> if !step.error && !isLast: current++; clear new step's error
  └─> publish()
  └─> isNavigating = false
```

### Hook Safety

Navigation methods called from inside hooks or `onDone` are **silent no-ops** (they return
the current step index). They do NOT throw.

- **ALLOWED inside hooks**: `update()`, `wizard.get()`, `wizard.context`,
  `wizard.publish()`, `wizard.allowCanGoNext()`, `wizard.resetCanGoNext()`.
- **IGNORED inside hooks**: `wizard.next()`, `wizard.previous()`, `wizard.goto()`,
  `wizard.reset()`.
- **Deferred navigation**: `setTimeout(() => wizard.reset(), 0)` works and is the
  recommended pattern.

### Error Handling

| Hook              | Effect                                              |
| ----------------- | --------------------------------------------------- |
| `preNext`         | Captured on current step, blocks forward navigation |
| `prePrevious`     | Captured on current step, navigation still proceeds |
| `preReset`        | Swallowed (logged if logger provided)               |
| `onDone`          | Captured on last step, `isDone` stays `false`       |
| Global `preReset` | Swallowed (logged if logger provided)               |

### Data Reset Behavior

On `reset()`:

- `step.data` → restored to initial config value (deep cloned).
- `step.error` → set to `null`.
- `step.canGoNext` → restored to initial config value.
- `step.canGoPrevious` → restored to initial config value.
- `isDone` → set to `false`.
- `context` → NOT reset (mutable, persists).
- Subscribers see a single publish of the final state (not per-step flicker).

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
    if (!isValidEmail(data.email)) throw new Error("Invalid email");
  }
}
```

### Locked Final Step (no going back)

```typescript
{
  label: "Thank you",
  canGoPrevious: false,
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

### Label Resolution

```typescript
import { resolveLabel } from "@marianmeres/wizard";
const text = resolveLabel(step.label, "en");
```

## TypeScript Generics

```typescript
createWizard<TData, TContext>(label, options);
```

- `TData` — Shape of step data (shared across all steps).
- `TContext` — Shape of global context object.
- Both default to `Record<string, unknown>`.
