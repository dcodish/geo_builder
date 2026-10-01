/**
 * #1615 (ADR-3D-293) — ONE MECHANISM: A COORDINATE GIVEN PLACES ANY POINT THAT SITS ON SOMETHING.
 *
 * The operator, playing T12 of PR #1617's sheet: *"why cant it accept it? if n=0 and p=0 its good"* —
 * «הישר l1: x = (0,0,0) + t(1,0,0) · P על הישר l1 · P(3, n, p)» was refused although P = (3,0,0) lies on l1.
 * Then: *"are you proposing to keep 2 kinds of points and move to a single mechanism that is more robust?"*
 *
 * The answer is one generic step (`solveCoordDeterminations`) over the sampled-carrier table: probe the point
 * through the real point pass, solve the stated components for its parameters, place it when one solution
 * exists inside the parameters' ranges. Segments, axes, lines, planes and every later carrier kind share it.
 *
 * Every submit goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { claimSeeds } from '../engine/claims';
import { freeDofCount3 } from '../engine/evaluate';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`setup line «${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

const verdict = (st: St, line: string) => {
  const v = decideSubmit3(st, line);
  return v.kind === 'refused' ? v.error.code : v.kind;
};

/** The point at every verification seed, rounded to 9 places. */
const at = (st: St, id: string) =>
  claimSeeds(st.seed).map((s) => {
    const p = derive3(st.facts, s).positions.get(id)!;
    return [p.x, p.y, p.z].map((x) => +x.toFixed(9) + 0);
  });

const LINE = ['הישר l1: x = (0,0,0) + t(1,0,0)', 'P על הישר l1'];
const PLANE = ['המישור π: z = 0', 'P על המישור π'];

describe('#1615 — the operator’s T12: a rider on a LINE is placed', () => {
  for (const line of ['P(3, n, p)', 'P(3,0,0)', 'P = (3,0,0)']) {
    it(`«${line}» records, every row ok, and P is (3,0,0) at every verification seed`, () => {
      const v = decideSubmit3(build(LINE), line);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      const st = { facts: v.facts, seed: v.seed };
      expect(Object.values(derive3(st.facts, st.seed).status).every((s) => s === 'ok')).toBe(true);
      for (const p of at(st, 'P')) expect(p).toEqual([3, 0, 0]);
    });
  }
  it('a line written in the other direction places P the same', () => {
    const v = decideSubmit3(build(['הישר l1: x = (0,0,0) + t(-1,0,0)', 'P על הישר l1']), 'P(3,0,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'P')) expect(p).toEqual([3, 0, 0]);
  });
  it('a slanted line through a non-origin anchor: P(3,4,0) on x = (1,2,0) + t(1,1,0)', () => {
    const v = decideSubmit3(build(['הישר l1: x = (1,2,0) + t(1,1,0)', 'P על הישר l1']), 'P(3,4,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'P')) expect(p).toEqual([3, 4, 0]);
  });
  it('off the line is false as stated: «P(3,1,0)» → «בדקו את החישוב»', () => {
    expect(verdict(build(LINE), 'P(3,1,0)')).toBe('claim-refuted');
  });
});

describe('#1615 — a rider on a PLANE is placed by the same step', () => {
  it('«P(1,2,0)» on z = 0 records and P is (1,2,0)', () => {
    const v = decideSubmit3(build(PLANE), 'P(1,2,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'P')) expect(p).toEqual([1, 2, 0]);
  });
  it('off the plane is false as stated: «P(1,2,5)» → «בדקו את החישוב»', () => {
    expect(verdict(build(PLANE), 'P(1,2,5)')).toBe('claim-refuted');
  });
  it('ONE coordinate does not fix a plane rider: «P(1, n, p)» is the tool-limit message, nothing invented', () => {
    expect(verdict(build(PLANE), 'P(1, n, p)')).toBe('given-not-drivable');
  });
});

describe('#1615 — the placement carries the figure with it', () => {
  it('a point built from the rider follows it: «M אמצע AP» after «P(3,0,0)» is (2, 0, 0) with A(1,0,0)', () => {
    const v = decideSubmit3(build(['A(1,0,0)', ...LINE, 'P(3,0,0)']), 'M אמצע AP');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'M')) expect(p).toEqual([2, 0, 0]);
  });
  it('the same figure in the other entry order: the midpoint first, then the coordinate', () => {
    const v = decideSubmit3(build(['A(1,0,0)', ...LINE, 'M אמצע AP']), 'P(3,0,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'M')) expect(p).toEqual([2, 0, 0]);
  });
  it('restated identically → already known; restated elsewhere on the line → refused (P is placed)', () => {
    const v = decideSubmit3(build(LINE), 'P(3,0,0)');
    if (v.kind !== 'record') throw new Error('setup');
    const st = { facts: v.facts, seed: v.seed };
    expect(verdict(st, 'P(3,0,0)')).toBe('already-stated');
    expect(verdict(st, 'P(4,0,0)')).toBe('claim-refuted');
  });
});

describe('#1615 — #1561’s cases now run through the one step, with the same answers', () => {
  for (const [title, setup, line, id, want] of [
    ['a rider on a segment', ['A(0,0,0)', 'B(2,0,0)', 'K על AB'], 'K(1,0,0)', 'K', [1, 0, 0]],
    ['a point on the positive x-axis', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x'], 'D(3,0,0)', 'D', [3, 0, 0]],
  ] as [string, string[], string, string, number[]][]) {
    it(`${title}: «${line}» places ${id}`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('record');
      if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, id)) expect(p).toEqual(want);
    });
  }
  for (const [title, setup, line] of [
    ['off the segment', ['A(0,0,0)', 'B(2,0,0)', 'K על AB'], 'K(1,5,0)'],
    ['past the segment’s end', ['A(0,0,0)', 'B(2,0,0)', 'K על AB'], 'K(5,0,0)'],
    ['the wrong side of the stated axis', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x'], 'D(-3,0,0)'],
  ] as [string, string[], string][]) {
    it(`${title}: «${line}» → «בדקו את החישוב»`, () => expect(verdict(build(setup), line)).toBe('claim-refuted'));
  }
});

describe('#1615 — the status line counts a placed point as fixed', () => {
  const dof = (lines: readonly string[]) => {
    const st = build(lines);
    const d = derive3(st.facts, st.seed);
    return freeDofCount3(d.construction, d.resolved);
  };
  for (const [title, setup, line] of [
    ['a line rider', LINE, 'P(3,0,0)'],
    ['a plane rider', PLANE, 'P(1,2,0)'],
    ['a segment rider', ['A(0,0,0)', 'B(2,0,0)', 'K על AB'], 'K(1,0,0)'],
    ['an axis point', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x'], 'D(3,0,0)'],
  ] as [string, string[], string][]) {
    it(`${title}: one degree of freedom or more before «${line}», none after`, () => {
      expect(dof(setup)).toBeGreaterThan(0);
      expect(dof([...setup, line])).toBe(0);
    });
  }
});
