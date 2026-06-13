/**
 * ADR-028 — a second statement that *places* an already-built point becomes a
 * coincidence constraint that drives a free DOF upstream, re-positioning the
 * figure so the fact holds. This is the core "accumulating constraints adapt the
 * figure" behaviour (Vision §core interaction): the engine must solve, not reject.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, applyStep } from '../step';
import { evaluate } from '../evaluate';
import { dist, footOnLine } from '../geometry';
import type { Command } from '../types';

const cmds = (utterances: string[]): Command[] =>
  utterances.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    return r.commands as Command[];
  });

describe('constraint drives an upstream free DOF (the chord moves so the intersection lands)', () => {
  // O,A,B fixed (circle + diameter); D,E free on the circle; C = AB∩DE.
  // "C is the midpoint of OB" must MOVE the chord so C lands on the midpoint —
  // not be rejected as a redefinition.
  const PROBLEM = [
    'circle centered at O radius 4',
    'diameter AB in circle O',
    'chord DE in circle O',
    'C = intersection of AB and DE',
    'C is the midpoint of OB',
  ];

  it('repositions the chord so C is the midpoint of OB AND still on AB and DE', () => {
    const { positions } = build(cmds(PROBLEM));
    const [O, A, B, C, D, E] = ['O', 'A', 'B', 'C', 'D', 'E'].map((id) => positions.get(id)!);
    const M = { x: (O.x + B.x) / 2, y: (O.y + B.y) / 2 };
    expect(dist(C, M)).toBeCloseTo(0, 4); // C reached the midpoint of OB
    expect(dist(C, footOnLine(C, A, B))).toBeCloseTo(0, 4); // C is still on AB
    expect(dist(C, footOnLine(C, D, E))).toBeCloseTo(0, 4); // C is still on the chord DE
  });

  it('the fixed structure (circle, diameter) is untouched — only the free chord moves', () => {
    const before = build(cmds(PROBLEM.slice(0, 4))).positions; // up to C = AB∩DE
    const after = build(cmds(PROBLEM)).positions; // + the midpoint constraint
    for (const id of ['O', 'A', 'B']) {
      expect(dist(before.get(id)!, after.get(id)!)).toBeCloseTo(0, 6); // diameter/centre stay put
    }
    expect(dist(after.get('O')!, after.get('D')!)).toBeCloseTo(4, 4); // D, E stay ON the circle
    expect(dist(after.get('O')!, after.get('E')!)).toBeCloseTo(4, 4);
  });

  it('the constraint is satisfiable and the figure is valid', () => {
    const { construction } = build(cmds(PROBLEM));
    expect(evaluate(construction).ok).toBe(true);
  });

  it('with no free DOF upstream it stays an honest over-constraint (not a silent wrong figure)', () => {
    // A, B, C all fixed (a square's corners): "C is the midpoint of AB" has nothing free to move.
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: 4 }]);
    const r = applyStep(sq.construction, { type: 'midpoint', id: 'C', a: 'A', b: 'B' });
    expect(r.ok).toBe(false); // correctly rejected — C is a fixed corner, can't also be the midpoint of AB
  });
});
