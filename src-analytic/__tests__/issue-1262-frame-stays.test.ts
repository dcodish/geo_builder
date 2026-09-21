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
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { INITIAL_VIEW, carryWindow, figureIsVisible, viewBox, type CanvasView } from '../render/view';

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

  it('the app’s rule over the sweep: keep the window while the figure is largely on screen, else re-fit — measured, the reported figure never needs a re-fit and the shown width is constant (was a factor of 3)', () => {
    const boxes = SEEDS.map((s) => derive(LINES, s).box);
    let view: CanvasView = INITIAL_VIEW;
    const shownWidths: number[] = [width(viewBox(boxes[0], view, SURFACE))];
    let refits = 0;
    for (let i = 1; i < boxes.length; i++) {
      const kept = carryWindow(boxes[i - 1], view, boxes[i], SURFACE);
      if (figureIsVisible(boxes[i], kept, SURFACE)) view = kept;
      else { view = INITIAL_VIEW; refits++; }
      shownWidths.push(width(viewBox(boxes[i], view, SURFACE)));
    }
    expect(refits, 'every configuration of this figure stays largely inside the first frame').toBe(0);
    expect(Math.max(...shownWidths) / Math.min(...shownWidths)).toBeLessThan(1 + 1e-9);
  });

  it('a configuration that has largely LEFT the frame re-fits — the escape hatch the ruling accepted', () => {
    const near = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const far = { minX: 1000, maxX: 1010, minY: 1000, maxY: 1010 };
    const kept = carryWindow(near, INITIAL_VIEW, far, SURFACE);
    expect(figureIsVisible(far, kept, SURFACE), 'the far figure is not visible through the kept window').toBe(false);
  });
});
