/**
 * CHARACTERIZATION locks for the untested numeric core of the 2-D engine
 * (slice S0.3 of docs/24-foundation-hardening-plan.md).
 *
 * These tests lock the CURRENT observed behaviour of the low-level numeric
 * primitives — `nelderMead`, `argMin`, `drivenRoots`, `multiStartSolve`,
 * `collapseBarrier` (evaluate.ts) and `solveParam` (geometry.ts) — so that a
 * numeric regression produces a LOCAL failure here instead of distant,
 * hard-to-diagnose scenario flakiness. They lock what the code DOES, not what
 * it ideally should do; quirks are locked deliberately and annotated. All the
 * functions are pure and deterministic, so the tolerances below are tight
 * (observed by running, not guessed) — do NOT loosen one to quiet a failure:
 * a failure here means the numeric core CHANGED, which is the signal.
 *
 * Known characterized quirks (findings, locked below — see the annotated tests):
 *  - `solveParam` (sign-change bisection) cannot see a touch-zero minimum —
 *    that is `drivenRoots`' reason to exist.
 *  - `drivenRoots` scans interior grid indices only (i = 1..steps-1), so a
 *    root AT the range boundary is never found.
 *  - `drivenRoots`' dedup epsilon (1e-3) is FINER than its default grid
 *    spacing (1/360 ≈ 2.78e-3), so a flat zero valley wider than one grid
 *    cell emits one "root" per interior grid zero (3 branches for one valley).
 *  - `drivenRoots`' accept threshold is `max(tol, 1e-6) * 10` — a floor of
 *    1e-5 even when the caller passes a tighter tol.
 *  - `argMin` over an everywhere-non-finite f returns the top of the FIRST
 *    grid cell (lo + (hi-lo)/steps), not `lo`.
 *  - `nelderMead` with iters=0 returns the best INITIAL simplex vertex, which
 *    is not necessarily x0.
 */
import { describe, it, expect } from 'vitest';
import { nelderMead, argMin, drivenRoots, multiStartSolve, collapseBarrier } from '../evaluate';
import { solveParam } from '../geometry';
import type { Construction, Constraint, Id, Vec } from '../types';

// ---------------------------------------------------------------------------
// solveParam (geometry.ts) — sign-change grid scan + 60-step bisection,
// default range [0,1] with 256 grid steps, root dedup epsilon 1e-7.
// ---------------------------------------------------------------------------
describe('solveParam — sign-change bisection root finder', () => {
  it('finds a simple sign-change root to ~machine precision', () => {
    const roots = solveParam((t) => t - 0.3);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(0.3, 12); // observed 0.29999999999999993
  });

  it('finds two roots, returned in ascending order', () => {
    const roots = solveParam((t) => (t - 0.25) * (t - 0.75));
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(0.25, 12);
    expect(roots[1]).toBeCloseTo(0.75, 12);
    expect(roots[0]).toBeLessThan(roots[1]);
  });

  it('an endpoint that is exactly a root is returned', () => {
    expect(solveParam((t) => t)).toEqual([0]);
  });

  it('a grid sample landing exactly on a root is returned', () => {
    // steps=2 → grid {0, 0.5, 1}; f(0.5) === 0 exactly.
    expect(solveParam((t) => t - 0.5, 0, 1, 2)).toEqual([0.5]);
  });

  it('no sign change → no roots', () => {
    expect(solveParam((t) => t * t + 1)).toEqual([]);
  });

  it('QUIRK (by design): a touch-zero minimum is INVISIBLE to sign-change bracketing', () => {
    // (t-0.3)^2 touches zero at 0.3 but never changes sign, and 0.3 is not on
    // the 256-step grid — solveParam returns []. drivenRoots exists for this.
    expect(solveParam((t) => (t - 0.3) * (t - 0.3))).toEqual([]);
  });

  it('an everywhere-NaN residual yields no roots', () => {
    expect(solveParam(() => NaN)).toEqual([]);
  });

  it('honours a custom [tMin, tMax] range', () => {
    const roots = solveParam((t) => t + 0.5, -1, 1, 128);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(-0.5, 12);
  });
});

// ---------------------------------------------------------------------------
// drivenRoots (evaluate.ts) — touch-zero root finder for a NON-NEGATIVE
// residual: grid scan (default 360 steps) for local minima, 80-step ternary
// refinement, accept when value < max(tol, 1e-6)*10, dedup epsilon 1e-3.
// ---------------------------------------------------------------------------
describe('drivenRoots — touch-zero minima of a non-negative residual', () => {
  it('finds the root of |t - 0.3| (a kink minimum)', () => {
    const roots = drivenRoots((t) => Math.abs(t - 0.3), 0, 1, 1e-9);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(0.3, 12); // observed 0.30000000000000004
  });

  it('finds a smooth touch-zero (t - 0.3)^2 that solveParam cannot see', () => {
    const roots = drivenRoots((t) => (t - 0.3) * (t - 0.3), 0, 1, 1e-9);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(0.3, 12);
  });

  it('finds two separated roots, ascending', () => {
    const roots = drivenRoots((t) => Math.abs((t - 0.2) * (t - 0.7)), 0, 1, 1e-9);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(0.2, 10);
    expect(roots[1]).toBeCloseTo(0.7, 10);
    expect(roots[0]).toBeLessThan(roots[1]);
  });

  it('two true roots closer than the grid/dedup resolution collapse to ONE branch', () => {
    // Roots at 0.4997 and 0.5003 (0.6e-3 apart) fall inside a single grid
    // bracket (spacing 1/360 ≈ 2.78e-3) → one refined root, landing on the
    // first of the pair.
    const roots = drivenRoots((t) => Math.abs((t - 0.4997) * (t - 0.5003)), 0, 1, 1e-9);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(0.4997, 12);
  });

  it('FINDING: a flat zero valley emits one root per interior grid zero (dedup 1e-3 < grid 2.78e-3)', () => {
    // f = max(0, |t-0.5| - 0.004) is zero on [0.496, 0.504]. Grid points
    // 179/360, 180/360, 181/360 all read 0 and each is a "local minimum";
    // the refined points are > 1e-3 apart, so the dedup keeps all three.
    // ONE geometric solution family reads as THREE branches. Locked as-is.
    const roots = drivenRoots((t) => Math.max(0, Math.abs(t - 0.5) - 0.004), 0, 1, 1e-9);
    expect(roots).toHaveLength(3);
    expect(roots[0]).toBeCloseTo(0.5, 10);
    expect(roots[1]).toBeCloseTo(0.5027777777777778, 10);
    expect(roots[2]).toBeCloseTo(0.504, 10);
  });

  it('FINDING: a root AT the range boundary is never found (interior-only scan)', () => {
    // f(t) = t has its zero exactly at lo=0, but the local-minimum scan runs
    // i = 1..steps-1, so the boundary minimum is unreachable → [].
    expect(drivenRoots((t) => t, 0, 1, 1e-9)).toEqual([]);
  });

  it('a constant positive residual has no roots', () => {
    expect(drivenRoots(() => 1, 0, 1, 1e-9)).toEqual([]);
  });

  it('an everywhere-NaN residual has no roots', () => {
    expect(drivenRoots(() => NaN, 0, 1, 1e-9)).toEqual([]);
  });

  it('accept threshold is max(tol, 1e-6)*10 — a minimum above it is rejected, below it accepted', () => {
    const f = (t: number) => (t - 0.5) * (t - 0.5) + 1e-4; // bottoms out at 1e-4
    // tol=1e-6 → threshold 1e-5 < 1e-4 → rejected.
    expect(drivenRoots(f, 0, 1, 1e-6)).toEqual([]);
    // tol=1e-4 → threshold 1e-3 > 1e-4 → accepted.
    const roots = drivenRoots(f, 0, 1, 1e-4);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(0.5, 9); // observed 0.5000000000823182
  });
});

// ---------------------------------------------------------------------------
// argMin (evaluate.ts) — grid scan (default 120 steps) for the basin, then
// 60-step ternary refinement inside the winning cell's ±1-cell window.
// ---------------------------------------------------------------------------
describe('argMin — grid + ternary arg-min', () => {
  it('finds the minimum of a quadratic', () => {
    expect(argMin((v) => (v - 0.3) * (v - 0.3), 0, 1)).toBeCloseTo(0.3, 10); // observed 0.3000000000000833
  });

  it('a monotone-decreasing f converges to the upper bound', () => {
    expect(argMin((v) => -v, 0, 1)).toBeCloseTo(1, 10); // observed 0.9999999999998868
  });

  it('skips non-finite samples and still finds the finite basin', () => {
    expect(argMin((v) => (v < 0 ? NaN : (v - 2) * (v - 2)), -5, 5)).toBeCloseTo(2, 10);
  });

  it('QUIRK: an everywhere-NaN f returns the top of the FIRST grid cell, not lo', () => {
    // bx stays at lo, but the refinement window is [lo, lo + (hi-lo)/steps]
    // and the all-Infinity ternary walks a up to b → returns ~1/120.
    expect(argMin(() => NaN, 0, 1)).toBeCloseTo(1 / 120, 9); // observed 0.008333333333220012
  });
});

// ---------------------------------------------------------------------------
// nelderMead (evaluate.ts) — regularised downhill simplex, defaults
// iters=300 / step=0.15, early exit when the best vertex < 1e-14.
// ---------------------------------------------------------------------------
describe('nelderMead — downhill simplex minimiser', () => {
  const bowl = (x: number[]) => (x[0] - 3) * (x[0] - 3) + (x[1] + 1) * (x[1] + 1);

  it('minimises a 2-D quadratic bowl from a nearby seed', () => {
    const x = nelderMead(bowl, [0, 0]);
    expect(x[0]).toBeCloseTo(3, 6); // observed 2.9999999648357116
    expect(x[1]).toBeCloseTo(-1, 6); // observed -0.9999999346752567
  });

  it('converges from a far seed within the default budget (expansion steps reach it)', () => {
    const x = nelderMead(bowl, [100, 100]);
    expect(x[0]).toBeCloseTo(3, 6);
    expect(x[1]).toBeCloseTo(-1, 6);
  });

  it('minimises in 1-D', () => {
    expect(nelderMead((x) => (x[0] - 2) * (x[0] - 2), [0])[0]).toBeCloseTo(2, 6);
  });

  it('a cost already at ~0 early-exits and returns x0 bit-identically (stable-sort tie)', () => {
    expect(nelderMead(() => 0, [7, 8])).toEqual([7, 8]);
  });

  it('QUIRK: iters=0 returns the best INITIAL simplex vertex, not necessarily x0', () => {
    // Simplex from x0=[0] with step 0.15 is {[0], [0.15]}; f=(x-1)^2 prefers [0.15].
    expect(nelderMead((x) => (x[0] - 1) * (x[0] - 1), [0], 0)).toEqual([0.15]);
  });

  it('is a LOCAL minimiser: stays in the seed basin of a two-basin cost', () => {
    // min(x^2 + 1, (x-10)^2): local min 1 at x=0, global 0 at x=10.
    // From seed 0 the simplex contracts onto the local minimum — this is the
    // behaviour multiStartSolve's restarts exist to compensate for.
    const twoBasin = (x: number[]) => Math.min(x[0] * x[0] + 1, (x[0] - 10) * (x[0] - 10));
    const x = nelderMead(twoBasin, [0], 400, 0.15);
    expect(x[0]).toBeCloseTo(0, 8); // observed exactly 0
    expect(Math.abs(x[0] - 10)).toBeGreaterThan(9); // never crossed to the global basin
  });
});

// ---------------------------------------------------------------------------
// multiStartSolve (evaluate.ts) — seed + cardinal restarts through nelderMead
// on the regularised cost, then a polish pass on the pure cost; returns the
// best accepted candidate, else the seed (honest over-constraint).
// ---------------------------------------------------------------------------
describe('multiStartSolve — multi-start search + polish + accept gate', () => {
  const twoBasin = (x: number[]) => Math.min(x[0] * x[0] + 1, (x[0] - 10) * (x[0] - 10));

  it('a restart rescues a seed trapped in a non-solution local basin', () => {
    // Plain nelderMead from [0] stays at the local min (locked above); the
    // [10.5] restart reaches the true root at x=10 and the accept gate keeps it.
    const acceptZero = (x: number[]) => twoBasin(x) < 1e-6;
    const best = multiStartSolve([0], [[10.5]], 0.15, twoBasin, twoBasin, [0.05, 0.005], 400, acceptZero);
    expect(best).toHaveLength(1);
    expect(best[0]).toBeCloseTo(10, 6); // observed 9.999999904632567
  });

  it('when nothing is accepted, returns the seed (same array reference)', () => {
    const seed = [1, 2];
    const out = multiStartSolve(seed, [], 0.15, twoBasin, twoBasin, [0.05], 100, () => false);
    expect(out).toBe(seed);
  });

  it('falls back to the best ACCEPTED candidate when the optimum itself is rejected', () => {
    // Cost pulls toward x=10 but accept only allows x < 5: the search/polish
    // results (~10) are rejected; the accepted restart start [4] (cost 36,
    // better than the seed's 100) is returned instead of the seed.
    const f10 = (x: number[]) => (x[0] - 10) * (x[0] - 10);
    const out = multiStartSolve([0], [[4]], 0.5, f10, f10, [0.05], 200, (x) => x[0] < 5);
    expect(out).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// collapseBarrier (evaluate.ts) — anti-collapse soft hinge over every pair of
// referenced/carrier points: margin m = 0.05 × extent (extent floored at 1),
// per-pair cost 0.5 × (1 − d/m) inside the margin, coincide-pairs exempt.
// ---------------------------------------------------------------------------
describe('collapseBarrier — anti-collapse hinge for the basin searches', () => {
  const c0: Construction = { objects: [], constraints: [] };
  const cons: Constraint[] = [{ type: 'distance', a: 'A', b: 'B', value: 5 }];
  const pos = (m: Record<string, Vec>) => new Map<Id, Vec>(Object.entries(m));

  it('is zero when every pair is outside the margin', () => {
    const barrier = collapseBarrier(c0, cons, ['C']);
    expect(barrier(pos({ A: { x: 0, y: 0 }, B: { x: 10, y: 0 }, C: { x: 5, y: 5 } }))).toBe(0);
  });

  it('charges the linear hinge inside the margin: extent 10 → m=0.5; d=0.2 → 0.5·(1−0.4)=0.3', () => {
    const barrier = collapseBarrier(c0, cons, ['C']);
    expect(barrier(pos({ A: { x: 0, y: 0 }, B: { x: 0.2, y: 0 }, C: { x: 10, y: 0 } }))).toBeCloseTo(0.3, 12);
  });

  it('exempts a declared-coincide pair (order-insensitive: p/q sorted)', () => {
    const cEx: Construction = { objects: [], constraints: [{ type: 'coincide', p: 'B', q: 'A' }] };
    const barrier = collapseBarrier(cEx, cons, ['C']);
    // Same near-collapse A/B as above, but the pair is intended to merge → 0.
    expect(barrier(pos({ A: { x: 0, y: 0 }, B: { x: 0.2, y: 0 }, C: { x: 10, y: 0 } }))).toBe(0);
  });

  it('floors the extent at 1, so a tiny figure still has margin 0.05', () => {
    const barrier = collapseBarrier(c0, cons, []);
    // d(A,B)=0.01 < m=0.05 → 0.5·(1−0.2)=0.4.
    expect(barrier(pos({ A: { x: 0, y: 0 }, B: { x: 0.01, y: 0 } }))).toBeCloseTo(0.4, 12);
  });

  it('skips pairs with a missing position — and the extent shrinks accordingly', () => {
    const barrier = collapseBarrier(c0, cons, ['C']);
    // Without C the extent floors at 1 → m=0.05, and d(A,B)=0.2 is now OUTSIDE
    // the margin (unlike the extent-10 case above) → 0.
    expect(barrier(pos({ A: { x: 0, y: 0 }, B: { x: 0.2, y: 0 } }))).toBe(0);
  });
});
