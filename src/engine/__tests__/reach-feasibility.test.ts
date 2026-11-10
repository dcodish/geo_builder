/**
 * #2797 / ADR-817 — a stated distance a RIDING point cannot reach is refused, never parked as "waiting for givens".
 *
 * «מחומש ABCDE · AB = 5 · BC = 4 · ∠ABC = 100° · CD = 4 · ∠BCD = 110° · ∠CDE = 100°» fixes A–D and leaves E riding
 * the ray from D (|DE| unstated). E comes no closer to A than 2.11 in any configuration, so «EA = 1» holds in none.
 * Once the driven solver samples the rider (ADR-816's LM rung) the flex probe sees |EA| move and would call the
 * line pending; this prover answers first.
 *
 * One-way sound, so the tests come in pairs: the impossible reach is proven; a reachable one, and every figure the
 * frame cannot enumerate, proves nothing.
 */
import { describe, expect, it } from 'vitest';
import { reachImpossibility } from '../reachFeasibility';
import type { Constraint } from '../types';

const d = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });
const ang = (ray1: string, vertex: string, ray2: string, value: number): Constraint => ({ type: 'angle', vertex, ray1, ray2, value });

/** P3's first six givens: A, B, C, D rigid; E rides the ray from D. */
const P3 = [d('A', 'B', 5), d('B', 'C', 4), ang('A', 'B', 'C', 100), d('C', 'D', 4), ang('B', 'C', 'D', 110), ang('C', 'D', 'E', 100)];

describe('reachImpossibility — the pure prover', () => {
  it('proves «EA = 1» out of reach: E rides the ray from D and comes no closer to A than 2.11', () => {
    const m = reachImpossibility([...P3, d('E', 'A', 1)]);
    expect(m).not.toBeNull();
    expect([m!.p, m!.q]).toEqual(['E', 'A']);
    expect(m!.value).toBe(1);
    expect(m!.lo).toBeCloseTo(2.109, 2); // the closest any configuration (all four reflections) brings E to A
    expect(m!.hi).toBe(Infinity);
  });

  it('proves nothing for a reachable closing side (EA = 4.5, the issue; EA = 2.2, just past the bound)', () => {
    expect(reachImpossibility([...P3, d('E', 'A', 4.5)])).toBeNull();
    expect(reachImpossibility([...P3, d('E', 'A', 2.2)])).toBeNull();
  });

  it('is read in either spelling of the angle (ray order) and of the side (endpoint order)', () => {
    const flipped = [d('B', 'A', 5), d('C', 'B', 4), ang('C', 'B', 'A', 100), d('D', 'C', 4), ang('D', 'C', 'B', 110), ang('E', 'D', 'C', 100)];
    expect(reachImpossibility([...flipped, d('A', 'E', 1)])).not.toBeNull();
  });

  it('a CIRCLE rider: a point a pinned distance from a frame point reaches only between the two circle distances', () => {
    // A, B, C a rigid 3-4-5 triangle; P rides the circle of radius 1 about C, so |PA| ∈ [|CA| − 1, |CA| + 1] = [2, 4]
    const tri = [d('A', 'B', 4), d('B', 'C', 3), d('A', 'C', 3), d('C', 'P', 1)];
    expect(reachImpossibility([...tri, d('P', 'A', 5)])).not.toBeNull(); // past the far side
    expect(reachImpossibility([...tri, d('P', 'A', 1.5)])).not.toBeNull(); // short of the near side
    expect(reachImpossibility([...tri, d('P', 'A', 3)])).toBeNull();
  });

  it('a bound EQUAL to the reach is a real (degenerate-limit) configuration, never proven impossible', () => {
    const tri = [d('A', 'B', 4), d('B', 'C', 3), d('A', 'C', 3), d('C', 'P', 1)];
    expect(reachImpossibility([...tri, d('P', 'A', 4)])).toBeNull();
    expect(reachImpossibility([...tri, d('P', 'A', 2)])).toBeNull();
  });

  it('proves nothing when the frame cannot be enumerated: a free rider with no locus, or nothing rigid at all', () => {
    // E is unconstrained apart from the target — it rides nothing
    expect(reachImpossibility([d('A', 'B', 5), d('B', 'C', 4), ang('A', 'B', 'C', 100), d('E', 'A', 1)])).toBeNull();
    // one pinned distance only
    expect(reachImpossibility([d('A', 'B', 5), ang('A', 'B', 'C', 100)])).toBeNull();
  });

  it('a frame whose own givens contradict each other is the ladder’s over-constraint, not this prover’s', () => {
    // A–B–C rigid by AB · BC · ∠ABC = 90°, then «∠BAC = 10°» (it is ~53°): every branch of that frame is dropped, so
    // the rider P (on rays from C) is judged against no configuration and nothing is proven
    expect(reachImpossibility([d('A', 'B', 3), d('B', 'C', 4), ang('A', 'B', 'C', 90), ang('B', 'A', 'C', 10), ang('B', 'C', 'P', 30), d('P', 'A', 0.1)])).toBeNull();
  });

  it('each target is judged against the frame of the OTHER givens (it never places its own rider)', () => {
    // |AB| = 3 against the frame B–C plus A on a ray from B and on the circle |AC| = 9: |AB| ≥ 9 − 4 = 5 — proven
    const m = reachImpossibility([d('A', 'B', 3), d('B', 'C', 4), ang('A', 'B', 'C', 90), d('A', 'C', 9)]);
    expect(m).not.toBeNull();
    expect(m!.value).toBe(3);
  });
});
