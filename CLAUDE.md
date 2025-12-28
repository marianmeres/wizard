# Claude Code Instructions

## Package: @marianmeres/wizard

Multi-step wizard flow state management library. UI/framework agnostic. Store-compatible
for reactive frameworks.

## Quick Reference

**Entry:** `src/mod.ts` → exports from `src/wizard.ts` **Tests:** `tests/wizard.test.ts`
(21 tests, run with `deno test`) **Runtime:** Deno primary, npm build for Node.js

## Core API

```typescript
const wizard = createWizard<TData, TContext>(label, {
  steps: [
    { label: "Step 1", data: {...}, canGoNext: true },
    { label: "Step 2", preNext: async (data, { update }) => {...} }
  ],
  context: {...},  // Shared state, persists across reset
  onDone: async ({ steps, context }) => {...}
});

// Navigation
await wizard.next(data?);  // Forward
await wizard.previous();   // Back
await wizard.reset();      // To start
await wizard.goto(index);  // Jump

// State
wizard.subscribe(({ step, steps, inProgress }) => {...});
wizard.get();  // Sync access
```

## Key Constraints

1. **Minimum 2 steps** required (throws TypeError otherwise)
2. **No navigation inside hooks** - `next()`, `previous()`, `goto()`, `reset()` throw
   TypeError if called within `preNext/prePrevious/preReset` hooks
3. **canGoNext=false blocks next()** - step must enable it via
   `update({ canGoNext: true })`
4. **Context persists** - not reset on `reset()`, unlike step data

## Detailed Documentation

- **API.md** - Complete type reference and method documentation
- **AGENTS.md** - Machine-friendly architecture overview
- **README.md** - Usage examples and quick start

## Common Tasks

```bash
deno test              # Run tests
deno task npm:build    # Build npm package
deno fmt               # Format code
```
