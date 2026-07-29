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

/** Command types whose rows read as vector statements (the word וקטור is decoration). */
export const VEC_CMD_TYPES = new Set(['name-vector', 'vec-rel', 'dot-given', 'inject-vector', 'point-in-span']);

/** Apply textbook vector notation to a vector-statement utterance: pair arrows + name underlines. */
export function vectorNotation(utterance: string, vecNames: Set<string>): string {
  let u = utterance.replace(/(?:^|(?<=[\s,:]))(?:ה?ו?וקטור|vectors?)\s+/gi, '');
  // #398 (ADR-3D-108): the lookBEHIND is the twin of the existing lookahead — inside a ≥3-label
  // point-run (ABC), the tail 'BC' used to pass the lookahead (nothing follows) and take an arrow
  // mid-run. A letter/quote before the pair means it is part of a LONGER run, so it is not a pair.
  // Digits stay allowed before (a glued coefficient «2KA'» is a real vector term).
  u = u.replace(/(?<![A-Za-z'⃗])([A-Z]\d*'?[A-Z]\d*'?)(?![⃗A-Za-z\d'])/g, '$1⃗');
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

/** The step-row display: vector facts get notation, everything else passes through verbatim. */
export function factDisplay3(f: { utterance: string; cmds: { type: string; claim?: { type: string } }[] }, vecNames: Set<string>): string {
  const isVec = f.cmds.some((cmd) => VEC_CMD_TYPES.has(cmd.type) || (cmd.type === 'claim' && cmd.claim?.type === 'vec-eq'));
  return isVec ? vectorNotation(f.utterance, vecNames) : f.utterance;
}
