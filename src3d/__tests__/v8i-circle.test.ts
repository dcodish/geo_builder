/**
 * V8-i (ADR-3D-029, G13): a CIRCLE lying in a plane in R³ — centre + plane (normal) + radius —
 * tangent to a line (2016-קיץ-ב Q2). Sourced from a through-line; the parametric ℓ form waits on
 * multi-line naming (documented). The tangent point = the ⟂ foot of the centre onto the line.
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
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('V8-i — parsing', () => {
  it('circle tangent to a line (He + En)', () => {
    expect(cmd('מעגל A משיק לישר BC בנקודה F')).toMatchObject([
      { type: 'line-through', name: 'BC' },
      { type: 'circle3', id: 'circle-A', def: { kind: 'tangent-line', center: 'A', line: 'BC' }, touch: 'F' },
    ]);
    expect(cmd('circle A tangent to line BC at F').at(-1)).toMatchObject({ type: 'circle3', id: 'circle-A' });
  });
  it('on-circle (He + En)', () => {
    expect(cmd('D על המעגל')[0]).toMatchObject({ type: 'point-on-circle3', point: 'D', circle: '' });
    expect(cmd('D is on the circle')[0]).toMatchObject({ type: 'point-on-circle3', point: 'D' });
  });
});

describe('V8-i — build (a circle centered at a cube vertex, tangent to an edge)', () => {
  beforeEach(reset);

  it('resolves centre/radius/plane; the tangent point is the ⟂ foot; on-circle verifies', () => {
    submit('קובייה ABCD');
    submit('מעגל A משיק לישר BC בנקודה F'); // centre A=(0,0,0), edge BC (x=1,z=0), radius = 1
    expectAllOk();
    const d = derived();
    const k = d.resolved.circles3[0];
    expect(k).toBeTruthy();
    const pos = d.positions;
    const A = pos.get('A')!;
    const F = pos.get('F')!;
    // centre at A, radius = dist(A, BC) = 1
    expect(nrm(sub(k.center, A))).toBeLessThan(1e-9);
    expect(k.radius).toBeCloseTo(1, 6);
    // the tangent point F is the ⟂ foot: AF ⟂ BC and |AF| = radius
    const bc = sub(pos.get('C')!, pos.get('B')!);
    expect(Math.abs(dot(sub(F, A), bc)) / (nrm(sub(F, A)) * nrm(bc))).toBeLessThan(1e-9);
    expect(nrm(sub(F, A))).toBeCloseTo(k.radius, 6);
    // the radius is ⟂ the circle's plane normal (F is in the plane)
    expect(Math.abs(dot(sub(F, A), k.normal))).toBeLessThan(1e-9);
  });

  it('a point ON the circle verifies; a point off it is refused', () => {
    reset();
    submit('קובייה ABCD');
    submit('מעגל A משיק לישר BC'); // circle: centre A, radius 1, plane z=0
    submit('D על המעגל'); // D=(0,1,0): |AD|=1 and z=0 → on the circle
    expectAllOk();

    submit("C' על המעגל"); // C'=(1,1,1): not at radius 1 in the z=0 plane → refused
    expect(state().lastError).not.toBeNull();
  });
});
