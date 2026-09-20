/**
 * #1225 — A FIGURE THE STUDENT BUILDS IS VISIBLE.
 *
 * **Operator, 2026-09-19, playing T34:** *"when i put MA=5 the focus on the canvas is lost and the
 * image is not centered. pressing the center button does the work but this should be automatic"* —
 * with a screenshot showing the canvas at x ≈ 12…28 while the whole figure sat at x ≈ 0…8.
 *
 * ## The third door on ADR-AG-096's own class
 *
 * That ADR states the rule — *the view belongs to the figure it was computed for* — and #1209 shut
 * two doors. Every `setView` in the panel, before this:
 *
 * ```
 * showWholeFigure()      load a file        #1209
 * showWholeFigure()      clear all          #1209
 * setView(zoomedAt(…))   the wheel          user gesture
 * setView(panned(…))     a drag             user gesture
 * setView(INITIAL_VIEW)  the reset button   user gesture
 * setView(zoomedAt(…))   the zoom buttons   user gesture
 * ```
 *
 * **Adding a FACT is on no list.** It changes the figure, and the transform computed for the previous
 * one stays applied: «MA = 5» collapses `M` from two free degrees of freedom to a discrete pair, so
 * the wide view computed while `M` roamed then framed empty paper.
 *
 * ## Why a predicate, not an unconditional re-fit
 *
 * Re-fitting on every fact would trade this defect for a worse one — a student who deliberately zoomed
 * into a vertex losing it on every subsequent line, the tool overriding a gesture again and again. So
 * a deliberate zoom survives while the figure is still on screen, and blank paper never survives.
 *
 * The operator has not ruled on that threshold; it is the session's recommendation, recorded here and
 * on the issue so it is cheap to reverse.
 *
 * These call `figureIsVisible` — the decision itself. The `useEffect` that consumes it lives in
 * `App.tsx` with no extracted component, the constraint ADR-AG-094 and ADR-AG-096 both record.
 */
import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, figureIsVisible, type CanvasView } from '../render/view';
import type { Box } from '../engine/curves';

/** The operator's figure after «MA = 5»: A(0,0), B(8,0), M(4, ±3). */
const FIGURE: Box = { minX: 0, minY: -3, maxX: 8, maxY: 3 };

describe('#1225 — the view follows the figure it is drawn over', () => {
  it('the default view shows the whole figure', () => {
    expect(figureIsVisible(FIGURE, INITIAL_VIEW)).toBe(true);
  });

  it("the operator's own view — panned far right — does NOT", () => {
    /**
     * His screenshot: the canvas framed x ≈ 12…28 while the figure sat at x ≈ 0…8. Centring the view
     * at x = 20 reproduces it.
     */
    const panned: CanvasView = { zoom: 1, centre: { x: 20, y: 0 } };
    expect(figureIsVisible(FIGURE, panned)).toBe(false);
  });

  it('A DELIBERATE ZOOM SURVIVES while the figure is still on screen — the anti-lock', () => {
    /**
     * The whole reason this is a predicate. Zooming in on the middle of the figure keeps most of it
     * visible, so the next fact must NOT snatch the view back.
     */
    const zoomedOnCentre: CanvasView = { zoom: 1.4, centre: { x: 4, y: 0 } };
    expect(figureIsVisible(FIGURE, zoomedOnCentre)).toBe(true);
  });

  it('but a zoom into an empty corner does not', () => {
    const cornered: CanvasView = { zoom: 8, centre: { x: 7.8, y: 2.9 } };
    expect(figureIsVisible(FIGURE, cornered)).toBe(false);
  });

  it('A FLAT figure is judged, not divided by zero', () => {
    /**
     * Three collinear points have zero height, so an area ratio would be `0/0`. A degenerate axis is
     * visible when the figure's extent on it falls inside the view's.
     */
    const flat: Box = { minX: 0, minY: 0, maxX: 8, maxY: 0 };
    expect(figureIsVisible(flat, INITIAL_VIEW)).toBe(true);
    expect(figureIsVisible(flat, { zoom: 1, centre: { x: 40, y: 0 } })).toBe(false);
  });

  it('a figure that GREW is re-fitted only when a stale zoom hides it', () => {
    /**
     * Measured while writing this: at zoom 1 a grown figure still fits, because `viewBox` takes its
     * half-extents from the CURRENT figure — so growth alone is not a failure mode, and asserting it
     * was would have locked in a false belief. What does hide a grown figure is a stale ZOOM.
     */
    const grown: Box = { minX: -60, minY: -60, maxX: 60, maxY: 60 };
    expect(figureIsVisible(grown, { zoom: 1, centre: { x: 4, y: 0 } }), 'growth alone is fine').toBe(true);
    expect(figureIsVisible(grown, { zoom: 8, centre: { x: 4, y: 0 } }), 'a stale zoom is not').toBe(false);
  });
});
