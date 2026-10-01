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

/** The canvas's rendered size in pixels. Its ASPECT is what the world box must match. */
export interface Surface {
  width: number;
  height: number;
}

/**
 * The world box this view is looking at, FITTED TO THE CANVAS (#1122).
 *
 * #1103 fixed the measurement half of the letterbox — the scene is built at the `ResizeObserver`'s
 * size, so the `<svg>`'s `viewBox` equals its own box and `preserveAspectRatio` letterboxes nothing.
 * Its second half was never implemented, and there is a second letterbox one layer down: the world
 * box's aspect was the FIGURE's, so `makeTransform` fitted it with `Math.min(w/…, h/…)` and centred
 * the remainder in `ox`/`oy`. The letterbox had moved from outside the svg to inside it.
 *
 * What the student saw: a line stopping dead in open gridded canvas, with 33–51% of the width dead at
 * common window sizes. `lineSegmentIn` clips to the world box, which is correct — the box was the
 * wrong box. Zoom could not help, because both half-extents are divided by `view.zoom`, leaving the
 * aspect and the dead band invariant.
 *
 * **Growing the SHORT axis is the whole fix.** It shows more plane; it never stretches it, so the
 * scale stays one isotropic number. Done here, at the single place every consumer reads — the scene,
 * `panned`, `toWorld` and the wheel anchor — there is no second opinion about what the canvas shows,
 * which is what let the drag and the projection disagree.
 *
 * Consequence worth stating, because it is the invariant the locks assert: `makeTransform` now returns
 * `ox === 0 && oy === 0` by construction, for a rect of any aspect and a figure of any aspect.
 *
 * Without a measured surface (first paint, before the observer fires) the figure's own aspect stands —
 * a fallback, never a silent default: one frame later the real size arrives and the box is refitted.
 */
export function viewBox(figure: Box, view: CanvasView, surface?: Surface): Box {
  const c = view.centre ?? centreOf(figure);
  let halfX = (figure.maxX - figure.minX) / 2 / view.zoom;
  let halfY = (figure.maxY - figure.minY) / 2 / view.zoom;

  if (surface && surface.width > 0 && surface.height > 0 && halfX > 0 && halfY > 0) {
    const want = surface.width / surface.height;
    const have = halfX / halfY;
    // Grow the axis that is too short for the canvas; never shrink, or the figure would be cropped.
    if (have < want) halfX = halfY * want;
    else if (have > want) halfY = halfX / want;
  }

  return { minX: c.x - halfX, maxX: c.x + halfX, minY: c.y - halfY, maxY: c.y + halfY };
}

/**
 * THE SAME WORLD WINDOW, EXPRESSED AGAINST A NEW FIGURE BOX (#1262, ADR-AG-137).
 *
 * A `CanvasView` is RELATIVE to the figure's box — `zoom` divides the box's half-extents, `centre`
 * defaults to the box's centre — so when the box changes under it the shown window moves with the box.
 * On «הציגו תצורה אחרת» that was the lurch the operator reported: each configuration is a correct fit to
 * its own box, and with a symbolic parameter the boxes swing by the whole range of the parameter (width
 * 85 … 256, a factor of 3; centre +55 … −63, measured on «A(-9a,0)» · «B(41a,0)» · «נקודה P» · «PA מאונך
 * ל-PB»).
 *
 * Operator ruling, 2026-09-20: *fit once, then the frame is the student's* — the control changes the
 * DRAWING inside a frame that stays put, like flipping transparencies on one projector. This computes
 * the view that shows, against `to`, exactly the window `view` showed against `from`. With a surface the
 * window is reproduced exactly (the aspect step is inverted: the shown half-height is
 * `max(halfY, halfX/aspect)`, so the zoom is solved from it); without one, the figure's own aspect
 * stands and the window is reproduced on the taller axis, as `viewBox` itself does before first paint.
 * Whether the new figure is still worth looking at through that window is `figureIsVisible`'s question,
 * asked by the caller — the #1225 rule, one idea for a fact and a configuration alike.
 */
export function carryWindow(from: Box, view: CanvasView, to: Box, surface?: Surface): CanvasView {
  return viewShowing(viewBox(from, view, surface), to, surface, view.zoom);
}

/**
 * The view that shows (at least) the world window `window`, expressed against the figure box `to`.
 *
 * Exact when `window` already has the surface's aspect (what `carryWindow` hands it); otherwise the
 * aspect step grows the short axis, so the shown window CONTAINS `window` and is centred on it — more
 * plane, never a stretched one (the transform stays isotropic, ADR-AG-190 option (a)).
 */
function viewShowing(window: Box, to: Box, surface: Surface | undefined, fallbackZoom: number): CanvasView {
  const halfYShown = (window.maxY - window.minY) / 2;
  const halfXShown = (window.maxX - window.minX) / 2;
  const spanX = to.maxX - to.minX;
  const spanY = to.maxY - to.minY;
  const aspect = surface && surface.width > 0 && surface.height > 0 ? surface.width / surface.height : halfYShown > 0 ? halfXShown / halfYShown : 1;
  // viewBox(to, view') shows half-height max(spanY/2/zoom', spanX/2/zoom'/aspect); solve for zoom' so
  // that it is the larger of what the window needs on each axis.
  const govern = Math.max(spanY, spanX / aspect) / 2;
  const need = Math.max(halfYShown, halfXShown / aspect);
  const zoom = need > 0 && govern > 0 ? govern / need : fallbackZoom;
  return { zoom, centre: centreOf(window) };
}

/** Does the window `outer` contain the box `inner`? With a relative tolerance, so float noise is not "outside". */
export function boxContains(outer: Box, inner: Box): boolean {
  const eps = 1e-9 * Math.max(1, outer.maxX - outer.minX, outer.maxY - outer.minY);
  return (
    inner.minX >= outer.minX - eps && inner.maxX <= outer.maxX + eps && inner.minY >= outer.minY - eps && inner.maxY <= outer.maxY + eps
  );
}

/** What changed the figure: a configuration press carries the frame (#1262); anything else re-expresses it. */
export type FigureChange = 'configuration' | 'figure';

/**
 * THE VIEW AFTER THE FIGURE CHANGED — the one decision every trigger takes (#1624, ADR-AG-190).
 *
 * Operator, 2026-10-01, playing «דלתון ABCD» + «הציגו תצורה אחרת»: *"when i press show new config, the
 * image jumps and sometimes i dont see the full image on canvas due to the position it put the shape. we
 * should have a rule that the full shape is always in the canvas."*
 *
 * #1262 stopped the frame LURCHING by carrying it across a press, and kept it whenever the new figure was
 * *largely* (≥ 50% per axis, #1225's predicate) inside — so a configuration landing half outside the kept
 * frame stayed half outside. Measured on `main`, walking 24 presses: «טרפז ABCD» 13 presses with a vertex
 * off the canvas, «מרובע ABCD» 22, «משולש ABC» 18. The "largely visible" test answered the wrong
 * question: it is the right test for *has the figure left* (#1225), never for *is the figure shown*.
 *
 * The rule, as ruled — both goals, neither traded:
 * 1. **The candidate frame**: on a press, the window the student was looking at, carried (`carryWindow`);
 *    on a fact, an edit or an undo, the view as it stands (it is relative to the figure, so the default
 *    view follows it).
 * 2. **Keep it while the whole drawn box fits** — returned UNCHANGED (the same object), so a press whose
 *    configuration fits does not move the frame (#1262's guarantee) and a fact that fits is a React
 *    no-op (#1225's loop guard).
 * 3. **Otherwise WIDEN to the union of the candidate window and the drawn box** — the smallest move
 *    that shows the whole figure; the student's window stays in view, so a press never shrinks the frame
 *    and never re-fits from nothing.
 * 4. **One exception, kept from #1225**: on a fact/edit/undo, a figure that has LARGELY left the view
 *    (the student panned or zoomed elsewhere, then the figure changed) is re-fitted — the union would be
 *    mostly empty paper, and the operator asked for exactly that re-centring (*"pressing the center button
 *    does the work but this should be automatic"*). A press never takes it: its frame was the student's.
 *
 * The drawn box is the figure's padded box (`engine/evaluate.ts` `viewBox`, plus any shown trace), so
 * "fits" includes the existing margin and a vertex never sits on the canvas edge. Isotropic only — the
 * axis-ratio question (unequal scales) is open with the operator and is NOT built here.
 */
export function viewAfterChange(
  from: Box,
  view: CanvasView,
  to: Box,
  change: FigureChange,
  surface?: Surface,
): CanvasView {
  const candidate = change === 'configuration' ? carryWindow(from, view, to, surface) : view;
  const shown = viewBox(to, candidate, surface);
  if (boxContains(shown, to)) return candidate;
  if (change === 'figure' && !figureIsVisible(to, candidate, surface)) return INITIAL_VIEW;
  const union: Box = {
    minX: Math.min(shown.minX, to.minX),
    maxX: Math.max(shown.maxX, to.maxX),
    minY: Math.min(shown.minY, to.minY),
    maxY: Math.max(shown.maxY, to.maxY),
  };
  return viewShowing(union, to, surface, candidate.zoom);
}

/**
 * IS THE FIGURE STILL WORTH LOOKING AT THROUGH THIS VIEW? (#1225)
 *
 * Operator, playing T34: *"when i put MA=5 the focus on the canvas is lost and the image is not
 * centered. pressing the center button does the work but this should be automatic"* — the canvas
 * showed x ≈ 12…28 while the whole figure sat at x ≈ 0…8.
 *
 * ADR-AG-096 states the rule — *the view belongs to the figure it was computed for* — and #1209 shut
 * two doors, loading a file and «נקה הכל». Adding a FACT is a third: it changes the figure while the
 * transform computed for the previous, much larger one stays applied.
 *
 * **Why a predicate and not an unconditional re-fit.** A student who deliberately zoomed in to inspect
 * a vertex must not lose that on every subsequent line — that would trade this defect for a worse one,
 * the tool overriding a deliberate gesture again and again. So a deliberate zoom survives as long as
 * the figure is still on screen, and blank paper never survives.
 *
 * Measured per AXIS rather than by area, because a figure can be perfectly flat — three collinear
 * points have zero height — and an area ratio is `0/0` there. A degenerate axis counts as visible when
 * the figure's extent on it falls inside the view's.
 */
export function figureIsVisible(figure: Box, view: CanvasView, surface?: Surface, need = 0.5): boolean {
  const shown = viewBox(figure, view, surface);
  const axis = (fMin: number, fMax: number, sMin: number, sMax: number): number => {
    const span = fMax - fMin;
    const overlap = Math.min(fMax, sMax) - Math.max(fMin, sMin);
    // A flat axis has no span to be a fraction OF: it is visible, or it is not.
    if (span < 1e-9) return fMin >= sMin && fMax <= sMax ? 1 : 0;
    return Math.max(0, overlap) / span;
  };
  return (
    Math.min(
      axis(figure.minX, figure.maxX, shown.minX, shown.maxX),
      axis(figure.minY, figure.maxY, shown.minY, shown.maxY),
    ) >= need
  );
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
  const box = viewBox(figure, view, rect);
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
  const box = viewBox(figure, view, rect);
  const fx = rect.width > 0 ? px / rect.width : 0.5;
  const fy = rect.height > 0 ? py / rect.height : 0.5;
  return {
    x: box.minX + fx * (box.maxX - box.minX),
    // Screen y grows downward; world y grows up.
    y: box.maxY - fy * (box.maxY - box.minY),
  };
}
