/** Phase 6 — theorem surfacing. Public barrel (a pure, read-only consumer of the engine). */
export { detectTheorems } from './detect';
export { THEOREM_TABLE } from './table';
export { buildMatchCtx } from './context';
export type {
  TheoremFamily,
  Salience,
  Tier,
  MatchCtx,
  TheoremMatch,
  TheoremDef,
  TheoremFeedEntry,
  DetectInput,
} from './types';
