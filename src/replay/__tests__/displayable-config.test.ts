/**
 * Issue #345 (ADR-397) — a configuration in which a COMMITTED step did not hold is not displayable.
 *
 * `meetsRequirements` is the predicate every config search consults (`findValidConfig`, `resample`,
 * `firstSatisfyingSeed`, the shared detection sampler, and the corpus seed-sweep oracle). It judged the
 * geometry — extension directions, crossings within segments, distinctness, convexity — and the
 * verifier's `violations`, but it never asked the most basic question: *does the figure satisfy its own
 * commands?*
 *
 * So a seed where a stated given settled `over-constrained` was still offered to the student by "show
 * another configuration", with the given silently not applying. On the two-tangent-circles figure of
 * `common-tangent-two-circles` (the reported instance), seeds 0–1 landed |O2M| = 16 while seeds 2–3
 * left it at ~2.9 / ~1.25 with the step refused — and all four were called displayable.
 *
 * This is the cross-seed escape class (ADR-085/098/127/166) one level up: not a requirement the sampler
 * forgot, but the step statuses themselves.
 *
 * REPRODUCTION HISTORY: the original seed-split figure was the two-tangent-circles one; ADR-400 (the
 * tail's warm-start basin retry, #359) HEALED it — every seed now builds the closed form — which this
 * file's vacuous-guard correctly refused to ignore. The lock now uses the same figure as the ADR-398
 * attribution lock: a square with E on AB and |CE| = 5.2, whose split survives every rescue tier by
 * construction (a bounded 1-D root that does not exist at some sampled sides cannot be retried into
 * existence). The healed figure keeps its own every-seed lock in `basin-ownership.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay } from '@/store/geoStore';

const SQUARE_CE = ['ריבוע ABCD', 'נקודה E על AB', 'CE=5.2'];

describe('#345 — displayability requires the figure to satisfy its own commands', () => {
  it('a seed whose committed step is over-constrained is NOT displayable', () => {
    const facts = factsOf(SQUARE_CE);
    const dist = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
      a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;

    let good = 0;
    let refusedAndHidden = 0;
    for (let seed = 0; seed < 8; seed++) {
      const fig = replay(facts, seed);
      const allOk = facts.every((f) => !f.enabled || fig.status[f.id] === 'ok');
      const displayable = meetsRequirements(facts, seed);

      // THE invariant: never displayable while a committed step failed.
      expect(displayable && !allOk, `seed ${seed} must not be displayable with a failed step`).toBe(false);

      if (allOk) {
        good++;
        // a config whose steps all hold really does honour the stated size given
        expect(dist(fig.positions.get('C'), fig.positions.get('E')), `seed ${seed}: |CE| = 5.2`).toBeCloseTo(5.2, 2);
      } else {
        refusedAndHidden++;
        expect(displayable, `seed ${seed} is correctly hidden`).toBe(false);
      }
    }
    // the figure is genuinely seed-split — the test would be vacuous if every seed built
    expect(good, 'some seeds build correctly').toBeGreaterThan(0);
    expect(refusedAndHidden, 'and some fail — this figure is the reported seed-split').toBeGreaterThan(0);
  });

  it('a healthy figure is unaffected — every seed still displayable', () => {
    const facts = factsOf(['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37']);
    for (let seed = 0; seed < 4; seed++) {
      const fig = replay(facts, seed);
      if (facts.every((f) => !f.enabled || fig.status[f.id] === 'ok')) {
        expect(meetsRequirements(facts, seed), `seed ${seed} stays displayable`).toBe(true);
      }
    }
  });

  it('a DISABLED failing row does not make a config undisplayable (it is not part of the figure)', () => {
    const facts = factsOf(['ריבוע ABCD']);
    const withDisabled = [
      ...facts,
      // a fact that could never build, but switched off by the student
      { id: 'x.0', utterance: 'bogus', group: 'gX', cmd: { type: 'segment', a: 'Q', b: 'Z' }, enabled: false } as (typeof facts)[number],
    ];
    expect(meetsRequirements(withDisabled, 0)).toBe(meetsRequirements(facts, 0));
  });
});
