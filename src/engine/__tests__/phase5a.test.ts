/**
 * Phase-5a acceptance gate (docs/09-implementation-plan.md §Phase 5a).
 * General quadrilateral + parallelogram + arbitrary segment + line∩line
 * intersection, then **reproduce corpus Q1** (parallelogram ABCD, diagonal AC,
 * E on AC, segments BE & BD) end-to-end from typed utterances.
 */

import { describe, it, expect } from 'vitest';
import type { Vec } from '../types';
import { LEN_EPS } from '../types';
import { build, applyStep, emptyConstruction, maxDelta } from '../step';
import { evaluate } from '../evaluate';
import { sub, cross, dist } from '../geometry';
import { parse } from '@/parser';

/** Are vectors p→q and r→s parallel? (zero cross product) */
function parallel(p: Vec, q: Vec, r: Vec, s: Vec): boolean {
  const u = sub(q, p);
  const v = sub(s, r);
  return Math.abs(u.x * v.y - u.y * v.x) < 1e-9;
}

describe('parallelogram', () => {
  it('builds a valid parallelogram (AB∥DC, AD∥BC, D = A+C−B)', () => {
    const { positions } = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;
    // D is the derived 4th vertex
    expect(D.x).toBeCloseTo(A.x + C.x - B.x, 9);
    expect(D.y).toBeCloseTo(A.y + C.y - B.y, 9);
    // opposite sides parallel and equal
    expect(parallel(A, B, D, C)).toBe(true);
    expect(parallel(A, D, B, C)).toBe(true);
    expect(dist(A, B)).toBeCloseTo(dist(D, C), 9);
    expect(dist(A, D)).toBeCloseTo(dist(B, C), 9);
  });

  it('stays a parallelogram and stays stable when a free vertex moves', () => {
    const r1 = applyStep(emptyConstruction(), { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] });
    const r2 = applyStep(r1.construction, { type: 'free-point', id: 'A', x: -2, y: 3 }); // move A
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const A = r2.positions.get('A')!, B = r2.positions.get('B')!, C = r2.positions.get('C')!, D = r2.positions.get('D')!;
    expect(D.x).toBeCloseTo(A.x + C.x - B.x, 9); // still a parallelogram
    expect(parallel(A, B, D, C)).toBe(true);
    // B and C (the untouched free vertices) did not move
    expect(maxDelta(r1.positions, r2.positions, ['B', 'C'])).toBeLessThan(LEN_EPS);
  });
});

describe('shapes compose on existing points (ADR-013)', () => {
  it('builds a square on an existing edge of a parallelogram (the ADFG case)', () => {
    // parallelogram ABCD, then square ADFG sharing side A–D. D is the
    // parallelogram's derived vertex; the square reuses A and D, derives F, G.
    const r1 = applyStep(emptyConstruction(), { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] });
    const r2 = applyStep(r1.construction, { type: 'square', ids: ['A', 'D', 'F', 'G'] });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    const A = r2.positions.get('A')!, D = r2.positions.get('D')!, F = r2.positions.get('F')!, G = r2.positions.get('G')!;
    // A and D are unchanged (reused, not redefined)
    expect(A).toEqual(r1.positions.get('A'));
    expect(D).toEqual(r1.positions.get('D'));
    // ADFG is a genuine square built on edge AD
    expect(dist(D, F)).toBeCloseTo(dist(A, D), 9);
    expect(dist(F, G)).toBeCloseTo(dist(A, D), 9);
    expect(dist(G, A)).toBeCloseTo(dist(A, D), 9);
    // right angle at A between AD and AG
    expect(Math.abs(sub(D, A).x * sub(G, A).x + sub(D, A).y * sub(G, A).y)).toBeLessThan(1e-9);
    // the shared edge A–D is a single segment; both polygons exist
    expect(r2.construction.objects.filter((o) => o.kind === 'segment' && o.id === 'seg-AD')).toHaveLength(1);
    expect(r2.construction.objects.filter((o) => o.kind === 'polygon')).toHaveLength(2);
  });

  it('reuses an existing point named in a derived slot by rotating it to a base slot', () => {
    // square ABCD defines C (derived). "parallelogram PQRC" names C last — where a
    // parallelogram's derived 4th vertex sits. The vertices rotate so C becomes a
    // base corner (reused) and the new P is derived: it builds, order-independent.
    const base = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(base.construction, { type: 'parallelogram', ids: ['P', 'Q', 'R', 'C'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.positions.get('C')).toEqual(base.positions.get('C')); // C reused, unmoved
    for (const id of ['P', 'Q', 'R']) expect(r.positions.get(id)).toBeTruthy();
  });

  it('still rejects when no vertex order avoids redefining an existing point', () => {
    // Re-declaring all four of the square's vertices as a parallelogram forces the
    // parallelogram's derived 4th corner onto an existing point — no rotation helps.
    const base = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(base.construction, { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already defined/i);
  });
});

describe('general quadrilateral', () => {
  it('builds 4 free vertices, 4 sides, and a polygon', () => {
    const { construction, positions } = build([{ type: 'quadrilateral', ids: ['P', 'Q', 'R', 'S'] }]);
    for (const id of ['P', 'Q', 'R', 'S']) expect(positions.get(id)).toBeTruthy();
    expect(construction.objects.filter((o) => o.kind === 'segment')).toHaveLength(4);
    expect(construction.objects.filter((o) => o.kind === 'polygon')).toHaveLength(1);
    // not accidentally a parallelogram (generic shape)
    const P = positions.get('P')!, Q = positions.get('Q')!, R = positions.get('R')!, S = positions.get('S')!;
    expect(parallel(P, Q, S, R)).toBe(false);
  });
});

describe('arbitrary segment', () => {
  it('connects two points with an order-independent id (idempotent)', () => {
    const a = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }, { type: 'segment', a: 'A', b: 'C' }]);
    expect(a.construction.objects.some((o) => o.kind === 'segment' && o.id === 'seg-AC')).toBe(true);
    // segment CA is the same segment — no duplicate
    const b = build([{ type: 'segment', a: 'C', b: 'A' }], a.construction);
    expect(b.construction.objects.filter((o) => o.kind === 'segment' && o.id === 'seg-AC')).toHaveLength(1);
  });
});

describe('line∩line intersection', () => {
  it('computes the crossing of two diagonals (parallelogram diagonals bisect)', () => {
    const { positions } = build([
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'line-line-intersection', id: 'M', a: 'A', b: 'C', c: 'B', d: 'D' },
    ]);
    const A = positions.get('A')!, C = positions.get('C')!, M = positions.get('M')!;
    // diagonals of a parallelogram bisect each other → M is the midpoint of AC
    expect(M.x).toBeCloseTo((A.x + C.x) / 2, 9);
    expect(M.y).toBeCloseTo((A.y + C.y) / 2, 9);
  });

  it('rejects parallel lines (no intersection), keeping the prior figure', () => {
    const base = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    // AB ∥ DC → no intersection point
    const r = applyStep(base.construction, { type: 'line-line-intersection', id: 'X', a: 'A', b: 'B', c: 'D', d: 'C' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/parallel/i);
  });
});

describe('corpus Q1 — reproduce the figure from typed utterances', () => {
  // Givens (figure only, never solved): parallelogram ABCD, diagonal AC,
  // E on AC, segment BE, diagonal BD. Two locales must both parse + build.
  const EN = ['parallelogram ABCD', 'segment AC', 'point E on AC at 45%', 'segment BE', 'segment BD'];
  const HE = ['מקבילית ABCD', 'אלכסון AC', 'נקודה E על AC ב-45%', 'קטע BE', 'קטע BD'];

  function reproduce(utterances: string[]) {
    const commands = utterances.flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`Q1: failed to parse "${u}"`);
      return r.commands;
    });
    return build(commands);
  }

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q1 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances);

      // parallelogram ABCD
      const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;
      expect(D.x).toBeCloseTo(A.x + C.x - B.x, 9);
      expect(parallel(A, B, D, C)).toBe(true);

      // E on diagonal AC, strictly between A and C
      const E = positions.get('E')!;
      expect(cross(A, C, E)).toBeCloseTo(0, 9);
      expect(dist(A, E) + dist(E, C)).toBeCloseTo(dist(A, C), 9);

      // the drawn segments are present (diagonal AC, BE, diagonal BD)
      const segIds = construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id);
      for (const need of ['seg-AC', 'seg-BE', 'seg-BD']) expect(segIds).toContain(need);

      // everything evaluates to finite coordinates
      const e = evaluate(construction);
      expect(e.ok).toBe(true);
    });
  }
});
