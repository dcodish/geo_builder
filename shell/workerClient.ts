/**
 * #2890 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, phase 3) — THE WORKER CLIENT: the page's
 * half of the protocol (`workerProtocol.ts`), lifted out of 2-D's `geoWork` so every builder has the same one.
 *
 * - **A lane is one worker.** The builder names its lanes and gives each its `spawn` (the literal
 *   `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`, which a bundler has to see where the file is
 *   named) and its phase: the student waits for this lane's work (`prePaint`), or does not (background).
 * - **`start()` spawns every lane's worker with the page**, so the chunk downloads beside the page's own assets and
 *   the first action does not wait for it. A request made before a worker is ready is posted anyway: the browser
 *   holds the message until the script has run.
 * - **Cancel is termination** (ADR-W-210): a busy worker cannot hear a message. `cancel(lane, which)` rejects the
 *   requests `which` selects with `{ cancelled }`. If the one the worker is RUNNING is among them the worker is
 *   terminated and a new one spawned, handed the builder's checkpoint (`seed`), and every request that was not
 *   cancelled is posted to it again, in order. A request that had only been waiting is dropped by message and the
 *   worker keeps its caches.
 * - **A crash** of a worker that was serving rejects the request it was running and restarts the same way. A worker
 *   that crashes before it was ever ready (a blocked or missing chunk) has run nothing: every request is kept. After
 *   three such spawns in a row the lane stops spawning and its requests, the kept ones included, go to the executor,
 *   which is also what serves every request where there is no `Worker` at all (node, the suites).
 * - **The meter envelope.** The units a worker reports with `part`, `done` and `error` are joined to the page's
 *   meter under the lane's phase (`meterRemote`).
 *
 * Nothing here knows a builder, an operation's name, a field of a result or what a checkpoint holds.
 */
import { meterRemote } from './workMeter';
import type { Executor, RunHooks } from './workerExecutor';
import { cancelled, isCancelled, type ArgsOf, type FromWorker, type OpTable, type ToWorker, type ValueOf } from './workerProtocol';

/** The part of a `Worker` the client uses (a test hands a fake). */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  terminate(): void;
  // `any` on purpose: a real Worker's handlers take a MessageEvent and an ErrorEvent; the client reads only `data`.
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
}

export interface LaneSpec {
  /** Construct this lane's worker. Called at `start()`, and again after every termination. */
  spawn: () => WorkerLike;
  /** The student waits for this lane's work, so its units are before the paint. */
  prePaint: boolean;
}

export interface WorkerClientOptions {
  lanes: Record<string, LaneSpec>;
  /** What runs a request when no worker serves its lane. */
  executor: Executor;
  /** The builder's checkpoint for a fresh worker of `lane`, or null when it has none. */
  seed?: (lane: string) => unknown | null;
  /** Where the envelope's units go. Default: `shell/workMeter`'s `meterRemote`. */
  meter?: (units: number, prePaint: boolean) => void;
  /** Are there workers in this environment? Default: a `Worker` and a `document` both exist. Read at each request. */
  workers?: () => boolean;
}

/** What `cancel`'s selector is shown of a request. */
export interface PendingRequest {
  readonly op: string;
  readonly args: unknown;
}

export interface WorkerClient<Ops extends OpTable = OpTable> {
  /** Spawn every lane's worker now. Idempotent; nothing happens where there are no workers. */
  start(): void;
  run<K extends keyof Ops & string>(lane: string, op: K, args: ArgsOf<Ops[K]>, hooks?: Pick<RunHooks, 'onProgress' | 'onPart'>): Promise<ValueOf<Ops[K]>>;
  /** Reject the lane's requests `which` selects (all of them by default) as cancelled. See the file's header. */
  cancel(lane: string, which?: (request: PendingRequest) => boolean): void;
  /** True when the error is a deliberate cancel: a caller goes quiet. */
  isCancelled(err: unknown): boolean;
  /** A real worker serves this lane now (false in node, and after the lane fell back). */
  remote(lane: string): boolean;
}

interface Pending extends PendingRequest {
  id: number;
  resolve(value: unknown): void;
  reject(err: unknown): void;
  hooks?: Pick<RunHooks, 'onProgress' | 'onPart'>;
}

interface LaneState {
  worker: WorkerLike | null;
  /** Posted and not answered, oldest first: the worker runs the first. */
  posted: Pending[];
  /** Spawns in a row that never reached `ready`. */
  failed: number;
  /** The lane has stopped spawning: the executor serves it. */
  fallen: boolean;
}

/** After this many spawns in a row that never became ready, a lane is served by the executor. */
export const SPAWN_ATTEMPTS = 3;

const hasWorkers = (): boolean => typeof Worker !== 'undefined' && typeof document !== 'undefined';

export function createWorkerClient<Ops extends OpTable = OpTable>(options: WorkerClientOptions): WorkerClient<Ops> {
  const workers = options.workers ?? hasWorkers;
  const meter = options.meter ?? meterRemote;
  const states = new Map<string, LaneState>();
  let nextId = 1;

  const spec = (lane: string): LaneSpec => {
    const found = options.lanes[lane];
    if (!found) throw new Error(`no such lane: «${lane}»`);
    return found;
  };
  const stateOf = (lane: string): LaneState => {
    let state = states.get(lane);
    if (!state) states.set(lane, (state = { worker: null, posted: [], failed: 0, fallen: false }));
    return state;
  };
  const served = (lane: string): boolean => workers() && !stateOf(lane).fallen;

  const viaExecutor = (lane: string, request: PendingRequest, hooks: Pending['hooks']): Promise<unknown> =>
    options.executor.run(lane, request.op, request.args, { ...hooks, onUnits: (units) => meter(units, spec(lane).prePaint) });

  /** Post a request to the lane's worker. A request whose arguments do not clone rejects here. */
  function post(lane: string, pending: Pending): void {
    const state = stateOf(lane);
    try {
      state.worker!.postMessage({ t: 'run', id: pending.id, op: pending.op, args: pending.args });
    } catch (err) {
      state.posted = state.posted.filter((p) => p !== pending);
      pending.reject(err);
    }
  }

  function spawn(lane: string): void {
    const state = stateOf(lane);
    const worker = spec(lane).spawn();
    state.worker = worker;
    let ready = false;
    worker.onmessage = (event: { data: FromWorker }) => {
      if (state.worker !== worker) return; // a terminated worker's late message
      const message = event.data;
      if (message.t === 'ready') {
        ready = true;
        state.failed = 0;
        return;
      }
      const pending = state.posted.find((p) => p.id === message.id);
      if (!pending) return; // stale: cancelled, or answered already
      if (message.t === 'progress') {
        pending.hooks?.onProgress?.(message.k, message.n);
        return;
      }
      if (message.units) meter(message.units, spec(lane).prePaint);
      if (message.t === 'part') {
        pending.hooks?.onPart?.(message.name, message.value);
        return;
      }
      state.posted = state.posted.filter((p) => p !== pending);
      if (message.t === 'error') pending.reject(new Error(message.message));
      else pending.resolve(message.value);
    };
    worker.onerror = () => {
      if (state.worker !== worker) return;
      if (ready) {
        // the request it was running is lost with it; the ones behind are not
        const [running, ...rest] = state.posted;
        state.posted = rest;
        running?.reject(new Error('worker crashed'));
      } else {
        state.failed++; // it never served: nothing was running, and nothing is lost
      }
      restart(lane);
    };
    const checkpoint = options.seed?.(lane) ?? null;
    if (checkpoint !== null) {
      try {
        worker.postMessage({ t: 'seed', args: checkpoint });
      } catch {
        /* a checkpoint that does not clone is not sent: the worker solves for itself */
      }
    }
  }

  /** Replace the lane's worker, and give the new one (or, once the lane has fallen, the executor) what still waits. */
  function restart(lane: string): void {
    const state = stateOf(lane);
    state.worker?.terminate();
    state.worker = null;
    const waiting = state.posted;
    if (state.failed >= SPAWN_ATTEMPTS) {
      state.fallen = true;
      state.posted = [];
      for (const pending of waiting) viaExecutor(lane, pending, pending.hooks).then(pending.resolve, pending.reject);
      return;
    }
    spawn(lane);
    for (const pending of [...waiting]) post(lane, pending);
  }

  return {
    start() {
      if (!workers()) return;
      for (const lane of Object.keys(options.lanes)) if (!stateOf(lane).fallen && !stateOf(lane).worker) spawn(lane);
    },
    run(lane, op, args, hooks) {
      if (!served(lane)) return viaExecutor(lane, { op, args }, hooks) as Promise<never>;
      const state = stateOf(lane);
      if (!state.worker) spawn(lane);
      return new Promise<unknown>((resolve, reject) => {
        const pending: Pending = { id: nextId++, op, args, resolve, reject, hooks };
        state.posted.push(pending);
        post(lane, pending);
      }) as Promise<never>;
    },
    cancel(lane, which = () => true) {
      const state = stateOf(lane);
      const chosen = state.posted.filter((p) => which(p));
      if (chosen.length === 0) return;
      const running = state.posted[0];
      state.posted = state.posted.filter((p) => !chosen.includes(p));
      if (chosen.includes(running)) restart(lane);
      else for (const pending of chosen) state.worker?.postMessage({ t: 'drop', id: pending.id });
      for (const pending of chosen) pending.reject(cancelled());
    },
    isCancelled,
    remote: (lane) => served(lane),
  };
}
