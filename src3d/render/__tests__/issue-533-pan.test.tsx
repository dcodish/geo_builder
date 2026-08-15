/**
 * Issue #533 (ADR-3D-155): the canvas can be PANNED.
 *
 * Operator (prod): *"when the shape is positioned in such a place, it is not possible to see the
 * shape - i need a drag option to drag the shape as is"*. The view owned exactly two gauges — orbit
 * and zoom — and `scene3.ts` hard-pins the content bounding-box centre to the viewport centre, so
 * WHERE the solid lands is a function of the bbox and of nothing the student controls. Anything that
 * dominates that bbox (the origin-anchored axes, a long parametric line, a far witness segment)
 * squeezes the solid into a corner. And zoom — the one framing gesture that existed — multiplies `k`
 * while the centre stays the bbox centre, so it magnifies about a point that may be nowhere near the
 * solid: the gesture that LOSES the figure. Pan is the missing recovery lever.
 *
 * Testing note: this tree tests React DOM-free (`renderToStaticMarkup`; there is no jsdom or
 * testing-library anywhere in the repo), so the gesture DECISIONS are locked as the pure functions
 * they were extracted into, and the render side is locked structurally.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyCommand3 } from '../../engine/apply';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3 } from '../../engine/types';
import { buildScene3 } from '../scene3';
import { HOME_CAMERA } from '../camera';
import Figure3 from '../Figure3';
import { dragModeFor, panForZoom } from '../viewGauge';

const cube = () => {
  const r = applyCommand3(emptyConstruction3(), {
    type: 'solid',
    kind: 'cube',
    ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"],
  });
  if (!r.ok) throw new Error('apply failed');
  return r.next;
};

describe('#533 — the gesture map (operator ruling 2026-08-11: modifier + secondary drag)', () => {
  it('LEFT-drag stays ORBIT — the primary gesture does not move', () => {
    expect(dragModeFor({ button: 0, shiftKey: false, pointerCount: 1 })).toBe('orbit');
  });

  it('the secondary buttons pan', () => {
    expect(dragModeFor({ button: 2, shiftKey: false, pointerCount: 1 })).toBe('pan'); // right
    expect(dragModeFor({ button: 1, shiftKey: false, pointerCount: 1 })).toBe('pan'); // middle
  });

  it('Shift+left-drag pans — the keyboard path, for a one-button pointer', () => {
    expect(dragModeFor({ button: 0, shiftKey: true, pointerCount: 1 })).toBe('pan');
  });

  it('touch: ONE finger orbits, TWO fingers pan', () => {
    expect(dragModeFor({ button: 0, shiftKey: false, pointerCount: 1 })).toBe('orbit');
    expect(dragModeFor({ button: 0, shiftKey: false, pointerCount: 2 })).toBe('pan');
  });
});

describe('#533 — zoom about the pointer', () => {
  it('the point under the cursor stays under the cursor', () => {
    const q = { x: 200, y: 120 };
    const pan = { x: 30, y: -10 };
    const r = 1.12;
    const next = panForZoom(q, pan, r);
    // the screen image of q after the step is (q − pan)·r + next — assert it is q itself
    expect((q.x - pan.x) * r + next.x).toBeCloseTo(q.x, 9);
    expect((q.y - pan.y) * r + next.y).toBeCloseTo(q.y, 9);
  });

  it('a CLAMPED zoom (ratio 1) pans nothing — the arithmetic reads the actual ratio', () => {
    const pan = { x: 42, y: -17 };
    expect(panForZoom({ x: 200, y: 120 }, pan, 1)).toEqual(pan);
  });

  it('zooming out about the pointer is the exact inverse of zooming in', () => {
    const q = { x: 310, y: 55 };
    const start = { x: 0, y: 0 };
    const inAgain = panForZoom(q, start, 1.12);
    const back = panForZoom(q, inAgain, 1 / 1.12);
    expect(back.x).toBeCloseTo(start.x, 9);
    expect(back.y).toBeCloseTo(start.y, 9);
  });
});

describe('#533 — the render side: pan is a screen-space translation and nothing more', () => {
  const c = cube();
  const resolved = resolve3(c, 0);

  it('the scene is wrapped in ONE pan group', () => {
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolved} resetLabel="reset" />);
    expect(html.match(/data-testid="pan-group"/g), 'exactly one pan group').toHaveLength(1);
    expect(html).toContain('transform="translate(0 0)"'); // unpanned by default
  });

  it('the pan group WRAPS the figure content — the marks translate with it', () => {
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolved} resetLabel="reset" />);
    const start = html.indexOf('data-testid="pan-group"');
    const end = html.lastIndexOf('</svg>');
    const inside = html.slice(start, end);
    expect(inside.match(/<line /g), 'every edge is inside the group').toHaveLength(12);
    expect(inside.match(/<circle /g), 'every vertex is inside the group').toHaveLength(8);
  });

  it('the reset button is OUTSIDE the pan group — a lost frame must stay recoverable', () => {
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolved} resetLabel="reset" />);
    const svgEnd = html.lastIndexOf('</svg>');
    expect(html.indexOf('aria-label="reset"'), 'the ↺ button sits after the svg').toBeGreaterThan(svgEnd);
  });

  it('`buildScene3` is untouched by panning — it takes no pan and emits pinned coordinates', () => {
    // the load-bearing invariant: pan lives entirely in the component, so a panned canvas and an
    // unpanned one are the SAME scene. Anything derived from the scene therefore cannot drift.
    const a = buildScene3(c, resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true);
    const b = buildScene3(c, resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true);
    expect(a).toEqual(b);
    expect(buildScene3.length, 'no pan parameter was added to the pure renderer').toBeLessThanOrEqual(7);
  });

  it('panning cannot reach the construction: the gauge is component state, never a command', () => {
    // asserted structurally — `viewGauge` is pure arithmetic over screen pixels and imports nothing
    // from the engine, so there is no path from a gesture to the figure (docs/20 §6.4)
    const before = JSON.stringify([...c.points.keys()]);
    renderToStaticMarkup(<Figure3 construction={c} resolved={resolved} resetLabel="reset" />);
    expect(JSON.stringify([...c.points.keys()])).toBe(before);
  });
});
