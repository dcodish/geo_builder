/**
 * THE LEXICAL ATOMS — every rule composes from these, and no rule spells a fragment inline.
 *
 * [ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §4 makes this a day-one file for a
 * measured reason: 2-D's `parse.ts` spells the point-label fragment **342 times** and the number
 * grammar exists under three names, the Hebrew final-kaf trap fired **at least three times after being
 * recorded as a trap**, and when the atoms finally shipped there, #361 stayed open because *nothing
 * consumes them*. A half-migration is its own debt. So the ratchet below starts at **zero**: this
 * grammar has never had an inline fragment and the test makes sure it never acquires one.
 *
 * Two Hebrew rules the sibling trees paid for, applied here from the start:
 *
 *   - **A final letter is not the medial one.** `כ`/`ך`, `מ`/`ם`, `נ`/`ן`, `פ`/`ף`, `צ`/`ץ` — a rule
 *     that spells only one spelling silently rejects half the register (ADR-3D-035, then ADR-182,
 *     ADR-294, ADR-403, ADR-435 #4).
 *   - **Prefixes are optional and stack.** The definite article and the conjunctions (`ו`, `ב`, `ל`,
 *     `כ`, `ש`, `מ`, `ה`) attach to the noun, so `ברביע` and `רביע` and `הרביע` are one word to a rule.
 *
 * Atoms carry **no capture groups**, so adopting one never renumbers a rule's own captures.
 */

/** A complex-number or parameter name: a letter, optional letters, optional digits. */
export const NAME = String.raw`[A-Za-z][A-Za-z]*\d*`;

/** A signed decimal. One spelling, used everywhere a magnitude can appear. */
export const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** A rational or integer exponent, as the normalized form writes it. */
export const EXP = String.raw`-?\d+(?:/\d+)?`;

/** Optional stacked Hebrew prefixes: the article and the common conjunctions. */
export const HE_PREFIX = String.raw`[ובלכשמה]{0,3}`;

/** Kaf, medial or final — the trap that fired three times after being written down. */
export const KAF = String.raw`[כך]`;
/** Mem, medial or final. */
export const MEM = String.raw`[מם]`;
/** Nun, medial or final. */
export const NUN = String.raw`[נן]`;

/** Hebrew gender/number suffixes, all optional. */
export const HE_SUFFIX = String.raw`(?:ים|ות|ה|ת)?`;

// --- domain vocabulary, bilingual, each spelled ONCE ------------------------

/** «רביע» / «quadrant», with prefixes and both spellings of the ordinals. */
export const QUADRANT_KW = String.raw`(?:${HE_PREFIX}רביע|quadrant)`;

/** The ordinals the exam uses for quadrants, first to fourth. */
export const ORDINALS: readonly (readonly [RegExp, 1 | 2 | 3 | 4])[] = [
  [/(?:ה?ראשון|first|1)/u, 1],
  [/(?:ה?שני|second|2)/u, 2],
  [/(?:ה?שלישי|third|3)/u, 3],
  [/(?:ה?רביעי|fourth|4)/u, 4],
];

/** «ארגומנט» / «זווית» / `arg` — the argument of a number. */
export const ARG_KW = String.raw`(?:${HE_PREFIX}ארגומנט|${HE_PREFIX}זו?וית|arg)`;

/** «ערך מוחלט» / «גודל» / `abs` — spoken forms of the modulus; `|z|` is handled by the operator. */
export const ABS_KW = String.raw`(?:${HE_PREFIX}ערך ${HE_PREFIX}מוחלט|${HE_PREFIX}גודל|abs)`;

/** «מספר מרוכב» / «complex number» — the declaration noun. */
export const COMPLEX_KW = String.raw`(?:${HE_PREFIX}${MEM}ספר${HE_SUFFIX} ${HE_PREFIX}${MEM}רוכב${HE_SUFFIX}|complex numbers?)`;

/** «ממשי» — real. */
export const REAL_KW = String.raw`(?:${HE_PREFIX}${MEM}${MEM}שי${HE_SUFFIX}|real)`;

/** «מדומה טהור» — pure imaginary. */
export const IMAGINARY_KW = String.raw`(?:${HE_PREFIX}${MEM}דומה(?: ${HE_PREFIX}טהור${HE_SUFFIX})?|pure imaginary|imaginary)`;

/** «צמוד» — conjugate. */
export const CONJUGATE_KW = String.raw`(?:${HE_PREFIX}צמוד${HE_SUFFIX}|conjugates?)`;

/** «ו-» / «and» — the conjunction joining two named numbers. */
export const AND_KW = String.raw`(?:ו-?|and)`;

/** «הוא» / «היא» / `is` — the optional copula before a predicate. */
export const COPULA_KW = String.raw`(?:הוא\s+|היא\s+|is\s+)?`;

/** Build a case-insensitive, unicode-aware regex from atoms. */
export const rx = (fragment: string, flags = 'iu'): RegExp => new RegExp(fragment, flags);

/**
 * The atoms a ratchet test counts, so "did a rule inline a fragment?" is measurable.
 * Adding an atom here is free; inlining its text in a rule is what the ratchet refuses.
 */
export const ATOM_SOURCES: Readonly<Record<string, string>> = {
  NAME,
  NUM,
  EXP,
  HE_PREFIX,
  KAF,
  MEM,
  NUN,
  HE_SUFFIX,
  QUADRANT_KW,
  ARG_KW,
  ABS_KW,
  COMPLEX_KW,
  REAL_KW,
  IMAGINARY_KW,
  CONJUGATE_KW,
  AND_KW,
  COPULA_KW,
};
