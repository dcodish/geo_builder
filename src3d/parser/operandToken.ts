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

/** The noun the student attached, when any — recorded so a kind-contradicting noun can be corrected. */
export type OperandNoun = 'plane' | 'line' | 'segment' | 'vector' | 'point';

export interface ReadOperand {
  op: Operand3;
  /** The noun as stated, `undefined` when the token stood alone. */
  noun?: OperandNoun;
}

const NOUN = new RegExp(
  '^(?:' +
    [
      'ה?מישור',
      'ה?ישר',
      'ה?קטע',
      'ה?מקצוע',
      'ה?ו?וקטור',
      'ה?נקודה',
      '(?:the\\s+)?plane',
      '(?:the\\s+)?line',
      '(?:the\\s+)?segment',
      '(?:the\\s+)?edge',
      '(?:the\\s+)?vector',
      '(?:the\\s+)?point',
    ].join('|') +
    ')\\s+',
);

const nounKind = (word: string): OperandNoun =>
  /מישור|plane/.test(word) ? 'plane'
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
  return null;
}
