/**
 * The "organize your data" panel (ADR-3D-014): derived presentations, stability-
 * gated across 3 seeds. On the 2026-ב exam figure: EN⃗ decomposes in the u,v,w basis
 * AND shows coordinates (both, per the operator); a stated magnitude prints with its
 * square; an under-determined figure prints NO coordinates (gauge is not data).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const panel = () => {
  const st = useGeo3.getState();
  return dataView(derive3(st.facts, st.seed).construction, st.seed);
};

describe('dataView — organize your data', () => {
  beforeEach(reset);

  it('the exam figure: EN in the basis AND in coordinates; points print stable coords', () => {
    [
      'פירמידה ABCDS שבסיסה ריבוע',
      'המקצוע AS הוא גובה בפירמידה',
      'אורך המקצוע AS שווה לאורך צלע הריבוע ABCD',
      'SE = 3/4 SD',
      'נסמן: AD = u, AB = v, AS = w',
      'SN = k·SC',
      '|EN| = (√6/4)·|w|',
      'נתון: A(0,0,0), B(0,12,0)',
      'הקודקוד D נמצא על החלק החיובי של ציר ה-x',
      'S נמצא על החלק החיובי של ציר ה-z',
    ].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    const en = p.vectors.find((v) => v.label === 'EN');
    expect(en).toBeTruthy();
    // EN = N−E = (−3,6,3) = −1/4·u + 1/2·v + 1/4·w  (u=AD, v=AB, w=AS, side 12)
    expect(en!.decomp).toBe('−1/4·u + 1/2·v + 1/4·w');
    expect(en!.coords).toBe('(-3, 6, 3)');
    expect(p.points).toContain('N(6, 6, 6)');
    expect(p.points).toContain('E(9, 0, 3)');
    // the declared basis vectors print their coordinate form
    const w = p.vectors.find((v) => v.label === 'w');
    expect(w?.coords).toBe('(0, 0, 12)');
  });

  it("the operator's session: |u| = |v| = |w| surfaces, and EN shows SYMBOLICALLY in k", () => {
    [
      'פירמידה ABCDS שבסיסה ריבוע',
      'AS גובה',
      '|AS|=|AD|',
      'SE = 3/4 SD',
      'SN = k·SC',
      'נסמן: AD = u, AB = v, AS = w',
      'EN',
    ].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    // square base gives |u| = |v|; the stated |AS| = |AD| joins w — all three equal
    expect(p.relations).toContain('|u| = |v| = |w|');
    // EN depends on the FREE k — not hidden as unstable, shown in the exam's symbolic form
    const en = p.vectors.find((v) => v.label === 'EN');
    expect(en?.decomp).toBe('(k − 3/4)·u + k·v + (3/4 − k)·w');
    // SE is k-free and numeric
    const se = p.vectors.find((v) => v.label === 'SE');
    expect(se?.decomp).toBe('3/4·u − 3/4·w');
    // the |EN| given pins k = ½ at the TANGENCY (a double root — the numerically split
    // crossings must not leave EN "unstable"): the decomposition turns numeric
    submit('|EN|=√6/4*|w|');
    expect(useGeo3.getState().lastError).toBeNull();
    const p2 = panel();
    const en2 = p2.vectors.find((v) => v.label === 'EN');
    expect(en2?.decomp).toBe('−1/4·u + 1/2·v + 1/4·w');
  });

  it('a stated magnitude prints with its square; nothing prints for an unstated one', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('AS = w');
    submit('|w| = 2');
    const p = panel();
    const w = p.vectors.find((v) => v.label === 'w');
    expect(w?.mag).toBe('|w| = 2');
    expect(w?.sq).toBe('w² = 4');
    // no frame injected → no coordinates anywhere (gauge is not data)
    expect(w?.coords).toBeNull();
    expect(p.points).toEqual([]);
  });

  it('an under-determined quantity never prints (varies across seeds)', () => {
    submit('פירמידה ABCDS'); // free-aspect base, free apex — nothing stable, no frame
    const p = panel();
    expect(p.points).toEqual([]);
    expect(p.vectors.every((v) => v.coords === null)).toBe(true);
  });
});
