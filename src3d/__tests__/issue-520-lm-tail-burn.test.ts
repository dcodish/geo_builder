/**
 * #520 (ADR-3D-210) — the LM tail burn: a solve whose error FLOORS above the 1e-24 early exit used to
 * pay a full central-difference Jacobian (2n residual evaluations) for every rung of the damping ladder,
 * even though a REJECTED step leaves x — and therefore the Jacobian — untouched.
 *
 * This file locks both halves of the claim, because a perf fix that changes an answer is not a perf fix:
 *
 *  1. **The trajectory is unchanged.** Every recorded value below was measured on `main` BEFORE the fix
 *     (`ea49e00`) and re-measured after; they agreed to the last printed digit. The assertions are made
 *     at a tight relative tolerance rather than bit-exact so a last-ulp platform difference cannot turn
 *     a green suite red — a real change of trajectory is orders of magnitude larger than 1e-13.
 *  2. **The burn is gone.** The residual-call counts are the mechanism itself, and they are exact
 *     integers: nothing about them is timing-dependent, so this is a perf lock that cannot flake.
 */
import { describe, expect, it } from 'vitest';
import { leastSquares } from '../engine/solve3';

/** Each row: the problem, the values `main` produced before the fix, and the call counts either side. */
const BATTERY: {
  name: string;
  f: (x: number[]) => number[];
  x0: number[];
  err: number;
  x: number[];
  callsBefore: number;
  callsAfter: number;
}[] = [
  {
    name: 'floors above 1e-24 (the reported class) — inconsistent by construction',
    f: (x) => [x[0] - 1, x[0] - 1.0000001, x[1] - 2],
    x0: [0, 0],
    err: 5.00000000583867115e-15,
    x: [1.00000004999999992e0, 2.0],
    callsBefore: 116,
    callsAfter: 48,
  },
  {
    name: 'reaches zero — the early-exit path, which never had failed steps to waste',
    f: (x) => [x[0] - 1, x[1] - 2],
    x0: [0, 0],
    err: 8.87468518373638281e-30,
    x: [9.99999999999998668e-1, 1.99999999999999734e0],
    callsBefore: 21,
    callsAfter: 21,
  },
  {
    name: 'seven unknowns, floored — the anchored-lane shape (n is what makes the Jacobian expensive)',
    f: (x) => [...x.map((v, i) => v - i), x[0] - 0.5],
    x0: [0, 0, 0, 0, 0, 0, 0],
    err: 1.24999999999999986e-1,
    x: [2.49999999999965888e-1, 9.99999999999863554e-1, 1.99999999999972711e0, 2.99999999999959055e0, 3.99999999999945421e0, 4.99999999999931788e0, 5.99999999999918110e0],
    callsBefore: 316,
    callsAfter: 92,
  },
  {
    name: 'damping exhaustion with NO descent direction at all (a constant residual)',
    f: () => [1, 2, 3],
    x0: [0.5, -1, 2],
    err: 14,
    x: [0.5, -1, 2],
    callsBefore: 113,
    callsAfter: 23,
  },
  {
    name: 'Rosenbrock — a real curved path, so accepted steps dominate',
    f: (x) => [10 * (x[1] - x[0] * x[0]), 1 - x[0]],
    x0: [-1.2, 1],
    err: 9.07885224676889593e-27,
    x: [9.99999999999904743e-1, 9.99999999999809264e-1],
    callsBefore: 146,
    callsAfter: 118,
  },
  {
    name: 'over-determined, inconsistent — floors at the least-squares optimum',
    f: (x) => [x[0] + x[1] - 3, x[0] - x[1] - 1, 2 * x[0] + x[1] - 4.2],
    x0: [0, 0],
    err: 1.82857142857142552e-1,
    x: [1.77142857142583043e0, 8.85714285720894501e-1],
    callsBefore: 106,
    callsAfter: 42,
  },
];

const close = (got: number, want: number) =>
  Math.abs(got - want) <= 1e-13 * Math.max(1, Math.abs(want));

describe('#520 — the tail burn is gone and the answers are not', () => {
  for (const p of BATTERY) {
    it(`${p.name}: same answer`, () => {
      const r = leastSquares(p.f, p.x0);
      expect(close(r.err, p.err), `err ${r.err.toExponential(17)} vs ${p.err.toExponential(17)}`).toBe(true);
      expect(r.x.length).toBe(p.x.length);
      r.x.forEach((v, i) => {
        expect(close(v, p.x[i]), `x[${i}] ${v.toExponential(17)} vs ${p.x[i].toExponential(17)}`).toBe(true);
      });
    });

    it(`${p.name}: ${p.callsBefore} → ${p.callsAfter} residual evaluations`, () => {
      let calls = 0;
      const counted = (x: number[]) => {
        calls++;
        return p.f(x);
      };
      leastSquares(counted, p.x0);
      // Exact, not a ceiling: the count IS the mechanism, and a change to it is a change to the loop
      // that must be looked at rather than absorbed.
      expect(calls, `was ${p.callsBefore} before the fix`).toBe(p.callsAfter);
    });
  }

  it('the damping ladder still ends — a hopeless solve returns its start, it does not spin', () => {
    // The `!delta` (singular at this damping) path used to grow λ without a ceiling, so a system
    // singular at every rung ran the full iteration cap. It now bails at the same 1e12 λ the rejected-
    // step path uses. x cannot have moved on that path, so the RESULT is identical either way.
    let calls = 0;
    const r = leastSquares((x) => { calls++; return [1, 2, 3]; }, [0.5, -1, 2]);
    expect(r.x).toEqual([0.5, -1, 2]);
    expect(r.err).toBe(14);
    expect(calls, 'and it costs one Jacobian, not one per rung').toBeLessThan(30);
  });

  it('the iteration budget is still honoured — a long descent is not cut short', () => {
    // The cache must not let a solve exit early: Rosenbrock needs many ACCEPTED steps, each of which
    // invalidates the Jacobian, and it must still converge to (1,1).
    const r = leastSquares((x) => [10 * (x[1] - x[0] * x[0]), 1 - x[0]], [-1.2, 1]);
    expect(r.err).toBeLessThan(1e-20);
    expect(r.x[0]).toBeCloseTo(1, 10);
    expect(r.x[1]).toBeCloseTo(1, 10);
  });
});
