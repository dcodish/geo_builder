/**
 * V8-j (ADR-3D-034, G12): a point on a segment positioned so a DERIVED pyramid is RIGHT
 * (2019-קיץ-ב Q2: T on SC → TABCD right; 2019-חורף Q2: K on EC → KOBCD right). The apex lands
 * where its in-plane offset from the base centroid is 0 (closed-form t; no CAS).
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
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('V8-j — parsing', () => {
  it('parses He + En; apex = the on-segment point, base = the other 4', () => {
    expect(cmd('T נמצאת על הקטע SC כך ש-TABCD היא פירמידה ישרה')[0]).toMatchObject({
      type: 'right-pyramid-point', id: 'T', a: 'S', b: 'C', base: ['A', 'B', 'C', 'D'],
    });
    expect(cmd('K על המקצוע EC כך ש-KOBCD היא פירמידה ישרה')[0]).toMatchObject({ type: 'right-pyramid-point', id: 'K', base: ['O', 'B', 'C', 'D'] });
    expect(cmd('T on SC such that TABCD is a right pyramid')[0]).toMatchObject({ type: 'right-pyramid-point', id: 'T' });
  });
});

describe('V8-j — build (2019-קיץ-ב flavour: square base, apex above A)', () => {
  beforeEach(reset);

  it('T lands above the base centroid so TABCD is right', () => {
    // square base ABCD edge 4 at z=0; S above A. SC projects along the base diagonal AC (through O).
    submit('A(0,0,0)');
    submit('B(4,0,0)');
    submit('C(4,4,0)');
    submit('D(0,4,0)');
    submit('S(0,0,6)');
    submit('T על הקטע SC כך ש-TABCD היא פירמידה ישרה');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
    const pos = d.positions;
    const T = pos.get('T')!;
    // O = base centroid = (2,2,0); T must sit directly above it (T=(2,2,3), the midpoint of SC)
    const O = { x: 2, y: 2, z: 0 };
    const base = ['A', 'B', 'C', 'D'].map((i) => pos.get(i)!);
    const n = { // base normal
      x: (base[1].y - base[0].y) * (base[3].z - base[0].z) - (base[1].z - base[0].z) * (base[3].y - base[0].y),
      y: (base[1].z - base[0].z) * (base[3].x - base[0].x) - (base[1].x - base[0].x) * (base[3].z - base[0].z),
      z: (base[1].x - base[0].x) * (base[3].y - base[0].y) - (base[1].y - base[0].y) * (base[3].x - base[0].x),
    };
    // T is directly above O ⇒ (T−O) is parallel to the normal (its in-plane component is 0)
    const to = sub(T, O);
    const inplane = sub(to, { x: (dot(to, n) / dot(n, n)) * n.x, y: (dot(to, n) / dot(n, n)) * n.y, z: (dot(to, n) / dot(n, n)) * n.z });
    expect(nrm(inplane)).toBeLessThan(1e-6);
    expect(T).toMatchObject({ x: expect.closeTo(2, 5), y: expect.closeTo(2, 5), z: expect.closeTo(3, 5) });
  });

  it('refuses honestly when no point on the segment sits above the centroid', () => {
    reset();
    // S NOT above a corner — SC projects nowhere near O ⇒ no right pyramid for any T on SC
    submit('A(0,0,0)');
    submit('B(4,0,0)');
    submit('C(4,4,0)');
    submit('D(0,4,0)');
    submit('S(10,0,6)'); // way off to the side
    submit('T על הקטע SC כך ש-TABCD היא פירמידה ישרה');
    expect(state().lastError).not.toBeNull(); // no-solution, kept-prior
  });
});
