/**
 * A CLAIM is the student's answer, never a driver.
 *
 * The sibling products both landed on this and it is the sharpest pedagogical idea either of them has:
 * *"CLAIMS are the student's answer, never a driver. A claim is verified across several seeded
 * configurations and refused when wrong"* (`src3d/CLAUDE.md`). The figure is built from the givens; a
 * claim is checked against it. That is the difference between a tool that teaches and a tool that
 * agrees with you — a claim that could move the figure would make every answer correct.
 *
 * Family **F10** in the grammar contract (docs/27 §10), present in five of the eleven sampled exams:
 * «w מדומה טהור», «z₁ ו-z₂ צמודים זה לזה», «w₁ ממשי».
 *
 * What makes them worth having here rather than as a numeric spot-check is that they are **decided
 * exactly** over the value layer's carriers — `arg z ≡ 0 (mod ½ turn)` is real, `≡ ¼` is pure
 * imaginary, conjugates are equal moduli with opposing arguments. No sampling, no tolerance, and
 * therefore an answer that holds for every configuration rather than for the one on screen.
 */

import type { Why } from './why';

export type Claim =
  /** «w ממשי» — the number is real */
  | { readonly kind: 'real'; readonly name: string; readonly src: string }
  /** «w מדומה טהור» — the number is pure imaginary */
  | { readonly kind: 'imaginary'; readonly name: string; readonly src: string }
  /** «z₁ ו-z₂ צמודים זה לזה» — the two are conjugates of each other */
  | { readonly kind: 'conjugates'; readonly a: string; readonly b: string; readonly src: string }
  /**
   * F12 — «לכל n טבעי, w^(4n) ממשי». A claim about EVERY power at once.
   *
   * The exponent is `k·n + c`, which is the corpus's shape («w^(4n)», «w^(4n+2)», «z^(6n)»), and the
   * claim is decided by a congruence on turns rather than by trying values of n: `w^m` is real iff
   * `2m·θ ≡ 0 (mod 1)`, so «for every n» is two integer conditions and no search
   * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006) D1's whole purpose).
   */
  | {
      readonly kind: 'forall-power';
      readonly name: string;
      readonly k: number;
      readonly c: number;
      readonly prop: 'real' | 'imaginary';
      readonly src: string;
    }
  /**
   * F12 — «ה-n המינימלי שעבורו wⁿ מדומה טהור הוא 5»: the student's answer to a minimal-n ask.
   *
   * One sentence form, and the student states their n — the charter's shape. The engine solves the
   * same congruence for its least solution and agrees or does not.
   */
  | {
      readonly kind: 'minimal-power';
      readonly name: string;
      readonly prop: 'real' | 'imaginary';
      readonly stated: number;
      readonly src: string;
    };

/**
 * How a claim came out. `unknown` is a first-class answer, not a failure.
 *
 * The `why` is a structured code (#716): the engine states WHAT happened; the reading layer
 * words it in the UI's language. See `model/why.ts`.
 */
export type ClaimVerdict =
  /** the givens FORCE it — decided exactly, true in every configuration */
  | { readonly status: 'holds'; readonly why: Why }
  /** the givens forbid it — decided exactly */
  | { readonly status: 'refuted'; readonly why: Why }
  /**
   * Not decidable from what has been stated.
   *
   * Deliberately distinct from `refuted`: a claim about a direction the givens leave free is not
   * wrong, it is unanswered, and marking it ✗ would tell a student their correct answer was incorrect
   * because they had not finished entering the question.
   */
  | { readonly status: 'unknown'; readonly why: Why };

export interface CheckedClaim {
  readonly claim: Claim;
  readonly verdict: ClaimVerdict;
}

export const claimSubjects = (c: Claim): string[] => (c.kind === 'conjugates' ? [c.a, c.b] : [c.name]);
