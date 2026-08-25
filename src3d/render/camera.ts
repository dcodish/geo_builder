/**
 * Orthographic orbit camera (docs/20 §6.4, D2): world (z up) → screen plane.
 *
 * The camera looks at the origin from the unit direction `eye(yaw, pitch)`;
 * projection is orthographic (the textbook look — no perspective foreshortening).
 * Screen frame is right-handed: x right, y up (the scene builder flips y for SVG),
 * depth grows TOWARD the viewer (bigger = closer).
 *
 * Orbit never changes the figure — it is strictly a view concern (docs/20 §6.4).
 */

import { DEFAULT_VIEW } from '../engine/defaultView';
import { cross3, dot3, normalize3, v3, type Vec3 } from '../engine/vec3';

export interface Camera3 {
  /** Radians around the world z axis. */
  yaw: number;
  /** Radians above the horizon; clamped by the UI to ±85° (the frame degenerates at ±90°). */
  pitch: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * The classic ¾ textbook view: from the front-right, a little above. The angles live in
 * `engine/defaultView` because the engine scores unstated placements against this same direction
 * (#372) — one definition, so the view it optimises for is the view the student gets.
 */
export const HOME_CAMERA: Camera3 = { yaw: rad(DEFAULT_VIEW.yawDeg), pitch: rad(DEFAULT_VIEW.pitchDeg) };

export const MAX_PITCH = rad(85);

/**
 * #714 — the NAMED VIEWS orbit does not give.
 *
 * docs/28 §4a D7 recorded the viewport controls as differing BY NATURE between the builders (2-D
 * pan/zoom/rotate/flips vs 3-D orbit/pan/zoom/reset). Orbit already gives free rotation; what it does
 * not give is the ALIGN half — snapping to a canonical orientation. A student reproducing a textbook
 * figure wants the drawing oriented the way the book prints it, and hunting for "straight on" by drag
 * is exactly the fiddly thing a preset removes.
 *
 * The angles are stated here, once, in the same (yaw, pitch) the orbit uses — so a preset is literally
 * a camera the student could have dragged to, and nothing downstream needs to know a preset happened.
 *
 * Derivation, against `cameraFrame` (world z up):
 *  - `front` — eye (0,−1,0): right = +x, up = +z ⇒ the xz plane, x rightward.
 *  - `side`  — eye (1,0,0):  right = +y, up = +z ⇒ the yz plane, y rightward.
 *  - `top`   — straight down would be pitch 90°, where the frame DEGENERATES (`right` is the cross
 *              product of two parallel vectors). Clamped to {@link MAX_PITCH}, the same limit the UI
 *              imposes on dragging — a near-top view that stays a valid frame, rather than a special
 *              case the renderer would have to know about.
 *  - `iso`   — true isometric: pitch = atan(1/√2) ≈ 35.264°, the angle at which all three axes are
 *              equally foreshortened. Deliberately NOT {@link HOME_CAMERA}, which is the ¾ textbook
 *              view (−60°, 20°) and a different thing; both are offered.
 */
export const VIEW_PRESETS = {
  front: { yaw: rad(-90), pitch: rad(0) },
  side: { yaw: rad(0), pitch: rad(0) },
  top: { yaw: rad(-90), pitch: MAX_PITCH },
  iso: { yaw: rad(-45), pitch: Math.atan(1 / Math.SQRT2) },
} as const satisfies Record<string, Camera3>;

export type ViewPreset = keyof typeof VIEW_PRESETS;
export const VIEW_PRESET_ORDER: readonly ViewPreset[] = ['front', 'top', 'side', 'iso'];

export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export interface CameraFrame {
  /** Unit direction from the origin toward the camera. */
  eye: Vec3;
  right: Vec3;
  up: Vec3;
}

export function cameraFrame(cam: Camera3): CameraFrame {
  const cp = Math.cos(cam.pitch);
  const eye = v3(cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), Math.sin(cam.pitch));
  const forward = v3(-eye.x, -eye.y, -eye.z);
  const right = normalize3(cross3(forward, v3(0, 0, 1)));
  const up = cross3(eye, right); // = backward × right → completes the right-handed frame
  return { eye, right, up };
}

export function project3(p: Vec3, frame: CameraFrame): Projected {
  return { x: dot3(p, frame.right), y: dot3(p, frame.up), depth: dot3(p, frame.eye) };
}
