/**
 * A POINT ON A CURVE NAMED BY ITS KIND (#1057).
 *
 * «הנקודה A נמצאת על האליפסה» is F2 corpus vocabulary (docs/19 §4a) and the tool could not read it:
 * every on-object form until now needed the curve's equation or its name in the same sentence.
 *
 * #1057 asked how a student refers to ONE OF TWO anonymous conics, and left it open rather than
 * inventing an ordinal. The corpus answers it: *"no exam in twenty carries two parabolas or two
 * ellipses; at most one of each per figure"* (docs/19 §4a). So the reference is by KIND, and the
 * two-conic case is refused rather than named — which costs nothing a real question asks for.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

const on = (lines: string[], id: string, seed = 0) => {
  const d = derive(lines, seed);
  return {
    d,
    p: d.figure.points.find((q) => q.id === id),
    curve: d.figure.curves[0],
    dof: reportedDof(d.construction, d.figure.carrierDof),
  };
};
const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);

describe('#1057 — «על האליפסה», «על המעגל», «על הפרבולה»', () => {
  it('puts the point ON the ellipse, with one degree of freedom left', () => {
    const r = on(['נתונה אליפסה שמשוואתה x^2/9+y^2/4=1', 'הנקודה A נמצאת על האליפסה'], 'A');
    expect(r.d.faults).toEqual([]);
    expect(r.dof).toBe(1);
    const c = r.curve.curve;
    expect(c.kind).toBe('ellipse');
    if (c.kind === 'ellipse') {
      expect(r.p!.x ** 2 / c.a ** 2 + r.p!.y ** 2 / c.b ** 2).toBeCloseTo(1, 5);
    }
  });

  it('and on a circle and a parabola, at every configuration', () => {
    for (const seed of [0, 1, 2]) {
      const circle = on(['נתון מעגל I שמשוואתו x^2+y^2=25', 'נקודה B על המעגל'], 'B', seed);
      expect(circle.d.faults, `circle seed ${seed}`).toEqual([]);
      expect(Math.hypot(circle.p!.x, circle.p!.y)).toBeCloseTo(5, 5);

      const par = on(['נתונה פרבולה קנונית שמשוואתה y^2=54x', 'P על הפרבולה'], 'P', seed);
      expect(par.d.faults, `parabola seed ${seed}`).toEqual([]);
      expect(par.p!.y ** 2).toBeCloseTo(54 * par.p!.x, 4);
    }
  });

  it('finds an ANONYMOUS conic, whose kind comes from the fit and not from a declaration', () => {
    // 02c R6 makes the noun optional "because the fit already knows the kind", so «x²/9 + y²/4 = 1»
    // carries no declared kind at all. Matching on the declaration would find no ellipse in a figure
    // that plainly has one.
    const r = on(['x^2/9+y^2/4=1', 'A is on the ellipse'], 'A');
    expect(r.d.faults).toEqual([]);
    expect(r.dof).toBe(1);
  });

  it('a circle given by its CENTRE is a circle to be on (#1060)', () => {
    // 3 for the circle + 2 for the point − 1 for the incidence.
    const r = on(['נתון מעגל O', 'נקודה B על המעגל'], 'B');
    expect(r.d.faults).toEqual([]);
    expect(r.dof).toBe(4);
    const o = r.d.figure.points.find((q) => q.id === 'O')!;
    const c = r.curve.curve;
    if (c.kind === 'circle') expect(Math.hypot(r.p!.x - o.x, r.p!.y - o.y)).toBeCloseTo(c.r, 5);
  });
});

describe('#1057 — an ambiguous reference is REFUSED, and no ordinal is invented', () => {
  it('two ellipses on the canvas', () => {
    // The question #1057 was filed about. Inventing «האליפסה הראשונה» would put the student in front
    // of a phrase the exam never uses, which is what D8 exists to prevent.
    expect(codes(['x^2/9+y^2/4=1', 'x^2/16+y^2/9=1', 'הנקודה A נמצאת על האליפסה'])).toEqual([
      'ambiguous-shape',
    ]);
  });

  it('and no ellipse at all', () => {
    expect(codes(['הנקודה A נמצאת על האליפסה'])).toEqual(['ambiguous-shape']);
  });

  it('while a circle and an ellipse together are each unambiguous', () => {
    // The refusal is per KIND, not per curve — two different kinds are two different references.
    expect(codes(['x^2/9+y^2/4=1', 'x^2+y^2=25', 'הנקודה A נמצאת על האליפסה'])).toEqual([]);
    expect(codes(['x^2/9+y^2/4=1', 'x^2+y^2=25', 'נקודה B על המעגל'])).toEqual([]);
  });
});
