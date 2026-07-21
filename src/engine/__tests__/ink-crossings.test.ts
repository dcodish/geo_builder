/**
 * The crossing-affordance UNIVERSE (#228, ADR-380): every pair of drawn things, not a whitelist of pair
 * kinds. The predecessor `findSegmentCrossings` enumerated segment×segment and (since #197) line×segment,
 * so circle×segment — the operator's own example — circle×circle, circle×line and line×line silently
 * offered no dot at all.
 */

import { describe, it, expect } from 'vitest';
import type { AnyCommand, Id, Vec } from '../types';
import { build, evaluate, resolveLine } from '..';
import { drawnCircles, findInkCrossings, crossingCounts, type ResolvedLineRef } from '../inkCrossings';

/** Resolve a figure to the DRAWN ink the affordance sees. */
function inkOf(cmds: AnyCommand[]) {
  const { construction } = build(cmds);
  const e = evaluate(construction);
  if (!e.ok) throw new Error(e.error);
  const lines: ResolvedLineRef[] = [];
  for (const o of construction.objects) {
    if (o.kind !== 'line' || !o.visible) continue;
    const rl = resolveLine(o, e.positions, e.circles);
    if (rl === 'pending' || typeof rl === 'string') continue;
    lines.push({ id: o.id, anchor: rl.anchor, dir: rl.dir });
  }
  return {
    construction,
    positions: e.positions,
    circles: drawnCircles(construction, e.circles),
    lines,
    crossings: findInkCrossings(construction, e.positions, { lines, circles: drawnCircles(construction, e.circles) }),
  };
}

const CIRCLE: AnyCommand[] = [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }];

describe('findInkCrossings — the drawn-ink universe (#228)', () => {
  it('circle × segment: a segment cutting clean through offers BOTH crossings (the operator’s example)', () => {
    // A chord-length segment whose endpoints sit OUTSIDE the circle, so it crosses twice, and whose
    // endpoints are named points well clear of the circle.
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: -9, y: 1 },
      { type: 'free-point', id: 'Q', x: 9, y: 1 },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    const cs = crossings.filter((x) => x.circle1 === 'circle-O' && x.c === 'P' && x.d === 'Q');
    expect(cs, 'both secant crossings offered').toHaveLength(2);
    // Each lands ON the circle and strictly INSIDE the segment.
    for (const x of cs) {
      expect(Math.hypot(x.pos.x - 0, x.pos.y - 0), 'on the circle').toBeCloseTo(5, 6);
      expect(x.pos.x).toBeGreaterThan(-9);
      expect(x.pos.x).toBeLessThan(9);
    }
    // The two share one operand-pair key (forcedness counts by pair, never by root index) and carry
    // distinct branch indices for the lowering.
    expect(new Set(cs.map((x) => x.key)).size).toBe(1);
    expect(new Set(cs.map((x) => x.branch))).toEqual(new Set([0, 1]));
  });

  it('circle × segment: a segment that stops short of the circle offers nothing', () => {
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: 7, y: 7 },
      { type: 'free-point', id: 'Q', x: 9, y: 9 },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    expect(crossings.filter((x) => x.circle1)).toHaveLength(0);
  });

  it('circle × segment: a crossing outside the segment’s own extent is NOT offered', () => {
    // The carrier LINE cuts the circle, but both crossings lie beyond Q — the drawn segment misses it.
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: 20, y: 0.5 },
      { type: 'free-point', id: 'Q', x: 11, y: 0.5 },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    expect(crossings.filter((x) => x.circle1)).toHaveLength(0);
  });

  it('circle × circle: two overlapping circles offer both intersection points', () => {
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'circle', id: 'circle-K', center: 'K', radius: 5 },
      { type: 'set-distance', a: 'O', b: 'K', value: 6 },
    ]);
    const cs = crossings.filter((x) => x.circle1 && x.circle2);
    expect(cs).toHaveLength(2);
    expect(new Set(cs.map((x) => x.key)).size, 'one operand pair').toBe(1);
    expect(new Set(cs.map((x) => x.branch))).toEqual(new Set([0, 1]));
  });

  it('circle × circle: separated circles offer nothing, and TANGENT circles offer nothing either', () => {
    const apart = inkOf([
      ...CIRCLE,
      { type: 'circle', id: 'circle-K', center: 'K', radius: 2 },
      { type: 'set-distance', a: 'O', b: 'K', value: 20 },
    ]);
    expect(apart.crossings.filter((x) => x.circle1 && x.circle2)).toHaveLength(0);

    // Externally tangent (5 + 2 = 7): a touch, not a crossing to name — and precisely the configuration
    // that stops existing one flex later, so it must never earn a dot.
    const touching = inkOf([
      ...CIRCLE,
      { type: 'circle', id: 'circle-K', center: 'K', radius: 2 },
      { type: 'set-distance', a: 'O', b: 'K', value: 7 },
    ]);
    expect(touching.crossings.filter((x) => x.circle1 && x.circle2)).toHaveLength(0);
  });

  it('a HIDDEN circle is not drawn ink — it offers no dots', () => {
    const { construction } = build([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: -9, y: 1 },
      { type: 'free-point', id: 'Q', x: 9, y: 1 },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    const e = evaluate(construction);
    if (!e.ok) throw new Error(e.error);
    // Same figure, but the circle marked hidden (a cyclic polygon's circumcircle constrains without drawing).
    const hiddenC = { ...construction, objects: construction.objects.map((o) => (o.kind === 'circle' ? { ...o, hidden: true } : o)) };
    expect(drawnCircles(hiddenC, e.circles), 'hidden circle excluded from the universe').toHaveLength(0);
    expect(findInkCrossings(hiddenC, e.positions, { circles: drawnCircles(hiddenC, e.circles) })).toHaveLength(0);
  });

  it('a crossing that already carries a NAMED point offers no second dot', () => {
    // B is defined AS the crossing of the segment and the circle — the dot must not re-offer it.
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: -9, y: 0 },
      { type: 'free-point', id: 'Q', x: 9, y: 0 },
      { type: 'segment', a: 'P', b: 'Q' },
      { type: 'line-through', id: 'line-PQ', a: 'P', b: 'Q' },
      { type: 'line-circle-intersection', id: 'B', line: 'line-PQ', circle: 'circle-O', branch: 0 },
      { type: 'line-circle-intersection', id: 'C', line: 'line-PQ', circle: 'circle-O', branch: 1 },
    ]);
    expect(crossings.filter((x) => x.circle1), 'both crossings are named already').toHaveLength(0);
  });

  it('segment × segment parity: the parallelogram diagonals still offer exactly one dot', () => {
    const { crossings } = inkOf([
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'segment', a: 'B', b: 'D' },
    ]);
    expect(crossings).toHaveLength(1);
    expect([crossings[0].a, crossings[0].b].sort()).toEqual(['A', 'C']);
    expect([crossings[0].c, crossings[0].d].sort()).toEqual(['B', 'D']);
    expect(crossings[0].key, 'operand-pair identity, order-independent').toBe('s:A-C|s:B-D');
  });

  it('crossingCounts keys by operand PAIR, so a secant contributes 2 under one key', () => {
    const { crossings } = inkOf([
      ...CIRCLE,
      { type: 'free-point', id: 'P', x: -9, y: 1 },
      { type: 'free-point', id: 'Q', x: 9, y: 1 },
      { type: 'segment', a: 'P', b: 'Q' },
    ]);
    const counts = crossingCounts(crossings);
    expect(counts.get('c:circle-O|s:P-Q')).toBe(2);
  });
});
