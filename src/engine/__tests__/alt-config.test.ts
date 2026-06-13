/**
 * "Show another configuration" (FR-ALT) over a figure's free DOFs: the seeded
 * sampler must give a DIFFERENT valid drawing for the under-determined parts (an
 * inscribed triangle's free vertices) while leaving fixed-angle shapes (an
 * inscribed square) and driven/constrained points alone.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build } from '../step';
import { applySeed, freeDofs } from '../sample';
import { evaluate } from '../evaluate';
import { dist } from '../geometry';
import type { Command } from '../types';

const cmds = (u: string): Command[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse: ${u}`);
  return r.commands as Command[];
};

describe('resample varies free on-circle vertices (an inscribed triangle)', () => {
  it('the vertices are free DOFs and move to a different valid configuration', () => {
    const { construction, positions } = build(cmds('triangle ABD inscribed in circle O radius 5'));
    expect(freeDofs(construction)).toEqual(expect.arrayContaining(['A', 'B', 'D'])); // vertices are free
    const A0 = positions.get('A')!;
    let differs = false;
    for (let s = 1; s < 8 && !differs; s++) {
      const e = evaluate(applySeed(construction, s));
      if (e.ok && dist(e.positions.get('A')!, A0) > 0.5) {
        differs = true;
        // still a valid inscribed triangle — all three vertices on the radius-5 circle
        const O = e.positions.get('O')!;
        for (const id of ['A', 'B', 'D']) expect(dist(O, e.positions.get(id)!)).toBeCloseTo(5, 6);
      }
    }
    expect(differs).toBe(true);
  });

  it('an inscribed square keeps its fixed-angle corners (not free) — stays a square', () => {
    const { construction } = build(cmds('square ABCD inscribed in a circle'));
    for (const id of ['A', 'B', 'C', 'D']) expect(freeDofs(construction)).not.toContain(id);
  });
});
