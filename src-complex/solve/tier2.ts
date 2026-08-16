/**
 * TIER 2 — the numeric residue (stage 3 of [docs/LADDER-CX.md](../../docs/LADDER-CX.md)).
 *
 * Tier 1 solves the multiplicative core exactly and leaves a small free basis behind — typically 0–3
 * dimensions. Everything that is *not* multiplicative lands here: sums and differences, distances,
 * perimeters, areas, arithmetic sequences. There is no closed form for the modulus of a sum, so this
 * tier is iterative — but it iterates over the **handful of dimensions tier 1 could not remove**,
 * never over the whole figure. That is the difference from the C0 prototype, which iterated per fact
 * over everything and diverged on #607.
 *
 * ## The contract, and why it is exactly three things
 *
 * A constraint contributes `refs`, a signed scalar `residual` that is zero exactly when satisfied, and
 * a `describe` for the refusal — and the solver never changes.
 * [ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §3 makes that non-negotiable: the 2-D
 * tree's per-constraint solving grew a six-case recruiter that is still open after two months, because
 * every new constraint type could teach the solver a new trick. Here a constraint may only *report*.
 *
 * ## Honesty is a stage, not a hope
 *
 * A best-effort minimiser that stops near a solution will report success if nobody asks it to prove
 * otherwise. So `solveResiduals` returns the final residual vector and the caller re-verifies every
 * constraint against the final values (stage 3e). A residual that did not reach tolerance is
 * **reported**, never rounded away — for this product that is the difference between "the figure is
 * one configuration of many" and "the figure quietly violates a given the student stated".
 */

/** How much a constraint is allowed to cost. A satisfied preference costs zero (ADR-276). */
export type Strength = 'required' | 'preference' | 'visual';

/** A residual is satisfied when its absolute value is under this. */
export const TOL = 1e-9;

export interface Bound {
  /** inclusive lower bound, or undefined for unbounded */
  readonly lo?: number;
  readonly hi?: number;
}

export interface Tier2Options {
  /** per-coordinate bounds — a free direction inside a quadrant is genuinely bounded */
  readonly bounds?: readonly Bound[];
  readonly maxIterations?: number;
  /** how many jittered restarts to try when the first descent stalls */
  readonly restarts?: number;
}

export interface Tier2Result {
  readonly x: readonly number[];
  readonly residuals: readonly number[];
  /** every residual reached tolerance — the ONLY thing that counts as solved */
  readonly solved: boolean;
  readonly iterations: number;
  /**
   * Further exact solutions found in the one-dimensional case, nearest-first.
   *
   * A single free degree of freedom with one residual is a root-finding problem, and the exam's
   * «כל האפשרויות» wants *all* of them. Ordered by nearness to the starting value so that adding a
   * constraint moves the figure as little as it can — the stability rule, which is a first-class
   * regression in every sibling tree.
   */
  readonly alternatives: readonly (readonly number[])[];
}

const norm = (v: readonly number[]): number => Math.sqrt(v.reduce((a, x) => a + x * x, 0));

const clampTo = (x: number, b: Bound | undefined): number => {
  if (!b) return x;
  return Math.min(b.hi ?? Infinity, Math.max(b.lo ?? -Infinity, x));
};

const clampAll = (x: readonly number[], bounds: readonly Bound[] | undefined): number[] =>
  x.map((v, i) => clampTo(v, bounds?.[i]));

/**
 * Solve `f(x) = 0` in the least-squares sense — Levenberg–Marquardt with a numeric Jacobian.
 *
 * LM rather than plain Gauss–Newton because the corpus's residuals are not close to linear (an area is
 * quadratic in the coordinates, a distance is a square root) and Gauss–Newton overshoots badly on
 * exactly those. The damping is what makes a bad step cheap instead of divergent, which matters here
 * more than speed: this runs on every keystroke.
 */
export function solveResiduals(
  f: (x: readonly number[]) => number[],
  x0: readonly number[],
  opts: Tier2Options = {},
): Tier2Result {
  const n = x0.length;
  const maxIterations = opts.maxIterations ?? 120;
  const restarts = opts.restarts ?? 4;

  if (n === 0) {
    const r = f([]);
    return { x: [], residuals: r, solved: r.every((v) => Math.abs(v) <= TOL), iterations: 0, alternatives: [] };
  }

  let best = descend(f, clampAll(x0, opts.bounds), opts, maxIterations);

  // Multi-start. A stalled descent is usually a bad basin rather than an unsatisfiable system, and a
  // deterministic jitter keeps the retry reproducible — a solver that finds the answer only sometimes
  // is worse than one that never does, because the failure is unreportable.
  for (let k = 1; k <= restarts && !best.solved; k++) {
    const start = clampAll(
      x0.map((v, i) => v * (1 + 0.37 * jitter(k, i)) + 0.61 * jitter(k, i + n)),
      opts.bounds,
    );
    const attempt = descend(f, start, opts, maxIterations);
    if (norm(attempt.residuals) < norm(best.residuals)) best = attempt;
  }

  const alternatives = n === 1 ? otherRoots(f, best.x[0], opts.bounds?.[0]) : [];
  return { ...best, alternatives };
}

/** A deterministic pseudo-jitter in (−1, 1). Reproducibility is the point; randomness is not. */
function jitter(a: number, b: number): number {
  let h = 2166136261;
  for (const ch of `${a}:${b}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

function descend(
  f: (x: readonly number[]) => number[],
  start: readonly number[],
  opts: Tier2Options,
  maxIterations: number,
): { x: number[]; residuals: number[]; solved: boolean; iterations: number } {
  const n = start.length;
  let x = [...start];
  let r = f(x);
  let lambda = 1e-3;
  let iterations = 0;

  for (; iterations < maxIterations; iterations++) {
    if (r.every((v) => Math.abs(v) <= TOL)) break;
    const J = jacobian(f, x, r);
    const m = r.length;

    // normal equations: (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀ r
    const JtJ: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const Jtr = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < n; a++) {
        Jtr[a] += J[i][a] * r[i];
        for (let b = 0; b < n; b++) JtJ[a][b] += J[i][a] * J[i][b];
      }
    }
    const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
    const delta = solveDense(A, Jtr.map((v) => -v));
    if (!delta) break; // singular: this basin has nothing more to give

    const trial = clampAll(x.map((v, i) => v + delta[i]), opts.bounds);
    const rt = f(trial);
    if (norm(rt) < norm(r)) {
      x = trial;
      r = rt;
      lambda = Math.max(lambda / 3, 1e-12);
    } else {
      lambda *= 5;
      if (lambda > 1e10) break;
    }
  }

  return { x, residuals: r, solved: r.every((v) => Math.abs(v) <= TOL), iterations };
}

/** Forward differences with a step scaled to the coordinate — the residuals have no analytic form. */
function jacobian(
  f: (x: readonly number[]) => number[],
  x: readonly number[],
  r0: readonly number[],
): number[][] {
  const n = x.length;
  const out: number[][] = r0.map(() => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = 1e-7 * Math.max(1, Math.abs(x[j]));
    const xp = [...x];
    xp[j] += h;
    const rp = f(xp);
    for (let i = 0; i < r0.length; i++) out[i][j] = (rp[i] - r0[i]) / h;
  }
  return out;
}

/** Dense Gaussian elimination with partial pivoting. `n` is the free-basis size — small by design. */
function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[pivot][col])) pivot = i;
    if (Math.abs(M[pivot][col]) < 1e-14) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let i = col + 1; i < n; i++) {
      const factor = M[i][col] / M[col][col];
      for (let j = col; j <= n; j++) M[i][j] -= factor * M[col][j];
    }
  }
  const out = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let acc = M[i][n];
    for (let j = i + 1; j < n; j++) acc -= M[i][j] * out[j];
    out[i] = acc / M[i][i];
  }
  return out.every(Number.isFinite) ? out : null;
}

/**
 * Every root of a ONE-dimensional residual, nearest to `around` first.
 *
 * Scans the bounded range for sign changes and bisects each bracket. A scan can only find roots it
 * steps over, so this is a floor on the alternatives rather than a proof of completeness — which is
 * why the count it feeds is presented as configurations found, never as "there are exactly N".
 */
function otherRoots(
  f: (x: readonly number[]) => number[],
  around: number,
  bound: Bound | undefined,
): number[][] {
  const lo = bound?.lo ?? around - 50;
  const hi = bound?.hi ?? around + 50;
  if (!(hi > lo)) return [];
  const STEPS = 400;
  const g = (v: number): number => {
    const r = f([v]);
    return r.length === 1 ? r[0] : norm(r);
  };

  const roots: number[] = [];
  let prevX = lo;
  let prevY = g(lo);
  for (let i = 0; i <= STEPS; i++) {
    const cx = lo + ((hi - lo) * i) / STEPS;
    const cy = g(cx);
    // A root sitting EXACTLY on a scan node never produces a sign change, so a test for `prev*cur < 0`
    // alone walks straight past it — and an exam's answers are integers, which is precisely where the
    // nodes of a regular scan land. Checking for the zero itself is not an edge case here, it is the
    // common case.
    if (Math.abs(cy) <= TOL) roots.push(cx);
    else if (i > 0 && Number.isFinite(prevY) && Number.isFinite(cy) && prevY * cy < 0) {
      roots.push(bisect(g, prevX, cx));
    }
    prevX = cx;
    prevY = cy;
  }

  const distinct: number[] = [];
  for (const r of roots) if (!distinct.some((d) => Math.abs(d - r) < 1e-6)) distinct.push(r);

  return distinct
    .filter((r) => Math.abs(r - around) > 1e-6)
    .sort((a, b) => Math.abs(a - around) - Math.abs(b - around))
    .map((r) => [r]);
}

function bisect(g: (v: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  let fa = g(a);
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2;
    const fm = g(mid);
    if (fa * fm <= 0) b = mid;
    else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
