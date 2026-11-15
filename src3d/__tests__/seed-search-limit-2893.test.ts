/**
 * #2893 ([ADR-3D-494](../../docs/06b-decisions-3d.md#adr-3d-494); ADR-W-210 invariant 3) — THE CONFIGURATION SEARCH IS
 * BOUNDED IN WORK, AND A SEARCH THE LIMIT CUT SHORT SAYS SO.
 *
 * The search is its 200-seed window: walked with no configuration in the stated range, it is FINISHED and the line is
 * refused as ever (operator 2026-11-15, "1a"). It is also bounded by `SEED_SEARCH_LIMIT3` units of work: reached before
 * the window is walked, the round is "not decided" — nothing is added, nothing is refused, and «המשיכו לחפש» goes on through
 * the window from where it stopped. These locks hold the mechanism's own rules:
 *  - the same input gives the same outcome cold and warm and after other figures (a memo hit is charged what it saved);
 *  - a next round judges no seed the round before it judged;
 *  - "not decided" is never served from a memo as a verdict, never a fact, never in the undo history;
 *  - the store's three callers (a typed line, an edit, the press) each leave the figure as it was.
 *
 * pipeline-lock: the checks are the search's stop, its resume and the store's transient state; a fixture or a scenario
 * records only what is added, and here nothing is.
 *
 * test-budget: the store cases on the dear figure each run one round to the real limit (about 10 s of work, by its
 * calibration; about 15 s under vitest): about two minutes in all. The engine cases use small limits of their own.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readWork } from '../../shell/workMeter';
import { isolatedExecutor } from '../../shell/workerExecutor';
import { secondInstance } from '../../shell/__tests__/isolated-ops';
import { offPageAction3, useWork3Executor } from '../app/offPage3';
import { useGeo3, clearSolveCaches3, derive3, decideCommands3, type Fact3, type SearchAsk3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { searchSeed3, seedVerdictStats3, SEED_SEARCH_LIMIT3, type SeedSearch3 } from '../engine/evaluate';
import type { Construction3 } from '../engine/types';

const PYRAMID = 'פירמידה ABCDS שבסיסה ריבוע';
/** a range no seed of these figures shows */
const OUT_OF_REACH = '179 < ∠SAB < 180';
/** a figure the solver places: its seeds cost solver work, so a warm memo has something to save */
const SOLVED = 'ריבוע ABCD;קטע AS'.split(';'); // not a bracketed list: the #1394 parity corpus harvests those as sequences
/** the figure of the operator's 114 s freeze: about a second of solving a seed, so the real limit comes before the window ends */
const DEAR = 'ריבוע ABCD;קטע AS;|SA| = 5'.split(';');
/** the engine cases' own limits, well inside the window of each figure (a closed-form seed is charged its floor, 2) */
const SMALL = 20_000;
const SMALL_CLOSED = 100;

function fresh(): void {
  clearSolveCaches3();
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null, lastNotice: null, lastNotDecided: null });
  useGeo3.temporal.getState().clear();
}
/** The figure with the bound applied, unsearched: the construction the store's search walks. */
function boundFigure(clear = true, lines: readonly string[] = [PYRAMID]): { facts: Fact3[]; c: Construction3 } {
  if (clear) fresh();
  else useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotDecided: null });
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const read = parse3(OUT_OF_REACH);
  if (!read.ok) throw new Error('the bound does not parse');
  const v = decideCommands3(st, OUT_OF_REACH, read.commands, { twins: false, seedSearch: false });
  if (v.kind !== 'record') throw new Error(`the bound is ${v.kind}`);
  return { facts: v.facts, c: derive3(v.facts, v.seed).construction };
}
const stop = (r: SeedSearch3) => (r.kind === 'not-decided' ? { resume: r.resume, spent: r.spent } : r);

describe('#2893 — the search: its window, bounded in work', () => {
  it('THE WINDOW WALKED with no seed is a FINISHED search ("1a"), whatever the limit', () => {
    const { c } = boundFigure();
    expect(searchSeed3(c, 0).kind).toBe('none');
    expect(searchSeed3(c, 0, undefined, 1_000_000_000).kind).toBe('none');
  });

  it('a round the limit cuts short is "not decided", and says where it stopped', () => {
    const { c } = boundFigure();
    const r = searchSeed3(c, 0, undefined, SMALL_CLOSED);
    expect(r.kind).toBe('not-decided');
    if (r.kind !== 'not-decided') return;
    expect(r.resume).toMatchObject({ part: 0, fallback: null });
    expect(r.resume.next).toBeGreaterThan(0);
    expect(r.resume.next).toBeLessThan(200);
    expect(r.spent).toBeGreaterThanOrEqual(SMALL_CLOSED);
  });

  it.each([
    ['a figure placed in closed form (each seed charged its floor)', [PYRAMID], SMALL_CLOSED],
    ['a figure the solver places (each seed charged what it solved)', SOLVED, SMALL],
  ])('THE SAME OUTCOME COLD, WARM, AND AFTER ANOTHER FIGURE: %s', (_name, lines, limit) => {
    const cold = stop(searchSeed3(boundFigure(true, lines).c, 0, undefined, limit));
    expect(cold).toMatchObject({ resume: { fallback: null } });
    // the same round again in the same session: every seed a memo hit, charged what it saved
    expect(stop(searchSeed3(boundFigure(false, lines).c, 0, undefined, limit))).toEqual(cold);
    // a session that solved something else first, and searched this figure from elsewhere
    fresh();
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    useGeo3.getState().resample();
    const { c } = boundFigure(false, lines);
    searchSeed3(c, 3, undefined, limit / 2);
    expect(stop(searchSeed3(c, 0, undefined, limit))).toEqual(cold);
  });

  it('«המשיכו לחפש» GOES ON FROM WHERE IT STOPPED: no seed of the first round is judged again', () => {
    const { c } = boundFigure();
    const first = searchSeed3(c, 0, undefined, SMALL_CLOSED);
    if (first.kind !== 'not-decided') throw new Error('the first round did not stop');
    const hits = seedVerdictStats3.hits;
    const second = searchSeed3(c, 0, first.resume, SMALL_CLOSED);
    expect(seedVerdictStats3.hits - hits).toBe(0);
    expect(second.kind).toBe('not-decided');
    if (second.kind !== 'not-decided') return;
    expect(second.resume.next).toBeGreaterThan(first.resume.next);
  });
});

describe('#2893 — the store: a finished search refuses; "not decided" is neither a verdict nor a fact', () => {
  beforeEach(fresh);
  const build = (lines: readonly string[]) => {
    for (const l of lines) useGeo3.getState().submit(l);
    expect(useGeo3.getState().facts).toHaveLength(lines.length);
  };

  it('A FINISHED SEARCH is refused as ever ("1a"): the pyramid walks its 200 seeds at once', () => {
    build([PYRAMID]);
    useGeo3.getState().submit(OUT_OF_REACH);
    const st = useGeo3.getState();
    expect(st.lastError).toEqual({ code: 'bound-unsatisfiable', id: '' });
    expect(st.lastNotDecided).toBeNull();
    expect(st.facts).toHaveLength(1);
  });

  it('A TYPED LINE WHOSE SEARCH THE LIMIT CUT SHORT is not added, not refused, and not in the undo history', () => {
    build(DEAR);
    const before = useGeo3.getState().facts;
    const history = useGeo3.temporal.getState().pastStates.length;
    useGeo3.getState().submit(OUT_OF_REACH);
    const st = useGeo3.getState();
    expect(st.facts).toBe(before);
    expect(st.lastError).toBeNull();
    expect(st.lastNotDecided).toMatchObject({ action: 'submit', utterance: OUT_OF_REACH });
    expect(st.lastNotDecided!.resume.next).toBeLessThan(200);
    expect(useGeo3.temporal.getState().pastStates.length).toBe(history);
    expect(SEED_SEARCH_LIMIT3).toBeGreaterThan(SMALL);
  });

  it('«not decided» IS NEVER SERVED FROM A MEMO AS A VERDICT; «המשיכו לחפש» goes on from where it stopped', () => {
    build(DEAR);
    useGeo3.getState().submit(OUT_OF_REACH);
    const nd = useGeo3.getState().lastNotDecided!;
    // the same line again: searched again, and stops at the same seed (never a verdict from a memo)
    useGeo3.setState({ lastNotDecided: null });
    useGeo3.getState().submit(OUT_OF_REACH);
    expect(useGeo3.getState().lastError).toBeNull();
    expect(useGeo3.getState().lastNotDecided?.resume).toEqual(nd.resume);
    // the next round goes on through the window
    const ask: SearchAsk3 = { action: 'submit', utterance: OUT_OF_REACH, resume: nd.resume };
    useGeo3.getState().continueSearch(ask);
    const next = useGeo3.getState();
    if (next.lastNotDecided) expect(next.lastNotDecided.resume.next).toBeGreaterThan(nd.resume.next);
    else expect(next.lastError).toEqual({ code: 'bound-unsatisfiable', id: '' }); // the window ended inside the round
    expect(next.facts).toHaveLength(DEAR.length);
  });

  it('an EDIT whose search the limit cut short leaves the old statement standing', () => {
    build([...DEAR, '30 < ∠SAB < 85']);
    const before = useGeo3.getState().facts;
    expect(useGeo3.getState().replaceFact(before[3].id, OUT_OF_REACH)).toBe(false);
    const st = useGeo3.getState();
    expect(st.facts).toBe(before);
    expect(st.lastError).toBeNull();
    expect(st.lastNotDecided).toMatchObject({ action: 'edit', factId: before[3].id, utterance: OUT_OF_REACH });
  });

  it('«הציגו תצורה אחרת» whose search the limit cut short keeps the drawing', () => {
    const { facts } = boundFigure(true, DEAR);
    useGeo3.setState({ facts, seed: 0, lastNotDecided: null });
    useGeo3.getState().resample();
    const st = useGeo3.getState();
    expect(st.seed).toBe(0);
    expect(st.lastNotDecided).toMatchObject({ action: 'press', from: 1 });
  });
});

describe('#2893 — off the page: the worker’s round reaches the page as its outcome', () => {
  const workerHeap = () =>
    secondInstance(async () => {
      const { ops3, takeCheckpoint3 } = await import('../app/ops3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
      const store = await import('../store/store3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
      const { readWork: units } = await import('../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
      return { ops: ops3(), store, units: () => units().total, seed: takeCheckpoint3 };
    });
  let worker: Awaited<ReturnType<typeof workerHeap>>;
  beforeAll(async () => {
    worker = await workerHeap();
    useWork3Executor(isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed }));
  });
  afterAll(() => useWork3Executor(null));

  it('a line whose round stopped: the page solves nothing, and shows the same stop as the worker', async () => {
    fresh();
    worker.store.clearSolveCaches3();
    for (const l of DEAR) await offPageAction3('submit', [l], () => useGeo3.getState().submit(l));
    const page0 = readWork().page;
    await offPageAction3('submit', [OUT_OF_REACH], () => useGeo3.getState().submit(OUT_OF_REACH));
    expect(readWork().page - page0).toBe(0);
    const st = useGeo3.getState();
    expect(st.facts).toHaveLength(DEAR.length);
    expect(st.lastNotDecided).not.toBeNull();
    expect(st.lastNotDecided?.resume).toEqual(worker.store.useGeo3.getState().lastNotDecided?.resume);
  });
});
