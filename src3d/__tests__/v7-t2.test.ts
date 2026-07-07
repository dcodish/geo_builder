/**
 * V7 T2 gate — scalar givens drive the figure (ADR-3D-010 remainder): the 2023-ב
 * chain on a GENERAL tetrahedron. Hand-worked oracles: DC⊥base ⇒ D above C;
 * BD=(−4,5,12), B=(p,3,0), C=(0,n,0) ⇒ p=4, n=8, h=12; u·v = 24 consistent;
 * EF ∥ base pins k = 1/3; volume = 64.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

describe('GATE — 2023 קיץ מועד ב Q2 (tetra + scalar givens + injections)', () => {
  beforeEach(reset);

  const HE = [
    'פירמידה ABCD', // a GENERAL tetrahedron — apex free (5 dims)
    'DC ניצב למישור ABC', // a DRIVING scalar given (free dims > 0 ⇒ pin, not claim)
    'E אמצע AD',
    'נסמן: AB = u, AC = v, CD = w',
    'DF = (k/2)DB + kDC', // F on the k-family
    'EF מקביל למישור ABC', // pins k = 1/3
    'נתון: A(0,0,0), B(p,3,0), C(0,n,0)', // partial injections (p, n symbolic)
    'BD = (-4,5,12)', // the pair-vector injection
    'u·v = 24', // the dot given (consistent)
    'B = (4, 3, 0)',
    'C = (0, 8, 0)',
    'D = (0, 8, 12)',
    'נפח הפירמידה ABCD = 64',
  ];

  it('Hebrew: the full chain builds; B, C, D and the volume verify', () => {
    HE.forEach(submit);
    expect(state().facts).toHaveLength(13);
    expectAllOk();
    const pos = derived().positions;
    expect(pos.get('D')!.z).toBeCloseTo(12, 3);
    // EF really is parallel to the base (k pinned)
    const E = pos.get('E')!;
    const F = pos.get('F')!;
    expect(F.z - E.z).toBeCloseTo(0, 3);
  });

  it('a wrong volume is refused', () => {
    HE.slice(0, 12).forEach(submit);
    submit('נפח הפירמידה ABCD = 60');
    expect(state().facts).toHaveLength(12);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('the rhombus prism + its scalar givens hold consistently (the 2022 base)', () => {
    submit("מנסרה ישרה שבסיסה מעוין ABCDA'B'C'D'");
    submit('DC = 4'); // |DC| = 4 → a scale-driving pin (free dims > 0)
    submit('∠ADC = 120');
    expectAllOk();
    const pos = derived().positions;
    const D = pos.get('D')!;
    const C = pos.get('C')!;
    const A = pos.get('A')!;
    const len = Math.hypot(C.x - D.x, C.y - D.y, C.z - D.z);
    expect(len).toBeCloseTo(4, 4);
    const d1 = { x: A.x - D.x, y: A.y - D.y, z: A.z - D.z };
    const d2 = { x: C.x - D.x, y: C.y - D.y, z: C.z - D.z };
    const cos = (d1.x * d2.x + d1.y * d2.y + d1.z * d2.z) / (Math.hypot(d1.x, d1.y, d1.z) * Math.hypot(d2.x, d2.y, d2.z));
    expect(Math.acos(cos) * (180 / Math.PI)).toBeCloseTo(120, 3);
  });
});
