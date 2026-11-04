/**
 * THE PRIME MARK, ONCE — every glyph a student, a keyboard or a paste puts after a point name to mean «prime»
 * (3-D #1545, [ADR-3D-300](../docs/06b-decisions-3d.md#adr-3d-300); analytic #2621 C,
 * [ADR-AG-395](../docs/06c-decisions-analytic.md#adr-ag-395)). The canonical spelling is ASCII `'`; these are the others.
 *
 * Members: ′ U+2032 prime · ’ U+2019 · ‘ U+2018 · ` · ´ U+00B4 · ׳ U+05F3 geresh (the Hebrew keyboard's apostrophe) ·
 * ʹ U+02B9 modifier prime · ʼ U+02BC modifier apostrophe. Every one is a SINGLE code unit, so the fold is
 * length-preserving (a reader that matches on the folded line can emit by the same indices). «״» (gershayim) is a
 * quotation mark, not a prime, and stays out.
 *
 * Pure regex source, no product knowledge (BOUNDARIES.json: shell is parameterized, never branched on a product).
 * Seeded by its second copy: 3-D's `lexicon/marks3` held it alone until analytic read primes too.
 */
// By code point, so the set carries no Hebrew literal (the geresh is U+05F3; the inline-Hebrew ratchet counts literals).
export const PRIME_GLYPHS = String.fromCodePoint(0x2032, 0x2019, 0x2018, 0x60, 0xb4, 0x5f3, 0x2b9, 0x2bc);

const PRIME_FOLD_RE = new RegExp(`[${PRIME_GLYPHS}]`, 'g');

/** Canonicalise every prime glyph to ASCII `'` — the ONE prime fold every builder's boundary calls. */
export function foldPrimes(s: string): string {
  return s.replace(PRIME_FOLD_RE, "'");
}

/** The typographic prime a label is DRAWN with (A' → A′), the spelling 3-D's canvas and panel use. */
export const displayPrimes = (s: string): string => s.replace(/'/g, '′');
