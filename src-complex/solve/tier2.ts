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
  /**
   * Scan for the other roots of a 1-D system (default true). The stage-3b census (#1427) turns it off:
   * it spreads its own starts over the whole box, and a scan per start is its cost, not its coverage.
   */
  readonly alternatives?: boolean;
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

  const alternatives = n === 1 && opts.alternatives !== false ? otherRoots(f, best.x[0], opts.bounds?.[0]) : [];
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

/** Central differences: the polish compares directions, so it needs the O(h²) error, not O(h). */
function central(f: (x: readonly number[]) => number[], x: readonly number[]): number[][] {
  const n = x.length;
  let out: number[][] | null = null;
  for (let j = 0; j < n; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(x[j]));
    const xp = [...x];
    const xm = [...x];
    xp[j] += h;
    xm[j] -= h;
    const rp = f(xp);
    const rm = f(xm);
    out ??= rp.map(() => new Array<number>(n).fill(0));
    for (let i = 0; i < rp.length; i++) out[i][j] = (rp[i] - rm[i]) / (2 * h);
  }
  return out ?? [];
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

/**
 * #2801/#2802 (ADR-CX-101, LADDER-CX stage 3c) — the point of a CONTINUUM nearest the sampled start.
 *
 * Where the givens leave a curve of solutions (a line, a circle), the descent above stops wherever its
 * path ends, and that path depends on the ROWS that describe the set, not on the set: the same line
 * typed in another spelling, or twice, moved the drawn point (#2801), and a locus could be drawn hundreds
 * of units off the canvas (#2802). The member drawn must be a function of (the set, the sampled start).
 *
 * From `x`, a point of the set (every residual within `TOL`), this walks the set towards the start,
 * every length measured in the DRAWN plane (through `pos`'s Jacobian), never in the solver's own
 * coordinates (a modulus and a degree are not commensurable):
 *  - a TANGENT step: the Gauss–Newton step on ½|pos − pos(x0)|², restricted to the null space of the
 *    residuals' Jacobian, its length chosen by a one-step quadratic fit (on a circle the plain step
 *    overshoots by the curvature term, and the walk would only oscillate inwards);
 *  - a CORRECTION back onto the set: the least drawn displacement that zeroes the linearised residuals.
 * A step is kept only when it lands on the set and nearer the start; the walk stops when the tangent
 * component is negligible.
 *
 * Returns the polished point, or `null` when it could not keep every residual within tolerance — the
 * caller then keeps the descent's own endpoint, which is the old answer.
 */
export function nearestOnSet(
  f: (x: readonly number[]) => number[],
  pos: (x: readonly number[]) => number[],
  x: readonly number[],
  x0: readonly number[],
  bounds?: readonly Bound[],
  maxIterations = 40,
): number[] | null {
  const n = x.length;
  if (n === 0) return null;
  const onSet = (r: readonly number[]): boolean => r.every((v) => Math.abs(v) <= TOL);
  const p0 = pos(x0);
  const dist2 = (p: readonly number[]): number => p.reduce((a, v, i) => a + (v - p0[i]) ** 2, 0);
  const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * b[i], 0);
  const dist2Between = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  const ridge = (M: number[][], rel: number): number[][] => {
    const eps = rel * Math.max(1e-12, ...M.map((row, i) => Math.abs(row[i])));
    return M.map((row, a) => row.map((v, b) => (a === b ? v + eps : v)));
  };

  /**
   * The residual rows that constrain independently — Gram–Schmidt, keeping a row only when it adds a
   * direction. Two rows of ONE set («Re(z) = 2» and «|z − 1| = |z − 3|») are parallel up to differencing
   * error, and solving for both at once would amplify that error into a wild step.
   */
  const independent = (J: readonly (readonly number[])[]): { rows: number[]; basis: number[][] } => {
    const rowScale = Math.max(1e-300, ...J.map(norm));
    const basis: number[][] = [];
    const rows: number[] = [];
    J.forEach((row, i) => {
      const v = [...row];
      for (const q of basis) {
        const d = dot(q, v);
        for (let k = 0; k < n; k++) v[k] -= d * q[k];
      }
      const len = norm(v);
      if (len > 1e-9 && len > 1e-6 * rowScale) {
        basis.push(v.map((vk) => vk / len));
        rows.push(i);
      }
    });
    return { rows, basis };
  };

  /** back onto the set: the least DRAWN displacement δ with J·δ = −r, a handful of Newton steps */
  const correct = (
    start: readonly number[],
    at?: { readonly Jr: readonly (readonly number[])[]; readonly Jp: readonly (readonly number[])[] },
  ): number[] | null => {
    let y = [...start];
    /**
     * The step operator δ = −X·S⁻¹·r of the least drawn displacement, from Jacobians taken at ONE point and reused
     * (a chord Newton: the walk's steps are short, so the Jacobian of the point it stepped from serves), refreshed
     * only when an iteration stops halving the residual.
     */
    const operator = (JAll: readonly (readonly number[])[], Jp: readonly (readonly number[])[]) => {
      const keep = independent(JAll).rows;
      const J = keep.map((i) => JAll[i]);
      // W = JpᵀJp (+ a ridge: a coordinate the drawing does not see is the cheapest one to move)
      const W = ridge(
        Array.from({ length: n }, (_, a) => Array.from({ length: n }, (__, b) => Jp.reduce((s, row) => s + row[a] * row[b], 0))),
        1e-8,
      );
      // X = W⁻¹Jᵀ, column by column
      const X: number[][] = [];
      for (const row of J) {
        const col = solveDense(W.map((w) => [...w]), [...row]);
        if (!col) return null;
        X.push(col);
      }
      const S = ridge(
        Array.from({ length: J.length }, (_, a) => Array.from({ length: J.length }, (__, b) => dot(J[a], X[b]))),
        1e-12,
      );
      return { keep, X, S };
    };
    let op = at ? operator(at.Jr, at.Jp) : operator(central(f, y), central(pos, y));
    let refreshes = at ? 2 : 1;
    let lastNorm = Infinity;
    // one step past tolerance: the set is then met to rounding, so two descriptions of one set polish to one point,
    // not to two points within TOL of each other
    let met: number[] | null = null;
    for (let it = 0; it < 16; it++) {
      const rAll = f(y);
      if (onSet(rAll)) {
        if (met || norm(rAll) <= 1e-15) return y;
        met = y;
      } else if (met) return met;
      const rn = norm(rAll);
      if (rn > 0.5 * lastNorm && refreshes > 0) {
        op = operator(central(f, y), central(pos, y));
        refreshes--;
      }
      lastNorm = rn;
      if (!op) return null;
      const { keep, X, S } = op;
      const w = solveDense(S.map((row) => [...row]), keep.map((i) => -rAll[i]));
      if (!w) return null;
      y = clampAll(
        y.map((v, k) => v + w.reduce((s, wi, i) => s + wi * X[i][k], 0)),
        bounds,
      );
    }
    return onSet(f(y)) ? y : met;
  };

  const walk = (from: readonly number[]): number[] | null => {
    const first = onSet(f(from)) ? [...from] : correct(from);
    if (!first) return null;
    let cur: number[] = first;
    let curPos = pos(cur);
    let curD = dist2(curPos);
    for (let it = 0; it < maxIterations; it++) {
      const Jr = central(f, cur);
      const Jp = central(pos, cur);
      // an orthonormal basis of the constrained directions (the residual rows)
      const Q = independent(Jr).basis;
      const project = (v: readonly number[]): number[] => {
        const out = [...v];
        for (const q of Q) {
          const d = dot(q, out);
          for (let i = 0; i < n; i++) out[i] -= d * q[i];
        }
        return out;
      };
      // the tangent Gauss–Newton step on ½|pos − p0|², restricted to the null space
      const e = curPos.map((v, i) => v - p0[i]);
      const g = project(Array.from({ length: n }, (_, k) => Jp.reduce((s, row, i) => s + row[k] * e[i], 0)));
      // below this the step only chases the numeric Jacobian's noise (the line search then ends the walk)
      if (norm(g) <= 1e-12 * Math.max(1, Math.sqrt(curD))) break;
      const cols = Array.from({ length: n }, (_, k) => project(Array.from({ length: n }, (__, j) => (j === k ? 1 : 0))));
      const JpN = Jp.map((row) => cols.map((c) => dot(row, c)));
      const A = ridge(
        Array.from({ length: n }, (_, a) => Array.from({ length: n }, (__, b) => JpN.reduce((s, row) => s + row[a] * row[b], 0))),
        1e-10,
      );
      const y = solveDense(A, g.map((v) => -v));
      if (!y) break;
      const step = project(y);
      const at = (t: number): { x: number[]; p: number[]; d: number } | null => {
        const trial = correct(clampAll(cur.map((v, i) => v + t * step[i]), bounds), { Jr, Jp });
        if (!trial) return null;
        const p = pos(trial);
        return { x: trial, p, d: dist2(p) };
      };
      // the distance is flat to rounding near its minimum (|e|² with |e| ~ 1 resolves a move only down to ~1e-8), so a
      // step that does not raise it beyond rounding is kept and the gradient, not the distance, says when to stop
      const flat = curD * (1 + 1e-12) + 1e-24;
      let best: { x: number[]; p: number[]; d: number } | null = null;
      for (let t = 1; t >= 1 / 16 && !best; t /= 2) {
        const c = at(t);
        if (c && c.d <= flat) best = c;
        // the quadratic through d(0), its slope 2·gᵀ·step and d(t): its minimum, when it is a better length
        if (c) {
          const slope = 2 * dot(g, step);
          const curv = (c.d - curD - slope * t) / (t * t);
          if (curv > 0) {
            const tq = Math.min(2 * t, -slope / (2 * curv));
            if (tq > 0 && Math.abs(tq - t) > 1e-3 * t) {
              const q = at(tq);
              if (q && q.d <= flat && (!best || q.d < best.d)) best = q;
            }
          }
        }
      }
      // near the nearest point the distance changes only quadratically: a step that does not move it up is
      // kept, and the walk ends when the drawing stops moving
      if (!best || best.d > flat) break;
      const moved = Math.sqrt(dist2Between(best.p, curPos));
      ({ x: cur, p: curPos, d: curD } = best);
      if (moved <= 1e-13 * Math.max(1, Math.sqrt(curD))) break;
    }
    return onSet(f(cur)) ? cur : null;
  };
  /**
   * From the start itself, projected onto the set, and from the solve's own point only when that fails. An end on a
   * SINGULAR point of the set is no answer: at the crossing of «Im(z²) = 0»'s two axes every residual is flat (its
   * gradient in the drawn plane vanishes), so a whole disc around the crossing is "on the set" within `TOL`, a
   * projection from near the diagonal converges into it, and the walk cannot leave it. Such an end — its drawn gradient
   * a thousandth of the solve's own point's — is refused; with neither end usable, `null`, and the caller keeps the
   * solve's own point.
   */
  const drawnGradient = (y: readonly number[]): number => {
    const Jr = central(f, y);
    const Jp = central(pos, y);
    const W = ridge(
      Array.from({ length: n }, (_, a) => Array.from({ length: n }, (__, b) => Jp.reduce((s2, row) => s2 + row[a] * row[b], 0))),
      1e-8,
    );
    // |G|² = trace(Jr·W⁻¹·Jrᵀ), G the residuals' gradient in the drawn plane
    let t = 0;
    for (const row of Jr) {
      const col = solveDense(W.map((w) => [...w]), [...row]);
      if (!col) return 0;
      t += dot(row, col);
    }
    return Math.sqrt(Math.max(0, t));
  };
  const regular = drawnGradient(x);
  for (const from of [x0, x]) {
    const end = walk(from);
    if (end && drawnGradient(end) >= 1e-3 * regular) return end;
  }
  return null;
}
