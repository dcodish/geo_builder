/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the geometry-worker CLIENT. The App calls these instead
 * of running the heavy searches on the main thread; each call is a worker request, and CANCELLATION is by
 * termination (`cancelGeoWork` kills + respawns the worker — the only true preemption JS offers; in-flight
 * promises reject with `{ cancelled: true }` so callers go quiet instead of erroring).
 *
 * #2890 ([ADR-829](docs/06-decisions.md#adr-829), ADR-W-210 Am. 4): the transport is the shared client
 * (`shell/workerClient`): request ids, stale replies dropped, cancel as terminate → hand the new worker the page's
 * checkpoint → post again what was not cancelled, and the work-meter envelope. What stays HERE is what is 2-D's: the
 * operations (`geoOps.ts`), which lane each runs on, the checkpoint (the fold of the figure on screen), the search
 * basis (#2757), and the one shared detection sweep per fact list (#157). Both workers are started with the page
 * (`startGeoWork`), so the first line of a session does not wait for the chunk to download.
 *
 * Environments WITHOUT `Worker` (vitest / node / old browsers) run the SAME operations in-process — semantics
 * identical, only the threading differs — so the whole test suite and the scenario harness keep driving the store
 * exactly as before. Which executor does that is injectable ({@link useGeoWorkExecutor}): the work-meter gate hands
 * one that serves each lane from its own module instance, as a browser's two worker heaps are.
 */
import type { QueryInput, ValuesPanelResult } from '@/engine/valuesPanel';
import { adoptSettled, peekFoldFor, type DetectAllResult, type Fact, type FoldNode, type SettledView } from '@/replay/core';
import { createWorkerClient } from '../../shell/workerClient';
import { sameInstanceExecutor, type Executor } from '../../shell/workerExecutor';
import { geoOps, type GeoCheckpoint, type GeoOps } from './geoOps';
export type { Acted, StoreData, ViewArg } from './geoOps';
export { storeData } from './geoOps';
import { rowNouns } from './rowNouns';

/**
 * Two LANES, each its own worker instance ([ADR-401](docs/06-decisions.md#adr-401)). A worker runs one
 * message at a time, and since #228 the crossing detection is ALWAYS-ON (it re-runs after every step) —
 * so a single shared worker would put a multi-second sample sweep in front of every user-initiated
 * search, converting the main-thread freeze this fixes into a queueing delay. `interactive` carries what
 * the student is waiting for (resample / autoResolve / prefold); `detect` carries the background layers,
 * and superseding it is free (terminate the detect worker only — the interactive lane keeps its caches).
 */
type Lane = 'interactive' | 'detect';
const LANE_OF: Record<keyof GeoOps, Lane> = {
  resample: 'interactive',
  autoResolve: 'interactive',
  prefold: 'interactive',
  // #2890 (ADR-830): the whole decision of an action runs where the searches run
  settle: 'interactive',
  act: 'interactive',
  decide: 'interactive',
  judge: 'interactive',
  edit: 'interactive',
  load: 'interactive',
  audit: 'interactive',
  dryRun: 'interactive',
  detect: 'detect',
  values: 'detect', // #217: same background lane — rides the same memoized pool
};

const spawn = (): Worker => new Worker(new URL('./geoWorker.ts', import.meta.url), { type: 'module' });

/** The page's own heap serves the operations: the page's default budgets, and no fold to ship to itself. */
// Built on first use: `geoOps.ts` imports the store, which imports this module, so the table is not there yet while
// this module is evaluated (an import cycle a bundler and vitest resolve in a different order).
let inProcess: Executor | null = null;
const local = (): Executor => (inProcess ??= sameInstanceExecutor(geoOps({ crossing: false })));
let executor: Executor | null = null;

/**
 * #2757 ([ADR-812](../../docs/06-decisions.md#adr-812)) — the figure on screen as the store last reported it
 * ({@link supersedeStaleSearches} is called on every change of `(facts, seed)`). A worker spawned after a cancel or
 * a crash is handed that figure's fold (the checkpoint), so the next action resumes from it instead of folding the
 * whole figure cold in a heap that has just lost its caches.
 */
let onScreen: Fact[] | null = null;
function checkpoint(): GeoCheckpoint | null {
  if (!onScreen || onScreen.length === 0) return null;
  const fold = peekFoldFor(onScreen); // by content, whatever a budget sees: the page runs no budget
  return fold ? { facts: onScreen, fold } : null;
}

const client = createWorkerClient<GeoOps>({
  lanes: {
    interactive: { spawn, prePaint: true },
    detect: { spawn, prePaint: false },
  },
  executor: { run: (lane, op, args, hooks) => (executor ?? local()).run(lane, op, args, hooks), seed: (lane, args) => (executor ?? local()).seed?.(lane, args) },
  seed: checkpoint,
});

/**
 * #2890 (ADR-830): what the ✕ and a superseded search stop are the SEARCHES. The interactive worker also runs the whole
 * decision of a line, an edit or a delete now, and a line typed while a search runs is posted behind it: stopping the
 * search must not take that line with it. The worker is restarted only when the request it is running is a search.
 */
const SEARCHES: ReadonlySet<string> = new Set(['resample', 'autoResolve', 'prefold']);
const isSearch = (request: { op: string }): boolean => SEARCHES.has(request.op);

/** Start both workers now (the page's entry calls this), so their chunk downloads beside the page's own assets. */
export function startGeoWork(): void {
  client.start();
}

/**
 * Test seam: the executor that serves the operations where there is no `Worker`. `null` restores the default (this
 * module instance, the worker lane). The work-meter gate hands one executor per lane, each over its own module
 * instance of `geoOps`, with every message cloned.
 */
export function useGeoWorkExecutor(next: Executor | null): void {
  executor = next;
}

/** Kill the in-flight work the STUDENT is waiting on (the ✕ cancel button) — the interactive lane. The
 *  background detection lane is left alone: nothing is waiting on it, and killing it would only throw
 *  away a sweep the next step has to pay for again. */
export function cancelGeoWork(): void {
  client.cancel('interactive', isSearch);
}

/** True when the error is a deliberate `cancelGeoWork` — callers go quiet, never surface it. */
export const isCancelled = (err: unknown): boolean => client.isCancelled(err);

/**
 * #2757 ([ADR-812](../../docs/06-decisions.md#adr-812)) — the store state a configuration search was
 * computed AGAINST: the main thread's own `facts` reference (never the worker's structured clone) and
 * the seed. The store's source of truth is `(facts, seed)` (ADR-484), so this pair is the whole
 * identity of "the figure the search answered for". Every search result carries it, and
 * `applyView` applies a result only while the store still holds that exact pair.
 */
export interface ViewBasis {
  facts: Fact[];
  seed: number;
}

/** True when the store no longer holds the figure `basis` was searched for — any undo, redo, clear,
 *  edit, toggle, load or new line in between replaces the `facts` reference or the seed. */
export function isStaleBasis(basis: ViewBasis, now: { facts: Fact[]; seed: number }): boolean {
  return now.facts !== basis.facts || now.seed !== basis.seed;
}

/** The searches in flight, by the figure each answers for. A search whose figure the student has
 *  left is superseded (`supersedeStaleSearches`): its promise rejects `{ cancelled }` and the
 *  interactive worker is killed, so the student is never left waiting behind a search for a figure
 *  that is no longer on screen. */
type SearchToken = { basis: ViewBasis; superseded: boolean };
const searchesInFlight = new Set<SearchToken>();

async function searchOn<T>(basis: ViewBasis, run: () => Promise<T>): Promise<T> {
  const token: SearchToken = { basis, superseded: false };
  searchesInFlight.add(token);
  try {
    const out = await run();
    // the no-Worker fallback has nothing to terminate, so the supersede is honoured HERE — the same
    // `{ cancelled }` outcome in both modes (this module's "only the threading differs" contract)
    if (token.superseded) throw Object.assign(new Error('cancelled'), { cancelled: true });
    return out;
  } finally {
    searchesInFlight.delete(token);
  }
}

/**
 * #2757 (ADR-812): the store calls this on every change of its `(facts, seed)`. A search computed for
 * another figure is superseded: it can never be applied (`applyView` checks the basis) and nothing
 * waits on it, so its lane is freed at once. Returns true when it superseded anything.
 */
export function supersedeStaleSearches(now: { facts: Fact[]; seed: number }): boolean {
  onScreen = now.facts; // first: a worker respawned below is handed THIS figure's fold
  let any = false;
  for (const token of searchesInFlight) {
    if (token.superseded || !isStaleBasis(token.basis, now)) continue;
    token.superseded = true;
    any = true;
  }
  if (any) client.cancel('interactive', isSearch);
  return any;
}

export const geoWork = {
  /** The "show another configuration" search, off-thread. Resolves the validated COMPOSITE view —
   *  facts (possibly carrying a branch/variant step) + seed — or null (ADR-340, #175). The view
   *  carries the `basis` it was searched on (#2757). */
  async resample(
    facts: Fact[],
    seed: number,
    onProgress?: (k: number, n: number) => void,
  ): Promise<{ facts: Fact[]; seed: number; basis: ViewBasis } | null> {
    const basis = { facts, seed };
    const found = await searchOn(basis, () => client.run(LANE_OF.resample, 'resample', { facts, seed }, { onProgress }));
    if (found?.settled) adoptSettled(found.settled); // #2890 (ADR-830): drawn without folding it again
    return found ? { facts: found.facts, seed: found.seed, basis } : null;
  },
  /** The post-commit config search. `'ok'` = already valid; `null` = nothing found in budget. */
  async autoResolve(
    facts: Fact[],
    seed: number,
  ): Promise<'ok' | { facts: Fact[]; seed: number; fold: FoldNode | null; basis: ViewBasis } | null> {
    const basis = { facts, seed };
    const found = await searchOn(basis, () => client.run(LANE_OF.autoResolve, 'autoResolve', { facts, seed }));
    if (found === 'ok') return 'ok';
    if (found?.settled) adoptSettled(found.settled); // #2890 (ADR-830)
    return found ? { facts: found.facts, seed: found.seed, fold: found.fold, basis } : null;
  },
  /** Warm the fold for a fact-list's content off-thread; returns the node for `primeFoldFor`. */
  async prefold(facts: Fact[], seed: number): Promise<FoldNode | null> {
    return await client.run(LANE_OF.prefold, 'prefold', { facts, seed });
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
    if (detectInFlight) client.cancel('detect'); // superseded — its figure is no longer on screen
    const promise = client
      // #2890 (ADR-830): the page's fold of the figure goes with it, so the detect worker does not fold it again
      .run(LANE_OF.detect, 'detect', { facts, nouns: rowNouns(facts), fold: peekFoldFor(facts) })
      .then((result) => result)
      .finally(() => {
        if (detectInFlight?.promise === promise) detectInFlight = null;
      });
    detectInFlight = { facts, promise };
    return promise;
  },
};

let detectInFlight: { facts: Fact[]; promise: Promise<DetectAllResult> } | null = null;

/**
 * #2890 ([ADR-830](../../docs/06-decisions.md#adr-830)) — THE WHOLE DECISION OF AN ACTION, in the worker. Each answers
 * an `Acted` (`geoOps.ts`): what the worker changed and the settled view of the figure it ended on. The page puts it
 * in its store at the one sink ({@link applyActed}). In the page's own heap (no `Worker`) the operation acted on the
 * page's store directly and answers `applied`.
 */
export const geoJobs = {
  settle: (facts: Fact[], seed: number): Promise<SettledView | null> => client.run('interactive', 'settle', { facts, seed }),
  act: (state: import('./geoOps').StoreData, name: string, args: unknown[]) => client.run('interactive', 'act', { state, name, args }),
  decide: (args: Parameters<GeoOps['decide']>[0]) => client.run('interactive', 'decide', args),
  judge: (args: Parameters<GeoOps['judge']>[0]) => client.run('interactive', 'judge', args),
  edit: (args: Parameters<GeoOps['edit']>[0]) => client.run('interactive', 'edit', args),
  load: (text: string, prefold: boolean) => client.run('interactive', 'load', { text, prefold }),
  audit: (facts: Fact[]) => client.run('interactive', 'audit', { facts }),
  dryRun: (facts: Fact[], seed: number, cmds: import('@/engine').AnyCommand[]) => client.run('interactive', 'dryRun', { facts, seed, cmds }),
};

/** #217: the values-panel rows, off-thread on user request; shares the detect lane + pool memo.
 *  #477: the student's queries ride the SAME call, so their answers come from the same sample pool as
 *  the rows they sit beside — a second call could disagree with the list directly above it. */
export function geoValues(facts: Fact[], queries: QueryInput[] = []): Promise<ValuesPanelResult> {
  return client.run(LANE_OF.values, 'values', { facts, queries }).then((result) => result);
}
