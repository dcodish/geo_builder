/**
 * World→screen transform (Phase 2).
 *
 * The engine works in math coordinates (y-up, arbitrary units, any origin).
 * SVG works in screen coordinates (y-down, pixels, origin top-left). This
 * module computes a uniform fit: the smallest isotropic scale that places the
 * whole figure inside the viewport with padding, then centres it. Y is flipped
 * so math-up renders as screen-up.
 *
 * Pure and DOM-free so it can be unit-tested directly (renderer is a swappable
 * layer over the engine — docs/04-design.md §Rendering).
 */

import type { Vec } from '@/engine/types';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Inset (px) kept clear on every side so labels/marks aren't clipped. */
  padding: number;
}

export interface Transform {
  /** Isotropic units→px scale. */
  scale: number;
  /** Map a math point to a screen point. */
  toScreen(v: Vec): Vec;
}

/**
 * A view orientation: rotate (radians, applied first) then optionally mirror.
 * It's an isometry — the figure's shape is preserved, only its placement on
 * screen changes. Applied to world points *before* the fit, so the rotated
 * figure is re-fitted and centred, label directions are computed in the rotated
 * frame, and (because label glyphs are never rotated) labels stay upright.
 */
export interface Orientation {
  rot: number;
  flipX: boolean;
  flipY: boolean;
}

export const NO_ORIENT: Orientation = { rot: 0, flipX: false, flipY: false };

/** Apply a view {@link Orientation} to a world point. */
export function orient(v: Vec, o: Orientation): Vec {
  let x = v.x;
  let y = v.y;
  if (o.rot) {
    const c = Math.cos(o.rot);
    const s = Math.sin(o.rot);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  if (o.flipX) x = -x;
  if (o.flipY) y = -y;
  return { x, y };
}

/** Axis-aligned bounds of the points; a unit box around the origin if empty. */
export function boundsOf(points: Vec[]): Box {
  if (points.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Fit `points` into `vp` with uniform scale, centred, Y flipped. Degenerate
 * spans (a single point, or all points collinear on one axis) fall back to a
 * minimum span so the scale stays finite and the figure isn't zoomed to a sliver.
 */
export function fitTransform(points: Vec[], vp: Viewport): Transform {
  const b = boundsOf(points);
  const MIN_SPAN = 1; // units; a lone point (or a collinear axis) gets this span
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const spanX = Math.max(b.maxX - b.minX, MIN_SPAN);
  const spanY = Math.max(b.maxY - b.minY, MIN_SPAN);

  // Effective box, re-centred on the content's midpoint so a degenerate span
  // still places the figure at the viewport centre rather than a corner.
  const minX = cx - spanX / 2;
  const maxY = cy + spanY / 2;

  const availW = Math.max(vp.width - 2 * vp.padding, 1);
  const availH = Math.max(vp.height - 2 * vp.padding, 1);
  const scale = Math.min(availW / spanX, availH / spanY);

  // Centre the content within the available area.
  const offX = vp.padding + (availW - spanX * scale) / 2;
  const offY = vp.padding + (availH - spanY * scale) / 2;

  const toScreen = (v: Vec): Vec => ({
    x: offX + (v.x - minX) * scale,
    y: offY + (maxY - v.y) * scale, // flip: math-up → screen-down
  });

  return { scale, toScreen };
}
