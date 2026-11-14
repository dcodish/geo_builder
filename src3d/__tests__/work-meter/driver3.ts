/**
 * THE 3-D ACTION DRIVER (#2873, ADR-W-210 phase 0; lifted out of `scripts/perf/3d/sweep3.ts`, #2867).
 *
 * One student action, run through the functions `App3.tsx` calls, in the App's order — measured twice in the same run:
 * the wall time (the timing harness reads it) and the work meter's three counts (the gate reads them).
 *
 *   submit  = decideDeterministic3 (App3.submitSentence3) + dispatchVerdict + the render
 *   another = store.resample() + the render
 *   load    = store.loadFigure + auditLoad3 + the render (cold: the walk clears the content-keyed caches before it)
 *   edit    = store.replaceFact(the last row, its own text) + the render, in the session `beforeEdit3` builds
 *   delete  = store.remove(the first row) + the render
 *
 * "The render" is what App3 recomputes on a new `(facts, seed)`: derive3 (memo), freeDofCount3, the plane / dihedral /
 * parameter chips (collectWedges), dataView (the panel is open by default on wide screens) and buildScene3 at the
 * home camera. 3-D has no worker and no work after the paint: every unit is page work before the paint, and the
 * meter says so rather than this file.
 */
import { useGeo3, clearSolveCaches3, derive3, deriveStats3, type Fact3 } from '../../store/store3';
import { decideDeterministic3 } from '../../app/decideDeterministic3';
import { deserializeFigure3 } from '../../store/figureFile3';
import { auditLoad3 } from '../../store/loadAudit3';
import { freeDofCount3, resolveStats3 } from '../../engine/evaluate';
import { leastSquaresStats } from '../../engine/solve3';
import { dataView } from '../../engine/dataView';
import { planeChipsByFact } from '../../store/planeChips';
import { dihedralChipsByFact } from '../../store/dihedralChips';
import { paramChipsByFact } from '../../store/paramChips';
import { collectWedges, competingArcSymbols } from '../../render/wedges';
import { buildScene3 } from '../../render/scene3';
import { HOME_CAMERA } from '../../render/camera';
import { meterAction, type WorkCounts } from '../../../shell/workMeter';

export interface Outcome3 {
  verdict: string;
  decideMs?: number;
  renderMs?: number;
}

/** One measured action: its outcome, the three counts, and the engine's own clock-free counters. */
export interface ActionRecord3 extends Outcome3 {
  ms: number;
  work: WorkCounts;
  /** derive3 memo misses · resolve passes · least-squares solves · residual evaluations */
  stats: { uncached: number; resolves: number; lmSolves: number; lmEvals: number };
}

type Seed = ReturnType<typeof useGeo3.getState>['seed'];
const now = (): number => performance.now();

/** The App's render-side derivations for the store's current `(facts, seed)`. Returns its wall time. */
export function render3(): number {
  const t = now();
  const { facts, seed } = useGeo3.getState();
  try {
    const d = derive3(facts, seed);
    freeDofCount3(d.construction, d.resolved);
    planeChipsByFact(facts, (id) => d.status[id] === 'ok', (n) => d.resolved.planes.has(n));
    dihedralChipsByFact(facts, (id) => d.status[id] === 'ok');
    paramChipsByFact(facts, competingArcSymbols(collectWedges(d.construction, d.resolved.positions)));
    dataView(d.construction, seed);
    buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true, () => 'value', []);
  } catch {
    /* a render throw is not a timing concern here */
  }
  return now() - t;
}

/** Put a figure in the store without measuring anything. */
export function setFigure3(facts: Fact3[], seed: Seed): void {
  useGeo3.setState({ facts, seed, lastError: null, lastNotice: null });
}

/** Submit one typed line exactly as App3.submitSentence3 does (deterministic lane only — never the LLM). */
export function submitLine3(raw: string): Required<Outcome3> {
  const t = now();
  const v = decideDeterministic3(useGeo3.getState(), raw);
  let verdict: string = v.kind;
  if (v.kind === 'guided') useGeo3.setState({ lastError: null });
  else {
    useGeo3.getState().dispatchVerdict(v);
    if (v.kind === 'refused') verdict = `refused:${(v.error as { code?: string })?.code}`;
  }
  const decideMs = now() - t;
  return { verdict, decideMs, renderMs: v.kind === 'record' || v.kind === 'retick' || v.kind === 'rename' || v.kind === 'swap' ? render3() : 0 };
}

/** «הציגו תצורה אחרת». */
export function another3(): Required<Outcome3> {
  const t = now();
  useGeo3.getState().resample();
  const decideMs = now() - t;
  return { verdict: `seed:${JSON.stringify(useGeo3.getState().seed)}`, decideMs, renderMs: render3() };
}

/** Load a figure as App3.onLoadFile does: the store transition, then the load audit, then the render. */
export function loadFacts3(facts: Fact3[], seed: Seed, ...rest: unknown[]): Required<Outcome3> {
  const t = now();
  (useGeo3.getState().loadFigure as (...a: unknown[]) => void)(facts, seed, ...rest);
  const a = auditLoad3(facts, seed);
  const decideMs = now() - t;
  return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: render3() };
}

/** Load a saved file's text (the rows get new ids; the load is cold when the caller cleared the caches, as the walk does). */
export function loadText3(text: string): Required<Outcome3> {
  const r = deserializeFigure3(text);
  if (!r.ok) return { verdict: `load-refused:${r.reason}`, decideMs: 0, renderMs: 0 };
  return loadFacts3(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
}

/** Delete the first row. */
export function removeFirst3(): Required<Outcome3> {
  const t = now();
  useGeo3.getState().remove(useGeo3.getState().facts[0].id);
  const decideMs = now() - t;
  return { verdict: `err:${(useGeo3.getState().lastError as { code?: string } | null)?.code ?? 'none'}`, decideMs, renderMs: render3() };
}

/**
 * THE SESSION AN EDIT IS MEASURED IN (#2888, ADR-3D-491; one definition for all four builders): a student who has built
 * rows 1..n changes the LAST row. The rows before it are solved in the session; the edited row's content is not.
 * Solved content is keyed by content, and a key cannot forget one row, so the session is built explicitly, unmeasured:
 * a new session (cleared caches), rows 1..n−1 in the store and rendered at the figure's configuration, then all n rows
 * in the store with nothing solved. `editLast3` is measured after it. A one-row figure has no rows before it, so its
 * edit is cold.
 */
export function beforeEdit3(facts: Fact3[], seed: Seed): void {
  clearSolveCaches3({ readings: true });
  setFigure3(facts.slice(0, -1), seed);
  render3();
  setFigure3(facts, seed);
}

/** Edit the last row to its own text (App3's onEditCommit → replaceFact). */
export function editLast3(): Required<Outcome3> {
  const { facts } = useGeo3.getState();
  const last = facts[facts.length - 1];
  const t = now();
  const ok = useGeo3.getState().replaceFact(last.id, last.utterance);
  const decideMs = now() - t;
  return { verdict: ok ? 'ok' : 'refused', decideMs, renderMs: render3() };
}

/** Run one action under the meter and the engine's counters. A throw is an outcome, never a lost record. */
export function metered3(fn: () => Outcome3): ActionRecord3 {
  const u0 = deriveStats3.uncached;
  const r0 = resolveStats3.uncached;
  const s0 = leastSquaresStats.solves;
  const e0 = leastSquaresStats.evals;
  const m = meterAction();
  const t0 = now();
  let r: Outcome3;
  try {
    r = fn();
  } catch (e) {
    r = { verdict: `throw:${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
  const ms = now() - t0;
  return {
    ...r,
    ms,
    work: m.end(),
    stats: { uncached: deriveStats3.uncached - u0, resolves: resolveStats3.uncached - r0, lmSolves: leastSquaresStats.solves - s0, lmEvals: leastSquaresStats.evals - e0 },
  };
}
