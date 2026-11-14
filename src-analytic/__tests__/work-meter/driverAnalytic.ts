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
 * WHAT THE WALK LEFT OUT UNTIL #2890 (ADR-AG-477): a row ticked off and on (`doToggle`), undo and redo (`doShow`: the store
 * restores a basis and the page renders it), a letter renamed (`doRename`) and the ASK LANE (`doAsk`: `App.tsx` answers
 * every stored question inside the render, and again on every render after it). They run on a {@link Session}: the store's
 * whole basis, with the muted rows, the seed names and the questions asked.
 *
 * AN EDIT IS MEASURED IN A SESSION THAT HAS NOT SOLVED THE EDITED ROW ({@link beforeLastRowEdit}; the meter's one
 * definition of `edit`, the same in every builder). A cache keyed by content cannot forget one row, so re-typing a row to
 * its own text in the session that built it would count nothing, where a student who changes a row solves the new row.
 */
import { clearAnalyticCaches, derive, type Derivation } from '../../engine/derive';
import { decideSubmit, decideEditHost, decideToggle, isHeld } from '../../app/submit';
import { decideRename, decideSwap } from '../../app/rename';
import { anotherConfiguration } from '../../app/another';
import { activeOf, activePins } from '../../app/active';
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
import { askSettled } from '../../app/ask';
import { ASK_LIMIT, pressChip, toggleDrawn } from '../../app/answers';
import { measurablesOf } from '../../app/measurable';
import type { AskedQuestion } from '../../store/useAnalyticStore';
import { meterAction, type MeteredAction, type WorkCounts } from '../../../shell/workMeter';

// ------------------------------------------------------------------ the App's work, mirrored by CALLING its functions
export type Hosts = Record<number, readonly string[]>;
const now = () => performance.now();

type SeedNames = Readonly<Record<string, string>>;
const NO_NAMES: SeedNames = {};
const NO_ASKS: readonly AskedQuestion[] = [];

function deriveFor(lines: readonly string[], seed: Seed, hosts: Hosts, seedNames: SeedNames = NO_NAMES): Derivation {
  const d = derive(lines, seed, seedNames, activePins(hosts, lines.length, []));
  configurationPool(d.construction).defer(); // App.tsx `d` memo
  return d;
}

/** The render's useMemo bodies that read the pool (re-run on poolTick). */
function poolTickMemos(d: Derivation, active: readonly string[], coincidences: [string, string][], roleMarks: ReturnType<typeof conicMarksOf>, asks: readonly AskedQuestion[] = NO_ASKS): void {
  answersOf(d, asks); // App.tsx `answers`: every stored question, on every render that has a new `d` or a new pool tick
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

/** The ask lane's rows as `App.tsx` computes them: one `askSettled` per stored question. */
function answersOf(d: Derivation, asks: readonly AskedQuestion[]): void {
  for (const q of asks) askSettled(d, q.sentence, fmtAnalytic, undefined, q.via);
}

function renderSync(d: Derivation, active: readonly string[], asks: readonly AskedQuestion[] = NO_ASKS): { coincidences: [string, string][]; roleMarks: ReturnType<typeof conicMarksOf> } {
  locusChips(d);
  questionLines(active, [], {}, new Set(d.construction.objects.map((o) => o.id)));
  shapeWarningsOf(active, d);
  const coincidences = coincidencesOf(d);
  const roleMarks = conicMarksOf(d, {}, () => false);
  poolTickMemos(d, active, coincidences, roleMarks, asks);
  return { coincidences, roleMarks };
}

function postPaint(d: Derivation, active: readonly string[], seed: Seed, seedNames: SeedNames = NO_NAMES): void {
  narrowingNotesOf(active, d);
  circleNotesOf(active, d, (ls) => derive(ls, seed, seedNames));
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
function renderAndAfter(
  lines: readonly string[],
  seed: Seed,
  hosts: Hosts,
  ph: Phases,
  onPhase: (p: string) => void,
  /** The questions the session has asked (#2890): answered in the render and again when the pool completes. */
  asks: readonly AskedQuestion[] = NO_ASKS,
  seedNames: SeedNames = NO_NAMES,
): Derivation {
  onPhase('render');
  let t = now();
  const d = deriveFor(lines, seed, hosts, seedNames);
  const r = renderSync(d, lines, asks);
  ph.render = now() - t;
  ph.figure = ph.decide + ph.render;
  action?.painted(); // the figure is on screen: effects, the pool and its settle are after the paint
  onPhase('post');
  t = now();
  postPaint(d, lines, seed, seedNames);
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
    poolTickMemos(d, lines, r.coincidences, r.roleMarks, asks);
    postPaint(d, lines, seed, seedNames);
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

// ------------------------------------------------------------------ the session's actions (#2890, ADR-AG-477)
/**
 * THE STORE'S WHOLE BASIS, as the actions the walk left out need it: every row with the muted ones named, the seed names
 * a letter change leaves, and the questions asked. `hosts` is by ROW, as the store keeps it.
 */
export interface Session {
  lines: string[];
  disabled: number[];
  seed: Seed;
  hosts: Hosts;
  seedNames: Record<string, string>;
  asks: AskedQuestion[];
}

export const sessionOf = (lines: string[], seed: Seed, hosts: Hosts): Session => ({ lines, disabled: [], seed, hosts, seedNames: {}, asks: [] });
const activeLines = (s: Session): string[] => activeOf(s.lines, s.disabled);
/** The hosts on the active projection: `renderAndAfter` takes them by ACTIVE index, as `derive` takes its pins. */
const activeHosts = (s: Session): Hosts => activePins(s.hosts, s.lines.length, s.disabled);
const showSession = (s: Session, ph: Phases, onPhase: (p: string) => void): Derivation =>
  renderAndAfter(activeLines(s), s.seed, activeHosts(s), ph, onPhase, s.asks, s.seedNames);
/** The derivation the page holds for a session (a lookup once it is shown). */
const currentOf = (s: Session): Derivation => deriveFor(activeLines(s), s.seed, activeHosts(s), s.seedNames);

/** A session ON SCREEN and settled, unmeasured (`shownState` for a {@link Session}); also the page's part of a two-heap walk. */
export function shownSession(s: Session): void {
  showSession(s, blank(), () => {});
}

/** The mute checkbox (`App.tsx` `toggleRow`): muting applies at once, un-muting faces the typed-line gate (`decideToggle`). */
function toggleBody(s: Session, index: number, onPhase: (p: string) => void): { ph: Phases; next: Session | null } {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const v = decideToggle(index, s.lines, s.disabled, s.seed, currentOf(s), s.hosts);
  ph.decide = now() - t;
  ph.verdict = v.kind;
  if (v.kind !== 'apply') {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const next: Session = { ...s, disabled: v.disabled };
  showSession(next, ph, onPhase);
  return { ph, next };
}

/** Undo or redo: the store restores a basis (no decision) and the page renders it. */
function showBody(s: Session, onPhase: (p: string) => void): { ph: Phases; next: Session } {
  const ph = blank();
  showSession(s, ph, onPhase);
  return { ph, next: s };
}

/**
 * THE QUESTIONS A FIGURE'S OWN MENUS OFFER, in the order a student meets them: every locus chip (`locusChips`), then the
 * measure menu's questions (`measurablesOf`) of each point, curve and segment in figure order. The first {@link ASK_LIMIT}
 * of them: the lane holds no more.
 */
function menuQuestions(d: Derivation): Array<{ sentence: string; chip: boolean }> {
  const out: Array<{ sentence: string; chip: boolean }> = locusChips(d).map((c) => ({ sentence: c.sentence, chip: true }));
  const seen = new Set<string>();
  const menu = (kind: 'point' | 'curve' | 'segment', id: string) => {
    for (const m of measurablesOf(d.construction, { kind, id })) {
      if (seen.has(m.sentence)) continue;
      seen.add(m.sentence);
      out.push({ sentence: m.sentence, chip: false });
    }
  };
  for (const p of d.figure.points) menu('point', p.id);
  for (const c of d.figure.curves) menu('curve', c.id);
  for (const g of d.figure.segments) menu('segment', g.id);
  return out.slice(0, ASK_LIMIT);
}

/**
 * THE ASK LANE (`App.tsx:758`): each question is pressed in turn (`pressChip` for a chip, the measure menu's `toggleDrawn`
 * for the rest), and after every press the page answers EVERY stored question again, because `answers` is one memo over
 * the whole list. The questions stay asked: every later render of the session answers them too (`renderAndAfter`).
 */
function askBody(s: Session, onPhase: (p: string) => void): { ph: Phases; next: Session } {
  const ph = blank();
  onPhase('render');
  const t = now();
  const d = currentOf(s);
  let asks = s.asks;
  for (const q of menuQuestions(d)) {
    asks = q.chip ? pressChip(asks, q.sentence) : toggleDrawn(asks, q.sentence);
    answersOf(d, asks);
  }
  ph.render = now() - t;
  ph.figure = ph.render;
  ph.total = ph.render;
  ph.verdict = `${asks.length} asked`;
  return { ph, next: { ...s, asks } };
}

/** The first capital no line of the session uses: what a student would rename a point to. */
function freeLetter(lines: readonly string[]): string | null {
  const text = lines.join(' ');
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!text.includes(ch)) return ch;
  return null;
}

/**
 * A LETTER RENAMED from the canvas popover (`app/rename.ts` `decideRename`, over the whole session): the figure's first
 * point takes the first capital no line uses. Every line that names it is rewritten, so the page solves a line list it
 * has never seen. A figure with no lettered point, or no free capital, renames nothing (the action is recorded as such).
 */
function renameBody(s: Session, onPhase: (p: string) => void): { ph: Phases; next: Session | null } {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const cur = currentOf(s);
  const from = cur.figure.points.find((p) => /^[A-Z]$/.test(p.id))?.id;
  const to = freeLetter(s.lines);
  const v = from && to ? decideRename(from, to, { lines: s.lines, disabled: s.disabled, queries: s.asks, spokenFor: {}, seed: s.seed, seedNames: s.seedNames, hosts: s.hosts }, cur) : null;
  ph.decide = now() - t;
  ph.verdict = !v ? 'none' : v.kind === 'apply' ? 'apply' : `refused:${v.error.key}`;
  if (!v || v.kind !== 'apply') {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const hosts: Hosts = {};
  for (const [k, ring] of Object.entries(v.hosts ?? s.hosts)) hosts[Number(k)] = [...ring];
  const next: Session = { ...s, lines: [...v.lines], asks: [...v.queries], seedNames: { ...v.seedNames }, hosts };
  showSession(next, ph, onPhase);
  return { ph, next };
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
export const doToggle = (s: Session, index: number, onPhase: PhaseCb = quiet) => metered(() => toggleBody(s, index, onPhase));
export const doShow = (s: Session, onPhase: PhaseCb = quiet) => metered(() => showBody(s, onPhase));
export const doAsk = (s: Session, onPhase: PhaseCb = quiet) => metered(() => askBody(s, onPhase));
export const doRename = (s: Session, onPhase: PhaseCb = quiet) => metered(() => renameBody(s, onPhase));
