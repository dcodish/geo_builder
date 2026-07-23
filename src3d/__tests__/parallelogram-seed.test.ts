/**
 * #291: free parallelogram-base solids must NOT seed near 90° — a `מקבילית` base
 * that renders as a rectangle silently asserts a right angle the student never gave
 * (ADR-052: a default must not look like a special case). The base's 2nd edge is
 * AD=(dx,dy) with AB=(1,0); ∠DAB = atan2(dy,dx). dx is sampled strictly positive and
 * bounded away from 0, so EVERY seed (incl. the default seed 0) is visibly oblique,
 * while dx/dy stay genuinely free DOFs that "show another configuration" varies.
 */
import { describe, expect, it } from 'vitest';
import { solidDims } from '../engine/evaluate';
import type { SolidKind } from '../engine/types';

const baseAngle = (kind: SolidKind, seed: number): number => {
  const dims = solidDims(kind, `solid-${kind}-ABCDA'B'C'D'`, seed);
  const [dx, dy] = dims; // AD = (dx, dy); AB = (1,0)
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const PARALLELOGRAM_SOLIDS: SolidKind[] = ['prism4', 'pyramidPar', 'parallelepiped'];

describe('#291 — parallelogram-base solids seed visibly oblique', () => {
  for (const kind of PARALLELOGRAM_SOLIDS) {
    it(`${kind}: base angle is clearly non-right at every seed (incl. default seed 0)`, () => {
      for (let seed = 0; seed < 12; seed++) {
        const ang = baseAngle(kind, seed);
        expect(ang, `${kind} seed ${seed} = ${ang.toFixed(1)}°`).toBeGreaterThan(38);
        expect(ang, `${kind} seed ${seed} = ${ang.toFixed(1)}°`).toBeLessThan(82);
      }
    });

    it(`${kind}: the base angle still VARIES across seeds (a genuine free DOF)`, () => {
      const angles = Array.from({ length: 12 }, (_, s) => baseAngle(kind, s));
      const spread = Math.max(...angles) - Math.min(...angles);
      expect(spread, `${kind} angle spread = ${spread.toFixed(1)}°`).toBeGreaterThan(8);
    });
  }

  it('the OLD default seed 0 was near-right (regression guard) — now it is not', () => {
    // prism4 previously seeded ∠DAB ≈ 85.6° at seed 0 (dx∈[-0.4,0.5]); confirm the fix moved it away.
    expect(baseAngle('prism4', 0)).toBeLessThan(80);
    expect(baseAngle('pyramidPar', 0)).toBeLessThan(80);
    expect(baseAngle('parallelepiped', 0)).toBeLessThan(80);
  });
});
