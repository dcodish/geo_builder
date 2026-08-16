/**
 * Exact Gaussian elimination over ℚ, with the right-hand side living in an arbitrary ℚ-vector space.
 *
 * Both tier-1 systems are of this shape and only the RHS differs: the modulus system's constants are
 * exponent vectors, the argument system's are angles. Writing the elimination once, generic over
 * `VectorOps`, is what keeps them from drifting into two solvers that disagree — the same reason the
 * 2-D tree keeps ONE `residual` contract for every constraint type.
 *
 * The elimination is exact. There is no tolerance, no iteration and no convergence question, which is
 * the whole point: #607's system is unreachable by iteration (its fixpoint is repelling) and falls out
 * of elimination in closed form. An inconsistent system is detected as a `0 = c` row — an honest
 * contradiction, available before any numeric work happens, which is also what makes the failure path
 * cheaper than the success path ([ADR-407](../../docs/06-decisions.md#adr-407)).
 */

import { type Rat, ZERO, div as ratDiv, isZero as ratIsZero, mul as ratMul, rat, sub as ratSub } from '../value/rational';

/** The operations the right-hand side must support to be eliminated over. */
export interface VectorOps<V> {
  zero(): V;
  add(a: V, b: V): V;
  sub(a: V, b: V): V;
  scale(a: V, k: Rat): V;
  isZero(a: V): boolean;
}

/** `Σ coef[name]·name = rhs`. */
export interface Row<V> {
  readonly coef: ReadonlyMap<string, Rat>;
  readonly rhs: V;
}

/** A determined unknown, as a constant plus a combination of the FREE unknowns. */
export interface Determined<V> {
  readonly konst: V;
  readonly coefs: ReadonlyMap<string, Rat>;
}

export interface LinearSolution<V> {
  /** a `0 = c` row with c ≠ 0 — the givens contradict each other */
  readonly inconsistent: boolean;
  readonly determined: ReadonlyMap<string, Determined<V>>;
  /** unknowns the system leaves open — these are the genuine degrees of freedom */
  readonly free: readonly string[];
  /** the count the DOF cue and the knowledge gates both read; never re-derived elsewhere */
  readonly rank: number;
}

/**
 * Reduced row echelon form over the given unknown order.
 *
 * The order is honoured rather than chosen by a pivoting heuristic: it makes the solution reproducible,
 * and it lets the caller express a preference (solve for a number rather than for a turn-index) without
 * a second mechanism. Exact arithmetic means there is no numerical reason to pivot for stability.
 */
export function solveLinear<V>(rows: readonly Row<V>[], unknowns: readonly string[], ops: VectorOps<V>): LinearSolution<V> {
  // mutable working copy
  const work = rows.map((r) => ({ coef: new Map(r.coef), rhs: r.rhs }));
  const pivotRowOf = new Map<string, number>();
  const usedRows = new Set<number>();

  for (const u of unknowns) {
    let pivot = -1;
    for (let i = 0; i < work.length; i++) {
      if (usedRows.has(i)) continue;
      const c = work[i].coef.get(u);
      if (c && !ratIsZero(c)) {
        pivot = i;
        break;
      }
    }
    if (pivot < 0) continue;

    // normalise the pivot row so the pivot coefficient is 1
    const pc = work[pivot].coef.get(u)!;
    const norm = new Map<string, Rat>();
    for (const [n, v] of work[pivot].coef) {
      const nv = ratDiv(v, pc);
      if (!ratIsZero(nv)) norm.set(n, nv);
    }
    work[pivot] = { coef: norm, rhs: ops.scale(work[pivot].rhs, ratDiv(rat(1), pc)) };

    // eliminate u from every other row
    for (let i = 0; i < work.length; i++) {
      if (i === pivot) continue;
      const c = work[i].coef.get(u);
      if (!c || ratIsZero(c)) continue;
      const next = new Map(work[i].coef);
      for (const [n, v] of work[pivot].coef) {
        const nv = ratSub(next.get(n) ?? ZERO, ratMul(v, c));
        if (ratIsZero(nv)) next.delete(n);
        else next.set(n, nv);
      }
      work[i] = { coef: next, rhs: ops.sub(work[i].rhs, ops.scale(work[pivot].rhs, c)) };
    }

    pivotRowOf.set(u, pivot);
    usedRows.add(pivot);
  }

  // a row with no coefficients left and a non-zero constant is `0 = c`
  const inconsistent = work.some((r) => r.coef.size === 0 && !ops.isZero(r.rhs));

  const free = unknowns.filter((u) => !pivotRowOf.has(u));
  const determined = new Map<string, Determined<V>>();
  for (const [u, i] of pivotRowOf) {
    const coefs = new Map<string, Rat>();
    for (const [n, v] of work[i].coef) {
      if (n === u) continue;
      // after full reduction the survivors are free unknowns; move them to the other side
      coefs.set(n, ratMul(v, rat(-1)));
    }
    determined.set(u, { konst: work[i].rhs, coefs });
  }

  return { inconsistent, determined, free, rank: pivotRowOf.size };
}

/** Evaluate a determined unknown once the free unknowns have values. */
export function substitute<V>(d: Determined<V>, values: ReadonlyMap<string, V>, ops: VectorOps<V>): V | null {
  let acc = d.konst;
  for (const [n, c] of d.coefs) {
    const v = values.get(n);
    if (v === undefined) return null;
    acc = ops.add(acc, ops.scale(v, c));
  }
  return acc;
}
