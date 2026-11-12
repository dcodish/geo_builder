/**
 * #2811 ([ADR-826](../../docs/06-decisions.md#adr-826)) — THE RING-ORDER REFUSAL BY PROOF, one verdict for both commit
 * seams (the submit seam's `decideDeterministic` and the ✎ seam's `editPipeline`, ADR-W-006).
 *
 * `ringOrderContradiction` (replay) answers structurally whether this line completes a contradiction between a ring a
 * statement proves convex (a circle through its letters, «קמור») and another declared order of its letters. This module
 * turns that answer into the refusal the student reads: the shared crossed-shape message naming the line (the recorded
 * ADR-W-174 choice `text-2810-circle-line-crossed`).
 */
import { ringOrderContradiction, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

export interface RingOrderVerdict {
  /** the log's result code */
  result: 'ring-contradicts-noun';
  messageKey: 'input.ringContradictsNoun';
  params: { detail: string };
  /** the ring proved convex and the other order, for the log */
  ring: string;
  other: string;
}

/** The refusal of `line` (lowered to `commands`) against `facts`, or `null` when the line completes no such contradiction. */
export function ringOrderVerdict(line: string, commands: AnyCommand[], facts: Fact[]): RingOrderVerdict | null {
  const hit = ringOrderContradiction(facts, commands);
  if (!hit) return null;
  return { result: 'ring-contradicts-noun', messageKey: 'input.ringContradictsNoun', params: { detail: line.trim() }, ring: hit.ring.join(''), other: hit.other.join('') };
}
