/**
 * #1561 (ADR-3D-292) — A COORDINATE GIVEN THAT PINS A POINT'S FREE PARAMETER PLACES THE POINT.
 *
 * The operator, playing T13 of the #1573/#1590 sheet: *"this is an error. why cant K be (1,0,0)??"* —
 * «A(0,0,0) · B(2,0,0) · K על AB · K(1,0,0)» was refused (ADR-3D-291's tool-limit message). K can be (1,0,0):
 * it is the midpoint. Nothing moved it because the pivot runs only with a solid or a free3 point.
 *
 * The fix is M1 without the pivot: the given DETERMINES the parameter in closed form (`readCoordGiven`) and is
 * lowered through the path the tool already honours for that parameter stated directly — #748's rider `t`,
 * the `symbol-value` of «t = 4», the partial record — then recorded as before, pin and arbiter. A given the
 * point's own data contradicts keeps «בדקו את החישוב».
 *
 * Every submit goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { claimSeeds } from '../engine/claims';

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

/** The point's position at every verification seed of the figure. */
const at = (st: St, id: string) => claimSeeds(st.seed).map((s) => derive3(st.facts, s).positions.get(id)!);

const SEG = ['A(0,0,0)', 'B(2,0,0)', 'K על AB'];
const AXIS = 'הקודקוד D נמצא על החלק החיובי של ציר ה-x';

describe('#1561 — the operator’s T13: K is placed at the midpoint', () => {
  for (const line of ['K(1,0,0)', 'K = (1,0,0)', 'K(1, 0, 0)']) {
    it(`«${line}» records, every row ok, and K is (1,0,0) at every verification seed`, () => {
      const v = decideSubmit3(build(SEG), line);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      const st = { facts: v.facts, seed: v.seed };
      expect(Object.values(derive3(st.facts, st.seed).status).every((s) => s === 'ok')).toBe(true);
      for (const p of at(st, 'K')) expect([p.x, p.y, p.z].map((x) => +x.toFixed(9))).toEqual([1, 0, 0]);
    });
  }
  it('any spot strictly inside the segment: «K(0.5,0,0)» places K at (0.5, 0, 0)', () => {
    const v = decideSubmit3(build(SEG), 'K(0.5,0,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'K')) expect(p.x).toBeCloseTo(0.5, 9);
  });
  it('the host written the other way round («K על BA») places K the same', () => {
    const v = decideSubmit3(build(['A(0,0,0)', 'B(2,0,0)', 'K על BA']), 'K(0.5,0,0)');
    expect(v.kind).toBe('record');
    if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'K')) expect(p.x).toBeCloseTo(0.5, 9);
  });
  it('restated identically → already known; restated elsewhere on the segment → refused (t is now stated)', () => {
    const v = decideSubmit3(build(SEG), 'K(1,0,0)');
    if (v.kind !== 'record') throw new Error('setup');
    const st = { facts: v.facts, seed: v.seed };
    expect(verdict(st, 'K(1,0,0)')).toBe('already-stated');
    expect(verdict(st, 'K(1.5,0,0)')).toBe('claim-refuted');
  });
});

describe('#1561 — a point on an axis and a point with a parameter are placed too', () => {
  for (const [title, setup, line] of [
    ['positive x-axis, Hebrew', [AXIS], 'D(3,0,0)'],
    ['positive x-axis, the `=` spelling', [AXIS], 'D = (3,0,0)'],
    ['positive x-axis, English', ['D is on the positive part of the x-axis'], 'D(3,0,0)'],
  ] as [string, string[], string][]) {
    it(`${title}: «${line}» records and D is (3,0,0)`, () => {
      const v = decideSubmit3(build(setup), line);
      expect(v.kind).toBe('record');
      if (v.kind === 'record') for (const p of at({ facts: v.facts, seed: v.seed }, 'D')) expect([p.x, p.y, p.z].map((x) => +x.toFixed(9))).toEqual([3, 0, 0]);
    });
  }
  it('«B(1, t, 2)» then «B(n, 4, p)» gives the letter its value: t = 4 and B = (1, 4, 2)', () => {
    const v = decideSubmit3(build(['B(1, t, 2)']), 'B(n, 4, p)');
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    const d = derive3(v.facts, v.seed);
    expect(d.resolved.param?.value).toBeCloseTo(4, 9);
    for (const p of at({ facts: v.facts, seed: v.seed }, 'B')) expect([p.x, p.y, p.z].map((x) => +x.toFixed(9))).toEqual([1, 4, 2]);
  });
  it('a second, different value after the first is refused', () => {
    const v = decideSubmit3(build([AXIS]), 'D(3,0,0)');
    if (v.kind !== 'record') throw new Error('setup');
    expect(verdict({ facts: v.facts, seed: v.seed }, 'D(4,0,0)')).toBe('claim-refuted');
  });
});

describe('#1561 — a given the point’s own data contradicts still says «בדקו את החישוב»', () => {
  for (const [title, setup, line] of [
    ['off the segment', SEG, 'K(1,5,0)'],
    ['on the segment’s line, past its end', SEG, 'K(5,0,0)'],
    ['the wrong side of the stated axis', [AXIS], 'D(-3,0,0)'],
    ['off the axis', [AXIS], 'D(3,1,0)'],
    ['a coordinate the coord-sym definition fixes', ['B(1, t, 2)'], 'B(3, n, p)'],
    ['a letter that already has a value', ['B(1, t, 2)', 't = 4'], 'B(n, 5, p)'],
    ['a typed point restated elsewhere (unchanged)', ['B(0,7,8)'], 'B(3,7,8)'],
    ['a midpoint restated off its place (unchanged)', ['A(0,0,0)', 'C(2,0,0)', 'M אמצע AC'], 'M(3, n, p)'],
  ] as [string, string[], string][]) {
    it(`${title}: «${line}»`, () => expect(verdict(build(setup), line)).toBe('claim-refuted'));
  }
});
