import path from 'node:path';
import { strict as assert } from 'node:assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { createWizardStore } from '../src/index.js';
import { createClog } from '@marianmeres/clog';

const clog = createClog(path.basename(fileURLToPath(import.meta.url)));
const suite = new TestRunner(path.basename(fileURLToPath(import.meta.url)));

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

suite.test('basic happy flow', async () => {
	const w = createWizardStore('foo', {
		steps: [
			{ label: 'one', foo: 123 },
			{
				label: 'two',
				validate: async (stepState, { context, wizardStore }) => {
					await sleep(0);
					// anything other than `true` is considered invalid (we could return an
					// error map if needed)
					return stepState.hey === context.hey;
				},
				// we want to reset step data on "previous" move
				prePreviousHook: async (stepState, { setCurrentStepData }) => {
					setCurrentStepData({}); // reset data
				},
			},
			{ label: 'three' },
			{ label: 'four' },
		],
		context: { hey: 'ho' },
	});

	let x: any;

	assert(!w.isDone());

	w.subscribe(({ steps, current }) => {
		assert(steps[current].foo === 123);
		assert(steps[current].isFirst);
		assert(!steps[current].isLast);
	})();

	// proceed
	x = await w.next();
	assert(!w.isDone());
	assert(x === 1);

	//
	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'two');
		assert(steps[current].foo === undefined);
		assert(steps[current].error === null);
		assert(!steps[current].isFirst);
		assert(!steps[current].isLast);
	})();

	// must NOT proceed - step 1 has validation
	x = await w.next();
	assert(!w.isDone());
	assert(x === 1);

	w.subscribe(({ steps, current }) => {
		// clog(current, steps[current]);
		assert(steps[current].label === 'two'); // not three
		assert(steps[current].error.validate === false);
	})();

	// now proceed with correct data that validates
	x = await w.next({ hey: 'ho' });
	assert(!w.isDone());
	assert(x === 2);

	w.subscribe(({ steps, current }) => {
		// clog(current, steps);
		assert(steps[current].label === 'three');
		assert(steps[current].error === null);
		// previous error must have been reset
		assert(steps[current - 1].error === null);
		// data provided to last next must be saved (in previous step)
		assert(steps[current - 1].data.hey === 'ho');
		assert(!steps[current].isFirst);
		assert(!steps[current].isLast);
	})();

	x = await w.next();
	assert(w.isDone());
	assert(x === 3);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'four');
		assert(!steps[current].isFirst);
		assert(steps[current].isLast);
	})();

	x = await w.next(); // noop
	assert(w.isDone());
	assert(x === 3);

	// still on four
	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'four');
	})();

	// go back
	x = await w.previous();
	assert(x === 2);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'three');
	})();

	x = await w.next();
	assert(x === 3);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'four');
	})();

	// same as reset
	x = await w.goto(0);
	assert(x === 0);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'one');
		// clog(steps, current);
	})();

	// must not work
	x = await w.goto(3);
	assert(x === 1);

	w.subscribe(({ steps, current }) => {
		// we MUST be at two NOT three
		assert(steps[current].label === 'two');
	})();

	x = await w.reset();
	assert(x === 0);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'one');
	})();

	// now MUST work (since we're providing correct step data which will validate)
	x = await w.goto(3, [null, { hey: 'ho' }]);
	assert(x === 3);

	w.subscribe(({ steps, current }) => {
		assert(steps[current].label === 'four');
	})();
});

export default suite;
