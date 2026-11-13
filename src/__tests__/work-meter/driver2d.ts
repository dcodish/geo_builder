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
 *   edit    = runEditCommit on the last row, to its own text (page) → the render → the resolve
 *   delete  = removeGroup of the first row (page; the seed resets) → the render → the resolve
 *   detect  = the worker's `detect` — the background sweep that follows every step, from cold caches (its lane is a
 *             second worker instance). Nothing waits for it. It leaves the caches cold, so it is an item's last action.
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
 * Under node the page and the worker share ONE module instance, so a view the worker has searched is a memo hit
 * when the page renders it. In a browser the worker's caches are its own and only a transplanted fold crosses.
 * The page count measured here is therefore a LOWER bound on a browser's (ADR-W-210 Am. 1).
 */
import { decidePreParse, decideFromParse } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { runEditCommit } from '@/app/editPipeline';
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
  /** Delete one row (the first by default). Null when the figure has fewer than two rows. */
  remove(key?: string): Promise<ActionRecord | null>;
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
        await settle(rec, '');
        sumSlices(rec);
      });
    },

    detect(facts = figure.facts) {
      // the detect lane is its own worker instance: it has folded nothing the page or the interactive worker folded
      clearReplayCaches();
      return metered(async (rec, painted) => {
        painted(); // the figure is on screen; nothing waits for the sweep
        rec.nfacts = facts.length;
        const t = now();
        await ops.detect(facts);
        rec.detect_bg = r1(now() - t);
        rec.total_ms = rec.detect_bg;
        rec.main_ms = 0;
        rec.worker_ms = 0;
      });
    },
  };
}
