/**
 * THE ANALYTIC ACTION DRIVER (#2873, ADR-W-210 phase 0; lifted out of `scripts/perf/analytic/harness.ts`, #2867).
 *
 * One student action, run as the page runs it, measured twice in the same run: the wall time of each phase (the
 * timing harness reads it) and the work meter's three counts (the gate reads them).
 *
 * SINCE #2890 ([ADR-AG-478](../../../docs/06c-decisions-analytic.md#adr-ag-478), ADR-W-210 phase 3) THE PAGE SOLVES
 * NOTHING. Every solve is an operation of `app/opsAn.ts`, run by an EXECUTOR ({@link useDriverExecutor}: by default this
 * module instance, charged to the worker lane, as `app/workerAn.ts` runs it where there is no `Worker`; in the gate a
 * second module instance whose every message is cloned, as a browser's worker heap). What it solved is adopted into
 * the page's store, and the page's own readers then run on it, as `App.tsx` runs them. The phases:
 *
 *   decide  = the decision's operation (`submit`, `another`, `edit`, `toggle`, `letter`, `audit`); none for a delete,
 *             an undo or a redo.
 *   render  = the `show` operation's FIGURE part, adopted, and the page's readers with the pool HELD: the figure is
 *             drawn, every value pending. BEFORE THE PAINT. (Operator ruling 2026-11-14, #2890 q. 1: figure first.)
 *   pool    = the rest of `show` in the worker: the pool completed, every reader run on it, the questions answered,
 *             the notes' sub-lists solved. After the paint.
 *   settle  = the values, adopted, and the page's readers and its two after-paint notes on them.
 *   post    = always 0 now (the notes are read with the values); kept for the harness's tables.
 *
 * WHAT IS ALREADY SOLVED WHEN AN ACTION STARTS (#2888, ADR-AG-476). Solved content is kept by content and outlives the
 * action, in the worker's heap and in the page's: {@link newSession} empties both where a session starts, and `doLoad` is
 * a session of its own (a saved file opened in a new tab).
 *
 * THE ACTIONS run on a {@link State}: the store's whole basis (the rows, the muted ones, the configuration, the seed
 * names, the hosts) and the questions asked. `submit#k`, «הציגו תצורה אחרת», load, delete, edit (by the meter's one
 * definition, {@link beforeLastRowEdit}), and since #2890 (ADR-AG-477): the ask lane, a row ticked off and on, undo,
 * redo and a letter renamed.
 */
import { clearAnalyticCaches, derive, type Derivation } from '../../engine/derive';
import { canonicalSeed, configurationPool, type Seed } from '../../engine/evaluate';
import { adoptSettled, type Settled } from '../../engine/settle';
import { isHeld } from '../../app/submit';
import { activeOf, activePins } from '../../app/active';
import { locusChips } from '../../app/locusChip';
import { ASK_LIMIT, pressChip, toggleDrawn } from '../../app/answers';
import { measurablesOf } from '../../app/measurable';
import { readAfterPaint, readFigure } from '../../app/figureReaders';
import { opsAn, type BasisAn, type Decided, type OpsAn, type Shown } from '../../app/opsAn';
import type { AskedQuestion } from '../../store/useAnalyticStore';
import { sameInstanceExecutor, type Executor } from '../../../shell/workerExecutor';
import { meterAction, meterRemote, type MeteredAction, type WorkCounts } from '../../../shell/workMeter';

export type Hosts = Record<number, readonly string[]>;
const now = () => performance.now();

// ------------------------------------------------------------------ the worker's heap
/** Who serves the operations, and how its heap is emptied where a session starts. */
interface Heap {
  executor: Executor;
  clear(): void;
}
const HERE: Heap = { executor: sameInstanceExecutor(opsAn), clear: () => clearAnalyticCaches() };
let heap: Heap = HERE;

/**
 * The executor the walk's operations run on, and the worker heap's own clear (`null`: this module instance). The gate
 * hands `shell`'s isolated executor over a second module instance of `app/opsAn.ts` (`shell/__tests__/isolated-ops`).
 */
export function useDriverExecutor(next: Heap | null): void {
  heap = next ?? HERE;
}

let painted = false;
/** One operation, its units charged before or after the paint as the page would see them arrive. */
async function op<K extends keyof OpsAn>(name: K, args: Parameters<OpsAn[K]>[0]): Promise<unknown> {
  return heap.executor.run('solve', name, args, { onUnits: (units) => meterRemote(units, !painted) });
}
/** A decision: its verdict, after the page adopted what it solved. */
async function decide<K extends Exclude<keyof OpsAn, 'show' | 'figure'>>(name: K, args: Parameters<OpsAn[K]>[0]): Promise<ReturnType<OpsAn[K]> extends Decided<infer V> ? V : never> {
  const out = (await op(name, args)) as Decided<unknown>;
  adoptSettled(out.settled);
  return out.value as never;
}

// ------------------------------------------------------------------ the page's part
/** The App's state between actions: the store's basis, and the questions asked. */
export interface State extends BasisAn {
  lines: string[];
  seed: Seed;
  hosts: Hosts;
  disabled: number[];
  seedNames: Record<string, string>;
  asks: AskedQuestion[];
}
/** A state from rows typed, with nothing muted, renamed or asked. */
export const stateOf = (lines: string[], seed: Seed, hosts: Hosts): State => ({ lines, seed, hosts, disabled: [], seedNames: {}, asks: [] });
/** @deprecated the old name: {@link stateOf}. */
export const sessionOf = stateOf;
export type Session = State;
export type Pre = State;

const activeLines = (s: State): string[] => activeOf(s.lines, s.disabled);
const inputsOf = (s: State) => ({ asks: s.asks.map(({ sentence, via }) => (via ? { sentence, via } : { sentence })), annotations: {} });
const pageDerivation = (s: State): Derivation => derive(activeLines(s), s.seed, s.seedNames, activePins(s.hosts, s.lines.length, s.disabled));

/** The page at stage `figure`: the derivation, its pool held, and the readers of its render. */
function pageFigure(s: State): Derivation {
  const d = pageDerivation(s);
  configurationPool(d.construction).hold();
  readFigure(d, activeLines(s), { ...inputsOf(s), asks: [] });
  return d;
}
/** The page at stage `values`: a new view, the pool complete, the readers, the answers and the two notes. */
function pageValues(s: State): Derivation {
  const d = pageDerivation(s);
  readFigure(d, activeLines(s), inputsOf(s));
  readAfterPaint(d, activeLines(s), s.seed, s.seedNames);
  return d;
}

export interface Phases {
  decide: number; // the decision's operation
  render: number; // the figure part, adopted, and the page's held render — until the figure shows
  figure: number; // decide + render — until the figure/verdict shows
  post: number; // 0 since #2890: the notes are read with the values
  pool: number; // the worker's values stage
  poolSlices: number;
  poolMaxSlice: number;
  settle: number; // the page's values render
  total: number;
  verdict?: string;
}
export const blank = (): Phases => ({ decide: 0, render: 0, figure: 0, post: 0, pool: 0, poolSlices: 0, poolMaxSlice: 0, settle: 0, total: 0 });

/**
 * After the decision: the figure of `s`, first, and its values. Two requests (`figure`, then `show`), where the page sends
 * one `show` and reads its `figure` part: the same work (the second request's figure stage is all lookups), and the page's
 * own render stays out of the operation's call, on the page's lane, whichever executor serves.
 */
async function show(s: State, ph: Phases, onPhase: (p: string) => void): Promise<void> {
  onPhase('render');
  let t = now();
  adoptSettled((await op('figure', { basis: s, inputs: inputsOf(s) })) as Settled);
  pageFigure(s);
  ph.render = now() - t;
  ph.figure = ph.decide + ph.render;
  painted = true;
  action?.painted(); // the figure is on screen: the values are after the paint
  onPhase('pool');
  t = now();
  const shown = (await op('show', { basis: s, inputs: inputsOf(s) })) as Shown;
  ph.pool = now() - t;
  ph.poolSlices = 1;
  ph.poolMaxSlice = ph.pool;
  onPhase('settle');
  t = now();
  adoptSettled(shown.settled);
  pageValues(s);
  ph.settle = now() - t;
  ph.total = ph.figure + ph.pool + ph.settle;
}

/** A figure on screen and settled, unmeasured. */
export async function shownState(lines: string[], seed: Seed, hosts: Hosts): Promise<State> {
  const s = stateOf(lines, seed, hosts);
  await show(s, blank(), () => {});
  return s;
}
/** A state on screen and settled, unmeasured. */
export async function shownSession(s: State): Promise<void> {
  await show(s, blank(), () => {});
}
/** The empty figure, or any rows, settled: where a walk starts. */
export const settledState = shownState;

/** A student's session starts: nothing is solved yet, in the worker's heap or the page's. */
export function newSession(): void {
  clearAnalyticCaches();
  if (heap !== HERE) heap.clear();
}

/**
 * THE SESSION AN EDIT OF THE LAST ROW IS MEASURED IN (#2888; the meter's one definition of `edit`, the same in every
 * builder): a new session; rows 1..n−1 on screen and settled, unmeasured; all n rows the session's lines, nothing of
 * the n-row figure solved.
 */
export async function beforeLastRowEdit(st: State): Promise<State> {
  newSession();
  const last = st.lines.length - 1;
  const hosts: Hosts = {};
  for (const [k, v] of Object.entries(st.hosts)) if (Number(k) < last) hosts[Number(k)] = v;
  if (last > 0) await shownState(st.lines.slice(0, last), st.seed, hosts);
  return { ...stateOf(st.lines, st.seed, st.hosts) };
}

// ------------------------------------------------------------------ actions
export type ActionKind = 'submit' | 'another' | 'load' | 'delete' | 'edit' | 'llm-commit';
type Out = { ph: Phases; next: State | null };

async function submitBody(st: State, raw: string, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const v = await decide('submit', { raw, basis: st });
  ph.decide = now() - t;
  ph.verdict = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind === 'record' && isHeld(v) ? 'held' : v.kind;
  if (v.kind === 'record') {
    const next: State = {
      ...st,
      lines: [...st.lines, v.line],
      hosts: v.host?.ring ? { ...st.hosts, [st.lines.length]: [...v.host.ring] } : st.hosts,
      seed: v.configuration === undefined ? st.seed : canonicalSeed(v.configuration),
    };
    await show(next, ph, onPhase);
    return { ph, next };
  }
  if (v.kind === 'rename' || v.kind === 'swap') {
    const t2 = now();
    const r = await decide('letter', {
      request: v.kind === 'rename' ? { kind: 'rename', from: v.from, to: v.to } : { kind: 'swap', a: v.a, b: v.b },
      state: { lines: st.lines, disabled: [], queries: [], spokenFor: {}, seed: st.seed },
    });
    ph.decide += now() - t2;
    if ((r.kind === 'rename' || r.kind === 'swap') && r.verdict.kind === 'apply') {
      const next = stateOf([...r.verdict.lines], st.seed, {});
      await show(next, ph, onPhase);
      return { ph, next };
    }
  }
  ph.figure = ph.decide;
  ph.total = ph.decide;
  return { ph, next: null };
}

async function anotherBody(st: State, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const r = await decide('another', { basis: st });
  ph.decide = now() - t;
  ph.verdict = r.found ? 'found' : 'none';
  if (!r.found) {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const next = { ...st, seed: r.seed };
  await show(next, ph, onPhase);
  return { ph, next };
}

/** Load (file / share link / restored session): a NEW session; the audit, then the loaded figure. */
async function loadBody(lines: string[], seed: Seed, hosts: Hosts, onPhase: (p: string) => void): Promise<Out> {
  newSession();
  const ph = blank();
  onPhase('decide');
  const t = now();
  await decide('audit', { lines, disabled: [], hosts });
  ph.decide = now() - t;
  const next = stateOf(lines, seed, hosts);
  await show(next, ph, onPhase);
  return { ph, next };
}

/** Delete a row (removeLine: no decision, the seed is kept, hosts shift). */
async function deleteBody(st: State, index: number, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  const hosts: Hosts = {};
  for (const [k, v] of Object.entries(st.hosts)) {
    const i = Number(k);
    if (i < index) hosts[i] = v;
    else if (i > index) hosts[i - 1] = v;
  }
  const next: State = { ...st, lines: st.lines.filter((_, i) => i !== index), hosts };
  await show(next, ph, onPhase);
  return { ph, next };
}

async function editBody(st: State, index: number, text: string, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const r = await decide('edit', { index, text, basis: st });
  ph.decide = now() - t;
  ph.verdict = r.ok ? 'ok' : 'refused';
  if (!r.ok) {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const { [index]: _gone, ...rest } = st.hosts;
  void _gone;
  const hosts: Hosts = r.host ? { ...rest, [index]: [...(r.host as { ring: string[] }).ring] } : rest;
  const next: State = { ...st, lines: st.lines.map((l, j) => (j === index ? text : l)), hosts };
  await show(next, ph, onPhase);
  return { ph, next };
}

/** The mute checkbox (`App.tsx` `toggleRow`): muting applies at once, un-muting faces the typed-line gate. */
async function toggleBody(s: State, index: number, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const v = await decide('toggle', { index, basis: s });
  ph.decide = now() - t;
  ph.verdict = v.kind;
  if (v.kind !== 'apply') {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const next: State = { ...s, disabled: v.disabled };
  await show(next, ph, onPhase);
  return { ph, next };
}

/** Undo or redo: the store restores a basis (no decision) and the page shows its figure. */
async function showBody(s: State, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  await show(s, ph, onPhase);
  return { ph, next: s };
}

/**
 * THE QUESTIONS A FIGURE'S OWN MENUS OFFER, in the order a student meets them: every locus chip, then the measure menu's
 * questions of each point, curve and segment in figure order; the first {@link ASK_LIMIT}.
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
 * THE ASK LANE: each question pressed in turn; after each press the page asks the worker for the figure's answers to
 * every question asked (the figure stage is a lookup; the values stage answers), adopts them and reads them. The
 * questions stay asked: every later figure of the session is answered for them too.
 */
async function askBody(s: State, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('render');
  const t = now();
  const d = pageDerivation(s);
  let next = s;
  for (const q of menuQuestions(d)) {
    next = { ...next, asks: q.chip ? pressChip(next.asks, q.sentence) : toggleDrawn(next.asks, q.sentence) };
    await show(next, blank(), () => {});
  }
  ph.render = now() - t;
  ph.figure = ph.render;
  ph.total = ph.render;
  ph.verdict = `${next.asks.length} asked`;
  return { ph, next };
}

/** The first capital no line of the session uses: what a student would rename a point to. */
function freeLetter(lines: readonly string[]): string | null {
  const text = lines.join(' ');
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!text.includes(ch)) return ch;
  return null;
}

/** A LETTER RENAMED from the canvas popover: the figure's first lettered point takes the first free capital. */
async function renameBody(s: State, onPhase: (p: string) => void): Promise<Out> {
  const ph = blank();
  onPhase('decide');
  const t = now();
  const cur = pageDerivation(s);
  const from = cur.figure.points.find((p) => /^[A-Z]$/.test(p.id))?.id;
  const to = freeLetter(s.lines);
  const r = from && to ? await decide('letter', { request: { kind: 'rename', from, to }, state: { lines: s.lines, disabled: s.disabled, queries: s.asks, spokenFor: {}, seed: s.seed, seedNames: s.seedNames, hosts: s.hosts } }) : null;
  const v = r && r.kind === 'rename' ? r.verdict : null;
  ph.decide = now() - t;
  ph.verdict = !v ? 'none' : v.kind === 'apply' ? 'apply' : `refused:${v.error.key}`;
  if (!v || v.kind !== 'apply') {
    ph.figure = ph.decide;
    ph.total = ph.decide;
    return { ph, next: null };
  }
  const hosts: Hosts = {};
  for (const [k, ring] of Object.entries(v.hosts ?? s.hosts)) hosts[Number(k)] = [...ring];
  const next: State = { ...s, lines: [...v.lines], asks: [...v.queries], seedNames: { ...v.seedNames }, hosts };
  await show(next, ph, onPhase);
  return { ph, next };
}

// ------------------------------------------------------------------ the measured actions
let action: MeteredAction | null = null;
type PhaseCb = (p: string) => void;
const quiet: PhaseCb = () => {};

/** Run one action under the meter. Everything is before the paint until the figure part is drawn. */
async function metered(fn: () => Promise<Out>): Promise<Out & { work: WorkCounts }> {
  const m = meterAction();
  action = m;
  painted = false;
  try {
    const r = await fn();
    return { ...r, work: m.end() };
  } catch (e) {
    m.end();
    throw e;
  } finally {
    action = null;
    painted = false;
  }
}

export const doSubmit = (st: State, raw: string, onPhase: PhaseCb = quiet) => metered(() => submitBody(st, raw, onPhase));
export const doAnother = (st: State, onPhase: PhaseCb = quiet) => metered(() => anotherBody(st, onPhase));
export const doLoad = (lines: string[], seed: Seed, hosts: Hosts, onPhase: PhaseCb = quiet) => metered(() => loadBody(lines, seed, hosts, onPhase));
export const doDelete = (st: State, index: number, onPhase: PhaseCb = quiet) => metered(() => deleteBody(st, index, onPhase));
export const doEdit = (st: State, index: number, text: string, onPhase: PhaseCb = quiet) => metered(() => editBody(st, index, text, onPhase));
export const doToggle = (s: State, index: number, onPhase: PhaseCb = quiet) => metered(() => toggleBody(s, index, onPhase));
export const doShow = (s: State, onPhase: PhaseCb = quiet) => metered(() => showBody(s, onPhase));
export const doAsk = (s: State, onPhase: PhaseCb = quiet) => metered(() => askBody(s, onPhase));
export const doRename = (s: State, onPhase: PhaseCb = quiet) => metered(() => renameBody(s, onPhase));
