/**
 * V7 T2 gate — scalar givens drive the figure (ADR-3D-010 remainder): the 2023-ב
 * chain on a GENERAL tetrahedron. Hand-worked oracles: DC⊥base ⇒ D above C;
 * BD=(−4,5,12), B=(p,3,0), C=(0,n,0) ⇒ p=4, n=8, h=12; u·v = 24 consistent;
 * EF ∥ base pins k = 1/3; volume = 64.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  KNOWN = [];
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
/** #2341 (ADR-3D-449): the lines answered «כבר קיים» — an answer the figure already holds adds no row and is not refused. */
let KNOWN: string[] = [];
const submit = (u: string) => {
  const rows = useGeo3.getState().facts.length;
  useGeo3.getState().submit(u);
  const st = useGeo3.getState();
  if (st.lastError === null && st.facts.length === rows && st.lastNotice?.code === 'already-stated') KNOWN.push(u);
};
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
    expect(state().facts).toHaveLength(8);
    expect(KNOWN).toEqual(["u·v = 24","B = (4, 3, 0)","C = (0, 8, 0)","D = (0, 8, 12)","נפח הפירמידה ABCD = 64"]); // #2341 (ADR-3D-449): each answer the figure already holds is «כבר קיים», no row
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
    expect(state().facts).toHaveLength(8);
    expect(KNOWN).toEqual(["u·v = 24","B = (4, 3, 0)","C = (0, 8, 0)","D = (0, 8, 12)"]); // #2341 (ADR-3D-449): each answer the figure already holds is «כבר קיים», no row
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
