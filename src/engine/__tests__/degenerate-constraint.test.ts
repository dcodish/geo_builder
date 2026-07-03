/**
 * ADR-202 — a ∥/⟂ constraint whose operand segment is zero-length (its two endpoint ids are the same
 * point) is rejected up front by `applyStep`, before the solver ever sees the NaN-direction residual.
 *
 * Regression: "BB משיק למעגל P בנקודה B" (a tangent named by one repeated point) emitted
 * `set-perpendicular(P,B,B,B)`; the B→B operand has no direction, so `recruitFreeDofs` + the joint
 * optimizer churned ~4.4 s per replay before a bogus over-constraint — and the app's config-search
 * loop ran that slow replay many times, freezing the UI. The guard makes it fail in ~1 ms.
 */
import { describe, it, expect } from 'vitest';
import { applyStep, build } from '@/engine';
import type { Command, Construction } from '@/engine';

const c = (o: object) => o as unknown as Command;

/** A minimal figure with two distinct points A, B and a third C. */
function twoPoints(): Construction {
  const { construction } = build([
    c({ type: 'segment', a: 'A', b: 'B' }),
    c({ type: 'point-on-segment', id: 'C', a: 'A', b: 'B', t: 0.5 }),
  ]);
  return construction;
}

describe('ADR-202 — degenerate ∥/⟂ operand is rejected fast, not churned', () => {
  it('⟂ with c === d ("BB") fails immediately with a clear message', () => {
    const t0 = Date.now();
    const r = applyStep(twoPoints(), c({ type: 'set-perpendicular', a: 'A', b: 'C', c: 'B', d: 'B' }));
    const ms = Date.now() - t0;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/distinct points|single point/);
    expect(ms).toBeLessThan(500); // no solver churn (the bug spent ~4400 ms here)
  });

  it('⟂ with a === b is rejected too', () => {
    const r = applyStep(twoPoints(), c({ type: 'set-perpendicular', a: 'A', b: 'A', c: 'B', d: 'C' }));
    expect(r.ok).toBe(false);
  });

  it('∥ with a zero-length operand is rejected', () => {
    const r = applyStep(twoPoints(), c({ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'C' }));
    expect(r.ok).toBe(false);
  });

  it('a WELL-FORMED ⟂ (two distinct points per segment) is NOT rejected by the guard', () => {
    // A ∥/⟂ between real segments still goes through the normal path (this one is satisfiable → ok).
    const fig = build([
      c({ type: 'square', ids: ['A', 'B', 'C', 'D'] }),
    ]).construction;
    const r = applyStep(fig, c({ type: 'set-perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' })); // AB ⟂ BC (already true in a square)
    expect(r.ok).toBe(true);
  });
});

describe('ADR-202 Am. — the whole NaN-by-id class is guarded, not only ∥/⟂ (review 2026-07-03)', () => {
  // The set-angle sibling ADR-202 parked as "no repro" was PROVEN reachable: "זווית ABB = 40" parses
  // to set-angle(vertex B, ray2 B), angleDeg of the zero ray is NaN, and the app's config search ran
  // ~20 s of churn per submit, re-firing on every later utterance while the fact stayed in the list.
  it('set-angle with a ray repeating its vertex ("∠ABB") fails immediately', () => {
    const t0 = Date.now();
    const r = applyStep(twoPoints(), c({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'B', value: 40 }));
    const ms = Date.now() - t0;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/distinct points/);
    expect(ms).toBeLessThan(500);
  });

  it('set-angle-ratio with a degenerate arm is rejected (either side)', () => {
    const r1 = applyStep(twoPoints(), c({ type: 'set-angle-ratio', v1: 'A', a1: 'A', b1: 'B', v2: 'B', a2: 'A', b2: 'C', k: 2 }));
    expect(r1.ok).toBe(false);
    const r2 = applyStep(twoPoints(), c({ type: 'set-angle-ratio', v1: 'C', a1: 'A', b1: 'B', v2: 'B', a2: 'B', b2: 'C', k: 2 }));
    expect(r2.ok).toBe(false);
  });

  it('set-collinear with a repeated point is rejected', () => {
    const r = applyStep(twoPoints(), c({ type: 'set-collinear', a: 'A', b: 'A', c: 'B' }));
    expect(r.ok).toBe(false);
  });

  it('set-line with a duplicated point is rejected', () => {
    const r = applyStep(twoPoints(), c({ type: 'set-line', points: ['A', 'B', 'A'] }));
    expect(r.ok).toBe(false);
  });

  it('a WELL-FORMED set-angle is NOT rejected by the guard', () => {
    const fig = build([c({ type: 'square', ids: ['A', 'B', 'C', 'D'] })]).construction;
    const r = applyStep(fig, c({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 })); // true in a square
    expect(r.ok).toBe(true);
  });

  it('a zero angle between DISTINCT coincident-direction rays is not structurally degenerate (finite, no guard)', () => {
    // ∠ABA: ray1 === ray2 (≠ vertex) → angleDeg = 0, a finite residual — the solver fails it cleanly
    // (or passes value 0); the guard must not reject it as NaN-degenerate.
    const r = applyStep(twoPoints(), c({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'A', value: 0 }));
    expect(r.ok).toBe(true); // ∠ABA = 0 holds trivially
  });
});
