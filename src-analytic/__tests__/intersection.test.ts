/**
 * A POINT WHERE TWO THINGS CROSS (#1025).
 *
 * The issue was filed as CLICKABLE dots on the canvas. This is the same capability in the product's
 * own idiom — a sentence — which is also what the exam writes: «נקודת החיתוך של המעגל עם ציר ה-x».
 *
 * It needs no new mechanism, and that is the point: an intersection is a point that is ON BOTH
 * things, so it is a declaration and two incidences, each consuming one of its two degrees of
 * freedom.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { knownOptions } from '../engine/evaluate';

const at = (lines: string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);
const options = (lines: string[], id: string) => {
  const d = derive(lines, 0);
  return knownOptions(d.construction, (f) => {
    const p = f.points.find((q) => q.id === id);
    return p ? [p.x, p.y] : null;
  });
};

describe('#1025 — where a curve meets an axis', () => {
  const CIRCLE = ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=25', 'P נקודת החיתוך של המעגל I עם ציר ה-x'];

  it('lands on both objects at once', () => {
    const d = derive(CIRCLE, 0);
    expect(d.faults).toEqual([]);
    const p = at(CIRCLE, 'P')!;
    expect(p.y).toBeCloseTo(0, 6);
    expect((p.x - 3) ** 2 + (p.y - 4) ** 2).toBeCloseTo(25, 4);
  });

  it('and BOTH crossings are listed, because there are two (#1036)', () => {
    // x = 3 ± √(25 − 16) = 0 and 6. The two features compose with nothing between them.
    const opts = options(CIRCLE, 'P');
    expect(opts).not.toBeNull();
    // `+ 0` normalises the -0 a root just below zero rounds to; -0 is not a different number,
    // and a test that says it is teaches nothing.
    expect(opts!.map((v) => Math.round(v[0]) + 0)).toEqual([0, 6]);
    expect(opts!.every((v) => Math.abs(v[1]) < 1e-6)).toBe(true);
  });

  it('consumes both of the point’s degrees of freedom', () => {
    // Two incidences on a point that had two: the figure is determined, and the DOF cue says so.
    const d = derive(CIRCLE, 0);
    expect(reportedDof(d.construction, d.figure.carrierDof)).toBe(0);
  });
});

describe('#1025 — where two lines meet', () => {
  it('«E נקודת החיתוך של הישר AB עם הישר CD»', () => {
    const lines = ['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'E נקודת החיתוך של הישר AB עם הישר CD'];
    expect(codes(lines)).toEqual([]);
    const e = at(lines, 'E')!;
    expect([e.x, e.y].map((n) => Number(n.toFixed(4)))).toEqual([2, 2]);
  });

  it('a named line and an axis', () => {
    const lines = ['נתון הישר l1: y=2x+4', 'Q נקודת החיתוך של הישר l1 עם ציר ה-y'];
    expect(codes(lines)).toEqual([]);
    const q = at(lines, 'Q')!;
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.y).toBeCloseTo(4, 6);
  });

  it('reads the English', () => {
    const lines = ['line l1: y=2x+4', 'Q is the intersection of line l1 and the y-axis'];
    expect(codes(lines)).toEqual([]);
    expect(at(lines, 'Q')!.y).toBeCloseTo(4, 6);
  });
});

describe('#1025 — an operand it cannot read is named, not swallowed', () => {
  it('refuses with the formats that DO work', () => {
    // #1052's discipline: the verb was understood and an operand was not, which is a different
    // message from "I did not understand the sentence".
    expect(codes(['P נקודת החיתוך של שלום עם ציר ה-x'])).toEqual(['bad-operand']);
  });
});
