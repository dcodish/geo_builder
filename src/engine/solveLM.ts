/**
 * Levenberg–Marquardt least-squares — the 2-D engine's port of the 3-D pivot solver's
 * numeric core (`src3d/engine/solve3.ts` `leastSquares`, V4/ADR-3D-007). COPIED, never
 * imported: product trees are isolated (docs/20 §12, enforced by
 * `server/__tests__/isolation.test.ts`).
 *
 * Why it exists (docs/25-joint-solve-design.md §4, S3.2 stage (b)): the engine's driven
 * solvers ride Nelder–Mead, which stalls past ~6–8 DOF (ADR-281); LM's damped
 * Gauss–Newton steps converge quadratically near a root and handle the 8–12+ DOF joint
 * component solves the design calls for. This module is the standalone numerics slice —
 * integration into `evaluate.ts` is a separate step; nothing here imports engine state.
 *
 * Deliberate adaptations over the solve3 pattern (each keeps its philosophy):
 *  - **Per-dimension `scale`** — the solve runs in normalised u-space (`x = u∘scale`),
 *    the `CarrierSpec.scale` idea from `resolveMixedCarriers`: radians, on-segment t's
 *    and world coordinates mix as O(1) unknowns. solve3 didn't need it because its
 *    unknowns (translation, axis-angle, logScale, dims) were already O(1) — the same
 *    property scaling manufactures here, so its absolute damping floor carries over.
 *  - **Soft regularisation toward a target** (usually the seed) as APPENDED residual
 *    rows — solve3's `invariantOnly` REG pattern — followed by a PURE-primary polish
 *    pass, the 2-D driven solvers' own discipline (`multiStartSolve`: regularised
 *    search picks the manifold point, "then polish on the pure residual … so the
 *    result lands ON the constraint"). Without the pull, rank-deficient LM steps
 *    wander along a solution manifold (measured: a circle-manifold solve drifted its
 *    free coordinate 0.5 → 0.009); with pull alone, the primary cost floors at the
 *    reg equilibrium ~(weight·pull)². The two phases give BOTH: near-seed choice and
 *    exact residual zeroing — tie-break scale, never competing. Reported `cost` and
 *    `converged` are PRIMARY-only (solve3's "acceptance stays on the PRIMARY
 *    residuals").
 *  - **Explicit `converged`** — solve3 returned a raw `err` and each call site applied
 *    its own acceptance threshold; here the module owns it (`cost <= tol`), because in
 *    the 2-D engine "converged" means "the constraints actually hold", and an honest
 *    `false` on an impossible system is the over-constraint signal.
 *  - **Non-finite guards** — 2-D residuals typically run through `evaluateCore`, which
 *    can legitimately fail mid-search (Infinity cost in the NM solvers); a non-finite
 *    trial is a rejected step, never a poisoned Jacobian.
 *
 * PURE and deterministic: no Math.random, no Date.now, fixed iteration budgets, zero
 * imports. Same inputs ⇒ bit-identical outputs.
 */

export interface SolveLMOptions {
  /** Iteration budget (default 200 — solve3 used 120; joint 2-D solves run higher-DOF). */
  maxIter?: number;
  /** Initial damping λ (default 1e-3, solve3's value). */
  lambda0?: number;
  /**
   * Acceptance threshold on the PRIMARY cost Σr² for `converged` (default 1e-12).
   * LM polishes an exactly-solvable system far below this (~1e-24); a genuinely
   * inconsistent system floors well above it — the honest `converged:false`.
   */
  tol?: number;
  /**
   * Per-dimension normalising scales (default all 1). The solve runs on u = x/scale,
   * so heterogeneous DOFs (a coordinate ~100, an angle ~1 rad, a ratio ~0.5) all step
   * and damp as O(1) unknowns — the CarrierSpec.scale discipline.
   */
  scale?: number[];
  /**
   * Soft pull toward `toward` (usually the seed): appends `weight·(u_j − toward_j/scale_j)`
   * residual rows during the search, then polishes on the pure primary residuals from
   * the point the pull chose. Tie-break scale ONLY (weight ~1e-3): on a solution
   * manifold it picks the point nearest `toward`, and the polish still zeroes the
   * primary residuals exactly — it never degrades convergence judgement.
   */
  regularize?: { weight: number; toward: number[] };
}

export interface SolveLMResult {
  x: number[];
  /** Σ primary-residual² at x (the regulariser rows are excluded). */
  cost: number;
  /** cost <= tol — "the system is actually solved", not "the iteration stopped". */
  converged: boolean;
  /** Iterations executed, both phases included (informational — characterization/perf). */
  iterations: number;
}

export interface SolveLMMultiStartResult extends SolveLMResult {
  /** Index into `seeds` of the returned solution (first-success-wins on ties). */
  seedIndex: number;
}

const sumSq = (r: number[]): number => {
  let s = 0;
  for (const v of r) s += v * v;
  return s;
};

/**
 * The damped-Gauss–Newton core (solve3's `leastSquares` loop, u-space): central-difference
 * Jacobian, adaptive λ (×10 on a failed step, ÷3 on success), machine-exact / stalled-step /
 * damping-exhausted exits. Returns the last ACCEPTED point (never a rejected trial).
 */
function lmCore(
  fn: (u: number[]) => number[],
  u0: number[],
  maxIter: number,
  lambda0: number,
): { u: number[]; r: number[]; err: number; iters: number } {
  const n = u0.length;
  let u = u0.slice();
  let r = fn(u);
  let err = sumSq(r);
  let iters = 0;
  if (!isFinite(err)) return { u, r, err, iters }; // nothing to descend from
  let lambda = lambda0;
  for (let iter = 0; iter < maxIter; iter++) {
    iters = iter + 1;
    // numeric Jacobian (central differences) in u-space: J[j][k] = ∂r_k/∂u_j
    const m = r.length;
    const J: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(u[j]));
      const up = u.slice();
      const um = u.slice();
      up[j] += h;
      um[j] -= h;
      const rp = fn(up);
      const rm = fn(um);
      const col: number[] = new Array<number>(m);
      let finite = true;
      for (let k = 0; k < m; k++) {
        const d = (rp[k] - rm[k]) / (2 * h);
        if (!isFinite(d)) {
          finite = false;
          break;
        }
        col[k] = d;
      }
      // a probe that left the residuals' domain contributes no direction this iteration
      // (the damping floor keeps the normal equations solvable); never a poisoned matrix
      J.push(finite ? col : new Array<number>(m).fill(0));
    }
    // normal equations (JᵀJ + λ·diag) δ = −Jᵀr
    const A: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      A.push([]);
      let bi = 0;
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < m; k++) s += J[i][k] * J[j][k];
        A[i].push(s);
      }
      for (let k = 0; k < m; k++) bi -= J[i][k] * r[k];
      b.push(bi);
    }
    // damping floor is ABSOLUTE: a noise-tiny diagonal (an invariant direction's
    // cancellation residue, ~1e-20) must not be its own damping scale — λ·1e-20
    // admits ~1e10 steps along pure noise, blowing coordinates into catastrophic-
    // cancellation territory (the "numeric-Jacobian floor" class, solve3.ts). The
    // u-space normalisation makes every unknown O(1) here, so a unit floor is sound.
    for (let i = 0; i < n; i++) A[i][i] += lambda * Math.max(A[i][i], 1);
    const delta = solveLinear(A, b);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e12) break; // no usable descent direction — stuck
      continue;
    }
    const uNew = u.map((v, i) => v + delta[i]);
    const rNew = fn(uNew);
    const errNew = sumSq(rNew);
    if (isFinite(errNew) && errNew < err) {
      u = uNew;
      r = rNew;
      err = errNew;
      lambda = Math.max(lambda / 3, 1e-12);
      if (err < 1e-24) break; // machine-exact
      if (sumSq(delta) < 1e-30) break; // step stalled — at a (local) minimum
    } else {
      lambda *= 10;
      if (lambda > 1e12) break; // damping exhausted — a local minimum (or inconsistent system)
    }
  }
  return { u, r, err, iters };
}

/**
 * Solve min ‖r(x)‖² by Levenberg–Marquardt with a central-difference Jacobian.
 * Small-to-medium n (the joint-solve range, ≲ 20), tiny residual functions — exactness
 * comes from the quadratic convergence near the solution, polished to ~1e-12 per residual.
 */
export function solveLM(
  residuals: (x: number[]) => number[],
  seed: number[],
  opts: SolveLMOptions = {},
): SolveLMResult {
  const maxIter = opts.maxIter ?? 200;
  const lambda0 = opts.lambda0 ?? 1e-3;
  const tol = opts.tol ?? 1e-12;
  const n = seed.length;
  const scale = opts.scale ?? new Array<number>(n).fill(1);
  if (scale.length !== n) throw new Error(`solveLM: scale length ${scale.length} !== seed length ${n}`);
  for (const s of scale) {
    if (!(s > 0) || !isFinite(s)) throw new Error('solveLM: every scale entry must be a positive finite number');
  }
  const reg = opts.regularize;
  if (reg && reg.toward.length !== n) {
    throw new Error(`solveLM: regularize.toward length ${reg.toward.length} !== seed length ${n}`);
  }
  const towardU = reg ? reg.toward.map((v, i) => v / scale[i]) : null;

  const toX = (u: number[]): number[] => u.map((v, i) => v * scale[i]);
  const rPrimary = (u: number[]): number[] => residuals(toX(u));
  /** Primary residuals followed by the regulariser rows (identical to rPrimary when none). */
  const rAug = (u: number[]): number[] => {
    const r = rPrimary(u);
    if (!towardU) return r;
    const out = r.slice();
    for (let i = 0; i < n; i++) out.push(reg!.weight * (u[i] - towardU[i]));
    return out;
  };

  const u0 = seed.map((v, i) => v / scale[i]);
  const rSeed = residuals(seed);
  if (n === 0 || rSeed.length === 0) {
    const cost = sumSq(rSeed);
    return { x: seed.slice(), cost, converged: isFinite(cost) && cost <= tol, iterations: 0 };
  }

  // Phase 1: the (possibly regularised) search — picks the basin / manifold point.
  const search = lmCore(rAug, u0, maxIter, lambda0);
  let final = search;
  let iterations = search.iters;
  if (towardU) {
    // Phase 2: pure-primary polish from the point the pull chose (the multiStartSolve
    // discipline). From a near-manifold point the accepted steps are ~residual-sized,
    // so the polish zeroes the residuals without wandering back along the manifold;
    // it only ever accepts primary improvements, so it cannot degrade the search.
    const polish = lmCore(rPrimary, search.u, Math.min(50, maxIter), lambda0);
    final = polish;
    iterations += polish.iters;
  }
  // `final.r` is primary in both branches: without reg, rAug ≡ rPrimary; with reg, the
  // polish phase ran on rPrimary.
  const cost = sumSq(final.r);
  return { x: toX(final.u), cost, converged: isFinite(cost) && cost <= tol, iterations };
}

/**
 * Try each seed in order and return the best result — a CONVERGED one always beats a
 * non-converged one; among equals, strictly lower cost wins, so the FIRST equally-good
 * seed is kept (first-success-wins, deterministic). Stops early on a machine-exact
 * solution (cost < 1e-24 — nothing can beat it), the solve3 multi-start discipline.
 */
export function solveLMMultiStart(
  residuals: (x: number[]) => number[],
  seeds: number[][],
  opts: SolveLMOptions = {},
): SolveLMMultiStartResult {
  if (seeds.length === 0) throw new Error('solveLMMultiStart: at least one seed is required');
  let best: SolveLMResult | null = null;
  let bestIndex = 0;
  for (let i = 0; i < seeds.length; i++) {
    const res = solveLM(residuals, seeds[i], opts);
    if (
      best === null ||
      (res.converged && !best.converged) ||
      (res.converged === best.converged && res.cost < best.cost)
    ) {
      best = res;
      bestIndex = i;
    }
    if (best.converged && best.cost < 1e-24) break;
  }
  if (best === null) throw new Error('solveLMMultiStart: unreachable — seeds was non-empty');
  return { ...best, seedIndex: bestIndex };
}

/** Gaussian elimination with partial pivoting; null when singular. (solve3.ts verbatim.) */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}
