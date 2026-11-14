/**
 * THE ANALYTIC ACTION DRIVER (#2873, ADR-W-210 phase 0; lifted out of `scripts/perf/analytic/harness.ts`, #2867).
 *
 * One student action, run through the SAME functions App.tsx calls, in the App's order — measured twice in the same
 * run: the wall time of each phase (the timing harness reads it) and the work meter's three counts (the gate reads
 * them). The phases:
 *
 *   figure  = until the figure / verdict is on screen: decideSubmit (or anotherConfiguration / decideEditHost / the
 *             load audit) + the re-render's derive and the render-time useMemo work (chips, warnings, coincidences,
 *             conic chips, unstated notes, the scene incl. offersOf, panelKnowledge, segmentKnowledge, paramRows, point
 *             rows, curve rows). BEFORE THE PAINT.
 *   post    = after the paint (passive effects): narrowingNotesOf + circleNotesOf.
 *   pool    = background, sliced one seed per macrotask (poolScheduler.ts): the UI is live, values show «בודק…».
 *   settle  = the re-render when the pool completes (poolTick memos + the passive effects again), only if pending
 *             was shown.
 *
 * There is NO Worker in the analytic tree: every unit is page work, and the meter says so rather than this file.
 *
 * WHAT IS ALREADY SOLVED WHEN AN ACTION STARTS (#2888, ADR-AG-476). `derive` keeps solved content by content, and the
 * store outlives the action, as it does in the page. So an action's count is the work it adds to its SESSION:
 * {@link newSession} empties the store where a session starts, and `doLoad` is a session of its own (a saved file opened in
 * a new tab finds nothing solved). Everything else runs on what the session's earlier actions left.
 *
 * AN EDIT IS MEASURED IN A SESSION THAT HAS NOT SOLVED THE EDITED ROW ({@link beforeLastRowEdit}; the meter's one
 * definition of `edit`, the same in every builder). A cache keyed by content cannot forget one row, so re-typing a row to
 * its own text in the session that built it would count nothing, where a student who changes a row solves the new row.
 */
import { clearAnalyticCaches, derive, type Derivation } from '../../engine/derive';
import { decideSubmit, decideEditHost, isHeld } from '../../app/submit';
import { decideRename, decideSwap } from '../../app/rename';
import { anotherConfiguration } from '../../app/another';
import { activePins } from '../../app/active';
import { configurationPool, knownCurve, settled, canonicalSeed, type Seed } from '../../engine/evaluate';
import { locusChips } from '../../app/locusChip';
import { questionLines } from '../../app/questionLines';
import { shapeWarningsOf } from '../../app/shapeWarnings';
import { coincidencesOf } from '../../app/coincidences';
import { circleNotesOf, conicChips, conicMarksOf, isCircleShaped, markAnchors } from '../../app/conicMarks';
import { unstatedChoices } from '../../engine/unstatedChoices';
import { drawnBox as composeDrawnBox } from '../../app/drawnBox';
import { INITIAL_VIEW, viewBox } from '../../render/view';
import { buildScene } from '../../render/scene';
import { offersOf, pointAt } from '../../engine/crossings';
import { panelKnowledge, segmentKnowledge, paramRows, sideEquationText, openCurveText } from '../../app/panelRows';
import { pointText } from '../../app/pointText';
import { curveParts } from '../../app/curveText';
import { reportedDof } from '../../engine/carriers';
import { narrowingNotesOf } from '../../app/narrowing';
import { fmtAnalytic } from '../../format';
import { ALL_SHOWN } from '../../render/canvasDisplay';
import { meterAction, type MeteredAction, type WorkCounts } from '../../../shell/workMeter';

// ------------------------------------------------------------------ the App's work, mirrored by CALLING its functions
export type Hosts = Record<number, readonly string[]>;
const now = () => performance.now();

function deriveFor(lines: readonly string[], seed: Seed, hosts: Hosts): Derivation {
  const d = derive(lines, seed, {}, activePins(hosts, lines.length, []));
  configurationPool(d.construction).defer(); // App.tsx `d` memo
  return d;
}

/** The render's useMemo bodies that read the pool (re-run on poolTick). */
function poolTickMemos(d: Derivation, active: readonly string[], coincidences: [string, string][], roleMarks: ReturnType<typeof conicMarksOf>): void {
  conicChips(d, {});
  unstatedChoices(d);
  const box = composeDrawnBox(d.figure, d.box, [], markAnchors(roleMarks));
  const zoomed = viewBox(box, INITIAL_VIEW, { width: 720, height: 720 });
  buildScene(d.figure, zoomed, 720, 720, {
    curveKnown: (id: string) => knownCurve(d.construction, id) !== null,
    sideEquationText: (id: string) => sideEquationText(d, id),
    marks: [],
    loci: [],
    crossings: offersOf(d.figure, d.construction),
    segStyle: {},
    curveStyle: {},
    stated: d.stated,
    roleMarks,
    circleShaped: (id: string) => isCircleShaped(d.construction, id),
    display: ALL_SHOWN,
    coincidences,
  } as never);
  reportedDof(d.construction, d.figure.carrierDof);
  const knows = panelKnowledge(d);
  segmentKnowledge(d);
  paramRows(d, knows, fmtAnalytic, { checking: '…', unused: 'u' });
  for (const p of knows.points) settled(() => pointText(d, p.id, p.x as never, p.y as never, fmtAnalytic));
  for (const cu of knows.curves) {
    const nameAt = (x: number, y: number) => pointAt(d.figure, x, y);
    if (cu.known) curveParts(cu.known as never, nameAt, { vertical: 'v' });
    else if (cu.options) for (const o of cu.options) curveParts(o as never, nameAt, { vertical: 'v' });
    else openCurveText(d.construction, cu.id, cu.symbolic);
  }
  void active;
}

function renderSync(d: Derivation, active: readonly string[]): { coincidences: [string, string][]; roleMarks: ReturnType<typeof conicMarksOf> } {
  locusChips(d);
  questionLines(active, [], {}, new Set(d.construction.objects.map((o) => o.id)));
  shapeWarningsOf(active, d);
  const coincidences = coincidencesOf(d);
  const roleMarks = conicMarksOf(d, {}, () => false);
  poolTickMemos(d, active, coincidences, roleMarks);
  return { coincidences, roleMarks };
}

function postPaint(d: Derivation, active: readonly string[], seed: Seed): void {
  narrowingNotesOf(active, d);
  circleNotesOf(active, d, (ls) => derive(ls, seed, {}));
}

export interface Phases {
  decide: number; // the decision before the re-render (decideSubmit / anotherConfiguration / edit gate / load audit)
  render: number; // derive + render memos
  figure: number; // decide + render — MAIN, blocking, until the figure/verdict shows
  post: number; // MAIN after paint
  pool: number; // background slices, total
  poolSlices: number;
  poolMaxSlice: number;
  settle: number; // MAIN re-render after the pool
  total: number;
  verdict?: string;
}

/** After the decision: the commit's re-render and everything after it. Returns the derivation the App now holds. */
function renderAndAfter(lines: readonly string[], seed: Seed, hosts: Hosts, ph: Phases, onPhase: (p: string) => void): Derivation {
  onPhase('render');
  let t = now();
  const d = deriveFor(lines, seed, hosts);
  const r = renderSync(d, lines);
  ph.render = now() - t;
  ph.figure = ph.decide + ph.render;
  action?.painted(); // the figure is on screen: effects, the pool and its settle are after the paint
  onPhase('post');
  t = now();
  postPaint(d, lines, seed);
  ph.post = now() - t;
  onPhase('pool');
  const pool = configurationPool(d.construction);
  t = now();
  if (!pool.complete()) {
    for (;;) {
      const s = now();
      const done = pool.step();
      const e = now() - s;
      ph.poolSlices += 1;
      if (e > ph.poolMaxSlice) ph.poolMaxSlice = e;
      if (done) break;
    }
  }
  ph.pool = now() - t;
  if (pool.pendingShown) {
    onPhase('settle');
    t = now();
    poolTickMemos(d, lines, r.coincidences, r.roleMarks);
    postPaint(d, lines, seed);
    ph.settle = now() - t;
  }
  ph.total = ph.figure + ph.post + ph.pool + ph.settle;
  return d;
}

export const blank = (): Phases => ({ decide: 0, render: 0, figure: 0, post: 0, pool: 0, poolSlices: 0, poolMaxSlice: 0, settle: 0, total: 0 });

/** The App's state between actions (a fully settled figure: the student waited for «בודק…» to clear). */
export interface State {
  lines: string[];
  seed: Seed;
  hosts: Hosts;
  d: Derivation;
}

export function settledState(lines: string[], seed: Seed, hosts: Hosts): State {
  const d = deriveFor(lines, seed, hosts);
  const pool = configurationPool(d.construction);
  while (!pool.complete()) pool.step();
  return { lines, seed, hosts, d };
}

/**
 * A figure ON SCREEN and settled, unmeasured: the App's render, its passive effects, the pool and the re-render when the
 * pool completes, exactly as a measured action leaves it (`renderAndAfter`).
 */
export function shownState(lines: string[], seed: Seed, hosts: Hosts): State {
  const d = renderAndAfter(lines, seed, hosts, blank(), () => {});
  return { lines, seed, hosts, d };
}

/**
 * THE SESSION AN EDIT OF THE LAST ROW IS MEASURED IN (#2888; the meter's one definition of `edit`, the same in every
 * builder): **a student who has built rows 1..n changes the LAST row; the rows before it are solved in the session, the
 * edited row's content is not.**
 *
 * 1. a new session (the store is emptied);
 * 2. rows 1..n−1 on screen and settled, UNMEASURED, at the session's seed and with the hosts those rows recorded;
 * 3. all n rows are the session's lines, and nothing of the n-row figure is solved: no derive, no render, no audit.
 *
 * The edit is then measured through `doEdit`, re-typing the last row to its own text: about what `submit#n` costs, through
 * the EDIT path. For a one-row figure the prefix is empty and the edit is cold.
 */
export function beforeLastRowEdit(st: Pre): Pre {
  newSession();
  const last = st.lines.length - 1;
  const hosts: Hosts = {};
  for (const [k, v] of Object.entries(st.hosts)) if (Number(k) < last) hosts[Number(k)] = v;
  if (last > 0) shownState(st.lines.slice(0, last), st.seed, hosts);
  return { lines: st.lines, seed: st.seed, hosts: st.hosts };
}

// ------------------------------------------------------------------ actions
export type ActionKind = 'submit' | 'another' | 'load' | 'delete' | 'edit' | 'llm-commit';
export interface Pre {
  lines: string[];
  seed: Seed;
  hosts: Hosts;
}

function submitBody(st: State, raw: string, onPhase: (p: string) => void): { ph: Phases; next: State | null } {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const v = decideSubmit(raw, st.lines, st.seed, st.d);
  ph.decide = now() - t;
  ph.verdict = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind === 'record' && isHeld(v) ? 'held' : v.kind;
  if (v.kind === 'record') {
    const lines = [...st.lines, v.line];
    const hosts = v.host?.ring ? { ...st.hosts, [st.lines.length]: [...v.host.ring] } : st.hosts;
    const seed = v.configuration === undefined ? st.seed : canonicalSeed(v.configuration);
    const d = renderAndAfter(lines, seed, hosts, ph, onPhase);
    return { ph, next: { lines, seed, hosts, d } };
  }
  if (v.kind === 'rename' || v.kind === 'swap') {
    const sess = { lines: st.lines, disabled: [], queries: [], spokenFor: {}, seed: st.seed } as never;
    const t2 = now();
    const r = v.kind === 'rename' ? decideRename(v.from, v.to, sess) : decideSwap(v.a, v.b, sess);
    ph.decide += now() - t2;
    if (r.kind === 'apply') {
      const d = renderAndAfter(r.lines, st.seed, {}, ph, onPhase);
      return { ph, next: { lines: r.lines, seed: st.seed, hosts: {}, d } };
    }
  }
  ph.figure = ph.decide;
  ph.total = ph.decide;
  return { ph, next: null };
}

function anotherBody(st: State, onPhase: (p: string) => void): { ph: Phases; next: State | null } {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const r = anotherConfiguration(st.lines, st.seed, undefined, {}, activePins(st.hosts, st.lines.length, []));
  ph.decide = now() - t;
  ph.verdict = r.found ? 'found' : 'none';
  if (!r.found) {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const d = renderAndAfter(st.lines, r.seed, st.hosts, ph, onPhase);
  return { ph, next: { lines: st.lines, seed: r.seed, hosts: st.hosts, d } };
}

/** A student's session starts: nothing is solved yet. The walk and the timing harness call it per sequence. */
export function newSession(): void {
  clearAnalyticCaches();
}

/**
 * Load (file / share link / restored session): the audit's cold derive at seed 0 (loadSession.ts), then the App's render.
 * A load is a NEW SESSION — the page was opened on the file — so it starts from an empty store (#2888).
 */
function loadBody(lines: string[], seed: Seed, hosts: Hosts, onPhase: (p: string) => void): { ph: Phases; next: State } {
  newSession();
  const ph = blank();
  onPhase('decide');
  const t = now();
  derive(lines, 0, {}, activePins(hosts, lines.length, []));
  ph.decide = now() - t;
  const d = renderAndAfter(lines, seed, hosts, ph, onPhase);
  return { ph, next: { lines, seed, hosts, d } };
}

/** Delete a row (removeLine: no decision, the seed is kept, hosts shift). */
function deleteBody(st: State, index: number, onPhase: (p: string) => void): { ph: Phases; next: State } {
  const ph = blank();
  const lines = st.lines.filter((_, i) => i !== index);
  const hosts: Hosts = {};
  for (const [k, v] of Object.entries(st.hosts)) {
    const i = Number(k);
    if (i < index) hosts[i] = v;
    else if (i > index) hosts[i - 1] = v;
  }
  const d = renderAndAfter(lines, st.seed, hosts, ph, onPhase);
  return { ph, next: { lines, seed: st.seed, hosts, d } };
}

function editBody(st: Pre, index: number, text: string, onPhase: (p: string) => void): { ph: Phases; next: State | null } {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const r = decideEditHost(index, text, st.lines, [], st.seed, {}, st.hosts);
  ph.decide = now() - t;
  ph.verdict = r.ok ? 'ok' : 'refused';
  if (!r.ok) {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const lines = st.lines.map((l, j) => (j === index ? text : l));
  const { [index]: _gone, ...rest } = st.hosts;
  const hosts: Hosts = r.host ? { ...rest, [index]: [...(r.host as { ring: string[] }).ring] } : rest;
  const d = renderAndAfter(lines, st.seed, hosts, ph, onPhase);
  return { ph, next: { lines, seed: st.seed, hosts, d } };
}

// ------------------------------------------------------------------ the measured actions
let action: MeteredAction | null = null;
type PhaseCb = (p: string) => void;
const quiet: PhaseCb = () => {};

/** Run one action under the meter. Everything is before the paint until `renderAndAfter` says the figure is drawn. */
function metered<T>(fn: () => T): T & { work: WorkCounts } {
  const m = meterAction();
  action = m;
  try {
    const r = fn();
    return { ...r, work: m.end() };
  } catch (e) {
    m.end();
    throw e;
  } finally {
    action = null;
  }
}

export const doSubmit = (st: State, raw: string, onPhase: PhaseCb = quiet) => metered(() => submitBody(st, raw, onPhase));
export const doAnother = (st: State, onPhase: PhaseCb = quiet) => metered(() => anotherBody(st, onPhase));
export const doLoad = (lines: string[], seed: Seed, hosts: Hosts, onPhase: PhaseCb = quiet) => metered(() => loadBody(lines, seed, hosts, onPhase));
export const doDelete = (st: State, index: number, onPhase: PhaseCb = quiet) => metered(() => deleteBody(st, index, onPhase));
export const doEdit = (st: Pre, index: number, text: string, onPhase: PhaseCb = quiet) => metered(() => editBody(st, index, text, onPhase));
