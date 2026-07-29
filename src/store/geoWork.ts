/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the geometry-worker CLIENT. The App calls these instead
 * of running the heavy searches on the main thread; each call is a worker transaction with a request id,
 * stale-result protection (responses for unknown ids are dropped), and CANCELLATION by termination
 * (`cancelGeoWork` kills + respawns the worker — the only true preemption JS offers; in-flight promises
 * reject with `{ cancelled: true }` so callers go quiet instead of erroring).
 *
 * Environments WITHOUT `Worker` (vitest / node / old browsers) fall back to running the SAME functions
 * synchronously — semantics identical, only the threading differs — so the whole test suite and the
 * scenario harness keep driving the store exactly as before.
 */
import {
  searchAnotherView,
  findValidConfig,
  meetsRequirements,
  replay,
  getFoldFor,
  detectAll,
  computeValues,
  type DetectAllResult,
  type Fact,
  type FoldNode,
} from '@/replay/core';
import type { GeoWorkResponse, ResampleDone, AutoResolveDone, PrefoldDone, DetectDone, ValuesDone } from './geoWorker';

type Done = ResampleDone | AutoResolveDone | PrefoldDone | DetectDone | ValuesDone;
type Pending = {
  resolve: (done: Done) => void;
  reject: (err: Error & { cancelled?: boolean }) => void;
  onProgress?: (k: number, n: number) => void;
};

/**
 * Two LANES, each its own worker instance ([ADR-401](docs/06-decisions.md#adr-401)). A worker runs one
 * message at a time, and since #228 the crossing detection is ALWAYS-ON (it re-runs after every step) —
 * so a single shared worker would put a multi-second sample sweep in front of every user-initiated
 * search, converting the main-thread freeze this fixes into a queueing delay. `interactive` carries what
 * the student is waiting for (resample / autoResolve / prefold); `detect` carries the background layers,
 * and superseding it is free (terminate the detect worker only — the interactive lane keeps its caches).
 */
type Lane = 'interactive' | 'detect';
const LANE_OF: Record<'resample' | 'autoResolve' | 'prefold' | 'detect' | 'values', Lane> = {
  resample: 'interactive',
  autoResolve: 'interactive',
  prefold: 'interactive',
  detect: 'detect',
  values: 'detect', // #217: same background lane — rides the same memoized pool
};

const hasWorker = typeof Worker !== 'undefined' && typeof document !== 'undefined';
const workers: Record<Lane, Worker | null> = { interactive: null, detect: null };
let nextId = 1;
const pending = new Map<number, Pending & { lane: Lane }>();

function ensureWorker(lane: Lane): Worker {
  const existing = workers[lane];
  if (existing) return existing;
  const worker = new Worker(new URL('./geoWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<GeoWorkResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return; // stale — superseded or cancelled
    if ('progress' in msg) {
      p.onProgress?.(msg.progress.k, msg.progress.n);
      return;
    }
    pending.delete(msg.id);
    if ('error' in msg) p.reject(new Error(msg.error));
    else p.resolve(msg.done);
  };
  worker.onerror = () => {
    // a worker crash rejects everything in flight on ITS lane; the next call respawns
    const err = new Error('geometry worker crashed');
    for (const [id, p] of [...pending]) {
      if (p.lane !== lane) continue;
      p.reject(err);
      pending.delete(id);
    }
    workers[lane]?.terminate();
    workers[lane] = null;
  };
  workers[lane] = worker;
  return worker;
}

/** Kill a lane's in-flight work (terminate + respawn-on-demand). Its promises reject `{cancelled}`. */
function cancelLane(lane: Lane): void {
  if (workers[lane]) {
    workers[lane]!.terminate();
    workers[lane] = null;
  }
  const err = Object.assign(new Error('cancelled'), { cancelled: true });
  for (const [id, p] of [...pending]) {
    if (p.lane !== lane) continue;
    p.reject(err);
    pending.delete(id);
  }
}

/** Kill the in-flight work the STUDENT is waiting on (the ✕ cancel button) — the interactive lane. The
 *  background detection lane is left alone: nothing is waiting on it, and killing it would only throw
 *  away a sweep the next step has to pay for again. */
export function cancelGeoWork(): void {
  cancelLane('interactive');
}

/** True when the error is a deliberate `cancelGeoWork` — callers go quiet, never surface it. */
export const isCancelled = (err: unknown): boolean => Boolean((err as { cancelled?: boolean })?.cancelled);

function call(
  op: 'resample' | 'autoResolve' | 'prefold' | 'detect' | 'values',
  facts: Fact[],
  seed: number,
  onProgress?: (k: number, n: number) => void,
): Promise<Done> {
  if (!hasWorker) {
    // synchronous fallback — the same functions, same semantics, main thread (tests / no-Worker envs)
    try {
      if (op === 'resample') return Promise.resolve({ op, found: searchAnotherView(facts, seed, onProgress) });
      if (op === 'autoResolve') {
        if (meetsRequirements(facts, seed)) return Promise.resolve({ op, ok: true } as AutoResolveDone);
        const found = findValidConfig(facts, 0);
        return Promise.resolve({ op, found: found ? { ...found, fold: null } : null } as AutoResolveDone);
      }
      if (op === 'detect') return Promise.resolve({ op, result: detectAll(facts) });
      if (op === 'values') return Promise.resolve({ op, result: computeValues(facts) });
      replay(facts, seed);
      return Promise.resolve({ op: 'prefold', fold: getFoldFor(facts) } as PrefoldDone);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  const id = nextId++;
  const lane = LANE_OF[op];
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, lane });
    ensureWorker(lane).postMessage({ id, op, facts, seed });
  });
}

export const geoWork = {
  /** The "show another configuration" search, off-thread. Resolves the validated COMPOSITE view —
   *  facts (possibly carrying a branch/variant step) + seed — or null (ADR-340, #175). */
  async resample(facts: Fact[], seed: number, onProgress?: (k: number, n: number) => void): Promise<{ facts: Fact[]; seed: number } | null> {
    const done = (await call('resample', facts, seed, onProgress)) as ResampleDone;
    return done.found;
  },
  /** The post-commit config search. `'ok'` = already valid; `null` = nothing found in budget. */
  async autoResolve(
    facts: Fact[],
    seed: number,
  ): Promise<'ok' | { facts: Fact[]; seed: number; fold: FoldNode | null } | null> {
    const done = (await call('autoResolve', facts, seed)) as AutoResolveDone;
    if ('ok' in done) return 'ok';
    return done.found;
  },
  /** Warm the fold for a fact-list's content off-thread; returns the node for `primeFoldFor`. */
  async prefold(facts: Fact[], seed: number): Promise<FoldNode | null> {
    const done = (await call('prefold', facts, seed)) as PrefoldDone;
    return done.fold;
  },
  /**
   * All three detection layers' verdicts from ONE off-thread sample sweep (#157 / ADR-401).
   *
   * The three store actions (`viewRelations`, `detectShapes`, `detectCrossings`) fire independently —
   * two behind toggles, one after every step — so the in-flight promise is SHARED per fact list: three
   * callers on the same figure cost one sweep, which is the M3 law expressed at the thread boundary.
   * A sweep for superseded content is killed rather than awaited: nothing displays it, and the next
   * step would otherwise queue behind its full budget.
   */
  detect(facts: Fact[]): Promise<DetectAllResult> {
    if (detectInFlight?.facts === facts) return detectInFlight.promise;
    if (detectInFlight) cancelLane('detect'); // superseded — its figure is no longer on screen
    const promise = call('detect', facts, 0)
      .then((done) => (done as DetectDone).result)
      .finally(() => {
        if (detectInFlight?.promise === promise) detectInFlight = null;
      });
    detectInFlight = { facts, promise };
    return promise;
  },
};

let detectInFlight: { facts: Fact[]; promise: Promise<DetectAllResult> } | null = null;

/** #217: the values-panel rows, off-thread on user request; shares the detect lane + pool memo. */
export function geoValues(facts: Fact[]): Promise<import('@/engine/valuesPanel').ValuesPanelResult> {
  return call('values', facts, 0).then((done) => (done as ValuesDone).result);
}
