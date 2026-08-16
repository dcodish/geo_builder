/**
 * THE ORTHOGRAPHY CHOKEPOINT — the one place the input alphabet is fixed.
 *
 * Students paste from exam PDFs, so the text that arrives is not the text a grammar expects: Unicode
 * subscripts and superscripts, the multiplication dot, the Unicode minus, a combining overline for the
 * conjugate, non-breaking spaces, and invisible bidi controls that a Hebrew sentence with LTR maths in
 * it collects by simply existing.
 *
 * [ADR-181](../../docs/06-decisions.md#adr-181) settled where that is fixed, and the argument is worth
 * repeating because it is the reason this file exists at all: *"the alternative — adding `[־]?` and
 * `\p{Cf}?` to ~20 individual suffix groups — would be per-rule whack-a-mole and miss the next rule.
 * The defect is that the INPUT ALPHABET the rules assume doesn't match pasted reality; fixing the
 * alphabet at the boundary is the correct layer."* The 2-D tree learned that across five ADRs
 * (maqaf, homoglyphs, spelling variants, the «ן-» slip, NBSP) and the 3-D tree across six more.
 *
 * So: **every rule in this parser sees normalized text, and no rule spells an invisible character.**
 * A display transform must never reach the parser (ADR-448 / ADR-3D-144), which is also why the
 * polar↔cartesian toggle and the `n` stepper are view state and appear nowhere here.
 *
 * Ported from the C0 prototype, which got this right — [ADR-CX-008](../../docs/06d-decisions-complex.md#adr-cx-008)
 * keeps it deliberately — with the transforms named and the round-trip property now asserted.
 */

/** Superscript digits become an explicit power: `Z₂³` → `z2^3`. */
const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/** Subscript digits are part of the NAME: `Z₁` ≡ `z1` (ADR-CX-003 P2). */
const SUBSCRIPTS: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

/**
 * Invisible formatting characters: LRM, RLM, ALM, the embedding/override run, and the isolates.
 *
 * These carry no meaning to a grammar and are pure noise, but they arrive constantly — a Hebrew
 * sentence containing `z1^3 = z3` accumulates them from the editor, the PDF, or the browser's own
 * bidi handling. Stripping them here is what stops every rule needing to tolerate them.
 */
const BIDI_CONTROLS = /[‎‏؜‪-‮⁦-⁩]/g;

/** Each transform named, so the list is readable as a contract rather than a regex pile. */
const TRANSFORMS: readonly { readonly why: string; readonly apply: (s: string) => string }[] = [
  { why: 'strip invisible bidi controls', apply: (s) => s.replace(BIDI_CONTROLS, '') },
  { why: 'non-breaking space is a space', apply: (s) => s.replace(/ /g, ' ') },
  {
    // `z̄` and `z̅` — the exam's conjugate notation (2024 חורף's locus is written this way)
    why: 'a combining overline after a name is the conjugate',
    apply: (s) => s.replace(/([a-zA-Z])[̄̅](\w*)/g, 'conj($1$2)'),
  },
  { why: 'the multiplication dot and cross are `*`', apply: (s) => s.replace(/[·×]/g, '*') },
  { why: 'the Unicode minus is a hyphen', apply: (s) => s.replace(/−/g, '-') },
  { why: 'the division sign is a slash', apply: (s) => s.replace(/÷/g, '/') },
  {
    // `Z₂³Z₄` is z2^3 TIMES z4: like a subscript run, a superscript run followed by a name ends it
    why: 'a superscript run followed by a name is an implicit product',
    apply: (s) =>
      s.replace(
        /[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?=[A-Za-z(])/g,
        (run) => `^${[...run].map((c) => SUPERSCRIPTS[c]).join('')}*`,
      ),
  },
  {
    why: 'superscript digits are an explicit power',
    apply: (s) =>
      s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPTS[c]).join('')}`),
  },
  {
    // `Z₁Z₄` is a PRODUCT of two names, never the identifier `z1z4` — a subscript run ends a name
    why: 'a subscript run followed by a name is an implicit product',
    apply: (s) =>
      s.replace(/([₀₁₂₃₄₅₆₇₈₉]+)(?=[A-Za-z(])/g, (run) => `${[...run].map((c) => SUBSCRIPTS[c]).join('')}*`),
  },
  { why: 'remaining subscript digits join the name', apply: (s) => s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUBSCRIPTS[c]) },
  { why: 'the degree sign is decoration on an angle', apply: (s) => s.replace(/°/g, '') },
  { why: 'collapse whitespace', apply: (s) => s.replace(/\s+/g, ' ').trim() },
];

/** The one entry point. Every rule sees the output of this and nothing else. */
export function normalize(raw: string): string {
  let s = raw;
  for (const t of TRANSFORMS) s = t.apply(s);
  return s;
}

/** The transform list, for the test that asserts the contract rather than restating it. */
export const transformNames = (): string[] => TRANSFORMS.map((t) => t.why);

/**
 * Is this character one the alphabet fix is responsible for?
 *
 * Exported so the span accountant can tell "a character the student typed that nothing consumed"
 * from "a character normalization should have removed" — the second is a bug in THIS file, and it
 * should be reported as one rather than surfacing as an unparsed word.
 */
export const isDisplayOnly = (ch: string): boolean =>
  BIDI_CONTROLS.test(ch) || /[ ̄̅°·×−÷⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(ch);
