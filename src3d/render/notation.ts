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
import type { Claim3, Command3, SegmentEquationReading3 } from '../engine/types';
// #1195: the preview composes bidi isolation with the notation, so the display layer reads the
// isolation transform. `i18n/bidi` imports NOTHING — it is a leaf — so this edge runs downward, the
// direction `render` already depends in. The reverse (bidi importing render) would invert it.

/**
 * #2684 (ADR-3D-421 Am. 1) — A SENTENCE WITH A «כך ש-» CLAUSE IS PROSE UP TO THE CLAUSE. «E על AC' כך ש-AE = t·p» says E is
 * on the SEGMENT AC', and only what follows «כך ש» is a vector statement: an arrow on AC' would assert what the student
 * never said, and the clause's hyphen is the Hebrew joiner, not an operator. Returns the prose head (the joiner in it)
 * and the clause; a row with no such clause is all clause. The one reader, for the notation and the tokenizer.
 */
export function splitVectorClause3(row: string): { head: string; clause: string } {
  const m = row.match(/^.*?(?:כך\s*ש|such\s+that)[\s\-־:]*/i);
  return m ? { head: m[0], clause: row.slice(m[0].length) } : { head: '', clause: row };
}

/**
 * #1549 (ADR-3D-425) — DOES THE TOOL READ THIS COMMAND AS A VECTOR STATEMENT? (the word וקטור is decoration)
 *
 * Operator, 2026-09-29: *"Display follows meaning: always arrows."* A row whose command the tool reads as vectors
 * wears them whether or not the student typed them, and the typed text plays no part.
 *
 * TOTAL over `Command3`, so a new command kind cannot compile without answering the question. This was a hand-written
 * `Set` (ADR-3D-013), and it fell behind the grammar the way `COMMAND_SAVEABLE` once did (#288): `inject-pair`, the
 * pair sibling of the listed `inject-vector`, printed «BA→=(-3,4,5)» as flat text with the student's raw arrow.
 *
 * `mag-val` / `mag-rel`: a bare «|AB|» parses to `length-eq`, so these are reached only through a vector marking or
 * a named vector and never arrow a length.
 *
 * `cos-angle` IS NOT DECIDED HERE: it is 'plain' pending a ruling, and that is not an oversight. The 2026-09-29 ruling
 * names «cos(AB,AD)=0», but the same kind is what «AB ⟂ AD», «SM מאונך ל-DB», «משולש ישר זווית ABC» and every
 * right-angled base lower to (measured, ADR-3D-425), so 'vector' here would arrow segments in rows #313 keeps plain.
 */
type VectorReading3 = 'vector' | 'plain';
const VECTOR_READING_3: Record<Command3['type'], VectorReading3> = {
  'name-vector': 'vector',
  'vec-rel': 'vector',
  'dot-given': 'vector',
  'dot-eq-chain': 'vector',
  'inject-vector': 'vector',
  'inject-pair': 'vector',
  'point-in-span': 'vector',
  'mag-val': 'vector',
  'mag-rel': 'vector',
  'vec-mag': 'vector',
  'draw-arrow': 'vector',
  'declare-vector': 'vector',
  'cos-angle': 'plain', // see above: awaiting the operator's ruling (ADR-3D-425)
  claim: 'plain', // read through CLAIM_VECTOR_READING_3
  'mutual-rel': 'plain',
  'plane-rel': 'plain',
  'distance-rel': 'plain',
  'free-plane': 'plain',
  'free-line': 'plain',
  solid: 'plain',
  'point-on-segment3': 'plain',
  segment3: 'plain', // the companion «|AB→|=5» also emits; a vector command anywhere in the fact wins
  centroid3: 'plain',
  point3: 'plain',
  'coord-plane-rel': 'plain',
  'plane-line-perp': 'plain',
  plane3: 'plain',
  'plane-angle': 'plain',
  'on-planes': 'plain',
  'foot-on-plane': 'plain',
  'plane-plane-line': 'plain',
  'foot-on-line': 'plain',
  line3: 'plain',
  'line-perp-plane': 'plain',
  'line-plane-point': 'plain',
  'on-line': 'plain',
  'sign-given': 'plain',
  'plane-through': 'plain',
  'line-through': 'plain',
  revolution: 'plain',
  'seg-plane-rel': 'plain',
  'length-rel': 'plain',
  'symbol-value': 'plain',
  'midpoint-auto': 'plain',
  'vertex-angle': 'plain',
  'altitude-foot': 'plain',
  'angle-bound3': 'plain',
  'angle-eq': 'plain',
  'angle-mark': 'plain',
  'length-mark': 'plain',
  'angle-pair-eq': 'plain',
  'bisector-point': 'plain',
  'bisector-ray': 'plain',
  circle3: 'plain',
  'diag-intersection': 'plain',
  'seg-crossing3': 'plain',
  'quad-diagonals': 'plain',
  'height-to-face': 'plain',
  'line-common-perp': 'plain',
  'line-plane-angle': 'plain',
  'line-projection': 'plain',
  'param-sign': 'plain',
  'param-decl': 'plain',
  'perp-to-base': 'plain',
  'plane-cut': 'plain',
  'point-on-circle3': 'plain',
  'circle-given': 'plain',
  'rect-complete': 'plain',
  'quad-shape': 'plain',
  'shape-ref3': 'plain',
  'rel-plane': 'plain',
  'right-pyramid-point': 'plain',
  'tetra-altitude': 'plain',
  'make-right-prism': 'plain',
  concyclic: 'plain',
  'line-rel': 'plain',
};

/** The same question over the claim union, the `claim` command's sub-kind (#1549). */
const CLAIM_VECTOR_READING_3: Record<Claim3['type'], VectorReading3> = {
  'vec-eq': 'vector',
  'vec-val': 'vector',
  'dot-val': 'vector',
  'dot-eq': 'vector',
  'mag-rel': 'vector',
  'mag-val': 'vector',
  'cos-angle-eq': 'plain', // with `cos-angle`: awaiting the ruling
  'cos-eq': 'plain', // likewise
  'length-rel': 'plain',
  'length-letter': 'plain',
  'volume-eq-poly': 'plain',
  'perp-plane': 'plain',
  'par-plane': 'plain',
  'collinear3': 'plain',
  'polygon-open': 'plain',
  'length-eq': 'plain',
  'length-sum': 'plain',
  'area-eq': 'plain',
  'coords-eq': 'plain',
  'never-parallel': 'plain',
  'plane-eq': 'plain',
  'angle-seg-eq': 'plain',
  'vertex-angle-eq': 'plain',
  'length-ratio': 'plain',
  'volume-eq': 'plain',
  'lateral-area-eq': 'plain',
  'surface-area-eq': 'plain',
  'lines-rel': 'plain',
  'volume-poly': 'plain',
  'concyclic': 'plain',
  'bisector-dir': 'plain',
  'line-plane-angle': 'plain',
  'coord-plane-rel': 'plain',
  'plane-line-perp': 'plain',
  'line-rel': 'plain',
  'mutual-rel': 'plain',
  'plane-rel': 'plain',
  'distance-rel': 'plain',
  'free-rel': 'plain', // #2684: the engine's own arbiter, on a line another command already reads
};

/** One command's reading. The shape is structural (a test may pass a literal), so an unknown kind reads as prose. */
const readsAsVector3 = (cmd: { type: string; claim?: { type: string } }): boolean => {
  if (cmd.type === 'claim') return (CLAIM_VECTOR_READING_3 as Record<string, VectorReading3 | undefined>)[cmd.claim?.type ?? ''] === 'vector';
  return (VECTOR_READING_3 as Record<string, VectorReading3 | undefined>)[cmd.type] === 'vector';
};

/** Apply textbook vector notation to a vector-statement utterance: pair arrows + name underlines. */
export function vectorNotation(utterance: string, vecNames: Set<string>): string {
  const stripped = utterance.replace(new RegExp(String.raw`(?:^|(?<=[\s,:]))${VECTOR_WORD_SRC}\s+`, 'gi'), '');
  const { head, clause } = splitVectorClause3(stripped);
  let u = clause;
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
  return head + u;
}

/** Is this fact a VECTOR statement? (#313: the MathML layer applies only where this is true —
 *  an arrow on a segment name in a prose row would assert vector-ness the statement never had.)
 *  One vector command anywhere in the fact is enough (#1549). */
export const isVectorFact3 = (f: { cmds: readonly { type: string; claim?: { type: string } }[] }): boolean =>
  f.cmds.some(readsAsVector3);

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
  return isVectorFact3(f) ? vectorNotation(f.utterance, vecNames) : f.utterance;
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
