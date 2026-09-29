/**
 * #1422 — ONE PRESS, ONE SOLVE: the fold-memo rule arrives in 3-D (ADR-3D-275).
 *
 * Operator, round #1408 T32: «takes it a long time to find a new config». ADR-3D-260 made every
 * derive SOLVE the free-point rider lane, and one press paid it at least twice
 * (`seedForRequirements` derives the candidate; the view derives it again) — measured ~500 ms per
 * press on «וקטור AB · אורך AB = 5», ~1.7 s for the #1415 coordinate pin. `derive3` is now
 * memoised on (facts identity, seed) — safe because every store action builds a NEW facts array.
 *
 * The lock is the COUNT, not the clock (a wall-clock lock flakes under suite contention — this
 * tree's own precedent): `deriveStats3.uncached` is the 2-D `conflictSearchStats` idiom, and one
 * press must cost exactly one uncached derive. The residual single-solve cost is recorded in the
 * ADR (~330 ms press / ~1.05 s coordinate pin on the measure box), with the deeper solver options
 * examined and declined there — never trading ADR-3D-260's 24/24 rate.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3, deriveStats3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
beforeEach(reset);

describe('#1422 — the press pays one solve', () => {
  it('five presses on the reported figure: one uncached derive each', () => {
    submit('וקטור AB');
    submit('אורך AB = 5');
    for (let i = 0; i < 5; i++) {
      const c0 = deriveStats3.uncached;
      useGeo3.getState().resample();
      const st = useGeo3.getState();
      derive3(st.facts, st.seed); // the view's own derive of the new seed
      expect(deriveStats3.uncached - c0, `press ${i + 1}`).toBe(1);
    }
  });

  it('a repeated derive of one (facts, seed) is the same object — panel, canvas and status share it', () => {
    submit('וקטור AB');
    submit('אורך AB = 5');
    const st = useGeo3.getState();
    expect(derive3(st.facts, st.seed)).toBe(derive3(st.facts, st.seed));
  });
});

describe('#1422 — the memo never staleness-bleeds', () => {
  it('a new fact derives fresh: the figure reflects it immediately', () => {
    submit('וקטור AB');
    const before = useGeo3.getState();
    const dBefore = derive3(before.facts, before.seed);
    submit('אורך AB = 5');
    const after = useGeo3.getState();
    const dAfter = derive3(after.facts, after.seed);
    expect(after.facts).not.toBe(before.facts); // the store's new-array property the memo keys on
    expect(dAfter).not.toBe(dBefore);
    const p = dAfter.resolved.positions;
    const a = p.get('A')!;
    const b = p.get('B')!;
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(5, 4);
  });

  it('different seeds derive different figures (the memo is per seed)', () => {
    submit('וקטור AB');
    const st = useGeo3.getState();
    const d0 = derive3(st.facts, 0);
    const d1 = derive3(st.facts, 1);
    expect(d0).not.toBe(d1);
  });
});
