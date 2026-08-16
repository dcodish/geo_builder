/**
 * The sentence-family ids from the grammar contract — docs/27 §10 (F1–F13) and §10b (G1–G12).
 *
 * A separate file because it is a CONTRACT, not vocabulary: [ADR-CX-003](../../docs/06d-decisions-complex.md#adr-cx-003)
 * makes a question that fits no family a **family-level** addition to docs/27 first, never a one-off
 * parser rule — the anti-patch tripwire for this product. Typing catalog entries by family is what
 * makes "which families actually work today" a lookup instead of an opinion.
 */

/** Families authored from the original eight-exam reading. */
export type CoreFamilyId =
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'
  | 'F8' | 'F9' | 'F10' | 'F11' | 'F12' | 'F13';

/** Families the eleven-exam re-reading added (ADR-CX-007). */
export type ExtendedFamilyId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9';

export type FamilyId = CoreFamilyId | ExtendedFamilyId;

/** One line per family, so a coverage report reads in the operator's language rather than in ids. */
export const FAMILY_TITLE: Readonly<Record<FamilyId, string>> = {
  F1: 'declarations and parameter domains',
  F2: 'value definitions (name = expression)',
  F3: 'modulus relations',
  F4: 'argument relations',
  F5: 'location givens (quadrant, line, circle, region)',
  F6: 'objects (segment, polygon, circle)',
  F7: 'measures (length, perimeter, area)',
  F8: 'equations and solution sets',
  F9: 'sequences and series over C',
  F10: 'number-type claims (real, pure imaginary, conjugate)',
  F11: 'classification claims (triangle, quadrilateral, regular n-gon)',
  F12: 'quantified claims (for all n, minimal n, counting against a region)',
  F13: 'loci',
  G1: 'polynomial equations beyond X^n = expr',
  G2: 'generative point-set asks',
  G3: 'intersection as a constructor',
  G4: 'transform over a point set',
  G5: 'incidence on a regular n-gon',
  G6: 'equation synthesis (inverse F8)',
  G7: 'sums over a set, or of an expression in the terms',
  G8: 'real-parameter algebra',
  G9: 'non-linear loci',
};

export const ALL_FAMILIES = Object.keys(FAMILY_TITLE) as FamilyId[];
