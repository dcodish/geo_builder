/**
 * #1229 (ADR-W-063) — A NON-BRACKET PREFIX MUST NOT STOP A FRACTION TYPESETTING EITHER.
 *
 * The parabola's folded detail from #1212 renders as
 *
 * ```
 * F(27/2, 0), x = -27/2   ->   the trailing fraction stacks; the bracketed one stays flat
 * ```
 *
 * A comma ends a span (#1125), so the span is `F(27/2` — an opening bracket whose partner sits past the
 * boundary, with a non-bracket prefix in front of it. #1208's `peelBrackets` already handles exactly
 * this shape, but only when the span BEGINS with the bracket; here it begins with `F`, so nothing
 * peeled and the perfectly good `27/2` went down with the bracket.
 *
 * WHY THIS WAS SPLIT OUT OF #1217 RATHER THAN FIXED INSIDE IT, and the reason the third test below is
 * the one that matters: the obvious repair — when a span fails to render, advance one character and
 * look again — was tried and turned `issue-1125-expression-math.test.ts` red on `|3 - 2 / 4`. That bar
 * is unmatched in the STUDENT'S OWN TEXT, and stepping over it typesets `2/4` beside a stray `|`: a
 * formula the student was never given. The lock was right.
 *
 * So the two cases are told apart the way [ADR-W-060](../../docs/06w-decisions-workspace.md) already
 * tells them apart — an imbalance at the span's EDGE is an artefact of where the span was cut, one in
 * the MIDDLE is the student's text — and the peel stays driven by bracket DEPTH, never by "try again
 * one character along".
 */
import { describe, expect, it } from 'vitest';
import { mathHtml } from '../math';

/** How many fractions the renderer actually drew. */
const fracs = (s: string): number => (mathHtml(s).match(/<mfrac/g) ?? []).length;

describe('#1229 — a fraction inside a bracketed prefix typesets', () => {
  it('the operator’s own row typesets BOTH fractions', () => {
    expect(fracs('F(27/2, 0), x = -27/2')).toBe(2);
  });

  it('the bare prefixed span typesets its fraction', () => {
    expect(fracs('F(27/2')).toBe(1);
  });

  // the same class, one letter over — an ordered pair written with a point's name in front
  it('a named ordered pair typesets both coordinates', () => {
    expect(fracs('A(1/2, 3/4)')).toBe(2);
  });

  /**
   * THE LOCK THAT MATTERS. An imbalance in the student's own text still renders NOTHING — this is the
   * row the falsified "advance one character" approach broke, and the reason this issue exists apart
   * from #1217.
   */
  it.each([
    ['an unmatched bar in the student’s text', '|3 - 2 / 4'],
    ['an unterminated radical', '√(3 + '],
    ['an unterminated bracketed quotient', '(4 - 0) / (3 - 0'],
  ])('%s still renders nothing', (_name, s) => {
    expect(fracs(s as string)).toBe(0);
  });

  it('#1208 is intact — an unprefixed ordered pair still typesets both coordinates', () => {
    expect(fracs('P = (14/3, 31/3)')).toBe(2);
  });

  it('#1125 is intact — a two-statement line still typesets only its one expression', () => {
    expect(fracs('m = (4-0)/(3-0), y - 0 = 2x')).toBe(1);
  });

  it('a plain fraction, bracketed or not, is unchanged', () => {
    expect(fracs('27/2')).toBe(1);
    expect(fracs('(27/2)')).toBe(1);
  });
});
