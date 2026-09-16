/**
 * THE VIEW — what part of the plane the canvas is looking at (#1094).
 *
 * Operator, 2026-09-16: *"the canvas has no zoom and move features"*. It had the shared `+ − ↺`
 * cluster (ADR-W-024) and nothing else: no pan at all, and zoom only in 1.25× steps about a centre
 * the student could not choose.
 *
 * ## Why this is box arithmetic and not a `<g transform>`
 *
 * 2-D pans and zooms with an SVG transform layer over a fixed projection, which is right for a
 * plane-geometry figure: the drawing is the content and there is no background.
 *
 * **This canvas is a COORDINATE SYSTEM.** Its axes, grid and tick labels are content. Under a
 * `<g transform>` they would scale with the drawing — the grid would coarsen, the labels would grow,
 * and «10» would stop meaning ten. So the view moves the WORLD BOX and re-projects, which keeps the
 * grid crisp and every number true at any zoom. The capability is the same as 2-D's; the
 * implementation deliberately is not, and a naive port would have shipped a coordinate plane whose
 * numbers lie.
 *
 * This module is pure arithmetic over a box — no React, no DOM, no product knowledge — so the
 * invariants below can be asserted directly rather than through a rendered canvas.
 */
import { clampZoom } from '../../shell/frame/canvasControls';
import type { Box } from '../engine/curves';

/**
 * Where the student is looking.
 *
 * `centre` is `null` until they move it, and that is the load-bearing part: while it is null the
 * view follows the FIGURE's centre, so a drawing that grows stays framed. Once they pan, the view is
 * theirs and a later given must not yank it away from them.
 */
export interface CanvasView {
  zoom: number;
  centre: { x: number; y: number } | null;
}

export const INITIAL_VIEW: CanvasView = { zoom: 1, centre: null };

/** The box the figure would be drawn in, before the student moved anything. */
export const centreOf = (box: Box) => ({
  x: (box.minX + box.maxX) / 2,
  y: (box.minY + box.maxY) / 2,
});

/**
 * The world box this view is looking at.
 *
 * The half-extents are taken from the figure's own box, so the aspect the renderer was given is
 * preserved — zoom scales what is visible, it does not reshape it.
 */
export function viewBox(figure: Box, view: CanvasView): Box {
  const c = view.centre ?? centreOf(figure);
  const halfX = (figure.maxX - figure.minX) / 2 / view.zoom;
  const halfY = (figure.maxY - figure.minY) / 2 / view.zoom;
  return { minX: c.x - halfX, maxX: c.x + halfX, minY: c.y - halfY, maxY: c.y + halfY };
}

/**
 * Drag: the world point under the cursor stays under the cursor.
 *
 * `dxPx`/`dyPx` are the pointer's travel since the drag began, and `rect` the canvas's rendered size
 * — NOT the projection's nominal size, which is a fixed number the SVG scales away. Measuring the
 * real element is what makes a drag track the cursor at any window size.
 *
 * The y term is added rather than subtracted because screen y grows downward and world y grows up.
 */
export function panned(
  figure: Box,
  view: CanvasView,
  dxPx: number,
  dyPx: number,
  rect: { width: number; height: number },
): CanvasView {
  const box = viewBox(figure, view);
  if (rect.width <= 0 || rect.height <= 0) return view;
  const worldPerPxX = (box.maxX - box.minX) / rect.width;
  const worldPerPxY = (box.maxY - box.minY) / rect.height;
  const c = view.centre ?? centreOf(figure);
  return { zoom: view.zoom, centre: { x: c.x - dxPx * worldPerPxX, y: c.y + dyPx * worldPerPxY } };
}

/**
 * Zoom about a world ANCHOR — the point under the cursor, which must not move.
 *
 * Anchoring is what makes a wheel feel like a camera rather than a slider: zooming toward the corner
 * a student is reading keeps that corner where they are looking. The `+`/`−` buttons pass the
 * current centre as the anchor, so they behave exactly as they did before (#1094 changes no
 * behaviour the operator already had).
 *
 * The clamp is the shared one. A product inventing its own limits is the drift ADR-W-024 closed.
 */
export function zoomedAt(
  figure: Box,
  view: CanvasView,
  factor: number,
  anchor: { x: number; y: number },
): CanvasView {
  const next = clampZoom(view.zoom * factor);
  // The clamp may have refused the step; then nothing moves, or the anchor would drift at the limit.
  if (next === view.zoom) return view;
  const c = view.centre ?? centreOf(figure);
  // Distance from anchor to centre shrinks by exactly the zoom ratio, which is what holds the anchor
  // fixed on screen.
  const k = view.zoom / next;
  return { zoom: next, centre: { x: anchor.x + (c.x - anchor.x) * k, y: anchor.y + (c.y - anchor.y) * k } };
}

/** Screen point → world point, for whatever the view is currently showing. */
export function toWorld(
  figure: Box,
  view: CanvasView,
  px: number,
  py: number,
  rect: { width: number; height: number },
): { x: number; y: number } {
  const box = viewBox(figure, view);
  const fx = rect.width > 0 ? px / rect.width : 0.5;
  const fy = rect.height > 0 ? py / rect.height : 0.5;
  return {
    x: box.minX + fx * (box.maxX - box.minX),
    // Screen y grows downward; world y grows up.
    y: box.maxY - fy * (box.maxY - box.minY),
  };
}
