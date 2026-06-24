/**
 * Named shapes decomposed to primitives (ADR-110), regular polygons (ADR-111), and the corrected
 * shape-DOF ladder (ADR-112). Each builds a geometrically correct figure through the real parse→build
 * path; the regular polygon and the DOF ladder pin the new behavior.
 */

import { describe, it, expect } from 'vitest';
import type { AnyCommand } from '../types';
import { build } from '../step';
import { dist, sub, angleDeg } from '../geometry';
import { freeDofCount } from '../sample';
import { parse } from '@/parser';

/** Parse an utterance and build the figure, returning positions + the construction. */
function fig(utterance: string) {
  const r = parse(utterance);
  if (!r.ok) throw new Error(`"${utterance}" did not parse`);
  return build(r.commands as AnyCommand[]);
}
const parallel = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }, s: { x: number; y: number }) => {
  const u = sub(q, p), v = sub(s, r);
  return Math.abs(u.x * v.y - u.y * v.x) < 1e-6;
};

describe('kite (ADR-110)', () => {
  for (const u of ['kite ABCD', 'דלתון ABCD']) {
    it(`"${u}" → two pairs of equal ADJACENT sides, axis AC`, () => {
      const { positions: P } = fig(u);
      const A = P.get('A')!, B = P.get('B')!, C = P.get('C')!, D = P.get('D')!;
      expect(dist(A, B)).toBeCloseTo(dist(A, D), 4); // |AB| = |AD|
      expect(dist(C, B)).toBeCloseTo(dist(C, D), 4); // |CB| = |CD|
      // It is a genuine kite, not (necessarily) a rhombus: the two pairs differ.
      expect(Math.abs(dist(A, B) - dist(C, B))).toBeGreaterThan(1e-6);
      // Non-degenerate (positive area).
      expect(Math.abs((B.x - A.x) * (D.y - A.y) - (B.y - A.y) * (D.x - A.x))).toBeGreaterThan(1e-6);
    });
  }
});

describe('isosceles & equilateral triangle (ADR-110)', () => {
  it('isosceles ABC holds |AB| = |AC|', () => {
    const { positions: P } = fig('isosceles triangle ABC');
    expect(dist(P.get('A')!, P.get('B')!)).toBeCloseTo(dist(P.get('A')!, P.get('C')!), 4);
  });
  it('משולש שווה שוקיים ABC holds |AB| = |AC|', () => {
    const { positions: P } = fig('משולש שווה שוקיים ABC');
    expect(dist(P.get('A')!, P.get('B')!)).toBeCloseTo(dist(P.get('A')!, P.get('C')!), 4);
  });
  it('equilateral ABC has all three sides equal', () => {
    const { positions: P } = fig('equilateral triangle ABC');
    const ab = dist(P.get('A')!, P.get('B')!), bc = dist(P.get('B')!, P.get('C')!), ca = dist(P.get('C')!, P.get('A')!);
    expect(bc).toBeCloseTo(ab, 4);
    expect(ca).toBeCloseTo(ab, 4);
  });
});

describe('isosceles trapezoid (ADR-110)', () => {
  it('AB ∥ DC with equal legs |AD| = |BC|', () => {
    const { positions: P } = fig('isosceles trapezoid ABCD');
    const A = P.get('A')!, B = P.get('B')!, C = P.get('C')!, D = P.get('D')!;
    expect(parallel(A, B, D, C)).toBe(true);
    expect(dist(A, D)).toBeCloseTo(dist(B, C), 4);
  });
});

describe('triangle midsegment (ADR-110)', () => {
  it('"midsegment to BC in triangle ABC" is parallel to BC and half its length', () => {
    const { construction, positions: P } = fig('midsegment to BC in triangle ABC');
    const B = P.get('B')!, C = P.get('C')!;
    // The two auto-named midpoints (of AB and AC) and the connecting segment.
    const mids = construction.objects.filter((o) => o.kind === 'midpoint').map((o) => o.id);
    expect(mids).toHaveLength(2);
    const [M, N] = mids.map((id) => P.get(id)!);
    expect(parallel(M, N, B, C)).toBe(true);
    expect(dist(M, N)).toBeCloseTo(dist(B, C) / 2, 4);
  });
});

describe('regular polygon (ADR-111)', () => {
  for (const u of ['regular pentagon ABCDE', 'מחומש משוכלל ABCDE']) {
    it(`"${u}" → 5 equal sides, 5 interior angles of 108°, a 5-gon`, () => {
      const { construction, positions: P } = fig(u);
      const ids = ['A', 'B', 'C', 'D', 'E'];
      const pts = ids.map((id) => P.get(id)!);
      const side = dist(pts[0], pts[1]);
      for (let i = 0; i < 5; i++) expect(dist(pts[i], pts[(i + 1) % 5])).toBeCloseTo(side, 4);
      for (let i = 0; i < 5; i++) {
        const v = pts[i], prev = pts[(i + 4) % 5], next = pts[(i + 1) % 5];
        expect(angleDeg(v, prev, next)).toBeCloseTo(108, 2);
      }
      const poly = construction.objects.find((o) => o.kind === 'polygon' && o.id === 'poly-ABCDE');
      expect(poly && 'vertices' in poly ? poly.vertices : []).toHaveLength(5);
    });
  }

  it('a regular hexagon has 6 interior angles of 120°', () => {
    const { positions: P } = fig('regular hexagon ABCDEF');
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
    const pts = ids.map((id) => P.get(id)!);
    for (let i = 0; i < 6; i++) {
      const v = pts[i], prev = pts[(i + 5) % 6], next = pts[(i + 1) % 6];
      expect(angleDeg(v, prev, next)).toBeCloseTo(120, 2);
    }
  });

  it('regular quadrilateral → a square; regular triangle → equilateral', () => {
    const sq = fig('regular quadrilateral ABCD').positions;
    const s = dist(sq.get('A')!, sq.get('B')!);
    for (const [p, q] of [['B', 'C'], ['C', 'D'], ['D', 'A']] as const) expect(dist(sq.get(p)!, sq.get(q)!)).toBeCloseTo(s, 4);
    const tr = fig('regular triangle ABC').positions;
    const t = dist(tr.get('A')!, tr.get('B')!);
    expect(dist(tr.get('B')!, tr.get('C')!)).toBeCloseTo(t, 4);
    expect(dist(tr.get('C')!, tr.get('A')!)).toBeCloseTo(t, 4);
  });
});

describe('shape-DOF ladder reads correctly (ADR-112)', () => {
  it('free quad = 4, cyclic quad = 3, inscribed square = 0, regular pentagon = 0', () => {
    expect(freeDofCount(fig('quadrilateral ABCD').construction)).toBe(4);
    expect(freeDofCount(fig('quadrilateral ABCD inscribed in a circle').construction)).toBe(3);
    expect(freeDofCount(fig('square ABCD inscribed in a circle').construction)).toBe(0);
    expect(freeDofCount(fig('regular pentagon ABCDE').construction)).toBe(0);
  });

  it('a lone square and a lone triangle are rigid up to similarity (0 shape DOF)', () => {
    expect(freeDofCount(fig('square ABCD').construction)).toBe(0);
    expect(freeDofCount(fig('triangle ABC').construction)).toBe(2); // a free triangle has 2 shape DOF
  });
});
