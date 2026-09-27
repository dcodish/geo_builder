/**
 * `X^n = …` — ONE lowering, for both the grammar path and the retiring bridge.
 *
 * [ADR-CX-021](../../docs/06d-decisions-complex.md#adr-cx-021) built the solution set — the n solutions
 * as *one configuration containing n points*, pinned to each other rather than solved independently —
 * and built it **inside `bridgeFacts`**. `rootsMode` and `solutionNames` were called from nowhere else,
 * so the capability existed only for facts arriving from the prototype parser: under `?engine=v2`
 * `z³ = 8` was one point with three configurations, `w = z1 * 2` **invented** `z1` as a free number,
 * and the bare letter was not reserved ([#680](https://github.com/dcodish/geo_builder/issues/680)).
 *
 * That is the very drift ADR-CX-021's own Decision 2 was written about — *"a default that is wrong
 * whenever the caller forgets"* — reappearing one layer out: not a forgotten stamp this time, but a
 * lowering that lived in one of the two producers. So the lowering moves down here, where both
 * producers can reach it and neither owns it, and the two paths cannot emit different constraints for
 * the same sentence.
 *
 * Nothing here decides the MODE. `rootsMode` in [`naming.ts`](naming.ts) does that, from the names
 * earlier lines mentioned, and it must be asked by whoever knows the line order.
 */

import { type Constraint } from './constraint';
import { type Expr, pow, ref, abs, div, neg, add, sub, val, paramsOf, refsOf } from './expr';
import type { Value } from '../value/value';
import { type RootsMode, solutionNames } from './naming';
import { type Rat, isInt, rat, toNumber } from '../value/rational';

/**
 * A power equation on a bare letter, as the student wrote it: `X^n = rhs`.
 *
 * Carried as a named shape rather than as a plain `Constraint` because the reading is not decidable
 * from one line. The parser can only say *this sentence is a power equation on X*; whether that means
 * «solve it and show me the solutions» or «X satisfies this» depends on what came before
 * ([ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005)'s three modes), and a stateless
 * per-line parser structurally cannot know. Reporting the shape and letting the fold decide is the
 * layer split the tree already uses for measures, which drive or verify by the same logic.
 */
export type RootsEquation = PowerEquation | PolyEquation;

/** `X^n = rhs` — the ADR-CX-005 family, whatever spelling it arrived in (`z^3 - 1 = 0` included, #1434). */
export interface PowerEquation {
  readonly shape: 'power';
  readonly varName: string;
  readonly n: number;
  readonly rhs: Expr;
  readonly src: string;
}

/**
 * #1434 (ADR-CX-050) — G1: a POLYNOMIAL equation in the letter X of degree 2..{@link MAX_POLY_DEGREE}
 * that is not a binomial: `z^2 - 4z + 13 = 0`. Kept as written (`lhs = rhs`) because the fold decides
 * what it means, exactly as it does for the power shape: a fresh letter over closed coefficients is
 * the exam's «פתרו את המשוואה» and enumerates X₁..Xₘ; anything else is the ordinary equation.
 */
export interface PolyEquation {
  readonly shape: 'poly';
  readonly varName: string;
  /** the degree in X, read off the syntax tree */
  readonly n: number;
  readonly lhs: Expr;
  readonly rhs: Expr;
  readonly src: string;
}

/** The smallest degree worth enumerating: `X^1 = c` is an ordinary definition, not a solution set. */
const MIN_DEGREE = 2;

/**
 * The highest degree a general polynomial is read as a solution set (ADR-CX-007's G1: "Durand–Kerner
 * over degree ≤ 4"). A binomial of any degree is the power shape and is not bounded by this.
 */
export const MAX_POLY_DEGREE = 4;

/**
 * Is this equation ABOUT one letter — `X^n = rhs`, in any of its spellings, or a polynomial in X?
 *
 * Three shapes, tried in order, and each is a property of the syntax tree, never of the figure:
 *
 * 1. **`X^n = rhs`** as written, for a bare name X and a whole n ≥ 2.
 * 2. **The same equation in another spelling** (#1434 arm 1): `z^3 - 1 = 0`, `z^3 + 8 = 0`,
 *    `2z^3 = 16`, `z^3 - w = 0`. The letter occurs in exactly ONE term, as `c·X^n`, and every other term
 *    is free of it, so the equation IS `X^n = −(rest)/c`. It becomes the power shape, so every reading
 *    of ADR-CX-005 — enumerate, constrain, verify, the #1396 membership — applies unchanged. Before
 *    this, the spelling decided the reading: `z^3 = 1` drew z₁, z₂, z₃ and `z^3 - 1 = 0` one point.
 * 3. **A polynomial in X** (#1434 arm 2, G1): X is the one name of degree ≥ 2, it occurs only as a
 *    polynomial (no conjugate, no modulus, no division by it), and the degree is at most
 *    {@link MAX_POLY_DEGREE}.
 *
 * In shapes 2 and 3 the letter's LEADING power stands on the left, the way the exam writes «פתרו את
 * המשוואה». `w = z^2` keeps its ordinary reading (it defines w), as `8 = z^3` always has.
 *
 * Deliberately strict about what a letter is. `|z|^3 = 8` is a modulus equation and `(2z)^3 = 8` is
 * not an equation *about a letter* in the power sense — shape 3 reads the latter as the polynomial it
 * is — and treating a modulus equation as a solution set would name solutions the student never wrote
 * a letter for.
 */
export function asRootsEquation(lhs: Expr, rhs: Expr, src: string): RootsEquation | null {
  if (
    lhs.t === 'pow' && lhs.base.t === 'ref' && isWholeDegree(lhs.exp) && toNumber(lhs.exp) >= MIN_DEGREE &&
    // `z^2 = 4z - 13` is a polynomial with the letter on both sides, not `X^n = (a number)`
    degreeIn(rhs, lhs.base.name) === 0
  ) {
    return { shape: 'power', varName: lhs.base.name, n: toNumber(lhs.exp), rhs, src };
  }
  const letter = leadingLetter(lhs, rhs);
  if (letter === null) return null;
  return binomialOf(lhs, rhs, letter, src) ?? polynomialOf(lhs, rhs, letter, src);
}

const isWholeDegree = (e: Rat): boolean => isInt(e) && e.n > 0n;

/**
 * The degree of an expression in the name `x`, read structurally — or null when `x` occurs in a way no
 * polynomial can (under a conjugate or a modulus, in a denominator, under a non-whole power).
 */
export function degreeIn(e: Expr, x: string): number | null {
  switch (e.t) {
    case 'ref':
      return e.name === x ? 1 : 0;
    case 'num':
    case 'val':
    case 'i':
    case 'param':
      return 0;
    case 'add':
    case 'sub': {
      const l = degreeIn(e.l, x);
      const r = degreeIn(e.r, x);
      return l === null || r === null ? null : Math.max(l, r);
    }
    case 'mul': {
      const l = degreeIn(e.l, x);
      const r = degreeIn(e.r, x);
      return l === null || r === null ? null : l + r;
    }
    case 'div': {
      const l = degreeIn(e.l, x);
      const r = degreeIn(e.r, x);
      return l === null || r !== 0 ? null : l;
    }
    case 'pow': {
      const b = degreeIn(e.base, x);
      if (b === null) return null;
      if (b === 0) return 0;
      return isWholeDegree(e.exp) ? b * toNumber(e.exp) : null;
    }
    case 'neg':
      return degreeIn(e.e, x);
    case 'conj':
    case 'abs':
      return degreeIn(e.e, x) === 0 ? 0 : null;
  }
}

/**
 * The one name of degree ≥ 2 in the equation, when its leading power stands on the left — or null.
 * Two such names (`z^2 + w^2 = 0`) is a relation between two numbers, not an equation about one letter.
 */
function leadingLetter(lhs: Expr, rhs: Expr): string | null {
  const names = [...new Set([...refsOf(lhs), ...refsOf(rhs)])];
  let found: string | null = null;
  for (const name of names) {
    const l = degreeIn(lhs, name);
    const r = degreeIn(rhs, name);
    if (l === null || r === null) {
      if (Math.max(l ?? 2, r ?? 2) >= 2) return null; // not a polynomial in a name that could be the letter
      continue;
    }
    if (Math.max(l, r) < MIN_DEGREE) continue;
    if (found !== null || l < r || l === r) return null;
    found = name;
  }
  return found;
}

/** The signed top-level TERMS of `lhs − rhs`: a sum flattened, each with its sign. */
function termsOf(lhs: Expr, rhs: Expr): { sign: 1 | -1; e: Expr }[] {
  const out: { sign: 1 | -1; e: Expr }[] = [];
  const walk = (e: Expr, sign: 1 | -1): void => {
    if (e.t === 'add') {
      walk(e.l, sign);
      walk(e.r, sign);
    } else if (e.t === 'sub') {
      walk(e.l, sign);
      walk(e.r, sign === 1 ? -1 : 1);
    } else if (e.t === 'neg') walk(e.e, sign === 1 ? -1 : 1);
    else if (!(e.t === 'num' && e.v.n === 0n)) out.push({ sign, e });
  };
  walk(lhs, 1);
  walk(rhs, -1);
  return out;
}

/**
 * A term `c·X^n` split into its coefficient and degree — the only way the letter may occur in a
 * binomial. A product whose factors are X-free except ONE `X^n`, optionally over an X-free divisor.
 */
function monomialTerm(e: Expr, x: string): { coef: Expr | null; n: number } | null {
  if (e.t === 'pow' && e.base.t === 'ref' && e.base.name === x && isWholeDegree(e.exp)) {
    return { coef: null, n: toNumber(e.exp) };
  }
  if (e.t === 'mul') {
    const l = degreeIn(e.l, x);
    const r = degreeIn(e.r, x);
    if (l === 0) {
      const inner = monomialTerm(e.r, x);
      return inner && { coef: inner.coef ? { t: 'mul', l: e.l, r: inner.coef } : e.l, n: inner.n };
    }
    if (r === 0) {
      const inner = monomialTerm(e.l, x);
      return inner && { coef: inner.coef ? { t: 'mul', l: inner.coef, r: e.r } : e.r, n: inner.n };
    }
    return null;
  }
  if (e.t === 'div' && degreeIn(e.r, x) === 0) {
    const inner = monomialTerm(e.l, x);
    return inner && { coef: div(inner.coef ?? { t: 'num', v: rat(1) }, e.r), n: inner.n };
  }
  return null;
}

/** Shape 2 — `c·X^n + rest = 0`, read as `X^n = −rest / c`. */
function binomialOf(lhs: Expr, rhs: Expr, x: string, src: string): PowerEquation | null {
  const terms = termsOf(lhs, rhs);
  const withX = terms.filter((t) => degreeIn(t.e, x) !== 0);
  if (withX.length !== 1) return null;
  const lead = monomialTerm(withX[0].e, x);
  if (!lead || lead.n < MIN_DEGREE) return null;
  // the rest, moved across: each X-free term changes sign, and the letter's own sign divides out
  const rest = terms.filter((t) => t !== withX[0]);
  let moved: Expr = { t: 'num', v: rat(0) };
  rest.forEach((t, k) => {
    const s = t.sign * withX[0].sign; // X^n term positive after dividing by its sign
    const term = s === 1 ? neg(t.e) : t.e;
    moved = k === 0 ? term : s === 1 ? sub(moved, t.e) : add(moved, t.e);
  });
  const rhsOut = lead.coef ? div(moved, lead.coef) : moved;
  return { shape: 'power', varName: x, n: lead.n, rhs: rhsOut, src };
}

/** Shape 3 — a polynomial in X of degree 2..{@link MAX_POLY_DEGREE}, kept as written. */
function polynomialOf(lhs: Expr, rhs: Expr, x: string, src: string): PolyEquation | null {
  const l = degreeIn(lhs, x);
  const r = degreeIn(rhs, x);
  if (l === null || r === null) return null;
  const n = Math.max(l, r);
  if (n < MIN_DEGREE || n > MAX_POLY_DEGREE) return null;
  return { shape: 'poly', varName: x, n, lhs, rhs, src };
}

/** Every name the equation mentions OTHER than its letter — what grounds it, and what it declares. */
export function coefficientRefs(eq: RootsEquation): string[] {
  const all = eq.shape === 'power' ? refsOf(eq.rhs) : [...refsOf(eq.lhs), ...refsOf(eq.rhs)];
  return [...new Set(all)].filter((n) => n !== eq.varName);
}

/**
 * #1434 — is a polynomial's every coefficient a CLOSED number (no other name, no parameter)? Only then
 * are its roots numbers the fold can compute before anything is solved, which enumerating needs: a
 * general polynomial has no exact tier-1 constellation to pin its roots to one another the way `X^n`
 * has, so a coefficient that is still an unknown leaves the roots unknown too.
 */
export const isClosedPoly = (eq: PolyEquation): boolean =>
  coefficientRefs(eq).length === 0 && paramsOf(eq.lhs).length + paramsOf(eq.rhs).length === 0;

/**
 * The constraints one reading emits — the whole difference between the three modes.
 *
 * **`constrain`** is the ordinary equation: one unknown, its turn unknown enumerated, and the solutions
 * genuinely ARE the configurations «show another configuration» walks (ADR-CX-005 modes 2 and 3).
 *
 * **`enumerate`** is the exam's «פתרו את המשוואה»: the n solutions are one configuration
 * containing n points. X₁ solves the equation and every later solution is pinned to X₁ — same modulus,
 * exactly `k/n` of a turn further round — so the constellation is exact even when the right-hand side
 * is not yet known, and no closed form for the roots is needed. X₁'s row is `principal`, which drops
 * its integer turn unknown: *which* solution is called X₁ is a labelling convention, and left un-pinned
 * the n rotations of one point set would enumerate as n indistinguishable configurations.
 *
 * The bare letter is never constrained and never drawn — X is *related to* X₁..Xₙ, which is what
 * reserving it means.
 */
export function solutionSetConstraints(eq: RootsEquation, mode: RootsMode): Constraint[] {
  // #1434 — a polynomial in the constrain reading is the ordinary equation, exactly as written
  if (eq.shape === 'poly') {
    if (mode !== 'constrain') throw new Error('an enumerated polynomial lowers through polySetConstraints');
    return [{ lhs: eq.lhs, rhs: eq.rhs, src: eq.src }];
  }
  const degree = rat(eq.n);
  if (mode === 'constrain') {
    return [{ lhs: pow(ref(eq.varName), degree), rhs: eq.rhs, src: eq.src }];
  }
  const sols = solutionNames(eq.varName, eq.n);
  const out: Constraint[] = [
    { lhs: pow(ref(sols[0]), degree), rhs: eq.rhs, src: eq.src, principal: true },
  ];
  for (let k = 1; k < sols.length; k++) {
    out.push({ kind: 'mod', lhs: abs(ref(sols[k])), rhs: abs(ref(sols[0])), src: eq.src });
    out.push({
      kind: 'arg',
      lhs: ref(sols[k]),
      rhs: ref(sols[0]),
      deltaTurns: rat(k, eq.n),
      src: eq.src,
    });
  }
  return out;
}

/**
 * #1396 — the enumerate lowering when the student has ALREADY STATED some of X₁..Xₙ, and at least one
 * of them sits on a root other than its index: the solutions are matched by SET MEMBERSHIP (operator
 * ruling, 2026-09-24, amending [ADR-CX-042](../../docs/06d-decisions-complex.md#adr-cx-042)).
 *
 * `placed` maps each stated member to the root it occupies, `j ∈ 0..n−1`, counted in argument order
 * from the principal root. The caller decided that exactly, and only for DETERMINED members. Each
 * member keeps its own row `Xₘ^n = rhs` (so the solve still checks it), and the unstated names take the
 * remaining roots in index order, ascending j, each pinned to the first member by modulus and by
 * `(j − j₀)/n` of a turn. With no member, or every member on its own index root, the caller uses
 * {@link solutionSetConstraints} instead, so the common case lowers exactly as it always did.
 */
export function solutionSetConstraintsPlaced(eq: PowerEquation, placed: ReadonlyMap<string, number>): Constraint[] {
  const n = eq.n;
  const sols = solutionNames(eq.varName, n);
  const stated = sols.filter((s) => placed.has(s));
  if (stated.length === 0) throw new Error('solutionSetConstraintsPlaced needs at least one placed member');
  const anchor = stated[0];
  const j0 = placed.get(anchor)!;
  const taken = new Set(placed.values());
  const free = Array.from({ length: n }, (_, j) => j).filter((j) => !taken.has(j));
  const out: Constraint[] = stated.map((m) => ({ lhs: pow(ref(m), rat(n)), rhs: eq.rhs, src: eq.src }));
  let next = 0;
  for (const s of sols) {
    if (placed.has(s)) continue;
    const j = free[next++];
    out.push({ kind: 'mod', lhs: abs(ref(s)), rhs: abs(ref(anchor)), src: eq.src });
    out.push({ kind: 'arg', lhs: ref(s), rhs: ref(anchor), deltaTurns: rat((((j - j0) % n) + n) % n, n), src: eq.src });
  }
  return out;
}

/**
 * Which names the figure should DRAW for this reading, and which it must not.
 *
 * In `constrain` mode the letter is the number, so it is drawn. In `enumerate` the letter is
 * reserved and the SOLUTIONS are drawn — declaring the letter as well would plot a point for a name
 * that stands for the whole set, at whatever position the sampler chose for it.
 */
export function solutionSetNames(eq: RootsEquation, mode: RootsMode, count: number = eq.n): string[] {
  // #1434 — an enumerated polynomial names its DISTINCT roots (`count`): `(z−1)²(z+2) = 0` draws two
  // points, and a third name would be a point with nothing to stand on
  return mode === 'constrain'
    ? [eq.varName]
    : solutionNames(eq.varName, count);
}

/**
 * #1434 (ADR-CX-050) — the enumerate lowering of a POLYNOMIAL: each solution is DEFINED as its root.
 *
 * `X^n = rhs` pins X₂..Xₙ to X₁ inside tier 1 because the n-th roots of one number are one rotation
 * apart; a general polynomial's roots have no such relation, so there is no constellation to pin. Its
 * coefficients are closed numbers ({@link isClosedPoly}), so the roots are numbers too, computed once
 * (`solve/polySet.ts`) and carried as exactly as the value layer can: `Xₖ = root` is then a monomial
 * definition the exact tier solves outright.
 *
 * `placed` is the #1396 membership reading: a member the student already stated, and which IS one of
 * the roots, keeps its own statement and gains only the check `p(Xₘ) = 0` (re-defining it here would
 * state the same number twice, through two different angle atoms); the unstated names take the
 * remaining roots in order.
 */
export function polySetConstraints(
  eq: PolyEquation,
  roots: readonly Value[],
  placed: ReadonlyMap<string, number> = new Map(),
): Constraint[] {
  const names = solutionNames(eq.varName, roots.length);
  const taken = new Set(placed.values());
  const free = roots.map((_, j) => j).filter((j) => !taken.has(j));
  const out: Constraint[] = [];
  let next = 0;
  for (const name of names) {
    if (placed.has(name)) {
      out.push({ lhs: substitute(eq.lhs, eq.varName, name), rhs: substitute(eq.rhs, eq.varName, name), src: eq.src });
      continue;
    }
    out.push({ lhs: ref(name), rhs: val(roots[free[next++]]), src: eq.src });
  }
  return out;
}

/** `e` with every reference to `from` replaced by a reference to `to`. */
export function substitute(e: Expr, from: string, to: string): Expr {
  switch (e.t) {
    case 'ref':
      return e.name === from ? ref(to) : e;
    case 'num':
    case 'val':
    case 'i':
    case 'param':
      return e;
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return { ...e, l: substitute(e.l, from, to), r: substitute(e.r, from, to) };
    case 'pow':
      return { ...e, base: substitute(e.base, from, to) };
    case 'conj':
    case 'neg':
    case 'abs':
      return { ...e, e: substitute(e.e, from, to) };
  }
}
