/**
 * #1769 (ADR-3D-395) — a pin symbol's admissible roots are ONE set: one root predicate, one pool-closing walk, and
 * every consumer reads the pool's record.
 *
 * The operator's prism (round #1767): «מנסרה ישרה משולשת ABCA'B'C'» · «AA'=(k-1,k-7,k+1)» · «AC על הישר
 * x=(8,-1,-1)+t(k+1,0,k-3)». The right-prism condition is (k+1)(2k−4) = 0, so k ∈ {−1, 2}, both valid. Before, the
 * stage-4 membership drive kept the FIRST root its search order reached, its pool had one root at every seed (k = 2 at
 * 19, k = −1 at 4), and the panel printed «k = 2» as if the givens had forced it. Ruled 2026-10-04: «show both»; the
 * format is ADR-3D-336's (operator ruling W1): «k = -1 או k = 2».
 *
 * Everything here runs through the real submit path (`useGeo3.submit` → `derive3` → `dataView`), nothing mocked.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView, rootSetsAgree } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const PRISM = "מנסרה ישרה משולשת ABCA'B'C'";
const VEC = "AA'=(k-1,k-7,k+1)";
const LINE = 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)';
const BOTH = { sym: 'k', text: 'k = -1 או k = 2', value: '-1 או k = 2', open: false };

const build = (lines: string[]): void => {
  for (const u of lines) {
    submit(u);
    expect(state().lastError, u).toBeNull();
  }
};
const rootsAt = (seed: number): number[] =>
  [...(derive3(state().facts, seed).resolved.pivot?.symRoots?.k ?? [])].sort((a, b) => a - b);
const near = (got: number[], want: number[]): boolean => got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) < 1e-3);

describe('#1769 — the prism reads both of its roots', () => {
  beforeEach(reset);

  it('the panel reads «k = -1 או k = 2», never one root as if it were determined', () => {
    build([PRISM, VEC, LINE]);
    for (const seed of [0, 1, 2]) {
      expect(dataView(derive3(state().facts, seed).construction, seed).params, `seed ${seed}`).toEqual([BOTH]);
    }
  }, 120_000);

  it('every sampled pool carries both roots, and every figure verifies', () => {
    build([PRISM, VEC, LINE]);
    // 2 and 10 drew k = −1 before; 0 and 1 drew k = 2 — the pool now carries the other root at each
    for (const seed of [0, 1, 2, 10]) {
      const d = derive3(state().facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok'), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(near(rootsAt(seed), [-1, 2]), `seed ${seed}: roots ${rootsAt(seed)}`).toBe(true);
    }
  }, 120_000);

  it('both roots are REACHABLE: «הציגו תצורה אחרת» draws k = −1 and k = 2, and nothing between', () => {
    build([PRISM, VEC, LINE]);
    const seen = new Set<number>();
    for (const seed of [0, 1, 2, 3]) {
      const k = derive3(state().facts, seed).resolved.pivot?.pinSymbols?.k;
      expect(k, `seed ${seed}`).toBeTypeOf('number');
      expect(Math.min(Math.abs(k! + 1), Math.abs(k! - 2)), `seed ${seed}: k = ${k}`).toBeLessThan(1e-3);
      seen.add(Math.round(k!));
    }
    expect([...seen].sort()).toEqual([-1, 2]);
  }, 120_000);

  it('the class, in the other entry order: the line first, then the vector — the same set', () => {
    build([PRISM, LINE, VEC]);
    expect(near(rootsAt(0), [-1, 2]), `roots ${rootsAt(0)}`).toBe(true);
  }, 120_000);
});

// The #797 vector edition (k ∈ {1, 2}, now «k = 1 או k = 2») and its determined control («k = 2» after the third
// vector) are locked in issue-797.test.ts, whose first case moved by the 2026-10-04 ruling.

describe('#1769 — rootSetsAgree, the one "the root set agrees" test', () => {
  it('agrees in any order within the tolerance, and not across a missing or a moved root', () => {
    expect(rootSetsAgree([[2, -1], [-1, 2.00002]], 1e-4)).toBe(true);
    expect(rootSetsAgree([[2, -1], [2]], 1e-4)).toBe(false);
    expect(rootSetsAgree([[2, -1], [2, -1.01]], 1e-4)).toBe(false);
    expect(rootSetsAgree([[-Math.SQRT2, Math.SQRT2], [-Math.SQRT2, Math.SQRT2]], 1e-6)).toBe(true);
  });
});
