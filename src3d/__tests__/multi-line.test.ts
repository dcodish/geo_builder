/**
 * #69 (ADR-3D-038): MULTI-LINE NAMING — digit-indexed line names ℓ1/ℓ2 (typed `l1`/`l2`,
 * subscript `ℓ₂` tolerated), by operator ruling (prime forms ℓ' are NOT in the vocabulary).
 * The engine was already name-keyed end-to-end; this closes the parser gap: the widened
 * LINE_NAME token, every line rule binding its MATCHED name (was hardcoded 'ℓ'), and
 * named-line operands in the common-perpendicular / projection rules — the 2010-Q3 form
 * (`d ⊥ ℓ1 ∧ d ⊥ ℓ2` on two typed parametric lines).
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
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
type V = { x: number; y: number; z: number };
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
const onLine = (p: V, anchor: V, dir: V) => nrm(cross(sub(p, anchor), dir)) <= 1e-7 * Math.max(nrm(sub(p, anchor)) * nrm(dir), 1);

// two skew lines with a known common perpendicular: ℓ1 = the x-axis, ℓ2 = y-direction at height 5.
// d = the z-axis (dir ∥ (0,0,1)), feet (0,0,0) on ℓ1 and (0,0,5) on ℓ2.
const L1 = 'הישר ℓ1: x = (0,0,0) + t(1,0,0)';
const L2 = 'הישר ℓ2: x = (0,0,5) + t(0,1,0)';

describe('#69 — parse: digit-indexed line names canonicalize to ℓ<digits>', () => {
  it('ℓ1 / l2 / subscript ℓ₂ → canonical ℓ1, ℓ2', () => {
    expect(cmd(L1)).toMatchObject([{ type: 'line3', name: 'ℓ1' }]);
    expect(cmd('הישר l2: x = (0,0,5) + t(0,1,0)')).toMatchObject([{ type: 'line3', name: 'ℓ2' }]);
    expect(cmd('הישר ℓ₂: x = (0,0,5) + t(0,1,0)')).toMatchObject([{ type: 'line3', name: 'ℓ2' }]);
    expect(cmd('line l1: x = (0,0,0) + t(1,0,0)')).toMatchObject([{ type: 'line3', name: 'ℓ1' }]);
  });
  it('the bare ℓ / l stays canonical ℓ (legacy)', () => {
    expect(cmd('הישר ℓ: x = (0,0,0) + t(1,0,0)')).toMatchObject([{ type: 'line3', name: 'ℓ' }]);
    expect(cmd('B על הישר l')).toMatchObject([{ type: 'on-line', id: 'B', line: 'ℓ' }]);
  });
  it('every consuming rule binds the MATCHED name (was hardcoded ℓ)', () => {
    expect(cmd('B על הישר ℓ2')).toMatchObject([{ type: 'on-line', id: 'B', line: 'ℓ2' }]);
    expect(cmd('B(1,2,3) על הישר l2')).toMatchObject([{ type: 'point3', id: 'B' }, { type: 'on-line', id: 'B', line: 'ℓ2' }]);
    expect(cmd('מ-B מעבירים אנך לישר ℓ1 החותך אותו בנקודה C')).toMatchObject([
      { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ1' },
    ]);
    expect(cmd('הישר ℓ2 ניצב למישור π1')).toMatchObject([{ type: 'line-perp-plane', line: 'ℓ2', plane: 'π1' }]);
    expect(cmd('הישר ℓ2 חותך את π1 בנקודה A')).toMatchObject([{ type: 'line-plane-point', id: 'A', line: 'ℓ2', plane: 'π1' }]);
    expect(cmd('ℓ2 אינו מקביל ל-π1 לכל m')).toMatchObject([
      { type: 'claim', claim: { type: 'never-parallel', line: 'ℓ2', plane: 'π1' } },
    ]);
    expect(cmd('ℓ1 ישר החיתוך בין המישורים π1 ו-π2')).toMatchObject([
      { type: 'plane-plane-line', name: 'ℓ1', p1: 'π1', p2: 'π2' },
    ]);
    expect(cmd("ℓ2 ישר החיתוך בין המישור BC'D ובין המישור BCC'B'")).toMatchObject([
      { type: 'plane-through' },
      { type: 'plane-through' },
      { type: 'plane-plane-line', name: 'ℓ2' },
    ]);
  });
  it('named-line operands in common-perp / projection (He + En)', () => {
    expect(cmd('הישר d מאונך לישר ℓ1 ולישר ℓ2')).toMatchObject([
      { type: 'line-common-perp', name: 'd', line1: 'ℓ1', line2: 'ℓ2' },
    ]);
    expect(cmd('d is the common perpendicular of ℓ1 and ℓ2')).toMatchObject([
      { type: 'line-common-perp', name: 'd', line1: 'ℓ1', line2: 'ℓ2' },
    ]);
    expect(cmd('l3 is the common perpendicular of lines l1 and l2')).toMatchObject([
      { type: 'line-common-perp', name: 'ℓ3', line1: 'ℓ1', line2: 'ℓ2' },
    ]);
    expect(cmd('הישר ℓ3 הוא היטל הישר ℓ2 על המישור π2')).toMatchObject([
      { type: 'line-projection', name: 'ℓ3', line: 'ℓ2', plane: 'π2' },
    ]);
    // the V8-h pair forms are byte-equivalent (regression)
    expect(cmd('הישר d מאונך לישר AB ולישר CD')).toMatchObject([
      { type: 'line-through', name: 'AB' },
      { type: 'line-through', name: 'CD' },
      { type: 'line-common-perp', name: 'd', line1: 'AB', line2: 'CD' },
    ]);
    expect(cmd('BE היטל הישר TB על המישור ABCD')).toMatchObject([
      { type: 'line-through', name: 'TB' },
      { type: 'plane-through', name: 'plane-ABCD' },
      { type: 'line-projection', name: 'BE', line: 'TB', plane: 'plane-ABCD' },
    ]);
  });
});

describe('#69 — build: two named parametric lines coexist (the 2010-Q3 form)', () => {
  beforeEach(reset);

  it('GATE (2010-Q3 shape): two typed lines + the common perpendicular d ⊥ ℓ1, d ⊥ ℓ2', () => {
    submit(L1);
    submit(L2);
    submit('הישר d מאונך לישר ℓ1 ולישר ℓ2');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const l1 = d.resolved.lines.get('ℓ1')!;
    const l2 = d.resolved.lines.get('ℓ2')!;
    const dd = d.resolved.lines.get('d')!;
    expect(l1).toBeDefined();
    expect(l2).toBeDefined();
    expect(dd).toBeDefined();
    // both source lines resolved to their typed geometry
    expect(onLine({ x: 7, y: 0, z: 0 }, l1.anchor, l1.dir)).toBe(true);
    expect(onLine({ x: 0, y: 7, z: 5 }, l2.anchor, l2.dir)).toBe(true);
    // d is ⟂ BOTH and anchored at the closest-points foot on ℓ1 = the origin
    expect(Math.abs(dot(dd.dir, l1.dir))).toBeLessThan(1e-9 * nrm(dd.dir) * nrm(l1.dir));
    expect(Math.abs(dot(dd.dir, l2.dir))).toBeLessThan(1e-9 * nrm(dd.dir) * nrm(l2.dir));
    expect(nrm(dd.anchor)).toBeLessThan(1e-9);
    expect(onLine({ x: 0, y: 0, z: 5 }, dd.anchor, dd.dir)).toBe(true); // reaches the foot on ℓ2
  });

  it('memberships and operations bind the RIGHT line', () => {
    submit(L1);
    submit(L2);
    submit('B על הישר ℓ2'); // a new id → a free rider ON ℓ2 (ADR-3D-031 M1-dual)
    expect(state().lastError).toBeNull();
    const d = derived();
    const B = d.resolved.positions.get('B')!;
    expect(onLine(B, { x: 0, y: 0, z: 5 }, { x: 0, y: 1, z: 0 })).toBe(true); // rides ℓ2, not ℓ1
    submit('מ-B מעבירים אנך לישר ℓ1 החותך אותו בנקודה C');
    expect(state().lastError).toBeNull();
    const d2 = derived();
    const C = d2.resolved.positions.get('C')!;
    const B2 = d2.resolved.positions.get('B')!;
    expect(onLine(C, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(true); // the foot lands ON ℓ1
    expect(Math.abs(dot(sub(B2, C), { x: 1, y: 0, z: 0 }))).toBeLessThan(1e-7); // BC ⟂ ℓ1
  });

  it('line∩plane binds by name: ℓ2 crosses y=3, ℓ1 (parallel) honestly refuses', () => {
    submit('המישור π1: y - 3 = 0');
    submit(L1);
    submit(L2);
    submit('הישר ℓ2 חותך את π1 בנקודה A');
    expect(state().lastError).toBeNull();
    const d = derived();
    const A = d.resolved.positions.get('A')!;
    expect(A.x).toBeCloseTo(0, 6);
    expect(A.y).toBeCloseTo(3, 6);
    expect(A.z).toBeCloseTo(5, 6); // the ℓ2 crossing — proving the name bound ℓ2, not ℓ1
    const before = state().facts.length;
    submit('הישר ℓ1 חותך את π1 בנקודה K'); // ℓ1 ∥ π1 — an honest refusal, never a fake point
    expect(state().lastError).not.toBeNull();
    expect(state().facts).toHaveLength(before);
  });

  it('projection of a NAMED line onto a π-plane resolves', () => {
    submit('המישור π2: z = 0');
    submit(L2);
    submit('הישר ℓ3 הוא היטל הישר ℓ2 על המישור π2');
    expect(state().lastError).toBeNull();
    const d = derived();
    const p = d.resolved.lines.get('ℓ3')!;
    expect(p).toBeDefined();
    expect(onLine({ x: 0, y: 7, z: 0 }, p.anchor, p.dir)).toBe(true); // ℓ2 flattened to z=0
    expect(Math.abs(p.anchor.z)).toBeLessThan(1e-9);
  });

  it('the single-symbolic-parameter boundary holds across TWO lines (docs/20 D3 lock)', () => {
    submit('הישר ℓ1: x = (0,0,0) + t(m-1,1,0)');
    expect(state().lastError).toBeNull();
    const before = state().facts.length;
    submit('הישר ℓ2: x = (1,1,1) + t(k,0,1)'); // a SECOND symbol letter — refused, keep-prior
    expect(state().lastError).toMatchObject({ code: 'two-params' });
    expect(state().facts).toHaveLength(before);
  });

  it('a duplicate name refuses already-defined (keep-prior)', () => {
    submit(L1);
    const before = state().facts.length;
    submit('הישר ℓ1: x = (9,9,9) + t(0,0,1)');
    expect(state().lastError).toMatchObject({ code: 'already-defined' });
    expect(state().facts).toHaveLength(before);
  });
});
