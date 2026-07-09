/**
 * V8-h (ADR-3D-028, G8): two line constructs — the COMMON PERPENDICULAR of two lines and the
 * PROJECTION of a line onto a plane (2010-Q3, 2012-חורף). Sourced from through-lines (point
 * pairs) + point-run planes; the parametric ℓ/ℓ' forms wait on multi-line naming (documented).
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
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
}
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('V8-h — parsing', () => {
  it('common perpendicular (He + En)', () => {
    expect(cmd('הישר d מאונך לישר AB ולישר CD').at(-1)).toMatchObject({ type: 'line-common-perp', name: 'd', line1: 'AB', line2: 'CD' });
    expect(cmd('d is the common perpendicular of AB and CD').at(-1)).toMatchObject({ type: 'line-common-perp', line1: 'AB', line2: 'CD' });
  });
  it('line projection (He + En)', () => {
    expect(cmd('BE היטל הישר TB על המישור ABCD').at(-1)).toMatchObject({ type: 'line-projection', name: 'BE', line: 'TB' });
    expect(cmd('BE is the projection of line TB onto plane ABCD').at(-1)).toMatchObject({ type: 'line-projection', name: 'BE', line: 'TB' });
  });
});

describe('V8-h — builds (on a cube)', () => {
  beforeEach(reset);

  it("the common perpendicular of two edges is ⟂ both", () => {
    // cube edges AB (bottom, +x) and A'D' (top, +y) are skew; d ⟂ both
    submit('קובייה ABCD');
    submit("הישר d מאונך לישר AB ולישר A'D'");
    expectAllOk();
    const r = derived().resolved;
    const d = r.lines.get('d')!;
    expect(d).toBeTruthy();
    const pos = derived().positions;
    const ab = sub(pos.get('B')!, pos.get('A')!);
    const ad = sub(pos.get("D'")!, pos.get("A'")!);
    expect(Math.abs(dot(d.dir, ab)) / (nrm(d.dir) * nrm(ab))).toBeLessThan(1e-9);
    expect(Math.abs(dot(d.dir, ad)) / (nrm(d.dir) * nrm(ad))).toBeLessThan(1e-9);
  });

  it("the projection of a slanted edge onto the base lies IN the base plane", () => {
    // AC' is the space diagonal; its projection onto base ABCD (z=0) is the base diagonal AC
    submit('קובייה ABCD');
    submit("BE היטל הישר AC' על המישור ABCD");
    expectAllOk();
    const r = derived().resolved;
    const proj = r.lines.get('BE')!;
    expect(proj).toBeTruthy();
    const pos = derived().positions;
    // the base plane ABCD normal
    const n = cross(sub(pos.get('B')!, pos.get('A')!), sub(pos.get('D')!, pos.get('A')!));
    // the projected direction is IN the plane (⟂ the normal), and the anchor lies on the plane
    expect(Math.abs(dot(proj.dir, n)) / (nrm(proj.dir) * nrm(n))).toBeLessThan(1e-9);
    expect(Math.abs(dot(sub(proj.anchor, pos.get('A')!), n)) / (nrm(n) || 1)).toBeLessThan(1e-9);
    // the projection of the space diagonal AC' is the base diagonal direction AC
    const ac = sub(pos.get('C')!, pos.get('A')!);
    expect(nrm(cross(proj.dir, ac)) / (nrm(proj.dir) * nrm(ac))).toBeLessThan(1e-9);
  });
});
