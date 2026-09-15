/**
 * A MEASURE CAN STAND ON BOTH SIDES OF A RELATION (#1075).
 *
 * Operator, 2026-09-15: *"שטח ABEF גדול פי 3 משטח משולש CEF - is not supported"*.
 *
 * Measured first, and the nouns were not the problem: «שטח המשולש ABC גדול פי 3 משטח המשולש CEF»,
 * with both nouns present, failed identically. Two things were missing — the comparison words, and
 * an AREA as a term inside a measure expression.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

type Pt = { x: number; y: number };

const figure = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  return { d, p: Object.fromEntries(d.figure.points.map((q) => [q.id, q])) as Record<string, Pt> };
};
const len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (ps: Pt[]) => {
  let s = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const q = ps[(i + 1) % ps.length];
    s += ps[i].x * q.y - q.x * ps[i].y;
  }
  return Math.abs(s) / 2;
};

describe('#1075 — comparison words are the equation they mean', () => {
  it('«AB גדול פי 2 מ-BC» — a ratio', () => {
    const { d, p } = figure(['משולש ABC', 'AB גדול פי 2 מ-BC']);
    expect(d.faults).toEqual([]);
    expect(len(p.A, p.B)).toBeCloseTo(2 * len(p.B, p.C), 5);
  });

  it('«AB גדול ב-2 מ-BC» — a DIFFERENCE, which is a different word and a different equation', () => {
    const { d, p } = figure(['משולש ABC', 'AB גדול ב-2 מ-BC']);
    expect(d.faults).toEqual([]);
    expect(len(p.A, p.B)).toBeCloseTo(len(p.B, p.C) + 2, 5);
  });

  it('«AB קטן פי 2 מ-BC» — the multiplier stays with the larger side', () => {
    const { p } = figure(['משולש ABC', 'AB קטן פי 2 מ-BC']);
    expect(len(p.B, p.C)).toBeCloseTo(2 * len(p.A, p.B), 5);
  });

  it('inherits everything the equation form has — it is vocabulary, not mechanism', () => {
    // Same figure, two spellings: the rewrite must produce the identical construction.
    const words = derive(['משולש ABC', 'AB גדול פי 2 מ-BC'], 0);
    const symbols = derive(['משולש ABC', 'AB = 2BC'], 0);
    expect(JSON.stringify(words.construction)).toBe(JSON.stringify(symbols.construction));
  });
});

describe('#1075 — an AREA is a term', () => {
  it('the operator’s own sentence, with the nouns', () => {
    const { d, p } = figure([
      'משולש ABC',
      'משולש CEF',
      'שטח המשולש ABC גדול פי 3 משטח המשולש CEF',
    ]);
    expect(d.faults).toEqual([]);
    expect(area([p.A, p.B, p.C])).toBeCloseTo(3 * area([p.C, p.E, p.F]), 4);
  });

  it('and without them — the vertices alone say which figure', () => {
    const { d, p } = figure(['משולש ABC', 'משולש CEF', 'שטח ABC גדול פי 3 משטח CEF']);
    expect(d.faults).toEqual([]);
    expect(area([p.A, p.B, p.C])).toBeCloseTo(3 * area([p.C, p.E, p.F]), 4);
  });

  it('REFUSES the comparison when the figure is pinned and it does not hold', () => {
    // The operator's literal coordinates: ABEF has area 12 and CEF has area 6, so «פי 3» is false
    // there. Saying so is the point — a comparison is a given like any other.
    const d = derive(
      ['A(0,0)', 'B(4,0)', 'E(4,3)', 'F(0,3)', 'C(2,6)', 'שטח ABEF גדול פי 3 משטח CEF'],
      0,
    );
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('reads an area written as one term among others', () => {
    // The generalisation the union buys: a measure expression mixes kinds freely.
    const { d, p } = figure(['משולש ABC', 'משולש CEF', 'שטח ABC = שטח CEF + 4']);
    expect(d.faults).toEqual([]);
    expect(area([p.A, p.B, p.C])).toBeCloseTo(area([p.C, p.E, p.F]) + 4, 4);
  });

  it('leaves «AB = 2BC» and «שטח המשולש ABC הוא 6» exactly as they were', () => {
    const ratio = figure(['משולש ABC', 'AB = 2BC']);
    expect(ratio.d.faults).toEqual([]);
    expect(len(ratio.p.A, ratio.p.B)).toBeCloseTo(2 * len(ratio.p.B, ratio.p.C), 5);

    const pinned = figure(['A(0,0)', 'B(4,0)', 'C(0,3)', 'שטח המשולש ABC הוא 6']);
    expect(pinned.d.faults).toEqual([]);
  });
});
