/**
 * #2731 ([ADR-AG-451](../../docs/06c-decisions-analytic.md#adr-ag-451)) — THE ROOTS OF A DETERMINED BLOCK ARE LISTED BY
 * DEFLATED DESCENT (`engine/pinRoots.ts` `enumerateBlockRoots`). A unit test of the listing alone, on hand-written residual
 * systems with the figure solve's own descent (`solveLM`): the figure is locked by the fixtures
 * (`exam-2021-special-q1-parabola-2731`, `exam-2023b-q1-four-circles-2731`) and `issue-2731-determined-roots.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_ROUNDS, BLOCK_STARTS, enumerateBlockRoots, type BlockRootSearch } from '../engine/pinRoots';
import { solveLM } from '../engine/solve';

const solve: BlockRootSearch['solve'] = (x0, f) => {
  const r = solveLM(x0, f, 120);
  return { values: r.values, ok: r.ok };
};
const plain = (span: number) => (a: readonly number[], b: readonly number[], i: number) => (a[i] - b[i]) / span;
const search = (over: Partial<BlockRootSearch> & Pick<BlockRootSearch, 'anchor' | 'residuals'>): BlockRootSearch => ({
  solve,
  admit: () => true,
  delta: plain(20),
  same: 1e-6,
  cap: 5,
  ...over,
});
const rounded = (xs: number[][]) => xs.map((x) => x.map((v) => Math.round(v * 1e6) / 1e6));

/** The parabola block: K = (x, 12) on y² = 4px with KF = 20 — x = 36/p, x + p = 20. Roots p = 2 (K 18) and p = 18 (K 2). */
const parabola = (x: number[]) => {
  const [kx, ky, p] = x;
  return [ky * ky - 4 * p * kx, ky - 12, Math.hypot(kx - p, ky) - 20];
};
/** A centre tangent to both axes and to 4x + 3y = 60: |x| = r, |y| = r, |4x + 3y − 60| / 5 = r. Four circles. */
const fourCircles = (x: number[]) => {
  const [mx, my, r] = x;
  return [Math.abs(mx) - r, Math.abs(my) - r, Math.abs(4 * mx + 3 * my - 60) / 5 - r];
};

describe('#2731 — enumerateBlockRoots', () => {
  it('lists every root of the parabola block, the anchor first', () => {
    const out = enumerateBlockRoots(search({ anchor: [18, 12, 2], residuals: parabola, admit: (x) => x[2] > 0 }));
    const admitted = out.roots.filter((_, i) => out.admitted[i]);
    expect(rounded(out.roots)[0]).toEqual([18, 12, 2]);
    expect(rounded(admitted).map((x) => x[2]).sort((a, b) => a - b)).toEqual([2, 18]);
  });

  it('lists all four circles', () => {
    const out = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles, admit: (x) => x[2] > 0 }));
    const centres = rounded(out.roots.filter((_, i) => out.admitted[i])).map((x) => `${x[0]},${x[1]}`);
    expect(centres.sort()).toEqual(['-15,15', '10,-10', '30,30', '5,5']);
  });

  it('a root the judge rejects is listed unadmitted and deflated, so a root past it is still reached', () => {
    // only x < 0 admitted: (−15, 15) is the one circle, reached past the three the judge rejects
    const out = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles, admit: (x) => x[0] < 0 && x[2] > 0 }));
    expect(out.admitted[0]).toBe(false);
    expect(rounded(out.roots.filter((_, i) => out.admitted[i]))).toEqual([[-15, 15, 15]]);
    expect(out.roots.length).toBeGreaterThan(2);
  });

  it('the domain filter: a negative parameter is a root, never an admitted one', () => {
    const out = enumerateBlockRoots(search({ anchor: [18, 12, 2], residuals: parabola, admit: (x) => x[2] > 0 }));
    out.roots.forEach((x, i) => expect(out.admitted[i], x.join(',')).toBe(x[2] > 0));
  });

  it('a direction compares mod π: θ and θ + π are one root', () => {
    // a line through the origin at angle θ that passes through (1, 1): the residual vanishes at θ = π/4 and 5π/4
    const line = (x: number[]) => [Math.sin(x[0]) - Math.cos(x[0])];
    const period = (a: readonly number[], b: readonly number[], i: number) => {
      const d = ((((a[i] - b[i]) % Math.PI) + 1.5 * Math.PI) % Math.PI) - Math.PI / 2;
      return d / Math.PI;
    };
    const withPeriod = enumerateBlockRoots(search({ anchor: [Math.PI / 4], residuals: line, delta: period }));
    expect(withPeriod.roots).toHaveLength(1);
    const without = enumerateBlockRoots(search({ anchor: [Math.PI / 4], residuals: line, delta: plain(1) }));
    expect(without.roots.length).toBeGreaterThan(1);
  });

  it('the cap bounds the list, the anchor included', () => {
    const out = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles, cap: 2 }));
    expect(out.roots).toHaveLength(2);
  });

  it('a lone root lists only the anchor, and the work is bounded by the starts and rounds', () => {
    const line = (x: number[]) => [x[0] - 3, x[1] + 1];
    const out = enumerateBlockRoots(search({ anchor: [3, -1], residuals: line }));
    expect(out.roots).toHaveLength(1);
    expect(out.solves).toBe(2 * BLOCK_STARTS);
    const big = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles }));
    expect(big.solves).toBeLessThanOrEqual(2 * BLOCK_STARTS * BLOCK_ROUNDS);
  });

  it('deterministic: the same input lists the same roots in the same order', () => {
    const a = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles }));
    const b = enumerateBlockRoots(search({ anchor: [5, 5, 5], residuals: fourCircles }));
    expect(b).toEqual(a);
  });
});
