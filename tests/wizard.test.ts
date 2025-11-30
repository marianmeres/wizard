import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { createWizard } from "@marianmeres/wizard";

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

Deno.test("cannot call navigation methods from inside pre-hooks", async () => {
	const errors: Record<string, string> = {};

	// Test reset() from preNext
	const w1 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					try {
						await wizard.reset();
					} catch (e) {
						if (e instanceof TypeError) {
							errors.reset = e.message;
						}
					}
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	await w1.next();
	assertEquals(errors.reset?.includes("reset()"), true);
	assertEquals(errors.reset?.includes("pre-hooks"), true);

	// Test next() from preNext (recursive call)
	const w2 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					try {
						await wizard.next();
					} catch (e) {
						if (e instanceof TypeError) {
							errors.next = e.message;
						}
					}
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	await w2.next();
	assertEquals(errors.next?.includes("Cannot call next()"), true);

	// Test previous() from preNext
	const w3 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					try {
						await wizard.previous();
					} catch (e) {
						if (e instanceof TypeError) {
							errors.previous = e.message;
						}
					}
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	await w3.next();
	assertEquals(errors.previous?.includes("Cannot call previous()"), true);

	// Test goto() from preNext
	const w4 = createWizard("foo", {
		steps: [
			{
				label: "one",
				preNext: async (_data, { wizard }) => {
					try {
						await wizard.goto(1);
					} catch (e) {
						if (e instanceof TypeError) {
							errors.goto = e.message;
						}
					}
				},
			},
			{ label: "two" },
		],
		onDone: async () => {},
	});
	await w4.next();
	assertEquals(errors.goto?.includes("Cannot call goto()"), true);
});

Deno.test("cannot call navigation from prePrevious hook", async () => {
	let errorMessage = "";

	const w = createWizard("foo", {
		steps: [
			{ label: "one" },
			{
				label: "two",
				prePrevious: async (_data, { wizard }) => {
					try {
						await wizard.next();
					} catch (e) {
						if (e instanceof TypeError) {
							errorMessage = e.message;
						}
					}
				},
			},
		],
		onDone: async () => {},
	});

	await w.next();
	await w.previous();

	assertEquals(errorMessage.includes("Cannot call next()"), true);
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
