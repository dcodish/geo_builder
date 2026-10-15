/**
 * #1934 ([ADR-660](../../../docs/06-decisions.md#adr-660)) — BARE POINTS ARE NEVER STACKED BY THE DEFAULT.
 *
 * Every bare «נקודה X» hands the same canned spot (3, 2). The free-point arm probed away from a degenerate spot
 * around that spot, but for the third point the spot IS the first point, the line test through the centre and a
 * point at the centre is undefined, every candidate failed, and the fallback (4.5, 2) stacked C (and D, E, F) on B
 * at the base layout — which replay folds on at every seed, so a declared triangle over them was refused as flat.
 * Measured on d8e591a2: C = D = E = F = B = (4.5, 2) at seed 0.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));
import { factsOf } from '../../__tests__/scenarios-harness';
import { replay } from '@/replay/core';

type P = { x: number; y: number };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function layout(n: number, seed: number): P[] {
  const r = replay(factsOf(LETTERS.slice(0, n).map((l) => `נקודה ${l}`)), seed);
  return LETTERS.slice(0, n).map((l) => r.positions.get(l)!);
}
const span = (ps: P[]) => Math.max(...ps.flatMap((p) => ps.map((q) => Math.hypot(p.x - q.x, p.y - q.y))));

describe('#1934 — three, four and six bare points are in general position', () => {
  for (const n of [3, 4, 6]) {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      it(`${n} bare points at seed ${seed}: pairwise distinct, no three on a line`, () => {
        const ps = layout(n, seed);
        const s = span(ps);
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            expect(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y), `${LETTERS[i]}${LETTERS[j]}`).toBeGreaterThan(0.015 * s);
            for (let k = j + 1; k < n; k++) {
              const area2 = Math.abs((ps[j].x - ps[i].x) * (ps[k].y - ps[i].y) - (ps[j].y - ps[i].y) * (ps[k].x - ps[i].x));
              expect(area2 / (s * s), `${LETTERS[i]}${LETTERS[j]}${LETTERS[k]}`).toBeGreaterThan(1e-4);
            }
          }
      });
    }
  }

  it('the first two bare points keep their places (a healthy default is bit-identical)', () => {
    const [a, b] = layout(2, 0);
    expect(a).toEqual({ x: 3, y: 2 });
    expect(b).toEqual({ x: 4.5, y: 2 });
  });

  it('four bare points lie in convex position in the order they were placed', () => {
    const ps = layout(4, 0);
    const turns = ps.map((a, i) => {
      const b = ps[(i + 1) % 4], c = ps[(i + 2) % 4];
      return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    });
    expect(new Set(turns).size).toBe(1);
  });
});
