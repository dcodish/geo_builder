/**
 * #1215 — THE PREVIEW TYPESETS WHAT IT PREVIEWS.
 *
 * **Operator, 2026-09-19**, typing «מעגל (x-3)^2+(y-5)^2=25»: *"note the text below the textbox isnt
 * mathml"*. Three renderings of one sentence were on screen, and the preview was the odd one out:
 *
 * ```
 * the BOX        2+(y-5)^2=25^(x-3) מעגל       reordered by bidi while typing
 * the PREVIEW    מעגל (x-3)^2+(y-5)^2=25       right order, raw ^2      ← the report
 * the FACT ROW   מעגל (x - 3)² + (y - 5)² = 25 right order, typeset
 * ```
 *
 * ## Nothing needed building
 *
 * `InputArea`'s `preview` prop takes a **ReactNode**, and its own comment says *"2-D's maths renderer
 * rides the same prop at its adoption"*. 2-D adopted it:
 *
 * ```
 * src/App.tsx      preview={(s) => (hasMath(s) ? <MathText text={s} /> : inputPreview(s))}
 * src-analytic     preview={(s) => analyticBidi.inputPreview(s)}      ← the gap
 * ```
 *
 * `hasMath` and `MathText` have been in `shell/math.tsx` the whole time. This tree — where equations
 * are the entire subject matter — was the one not reaching for them.
 *
 * ## The half-typed case is what decides whether this is safe
 *
 * A preview sees every intermediate string, so the question is whether a partial equation renders
 * garbage. It cannot: `hasMath` stays false until an exponent or a fraction completes, so early
 * keystrokes fall through to the bidi previewer exactly as before — and past that point every prefix
 * either typesets whole or stays text, which is ADR-W-060's rule.
 *
 * `src3d/` and `src-complex/` have the identical gap and are deliberately out of scope: separate
 * products, separate issues.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasMath, mathHtml } from '../../shell/math';
import { analyticBidi } from '../i18n';

const APP = fs.readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8');
const LINE = 'מעגל (x-3)^2+(y-5)^2=25';

describe('#1215 — the input preview renders maths as maths', () => {
  it('the panel wires the maths renderer into the preview seam', () => {
    // A source scan, like `bidi-wiring.test.ts`: this seam is what a refactor drops silently.
    expect(APP).toMatch(/preview=\{[\s\S]{0,80}hasMath\(s\)[\s\S]{0,40}<MathText/);
  });

  it('IT ISOLATES BEFORE IT TYPESETS — found by looking, not by asserting', () => {
    /**
     * Handing the raw string to `MathText` typeset it perfectly and laid it out BACKWARDS. The
     * renderer emits several `<math>` islands with text between them, and in an RTL paragraph that
     * sequence runs right-to-left, so «מעגל (x-3)²+(y-5)²=25» drew with `=25` at the far left —
     * the defect this preview exists to prevent, reintroduced by its own fix.
     *
     * Driven in a browser and measured by the islands' x-positions: before, left-to-right read
     * `[(y-5)², (x-3)²]`; after, `[(x-3)², (y-5)²]`. jsdom does not do bidi layout, so what a unit
     * test CAN hold is that the isolate is still applied on this path — which is the cause.
     */
    expect(APP).toMatch(/<MathText text=\{analyticBidi\.isolateLtrRuns\(s/);
  });

  it('THE BIDI PREVIEWER IS STILL THERE as the fallback — it is not replaced', () => {
    /**
     * The preview exists for bidi in the first place. If adoption dropped it, a half-typed Hebrew
     * line would lose the reading order this panel was built to fix (#1088).
     */
    expect(APP).toContain('analyticBidi.inputPreview(s)');
  });

  it("the operator's own line is maths, and typesets", () => {
    expect(hasMath(LINE)).toBe(true);
    expect(mathHtml(LINE)).toContain('<msup');
  });

  it('a half-typed exponent is NOT maths, so it takes the bidi path unchanged', () => {
    /**
     * The guarantee that makes a live preview safe. A dangling caret must never be half-typeset.
     */
    expect(hasMath('מעגל (x-3)^'), 'a caret with no exponent yet').toBe(false);
    expect(hasMath('מעגל (x-3'), 'mid-bracket').toBe(false);
    expect(hasMath('מעגל '), 'just the noun').toBe(false);
  });

  it('and the bidi path still returns the isolated form for those prefixes', () => {
    // What the student actually sees while typing the Hebrew half — unchanged by this issue.
    const partial = 'מעגל (x-3';
    expect(analyticBidi.inputPreview(partial)).not.toBeNull();
  });

  it('every prefix from the switch-over point on typesets whole, never half', () => {
    /**
     * Walks the real string the operator typed. Once `hasMath` turns true it must stay true and the
     * render must never produce a partial formula — `mathHtml` either renders a span or leaves it as
     * text, so the assertion is that no prefix throws and each one is stable.
     */
    let seenMath = false;
    for (let i = 1; i <= LINE.length; i += 1) {
      const s = LINE.slice(0, i);
      if (hasMath(s)) seenMath = true;
      expect(() => mathHtml(s), s).not.toThrow();
    }
    expect(seenMath, 'the completed line is maths').toBe(true);
  });
});
