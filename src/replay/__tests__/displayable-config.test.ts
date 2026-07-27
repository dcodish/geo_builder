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
 * `common-tangent-two-circles`, seeds 0–1 land |O2M| = 16 while seeds 2–3 leave it at ~2.9 / ~1.25 with
 * the step refused — and all four were called displayable.
 *
 * This is the cross-seed escape class (ADR-085/098/127/166) one level up: not a requirement the sampler
 * forgot, but the step statuses themselves.
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay } from '@/store/geoStore';

/** The ADR-239 / ADR-230 two-tangent-circles figure — the reported instance. */
const TWO_TANGENT_CIRCLES = [
  'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
  'AB משיק משותף לשני המעגלים',
  'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
  'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A',
  'A נמצאת על המשך BN',
  'O1M=9',
  'O2M=16',
];

describe('#345 — displayability requires the figure to satisfy its own commands', () => {
  it('a seed whose committed step is over-constrained is NOT displayable', () => {
    const facts = factsOf(TWO_TANGENT_CIRCLES);
    const dist = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
      a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;

    let good = 0;
    let refusedAndHidden = 0;
    for (let seed = 0; seed < 4; seed++) {
      const fig = replay(facts, seed);
      const allOk = facts.every((f) => !f.enabled || fig.status[f.id] === 'ok');
      const displayable = meetsRequirements(facts, seed);

      // THE invariant: never displayable while a committed step failed.
      expect(displayable && !allOk, `seed ${seed} must not be displayable with a failed step`).toBe(false);

      if (allOk) {
        good++;
        // a displayable config really does honour the stated size given
        expect(dist(fig.positions.get('O2'), fig.positions.get('M')), `seed ${seed}: |O2M| = 16`).toBeCloseTo(16, 2);
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
