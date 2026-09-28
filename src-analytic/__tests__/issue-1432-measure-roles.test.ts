/**
 * RADIUS, FOCUS, DIRECTRIX, PERIMETER — sayable AND askable (#1432, ADR-AG-169).
 *
 * External review of prod: *"The Ask box is narrow. It can't answer radius, focus, … perimeter."*
 * The values were computed all along (the panel's folded detail, #1212) and no grammar reached
 * them on either surface. One atom per measure, read by the given and the ask — so the two
 * surfaces cannot disagree — with the knowledge gates unchanged.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { fmtAnalytic } from '../format';

const dof = (d: ReturnType<typeof derive>) => reportedDof(d.construction, d.figure.carrierDof);
const answer = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic);

describe('#1432 — the radius as a GIVEN', () => {
  it.each([
    ['נתון מעגל O שרדיוסו 5'],
    ['מעגל שמרכזו O ורדיוסו 5'],
    ['circle O with radius 5'],
  ])('«%s» — a circle born with its radius has 2 degrees of freedom, not 3', (line) => {
    const d = derive([line], 0);
    expect(d.faults).toEqual([]);
    expect(dof(d)).toBe(2);
  });

  it('«רדיוס המעגל הוא 5» after «נתון מעגל O» PINS the free radius — the sym substituted, the param retired', () => {
    const d = derive(['נתון מעגל O', 'רדיוס המעגל הוא 5'], 0);
    expect(d.faults).toEqual([]);
    expect(dof(d)).toBe(2);
    const cv = d.figure.curves.map((c) => c.curve).find((c) => c.kind === 'circle');
    expect(cv && cv.kind === 'circle' ? cv.r : null).toBeCloseTo(5, 9);
  });

  it('on an EQUATION circle the sentence is a restatement: true is known, false refuses by name', () => {
    const t = derive(['נתון מעגל I שמשוואתו x^2+y^2=25', 'רדיוס המעגל הוא 5'], 0);
    expect(t.faults).toEqual([]);
    const f = derive(['נתון מעגל I שמשוואתו x^2+y^2=25', 'רדיוס המעגל הוא 4'], 0);
    expect(f.faults.map((x) => x.code)).toEqual(['conflicting-restatement']);
  });
});

describe('#1432 — the focus and directrix', () => {
  const P = 'נתונה פרבולה שמשוואתה y^2=8x';

  it('«F מוקד הפרבולה» names the focus — a derived point at (2,0), the circle-centre pattern', () => {
    const d = derive([P, 'F מוקד הפרבולה'], 0);
    expect(d.faults).toEqual([]);
    const f = d.figure.points.find((p) => p.id === 'F')!;
    expect(f.x).toBeCloseTo(2, 9);
    expect(f.y).toBeCloseTo(0, 9);
  });

  it('«משוואת המדריך היא x=-2» verifies against the parabola; a wrong directrix refuses by name', () => {
    expect(derive([P, 'משוואת המדריך היא x=-2'], 0).faults).toEqual([]);
    expect(derive([P, 'משוואת המדריך היא x=-3'], 0).faults.map((x) => x.code)).toEqual(['conflicting-restatement']);
  });

  it('with no parabola, or two, the sentences refuse rather than guess', () => {
    expect(derive(['F מוקד הפרבולה'], 0).faults.map((x) => x.code)).toEqual(['ambiguous-shape']);
  });
});

describe('#1432 — the ASKS', () => {
  it.each([
    [['נתון מעגל I שמשוואתו x^2+y^2=25'], 'רדיוס המעגל', '5'],
    [['נתון מעגל I שמשוואתו x^2+y^2=25'], 'מה הרדיוס של המעגל I', '5'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'מוקד הפרבולה', '(2, 0)'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'המוקד', '(2, 0)'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'מדריך הפרבולה', 'x = -2'],
    [['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'], 'מוקדי האליפסה', '(4, 0), (-4, 0)'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)'], 'היקף המשולש ABC', '12'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)'], 'היקף ABC', '12'],
  ])('%j «%s» answers %s', (lines, q, want) => {
    const a = answer(lines as string[], q as string);
    expect(a.unreadable).toBeUndefined();
    expect(a.value).toBe(want);
  });

  it('«היקף ABC» and «AB+BC+CA» are ONE answer — the perimeter delegates to the compound length', () => {
    const lines = ['A(0,0)', 'B(3,0)', 'C(0,4)'];
    expect(answer(lines, 'היקף ABC').value).toBe(answer(lines, 'AB+BC+CA').value);
  });

  it('a PARAMETERISED parabola has no invariant focus — the honest null, never a sampled point', () => {
    const a = answer(['נתונה פרבולה שמשוואתה y^2=2ax'], 'מוקד הפרבולה');
    expect(a.value).toBeNull();
  });

  it('the radius of a FREE circle is not knowledge — null, never the sampled value', () => {
    const a = answer(['נתון מעגל O'], 'רדיוס המעגל');
    expect(a.value).toBeNull();
  });
});
