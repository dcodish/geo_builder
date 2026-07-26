/**
 * Scenario corpus AGGREGATOR (S4.1b of docs/24). The harness (Step/Scenario/ctxOf/factsOf/run)
 * lives in scenarios-harness.ts; the scenario objects live in scenarios-corpus-{1..4}.ts (append
 * new ones to the LAST chunk). Every existing consumer import path is unchanged: shards and props
 * files import SCENARIOS + the harness from THIS module.
 */
export * from './scenarios-harness';
import type { Scenario } from './scenarios-harness';
import { SCENARIOS_1 } from './scenarios-corpus-1';
import { SCENARIOS_2 } from './scenarios-corpus-2';
import { SCENARIOS_3 } from './scenarios-corpus-3';
import { SCENARIOS_4 } from './scenarios-corpus-4';

export const SCENARIOS: Scenario[] = [...SCENARIOS_1, ...SCENARIOS_2, ...SCENARIOS_3, ...SCENARIOS_4];

// The seed-sweep oracle (its exempt/heavy lists and `sweepSeeds`) moved into scenarios-harness.ts with
// ADR-394 — it is harness machinery, not corpus data, and the harness is where the co-located shards
// reach it. `export * from './scenarios-harness'` above keeps every existing import path working.
