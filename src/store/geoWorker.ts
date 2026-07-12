/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the geometry WORKER entry. Runs the heavy, pure
 * computations OFF the main thread so the tab never blocks (Chrome's "page unresponsive" class):
 *   - `resample`  — the "show another configuration" seed search (progress-reporting),
 *   - `autoResolve` — the post-commit config search (`findValidConfig`),
 *   - `prefold`   — warm the seed-independent FOLD for a fact-list's content, returned for the main
 *                   thread to transplant into its own cache (`primeFoldFor`), after which every
 *                   main-thread replay of that content runs at tail speed.
 *
 * The worker imports the SAME store module (zustand/zundo are DOM-free); its fold/replay caches are its
 * own module instance — results cross the boundary as structured clones (FoldNode is pure data).
 * Cancellation is by TERMINATION (the client kills + respawns the worker): a JS worker can't be
 * interrupted mid-computation any other way, and a fresh worker only costs re-warming its caches.
 */
import { searchResample, findValidConfig, meetsRequirements, replay, getFoldFor, type Fact, type FoldNode } from './geoStore';

export type GeoWorkRequest =
  | { id: number; op: 'resample'; facts: Fact[]; seed: number }
  | { id: number; op: 'autoResolve'; facts: Fact[]; seed: number }
  | { id: number; op: 'prefold'; facts: Fact[]; seed: number };

export type GeoWorkResponse =
  | { id: number; progress: { k: number; n: number } }
  | { id: number; done: ResampleDone | AutoResolveDone | PrefoldDone }
  | { id: number; error: string };

export type ResampleDone = { op: 'resample'; seed: number | null };
export type AutoResolveDone =
  | { op: 'autoResolve'; ok: true }
  | { op: 'autoResolve'; found: { facts: Fact[]; seed: number; fold: FoldNode | null } | null };
export type PrefoldDone = { op: 'prefold'; fold: FoldNode | null };

const post = (msg: GeoWorkResponse): void => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<GeoWorkRequest>) => {
  const req = e.data;
  try {
    if (req.op === 'resample') {
      const seed = searchResample(req.facts, req.seed, (k, n) => post({ id: req.id, progress: { k, n } }));
      post({ id: req.id, done: { op: 'resample', seed } });
    } else if (req.op === 'autoResolve') {
      if (meetsRequirements(req.facts, req.seed)) {
        post({ id: req.id, done: { op: 'autoResolve', ok: true } });
        return;
      }
      const found = findValidConfig(req.facts, 0);
      if (!found) {
        post({ id: req.id, done: { op: 'autoResolve', found: null } });
        return;
      }
      // warm this worker's fold for the found content, then ship it for the main thread to transplant
      replay(found.facts, found.seed);
      post({ id: req.id, done: { op: 'autoResolve', found: { ...found, fold: getFoldFor(found.facts) } } });
    } else if (req.op === 'prefold') {
      replay(req.facts, req.seed);
      post({ id: req.id, done: { op: 'prefold', fold: getFoldFor(req.facts) } });
    }
  } catch (err) {
    post({ id: req.id, error: String((err as Error)?.message ?? err) });
  }
};
