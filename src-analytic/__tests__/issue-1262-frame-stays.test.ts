/**
 * #1262 ([ADR-AG-137](../../docs/06c-decisions-analytic.md#adr-ag-137)) — THE FRAME STAYS PUT ACROSS
 * «הציגו תצורה אחרת»; the figure moves inside it.
 *
 * Operator, 2026-09-18 (round #1193 T11): *"pressing on show another config causes the image to jump right
 * and left"*. Measured before, on «A(-9a,0)» · «B(41a,0)» · «נקודה P» · «PA מאונך ל-PB»: the frame was
 * re-fitted from nothing at every configuration — width 85 … 256 (a factor of 3), centre +55 … −63 —
 * because a `CanvasView` is relative to the figure's box and the box swings with `a`.
 *
 * Ruling (a), 2026-09-20: fit once, then the frame is the student's. The view carries the SAME world
 * window across the configuration change (`carryWindow`) and re-fits only when the new figure has largely
 * left it — #1225's rule for a fact, applied to a configuration, one idea in the product. The row that
 * pinned the lurch as a known state in `issue-1198-locus-in-view.test.ts` moved here with the new
 * expectation; the figure's OWN box still varies (that is the figure), the shown window does not.
 *
 * #1624 (ADR-AG-190) completes the rule: the window is kept while the WHOLE figure fits and widened to the
 * union of window and figure when it does not — "largely visible" had left vertices off the canvas.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { INITIAL_VIEW, carryWindow, figureIsVisible, viewAfterChange, viewBox, type CanvasView } from '../render/view';

const LINES = ['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'];
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const SURFACE = { width: 1200, height: 800 };
const width = (b: { minX: number; maxX: number }) => b.maxX - b.minX;
const same = (a: { minX: number; maxX: number; minY: number; maxY: number }, b: typeof a) =>
  Math.abs(a.minX - b.minX) < 1e-9 && Math.abs(a.maxX - b.maxX) < 1e-9 && Math.abs(a.minY - b.minY) < 1e-9 && Math.abs(a.maxY - b.maxY) < 1e-9;

describe('#1262 — the shown window is carried across configurations', () => {
  it('the figure’s OWN box still varies by a factor above 2 across seeds — that is the figure, not the frame', () => {
    const widths = SEEDS.map((s) => width(derive(LINES, s).box));
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(2);
  });

  it('carryWindow reproduces the window exactly against the new box, with a surface', () => {
    const boxes = SEEDS.map((s) => derive(LINES, s).box);
    let view: CanvasView = INITIAL_VIEW;
    const first = viewBox(boxes[0], view, SURFACE);
    for (let i = 1; i < boxes.length; i++) {
      view = carryWindow(boxes[i - 1], view, boxes[i], SURFACE);
      expect(same(viewBox(boxes[i], view, SURFACE), first), `seed ${SEEDS[i]}: the same window`).toBe(true);
    }
  });

  it('the carry survives a deliberate zoom and pan: whatever window the student had is the window they keep', () => {
    const boxes = SEEDS.map((s) => derive(LINES, s).box);
    const zoomed: CanvasView = { zoom: 2.5, centre: { x: 10, y: -20 } };
    const w0 = viewBox(boxes[0], zoomed, SURFACE);
    const carried = carryWindow(boxes[0], zoomed, boxes[3], SURFACE);
    expect(same(viewBox(boxes[3], carried, SURFACE), w0)).toBe(true);
  });

  /**
   * MOVED by #1624 (ADR-AG-190), not deleted. This row asserted the shown width was CONSTANT over the sweep
   * under the old keep-while-largely-visible rule — and measured, that constant frame left B off the canvas
   * at 4 of the 7 presses (seeds 2, 3, 6, 7): the #1624 class on #1262's own figure. Under the ruled rule the
   * frame is kept while the figure fits and widened (never shrunk, never moved sideways) when it does not,
   * so the lurch #1262 removed stays removed — the width is monotone, every frame contains the last — and the
   * whole figure is on the canvas at every press.
   */
  it('the app’s rule over the sweep: no lurch — every frame contains the last and none shrinks — and the whole figure is inside at every press (#1624)', () => {
    const ds = SEEDS.map((s) => derive(LINES, s));
    let view: CanvasView = INITIAL_VIEW;
    let shown = viewBox(ds[0].box, view, SURFACE);
    for (let i = 1; i < ds.length; i++) {
      view = viewAfterChange(ds[i - 1].box, view, ds[i].box, 'configuration', SURFACE);
      const now = viewBox(ds[i].box, view, SURFACE);
      const tag = `seed ${SEEDS[i]}`;
      expect(now.minX <= shown.minX + 1e-9 && now.maxX >= shown.maxX - 1e-9 && now.minY <= shown.minY + 1e-9 && now.maxY >= shown.maxY - 1e-9, `${tag}: the frame contains the previous one`).toBe(true);
      for (const p of ds[i].figure.points) {
        expect(p.x >= now.minX && p.x <= now.maxX && p.y >= now.minY && p.y <= now.maxY, `${tag}: ${p.id} is inside`).toBe(true);
      }
      shown = now;
    }
  });

  // #1624 (ADR-AG-190) replaced the re-fit with a WIDEN for a press — locked in issue-1624-figure-in-view.test.ts.
  // The predicate below is still the one a fact/edit/undo uses to decide the figure has LEFT the view.
  it('a configuration that has largely LEFT the frame is not visible through it (a press now widens, #1624)', () => {
    const near = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const far = { minX: 1000, maxX: 1010, minY: 1000, maxY: 1010 };
    const kept = carryWindow(near, INITIAL_VIEW, far, SURFACE);
    expect(figureIsVisible(far, kept, SURFACE), 'the far figure is not visible through the kept window').toBe(false);
  });
});
