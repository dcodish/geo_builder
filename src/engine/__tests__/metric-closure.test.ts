/**
 * #2894 / ADR-833 — the metric closure: a proof that no figure holds a construction's lengths, read from its
 * obligations and its objects' parameter-free structure.
 *
 * One-way sound, so the tests come in pairs: an impossible length is proven; the same figure with a length it can
 * take (the exact value, the flat limit, a value inside the reach) proves nothing.
 */
import { describe, expect, it } from 'vitest';
import { explainLengthConflict, metricClosureImpossibility } from '../metricClosure';
import type { Constraint, Construction, GeoObject } from '../types';

const fp = (id: string, x: number, y: number, solve?: Constraint): GeoObject => ({ kind: 'free-point', id, x, y, ...(solve ? { solve: { constraint: solve, branch: 0 } } : {}) }) as GeoObject;
const d = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });
const eq = (a: string, b: string, c: string, dd: string): Constraint => ({ type: 'equal', a, b, c, d: dd });
const ang = (ray1: string, vertex: string, ray2: string, value: number): Constraint => ({ type: 'angle', vertex, ray1, ray2, value });
const fig = (objects: GeoObject[], constraints: Constraint[] = []): Construction => ({ objects, constraints });

/** «ריבוע ABCD» as the engine builds it: A free, B driven by |AB|, C and D the square's derived corners. */
const square = (ab: number, extra: Constraint[] = []): Construction =>
  fig(
    [
      fp('A', 0, 0),
      fp('B', 5, 0, d('A', 'B', ab)),
      { kind: 'derived', id: 'C', rule: 'square-c', a: 'A', b: 'B' } as GeoObject,
      { kind: 'derived', id: 'D', rule: 'square-d', a: 'A', b: 'B' } as GeoObject,
    ],
    [d('A', 'B', ab), ...extra],
  );
/** «מלבן ABCD · AB = 3 · BC = 4»: C a perpendicular offset at B, D the parallelogram's fourth vertex. */
const rectangle = (extra: Constraint[] = []): Construction =>
  fig(
    [
      fp('A', 0, 0),
      fp('B', 6, 0, d('A', 'B', 3)),
      { kind: 'perp-offset', id: 'C', anchor: 'B', from: 'A', to: 'B', dist: 4, solve: { constraint: d('B', 'C', 4), branch: 0 } } as GeoObject,
      { kind: 'parallelogram-vertex', id: 'D', a: 'A', b: 'B', c: 'C' } as GeoObject,
    ],
    [d('A', 'B', 3), d('B', 'C', 4), ...extra],
  );
/** «מעגל O ברדיוס 2» with A on it and B its antipode («AB קוטר»), or B a second free point on it («AB מיתר»). */
const circle2 = (diameter: boolean, extra: Constraint[] = []): Construction =>
  fig(
    [
      fp('O', 0, 0),
      { kind: 'circle', id: 'circle-O', center: 'O', radius: { via: 'length', value: 2 } } as GeoObject,
      { kind: 'on-circle', id: 'A', circle: 'circle-O', theta: 1.57, free: true } as GeoObject,
      diameter ? ({ kind: 'antipode', id: 'B', circle: 'circle-O', of: 'A' } as GeoObject) : ({ kind: 'on-circle', id: 'B', circle: 'circle-O', theta: 4.3, free: true } as GeoObject),
    ],
    extra,
  );

describe('metricClosureImpossibility — the closure over a construction’s lengths', () => {
  it('a square’s diagonal is |AB|·√2: «AC = 10» on a side of 3 is proven, the exact diagonal is not', () => {
    const m = metricClosureImpossibility(square(3, [d('A', 'C', 10)]));
    expect(m).not.toBeNull();
    expect(m!.lo).toBeGreaterThan(m!.hi); // the length whose bounds crossed (which one is the closure's order, not a verdict)
    expect(metricClosureImpossibility(square(3, [d('A', 'C', 3 * Math.SQRT2)]))).toBeNull();
    // within the solver's own acceptance (2e-4) of the diagonal: never proven
    expect(metricClosureImpossibility(square(3, [d('A', 'C', 3 * Math.SQRT2 * (1 + 2e-4))]))).toBeNull();
  });

  it('a rectangle’s right angle fixes its diagonal: «AC = 7» on sides 3 and 4 is proven (the triangle inequality alone allows 7), 5 is not', () => {
    expect(metricClosureImpossibility(rectangle([d('A', 'C', 7)]))).not.toBeNull();
    expect(metricClosureImpossibility(rectangle([d('A', 'C', 5)]))).toBeNull();
    // the opposite side of a parallelogram is the side
    expect(metricClosureImpossibility(rectangle([d('C', 'D', 4)]))).not.toBeNull();
    expect(metricClosureImpossibility(rectangle([d('C', 'D', 3)]))).toBeNull();
  });

  it('an equal-sided triangle: «BC = 5» against «AB = 3» through the stated equalities', () => {
    const tri = (bc: number) => fig([fp('A', 2, 3.6, d('A', 'B', 3)), fp('B', 6, 0), fp('C', 0, 0)], [eq('A', 'B', 'B', 'C'), eq('B', 'C', 'C', 'A'), d('A', 'B', 3), d('B', 'C', bc)]);
    expect(metricClosureImpossibility(tri(5))).not.toBeNull();
    expect(metricClosureImpossibility(tri(3))).toBeNull();
  });

  it('a diameter is 2r and a chord at most 2r; the diameter itself and a shorter chord are not proven', () => {
    expect(metricClosureImpossibility(circle2(true, [d('A', 'B', 6)]))).not.toBeNull();
    expect(metricClosureImpossibility(circle2(true, [d('A', 'B', 4)]))).toBeNull();
    expect(metricClosureImpossibility(circle2(false, [d('A', 'B', 6)]))).not.toBeNull();
    expect(metricClosureImpossibility(circle2(false, [d('A', 'B', 3)]))).toBeNull();
    // the chord as long as the diameter is a real (degenerate-limit) configuration
    expect(metricClosureImpossibility(circle2(false, [d('A', 'B', 4)]))).toBeNull();
  });

  it('a regular polygon over two sides already stated unequal: the equal class meets two values', () => {
    const pent = fig([fp('A', 0, 4), fp('B', -4, 1, d('A', 'B', 3)), fp('C', -2, -4, d('B', 'C', 4)), fp('D', 3, -4), fp('E', 4, 1)], [d('A', 'B', 3), d('B', 'C', 4), eq('A', 'B', 'B', 'C'), eq('B', 'C', 'C', 'D')]);
    expect(metricClosureImpossibility(pent)).not.toBeNull();
  });

  it('a stated angle reads with ANGLE_EPS’s margin: the law of cosines never excludes what the solver accepts', () => {
    // AB = 3, BC = 4, ∠ABC = 90 ⇒ AC = 5; at the solver's 0.5° the diagonal reaches 4.98–5.02
    const tri = (ac: number) => fig([fp('A', 0, 3), fp('B', 0, 0), fp('C', 4, 0)], [d('A', 'B', 3), d('B', 'C', 4), ang('A', 'B', 'C', 90), d('A', 'C', ac)]);
    expect(metricClosureImpossibility(tri(5.02))).toBeNull();
    expect(metricClosureImpossibility(tri(6))).not.toBeNull();
  });

  it('a free circle shares one radius among its points but pins nothing', () => {
    const free = fig(
      [fp('O', 0, 0), { kind: 'circle', id: 'c', center: 'O', radius: { via: 'free', value: 5 } } as GeoObject, { kind: 'on-circle', id: 'A', circle: 'c', theta: 0 } as GeoObject, { kind: 'on-circle', id: 'B', circle: 'c', theta: 2 } as GeoObject],
      [d('O', 'A', 2), d('A', 'B', 6)],
    );
    expect(metricClosureImpossibility(free)).not.toBeNull(); // |OB| = |OA| = 2, so |AB| ≤ 4
    const ok = fig(free.objects, [d('O', 'A', 4), d('A', 'B', 6)]);
    expect(metricClosureImpossibility(ok)).toBeNull();
  });

  it('a figure with no length relation proves nothing', () => {
    expect(metricClosureImpossibility(fig([fp('A', 0, 0), fp('B', 1, 0)]))).toBeNull();
  });
});

describe('explainLengthConflict — which lengths, and why (#2894, ADR-835)', () => {
  it('one stated length against the one the rest forces on that segment', () => {
    const sq = explainLengthConflict(square(3, [d('A', 'C', 10)]), [d('A', 'C', 10)]);
    expect(sq).toMatchObject({ kind: 'value', seg: ['A', 'C'], stated: 10 });
    expect((sq as { forced: number }).forced).toBeCloseTo(3 * Math.SQRT2, 6);
    const rect = explainLengthConflict(rectangle([d('A', 'C', 7)]), [d('A', 'C', 7)]);
    expect(rect).toMatchObject({ kind: 'value', seg: ['A', 'C'], stated: 7 });
    expect((rect as { forced: number }).forced).toBeCloseTo(5, 6);
    const diam = explainLengthConflict(circle2(true, [d('A', 'B', 6)]), [d('A', 'B', 6)]);
    expect(diam).toMatchObject({ kind: 'value', seg: ['A', 'B'], stated: 6 });
    expect((diam as { forced: number }).forced).toBeCloseTo(4, 6);
  });

  it('a stated length against two the rest forces: the triangle inequality, in the triangle they make', () => {
    const w = explainLengthConflict(circle2(false, [d('A', 'B', 6)]), [d('A', 'B', 6)]);
    expect(w).toMatchObject({ kind: 'triangle', tri: ['A', 'B', 'O'], long: ['A', 'B'], longLen: 6, a: ['A', 'O'], b: ['B', 'O'], sum: 4 });
  });

  it('nothing to explain on a figure whose lengths hold', () => {
    expect(explainLengthConflict(square(3, [d('A', 'C', 3 * Math.SQRT2)]))).toBeNull();
  });
});
