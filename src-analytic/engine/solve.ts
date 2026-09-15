/**
 * The constraint layer and its solve ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009)
 * B2, issue #1016).
 *
 * **What a constraint is.** Three things, and only these grow as new kinds land: which points it
 * references, a `residual` that is zero exactly when it holds, and how to name it. The solver below
 * never learns about a constraint kind — it minimises whatever residuals it is handed, over whatever
 * carriers the construction declares. That split is copied from `src/engine/solve.ts`
 * ([ADR-012](../../docs/06-decisions.md#adr-012)), never imported
 * ([ADR-AG-012](../../docs/06c-decisions-analytic.md#adr-ag-012)).
 *
 * **Why a joint solve rather than a root-find.** [02c R5](../../docs/02c-requirements-analytic.md)
 * tiers the cost, and the corpus lands in tier 3: image 7 #6 has four unknowns (`B` and `C` unplaced)
 * against four equations — the median's foot at `(0,3)` gives two, the area one, `B` on the x-axis
 * one. A 1-DOF root-find cannot reach it. Measured before building, which is why this exists.
 *
 * **NO CAS.** Residuals are evaluated numerically and the minimiser is numerical
 * ([ADR-AG-001](../../docs/06c-decisions-analytic.md#adr-ag-001) D1). Nothing here simplifies, solves
 * or rearranges symbolically; there is no expression in this module that is not immediately evaluated.
 *
 * **A failure is honest.** When no assignment satisfies the constraints the figure does NOT quietly
 * show the least-bad one: `solve` reports that it did not converge, and the caller says so. A drawn
 * figure that violates its own givens is the defect this whole product is built to avoid.
 */
import { evalExpr, type Env } from './expr';
import type { Id } from './types';
import {
  describeLengthExpr,
  evalLengthExpr,
  lengthRefs,
  type LengthExpr,
} from './lengths';
import type { Pt } from './derived';
import type { Expr } from './expr';

/**
 * A statement that must hold, expressed as a residual.
 *
 * Each member carries the ids it constrains so the solver knows which carriers can move to satisfy
 * it, and so a constraint naming a point that vanished can be reported rather than silently skipped.
 */
/**
 * One of the four things in this grammar that HAS a direction (#1052).
 *
 * This is the whole design of the relation vocabulary. «DE מקביל ל-BF», «הצלע AB מקבילה לצלע DC»,
 * «AB מקביל לציר ה-x» and «הישר l1 מקביל לישר l2» are not four rules — they are one relation with a
 * RESOLVER in front of it. The relation never learns what kind of thing it was handed, so any of the
 * four operands against any of the four is sixteen sentences and one implementation.
 *
 * Getting this seam right is also why [#1049](https://github.com/dcodish/geo_builder/issues/1049)
 * and [#1051](https://github.com/dcodish/geo_builder/issues/1051) are built alongside: «מקבילית ABCD»
 * IS `AB ∥ DC, AD ∥ BC`, and a slope is the same direction algebra. Three features sharing one
 * definition cannot disagree with each other; three features each with their own can, and the tool
 * would be able to state a parallelism one way and measure it another.
 */
export type Direction =
  /** A segment or a polygon side — both are just two named points. */
  | { k: 'points'; a: Id; b: Id }
  /** An axis. Carries no point, and needs none: its direction is fixed. */
  | { k: 'axis'; axis: 'x' | 'y' }
  /** A named line — `ℓ1`, `AC`. Its direction comes from the resolved equation. */
  | { k: 'curve'; id: Id };

export type Constraint =
  /** `A(6,4)` on a point that is not free to be replaced — one or both coordinates pinned. */
  | { t: 'coord'; id: Id; x?: Expr; y?: Expr }
  /** `שטח המשולש ABC הוא 20` — unsigned, because a triangle's area does not depend on vertex order. */
  | { t: 'area'; ids: Id[]; value: Expr }
  /** `D` is the midpoint of `BC` — «AD תיכון לצלע BC». */
  | { t: 'midpoint'; id: Id; a: Id; b: Id }
  /** `B נמצא על ציר ה-x` — the point lies on the line `ax + by + c = 0`. */
  | { t: 'on-line'; id: Id; a: number; b: number; c: number }
  /** `AD ⊥ BC` — «AD גובה לצלע BC», with `D` on `BC` carried by a companion `on-line`-free form. */
  | { t: 'perpendicular'; a: Id; b: Id; c: Id; d: Id }
  /**
   * `DE ∥ BF` · `DE ⊥ BF`, over any two {@link Direction}s (#1052).
   *
   * One kind rather than two because the residual differs only in which product is driven to zero —
   * cross for parallel, dot for perpendicular — and every other property (normalisation, degeneracy,
   * which carriers may move) is identical. `perpendicular` above is kept for the cevian that already
   * ships; it is the point-pair special case this generalises.
   */
  | { t: 'relation'; rel: 'parallel' | 'perpendicular'; u: Direction; v: Direction }
  /** `שיפוע AB הוא 2` — the same direction algebra as a relation, with a stated value (#1051). */
  | { t: 'slope'; u: Direction; value: Expr }
  /**
   * `AB + BC = DE` — an equation between two expressions over LENGTHS (#1050).
   *
   * The only member of this union whose operands are TREES rather than a fixed tuple, which is
   * the whole reason it exists: `AB = 10`, `AB = AC`, `AB + BC = 10` and `2·AB = 3·CD` are one
   * kind with different trees rather than four kinds with one form each.
   */
  | { t: 'length-eq'; left: LengthExpr; right: LengthExpr };

/** Which points a constraint references — the solver's map from constraints to movable carriers. */
export function constraintRefs(k: Constraint): Id[] {
  switch (k.t) {
    case 'coord':
      return [k.id];
    case 'area':
      return [...k.ids];
    case 'midpoint':
      return [k.id, k.a, k.b];
    case 'on-line':
      return [k.id];
    case 'perpendicular':
      return [k.a, k.b, k.c, k.d];
    case 'relation':
      return [...dirRefs(k.u), ...dirRefs(k.v)];
    case 'slope':
      return dirRefs(k.u);
    case 'length-eq':
      return [...lengthRefs(k.left), ...lengthRefs(k.right)];
    default: {
      const unreferenced: never = k;
      throw new Error(`constraint declares no refs: ${JSON.stringify(unreferenced)}`);
    }
  }
}

/** Human-readable, so a refusal can name the STATEMENT rather than internal state. */
export function describeConstraint(k: Constraint): string {
  switch (k.t) {
    case 'coord':
      return `${k.id}`;
    case 'area':
      return `שטח ${k.ids.join('')}`;
    case 'midpoint':
      return `${k.id} = אמצע ${k.a}${k.b}`;
    case 'on-line':
      return `${k.id} על ישר`;
    case 'perpendicular':
      return `${k.a}${k.b} ⊥ ${k.c}${k.d}`;
    case 'relation':
      return `${describeDir(k.u)} ${k.rel === 'parallel' ? '∥' : '⊥'} ${describeDir(k.v)}`;
    case 'slope':
      return `שיפוע ${describeDir(k.u)}`;
    case 'length-eq':
      return `${describeLengthExpr(k.left)} = ${describeLengthExpr(k.right)}`;
    default: {
      const undescribed: never = k;
      throw new Error(`constraint has no description: ${JSON.stringify(undescribed)}`);
    }
  }
}

/** The points a direction depends on — an axis and a named line depend on none. */
function dirRefs(d: Direction): Id[] {
  switch (d.k) {
    case 'points':
      return [d.a, d.b];
    case 'axis':
    case 'curve':
      return [];
    default: {
      const unreferenced: never = d;
      throw new Error(`direction declares no refs: ${JSON.stringify(unreferenced)}`);
    }
  }
}

/** Named in the student's own terms, so a refusal can quote the statement. */
function describeDir(d: Direction): string {
  switch (d.k) {
    case 'points':
      return `${d.a}${d.b}`;
    case 'axis':
      return `ציר ה-${d.axis}`;
    case 'curve':
      return d.id;
    default: {
      const undescribed: never = d;
      throw new Error(`direction has no description: ${JSON.stringify(undescribed)}`);
    }
  }
}

/**
 * Resolve a direction to a UNIT vector, or `null` when it cannot be judged here.
 *
 * Unit rather than raw: a relation between a 3-unit segment and a 3000-unit one must converge the
 * same way, and an un-normalised cross product would make the long operand dominate the minimisation
 * for no geometric reason — the same trap the area residual already documents.
 *
 * `null` for a degenerate operand (a zero-length segment, a line that did not resolve). The caller
 * treats that as "cannot be judged" rather than "satisfied".
 */
function dirVector(
  d: Direction,
  at: (id: Id) => Pt | null,
  lineDir?: (id: Id) => Pt | null,
): Pt | null {
  let v: Pt | null = null;
  switch (d.k) {
    case 'points': {
      const a = at(d.a);
      const b = at(d.b);
      if (!a || !b) return null;
      v = { x: b.x - a.x, y: b.y - a.y };
      break;
    }
    case 'axis':
      // The axes need no resolution and no figure — that is why they are cheap operands, and why
      // «AB מקביל לציר ה-x» works before anything else on the canvas is determined.
      return d.axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    case 'curve':
      v = lineDir?.(d.id) ?? null;
      break;
    default: {
      const unresolved: never = d;
      throw new Error(`direction cannot be resolved: ${JSON.stringify(unresolved)}`);
    }
  }
  if (!v) return null;
  const n = Math.hypot(v.x, v.y);
  if (n < 1e-12) return null; // a zero-length operand has no direction to relate
  return { x: v.x / n, y: v.y / n };
}

/** Twice the signed area of a polygon — the shoelace sum. */
function shoelace(ps: Pt[]): number {
  let s = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const q = ps[(i + 1) % ps.length];
    s += ps[i].x * q.y - q.x * ps[i].y;
  }
  return s;
}

/**
 * How far a constraint is from holding, **as a VECTOR with one entry per independent equation**.
 * Every entry is zero exactly when the constraint holds, and all are scale-normalised so a length
 * and an area are comparable — otherwise the area dominates the minimisation purely because its
 * numbers are bigger.
 *
 * **Per component, never a norm.** A midpoint condition is two equations; collapsing it to the
 * distance `|M − (A+B)/2|` gives one residual whose Jacobian has rank 1 at the solution, so the
 * figure reports a degree of freedom it does not have and the DOF cue lies at exactly the moment it
 * matters ([02c R22](../../docs/02c-requirements-analytic.md)). It also converges worse: a norm has
 * a kink at zero, which is where the solver spends its last iterations.
 *
 * Returns `null` when a referenced point is absent — the caller treats that as "cannot be judged"
 * rather than as "satisfied", which is the difference between an honest report and a false green.
 */
export function residual(
  k: Constraint,
  at: (id: Id) => Pt | null,
  env: Env,
  /**
   * A named line's direction, when the figure has one (#1052). Optional because most constraints
   * never ask: only a relation or a slope naming a LINE needs the figure's curves, and a caller that
   * has no curves resolved simply hands nothing and those operands report "cannot be judged".
   */
  lineDir?: (id: Id) => Pt | null,
): number[] | null {
  const pts = constraintRefs(k).map(at);
  if (pts.some((p) => p === null)) return null;
  const p = pts as Pt[];

  switch (k.t) {
    case 'coord': {
      // Either coordinate may be absent — «שיעור ה-x של M הוא 3» pins one and leaves the other free.
      const out: number[] = [];
      if (k.x !== undefined) out.push(p[0].x - evalExpr(k.x, env));
      if (k.y !== undefined) out.push(p[0].y - evalExpr(k.y, env));
      return out;
    }
    case 'area': {
      const target = evalExpr(k.value, env);
      const area = Math.abs(shoelace(p)) / 2;
      // Relative to the target, so a figure of area 20 and one of area 2000 converge alike.
      return [(area - target) / Math.max(1, Math.abs(target))];
    }
    case 'midpoint': {
      const [m, a, b] = p;
      const scale = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      return [(m.x - (a.x + b.x) / 2) / scale, (m.y - (a.y + b.y) / 2) / scale];
    }
    case 'on-line': {
      const n = Math.hypot(k.a, k.b);
      if (n < 1e-12) return null;
      return [(k.a * p[0].x + k.b * p[0].y + k.c) / n];
    }
    case 'perpendicular': {
      const [a, b, c, d] = p;
      const u = { x: b.x - a.x, y: b.y - a.y };
      const v = { x: d.x - c.x, y: d.y - c.y };
      const n = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
      if (n < 1e-12) return null;
      return [(u.x * v.x + u.y * v.y) / n];
    }
    case 'relation': {
      const u = dirVector(k.u, at, lineDir);
      const v = dirVector(k.v, at, lineDir);
      if (!u || !v) return null;
      // Both unit, so each product is already in [-1, 1] and needs no further scaling. Parallel
      // drives the CROSS product to zero, perpendicular the DOT — the only difference between them.
      return [k.rel === 'parallel' ? u.x * v.y - u.y * v.x : u.x * v.x + u.y * v.y];
    }
    case 'slope': {
      const u = dirVector(k.u, at, lineDir);
      if (!u) return null;
      const m = evalExpr(k.value, env);
      if (!Number.isFinite(m)) return null;
      /**
       * `dy = m·dx`, NOT `dy/dx = m`. The quotient form has a pole at a vertical segment, and a
       * residual that blows up is a residual the minimiser cannot cross: a figure whose solution
       * path passes near vertical would be unreachable. Written this way it is a smooth linear
       * condition everywhere, and a vertical operand simply fails it rather than exploding.
       *
       * Normalised by the unit direction, so a stated slope reads the same on any scale of figure.
       */
      return [u.y - m * u.x];
    }
    case 'length-eq': {
      const l = evalLengthExpr(k.left, at, env);
      const r = evalLengthExpr(k.right, at, env);
      if (l === null || r === null) return null;
      /**
       * Scale-normalised, like the area residual and for the same reason: a figure measured in
       * thousands and one measured in units must converge alike, and a raw difference would let
       * the larger figure dominate a joint solve purely because its numbers are bigger.
       */
      return [(l - r) / Math.max(1, Math.abs(l), Math.abs(r))];
    }
    default: {
      const unmeasured: never = k;
      throw new Error(`constraint has no residual: ${JSON.stringify(unmeasured)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------

/** The tolerance at which a constraint counts as satisfied. Residuals are scale-normalised above. */
export const SOLVE_TOL = 1e-7;

export interface SolveResult {
  /** The carrier values that satisfy the constraints, in the order they were handed in. */
  values: number[];
  /** Did every constraint reach tolerance? `false` means the caller must REPORT, never draw as if. */
  ok: boolean;
  /** The worst residual at the returned values — what a refusal message can quote. */
  worst: number;
}

/**
 * Levenberg–Marquardt over the free carriers.
 *
 * Gauss–Newton alone diverges on the corpus's own figures — an area constraint is quadratic in the
 * vertices, so a step computed from a far-off start overshoots badly. The damping term is what makes
 * it behave like gradient descent when far away and like Newton when close, and it is the smallest
 * addition that makes the method survive a bad seed.
 *
 * The Jacobian is numerical. An analytic one would be faster and would have to be re-derived for
 * every constraint kind — which is exactly the per-kind growth the residual/solver split exists to
 * prevent.
 */
export function solveLM(
  x0: number[],
  residuals: (x: number[]) => number[],
  maxIter = 120,
): SolveResult {
  const n = x0.length;
  let x = [...x0];
  let lambda = 1e-3;

  const cost = (v: number[]) => residuals(v).reduce((s, r) => s + r * r, 0);
  let f = cost(x);

  for (let iter = 0; iter < maxIter && f > SOLVE_TOL * SOLVE_TOL; iter += 1) {
    const r = residuals(x);
    const m = r.length;
    if (m === 0) break;

    // Numerical Jacobian, central differences — one-sided loses too much precision near a solution.
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j += 1) {
      const h = Math.max(1e-6, Math.abs(x[j]) * 1e-6);
      const up = [...x];
      const dn = [...x];
      up[j] += h;
      dn[j] -= h;
      const ru = residuals(up);
      const rd = residuals(dn);
      for (let i = 0; i < m; i += 1) J[i][j] = (ru[i] - rd[i]) / (2 * h);
    }

    // Normal equations (JᵀJ + λ·diag) δ = −Jᵀr, solved by Gaussian elimination. n is small — the
    // corpus's figures have a handful of unknowns — so a dense solve is the honest simple choice.
    const A: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let s = 0;
        for (let k = 0; k < m; k += 1) s += J[k][i] * J[k][j];
        A[i][j] = s + (i === j ? lambda * (1 + s) : 0);
      }
      let b = 0;
      for (let k = 0; k < m; k += 1) b -= J[k][i] * r[k];
      A[i][n] = b;
    }

    const delta = gaussian(A, n);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e12) break;
      continue;
    }

    const next = x.map((v, i) => v + delta[i]);
    const fn = cost(next);
    if (fn < f) {
      x = next;
      f = fn;
      lambda = Math.max(lambda * 0.3, 1e-12);
    } else {
      lambda *= 10;
      if (lambda > 1e12) break;
    }
  }

  const worst = residuals(x).reduce((w, r) => Math.max(w, Math.abs(r)), 0);
  return { values: x, ok: worst <= 1e-6, worst };
}

/** Gaussian elimination with partial pivoting. `null` when the system is singular to working
 *  precision — which the caller answers by damping harder rather than by inventing a step. */
function gaussian(A: number[][], n: number): number[] | null {
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-14) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = col + 1; r < n; r += 1) {
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= n; c += 1) A[r][c] -= factor * A[col][c];
    }
  }
  const out = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = A[r][n];
    for (let c = r + 1; c < n; c += 1) s -= A[r][c] * out[c];
    out[r] = s / A[r][r];
  }
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

/**
 * How many degrees of freedom SURVIVE the constraints — the number the DOF cue must report.
 *
 * Counting carriers alone says "4 free" on a figure whose four unknowns are pinned by four
 * equations, which inverts the one thing the cue is for: [02c R22](../../docs/02c-requirements-analytic.md)
 * makes the moment a figure becomes determined the moment the student learns their givens were
 * enough. A cue that never reaches zero teaches the opposite.
 *
 * Computed as `carriers − rank(J)` from the numerical Jacobian at the solution, so **dependent
 * constraints do not over-count**: stating the same area twice, or a constraint implied by others,
 * removes no additional freedom and the rank reflects that where a simple subtraction would not.
 */
export function freeRank(x: number[], residuals: (v: number[]) => number[]): number {
  const n = x.length;
  const m = residuals(x).length;
  if (n === 0 || m === 0) return n;

  const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    const h = Math.max(1e-6, Math.abs(x[j]) * 1e-6);
    const up = [...x];
    const dn = [...x];
    up[j] += h;
    dn[j] -= h;
    const ru = residuals(up);
    const rd = residuals(dn);
    for (let i = 0; i < m; i += 1) J[i][j] = (ru[i] - rd[i]) / (2 * h);
  }

  // Gaussian elimination counting pivots. The tolerance is relative to the largest entry, so a
  // figure measured in thousands and one measured in units are judged the same way.
  const scale = Math.max(1e-12, ...J.flat().map(Math.abs));
  const tol = 1e-9 * scale;
  let rank = 0;
  const rows = J.map((r) => [...r]);
  for (let col = 0; col < n && rank < m; col += 1) {
    let piv = -1;
    for (let r = rank; r < m; r += 1) if (Math.abs(rows[r][col]) > tol) { piv = r; break; }
    if (piv < 0) continue;
    [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
    for (let r = 0; r < m; r += 1) {
      if (r === rank) continue;
      const factor = rows[r][col] / rows[rank][col];
      for (let cc = col; cc < n; cc += 1) rows[r][cc] -= factor * rows[rank][cc];
    }
    rank += 1;
  }
  return Math.max(0, n - rank);
}
