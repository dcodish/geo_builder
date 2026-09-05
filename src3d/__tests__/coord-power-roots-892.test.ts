/**
 * #892 (ADR-3D-214, amended) — A SQUARED PARAMETER HAS NO BRANCH SET TO CYCLE, AND THAT IS MEASURED.
 *
 * ADR-3D-214 left the question open ("still open, deliberately"): does a pinned `p²` cycle both roots?
 * The measurement says it does not need to, because there is never a pair of genuinely different
 * drawings to choose between:
 *
 *  - when the letter appears ONLY squared, `p = ±2` place the point identically — the figure only ever
 *    reads `p²`, so there is nothing for «הציגו תצורה אחרת» to show;
 *  - when it ALSO appears at degree 1, the data DETERMINES the sign, and the solver reaches the
 *    negative root correctly.
 *
 * These are the locks the operator's 2026-09-05 ruling asked for. The second is the valuable one: it
 * is the only thing standing between the negative root and a silent regression.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';

const state = () => useGeo3.getState();
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) state().submit(u);
  return { st: state(), ...derive3(state().facts, state().seed) };
};
const BOX = "תיבה ABCDA'B'C'D'";
const SEEDS = [0, 1, 2, 3, 7, 1013];

describe('#892 — a pinned p² has no roots to cycle', () => {
  beforeEach(() => state().clear());

  it('the letter appears ONLY squared: both roots are the SAME drawing, at every seed', () => {
    const { st, construction } = build([BOX, 'A(0,0,0)', 'B(4,0,0)', 'D(0,1,0)', 'C(p²,1,0)']);
    expect(st.lastError).toBeNull();
    // the box forces C = (4,1,0), so p² = 4 and p = ±2 — and both place C here
    for (const seed of SEEDS) {
      const { positions } = resolve3(construction, seed);
      const c = positions.get('C')!;
      expect(c.x, `seed ${seed}`).toBeCloseTo(4, 4);
      expect(c.y, `seed ${seed}`).toBeCloseTo(1, 4);
      expect(c.z, `seed ${seed}`).toBeCloseTo(0, 4);
    }
  });

  it('the letter ALSO at degree 1: the data determines the sign, and the NEGATIVE root is reached', () => {
    const { st, construction } = build([BOX, 'A(0,0,0)', 'B(4,0,0)', 'D(0,-2,0)', 'C(p²,p,0)']);
    expect(st.lastError).toBeNull();
    for (const seed of [0, 7, 1013]) {
      const { positions } = resolve3(construction, seed);
      const c = positions.get('C')!;
      expect(c.x, `seed ${seed}: p² = 4`).toBeCloseTo(4, 4);
      expect(c.y, `seed ${seed}: p = −2, not +2`).toBeCloseTo(-2, 4);
    }
  });

  it('and the POSITIVE root when the data says so — the sign is read, not assumed', () => {
    const { st, construction } = build([BOX, 'A(0,0,0)', 'B(4,0,0)', 'D(0,2,0)', 'C(p²,p,0)']);
    expect(st.lastError).toBeNull();
    for (const seed of [0, 7, 1013]) {
      const { positions } = resolve3(construction, seed);
      const c = positions.get('C')!;
      expect(c.x, `seed ${seed}`).toBeCloseTo(4, 4);
      expect(c.y, `seed ${seed}`).toBeCloseTo(2, 4);
    }
  });
});
