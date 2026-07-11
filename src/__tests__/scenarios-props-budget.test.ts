import { describe, it, expect } from 'vitest';
import { replay, findValidConfig, meetsRequirements } from '@/store/geoStore';
import { SCENARIOS, factsOf, at } from './scenarios-corpus';
import type { Fact } from '@/store/geoStore';

/**
 * Production-budget lock (issue #19): the suite runs with SEARCH_BUDGET_MS = Infinity, so a config search
 * that only succeeds after a long futile sweep looks green here while the LIVE app (2500ms wall budget)
 * gives up and keeps a violating seed — exactly how session eew5ezi5 shipped E between C and A with every
 * test passing. This test calls `findValidConfig` with the app's REAL budget, so a reintroduced
 * strict-then-fallback search order (or any other budget starvation on this figure class) fails the suite.
 */
describe('reported scenarios — config search succeeds under the app PRODUCTION budget (issue #19)', () => {
  it('[shared-endpoint-extension-either-side-default] findValidConfig resolves the eew5ezi5 figure within 2500ms', () => {
    const sc = SCENARIOS.find((s) => s.id === 'shared-endpoint-extension-either-side-default')!;
    // structuredClone defeats the replay purity memo, so the search pays COLD replays like a live session.
    const facts = structuredClone(factsOf(sc.steps)) as Fact[];
    const found = findValidConfig(facts, 0, 2500);
    expect(found, 'the app-budgeted config search finds a valid configuration').not.toBeNull();
    // The letter-order side is unachievable on this figure, so the found config lives on the RELAXED
    // (shared-endpoint either-side, ADR-142) tier — and E genuinely lands beyond A (the book's C-A-E).
    expect(meetsRequirements(found!.facts, found!.seed, true), 'the found config meets the acceptance bar').toBe(true);
    const fig = replay(found!.facts, found!.seed);
    const C = at(fig, 'C'), A = at(fig, 'A'), E = at(fig, 'E');
    const t = ((E.x - C.x) * (A.x - C.x) + (E.y - C.y) * (A.y - C.y)) / ((A.x - C.x) ** 2 + (A.y - C.y) ** 2);
    expect(t, 'E beyond A (C-A-E)').toBeGreaterThan(1);
  });
});
