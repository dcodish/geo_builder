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
  readonly src?: string;
}

/**
 * An inequality given. It determines nothing — a whole region satisfies it — so it SELECTS among the
 * configurations the equations already produced, and is never solved as if it were an equation.
 */
export type BranchFilter =
  /** strict interior of a quadrant, numbered the exam's way: 1 = (0°, 90°) */
  | { readonly kind: 'quadrant'; readonly name: string; readonly q: 1 | 2 | 3 | 4 }
  /** an open range in degrees; either end may be omitted */
  | { readonly kind: 'range'; readonly name: string; readonly minDeg?: Rat; readonly maxDeg?: Rat }
  /** the direction is exactly this many degrees */
  | { readonly kind: 'exact'; readonly name: string; readonly deg: Rat };
