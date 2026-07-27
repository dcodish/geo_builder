/**
 * Obligation preservation ([ADR-402](../../../docs/06-decisions.md#adr-402), issue #258).
 *
 * The class: a constraint obligation stored ONLY in a carrier's solve state (an `on-segment-solved`'s
 * embedded constraint, a directive, or an `also` entry) was DESTROYED when a ladder stage baked or
 * replaced that carrier — the settle stage's bake stripped an embedded |BC|=|BE| and then ACCEPTED,
 * because dropping a constraint makes the system easier and the acceptance tests only look at the new
 * constraints. The fix is the preservation gate: a rescue stage may not lose an obligation `next`
 * carried; on a miss it repairs (re-lists the obligation as a check) or its accept is void and the
 * ladder climbs on. Plus the sibling hygiene: `drivenConstraintsOf` counts `also`; `driveOrCheck`
 * case (1) never claims a rider that already drives (its claim is a destructive object replacement).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Constraint, Construction, GeoObject } from '@/engine';
import { drivenConstraintsOf } from '@/engine';
import { obligationsOf } from '@/engine/step';

const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const factsOf = (steps: string[]): Fact[] => {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
};
const D = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('obligationsOf / drivenConstraintsOf enumerate every storage shape', () => {
  const K1: Constraint = { type: 'equal', a: 'A', b: 'P', c: 'P', d: 'B' };
  const K2: Constraint = { type: 'distance', a: 'A', b: 'C', value: 3 };
  const K3: Constraint = { type: 'perpendicular', a: 'A', b: 'B', c: 'A', d: 'C' };
  const K4: Constraint = { type: 'distance', a: 'B', b: 'C', value: 5 };
  const c: Construction = {
    objects: [
      { kind: 'free-point', id: 'A', x: 0, y: 0 },
      { kind: 'free-point', id: 'B', x: 4, y: 0 },
      { kind: 'on-segment-solved', id: 'P', a: 'A', b: 'B', constraint: K1, branch: 0 },
      { kind: 'free-point', id: 'C', x: 2, y: 3, solve: { constraint: K2, branch: 0, also: [K3] } },
    ] as GeoObject[],
    constraints: [K4],
  };

  it('obligationsOf sees listed + embedded + directive + also', () => {
    const keys = obligationsOf(c);
    for (const k of [K1, K2, K3, K4]) expect(keys.has(JSON.stringify(k)), `${k.type} present`).toBe(true);
    expect(keys.size).toBe(4);
  });

  it('drivenConstraintsOf includes the `also` co-drive list (the ADR-398 owner maps and the post-solve re-verify see it)', () => {
    const driven = drivenConstraintsOf(c).map((k) => JSON.stringify(k));
    expect(driven).toContain(JSON.stringify(K1)); // embedded
    expect(driven).toContain(JSON.stringify(K2)); // directive
    expect(driven).toContain(JSON.stringify(K3)); // also — was skipped before ADR-402
    expect(driven).not.toContain(JSON.stringify(K4)); // listed-only is not driven
  });
});

describe('driveOrCheck case (1) never claims a rider that already drives (the destructive-claim guard)', () => {
  it('a later constraint referencing a directive-carrying rider leaves its directive intact', () => {
    // «BC=BE» claims the free E (case 3, pushed); «E על AB» converts E to a rider CARRYING that
    // directive (ADR-384). A later «ED=4» references E — pre-guard, case (1) grabbed E and REPLACED it
    // with a fresh on-segment-solved{distance}, destroying the equal directive. Now E is unavailable
    // (it already drives) and the distance lands elsewhere.
    const facts = factsOf(['AB', 'CD', 'BC=BE', 'E על AB', 'ED=4']);
    const fig = replay(facts);
    const e = fig.construction.objects.find((o) => o.id === 'E')!;
    const sv = (e as { solve?: { constraint: Constraint } }).solve;
    const embedded = e.kind === 'on-segment-solved' ? (e as Extract<GeoObject, { kind: 'on-segment-solved' }>).constraint : null;
    expect(sv?.constraint.type === 'equal' || embedded?.type === 'equal', 'E still carries the equality').toBe(true);
    expect(obligationsOf(fig.construction).has(JSON.stringify({ type: 'equal', a: 'B', b: 'C', c: 'B', d: 'E' })), 'the equal obligation survives').toBe(true);
  });
});

describe('the #258 figure — the given survives every entry order and holds geometrically', () => {
  const ORDERS: Record<string, string[]> = {
    'as-typed': ['AB אנך ל CD', 'B על CD', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'],
    'membership-first': ['AB אנך ל CD', 'B על CD', 'E על AB', 'BC=BE', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'],
    'sizes-early': ['AB אנך ל CD', 'B על CD', 'CD=14', 'BD=8', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED'],
  };
  for (const [name, steps] of Object.entries(ORDERS)) {
    it(`${name}: |BC|=|BE| exists in the final construction and holds`, () => {
      const facts = factsOf(steps);
      const fig = replay(facts, firstSatisfyingSeed(facts));
      // The obligation exists SOMEWHERE the evaluator can see — the thing #258's destruction removed.
      const obls = [...obligationsOf(fig.construction).values()];
      expect(obls.some((k) => k.type === 'equal'), 'the equality obligation survives the fold').toBe(true);
      // And it genuinely holds in the displayed figure (the book figure: |BC|=|BE|=6).
      const P = (id: string) => fig.positions.get(id)!;
      expect(D(P('B'), P('C')), '|BC| = |BE|').toBeCloseTo(D(P('B'), P('E')), 1);
      expect(fig.violations, 'verifier clean').toEqual([]);
    });
  }
});
