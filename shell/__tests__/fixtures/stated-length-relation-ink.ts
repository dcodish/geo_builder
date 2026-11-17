/**
 * #1848 (ADR-794, ADR-AG-420, ADR-3D-428) — A STATED RELATION BETWEEN TWO LENGTHS DRAWS BOTH SEGMENTS, IN EVERY TOOL.
 *
 * The operator, 2026-10-07: *"if we draw AC there is no reason not to draw DB"*; 2026-10-30, on ratios: *"3 A - in all
 * tools"*. The parity rows carry a verdict, not ink, and `shell/` may not import a product, so the agreement is carried
 * the way `geo-input-parity.ts` carries it: each row states the segments, and each builder's thin lock
 * (`issue-1848-both-sides-drawn.test.ts`) asserts its own real submit path draws exactly those. Two locks that each equal
 * one literal equal each other.
 *
 * `drawn` is what the lines add beyond the ring's sides, as sorted unordered pairs. These are SEGMENTS: ADR-W-118 B2 keeps
 * a relation's marks out of the figure at rest, and it is untouched here (no tick, no label).
 */
export interface InkRow {
  steps: readonly string[];
  drawn: readonly string[];
}

const QUAD = 'מרובע ABCD';
const ISO_TRAPEZOID = 'טרפז שווה שוקיים ABCD';
const BOTH = ['AC', 'BD'];

export const STATED_LENGTH_RELATION_INK: readonly InkRow[] = [
  // the operator's report. #2790 (ADR-3D-484, ADR-W-200): 3-D's held row draws both diagonals again (ADR-3D-449 drew none)
  { steps: [ISO_TRAPEZOID, '|AC| = |BD|'], drawn: BOTH },
  { steps: [QUAD, '|AC| = |BD|'], drawn: BOTH },
  { steps: [QUAD, '|AC| = 2|BD|'], drawn: BOTH },
  { steps: [QUAD, 'AC = 2BD'], drawn: BOTH },
  { steps: [QUAD, 'AC:BD = 2:1'], drawn: BOTH },
  { steps: [QUAD, 'AC/BD = 2'], drawn: BOTH },
  { steps: [ISO_TRAPEZOID], drawn: [] }, // #1844: the noun's own condition names no diagonal
  { steps: [QUAD], drawn: [] },
];

/** A segment key, whichever way round it was written. */
export const inkKey = (a: string, b: string): string => [a, b].sort().join('');
