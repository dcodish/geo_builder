/**
 * WHAT THE PANEL SAYS THE FIGURE KNOWS (#1078).
 *
 * Three operator reports on one screenshot, 2026-09-15, about the figure «משולש ABC» / «AB מקביל
 * לציר ה-x» / «BC מקביל לציר ה-y» / «B על הישר y=x»:
 *
 *   > B should be something like (t,t) showing we collapsed the y based on the x
 *   > the part where it shows -x+y=0 is meaningless since the line is not really drawn and in any
 *   > case there is no way to know what it belongs to
 *   > in this case, the data panel should show the slope of AB and BC
 *
 * The panel's own rendering is React, so these assert the DECISIONS behind each row — which point
 * text, which curves survive, which slopes are knowledge — against the same engine calls `App` makes.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { isKnowledge, knownCurve } from '../engine/evaluate';
import { openCurveText, panelKnowledge, segmentKnowledge, segmentLengthText } from '../app/panelRows';
import { pointText as panelPointText } from '../app/pointText';
import { fmtAnalytic } from '../format';

const OPERATOR_FIGURE = [
  'משולש ABC',
  'AB מקביל לציר ה-x',
  'BC מקביל לציר ה- y',
  'B על הישר y=x',
];

/** The point row's text, as `App.pointText` decides it. */
const pointText = (lines: string[], id: string): string => {
  const d = derive(lines, 0);
  const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === id)?.x ?? null);
  const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === id)?.y ?? null);
  if (kx.known && ky.known) return 'numbers';
  const on = d.construction.constraints.find((k) => k.t === 'on-curve' && k.id === id);
  if (on && on.t === 'on-curve') {
    const line = knownCurve(d.construction, on.curve);
    if (line && line.kind === 'line' && Math.abs(line.b) > 1e-12 && Math.abs(line.a) > 1e-12) {
      return `slope ${(-line.a / line.b).toFixed(3)} intercept ${(-line.c / line.b).toFixed(3)}`;
    }
  }
  if (kx.known !== ky.known) return 'half';
  return 'open';
};

/** Is this segment's slope knowledge, and what is it? */
const slope = (lines: string[], a: string, b: string): string => {
  const d = derive(lines, 0);
  const read = (f: ReturnType<typeof derive>['figure']) => {
    const p1 = f.points.find((q) => q.id === a);
    const p2 = f.points.find((q) => q.id === b);
    return p1 && p2 ? { dx: p2.x - p1.x, dy: p2.y - p1.y } : null;
  };
  const vertical = isKnowledge(d.construction, (f) => {
    const v = read(f);
    return v === null ? null : Math.abs(v.dx) / Math.max(1e-12, Math.hypot(v.dx, v.dy));
  });
  if (vertical.known && vertical.value < 1e-6) return 'vertical';
  const k = isKnowledge(d.construction, (f) => {
    const v = read(f);
    return v === null || Math.abs(v.dx) < 1e-12 ? null : v.dy / v.dx;
  });
  // zero has one spelling (ADR-AG-197's `zeroFree`): a line fit finished at the tight tolerance can leave −1e-12 (ADR-AG-378),
  // and the panel itself prints «0» for it
  return k.known ? k.value.toFixed(3).replace(/^-(0\.0+)$/, '$1') : 'open';
};

describe('#1078 — a carrier is not a curve row', () => {
  it('lists no curve for «B על הישר y=x»', () => {
    // The operator's «-x + y = 0» row: an orphan equation in a list of curves, for a line the
    // student never asked to see, with nothing to say whose carrier it is.
    expect(derive(OPERATOR_FIGURE, 0).figure.curves.filter((c) => c.stated)).toHaveLength(0);
  });

  it('but lists it the moment the student asks for the line itself', () => {
    const d = derive(['נקודה B על הישר y=x', 'y=x'], 0);
    expect(d.figure.curves.filter((c) => c.stated)).toHaveLength(1);
  });
});

describe('#1078 — a point on a line shows the dependency', () => {
  it('«B על הישר y=x» → the y is the x', () => {
    expect(pointText(OPERATOR_FIGURE, 'B')).toBe('slope 1.000 intercept 0.000');
  });

  it('«B על הישר y=2x+3» → the y is 2x + 3', () => {
    expect(pointText(['נקודה B על הישר y=2x+3'], 'B')).toBe('slope 2.000 intercept 3.000');
  });

  it('a point on a CIRCLE stays open — there is no such closed form, and none is invented', () => {
    expect(pointText(['נקודה B על המעגל שמשוואתו x^2+y^2=25'], 'B')).toBe('open');
  });

  it('a point the givens determine still shows its NUMBERS', () => {
    expect(pointText(['A(0,0)', 'B(3,4)'], 'B')).toBe('numbers');
  });

  it('and one coordinate pinned reads the same way — «B נמצא על ציר ה-x»', () => {
    expect(pointText(['B נמצא על ציר ה-x'], 'B')).toBe('half');
  });
});

describe('#1078 — the panel shows SLOPES', () => {
  it('the operator’s figure: AB is 0, BC is vertical, CA is open', () => {
    // The sharpest case for the section existing at all: in this figure every length and every
    // coordinate is open, and the two slopes are the only things the givens fix.
    expect(slope(OPERATOR_FIGURE, 'A', 'B')).toBe('0.000');
    expect(slope(OPERATOR_FIGURE, 'B', 'C')).toBe('vertical');
    expect(slope(OPERATOR_FIGURE, 'C', 'A')).toBe('open');
  });

  it('a determined triangle knows all three', () => {
    const fig = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    expect(slope(fig, 'A', 'B')).toBe('0.000');
    expect(slope(fig, 'B', 'C')).toBe('-0.750');
    expect(slope(fig, 'C', 'A')).toBe('vertical');
  });

  it('a free triangle knows none of them', () => {
    expect(slope(['משולש ABC'], 'A', 'B')).toBe('open');
  });

  it('and a SQUARE knows none either, because it may be rotated', () => {
    // The guard on the row: a square fixes every ANGLE and no slope, and a panel that printed one
    // would be asserting an orientation the student never gave.
    expect(slope(['ריבוע ABCD'], 'A', 'B')).toBe('open');
  });
});

describe('#1078 — the knowledge gate is the SOLVE’s tolerance, not a tighter one', () => {
  it('a slope the givens fix survives the solver’s own wobble', () => {
    /**
     * The defect behind the empty slopes. `isKnowledge` used 1e-7, finer than SATISFIED_EPS — the
     * accuracy the solve itself promises — so a value produced BY the solve carried more wobble than
     * the gate allowed. «AB מקביל לציר ה-x» gave slopes of 1.3e-8, -3.2e-7 and -7.8e-9 across three
     * configurations, invariantly zero by any reading, and a spread of 3.2e-7 failed.
     *
     * A knowledge test cannot be tighter than the solve that produced the value, or it reports the
     * solver's own noise as freedom.
     */
    const k = isKnowledge(derive(OPERATOR_FIGURE, 0).construction, (f) => {
      const a = f.points.find((q) => q.id === 'A')!;
      const b = f.points.find((q) => q.id === 'B')!;
      return (b.y - a.y) / (b.x - a.x);
    });
    expect(k.known).toBe(true);
  });

  it('and a value that really moves is still NOT knowledge', () => {
    // The guard the loosening must not cost: a free triangle's side length varies by orders of
    // magnitude more than any tolerance, and must keep reading open.
    const k = isKnowledge(derive(['משולש ABC'], 0).construction, (f) => {
      const a = f.points.find((q) => q.id === 'A')!;
      const b = f.points.find((q) => q.id === 'B')!;
      return Math.hypot(b.x - a.x, b.y - a.y);
    });
    expect(k.known).toBe(false);
  });
});

/**
 * #2735 (ADR-AG-458) — A VALUE THE FIGURE FIXES IN THE STUDENT'S LETTER IS SHOWN IN THAT LETTER. Operator, 2026-11-07:
 * *"yes - we should support (2k,0) in the data panel"*; 2026-11-09, option C: coordinates, curve equations and lengths.
 * Measured on main @ 86768862: F₁ read «(x_F₁, 0)», the midpoint of A(2k,0) and B(0,4k) read «—», the focus circle
 * «O(F), r = r_F», and AF₁ nothing. These call the panel's own decisions (`panelKnowledge`, `pointText`,
 * `segmentLengthText`, `openCurveText`), the functions `App` renders.
 */
describe('#2735 — answers in the parameter', () => {
  const Q9 = ['x²/144 + y²/(144 − 4k²) = 1', '0 < k < 6', 'F1 הוא המוקד הימני של האליפסה', 'נתונה פרבולה שמשוואתה y^2=2px', 'F1 מוקד הפרבולה', 'A על הפרבולה', 'A ברביע הראשון', 'AF1 = 10k'];
  const Q16 = ['x²/(25k²) + y²/(16k²) = 1', 'k > 0', 'F הוא המוקד הימני של האליפסה', 'E היא נקודת החיתוך של האליפסה עם החלק החיובי של ציר ה-x', 'נתון מעגל שמרכזו F', 'המעגל עובר דרך E', 'B היא נקודת החיתוך של האליפסה עם החלק החיובי של ציר ה-y'];
  const rows = (lines: string[]) => {
    const d = derive(lines, 0);
    expect(d.faults, lines.join(' · ')).toEqual([]);
    const pk = panelKnowledge(d);
    const pts = Object.fromEntries(pk.points.map((p) => [p.id, panelPointText(d, p.id, p.x, p.y, fmtAnalytic)]));
    const segs = Object.fromEntries(segmentKnowledge(d).map((s) => [s.ends.join(''), segmentLengthText(s, fmtAnalytic)]));
    const curves = Object.fromEntries(pk.curves.map((c) => [c.id, openCurveText(d.construction, c.id, c.symbolic)]));
    return { pts, segs, curves };
  };

  it('Q9 (קיץ 2023): F₁ is (2k, 0), A is (8k, 8k), and AF₁ reads 10k', () => {
    const r = rows(Q9);
    expect(r.pts['F₁']).toBe('(2k, 0)');
    expect(r.pts.A).toBe('(8k, 8k)');
    expect(r.segs['AF₁']).toBe('10k');
  });

  it('Q16 (מועד ב 2025): F (3k, 0), E (5k, 0), B (0, 4k), and the circle about F through E is (x − 3k)² + y² = (2k)²', () => {
    const r = rows(Q16);
    expect(r.pts).toMatchObject({ F: '(3k, 0)', E: '(5k, 0)', B: '(0, 4k)' });
    expect(r.curves['circle-at-F']).toBe('(x − 3k)² + y² = (2k)²');
    // the stated ellipse keeps the student's own equation
    expect(Object.values(r.curves)).toContain('x^2/(25·k^2) + y^2/(16·k^2) - 1 = 0');
  });

  it('a midpoint of A(2k,0) and B(0,4k) is (k, 2k); the stated points keep their own spelling', () => {
    expect(rows(['A(2k,0)', 'B(0,4k)', 'M אמצע AB']).pts).toEqual({ A: '(2·k, 0)', B: '(0, 4·k)', M: '(k, 2k)' });
  });

  it('a coordinate that is not a monomial keeps today’s row, never a wrong form', () => {
    expect(rows(['A(k,0)', 'B(2,0)', 'M אמצע AB']).pts.M).toBe('(x_M, 0)');
  });

  it('a figure with no letter is unchanged: the reader never runs', () => {
    expect(rows(['A(0,0)', 'B(1,0)', 'M אמצע AB']).pts.M).toBe('(1/2, 0)');
    expect(rows(['A(0,0)', 'B על ציר ה-x']).pts.B).toBe('(x_B, 0)');
  });
});
