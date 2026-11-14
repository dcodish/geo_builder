/**
 * THE 2-D ACTION DRIVER (#2873, ADR-W-210 phase 0; lifted out of `scripts/perf/2d/perf2d.ts`, #2867).
 *
 * One student action, run through the functions `App.tsx` calls, in the App's order — and measured twice in the same
 * run: the wall time of each slice (the timing harness reads these) and the work meter's three counts (the gate reads
 * these). There is one driver so the two can never describe different actions.
 *
 *   submit  = decidePreParse / decideFromParse (page; its prefold hook = the worker's `prefold`)
 *             → commitVerdict (page) → the render (page) → the resolve gate `meetsRequirements` (page)
 *             → [the worker's `autoResolve`] → the render of the found view (page)
 *   another = the worker's `resample` → applyView → the render (page)
 *   load    = loadFigureText (refresh + smoke replay page; prefold worker) → the render → the resolve → the load audit
 *   edit    = runEditCommit on the last row, to its own text (page) → the render → the resolve. The walk measures it
 *             through `editLastRow`: a session that has built the rows BEFORE the last one and not that row (#2888).
 *             The n rows it puts in the store are a CLONE (#2890): the loaded session's own array still carries its
 *             replay, keyed by the array's identity, which no clear empties, so the "unsolved" rows were served it.
 *   delete  = removeGroup of the first row (page; the seed resets) → the render. NO resolve (#2890): the App's delete
 *             is `act.removeGroup` and nothing else (`App.tsx`; a whole row's deletion is exempt from the search by a
 *             measured decision, ADR-518). This driver used to run the resolve gate and the worker's search after it,
 *             which on a figure whose first row is gone runs to its end for nothing: work no student's delete does.
 *   undo    = the store's undo of that delete (page) → the render. The earlier `(facts, seed)` comes back by
 *             reference, so the render is served by what the session already holds.
 *   toggle  = runSetGroupEnabled(the first row, off) (page; the seed resets) → the render → the resolve, as the App's
 *             tick box runs it (`App.tsx`, `editPipeline.ts`): unlike a delete, a toggle IS followed by the search.
 *   detect  = the worker's `detect` — the background sweep that follows every step, as a browser's detect worker runs
 *             it: over a STRUCTURED CLONE of the facts (what a `postMessage` delivers) and from caches that hold
 *             nothing another lane computed (its lane is a second worker instance). Nothing waits for it. It leaves
 *             the caches cold, so it is the last action that reads them (the walk's `edit` starts a new session).
 *             The clone CORRECTS a phase 0 measurement, it is not new work (ADR-827): phase 0 handed the sweep the
 *             page's own facts array, and `replay`'s memo is keyed by that array's identity and is not one of the
 *             caches cleared, so the sweep was served the page's replay of the figure and every solve behind it.
 *
 * "The render" is what App.tsx recomputes when `(facts, seed)` change: `replay`, and the readers its JSX and memos
 * call on the result. Everything up to the last render is BEFORE THE PAINT (while a resolve is pending the App
 * keeps the previous figure on screen, #573); `detect` is after it.
 *
 * THE WORKER'S OPERATIONS ARE INJECTED ({@link WorkerOps}), because the two callers need different ones. The gate
 * passes the real client, `geoWork`: under node that is its synchronous fallback, which charges the worker lane and
 * runs the searches with no clock (vitest's MODE 'test'). The timing harness passes `geoWorker.ts`'s own bodies with
 * its 12-second budget, so it times what a browser's worker runs.
 *
 * THE WORKER'S HEAPS (#2890, ADR-829). The gate hands this driver a client whose two lanes are served from their own
 * module instances, every message cloned (`shell/workerExecutor`'s isolated executor): the page, the interactive
 * worker and the detect worker are then three heaps, as in a browser, and what the page counts is what a browser's
 * page computes. Such a client says so with {@link WorkerOps.reset}, and the driver empties those heaps where a
 * session starts. Handed operations with no `reset` (the timing harness: one module instance, the worker's bodies
 * under `inWorkerLane`), a view the worker has searched is a memo hit when the page renders it, and the page count
 * is a LOWER bound on a browser's (ADR-W-210 Am. 1): that is how every count was recorded before #2890.
 */
import { decidePreParse, decideFromParse } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit, runSetGroupEnabled } from '@/app/editPipeline';
import {
  useGeoStore,
  replay,
  meetsRequirements,
  primeFoldFor,
  clearReplayCaches,
  dryRunOutcome,
  groupKey,
  configurationAxes,
  factsWaitingForLetter,
  viewUsable,
  type Fact,
} from '@/store/geoStore';
import type { FoldNode } from '@/replay/core';
import { freeDofs, freeDofCount, unstatedChoices, type AnyCommand } from '@/engine';
import { loadFigureText } from '@/store/figureLoad';
import { auditLoadedFigure } from '@/store/loadAudit';
import { serializeFigure } from '@/store/figureFile';
import { meterAction, type WorkCounts } from '../../../shell/workMeter';

export type Snap = { facts: Fact[]; seed: number };

/** What a browser runs in the geometry worker (`src/store/geoWorker.ts`), as the App's client hands it back. */
export interface WorkerOps {
  prefold(facts: Fact[], seed: number): Promise<FoldNode | null>;
  autoResolve(facts: Fact[], seed: number): Promise<'ok' | { facts: Fact[]; seed: number; fold: FoldNode | null } | null>;
  resample(facts: Fact[], seed: number): Promise<{ facts: Fact[]; seed: number } | null>;
  detect(facts: Fact[]): Promise<unknown>;
  /**
   * Present when the lanes are SEPARATE heaps (the gate's isolated client): empty every worker heap (`'all'`: a new
   * session) or the detect worker's alone (`'detect'`: its sweep starts from nothing another sweep left). Absent when
   * the operations run in the page's own module instance; the driver then clears the one heap there is.
   */
  reset?(which: 'all' | 'detect'): void;
}

/** One measured action: `*_main` / `*_worker` / `*_bg` wall-time slices in ms, the outcome, and the three counts. */
export interface ActionRecord {
  [slice: string]: unknown;
  outcome?: string;
  work: WorkCounts;
}

const now = (): number => performance.now();
const r1 = (x: number): number => Math.round(x * 10) / 10;

export interface Driver2d {
  /** The figure the driver holds (what is on screen). */
  figure(): Snap;
  /** Put a figure on screen without measuring anything, and pay what the App already paid to draw it. */
  show(s: Snap): void;
  /** A fresh session with cold caches. */
  reset(): void;
  submit(utterance: string, locale: 'he' | 'en', follow?: readonly AnyCommand[] | null): Promise<ActionRecord>;
  another(): Promise<ActionRecord>;
  /** A cold load of a saved file's text. */
  load(text: string): Promise<ActionRecord>;
  /** Edit the last row to its own text. Null when the figure has no row with text. */
  edit(): Promise<ActionRecord | null>;
  /**
   * THE METER'S `edit` (#2888, one definition for all four builders): a student who has built rows 1..n changes the
   * LAST row. A new session; rows 1..n-1 put on screen unmeasured (the render and the resolve gate, as `show` does);
   * then all n rows put in the store UNSOLVED; then the edit of the last row to its own text, measured. The rows
   * before it are solved in the session and the edited row's content is not, so this costs about what typing row n
   * costs, through the edit path. Null when the last row has no text.
   */
  editLastRow(all: Snap): Promise<ActionRecord | null>;
  /** Delete one row (the first by default). Null when the figure has fewer than two rows. */
  remove(key?: string): Promise<ActionRecord | null>;
  /** Undo the last store change (the walk: the delete before it). */
  undo(): Promise<ActionRecord>;
  /** Turn one row off (the first by default), as its tick box does. Null when the figure has fewer than two rows. */
  toggle(key?: string): Promise<ActionRecord | null>;
  /** The background sweep over `facts` (the figure on screen by default). Leaves the caches cold. */
  detect(facts?: Fact[]): Promise<ActionRecord>;
  /** What a save of the figure on screen writes. */
  saved(): string;
}

export function createDriver2d(ops: WorkerOps, opts: { searchBudgetMs?: number } = {}): Driver2d {
  let figure: Snap = { facts: [], seed: 0 };
  const budget = opts.searchBudgetMs ?? Number.POSITIVE_INFINITY;
  const setStore = (s: Snap): void => useGeoStore.setState({ facts: s.facts, seed: s.seed });
  const adopt = (): void => {
    const n = useGeoStore.getState();
    figure = { facts: n.facts, seed: n.seed };
  };

  /** What App.tsx recomputes on a new `(facts, seed)`: the derivation and the readers its render calls on it. */
  function render(s: Snap): void {
    const d = replay(s.facts, s.seed);
    if (!viewUsable(d)) return;
    configurationAxes(s.facts, d.construction);
    freeDofs(d.construction);
    freeDofCount(d.construction);
    factsWaitingForLetter(s.facts);
    unstatedChoices(s.facts.filter((f) => f.enabled && d.status[f.id] === 'ok'));
  }

  /** The render and the resolve after a commit, a load, an edit or a delete (`resolveAfterCommit`). Mutates `figure`. */
  async function settle(rec: ActionRecord, prefix: string): Promise<void> {
    let t = now();
    render(figure);
    rec[prefix + 'render_main'] = r1(now() - t);
    t = now();
    const ok = meetsRequirements(figure.facts, figure.seed);
    rec[prefix + 'check_main'] = r1(now() - t);
    if (ok) return;
    t = now();
    const found = await ops.autoResolve(figure.facts, figure.seed);
    const w = now() - t;
    rec[prefix + 'autoResolve_worker'] = r1(w);
    rec[prefix + 'autoResolve'] = found === 'ok' ? 'ok' : found ? 'found' : 'exhausted';
    if (w >= budget - 50) rec.clipped = true;
    if (found && found !== 'ok') {
      if (found.fold) primeFoldFor(found.facts, found.fold);
      figure = { facts: found.facts, seed: found.seed };
      setStore(figure);
      t = now();
      render(figure);
      rec[prefix + 'render2_main'] = r1(now() - t);
    }
  }

  function sumSlices(rec: ActionRecord): void {
    let main = 0;
    let worker = 0;
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v !== 'number' || k.startsWith('post_')) continue;
      if (k.endsWith('_main')) main += v;
      else if (k.endsWith('_worker')) worker += v;
    }
    rec.main_ms = r1(main);
    rec.worker_ms = r1(worker);
    rec.total_ms = r1(main + worker);
  }

  /** Run one action under the meter. Everything is before the paint unless the body says otherwise. */
  async function metered(body: (rec: ActionRecord, painted: () => void) => Promise<void>): Promise<ActionRecord> {
    const rec: ActionRecord = { work: { total: 0, page: 0, prePaint: 0 } };
    const m = meterAction();
    try {
      await body(rec, m.painted);
    } finally {
      rec.work = m.end();
    }
    return rec;
  }

  const viewOf = (s: Snap) => {
    const d = replay(s.facts, s.seed);
    return { construction: d.construction, positions: d.positions };
  };

  return {
    figure: () => figure,
    show(s) {
      figure = s;
      setStore(s);
      // what the App has already paid before the student acts: the render and the resolve gate
      try {
        render(s);
        meetsRequirements(s.facts, s.seed);
      } catch {
        /* a figure that cannot be drawn is still the figure on screen */
      }
    },
    reset() {
      clearReplayCaches();
      ops.reset?.('all');
      useGeoStore.setState({ facts: [], seed: 0 });
      useGeoStore.temporal.getState().clear();
      figure = { facts: [], seed: 0 };
    },
    saved: () => serializeFigure({ facts: figure.facts, seed: figure.seed }),

    submit(utterance, locale, follow) {
      return metered(async (rec) => {
        setStore(figure);
        rec.u = utterance;
        rec.nfacts = figure.facts.length;
        const view = viewOf(figure);
        let prefold = 0;
        const t0 = now();
        const pre = decidePreParse(utterance, view, false);
        let verdict = pre;
        if (pre?.kind === 'store-op') {
          const s = useGeoStore.getState();
          const res = pre.op === 'swap' ? s.swap(pre.from, pre.to) : pre.op === 'name-centre' ? s.nameCentre(pre.from, pre.to) : pre.op === 'rename' ? s.rename(pre.from, pre.to) : s.merge(pre.from, pre.to);
          rec.decide_main = r1(now() - t0);
          rec.outcome = 'store-op:' + (res.ok ? 'ok' : 'fail');
          if (res.ok) {
            adopt();
            await settle(rec, '');
          }
          sumSlices(rec);
          return;
        }
        if (!pre) {
          verdict = await decideFromParse({ facts: figure.facts, seed: figure.seed, view, centresShown: false }, utterance, locale, {
            // submitPipeline.ts's hook: the worker folds, the page adopts the fold
            prefold: async (trial, seed) => {
              const a = now();
              const fold = await ops.prefold(trial, seed);
              if (fold) primeFoldFor(trial, fold);
              prefold += now() - a;
            },
          });
        }
        const v = verdict!;
        rec.decide_main = r1(now() - t0 - prefold);
        if (prefold) rec.prefold_worker = r1(prefold);
        rec.outcome = v.kind + (v.kind === 'refuse' ? ':' + v.category : '') + (v.kind === 'escalate' ? ':' + (v.weak ?? 'nh') : '');
        if (v.kind === 'refuse' || v.kind === 'escalate') {
          const lg = v.logs.find((l) => !l.intermediate) ?? v.logs[v.logs.length - 1];
          rec.detail = String(lg?.result ?? (v.kind === 'escalate' ? v.parseReason : null) ?? '').slice(0, 120);
        }
        if (v.kind === 'commit' || v.kind === 'noop') {
          const t = now();
          commitVerdict(v, utterance);
          rec.commit_main = r1(now() - t);
          adopt();
          await settle(rec, '');
          sumSlices(rec);
          return;
        }
        sumSlices(rec);
        // not committed by the deterministic lane: follow the logged / saved commands (the post-LLM tail), timed apart
        if (follow && follow.length) {
          try {
            const t = now();
            const out = dryRunOutcome(figure.facts, follow as AnyCommand[], figure.seed);
            rec.post_dryrun_main = r1(now() - t);
            const t2 = now();
            useGeoStore.getState().executeMany(follow as AnyCommand[], utterance);
            rec.post_commit_main = r1(now() - t2);
            adopt();
            await settle(rec, 'post_');
            rec.followed = out?.produced ? 'ok' : 'not-produced';
            let pm = 0;
            let pw = 0;
            for (const [k, x] of Object.entries(rec)) {
              if (!k.startsWith('post_') || typeof x !== 'number') continue;
              if (k.endsWith('_main')) pm += x;
              else if (k.endsWith('_worker')) pw += x;
            }
            rec.post_main_ms = r1(pm);
            rec.post_worker_ms = r1(pw);
          } catch (e) {
            rec.followed = 'error:' + String((e as Error)?.message ?? e).slice(0, 80);
          }
        }
      });
    },

    another() {
      return metered(async (rec) => {
        setStore(figure);
        rec.nfacts = figure.facts.length;
        const t = now();
        const found = await ops.resample(figure.facts, figure.seed);
        const w = now() - t;
        rec.resample_worker = r1(w);
        if (w >= budget - 50) rec.clipped = true;
        rec.outcome = found ? 'changed' : 'only-config';
        if (found) {
          figure = { facts: found.facts, seed: found.seed };
          setStore(figure);
          const t2 = now();
          render(figure);
          rec.render_main = r1(now() - t2);
        }
        sumSlices(rec);
      });
    },

    load(text) {
      clearReplayCaches();
      ops.reset?.('all');
      return metered(async (rec) => {
        let pf = 0;
        const t = now();
        const out = await loadFigureText(text, {
          prefold: async (facts, seed) => {
            const a = now();
            const fold = await ops.prefold(facts, seed);
            pf += now() - a;
            return fold;
          },
        });
        rec.load_main = r1(now() - t - pf);
        rec.prefold_worker = r1(pf);
        rec.outcome = out.ok ? 'ok' : 'refused:' + out.reason;
        if (out.ok) {
          adopt();
          rec.nfacts = figure.facts.length;
          await settle(rec, '');
          // App.tsx runLoad: the honesty audit of the loaded rows (ADR-242), on the page
          const a = now();
          auditLoadedFigure(out.file.facts);
          rec.audit_main = r1(now() - a);
        }
        sumSlices(rec);
      });
    },

    async edit() {
      const last = figure.facts[figure.facts.length - 1];
      const text = last?.utterance;
      if (!last || !text) return null;
      return metered(async (rec) => {
        setStore(figure);
        rec.nfacts = figure.facts.length;
        let settling = false;
        const t = now();
        const ok = runEditCommit(groupKey(last), text, { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => void (settling = true) });
        rec.edit_main = r1(now() - t);
        rec.outcome = ok ? 'ok' : 'refused';
        if (ok) {
          adopt();
          if (settling) await settle(rec, '');
          else {
            const t2 = now();
            render(figure);
            rec.render_main = r1(now() - t2);
          }
        }
        sumSlices(rec);
      });
    },

    async editLastRow(all) {
      const last = all.facts[all.facts.length - 1];
      if (!last?.utterance) return null;
      const key = groupKey(last);
      this.reset();
      this.show({ facts: all.facts.filter((f) => groupKey(f) !== key), seed: all.seed });
      // a CLONE: the caller's array may carry a replay under its identity (the loaded session's does), which no clear
      // empties, and rows that are served a replay are not "in the store and not solved" (#2890)
      figure = structuredClone(all);
      setStore(figure); // the n rows, in the store and not solved: no render, no resolve, no audit
      return this.edit();
    },

    async remove(key) {
      const keys = [...new Set(figure.facts.map(groupKey))];
      if (keys.length < 2) return null;
      return metered(async (rec) => {
        setStore(figure);
        rec.nfacts = figure.facts.length;
        const t = now();
        useGeoStore.getState().removeGroup(key ?? keys[0]);
        rec.remove_main = r1(now() - t);
        adopt();
        // the render, and nothing after it: the App's delete runs no resolve (see the header)
        const t2 = now();
        render(figure);
        rec.render_main = r1(now() - t2);
        sumSlices(rec);
      });
    },

    undo() {
      return metered(async (rec) => {
        setStore(figure);
        const t = now();
        useGeoStore.getState().undo();
        rec.undo_main = r1(now() - t);
        adopt();
        rec.nfacts = figure.facts.length;
        const t2 = now();
        render(figure);
        rec.render_main = r1(now() - t2);
        sumSlices(rec);
      });
    },

    async toggle(key) {
      const keys = [...new Set(figure.facts.map(groupKey))];
      if (keys.length < 2) return null;
      return metered(async (rec) => {
        setStore(figure);
        rec.nfacts = figure.facts.length;
        let settling = false;
        const t = now();
        runSetGroupEnabled(key ?? keys[0], false, { resolveAfterCommit: () => void (settling = true) });
        rec.toggle_main = r1(now() - t);
        adopt();
        if (settling) await settle(rec, '');
        sumSlices(rec);
      });
    },

    detect(facts = figure.facts) {
      // the detect lane is its own worker instance: it has folded nothing the page or the interactive worker folded,
      // and it is handed the facts as a worker receives them, a structured clone. The page's own array would be a
      // hit on `replay`'s identity memo, which is not a cache `clearReplayCaches` can empty (see the header).
      // Where the lanes ARE separate heaps only the detect worker's is emptied; in one heap, the heap.
      if (ops.reset) ops.reset('detect');
      else clearReplayCaches();
      const received = structuredClone(facts);
      return metered(async (rec, painted) => {
        painted(); // the figure is on screen; nothing waits for the sweep
        rec.nfacts = facts.length;
        const t = now();
        await ops.detect(received);
        rec.detect_bg = r1(now() - t);
        rec.total_ms = rec.detect_bg;
        rec.main_ms = 0;
        rec.worker_ms = 0;
      });
    },
  };
}
