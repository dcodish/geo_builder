/**
 * WHICH of a trapezoid's parallel sides is the LONG base — the CLASS test
 * ([ADR-341](docs/06-decisions.md#adr-341), issue #173).
 *
 * The long-base side is an unstated DISCRETE choice (ADR-052), and it was hard-baked twice: the template
 * seeds k = |DC|/|AB| = 0.6, and the sampler drew k ∈ [0.3, 0.85] — hard-capped below 1, so "show another
 * configuration" could NEVER show CD as the long base (the conformance smell CLAUDE.md names verbatim: a
 * fixed default masquerading as free). A stated «AB < CD» was then "repaired" by grinding k just past the
 * boundary (1.079 — a skewed near-parallelogram), instead of yielding the default.
 *
 * The contract locked here:
 *  - seed 0 keeps the canonical defaults: 0.6 plain, 1/0.6 when a stated order flips the base (the
 *    template-yield pre-scan — rotation by two names the same quad, so edges and legs are unchanged);
 *  - sampling straddles 1 with NO stated order (both branches reachable, never near 1 — a parallelogram
 *    is not a trapezoid) and stays IN the stated branch with one (no boundary grinding via "show another");
 *  - a statement CONSISTENT with the default is a no-op (no needless motion).
 */
import { describe, it, expect } from 'vitest';
import { replay } from '@/store/geoStore';
import { factsOf } from '../../__tests__/scenarios-corpus';
import type { Vec } from '@/engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const kOf = (fig: ReturnType<typeof replay>) =>
  dist(fig.positions.get('D')!, fig.positions.get('C')!) / dist(fig.positions.get('A')!, fig.positions.get('B')!);

describe("a trapezoid's long base (ADR-341 / #173)", () => {
  it('seed 0 keeps the canonical default (k = 0.6, AB the long base)', () => {
    expect(kOf(replay(factsOf(['טרפז ABCD']), 0))).toBeCloseTo(0.6, 3);
  });

  it('«AB < CD» flips the TEMPLATE — the first drawing is the mirror default (k = 1/0.6), never the k≈1.08 boundary grind', () => {
    const fig = replay(factsOf(['טרפז ABCD', 'AB < CD']), 0);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    expect(kOf(fig)).toBeCloseTo(1 / 0.6, 2); // the operator's "basic trapezoid with CD as the large base"
  });

  it('a statement CONSISTENT with the default («CD < AB») changes nothing', () => {
    expect(kOf(replay(factsOf(['טרפז ABCD', 'CD < AB']), 0))).toBeCloseTo(0.6, 3);
  });

  it('the ADR-052 smell gate: with NO stated order, sampled k straddles 1 — and never lands near it', () => {
    const facts = factsOf(['טרפז ABCD']);
    const ks = Array.from({ length: 12 }, (_, i) => kOf(replay(facts, i + 1)));
    expect(ks.some((k) => k < 1), `a short-top sample exists (got ${ks.map((k) => k.toFixed(2)).join(' ')})`).toBe(true);
    expect(ks.some((k) => k > 1), `a long-top sample exists (got ${ks.map((k) => k.toFixed(2)).join(' ')})`).toBe(true);
    // The parallelogram neighbourhood is excluded — the honest boundary (k=1 is not a trapezoid).
    for (const k of ks) expect(k < 0.9 || k > 1.15, `k=${k.toFixed(3)} too close to 1`).toBe(true);
  });

  it('a STATED order pins the sampled branch — "show another" never grinds back to the boundary', () => {
    const stated = factsOf(['טרפז ABCD', 'AB < CD']);
    for (let s = 1; s <= 10; s++) {
      const k = kOf(replay(stated, s));
      expect(k, `seed ${s}: CD stays the long base with margin`).toBeGreaterThan(1.15);
    }
    const rev = factsOf(['טרפז ABCD', 'CD < AB']);
    for (let s = 1; s <= 10; s++) {
      const k = kOf(replay(rev, s));
      expect(k, `seed ${s}: AB stays the long base with margin`).toBeLessThan(0.9);
    }
  });

  it('the iso-trapezoid macro keeps its equal LEGS under the flip (rotation preserves legs)', () => {
    const fig = replay(factsOf(['טרפז שווה שוקיים ABCD', 'AB < CD']), 0);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    expect(kOf(fig), 'CD the long base').toBeGreaterThan(1.15);
    const leg1 = dist(fig.positions.get('A')!, fig.positions.get('D')!);
    const leg2 = dist(fig.positions.get('B')!, fig.positions.get('C')!);
    expect(Math.abs(leg1 - leg2), '|AD| = |BC| (the legs stay legs)').toBeLessThan(1e-3);
  });
});
