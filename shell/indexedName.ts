/**
 * A STUDENT'S NAME GLYPH, ONCE — the letter a name is spelled with, an index on it, and the guard that keeps
 * a number from being read out of a name (#1814, [ADR-600](../docs/06-decisions.md#adr-600); first copy
 * analytic #1785, [ADR-AG-244](../docs/06c-decisions-analytic.md#adr-ag-244)).
 *
 * The class both builders hit: «α1», «S1», «a2», «S_1», «S₁» are the book's INDEXED NAMES — one name each.
 * A reader that does not know the name alphabet reads the index as a magnitude: analytic's tokenizer made
 * «S1» the product S·1 (#1785), and 2-D's angle reader took the «1» of «∠ABC = α1» as 1° (#1814), because
 * its guard ("a value is never a label's subscript digit", #267) was spelled Latin-only. The gates that
 * should have caught the dropped glyph were Latin-only too. So the alphabet and the guard live here, and
 * every reader and gate composes them rather than re-spelling a narrower copy.
 *
 * Pure regex source, no product knowledge (BOUNDARIES.json: shell is parameterized, never branched on a
 * product). Fragments carry no capture groups and no anchors, so composing one never renumbers a rule.
 */

/** A Greek letter, either case. In a plane builder whose points are Latin capitals, a Greek glyph is a VALUE name. */
export const GREEK_LETTER = String.raw`[Α-Ωα-ω]`;

/** A letter a student names something with: Latin, or Greek in either case («Α1» looks like «A1» and is not). */
export const NAME_LETTER = String.raw`[A-Za-zΑ-Ωα-ω]`;

/** An index on a name: glued digits («S1»), the LaTeX subscript («S_1», «S_{1}») or subscript digits («S₁»). */
export const INDEX = String.raw`(?:[0-9₀-₉]+|_\{?\d+\}?)`;

/** One name letter with an index, standing alone (no name letter on either side). */
export const INDEXED_NAME = String.raw`(?<![A-Za-zΑ-Ωα-ω])${NAME_LETTER}${INDEX}(?![A-Za-zΑ-Ωα-ω])`;

/** {@link INDEXED_NAME} compiled — "does this text contain an indexed name?" */
export const INDEXED_NAME_RE = new RegExp(INDEXED_NAME);

/**
 * Where a NUMBER may begin: never glued to a name letter (it would be that name's index), never after an
 * `_` (a LaTeX subscript), and never inside another number (after a digit or a decimal point — so a blocked
 * «a12» cannot restart at its «2»). Prefix it to a number fragment: `UNGLUED + NUM`.
 */
export const UNGLUED = String.raw`(?<![A-Za-zΑ-Ωα-ω_\d.])`;

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const subscriptOf = (digits: string): string => [...digits].map((d) => SUBSCRIPT_DIGITS[Number(d)]).join('');

/** 2-D's fold (ADR-228, ADR-600): `X_1`, `X_{1}`, `α_1` → the glued `X1` — any name letter, any digit run. */
const UNDERSCORE_TO_GLUED = new RegExp(String.raw`(${NAME_LETTER})_\{?(\d+)\}?`, 'g');

/**
 * Analytic's two spellings of a point's index, folded to the subscript glyphs the exam prints (#2391 ADR-AG-315, #2075
 * ADR-AG-398). A CAPITAL base only: a lowercase letter is a parameter or an axis (`m_1`, `x_B`), never a point.
 * - the underscore — `N_2`, `N_{12}` (a digit run; a letter index `S_ABC` and a lowercase base are never touched);
 * - the glued digits — `X1`, `X12`, `A1B1` — unless a lowercase letter is glued before the capital (a word, `l1`'s kin)
 *   or the run continues as a decimal (`A1.5`), a lowercase letter or a subscript digit.
 */
const UNDERSCORE_TO_GLYPH = /(?<![A-Za-z_])([A-Z])\s*_\s*(?:\{\s*([0-9]+)\s*\}|([0-9]+))(?![a-z0-9_])/g;
const GLUED_TO_GLYPH = /(?<![a-z])([A-Z])([0-9]+)(?![a-z_₀-₉]|\.\d)/g;

/**
 * ONE INDEXED NAME, ONE SPELLING (#2075, [ADR-AG-398](../docs/06c-decisions-analytic.md#adr-ag-398)) — the fold every
 * builder's parser boundary calls so «X_1», «X_{1}», «X1» (and in analytic «X₁») are the one name they are, a digit
 * run included («X12», «X_{12}»). Two canonical forms, because the builders' ids already differ and a saved figure
 * must keep its letters: `'glued'` — 2-D's ASCII `X1`, drawn with the digits lowered (`subscriptLabel`); `'glyph'` —
 * analytic's `X₁`, the subscript glyph its tool letters (`P₁`, `M₁`) and every surface already print.
 */
export function foldIndexedName(s: string, to: 'glued' | 'glyph'): string {
  if (to === 'glued') return s.replace(UNDERSCORE_TO_GLUED, '$1$2');
  return s
    .replace(UNDERSCORE_TO_GLYPH, (_m, base: string, braced: string | undefined, bare: string | undefined) => `${base}${subscriptOf(braced ?? bare ?? '')}`)
    .replace(GLUED_TO_GLYPH, (_m, base: string, digits: string) => `${base}${subscriptOf(digits)}`);
}
