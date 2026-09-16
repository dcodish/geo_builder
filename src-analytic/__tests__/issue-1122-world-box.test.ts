/**
 * #1122 — the WORLD BOX matches the canvas, so a line reaches the edge and a diagonal drag does not skew.
 *
 * **What #1103 fixed, and what it did not.** `da01357d` implemented the MEASUREMENT half: the scene is
 * built at the `ResizeObserver`'s size, so the `<svg>`'s `viewBox` equals its own box and
 * `preserveAspectRatio` letterboxes nothing. That part holds. Its second half — *"pad the world box to
 * the surface's aspect, at ONE place"* — was never implemented, and there is a second letterbox one layer
 * down: `viewBox` took its half-extents from the FIGURE's box, so `makeTransform` fitted it with
 * `Math.min(width / w, height / h)` and centred the remainder in `ox`/`oy`. **The letterbox moved from
 * outside the svg to inside it.**
 *
 * The operator, on the shipped build: *"note the canvas doesnt draw the lines nicely when i zoom and play
 * with the canvas"* — two straight lines stopping in the middle of an empty gridded canvas, 33–51% of the
 * width dead at common window sizes.
 *
 * **Why #1103's own locks could not see it.** They assert the svg box; none asserts that the WORLD box
 * agrees with it. So the layer the defect lived in was never spoken about — the same shape as #1102 and
 * #1041 (see [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)): the gate measured the half
 * that was right.
 *
 * These cases are pure arithmetic over boxes — no DOM, no React — which is why `view.ts` is written as
 * box arithmetic in the first place.
 */
import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, panned, toWorld, viewBox, zoomedAt, type CanvasView } from '../render/view';
import { makeTransform } from '../render/scene';
import type { Box } from '../engine/curves';

/** A tall-ish figure box, deliberately NOT the canvas's aspect. */
const FIGURE: Box = { minX: -5, maxX: 5, minY: -8, maxY: 8 };

/** Real viewport sizes from the issue's measurement table, plus two extremes. */
const SURFACES = [
  { width: 1094, height: 804 },   // 1920×1080 — 33% dead before the fix
  { width: 1094, height: 584 },   // 1920×860  — 51% dead
  { width: 774, height: 674 },    // 1600×950  — ox was exactly (774-674)/2
  { width: 300, height: 900 },    // portrait: the OTHER axis must grow
  { width: 500, height: 500 },    // square
];

const FIGURES: Box[] = [
  FIGURE,
  { minX: -20, maxX: 20, minY: -1, maxY: 1 },   // very wide
  { minX: -1, maxX: 1, minY: -20, maxY: 20 },   // very tall
  { minX: 0, maxX: 10, minY: 0, maxY: 10 },     // square, off-origin
];

const aspect = (b: Box) => (b.maxX - b.minX) / (b.maxY - b.minY);

describe('#1122 — nothing is letterboxed: the world box IS the canvas', () => {
  it('ox and oy are zero for every rect aspect × figure aspect', () => {
    /**
     * The direct statement that nothing is letterboxed, and the one #1103 should have carried. A
     * non-zero `ox` is precisely the dead band the operator photographed.
     */
    for (const surface of SURFACES) {
      for (const figure of FIGURES) {
        for (const zoom of [0.5, 1, 2.5]) {
          const view: CanvasView = { zoom, centre: null };
          const box = viewBox(figure, view, surface);
          const t = makeTransform(box, surface.width, surface.height);

          const ox = (surface.width - (box.maxX - box.minX) * t.scale) / 2;
          const oy = (surface.height - (box.maxY - box.minY) * t.scale) / 2;

          expect(ox, `ox for ${surface.width}×${surface.height}`).toBeCloseTo(0, 6);
          expect(oy, `oy for ${surface.width}×${surface.height}`).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('the world box carries the CANVAS aspect, not the figure aspect', () => {
    for (const surface of SURFACES) {
      for (const figure of FIGURES) {
        const box = viewBox(figure, INITIAL_VIEW, surface);
        expect(aspect(box)).toBeCloseTo(surface.width / surface.height, 6);
      }
    }
  });

  it('grows the short axis — it never crops the figure', () => {
    /**
     * Fitting could be done by shrinking the long axis instead, and that would satisfy the aspect
     * assertion above while hiding part of the drawing. Showing MORE plane is the whole point.
     */
    for (const surface of SURFACES) {
      for (const figure of FIGURES) {
        const box = viewBox(figure, INITIAL_VIEW, surface);
        expect(box.maxX - box.minX).toBeGreaterThanOrEqual(figure.maxX - figure.minX - 1e-9);
        expect(box.maxY - box.minY).toBeGreaterThanOrEqual(figure.maxY - figure.minY - 1e-9);
      }
    }
  });

  it('keeps the figure centred while the view is untouched', () => {
    for (const surface of SURFACES) {
      const box = viewBox(FIGURE, INITIAL_VIEW, surface);
      expect((box.minX + box.maxX) / 2).toBeCloseTo((FIGURE.minX + FIGURE.maxX) / 2, 9);
      expect((box.minY + box.maxY) / 2).toBeCloseTo((FIGURE.minY + FIGURE.maxY) / 2, 9);
    }
  });
});

describe('#1122 — a drag tracks the cursor on BOTH axes', () => {
  it('a diagonal drag moves the world point under the cursor by the cursor’s own vector', () => {
    /**
     * The case that matters and the one a single-axis assertion passes anyway.
     *
     * Before the fix, `panned`/`toWorld` mapped pointer travel through the rendered rect while the
     * world box filled only the rect's HEIGHT, so measured tracking was x=0.735 / y=1.000 at 1920×1080
     * and x=0.530 / y=1.000 at 1920×860. y was exact and x was not, so a diagonal drag no longer moved
     * along the cursor's line at all — the figure sheared under the hand. Both ratios must be 1.
     */
    for (const surface of SURFACES) {
      for (const figure of FIGURES) {
        const view: CanvasView = { zoom: 1.4, centre: null };
        const start = { px: surface.width * 0.4, py: surface.height * 0.6 };
        const dx = 200;
        const dy = 120;

        /**
         * Driven through the RENDERED transform, not through `toWorld` alone.
         *
         * `toWorld` and `panned` share one box, so comparing them to each other is self-consistent
         * whatever the aspect — a first draft of this case did exactly that and stayed GREEN with the
         * fix removed, which would have made it a lock that checks nothing. The skew lives BETWEEN the
         * world box and the drawing: `makeTransform` letterboxes, so the figure occupies only part of
         * the rect while the pointer travels all of it. So take a world point, find where it is really
         * painted, drag, and require it to be painted exactly `(dx, dy)` away.
         */
        const probe = toWorld(figure, view, start.px, start.py, surface);

        const t0 = makeTransform(viewBox(figure, view, surface), surface.width, surface.height);
        const screenBefore = { x: t0.sx(probe.x), y: t0.sy(probe.y) };

        const after = panned(figure, view, dx, dy, surface);
        const t1 = makeTransform(viewBox(figure, after, surface), surface.width, surface.height);
        const screenAfter = { x: t1.sx(probe.x), y: t1.sy(probe.y) };

        expect(screenAfter.x - screenBefore.x, `x tracking at ${surface.width}×${surface.height}`)
          .toBeCloseTo(dx, 4);
        expect(screenAfter.y - screenBefore.y, `y tracking at ${surface.width}×${surface.height}`)
          .toBeCloseTo(dy, 4);
      }
    }
  });

  it('the wheel anchor stays under the cursor at any rect aspect', () => {
    for (const surface of SURFACES) {
      const view: CanvasView = { zoom: 1, centre: null };
      const px = surface.width * 0.7;
      const py = surface.height * 0.25;
      const anchor = toWorld(FIGURE, view, px, py, surface);

      const zoomed = zoomedAt(FIGURE, view, 1.25, anchor);
      const afterZoom = toWorld(FIGURE, zoomed, px, py, surface);

      expect(afterZoom.x).toBeCloseTo(anchor.x, 6);
      expect(afterZoom.y).toBeCloseTo(anchor.y, 6);
    }
  });
});

describe('#1122 — a drawn line reaches the canvas edge', () => {
  it('a line crossing the view is clipped to the box the student can actually see', () => {
    /**
     * The student-visible statement, and the operator's own words. `lineSegmentIn` clips to the world
     * box; with the box fitted, "the edge of the box" and "the edge of the canvas" are the same place,
     * so a line no longer stops in open gridded space.
     */
    for (const surface of SURFACES) {
      const box = viewBox(FIGURE, INITIAL_VIEW, surface);
      const t = makeTransform(box, surface.width, surface.height);

      // y = x, the operator's own second line: it crosses the whole view.
      const xs = [box.minX, box.maxX];
      const screenXs = xs.map((x) => t.sx(x));

      expect(Math.min(...screenXs)).toBeCloseTo(0, 6);
      expect(Math.max(...screenXs)).toBeCloseTo(surface.width, 6);

      const ys = [box.minY, box.maxY].map((y) => t.sy(y));
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(surface.height, 6);
    }
  });

  it('falls back to the figure aspect before the surface is measured', () => {
    /**
     * First paint, before the ResizeObserver fires. A fallback, never a silent default — one frame
     * later the real size arrives and the box is refitted (ADR-052's distinction).
     */
    const box = viewBox(FIGURE, INITIAL_VIEW);
    expect(aspect(box)).toBeCloseTo(aspect(FIGURE), 9);
    const degenerate = viewBox(FIGURE, INITIAL_VIEW, { width: 0, height: 0 });
    expect(aspect(degenerate)).toBeCloseTo(aspect(FIGURE), 9);
  });
});
