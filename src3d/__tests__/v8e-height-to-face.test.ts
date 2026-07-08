/**
 * V8-e (ADR-3D-022, G5 core): a pyramid's height to a NAMED FACE — `AF גובה הפירמידה
 * לפאה BDC` (2014-קיץ-ג) → F is the foot of the ⟂ from A onto the plane of face BDC.
 * The dihedral face↔base angle + in-face altitude (2012-קיץ-ב) are deferred (documented).
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
const derived = () => derive3(state().facts, state().seed);
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('V8-e — height to a named face', () => {
  beforeEach(reset);

  it('parses to height-to-face (He + En)', () => {
    const he = parse3('AF גובה הפירמידה לפאה BDC');
    expect(he.ok && he.commands[0]).toEqual({ type: 'height-to-face', id: 'F', from: 'A', face: ['B', 'D', 'C'] });
    const en = parse3('AF is the height of the pyramid to face BDC');
    expect(en.ok && en.commands[0]).toEqual({ type: 'height-to-face', id: 'F', from: 'A', face: ['B', 'D', 'C'] });
  });

  it('F is the foot of the perpendicular from A onto plane BCD', () => {
    submit('A(1,1,3)');
    submit('B(0,0,0)');
    submit('C(4,0,0)');
    submit('D(0,4,0)');
    submit('AF גובה הפירמידה לפאה BCD');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const p = d.positions;
    const A = p.get('A')!;
    const F = p.get('F')!;
    // plane BCD is z=0, so the foot of A=(1,1,3) is (1,1,0)
    expect(F.x).toBeCloseTo(1, 6);
    expect(F.y).toBeCloseTo(1, 6);
    expect(F.z).toBeCloseTo(0, 6);
    // AF ⟂ plane BCD (⟂ two in-plane edges), non-degenerate
    const B = p.get('B')!;
    const C = p.get('C')!;
    const Dp = p.get('D')!;
    const af = sub(F, A);
    expect(Math.abs(dot(af, sub(C, B))) / (nrm(af) * nrm(sub(C, B)))).toBeLessThan(1e-6);
    expect(Math.abs(dot(af, sub(Dp, B))) / (nrm(af) * nrm(sub(Dp, B)))).toBeLessThan(1e-6);
    expect(nrm(af)).toBeCloseTo(3, 6);
    expect(nrm(cross(sub(C, B), sub(Dp, B)))).toBeGreaterThan(0.1);
  });

  it('a plain `AS גובה` (no face) still means ⟂ to the base — unchanged', () => {
    const r = parse3('AS גובה');
    expect(r.ok && r.commands[0]).toEqual({ type: 'seg-plane-rel', rel: 'perp', a: 'A', b: 'S', plane: [] });
  });
});
