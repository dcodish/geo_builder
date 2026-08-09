/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the geometry WORKER entry. Runs the heavy, pure
 * computations OFF the main thread so the tab never blocks (Chrome's "page unresponsive" class):
 *   - `resample`  — the "show another configuration" seed search (progress-reporting),
 *   - `autoResolve` — the post-commit config search (`findValidConfig`),
 *   - `prefold`   — warm the seed-independent FOLD for a fact-list's content, returned for the main
 *                   thread to transplant into its own cache (`primeFoldFor`), after which every
 *                   main-thread replay of that content runs at tail speed.
 *   - `detect`    — the shared detection sample sweep + all three layers' verdicts ([ADR-401](docs/06-decisions.md#adr-401)).
 *
 * The worker imports the SAME store module (zustand/zundo are DOM-free); its fold/replay caches are its
 * own module instance — results cross the boundary as structured clones (FoldNode is pure data).
 * Cancellation is by TERMINATION (the client kills + respawns the worker): a JS worker can't be
 * interrupted mid-computation any other way, and a fresh worker only costs re-warming its caches.
 */
import { searchAnotherView, findValidConfig, meetsRequirements, replay, getFoldFor, detectAll, computeValues, WORKER_SEARCH_BUDGET_MS, type DetectAllResult, type Fact, type FoldNode } from '@/replay/core';
import type { QueryInput, ValuesPanelResult } from '@/engine/valuesPanel';

export type GeoWorkRequest =
  | { id: number; op: 'resample'; facts: Fact[]; seed: number }
  | { id: number; op: 'autoResolve'; facts: Fact[]; seed: number }
  | { id: number; op: 'prefold'; facts: Fact[]; seed: number }
  | { id: number; op: 'detect'; facts: Fact[]; seed: number }
  | { id: number; op: 'values'; facts: Fact[]; seed: number; queries?: QueryInput[] };

export type GeoWorkResponse =
  | { id: number; progress: { k: number; n: number } }
  | { id: number; done: ResampleDone | AutoResolveDone | PrefoldDone | DetectDone | ValuesDone }
  | { id: number; error: string };

// ADR-340 (#175): the search returns the whole validated COMPOSITE (facts may carry a branch/variant
// step), never a bare seed for the caller to mutate on top of.
export type ResampleDone = { op: 'resample'; found: { facts: Fact[]; seed: number } | null };
export type AutoResolveDone =
  | { op: 'autoResolve'; ok: true }
  | { op: 'autoResolve'; found: { facts: Fact[]; seed: number; fold: FoldNode | null } | null };
export type PrefoldDone = { op: 'prefold'; fold: FoldNode | null };
/** #157 ([ADR-401](docs/06-decisions.md#adr-401)): all three detection layers from ONE sample sweep. */
export type DetectDone = { op: 'detect'; result: DetectAllResult };
export type ValuesDone = { op: 'values'; result: ValuesPanelResult };

const post = (msg: GeoWorkResponse): void => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<GeoWorkRequest>) => {
  const req = e.data;
  try {
    if (req.op === 'resample') {
      // Off the main thread ⇒ the generous budget (issue #87): the tab can't freeze here, and the UI shows
      // progress + a ✕ cancel, so a findable "another configuration" isn't lost to the 2500ms freeze cap.
      // The COMPOSITE search (ADR-340): branch/variant steps live inside the validated candidate.
      const found = searchAnotherView(req.facts, req.seed, (k, n) => post({ id: req.id, progress: { k, n } }), WORKER_SEARCH_BUDGET_MS);
      post({ id: req.id, done: { op: 'resample', found } });
    } else if (req.op === 'autoResolve') {
      if (meetsRequirements(req.facts, req.seed)) {
        post({ id: req.id, done: { op: 'autoResolve', ok: true } });
        return;
      }
      // The post-commit search, off-thread with the generous budget — a valid config one bad seed past the
      // 2500ms cap (the CEFO figure, ~2743ms cold) is found on the first submit, not only on a warm retry.
      const found = findValidConfig(req.facts, 0, WORKER_SEARCH_BUDGET_MS);
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
    } else if (req.op === 'detect') {
      // #157: the sample sweep — the dominant per-step cost on a coupled figure — with the three
      // layers' classification done HERE, so only the small verdicts cross back (ADR-401).
      post({ id: req.id, done: { op: 'detect', result: detectAll(req.facts) } });
    } else if (req.op === 'values') {
      post({ id: req.id, done: { op: 'values', result: computeValues(req.facts, req.queries ?? []) } });
    }
  } catch (err) {
    post({ id: req.id, error: String((err as Error)?.message ?? err) });
  }
};
