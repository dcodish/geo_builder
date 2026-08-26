/**
 * #794 (ADR-3D-168) — pair-vector injection with SYMBOLIC components: the operator's bagrut Q2
 * (right prism ABCA'B'C', 2026-08-26), entered the way the exam prints it:
 *
 *   «מנסרה ישרה משולשת ABC»
 *   «AA'=(k-1,k-7, k+1)»            ← the operator's exact utterance (spacing included)
 *   «AB = (k-1, k, 3)»
 *   «AC = (k+1, 0, k-3)»
 *
 * The right-prism structure (AA' ⊥ AB, AA' ⊥ AC) pins k: AA'·AB = 2k²−6k+4 = 0 ⇒ k ∈ {1,2},
 * AA'·AC = 2k²−2k−4 = 0 ⇒ k ∈ {2,−1} — jointly k = 2, so AA' = (1,−5,3), AB = (1,2,3),
 * AC = (3,0,−1). The symbolic pair pins join the pivot exactly as `B(2t,t,k)` point pins do
 * (#325), and `param-sign` reaches a PAIR symbol because pinSymsOf spans all three pin families.
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

const Q2 = ['מנסרה ישרה משולשת ABC', "AA'=(k-1,k-7, k+1)", 'AB = (k-1, k, 3)', 'AC = (k+1, 0, k-3)'];

describe('#794 — the bagrut Q2 prism: symbolic pair pins determine k', () => {
  beforeEach(reset);

  it('builds clean and pins k = 2 at every seed; the stated vectors land exactly', () => {
    for (const u of Q2) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(d.resolved.pivot?.pinSymbols?.k, `seed ${seed}: the structure pins k`).toBeCloseTo(2, 3);
      const A = d.positions.get('A')!;
      const Ap = d.positions.get("A'")!;
      const B = d.positions.get('B')!;
      const C = d.positions.get('C')!;
      for (const [w, target] of [
        [{ x: Ap.x - A.x, y: Ap.y - A.y, z: Ap.z - A.z }, { x: 1, y: -5, z: 3 }],
        [{ x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }, { x: 1, y: 2, z: 3 }],
        [{ x: C.x - A.x, y: C.y - A.y, z: C.z - A.z }, { x: 3, y: 0, z: -1 }],
      ] as const) {
        expect(w.x, `seed ${seed}`).toBeCloseTo(target.x, 3);
        expect(w.y, `seed ${seed}`).toBeCloseTo(target.y, 3);
        expect(w.z, `seed ${seed}`).toBeCloseTo(target.z, 3);
      }
    }
  });

  it('the data panel reports the pair symbol determined: «k = 2»', () => {
    for (const u of Q2) submit(u);
    const d = derive3(state().facts, state().seed);
    const params = dataView(d.construction, state().seed).params;
    expect(params).toEqual([{ sym: 'k', text: 'k = 2', open: false }]);
  });

  it('a sign given reaches a PAIR symbol: «k חיובי» passes (k = 2), «k < 0» refuses', () => {
    for (const u of Q2) submit(u);
    submit('k חיובי');
    expect(err()).toBeNull();
    submit('k < 0');
    expect(err()).toEqual({ code: 'sign-unsatisfiable', id: 'k' });
  });

  it('a lone symbolic pair given leaves k OPEN and seed-varying (ADR-052)', () => {
    submit('מנסרה ישרה משולשת ABC');
    submit("AA'=(k-1,k-7, k+1)");
    expect(err()).toBeNull();
    const ks: number[] = [];
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const k = d.resolved.pivot?.pinSymbols?.k;
      expect(k, `seed ${seed}`).toBeTypeOf('number');
      ks.push(k!);
    }
    // an OPEN symbol must vary with the seed — a value the sampler never explores is a
    // default masquerading as determined (the ADR-3D-079 Am. 2 conformance lock)
    expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(1e-3);
  });
});
