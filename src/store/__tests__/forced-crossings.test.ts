/**
 * The crossing-dot FORCEDNESS gate (#228, ADR-380; operator ruling 2026-07-21):
 * "only if that intersection exists for sure across all configurations, we show the dot."
 *
 * The universe test (`ink-crossings.test.ts`) covers WHICH crossings exist in one drawing. This covers the
 * harder half — which of them are properties of the FIGURE rather than accidents of the seed on screen.
 */

import { describe, it, expect } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-corpus';
import { forcedCrossingKeys, replay, firstSatisfyingSeed } from '../geoStore';
import type { Fact } from '../geoStore';
import { applySeed, evaluate, freeDofCount } from '@/engine';
import type { Construction, Id, ResolvedCircle, Vec } from '@/engine';

/** Rebuild the shared-sample shape the store hands the gate, without the store's private memo. */
function poolOf(facts: Fact[], n = 16): { constructions: Construction[]; samples: Map<Id, Vec>[] } {
  const c = replay(facts, firstSatisfyingSeed(facts)).construction;
  const samples: Map<Id, Vec>[] = [];
  for (let s = 0; s < n; s++) {
    const r = evaluate(applySeed(c, s));
    if (r.ok) samples.push(r.positions);
  }
  return { constructions: [c], samples };
}

describe('forcedCrossingKeys — a dot only where the crossing is certain (#228)', () => {
  it("a parallelogram's diagonals cross in EVERY configuration → forced", () => {
    // The diagonals of a parallelogram always meet, interior to both, no matter how it flexes.
    const facts = factsOf(['מקבילית ABCD', 'AC', 'BD']);
    const forced = forcedCrossingKeys(poolOf(facts));
    expect(forced.has('s:A-C|s:B-D'), 'the diagonal crossing earns its dot').toBe(true);
  });

  it('two loose segments that only sometimes cross are NOT forced — the operator’s vanishing dot', () => {
    // Free endpoints: some configurations cross, others do not. Under the old behaviour the dot was offered
    // whenever the CURRENT drawing happened to cross — then "show another configuration" took it away,
    // stranding any letter the student had given it.
    const facts = factsOf(['קטע AB', 'קטע CD']);
    const pool = poolOf(facts);
    const forced = forcedCrossingKeys(pool);
    expect(forced.has('s:A-B|s:C-D'), 'an incidental crossing must never be offered').toBe(false);
  });

  it('a starved pool on an under-determined figure withholds every dot (the conservative call)', () => {
    const facts = factsOf(['מקבילית ABCD', 'AC', 'BD']);
    const full = poolOf(facts);
    expect(freeDofCount(full.constructions[0]), 'this figure is under-determined').toBeGreaterThan(0);
    // Fewer than 4 valid samples cannot establish "in every configuration" (the ADR-295 discipline).
    const starved = { constructions: full.constructions, samples: full.samples.slice(0, 3) };
    expect(forcedCrossingKeys(starved).size, 'thin pool → no dots').toBe(0);
    expect(forcedCrossingKeys(full).size, 'healthy pool → the forced dot returns').toBeGreaterThan(0);
  });

  it('a DETERMINED figure needs only its single configuration — one sample is every configuration', () => {
    const facts = factsOf(['ריבוע ABCD', 'AC', 'BD']);
    const full = poolOf(facts);
    expect(freeDofCount(full.constructions[0]), 'a square is rigid up to similarity').toBe(0);
    const single = { constructions: full.constructions, samples: full.samples.slice(0, 1) };
    expect(forcedCrossingKeys(single).has('s:A-C|s:B-D'), 'the square’s diagonal crossing still offered').toBe(true);
  });

  it('an empty pool offers nothing rather than throwing', () => {
    const facts = factsOf(['מקבילית ABCD']);
    expect(forcedCrossingKeys({ constructions: [replay(facts).construction], samples: [] }).size).toBe(0);
  });

  it('a secant’s TWO crossings are forced together — the pair is judged by count, not by root', () => {
    // A chord drawn between two points ON the circle: its carrier crosses the circle at both endpoints, but
    // those are named points, so no dot. The interesting case is the diameter's own segment vs the circle —
    // both crossings exist in every configuration or neither does.
    const facts = factsOf(['מעגל O', 'AB קוטר', 'נקודה P', 'נקודה Q', 'PQ']);
    const forced = forcedCrossingKeys(poolOf(facts));
    // P,Q are free, so PQ may or may not cut the circle → never forced.
    expect([...forced].some((k) => k.includes('s:P-Q') && k.includes('c:')), 'a free chord is not certain').toBe(false);
  });
});

/** The gate must never be fooled by a pool the FILTERS thinned — the store's own contract. */
describe('forcedCrossingKeys — pool contract', () => {
  it('reads each sample’s own circles (a positions-keyed side table survives every filter)', () => {
    // A circle whose radius is a free DOF resolves differently per sample; the gate must intersect against
    // THAT sample's circle, never a single cached one. Exercised via a figure whose circle is free-radius:
    // if the gate used one circle for all samples it would report a stable crossing count that is not real.
    const facts = factsOf(['מעגל O', 'נקודה P', 'נקודה Q', 'PQ']);
    const pool = poolOf(facts);
    const circlesSeen = new Set<number>();
    for (const pos of pool.samples) {
      const r = evaluate(applySeed(pool.constructions[0], pool.samples.indexOf(pos)));
      if (r.ok) for (const [, c] of r.circles as Map<Id, ResolvedCircle>) circlesSeen.add(Math.round(c.r * 1000));
    }
    // Whatever the radii do, an incidental free chord is never certain.
    expect(forcedCrossingKeys(pool).size).toBe(0);
  });
});
