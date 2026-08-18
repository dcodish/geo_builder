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
