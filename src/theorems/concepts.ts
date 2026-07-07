/**
 * DEPRECATED shim — the concepts feed became the PRINCIPLES lane (T5, ADR-248; docs/18 §6: the
 * operator-authored teacher tips, with intent archetypes as a boosting subspecies). Kept so existing
 * imports keep working; new code should import from './principles'.
 */

export { PRINCIPLE_TABLE as CONCEPT_TABLE, detectPrinciples as detectConcepts } from './principles';
export type { PrincipleDef as ConceptDef, PrincipleFeedEntry as ConceptFeedEntry } from './principles';
