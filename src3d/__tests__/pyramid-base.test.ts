/**
 * The 4-base pyramid family (operator correction, 2026-07-07): rightness (ישרה —
 * apex above the base centre) and base shape are INDEPENDENT stated givens
 * (ADR-052). `פירמידה ישרה` alone does NOT mean a square base — the aspect stays
 * a free DOF until שבסיסה ריבוע is stated. Plus the הבסיס/"the base" plane
 * sentinel: `AS ניצב לבסיס` resolves the plane from the figure's single solid.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}
const dist = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

describe('pyramid base shape is a stated given, not a default', () => {
  beforeEach(reset);

  it('parses all four variants (He + En)', () => {
    const kindOf = (u: string) => {
      const r = parse3(u);
      if (!r.ok) throw new Error(u);
      return (r.commands[0] as { kind: string }).kind;
    };
    expect(kindOf('פירמידה ישרה ABCDS שבסיסה ריבוע')).toBe('pyramid4');
    expect(kindOf('פירמידה ישרה ABCDS')).toBe('pyramid4r');
    expect(kindOf('פירמידה ABCDS שבסיסה ריבוע')).toBe('pyramid4g');
    expect(kindOf('פירמידה ABCDS')).toBe('pyramid4gr');
    expect(kindOf('right pyramid ABCDS with a square base')).toBe('pyramid4');
    expect(kindOf('pyramid ABCDS with a square base')).toBe('pyramid4g');
  });

  it('a right pyramid WITHOUT a stated square has a free base aspect; WITH it the base is square', () => {
    submit('פירמידה ישרה ABCDS');
    expectAllOk();
    const ratios = [0, 1, 2, 3, 4].map((seed) => {
      const pos = derived(seed).positions;
      return dist(pos.get('A')!, pos.get('B')!) / dist(pos.get('B')!, pos.get('C')!);
    });
    expect(ratios.some((r) => Math.abs(r - 1) > 0.05)).toBe(true); // aspect really varies

    reset();
    submit('פירמידה ישרה ABCDS שבסיסה ריבוע');
    expectAllOk();
    for (const seed of [0, 1, 2, 3]) {
      const pos = derived(seed).positions;
      expect(dist(pos.get('A')!, pos.get('B')!)).toBeCloseTo(dist(pos.get('B')!, pos.get('C')!), 6);
    }
  });

  it('the operator scenario: square-base pyramid + AS ⊥ the base lands S directly above A', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('AS ניצב לבסיס');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const S = pos.get('S')!;
    // AS ⟂ base plane ⇒ S is vertically above A (base is z-planar only pre-gauge,
    // so assert perpendicularity to two base edges instead of raw z)
    const B = pos.get('B')!;
    const D = pos.get('D')!;
    const AS = { x: S.x - A.x, y: S.y - A.y, z: S.z - A.z };
    const AB = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
    const AD = { x: D.x - A.x, y: D.y - A.y, z: D.z - A.z };
    const n = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
    expect(Math.abs(AS.x * AB.x + AS.y * AB.y + AS.z * AB.z) / (n(AS) * n(AB))).toBeLessThan(1e-4);
    expect(Math.abs(AS.x * AD.x + AS.y * AD.y + AS.z * AD.z) / (n(AS) * n(AD))).toBeLessThan(1e-4);
    expect(n(AS)).toBeGreaterThan(0.1); // non-degenerate
    // regularised-nearest: the free height must stay near its seed sample, not run
    // to a needle (the angle-normalized ⟂ residual also shrinks as the apex climbs)
    expect(n(AS)).toBeLessThan(3 * dist(A, B));
  });

  it('English mirror: perpendicular/parallel to the base', () => {
    submit('pyramid ABCDS with a square base');
    submit('AS is perpendicular to the base');
    expectAllOk();
    reset();
    submit('פירמידה ישרה ABCDS שבסיסה ריבוע');
    submit('E אמצע AS');
    submit('F אמצע BS');
    submit('EF מקביל לבסיס');
    expectAllOk();
  });

  it('the base sentinel without a solid is refused honestly', () => {
    submit('AS ניצב לבסיס');
    expect(state().facts).toHaveLength(0);
    expect(state().lastError).toEqual({ code: 'unknown-plane', id: 'base' });
  });
});
