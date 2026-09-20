/**
 * THE VECTOR-MARKING VOCABULARY — how this product's students write "this is a vector".
 *
 * #1194. The grammar accepts four spellings of one marking — three arrow characters and a word — and
 * every one of them was spelled out separately wherever it was needed. `parse3` listed the arrows twice
 * (the normaliser's strip, and `markVectorContext`), and `render/notation.ts` listed **one** of them, in
 * the guard that decides whether a pair is already marked. So when [ADR-3D-250](../../docs/06b-decisions-3d.md#adr-3d-250)
 * made `→` the character the palette inserts and the refusal message teaches, the display formatter did
 * not know it: `DC→=3AB→` rendered as `DC⃗→=3AB⃗→`, the arrow twice.
 *
 * This is the drift `lexicon/` exists to stop, and `nouns3.ts` already records the shape of it — the
 * same gate maintained in two files, each copy fixed alone while the other silently stayed behind.
 * A fifth spelling added here reaches the grammar and the display together, or not at all.
 *
 * **It imports NOTHING**, which is the property that lets `parser/`, `engine/` and `render/` all depend
 * on it without depending on each other. Nothing here decides what a marking MEANS — that the vector
 * reading is honoured is `apply`'s business (ADR-3D-250). This module knows only how it is SPELLED.
 *
 * Sibling of `nouns3.ts`, deliberately not folded into it: that module is emphatic about being the
 * vocabulary of words that NAME SHAPES, and a notation mark is a different kind of thing.
 */

/**
 * THE COMBINING ARROW, `U+20D7` — the one that renders OVER the preceding letters, and the one a
 * finished row carries. Written by code point, never literally: typed as itself it would combine with
 * the preceding character in THIS source file, which is the lesson `i18n/bidi.ts` records.
 */
export const COMBINING_ARROW = '⃗';

/**
 * The SPACING arrows — `→` (U+2192) and `⟶` (U+27F6). A student types one of these *after* the pair,
 * because they are characters a keyboard (or the palette) can actually produce; `U+20D7` cannot stand
 * alone, which is why #1185 retired it from the palette.
 *
 * They mean exactly what {@link COMBINING_ARROW} means, so DISPLAY replaces them with it rather than
 * printing both — see `render/notation.ts`.
 */
export const SPACING_ARROWS = '→⟶';

/** Every arrow that marks a vector, as a character-class BODY (no brackets) for embedding in a regex. */
export const VECTOR_ARROW_CLASS = COMBINING_ARROW + SPACING_ARROWS;

/** Any vector arrow. The grammar accepts all three interchangeably (ADR-3D-010 lineage). */
export const VECTOR_ARROW_RE = new RegExp(`[${VECTOR_ARROW_CLASS}]`);

/**
 * The vector WORD, as a regex source — «וקטור» with its optional ה/ו prefixes, and `vector(s)`.
 *
 * Used with a leading boundary by `markVectorContext` (to recognise the marking) and with a trailing
 * separator by `vectorNotation` (to consume it, since the typeset arrow then carries that meaning).
 * The callers supply their own boundaries; only the word itself lives here.
 */
export const VECTOR_WORD_SRC = String.raw`(?:ה?ו?וקטור|vectors?)`;

/**
 * HAS THE STUDENT MARKED THIS LINE AS BEING ABOUT VECTORS? (#1195)
 *
 * The four spellings of one marking, asked of RAW TEXT — an arrow character anywhere, or the vector
 * WORD. It lives here for the reason this module exists: the grammar and the display must not come to
 * disagree about what a marking is (#1194), and this is a third consumer of the same question.
 *
 * **Deliberately NOT `parse3.markVectorContext`**, which answers this for the parser: that function is
 * `void` and side-effecting (it sets a module flag), and having `render` import `parser` is the wrong edge.
 * Same vocabulary, read from the same place, without the coupling.
 *
 * The WORD needs a boundary because «וקטור SE» despaces to «וקטורSE» across a script transition — the
 * lesson `normalize3` records; an arrow is its own character and needs none.
 */
export function isVectorMarked3(s: string): boolean {
  if (VECTOR_ARROW_RE.test(s)) return true;
  return new RegExp(String.raw`(?:^|[\s:,])${VECTOR_WORD_SRC}(?:\s|$)`, 'i').test(s);
}
