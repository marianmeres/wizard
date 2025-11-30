/**
 * @module
 *
 * A utility for managing multi-step wizard flows. Agnostic of actual business logic
 * or rendering. Store-compatible for reactive UI frameworks.
 *
 * @example
 * ```typescript
 * import { createWizard } from "@marianmeres/wizard";
 *
 * interface StepData {
 *   name?: string;
 *   email?: string;
 * }
 *
 * const wizard = createWizard<StepData>('registration', {
 *   steps: [
 *     { label: 'Personal', data: { name: '', email: '' } },
 *     { label: 'Confirm', canGoNext: false },
 *   ],
 *   onDone: async ({ steps }) => {
 *     console.log('Done!', steps);
 *   },
 * });
 *
 * wizard.subscribe(({ step }) => {
 *   console.log('Current step:', step.label);
 * });
 *
 * await wizard.next({ name: 'John' });
 * ```
 */

export * from "./wizard.ts";
