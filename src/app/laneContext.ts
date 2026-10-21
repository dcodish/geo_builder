/**
 * #2428 ([ADR-741](../../docs/06-decisions.md#adr-741)) — THE AI LANE'S PARSE CONTEXT, one per canonical step.
 *
 * The model's canonical lines are re-parsed by the deterministic grammar (`llmParse`). Each line must read the context
 * the grammar would read on the SAME figure if the student had typed it: `buildParseCtx` of the trial figure — the
 * facts plus the commands the earlier lines built — never a subset assembled by hand. The first line reads `first`,
 * the context the deterministic path itself read, so an echoed line decides exactly as the typed one did.
 *
 * `facts` and `seed` are read when a later line needs them (after the model answered), so the figure is the current
 * one. One replay per line that follows a built line; the fold memo makes the shared prefix a tail replay.
 */
import { buildParseCtx, type ParseContext } from '@/parser';
import type { LaneContext } from '@/parser/llm';
import type { AnyCommand } from '@/engine';
import { replay, trialFacts, type Fact } from '@/store/geoStore';

export function laneContext(first: ParseContext, now: () => { facts: Fact[]; seed: number }): LaneContext {
  let memo: { n: number; ctx: ParseContext } | null = null;
  return (built: readonly AnyCommand[]): ParseContext => {
    if (built.length === 0) return first;
    if (memo && memo.n === built.length) return memo.ctx; // a dropped line built nothing: the same figure
    const { facts, seed } = now();
    const d = replay(trialFacts(facts, [...built]), seed);
    memo = { n: built.length, ctx: buildParseCtx(d.construction, d.positions) };
    return memo.ctx;
  };
}
