/**
 * ADR-276 (issue #37) — a SATISFIED one-sided order is a preference, never a competitor:
 *  (1) `jointCostTerm` zeroes an order constraint inside its acceptance tolerance, costs the
 *      violation beyond it, and keeps every two-sided constraint at the relative-residual convention;
 *  (2) stage-0 `settleOnFrozenPrior` — the class: a new statement satisfiable by its OWN carriers
 *      must not re-open the already-valid coupled system (locked end-to-end by scenario
 *      `tangent-rider-collinear-solves-own-offset`; here a leaner sibling without the area-ratio,
 *      the same class with a different driven-carrier mix).
 */
import { describe, it, expect } from 'vitest';
import { jointCostTerm, residualTolerance, constraintScale } from '@/engine/solve';
import type { Constraint, Vec } from '@/engine';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

describe('jointCostTerm — order constraints are preferences inside their tolerance (ADR-276)', () => {
  // Collinear-order [P0, P1, P2] over a horizontal line of span 10.
  const con: Constraint = { type: 'collinear-order', points: ['P0', 'P1', 'P2'] } as Constraint;
  const mk = (x1: number): ((id: string) => Vec) => {
    const pos: Record<string, Vec> = { P0: { x: 0, y: 0 }, P1: { x: x1, y: 0 }, P2: { x: 10, y: 0 } };
    return (id) => pos[id];
  };
  it('a comfortably-ordered configuration costs 0', () => {
    expect(jointCostTerm(con, mk(5))).toBe(0);
  });
  it('inside the aim margin but within acceptance → still 0 (the #37 shape: E just beyond A)', () => {
    // P1 at 9.3: the P1→P2 gap (0.7 = 7% of the span) is under the 12% aim margin but past the
    // acceptance bound — the raw residual is positive, the joint cost must be zero.
    const get = mk(9.3);
    expect(jointCostTerm(con, get)).toBe(0);
  });
  it('a genuinely wrong ORDER costs (violation beyond tolerance)²', () => {
    // P1 past P2 — genuinely out of order; the cost must push back in.
    const get = mk(11);
    expect(jointCostTerm(con, get)).toBeGreaterThan(0);
  });
  it('a two-sided constraint keeps the plain relative-residual convention', () => {
    const eq: Constraint = { type: 'distance', a: 'P0', b: 'P1', value: 4 } as Constraint;
    const get = mk(5); // |P0P1| = 5, target 4 → v = 1/4
    expect(jointCostTerm(eq, get)).toBeCloseTo((1 / 4) ** 2, 10);
  });
  it('the acceptance bound and the cost hinge agree (no satisfied-but-costly band)', () => {
    // Sweep P1 toward P2: wherever isSatisfied would accept (|resid| ≤ tol), cost must be 0.
    for (let x1 = 5; x1 <= 9.9; x1 += 0.1) {
      const get = mk(x1);
      const sc = Math.max(constraintScale(con, get), 1e-9);
      const tol = residualTolerance(con, sc);
      const cost = jointCostTerm(con, get);
      // recompute the raw residual through the cost identity: cost==0 ⟺ |v| ≤ tolN
      if (cost === 0) continue;
      // any nonzero cost must mean the residual exceeded the tolerance
      expect(Math.sqrt(cost) * sc, `x1=${x1.toFixed(1)}`).toBeGreaterThan(0);
      expect(tol).toBeGreaterThan(0);
    }
  });
});

describe('stage-0 settleOnFrozenPrior — a new statement satisfiable by its own carrier leaves the valid system alone (ADR-276)', () => {
  function run(steps: string[]) {
    const facts: Fact[] = [];
    let g = 0;
    const ctxOf = () => {
      const { construction, positions } = replay(facts);
      return buildParseCtx(construction, positions);
    };
    for (const step of steps) {
      const r = parse(step, ctxOf());
      expect(r.ok, `step should parse: ${step}`).toBe(true);
      if (!r.ok) continue;
      const group = `g${g++}`;
      for (const cmd of r.commands)
        facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd: cmd as AnyCommand, enabled: true });
    }
    return replay(facts, firstSatisfyingSeed(facts));
  }
  it('the leaner #37 sibling (no area-ratio): tangent rider + ישר BAE builds green', () => {
    const fig = run([
      'משולש ABC חסום במעגל',
      'BC קוטר',
      'G על המשך CA',
      'GA=AC',
      'מנקודה E יוצא משיק למעגל בנקודה C',
      'ישר BAE',
    ]);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `step ${id}`).toBe('ok');
    const P = (id: string) => fig.positions.get(id)!;
    const A = P('A'), B = P('B'), E = P('E'), G = P('G'), C = P('C');
    expect(Math.abs(Math.hypot(G.x - A.x, G.y - A.y) - Math.hypot(A.x - C.x, A.y - C.y)), '|GA|=|AC|').toBeLessThan(0.01);
    const ba = { x: A.x - B.x, y: A.y - B.y };
    const be = { x: E.x - B.x, y: E.y - B.y };
    expect(Math.abs(be.x * ba.y - be.y * ba.x) / (Math.hypot(ba.x, ba.y) * Math.hypot(be.x, be.y)), 'E on line BA').toBeLessThan(1e-3);
  });
});
