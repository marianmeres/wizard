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
				preNext: async (data, { setCanGoNext, context }) => {
					setCanGoNext(data.hey === context.hey)
				},
				// we want to reset state to this step's defaults
				prePrevious: async (data, { setData, setCanGoNext }) => {
					setCanGoNext(false);
					setData({});
				},
			},
			{ label: 'three' },
			{ label: 'four' },
		],
		context: { hey: 'ho' },
	});

	let x: any;

	assert(!w.isDone());

	w.subscribe(async ({ step, steps, context }) => {
		assert(step.foo === 123);
		assert(step.isFirst);
		assert(!step.isLast);

		// modifying context works, but I tend to consider it as a bad practice...
		// for writable data the actual step data suits better
		context.lets = 'go';
		// this is better
		step.lets = 'go';
	})();

	// proceed
	x = await w.next();
	assert(!w.isDone());
	assert(x === 1);

	//
	w.subscribe(({ step, steps, context }) => {
		assert(step.label === 'two');
		assert(step.foo === undefined);
		assert(step.error === null);
		assert(!step.isFirst);
		assert(!step.isLast);

		// modified in previous step
		assert(context.lets === 'go');
		// but this should be used instead
		assert(steps[step.index - 1].lets === 'go');
	})();

	// must NOT proceed - step 1 has validation
	x = await w.next();
	assert(!w.isDone());
	assert(x === 1);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'two'); // not three
		assert(step.error); // has error
	})();

	// now proceed with correct data that validates
	x = await w.next({ hey: 'ho' });
	assert(!w.isDone());
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
	assert(w.isDone());
	assert(x === 3);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
		assert(!step.isFirst);
		assert(step.isLast);
	})();

	x = await w.next(); // noop
	assert(w.isDone());
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

	// must not work
	x = await w.goto(3);
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
	x = await w.goto(3, [null, { hey: 'ho' }]);
	assert(x === 3);

	w.subscribe(({ step, steps }) => {
		assert(step.label === 'four');
	})();

});

export default suite;
