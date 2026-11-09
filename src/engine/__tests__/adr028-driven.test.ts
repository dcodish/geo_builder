/**
 * ADR-028 — a second statement that *places* an already-built point becomes a
 * coincidence constraint that drives a free DOF upstream, re-positioning the
 * figure so the fact holds. This is the core "accumulating constraints adapt the
 * figure" behaviour (Vision §core interaction): the engine must solve, not reject.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, applyStep } from '../step';
import { drivenSolveStats, evaluate } from '../evaluate';
import { applySeed } from '../sample';
import { work } from '../solveBudget';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
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

describe('a constraint drives an on-circle DOF; coupled constraints solve jointly', () => {
  it('|ED| = 7 drives a chord endpoint (single on-circle DOF)', () => {
    const { positions } = build(cmds(['circle centered at O radius 4', 'chord DE in circle O', 'ED = 7']));
    const [O, D, E] = ['O', 'D', 'E'].map((id) => positions.get(id)!);
    expect(dist(D, E)).toBeCloseTo(7, 4); // the chord reached length 7
    expect(dist(O, D)).toBeCloseTo(4, 4); // …with D, E still on the circle
    expect(dist(O, E)).toBeCloseTo(4, 4);
  });

  it('two coupled constraints — chord through the midpoint of OB AND of length 7 — solve together', () => {
    const { positions } = build(
      cmds([
        'circle centered at O radius 4',
        'diameter AB in circle O',
        'chord DE in circle O',
        'C is the intersection of AB and DE',
        'C is the midpoint of OB', // drives one chord endpoint
        'ED = 7', // drives the other — coupled with the line above
      ]),
    );
    const [O, B, C, D, E] = ['O', 'B', 'C', 'D', 'E'].map((id) => positions.get(id)!);
    const M = { x: (O.x + B.x) / 2, y: (O.y + B.y) / 2 };
    expect(dist(D, E)).toBeCloseTo(7, 3); // length constraint
    expect(dist(C, M)).toBeCloseTo(0, 3); // midpoint constraint
    expect(dist(C, footOnLine(C, D, E))).toBeCloseTo(0, 3); // C still on the chord
    expect(dist(O, D)).toBeCloseTo(4, 3); // D, E still on the circle
    expect(dist(O, E)).toBeCloseTo(4, 3);
  });
});

/**
 * #2797 (ADR-816) — the LM rescue rung of `multiStartSolve`. A fixed pentagon of free vertices is 10 unknowns, past
 * where Nelder–Mead converges (ADR-281), so «EA = 4.5» — a closing side a convex pentagon meets — was refused after
 * 9 s. Levenberg–Marquardt on the same cost's signed rows, only when Nelder–Mead accepted nothing, builds it.
 */
describe('the LM rescue rung (#2797, ADR-816)', () => {
  const P7 = ['מחומש ABCDE', 'AB = 5', 'BC = 4', 'זווית ABC = 100', 'CD = 4', 'זווית BCD = 110', 'זווית CDE = 100'];
  const convex = (pts: { x: number; y: number }[]): boolean => {
    const turns = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length]!, c = pts[(i + 2) % pts.length]!;
      return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    });
    return turns.every((t) => t !== 0 && t === turns[0]);
  };

  it('builds the operator’s pentagon green and convex (BE 5.99), the prior barely moving', () => {
    const prior = replay(factsOf(P7));
    const fig = replay(factsOf([...P7, 'EA = 4.5']));
    expect(Object.values(fig.status).every((s) => s === 'ok'), JSON.stringify(fig.status)).toBe(true);
    const p = (id: string) => fig.positions.get(id)!;
    expect(convex(['A', 'B', 'C', 'D', 'E'].map(p)), 'convex (FR-EN-16, #2788 option B)').toBe(true);
    expect(dist(p('B'), p('E'))).toBeCloseTo(5.988, 2);
    expect(dist(p('E'), p('A'))).toBeCloseTo(4.5, 3);
    expect(convex(['A', 'B', 'C', 'D', 'E'].map((id) => prior.positions.get(id)!)), 'the seven-line prior is drawn convex too').toBe(true);
  });

  it('the seven-line prior evaluates at every sampled seed (its free side is really sampled, ADR-052)', () => {
    const prior = replay(factsOf(P7)).construction;
    const sides = new Set<string>();
    for (let s = 0; s <= 7; s++) {
      const e = evaluate(applySeed(prior, s));
      expect(e.ok, `seed ${s}`).toBe(true);
      if (e.ok) sides.add(dist(e.positions.get('D')!, e.positions.get('E')!).toFixed(2));
    }
    expect(sides.size, '|DE| moves across the seeds').toBeGreaterThan(1);
  });

  it('the regular hexagon by sides and angles closes on its convex root, never the straight-corner one (FA = 4)', () => {
    const fig = replay(factsOf(['משושה ABCDEF', 'AB = 4', 'BC = 4', 'CD = 4', 'DE = 4', 'זווית ABC = 120', 'זווית BCD = 120', 'זווית CDE = 120', 'זווית DEF = 120', 'FA = 4']));
    expect(Object.values(fig.status).every((s) => s === 'ok'), JSON.stringify(fig.status)).toBe(true);
    const p = (id: string) => fig.positions.get(id)!;
    expect(convex(['A', 'B', 'C', 'D', 'E', 'F'].map(p))).toBe(true);
    expect(dist(p('B'), p('E'))).toBeCloseTo(8, 1);
  });

  it('a solve Nelder–Mead already accepts makes ZERO LM starts (retry-only: byte-identical where it worked)', () => {
    const before = drivenSolveStats.lmRescue;
    const fig = replay(factsOf(['מרובע ABCD', 'AB = 5', 'BC = 4', 'זווית ABC = 100', 'CD = 4']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(drivenSolveStats.lmRescue - before).toBe(0);
  });

  it('a cold and a warm evaluate of the rescued figure charge the same work (docs/17 §7, ADR-558)', () => {
    const c = replay(factsOf([...P7, 'EA = 4.5'])).construction;
    const w0 = work.done;
    evaluate(c);
    const cold = work.done - w0;
    const w1 = work.done;
    evaluate(c);
    expect(work.done - w1).toBe(cold);
  });
});
