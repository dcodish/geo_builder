/**
 * #458 — the DIMENSIONS phrasing: «ריבוע במידות 4*4», «מלבן 4 על 6», «ריבוע שצלעו 4».
 *
 * The capability half of #437, split out as that issue's own diagnosis proposed. #437 fixed the bug
 * (a repeated stated magnitude accounted twice, so the given vanished with a green ✓); what it
 * uncovered was that `מידות` appeared NOWHERE in the parser, in either locale. Before #437 the
 * *dishonest* phrasing committed while the honest one refused; after it, all of them were honest and
 * none of them BUILT. «ריבוע במידות 4*4» is a live prod utterance (log-triage 2026-08-08, session
 * `vgrm5pjb`) — real students type this.
 *
 * Read in the shape MACRO, not per rule: the phrasing modifies the noun, so every named shape gains it
 * at once (the #424 trap — a qualifier readable in one position and not another — avoided by
 * construction). Asserted on the built figure's real distances, never on "a command was emitted".
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenarios-harness';
import { parse } from '@/parser';
import { replay } from '@/replay/core';

const figOf = (steps: string[]) => replay(factsOf(steps), 0);
const at = (fig: ReturnType<typeof replay>, id: string) => {
  const p = fig.positions.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
const side = (fig: ReturnType<typeof replay>, a: string, b: string) => {
  const p = at(fig, a);
  const q = at(fig, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
const cmds = (u: string) => {
  const r = parse(u, { points: [] });
  return r.ok ? r.commands : null;
};

describe('#458 — the dimensions phrase BUILDS', () => {
  it('«מלבן במידות 4*6» — the base edge is 4 and the adjacent edge 6', () => {
    const fig = figOf(['מלבן במידות 4*6']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(6, 6);
  });

  it('«מלבן 4 על 6» — the bare separator form lowers identically', () => {
    expect(cmds('מלבן 4 על 6')).toEqual(cmds('מלבן במידות 4*6'));
  });

  it('«ריבוע במידות 4*4» — the reported prod utterance, a consistent redundancy', () => {
    const fig = figOf(['ריבוע במידות 4*4']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(4, 6);
  });

  it('English mirrors', () => {
    const fig = figOf(['a rectangle 4 by 6']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(6, 6);
  });

  it('NAMED labels carry the dimensions too — the phrase modifies the shape, not the lettering', () => {
    const fig = figOf(['מלבן ABCD במידות 4*6']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(side(fig, 'B', 'C')).toBeCloseTo(6, 6);
  });
});

describe('#458 — honesty', () => {
  it('«ריבוע במידות 4*6» is a CONTRADICTION and refuses — never one number silently believed', () => {
    // a square forces |AB| = |BC|; 4 and 6 cannot both hold. Both givens DO lower (the parse keeps
    // them), so the engine meets a genuine over-constraint and refuses — which is the honest outcome.
    // The one thing that must never happen is a drawn square with one number quietly dropped.
    expect(cmds('ריבוע במידות 4*6')).toHaveLength(3); // the square + BOTH stated magnitudes
    const fig = figOf(['ריבוע במידות 4*6']);
    expect(fig.positions.has('A'), 'an impossible figure must not be drawn').toBe(false);
  });

  it('a shape with no dimensions phrase is untouched', () => {
    expect(cmds('מלבן ABCD')).toEqual([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }]);
  });

  it('the SINGLE-side form keeps its existing owner — no second, laxer reader', () => {
    // `normalizeShapeSide` owns «שצלעו», scoped to shapes whose sides are all equal by definition;
    // a rectangle's «שצלעו» is deliberately out (WHICH side would be an unstated pick, ADR-052).
    // The dimensions reader must not have quietly become a second path around that scoping.
    const fig = figOf(['ריבוע ABCD שצלעו הוא 4']);
    expect(side(fig, 'A', 'B')).toBeCloseTo(4, 6);
    expect(cmds('מלבן ABCD שצלעו הוא 4')).toBeNull(); // still escalates, as ADR-052 requires
  });

  it('a TRIANGLE is not given an invented dimensions convention', () => {
    // «במידות a×b» has a settled meaning on a quad and none on a triangle — which edges would they be?
    expect(cmds('משולש במידות 4*6')).toBeNull();
  });

  it('«על» as a MEMBERSHIP word is not read as a dimension separator', () => {
    // the separator form needs numbers on BOTH sides; «G על AD» must stay the membership statement
    const fig = figOf(['ריבוע ABCD', 'G על AD']);
    expect(fig.positions.has('G')).toBe(true);
  });
});
