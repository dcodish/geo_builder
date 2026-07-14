/**
 * clientToSvg — the ONE client-space → SVG-viewBox conversion (hover + touch tap picking).
 *
 * Regression lock for the "angles are not detected at all" prod report (2026-07-09): `relationPickAt`
 * used to scale by the component's OUTER width/height props; once the toolbar row moved into normal flow
 * the SVG became SHORTER than the props, so every hover coordinate was stretched by the ratio — an error
 * growing toward the bottom of the canvas (~40px at the bottom edge), past every pick reach, so hovering
 * an angle/side found NOTHING while the detection layer itself was perfectly correct. The conversion must
 * use the SVG's own view size; these tests pin that contract, including the exact failure geometry.
 */
import { describe, it, expect } from 'vitest';
import { clientToSvg } from '../Figure';
import { relationAt } from '../scene';
import type { RelationsResult } from '@/engine';
import type { Id, Vec } from '@/engine';

describe('clientToSvg', () => {
  it('identity when the rect matches the view size', () => {
    const rect = { left: 100, top: 50, width: 1360, height: 716 };
    expect(clientToSvg(rect, 1360, 716, 100 + 700, 50 + 600)).toEqual({ x: 700, y: 600 });
  });

  it('scales by the rect ratio when the SVG is CSS-shrunk (the legitimate case)', () => {
    // SVG view 1000x800 rendered at half size: a client point mid-rect maps to mid-view.
    const rect = { left: 0, top: 0, width: 500, height: 400 };
    expect(clientToSvg(rect, 1000, 800, 250, 200)).toEqual({ x: 500, y: 400 });
  });

  it('the BUG shape: scaling by an OUTER size (view + toolbar) displaces the point toward the far edge', () => {
    // The SVG really is 716px tall (rect), its view is 716 — but the old code passed the 760px container
    // height. Near the bottom (y=700) that stretched the coordinate by ~43px. Locking the delta documents
    // why the conversion must receive the SVG's OWN size.
    const rect = { left: 0, top: 0, width: 1360, height: 716 };
    const correct = clientToSvg(rect, 1360, 716, 800, 700);
    const buggy = clientToSvg(rect, 1360, 760, 800, 700); // outer height leaked in
    expect(correct.y).toBe(700);
    expect(buggy.y).toBeCloseTo(743, 0); // ~43px off — outside every pick reach
    expect(Math.abs(buggy.y - correct.y)).toBeGreaterThan(40);
  });

  it('end-to-end: a hover near a BOTTOM vertex picks its angle class with the correct conversion and MISSES with the buggy one', () => {
    // Wedge at B=(650,700) in a 1360x716 view (B near the bottom, like the operator's figure): rays to
    // A=(50,700) (left) and C=(400,100) (up-left). Probe 30px into the wedge.
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'C' }, { vertex: 'E', a: 'D', b: 'F' }]],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const pos = new Map<Id, Vec>([
      ['B', { x: 650, y: 700 }], ['A', { x: 50, y: 700 }], ['C', { x: 400, y: 100 }],
      ['E', { x: 300, y: 300 }], ['D', { x: 200, y: 300 }], ['F', { x: 320, y: 200 }],
    ]);
    const rect = { left: 0, top: 0, width: 1360, height: 716 };
    // client point: 30px into B's wedge (between the two ray directions — average direction, normalized)
    const u = { x: (-1 + -0.4) / 2, y: (0 + -0.83) / 2 };
    const n = Math.hypot(u.x, u.y);
    const client = { x: 650 + (u.x / n) * 30, y: 700 + (u.y / n) * 30 };
    const good = clientToSvg(rect, 1360, 716, client.x, client.y);
    const bad = clientToSvg(rect, 1360, 760, client.x, client.y); // the pre-fix scaling
    expect(relationAt(rel, pos, good, 10, 44)).toEqual({ kind: 'angle', classIndex: 0 });
    expect(relationAt(rel, pos, bad, 10, 44)).toBeNull(); // the bug: the probe lands past the reach
  });
});
