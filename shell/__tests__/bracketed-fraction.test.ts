/**
 * #1208 — AN OPENING BRACKET MUST NOT STOP A FRACTION TYPESETTING.
 *
 * Operator, 2026-09-18, playing T8: *"the x of point P is not shown correctly. the y of point P is the
 * right presentation"* — on a panel row reading `P = (14/3, 31/3)`, where the y was a stacked fraction
 * and the x was flat text.
 *
 * Measured, it is not about x versus y. It is the BRACKET:
 *
 * ```
 * (14/3            ->  0 fractions
 * 14/3)            ->  1
 * P = (14/3, 5)    ->  0
 * P = (5, 31/3)    ->  1
 * ```
 *
 * `EXPR` carries no comma on purpose (#1125: «m = (4-0)/(3-0), y - 0 = …» is two statements). But a
 * span beginning at a bracket and ending at that comma holds an opener whose partner is outside it, so
 * `exprML` refuses the whole thing — correctly, since half-parsing a formula would show the student a
 * formula they were not given. The bracket was simply never part of the expression.
 *
 * This lives in `shell/` because the renderer does: 2-D, 3-D, complex and analytic all typeset through
 * it, and every one of them writes ordered pairs.
 */
import { describe, expect, it } from 'vitest';
import { mathHtml } from '../math';

/** How many fractions the renderer actually drew. */
const fracs = (s: string) => (mathHtml(s).match(/<mfrac/g) ?? []).length;

describe('#1208 — a bracketed fraction typesets', () => {
  it('the operator’s own row typesets BOTH coordinates', () => {
    expect(fracs('P = (14/3, 31/3)')).toBe(2);
  });

  it('it was the bracket, not the position in the pair', () => {
    // Both halves of the measurement that located the defect, so the diagnosis is locked with the fix.
    expect(fracs('P = (14/3, 5)')).toBe(1);
    expect(fracs('P = (5, 31/3)')).toBe(1);
    expect(fracs('(14/3')).toBe(1);
    expect(fracs('14/3)')).toBe(1);
  });

  it('the peeled bracket survives as TEXT — the span is not silently eaten', () => {
    const html = mathHtml('P = (14/3, 31/3)');
    expect(html).toContain('(');
    expect(html).toContain(')');
    expect(html).toContain(',');
  });

  it('#1125’s cases are untouched — a bracketed formula still renders as one expression', () => {
    // The trace formulas, which are the reason EXPR stops at a comma in the first place.
    expect(fracs('m = (4 - 0) / (3 - 0)')).toBe(1);
    expect(fracs('m = (0-5)/(0-3), y - 5 = m(x - 3)')).toBe(1);
  });

  it('a genuinely malformed span still renders VERBATIM — never half-parsed', () => {
    /**
     * The guarantee the peel must not spend. An unmatched bracket in the MIDDLE is not an edge artefact
     * of the span boundary; it means the text really is malformed, and the renderer says so by leaving
     * it alone rather than inventing a reading.
     */
    const html = mathHtml('1/(2))(3');
    expect(html).not.toContain('<mfrac');
  });

  it('text with no mathematics is left completely alone', () => {
    expect(mathHtml('AB = 10')).toBe('AB = 10');
    expect(mathHtml('(a nice figure)')).toBe('(a nice figure)');
  });
});
