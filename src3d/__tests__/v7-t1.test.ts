/**
 * V7 T1 — vector-defined points (ADR-3D-010), through the REAL submit path, on the
 * corpus forms:
 *  - known coefficients, unknown in the LHS:  A'K = 4/5 DN  (2018)
 *  - unknown coefficient + a ∥-plane pin:     DF = (k/2)DB + kDC, EF ∥ plane ABC  (2023-ב)
 *  - the cevian pair:                          CF = k·CD, BF = t·BE  (2021-קיץ-ב)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dist3, sub3, cross3, norm3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

describe('V7 T1 — vector-defined points', () => {
  beforeEach(reset);

  it("known coefficients: A'K = 4/5 DN places K exactly (2018 form)", () => {
    ['קובייה ABCD', 'M אמצע DC'].forEach(submit); // N stand-in: use M on DC
    submit("A'K = 4/5 A'M");
    expect(state().lastError).toBeNull();
    const pos = derived().positions;
    const K = pos.get('K')!;
    const A2 = pos.get("A'")!;
    const M = pos.get('M')!;
    expect(dist3(K, A2)).toBeCloseTo(0.8 * dist3(M, A2), 10);
    expect(norm3(cross3(sub3(K, A2), sub3(M, A2)))).toBeCloseTo(0, 10); // K on the A'M line
  });

  it('unknown INSIDE the expression: AD = 2/3u + 1/3v defines C when v = AC (2021-חורף form)', () => {
    ['A(0,2,-1)', 'B(-3,2,2)', 'D(-2,3,1)'].forEach(submit);
    submit('נסמן: AB = u, AC = v'); // C does not exist yet — v's head is the unknown
    expect(state().lastError).toEqual({ code: 'unknown-point', id: 'C' }); // naming needs existing points — correct refusal
    // the exam's flow instead DEFINES C through the relation with a PAIR atom:
    submit('AD = 2/3AB + 1/3AC');
    expect(state().lastError).toBeNull();
    const pos = derived().positions;
    const C = pos.get('C')!;
    // AD = ⅔AB + ⅓AC ⇒ AC = 3AD − 2AB ⇒ C = A + 3(D−A) − 2(B−A)
    expect(C.x).toBeCloseTo(0 + 3 * -2 - 2 * -3, 8);
    expect(C.y).toBeCloseTo(2 + 3 * 1 - 2 * 0, 8);
    expect(C.z).toBeCloseTo(-1 + 3 * 2 - 2 * 3, 8);
  });

  it('an unknown coefficient is a FREE DOF until pinned; the ∥-plane condition pins it (2023-ב shape)', () => {
    // a tetrahedron stand-in on the cube: F = D + (k/2)·DB + k·DC', E mid of DA'
    ['קובייה ABCD', "E אמצע DA'"].forEach(submit);
    submit("DF = (k/2)DB + kDC'");
    expect(state().lastError).toBeNull();
    const f0 = derived().positions.get('F')!;
    useGeo3.getState().resample();
    const f1 = derived().positions.get('F')!;
    expect(dist3(f0, f1)).toBeGreaterThan(1e-4); // free k resamples
    useGeo3.getState().resample(); // back off (seed only moves forward; just proceed)
    submit('EF מקביל למישור ABC');
    expect(state().lastError).toBeNull();
    const pos = derived().positions;
    const E = pos.get('E')!;
    const F = pos.get('F')!;
    // ∥ base plane z=0 ⇒ EF has no z-component
    expect(F.z - E.z).toBeCloseTo(0, 8);
  });

  it('the cevian pair: CF = k·CD, BF = t·BE meet at the true intersection (2021-קיץ shape)', () => {
    // triangle in space from coordinates; D mid AB, E on AC with AE:EC = 2:1
    ['A(0,0,0)', 'B(6,0,0)', 'C(0,6,0)'].forEach(submit);
    submit('D אמצע AB');
    submit('E על AC כך ש-AE:EC = 2:1');
    submit('CF = kCD');
    submit('BF = tBE');
    expect(state().lastError).toBeNull();
    const pos = derived().positions;
    const F = pos.get('F')!;
    // known cevian intersection: D=(3,0,0), E=(0,4,0); line CD ∩ line BE
    // CD: (0,6,0)+k(3,-6,0); BE: (6,0,0)+t(-6,4,0) → k: 3k=6-6t, 6-6k=4t → k=3/4? solve: from x: k=2-2t; y: 6-6(2-2t)=4t → -6+12t=4t → t=3/4 → k=1/2 → F=(1.5,3,0)
    expect(F.x).toBeCloseTo(1.5, 8);
    expect(F.y).toBeCloseTo(3, 8);
    expect(F.z).toBeCloseTo(0, 8);
  });

  it('a relation with everything known stays a verified CLAIM; a wrong one refuses', () => {
    ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w"].forEach(submit);
    submit("AC' = u + v + w");
    expect(state().lastError).toBeNull();
    submit("AC' = u + v");
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('two unknown points refuse honestly', () => {
    submit('קובייה ABCD');
    submit('PQ = 2AB');
    expect(state().lastError).toEqual({ code: 'two-unknowns', id: 'Q' });
  });
});
