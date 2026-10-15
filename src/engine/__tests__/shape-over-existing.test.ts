/**
 * #223 / ADR-375 — M1: a shape command whose DERIVED corners land on EXISTING points lowers to the
 * shape's defining CONSTRAINTS over those points (the one authority `shapeConstraints`, shared with
 * the ADR-262 inscribe expansion) — never an «already defined» refusal, never a rebuild.
 *
 * The reported member (prod 0yqufnuv 09:41): «FEDG מלבן» over four on-segment riders of a triangle —
 * the riders flex into a genuine inscribed rectangle. Class members locked here: every quad shape
 * with derived slots (rectangle/square/rhombus/parallelogram/trapezoid) over existing points, the
 * driven case (a generic quad flexed into the named shape), the satisfied-check case (a true
 * re-classification moves nothing), and the idempotent re-issue (the same shape twice is a no-op).
 * The e2e sequence lives in scenario `rectangle-named-over-existing-riders`.
 */

import { describe, it, expect } from 'vitest';
import type { Id, Vec } from '../types';
import { build, applyStep } from '../step';
import { expandInscribe, shapeConstraints } from '../inscribe';
import { ringOnOneCircle } from '../structure';
import { notCyclicImpossibility } from '../cyclicFeasibility';
import type { Command, Construction } from '../types';

const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const ang = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};

describe('#223 — a shape named over existing points is a CONSTRAINT statement (M1)', () => {
  it('the prod member: rectangle FEDG over four on-segment riders flexes them into shape', () => {
    const base = build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'segment', a: 'B', b: 'C' },
      { type: 'point-on-segment', id: 'E', a: 'B', b: 'C' },
      { type: 'point-on-segment', id: 'F', a: 'B', b: 'C' },
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'point-on-segment', id: 'D', a: 'A', b: 'C' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'B' },
    ]);
    const r = applyStep(base.construction, { type: 'rectangle', ids: ['F', 'E', 'D', 'G'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = (id: Id) => r.positions.get(id)!;
    // a genuine rectangle…
    expect(ang(p('G'), p('F'), p('E'))).toBeCloseTo(90, 1);
    expect(ang(p('F'), p('E'), p('D'))).toBeCloseTo(90, 1);
    expect(ang(p('E'), p('D'), p('G'))).toBeCloseTo(90, 1);
    // …whose vertices STAYED on their host segments (the riders' own DOFs were driven, M2 least ownership)
    const onHost = (x: Id, a: Id, b: Id) => {
      const vx = p(b).x - p(a).x;
      const vy = p(b).y - p(a).y;
      const t = ((p(x).x - p(a).x) * vx + (p(x).y - p(a).y) * vy) / (vx * vx + vy * vy);
      expect(Math.hypot(p(x).x - (p(a).x + t * vx), p(x).y - (p(a).y + t * vy)), `${x} off its host`).toBeLessThan(1e-6);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    };
    onHost('E', 'B', 'C');
    onHost('F', 'B', 'C');
    onHost('D', 'A', 'C');
    onHost('G', 'A', 'B');
    // the triangle itself did not jump (stability: the statement drove the riders, not the frame)
    for (const id of ['A', 'B', 'C']) expect(d(p(id), base.positions.get(id)!)).toBeLessThan(1e-9);
  });

  it('four UNDECLARED free points DRIVEN into each named shape (a declared cycle instead refuses — ADR-157)', () => {
    const cases: [string, (p: (id: Id) => Vec) => void][] = [
      ['square', (p) => {
        const s = [d(p('P'), p('Q')), d(p('Q'), p('R')), d(p('R'), p('S')), d(p('S'), p('P'))];
        for (const x of s) expect(x).toBeCloseTo(s[0], 1);
        expect(ang(p('P'), p('Q'), p('R'))).toBeCloseTo(90, 1);
      }],
      ['rectangle', (p) => {
        expect(ang(p('P'), p('Q'), p('R'))).toBeCloseTo(90, 1);
        expect(ang(p('Q'), p('R'), p('S'))).toBeCloseTo(90, 1);
        expect(ang(p('R'), p('S'), p('P'))).toBeCloseTo(90, 1);
      }],
      ['rhombus', (p) => {
        const s = [d(p('P'), p('Q')), d(p('Q'), p('R')), d(p('R'), p('S')), d(p('S'), p('P'))];
        for (const x of s) expect(x).toBeCloseTo(s[0], 1);
      }],
      ['parallelogram', (p) => {
        expect(d(p('P'), p('Q'))).toBeCloseTo(d(p('R'), p('S')), 1);
        expect(d(p('Q'), p('R'))).toBeCloseTo(d(p('S'), p('P')), 1);
      }],
      ['trapezoid', (p) => {
        // PQ ∥ RS — cross of the direction vectors ≈ 0
        const u = { x: p('Q').x - p('P').x, y: p('Q').y - p('P').y };
        const v = { x: p('S').x - p('R').x, y: p('S').y - p('R').y };
        expect(Math.abs(u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))).toBeLessThan(0.02);
      }],
    ];
    for (const [shape, check] of cases) {
      const q = build([
        { type: 'free-point', id: 'P', x: 0, y: 0, free: true },
        { type: 'free-point', id: 'Q', x: 6, y: 0.5, free: true },
        { type: 'free-point', id: 'R', x: 5, y: 5, free: true },
        { type: 'free-point', id: 'S', x: 1, y: 4, free: true },
      ]);
      const r = applyStep(q.construction, { type: shape, ids: ['P', 'Q', 'R', 'S'] } as Parameters<typeof applyStep>[1]);
      expect(r.ok, `${shape} over four existing free points`).toBe(true);
      if (r.ok) check((id: Id) => r.positions.get(id)!);
    }
    // a cycle declared only as a generic «מרובע» takes the specific noun too (ADR-656, #1914 ruling 2026-10-08:
    // *"Yes, it refines"* — superseding ADR-375's refusal here): it lowers, and the ring becomes the square
    const declared = build([{ type: 'quadrilateral', ids: ['P', 'Q', 'R', 'S'] }]);
    const rd = applyStep(declared.construction, { type: 'square', ids: ['P', 'Q', 'R', 'S'] });
    expect(rd.ok).toBe(true);
    if (rd.ok) expect((rd.construction.objects.find((o) => o.kind === 'polygon') as { declaredAs?: string }).declaredAs).toBe('square');
  });

  it('an exact re-issue of the same shape stays the idempotent no-op (FR-EN-9)', () => {
    for (const shape of ['square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid']) {
      const one = build([{ type: shape, ids: ['A', 'B', 'C', 'D'] } as Parameters<typeof build>[0][number]]);
      const r = applyStep(one.construction, { type: shape, ids: ['A', 'B', 'C', 'D'] } as Parameters<typeof applyStep>[1]);
      expect(r.ok, `${shape} re-issue`).toBe(true);
      if (!r.ok) continue;
      expect(r.construction.constraints.length, `${shape} re-issue adds no constraints`).toBe(one.construction.constraints.length);
      for (const id of ['A', 'B', 'C', 'D']) expect(r.positions.get(id)).toEqual(one.positions.get(id));
    }
  });

  it('partial existence (3 of 4): the missing vertex is created and the constraints place it', () => {
    // P,Q,R exist as a triangle's free vertices; «PQRS מלבן» creates S and drives the figure
    const base = build([{ type: 'triangle', ids: ['P', 'Q', 'R'] }]);
    const r = applyStep(base.construction, { type: 'rectangle', ids: ['P', 'Q', 'R', 'S'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = (id: Id) => r.positions.get(id)!;
    expect(p('S')).toBeTruthy();
    expect(ang(p('P'), p('Q'), p('R'))).toBeCloseTo(90, 1);
    expect(ang(p('Q'), p('R'), p('S'))).toBeCloseTo(90, 1);
    expect(ang(p('R'), p('S'), p('P'))).toBeCloseTo(90, 1);
  });

  it('normal composition (≤2 existing, rotation absorbs) is byte-unchanged — no M1 detour', () => {
    // the 11:38 prod shape: rectangle ABCD over existing on-circle B,C — the cyclic rotation puts
    // B,C on the free base slots and the derived corners stay closed-form (no constraints added)
    const base = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    ]);
    const r = applyStep(base.construction, { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.construction.constraints.length).toBe(base.construction.constraints.length);
    expect(r.construction.objects.some((o) => o.kind === 'perp-offset' || o.kind === 'parallelogram-vertex')).toBe(true);
  });
});

/**
 * #1913 ([ADR-628](../../../docs/06-decisions.md#adr-628)) — A PARALLELOGRAM-FAMILY NOUN OVER A RING ALREADY ON ONE
 * CIRCLE LOWERS TO ITS CYCLIC MEMBER. `shapeConstraints` is the ONE authority (ADR-375), so the gate is its third
 * argument, and the apply boundary answers it from `ringOnOneCircle` — a STRUCTURAL reading (riders, a lowered
 * membership, a stated concyclicity), never a reading of where the seed drew the points.
 */
describe('#1913 — the cyclic-member lowering (ADR-628)', () => {
  const ids: Id[] = ['A', 'B', 'C', 'D'];
  const kinds = (cs: Command[]) => cs.map((c) => c.type);
  const rightAngles = (cs: Command[]) => cs.filter((c) => c.type === 'set-perpendicular').map((c) => (c as { b: Id }).b);

  it('the authority: on one circle the parallelogram is the rectangle and the rhombus/square the square; off it, byte-identical', () => {
    // on a circle
    expect(kinds(shapeConstraints('parallelogram', ids, true))).toEqual(['set-perpendicular', 'set-perpendicular', 'set-perpendicular']);
    expect(shapeConstraints('parallelogram', ids, true), 'the rectangle’s own lowering, verbatim').toEqual(shapeConstraints('rectangle', ids));
    for (const sq of ['rhombus', 'square'] as const) {
      const cs = shapeConstraints(sq, ids, true);
      expect(kinds(cs)).toEqual(['set-perpendicular', 'set-perpendicular', 'set-perpendicular', 'set-equal']);
      expect(rightAngles(cs), 'three CONSECUTIVE right angles').toEqual(['A', 'B', 'C']);
      expect(cs[3], 'one adjacent pair: |AB| = |BC|').toEqual({ type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' });
    }
    expect(shapeConstraints('rectangle', ids, true)).toEqual(shapeConstraints('rectangle', ids));
    expect(shapeConstraints('trapezoid', ids, true)).toEqual(shapeConstraints('trapezoid', ids));
    // off a circle: the family’s own relations, as before
    expect(kinds(shapeConstraints('parallelogram', ids))).toEqual(['set-equal', 'set-equal']);
    expect(kinds(shapeConstraints('rhombus', ids))).toEqual(['set-equal', 'set-equal', 'set-equal']);
    expect(kinds(shapeConstraints('square', ids))).toEqual(['set-equal', 'set-equal', 'set-equal', 'set-perpendicular']);
    expect(shapeConstraints('parallelogram', ids, false)).toEqual(shapeConstraints('parallelogram', ids));
  });

  it('expandInscribe never takes the cyclic member (its riders sit on a polygon, not a circle)', () => {
    const cmds = expandInscribe({ shape: 'parallelogram', ids: ['P', 'Q', 'R', 'S'], container: ['A', 'B', 'C'], variant: 0 } as Parameters<typeof expandInscribe>[0]);
    expect(cmds.filter((c) => c.type === 'set-equal')).toHaveLength(2);
    expect(cmds.some((c) => c.type === 'set-perpendicular')).toBe(false);
  });

  const circleFour = (): Construction =>
    build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'D', circle: 'circle-O' },
    ] as Command[]).construction;

  it('ringOnOneCircle reads riders, a stated concyclicity, and nothing from coordinates', () => {
    const c = circleFour();
    expect(ringOnOneCircle(c, ['A', 'B', 'C', 'D'])).toBe(true);
    expect(ringOnOneCircle(c, ['D', 'C', 'B', 'A']), 'any reading of the ring').toBe(true);
    // one vertex off the circle (a free point that happens to be drawn wherever) — not on one circle
    const withE = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'free-point', id: 'E', x: 5, y: 0 }, // ON the circle by coordinates, not by statement
    ] as Command[]).construction;
    expect(ringOnOneCircle(withE, ['A', 'B', 'C', 'E']), 'coordinates never decide').toBe(false);
    // four free points with a stated concyclicity
    const stated: Construction = {
      ...build([
        { type: 'free-point', id: 'A', x: 0, y: 0 },
        { type: 'free-point', id: 'B', x: 4, y: 0 },
        { type: 'free-point', id: 'C', x: 4, y: 3 },
        { type: 'free-point', id: 'D', x: 0, y: 3 },
      ] as Command[]).construction,
    };
    const withCon = { ...stated, constraints: [...stated.constraints, { type: 'concyclic', points: ['A', 'B', 'C', 'D'] } as Construction['constraints'][number]] };
    expect(ringOnOneCircle(withCon, ['A', 'B', 'C', 'D'])).toBe(true);
    expect(ringOnOneCircle(stated, ['A', 'B', 'C', 'D']), 'no statement, no circle — a rectangle by coordinates is not one').toBe(false);
    expect(ringOnOneCircle(c, ['A', 'B']), 'fewer than three points is never a ring on a circle').toBe(false);
  });

  it('the apply boundary: «parallelogram ABCD» over four riders of one circle is DRIVEN into a rectangle (no crossed root, no flat root)', () => {
    const r = applyStep(circleFour(), { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] } as Command);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = (id: Id) => r.positions.get(id)!;
    expect(ang(p('D'), p('A'), p('B'))).toBeCloseTo(90, 4);
    expect(ang(p('A'), p('B'), p('C'))).toBeCloseTo(90, 4);
    expect(ang(p('B'), p('C'), p('D'))).toBeCloseTo(90, 4);
    expect(d(p('A'), p('B')), 'the sides are not collapsed').toBeGreaterThan(0.5);
    expect(d(p('B'), p('C'))).toBeGreaterThan(0.5);
    for (const id of ['A', 'B', 'C', 'D']) expect(d(p(id), p('O')), `${id} stayed on the circle`).toBeCloseTo(5, 6);
    const rh = applyStep(circleFour(), { type: 'rhombus', ids: ['A', 'B', 'C', 'D'] } as Command);
    expect(rh.ok, 'a rhombus on a circle is a square, not an over-constrained refusal').toBe(true);
    if (!rh.ok) return;
    const q = (id: Id) => rh.positions.get(id)!;
    expect(d(q('A'), q('B'))).toBeCloseTo(d(q('B'), q('C')), 6);
    expect(ang(q('D'), q('A'), q('B'))).toBeCloseTo(90, 4);
  });

  it('the not-cyclic prover (ADR-607) and the lowering read ONE predicate', () => {
    // a right trapezoid declared over the four riders: the prover fires exactly when ringOnOneCircle holds
    const c = circleFour();
    const declared = applyStep(c, { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'], kind: 'right-trapezoid' } as Command);
    expect(ringOnOneCircle(c, ['A', 'B', 'C', 'D'])).toBe(true);
    expect(declared.ok, 'a right trapezoid on four concyclic points is refused by the prover').toBe(false);
    const probed = { ...c, requirements: [{ kind: 'declared-shape', shape: 'right-trapezoid', ring: ['A', 'B', 'C', 'D'] }] } as unknown as Construction;
    expect(notCyclicImpossibility(probed)?.forced).toBe('rectangle');
  });
});
