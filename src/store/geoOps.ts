/**
 * #2890 ([ADR-829](../../docs/06-decisions.md#adr-829), [ADR-830](../../docs/06-decisions.md#adr-830), ADR-W-210 phase
 * 3) — 2-D's OPERATIONS: everything the page asks of the geometry, as ONE table the geometry worker serves
 * (`geoWorker.ts`), the client's executor runs where there is no `Worker` (`geoWork.ts`), and the work-meter gate loads
 * as separate module instances, as a browser's worker heaps.
 *
 * The SEARCHES (ADR-290, ADR-401): `resample`, `autoResolve`, `prefold`, `detect`, `values`.
 * THE WHOLE DECISION OF AN ACTION (ADR-830): `decide` (a typed line: parse, gates, dry run, commit), `judge` (the
 * model's answer, judged and committed), `act` (a store action: delete, toggle, the reducers), `edit` (the ✎ seam),
 * `load` (a saved figure: read, refresh, smoke replay), `audit` (its honesty audit), `settle` (a figure the page has not
 * seen solved), `dryRun`.
 *
 * HOW A DECISION RUNS IN A WORKER. The worker imports the same store module. Its copy is a SHADOW: each operation that
 * acts sets it to the page's state (the `state` argument), runs the store action or the seam exactly as the page ran
 * it, and answers with what changed (`slice`) and the SETTLED view of the figure it ended on (`settledView`, core):
 * every value the page's readers ask of that figure, forced, as plain data. The page adopts the view and puts the
 * slice in its store at its one sink (`geoStore.adopt`), checked against the figure the job started on.
 *
 * HOW IT RUNS IN THE PAGE'S OWN HEAP (`crossing: false`: node, the suites, a browser with no `Worker`). The shadow IS
 * the page's store, already at that state: the operation acts on it directly, exactly as the seam always did, and
 * answers `applied: true` with nothing to adopt. So every existing test drives the same code it always drove.
 *
 * Two things differ between the heaps, and both are this table's options, never a second copy of a body:
 *   - `searchBudgetMs`: off the page's thread a search gets the generous budget (ADR-296); on it, the default.
 *   - `crossing`: the results cross a heap (a worker): the found view's fold travels, views arrive settled, the shadow
 *     store is set from the arguments, logs are captured for the page to send.
 */
import type { QueryInput, ValuesPanelResult } from '@/engine/valuesPanel';
import type { AnyCommand } from '@/engine';
import {
  searchAnotherView,
  findValidConfig,
  meetsRequirements,
  replay,
  getFoldFor,
  primeFoldFor,
  detectAll,
  computeValues,
  settleView,
  dryRunOutcome,
  type DetectAllResult,
  type Fact,
  type FoldNode,
  type SettledView,
} from '@/replay/core';
import type { RowNouns } from '@/replay/narrowing';
import type { OpContext } from '../../shell/workerProtocol';
import { useGeoStore } from './geoStore';
import { deserializeFigure, type FigureFile, type FigureLoadFailure } from './figureFile';
import { auditLoadedFigure, refreshLoadedFigure, type LoadAuditFinding } from './loadAudit';
import { captureLogs, captureLogsAsync } from '@/debug/sessionLog';
import { decideFromParse, type DecideView, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict, type CreatedNotice2D } from '@/app/commitLine';
import { judgeModelAnswer, type JudgeInput, type JudgeOutcome } from '@/app/llmJudge';
import { runEditCommit } from '@/app/editPipeline';

export interface GeoOpsOptions {
  /** The clock a search runs under. Absent: the page's own default (and no clock under vitest). */
  searchBudgetMs?: number;
  /** The results cross a heap (a worker). See the header. */
  crossing: boolean;
}

export interface Figure {
  facts: Fact[];
  seed: number;
}
/** A view the post-commit search found, with its fold, and settled when it crosses a heap. */
export type FoundView = Figure & { fold: FoldNode | null; settled?: SettledView | null };

/**
 * The page's store as an operation needs it: its data fields, without the panels' results (they belong to the page,
 * name the facts they were computed for, and no store action reads them).
 */
export type StoreData = Record<string, unknown>;
const PANELS = new Set(['relations', 'values', 'asks', 'asking', 'shapes', 'crossings', 'determinacy', 'narrowed']);
/** The store's data fields, as they are now (functions are its actions). */
export function storeData(): StoreData {
  const out: StoreData = {};
  for (const [k, v] of Object.entries(useGeoStore.getState())) if (typeof v !== 'function' && !PANELS.has(k)) out[k] = v;
  return out;
}

/** What an operation that acts answers. */
export interface Acted<T = unknown> {
  value: T;
  /** The operation acted on the page's own store (the same heap): nothing to adopt or set. */
  applied: boolean;
  /** The store fields the operation changed. */
  slice: StoreData;
  /** The figure the store ended on, settled (a crossing heap only, and only when the figure changed). */
  settled: SettledView | null;
  /** What the operation logged (a crossing heap only): the page sends it. */
  logs: Record<string, unknown>[];
}

/** The view a line is decided against: the page's display view, or `'replay'` when that is the replay of `(facts, seed)`. */
export type ViewArg = DecideView | 'replay';

export function geoOps(options: GeoOpsOptions) {
  const crossing = options.crossing;
  if (crossing) useGeoStore.temporal.getState().pause(); // the shadow keeps no history: undo is the page's

  /** Run `fn` on the shadow store set to `state`, and say what changed. */
  function onStore<T>(state: StoreData | undefined, fn: () => T): Acted<T> {
    if (!crossing) return { value: fn(), applied: true, slice: {}, settled: null, logs: [] };
    if (state) useGeoStore.setState({ ...state, relations: null, values: null, asks: null, asking: null, shapes: null, crossings: null, determinacy: null, narrowed: null });
    const before = useGeoStore.getState() as unknown as StoreData;
    const { value, logs } = captureLogs(fn);
    return finish(before, value, logs);
  }
  async function onStoreAsync<T>(state: StoreData, fn: () => Promise<T>): Promise<Acted<T>> {
    if (!crossing) return { value: await fn(), applied: true, slice: {}, settled: null, logs: [] };
    useGeoStore.setState({ ...state, relations: null, values: null, asks: null, asking: null, shapes: null, crossings: null, determinacy: null, narrowed: null });
    const before = useGeoStore.getState() as unknown as StoreData;
    const { value, logs } = await captureLogsAsync(fn);
    return finish(before, value, logs);
  }
  function finish<T>(before: StoreData, value: T, logs: Record<string, unknown>[]): Acted<T> {
    const after = useGeoStore.getState() as unknown as StoreData;
    const slice: StoreData = {};
    for (const [k, v] of Object.entries(after)) if (typeof v !== 'function' && v !== before[k]) slice[k] = v;
    const moved = slice.facts !== undefined || slice.seed !== undefined;
    const st = useGeoStore.getState();
    return { value, applied: false, slice, settled: moved ? settleView(st.facts, st.seed) : null, logs };
  }
  const viewOf = (v: ViewArg): DecideView => {
    if (v !== 'replay') return v;
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    return { construction: d.construction, positions: d.positions };
  };

  return {
    // ── the searches ────────────────────────────────────────────────────────────────────────────────────────────
    resample: ({ facts, seed }: Figure, ctx: OpContext): (Figure & { settled?: SettledView | null }) | null => {
      const found = searchAnotherView(facts, seed, (k, n) => ctx.progress(k, n), options.searchBudgetMs);
      // #2890 (ADR-830): the found view arrives settled, so the page draws it without folding it again
      return found && crossing ? { ...found, settled: settleView(found.facts, found.seed) } : found;
    },
    autoResolve: ({ facts, seed }: Figure): 'ok' | FoundView | null => {
      if (meetsRequirements(facts, seed)) return 'ok';
      // #364 (ADR-510): the sweep starts from the student's CURRENT seed (M2: the view in hand is preferred)
      const found = findValidConfig(facts, seed, options.searchBudgetMs);
      if (!found) return null;
      if (!crossing) return { ...found, fold: null };
      const settled = settleView(found.facts, found.seed);
      return { ...found, fold: settled.fold, settled };
    },
    prefold: ({ facts, seed }: Figure): FoldNode | null => {
      replay(facts, seed);
      return getFoldFor(facts);
    },
    // #1996 (ADR-655): each row's stated nouns are read on the page (this heap's replay may not parse). #2890 (ADR-830):
    // the fold of the figure, which the page holds, is handed with it, so the sweep does not fold it again.
    detect: ({ facts, nouns, fold }: { facts: Fact[]; nouns: RowNouns; fold?: FoldNode | null }): DetectAllResult => {
      if (crossing && fold) primeFoldFor(facts, fold);
      return detectAll(facts, nouns);
    },
    values: ({ facts, queries }: { facts: Fact[]; queries: QueryInput[] }): ValuesPanelResult => computeValues(facts, queries),

    // ── the whole decision of an action (ADR-830) ──────────────────────────────────────────────────────────────
    /** A figure the page holds no solved view of (an undo past what it adopted): settled, and nothing else. */
    settle: ({ facts, seed }: Figure): SettledView | null => (crossing ? settleView(facts, seed) : null),
    /** A store action, run on the shadow store (a reducer: delete, toggle, rename, swap, merge, a cycle chip…). */
    act: ({ state, name, args }: { state: StoreData; name: string; args: unknown[] }): Acted =>
      onStore(state, () => (useGeoStore.getState() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args)),
    /** A typed line: the deterministic decision, and its commit when it commits (ADR-588: the one place a verdict reaches the store). */
    decide: async ({ state, utterance, locale, centresShown, view }: { state: StoreData; utterance: string; locale: 'he' | 'en'; centresShown?: boolean; view: ViewArg }): Promise<Acted<{ verdict: Verdict2D; created: CreatedNotice2D | null }>> =>
      onStoreAsync(state, async () => {
        const st = useGeoStore.getState();
        const verdict = await decideFromParse({ facts: st.facts, seed: st.seed, view: viewOf(view), centresShown }, utterance, locale, {
          // #41 (ADR-290): the candidate content is folded first, and the fold primed, as the page primed the worker's
          prefold: async (trial, seed) => {
            replay(trial, seed);
            const fold = getFoldFor(trial);
            if (fold) primeFoldFor(trial, fold);
          },
        });
        const created = verdict.kind === 'commit' || verdict.kind === 'noop' ? commitVerdict(verdict, utterance) : null;
        return { verdict, created };
      }),
    /** The model's answer to a line the grammar did not build: judged by the honesty battery and committed (ADR-240). */
    judge: ({ state, input, view }: { state: StoreData; input: Omit<JudgeInput, 'view'>; view: ViewArg }): Acted<JudgeOutcome> =>
      onStore(state, () => judgeModelAnswer({ ...input, view: viewOf(view) })),
    /**
     * The ✎ edit seam, whole (`runEditCommit`): its notes are recorded as message keys (`t` returns a token the page
     * replaces with its own translation), and the post-commit search is asked for by flag, for the page to run.
     */
    edit: ({ state, key, text, centresShown }: { state: StoreData; key: string; text: string; centresShown?: boolean }): Acted<{ ok: boolean; notes: string[]; keys: [string, Record<string, unknown> | undefined][]; resolve: boolean }> =>
      onStore(state, () => {
        const keys: [string, Record<string, unknown> | undefined][] = [];
        const notes: string[] = [];
        let resolve = false;
        const ok = runEditCommit(key, text, {
          t: (k, opts) => `⁣T${keys.push([k, opts]) - 1}⁣`,
          setInputNote: (msg) => void notes.push(msg),
          resolveAfterCommit: () => void (resolve = true),
          centresShown: () => centresShown === true,
        });
        return { ok, notes, keys, resolve };
      }),
    /** A saved figure's text, read: deserialised, refreshed against today's parser, folded and smoke-replayed (ADR-232, #120). */
    load: ({ text, prefold }: { text: string; prefold: boolean }): { ok: true; file: FigureFile; refreshed: number[]; settled: SettledView | null } | { ok: false; reason: FigureLoadFailure | 'replay-failed' } => {
      const r = deserializeFigure(text);
      if (!r.ok) return { ok: false, reason: r.reason };
      const { facts, refreshed } = refreshLoadedFigure(r.file.facts);
      const file: FigureFile = { ...r.file, facts };
      try {
        if (prefold) {
          // the fold first, primed, as the page primed the worker's (ADR-290)
          replay(file.facts, file.seed);
          const fold = getFoldFor(file.facts);
          if (fold) primeFoldFor(file.facts, fold);
        }
        replay(file.facts, file.seed); // the smoke replay: a figure whose derivation throws never becomes the session
      } catch {
        return { ok: false, reason: 'replay-failed' };
      }
      return { ok: true, file, refreshed, settled: crossing ? settleView(file.facts, file.seed) : null };
    },
    /** The honesty audit of loaded rows (ADR-242). */
    audit: ({ facts }: { facts: Fact[] }): { findings: LoadAuditFinding[]; complete: boolean } => auditLoadedFigure(facts),
    dryRun: ({ facts, seed, cmds }: { facts: Fact[]; seed: number; cmds: AnyCommand[] }): { produced: boolean } => ({ produced: dryRunOutcome(facts, cmds, seed).produced }),
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
