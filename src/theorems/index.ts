/** Phase 6 — theorem surfacing. Public barrel (a pure, read-only consumer of the engine). */
export { detectTheorems, visibleFeed } from './detect';
export { detectPrinciples, activeBoosts, PRINCIPLE_TABLE, PRINCIPLES_VISIBLE } from './principles';
export type { PrincipleDef, PrincipleFeedEntry } from './principles';
// Deprecated aliases (the concepts feed became the principles lane, T5/ADR-248):
export { detectConcepts, CONCEPT_TABLE } from './concepts';
export type { ConceptDef, ConceptFeedEntry } from './concepts';
export { THEOREM_TABLE } from './table';
export { buildMatchCtx } from './context';
export type {
  TheoremFamily,
  Salience,
  Tier,
  TheoremId,
  DiscoveryLevel,
  MatchCtx,
  TheoremMatch,
  TheoremDef,
  TheoremFeedEntry,
  DetectInput,
} from './types';
