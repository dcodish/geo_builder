/**
 * The OPERAND TOKENIZER — S1 of the relations program (docs/26 v2 §3.1, #378).
 *
 * Every line/plane relation takes two operands drawn from ONE closed set, and the operand is classified
 * by what the token IS — the kinds are known — never by its noun. The noun is optional, non-deciding,
 * and RECORDED when it contradicts the kind, so the caller can build-and-correct instead of guessing
 * (the [ADR-3D-100] lesson: «ACD אנך למישור l1» works because ACD can only be a plane run and l1 can
 * only be a line, whatever the student called them).
 *
 * This module is parser-local (it owns the text tokens); its output type `Operand3` lives in
 * engine/types so commands can carry operands. The geometric meaning of an operand is the engine
 * resolver's job (`engine/operands.ts`), not this file's.
 */

import type { Operand3 } from '../engine/types';

/** ℓ, ℓ1, l2, ℓ₃ — must agree with parse3's LINE_NAME (asserted by `operand-token.test.ts`). */
const LINE_ONLY = /^[ℓl][\d₀-₉]*$/;
/** π, π1, pi2 — must agree with parse3's PLANE_NAME. */
const PLANE_ONLY = /^(?:π|pi|Pi|PI)\s?\d*$/;
const LABEL = /[A-Z]\d*'?/;
const RUN_3_4 = new RegExp(`^(?:${LABEL.source}){3,4}$`);
const SEG = new RegExp(`^(${LABEL.source})(${LABEL.source})$`);
const POINT = new RegExp(`^${LABEL.source}$`);
/** A named vector: a single lowercase letter (parse3's badName rule: `[a-w]`, excluding x/y/z). */
const VECTOR = /^[a-w]$/;
/** #512 — a COORDINATE plane, in every spelling a student writes: `[xy]`, `xy`, `ה-xy`, `xy-plane`,
 *  and either ordering (`[yx]` ≡ `[xy]`). Bracketing is the tool's own palette convention, not a
 *  requirement of the notation. */
const COORD_PLANE = /^(?:ה?-?)?\[?\s*([xyz])\s*([xyz])\s*\]?(?:\s*-?\s*plane)?$/i;
/** #512 — a coordinate AXIS: `x`, `ציר ה-x`, `the x-axis`. The noun is stripped upstream when present. */
const AXIS = /^(?:ה?-?)?(?:ציר\s+ה?-?)?([xyz])(?:\s*-?\s*axis)?$/i;
/** The two letters of a coordinate plane, in the canonical order the engine stores. */
const canonAxes = (a: string, b: string): 'xy' | 'yz' | 'xz' | null => {
  const k = [a.toLowerCase(), b.toLowerCase()].sort().join('');
  return k === 'xy' || k === 'yz' || k === 'xz' ? (k as 'xy' | 'yz' | 'xz') : null;
};

/** The noun the student attached, when any — recorded so a kind-contradicting noun can be corrected. */
export type OperandNoun = 'plane' | 'line' | 'segment' | 'vector' | 'point';

export interface ReadOperand {
  op: Operand3;
  /** The noun as stated, `undefined` when the token stood alone. */
  noun?: OperandNoun;
}

/**
 * The operand NOUNS, with number DERIVED rather than enumerated (#522) and the solid's own role words
 * admitted (#524).
 *
 * Plurals are an optional SUFFIX on the existing atom exactly as `ה?` is an optional prefix — the list
 * previously spelled the singular only, so «המישורים ABC ו-SBC» failed to strip its noun and classified
 * as no operand at all, while the singular twin of the very same fact parsed. That failure was shared by
 * EVERY relation family at once (angle, ⊥, ∥, distance) precisely because this seam is shared, which is
 * what makes it one defect rather than four.
 *
 * `פאה` (face) and `בסיס` (base) are how a bagrut question actually names the two planes of a dihedral —
 * by their role in the solid, not by their point run. Nothing in the engine was missing for them: a face
 * and a base ARE point-run planes, so this is operand VOCABULARY, and every relation family inherits it
 * at once for the same reason.
 */
const NOUN = new RegExp(
  '^(?:' +
    [
      'ה?מישור(?:ים)?',
      'ה?ישר(?:ים)?',
      'ה?קטע(?:ים)?',
      'ה?מקצוע(?:ות)?',
      'ה?ו?וקטור(?:ים)?',
      'ה?נקוד(?:ה|ות)',
      'ה?פא(?:ה|ות)', // #524: a FACE is a point-run plane
      'ה?בסיס(?:ים)?', // #524: so is a BASE
      '(?:the\\s+)?planes?',
      '(?:the\\s+)?lines?',
      '(?:the\\s+)?segments?',
      '(?:the\\s+)?edges?',
      '(?:the\\s+)?vectors?',
      '(?:the\\s+)?points?',
      '(?:the\\s+)?faces?',
      '(?:the\\s+)?bases?',
    ].join('|') +
    ')\\s+',
);

const nounKind = (word: string): OperandNoun =>
  /מישור|plane|פא[הות]|בסיס|face|base/.test(word) ? 'plane'
  : /ישר|line/.test(word) ? 'line'
  : /קטע|מקצוע|segment|edge/.test(word) ? 'segment'
  : /וקטור|vector/.test(word) ? 'vector'
  : 'point';

/**
 * Classify one raw operand token (a side of a relation, already split off the connective).
 * Null when the text is not a single operand — the caller's rule then simply does not match,
 * exactly as a hand-written regex would have failed.
 */
export function readOperand(raw: string): ReadOperand | null {
  let t = raw.trim();
  let noun: OperandNoun | undefined;
  const nm = t.match(NOUN);
  if (nm) {
    noun = nounKind(nm[0]);
    t = t.slice(nm[0].length).trim();
  }
  if (LINE_ONLY.test(t)) return { op: { kind: 'line', name: t }, noun };
  if (PLANE_ONLY.test(t)) return { op: { kind: 'plane-named', name: t.replace(/\s+/g, '') }, noun };
  if (RUN_3_4.test(t)) return { op: { kind: 'plane-run', ids: t.match(new RegExp(LABEL.source, 'g'))! }, noun };
  const seg = t.match(SEG);
  if (seg) return seg[1] === seg[2] ? null : { op: { kind: 'segment', a: seg[1], b: seg[2] }, noun };
  if (POINT.test(t)) return { op: { kind: 'point', id: t }, noun };
  if (VECTOR.test(t)) return { op: { kind: 'vector', name: t }, noun };
  // #512 — the absolute-frame operands, LAST so nothing above changes hands: a point label is
  // uppercase and a named vector is `[a-w]`, so neither can be read as an axis (`x`/`y`/`z` are
  // excluded from the vector charset for exactly this reason).
  const cp = t.match(COORD_PLANE);
  if (cp) {
    const axes = canonAxes(cp[1], cp[2]);
    if (axes) return { op: { kind: 'plane-coord', axes }, noun };
  }
  const ax = t.match(AXIS);
  if (ax) return { op: { kind: 'axis', axis: ax[1].toLowerCase() as 'x' | 'y' | 'z' }, noun };
  return null;
}

/** The connective joining two operands under ONE noun: «ו-», «ל-», «לבין», «and», «to». */
const CONJ = /\s+(?:[לו]בין\s+|ו-?\s*|ל-?\s*|and\s+|to\s+)/;

/**
 * #522 — the CONJOINED subject: one noun heading TWO operands, «המישורים ABC ו-SBC», «lines ℓ1 and ℓ2».
 *
 * The existing rules all expect a noun PER operand, so a list read as a single side classified as no
 * operand and every relation family refused the plural form of a fact whose singular twin builds. This
 * lives at the operand seam rather than in each rule for the reason the seam exists at all: a per-rule
 * fix here would be the enumeration mistake this tree keeps paying for, and the four families would
 * drift again the moment a fifth is added.
 *
 * The head noun DISTRIBUTES over both operands — «המישורים ABC ו-SBC» is «המישור ABC» and «המישור SBC»
 * — so both sides come back through the ordinary reader and the kinds are still decided by what the
 * tokens ARE, never by the noun.
 */
export function readOperandList(raw: string): [ReadOperand, ReadOperand] | null {
  const t = raw.trim();
  const nm = t.match(NOUN);
  if (!nm) return null; // a bare «A ו-B» is not a list — the noun is what marks the shared head
  const noun = nounKind(nm[0]);
  const rest = t.slice(nm[0].length).trim();
  const cut = rest.match(CONJ);
  if (!cut || cut.index === undefined) return null;
  const first = readOperand(rest.slice(0, cut.index));
  const second = readOperand(rest.slice(cut.index + cut[0].length));
  if (!first || !second) return null;
  return [
    { op: first.op, noun: first.noun ?? noun },
    { op: second.op, noun: second.noun ?? noun },
  ];
}

/**
 * #522 — read the two sides of a relation, in EITHER frame: one operand per side («המישור ABC מאונך
 * למישור SBC»), or a conjoined list on one side with a plural predicate («המישורים ABC ו-SBC מאונכים»,
 * where the split leaves the other side empty). One helper, so every relation family reads both frames.
 */
export function readRelationSides(left: string, right: string): [ReadOperand, ReadOperand] | null {
  if (right.trim() === '') return readOperandList(left);
  if (left.trim() === '') return readOperandList(right);
  const a = readOperand(left);
  const b = readOperand(right);
  return a && b ? [a, b] : null;
}
