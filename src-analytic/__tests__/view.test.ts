/**
 * THE VIEW (#1094) — pan and zoom as box arithmetic.
 *
 * Operator, 2026-09-16: *"the canvas has no zoom and move features"*.
 *
 * These assert the two properties that make a canvas feel like a camera rather than a slider, and
 * they are asserted on PURE FUNCTIONS rather than through a rendered canvas, which is the whole
 * reason `render/view.ts` holds no React and no DOM:
 *
 *  - a drag keeps the world point under the cursor under the cursor;
 *  - a wheel zoom keeps the world point under the cursor under the cursor.
 *
 * Plus the one that is easy to get wrong and invisible when it breaks: the view follows the FIGURE
 * until the student moves it, and is theirs afterwards.
 */
import { describe, expect, it } from 'vitest';
import { CANVAS_ZOOM_MAX, CANVAS_ZOOM_MIN, CANVAS_ZOOM_STEP } from '../../shell/frame/canvasControls';
import { INITIAL_VIEW, centreOf, panned, toWorld, viewBox, zoomedAt } from '../render/view';

/** A 20×20 world box centred on the origin, and a 400×400 canvas — 1 world unit per 20 px. */
const FIGURE = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
const RECT = { width: 400, height: 400 };

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('#1094 — the view follows the figure until the student moves it', () => {
  it('starts centred on the figure, at 1×', () => {
    expect(viewBox(FIGURE, INITIAL_VIEW)).toEqual(FIGURE);
  });

  it('a figure that GROWS stays framed while the view is untouched', () => {
    const bigger = { minX: -50, maxX: 50, minY: -50, maxY: 50 };
    expect(viewBox(bigger, INITIAL_VIEW)).toEqual(bigger);
  });

  it('but once panned, a later given does NOT yank the view away', () => {
    // The load-bearing behaviour: `centre` stops being null, so the box is the student's from then
    // on. A view that re-centred on every derive would make the canvas unusable while typing.
    const moved = panned(FIGURE, INITIAL_VIEW, 100, 0, RECT);
    const bigger = { minX: -50, maxX: 50, minY: -50, maxY: 50 };
    expect(moved.centre).not.toBeNull();
    expect(viewBox(bigger, moved).minX).not.toBe(bigger.minX);
    near(centreOf(viewBox(bigger, moved)).x, moved.centre!.x);
  });

  it('and ↺ re-arms the following', () => {
    expect(INITIAL_VIEW.centre).toBeNull();
    expect(viewBox(FIGURE, INITIAL_VIEW)).toEqual(FIGURE);
  });
});

describe('#1094 — a drag keeps the world under the cursor', () => {
  it('dragging right moves the view LEFT by the same world distance', () => {
    // 100 px right at 20 px per world unit = 5 world units; the centre moves the other way, because
    // the content follows the hand.
    const v = panned(FIGURE, INITIAL_VIEW, 100, 0, RECT);
    near(v.centre!.x, -5);
    near(v.centre!.y, 0);
  });

  it('dragging down moves the view UP — screen y and world y run opposite', () => {
    const v = panned(FIGURE, INITIAL_VIEW, 0, 100, RECT);
    near(v.centre!.y, 5);
  });

  it('the point under the cursor at drag start is under it at drag end', () => {
    // The property, stated directly. Pick a point, drag, and check it followed.
    const from = { px: 120, py: 260 };
    const before = toWorld(FIGURE, INITIAL_VIEW, from.px, from.py, RECT);
    const dx = 73;
    const dy = -41;
    const after = panned(FIGURE, INITIAL_VIEW, dx, dy, RECT);
    const under = toWorld(FIGURE, after, from.px + dx, from.py + dy, RECT);
    near(under.x, before.x);
    near(under.y, before.y);
  });

  it('is measured against the RENDERED size, not the projection’s nominal one', () => {
    // The same drag on a canvas half as wide covers twice the world.
    const wide = panned(FIGURE, INITIAL_VIEW, 100, 0, { width: 400, height: 400 });
    const narrow = panned(FIGURE, INITIAL_VIEW, 100, 0, { width: 200, height: 400 });
    near(narrow.centre!.x, wide.centre!.x * 2);
  });

  it('a zero-sized canvas changes nothing rather than dividing by zero', () => {
    expect(panned(FIGURE, INITIAL_VIEW, 50, 50, { width: 0, height: 0 })).toEqual(INITIAL_VIEW);
  });
});

describe('#1094 — a wheel zoom keeps the world under the cursor', () => {
  it('the anchor point does not move', () => {
    const at = { px: 300, py: 120 };
    const anchor = toWorld(FIGURE, INITIAL_VIEW, at.px, at.py, RECT);
    const v = zoomedAt(FIGURE, INITIAL_VIEW, CANVAS_ZOOM_STEP, anchor);
    const after = toWorld(FIGURE, v, at.px, at.py, RECT);
    near(after.x, anchor.x, 1e-9);
    near(after.y, anchor.y, 1e-9);
  });

  it('and still does not move after several steps, in and out', () => {
    const at = { px: 88, py: 341 };
    let v = INITIAL_VIEW;
    for (const f of [CANVAS_ZOOM_STEP, CANVAS_ZOOM_STEP, 1 / CANVAS_ZOOM_STEP, CANVAS_ZOOM_STEP]) {
      const anchor = toWorld(FIGURE, v, at.px, at.py, RECT);
      v = zoomedAt(FIGURE, v, f, anchor);
      const after = toWorld(FIGURE, v, at.px, at.py, RECT);
      near(after.x, anchor.x, 1e-9);
      near(after.y, anchor.y, 1e-9);
    }
  });

  it('zooming in shows LESS of the world', () => {
    const inn = viewBox(FIGURE, zoomedAt(FIGURE, INITIAL_VIEW, CANVAS_ZOOM_STEP, centreOf(FIGURE)));
    expect(inn.maxX - inn.minX).toBeLessThan(FIGURE.maxX - FIGURE.minX);
  });

  it('about the CENTRE, a zoom does not move the centre — which is what the buttons do', () => {
    const v = zoomedAt(FIGURE, INITIAL_VIEW, CANVAS_ZOOM_STEP, centreOf(FIGURE));
    near(v.centre!.x, 0);
    near(v.centre!.y, 0);
  });
});

describe('#1094 — the limits are the suite’s, not this product’s', () => {
  it('clamps to the shared min and max', () => {
    let v = INITIAL_VIEW;
    for (let i = 0; i < 40; i += 1) v = zoomedAt(FIGURE, v, CANVAS_ZOOM_STEP, centreOf(FIGURE));
    expect(v.zoom).toBe(CANVAS_ZOOM_MAX);
    for (let i = 0; i < 80; i += 1) v = zoomedAt(FIGURE, v, 1 / CANVAS_ZOOM_STEP, centreOf(FIGURE));
    expect(v.zoom).toBe(CANVAS_ZOOM_MIN);
  });

  it('a refused step moves NOTHING — the anchor must not drift at the limit', () => {
    let v = INITIAL_VIEW;
    for (let i = 0; i < 40; i += 1) v = zoomedAt(FIGURE, v, CANVAS_ZOOM_STEP, centreOf(FIGURE));
    const atLimit = v;
    const again = zoomedAt(FIGURE, atLimit, CANVAS_ZOOM_STEP, { x: 7, y: -3 });
    expect(again).toBe(atLimit);
  });
});
