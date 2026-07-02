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
