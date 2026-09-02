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
  /**
   * REQUIRED (#716): every constraint quotes the line that stated it. It was optional once, and the
   * optionality forced Hebrew fallback prose into the solver (`'משוואה'`, `describeFilter`) — a
   * refusal about a constraint nobody stated is a bug to surface, not a sentence to invent.
   */
  readonly src: string;
}

/**
 * An inequality given. It determines nothing — a whole region satisfies it — so it SELECTS among the
 * configurations the equations already produced, and is never solved as if it were an equation.
 */
export type BranchFilter =
  /** strict interior of a quadrant, numbered the exam's way: 1 = (0°, 90°) */
  | { readonly kind: 'quadrant'; readonly name: string; readonly q: 1 | 2 | 3 | 4; readonly src: string }
  /** an open range in degrees; either end may be omitted */
  | { readonly kind: 'range'; readonly name: string; readonly minDeg?: Rat; readonly maxDeg?: Rat; readonly src: string }
  /** the direction is exactly this many degrees */
  | { readonly kind: 'exact'; readonly name: string; readonly deg: Rat; readonly src: string };

/**
 * A SELECTION — «z₀ הוא הפתרון ברביע הרביעי» (#694,
 * [ADR-CX-037](../../docs/06d-decisions-complex.md#adr-cx-037)).
 *
 * Four of the eight sampled exams enumerate roots and then pick one by a condition (docs/27 §2,
 * archetype 2), and this is the sentence they write. It is neither a branch prune nor a constraint on a
 * member: an enumeration is ONE configuration containing n points ([ADR-CX-021](../../docs/06d-decisions-complex.md#adr-cx-021)),
 * so there are no n branches left for a filter to thin, and «z₁ ברביע הראשון» constrains the *wrong*
 * thing — z₁ is a determined point and the exam is not claiming anything about it.
 *
 * What the exam does is **bind a NEW name to the member of the set that satisfies the condition**. The
 * bare letter stays reserved for the set (ADR-CX-024, untouched by the operator's 2026-08-26 ruling:
 * the exams always introduce a new name, so the named form covers the corpus and the bare form buys a
 * sentence nobody writes).
 *
 * `filter` is scoped over a FILTER PREDICATE rather than over the quadrant noun — the same sentence
 * will want «הפתרון הממשי» and «הפתרון שבו …», and enumerating filter nouns is the habit this tree
 * keeps paying for (`src-complex/CLAUDE.md`).
 */
export interface Selection {
  /** the new name the student is binding */
  readonly name: string;
  /** which member of the set: any filter, judged against each candidate's own direction */
  readonly filter: BranchFilter;
  /** the student's sentence, quoted verbatim by every refusal */
  readonly src: string;
}
