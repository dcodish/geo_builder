/**
 * #2064 ([ADR-643](../../docs/06-decisions.md#adr-643)) — A HEIGHT NAMED BY TWO EXISTING VERTICES, JUDGED ONCE FOR
 * BOTH COMMIT SEAMS.
 *
 * «ריבוע ABCD» · «AB גובה» read A as the apex and B as a foot to be minted onto CD, and the square collapsed to one
 * point, green. The operator's rulings of 2026-10-13: a segment that is ALREADY a height in the figure answers «זה
 * כבר קיים באיור — אין מה להוסיף.» in every spelling, and an existing vertex is never redefined as a foot. With no
 * side named, the candidates are the sides at either endpoint.
 *
 * The parser lists those candidates as long-form sentences (`cevianPairReadings`); this asks the one question the
 * ruling turns on — does one of them already hold? — by dry-running each bare reading against the figure, under
 * the #1012 role-reading work cap (≤ 4 per segment, and only on a two-vertex named height). The submit decision
 * and the ✎ edit seam both call it (ADR-W-006: one predicate, both seams).
 *
 * - every named segment has a reading already true, and the line says nothing more → `implied` («כבר קיים»);
 * - the same, and the line carries a tail («הגובה AB = 5») → `adopt` that reading WITH the tail: the length is a
 *   new given, so «כבר קיים» would drop it, and the long form is the spelling that builds it;
 * - otherwise `null`: the line's own parse stands — ADR-642's right angle in a single triangle, or the parser's
 *   `cevian-redefines-vertex` refusal where the only reading would move a vertex.
 */
import { cevianPairReadings, parse, type ParseContext } from '@/parser';
import { dryRunOutcome, type Fact } from '@/store/geoStore';
import { withWorkBudget } from '@/engine/solveBudget';

export type VertexPairVerdict = { readonly kind: 'implied' } | { readonly kind: 'adopt'; readonly reading: string };

export function vertexPairVerdict(utterance: string, ctx: ParseContext, facts: Fact[], seed: number, cap: number): VertexPairVerdict | null {
  const vp = cevianPairReadings(utterance, ctx);
  if (!vp) return null;
  const held: number[] = [];
  for (const seg of vp.segments) {
    const at = seg.bare.findIndex((bare) => {
      const r = parse(bare, ctx);
      if (!r.ok) return false;
      const o = withWorkBudget(cap, () => dryRunOutcome(facts, r.commands, seed));
      return !o.produced && o.reason === 'implied';
    });
    if (at < 0) return null;
    held.push(at);
  }
  if (!vp.tail) return { kind: 'implied' };
  return { kind: 'adopt', reading: vp.segments[0].readings[held[0]] };
}
