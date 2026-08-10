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

import { cross3, dot3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';

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

/**
 * #5 — a purely PLANAR figure is read FACE-ON, not from the ¾ view.
 *
 * The ¾ view exists because a solid needs depth cues; a flat figure has no depth to cue, so the same
 * view only foreshortens it — a square in `z = 0` reads as a parallelogram, which is exactly the shape
 * the tool spends its life NOT drawing when the student did not say so. (The 2-D vector lane, V8-g, is
 * full of these: `משולש ABC`, `מרובע MKNL`.)
 *
 * Returns the figure's plane normal when EVERY point lies on one plane, else null. Scale-relative, not
 * absolute: "flat" means flat compared to the figure's own spread, so it holds for a 1000-unit figure
 * and rejects a 0.001-unit bulge in a tiny one. Under three points there is no plane to speak of.
 */
export function planarNormal(pts: Vec3[], tol = 1e-6): Vec3 | null {
  if (pts.length < 3) return null;
  const p0 = pts[0];
  // the widest independent pair of chords from p0 — the most numerically stable normal available
  let best: Vec3 | null = null;
  let bestMag = 0;
  for (let i = 1; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const n = cross3(sub3(pts[i], p0), sub3(pts[j], p0));
      const m = norm3(n);
      if (m > bestMag) { bestMag = m; best = n; }
    }
  }
  if (!best || bestMag < tol) return null; // collinear or coincident — no plane
  const n = normalize3(best);
  let spread = 0;
  for (const p of pts) spread = Math.max(spread, norm3(sub3(p, p0)));
  if (spread < tol) return null;
  for (const p of pts) if (Math.abs(dot3(n, sub3(p, p0))) > tol * spread * 1e3) return null; // off the plane
  return n;
}

/**
 * The view angles that look STRAIGHT AT a plane with this normal, as degrees.
 *
 * Two deliberate choices. The hemisphere is picked to agree with the default view, so a figure that
 * becomes planar does not flip to its mirror image. And the pitch is CLAMPED below the pole: the
 * orthographic frame is built as `cross(forward, z)` and degenerates at ±90°, which is precisely the
 * top-down case a `z = 0` figure asks for — so a flat figure is read from just under the pole, not from
 * a singular frame. `maxPitchDeg` is the renderer's own limit, passed in rather than duplicated here.
 */
export function faceOnView(n: Vec3, maxPitchDeg: number): { yawDeg: number; pitchDeg: number } {
  const d = defaultViewFrame().eye;
  // NORMALISE first: `pitch = asin(z)` is only an angle for a unit vector, and a caller handing over a
  // raw plane normal (any length) would otherwise get a silently wrong elevation. `planarNormal`
  // happens to return unit vectors, which is exactly why this would have gone unnoticed.
  const u = normalize3(n);
  const e = dot3(u, d) < 0 ? scale3(u, -1) : u;
  const pitch = Math.asin(Math.max(-1, Math.min(1, e.z)));
  const yaw = Math.abs(e.x) < 1e-9 && Math.abs(e.y) < 1e-9 ? (DEFAULT_VIEW.yawDeg * Math.PI) / 180 : Math.atan2(e.y, e.x);
  const deg = (r: number) => (r * 180) / Math.PI;
  return { yawDeg: deg(yaw), pitchDeg: Math.max(-maxPitchDeg, Math.min(maxPitchDeg, deg(pitch))) };
}
