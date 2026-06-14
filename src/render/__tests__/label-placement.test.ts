/**
 * Label placement avoids lines. The largest-empty-wedge seed only knows the
 * segments meeting at a vertex; `chooseLabelDirs` additionally scores the label
 * box against EVERY segment/line/circle and rotates off a line it would sit on,
 * while staying near the seed when the seed is already clear.
 */

import { describe, it, expect } from 'vitest';
import type { Vec } from '@/engine/types';
import { chooseLabelDirs } from '../Figure';

const OFF = 12;
const CLEAR = 9;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const distToSeg = (p: Vec, a: Vec, b: Vec) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
};
const labelPos = (P: Vec, dir: Vec) => ({ x: P.x + dir.x * OFF, y: P.y + dir.y * OFF });

describe('chooseLabelDirs', () => {
  it('keeps the seed direction when it is already clear', () => {
    const P = { x: 0, y: 0 };
    const dirs = chooseLabelDirs([{ id: 'A', screen: P, seed: { x: 1, y: 0 } }], [], [], OFF, CLEAR);
    expect(dirs.get('A')!.x).toBeGreaterThan(0.9); // stayed pointing right
  });

  it('rotates away from a line that sits on the seed placement', () => {
    const P = { x: 0, y: 0 };
    // A vertical line exactly where the seed (→) would drop the label (x = OFF).
    const obstacle: [Vec, Vec] = [{ x: OFF, y: -100 }, { x: OFF, y: 100 }];
    const dirs = chooseLabelDirs([{ id: 'A', screen: P, seed: { x: 1, y: 0 } }], [obstacle], [], OFF, CLEAR);
    const chosen = dirs.get('A')!;
    // The seed placement is ON the line (clearance 0); the chosen one must clear it.
    expect(distToSeg(labelPos(P, { x: 1, y: 0 }), obstacle[0], obstacle[1])).toBeLessThan(0.5);
    expect(distToSeg(labelPos(P, chosen), obstacle[0], obstacle[1])).toBeGreaterThan(CLEAR * 0.7);
  });

  it('rotates off a circle arc passing through the seed placement', () => {
    const P = { x: 0, y: 0 };
    // A circle whose arc passes through (OFF, 0) — the seed label spot.
    const circle = { c: { x: OFF, y: 100 }, r: 100 };
    const dirs = chooseLabelDirs([{ id: 'B', screen: P, seed: { x: 1, y: 0 } }], [], [circle], OFF, CLEAR);
    const chosen = dirs.get('B')!;
    const L = labelPos(P, chosen);
    expect(Math.abs(Math.hypot(L.x - circle.c.x, L.y - circle.c.y) - circle.r)).toBeGreaterThan(CLEAR * 0.7);
  });
});
