/**
 * #934 (ADR-3D-228) — A ROW'S BASE DIRECTION IS A CONTENT DECISION, AND `dir="auto"` IS NOT IT.
 *
 * Operator, playing round #931: *"still we have a bidi issue on the display of the input. I want you
 * to do a more detailed review on this matter and fix the root cause and not case by case."*
 *
 * The root cause was `dir="auto"` on the fact row and on the ask row of `App3.tsx`. It keys off the
 * FIRST STRONG character, so a fact opening with a Latin point label — «K על AA' כך ש-AK = 2KA'»,
 * «E אמצע AB», «∠BAS = 40» — took an LTR base. Under an LTR base the isolated technical runs are
 * neutral objects, so «על», the isolate and «כך ש-» resolve into ONE right-to-left run and the two
 * Hebrew words swap: the row said «K כך ש AA' על …» — a sentence the student never typed.
 *
 * MEASURED IN A REAL BROWSER before and after (Playwright, per-glyph `Range` rects on /3d.html):
 *
 *   before   dir attr auto → resolved ltr   visual L→R  K · כך ש · AA' · על · -AK = 2KA'   ✗
 *   after    dir attr rtl  → resolved rtl   visual L→R  AK = 2KA' · -  · כך ש · AA' · על · K   ✓
 *                                           (an RTL row reads right-to-left: K על AA' כך ש-AK = 2KA')
 *
 * WHY THESE ARE NOT STRING ASSERTIONS. Five previous bidi fixes shipped and missed this row because
 * every one of their locks asserted a STRING — and the string was correct on every broken build. The
 * defect lives in the base direction of the container and in the ORDER its children lay out in, so
 * that is what is asserted here: the resolved `dir`, and DOM order (under `dir="rtl"` the visual
 * order is the reverse of DOM order, which is what a Hebrew reader needs).
 */
import { describe, expect, it } from 'vitest';
import { factRowDir3 } from '../FactRow3';

const NAMES = new Set(['u', 'v', 'w']);
const fact = (utterance: string, type = 'point-on') => ({ utterance, cmds: [{ type }] });

describe('#934 — the fact row takes its base direction from its CONTENT', () => {
  /**
   * The battery is the point: a Hebrew-first row was never broken, so a test built from one proves
   * nothing. Every row here holds Hebrew and must therefore read RTL, whatever it opens with.
   */
  const HEBREW_ROWS = [
    "K על AA' כך ש-AK = 2KA'", // the operator's own row — Latin label first
    'E אמצע AB', // Latin label first
    '∠BAS = 40 מעלות', // symbol first
    't = 1/4 כאשר', // symbol first
    "תיבה ABCDA'B'C'D'", // Hebrew first — the case that always worked
    'נסמן: AB = u, AD = v, AS = w', // #933's row
  ];

  it.each(HEBREW_ROWS)('«%s» resolves rtl', (u) => {
    expect(factRowDir3(fact(u), NAMES)).toBe('rtl');
  });

  it('a row with no Hebrew at all stays ltr — this is not "always rtl"', () => {
    expect(factRowDir3(fact('AB = 2CD'), NAMES)).toBe('ltr');
    expect(factRowDir3(fact('t = 1/4'), NAMES)).toBe('ltr');
  });

  it('a VECTOR row is measured on the string the renderer actually receives', () => {
    // factDisplay3 rewrites a vector fact (arrows, underlines) before VecMath sees it. The direction
    // must be taken from THAT string, or the container and its content can disagree about the row.
    const vec = { utterance: 'נסמן: AB = u, AD = v, AS = w', cmds: [{ type: 'vec-def' }] };
    expect(factRowDir3(vec, NAMES)).toBe('rtl');
  });

  it('fails on the pre-fix behaviour: dir="auto" would have called the operator\'s row ltr', () => {
    // The first-strong rule, spelled out, so the regression is legible without a browser: the row
    // opens with «K», a strong LTR character, which is exactly what `dir="auto"` keys off.
    const firstStrong = (s: string) => (/[֐-׿]/.test(s[0]) ? 'rtl' : 'ltr');
    const row = "K על AA' כך ש-AK = 2KA'";
    expect(firstStrong(row)).toBe('ltr'); // what the browser did
    expect(factRowDir3(fact(row), NAMES)).toBe('rtl'); // what it does now
  });
});
