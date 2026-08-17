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
import { type Expr, pow, ref, abs } from './expr';
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
export interface RootsEquation {
  readonly varName: string;
  readonly n: number;
  readonly rhs: Expr;
  readonly src: string;
}

/** The smallest degree worth enumerating: `X^1 = c` is an ordinary definition, not a solution set. */
const MIN_DEGREE = 2;

/**
 * Is this equation `X^n = rhs` for a bare name X and a whole n ≥ 2?
 *
 * Deliberately strict about the left-hand side. `|z|^3 = 8` is a modulus equation and `(2z)^3 = 8` is
 * not an equation *about a letter*, so neither enumerates — treating them as solution sets would name
 * solutions the student never wrote a letter for.
 */
export function asRootsEquation(lhs: Expr, rhs: Expr, src: string): RootsEquation | null {
  if (lhs.t !== 'pow' || lhs.base.t !== 'ref') return null;
  if (!isWholeDegree(lhs.exp)) return null;
  const n = toNumber(lhs.exp);
  if (n < MIN_DEGREE) return null;
  return { varName: lhs.base.name, n, rhs, src };
}

const isWholeDegree = (e: Rat): boolean => isInt(e) && e.n > 0n;

/**
 * The constraints one reading emits — the whole difference between the three modes.
 *
 * **`constrain`** is the ordinary equation: one unknown, its turn unknown enumerated, and the solutions
 * genuinely ARE the configurations «show another configuration» walks (ADR-CX-005 modes 2 and 3).
 *
 * **`enumerate`/`anonymous`** is the exam's «פתרו את המשוואה»: the n solutions are one configuration
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
  const degree = rat(eq.n);
  if (mode === 'constrain') {
    return [{ lhs: pow(ref(eq.varName), degree), rhs: eq.rhs, src: eq.src }];
  }
  const sols = solutionNames(eq.varName, eq.n, mode === 'anonymous');
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
 * Which names the figure should DRAW for this reading, and which it must not.
 *
 * In `constrain` mode the letter is the number, so it is drawn. In the other two the letter is
 * reserved and the SOLUTIONS are drawn — declaring the letter as well would plot a point for a name
 * that stands for the whole set, at whatever position the sampler chose for it.
 */
export function solutionSetNames(eq: RootsEquation, mode: RootsMode): string[] {
  return mode === 'constrain'
    ? [eq.varName]
    : solutionNames(eq.varName, eq.n, mode === 'anonymous');
}
