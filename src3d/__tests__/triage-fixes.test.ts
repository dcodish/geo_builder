/**
 * ADR-3D-026: fixes for the genuine LIVE gaps surfaced by /log-triage on the 3-D prod log
 * (2026-07-09). Each is replayed as the EXACT prod utterance a user typed.
 *   - bare revolution solids `כדור`/`חרוט`/`גליל` (free sizes, ADR-052)
 *   - `ארבעון` (the Hebrew word) + `טטרדר` (misspelling) — tetrahedron
 *   - median in a triangle `CD תיכון במשולש ABC`
 *   - tetra altitude `DE גובה בטטראדר`
 *   - plane-equation phrasings: unnamed `המישור x-y+z=1`, no-colon `המישור π2 x-y+z=1`,
 *     singular-`מישור` angle `הזווית בין מישור π1 ו-π2 היא 45`
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

describe('ADR-3D-026 — prod-triage fixes (parse)', () => {
  it('bare revolution solids build with free sizes', () => {
    expect(cmd('כדור')[0]).toMatchObject({ type: 'revolution', kind: 'sphere' });
    expect(cmd('חרוט')[0]).toMatchObject({ type: 'revolution', kind: 'cone' });
    expect(cmd('גליל')[0]).toMatchObject({ type: 'revolution', kind: 'cylinder' });
    // a noun + a NUMBER that binds to nothing (which dim?) is a half-read → refuse (escalate)
    expect(parse3('חרוט 5').ok).toBe(false);
    // but a bound number is fine (free radius, height 5)
    expect(cmd('חרוט גובה 5')[0]).toMatchObject({ type: 'revolution', kind: 'cone', height: 5 });
  });
  it('ארבעון + טטרדר are tetrahedra; the parametric revolution still works', () => {
    expect(cmd('ABCD ארבעון')[0]).toMatchObject({ type: 'solid', kind: 'tetra' });
    expect(cmd('טטרדר')[0]).toMatchObject({ type: 'solid', kind: 'tetra' });
    expect(cmd('כדור שמרכזו O רדיוסו 3')[0]).toMatchObject({ type: 'revolution', kind: 'sphere', radius: 3 });
  });
  it('plane-equation phrasings: unnamed, no-colon, singular-מישור angle', () => {
    expect(cmd('המישור x-y+z=1')[0]).toMatchObject({ type: 'plane3', name: 'π' });
    expect(cmd('המישור π2 x-y+z=1')[0]).toMatchObject({ type: 'plane3', name: 'π2' });
    expect(cmd('הזווית בין מישור π1 ו-π2 היא 45')[0]).toMatchObject({ type: 'plane-angle', deg: 45 });
    // regressions: the colon form + a point-run plane must be unchanged
    expect(cmd('המישור π1: z-3=0')[0]).toMatchObject({ type: 'plane3', name: 'π1' });
    expect(cmd('מישור ABC')[0]).toMatchObject({ type: 'plane-through' });
  });
  it('median + tetra-altitude parse', () => {
    expect(cmd('CD תיכון במשולש ABC')).toMatchObject([
      { type: 'point-on-segment3', id: 'D', a: 'A', b: 'B', t: 0.5 },
      { type: 'segment3', a: 'C', b: 'D' },
    ]);
    expect(cmd('DE גובה בטטראדר')[0]).toMatchObject({ type: 'tetra-altitude', id: 'E', from: 'D' });
  });
});

describe('ADR-3D-026 — builds', () => {
  beforeEach(reset);

  it('median CD lands D at the midpoint of AB with CD drawn', () => {
    submit('משולש ABC');
    submit('CD תיכון במשולש ABC');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    const mid = { x: (pos.get('A')!.x + pos.get('B')!.x) / 2, y: (pos.get('A')!.y + pos.get('B')!.y) / 2, z: (pos.get('A')!.z + pos.get('B')!.z) / 2 };
    expect(nrm(sub(pos.get('D')!, mid))).toBeLessThan(1e-9);
  });

  it('tetra altitude DE drops ⟂ from D onto face ABC', () => {
    submit('ארבעון ABCD');
    submit('DE גובה בטטראדר');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((i) => pos.get(i)!);
    // DE ⟂ the plane ABC ⇒ ⟂ two in-plane edges
    const de = sub(E, D);
    expect(Math.abs(dot(de, sub(B, A))) / (nrm(de) * nrm(sub(B, A)))).toBeLessThan(1e-6);
    expect(Math.abs(dot(de, sub(C, A))) / (nrm(de) * nrm(sub(C, A)))).toBeLessThan(1e-6);
    expect(nrm(de)).toBeGreaterThan(0.05);
  });

  it('a bare sphere builds and its size is a FREE DOF (unstated)', () => {
    submit('כדור');
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.revolutions[0]).toMatchObject({ kind: 'sphere', radius: undefined });
  });
});
