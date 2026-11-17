import { describe, it, expect } from 'vitest';
import { replay, findValidConfig, searchResample, meetsRequirements } from '@/store/geoStore';
import { findValidConfigRound, lastConfigTier, SEARCH_WORK_LIMIT } from '@/replay/core';
import { isNotDecided } from '../../shell/notDecided';
import { SCENARIOS, factsOf, at } from './scenarios-corpus';
import type { Fact } from '@/store/geoStore';

/**
 * #2893 (ADR-831): the suite and the app now run ONE limit, in work units (`SEARCH_WORK_LIMIT`); the clocks this file
 * was written against (2500 ms on the page, 12 s in the worker, none under vitest) are gone, so each lock below asks
 * for the production limit, which is now simply the default.
 *
 * Production-budget lock (issue #19): the suite ran with SEARCH_BUDGET_MS = Infinity, so a config search
 * that only succeeds after a long futile sweep looks green here while the LIVE app (2500ms wall budget)
 * gives up and keeps a violating seed — exactly how session eew5ezi5 shipped E between C and A with every
 * test passing. This test calls `findValidConfig` with the app's REAL budget, so a reintroduced
 * strict-then-fallback search order (or any other budget starvation on this figure class) fails the suite.
 */
describe('reported scenarios — config search succeeds under the app PRODUCTION budget (issue #19)', () => {
  it('[shared-endpoint-extension-either-side-default] findValidConfig resolves the eew5ezi5 figure within the production limit', () => {
    const sc = SCENARIOS.find((s) => s.id === 'shared-endpoint-extension-either-side-default')!;
    // structuredClone defeats the replay purity memo, so the search pays COLD replays like a live session.
    const facts = structuredClone(factsOf(sc.steps, sc.refusedSteps, { centresShown: sc.centresShown })) as Fact[];
    const found = findValidConfig(facts, 0, SEARCH_WORK_LIMIT);
    expect(found, 'the app-budgeted config search finds a valid configuration').not.toBeNull();
    // ADR-784: one bar. The scenario types the book's order, so the found config meets it with E beyond A (C-A-E).
    expect(meetsRequirements(found!.facts, found!.seed), 'the found config meets the bar').toBe(true);
    const fig = replay(found!.facts, found!.seed);
    const C = at(fig, 'C'), A = at(fig, 'A'), E = at(fig, 'E');
    const t = ((E.x - C.x) * (A.x - C.x) + (E.y - C.y) * (A.y - C.y)) / ((A.x - C.x) ** 2 + (A.y - C.y) ** 2);
    expect(t, 'E beyond A (C-A-E)').toBeGreaterThan(1);
  });
});

/**
 * Worker-context budget (issue #87 / ADR-296): the config searches (`resample` / `autoResolve` →
 * `findValidConfig`) run OFF the main thread since ADR-290, so the 2500ms freeze cap no longer applies —
 * they get `SEARCH_WORK_LIMIT`. On the CEFO figure `findValidConfig` returned null COLD at ~2743ms
 * (one bad seed past 2500), so the diagram only came up on an idempotent re-submit that warmed the caches.
 */
describe('config searches get a generous budget off the main thread (issue #87)', () => {
  it('the search limit is finite (#2893: one limit, in work units, the same in every heap)', () => {
    expect(Number.isFinite(SEARCH_WORK_LIMIT)).toBe(true);
    expect(SEARCH_WORK_LIMIT).toBeGreaterThan(0);
  });

  it('searchResample honours its limit param — a zero limit searches nothing; the search limit finds another config', () => {
    const facts = factsOf(['מרובע ABCD']); // a general quad has free DOF ⇒ "another configuration" exists
    // a limit with nothing in it runs no candidate ⇒ null (the param gates the loop; it is not ignored)
    expect(searchResample(structuredClone(facts) as Fact[], 0, undefined, 0), 'a zero limit finds nothing').toBeNull();
    // the search limit finds a genuinely different drawing
    expect(searchResample(structuredClone(facts) as Fact[], 0, undefined, SEARCH_WORK_LIMIT), 'the search limit finds another configuration').not.toBeNull();
  });

  it('findValidConfig honours its limit param — a zero limit on a search-needing figure is NOT DECIDED, never "none found" (#2893)', () => {
    // The shared-endpoint figure (issue #19) needs a real search: seed 0 fails the extension order, so
    // findValidConfig must sweep. A zero limit can't sweep: it used to answer null, as a search that finished does;
    // since #2893 (ADR-831) it says "not decided". The search limit resolves it.
    const sc = SCENARIOS.find((s) => s.id === 'shared-endpoint-extension-either-side-default')!;
    expect(isNotDecided(findValidConfigRound(structuredClone(factsOf(sc.steps, sc.refusedSteps, { centresShown: sc.centresShown })) as Fact[], 0, 0, 0)), 'a zero limit is not decided').toBe(true);
    expect(findValidConfig(structuredClone(factsOf(sc.steps, sc.refusedSteps, { centresShown: sc.centresShown })) as Fact[], 0, SEARCH_WORK_LIMIT), 'the search limit resolves it').not.toBeNull();
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

  it('[#566 / ADR-445 Am. 1] the TWO-circle play figure (the #546 grammar): seat tier, before reflections', () => {
    // The operator's exact round-#561 figure — the incircle group is what actually blew the 12 s
    // worker budget when the seat tier ran after the mask×seed product. Same structural lock.
    const facts = structuredClone(
      factsOf([
        'משולש ישר זווית ABC',
        'משולש ABC חסום במעגל',
        'מעגל חסום במשולש ABC',
        'משיק למעגל בנקודה B',
        'קשת AB = קשת BC',
      ]),
    ) as Fact[];
    const found = findValidConfig(facts, 0);
    expect(found, 'the seat flip is found on the full play figure').not.toBeNull();
    expect(lastConfigTier, 'produced by the seat tier').toBe('seat');
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
  });
});

/**
 * #1441 — the obtuse-side proof keeps the right-triangle seat rescue inside the COLD worker budget.
 * The external reviewer's «משולש ישר זווית ABC · AB=3 · BC=4»: before the proof, each impossible seat
 * burned the recruit ladder (~20 s) and a cold `findValidConfig` returned NULL past its 12 s budget,
 * so the worker reported `noValidConfig`. With the pre-ladder proof the impossible seats fail in
 * milliseconds and the seat tier delivers the honest reseat (knee at A) cold. structuredClone defeats
 * the replay memo, so this pays cold replays like the live worker; the REAL budget enforces itself —
 * a regression past 12 s returns null and fails the first assertion.
 */
describe('[#1441] the reviewer’s right-triangle figure resolves cold under the worker budget', () => {
  it('«משולש ישר זווית ABC · AB=3 · BC=4»: findValidConfig succeeds COLD, on the seat tier, with the stated lengths exact', () => {
    const facts = structuredClone(factsOf(['משולש ישר זווית ABC', 'AB=3', 'BC=4'])) as Fact[];
    const found = findValidConfig(facts, 0, SEARCH_WORK_LIMIT);
    expect(found, 'the cold search finds the reseated figure within the worker budget').not.toBeNull();
    expect(lastConfigTier, 'produced by the seat tier — the designed ADR-445 rescue').toBe('seat');
    const fig = replay(found!.facts, found!.seed);
    expect(fig.lastError).toBeNull();
    const d = (a: string, b: string) => {
      const p = at(fig, a), q = at(fig, b);
      return Math.hypot(p.x - q.x, p.y - q.y);
    };
    expect(d('A', 'B'), '|AB| = 3 as stated').toBeCloseTo(3, 3);
    expect(d('B', 'C'), '|BC| = 4 as stated').toBeCloseTo(4, 3);
  });
});
