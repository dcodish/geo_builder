/**
 * #2893 ([ADR-831](../../docs/06-decisions.md#adr-831)) — a search run as the page runs it: round after round, as a
 * student presses «המשיכו לחפש» while it answers "not decided". Each round's limit is the rounds' sum, so the answer is
 * the one a single search with enough work finds; `rounds` is how many presses it took (1 = decided at once).
 */
import { findValidConfigRound, searchAnotherViewRound, type Fact } from '@/replay/core';
import { isNotDecided } from '../../shell/notDecided';

const MAX_ROUNDS = 20;

export function inRounds<T>(round: (r: number) => T): { value: Exclude<T, { kind: 'not-decided' }>; rounds: number } {
  for (let r = 0; r < MAX_ROUNDS; r++) {
    const v = round(r);
    if (!isNotDecided(v)) return { value: v as Exclude<T, { kind: 'not-decided' }>, rounds: r + 1 };
  }
  throw new Error(`still not decided after ${MAX_ROUNDS} rounds`);
}

/** `findValidConfig`, continued until it decides. */
export const findValidConfigInRounds = (facts: Fact[], seed = 0) => inRounds((r) => findValidConfigRound(facts, seed, r));
/** `searchAnotherView`, continued until it decides. */
export const searchAnotherViewInRounds = (facts: Fact[], seed = 0) => inRounds((r) => searchAnotherViewRound(facts, seed, r));
