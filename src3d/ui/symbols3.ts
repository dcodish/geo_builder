/**
 * The symbol palette — the characters the tool OFFERS the student, declared once.
 *
 * Extracted from `App3.tsx` for #482. It lived inline in the JSX, which made it invisible to everything
 * except the render, and that is precisely how it drifted out of step with `i18n/bidi.ts`'s `CORE`: 13 of
 * the 18 characters this palette inserts — every Greek letter, `ℓ`, `′`, `·`, `½`, `¾`, `<`, `⃗` — were
 * absent from the class that decides what belongs to an LTR technical run, so a plane named `π1` was
 * split from its own digit at the isolate boundary.
 *
 * Being a module makes the vocabulary assertable: `__tests__/bidi3.test.ts` requires every character here
 * to be CORE or a run delimiter, so ADDING A BUTTON WITHOUT TEACHING BIDI ABOUT IT FAILS THE SUITE. That
 * test is the whole reason this file exists — the drift, not the palette, was the defect.
 */

/** `[button label, text inserted at the caret, characters to step the caret BACK after inserting]`. */
export type Symbol3 = readonly [label: string, insert: string, caretBack: number];

export const SYMBOL_PALETTE_3: readonly Symbol3[] = [
  // Greek letters for angle names (#272): 2-D has had these since ADR-039 — «∠SAB = α»
  // is unusable when the letter can't be typed.
  ['α', 'α', 0],
  ['β', 'β', 0],
  ['γ', 'γ', 0],
  ['δ', 'δ', 0],
  ['θ', 'θ', 0],
  ['<', '<', 0], // a bound / ordering between measures
  ['⃗', '⃗', 0],
  ['|·|', '||', 1],
  ['√', '√', 0],
  // #511: the POWER, the second half of the operator's #509 report («I also dont have the power option
  // in the symbols»). Placed beside √ because a power and a root are the same student's reach. The
  // parser takes BOTH spellings — «C(p^2,1,0)» and «C(p²,1,0)» build identically — so the palette
  // offers the SUPERSCRIPT, which is the one an Israeli keyboard cannot produce.
  //
  // SCOPE, so the button is honest: a power is meaningful in a COORDINATE COMPONENT only. «|AB|² = 25»,
  // «p² = 4» and «x²+y²+z² = 9» are still not-handled — unchanged by this button, which offers the
  // character in the position that works rather than withholding it everywhere (ADR-3D-214).
  //
  // ² is ALREADY in bidi CORE, so the bidi3.test.ts drift lock passes untouched — which is that
  // lock working as designed, not a coincidence.
  ['²', '²', 0],
  ['½', '½', 0],
  ['¾', '¾', 0],
  ['·', '·', 0],
  ['⊥', '⊥', 0],
  // #493: `∥` is the SIBLING of `⊥` and the parser already accepts it («l ∥ π1» → line-rel), but it was
  // untypeable on an Israeli keyboard — the same argument #272 made for the Greek letters.
  // Deliberately U+2225, NOT ASCII `||`: that sequence is already bound above as the MAGNITUDE insert,
  // so accepting it as "parallel" would make `|AB|` ambiguous with `A ∥ B`. Do not "helpfully" add it.
  ['∥', '∥', 0],
  ['∠', '∠', 0],
  ['°', '°', 0],
  ['′', '′', 0],
  ['ℓ', 'ℓ', 0],
  ['π', 'π', 0],
];

/**
 * The SAME palette in the shared wrap-selection shape (B4, shell/symbols): `caretBack` derives
 * `before`/`after` — the caret-back mechanic is the degenerate wrap (docs/28 §4a D5), so `||`
 * with caretBack 1 becomes the `|`…`|` wrap and gains selection-wrapping for free.
 */
import type { SymbolSpec } from '../../shell/symbols';
export const SYMBOL_SPECS_3: readonly SymbolSpec[] = SYMBOL_PALETTE_3.map(
  ([label, insert, caretBack]) => ({
    label,
    before: caretBack > 0 ? insert.slice(0, insert.length - caretBack) : insert,
    ...(caretBack > 0 ? { after: insert.slice(insert.length - caretBack) } : {}),
  }),
);
