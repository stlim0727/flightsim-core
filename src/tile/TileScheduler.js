/**
 * Headless tile scheduling shared by Flight3d and hajun3d.
 *
 * Owns only in-flight deduplication, a priority queue with bounded concurrency,
 * scheduling metrics and disposal. Fetch, decode, caching and persistence stay
 * in the application layer so imagery tiles and Terrarium elevation tiles can
 * share the scheduler without sharing their I/O policies.
 */

export function createTileScheduler(options = {}) {
  const {
    maxConcurrent = 4,
    priorityOf = () => 0,
  } = options;
  const limit = Math.max(1, Math.floor(maxConcurrent));
  const inFlight = new Map();
  const queue = [];
  const stats = { misses: 0, errors: 0, active: 0, queued: 0 };
  let priorityContext = null;
  let sequence = 0;
  let disposed = false;

  function setPriorityContext(value) {
    priorityContext = value;
    for (const job of queue) job.priority = priorityOf(job.value, value);
  }

  function pump() {
    queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    while (stats.active < limit && queue.length > 0) {
      const job = queue.shift();
      stats.queued = queue.length;
      stats.active++;
      Promise.resolve()
        .then(() => job.run(job.value))
        .then(job.resolve, (error) => { stats.errors++; job.reject(error); })
        .finally(() => {
          stats.active--;
          pump();
        });
    }
  }

  /** Schedule `run(value)` once per key; concurrent callers share the promise. */
  function schedule(key, value, run) {
    if (disposed) return Promise.reject(new Error('tile scheduler disposed'));
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = new Promise((resolve, reject) => {
      queue.push({
        key,
        value,
        run,
        resolve,
        reject,
        priority: priorityOf(value, priorityContext),
        seq: sequence++,
      });
      stats.misses++;
      stats.queued = queue.length;
    });
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key)).catch(() => {});
    Promise.resolve().then(pump);
    return promise;
  }

  function dispose() {
    disposed = true;
    for (const job of queue) job.reject(new Error('tile scheduler disposed'));
    queue.length = 0;
    stats.queued = 0;
    inFlight.clear();
  }

  return {
    schedule,
    setPriorityContext,
    stats: () => ({ ...stats }),
    inFlightCount: () => inFlight.size,
    dispose,
  };
}
