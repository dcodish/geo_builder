/**
 * #1648 and #1647 (ADR-AG-202).
 *
 * - #1648: a solved horizontal segment's angle with the x-axis printed «180°». The fold into [0°, 180°) was right;
 *   its horizontal end was judged by an ABSOLUTE 1e-9° epsilon while the solver leaves Δy ≈ 3e-8 on a horizontal
 *   side (corpus 7/5: B(2,−2), C(4,−2) → 179.9999992°, printed «180°»). Both ends are now the same scale-free
 *   predicate (`isVertical` / `isHorizontal`, one tolerance).
 * - #1647: a circle the touch sentence creates, tangent to only SOME sides, cost ~2 s per submit (13 evaluations):
 *   its centre and radius were sampled blind, the solve collapsed a side onto O to satisfy the tangencies, and 20 of
 *   24 seeds failed their selectors. The created circle now starts FITTED to the figure it joins (the earlier givens
 *   solved first, the circle and its touch points fitted to them) — a start, never a verdict.
 *
 * Every lock calls the real path (`decideSubmit`, `derive`, `segmentKnowledge`, `evaluate`); the budgets are
 * operation counts (evaluations, conic fits), never wall clock — the #1473 pattern.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { angleText, angleWithXAxis, lineAngleOf } from '../app/lineAngle';
import { segmentKnowledge, slopeRowText } from '../app/panelRows';
import { conicStats } from '../engine/conic';
import { derive } from '../engine/derive';
import { admittedToPool, drawableAt, evaluate, evaluateStats, type Figure } from '../engine/evaluate';

const pt = (f: Figure, id: string) => f.points.find((p) => p.id === id)!;

// ---------------------------------------------------------------------------------------------------------------
describe('#1648 — the angle with the x-axis is in [0°, 180°): a solved horizontal side reads 0°, never 180°', () => {
  const T3 = ['מעגל שמרכזו M', 'המיתרים AB ו-BC שווים', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10', 'C(4,-2)', 'הישר BC מקביל לציר ה-x'];

  it('the operator\'s figure (corpus 7/5): BC reads 0° and AB 143.13°, through the panel\'s own path', () => {
    const rows = segmentKnowledge(derive(T3, 0));
    const bc = rows.find((r) => [...r.ends].sort().join('') === 'BC')!;
    const ab = rows.find((r) => [...r.ends].sort().join('') === 'AB')!;
    expect(bc.angle).toEqual({ known: true, deg: 0 });
    expect(ab.angle.known && angleText(ab.angle.deg)).toBe('143.13°');
  });

  it('both letter orders of the horizontal side read 0°', () => {
    const c = derive(T3, 0).construction;
    const dir = (from: string, to: string) => (f: Figure) => ({ dx: pt(f, to).x - pt(f, from).x, dy: pt(f, to).y - pt(f, from).y });
    expect(lineAngleOf(c, dir('B', 'C'))).toEqual({ known: true, deg: 0 });
    expect(lineAngleOf(c, dir('C', 'B'))).toEqual({ known: true, deg: 0 });
  });

  it.each([
    [2, -2.8e-8, 0],
    [-2, 2.8e-8, 0],
    [-2, -2.8e-8, 0],
    [3.6e-9, 4, 90],
    [-3.6e-9, -4, 90],
    [4, -3, 143.13],
    [-4, 3, 143.13],
  ])('direction (%d, %d) → %d° (a solver residual on either end is that end)', (dx, dy, deg) => {
    expect(angleText(angleWithXAxis(dx, dy))).toBe(angleText(deg));
  });

  it('a genuinely small angle is still an angle (the tolerance is relative, ~6e-5°)', () => {
    expect(angleWithXAxis(1, 0.01)).toBeCloseTo((Math.atan(0.01) * 180) / Math.PI, 9);
    expect(angleWithXAxis(-1, 0.01)).toBeCloseTo(180 - (Math.atan(0.01) * 180) / Math.PI, 9);
  });

  it('the slope row composes the folded angle unchanged (#1646)', () => {
    expect(slopeRowText('BC', '0', 'angle with the x-axis', angleText(0))).toBe('BC: 0 · angle with the x-axis: 0°');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1647 — a circle created tangent to SOME sides starts fitted to the figure it joins', () => {
  const BASE = ['משולש AOB ישר זווית', 'O ראשית הצירים', 'הצלע AO נמצאת על ציר ה-x', 'הצלע BO נמצאת על ציר ה-y'];
  const TOUCH = 'הצלעות AO ו-BO משיקות למעגל בנקודות D ו-E בהתאמה';

  it('the measured sequence: submit and derive within 3 evaluations and a bounded number of conic fits', () => {
    const cur = derive(BASE, 0);
    let e0 = evaluateStats.uncached;
    let f0 = conicStats.fits;
    expect(decideSubmit(TOUCH, BASE, 0, cur).kind).toBe('record');
    expect(evaluateStats.uncached - e0).toBeLessThanOrEqual(3);
    // before: ~92 000 fits (13 evaluations); after: ~7 500, all of it the seed's dead right-angle seat
    expect(conicStats.fits - f0).toBeLessThanOrEqual(15000);
    e0 = evaluateStats.uncached;
    f0 = conicStats.fits;
    const d = derive([...BASE, TOUCH], 0);
    expect(evaluateStats.uncached - e0).toBeLessThanOrEqual(3);
    expect(conicStats.fits - f0).toBeLessThanOrEqual(15000);
    expect(d.faults).toEqual([]);
    // Still the GENERAL free circle (it is not the incircle): one side short of determining it.
    expect(d.construction.objects.some((o) => o.id === 'circle-touched')).toBe(true);
  });

  it(
    'the configurations: nearly every raw seed is admitted, the radius stays free, and every quadrant is reached',
    () => {
      const c = derive([...BASE, TOUCH], 0).construction;
      let admitted = 0;
      for (let s = 0; s < 24; s += 1) if (admittedToPool(evaluate(c, s))) admitted += 1;
      expect(admitted).toBeGreaterThanOrEqual(20); // before: 4 of 24
      const quadrants = new Set<string>();
      const radii = new Set<string>();
      for (let s = 0; s < 24; s += 1) {
        const f = drawableAt(c, s);
        expect(f.unsatisfied, `seed ${s}`).toEqual([]);
        expect(f.selectorsOk, `seed ${s}`).toBe(true);
        const circle = f.curves.find((q) => q.curve.kind === 'circle')!.curve as { cx: number; cy: number; r: number };
        // tangent to both axes, D and E inside their sides
        expect(Math.abs(Math.abs(circle.cx) - circle.r), `seed ${s}`).toBeLessThan(1e-6);
        expect(Math.abs(Math.abs(circle.cy) - circle.r), `seed ${s}`).toBeLessThan(1e-6);
        quadrants.add(`${Math.sign(circle.cx)},${Math.sign(circle.cy)}`);
        radii.add(circle.r.toFixed(3));
      }
      expect(quadrants.size).toBe(4);
      expect(radii.size).toBeGreaterThan(12);
    },
    120_000,
  );

  it('the created circle never moves the figure it joins: the triangle at seed 0 is where the base figure put it', () => {
    const before = derive(BASE, 0).figure;
    const after = derive([...BASE, TOUCH], 0).figure;
    for (const id of ['A', 'O', 'B']) {
      expect(pt(after, id).x).toBeCloseTo(pt(before, id).x, 6);
      expect(pt(after, id).y).toBeCloseTo(pt(before, id).y, 6);
    }
  });
});
