import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { createWizardStore } from '../src/index.js';
import { createClog } from '@marianmeres/clog';

const clog = createClog(path.basename(fileURLToPath(import.meta.url)));
const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

suite.test('basic flow', async () => {
	const w = createWizardStore('foo', {
		steps: [
			{ label: 'one', foo: 123 },
			{
				label: 'two',
				canGoNext: false,
				preNext: async (data, { set, context }) => {
					set({ canGoNext: data.hey === context.hey });
				},
				// we want to reset state on previous click
				prePrevious: async (data, { set }) => {
					set({ canGoNext: false, data: {} });
				},
			},
			{ label: 'three' },
			{ label: 'four' },
		],
		context: { hey: 'ho' },
		onDone: async ({ context, steps }) => 'done...',
		// logger: createClog('wizard').debug as any,
	});

	let x: any;

	assert(w.label === 'foo');

	w.subscribe(async ({ step, steps }) => {
		assert(step.foo === 123);
		assert(step.isFirst);
		assert(!step.isLast);

		// modifying context works, but...
		w.context.lets = 'go';
		// for writable state this is better
		step.lets = 'go';
	})();

	//
	x = await w.next();
	assert(x === 1);

	//
	w.subscribe(({ step, steps }) => {
		assert(step.label === 'two');
		assert(step.foo === undefined);
		assert(step.error === null);
		assert(!step.isFirst);
		assert(!step.isLast);

		// modified in previous step
		assert(w.context.lets === 'go');
		// but this should be used instead
		assert(steps[step.index - 1].lets === 'go');
	})();

	// must NOT proceed - step 1 has validation
	x = await w.next();
	assert(x === 1);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'two'); // not three
		assert(step.error); // has error
	})();

	// now proceed with correct data that validates
	x = await w.next({ hey: 'ho' });
	assert(x === 2);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'three');
		assert(step.error === null);
		// previous error must have been reset
		assert(steps[step.index - 1].error === null);
		// data provided to last next must be saved (in previous step)
		assert(steps[step.index - 1].data.hey === 'ho');
		assert(!step.isFirst);
		assert(!step.isLast);
	})();

	x = await w.next();
	assert(x === 3);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
		assert(!step.isFirst);
		assert(step.isLast);
	})();

	x = await w.next(); // noop
	assert(x === 3);

	// still on four
	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
	})();

	// go back
	x = await w.previous();
	assert(x === 2);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'three');
	})();

	x = await w.next();
	assert(x === 3);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
	})();

	// same as reset
	x = await w.goto(0);
	assert(x === 0);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'one');
	})();

	// must not work (with assert = false)
	x = await w.goto(3, [], false);
	assert(x === 1);

	w.subscribe(({ step, steps }) => {
		// we MUST be at two NOT three
		assert(step.label === 'two');
	})();

	x = await w.reset();
	assert(x === 0);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'one');
	})();

	// now MUST work (since we're providing correct step data which will validate)
	x = await w.goto(3, [null, { hey: 'ho' }] as any);
	assert(x === 3);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
	})();
});

suite.test('preNext error', async () => {
	const w = createWizardStore('foo', {
		steps: [
			{
				label: 'one',
				foo: 123,
				preNext: async (data, { set, context }) => {
					throw new Error('Boo');
				},
			},
			{ label: 'two' },
		],
		context: { hey: 'ho' },
		onDone: async ({ context, steps }) => 'done...',
	});

	w.subscribe(({ step, steps }) => {
		assert(!step.error);
		assert(step.canGoNext);
	})();

	await w.next();

	w.subscribe(({ step, steps }) => {
		assert(step.error);
		// potential confusion: canGoNext will be true even if error exists
		assert(step.canGoNext);
	})();
});

suite.test('goto works', async () => {
	const w = createWizardStore('foo', {
		steps: [
			{ label: 'one' },
			{ label: 'two', canGoNext: false },
			{ label: 'three' },
			{ label: 'four' },
			{ label: 'five' },
			{ label: 'six' },
		],
		context: { hey: 'ho' },
		onDone: async ({ context, steps }) => 'done...',
		// logger: createClog('wizard').debug as any,
	});

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'one');
	})();

	// must not allow to goto beyond 2
	await assert.rejects(w.goto(3));

	w.subscribe(({ step, steps }) => {
		// clog(step);
		assert(step.label === 'two');
	})();

	// now mark every step as "canGoNext"
	w.allowCanGoNext();
	// w.subscribe(({ step, steps }) => {
	// steps.forEach((s) => s.set({ canGoNext: true }));
	// })();

	await w.goto(4);

	w.subscribe(({ step, steps }) => {
		// clog(step);
		assert(step.label === 'five');
	})();

	// go back to start, and revert flags to initial values
	await w.goto(0);
	w.resetCanGoNext();

	// now must not work again
	await assert.rejects(w.goto(3));
});

suite.test('set fn val', async () => {
	const w = createWizardStore('foo', {
		steps: [{ label: 'one', data: { val: 1 } }, { label: 'two' }, { label: 'three' }],
		onDone: async ({ context, steps }) => 'done...',
		// logger: createClog('wizard').debug as any,
	});

	const incrementor = (old) => {
		old.val++;
		return { ...old };
	};

	w.subscribe(({ step, steps }) => {
		// clog(step);
		assert(step.data.val === 1);
		step.set({ data: incrementor });
		assert(step.data.val === 2);
	})();

	await w.goto(2);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'three');
		// update data from other step
		steps[0].set({ data: incrementor });
	})();

	await w.goto(0);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'one');
		// was incremented "from" step 3
		assert(step.data.val === 3);
	})();
});

export default suite;
