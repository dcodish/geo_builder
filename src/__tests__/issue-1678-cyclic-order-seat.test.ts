/**
 * #1678 ([ADR-601](../../docs/06-decisions.md#adr-601)) — THE CYCLIC ORDER OF FREE POINTS ON A CIRCLE IS A
 * SAMPLED DOF, AND A STATED ORDER IS KEPT.
 *
 * Measured at pickup (origin/main e17a7d1e + the parser arm): four «X על מעגל O» points take golden-angle
 * default slots in the cyclic order A, C, B, D, and the sampler's tight cluster jitter (±30°) never changed it.
 * So every figure whose givens need another order failed at 24/24 seeds and `findValidConfig` returned null:
 *  - the row «במעגל המיתרים AC ו-BD נפגשים בנקודה E» (chords AC and BD can never cross while A, C are adjacent);
 *  - «מרובע ABCD» and «המרובע ABCD חסום במעגל O» over the four points (ABCD drawn self-crossing);
 *  - a five-point cluster with crossing chords AD and BF.
 * Class: an unstated cyclic order of points on a circle acted as a fixed given (ADR-052 / docs/17 M4).
 * The locks call the real `findValidConfig` / `meetsRequirements` / `statedCyclicOrderSeat`, and cover the
 * class: the polygon order, the chord crossing in both operand orders, the entry-order permutation, a larger
 * cluster, and the no-drift guards (an order already stated and met, fewer than four points).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { useGeoStore, replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { findValidConfig, meetsRequirements } from '@/replay/core';
import { statedCyclicOrderSeat } from '@/engine/sample';
import type { OnCirclePoint } from '@/engine';
import { driveThroughGate } from './submit-gate';

const RING = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O'];

function factsOf(steps: string[]): Fact[] {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(steps);
  expect(refused).toEqual([]);
  return facts;
}

/** How many of seeds 1..23 meet every requirement (seed 0 is the untouched default). */
const sampledWholeRate = (facts: Fact[]) => Array.from({ length: 23 }, (_, i) => i + 1).filter((s) => meetsRequirements(facts, s)).length;

/** The cyclic order of `ids` round O at this seed, as a canonical string (rotation and reflection removed). */
function cyclicOrder(facts: Fact[], seed: number, ids: string[]): string {
  const fig = replay(facts, seed);
  const o = fig.positions.get('O')!;
  const ang = (p: string) => { const q = fig.positions.get(p)!; return Math.atan2(q.y - o.y, q.x - o.x); };
  const seq = [...ids].sort((a, b) => ang(a) - ang(b));
  const rot = (s: string[]) => { const i = s.indexOf(ids[0]); return [...s.slice(i), ...s.slice(0, i)].join(''); };
  const fwd = rot(seq);
  const back = rot([...seq].reverse());
  return fwd < back ? fwd : back;
}

beforeEach(() => useGeoStore.getState().clear());

describe('#1678 — a stated order the default slots do not have is reached by the configuration search', () => {
  it.each([
    ['the row: chords AC and BD meet in the circle', [...RING, 'במעגל המיתרים AC ו-BD נפגשים בנקודה E']],
    ['the same crossing, operands swapped', [...RING, 'המיתרים BD ו-AC נחתכים בנקודה E']],
    ['the quadrilateral ABCD over the four points', [...RING, 'מרובע ABCD']],
    ['the inscribed quadrilateral ABCD over the four points', [...RING, 'המרובע ABCD חסום במעגל O']],
  ])('%s: every sampled seed holds the stated order, and the search finds it', (_name, steps) => {
    const facts = factsOf(steps);
    expect(sampledWholeRate(facts)).toBe(23);
    const found = findValidConfig(facts, 0);
    expect(found).not.toBeNull();
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
  });

  it('entry order does not matter: A, C, B, D typed keeps the crossing at the default and at every seed', () => {
    const facts = factsOf(['מעגל O', 'A על מעגל O', 'C על מעגל O', 'B על מעגל O', 'D על מעגל O', 'המיתרים AC ו-BD נחתכים בנקודה E']);
    expect(meetsRequirements(facts, 0)).toBe(true);
    expect(sampledWholeRate(facts)).toBe(23);
  });

  it('a five-point cluster: chords AD and BF stated to cross are drawn crossing', () => {
    const facts = factsOf([...RING, 'F על מעגל O', 'המיתרים AD ו-BF נחתכים בנקודה E']);
    expect(meetsRequirements(facts, 0)).toBe(false); // the default slots: A and D adjacent
    expect(sampledWholeRate(facts)).toBeGreaterThanOrEqual(15);
    expect(findValidConfig(facts, 0)).not.toBeNull();
  });
});

describe('#1678 — an unstated order is a DOF: «הציגו תצורה אחרת» reaches every order', () => {
  it('four bare points on a circle take all three cyclic orders across the sampled seeds', () => {
    const facts = factsOf(RING);
    const orders = new Set(Array.from({ length: 23 }, (_, i) => cyclicOrder(facts, i + 1, ['A', 'B', 'C', 'D'])));
    expect([...orders].sort()).toEqual(['ABCD', 'ABDC', 'ACBD']);
  });
});

describe('#1678 — no drift where nothing is open', () => {
  const riders = (facts: Fact[]) => replay(facts, 0).construction.objects.filter((o): o is OnCirclePoint => o.kind === 'on-circle');

  it('an order already stated and met by the default (the quadrilateral ACBD) keeps the default slots', () => {
    const facts = factsOf([...RING, 'מרובע ACBD']);
    for (let s = 1; s < 8; s++) expect(statedCyclicOrderSeat(replay(facts, 0).construction, riders(facts), s).size).toBe(0);
  });

  it('three points on a circle: every order is the default turned or mirrored, so nothing is reseated', () => {
    const facts = factsOf(['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O']);
    for (let s = 1; s < 8; s++) expect(statedCyclicOrderSeat(replay(facts, 0).construction, riders(facts), s).size).toBe(0);
  });

  it('the stated quadrilateral ABCD is reseated in its own order at every seed', () => {
    const facts = factsOf([...RING, 'מרובע ABCD']);
    for (let s = 1; s < 24; s++) expect(cyclicOrder(facts, s, ['A', 'B', 'C', 'D'])).toBe('ABCD');
  });
});
