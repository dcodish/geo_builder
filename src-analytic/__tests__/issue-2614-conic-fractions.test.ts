/**
 * #2614 ([ADR-AG-357](../../docs/06c-decisions-analytic.md#adr-ag-357)) — a conic with a fractional coefficient printed a
 * misreadable equation: «x²/45/4 + y²/5 = 1» (x²/45 divided by 4?) and «y² = 5/2x» (5/(2x)?).
 *
 * Measured before (216cf8bb): the ask «משוואת האליפסה» on «4x^2/45+y^2/5=1» answered `x²/45/4 + y²/5 = 1`; the midpoint
 * locus of an ellipse printed `x²/25/4 + y²/9/4 = 1` on its row AND its canvas label; a parabola `y² = 5/2x`, and its
 * midpoint locus `y² = 5/2x` (or `y² = 1x`: the locus had a printer of its own, without the panel's 1-rule).
 *
 * Operator ruling 2026-10-30, Q1 → B: a fractional ellipse prints CLEARED, as a whole-number equation, «4x² + 9y² = 45»;
 * whole-number a², b² keep «x²/a² + y²/b² = 1». The parabola follows ADR-AG-085's ruling: `2y² = 5x`.
 *
 * Everything goes through the real door (`decideSubmit` → `derive` → `ask`) with the real formatter (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { decideSubmit } from '../app/submit';
import { curveParts, ellipseEquationText, lineText, locusEquation, parabolaEquationText } from '../app/curveText';
import { derive } from '../engine/derive';
import { fmtAnalytic, fmtCoefficient } from '../format';
import type { NumCurve } from '../engine/types';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const t = ((k: string) => HE[k] ?? k) as never;
const answer = (lines: string[], question: string) => {
  lines.forEach((l, i) => expect(decideSubmit(l, lines.slice(0, i), 0).kind, l).toBe('record'));
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return ask(d, question, fmtAnalytic, t);
};
const MIDPOINT = (given: string, host: string) => [given, 'O(0,0)', `נקודה P על ה${host}`, 'M אמצע OP'];

describe('#2614 — a fractional ellipse prints cleared, as a whole-number equation (Q1 → B)', () => {
  it.each([
    ['נתונה אליפסה שמשוואתה 4x^2/45+y^2/5=1', '4x² + 9y² = 45'],
    ['נתונה אליפסה שמשוואתה x^2/(45/4)+y^2/5=1', '4x² + 9y² = 45'],
    ['נתונה אליפסה שמשוואתה x^2/12.5+y^2/2=1', '4x² + 25y² = 50'],
    ['נתונה אליפסה שמשוואתה x^2/9+y^2/4.5=1', 'x² + 2y² = 9'],
  ])('«משוואת האליפסה» on %s answers %s', (given, eq) => {
    expect(answer([given], 'משוואת האליפסה').value).toBe(eq);
  });

  it('the midpoint locus: the row and the canvas label read the same cleared equation', () => {
    const a = answer(MIDPOINT('נתונה אליפסה שמשוואתה x^2/25+y^2/9=1', 'אליפסה'), 'המקום הגיאומטרי של M');
    expect(a.value).toBe('אליפסה · 36x² + 100y² = 225');
    expect(drawnLoci([a])[0].label).toBe('אליפסה · 36x² + 100y² = 225');
  });

  it('the «או» options list prints each option through the same printer', () => {
    const opts: NumCurve[] = [
      { kind: 'ellipse', a: Math.sqrt(45 / 4), b: Math.sqrt(5) } as NumCurve,
      { kind: 'ellipse', a: Math.sqrt(18), b: Math.sqrt(2) } as NumCurve,
    ];
    expect(opts.map((o) => curveParts(o).equation).join(' או ')).toBe('4x² + 9y² = 45 או x²/18 + y²/2 = 1');
  });
});

describe('#2614 — a fractional parabola clears its coefficient (ADR-AG-085)', () => {
  it.each([
    ['נתונה פרבולה שמשוואתה y^2=2.5x', '2y² = 5x'],
    ['נתונה פרבולה שמשוואתה 3y^2=5x', '3y² = 5x'],
    ['נתונה פרבולה שמשוואתה y^2=-2.5x', '2y² = -5x'],
    ['נתונה פרבולה שמשוואתה y^2=0.5x', '2y² = x'],
  ])('«משוואת הפרבולה» on %s answers %s', (given, eq) => {
    expect(answer([given], 'משוואת הפרבולה').value).toBe(eq);
  });

  it.each([
    ['y^2=5x', 'פרבולה · 2y² = 5x'],
    ['y^2=2x', 'פרבולה · y² = x'],
  ])('the midpoint locus of %s: row and canvas label read %s', (eq, shown) => {
    const a = answer(MIDPOINT(`נתונה פרבולה שמשוואתה ${eq}`, 'פרבולה'), 'המקום הגיאומטרי של M');
    expect(a.value).toBe(shown);
    expect(drawnLoci([a])[0].label).toBe(shown);
  });
});

describe('#2614 — one printer: the panel and the locus row cannot disagree', () => {
  it.each([
    [{ kind: 'ellipse', a: Math.sqrt(45 / 4), b: Math.sqrt(5) }],
    [{ kind: 'ellipse', a: 5, b: 3 }],
    [{ kind: 'parabola', p: 1.25 }],
    [{ kind: 'parabola', p: 0.5 }],
  ])('%j', (curve) => {
    const c = curve as unknown as NumCurve;
    expect(locusEquation({ conic: {} as never, curve: c } as never, fmtCoefficient)).toBe(curveParts(c).equation);
  });
});

describe('#2614 — controls: what was already unambiguous is unchanged', () => {
  it('a whole-number ellipse keeps x²/a² + y²/b² = 1', () => {
    expect(answer(['נתונה אליפסה שמשוואתה x^2/40+y^2/24=1'], 'משוואת האליפסה').value).toBe('x²/40 + y²/24 = 1');
    expect(answer(['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'], 'משוואת האליפסה').value).toBe('x²/25 + y²/9 = 1');
  });

  it('a whole-number parabola keeps y² = kx', () => {
    expect(answer(['נתונה פרבולה שמשוואתה y^2=8x'], 'משוואת הפרבולה').value).toBe('y² = 8x');
    expect(parabolaEquationText(1)).toBe('y² = x');
    expect(parabolaEquationText(-4)).toBe('y² = -4x');
  });

  it('a surd cannot be cleared and prints as before', () => {
    expect(ellipseEquationText(Math.SQRT2, 3)).toBe(`x²/${fmtCoefficient(Math.SQRT2)} + y²/3 = 1`);
    expect(parabolaEquationText(Math.SQRT2)).toBe(`y² = ${fmtCoefficient(Math.SQRT2)}x`);
  });

  it('circles and lines are untouched', () => {
    expect(curveParts({ kind: 'circle', cx: 0, cy: 0, r: Math.sqrt(45 / 4) } as NumCurve).equation).toBe('x² + y² = 45/4');
    const a = answer(MIDPOINT('נתון מעגל שמשוואתו (x-3)^2+y^2=9', 'מעגל'), 'המקום הגיאומטרי של M');
    expect(a.value).toBe('מעגל · (x − 3/2)² + y² = 9/4');
    expect(lineText(-4 / 3, 1, 0)).toBe('-4x + 3y = 0');
  });
});
