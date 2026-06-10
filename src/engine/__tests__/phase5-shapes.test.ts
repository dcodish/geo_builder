/**
 * Phase-5 shape family: triangle, rectangle, rhombus, trapezoid.
 * Each builds a geometrically correct figure, stays stable when a free vertex
 * moves, and parses from typed He/En utterances.
 */

import { describe, it, expect } from 'vitest';
import type { Vec } from '../types';
import { LEN_EPS } from '../types';
import { build, applyStep, emptyConstruction, maxDelta } from '../step';
import { dist, sub, angleDeg } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
const parallel = (p: Vec, q: Vec, r: Vec, s: Vec) => {
  const u = sub(q, p);
  const v = sub(s, r);
  return Math.abs(u.x * v.y - u.y * v.x) < 1e-9;
};

describe('triangle', () => {
  it('builds 3 vertices, 3 sides, a polygon, and is non-degenerate', () => {
    const { construction, positions } = build([{ type: 'triangle', ids: ['A', 'B', 'C'] }]);
    expect(construction.objects.filter((o) => o.kind === 'segment')).toHaveLength(3);
    expect(construction.objects.filter((o) => o.kind === 'polygon')).toHaveLength(1);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!;
    expect(Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x))).toBeGreaterThan(1e-6); // area > 0
  });
});

describe('rectangle', () => {
  it('builds 4 right angles with equal opposite sides', () => {
    const { positions } = build([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }]);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;
    expect(angleDeg(A, B, D)).toBeCloseTo(90, 6);
    expect(angleDeg(B, A, C)).toBeCloseTo(90, 6);
    expect(dist(A, B)).toBeCloseTo(dist(D, C), 9);
    expect(dist(A, D)).toBeCloseTo(dist(B, C), 9);
    expect(parallel(A, B, D, C)).toBe(true);
  });

  it('stays a rectangle and stable when the base moves', () => {
    const r1 = applyStep(emptyConstruction(), { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] });
    const r2 = applyStep(r1.construction, { type: 'free-point', id: 'B', x: 8, y: 2 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const A = r2.positions.get('A')!, B = r2.positions.get('B')!, C = r2.positions.get('C')!;
    expect(angleDeg(A, B, r2.positions.get('D')!)).toBeCloseTo(90, 6); // still right-angled
    expect(dot(sub(B, A), sub(C, B))).toBeCloseTo(0, 6); // AB ⟂ BC
    expect(maxDelta(r1.positions, r2.positions, ['A'])).toBeLessThan(LEN_EPS); // A unmoved
  });
});

describe('rhombus', () => {
  it('builds 4 equal sides (a parallelogram)', () => {
    const { positions } = build([{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }]);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;
    const s = dist(A, B);
    expect(dist(B, C)).toBeCloseTo(s, 9);
    expect(dist(C, D)).toBeCloseTo(s, 9);
    expect(dist(D, A)).toBeCloseTo(s, 9);
    expect(parallel(A, B, D, C)).toBe(true); // opposite sides parallel
  });
});

describe('trapezoid', () => {
  it('builds exactly one pair of parallel sides (AB ∥ DC, not AD ∥ BC)', () => {
    const { positions } = build([{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }]);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;
    expect(parallel(A, B, D, C)).toBe(true); // the parallel pair
    expect(parallel(A, D, B, C)).toBe(false); // the legs are not parallel
  });
});

describe('shapes parse from typed utterances (he/en)', () => {
  const cases: [string, string][] = [
    ['triangle ABC', 'משולש ABC'],
    ['rectangle ABCD', 'מלבן ABCD'],
    ['rhombus ABCD', 'מעוין ABCD'],
    ['trapezoid ABCD', 'טרפז ABCD'],
  ];
  for (const [en, he] of cases) {
    it(`${en} / ${he}`, () => {
      for (const u of [en, he]) {
        const r = parse(u);
        expect(r.ok, `"${u}"`).toBe(true);
        if (r.ok) expect(build(r.commands).construction.objects.length).toBeGreaterThan(0);
      }
    });
  }
});
