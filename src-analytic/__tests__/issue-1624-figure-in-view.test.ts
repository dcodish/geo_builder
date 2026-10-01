/**
 * #1624 ([ADR-AG-190](../../docs/06c-decisions-analytic.md#adr-ag-190)) — THE FULL SHAPE IS ALWAYS ON THE
 * CANVAS.
 *
 * Operator, 2026-10-01, playing «דלתון ABCD» + «הציגו תצורה אחרת» (A and B on the canvas, C and D off it):
 * *"when i press show new config, the image jumps and sometimes i dont see the full image on canvas due to
 * the position it put the shape. we should have a rule that the full shape is always in the canvas."*
 *
 * Measured on `main` before this (24 presses from seed 0, the app's rule replayed): «טרפז ABCD» 13 presses
 * with a vertex off the canvas, «דלתון ABCD» 4, «מקבילית ABCD» 11, «מרובע ABCD» 22, «משולש ABC» 18.
 * #1262 kept the carried frame whenever the new figure was *largely* inside it; "largely" is not "wholly".
 *
 * These call `viewAfterChange` — the decision the App's box effect takes for every trigger — and
 * `anotherConfiguration`, the button's own seed walk. Nothing here re-implements either (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { anotherConfiguration } from '../app/another';
import { INITIAL_VIEW, boxContains, viewAfterChange, viewBox, type CanvasView } from '../render/view';
import type { Box } from '../engine/curves';

const SURFACE = { width: 1200, height: 800 };
const PRESSES = 24;
const NOUNS = [
  'טרפז ABCD',
  'טרפז ישר זווית ABCD',
  'דלתון ABCD',
  'מקבילית ABCD',
  'מלבן ABCD',
  'ריבוע ABCD',
  'מעוין ABCD',
  'מרובע ABCD',
  'משולש ABC',
];

const same = (a: Box, b: Box) =>
  Math.abs(a.minX - b.minX) < 1e-9 && Math.abs(a.maxX - b.maxX) < 1e-9 && Math.abs(a.minY - b.minY) < 1e-9 && Math.abs(a.maxY - b.maxY) < 1e-9;
const inside = (w: Box, p: { x: number; y: number }) => p.x >= w.minX - 1e-9 && p.x <= w.maxX + 1e-9 && p.y >= w.minY - 1e-9 && p.y <= w.maxY + 1e-9;

describe('#1624 — every press leaves the whole figure inside the view', () => {
  for (const noun of NOUNS) {
    it(`«${noun}»: ${PRESSES} presses — every point and segment end inside, a fitting press keeps the frame, no press shrinks it`, () => {
      const lines = [noun];
      let seed = 0;
      let d = derive(lines, seed);
      let view: CanvasView = INITIAL_VIEW;
      let shown = viewBox(d.box, view, SURFACE);
      let presses = 0;
      for (let i = 0; i < PRESSES; i++) {
        const next = anotherConfiguration(lines, seed);
        if (!next.found) break;
        presses++;
        const nd = derive(lines, next.seed);
        const fitsAlready = boxContains(shown, nd.box);
        view = viewAfterChange(d.box, view, nd.box, 'configuration', SURFACE);
        const now = viewBox(nd.box, view, SURFACE);
        const tag = `seed ${next.seed}`;
        for (const p of nd.figure.points) expect(inside(now, p), `${tag}: point ${p.id} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) is inside the view`).toBe(true);
        for (const s of nd.figure.segments) {
          expect(inside(now, s.a) && inside(now, s.b), `${tag}: segment ${s.ends.join('')} is inside the view`).toBe(true);
        }
        if (fitsAlready) expect(same(now, shown), `${tag}: the configuration fits the frame, so the frame does not move (#1262)`).toBe(true);
        expect(now.maxX - now.minX, `${tag}: the frame never shrinks on a press`).toBeGreaterThanOrEqual(shown.maxX - shown.minX - 1e-9);
        expect(boxContains(now, shown), `${tag}: the widened frame still contains the window the student was looking at`).toBe(true);
        shown = now;
        seed = next.seed;
        d = nd;
      }
      expect(presses, 'the noun has configurations to walk').toBeGreaterThan(0);
    });
  }
});

describe('#1624 — the same decision for a fact, an edit or an undo', () => {
  const OLD: Box = { minX: -2, maxX: 10, minY: -4, maxY: 4 };
  const NEW: Box = { minX: -4, maxX: 12, minY: -6, maxY: 6 };

  it('the default view always fits and is returned UNCHANGED (the React no-op that keeps the effect from looping)', () => {
    expect(viewAfterChange(OLD, INITIAL_VIEW, NEW, 'figure', SURFACE)).toBe(INITIAL_VIEW);
  });

  it('a deliberate zoom that still shows the whole figure survives the next line (#1225 anti-lock)', () => {
    const zoomedOut: CanvasView = { zoom: 0.5, centre: { x: 4, y: 0 } };
    expect(viewAfterChange(OLD, zoomedOut, NEW, 'figure', SURFACE)).toBe(zoomedOut);
  });

  it('a view that shows the figure only PARTLY is widened to the union — the student’s window stays in view', () => {
    const zoomedIn: CanvasView = { zoom: 1.6, centre: { x: 6, y: 1 } };
    const before = viewBox(NEW, zoomedIn, SURFACE);
    const after = viewBox(NEW, viewAfterChange(OLD, zoomedIn, NEW, 'figure', SURFACE), SURFACE);
    expect(boxContains(after, NEW), 'the whole figure').toBe(true);
    expect(boxContains(after, before), 'and the window the student had').toBe(true);
  });

  it('a figure that has LARGELY left the view re-fits — #1225’s re-centring, unchanged', () => {
    const elsewhere: CanvasView = { zoom: 1, centre: { x: 400, y: 0 } };
    expect(viewAfterChange(OLD, elsewhere, NEW, 'figure', SURFACE)).toBe(INITIAL_VIEW);
  });

  it('a PRESS never re-fits from nothing, even when the configuration lands far outside — it widens', () => {
    const near: Box = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const far: Box = { minX: 1000, maxX: 1010, minY: 1000, maxY: 1010 };
    const was = viewBox(near, INITIAL_VIEW, SURFACE);
    const now = viewBox(far, viewAfterChange(near, INITIAL_VIEW, far, 'configuration', SURFACE), SURFACE);
    expect(boxContains(now, far)).toBe(true);
    expect(boxContains(now, was)).toBe(true);
  });
});
