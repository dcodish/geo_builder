/**
 * #797 (ADR-3D-168 Am. 1) — a pin symbol with several DISCRETE admissible roots is not determined.
 * The operator's PR #796 play (2026-08-26): on the Q2 prism, after only TWO of the three vector
 * givens the structure gives 2k²−6k+4 = 0 ⇒ k ∈ {1, 2} — the panel printed «k = 1» (a branch
 * choice masquerading as knowledge) and «show another configuration» could never reach k = 2,
 * because best-per-mirror kept a single k-basin. Operator ruling: only a fully determined symbol
 * shows a value; otherwise «k = ?».
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;

const TWO_VECTORS = ['מנסרה ישרה משולשת ABC', "AA'=(k-1,k-7, k+1)", 'AB = (k-1, k, 3)'];

describe('#797 — discrete pin-symbol roots read OPEN, and the pool carries them all', () => {
  beforeEach(reset);

  it('two of the three vectors: k ∈ {1,2} — the panel reads «k = ?», never a picked branch', () => {
    for (const u of TWO_VECTORS) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    const params = dataView(derive3(state().facts, state().seed).construction, state().seed).params;
    expect(params).toEqual([{ sym: 'k', text: 'k = ?', open: true }]);
  });

  it('both roots are REACHABLE: configurations across seeds visit k ≈ 1 and k ≈ 2, nothing else', () => {
    for (const u of TWO_VECTORS) submit(u);
    const seen = new Set<number>();
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive3(state().facts, seed);
      const k = d.resolved.pivot?.pinSymbols?.k;
      expect(k, `seed ${seed}`).toBeTypeOf('number');
      // every shown configuration sits ON a root — never between them
      expect(Math.min(Math.abs(k! - 1), Math.abs(k! - 2)), `seed ${seed}: k = ${k}`).toBeLessThan(1e-3);
      seen.add(Math.round(k!));
      // the admissible pool itself carries both roots (the honesty gates read this set)
      const roots = d.resolved.pivot?.symRoots?.k ?? [];
      expect(roots.length, `seed ${seed}: pool roots ${roots}`).toBe(2);
    }
    expect([...seen].sort()).toEqual([1, 2]); // «show another configuration» reaches BOTH
  });

  it('the third vector determines: the panel returns to «k = 2» (the joint root)', () => {
    for (const u of [...TWO_VECTORS, 'AC = (k+1, 0, k-3)']) submit(u);
    const params = dataView(derive3(state().facts, state().seed).construction, state().seed).params;
    expect(params).toEqual([{ sym: 'k', text: 'k = 2', open: false }]);
  });
});
