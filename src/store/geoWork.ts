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
  searchResample,
  findValidConfig,
  meetsRequirements,
  replay,
  getFoldFor,
  type Fact,
  type FoldNode,
} from './geoStore';
import type { GeoWorkResponse, ResampleDone, AutoResolveDone, PrefoldDone } from './geoWorker';

type Pending = {
  resolve: (done: ResampleDone | AutoResolveDone | PrefoldDone) => void;
  reject: (err: Error & { cancelled?: boolean }) => void;
  onProgress?: (k: number, n: number) => void;
};

const hasWorker = typeof Worker !== 'undefined' && typeof document !== 'undefined';
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./geoWorker.ts', import.meta.url), { type: 'module' });
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
    // a worker crash rejects everything in flight; the next call respawns
    const err = new Error('geometry worker crashed');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Kill the in-flight work (terminate + respawn-on-demand). In-flight promises reject `{cancelled}`. */
export function cancelGeoWork(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  const err = Object.assign(new Error('cancelled'), { cancelled: true });
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

/** True when the error is a deliberate `cancelGeoWork` — callers go quiet, never surface it. */
export const isCancelled = (err: unknown): boolean => Boolean((err as { cancelled?: boolean })?.cancelled);

function call(
  op: 'resample' | 'autoResolve' | 'prefold',
  facts: Fact[],
  seed: number,
  onProgress?: (k: number, n: number) => void,
): Promise<ResampleDone | AutoResolveDone | PrefoldDone> {
  if (!hasWorker) {
    // synchronous fallback — the same functions, same semantics, main thread (tests / no-Worker envs)
    try {
      if (op === 'resample') return Promise.resolve({ op, seed: searchResample(facts, seed, onProgress) });
      if (op === 'autoResolve') {
        if (meetsRequirements(facts, seed)) return Promise.resolve({ op, ok: true } as AutoResolveDone);
        const found = findValidConfig(facts, 0);
        return Promise.resolve({ op, found: found ? { ...found, fold: null } : null } as AutoResolveDone);
      }
      replay(facts, seed);
      return Promise.resolve({ op: 'prefold', fold: getFoldFor(facts) } as PrefoldDone);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    ensureWorker().postMessage({ id, op, facts, seed });
  });
}

export const geoWork = {
  /** The "show another configuration" search, off-thread. Resolves the found seed or null. */
  async resample(facts: Fact[], seed: number, onProgress?: (k: number, n: number) => void): Promise<number | null> {
    const done = (await call('resample', facts, seed, onProgress)) as ResampleDone;
    return done.seed;
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
};
