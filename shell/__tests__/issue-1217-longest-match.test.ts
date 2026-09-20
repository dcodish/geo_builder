/**
 * #1217 — THE LONGEST MATCH THAT RENDERS WINS, NOT THE FIRST ONE THAT MATCHES.
 *
 * **Operator, 2026-09-19, playing T21:** *"the mathml on the row below textbox and the input rows are
 * not working. This rule of using mathml is for all shapes so why does it work on circle but not
 * elipeses? it is also the same rule for all tools (2d/3d/complex)"* — on «נתונה אליפסה שמשוואתה
 * x^2/9+y^2/16=1», whose first power typeset and whose fractions did not.
 *
 * He was right on every count, including that it is not an ellipse problem and not an analytic one.
 *
 * ## The circle was not working either
 *
 * ```
 * x^2/9+y^2/16=1            ->  «█/9+y^2/16=1»     the report
 * מעגל (x-3)^2+(y-5)^2=25   ->  «מעגל █+█=25»      the same defect, invisible
 * ```
 *
 * The circle's leftovers are `+` and `=25` — an operator and a number, unremarkable as plain text —
 * while the ellipse's leftover is `/9+`, a fraction bar that obviously should have been a fraction.
 * Same cause, different-looking damage, which is why it read as ellipse-specific.
 *
 * ## The cause
 *
 * The alternatives sat in one alternation, and JS takes the first BRANCH that matches at the earliest
 * position. At index 0 of `x^2/9` both `SUP` (`x^2`) and `EXPR` (`x^2/9`) start, so `SUP` won and ate
 * the numerator, leaving a `/9` with nothing on its left to be a fraction with.
 *
 * `(x^2)/9` rendering correctly is the proof this is precedence and not a rendering gap — the brackets
 * only stop `SUP` matching first, and `exprML` composes the power inside the fraction perfectly well.
 *
 * ## What the old order was protecting, and still protects
 *
 * `EXPR` asserts a `√` or a `/` inside its span up front, so it never matches on `(x-3)^2+(y-4)^2=9`
 * or `y^2 = 54x` at all. The superscript islands the corpus asserts are untouched — which is why the
 * regression guards below matter more than the fixes.
 */
import { describe, expect, it } from 'vitest';
import { mathHtml } from '../math';

const fracs = (s: string) => (mathHtml(s).match(/<mfrac/g) ?? []).length;
const sups = (s: string) => (mathHtml(s).match(/<msup/g) ?? []).length;

describe('#1217 — a power over a fraction bar keeps its fraction', () => {
  it('a power in the numerator no longer kills the fraction', () => {
    // The three-line proof from the issue: a plain fraction always worked, adding a power broke it,
    // and bracketing it brought it back — so the renderer could always do this.
    expect(fracs('x/9'), 'a plain fraction').toBe(1);
    expect(fracs('x^2/9'), 'a power over a bar').toBe(1);
    expect(sups('x^2/9'), 'and the power itself').toBe(1);
    expect(fracs('(x^2)/9'), 'the bracketed form, unchanged').toBe(1);
  });

  it("the operator's ellipse typesets both fractions and both powers", () => {
    expect(fracs('נתונה אליפסה שמשוואתה x^2/9+y^2/16=1')).toBe(2);
    expect(sups('נתונה אליפסה שמשוואתה x^2/9+y^2/16=1')).toBe(2);
  });

  it('the ² CHARACTER behaves like ^2 — which is what #1212 composes', () => {
    /**
     * `curveParts` writes the ellipse row with `²`, not `^2`, so a fix that only handled the caret
     * would have left the panel row this was reported against exactly as broken.
     */
    expect(fracs('x²/16 + y²/9 = 1')).toBe(2);
    expect(sups('x²/16 + y²/9 = 1')).toBe(2);
  });

  it('THE SUPERSCRIPT ISLANDS ARE UNTOUCHED — the guard the old order existed for', () => {
    /**
     * `EXPR` requires a `√` or a `/` in its span, and neither of these has one, so `SUP` still wins
     * exactly as before. If this ever goes red, the fix has overreached.
     */
    expect(sups('מעגל (x-3)^2+(y-5)^2=25')).toBe(2);
    expect(fracs('מעגל (x-3)^2+(y-5)^2=25')).toBe(0);
    expect(sups('(x - 3)² + (y - 4)² = 9')).toBe(2);
    expect(sups('y² = 54x')).toBe(1);
    expect(sups('y^2 = 54x')).toBe(1);
  });

  it('VALUE still wins over a power where it used to — «2²» is not a lone number', () => {
    // A tie-break check: `SUP` is declared before `VALUE`, and equal-length matches keep that order.
    expect(sups('2² = 4')).toBe(1);
  });

  it('#1208 is intact — both coordinates of an ordered pair still typeset', () => {
    expect(fracs('P = (14/3, 31/3)')).toBe(2);
    expect(fracs('P = (14/3, 5)')).toBe(1);
    expect(fracs('(14/3')).toBe(1);
    expect(fracs('14/3)')).toBe(1);
  });

  it('#1125 is intact — a malformed span is still never half-parsed', () => {
    /**
     * This caught a first attempt at the fix. Advancing one character past a span that refused to
     * render would have let `|3 - 2 / 4` typeset its `2/4` beside a stray, unmatched bar — a formula
     * the student was never given. A refusal consumes its whole span, deliberately.
     */
    for (const bad of ['√(3 + ', '|3 - 2 / 4', '(4 - 0) / (3 - 0']) {
      expect(fracs(bad), bad).toBe(0);
      expect(sups(bad), bad).toBe(0);
    }
  });

  it('the other token kinds are unaffected', () => {
    expect(mathHtml('קשת AC')).toContain('mover');
    expect(mathHtml('A_{1}')).toContain('msub');
    expect(fracs('BC = 35/√32'), 'the value grammar keeps its own path').toBe(1);
    expect(fracs('m = (4 - 0) / (3 - 0),  y - 0 = m(x - 0)'), 'a comma still ends a span').toBe(1);
  });
});
