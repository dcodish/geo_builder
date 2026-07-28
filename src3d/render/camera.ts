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
