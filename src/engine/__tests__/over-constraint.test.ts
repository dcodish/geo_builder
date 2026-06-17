/**
 * Negative-space coverage (Tier B, ADR-047). The campaign and scenario suites are almost entirely
 * POSITIVE — "this figure builds and its invariants hold." A teaching tool also needs the opposite
 * guarantee: a contradiction is REJECTED (over-constrained), and the prior figure is preserved
 * (FR-EN-8), never silently mis-drawn. These figures are built from PINNED points (no free DOF to
 * absorb the constraint), so a wrong measure is provably unsatisfiable — the over-constraint is
 * guaranteed by construction, not by luck. Each case pairs a CONTRADICTING constraint (must fail)
 * with a CONSISTENT one (must succeed), so we also prove the rejection isn't spurious.
 */
import { describe, it, expect } from 'vitest';
import type { Command } from '@/engine';
import { build, applyStep } from '@/engine';

// A 3-4-5 right triangle from pinned points: |AB|=4, |AC|=3, |BC|=5, ∠BAC=90°, ∠ABC≈36.87°.
const TRIANGLE: Command[] = [
  { type: 'free-point', id: 'A', x: 0, y: 0 },
  { type: 'free-point', id: 'B', x: 4, y: 0 },
  { type: 'free-point', id: 'C', x: 0, y: 3 },
];
// Four pinned points with |AB|=4, |CD|=4, |AC|=3, |BD|=3.
const QUAD: Command[] = [
  ...TRIANGLE,
  { type: 'free-point', id: 'D', x: 4, y: 3 },
];

/** A constraint over fully-pinned points must FAIL when violated and keep the prior figure. */
function expectOverConstrained(base: Command[], bad: Command): void {
  const fig = build(base);
  const r = applyStep(fig.construction, bad);
  expect(r.ok, 'a contradicting constraint over pinned points must be rejected').toBe(false);
  if (!r.ok) {
    expect(r.error).toMatch(/over-constrained|cannot/i);
    expect(r.construction).toBe(fig.construction); // prior figure preserved (FR-EN-8)
  }
}

/** The CONSISTENT version of the same constraint must succeed (the rejection isn't spurious). */
function expectAccepted(base: Command[], good: Command): void {
  const fig = build(base);
  const r = applyStep(fig.construction, good);
  expect(r.ok, 'a consistent constraint over pinned points must be accepted').toBe(true);
}

describe('over-constraint detection — contradictions are rejected, the prior figure is kept', () => {
  it('a wrong DISTANCE on a determined segment is over-constrained (|BC| is 5, not 9)', () => {
    expectOverConstrained(TRIANGLE, { type: 'set-distance', a: 'B', b: 'C', value: 9 });
    expectAccepted(TRIANGLE, { type: 'set-distance', a: 'B', b: 'C', value: 5 });
  });

  it('a wrong ANGLE on a determined vertex is over-constrained (∠BAC is 90°, not 60°)', () => {
    expectOverConstrained(TRIANGLE, { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'C', value: 60 });
    expectAccepted(TRIANGLE, { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'C', value: 90 });
  });

  it('a false EQUALITY of two determined segments is over-constrained (|AB|=4 ≠ |AC|=3)', () => {
    expectOverConstrained(QUAD, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expectAccepted(QUAD, { type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' }); // |AB|=4=|CD|
  });

  it('a wrong RATIO between determined segments is over-constrained (|AB|/|AC| is 4/3, not 1/3)', () => {
    expectOverConstrained(TRIANGLE, { type: 'set-ratio', a: 'A', b: 'B', c: 'A', d: 'C', k: 1 / 3 });
    expectAccepted(TRIANGLE, { type: 'set-ratio', a: 'A', b: 'B', c: 'A', d: 'C', k: 4 / 3 }); // |AB| = (4/3)|AC|
  });
});
