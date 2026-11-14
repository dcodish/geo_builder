/**
 * #2890 ([ADR-3D-492](../../../docs/06b-decisions-3d.md#adr-3d-492) part 2; ADR-W-210 phase 3) — A JOB'S JOURNAL AND ITS
 * ADOPTION, one module at a time.
 *
 * "The other heap" here is this one after `clearSolveCaches3()`: nothing solved, then a CLONE of the journal adopted.
 * (Two real heaps walking every fixture in step is `__tests__/two-heaps-2890.test.ts`.) Each lock names the thing a
 * journal must carry: take it away and the adopting heap solves.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGeo3, clearSolveCaches3, derive3, deriveStats3 } from '../store3';
import { adoptJournal3, recordJournal3, type Journal3, type JournalRecorder3 } from '../journal3';
import { deserializeFigure3 } from '../figureFile3';
import { freeDofCount3, lazyStats3, releaseAdopted3, resolve3, resolveStats3 } from '../../engine/evaluate';
import { seedNumber3 } from '../../engine/components3';
import { dataView } from '../../engine/dataView';
import { readWork } from '../../../shell/workMeter';

const DIR = join(__dirname, '..', '..', '..', 'fixtures3');
const state = () => useGeo3.getState();
const file = (name: string) => {
  const r = deserializeFigure3(readFileSync(join(DIR, `${name}.geo3.json`), 'utf8'));
  if (!r.ok) throw new Error(`fixture ${name} does not load`);
  return r;
};

/** The figure's readers, as the page reads them after an action: the figure (the derive, the DOF line), then the values. */
const readFigure = () => {
  const d = derive3(state().facts, state().seed);
  return { status: d.status, positions: [...d.positions], dof: freeDofCount3(d.construction, d.resolved) };
};
const readValues = () => dataView(derive3(state().facts, state().seed).construction, state().seed);
/** A load, as the App runs it: the store action, then the readers. */
const load = (r: ReturnType<typeof file>) => {
  state().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
  return { figure: readFigure(), values: readValues() };
};

/** What a run costs this heap: units solved, derives and resolves not answered from a memo. */
function counted<T>(run: () => T): { out: T; units: number; derives: number; resolves: number } {
  const [u, d, r] = [readWork().total, deriveStats3.uncached, resolveStats3.uncached + resolveStats3.images];
  const out = run();
  return { out, units: readWork().total - u, derives: deriveStats3.uncached - d, resolves: resolveStats3.uncached + resolveStats3.images - r };
}
const NOTHING = { units: 0, derives: 0, resolves: 0 };
const cost = <T,>(c: { out: T; units: number; derives: number; resolves: number }) => ({ units: c.units, derives: c.derives, resolves: c.resolves });

/** The other heap: nothing solved, the store empty. */
function otherHeap(): void {
  clearSolveCaches3();
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null, lastNotice: null });
}

let rec: JournalRecorder3 | null = null;
const record = (): JournalRecorder3 => (rec = recordJournal3());
beforeEach(() => {
  rec?.stop();
  rec = null;
  otherHeap();
});

describe('#2890 — what one heap solved, the other does not solve again', () => {
  // pins with claims (the origins), nine parts, a two-reading line (the reading memo), a coordinate letter, a leftover turn
  it.each(['pyramid-surd-height-1827', 'nine-separate-shapes-2764', 'edge-point-lengths-only-1680', 'coord-symbol-value-902', 'cube-turn-about-ab-2378', 'length-letter-2092'])(
    '%s: a load, journaled, cloned and adopted: the same load solves nothing and shows the same figure',
    (name) => {
      const r = file(name);
      const recorder = record();
      const solved = counted(() => load(r));
      const journal = structuredClone(recorder.take());
      recorder.stop();
      expect(solved.units).toBeGreaterThan(0);
      expect(journal.derives.length).toBeGreaterThan(0);
      expect(journal.resolves.length).toBeGreaterThan(0);

      otherHeap();
      adoptJournal3(journal);
      const again = counted(() => load(r));
      expect(cost(again)).toEqual(NOTHING);
      expect(lazyStats3.solvedAgain).toBe(0);
      expect(again.out).toEqual(solved.out);
    },
  );

  it('a journal is plain data: its clone equals it, and every construction it names is listed once with its pin origins', () => {
    const recorder = record();
    load(file('pyramid-surd-height-1827'));
    const journal = recorder.take();
    expect(structuredClone(journal)).toEqual(journal);
    const named = new Set([...journal.derives.map((d) => d.out.construction), ...journal.resolves.map((x) => x.figure), ...journal.verdicts.map((v) => v.figure), ...journal.reaches.map((x) => x.figure), ...journal.lazies.map((l) => l.figure)]);
    expect(new Set(journal.figures.map((f) => f.c))).toEqual(named);
    expect(journal.figures.length).toBe(named.size);
    for (const f of journal.figures) expect(f.origins.length).toBe(f.c.scalarPins.length);
    expect(journal.figures.some((f) => f.origins.some((o) => o?.claim !== undefined && o.fact !== undefined))).toBe(true);
  });

  it('THE PIN ORIGINS must cross: a construction this heap builds itself finds the adopted answers by content only with them', () => {
    const r = file('pyramid-surd-height-1827');
    const recorder = record();
    const solved = counted(() => load(r));
    const taken = recorder.take();
    recorder.stop();
    // the derive is left out, so the adopting heap folds its OWN construction object and has to find the answers by content
    const adoptedThenLoaded = (journal: Journal3) => {
      otherHeap();
      adoptJournal3(journal);
      return counted(() => load(r));
    };
    const withOrigins = adoptedThenLoaded({ ...structuredClone(taken), derives: [] });
    expect(withOrigins.derives).toBe(1); // its own fold
    expect([withOrigins.units, withOrigins.resolves]).toEqual([0, 0]); // and every solve found
    expect(withOrigins.out).toEqual(solved.out);

    const bare = structuredClone(taken);
    for (const f of bare.figures) f.origins = f.origins.map(() => null);
    const without = adoptedThenLoaded({ ...bare, derives: [] });
    expect(without.units).toBe(solved.units); // the adopted constructions have no content here: everything is solved again
    expect(without.out).toEqual(solved.out); // never a wrong figure: a missed entry is solved, and counted
  });

  it('THE NEW ROW\'S ID is the caller\'s: the same id in both heaps and the submit solves nothing; another id and the fold repeats', () => {
    const lines = ['משולש ABC', 'AB = 5'];
    const session = (id: string) => {
      state().submit(lines[0], () => 'row-1');
      readFigure();
      return counted(() => {
        state().submit(lines[1], () => id);
        expect(state().facts.map((f) => f.id)).toEqual(['row-1', id]);
        return { figure: readFigure(), values: readValues() };
      });
    };
    const recorder = record();
    const solved = session('row-2');
    const journal = recorder.take();
    recorder.stop();
    expect(solved.units).toBeGreaterThan(0);

    otherHeap();
    adoptJournal3(structuredClone(journal));
    const same = session('row-2');
    expect(cost(same)).toEqual(NOTHING);
    expect(same.out).toEqual(solved.out);

    otherHeap();
    adoptJournal3(structuredClone(journal));
    const other = session('row-9');
    expect(other.derives).toBeGreaterThan(0); // the row's id is part of the derive's key
    expect(other.out.values).toEqual(solved.out.values);
  });
});

describe('#2890 — two takes: the figure first, the values after', () => {
  const NAME = 'cube-turn-about-ab-2378';
  /** The figure stage and the values stage of one load, each as it would be posted. */
  function staged() {
    const r = file(NAME);
    const recorder = record();
    state().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
    const figure = readFigure();
    const first = structuredClone(recorder.take()); // posted before the values are read
    const values = readValues();
    const second = structuredClone(recorder.take());
    recorder.stop();
    return { r, figure, values, first, second };
  }
  const open = (r: ReturnType<typeof file>) => state().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);

  it('each take holds what was written since the one before, and a lazy value computed on an earlier take\'s figure FOLLOWS in the later one', () => {
    const { first, second } = staged();
    expect(first.derives.length).toBe(1);
    expect(second.derives.length).toBe(0);
    // the first take sends the values in hand for its own figures (the DOF line has read `scalarConsumed`)
    expect(first.lazies.map((l) => l.name)).toContain('scalarConsumed');
    // the second sends values computed since, on figures the FIRST take carried: they follow (the panel's read-back)
    const inSecond = new Set(second.resolves.map((x) => x.key));
    const followed = second.lazies.filter((l) => !inSecond.has(l.key));
    expect(followed.length).toBeGreaterThan(0);
    expect(new Set(followed.map((l) => l.name))).toEqual(new Set(['placementFreedom']));
  });

  it('adopted stage by stage, each stage\'s readers solve nothing', () => {
    const { r, figure, values, first, second } = staged();
    otherHeap();
    adoptJournal3(first);
    expect(cost(counted(() => (open(r), expect(readFigure()).toEqual(figure))))).toEqual(NOTHING);
    adoptJournal3(second);
    expect(cost(counted(() => expect(readValues()).toEqual(values)))).toEqual(NOTHING);
    expect(lazyStats3.solvedAgain).toBe(0);
  });

  it('without the late values the page reads the same panel, but SOLVES for it, counted: an absent value is never a default', () => {
    const { r, values, first, second } = staged();
    otherHeap();
    adoptJournal3(first);
    open(r);
    readFigure();
    const carried = new Set(second.resolves.map((x) => x.key));
    adoptJournal3({ ...second, lazies: second.lazies.filter((l) => carried.has(l.key)) }); // the values that should have followed are dropped
    const read = counted(() => readValues());
    expect(read.out).toEqual(values);
    expect(lazyStats3.solvedAgain).toBeGreaterThan(0);
    expect(read.units).toBeGreaterThan(0);
  });
});

describe('#2890 — the recorder, and adoption\'s rules', () => {
  it('one recording at a time; a take drains; nothing is recorded once it is stopped', () => {
    const recorder = record();
    expect(() => recordJournal3()).toThrow(/already being recorded/);
    load(file('cube-turn-about-ab-2378'));
    expect(recorder.take().resolves.length).toBeGreaterThan(0);
    const empty = recorder.take();
    expect([empty.figures, empty.derives, empty.resolves, empty.verdicts, empty.reaches, empty.lazies, empty.readings]).toEqual([[], [], [], [], [], [], []]);
    recorder.stop();
    expect(() => recorder.take()).toThrow(/no journal is being recorded/);
    const next = record(); // and a new one may start
    next.stop();
  });

  it('adoption keeps what the heap already holds: adopted twice, or after the heap solved the content itself, nothing a reader holds changes', () => {
    const r = file('pyramid-surd-height-1827');
    const recorder = record();
    load(r);
    const journal = recorder.take();
    recorder.stop();
    otherHeap();
    adoptJournal3(structuredClone(journal));
    open(r);
    const d = derive3(state().facts, state().seed);
    const raw = resolve3(d.construction, state().seed, { solvedFrame: true });
    adoptJournal3(structuredClone(journal)); // again
    expect(derive3(state().facts, state().seed)).toBe(d);
    expect(resolve3(d.construction, state().seed, { solvedFrame: true })).toBe(raw);

    otherHeap();
    open(r);
    const own = derive3(state().facts, state().seed); // this heap solved it first
    adoptJournal3(structuredClone(journal));
    expect(derive3(state().facts, state().seed)).toBe(own);
    function open(x: ReturnType<typeof file>) {
      state().loadFigure(x.facts, x.seed, x.queries, x.planeDisplay, x.displayMode, x.dihedralShown);
    }
  });

  it('a journal of another shape is dropped whole: the heap then solves for itself', () => {
    const r = file('cube-turn-about-ab-2378');
    const recorder = record();
    const solved = counted(() => load(r));
    const journal = structuredClone(recorder.take());
    recorder.stop();
    otherHeap();
    adoptJournal3({ ...journal, v: 2 } as unknown as Journal3);
    expect(counted(() => load(r)).units).toBe(solved.units);
  });

  it('AN ADOPTED ANSWER OUTLIVES ITS JOB\'S REPLAY: more answers than the memo keeps a construction arrive whole, and the surplus goes when the replay is over', () => {
    const r = file('cube-free-size-2504');
    const SEEDS = 80; // the memo keeps 64 answers a construction
    const ask = (from = 0, to = SEEDS) => {
      const c = derive3(state().facts, state().seed).construction;
      const at = seedNumber3(state().seed) + 100;
      for (let i = from; i < to; i++) resolve3(c, at + i, { solvedFrame: true });
    };
    const open = () => state().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
    const recorder = record();
    open();
    ask();
    const journal = structuredClone(recorder.take());
    recorder.stop();
    expect(journal.resolves.length).toBeGreaterThanOrEqual(SEEDS);

    otherHeap();
    adoptJournal3(journal);
    open();
    expect(counted(() => ask()).resolves).toBe(0); // the replay asks from the first seed: none was dropped on arrival
    releaseAdopted3(); // the replay is over
    expect(counted(() => ask(SEEDS - 64)).resolves).toBe(0); // the memo's own bound again: the newest 64 are held
    expect(counted(() => ask(0, 1)).resolves).toBe(1); // and the oldest are gone
  });
});
