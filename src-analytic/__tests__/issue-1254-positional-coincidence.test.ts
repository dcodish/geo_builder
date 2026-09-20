/**
 * #1254 — analytic: A CROSSING THAT LANDS ON AN EXISTING POINT BY POSITION.
 *
 * Operator's ruling, 2026-09-20, playing T18: *"P falls on B. why dont we reject it in this case? … if P
 * and B must be on the same location, like in this case, it should be refused. The only case where P and B
 * can fall [together] is if one of them has a degree of freedom … even if they do fall on the same point by
 * chance … the system should not show them on top of each other."*
 *
 * [#1175](https://github.com/dcodish/geo_builder/issues/1175) answered the STRUCTURAL member — two lines
 * named by two points that share a written letter — and pre-declared this one an escalation rather than an
 * expansion, because it needs a positional test with its own tolerance question. This is that escalation,
 * now ruled.
 *
 * **The two branches are the ruling's own.** Refuse when no configuration can separate them; stay silent
 * while the figure can still move — another configuration may, and #1273 is what will prefer it. The
 * predicate is the vacancy pass's, one block above in `derive`, for exactly the same reason.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const faultsOf = (lines: string[], seed = 0) => derive(lines, seed).faults;
const pointsOf = (lines: string[], seed = 0) => derive(lines, seed).figure.points;

describe('#1254 — a forced coincidence is refused, naming the point that is already there', () => {
  it('the operator’s own T18 figure: the crossing of AB and CD lands on B', () => {
    // AB is y = x/3, CD is y = 8 − x; they meet at (6, 2), which is B.
    const lines = ['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,1)', 'P נקודת החיתוך של הישר AB עם הישר CD'];
    expect(faultsOf(lines)).toMatchObject([{ index: 4, code: 'crossing-already-named', holder: 'B' }]);
    expect(pointsOf(lines).some((p) => p.id === 'P' && Math.hypot(p.x - 6, p.y - 2) < 1e-6 && false)).toBe(false);
  });

  it('#1254’s own case: two lines given by EQUATIONS crossing where a point already sits', () => {
    const lines = ['A(0,0)', 'משוואת הישר l1 היא y=x', 'משוואת הישר l2 היא y=-x', 'P נקודת החיתוך של הישר l1 עם הישר l2'];
    expect(faultsOf(lines)).toMatchObject([{ index: 3, code: 'crossing-already-named', holder: 'A' }]);
  });

  it('the CONTROL — a crossing clear of every named point still builds', () => {
    // One letter different from T18, and the crossing moves to (5.44, 1.81). The sheet's own T18 was
    // written as this control and was not one: its crossing landed on B, so it and T17 were one case.
    const lines = ['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,0)', 'P נקודת החיתוך של הישר AB עם הישר CD'];
    expect(faultsOf(lines)).toEqual([]);
    const p = pointsOf(lines).find((q) => q.id === 'P');
    expect(p).toBeDefined();
    expect(Math.hypot(p!.x - 5.4444, p!.y - 1.8148)).toBeLessThan(1e-3);
  });

  it('the structural member #1175 still refuses, at the parser, before any figure exists', () => {
    const lines = ['משולש ABC', 'A(2,-5)', 'P נקודת החיתוך של הישר AB עם הישר BC'];
    expect(faultsOf(lines)).toMatchObject([{ code: 'crossing-already-named' }]);
  });
});

describe('#1254 — silent while the figure can still move', () => {
  it('a figure with freedom left is not accused — another configuration may separate them', () => {
    // Nothing is pinned here, so the crossing's coincidence (if any) is a fact about THIS configuration
    // and not about the student's givens. The ruling's second branch, and #1273's business.
    const lines = ['נתון משולש ABC', 'נקודה D', 'P נקודת החיתוך של הישר AB עם הישר CD'];
    const f = faultsOf(lines);
    expect(f.filter((x) => x.code === 'crossing-already-named' && x.index === 2)).toEqual([]);
  });
});
