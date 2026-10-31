/**
 * Vector NOTATION formatting for display rows (ADR-3D-003 lineage; extracted from App3 by #312).
 *
 * A step row renders in textbook notation — point-pairs get the arrow (SE⃗), declared vector names
 * get the combining underline (u̲) — while the STORED utterance stays untouched.
 *
 * #312 (the docs/17 §2.2 boundary class): the old in-component regex enumerated SOME expression
 * punctuation as boundaries (`[\s,.·+\-=)]`), so a vector atom carrying a divisor/coefficient/paren
 * — `u/6`, `2v`, `(1-t)u` — silently lost its styling (`/`, `)` and digits weren't in the sets).
 * The boundary is now SEMANTIC: a declared name styles wherever it is a standalone letter token —
 * not embedded in a longer word (no letter on either side, no digit after). A juxtaposed symbol
 * coefficient (`tw` = t·w) is deliberately NOT split here — telling it from a two-letter word needs
 * the term grammar, which is the #313 MathML rework's job; this formatter never guesses.
 */

import { COMBINING_ARROW, foldPrimes3, PRIME_GLYPHS3, SPACING_ARROWS, VECTOR_WORD_SRC } from '../lexicon/marks3';
import type { SegmentEquationReading3 } from '../engine/types';
// #1195: the preview composes bidi isolation with the notation, so the display layer reads the
// isolation transform. `i18n/bidi` imports NOTHING — it is a leaf — so this edge runs downward, the
// direction `render` already depends in. The reverse (bidi importing render) would invert it.

/** Command types whose rows read as vector statements (the word וקטור is decoration). */
export const VEC_CMD_TYPES = new Set(['name-vector', 'vec-rel', 'dot-given', 'inject-vector', 'point-in-span']);

/** Apply textbook vector notation to a vector-statement utterance: pair arrows + name underlines. */
export function vectorNotation(utterance: string, vecNames: Set<string>): string {
  let u = utterance.replace(new RegExp(String.raw`(?:^|(?<=[\s,:]))${VECTOR_WORD_SRC}\s+`, 'gi'), '');
  /**
   * #1194 — A SPACING ARROW BECOMES THE COMBINING ONE. It does not survive beside it.
   *
   * The pair rule below adds `⃗` unless the pair is ALREADY marked, and its guard listed only
   * U+20D7 — so `DC→=3AB→` collected a second arrow and kept the first: `DC⃗→=3AB⃗→`, the operator's
   * report. `→` and `⟶` are spacing characters that MEAN what the combining arrow means, so display
   * replaces them with it, exactly as the word above is consumed once the notation carries its
   * meaning. Converting here (rather than widening the guard) is what makes the four spellings
   * render identically instead of merely avoiding a doubled arrow.
   *
   * Targeted at a mark that FOLLOWS A PAIR: a stray arrow elsewhere in a sentence is the student's
   * own character in a position this formatter does not claim to understand, and it is left alone.
   */
  u = u.replace(new RegExp(String.raw`([A-Z]\d*'?[A-Z]\d*'?)\s*[${SPACING_ARROWS}]`, 'g'), `$1${COMBINING_ARROW}`);
  // #398 (ADR-3D-108): the lookBEHIND is the twin of the existing lookahead — inside a ≥3-label
  // point-run (ABC), the tail 'BC' used to pass the lookahead (nothing follows) and take an arrow
  // mid-run. A letter/quote before the pair means it is part of a LONGER run, so it is not a pair.
  // Digits stay allowed before (a glued coefficient «2KA'» is a real vector term).
  u = u.replace(
    new RegExp(String.raw`(?<![A-Za-z'${COMBINING_ARROW}])([A-Z]\d*'?[A-Z]\d*'?)(?![${COMBINING_ARROW}A-Za-z\d'])`, 'g'),
    `$1${COMBINING_ARROW}`,
  );
  if (vecNames.size > 0) {
    const names = [...vecNames].join('|');
    // standalone-letter-token boundaries: no letter before (digits/parens/operators fine — «2v»,
    // «(1-t)u»), no letter/digit after («u/6», «v-», end-of-line fine; «u6»/«uv» stay unstyled).
    u = u.replace(new RegExp('(?<![A-Za-z֐-׿])(' + names + ')(?![A-Za-z\\d֐-׿])', 'g'), '$1̲');
  }
  return u;
}

/** Is this fact a VECTOR statement? (#313: the MathML layer applies only where this is true —
 *  an arrow on a segment name in a prose row would assert vector-ness the statement never had.) */
export const isVectorFact3 = (f: { cmds: { type: string; claim?: { type: string } }[] }): boolean =>
  f.cmds.some((cmd) => VEC_CMD_TYPES.has(cmd.type) || (cmd.type === 'claim' && cmd.claim?.type === 'vec-eq'));

/**
 * The step-row display: vector facts get notation, everything else passes through verbatim — except a row whose
 * unmarked segment equation the fold READ AS LENGTHS (`reading === 'length'`, ADR-3D-391 Am. 2), which reads in
 * the length spelling, `|AA'| = 3|BC|` (`lengthReadingText3`).
 */
export function factDisplay3(
  f: { utterance: string; cmds: { type: string; claim?: { type: string } }[] },
  vecNames: Set<string>,
  reading?: SegmentEquationReading3,
): string {
  if (reading === 'length') return lengthReadingText3(f.utterance, f.cmds);
  const isVec = f.cmds.some((cmd) => VEC_CMD_TYPES.has(cmd.type) || (cmd.type === 'claim' && cmd.claim?.type === 'vec-eq'));
  return isVec ? vectorNotation(f.utterance, vecNames) : f.utterance;
}

/** The fields of a segment equation's `vec-rel` the length spelling reads (structural, so a test may pass a literal). */
type SegmentEquationShape3 = { type: 'vec-rel'; from: string; to: string; terms: { coeff: { k: number }; atom: { kind: string; from?: string; to?: string } }[] };
const isSegmentEquation3 = (k: { type: string }): k is SegmentEquationShape3 => {
  const c = k as Partial<SegmentEquationShape3>;
  return c.type === 'vec-rel' && typeof c.from === 'string' && typeof c.to === 'string' && c.terms?.length === 1 && c.terms[0].atom.kind === 'pair';
};

/**
 * #1680 (ADR-3D-391 Am. 2) — A SEGMENT EQUATION READ AS LENGTHS IS SHOWN AS ONE.
 *
 * The operator on T66 (2026-10-30): *"the input box wrote the vector AA' is 3 times the vector BC which is wrong since
 * its length. the input box should show |AA'|=3|BC|"*. The row used to be chosen by the COMMAND's kind (a `vec-rel`
 * is a vector statement), which is right for the vector reading and false for every line the fold settled as lengths.
 * So the student's own text is kept and each of the equation's two segments is written in the length spelling the
 * question itself teaches (`|AD| = 3|BD|`): «AA'=3BC» → «|AA'|=3|BC|», «AB = 1AC» → «|AB| = 1|AC|». A segment is
 * matched as a whole pair token (the vector formatter's pair boundaries; any prime spelling). Should the text not hold
 * both segments as written, the equation is composed from the command instead, so the row can never keep a bare pair.
 */
export function lengthReadingText3(utterance: string, cmds: readonly { type: string }[]): string {
  const cmd = cmds.find(isSegmentEquation3);
  if (!cmd) return utterance;
  const { atom, coeff } = cmd.terms[0];
  const labels = [cmd.from + cmd.to, (atom.from ?? '') + (atom.to ?? '')];
  // a point label is a capital, digits and primes — the prime is the one character to widen: every glyph the one
  // prime fold reads (#1545, `PRIME_GLYPHS3`), never a class spelled here
  const primes = `'${PRIME_GLYPHS3}`;
  const src = (label: string) => label.replace(/[^A-Za-z0-9']/g, '').replace(/'/g, `[${primes}]`);
  const alt = [...new Set(labels)].sort((a, b) => b.length - a.length).map(src).join('|');
  const pair = new RegExp(String.raw`(?<![A-Za-z${primes}${COMBINING_ARROW}|])(${alt})(?![${COMBINING_ARROW}A-Za-z\d${primes}|])`, 'g');
  const seen = new Set<string>();
  const out = utterance.replace(pair, (m) => {
    seen.add(foldPrimes3(m));
    return `|${m}|`;
  });
  if (labels.every((l) => seen.has(l))) return out;
  const k = coeff.k;
  return `|${labels[0]}| = ${Math.abs(k - 1) < 1e-12 ? '' : String(k)}|${labels[1]}|`;
}

/**
 * THE INPUT PREVIEW lives in `render/FactRow3.tsx` as `inputPreviewNode3`, beside the step row's
 * `FactRowText3` (#1195, then #1312).
 *
 * It was a STRING composer here, and that shape was the defect: the preview's vector branch has to
 * hand `VecMath` text that has NOT been isolated (VecMath isolates at the render event, ADR-3D-184,
 * and its tokenizer reads LRI/PDI as `op` tokens otherwise), while the plain branch has to return
 * isolated text. One string cannot be both, and returning a string at all is what let `U+20D7` reach
 * the DOM as a literal combining mark instead of the `mover` that spans the pair.
 *
 * `vectorNotation` above is still the composer; what moved is the CHOICE of renderer, to the one file
 * that already owns that choice for the committed row.
 */
