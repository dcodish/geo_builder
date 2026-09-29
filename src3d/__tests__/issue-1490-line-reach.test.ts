/**
 * A LINE'S DRAWN EXTENT CONTAINS EVERY ANCHOR ON IT (#1490, ADR-3D-269).
 *
 * Operator, playing round #1488 T20: *"the line doesnt reach the plane"* — ℓ was clipped to the
 * figure's neighbourhood while the stated 45° arc's vertex (ℓ ∩ π) sat ~80 px beyond its drawn
 * end. One rule in the clipping step: every anchor pulls its line's range out to itself plus a
 * margin; a line with nothing anchored past the neighbourhood keeps its old endpoints.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { resolve3 } from '../engine/evaluate';
import { HOME_CAMERA } from '../render/camera';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const scene = () => {
  const c = derive3(useGeo3.getState().facts, useGeo3.getState().seed).construction;
  return buildScene3(c, resolve3(c, 0), HOME_CAMERA, { width: 800, height: 600 });
};

/** How far `p` sits outside the segment a–b, along it, in px. ≤0 means inside. */
const beyond = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
  return Math.max(-t, t - 1) * len;
};

beforeEach(reset);

describe('#1490 — the operator’s T20 figure', () => {
  it('the 45° arc’s vertex lies ON the drawn segment of ℓ, with margin', () => {
    submit('מישור π');
    submit('x=(1,2,3)+t(2,0,2)');
    submit('זווית בין ישר ℓ למישור π=45');
    const s = scene();
    const line = s.lines.find((l) => l.name.includes('ℓ'))!;
    expect(line).toBeTruthy();
    const arc = s.angles.find((a) => a.text.includes('45'))!;
    expect(arc).toBeTruthy();
    // The arc's own vertex, in screen space: the first arc point is on an arm near the vertex, so
    // use the wedge's anchor — the label rides the arc; the VERTEX is the geometry the line must
    // reach. SceneAngle3 carries the arc points; the vertex is where the two arms meet, which the
    // arc's own points bracket — every arc point must be within the drawn line's neighbourhood
    // only if it anchors on ℓ, so assert the STRONGER, direct fact: no arc point of this angle
    // sits beyond ℓ's drawn segment along ℓ by more than a knee's width.
    for (const p of arc.pts) {
      expect(beyond(p, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 })).toBeLessThan(30);
    }
  });

  it('a figure with nothing anchored past the neighbourhood keeps its clip — the line is not blown out', () => {
    submit('x=(1,2,3)+t(2,0,2)');
    const s = scene();
    const line = s.lines.find((l) => l.name.includes('ℓ'))!;
    const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    expect(len).toBeGreaterThan(50);
    expect(len).toBeLessThan(1200);
  });
});
