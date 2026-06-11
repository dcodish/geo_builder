/**
 * Phase-5d: a constraint *drives* a free DOF (ADR-012/ADR-014).
 * An angle that references a point-on-segment — as its vertex OR as a ray
 * endpoint — solves that point's parameter so the angle holds, instead of
 * merely checking it. Covers the reported case "angle BEA = 90" with E on AC
 * (→ E becomes the foot of the perpendicular), the ray-endpoint case
 * "angle GBA = 37" with G on AD, and the degenerate case where the angle is
 * insensitive to the free parameter (no solution → clean rejection).
 */

import { describe, it, expect } from 'vitest';
import type { Command, Vec } from '../types';
import { build, applyStep } from '../step';
import { evaluate } from '../evaluate';
import { sub, dist, angleDeg, cross } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;

describe('angle drives a point-on-segment (ADR-012)', () => {
  // Reproduces the reported figure: parallelogram ABCD, E on diagonal AC, then
  // angle BEA = 90 — which should *place* E at the foot of the perpendicular.
  const utterances = ['parallelogram ABCD', 'segment AC', 'point E on AC', 'angle BEA = 90'];

  it('solves E so that BE ⟂ AC (the angle is achieved, not rejected)', () => {
    const commands = utterances.flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`failed to parse "${u}"`);
      return r.commands;
    });
    const { positions } = build(commands); // build() throws if the step is rejected

    const A = positions.get('A')!, C = positions.get('C')!, B = positions.get('B')!, E = positions.get('E')!;
    // E lies on AC
    expect(cross(A, C, E)).toBeCloseTo(0, 6);
    expect(dist(A, E) + dist(E, C)).toBeCloseTo(dist(A, C), 6);
    // the angle BEA is now 90°, i.e. BE ⟂ AC
    expect(angleDeg(E, B, A)).toBeCloseTo(90, 4);
    expect(dot(sub(E, B), sub(C, A))).toBeCloseTo(0, 4);
  });

  it('keeps the prior figure and explains when the angle cannot be achieved on the segment', () => {
    // A tiny triangle where no point on PQ sees ∠(R,·,P) = 5° → unsatisfiable.
    const base: Command[] = [
      { type: 'free-point', id: 'P', x: 0, y: 0 },
      { type: 'free-point', id: 'Q', x: 10, y: 0 },
      { type: 'free-point', id: 'R', x: 5, y: 5 },
    ];
    const b = build(base);
    const withE = applyStep(b.construction, { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' });
    const r = applyStep(withE.construction, { type: 'set-angle', vertex: 'E', ray1: 'R', ray2: 'P', value: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/cannot place/i);
      expect(r.construction).toBe(withE.construction); // prior kept
    }
  });

  it('solves a point referenced as a ray endpoint, not only as the vertex', () => {
    // Square ABCD (A=(0,0), B=(5,0), D=(0,5)), G on AD. The angle's vertex B is
    // determined; the free DOF is in ray-point G. ∠GBA = 37° ⇒ t = tan 37°.
    const { positions } = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' },
      { type: 'set-angle', vertex: 'B', ray1: 'G', ray2: 'A', value: 37 },
    ]);
    const A = positions.get('A')!, D = positions.get('D')!, B = positions.get('B')!, G = positions.get('G')!;
    expect(angleDeg(B, G, A)).toBeCloseTo(37, 4);
    // G still lies on AD
    expect(cross(A, D, G)).toBeCloseTo(0, 6);
    expect(dist(A, G) + dist(G, D)).toBeCloseTo(dist(A, D), 6);
    expect(dist(A, G) / dist(A, D)).toBeCloseTo(Math.tan((37 * Math.PI) / 180), 4);
  });

  it('rejects cleanly when the angle is insensitive to the free parameter', () => {
    // G on side AD: ray A→G lies along A→D for every t, so ∠GAB is the square's
    // corner (90°) no matter where G slides — 37° has no solution. The engine
    // tries to drive G, finds no t, and keeps the prior figure.
    const base = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' },
    ]);
    const r = applyStep(base.construction, { type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/cannot place/i);
      expect(r.construction).toBe(base.construction);
    }
  });

  it('still checks (and can reject) an angle whose references are all determined', () => {
    // Every corner of the square is determined → the angle is a check, 90 ≠ 37.
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(sq.construction, { type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'B', value: 37 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });

  it('deleting the angle reverts E to a plain point-on-segment (replay)', () => {
    const withSolve = build([
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'point-on-segment', id: 'E', a: 'A', b: 'C' },
      { type: 'set-angle', vertex: 'E', ray1: 'B', ray2: 'A', value: 90 },
    ]);
    expect(withSolve.construction.objects.find((o) => o.id === 'E')!.kind).toBe('on-segment-solved');

    // Without the angle command, E is a plain on-segment point again (default midpoint).
    const withoutAngle = build([
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'point-on-segment', id: 'E', a: 'A', b: 'C' },
    ]);
    const E = withoutAngle.construction.objects.find((o) => o.id === 'E')!;
    expect(E.kind).toBe('on-segment');
    expect(evaluate(withoutAngle.construction).ok).toBe(true);
  });
});
