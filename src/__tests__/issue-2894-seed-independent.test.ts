/**
 * #2894 ([ADR-834](../../docs/06-decisions.md#adr-834)) — SHARED FAILURE MEMORY: a view whose failure no sampled freedom
 * reaches fails at every seed, and the configuration searches stop retrying it.
 *
 * The predicate in pairs: a fold that failed proves the failure at every seed; a figure with freedom and a clean fold
 * proves nothing; (a figure with nothing to sample is the same view at every seed: the sampler's own early return, `samplesNothing`).
 *
 * pipeline-lock: the predicate reads the fold a replayed figure was drawn from (a seed-independent fold is the whole
 * point), so it is exercised on folded figures; no unit below replay holds a fold.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { failsAtEverySeed, meetsRequirements, replay } from '@/store/geoStore';

describe('#2894 — failsAtEverySeed', () => {
  it('a fold that refused a line fails the bar at every seed', () => {
    const facts = factsOf(['ריבוע ABCD', 'AB = 3', 'AC = 10']);
    const fig = replay(facts, 0);
    expect(fig.lastError).not.toBeNull();
    expect(failsAtEverySeed(facts, fig, 'build')).toBe(true);
    expect(failsAtEverySeed(facts, fig, 'statuses')).toBe(true);
    for (const s of [1, 2, 3, 7]) expect(meetsRequirements(facts, s), `seed ${s}`).toBe(false);
  });

  it('a clean fold with free points proves nothing (its tail could pass at another seed)', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3']);
    expect(failsAtEverySeed(facts, replay(facts, 0), 'statuses')).toBe(false);
  });

  it('a Derived the fold memo did not record (a cut fold) proves nothing', () => {
    const facts = factsOf(['משולש ABC']);
    const fig = { ...replay(facts, 0) };
    expect(failsAtEverySeed(facts, fig, 'build')).toBe(false);
  });
});
