/**
 * TIER 1 — the exact linear solve (stage 1 of [docs/LADDER-CX.md](../../docs/LADDER-CX.md)).
 *
 * Every monomial constraint becomes two linear equations: one over the moduli, one over the arguments.
 * The argument equations carry an extra INTEGER unknown each, because two directions that differ by a
 * whole turn are the same direction — and those integers are not a nuisance to be normalised away,
 * they are **the branch set**. The exam's «מצא את כל האפשרויות» is exactly "enumerate the integer
 * solutions", so the configurations the student can cycle through fall out of the algebra instead of
 * being a feature bolted onto it ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)).
 *
 * Three consequences worth naming, because each replaces machinery the 2-D tree needs:
 *
 *   - **"Which DOF does this constraint drive" is the pivot choice in elimination.** No recruiter, no
 *     case ladder A–F, no ownership negotiation (LADDER stage 3 has no analogue here).
 *   - **The free-DOF count is the nullspace dimension**, published once — so ADR-052 conformance is
 *     structural rather than an audit that never converged.
 *   - **A contradiction is a `0 = c` row**, found before any iteration, so refusing costs less than
 *     succeeding.
 */

import { isMonomial, refsOf } from '../model/expr';
import type { Constraint } from '../model/constraint';

export type { Constraint } from '../model/constraint';
import { type LogPolarForm, argumentRow, linearize, modulusRow } from './logpolar';
import { type LinearSolution, type Row, type VectorOps, solveLinear } from './linear';
import { type Rat, isInt, mul as ratMul, rat, toNumber } from '../value/rational';
import {
  type ExpVec,
  div as modDiv,
  inv as modInv,
  isOne as modIsOne,
  isPrimeAtom,
  mul as modMul,
  one as modOne,
  pow as modPow,
} from '../value/modulus';
import {
  type Angle,
  add as angAdd,
  fromTurns,
  isExactRational,
  normalize as angNormalize,
  scale as angScale,
  sub as angSub,
  zero as angZero,
  format as fmtAngle,
} from '../value/angle';


/** The integer turn-unknown namespace. `#` cannot occur in a student's name, so collision is impossible. */
const kName = (i: number): string => `#k${i}`;
export const isTurnUnknown = (name: string): boolean => name.startsWith('#k');

const MOD_OPS: VectorOps<ExpVec> = {
  zero: modOne,
  add: modMul,
  sub: modDiv,
  scale: modPow,
  isZero: modIsOne,
};

const ANG_OPS: VectorOps<Angle> = {
  zero: angZero,
  add: angAdd,
  sub: angSub,
  scale: angScale,
  // A whole number of turns IS zero as a direction — so a residual row of `0 = 1 turn` is consistent,
  // not a contradiction. Getting this wrong would refuse satisfiable systems whose equations happen to
  // be dependent modulo a full rotation.
  isZero: (a) => isExactRational(a) && isInt(a.turns),
};

/** One enumerated configuration: the integer turn choices, and the arguments they determine. */
export interface Branch {
  readonly k: ReadonlyMap<string, bigint>;
  readonly angles: ReadonlyMap<string, Angle>;
}

export interface Tier1Result {
  /** the system contradicts itself, with which half found it */
  readonly inconsistent: null | 'modulus' | 'argument';
  readonly modulus: LinearSolution<ExpVec>;
  readonly argument: LinearSolution<Angle>;
  /** every distinct configuration the integer turn-unknowns produce, modulo one turn */
  readonly branches: readonly Branch[];
  /** true when enumeration hit its budget — the count is then a floor, and it says so rather than lying */
  readonly branchesTruncated: boolean;
  /** names whose modulus is fully known (no free unknown in it) */
  readonly knownModulus: ReadonlyMap<string, ExpVec>;
  /** the genuine continuous degrees of freedom: free moduli + free arguments, turn-unknowns excluded */
  readonly freeDof: readonly string[];
  /** constraints that are not monomial — they belong to the numeric tier, listed rather than dropped */
  readonly deferred: readonly Constraint[];
  /** every complex name the constraints mention, in first-seen order — the set the figure must DRAW */
  readonly names: readonly string[];
  /**
   * #719 — magnitude givens that are IMPOSSIBLE on their own («|z1| = -5»), as the student's own
   * statements. Not `inconsistent`: nothing here conflicts with anything else — the given is
   * out of domain by itself, and saying "your two statements conflict" would name the wrong culprit.
   */
  readonly impossible: readonly string[];
  /**
   * #1366 — the real PARAMETERS the givens determine, as their own small solve. `|z1| = 9r` beside
   * `z1 = 3+4i` leaves `9r = 5`, which is an equation in `r` (r = 5/9), not a contradiction. Its
   * `determined` entries are the parameters the figure must draw AT their solved value rather than at a
   * sample; its `free` ones stay free. Empty when no given pins a parameter.
   */
  readonly params: LinearSolution<ExpVec>;
  /**
   * #1389/#1390 — every parameter the givens DETERMINE, as an exact value: `u^5 = 32` gives
   * `u → {2:1}`, and `9r = 5` gives `r → {5:1, 3:-2}`. A parameter determined in terms of others
   * that stay free is carried in them (`r → {s:1, 2:-1}` for r = s/2), so it is exact but parametric.
   *
   * This is the ONE place a solved parameter becomes a value. `knownModulus` is already substituted
   * through it, and every other reader (the drawn reading, the parameters section, the ask lane) calls
   * {@link substituteSolvedParams}, so none of them can print `18r` for a number the givens made `10`.
   */
  readonly paramValues: ReadonlyMap<string, ExpVec>;
}

const BRANCH_BUDGET = 2048;

const lcm = (a: bigint, b: bigint): bigint => {
  const g = (x: bigint, y: bigint): bigint => (y ? g(y, x % y) : x < 0n ? -x : x);
  return (a / g(a, b)) * b;
};

/**
 * Solve the monomial part of a constraint set.
 *
 * Unknown ordering is deliberate: the arguments come before the turn-unknowns, so elimination solves
 * the *numbers* in terms of the *turn choices* rather than the other way round. That is what leaves a
 * clean finite family to enumerate.
 */
export function solveTier1(constraints: readonly Constraint[]): Tier1Result {
  const modRows: Row<ExpVec>[] = [];
  const argRows: Row<Angle>[] = [];
  const deferred: Constraint[] = [];
  /** #719 — magnitude givens that no z can satisfy, as the student stated them */
  const impossible: string[] = [];
  const names: string[] = [];
  const kNames: string[] = [];

  const noteName = (n: string): void => {
    if (!names.includes(n)) names.push(n);
  };

  for (const c of constraints) {
    for (const n of [...refsOf(c.lhs), ...refsOf(c.rhs)]) noteName(n);

    let lf: LogPolarForm | null = null;
    let rf: LogPolarForm | null = null;
    if (isMonomial(c.lhs) && isMonomial(c.rhs)) {
      lf = linearize(c.lhs);
      rf = linearize(c.rhs);
    }
    if (!lf || !rf) {
      deferred.push(c);
      continue;
    }

    const kind = c.kind ?? 'eq';
    if (kind === 'eq' || kind === 'mod') modRows.push(modulusRow(lf, rf));
    if (kind === 'mod') {
      /**
       * #719 (ADR-CX-035) — A MAGNITUDE GIVEN WHOSE VALUE IS NOT A POSITIVE REAL IS IMPOSSIBLE.
       *
       * `linearize` faithfully encodes a negative literal as (modulus |v|, argument ½ turn), and the
       * next line then drops the argument row — correctly, since a magnitude says nothing about
       * direction. The sign was therefore not lost, it was CONSUMED: «|z1| = -5» became «|z1| = 5»
       * and nothing failed, which is why the defect was silent. `modulus.ts` already states the rule
       * («a modulus must be positive — the sign belongs to the argument»); it just never reached a
       * refusal surface.
       *
       * The test is the mirror of the one that keeps a trivial argument row below: when the RHS's
       * argument is a KNOWN constant (no unknowns) and it is not zero, the right-hand side is not a
       * positive real, so no z can satisfy it. An RHS whose argument is still unknown («|z1| = |z2|»,
       * «|z1| = 2·z2») says nothing and is left alone — and a literal ZERO never arrives here at all,
       * because `linearize` returns null for it (ln 0), so «|z1| = 0» stays satisfiable via the
       * numeric tier. That boundary is deliberate, not incidental.
       */
      const dir = argumentRow(lf, rf);
      if (dir.coef.size === 0 && !ANG_OPS.isZero(dir.rhs)) impossible.push(c.src);
      continue; // a magnitude given says nothing about direction
    }

    const a = argumentRow(lf, rf);
    // `arg(lhs) − arg(rhs) = delta` shifts the constant; an `eq` is the delta-zero case
    const rhs = c.deltaTurns ? angAdd(a.rhs, fromTurns(c.deltaTurns)) : a.rhs;
    const coef = new Map(a.coef);
    // `Σ coef·t − k = const` — the integer turn unknown enters with coefficient −1. A PRINCIPAL row
    // omits it: the equation is read at its principal value instead of enumerating its turns, which is
    // how a solution SET gets one canonical labelling rather than n indistinguishable ones.
    const k = c.principal ? null : kName(kNames.length);
    if (k) coef.set(k, rat(-1));
    // A row with no argument unknowns at all is either trivially true or a pure constant claim; the
    // turn unknown makes the former satisfiable, so only keep rows that say something. A principal row
    // has no such escape — with no `k` to absorb it, a constant row is a genuine claim and must be kept
    // so the solve can refuse it.
    if (a.coef.size === 0 && ANG_OPS.isZero(rhs) && !c.principal) continue;
    if (k) kNames.push(k);
    argRows.push({ coef, rhs });
  }

  const modulus = solveLinear(modRows, names, MOD_OPS);
  const argument = solveLinear(argRows, [...names, ...kNames], ANG_OPS);
  const params = solveParams(modulus.leftover);
  const paramValues = solvedParamValues(params);

  const { branches, truncated, integralityFailed } = enumerateBranches(argument, kNames);

  const inconsistent = params.inconsistent
    ? 'modulus'
    : argument.inconsistent || integralityFailed
      ? 'argument'
      : null;

  // A modulus is KNOWN only when nothing free is left in it — otherwise it is a relation, not a value.
  const knownModulus = new Map<string, ExpVec>();
  for (const [n, d] of modulus.determined) {
    if (d.coefs.size === 0) knownModulus.set(n, substituteSolvedParams(d.konst, paramValues));
  }

  const freeDof = [
    ...modulus.free.map((n) => `|${n}|`),
    ...argument.free.filter((n) => !isTurnUnknown(n)).map((n) => `arg ${n}`),
  ];

  return {
    inconsistent,
    impossible,
    modulus,
    argument,
    branches,
    branchesTruncated: truncated,
    knownModulus,
    freeDof,
    deferred,
    names,
    params,
    paramValues,
  };
}

/**
 * The exact value of each SOLVED parameter (#1389/#1390). The params system works in log space, so a
 * determined row reads `log p = log konst + Σ c·log f`, i.e. `p = konst · Π f^c` over parameters f
 * that stay free. Because the elimination is reduced, those f are never themselves determined, so a
 * single pass gives a closed value.
 */
function solvedParamValues(params: LinearSolution<ExpVec>): Map<string, ExpVec> {
  const out = new Map<string, ExpVec>();
  if (params.inconsistent) return out;
  for (const [p, d] of params.determined) {
    let v: ExpVec = d.konst;
    for (const [f, c] of d.coefs) v = modMul(v, modPow(new Map([[f, rat(1)]]), c));
    out.set(p, v);
  }
  return out;
}

/**
 * Replace every SOLVED parameter atom in an exact modulus by its value: `{2:1, 3:2, r:1}` with
 * `r = 5/9` becomes `{2:1, 5:1}`, which is `10`. Atoms of parameters that stay free are left in
 * place, so a genuinely parametric answer (`15r` with r free) is unchanged.
 */
export function substituteSolvedParams(v: ExpVec, values: ReadonlyMap<string, ExpVec>): ExpVec {
  if (values.size === 0) return v;
  let out: ExpVec = new Map();
  for (const [atom, e] of v) {
    const value = isPrimeAtom(atom) ? undefined : values.get(atom);
    out = modMul(out, value ? modPow(value, e) : new Map([[atom, e]]));
  }
  return out;
}

/**
 * #1366 — what the modulus system's `0 = c` rows actually say.
 *
 * `linearize` keeps a real parameter inside the modulus CONSTANT (`9r` is `{3:2, r:1}`), and that is
 * deliberate: every parametric answer (`15r`, `54r²`) and the free-DOF basis read that encoding. But a
 * constant cannot absorb a given — so `z1 = 3+4i` beside `|z1| = 9r` eliminated to `0 = 9r/5`, and the
 * elimination called it a contradiction. It is an equation in `r`.
 *
 * So the leftover rows are read here as a second, tiny log-space system whose unknowns are the
 * parameter ATOMS: a row's parameter exponents are its coefficients and its prime part, inverted, is
 * its right-hand side (`9r/5 = 1` ⇒ `1·log r = log(5/9)`). A row with no parameter at all is a genuine
 * contradiction, exactly as before — and so is a set of rows that force one parameter to two values
 * (`9r = 5` and `4r = 5`). Only when THIS system has no solution are the givens inconsistent.
 *
 * The representation the answer layers read is untouched: the unknown list of the modulus system does
 * not change, so neither its pivots nor the free-DOF basis can move.
 */
function solveParams(leftover: readonly Row<ExpVec>[]): LinearSolution<ExpVec> {
  const rows: Row<ExpVec>[] = [];
  const atoms: string[] = [];
  for (const r of leftover) {
    const coef = new Map<string, Rat>();
    const primes = new Map<string, Rat>();
    for (const [atom, e] of r.rhs) {
      if (isPrimeAtom(atom)) primes.set(atom, e);
      else {
        coef.set(atom, e);
        if (!atoms.includes(atom)) atoms.push(atom);
      }
    }
    rows.push({ coef, rhs: modInv(primes) });
  }
  return solveLinear(rows, atoms.sort(), MOD_OPS);
}

/**
 * Walk the integer turn-unknowns and collect the DISTINCT argument assignments they produce.
 *
 * Each `k` repeats with period `lcm` of the denominators of its coefficients across the determined
 * arguments — for `4·t = k − ½` that is 4, giving exactly the four directions 45°/135°/225°/315°.
 * Assignments are deduplicated modulo one turn, so a `k` that merely rotates a figure by a whole turn
 * contributes one branch rather than many.
 */
function enumerateBranches(
  argument: LinearSolution<Angle>,
  kNames: readonly string[],
): { branches: Branch[]; truncated: boolean; integralityFailed: boolean } {
  const determined = [...argument.determined.entries()].filter(([n]) => !isTurnUnknown(n));
  /**
   * Turn-unknowns the elimination SOLVED FOR. These are the reason enumeration is not just a product
   * of periods: a `k` the system determines must still come out a whole number, and that is a genuine
   * constraint on the free ones. `z² = 1 ∧ z⁴ = 1` is the small case — over ℚ the free turn-unknown
   * ranges over four values, and integrality prunes it to the two roots the exam expects.
   */
  const determinedK = [...argument.determined.entries()].filter(([n]) => isTurnUnknown(n));
  const active: { k: string; period: bigint }[] = [];

  for (const k of kNames) {
    if (!argument.free.includes(k)) continue; // eliminated — it never reaches a direction
    let period = 1n;
    // the period must be wide enough for BOTH the directions and the solved turn-unknowns, or the
    // integrality filter below would be applied over too narrow a window and lose real branches
    for (const [, d] of [...determined, ...determinedK]) {
      const c = d.coefs.get(k);
      if (c && c.n !== 0n) period = lcm(period, c.d);
    }
    active.push({ k, period });
  }

  /**
   * #1366 — a turn-unknown pinned to a CONSTANT must be whole on its own, whether or not any direction
   * is determined. `o = 1+i` reads «a positive real equals 1+i»: its argument row is `−k = −⅛`, so
   * `k = ⅛`, which no rotation satisfies. The early return below used to skip this check whenever no
   * DIRECTION was determined — and the line was refused only by accident, because the modulus half
   * called `0 = o/√2` a contradiction. Once the modulus half solves `o = √2`, this is the half that
   * must refute it. Same criterion as `emit`'s, so the two cannot disagree.
   */
  for (const [, d] of determinedK) {
    if (d.coefs.size > 0) continue;
    if (!isExactRational(d.konst) || !isInt(d.konst.turns)) return { branches: [], truncated: false, integralityFailed: true };
  }

  if (determined.length === 0) return { branches: [], truncated: false, integralityFailed: false };

  let total = 1n;
  for (const a of active) total *= a.period;
  const truncated = total > BigInt(BRANCH_BUDGET);

  const branches: Branch[] = [];
  const seen = new Set<string>();
  const counters = active.map(() => 0n);
  let anyIntegralityRejection = false;

  /** Resolve a determined row against the current turn assignment, or null if it depends on a free angle. */
  const resolve = (d: { konst: Angle; coefs: ReadonlyMap<string, Rat> }, kMap: Map<string, bigint>): Angle | null => {
    let a = d.konst;
    for (const [fn, c] of d.coefs) {
      const kv = kMap.get(fn);
      if (kv === undefined) return null; // a genuinely free ARGUMENT, not a turn choice
      a = angAdd(a, angScale({ turns: rat(kv), atoms: new Map() }, c));
    }
    return a;
  };

  const emit = (): void => {
    const kMap = new Map<string, bigint>();
    active.forEach((a, i) => kMap.set(a.k, counters[i]));

    // INTEGRALITY: a turn-unknown the system solved for must be a whole number of turns. When it
    // depends on a free angle instead we cannot decide, and undecidable is not "reject".
    for (const [, d] of determinedK) {
      const v = resolve(d, kMap);
      if (v === null) continue;
      if (!isExactRational(v) || !isInt(v.turns)) {
        anyIntegralityRejection = true;
        return;
      }
    }

    const angles = new Map<string, Angle>();
    for (const [n, d] of determined) {
      const a = resolve(d, kMap);
      if (a !== null) angles.set(n, angNormalize(a));
    }
    const key = [...angles.entries()]
      .map(([n, a]) => `${n}=${a.turns.n}/${a.turns.d}:${[...a.atoms].map(([x, y]) => `${x}*${y.n}/${y.d}`).sort().join(',')}`)
      .sort()
      .join('|');
    if (seen.has(key)) return;
    seen.add(key);
    branches.push({ k: kMap, angles });
  };

  const walk = (i: number): void => {
    if (branches.length >= BRANCH_BUDGET) return;
    if (i === active.length) {
      emit();
      return;
    }
    for (let v = 0n; v < active[i].period; v++) {
      counters[i] = v;
      walk(i + 1);
      if (branches.length >= BRANCH_BUDGET) return;
    }
  };
  walk(0);

  // Every assignment refuted by integrality means the argument equations cannot hold together: two
  // directions that differ by a non-whole number of turns are simply different directions.
  return { branches, truncated, integralityFailed: branches.length === 0 && anyIntegralityRejection };
}

/** Degrees for a branch's angle, when it is free of symbolic atoms — for tests and traces. */
export const branchDegrees = (b: Branch, name: string): number | null => {
  const a = b.angles.get(name);
  if (!a || !isExactRational(a)) return null;
  return toNumber(ratMul(angNormalize(a).turns, rat(360)));
};

/** A one-line trace of a branch, in the register the canvas uses. */
export const formatBranch = (b: Branch): string =>
  [...b.angles.entries()]
    .sort(([a], [c]) => a.localeCompare(c))
    .map(([n, a]) => `arg ${n} = ${fmtAngle(a)}`)
    .join(', ');
