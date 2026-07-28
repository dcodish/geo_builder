/**
 * Operator (2026-07-28), looking at the 2024-Q2 figure after `הישר ℓ ניצב למישור π`: "when we say a line
 * is perpendicular, we should increase the plane or move it so it shows they are perpendicular and
 * include a knee".
 *
 * Two gaps, both a rule already stated correctly with one member missing:
 *  - `rightAngles3` reads every recorded ⊥ EXCEPT `c.linePerps`, so the one given whose entire content is
 *    a right angle drew no knee (the ADR-3D-093 class).
 *  - a plane patch grows to cover every point ON it, but not where a drawn LINE crosses it — so the
 *    figure showed a line and a rectangle that never meet.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { rightAngles3 } from '../render/rightAngles';
import { HOME_CAMERA } from '../render/camera';
import { add3, dot3, norm3, scale3, sub3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const FIG = [
  'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
  'המישור π: 3x + my + (m+6)z + 4 = 0',
  'הישר ℓ ניצב למישור π',
];

describe('a line ⟂ a plane is DRAWN as perpendicular', () => {
  beforeEach(() => state().clear());

  it('a knee is emitted at the crossing, with arms along the line and in the plane', () => {
    for (const u of FIG) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);

    const marks = rightAngles3(d.construction, d.resolved, 1.5);
    expect(marks.length, 'the stated ⟂ produces a knee').toBeGreaterThan(0);

    const ln = d.resolved.lines.get('ℓ')!;
    const pl = d.resolved.planes.get('π')!;
    const m = marks[0];

    // the vertex is genuinely the crossing: on the plane AND on the line
    expect(Math.abs(dot3(pl.n, m.vertex) + pl.d) / norm3(pl.n), 'knee sits ON the plane').toBeLessThan(1e-6);
    const q = sub3(m.vertex, ln.anchor);
    const t = dot3(q, ln.dir) / dot3(ln.dir, ln.dir);
    expect(norm3(sub3(q, scale3(ln.dir, t))), 'knee sits ON the line').toBeLessThan(1e-6);

    // arms: one along the line, one lying in the plane, and mutually perpendicular
    expect(Math.abs(dot3(m.u2, pl.n)) / (norm3(m.u2) * norm3(pl.n)), 'second arm lies IN the plane').toBeLessThan(1e-6);
    expect(Math.abs(dot3(m.u1, m.u2)) / (norm3(m.u1) * norm3(m.u2)), 'the arms are perpendicular').toBeLessThan(1e-6);
  });

  it('the patch reaches the crossing, so the line and the plane visibly meet', () => {
    for (const u of FIG) submit(u);
    const d = derive3(state().facts, state().seed);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);

    const ln = d.resolved.lines.get('ℓ')!;
    const pl = d.resolved.planes.get('π')!;
    const cross = add3(ln.anchor, scale3(ln.dir, -(dot3(pl.n, ln.anchor) + pl.d) / dot3(pl.n, ln.dir)));

    // project the crossing the same way the scene does, then test it against the drawn patch
    const patch = scene.planes.find((p) => p.name === 'π')!;
    expect(patch, 'the plane is drawn').toBeTruthy();
    const xs = patch.corners.map((p) => p.x);
    const ys = patch.corners.map((p) => p.y);
    const line = scene.lines.find((l) => l.name === 'ℓ')!;
    // the drawn line must pass through the patch's screen box — the visual claim the given makes
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    let inside = false;
    for (let i = 0; i <= 200; i++) {
      const px = line.x1 + (dx * i) / 200;
      const py = line.y1 + (dy * i) / 200;
      if (px >= Math.min(...xs) && px <= Math.max(...xs) && py >= Math.min(...ys) && py <= Math.max(...ys)) {
        inside = true;
        break;
      }
    }
    expect(inside, 'the drawn line crosses the drawn patch').toBe(true);
    expect(cross).toBeTruthy();
  });
});
