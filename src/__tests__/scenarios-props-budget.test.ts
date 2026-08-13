import { describe, it, expect } from 'vitest';
import { replay, findValidConfig, searchResample, meetsRequirements, WORKER_SEARCH_BUDGET_MS } from '@/store/geoStore';
import { lastConfigTier } from '@/replay/core';
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

/**
 * Worker-context budget (issue #87 / ADR-296): the config searches (`resample` / `autoResolve` →
 * `findValidConfig`) run OFF the main thread since ADR-290, so the 2500ms freeze cap no longer applies —
 * they get `WORKER_SEARCH_BUDGET_MS`. On the CEFO figure `findValidConfig` returned null COLD at ~2743ms
 * (one bad seed past 2500), so the diagram only came up on an idempotent re-submit that warmed the caches.
 */
describe('config searches get a generous budget off the main thread (issue #87)', () => {
  it('the worker budget is finite and larger than the 2500ms main-thread freeze cap', () => {
    expect(Number.isFinite(WORKER_SEARCH_BUDGET_MS)).toBe(true);
    expect(WORKER_SEARCH_BUDGET_MS).toBeGreaterThan(2500);
  });

  it('searchResample honours its budgetMs param — an expired budget searches nothing; the worker budget finds another config', () => {
    const facts = factsOf(['מרובע ABCD']); // a general quad has free DOF ⇒ "another configuration" exists
    // an already-expired budget runs no candidate ⇒ null (the param gates the loop; it is not ignored)
    expect(searchResample(structuredClone(facts) as Fact[], 0, undefined, -1), 'expired budget finds nothing').toBeNull();
    // the generous worker budget finds a genuinely different drawing
    expect(searchResample(structuredClone(facts) as Fact[], 0, undefined, WORKER_SEARCH_BUDGET_MS), 'worker budget finds another configuration').not.toBeNull();
  });

  it('findValidConfig honours its budgetMs param — an expired budget on a search-needing figure gives up', () => {
    // The shared-endpoint figure (issue #19) needs a real search: seed 0 fails the extension order, so
    // findValidConfig must sweep. An expired budget can't sweep ⇒ null; the worker budget resolves it.
    const sc = SCENARIOS.find((s) => s.id === 'shared-endpoint-extension-either-side-default')!;
    expect(findValidConfig(structuredClone(factsOf(sc.steps)) as Fact[], 0, -1), 'expired budget gives up').toBeNull();
    expect(findValidConfig(structuredClone(factsOf(sc.steps)) as Fact[], 0, WORKER_SEARCH_BUDGET_MS), 'worker budget resolves it').not.toBeNull();
  });

  it('[#566 / ADR-445 Am. 1] the seat tier finds the rescue BEFORE the reflection tier runs', () => {
    // The operator's play figure: with the seat tier ordered after the reflection tier, the mask×seed
    // product ate the worker's 12 s and the rescue arrived cold at ~13.4 s — the live app kept the
    // C-on-A collapse while the Infinity-budget suite stayed green (the issue-#19 trap, seat edition).
    // A WALL-CLOCK assertion cannot live in the parallel suite (measured: 5 s solo, 28 s under CPU
    // contention — a flake), so this locks the ORDERING itself via the tier instrumentation: the
    // rescue must be produced by the 'seat' tier, i.e. before any reflection candidate was tried.
    // The heavier two-circle edition rides the #546/#562 branch, whose grammar it needs.
    const facts = structuredClone(
      factsOf(['משולש ישר זווית ABC', 'משולש ABC חסום במעגל', 'משיק למעגל בנקודה B', 'קשת AB = קשת BC']),
    ) as Fact[];
    const found = findValidConfig(facts, 0);
    expect(found, 'the seat flip is found').not.toBeNull();
    expect(lastConfigTier, 'produced by the seat tier — ordered before the reflection sweep').toBe('seat');
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
  });
});
