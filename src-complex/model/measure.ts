/**
 * F7 — MEASURES: length, perimeter, area.
 *
 * ## One sentence form, and the engine decides what it does
 *
 * «שטח OZ₁Z₂Z₃ הוא 150r²» is a GIVEN in one exam question and a CLAIM to verify in another. docs/27
 * §10's P1 says the grammar defines one form and the *engine* decides which it is — and here that
 * decision is not a heuristic, it is arithmetic: if the figure still has a free degree of freedom the
 * measure can drive, tier 2 drives it; if the figure is already determined, the same residual is
 * simply evaluated and reported. A magnitude given and a magnitude claim are never two phrasings, and
 * nothing in the parser has to guess which one the student meant.
 *
 * ## Why these are the numeric tier's business
 *
 * A distance is `|z₁ − z₂|` and an area is a sum of cross products. Both contain addition, which has
 * no closed form in log-polar coordinates, so none of them can be a ℚ-linear row
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)). They are the reason stage 3 exists:
 * the §2b capstone pins θ with an area given and reads a perimeter of `60r` off the result.
 *
 * The right-hand side is an expression in real parameters (`15r`, `150r²`, `60r`), which is the
 * corpus's «הביעו באמצעות r» register — a measure is rarely given as a bare number.
 */

import type { Expr } from './expr';

export type MeasureKind = 'length' | 'perimeter' | 'area';

/** How many points each measure noun needs. A length is between two; the others enclose a region. */
export const MEASURE_ARITY: Readonly<Record<MeasureKind, { min: number; exact?: number }>> = {
  length: { min: 2, exact: 2 },
  perimeter: { min: 3 },
  area: { min: 3 },
};

/** «אורך Z₁Z₂ = 15r» — a measure of a named figure, equated to an expression in real parameters. */
export interface MeasureRelation {
  readonly kind: MeasureKind;
  /** the points the measure is taken over, in the stated order; may include the origin */
  readonly points: readonly string[];
  readonly rhs: Expr;
  readonly src: string;
}

/**
 * «שטח OZ₁Z₂Z₃» with no value — a request to DISPLAY the measure, not a statement about it.
 *
 * The same words minus the equating word, and that is why {@link EQUATES_KW} is required rather than
 * optional in the relation rule: an optional separator would silently turn a question into an
 * assertion. What comes back is a knowledge row, which prints a number only if the givens force one.
 */
export interface MeasureQuery {
  readonly kind: MeasureKind;
  readonly points: readonly string[];
  readonly src: string;
}

/** How a measure came out once the figure was solved. */
export type MeasureStatus =
  /** the figure satisfies it — either because it drove, or because it was already true */
  | 'holds'
  /** the figure does not satisfy it, and no configuration reachable from here does */
  | 'violated'
  /** it could not be evaluated: a point has no position, or a parameter no value */
  | 'undecided';

export interface CheckedMeasure {
  readonly relation: MeasureRelation;
  readonly status: MeasureStatus;
  /** the student-facing reason, naming their own statement rather than internal state */
  readonly why: string;
}

/** The plane geometry each noun means. Kept here so the solver reads relations, not formulas. */
export const measureOf = (
  kind: MeasureKind,
  pts: readonly { re: number; im: number }[],
): number | null => {
  if (pts.length < MEASURE_ARITY[kind].min) return null;
  switch (kind) {
    case 'length':
      return Math.hypot(pts[0].re - pts[1].re, pts[0].im - pts[1].im);
    case 'perimeter':
      return pts.reduce((acc, p, i) => {
        const q = pts[(i + 1) % pts.length];
        return acc + Math.hypot(p.re - q.re, p.im - q.im);
      }, 0);
    case 'area': {
      // the shoelace, absolute: orientation is not something the student stated
      let sum = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(i + 1) % pts.length];
        sum += pts[i].re * q.im - q.re * pts[i].im;
      }
      return Math.abs(sum) / 2;
    }
  }
};
