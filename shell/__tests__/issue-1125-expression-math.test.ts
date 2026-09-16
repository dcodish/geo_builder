/**
 * #1125 — the formula trace is really typeset: one `<math>`, a radical that spans, a real fraction.
 *
 * Operator, playing PR #1116 T8/T9: *"the equations are not full mathml (the sqrt is not on the whole
 * line and ratios are not shown nicely)"*. He named two defects; measurement found a third he did not.
 *
 * **Root cause.** `shell/math.tsx` was built for stated MAGNITUDES (ADR-298 / #77 / #40 — the
 * `BC = 35/√32` case) and its grammar bottoms out at a literal number. The #1053 traces are arithmetic
 * over sub-expressions — `3² + (-4)²`, `(3 - 0)² + (4 - 0)²` — so `RADICAND` / `RTERM` / `VALUE` never
 * matched, the `√` and `/` survived as glyphs, and the tokenizer fell through to its innermost atoms,
 * emitting **one `<math>` island per superscript**. A lane that emits expressions was pointed at a
 * renderer whose grammar stops at values.
 *
 * Measured before the fix:
 *
 * | trace | `<math>` roots | `msqrt` | `mfrac` |
 * | --- | --- | --- | --- |
 * | `d(A, l1) = \|3·2 - 4·5 + 1\| / √(3² + (-4)²)` | 2 | 0 | 0 |
 * | `d = √((3 - 0)² + (4 - 0)²)` | 2 | 0 | 0 |
 * | `m = (4 - 0) / (3 - 0), …` | **`hasMath: false`** | 0 | 0 |
 *
 * The fix is the missing level — `shell/mathExpr.ts`, a recursive parser whose operands are themselves
 * expressions — NOT a wider `NUM`, which would still island and still bottom out one level down.
 */
import { describe, expect, it } from 'vitest';
import { hasMath, mathHtml } from '../math';

const roots = (h: string) => (h.match(/<math>/g) || []).length;

/** The operator's own traces, verbatim from the panel. */
const DISTANCE = 'd(A, l1) = |3·2 - 4·5 + 1| / √(3² + (-4)²)';
const LENGTH = 'd = √((3 - 0)² + (4 - 0)²)';
const SLOPE = 'm = (4 - 0) / (3 - 0),  y - 0 = m(x - 0)';

describe('#1125 — one formula is ONE <math>, not N islands', () => {
  it('the distance trace: a single root, the radical spanning, a real fraction', () => {
    const h = mathHtml(DISTANCE);
    expect(roots(h), 'islands').toBe(1);
    expect(h).toContain('<msqrt>');
    expect(h).toContain('<mfrac>');
  });

  it('the length trace: the radical spans the WHOLE radicand, both squares inside it', () => {
    const h = mathHtml(LENGTH);
    expect(roots(h)).toBe(1);
    const radicand = /<msqrt>([\s\S]*?)<\/msqrt>/.exec(h);
    expect(radicand, 'a radical is emitted at all').not.toBeNull();
    // Both squared terms live UNDER the root — the operator's "the sqrt is not on the whole line".
    expect((radicand![1].match(/<msup>/g) || []).length).toBe(2);
  });

  it('the slope trace was not typeset AT ALL — hasMath said false', () => {
    /**
     * The `/` clause in `hasMath` required a DIGIT either side, so a fraction bar between two bracketed
     * sub-expressions did not count as a fraction. It is exactly as much a fraction as one between two
     * numbers, and this is the case that proves the gate and the renderer were out of step.
     */
    expect(hasMath(SLOPE)).toBe(true);
    const h = mathHtml(SLOPE);
    expect(roots(h)).toBe(1);
    expect(h).toContain('<mfrac>');
  });

  it('the absolute value is FENCES, not literal pipes', () => {
    const h = mathHtml(DISTANCE);
    expect(h).toContain('<mo>|</mo>');
    // …and the bars are inside one row, so they read as a bracketed group rather than stray glyphs.
    expect(/<mrow><mo>\|<\/mo>[\s\S]*<mo>\|<\/mo><\/mrow>/.test(h)).toBe(true);
  });

  it('the fraction is a CONTAINER: the modulus over the radical', () => {
    const h = mathHtml(DISTANCE);
    const frac = /<mfrac>([\s\S]*)<\/mfrac>/.exec(h);
    expect(frac).not.toBeNull();
    expect(frac![1]).toContain('<mo>|</mo>');   // numerator
    expect(frac![1]).toContain('<msqrt>');      // denominator
  });
});

describe('#1125 — the stated-magnitude corpus is untouched', () => {
  /**
   * `shell/math.tsx` is shared by all four builders (ADR-W-040), and its existing grammar is what every
   * stated magnitude renders through. These are the exact strings the 2-D corpus pins, asserted here as
   * well because the change is in the shared file and the blast radius is four products.
   *
   * The boundaries matter as much as the markup: «BC = 35/√32» keeps `BC = ` as plain TEXT. Whole-line
   * runs would have been a simpler implementation and would have broken every one of these.
   */
  const UNCHANGED: Array<[string, string]> = [
    ['BC = 35/√32', 'BC = <math><mfrac><mn>35</mn><msqrt><mn>32</mn></msqrt></mfrac></math>'],
    ['√(2/3)', '<math><msqrt><mfrac><mn>2</mn><mn>3</mn></mfrac></msqrt></math>'],
    ['√2/3', '<math><mfrac><msqrt><mn>2</mn></msqrt><mn>3</mn></mfrac></math>'],
    ['2√5', '<math><mrow><mn>2</mn><msqrt><mn>5</mn></msqrt></mrow></math>'],
    ['AB = 10', 'AB = 10'],
    ['∠ABC = 37', '∠ABC = 37'],
    ['משולש ABC', 'משולש ABC'],
  ];

  for (const [input, expected] of UNCHANGED) {
    it(`«${input}» renders byte-identically`, () => {
      expect(mathHtml(input)).toBe(expected);
    });
  }

  it('√ still binds tighter than / — ADR-298’s disambiguation is not quietly reversed', () => {
    // The whole reason the √() toolbar grouping exists. Getting this backwards would change what a
    // student's own notation means without telling them.
    expect(mathHtml('√2/3')).toContain('<mfrac><msqrt>');
    expect(mathHtml('√(2/3)')).toContain('<msqrt><mfrac>');
  });

  it('a span with NO radical and NO fraction is left entirely alone', () => {
    /**
     * The expression run only matches where it will actually render. Without that guard it swallowed
     * neighbouring tokens it could not improve: «(x-3)^2+(y-4)^2=9» matched from the `+`, carried no
     * radical, and fell through to plain text — DROPPING a superscript the corpus had always typeset.
     */
    const h = mathHtml('(x-3)^2+(y-4)^2=9');
    expect(roots(h), 'both squares still typeset').toBe(2);
    expect((h.match(/<msup>/g) || []).length).toBe(2);
  });
});

describe('#1125 — a malformed span is kept verbatim, never half-parsed', () => {
  it('declines rather than dropping a term', () => {
    /**
     * Four products render through this. A parse that silently dropped an operand would show a student
     * a formula that is not the one they were given — the honesty class this codebase exists to avoid —
     * so every level returns null on a shape it does not recognise and the text survives unchanged.
     */
    for (const bad of ['√(3 + ', '|3 - 2 / 4', '(4 - 0) / (3 - 0']) {
      expect(mathHtml(bad), bad).toBe(mathHtml(bad));
      expect(roots(mathHtml(bad)), bad).toBe(0);
    }
  });
});
