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

import { type Expr, isMonomial, refsOf } from '../model/expr';
import { type LogPolarForm, argumentRow, linearize, modulusRow } from './logpolar';
import { type LinearSolution, type Row, type VectorOps, solveLinear } from './linear';
import { type Rat, isInt, mul as ratMul, rat, toNumber } from '../value/rational';
import {
  type ExpVec,
  div as modDiv,
  isOne as modIsOne,
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

/**
 * One stated relation. `src` is the student's own line, carried so a refusal can quote it.
 *
 * `kind` exists because two corpus families are NOT complex equations. `|z₁| = 9r` (F3) says nothing
 * about direction, and `arg Z₁ − arg Z₂ = 90°` (F4) says nothing about magnitude — writing either as a
 * full equation would invent the half the student did not state, which is the ADR-052 sin in its
 * purest form. Each therefore emits only the row it actually constrains.
 */
export interface Constraint {
  readonly lhs: Expr;
  readonly rhs: Expr;
  /** `eq` (the default) emits both rows · `mod` only the modulus row · `arg` only the argument row */
  readonly kind?: 'eq' | 'mod' | 'arg';
  /** for `arg` only: `arg(lhs) − arg(rhs) = deltaTurns`, in turns */
  readonly deltaTurns?: Rat;
  readonly src?: string;
}

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
    if (kind === 'mod') continue; // a magnitude given says nothing about direction

    const a = argumentRow(lf, rf);
    // `arg(lhs) − arg(rhs) = delta` shifts the constant; an `eq` is the delta-zero case
    const rhs = c.deltaTurns ? angAdd(a.rhs, fromTurns(c.deltaTurns)) : a.rhs;
    // `Σ coef·t − k = const` — the integer turn unknown enters with coefficient −1
    const k = kName(kNames.length);
    const coef = new Map(a.coef);
    coef.set(k, rat(-1));
    // A row with no argument unknowns at all is either trivially true or a pure constant claim; the
    // turn unknown makes the former satisfiable, so only keep rows that say something.
    if (a.coef.size === 0 && ANG_OPS.isZero(rhs)) continue;
    kNames.push(k);
    argRows.push({ coef, rhs });
  }

  const modulus = solveLinear(modRows, names, MOD_OPS);
  const argument = solveLinear(argRows, [...names, ...kNames], ANG_OPS);

  const { branches, truncated, integralityFailed } = enumerateBranches(argument, kNames);

  const inconsistent = modulus.inconsistent
    ? 'modulus'
    : argument.inconsistent || integralityFailed
      ? 'argument'
      : null;

  // A modulus is KNOWN only when nothing free is left in it — otherwise it is a relation, not a value.
  const knownModulus = new Map<string, ExpVec>();
  for (const [n, d] of modulus.determined) if (d.coefs.size === 0) knownModulus.set(n, d.konst);

  const freeDof = [
    ...modulus.free.map((n) => `|${n}|`),
    ...argument.free.filter((n) => !isTurnUnknown(n)).map((n) => `arg ${n}`),
  ];

  return {
    inconsistent,
    modulus,
    argument,
    branches,
    branchesTruncated: truncated,
    knownModulus,
    freeDof,
    deferred,
    names,
  };
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
