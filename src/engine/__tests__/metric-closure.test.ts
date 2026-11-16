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

/**
 * #2601 (ADR-837) — a triangle circumscribed about a circle: every side is longer than the diameter. The two shapes the
 * engine builds an incircle in, as it builds them (read off `replay` at cd8bab8e).
 */
const ord = (...points: string[]): Constraint => ({ type: 'collinear-order', points });
/** «מעגל O ברדיוס r» · «משולש ABC חוסם את מעגל O»: three tangents at free touch points, the vertices their crossings. */
const tangentRing = (r: number, extra: Constraint[] = [], orders: [boolean, boolean, boolean] = [true, true, true]): Construction => {
  const t = ['@t-O-ABC-0', '@t-O-ABC-1', '@t-O-ABC-2'];
  const order = [ord('A', t[1]!, 'B'), ord('B', t[2]!, 'C'), ord('C', t[0]!, 'A')].filter((_, i) => orders[i]);
  return fig(
    [
      fp('O', 0, 0),
      { kind: 'circle', id: 'circle-O', center: 'O', radius: { via: 'length', value: r } } as GeoObject,
      ...t.map((id, i) => ({ kind: 'on-circle', id, circle: 'circle-O', theta: 0.4 + (i * 2 * Math.PI) / 3, free: true }) as GeoObject),
      ...t.map((at) => ({ kind: 'line', id: `tan-${at}`, spec: { via: 'tangent', circle: 'circle-O', at } }) as GeoObject),
      { kind: 'line-intersection', id: 'A', line1: `tan-${t[0]}`, line2: `tan-${t[1]}` } as GeoObject,
      { kind: 'line-intersection', id: 'B', line1: `tan-${t[1]}`, line2: `tan-${t[2]}` } as GeoObject,
      { kind: 'line-intersection', id: 'C', line1: `tan-${t[2]}`, line2: `tan-${t[0]}` } as GeoObject,
    ],
    [...extra, ...order],
  );
};
/** «משולש ABC» · «מעגל O חסום במשולש ABC»: O the crossing of two internal bisectors, the feet on the sides the touches. */
const incentre = (extra: Constraint[] = []): Construction =>
  fig(
    [
      fp('A', 2, 3.6),
      fp('B', 6, 0),
      fp('C', 0, 0),
      { kind: 'line', id: 'bis-CAB', spec: { via: 'bisector', vertex: 'A', p: 'C', q: 'B' } } as GeoObject,
      { kind: 'line', id: 'bis-ABC', spec: { via: 'bisector', vertex: 'B', p: 'A', q: 'C' } } as GeoObject,
      { kind: 'line-intersection', id: 'O', line1: 'bis-CAB', line2: 'bis-ABC' } as GeoObject,
      { kind: 'foot', id: '@f-AB', from: 'O', a: 'A', b: 'B' } as GeoObject,
      { kind: 'circle', id: 'circle-O', center: 'O', radius: { via: 'through', point: '@f-AB' } } as GeoObject,
      { kind: 'foot', id: '@f-BC', from: 'O', a: 'B', b: 'C' } as GeoObject,
      { kind: 'foot', id: '@f-CA', from: 'O', a: 'C', b: 'A' } as GeoObject,
    ],
    [...extra, ord('A', '@f-AB', 'B'), ord('B', '@f-BC', 'C'), ord('C', '@f-CA', 'A')],
  );

describe('metricClosureImpossibility — a triangle circumscribed about a circle (#2601, ADR-837)', () => {
  it('the report: «מעגל O ברדיוס 3» · «משולש ABC חוסם את מעגל O» · «AB = 4» is proven; every side gets the floor', () => {
    const m = metricClosureImpossibility(tangentRing(3, [d('A', 'B', 4)]));
    expect(m).not.toBeNull();
    expect([m!.a, m!.b].sort()).toEqual(['A', 'B']);
    expect(m!.lo).toBeGreaterThan(6); // 2r·√(1 + ρ) = 6.06…
    expect(metricClosureImpossibility(tangentRing(3, [d('B', 'C', 4)]))).not.toBeNull();
    expect(metricClosureImpossibility(tangentRing(3, [d('C', 'A', 1)]))).not.toBeNull();
  });

  it('the boundary: a side EQUAL to the diameter is proven (strict); a side just past what the solver draws is not', () => {
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 6)]))).not.toBeNull();
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 6.05)]))).not.toBeNull();
    // measured through the whole pipeline at cd8bab8e: 6.15 builds (the order's 2 % margin puts the least drawable
    // side near 2r·√(1 + 2ρ) = 6.12); the closure must never exclude it, nor the sides above it
    for (const ab of [6.15, 6.2, 6.5, 40]) expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', ab)])), `AB = ${ab}`).toBeNull();
  });

  it('the radius from the side: «AB = 4» first, then a radius over 2 is proven, a radius under it is not', () => {
    const free = (r: number) => {
      const c = tangentRing(1, [d('A', 'B', 4), d('O', '@t-O-ABC-1', r)]);
      return fig(c.objects.map((o) => (o.kind === 'circle' ? ({ ...o, radius: { via: 'through', point: '@t-O-ABC-0' } } as GeoObject) : o)), c.constraints);
    };
    expect(metricClosureImpossibility(free(2.5))).not.toBeNull();
    expect(metricClosureImpossibility(free(1.9))).toBeNull();
  });

  it('two orders already make the circle the incircle (a drop-one fold); one order, or none, is an excircle too: no floor', () => {
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 4)], [true, false, true]))).not.toBeNull();
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 4)], [false, true, true]))).not.toBeNull();
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 4)], [false, false, true]))).toBeNull();
    expect(metricClosureImpossibility(tangentRing(3, [d('A', 'B', 4)], [false, false, false]))).toBeNull();
  });

  it('the incentre shape: a side under the diameter is proven, a longer one is not', () => {
    expect(metricClosureImpossibility(incentre([d('O', '@f-AB', 3), d('A', 'B', 4)]))).not.toBeNull();
    expect(metricClosureImpossibility(incentre([d('O', '@f-AB', 3), d('B', 'C', 5.9)]))).not.toBeNull();
    expect(metricClosureImpossibility(incentre([d('O', '@f-AB', 3), d('A', 'B', 7)]))).toBeNull();
  });

  it('the floor gives no explanation of its own: the refusal keeps the plain sentence', () => {
    expect(explainLengthConflict(tangentRing(3, [d('A', 'B', 4)]))).toBeNull();
  });
});
