/**
 * #29 — a semicircle on EVERY side of a polygon: «על כל צלע של ריבוע יש חצי מעגל» / «a semicircle on each
 * side of the square» — the classic bagrut composite. An ADR-110 macro (one closed-form semicircle per
 * side); the single-side form «על צלע CD יש חצי מעגל» already worked (issue #28, ADR-284).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const SQUARE = { points: ['A', 'B', 'C', 'D'], polygons: [['A', 'B', 'C', 'D']] } as never;
const counts = (u: string, ctx: never) => {
  const r = parse(u, ctx);
  expect(r.ok, u).toBe(true);
  if (!r.ok) return { arc: 0, mid: 0 };
  return { arc: r.commands.filter((c) => c.type === 'arc').length, mid: r.commands.filter((c) => c.type === 'midpoint').length };
};

describe('#29 — semicircle on every side', () => {
  it('«על כל צלע של ריבוע יש חצי מעגל» → one semicircle per side (4 arcs)', () => {
    expect(counts('על כל צלע של ריבוע יש חצי מעגל', SQUARE)).toEqual({ arc: 4, mid: 4 });
  });

  it('English «a semicircle on each side of the square» → 4 arcs', () => {
    expect(counts('a semicircle on each side of the square', SQUARE)).toEqual({ arc: 4, mid: 4 });
  });

  it('a named polygon whose vertices exist resolves («על כל צלע של ריבוע ABCD…»)', () => {
    expect(counts('על כל צלע של הריבוע ABCD יש חצי מעגל', SQUARE).arc).toBe(4);
    // a triangle → 3 semicircles
    expect(counts('a semicircle on each side of triangle ABC', { points: ['A', 'B', 'C'], polygons: [['A', 'B', 'C']] } as never).arc).toBe(3);
  });

  it('DEFERS when no polygon is resolvable (vertices not built yet / ambiguous)', () => {
    expect(parse('על כל צלע של ריבוע יש חצי מעגל', {} as never).ok).toBe(false); // nothing built
    expect(parse('a semicircle on each side of the square', { polygons: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']] } as never).ok).toBe(false); // ambiguous
  });

  it('NO THEFT: the single-side form is untouched (still one semicircle)', () => {
    expect(counts('על צלע CD יש חצי מעגל', SQUARE)).toEqual({ arc: 1, mid: 1 });
  });
});
