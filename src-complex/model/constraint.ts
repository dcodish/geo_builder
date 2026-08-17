/**
 * What a stated relation IS — the model's vocabulary, not the solver's.
 *
 * These types lived in `solve/tier1.ts` until the layer guard caught `parser → solve`: the parser must
 * name what the student said without depending on how it gets solved, or the grammar and the solver
 * cannot evolve independently (docs/11's phase-boundary rule, and 2-D's NFR-MT-2). A constraint is a
 * MODEL fact; tier 1 is one consumer of it, and the numeric tier will be another.
 */

import type { Expr } from './expr';
import type { Rat } from '../value/rational';

/**
 * One stated relation. `src` is the student's own line, carried so a refusal can quote it.
 *
 * `kind` exists because two corpus families are NOT complex equations. `|z₁| = 9r` (F3) says nothing
 * about direction, and `arg Z₁ − arg Z₂ = 90°` (F4) says nothing about magnitude — writing either as a
 * full equation would invent the half the student did not state, which is ADR-052 in its purest form.
 * Each therefore constrains only the row it actually speaks about.
 */
export interface Constraint {
  readonly lhs: Expr;
  readonly rhs: Expr;
  /** `eq` (the default) constrains both rows · `mod` the magnitude only · `arg` the direction only */
  readonly kind?: 'eq' | 'mod' | 'arg';
  /** for `arg` only: `arg(lhs) − arg(rhs) = deltaTurns`, in turns */
  readonly deltaTurns?: Rat;
  /**
   * Pin this row's turn unknown to zero — read the PRINCIPAL value rather than enumerating.
   *
   * Every argument row is otherwise stated modulo a whole turn, and that integer freedom is the branch
   * set (ADR-CX-006). One case is not a branch: when an equation's n solutions are all drawn at once as
   * X₁..Xₙ, *which* solution is called X₁ is a labelling convention, not a configuration the student can
   * see ([ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005) mode 1). Left un-pinned, the n
   * rotations of the same point SET would enumerate as n identical-looking configurations and
   * «show another configuration» would offer a walk through relabelings — which is precisely what
   * [ADR-CX-020](../../docs/06d-decisions-complex.md#adr-cx-020) ruled there is nothing of here.
   *
   * Set ONLY by the solution-set lowering. Ordinary equations keep their turn unknown, so #607's
   * genuinely multi-configuration family is untouched.
   */
  readonly principal?: boolean;
  readonly src?: string;
}

/**
 * An inequality given. It determines nothing — a whole region satisfies it — so it SELECTS among the
 * configurations the equations already produced, and is never solved as if it were an equation.
 */
export type BranchFilter =
  /** strict interior of a quadrant, numbered the exam's way: 1 = (0°, 90°) */
  | { readonly kind: 'quadrant'; readonly name: string; readonly q: 1 | 2 | 3 | 4; readonly src?: string }
  /** an open range in degrees; either end may be omitted */
  | { readonly kind: 'range'; readonly name: string; readonly minDeg?: Rat; readonly maxDeg?: Rat; readonly src?: string }
  /** the direction is exactly this many degrees */
  | { readonly kind: 'exact'; readonly name: string; readonly deg: Rat; readonly src?: string };
