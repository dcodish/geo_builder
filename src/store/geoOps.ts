/**
 * #2890 ([ADR-829](../../docs/06-decisions.md#adr-829), ADR-W-210 Am. 4) — 2-D's OPERATIONS: the heavy, pure
 * computations the geometry worker runs (#41, [ADR-290](../../docs/06-decisions.md#adr-290)), as ONE table.
 *
 * The worker entry (`geoWorker.ts`) serves this table; the client's executor (`geoWork.ts`) runs the same table where
 * there is no `Worker`; and the work-meter gate loads it a second and a third time, as a browser's two worker heaps.
 * So the three cannot drift, which they could while the worker's `onmessage` and the client's fallback each spelled
 * the five bodies out.
 *
 *   - `resample`    — the «הציגו תצורה אחרת» search (progress-reporting); the validated COMPOSITE view or null
 *                     ([ADR-340](../../docs/06-decisions.md#adr-340)).
 *   - `autoResolve` — the post-commit configuration search: `'ok'` when the view already meets its requirements,
 *                     the found view, or null when the search is exhausted.
 *   - `prefold`     — the seed-independent fold of a fact list's content, for `primeFoldFor`.
 *   - `detect`      — the detection sample sweep and all three layers' verdicts ([ADR-401](../../docs/06-decisions.md#adr-401)).
 *   - `values`      — the values-panel rows and the student's questions (#217, #477).
 *
 * Two things differ between a worker and the page's own thread, and both are this table's options, not a second
 * copy of the bodies:
 *   - `searchBudgetMs`: off the page's thread a search gets the generous budget (ADR-296); on it, the default.
 *   - `transplant`: a SEPARATE heap ships the found view's fold for the page to adopt; the page's own heap already
 *     holds it.
 */
import type { QueryInput, ValuesPanelResult } from '@/engine/valuesPanel';
import { searchAnotherView, findValidConfig, meetsRequirements, replay, getFoldFor, primeFoldFor, detectAll, computeValues, type DetectAllResult, type Fact, type FoldNode } from '@/replay/core';
import type { RowNouns } from '@/replay/narrowing';
import type { OpContext } from '../../shell/workerProtocol';

export interface GeoOpsOptions {
  /** The clock a search runs under. Absent: the page's own default (and no clock under vitest). */
  searchBudgetMs?: number;
  /** The found view's fold travels with it: the caller's heap is not this one. */
  transplant: boolean;
}

export interface Figure {
  facts: Fact[];
  seed: number;
}
/** A view the post-commit search found, with its fold when it has to cross a heap. */
export type FoundView = Figure & { fold: FoldNode | null };

export function geoOps(options: GeoOpsOptions) {
  return {
    resample: ({ facts, seed }: Figure, ctx: OpContext): Figure | null => searchAnotherView(facts, seed, (k, n) => ctx.progress(k, n), options.searchBudgetMs),
    autoResolve: ({ facts, seed }: Figure): 'ok' | FoundView | null => {
      if (meetsRequirements(facts, seed)) return 'ok';
      // #364 (ADR-510): the sweep starts from the student's CURRENT seed (M2: the view in hand is preferred)
      const found = findValidConfig(facts, seed, options.searchBudgetMs);
      if (!found) return null;
      if (!options.transplant) return { ...found, fold: null };
      // warm this heap's fold for the found content, then ship it for the page to transplant
      replay(found.facts, found.seed);
      return { ...found, fold: getFoldFor(found.facts) };
    },
    prefold: ({ facts, seed }: Figure): FoldNode | null => {
      replay(facts, seed);
      return getFoldFor(facts);
    },
    // #1996 (ADR-655): each row's stated nouns are read on the page (this heap's replay may not parse)
    detect: ({ facts, nouns }: { facts: Fact[]; nouns: RowNouns }): DetectAllResult => detectAll(facts, nouns),
    values: ({ facts, queries }: { facts: Fact[]; queries: QueryInput[] }): ValuesPanelResult => computeValues(facts, queries),
  };
}
export type GeoOps = ReturnType<typeof geoOps>;

/** What the page hands a fresh worker: the fold of the figure on screen, so the worker does not fold it again. */
export interface GeoCheckpoint {
  facts: Fact[];
  fold: FoldNode;
}
/** Take the page's checkpoint (the worker entry's `seed`). */
export function takeCheckpoint(checkpoint: unknown): void {
  const { facts, fold } = checkpoint as GeoCheckpoint;
  primeFoldFor(facts, fold);
}
