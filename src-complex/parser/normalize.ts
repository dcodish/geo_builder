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

import { ARG_KW, CONJ_OF_KW, IM_OF_KW, NAME, RE_OF_KW, RECIPROCAL_OF_KW } from './lexicon';

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

/** The angle letters the palette inserts and the exam prints, as the Latin names a rule can read. */
const GREEK: Record<string, string> = { 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'φ': 'phi' };

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
  {
    // «הצמוד של z1» and «conj(z1)» are the same operation spelled two ways — one spelling problem,
    // fixed where the combining overline is fixed, so no rule downstream needs to know both.
    why: 'a word-spelled operator becomes its function form',
    apply: (s) =>
      s
        .replace(new RegExp(`${CONJ_OF_KW}\\s+(${NAME})`, 'giu'), 'conj($1)')
        .replace(new RegExp(`${RECIPROCAL_OF_KW}\\s+(${NAME})`, 'giu'), '1/($1)')
        .replace(new RegExp(`${RE_OF_KW}\\s+(${NAME})`, 'giu'), 're($1)')
        .replace(new RegExp(`${IM_OF_KW}\\s+(${NAME})`, 'giu'), 'im($1)'),
  },
  {
    /**
     * `arg(z1)` is `arg z1`. The parentheses are the student's punctuation, not a function call.
     *
     * `arg` is a KEYWORD in the relation rules (F4, and the inequality windows), not an operator in the
     * expression grammar — so `${ARG_KW}\s*(${NAME})` is what every one of those rules spells, and a
     * student who wrote the parenthesised form got `not-handled`. The prototype read both, so this was
     * a capability the cutover would have deleted; ADR-CX-019's form list happened to sample the bare
     * spelling and missed it.
     *
     * Fixed HERE and not in the rules for the reason this file exists: `arg` appears in four patterns
     * today and every future argument rule would have to remember the optional parens. `conj`/`re`/`im`
     * are genuinely functions and keep theirs.
     */
    why: 'parentheses around a name after the argument keyword are punctuation',
    apply: (s) =>
      s.replace(new RegExp(`(${ARG_KW})\\s*\\(\\s*(${NAME})\\s*\\)`, 'giu'), '$1 $2'),
  },
  {
    // The symbol palette inserts θ/α/β and the exam prints them; a NAME is Latin, so the two spellings
    // of one parameter would otherwise be two different parameters — «z = 2cis(θ)» parsed as nothing
    // while «z = 2cis(theta)» parsed fine.
    why: 'a Greek parameter letter is its Latin spelling',
    apply: (s) => s.replace(/[θαβφ]/g, (c) => GREEK[c]),
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
