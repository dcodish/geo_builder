/**
 * #372: ADR-3D-095 guarantees a sampled placement clears every absolute object in R³ — but the student
 * judges the DRAWING. A line can miss a vertex by a wide margin in space and still project straight
 * through it (measured pre-fix: 0.28 of an edge in world space, 4.9 px on screen).
 *
 * Two things were wrong, and the second turned out to dominate:
 *   1. placements were scored on world clearance only;
 *   2. a line's DRAWN extent was `scale3(ln.dir, reach)` with an UNNORMALIZED direction, so a line whose
 *      direction vector happened to have magnitude 8 drew eight times too long — blowing out the
 *      isotropic fit and shrinking the figure into a corner, which is what turned healthy world
 *      clearances into single-digit pixels.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA, cameraFrame } from '../render/camera';
import { defaultViewFrame } from '../engine/defaultView';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const VIEWPORT = { width: 640, height: 460 };

const sceneAt = (seed: number) => {
  const d = derive3(state().facts, seed);
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEWPORT, 1);
};

/** Smallest screen distance from any drawn vertex to the drawn line. */
const nearestVertexPx = (seed: number): number => {
  const scene = sceneAt(seed);
  const L = scene.lines[0];
  if (!L) return Infinity;
  const dx = L.x2 - L.x1;
  const dy = L.y2 - L.y1;
  const len = Math.hypot(dx, dy);
  let worst = Infinity;
  for (const p of scene.points) {
    worst = Math.min(worst, Math.abs((p.x - L.x1) * dy - (p.y - L.y1) * dx) / len);
  }
  return worst;
};

describe('#372 — a placement must read correctly, not merely be correct', () => {
  beforeEach(() => state().clear());

  it("the operator's figure keeps the line visibly clear of every vertex, in every configuration", () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    let worst = Infinity;
    let worstSeed = -1;
    for (let seed = 0; seed < 40; seed++) {
      const px = nearestVertexPx(seed);
      if (px < worst) {
        worst = px;
        worstSeed = seed;
      }
    }
    // pre-fix: 4.9 px at seed 4, and 3.9 px at seed 23 — visually "the line goes through A"
    expect(worst, `worst separation was ${worst.toFixed(1)} px at seed ${worstSeed}`).toBeGreaterThan(15);
  });

  it("a line's drawn length does not depend on how its direction vector was scaled", () => {
    submit('פירמידה משולשת ABCD');
    submit('הישר ℓ1: x = (0,0,0) + t(0,1,2)');
    const a = sceneAt(0).lines[0];
    const lenA = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);

    state().clear();
    submit('פירמידה משולשת ABCD');
    submit('הישר ℓ1: x = (0,0,0) + t(0,4,8)'); // the SAME line, direction scaled ×4
    const b = sceneAt(0).lines[0];
    const lenB = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);

    expect(lenB, 'the same line drawn the same length').toBeCloseTo(lenA, 6);
  });

  it('the engine optimises for the view the student actually gets', () => {
    const engine = defaultViewFrame();
    const renderer = cameraFrame(HOME_CAMERA);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(engine.eye[axis]).toBeCloseTo(renderer.eye[axis], 12);
      expect(engine.right[axis]).toBeCloseTo(renderer.right[axis], 12);
      expect(engine.up[axis]).toBeCloseTo(renderer.up[axis], 12);
    }
  });
});
