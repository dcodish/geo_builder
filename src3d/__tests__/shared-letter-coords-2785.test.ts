/**
 * pipeline-lock: the class is a store verdict across sequences and seeds (one letter value at seeds 0–5, the refusal of a
 * restatement and of a value line, the order permutation, the unchanged DOF cue) that the fixture's build + drift net cannot assert.
 *
 * #2785 (ADR-3D-488) — A LETTER WRITTEN IN COORDINATES IS ONE UNKNOWN WHEREVER IT IS WRITTEN.
 *
 * A bare letter («B(k,1,2)») used to lower to a free component NAMED k (#814, first binding wins), so a second
 * point written with k («C(k,3,4)») pinned nothing, «k = 1» reached one place only, and a restatement of a point
 * fixed by coordinates («B(2,15,-8)» then «B(2t,t,k)») read as already held. Now every coordinate letter is a pin
 * symbol (`coordLetterExprs3`) and the `coords-eq` claim judges its symbolic components at the letters' values
 * (`pinLettersAt3`). Through the store (`submit` → `derive3`), seeds 0–5.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3, resolve3 } from '../engine/evaluate';
import { applyCommand3 } from '../engine/apply';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const err = () => useGeo3.getState().lastError;
const build = (lines: string[]) => {
  for (const l of lines) {
    submit(l);
    expect(err(), l).toBeNull();
  }
};
const at = (seed: number) => derive3(useGeo3.getState().facts, seed);
const SEEDS = [0, 1, 2, 3, 4, 5];

beforeEach(reset);

describe('#2785 — a letter shared by two coordinate statements has one value', () => {
  it('R1: «B(k,1,2)» · «C(k,3,4)» on a pyramid draws B.x = C.x at every seed, and k varies across seeds', () => {
    build(['פירמידה SABCD', 'B(k,1,2)', 'C(k,3,4)']);
    const ks: number[] = [];
    for (const s of SEEDS) {
      const d = at(s);
      expect(Object.values(d.status).every((x) => x === 'ok'), `seed ${s}`).toBe(true);
      const B = d.positions.get('B')!, C = d.positions.get('C')!;
      expect(C.x, `seed ${s}`).toBeCloseTo(B.x, 4);
      expect(B.y).toBeCloseTo(1, 6);
      expect(C.z).toBeCloseTo(4, 6);
      ks.push(B.x);
    }
    expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(0.1); // ADR-052: a free letter is sampled
  });

  it('R2: «B(2t, t, k)» · «C(k,1,2)» puts C.x at B.z at every seed', () => {
    build(['פירמידה SABCD', 'B(2t, t, k)', 'C(k,1,2)']);
    for (const s of SEEDS) {
      const d = at(s);
      expect(d.positions.get('C')!.x, `seed ${s}`).toBeCloseTo(d.positions.get("B")!.z, 4);
    }
  });

  it('the order permutation: «C(k,1,2)» before «B(2t, t, k)» ties the same k', () => {
    build(['פירמידה SABCD', 'C(k,1,2)', 'B(2t, t, k)']);
    for (const s of [0, 1, 2]) {
      const d = at(s);
      expect(d.positions.get('C')!.x, `seed ${s}`).toBeCloseTo(d.positions.get("B")!.z, 4);
    }
  });

  it('control: «C(t,1,2)» and «C(k,1,2)» after «B(2t,t,k)» draw different figures', () => {
    build(['פירמידה SABCD', 'B(2t, t, k)', 'C(t,1,2)']);
    const d = at(0);
    expect(d.positions.get('C')!.x).toBeCloseTo(d.positions.get("B")!.y, 4);
    expect(Math.abs(d.positions.get('C')!.x - d.positions.get('B')!.z)).toBeGreaterThan(1e-3);
  });

  it('R3: «k = 1» reaches every coordinate written with k', () => {
    build(['פירמידה SABCD', 'B(k,1,2)', 'C(k,3,4)', 'k = 1']);
    for (const s of [0, 1, 2]) {
      const d = at(s);
      expect(d.positions.get('B')!.x).toBeCloseTo(1, 6);
      expect(d.positions.get('C')!.x).toBeCloseTo(1, 6);
    }
  });

  it.each([
    ['R4', 'B(2t,t,k)'], // 2t = 2 and t = 15
    ['R5', 'B(k,15,k)'], // k = 2 and k = −8
    ['C2 (the numeric twin)', 'B(3,15,-8)'],
  ])('%s: «%s» after «B(2,15,-8)» is refused claim-refuted, the figure untouched', (_n, line) => {
    build(['A(0,0,0)', 'B(2,15,-8)']);
    const before = useGeo3.getState().facts;
    submit(line);
    expect(err()).toEqual({ code: 'claim-refuted' });
    expect(useGeo3.getState().facts).toBe(before);
  });

  it('a TRUE letter restatement of a coordinate point builds, its letters read off the point', () => {
    build(['A(0,0,0)', 'B(2,1,-8)', 'B(2t,t,k)']);
    expect(Object.values(at(0).status).every((x) => x === 'ok')).toBe(true);
    submit('k = 3'); // k = −8 on the figure
    expect(err()).toEqual({ code: 'claim-refuted' });
  });

  it('C1: one statement, one letter twice, on a pyramid: B.x = B.z (unchanged)', () => {
    build(['פירמידה SABCD', 'B(k,1,k)']);
    for (const s of [0, 1, 2]) {
      const B = at(s).positions.get('B')!;
      expect(B.x).toBeCloseTo(B.z, 6);
    }
  });

  it('C3: «B(2t, t, k)» · «k = 1» puts B.z at 1 (unchanged)', () => {
    build(['פירמידה SABCD', 'B(2t, t, k)', 'k = 1']);
    for (const s of [0, 1]) expect(at(s).positions.get('B')!.z).toBeCloseTo(1, 6);
  });

  it('a single-use letter («B(k,1,2)» alone) keeps the DOF cue of the free component it replaces', () => {
    build(['פירמידה SABCD']);
    const c0 = at(0).construction;
    const unnamed = applyCommand3(c0, { type: 'point3', id: 'B', x: null, y: 1, z: 2 });
    if (!unnamed.ok) throw new Error('unnamed pin refused');
    build(['B(k,1,2)']);
    for (const s of [0, 1, 2]) {
      const d = at(s);
      expect(freeDofCount3(d.construction, d.resolved), `seed ${s}`).toBe(freeDofCount3(unnamed.next, resolve3(unnamed.next, s)));
      expect(d.positions.get('B')!.y).toBeCloseTo(1, 6);
      expect(d.positions.get('B')!.z).toBeCloseTo(2, 6);
    }
  });

  it('«k חיובי» after a single-use bare letter keeps B.x positive at every seed', () => {
    build(['פירמידה SABCD', 'B(k,1,2)', 'k חיובי']);
    for (const s of SEEDS) expect(at(s).positions.get('B')!.x, `seed ${s}`).toBeGreaterThan(0);
  });
});
