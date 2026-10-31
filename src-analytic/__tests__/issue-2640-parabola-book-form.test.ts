/**
 * #2640 ([ADR-AG-357 Am. 1](../../docs/06c-decisions-analytic.md#adr-ag-357)) — a parabola with a fractional coefficient
 * printed «2y² = 5x» (#2614 cleared the fraction). Operator, 2026-10-30, failing T13 of round #2627: *"a parabola
 * equation should always be in the y^2=ax format so showing 2y^2=5x is not what a student would see in a book"*.
 *
 * Rulings, 2026-10-31: a terminating coefficient prints as a decimal, «y² = 2.5x» (ruling (a)); a non-terminating
 * one keeps the exact fraction, *"it should print 5/3 nicely"* — «y² = 5/3x», which `MathText` typesets as a stacked
 * 5-over-3 before the x. Integers as before, `y² = x` never `1x`, the sign attached, a surd as before #2614.
 *
 * The parabola printer is ONE function (`parabolaEquationText`) behind every surface: the ask by name, the panel row
 * (`curveParts`), the locus row and its canvas label (`locusEquation` → `drawnLoci`). Each is checked through the real
 * door (`decideSubmit` → `derive` → `ask`) with the real formatter (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { decideSubmit } from '../app/submit';
import { curveParts, locusEquation, parabolaEquationText } from '../app/curveText';
import { derive } from '../engine/derive';
import { fmtAnalytic, fmtCoefficient } from '../format';
import { mathHtml } from '../../shell/math';
import type { NumCurve } from '../engine/types';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const t = ((k: string) => HE[k] ?? k) as never;
const build = (lines: string[]) => {
  lines.forEach((l, i) => expect(decideSubmit(l, lines.slice(0, i), 0).kind, l).toBe('record'));
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return d;
};
const answer = (lines: string[], question: string) => ask(build(lines), question, fmtAnalytic, t);
const parabolaOf = (lines: string[]): NumCurve => {
  const c = build(lines).figure.curves.find((k) => k.curve.kind === 'parabola');
  expect(c, 'a parabola is drawn').toBeDefined();
  return c!.curve;
};

describe("#2640 — the operator's T13 sequence: a parabola keeps the book's y² = ax", () => {
  const T13 = ['נתונה פרבולה שמשוואתה y^2=2.5x'];

  it('«משוואת הפרבולה» answers y² = 2.5x', () => {
    expect(answer(T13, 'משוואת הפרבולה').value).toBe('y² = 2.5x');
  });

  it('the panel row reads the same equation', () => {
    expect(curveParts(parabolaOf(T13)).equation).toBe('y² = 2.5x');
  });
});

describe('#2640 — a non-terminating coefficient keeps the exact fraction', () => {
  // The parser reads `5/3x` as (5/3)·x (measured: as `(5/3)x` and `5x/3` do), so the printed form round-trips.
  it.each([
    ['נתונה פרבולה שמשוואתה y^2=5/3x', 'y² = 5/3x'],
    ['נתונה פרבולה שמשוואתה y^2=5x/3', 'y² = 5/3x'],
    ['נתונה פרבולה שמשוואתה 3y^2=5x', 'y² = 5/3x'],
    ['נתונה פרבולה שמשוואתה 3y^2=-5x', 'y² = -5/3x'],
  ])('«משוואת הפרבולה» on %s answers %s', (given, eq) => {
    expect(answer([given], 'משוואת הפרבולה').value).toBe(eq);
    expect(curveParts(parabolaOf([given])).equation).toBe(eq);
  });

  it('MathText typesets 5/3 as a stacked fraction before the x', () => {
    expect(mathHtml('y² = 5/3x')).toMatch(/<mfrac><mn>5<\/mn><mn>3<\/mn><\/mfrac><mi>x<\/mi>/);
    // The typesetter's existing rule for a signed fraction: the minus rides the numerator, (−5)/3, then the x.
    expect(mathHtml('y² = -5/3x')).toMatch(/<mfrac><mrow><mo>-<\/mo><mn>5<\/mn><\/mrow><mn>3<\/mn><\/mfrac><mi>x<\/mi>/);
    // A decimal is one number, never a fraction.
    expect(mathHtml('y² = 2.5x')).not.toMatch(/mfrac/);
  });
});

describe('#2640 — the class: every k, on every surface, through one printer', () => {
  it.each([
    [2.5, 'y² = 2.5x'],
    [-2.5, 'y² = -2.5x'],
    [0.5, 'y² = 0.5x'],
    [1.25, 'y² = 1.25x'],
    [0.125, 'y² = 0.125x'],
    [0.2, 'y² = 0.2x'],
    [5 / 3, 'y² = 5/3x'],
    [-5 / 3, 'y² = -5/3x'],
    [1 / 3, 'y² = 1/3x'],
    [7 / 6, 'y² = 7/6x'],
    [1, 'y² = x'],
    [-1, 'y² = -x'],
    [4, 'y² = 4x'],
    [-8, 'y² = -8x'],
  ])('k = %d prints %s', (k, eq) => {
    expect(parabolaEquationText(k)).toBe(eq);
    const c = { kind: 'parabola', p: k / 2 } as NumCurve;
    expect(curveParts(c).equation).toBe(eq);
    expect(locusEquation({ conic: {} as never, curve: c } as never, fmtCoefficient)).toBe(eq);
  });

  it('a surd prints as it did before #2614 (the coefficient decimal)', () => {
    expect(parabolaEquationText(2 * Math.SQRT2)).toBe(`y² = ${fmtCoefficient(2 * Math.SQRT2)}x`);
    expect(parabolaEquationText(-Math.SQRT2)).toBe(`y² = -${fmtCoefficient(Math.SQRT2)}x`);
  });

  it.each([
    ['y^2=5x', 'פרבולה · y² = 2.5x'],
    ['3y^2=10x', 'פרבולה · y² = 5/3x'],
    ['y^2=2x', 'פרבולה · y² = x'],
  ])('the midpoint locus of %s: row and canvas label read %s', (eq, shown) => {
    const a = answer([`נתונה פרבולה שמשוואתה ${eq}`, 'O(0,0)', 'נקודה P על הפרבולה', 'M אמצע OP'], 'המקום הגיאומטרי של M');
    expect(a.value).toBe(shown);
    expect(drawnLoci([a])[0].label).toBe(shown);
  });
});
