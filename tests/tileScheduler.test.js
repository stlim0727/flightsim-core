import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileScheduler } from '../src/tile/TileScheduler.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('scheduler deduplicates concurrent keys and reports stats', async () => {
  const scheduler = createTileScheduler();
  let calls = 0;
  const run = async () => { calls++; await delay(5); return 'tile'; };
  const results = await Promise.all([
    scheduler.schedule('a', 1, run),
    scheduler.schedule('a', 1, run),
    scheduler.schedule('a', 1, run),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(results, ['tile', 'tile', 'tile']);
  assert.equal(scheduler.stats().misses, 1);
  assert.equal(scheduler.inFlightCount(), 0);
  scheduler.dispose();
});

test('scheduler bounds concurrency and runs priority work first', async () => {
  let active = 0;
  let peak = 0;
  const order = [];
  const scheduler = createTileScheduler({
    maxConcurrent: 1,
    priorityOf: (value, context) => Math.abs(value - context),
  });
  scheduler.setPriorityContext(0);
  await Promise.all([3, 1, 2].map((value) => scheduler.schedule(`k${value}`, value, async () => {
    active++;
    peak = Math.max(peak, active);
    order.push(value);
    await delay(2);
    active--;
    return value;
  })));
  assert.equal(peak, 1);
  assert.deepEqual(order, [1, 2, 3]);
  scheduler.dispose();
});

test('scheduler rejects queued work after dispose', async () => {
  const scheduler = createTileScheduler({ maxConcurrent: 1 });
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const first = scheduler.schedule('first', 0, () => {
    started();
    return new Promise((resolve) => { release = resolve; });
  });
  await startedPromise;
  const queued = scheduler.schedule('queued', 1, async () => 2);
  scheduler.dispose();
  await assert.rejects(queued, /disposed/);
  release();
  assert.equal(await first, undefined);
});

test('scheduler records rejected work in the errors metric', async () => {
  const scheduler = createTileScheduler();
  await assert.rejects(
    scheduler.schedule('bad', 1, async () => { throw new Error('load failed'); }),
    /load failed/
  );
  assert.equal(scheduler.stats().errors, 1);
  scheduler.dispose();
});

test('scheduler recomputes queued priorities when the context changes', async () => {
  const scheduler = createTileScheduler({
    maxConcurrent: 1,
    priorityOf: (value, context) => Math.abs(value - context),
  });
  scheduler.setPriorityContext(0);
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const order = [];
  const first = scheduler.schedule('first', 0, () => {
    started();
    return new Promise((resolve) => { release = resolve; });
  });
  await startedPromise;
  const near = scheduler.schedule('near', 100, async () => { order.push(100); return 100; });
  const far = scheduler.schedule('far', 1, async () => { order.push(1); return 1; });

  scheduler.setPriorityContext(100);
  release();
  await Promise.all([first, near, far]);
  assert.deepEqual(order, [100, 1]);
  scheduler.dispose();
});
