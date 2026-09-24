/**
 * #1322 — a line's ANGLE with the positive x-axis, beside its slope (m = tan α), and askable.
 *
 * Ruled 2026-09-24: the panel row AND the question, from ONE function (`app/lineAngle.ts`), so the two
 * surfaces cannot disagree about the value, the vertical case, or when it is unknown (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask as askLane } from '../app/ask';
import { angleText, angleWithXAxis, lineAngleOf } from '../app/lineAngle';

const ask = (lines: string[], q: string) => askLane(derive(lines, 0), q, (v) => String(v));

describe('#1322 — the angle is in [0°, 180°), and a vertical line is 90°', () => {
  it.each([
    [1, 1, 45],
    [1, -1, 135],
    [0, 5, 90],
    [3, 0, 0],
    [-3, 0, 0],
    [-1, -1, 45],
  ])('direction (%d, %d) → %d°', (dx, dy, deg) => {
    expect(angleWithXAxis(dx, dy)).toBeCloseTo(deg, 9);
  });

  it('a horizontal line never reads 180 (the fold snaps it to 0)', () => {
    expect(angleWithXAxis(-1, -1e-13)).toBe(0);
  });
});

describe('#1322 — the question, in both spellings of the exam', () => {
  it.each([
    [['נתון הישר l1: y=x+2'], 'הזווית בין הישר l1 לציר ה-x', '45°'],
    [['נתון הישר l1: y=-x'], 'הזווית שבין הישר l1 ובין הכיוון החיובי של ציר ה-x', '135°'],
    [['נתון הישר l1: y=x+2'], 'the angle between line l1 and the x-axis', '45°'],
    [['A(0,0)', 'B(0,4)', 'הקטע AB'], 'הזווית בין הישר AB לציר ה-x', '90°'],
    [['A(0,0)', 'B(2,1)', 'הקטע AB'], 'הזווית בין AB לציר ה-x', angleText((Math.atan2(1, 2) * 180) / Math.PI)],
  ])('%j · «%s» → %s', (lines, q, value) => {
    expect(ask(lines, q).value).toBe(value);
  });

  it('a line the givens do not determine answers "not determined", never a sampled angle', () => {
    const r = ask(['משולש ABC', 'הקטע AB'], 'הזווית בין AB לציר ה-x');
    expect(r.value).toBeNull();
  });
});

describe('#1322 — the panel and the ask are ONE decision', () => {
  it('lineAngleOf over a segment equals the ask over the same segment', () => {
    const lines = ['A(1,1)', 'B(4,5)', 'הקטע AB'];
    const d = derive(lines, 0);
    const panel = lineAngleOf(d.construction, (f) => {
      const a = f.points.find((p) => p.id === 'A');
      const b = f.points.find((p) => p.id === 'B');
      return a && b ? { dx: b.x - a.x, dy: b.y - a.y } : null;
    });
    expect(panel.known).toBe(true);
    expect(ask(lines, 'הזווית בין AB לציר ה-x').value).toBe(panel.known ? angleText(panel.deg) : null);
  });
});
