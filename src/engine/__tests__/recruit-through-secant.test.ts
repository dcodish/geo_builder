import { describe, it, expect } from 'vitest';
import { build, evaluate } from '@/engine';
import type { Command, Vec } from '@/engine';

/**
 * ADR-095 — a constraint on a SECANT crossing (a line∩circle point) must be able to drive the free DOFs
 * UPSTREAM of it (the external apex). The ancestor walker had no case for `line-circle`/`circle-circle`
 * points (pointParents → default []), so it dead-ended and `recruitFreeDofs` found NOTHING → the constraint
 * falsely reported "over-constrained" even though the value was reachable. Now a line∩circle is traversed
 * through its line to the apex. The figure: circle O, external B, tangent BC, secant B→A→E (A,E on the
 * circle), chord CD ∥ EA, K = ED∩AC, |AK|=3, |ED|=7, then ∠CAE = 45° — which the scan showed is reachable
 * (∠CAE ranges ~2–143° over the free DOFs) but the solver couldn't reach because B was never recruited.
 */
const figure: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
  { type: 'free-point', id: 'B', x: 12, y: 0, free: true },
  { type: 'midpoint', id: '~tanmid-OB', a: 'O', b: 'B' },
  { type: 'circle-through', id: 'tanaux-OB', center: '~tanmid-OB', through: 'O', hidden: true },
  { type: 'circle-circle-intersection', id: 'C', circle1: 'circle-O', circle2: 'tanaux-OB', branch: 1 },
  { type: 'segment', a: 'B', b: 'C' },
  { type: 'point-on-circle', id: 'E', circle: 'circle-O' },
  { type: 'line-through', id: 'sec-BE', a: 'B', b: 'E' },
  { type: 'line-circle-intersection', id: 'A', line: 'sec-BE', circle: 'circle-O', avoid: 'E' },
  { type: 'segment', a: 'B', b: 'E' },
  { type: 'point-on-circle', id: 'D', circle: 'circle-O' },
  { type: 'segment', a: 'C', b: 'D' },
  { type: 'segment', a: 'E', b: 'A' },
  { type: 'set-parallel', a: 'C', b: 'D', c: 'E', d: 'A' },
  { type: 'segment', a: 'E', b: 'D' },
  { type: 'segment', a: 'A', b: 'C' },
  { type: 'line-line-intersection', id: 'K', a: 'E', b: 'D', c: 'A', d: 'C' },
  { type: 'set-distance', a: 'A', b: 'K', value: 3 },
  { type: 'set-distance', a: 'E', b: 'D', value: 7 },
  { type: 'set-angle', vertex: 'A', ray1: 'C', ray2: 'E', value: 45 },
] as Command[];

const ang = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};
const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);

describe('recruit through a secant crossing (ADR-095)', () => {
  it('∠CAE = 45° on a secant point builds (drives the upstream apex B), with the other givens intact', () => {
    const ev = evaluate(build(figure).construction);
    expect(ev.ok, 'figure builds (no false over-constraint)').toBe(true);
    if (!ev.ok) return;
    const P = (id: string) => ev.positions.get(id)!;
    expect(ang(P('C'), P('A'), P('E')), '∠CAE = 45°').toBeCloseTo(45, 0);
    expect(d(P('A'), P('K')), '|AK| = 3').toBeCloseTo(3, 1);
    expect(d(P('E'), P('D')), '|ED| = 7').toBeCloseTo(7, 1);
    // CD ∥ EA still holds
    const cross = (P('D').x - P('C').x) * (P('A').y - P('E').y) - (P('D').y - P('C').y) * (P('A').x - P('E').x);
    expect(Math.abs(cross), 'CD ∥ EA').toBeLessThan(1e-2);
  });
});
