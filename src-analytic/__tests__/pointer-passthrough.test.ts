/**
 * A NEW INTERACTION LAYER MUST NOT SWALLOW THE OLD ONE (#1101).
 *
 * #1094 added drag-to-pan and captured the pointer on PRESS. Pointer capture retargets the whole
 * gesture to the capturing element, so the `click` that follows never reached the child — and the
 * crossing rings (#1025, #1092), which the operator had validated in T46–T48, stopped responding in
 * production while still being drawn.
 *
 * ## Why #1094's own verification missed it
 *
 * It drove a pan and a wheel zoom and asserted the view moved — and it did. Nothing asserted that a
 * CLICK still reached the objects underneath, because those objects belonged to a feature that
 * already worked. That is the shape of the gap, and it is what this file locks: the two behaviours
 * are asserted TOGETHER, because either one alone passes while the other is broken.
 *
 * These are source-scan assertions rather than rendered-DOM ones: this tree has no jsdom, and the
 * property at stake is a discipline about WHEN capture is taken, which reads clearly in the source
 * and is exactly what a future edit would undo.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP = fs.readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8');

/**
 * ONE handler's body, bounded by the next prop rather than by a fixed window.
 *
 * A fixed slice spilled from `onPointerDown` into `onPointerMove` and found the capture there — the
 * assertion passed judgement on the wrong code. A test that reads past its subject is a test that
 * reports on something else.
 */
const handlerBlock = (name: string): string => {
  const at = APP.indexOf(`${name}={(e) => {`);
  expect(at, `${name} exists`).toBeGreaterThan(-1);
  const rest = APP.slice(at + name.length);
  const end = rest.search(/\n {12}on[A-Z]\w+=\{/);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 900);
};

describe('#1101 — a press is not yet a drag', () => {
  it('pointer capture is NOT taken on press', () => {
    // The whole defect in one assertion.
    expect(handlerBlock('onPointerDown')).not.toContain('setPointerCapture');
  });

  it('it is taken on MOVE, and only past a threshold', () => {
    const move = handlerBlock('onPointerMove');
    expect(move).toContain('setPointerCapture');
    expect(move).toContain('DRAG_SLOP');
    // The threshold must GUARD the capture, not merely exist somewhere near it.
    const guard = move.indexOf('DRAG_SLOP');
    const capture = move.indexOf('setPointerCapture');
    expect(guard).toBeLessThan(capture);
  });

  it('the threshold is a few pixels — big enough for a hand, small enough to feel immediate', () => {
    const m = /const DRAG_SLOP = (\d+)/.exec(APP);
    expect(m, 'DRAG_SLOP is defined').not.toBeNull();
    const slop = Number(m![1]);
    expect(slop).toBeGreaterThan(0);
    expect(slop).toBeLessThanOrEqual(10);
  });

  it('and the drag still tracks from its ORIGIN, not by accumulating deltas', () => {
    // #1094's property, re-asserted here because the threshold work is the kind of edit that would
    // quietly turn it into an accumulation — and accumulation drifts, which means the drawing slides
    // out from under the cursor.
    const move = handlerBlock('onPointerMove');
    expect(move).toContain('start.x');
    expect(move).toContain('start.view');
  });
});

describe('#1101 — the objects under the canvas are still reachable', () => {
  it('the crossing rings still carry their click handler', () => {
    // If a future change removes the ring handler, the pan fix above would mask it: the rings would
    // be "not swallowed" and still do nothing.
    const fig = fs.readFileSync(path.resolve(__dirname, '..', 'render', 'Figure.tsx'), 'utf8');
    expect(fig).toContain('onCrossing');
    expect(/onClick=\{onCrossing/.test(fig), 'a ring is clickable').toBe(true);
  });
});
