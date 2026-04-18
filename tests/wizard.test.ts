import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { createWizard, resolveLabel } from "@marianmeres/wizard";

// Helper type for tests
interface TestData {
	value?: string;
	count?: number;
	hey?: string;
}

interface TestContext {
	hey: string;
	extra?: string;
}

Deno.test("throws if less than 2 steps", () => {
	assertThrows(
		() =>
			createWizard("test", {
				steps: [{ label: "one" }],
				onDone: async () => {},
			}),
		TypeError,
		"expecting array of at least 2 step configs",
	);

	assertThrows(
		() =>
			createWizard("test", {
				steps: [],
				onDone: async () => {},
			}),
		TypeError,
		"expecting array of at least 2 step configs",
	);
});

Deno.test("basic flow works", async () => {
	let doneCallCount = 0;

	const w = createWizard<TestData, TestContext>("foo", {
		steps: [
			{ label: "one", data: { value: "initial" } },
			{
				label: "two",
				canGoNext: false,
				preNext: async (_data, { update, context }) => {
					// Validate: only allow next if data.hey matches context.hey
					update({ canGoNext: _data.hey === context.hey });
				},
				prePrevious: async (_data, { update }) => {
					// Reset state on going back
					update({ canGoNext: false, data: {} });
				},
			},
			{ label: "three" },
			{ label: "four" },
		],
		context: { hey: "ho" },
		onDone: async () => {
			doneCallCount++;
		},
	});

	// Test initial state
	assertEquals(w.label, "foo");
	assertEquals(w.context.hey, "ho");

	let state = w.get();
	assertEquals(state.step.label, "one");
	assertEquals(state.step.index, 0);
	assertEquals(state.step.isFirst, true);
	assertEquals(state.step.isLast, false);
	assertEquals(state.step.data.value, "initial");
	assertEquals(state.inProgress, false);

	// Go to step 2
	let idx = await w.next();
	assertEquals(idx, 1);

	state = w.get();
	assertEquals(state.step.label, "two");
	assertEquals(state.step.isFirst, false);
	assertEquals(state.step.isLast, false);

	// Try to proceed without validation - should fail
	idx = await w.next();
	assertEquals(idx, 1); // Still at step 2

	state = w.get();
	assertEquals(state.step.label, "two");
	assertEquals(state.step.error !== null, true); // Has error

	// Now proceed with correct data that validates
	idx = await w.next({ hey: "ho" });
	assertEquals(idx, 2);

	state = w.get();
	assertEquals(state.step.label, "three");
	assertEquals(state.step.error, null);
	// Previous step's error should be cleared
	assertEquals(state.steps[1].error, null);
	// Data provided to next should be saved in previous step
	assertEquals(state.steps[1].data.hey, "ho");

	// Go to last step
	idx = await w.next();
	assertEquals(idx, 3);

	state = w.get();
	assertEquals(state.step.label, "four");
	assertEquals(state.step.isLast, true);

	// Call next on last step - should trigger onDone
	idx = await w.next();
	assertEquals(idx, 3); // Still at last step
	assertEquals(doneCallCount, 1);

	// Go back
	idx = await w.previous();
	assertEquals(idx, 2);
	assertEquals(w.get().step.label, "three");

	// Forward again
	idx = await w.next();
	assertEquals(idx, 3);

	// Reset
	idx = await w.reset();
	assertEquals(idx, 0);
	assertEquals(w.get().step.label, "one");
});

Deno.test("preNext error is captured", async () => {
	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async () => {
					throw new Error("Boo!");
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});

	let state = w.get();
	assertEquals(state.step.error, null);
	assertEquals(state.step.canGoNext, true);

	await w.next();

	state = w.get();
	assertEquals(state.step.error instanceof Error, true);
	assertEquals((state.step.error as Error).message, "Boo!");
	// canGoNext remains true even with error (they're independent)
	assertEquals(state.step.canGoNext, true);
});

Deno.test("goto works", async () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{ label: "two", canGoNext: false },
			{ label: "three" },
			{ label: "four" },
			{ label: "five" },
			{ label: "six" },
		],
		onDone: async () => {},
	});

	assertEquals(w.get().step.label, "one");

	// Should not allow goto beyond step 2 (canGoNext: false)
	await assertRejects(() => w.goto(3), Error, "did not succeed");

	assertEquals(w.get().step.label, "two");

	// Allow free navigation
	w.allowCanGoNext();

	await w.goto(4);
	assertEquals(w.get().step.label, "five");

	// Go back and reset flags
	await w.goto(0);
	w.resetCanGoNext();

	// Should fail again now
	await assertRejects(() => w.goto(3), Error);
});

Deno.test("goto with assert=false does not throw", async () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{ label: "two", canGoNext: false },
			{ label: "three" },
		],
		onDone: async () => {},
	});

	// With assert=false, should not throw but stop at blocker
	const idx = await w.goto(2, [], false);
	assertEquals(idx, 1);
	assertEquals(w.get().step.label, "two");
});

Deno.test("goto with stepsData", async () => {
	const w = createWizard<TestData, TestContext>("foo", {
		steps: [
			{ label: "one" },
			{
				label: "two",
				canGoNext: false,
				preNext: async (data, { update, context }) => {
					update({ canGoNext: data.hey === context.hey });
				},
			},
			{ label: "three" },
			{ label: "four" },
		],
		context: { hey: "ho" },
		onDone: async () => {},
	});

	// Provide step data that will pass validation
	const idx = await w.goto(3, [null, { hey: "ho" }]);
	assertEquals(idx, 3);
	assertEquals(w.get().step.label, "four");
});

Deno.test("step.update with function value", async () => {
	const w = createWizard<{ val: number }>("foo", {
		steps: [
			{ label: "one", data: { val: 1 } },
			{ label: "two" },
			{ label: "three" },
		],
		onDone: async () => {},
	});

	const incrementor = (old: { val: number }) => ({ val: old.val + 1 });

	// Initial value
	assertEquals(w.get().step.data.val, 1);

	// Update using function
	w.get().step.update({ data: incrementor });
	assertEquals(w.get().step.data.val, 2);

	// Go to step 3
	w.allowCanGoNext();
	await w.goto(2);
	assertEquals(w.get().step.label, "three");

	// Update step 0 from step 2
	w.get().steps[0].update({ data: incrementor });

	// Go back to verify
	await w.goto(0);
	assertEquals(w.get().step.data.val, 3);
});

Deno.test("navigation from inside pre-hooks is silently ignored (no-op)", async () => {
	// Calling navigation methods from inside a hook is treated as a
	// concurrent call and silently ignored — the outer navigation proceeds
	// as if the nested call had not happened. This is consistent with the
	// concurrent-click behavior (B3) and avoids the hook-reentry / concurrent
	// ambiguity that an error-throwing design cannot resolve from state alone.

	// reset() from preNext — should no-op, outer next() still advances.
	const w1 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					await wizard.reset(); // no-op (does NOT throw)
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	const r1 = await w1.next();
	assertEquals(r1, 1);
	assertEquals(w1.get().step.index, 1);
	assertEquals(w1.get().step.error, null);

	// next() from preNext (attempted recursion) — no-op, parent call wins.
	const w2 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					await wizard.next();
				},
			},
			{ label: "two" },
			{ label: "three" },
		],
		onDone: async () => {},
	});
	await w2.next();
	assertEquals(w2.get().step.index, 1); // advanced only once

	// previous() from preNext — no-op.
	const w3 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					await wizard.previous();
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	await w3.next();
	assertEquals(w3.get().step.index, 1);

	// goto() from preNext — no-op.
	const w4 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					await wizard.goto(1);
				},
			},
			{ label: "two" },
			{ label: "three" },
		],
		onDone: async () => {},
	});
	await w4.next();
	assertEquals(w4.get().step.index, 1);
});

Deno.test("navigation from prePrevious hook is silently ignored", async () => {
	let preCalled = false;
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{
				label: "two",
				prePrevious: async (_data, { wizard }) => {
					preCalled = true;
					await wizard.next(); // silently ignored
				},
			},
		],
		onDone: async () => {},
	});

	await w.next();
	await w.previous();

	assertEquals(preCalled, true);
	assertEquals(w.get().step.index, 0); // previous still completed
});

Deno.test("goto throws RangeError for invalid index", async () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {},
	});

	await assertRejects(() => w.goto(-1), RangeError, "Invalid step index");
	await assertRejects(() => w.goto(5), RangeError, "Invalid step index");
});

Deno.test("goto to same index is no-op", async () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {},
	});

	const idx = await w.goto(0);
	assertEquals(idx, 0);
});

Deno.test("subscription works", async () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }, { label: "three" }],
		onDone: async () => {},
	});

	const history: string[] = [];

	const unsubscribe = w.subscribe(({ step }) => {
		history.push(step.label as string);
	});

	// Initial subscription call
	assertEquals(history, ["one"]);

	await w.next();
	// inProgress changes trigger updates, final state is step two
	assertEquals(history.at(-1), "two");

	await w.next();
	assertEquals(history.at(-1), "three");

	const historyLengthBeforeUnsub = history.length;
	unsubscribe();

	await w.previous();
	// No new entries after unsubscribe
	assertEquals(history.length, historyLengthBeforeUnsub);
});

Deno.test("publish forces state emission", () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {},
	});

	let callCount = 0;
	w.subscribe(() => {
		callCount++;
	});

	assertEquals(callCount, 1); // Initial

	w.publish();
	assertEquals(callCount, 2);

	w.publish();
	assertEquals(callCount, 3);
});

Deno.test("onDone error is captured", async () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {
			throw new Error("onDone failed");
		},
	});

	await w.next(); // Go to last step
	await w.next(); // Trigger onDone

	const state = w.get();
	assertEquals(state.step.error instanceof Error, true);
	assertEquals((state.step.error as Error).message, "onDone failed");
});

Deno.test("reset restores initial data", async () => {
	const w = createWizard<{ val: number }>("foo", {
		steps: [
			{ label: "one", data: { val: 100 } },
			{ label: "two", data: { val: 200 } },
		],
		onDone: async () => {},
	});

	// Modify data
	w.get().steps[0].update({ data: { val: 999 } });
	w.get().steps[1].update({ data: { val: 888 } });

	assertEquals(w.get().steps[0].data.val, 999);
	assertEquals(w.get().steps[1].data.val, 888);

	await w.next();
	await w.reset();

	assertEquals(w.get().steps[0].data.val, 100);
	assertEquals(w.get().steps[1].data.val, 200);
});

Deno.test("context is mutable", () => {
	const w = createWizard<TestData, TestContext>("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		context: { hey: "ho" },
		onDone: async () => {},
	});

	assertEquals(w.context.hey, "ho");

	w.context.extra = "modified";
	assertEquals(w.context.extra, "modified");

	// Context is shared reference
	assertEquals(w.get().step.label, "one");
});

Deno.test("inProgress flag during async operations", async () => {
	const progressStates: boolean[] = [];

	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async () => {
					await new Promise((r) => setTimeout(r, 10));
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});

	w.subscribe(({ inProgress }) => {
		progressStates.push(inProgress);
	});

	await w.next();

	// Should have recorded both true and false states
	assertEquals(progressStates.includes(true), true);
	assertEquals(progressStates.at(-1), false);
});

Deno.test("step default label is index + 1", () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "" }, // Empty string
			{ label: "explicit" },
		],
		onDone: async () => {},
	});

	// Empty string is falsy, so default kicks in
	assertEquals(w.get().steps[0].label, "1");
	assertEquals(w.get().steps[1].label, "explicit");
});

Deno.test("prePrevious hook is called", async () => {
	let prePrevCalled = false;

	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{
				label: "two",
				prePrevious: async () => {
					prePrevCalled = true;
				},
			},
		],
		onDone: async () => {},
	});

	await w.next();
	assertEquals(w.get().step.label, "two");

	await w.previous();
	assertEquals(prePrevCalled, true);
	assertEquals(w.get().step.label, "one");
});

Deno.test("global preReset is called", async () => {
	let globalPreResetCalled = false;

	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		preReset: async () => {
			globalPreResetCalled = true;
		},
		onDone: async () => {},
	});

	await w.next();
	await w.reset();

	assertEquals(globalPreResetCalled, true);
});

Deno.test("error clears on successful next", async () => {
	let shouldFail = true;

	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async () => {
					if (shouldFail) throw new Error("fail");
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});

	await w.next();
	assertEquals(w.get().step.error instanceof Error, true);

	// Now let it succeed
	shouldFail = false;
	await w.next();

	assertEquals(w.get().step.label, "two");
	assertEquals(w.get().steps[0].error, null);
});

// ---------------------------------------------------------------------------
// Regression tests for bug fixes and design improvements
// ---------------------------------------------------------------------------

Deno.test("B1: reset() inside globalPreReset is safely ignored (no recursion)", async () => {
	let globalCalls = 0;
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		preReset: async ({ wizard }) => {
			globalCalls++;
			// Previously this could infinite-recurse because globalPreReset
			// was not hook-guarded. Now it silently no-ops via the
			// concurrency guard.
			await wizard.reset();
		},
		onDone: async () => {},
	});

	await w.next();
	await w.reset();

	assertEquals(globalCalls, 1); // ran exactly once, no recursion
	assertEquals(w.get().step.index, 0);
});

Deno.test("B2: reset() inside onDone is safely ignored, no state corruption", async () => {
	let onDoneCalls = 0;
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async ({ wizard }) => {
			onDoneCalls++;
			// Previously, calling reset here would set current=0 and then
			// the outer next() would increment to 1 — landing on the wrong
			// step. Now the nested reset is silently ignored.
			await wizard.reset();
		},
	});

	await w.next(); // go to last step
	await w.next(); // trigger onDone

	assertEquals(onDoneCalls, 1);
	// Must remain on last step with isDone=true — not corrupted by the
	// nested reset attempt.
	assertEquals(w.get().step.index, 1);
	assertEquals(w.get().isDone, true);
});

Deno.test("B3: concurrent next() calls are serialized (second is no-op)", async () => {
	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async () => {
					await new Promise((r) => setTimeout(r, 15));
				},
			},
			{ label: "two" },
			{ label: "three" },
		],
		onDone: async () => {},
	});

	// Two simultaneous calls — second should see isNavigating=true and no-op.
	const [a, b] = await Promise.all([w.next(), w.next()]);
	assertEquals(a, 1); // first succeeded
	assertEquals(b, 0); // second returned current before first completed
	assertEquals(w.get().step.index, 1);
});

Deno.test("B4: update({ data }) with same reference still publishes", () => {
	const w = createWizard<{ items: string[] }>("foo", {
		steps: [
			{ label: "one", data: { items: [] } },
			{ label: "two" },
		],
		onDone: async () => {},
	});

	let publishes = 0;
	w.subscribe(() => {
		publishes++;
	});
	// subscribe fires once immediately
	assertEquals(publishes, 1);

	const step = w.get().step;
	// Mutate in place, then pass SAME reference back.
	step.data.items.push("a");
	step.update({ data: step.data });
	assertEquals(publishes, 2);
	assertEquals(w.get().step.data.items, ["a"]);

	// Functional updater returning same reference also publishes.
	step.update({
		data: (prev) => {
			prev.items.push("b");
			return prev;
		},
	});
	assertEquals(publishes, 3);
	assertEquals(w.get().step.data.items, ["a", "b"]);
});

Deno.test("D1: step object does not expose raw hooks", () => {
	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async () => {},
				prePrevious: async () => {},
				preReset: async () => {},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});

	const step = w.get().step as unknown as Record<string, unknown>;
	assertEquals("preNext" in step, false);
	assertEquals("prePrevious" in step, false);
	assertEquals("preReset" in step, false);
});

Deno.test("D3: reset emits a single transition to step 0", async () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{ label: "two" },
			{ label: "three" },
			{ label: "four" },
		],
		onDone: async () => {},
	});

	await w.goto(3); // move to last step

	const stepIndices: number[] = [];
	w.subscribe(({ step }) => {
		stepIndices.push(step.index);
	});
	assertEquals(stepIndices, [3]); // initial

	await w.reset();

	// During reset we expect:
	//   - inProgress=true publish (still step 3)
	//   - final publish (step 0)
	// Intermediate indices 2 and 1 must NOT appear.
	const seenIntermediates = stepIndices.some((i) => i === 1 || i === 2);
	assertEquals(seenIntermediates, false);
	assertEquals(stepIndices.at(-1), 0);
});

Deno.test("D4/D5: previous() clears leaving and destination step errors", async () => {
	const w = createWizard<TestData>("foo", {
		steps: [
			{ label: "one" },
			{
				label: "two",
				prePrevious: async () => {
					// successful hook, should leave no error
				},
			},
		],
		onDone: async () => {},
	});

	// Set stale errors on both steps.
	await w.next();
	w.get().steps[0].update({ error: "stale on step 0" });
	w.get().steps[1].update({ error: "stale on step 1" });
	assertEquals(w.get().steps[0].error, "stale on step 0");
	assertEquals(w.get().steps[1].error, "stale on step 1");

	await w.previous();

	// Leaving step (1) cleared before prePrevious → still null after successful hook
	assertEquals(w.get().steps[1].error, null);
	// Destination step (0) cleared on arrival
	assertEquals(w.get().steps[0].error, null);
});

Deno.test("D9: canGoPrevious=false blocks previous()", async () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{ label: "two", canGoPrevious: false },
		],
		onDone: async () => {},
	});

	await w.next();
	assertEquals(w.get().step.index, 1);

	// Blocked: previous should no-op.
	await w.previous();
	assertEquals(w.get().step.index, 1);

	// Toggle via step.update → now unblocked.
	w.get().step.update({ canGoPrevious: true });
	await w.previous();
	assertEquals(w.get().step.index, 0);
});

Deno.test("I8: step.clearError() clears only that step's error", () => {
	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {},
	});

	w.get().steps[0].update({ error: "oops" });
	w.get().steps[1].update({ error: "other" });
	w.get().steps[0].clearError();

	assertEquals(w.get().steps[0].error, null);
	assertEquals(w.get().steps[1].error, "other");
});

Deno.test("I10: successful onDone sets isDone; next() no-ops until reset", async () => {
	let onDoneCalls = 0;

	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {
			onDoneCalls++;
		},
	});

	assertEquals(w.get().isDone, false);

	await w.next(); // go to last step
	await w.next(); // trigger onDone
	assertEquals(onDoneCalls, 1);
	assertEquals(w.get().isDone, true);

	// Subsequent next() must not re-run onDone.
	await w.next();
	await w.next();
	assertEquals(onDoneCalls, 1);

	// Going back clears isDone.
	await w.previous();
	assertEquals(w.get().isDone, false);
	assertEquals(w.get().step.index, 0);

	// Forward twice (to last step, then trigger onDone again).
	await w.next(); // 0 → 1
	await w.next(); // onDone runs
	assertEquals(onDoneCalls, 2);
	assertEquals(w.get().isDone, true);

	// Reset also clears isDone.
	await w.reset();
	assertEquals(w.get().isDone, false);
});

Deno.test("I10: failed onDone does NOT set isDone", async () => {
	let shouldFail = true;
	let onDoneCalls = 0;

	const w = createWizard("foo", {
		steps: [{ label: "one" }, { label: "two" }],
		onDone: async () => {
			onDoneCalls++;
			if (shouldFail) throw new Error("nope");
		},
	});

	await w.next();
	await w.next(); // triggers onDone, which throws
	assertEquals(onDoneCalls, 1);
	assertEquals(w.get().isDone, false);
	assertEquals(w.get().step.error instanceof Error, true);

	// Retry — onDone runs again because isDone is still false.
	shouldFail = false;
	await w.next();
	assertEquals(onDoneCalls, 2);
	assertEquals(w.get().isDone, true);
});

Deno.test("I9: resolveLabel handles all Label variants", () => {
	assertEquals(resolveLabel("plain"), "plain");
	assertEquals(resolveLabel(() => "from-fn"), "from-fn");
	assertEquals(resolveLabel({ en: "hi", de: "hallo" }, "de"), "hallo");
	assertEquals(resolveLabel({ en: "hi", de: "hallo" }, "fr"), "hi"); // fallback: first
	assertEquals(resolveLabel({ en: "hi" }), "hi"); // no locale: first
	assertEquals(resolveLabel(""), "");
});

Deno.test("goto respects canGoPrevious on backward walk", async () => {
	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{ label: "two" },
			{ label: "three", canGoPrevious: false },
			{ label: "four" },
		],
		onDone: async () => {},
	});

	// Walk to step 3.
	await w.goto(3);
	assertEquals(w.get().step.index, 3);

	// goto(0) should be blocked at step 2 (canGoPrevious=false on step 2).
	await assertRejects(
		() => w.goto(0),
		Error,
		"did not succeed",
	);
	assertEquals(w.get().step.index, 2);
});

Deno.test("reset inside a setTimeout from a hook works (documented workaround)", async () => {
	let resetCalled = false;

	const w = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: (_data, { wizard }) => {
					setTimeout(() => {
						wizard.reset().then(() => {
							resetCalled = true;
						});
					}, 0);
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});

	await w.next();
	// Wait for the deferred reset to run.
	await new Promise((r) => setTimeout(r, 10));
	assertEquals(resetCalled, true);
	assertEquals(w.get().step.index, 0);
});
