/**
 * Characterization + capability tests for the LM least-squares module (`solveLM.ts`) —
 * the S3.2 stage (b) numerics enabler (docs/25-joint-solve-design.md §4): the 3-D
 * pivot solver's Levenberg–Marquardt pattern ported into the 2-D engine so joint
 * component solving can go past the ~6–8 DOF ceiling where Nelder–Mead stalls
 * (ADR-281). The 10-DOF truss test demonstrates exactly that gap: a reference NM
 * with a much larger evaluation budget fails to reach the precision LM hits.
 *
 * Pure math throughout — no engine imports, no store, no parser.
 */

import { describe, it, expect } from 'vitest';
import { solveLM, solveLMMultiStart } from '../solveLM';

// ── shared helpers (pure, deterministic) ──────────────────────────────────────

const hypot = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

/**
 * Reference textbook Nelder–Mead (α=1, γ=2, ρ=½, σ=½) over a scalar cost — the
 * baseline the engine's driven solvers ride today. Deterministic; used ONLY to
 * demonstrate the high-DOF gap LM closes.
 */
function nelderMead(f: (x: number[]) => number, x0: number[], step: number, maxIter: number): { x: number[]; cost: number } {
  const n = x0.length;
  let simplex: number[][] = [x0.slice(), ...x0.map((_, j) => x0.map((v, i) => (i === j ? v + step : v)))];
  let costs = simplex.map(f);
  for (let iter = 0; iter < maxIter; iter++) {
    const order = costs.map((_, i) => i).sort((a, b) => costs[a] - costs[b]);
    simplex = order.map((i) => simplex[i]);
    costs = order.map((i) => costs[i]);
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const refl = centroid.map((c, j) => c + (c - worst[j]));
    const fr = f(refl);
    if (fr < costs[0]) {
      const exp = centroid.map((c, j) => c + 2 * (c - worst[j]));
      const fe = f(exp);
      if (fe < fr) { simplex[n] = exp; costs[n] = fe; } else { simplex[n] = refl; costs[n] = fr; }
    } else if (fr < costs[n - 1]) {
      simplex[n] = refl;
      costs[n] = fr;
    } else {
      const con = centroid.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(con);
      if (fc < costs[n]) { simplex[n] = con; costs[n] = fc; }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); costs[i] = f(simplex[i]); }
    }
  }
  let bi = 0;
  for (let i = 1; i <= n; i++) if (costs[i] < costs[bi]) bi = i;
  return { x: simplex[bi], cost: costs[bi] };
}

/**
 * A minimally-rigid 10-DOF planar truss (5 points, 7 triangulated bars, 3 gauge
 * anchors): the synthetic stand-in for a joint component solve — points coupled by
 * pairwise distances, exactly the residual shape docs/25 targets. Solution:
 * P0(0,0) P1(2,0) P2(4,0) P3(1,2) P4(3,2).
 */
const TRUSS_TARGET = [0, 0, 2, 0, 4, 0, 1, 2, 3, 2];
const TRUSS_BARS: [number, number, number][] = [
  [0, 1, 2], [1, 2, 2], [3, 4, 2],                                     // chords
  [0, 3, Math.sqrt(5)], [3, 1, Math.sqrt(5)], [1, 4, Math.sqrt(5)], [4, 2, Math.sqrt(5)], // diagonals
];
const trussResiduals = (x: number[]): number[] => {
  const out: number[] = [x[0], x[1], x[3]]; // gauge anchors: P0 = (0,0), P1.y = 0
  for (const [i, j, d] of TRUSS_BARS) out.push(hypot(x[2 * i], x[2 * i + 1], x[2 * j], x[2 * j + 1]) - d);
  return out;
};
/** Deterministic ~0.5-magnitude perturbation of the target — the "perturbed seed". */
const TRUSS_SEED = TRUSS_TARGET.map((v, i) => v + 0.5 * Math.sin(1 + 3 * i));

const rosenbrock = (x: number[]): number[] => [10 * (x[1] - x[0] * x[0]), 1 - x[0]];

// ── convergence characterization ──────────────────────────────────────────────

describe('solveLM convergence', () => {
  it('solves a linear least-squares system exactly', () => {
    // r = A·x − b with a known unique solution x* = (1, −2, 3)
    const A = [
      [3, 1, 0],
      [1, 4, 1],
      [0, 2, 5],
    ];
    const xStar = [1, -2, 3];
    const b = A.map((row) => row[0] * xStar[0] + row[1] * xStar[1] + row[2] * xStar[2]);
    const r = (x: number[]) => A.map((row, i) => row[0] * x[0] + row[1] * x[1] + row[2] * x[2] - b[i]);
    const res = solveLM(r, [0, 0, 0]);
    expect(res.converged).toBe(true);
    expect(res.cost).toBeLessThan(1e-18);
    for (let i = 0; i < 3; i++) expect(res.x[i]).toBeCloseTo(xStar[i], 8);
  });

  it('finds the bottom of a quadratic bowl', () => {
    // cost = (x−2)² + 10·(y+1)² as residuals [x−2, √10·(y+1)]
    const r = (x: number[]) => [x[0] - 2, Math.sqrt(10) * (x[1] + 1)];
    const res = solveLM(r, [50, -30]);
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(2, 8);
    expect(res.x[1]).toBeCloseTo(-1, 8);
  });

  it('solves a nonlinear system (circle ∩ line)', () => {
    // x² + y² = 25, x − y = 1 → (4, 3) from a nearby seed
    const r = (x: number[]) => [x[0] * x[0] + x[1] * x[1] - 25, x[0] - x[1] - 1];
    const res = solveLM(r, [5, 2]);
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(4, 8);
    expect(res.x[1]).toBeCloseTo(3, 8);
  });

  it('cracks Rosenbrock-2D from the classic (−1.2, 1) start within a locked budget', () => {
    const res = solveLM(rosenbrock, [-1.2, 1]);
    expect(res.converged).toBe(true);
    expect(res.cost).toBeLessThan(1e-18);
    expect(res.x[0]).toBeCloseTo(1, 8);
    expect(res.x[1]).toBeCloseTo(1, 8);
    // characterization lock: the curved-valley classic stays well inside the budget
    expect(res.iterations).toBeLessThanOrEqual(60);
    // and still converges under an explicitly tightened budget
    expect(solveLM(rosenbrock, [-1.2, 1], { maxIter: 60 }).converged).toBe(true);
  });
});

// ── the high-DOF case (the reason for LM, ADR-281 / docs/25 §4) ───────────────

describe('solveLM at 10 DOF (rigid truss)', () => {
  it('converges from a perturbed seed where reference Nelder–Mead stalls', () => {
    const lm = solveLM(trussResiduals, TRUSS_SEED);
    expect(lm.converged).toBe(true);
    expect(lm.cost).toBeLessThan(1e-20); // measured 8.6e-27
    expect(lm.iterations).toBeLessThanOrEqual(20); // measured 5 — a deliberate characterization lock
    // the figure is genuinely recovered: every bar at its length, anchors exact
    for (const [i, j, d] of TRUSS_BARS) {
      expect(hypot(lm.x[2 * i], lm.x[2 * i + 1], lm.x[2 * j], lm.x[2 * j + 1])).toBeCloseTo(d, 7);
    }
    expect(lm.x[0]).toBeCloseTo(0, 7);
    expect(lm.x[1]).toBeCloseTo(0, 7);
    expect(lm.x[3]).toBeCloseTo(0, 7);

    // The ADR-281 gap, demonstrated at COMPARABLE budgets: LM solved this in 5
    // iterations ≈ 106 residual evaluations; textbook NM over the same cost and seed,
    // given ~5× that evaluation budget (400 iterations ≈ 588 evals), is still at
    // ~2.3e-4 — >20 orders of magnitude short. (Honesty note: NM does eventually
    // crack this smooth 10-DOF system at ~20× LM's budget; the gap is cost, and it
    // widens with DOF — this is the measured motivation for the port, not a claim NM
    // can never converge.)
    const nm = nelderMead((x) => trussResiduals(x).reduce((s, v) => s + v * v, 0), TRUSS_SEED, 0.5, 400);
    expect(nm.cost).toBeGreaterThan(1e-6); // measured 2.3e-4 at this budget
    expect(nm.cost).toBeGreaterThan(lm.cost * 1e15);
  });

  it('handles a 12-DOF extension (6th point riding two more bars)', () => {
    // add P5 at (5, 2): bars 2–5 (len √5) and 4–5 (len 2) — still rigid, 12 residuals / 12 DOF
    const target = [...TRUSS_TARGET, 5, 2];
    const r = (x: number[]) => [
      ...trussResiduals(x),
      hypot(x[4], x[5], x[10], x[11]) - Math.sqrt(5),
      hypot(x[8], x[9], x[10], x[11]) - 2,
    ];
    const seed = target.map((v, i) => v + 0.45 * Math.cos(2 + 2 * i));
    const res = solveLM(r, seed);
    expect(res.converged).toBe(true);
    expect(res.cost).toBeLessThan(1e-16);
    expect(res.x[10]).toBeCloseTo(5, 6);
    expect(res.x[11]).toBeCloseTo(2, 6);
  });
});

// ── determinism ───────────────────────────────────────────────────────────────

describe('solveLM determinism', () => {
  it('same inputs → bit-identical output', () => {
    const a = solveLM(trussResiduals, TRUSS_SEED);
    const b = solveLM(trussResiduals, TRUSS_SEED);
    expect(b).toEqual(a);
    for (let i = 0; i < a.x.length; i++) expect(Object.is(a.x[i], b.x[i])).toBe(true);
    expect(Object.is(a.cost, b.cost)).toBe(true);
  });

  it('a unit scale vector is bit-identical to no scale', () => {
    const plain = solveLM(rosenbrock, [-1.2, 1]);
    const scaled = solveLM(rosenbrock, [-1.2, 1], { scale: [1, 1] });
    expect(scaled).toEqual(plain);
  });

  it('multi-start is deterministic and first-success-wins on ties', () => {
    const r = (x: number[]) => [x[0] * x[0] - 4]; // roots ±2, equally good
    const res = solveLMMultiStart(r, [[3], [-3]]);
    expect(res.converged).toBe(true);
    expect(res.seedIndex).toBe(0); // the first converged seed is kept
    expect(res.x[0]).toBeCloseTo(2, 8);
    const again = solveLMMultiStart(r, [[3], [-3]]);
    expect(again).toEqual(res);
  });
});

// ── per-dimension scaling (the CarrierSpec.scale discipline) ──────────────────

describe('solveLM scaling', () => {
  it('solves an ill-scaled system when given per-dimension scales', () => {
    // unknowns live at wildly different magnitudes: x* = 1000, y* = 0.001
    // (a = x/1000, b = 1000·y: a² + b = 2, a = b ⇒ a = b = 1)
    const r = (x: number[]) => [(x[0] / 1000) * (x[0] / 1000) + 1000 * x[1] - 2, x[0] / 1000 - 1000 * x[1]];
    const res = solveLM(r, [600, 0.002], { scale: [1000, 0.001] });
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(1000, 6);
    expect(res.x[1]).toBeCloseTo(0.001, 9);
  });

  it('mixes an angle (radians) with a world coordinate', () => {
    // P rides a circle of radius 100 at angle θ; d is a world offset:
    // require P.x = 100·cos(π/3), P.y = 100·sin(π/3), d = P.x + 40
    const r = (x: number[]) => [
      100 * Math.cos(x[0]) - 100 * Math.cos(Math.PI / 3),
      100 * Math.sin(x[0]) - 100 * Math.sin(Math.PI / 3),
      x[1] - (100 * Math.cos(x[0]) + 40),
    ];
    const res = solveLM(r, [0.2, 10], { scale: [1, 100] });
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(Math.PI / 3, 8);
    expect(res.x[1]).toBeCloseTo(90, 6);
  });
});

// ── the regulariser is tie-break scale ────────────────────────────────────────

describe('solveLM regularization', () => {
  it('picks the manifold point nearest the seed without degrading the residual', () => {
    // one residual, two DOF → a whole circle of solutions (radius 5); the regularised
    // solve must land near the point of the circle NEAREST the seed, still solved
    // exactly (the search-then-pure-polish two-phase). The PLAIN solve demonstrates
    // why the pull matters: its rank-deficient damped steps wander along the manifold
    // (measured landing y ≈ 0.009 from a seed at y = 0.5).
    const r = (x: number[]) => [x[0] * x[0] + x[1] * x[1] - 25];
    const seed = [6, 0.5];
    const len = Math.hypot(seed[0], seed[1]);
    const nearest = [5 * (seed[0] / len), 5 * (seed[1] / len)]; // ≈ (4.9827, 0.4152)
    const distToNearest = (x: number[]) => Math.hypot(x[0] - nearest[0], x[1] - nearest[1]);
    const regd = solveLM(r, seed, { regularize: { weight: 1e-3, toward: seed } });
    expect(regd.converged).toBe(true); // tie-break scale: the primary residual still zeroes…
    expect(regd.cost).toBeLessThan(1e-20); // measured 2.9e-25 — the polish landed ON the manifold
    expect(distToNearest(regd.x)).toBeLessThan(0.05); // …at (nearly) the seed's projection (measured 0.033)
    const plain = solveLM(r, seed);
    expect(plain.converged).toBe(true);
    expect(distToNearest(regd.x)).toBeLessThan(distToNearest(plain.x)); // the pull strictly improves proximity
  });

  it('does not move the solution of a well-determined system', () => {
    const r = (x: number[]) => [x[0] * x[0] + x[1] * x[1] - 25, x[0] - x[1] - 1];
    const plain = solveLM(r, [5, 2]);
    const regd = solveLM(r, [5, 2], { regularize: { weight: 1e-4, toward: [5, 2] } });
    expect(regd.converged).toBe(true);
    expect(regd.x[0]).toBeCloseTo(plain.x[0], 6);
    expect(regd.x[1]).toBeCloseTo(plain.x[1], 6);
  });
});

// ── multi-start rescue + honest non-convergence ───────────────────────────────

describe('solveLMMultiStart rescue', () => {
  it('rescues a seed stuck at a zero-gradient point', () => {
    const r = (x: number[]) => [x[0] * x[0] - 4];
    // seed 0 sits exactly on the zero-gradient hump between the two roots — LM alone is stuck
    expect(solveLM(r, [0]).converged).toBe(false);
    const res = solveLMMultiStart(r, [[0], [3]]);
    expect(res.converged).toBe(true);
    expect(res.seedIndex).toBe(1);
    expect(res.x[0]).toBeCloseTo(2, 8);
  });

  it('returns the best non-converged result when no seed solves', () => {
    const r = (x: number[]) => [x[0] - 1, x[0] + 1]; // inconsistent — best is x = 0, cost 2
    const res = solveLMMultiStart(r, [[10], [-10]]);
    expect(res.converged).toBe(false);
    expect(res.cost).toBeCloseTo(2, 8);
  });
});

describe('solveLM honesty on impossible systems', () => {
  it('reports converged:false on an inconsistent linear system', () => {
    const r = (x: number[]) => [x[0] - 1, x[0] + 1];
    const res = solveLM(r, [7]);
    expect(res.converged).toBe(false);
    expect(res.cost).toBeCloseTo(2, 6);
    expect(isFinite(res.x[0])).toBe(true); // settles at the least-squares point, never blows up
    expect(res.x[0]).toBeCloseTo(0, 6);
  });

  it('reports converged:false on a geometrically impossible figure', () => {
    // one point P with |P − (0,0)| = 5 AND |P − (1,0)| = 10 — impossible: ||PA|−|PB|| ≤ 1
    const r = (x: number[]) => [Math.hypot(x[0], x[1]) - 5, Math.hypot(x[0] - 1, x[1]) - 10];
    const res = solveLM(r, [3, 4]);
    expect(res.converged).toBe(false);
    expect(res.cost).toBeGreaterThan(1); // the honest residual floor, not a fake solve
  });

  it('rejects non-finite excursions instead of poisoning the solve', () => {
    // sqrt goes NaN for x < 1; the solution x = 5 requires stepping through valid territory
    const r = (x: number[]) => [Math.sqrt(x[0] - 1) - 2];
    const res = solveLM(r, [2]);
    expect(res.converged).toBe(true);
    expect(res.x[0]).toBeCloseTo(5, 8);
  });
});
