/**
 * #1296 — the leading-sign fixture table, written ONCE and asserted by every product.
 *
 * ## Why the rows live here and the assertions live in three files
 *
 * The span logic is copied three times — `shell/bidi.ts` (analytic + complex), `src/i18n/bidi.ts` (2-D)
 * and `src3d/i18n/bidi.ts` (3-D) — and all three carried this defect identically, so a per-tree lock with
 * its own rows would not notice one copy drifting. The obvious answer, one test importing all three kits,
 * is **forbidden and rightly so**: `shell/` may never import a product tree (ADR-W-016 rule 2), and
 * `server/__tests__/isolation.test.ts` refused the first draft of this file for exactly that.
 *
 * So the ROWS are shared and the ASSERTIONS are per tree. Products import `shell/`, which is the allowed
 * direction, and the table still exists in one place: changing a row changes it for every product at once,
 * which is the drift net the three-copy situation needs. The copies go away when Track B migrates 2-D and
 * 3-D onto this core (docs/28 §5a) — and then the three test files collapse into one.
 *
 * The isolate characters are written by CODE POINT, never literally — `shell/bidi.ts`'s own rule: typed
 * as themselves they are invisible in this file, so a later edit cannot see what it is changing.
 *
 * Test-only data: nothing here is imported by runtime code.
 */

import { describe, it, expect } from 'vitest';

const LRI = '\u2066';
const PDI = '\u2069';

/** `[x]` marks the isolate, so an expected value reads as the layout it asserts. */
export const iso = (s: string): string => s.replace(/\[/g, LRI).replace(/\]/g, PDI);

/**
 * A SIGN opens the run and must be INSIDE the isolate.
 *
 * Before the fix each of these left the sign outside, where it is a bidi neutral and the UBA flips it into
 * the RTL paragraph: the student read «(2,4-)» for what they typed as `(-2,4)`. Both spellings of the
 * minus are here — U+002D from a keyboard, U+2212 from an exam-PDF paste — and the vector row is 3-D's
 * everyday vocabulary, which is why this was never analytic-only.
 */
export const SIGN_ROWS: [string, string][] = [
  ['נקודה (-2,4) נמצאת על ישר 3', 'נקודה [(-2,4)] נמצאת על ישר [3]'], // the operator's own line
  ['הנקודה (-2,4)', 'הנקודה [(-2,4)]'],
  ['המרחק הוא -5', 'המרחק הוא [-5]'],
  ['השיפוע הוא -3', 'השיפוע הוא [-3]'],
  ['הישר -2x+y=0', 'הישר [-2x+y=0]'],
  ['מעגל שרדיוסו 5 ומרכזו (-3,2)', 'מעגל שרדיוסו [5] ומרכזו [(-3,2)]'],
  ['נקודה P(0,0) והנקודה (-1,-1)', 'נקודה [P(0,0)] והנקודה [(-1,-1)]'],
  ['וקטור (-1,2,3)', 'וקטור [(-1,2,3)]'],
  ['נקודה (−2,4) נמצאת על הישר', 'נקודה [(−2,4)] נמצאת על הישר'], // U+2212
  ['-5 הוא הערך', '[-5] הוא הערך'], // no Hebrew letter precedes it at all — the line opens with the sign
];

/**
 * A MAQAF is not a sign — the counter-direction, and the half a blunt fix would have destroyed.
 *
 * Every row here was ALREADY correct and must stay correct. `-` after a Hebrew letter is the particle's
 * hyphen and belongs to the Hebrew word, which is why the signs are not simply added to the run alphabet.
 * «הערך שווה ל-(-5)» is the row that proves the rule is positional rather than a property of the
 * character: the same `-` twice in one line, the first out and the second in.
 */
export const MAQAF_ROWS: [string, string][] = [
  ['B נמצא על ציר ה-x', '[B] נמצא על ציר ה-[x]'],
  ['סמן את הנקודות A(0,0) ו-B(6,8)', 'סמן את הנקודות [A(0,0)] ו-[B(6,8)]'],
  ['t הוא פרמטר קטן מ-9', '[t] הוא פרמטר קטן מ-[9]'],
  ['המרחק בין AB ל-l1', 'המרחק בין [AB] ל-[l1]'],
  ['תיכון מ-A לצלע BC', 'תיכון מ-[A] לצלע [BC]'],
  ['הערך שווה ל-5', 'הערך שווה ל-[5]'],
  ['הערך שווה ל-(-5)', 'הערך שווה ל-[(-5)]'],
];

/**
 * Untouched by this change — the negative controls saying the span selection is otherwise unaltered.
 *
 * Only rows where all three kits agree. A DECLARATION («נתון הישר l1: …») is deliberately absent: 3-D
 * splits it into a name island and an equation island via `declSplit`, a documented parameter of
 * `makeBidi` rather than a divergence to iron out. Each tree asserts that one for itself, so the
 * difference stays recorded instead of being flattened by a shared expectation.
 */
export const UNCHANGED_ROWS: [string, string][] = [
  ['הנקודה (2,-4)', 'הנקודה [(2,-4)]'], // an INTERIOR minus was always fine
  ['נקודה (2,4) נמצאת על ישר 3', 'נקודה [(2,4)] נמצאת על ישר [3]'],
  ['נתונה הנקודה A(2,6)', 'נתונה הנקודה [A(2,6)]'],
];

export const ALL_ROWS = [...SIGN_ROWS, ...MAQAF_ROWS, ...UNCHANGED_ROWS];

/**
 * The per-tree suite, so each product asserts the SAME table against its own kit and nothing is asserted
 * in one tree that is not asserted in the others.
 *
 * Imports vitest directly: this module is only ever imported BY a test file, so it already runs inside
 * the runner. (It is not itself collected — the include glob matches `*.test.ts`, which this is not.)
 */
export function leadingSignSuite(isolateLtrRuns: (s: string) => string): void {
  describe('#1296 — a leading sign belongs to the run', () => {
    it.each(SIGN_ROWS)('sign joins the run: %s', (input, expected) => {
      expect(isolateLtrRuns(input)).toBe(iso(expected));
    });

    it.each(MAQAF_ROWS)('maqaf stays with the Hebrew: %s', (input, expected) => {
      expect(isolateLtrRuns(input)).toBe(iso(expected));
    });

    it.each(UNCHANGED_ROWS)('unchanged: %s', (input, expected) => {
      expect(isolateLtrRuns(input)).toBe(iso(expected));
    });

    /**
     * The defect was invisible to anyone reading the string, because the string was never wrong. Asserted
     * as a property: isolation adds only the two invisible controls, so it can never reach the parser or
     * the fact list (#531 / #751).
     */
    it('changes DISPLAY only — the text itself is untouched', () => {
      for (const [input] of ALL_ROWS) {
        expect(isolateLtrRuns(input).replace(/[\u2066\u2069]/g, '')).toBe(input);
      }
    });

    it('is idempotent — isolating twice adds no second layer', () => {
      for (const [input] of SIGN_ROWS) {
        const once = isolateLtrRuns(input);
        expect(isolateLtrRuns(once)).toBe(once);
      }
    });
  });
}
