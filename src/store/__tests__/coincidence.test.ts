/**
 * A FORCED coincidence is allowed (ADR-123) — and the figure-VALIDITY checks must agree, or the
 * auto-resolver loops forever searching for a distinct-points config that can't exist (the operator's
 * freeze: a kite whose area-ratio given drives N exactly onto the centre O).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, meetsRequirements, pointsDistinct } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { isGeoPoint, circleMembers, pointNeighbors } from '@/engine';
import type { AnyCommand, Construction, Vec } from '@/engine';

describe('pointsDistinct respects allowed (forced) coincidences', () => {
  const c: Construction = {
    objects: [
      { kind: 'free-point', id: 'N', x: 1, y: 1 },
      { kind: 'free-point', id: 'O', x: 1, y: 1 },
      { kind: 'free-point', id: 'P', x: 9, y: 9 },
    ],
    constraints: [],
  };
  const pos = new Map<string, Vec>([['N', { x: 1, y: 1 }], ['O', { x: 1, y: 1 }], ['P', { x: 9, y: 9 }]]);
  it('rejects a coincidence by default', () => expect(pointsDistinct(c, pos)).toBe(false));
  it('accepts it when the pair is in the allowed list', () => expect(pointsDistinct(c, pos, [['N', 'O']])).toBe(true));
});

describe('the operator freeze: meetsRequirements must be TRUE for the forced-coincidence figure', () => {
  function ctxOf(facts: Fact[]) {
    const { construction } = replay(facts);
    return { circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])), points: construction.objects.filter(isGeoPoint).map((o) => o.id), circleMembers: circleMembers(construction), neighbors: pointNeighbors(construction) };
  }
  const STEPS = ['ABCD דלתון חסום במעגל', 'AB=AD', 'CB=CD', 'E על DC', 'BE⊥DC', 'AC', 'N = חיתוך BE ו-AC', 'שטח משולש NCE= רבע שטח משולש ACD'];
  it('builds and meets requirements (so autoResolve does NOT loop)', () => {
    const facts: Fact[] = []; let g = 0;
    for (const s of STEPS) { const r = parse(s, ctxOf(facts)); if (!r.ok) throw new Error('parse ' + s); const grp = `g${g++}`; for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${grp}.${facts.length}`, utterance: s, group: grp, cmd, enabled: true }); }
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    expect(fig.coincidences.some(([a, b]) => (a === 'N' && b === 'O') || (a === 'O' && b === 'N'))).toBe(true);
    expect(meetsRequirements(facts, 0), 'a forced coincidence still meets requirements (no futile auto-resolve search)').toBe(true);
  });
});
