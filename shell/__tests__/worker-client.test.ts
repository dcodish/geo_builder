/**
 * THE SHARED WORKER CLIENT ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, phase 3): the
 * protocol's two halves and the executors, each claim as a lock.
 *
 * - the HOST (`workerHost`) serves one request at a time in the order received, answers a synchronous operation
 *   inside its own message, sends parts and progress, lets a yielding operation hear that a newer request waits,
 *   drops a request that has not started, and reports the units of each job;
 * - the CLIENT (`workerClient`) against a fake `Worker` that clones every message and delivers it later: replies by
 *   id, a stale reply dropped, cancel as terminate → checkpoint → post again what was not cancelled, a waiting request
 *   dropped without a restart, a crash, the fall back to the executor, the envelope under the lane's phase, and
 *   workers started with the page;
 * - the EXECUTORS (`workerExecutor`): the same instance charges the worker lane, the page lane charges the page, and
 *   the isolated one clones both ways, returns the other heap's units and refuses a value that does not clone;
 * - the page-lane CEILING reports an action over it and cuts nothing.
 */
import { describe, expect, it } from 'vitest';
import { createWorkerClient, SPAWN_ATTEMPTS, type WorkerLike } from '../workerClient';
import { executorByLane, isolatedExecutor, pageLaneCeiling, pageLaneExecutor, sameInstanceExecutor, type Executor } from '../workerExecutor';
import { serveWorker, type HostScope } from '../workerHost';
import { meterAction, meterWork, readWork, workLane } from '../workMeter';
import type { FromWorker, OpContext, OpTable, ToWorker } from '../workerProtocol';

const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

/** A worker's global scope, as the host sees it. */
function fakeScope() {
  const posted: FromWorker[] = [];
  const scope: HostScope = { postMessage: (m) => void posted.push(m), onmessage: null };
  return { scope, posted, send: (m: ToWorker) => scope.onmessage!({ data: m }) };
}

describe('the worker host serves a table of operations', () => {
  it('says it is ready, and answers a synchronous operation inside its own message, with the units it counted', () => {
    const { scope, posted, send } = fakeScope();
    let counted = 0;
    serveWorker({ double: (n: number) => ((counted += 7), n * 2) }, { scope, units: () => counted });
    expect(posted).toEqual([{ t: 'ready' }]);
    send({ t: 'run', id: 1, op: 'double', args: 21 });
    expect(posted[1]).toEqual({ t: 'done', id: 1, value: 42, units: 7 });
  });

  it('an operation that throws, and one the table does not have, are the request’s error', () => {
    const { scope, posted, send } = fakeScope();
    serveWorker(
      {
        bad: () => {
          throw new Error('no such figure');
        },
      },
      { scope, units: () => 0 },
    );
    send({ t: 'run', id: 1, op: 'bad', args: null });
    send({ t: 'run', id: 2, op: 'missing', args: null });
    expect(posted.slice(1)).toEqual([
      { t: 'error', id: 1, message: 'no such figure', units: 0 },
      { t: 'error', id: 2, message: 'unknown operation: missing', units: 0 },
    ]);
  });

  it('parts and progress go out before the value, each part with the units since the last message', () => {
    const { scope, posted, send } = fakeScope();
    let counted = 0;
    serveWorker(
      {
        staged: (_: unknown, ctx: OpContext) => {
          counted += 3;
          ctx.progress(1, 2);
          ctx.part('figure', { rows: 2 });
          counted += 5;
          return 'values';
        },
      },
      { scope, units: () => counted },
    );
    send({ t: 'run', id: 9, op: 'staged', args: null });
    expect(posted.slice(1)).toEqual([
      { t: 'progress', id: 9, k: 1, n: 2 },
      { t: 'part', id: 9, name: 'figure', value: { rows: 2 }, units: 3 },
      { t: 'done', id: 9, value: 'values', units: 5 },
    ]);
  });

  it('one request at a time: a yielding operation hears that a newer one waits, and the newer one runs after it', async () => {
    const { scope, posted, send } = fakeScope();
    const order: string[] = [];
    serveWorker(
      {
        pool: async (_: unknown, ctx: OpContext) => {
          order.push('pool starts');
          const first = await ctx.tick();
          const second = await ctx.tick();
          order.push(`pool heard ${first} then ${second}`);
          return 'pool';
        },
        quick: () => (order.push('quick runs'), 'quick'),
      },
      { scope, units: () => 0 },
    );
    send({ t: 'run', id: 1, op: 'pool', args: null });
    await macrotask(); // the first tick: nothing waits
    send({ t: 'run', id: 2, op: 'quick', args: null });
    await macrotask();
    await macrotask();
    await settle();
    expect(order).toEqual(['pool starts', 'pool heard false then true', 'quick runs']);
    expect(posted.slice(1).map((m) => (m.t === 'done' ? m.value : m.t))).toEqual(['pool', 'quick']);
  });

  it('a request dropped before it started never runs; the checkpoint is taken, and one that throws is ignored', async () => {
    const { scope, posted, send } = fakeScope();
    const ran: number[] = [];
    const seeds: unknown[] = [];
    serveWorker(
      { slow: async (n: number, ctx: OpContext) => (await ctx.tick(), ran.push(n), n) },
      {
        scope,
        units: () => 0,
        seed: (args) => {
          seeds.push(args);
          if (args === 'broken') throw new Error('cannot take it');
        },
      },
    );
    send({ t: 'seed', args: { fold: 1 } });
    send({ t: 'seed', args: 'broken' });
    send({ t: 'run', id: 1, op: 'slow', args: 1 });
    send({ t: 'run', id: 2, op: 'slow', args: 2 });
    send({ t: 'run', id: 3, op: 'slow', args: 3 });
    send({ t: 'drop', id: 2 });
    for (let i = 0; i < 4; i++) await macrotask();
    await settle();
    expect(seeds).toEqual([{ fold: 1 }, 'broken']);
    expect(ran).toEqual([1, 3]);
    expect(posted.filter((m) => m.t === 'done').map((m) => (m as { id: number }).id)).toEqual([1, 3]);
  });

  it('a value that does not clone is the request’s error, said by name', () => {
    const posted: FromWorker[] = [];
    const scope: HostScope = { postMessage: (m) => void posted.push(structuredClone(m)), onmessage: null };
    serveWorker({ leaky: () => ({ set: () => 1 }) }, { scope, units: () => 0 });
    scope.onmessage!({ data: { t: 'run', id: 4, op: 'leaky', args: null } });
    const answer = posted[posted.length - 1] as Extract<FromWorker, { t: 'error' }>;
    expect(answer.t).toBe('error');
    expect(answer.message).toMatch(/could not be cloned/);
  });
});

/**
 * A `Worker` as a browser gives one: its own heap behind `structuredClone`, messages delivered in a later task, and
 * `terminate` that silences it. Each fake serves `ops` through the real host, so the client is tested against the
 * real other half. `hold()` stops the fake's deliveries until `release()`, for a request that is still running.
 */
function fakeWorkers(ops: OpTable, options: { unitsPerJob?: number; crashBeforeReady?: () => boolean } = {}) {
  const spawned: FakeWorker[] = [];
  interface FakeWorker extends WorkerLike {
    alive: boolean;
    received: ToWorker[];
    crash(): void;
  }
  let held = false;
  let backlog: (() => void)[] = [];
  const later = (deliver: () => void): void => {
    void Promise.resolve().then(() => {
      if (held) backlog.push(deliver);
      else deliver();
    });
  };
  const spawn = (): WorkerLike => {
    let counted = 0;
    const worker: FakeWorker = {
      alive: true,
      received: [],
      onmessage: null,
      onerror: null,
      postMessage(message) {
        const got = structuredClone(message);
        worker.received.push(got);
        later(() => {
          if (!worker.alive) return;
          scope.onmessage?.({ data: got });
        });
      },
      terminate() {
        worker.alive = false;
      },
      crash() {
        worker.onerror?.(new Error('boom'));
      },
    };
    const scope: HostScope = {
      onmessage: null,
      postMessage: (m) => {
        const out = structuredClone(m);
        later(() => {
          if (worker.alive) worker.onmessage?.({ data: out });
        });
      },
    };
    spawned.push(worker);
    if (options.crashBeforeReady?.()) later(() => worker.crash());
    else {
      // this heap's own meter: every operation it runs counts `unitsPerJob`
      const counting: OpTable = Object.fromEntries(Object.entries(ops).map(([name, op]) => [name, (args: unknown, ctx: OpContext) => ((counted += options.unitsPerJob ?? 0), op(args, ctx))]));
      serveWorker(counting, { scope, units: () => counted, seed: (args) => void worker.received.push({ t: 'seed', args: { taken: args } }) });
    }
    return worker;
  };
  return {
    spawn,
    spawned,
    hold: () => void (held = true),
    release: async () => {
      held = false;
      const now = backlog;
      backlog = [];
      for (const deliver of now) deliver();
      await settle();
    },
  };
}

const never: Executor = {
  run: () => Promise.reject(new Error('the executor must not be reached while a worker serves the lane')),
};

describe('the worker client, against a worker that clones and answers later', () => {
  const ops = {
    add: ({ a, b }: { a: number; b: number }) => a + b,
    staged: (_: null, ctx: OpContext) => (ctx.progress(1, 3), ctx.part('figure', 'drawn'), 'settled'),
    echo: (x: unknown) => x,
    fail: () => {
      throw new Error('refused');
    },
  };
  type Ops = typeof ops;

  it('start() spawns every lane with the page; a request is answered by its id, with parts and progress', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true }, detect: { spawn: fake.spawn, prePaint: false } }, executor: never, workers: () => true, meter: () => {} });
    expect(fake.spawned).toHaveLength(0);
    client.start();
    client.start(); // idempotent
    expect(fake.spawned).toHaveLength(2);
    expect(client.remote('interactive')).toBe(true);
    const heard: unknown[] = [];
    const [sum, staged] = await Promise.all([
      client.run('interactive', 'add', { a: 2, b: 3 }),
      client.run('interactive', 'staged', null, { onProgress: (k, n) => heard.push([k, n]), onPart: (name, value) => heard.push([name, value]) }),
    ]);
    expect(sum).toBe(5);
    expect(staged).toBe('settled');
    expect(heard).toEqual([[1, 3], ['figure', 'drawn']]);
    expect(fake.spawned).toHaveLength(2); // no worker was spawned for the requests: they were there
  });

  it('what crosses is a clone, and an operation’s error rejects the request with its message', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: never, workers: () => true, meter: () => {} });
    const sent = { facts: [{ id: 'a' }] };
    const back = (await client.run('interactive', 'echo', sent)) as typeof sent;
    expect(back).toEqual(sent);
    expect(back).not.toBe(sent);
    expect(back.facts[0]).not.toBe(sent.facts[0]);
    await expect(client.run('interactive', 'fail', undefined as never)).rejects.toThrow('refused');
    await expect(client.run('interactive', 'echo', { set: () => 1 })).rejects.toThrow(/could not be cloned/);
  });

  it('the envelope: a worker’s units reach the meter under the LANE’s phase', async () => {
    const fake = fakeWorkers(ops, { unitsPerJob: 11 });
    const metered: [number, boolean][] = [];
    const client = createWorkerClient<Ops>({
      lanes: { interactive: { spawn: fake.spawn, prePaint: true }, detect: { spawn: fake.spawn, prePaint: false } },
      executor: never,
      workers: () => true,
      meter: (units, prePaint) => metered.push([units, prePaint]),
    });
    await client.run('interactive', 'add', { a: 1, b: 1 });
    await client.run('detect', 'add', { a: 1, b: 1 });
    expect(metered).toEqual([[11, true], [11, false]]);
  });

  it('cancel of the RUNNING request terminates the worker, hands the new one the checkpoint, and posts the rest again in order', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: never, workers: () => true, meter: () => {}, seed: () => ({ fold: 'of the figure on screen' }) });
    client.start();
    await settle();
    fake.hold(); // the worker is busy: nothing it is sent is answered
    const search = client.run('interactive', 'add', { a: 1, b: 1 });
    const submit = client.run('interactive', 'add', { a: 2, b: 2 });
    const edit = client.run('interactive', 'add', { a: 3, b: 3 });
    await settle();
    client.cancel('interactive', (request) => (request.args as { a: number }).a === 1);
    await expect(search).rejects.toMatchObject({ cancelled: true });
    expect(client.isCancelled(await search.catch((e) => e))).toBe(true);
    const [first, second] = fake.spawned;
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(true);
    await fake.release();
    expect(await submit).toBe(4);
    expect(await edit).toBe(6);
    // the new worker was handed the checkpoint FIRST, then the two requests that were not cancelled, in order
    expect(second.received.filter((m) => m.t !== 'seed' || 'taken' in (m.args as object) === false).map((m) => (m.t === 'run' ? (m.args as { a: number }).a : m.t))).toEqual(['seed', 2, 3]);
  });

  it('cancel of a request that is only WAITING drops it by message: the worker lives and keeps its caches', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: never, workers: () => true, meter: () => {} });
    client.start();
    await settle();
    fake.hold();
    const running = client.run('interactive', 'add', { a: 1, b: 1 });
    const waiting = client.run('interactive', 'add', { a: 2, b: 2 });
    await settle();
    client.cancel('interactive', (request) => (request.args as { a: number }).a === 2);
    await expect(waiting).rejects.toMatchObject({ cancelled: true });
    await fake.release();
    expect(await running).toBe(2);
    expect(fake.spawned).toHaveLength(1);
    expect(fake.spawned[0].alive).toBe(true);
    expect(fake.spawned[0].received.some((m) => m.t === 'drop')).toBe(true);
  });

  it('cancel with nothing in flight does nothing, and a terminated worker’s late reply is not heard', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: never, workers: () => true, meter: () => {} });
    client.start();
    client.cancel('interactive');
    expect(fake.spawned).toHaveLength(1);
    fake.hold();
    const lost = client.run('interactive', 'add', { a: 1, b: 1 });
    await settle();
    client.cancel('interactive');
    await expect(lost).rejects.toMatchObject({ cancelled: true });
    await fake.release();
    expect(await client.run('interactive', 'add', { a: 5, b: 5 })).toBe(10);
  });

  it('a crash rejects the running request, restarts the worker and posts the waiting ones again', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: never, workers: () => true, meter: () => {} });
    client.start();
    await settle();
    fake.hold();
    const running = client.run('interactive', 'add', { a: 1, b: 1 });
    const waiting = client.run('interactive', 'add', { a: 2, b: 2 });
    await settle();
    (fake.spawned[0] as unknown as { crash(): void }).crash();
    await expect(running).rejects.toThrow('worker crashed');
    await fake.release();
    expect(await waiting).toBe(4);
    expect(fake.spawned).toHaveLength(2);
  });

  it(`a lane whose worker fails ${SPAWN_ATTEMPTS} times before it is ever ready is served by the executor from then on`, async () => {
    const fake = fakeWorkers(ops, { crashBeforeReady: () => true });
    const served: string[] = [];
    const executor: Executor = { run: async (lane, op, args) => (served.push(`${lane}:${op}`), (args as { a: number; b: number }).a + (args as { a: number; b: number }).b) };
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor, workers: () => true, meter: () => {} });
    const first = client.run('interactive', 'add', { a: 1, b: 1 });
    const second = client.run('interactive', 'add', { a: 2, b: 2 });
    await settle();
    await settle();
    // a worker that never served has run nothing: no request is lost, and the executor answers them all
    expect(await first).toBe(2);
    expect(await second).toBe(4);
    expect(fake.spawned).toHaveLength(SPAWN_ATTEMPTS);
    expect(client.remote('interactive')).toBe(false);
    expect(await client.run('interactive', 'add', { a: 3, b: 3 })).toBe(6);
    expect(served).toEqual(['interactive:add', 'interactive:add', 'interactive:add']);
    expect(fake.spawned).toHaveLength(SPAWN_ATTEMPTS); // it stopped spawning
  });

  it('with no workers (node, the suites) every request goes to the executor and nothing is spawned', async () => {
    const fake = fakeWorkers(ops);
    const client = createWorkerClient<Ops>({ lanes: { interactive: { spawn: fake.spawn, prePaint: true } }, executor: sameInstanceExecutor(ops), workers: () => false });
    client.start();
    expect(client.remote('interactive')).toBe(false);
    expect(await client.run('interactive', 'add', { a: 20, b: 22 })).toBe(42);
    client.cancel('interactive'); // nothing to terminate
    expect(fake.spawned).toHaveLength(0);
  });
});

describe('the executors: the same operations where there is no Worker', () => {
  const lanes: string[] = [];
  const ops = {
    solve: (n: number) => {
      lanes.push(workLane());
      meterWork(n);
      return { solved: n };
    },
    yielding: async (n: number, ctx: OpContext) => {
      meterWork(n);
      const newer = await ctx.tick();
      lanes.push(workLane());
      meterWork(n);
      return newer;
    },
    throws: () => {
      throw new Error('cannot hold');
    },
    leaky: () => ({ set: () => 1 }),
  };

  it('the same instance: charged to the WORKER lane, by reference, and the page lane is back afterwards (a throw included)', async () => {
    const ex = sameInstanceExecutor(ops);
    lanes.length = 0;
    const m = meterAction();
    const out = (await ex.run('interactive', 'solve', 5)) as { solved: number };
    await expect(ex.run('interactive', 'throws', null)).rejects.toThrow('cannot hold');
    expect(workLane()).toBe('page');
    expect(await ex.run('interactive', 'yielding', 2)).toBe(false); // nothing newer can be waiting in process
    expect(workLane()).toBe('page');
    expect(m.end()).toEqual({ total: 9, page: 0, prePaint: 9 });
    expect(out).toEqual({ solved: 5 });
    expect(lanes).toEqual(['worker', 'worker']);
    await expect(ex.run('interactive', 'missing', null)).rejects.toThrow('unknown operation: missing');
  });

  it('the page lane: the same call, charged to the page', async () => {
    const ex = pageLaneExecutor(ops);
    lanes.length = 0;
    const m = meterAction();
    await ex.run('page', 'solve', 4);
    await expect(ex.run('page', 'throws', null)).rejects.toThrow('cannot hold');
    expect(m.end()).toEqual({ total: 4, page: 4, prePaint: 4 });
    expect(lanes).toEqual(['page']);
  });

  it('isolated: arguments and values are clones, the other heap’s units come back in the envelope, and a value that does not clone is refused', async () => {
    // "the other heap": an op table with its own counter, as a second module instance has its own meter
    let theirs = 0;
    const seen: unknown[] = [];
    const other = {
      solve: (figure: { facts: string[] }) => {
        seen.push(figure);
        theirs += 13;
        return { figure };
      },
      staged: (_: null, ctx: OpContext) => ((theirs += 2), ctx.part('figure', { drawn: true }), (theirs += 3), 'values'),
      leaky: () => ({ set: () => 1 }),
      throws: () => {
        throw new TypeError('cannot hold');
      },
    };
    const seeds: unknown[] = [];
    const ex = isolatedExecutor(other, { units: () => theirs, seed: (args) => seeds.push(args) });
    const units: number[] = [];
    const figure = { facts: ['a'] };
    const before = readWork();
    const out = (await ex.run('interactive', 'solve', figure, { onUnits: (u) => units.push(u) })) as { figure: typeof figure };
    expect(seen[0]).toEqual(figure);
    expect(seen[0]).not.toBe(figure); // the operation got a clone
    expect(out.figure).toEqual(figure);
    expect(out.figure).not.toBe(seen[0]); // and so did the caller
    expect(units).toEqual([13]);
    expect(readWork()).toEqual(before); // nothing was charged to THIS heap's meter by the executor itself
    const parts: unknown[] = [];
    expect(await ex.run('interactive', 'staged', null, { onUnits: (u) => units.push(u), onPart: (name, value) => parts.push([name, value]) })).toBe('values');
    expect(units).toEqual([13, 2, 3]);
    expect(parts).toEqual([['figure', { drawn: true }]]);
    await expect(ex.run('interactive', 'leaky', null)).rejects.toThrow(/could not be cloned/);
    await expect(ex.run('interactive', 'solve', { set: () => 1 })).rejects.toThrow(/could not be cloned/);
    const crossed = await ex.run('interactive', 'throws', null).catch((e: unknown) => e);
    expect(crossed).toBeInstanceOf(Error);
    expect(crossed).not.toBeInstanceOf(TypeError); // only the message crosses a real boundary
    expect((crossed as Error).message).toBe('cannot hold');
    const checkpoint = { fold: { cur: 1 } };
    ex.seed!('interactive', checkpoint);
    expect(seeds).toEqual([checkpoint]);
    expect(seeds[0]).not.toBe(checkpoint);
  });

  it('one executor per lane: each lane is its own heap, and an unknown lane is said by name', async () => {
    const ex = executorByLane({ interactive: pageLaneExecutor({ which: () => 'interactive' }), detect: pageLaneExecutor({ which: () => 'detect' }) });
    expect(await ex.run('interactive', 'which', null)).toBe('interactive');
    expect(await ex.run('detect', 'which', null)).toBe('detect');
    expect(() => ex.run('model', 'which', null)).toThrow('no executor for the lane «model»');
  });
});

describe('the page-lane work ceiling is a span of one action', () => {
  it('reports an action over the ceiling, with its lane and its count, and says nothing of one at or under it', () => {
    let page = 0;
    const over: unknown[] = [];
    const span = pageLaneCeiling({ ceiling: 256, units: () => page, onOver: (o) => over.push(o) });
    const light = span({ lane: 'interactive' });
    page += 256;
    light();
    expect(over).toEqual([]);
    const heavy = span({ lane: 'another' });
    page += 257;
    heavy();
    expect(over).toEqual([{ lane: 'another', units: 257, ceiling: 256 }]);
  });

  it('by default it reads the PAGE lane of the work meter, so a worker’s units never count against it', async () => {
    const over: unknown[] = [];
    const span = pageLaneCeiling({ ceiling: 3, onOver: (o) => over.push(o) });
    const end = span({ lane: 'interactive' });
    await sameInstanceExecutor({ solve: () => meterWork(100) }).run('interactive', 'solve', null);
    meterWork(3);
    end();
    expect(over).toEqual([]);
    const second = span({ lane: 'interactive' });
    meterWork(4);
    second();
    expect(over).toEqual([{ lane: 'interactive', units: 4, ceiling: 3 }]);
  });
});
