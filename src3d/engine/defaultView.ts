/**
 * The canonical direction the figure is READ from (#372).
 *
 * The engine normally has no business knowing about cameras — orbiting is strictly a view concern and
 * never changes the figure (docs/20 §6.4). But one engine decision genuinely depends on the view: when a
 * placement is an unstated free DOF ([ADR-3D-095](../../docs/06b-decisions-3d.md#adr-3d-095)), "is this
 * placement misleading?" cannot be answered in world space alone. A line can clear a vertex by a wide
 * margin in R³ and still project straight through it, and the student judges the drawing.
 *
 * So the engine scores candidate placements against THIS fixed direction — the default view, the one a
 * figure is first seen from. It is deliberately NOT the live camera: scoring against that would re-place
 * the figure as the student orbits, which would be far worse than the problem it solves.
 *
 * This module is the single definition. `render/camera.ts` builds `HOME_CAMERA` from the same angles, and
 * `default-view.test.ts` asserts the two frames agree — so the direction the engine optimises for is
 * always the direction the student actually gets.
 */

import { cross3, normalize3, v3, type Vec3 } from './vec3';

/** The classic ¾ textbook view: from the front-right, a little above. Degrees. */
export const DEFAULT_VIEW = { yawDeg: -60, pitchDeg: 20 } as const;

export interface ViewFrame {
  /** Unit direction from the origin toward the viewer. */
  eye: Vec3;
  right: Vec3;
  up: Vec3;
}

/** The orthographic frame of the default view — same construction as the renderer's `cameraFrame`. */
export function defaultViewFrame(): ViewFrame {
  const yaw = (DEFAULT_VIEW.yawDeg * Math.PI) / 180;
  const pitch = (DEFAULT_VIEW.pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch);
  const eye = v3(cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch));
  const forward = v3(-eye.x, -eye.y, -eye.z);
  const right = normalize3(cross3(forward, v3(0, 0, 1)));
  const up = cross3(eye, right);
  return { eye, right, up };
}
