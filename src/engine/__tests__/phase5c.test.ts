/**
 * Phase-5c engine unit tests (docs/09-implementation-plan.md §Phase 5c).
 * Circle primitives: a circle (centre + radius), points on it (inscribed),
 * antipode/diameter, arc midpoint, line∩circle, and the tangent line. The
 * corpus Q5–Q7 reproduction (from typed utterances) lives in phase5c.corpus.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { build } from '../step';
import { dist, sub } from '../geometry';

const dot = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.x + u.y * v.y;

const CIRC = { type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as const;

describe('circle + point on circle', () => {
  it('creates the centre and places a point at the radius distance', () => {
    const { construction, positions } = build([CIRC, { type: 'point-on-circle', id: 'A', circle: 'circle-O' }]);
    expect(positions.get('O')).toBeTruthy(); // centre auto-created
    expect(dist(positions.get('O')!, positions.get('A')!)).toBeCloseTo(5, 9);
    expect(construction.objects.some((o) => o.kind === 'circle' && o.id === 'circle-O')).toBe(true);
  });

  it('spreads several inscribed points so none coincide, all on the circle', () => {
    const { positions } = build([
      CIRC,
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    ]);
    const O = positions.get('O')!;
    const pts = ['A', 'B', 'C'].map((id) => positions.get(id)!);
    for (const p of pts) expect(dist(O, p)).toBeCloseTo(5, 9);
    expect(dist(pts[0], pts[1])).toBeGreaterThan(1e-3);
    expect(dist(pts[1], pts[2])).toBeGreaterThan(1e-3);
    expect(dist(pts[0], pts[2])).toBeGreaterThan(1e-3);
  });

  it('radius can be set by a point on it (circle-through)', () => {
    const { positions } = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'free-point', id: 'P', x: 3, y: 4 },
      { type: 'circle-through', id: 'circle-O', center: 'O', through: 'P' },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
    ]);
    expect(dist(positions.get('O')!, positions.get('A')!)).toBeCloseTo(5, 9); // |OP| = 5
  });
});

describe('diameter (antipode)', () => {
  it('D and E are antipodal: O is their midpoint, both at the radius', () => {
    const { construction, positions } = build([CIRC, { type: 'diameter', id1: 'D', id2: 'E', circle: 'circle-O' }]);
    const O = positions.get('O')!, D = positions.get('D')!, E = positions.get('E')!;
    expect(dist(O, D)).toBeCloseTo(5, 9);
    expect(dist(O, E)).toBeCloseTo(5, 9);
    expect((D.x + E.x) / 2).toBeCloseTo(O.x, 9); // O is the midpoint of DE
    expect((D.y + E.y) / 2).toBeCloseTo(O.y, 9);
    expect(dist(D, E)).toBeCloseTo(10, 9); // a full diameter
    expect(construction.objects.some((o) => o.kind === 'segment' && o.id === 'seg-DE')).toBe(true);
  });
});

describe('arc midpoint', () => {
  it('lies on the circle and is equidistant from the two arc endpoints', () => {
    const { positions } = build([
      CIRC,
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'arc-midpoint', id: 'M', circle: 'circle-O', from: 'B', to: 'C' },
    ]);
    const O = positions.get('O')!, B = positions.get('B')!, C = positions.get('C')!, M = positions.get('M')!;
    expect(dist(O, M)).toBeCloseTo(5, 9); // on the circle
    expect(dist(M, B)).toBeCloseTo(dist(M, C), 6); // equidistant from B and C (arc midpoint)
  });

  it('the other branch is the antipodal arc midpoint', () => {
    const base = [
      CIRC,
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    ] as const;
    const m0 = build([...base, { type: 'arc-midpoint', id: 'M', circle: 'circle-O', from: 'B', to: 'C', branch: 0 }]);
    const m1 = build([...base, { type: 'arc-midpoint', id: 'M', circle: 'circle-O', from: 'B', to: 'C', branch: 1 }]);
    const O = m0.positions.get('O')!;
    const M0 = m0.positions.get('M')!, M1 = m1.positions.get('M')!;
    // antipodal: M1 = 2·O − M0
    expect(M1.x).toBeCloseTo(2 * O.x - M0.x, 6);
    expect(M1.y).toBeCloseTo(2 * O.y - M0.y, 6);
  });
});

describe('line ∩ circle', () => {
  it('a line through the centre cuts the circle at two antipodal points', () => {
    const { positions } = build([
      CIRC,
      { type: 'free-point', id: 'P', x: 1, y: 0 }, // a second point so the line is defined through O
      { type: 'line-through', id: 'lOP', a: 'O', b: 'P' },
      { type: 'line-circle-intersection', id: 'X', line: 'lOP', circle: 'circle-O', branch: 0 },
      { type: 'line-circle-intersection', id: 'Y', line: 'lOP', circle: 'circle-O', branch: 1 },
    ]);
    const O = positions.get('O')!, X = positions.get('X')!, Y = positions.get('Y')!;
    expect(dist(O, X)).toBeCloseTo(5, 9);
    expect(dist(O, Y)).toBeCloseTo(5, 9);
    expect(dist(X, Y)).toBeCloseTo(10, 9); // antipodal through the centre
  });
});

describe('tangent at a point', () => {
  it('is perpendicular to the radius at the point of tangency', () => {
    // A at the default top angle (0,5); the tangent there is horizontal. Cross it
    // with a transversal to get a second point R on the tangent and check AR ⟂ OA.
    const { positions } = build([
      CIRC,
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'tangent', id: 'tanA', circle: 'circle-O', at: 'A' },
      { type: 'free-point', id: 'P', x: 3, y: -1 },
      { type: 'free-point', id: 'Q', x: 3, y: 9 },
      { type: 'line-through', id: 'pq', a: 'P', b: 'Q' },
      { type: 'line-intersection', id: 'R', line1: 'tanA', line2: 'pq' },
    ]);
    const O = positions.get('O')!, A = positions.get('A')!, R = positions.get('R')!;
    expect(dot(sub(R, A), sub(A, O))).toBeCloseTo(0, 6); // tangent ⟂ radius
    expect(dist(O, R)).toBeGreaterThan(5); // the tangent only grazes the circle (R is outside)
  });
});
