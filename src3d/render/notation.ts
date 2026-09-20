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

import { COMBINING_ARROW, isVectorMarked3, SPACING_ARROWS, VECTOR_WORD_SRC } from '../lexicon/marks3';
// #1195: the preview composes bidi isolation with the notation, so the display layer reads the
// isolation transform. `i18n/bidi` imports NOTHING — it is a leaf — so this edge runs downward, the
// direction `render` already depends in. The reverse (bidi importing render) would invert it.
import { isolateLtrRuns3 } from '../i18n/bidi';

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

/** The step-row display: vector facts get notation, everything else passes through verbatim. */
export function factDisplay3(f: { utterance: string; cmds: { type: string; claim?: { type: string } }[] }, vecNames: Set<string>): string {
  const isVec = f.cmds.some((cmd) => VEC_CMD_TYPES.has(cmd.type) || (cmd.type === 'claim' && cmd.claim?.type === 'vec-eq'));
  return isVec ? vectorNotation(f.utterance, vecNames) : f.utterance;
}

/**
 * THE INPUT PREVIEW, COMPOSED (#1195).
 *
 * **Operator, 2026-09-18, playing round #1193 T1:** *"I want to have the correct text appear below the
 * text like we do when hebrew is involved so the user sees the real input. the text should show like in
 * the input box with the arrow above the vector."*
 *
 * The box holds what the student typed — `DC→=3AB→`. The step row, AFTER they submit, shows the textbook
 * form with the arrow over the letters. Between typing and submitting there was NOTHING: `inputPreview3`
 * is bidi-only and returns `null` when isolation changes nothing, so a pure-LTR vector line previewed
 * not at all. That gap is what the bidi preview already closes for Hebrew, closed for vector notation.
 *
 * ## Why the gate is the MARKING and not the parse
 *
 * The preview runs on UNPARSED text — there is no command yet, so it cannot ask `isVectorFact3` the way
 * `factDisplay3` does. And `vectorNotation` is **unconditional**: measured, it turns «אורך AB = 5» into
 * «אורך AB⃗ = 5» and an unmarked `DC=3AB` into `DC⃗=3AB⃗`. The caller supplies the honesty gate, always.
 *
 * So the gate is what the student EXPLICITLY WROTE: an arrow, or the vector word. That is honest by
 * construction — showing an arrow for a line that already carries one asserts nothing they did not say —
 * and it is the same marking the parser reads (#1183/ADR-3D-250), from the same lexicon leaf.
 *
 * A bare `DC=3AB` still previews nothing, which is correct: the tool does not yet know whether that
 * sentence is about vectors, and #1183 is the whole story of it being ASKED.
 *
 * ## Where it sits in the pipeline
 *
 * **Isolate first, then typeset** — the same order #1152 established for the mathematics strip, and for
 * the same reason: the bidi runs are decided by `i18n/bidi`, and its isolate characters ride through
 * untouched. Composing the other way round could reorder the equation, which is what the strip exists to
 * prevent.
 *
 * The `null`-when-nothing-changes contract survives for plain lines, so the box does not grow an empty
 * second row — but it must NOT swallow `DC⃗=3AB⃗`, which is pure LTR, needs no isolation, and is exactly
 * the line the operator was looking at.
 */
export function inputPreviewDisplay3(s: string, vecNames: Set<string>): string | null {
  const iso = isolateLtrRuns3(s, true);
  if (!isVectorMarked3(s)) return iso === s ? null : iso;
  const shown = vectorNotation(iso, vecNames);
  return shown === s ? null : shown;
}
