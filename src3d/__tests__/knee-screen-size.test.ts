/**
 * #374: a knee is an ANNOTATION — its size is a screen quantity.
 *
 * Operator (2026-07-28), on the saved `test3` figure (a line ⟂ a plane, no points at all): "there is no
 * knee". There was one — emitted, at the right place (the crossing (2,0,-10), the exam's point A) — drawn
 * 2.11 px × 0.38 px. The legs were `radius * 0.07`, where `radius` measures the spread of the figure's
 * POINTS; with no points it falls back to its floor of 1.5 while the drawing spans ~10 world units.
 *
 * The same proxy fails the other way when a far-flung point stretches `radius` — which is what the
 * dismissed "huge knee" sighting (#368) was. Sizing off the fit's world→screen scale closes both.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const VIEWPORT = { width: 640, height: 460 };

const legs = (seed: number): number[][] => {
  const d = derive3(state().facts, seed);
  const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEWPORT, 1);
  return scene.marks.map((m) => {
    const [p, q, r] = m.pts;
    return [Math.hypot(q.x - p.x, q.y - p.y), Math.hypot(r.x - q.x, r.y - q.y)];
  });
};

describe('#374 — a knee is drawn at a legible SIZE regardless of the figure’s world scale', () => {
  beforeEach(() => state().clear());

  it("the operator's pointless figure (a line ⟂ a plane) draws a visible knee", () => {
    for (const u of [
      'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
      'המישור π: 3x + my + (m+6)z + 4 = 0',
      'הישר ℓ ניצב למישור π',
    ]) submit(u);
    expect(state().lastError).toBeNull();

    const d = derive3(state().facts, 2);
    expect(d.resolved.positions.size, 'the figure genuinely has no points — the case that broke it').toBe(0);

    const l = legs(2);
    expect(l.length, 'the knee is drawn').toBe(1);
    // pre-fix this pair was [2.11, 0.38] — both invisible
    expect(Math.max(...l[0]), 'the knee reads at a normal annotation size').toBeGreaterThan(10);
  });

  it('a compact figure with points draws a knee of the SAME screen size (not proportional to the world)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('AB מאונך ל-AD');
    const compact = legs(0);
    expect(compact.length).toBeGreaterThan(0);
    const longest = Math.max(...compact.flat());
    expect(longest, 'a unit-sized figure gets the same annotation size').toBeGreaterThan(10);
    expect(longest, 'and it is not allowed to grow with the drawing').toBeLessThan(30);
  });

  it('the knee stays inside the viewport (it is sized in screen units, so it cannot blow out)', () => {
    for (const u of [
      'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
      'המישור π: 3x + my + (m+6)z + 4 = 0',
      'הישר ℓ ניצב למישור π',
    ]) submit(u);
    const d = derive3(state().facts, 2);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEWPORT, 1);
    for (const m of scene.marks) {
      for (const p of m.pts) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(VIEWPORT.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(VIEWPORT.height);
      }
    }
  });
});
