/**
 * #2893 ([ADR-3D-494](../../docs/06b-decisions-3d.md#adr-3d-494); ADR-W-210 invariant 3) — 3-D'S WARMTH-INDEPENDENT
 * COUNT OF WORK: what the configuration search's limit (`shell/workLimit`) reads.
 *
 * The search's answers are kept by content (ADR-3D-491), so a seed judged before is answered from a memo and executes
 * nothing. Counted as zero, a hit would let a warm session search further than a cold one, and the outcome would depend
 * on what the session had solved before (docs/17 §7: "a work-count budget charges every memo hit the work it saved").
 * So every answer the search reads per seed carries what computing it cost, and a hit is CHARGED that:
 *  - {@link chargedWork3} is the work meter's executed total plus every charge made: a monotone count;
 *  - {@link costed3} runs a computation and measures its cost on that count (what it executed, and what the hits inside
 *    it were charged);
 *  - {@link chargeHit3} charges a hit its recorded cost.
 * The memos that carry a cost are the ones a search reads per seed: the seed verdicts and the resolve memo (and the
 * journal carries their costs across the worker, so the page's run of the same action stops where the worker's did).
 * The caches a construction fills once, whatever the seed (the parameter's roots, the pivot's pools, the parts), are
 * filled by the figure's own derive before a search starts (its first seed is the derive's), so a search meets them warm
 * in every session; the determinism lock (`seed-search-limit-2893.test.ts`) holds that.
 */
import { readWork } from '../../shell/workMeter';

let charged = 0;

/** The executed units plus every memo hit's charge: what a 3-D search's work limit counts. */
export const chargedWork3 = (): number => readWork().total + charged;

/** Run `fn` and measure its cost: the units it executed plus what its memo hits were charged. */
export function costed3<T>(fn: () => T): { value: T; cost: number } {
  const c0 = chargedWork3();
  const value = fn();
  return { value, cost: chargedWork3() - c0 };
}

/** A memo hit: charge what computing the answer cost (nothing for an answer whose cost is not known). */
export function chargeHit3(cost: number | undefined): void {
  if (cost) charged += cost;
}
