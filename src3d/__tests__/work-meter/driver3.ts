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
 *   undo / redo     = undo3() / redo3() + the render
 *   untick / retick = store.toggle(the first row) + the render
 *   panel   = the values alone, on a figure shown with the data panel closed
 *   rename / swap   = store.rename / store.swap + the render
 *   ask     = store.addQuery + the answer read for the row to highlight + the render (which answers every saved question)
 *
 * "The render" is what App3 recomputes on a new `(facts, seed)`, in two parts (`app/readers3.ts`): the FIGURE (derive3,
 * freeDofCount3, the plane / dihedral / parameter chips, buildScene3 at the home camera with its crossing dots), then
 * the VALUES (dataView and every saved question's answer, when the panel is open).
 *
 * #2890 round 2 ([ADR-3D-493](../../../docs/06b-decisions-3d.md#adr-3d-493)): EVERY ACTION GOES THROUGH THE APP'S OWN
 * JOB PATH (`app/offPage3.ts`, `app/work3.ts`'s `act3`): solved by 3-D's worker, the figure's journal adopted, the
 * page's own action and figure readers run, and the values read when their journal is in. Where nothing is off the
 * page (the timing harness, the suites) that path is the page's own action, as before. The work-meter gate hands it an
 * executor over a second module instance: the worker's heap. So is every step the walk takes between two actions (a
 * figure shown, a row committed from its saved commands): what the session solved lives in the worker's heap.
 */
import { useGeo3, clearSolveCaches3, decideCommands3, derive3, deriveStats3, type Fact3 } from '../../store/store3';
import { answerQuery, parseQuery } from '../../engine/queries';
import { nextFreeLabel3 } from '../../engine/crossings3';
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
import { latestValues3, offPage3, offPageAction3, setPanelOpen3, values3, type OffPage3 } from '../../app/offPage3';
import { act3 } from '../../app/work3';
import type { Step3 } from '../../app/ops3';

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

/** Is the data panel open (App3's `showData`)? The walk opens it, closes it for the readers' session, and opens it again. */
let panelOpen = true;
function setPanel(open: boolean): void {
  panelOpen = open;
  setPanelOpen3(open);
}

/** The session's other heaps (the worker's), cleared where a session starts. The gate sets it. */
export const sessionHooks3: { clearOthers: (() => void) | null } = { clearOthers: null };

/** A new session: every cache emptied, in every heap. */
export function newSession3(): void {
  clearSolveCaches3();
  sessionHooks3.clearOthers?.();
}

/** The figure's part of the render (App3's body and its canvas). */
function renderFigure3(): void {
  const { facts, seed } = useGeo3.getState();
  try {
    const d = derive3(facts, seed);
    freeDofCount3(d.construction, d.resolved);
    planeChipsByFact(facts, (id) => d.status[id] === 'ok', (n) => d.resolved.planes.has(n));
    dihedralChipsByFact(facts, (id) => d.status[id] === 'ok');
    paramChipsByFact(facts, competingArcSymbols(collectWedges(d.construction, d.resolved.positions)));
    buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true, () => 'value', []);
  } catch {
    /* a render throw is not a timing concern here */
  }
}

/** The values' part: what the open data panel shows and every saved question's answer, those in hand (App3). */
export function renderValues3(): void {
  if (!panelOpen) return;
  const { facts, seed, queries } = useGeo3.getState();
  const v = values3(facts, seed);
  if (!v.panel) return;
  try {
    const d = derive3(facts, seed);
    dataView(d.construction, seed);
    for (const q of queries) if (v.answered(q)) answerQuery(d.construction, q, seed);
  } catch {
    /* as renderFigure3 */
  }
}

/** The App's render for the store's current `(facts, seed)`: the figure, then the values when they are in. Returns its wall time. */
export async function render3(h?: OffPage3): Promise<number> {
  const t = now();
  renderFigure3();
  await h?.settled;
  renderValues3();
  return now() - t;
}

/** Put a figure in the store without measuring anything. No saved question comes with it. */
export function setFigure3(facts: Fact3[], seed: Seed): void {
  useGeo3.setState({ facts, seed, queries: [], lastError: null, lastNotice: null });
}

/** Show a figure, unmeasured: solved off the page as any job is, put in the store, rendered. */
export async function showFigure3(facts: Fact3[], seed: Seed): Promise<void> {
  const h = await offPage3([], { state: { facts, seed, queries: [] } });
  setFigure3(facts, seed);
  h.after();
  await render3(h);
}

/** A job the walk takes between two actions, unmeasured: `steps` solved off the page, then `runLocal`, then the render. */
async function step3(steps: Step3[], runLocal: () => void): Promise<void> {
  const h = await offPage3(steps);
  runLocal();
  h.after();
  await render3(h);
}

/** Submit one typed line exactly as App3.submitSentence3 does (deterministic lane only — never the LLM). */
export async function submitLine3(raw: string): Promise<Required<Outcome3>> {
  const t = now();
  const h = await offPage3([{ kind: 'line', raw }]);
  const v = decideDeterministic3(useGeo3.getState(), raw);
  let verdict: string = v.kind;
  if (v.kind === 'guided') useGeo3.setState({ lastError: null });
  else {
    useGeo3.getState().dispatchVerdict(v);
    if (v.kind === 'refused') verdict = `refused:${(v.error as { code?: string })?.code}`;
  }
  h.after();
  const decideMs = now() - t;
  const drawn = v.kind === 'record' || v.kind === 'retick' || v.kind === 'rename' || v.kind === 'swap';
  return { verdict, decideMs, renderMs: drawn ? await render3(h) : (await h.settled, 0) };
}

/** A row committed from its saved commands, unmeasured (the walk's fallback for a row the grammar no longer records). */
export function commitSaved3(utterance: string, cmds: Fact3['cmds']): Promise<void> {
  return step3([{ kind: 'saved', utterance, cmds }], () => {
    const v = decideCommands3(useGeo3.getState(), utterance, cmds, { twins: false, seedSearch: true });
    if (v.kind === 'record') useGeo3.getState().dispatchVerdict(v);
  });
}

/** The render that follows a job whose handle the caller did not keep: the figure, then the values once in hand. */
async function renderAfterJob3(): Promise<number> {
  const t = now();
  renderFigure3();
  await latestValues3();
  renderValues3();
  return now() - t;
}

/** «הציגו תצורה אחרת» (App3: a job on its own lane). */
export function another3(): Promise<Required<Outcome3>> {
  return routed3(() => offPageAction3('resample', [], () => useGeo3.getState().resample()), () => `seed:${JSON.stringify(useGeo3.getState().seed)}`);
}

/** Load a figure as App3.onLoadFile does: solved off the page, the store transition, the load audit, the render. */
export async function loadFacts3(facts: Fact3[], seed: Seed): Promise<Required<Outcome3>> {
  const t = now();
  const h = await offPage3([{ kind: 'load', facts, seed }]);
  useGeo3.getState().loadFigure(facts, seed);
  const a = auditLoad3(facts, seed);
  h.after();
  const decideMs = now() - t;
  return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: await render3(h) };
}

/** Load a saved file's text as App3.onLoadFile does (the rows get new ids, drawn by the job; cold when the caller cleared the caches). */
export async function loadText3(text: string): Promise<Required<Outcome3>> {
  const t = now();
  const h = await offPage3([{ kind: 'open', text }]);
  const r = deserializeFigure3(text);
  if (!r.ok) {
    h.after();
    return { verdict: `load-refused:${r.reason}`, decideMs: 0, renderMs: 0 };
  }
  useGeo3.getState().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
  const a = auditLoad3(r.facts, r.seed);
  h.after();
  const decideMs = now() - t;
  return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: await render3(h) };
}

/** A routed store action as App3 calls it (`act3`: a job, solved off the page), then the render. */
async function routed3<T>(run: () => Promise<T>, verdictOf: (out: T) => string, draws: (out: T) => boolean = () => true): Promise<Required<Outcome3>> {
  const t = now();
  const out = await run();
  const decideMs = now() - t;
  return { verdict: verdictOf(out), decideMs, renderMs: draws(out) ? await renderAfterJob3() : (await latestValues3(), 0) };
}

const errorCode = (): string => (useGeo3.getState().lastError as { code?: string } | null)?.code ?? 'none';

/** Delete the first row (App3 → `act3.remove`). */
export function removeFirst3(): Promise<Required<Outcome3>> {
  return routed3(() => act3.remove(useGeo3.getState().facts[0].id), () => `err:${errorCode()}`);
}

/**
 * THE SESSION AN EDIT IS MEASURED IN (#2888, ADR-3D-491; one definition for all four builders): a student who has built
 * rows 1..n changes the LAST row. The rows before it are solved in the session; the edited row's content is not.
 * Solved content is keyed by content, and a key cannot forget one row, so the session is built explicitly, unmeasured:
 * a new session (cleared caches), rows 1..n−1 in the store and rendered at the figure's configuration, then all n rows
 * in the store with nothing solved. `editLast3` is measured after it. A one-row figure has no rows before it, so its
 * edit is cold.
 */
export async function beforeEdit3(facts: Fact3[], seed: Seed): Promise<void> {
  newSession3();
  await showBeforeEdit3(facts, seed);
}

/** {@link beforeEdit3} after its clear: the rows before the last shown, then all of them in the store, unsolved. */
export async function showBeforeEdit3(facts: Fact3[], seed: Seed): Promise<void> {
  await showFigure3(facts.slice(0, -1), seed);
  setFigure3(facts, seed);
}

/** Edit the last row to its own text (App3's onEditCommit → `act3.replaceFact`). */
export function editLast3(): Promise<Required<Outcome3>> {
  const { facts } = useGeo3.getState();
  const last = facts[facts.length - 1];
  return routed3(() => act3.replaceFact(last.id, last.utterance), (ok) => (ok ? 'ok' : 'refused'));
}

/* ── #2890 (ADR-3D-492 part 3): the actions the walk left out. Each is what App3 runs for it. ── */

/** «בטל» (App3 → `act3.undo`), then the render. */
export function undoStep3(): Promise<Required<Outcome3>> {
  return routed3(() => act3.undo(), () => `rows:${useGeo3.getState().facts.length}`);
}

/** «בצע שוב» (App3 → `act3.redo`), then the render. */
export function redoStep3(): Promise<Required<Outcome3>> {
  return routed3(() => act3.redo(), () => `rows:${useGeo3.getState().facts.length}`);
}

/** Tick or untick the first row (App3's `onToggle` → `act3.toggle`), then the render. */
export function toggleFirst3(): Promise<Required<Outcome3>> {
  return routed3(() => act3.toggle(useGeo3.getState().facts[0].id), () => `err:${errorCode()}`);
}

/** The figure on screen with the data panel CLOSED: shown, unmeasured. */
export async function showPanelClosed3(facts: Fact3[], seed: Seed): Promise<void> {
  setPanel(false);
  await showFigure3(facts, seed);
}

/** The data panel opened on the figure on screen (App3: a job on the values lane): the values alone (the figure is drawn). */
export async function openPanel3(): Promise<Required<Outcome3>> {
  const t = now();
  setPanel(true);
  const h = await offPage3([], { panel: true });
  h.after();
  await h.settled;
  renderValues3();
  return { verdict: 'ok', decideMs: 0, renderMs: now() - t };
}

/** The figure's point letters, in the order the figure made them. */
const pointIds3 = (): string[] => [...derive3(useGeo3.getState().facts, useGeo3.getState().seed).construction.points.keys()];

/** The first point renamed to the first free letter (the canvas popover and the typed rewrite both reach `act3.rename`), then the render. */
export function renameFirst3(): Promise<Required<Outcome3>> {
  const { facts, seed } = useGeo3.getState();
  const c = derive3(facts, seed).construction;
  const [from] = c.points.keys();
  const to = nextFreeLabel3(c);
  if (from === undefined || to === null) return Promise.resolve({ verdict: 'refused:no-letter', decideMs: 0, renderMs: 0 });
  return routed3(() => act3.rename(from, to), (r) => (r.ok ? 'ok' : `refused:${r.reason}`), (r) => r.ok);
}

/** The first two points' letters swapped (the popover's offer and «החלף בין A ל-B» both reach `act3.swap`), then the render. */
export function swapFirstTwo3(): Promise<Required<Outcome3>> {
  const [a, b] = pointIds3();
  if (a === undefined || b === undefined) return Promise.resolve({ verdict: 'refused:no-letter', decideMs: 0, renderMs: 0 });
  return routed3(() => act3.swap(a, b), (r) => (r.ok ? 'ok' : `refused:${r.reason}`), (r) => r.ok);
}

/**
 * The questions the walk asks of the figure on screen: its first point, the segment of its first two points, the
 * angle of its first three. Only those the ask lane reads on this figure. A length is where the ask lane's work is.
 */
export function questionsOf3(): string[] {
  const { facts, seed } = useGeo3.getState();
  const c = derive3(facts, seed).construction;
  const [p, q, r] = c.points.keys();
  const asks = [p, p !== undefined && q !== undefined ? `${p}${q}` : undefined, r !== undefined ? `זווית ${p}${q}${r}` : undefined];
  return asks.filter((text): text is string => text !== undefined && parseQuery(c, text) !== null);
}

/** One question asked (App3's ask lane: a job on the values lane; the answer read for the row to highlight once in hand), then the render. */
export async function ask3(text: string): Promise<Required<Outcome3>> {
  const t = now();
  const h = await offPage3([{ kind: 'ask', text }], { panel: true });
  useGeo3.getState().addQuery(text);
  h.after();
  await h.settled;
  const { facts, seed } = useGeo3.getState();
  const a = answerQuery(derive3(facts, seed).construction, text, seed);
  const decideMs = now() - t;
  return { verdict: a.answer !== null ? 'answered' : `note:${a.note}`, decideMs, renderMs: await render3() };
}

/** Run one action under the meter and the engine's counters. A throw is an outcome, never a lost record. */
export async function metered3(fn: () => Outcome3 | Promise<Outcome3>): Promise<ActionRecord3> {
  const u0 = deriveStats3.uncached;
  const r0 = resolveStats3.uncached;
  const s0 = leastSquaresStats.solves;
  const e0 = leastSquaresStats.evals;
  const m = meterAction();
  const t0 = now();
  let r: Outcome3;
  try {
    r = await fn();
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
