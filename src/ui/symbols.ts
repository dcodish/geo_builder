/**
 * The symbol palette — the characters the tool OFFERS the student, declared once.
 *
 * Extracted from `App.tsx` for #482 (reported against 3-D; this is the mirror, a copied pattern per
 * docs/20 §12 rule 1, never a shared import). Living inline in the JSX made this vocabulary invisible to
 * everything but the render, and that is how it drifted out of step with `i18n/bidi.ts`'s `CORE`: twelve
 * of the characters below were absent from the class deciding what belongs to an LTR technical run, so
 * `AB = x²` isolated only as far as the `x` and left the `²` outside to be reordered.
 *
 * Being a module makes the vocabulary assertable: `__tests__/bidi.test.ts` requires every character here
 * to be CORE or a run delimiter, so adding a button without teaching bidi about it fails the suite.
 */

/** Greek letters for angle names (ADR-039) — «∠SAB = α» is unusable when the letter can't be typed. */
export const GREEK = ['α', 'β', 'γ', 'δ', 'θ'] as const;

/** `label` is shown on the button; `insert` is what lands in the box; `caret` steps the caret back. */
export interface MathSymbol {
  label: string;
  insert: string;
  caret?: number;
}

export const SYMBOLS: readonly MathSymbol[] = [
  { label: '√()', insert: '√()', caret: 2 }, // AD = √(2/3) — inserts the EXPLICIT radicand group, caret between the parens (#77 Am.: √() disambiguates √(2/3) from √2/3)
  { label: 'x²', insert: '²' }, // AB = x²
  { label: 'xⁿ', insert: '^' }, // AB = x^3
  { label: 'π', insert: 'π' }, // AB = 2π
  { label: '∠', insert: '∠' }, // ∠ABC = 37°
  { label: '⌢{}', insert: '⌢{}', caret: 2 }, // arc template (issue #155, the √()/S_{} discipline): ⌢{AC} + ⌢{BE} = … — caret lands between the braces; rendered as an over-arc by MathText (bare ⌢AC and קשת AC parse too)
  { label: '°', insert: '°' },
  { label: '⊥', insert: '⊥' }, // AB ⊥ CD
  { label: '∥', insert: '∥' }, // AB ∥ CD
  { label: '△', insert: '△' }, // △ABC (triangle) / △ABC ≅ △DEF
  { label: '≅', insert: '≅' }, // ABC ≅ DEF (congruent)
  { label: '~', insert: '~' }, // ABC ~ DEF (similar)
  { label: '<', insert: '<' }, // α < β (order between two named measures)
  { label: 'S_{}', insert: 'S_{}', caret: 3 }, // area: S_{ABC} = 13 — caret lands between the braces
];

/**
 * B4-2d (#729): the same vocabulary in the SHARED palette's spec shape (#525). A caret-forward
 * template becomes a before/after WRAP, so a selection lands inside it — select `ABC`, press
 * `S_{}`, get `S_{ABC}`; an empty selection is the old caret-between behaviour, by construction
 * of `shell/symbols.applySymbol`.
 */
export const SYMBOL_SPECS: readonly import('../../shell/symbols').SymbolSpec[] = [
  ...GREEK.map((g) => ({ label: g, before: g })),
  ...SYMBOLS.map((s) =>
    s.caret !== undefined
      ? { label: s.label, before: s.insert.slice(0, s.caret), after: s.insert.slice(s.caret) }
      : { label: s.label, before: s.insert },
  ),
];
