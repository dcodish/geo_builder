/**
 * #2811 ([ADR-826](../../docs/06-decisions.md#adr-826)) — THE RING-ORDER REFUSAL BY PROOF, one verdict for both commit
 * seams (the submit seam's `decideDeterministic` and the ✎ seam's `editPipeline`, ADR-W-006).
 *
 * `ringOrderContradiction` (replay) answers structurally whether this line completes a contradiction between a ring a
 * statement proves convex and another declared order of its letters. This module turns that answer into the refusal the
 * student reads: the shared crossed-shape message naming the line (the recorded ADR-W-174 choice
 * `text-2810-circle-line-crossed`) — or, when the proof is the ring's STATED INTERIOR ANGLES (#2813,
 * [ADR-823](../../docs/06-decisions.md#adr-823)), a sentence that names the angle lines that force it (operator ruling
 * 2026-11-10) and the next step he chose on 2026-11-12 («שנו את אחת הזוויות או את סדר האותיות»).
 */
import { ringOrderContradiction, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

export type RingOrderVerdict = {
  /** the ring proved convex and the other order, for the log */
  ring: string;
  other: string;
} & (
  | { result: 'ring-contradicts-noun'; messageKey: 'input.ringContradictsNoun'; params: { detail: string } }
  | { result: 'ring-contradicts-angles'; messageKey: 'input.ringContradictsAngles'; params: { detail: string; forcing: string; ring: string; other: string } }
);

/** The refusal of `line` (lowered to `commands`) against `facts`, or `null` when the line completes no such contradiction. */
export function ringOrderVerdict(line: string, commands: AnyCommand[], facts: Fact[]): RingOrderVerdict | null {
  const hit = ringOrderContradiction(facts, commands);
  if (!hit) return null;
  const ring = hit.ring.join(''), other = hit.other.join('');
  if (hit.proof.reason !== 'angles') return { result: 'ring-contradicts-noun', messageKey: 'input.ringContradictsNoun', params: { detail: line.trim() }, ring, other };
  // a prior fact is quoted as the student typed it; a fact this line adds is this line
  const prior = new Set(facts);
  const text = (f: Fact) => (prior.has(f) && f.utterance ? f.utterance : line).trim();
  const forcing = [...new Set(hit.proof.facts.map(text))].map((s) => `«${s}»`).join(', ');
  return { result: 'ring-contradicts-angles', messageKey: 'input.ringContradictsAngles', params: { detail: line.trim(), forcing, ring, other }, ring, other };
}
