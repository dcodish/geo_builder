/**
 * ADR-140 — converting a constraint-DRIVEN free point to on-circle must PRESERVE its `solve`.
 *
 * A named-shape vertex can already DRIVE an equality (a kite's D drives `AB=AD`). Declaring it "on circle O"
 * used to build a fresh on-circle object that DROPPED the `solve`, leaving the equality carrier-less, so the
 * conversion's `evaluate` failed and the whole `point-on-circle` fact rolled back — the driven point could
 * never reach the circle (it silently reverted to a free point off the circle). The fix carries the `solve`
 * over, so the vertex still drives its equality via its on-circle θ and genuinely lands on the circle.
 */
import { describe, it, expect } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Id, Vec } from '@/engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
function run(cmds: AnyCommand[]) {
  const facts: Fact[] = cmds.map((cmd, i) => ({ id: `f${i}`, utterance: 'm', group: `g${i}`, cmd, enabled: true }));
  return replay(facts);
}

describe('ADR-140 — a driven free vertex declared on-circle converts and stays on the circle', () => {
  it('D drives |AB|=|AD| and then lands ON circle O (was: conversion rolled back, D off-circle)', () => {
    const fig = run([
      { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] } as unknown as AnyCommand,
      { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'D' } as unknown as AnyCommand, // D is the carrier of AB=AD
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as unknown as AnyCommand,
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' } as unknown as AnyCommand, // free vertex — fixes the radius witness
      { type: 'point-on-circle', id: 'D', circle: 'circle-O' } as unknown as AnyCommand, // DRIVEN vertex — the case under test
    ]);
    expect(fig.lastError).toBeNull();

    const P = (id: Id) => fig.positions.get(id)!;
    // D converted to an on-circle object (representation), not silently reverted to free-point.
    expect(fig.construction.objects.find((o) => o.id === 'D')!.kind).toBe('on-circle');
    // D genuinely lies on the circle (same radius as the independent witness B) — not adrift.
    expect(Math.abs(dist(P('O'), P('D')) - dist(P('O'), P('B')))).toBeLessThan(1e-4);
    // ...and still drives its equality (|AD| = |AB|), now via its on-circle θ.
    expect(Math.abs(dist(P('A'), P('D')) - dist(P('A'), P('B')))).toBeLessThan(1e-3);
  });

  it('a free vertex with NO solve still converts cleanly (ADR-080 unchanged)', () => {
    const fig = run([
      { type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] } as unknown as AnyCommand,
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as unknown as AnyCommand,
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' } as unknown as AnyCommand,
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' } as unknown as AnyCommand,
    ]);
    expect(fig.lastError).toBeNull();
    expect(fig.construction.objects.find((o) => o.id === 'C')!.kind).toBe('on-circle');
    const P = (id: Id) => fig.positions.get(id)!;
    expect(Math.abs(dist(P('O'), P('C')) - dist(P('O'), P('B')))).toBeLessThan(1e-4); // C on the same circle as B
  });
});
