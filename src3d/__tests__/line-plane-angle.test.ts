/**
 * ADR-3D-027: the angle between a LINE and a PLANE (`sin β = |n·u|/(|n||u|)`, formula sheet).
 * The held prod-triage item `זווית בין הישר AC' לבין המישור ABCD`. M1: on a free-dim solid it
 * DRIVES the shape; on a determined solid it VERIFIES. The valueless "what is" query escalates.
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
// angle (deg) between line a→b and the plane through pts
const lpAngle = (a: V, b: V, pts: V[]) => {
  const u = sub(b, a);
  const n = cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]));
  return (Math.asin(Math.abs(dot(n, u)) / (nrm(n) * nrm(u))) * 180) / Math.PI;
};
describe('ADR-3D-027 — line↔plane angle', () => {
  it('parses He + En; the valueless query does NOT (escalates)', () => {
    const r = parse3("הזווית בין הישר AC' לבין המישור ABCD היא 30");
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'line-plane-angle', a: 'A', b: "C'", deg: 30 });
    const en = parse3("the angle between line AC' and plane ABCD is 30");
    expect(en.ok && en.commands[0]).toMatchObject({ type: 'line-plane-angle', deg: 30 });
    // valueless "what is the angle" → not a construct the tool builds → not-handled
    expect(parse3("הזווית בין הישר AC' לבין המישור ABCD").ok).toBe(false);
  });

  it('VERIFIES on a cube (AC′↔base = asin(1/√3) ≈ 35.264°); a wrong value is refused', () => {
    reset();
    submit('קובייה ABCD');
    submit("הזווית בין הישר AC' לבין המישור ABCD היא 35.2644");
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    expect(lpAngle(pos.get('A')!, pos.get("C'")!, ['A', 'B', 'C', 'D'].map((i) => pos.get(i)!))).toBeCloseTo(35.264, 2);

    // a wrong value on the determined cube is refused (claim-refuted, keep-prior), never a silent pass
    reset();
    submit('קובייה ABCD');
    submit("הזווית בין הישר AC' לבין המישור ABCD היא 30");
    expect(state().lastError).not.toBeNull();
    expect(state().facts).toHaveLength(1); // the bad claim was NOT added (only the cube)
  });

  it('DRIVES a free-dim box so the angle becomes 30°', () => {
    reset();
    submit("תיבה ABCDA'B'C'D'");
    submit("הזווית בין הישר AC' לבין המישור ABCD היא 30");
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
    const pos = d.positions;
    expect(lpAngle(pos.get('A')!, pos.get("C'")!, ['A', 'B', 'C', 'D'].map((i) => pos.get(i)!))).toBeCloseTo(30, 2);
  });
});
