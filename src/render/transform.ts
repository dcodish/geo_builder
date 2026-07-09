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
  /** Inverse of {@link toScreen} — map a (base, pre pan/zoom) screen point back to a math point. */
  toWorld(s: Vec): Vec;
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

/**
 * The view rotation that lays segment a→b horizontal (a→b along +x): −atan2(Δy, Δx).
 * 0 for a degenerate/absent segment. A standing "align segment horizontal" request stores
 * the segment and recomputes this from the CURRENT positions every render, so it persists
 * as the figure reshapes under new constraints (rather than freezing one angle).
 */
export function alignRotation(a: Vec | undefined, b: Vec | undefined): number {
  if (!a || !b || (a.x === b.x && a.y === b.y)) return 0;
  return -Math.atan2(b.y - a.y, b.x - a.x);
}

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
  const toWorld = (s: Vec): Vec => ({
    x: minX + (s.x - offX) / scale,
    y: maxY - (s.y - offY) / scale, // inverse of the flip
  });

  return { scale, toScreen, toWorld };
}

/**
 * Fit HYSTERESIS (F4/REN-5): the engine guarantees existing points don't jump when a fact is added —
 * but the view refit on every positions change voided that at the screen layer (one out-of-bounds
 * extension/tangent crossing re-scaled and shifted EVERY existing point). Keep the PREVIOUS transform
 * while the figure still fits: adopt the fresh fit only when content OVERFLOWS the viewport (allowing
 * it to eat most of the padding first) or has SHRUNK so much the drawing wastes the screen (the fresh
 * fit would zoom in > `SHRINK`×). Pure, so the band is unit-testable.
 */
export function keepOrRefit(prev: Transform | null, next: Transform, worldPts: Vec[], vp: Viewport): Transform {
  if (!prev) return next;
  const SHRINK = 1.6; // fresh fit would zoom in this much ⇒ the figure got small — refit
  if (next.scale > prev.scale * SHRINK) return next;
  // Content may eat INTO the padding before a refit (that's the hysteresis that keeps existing points from
  // jumping) — but only down to a margin that still fits a point's LABEL. A vertex carries its letter ~12 px
  // out (`REF_OFF` in Figure.tsx) plus the glyph (~16 px), so a vertex closer than ~`LABEL_MARGIN` to the edge
  // clips its label. Reserving that room means a canvas SHRINK refits before the apex label disappears (the
  // "figure too large / top nodes not visible" report) instead of keeping an oversized transform. Capped at
  // the padding so a tiny viewport still behaves.
  const LABEL_MARGIN = 28;
  const m = Math.min(LABEL_MARGIN, vp.padding);
  for (const p of worldPts) {
    const s = prev.toScreen(p);
    if (s.x < m || s.x > vp.width - m || s.y < m || s.y > vp.height - m) return next; // overflow — refit
  }
  return prev;
}
