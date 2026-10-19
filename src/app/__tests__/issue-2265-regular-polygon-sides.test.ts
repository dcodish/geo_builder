/**
 * #2265 ([ADR-739](../../../docs/06-decisions.md#adr-739)) — A REGULAR n-GON STATES ITS EQUAL SIDES, so the
 * statement holds, and is verified, whether its vertices are new or already drawn.
 *
 * Operator, 2026-10-16 (T50 of round #2245): *"מחומש משוכלל means all sides are equal and this is not the case
 * so this is a P1"*. Measured at `b7d6223c` through the submit gate: «מחומש ABCDE» · «המחומש משוכלל» committed
 * GREEN with sides 5.861 / 5.951 / 4.722 / 4.806 / 4.684. The n ≥ 5 scaffold (`ringOnCircle`) stated regularity
 * only by PINNED θ, which place new vertices and say nothing about existing ones (a `point-on-circle` over an
 * existing id lowers to membership, M1). No constraint said "equal", so the verifier had nothing to check.
 *
 * Class: a polygon property stated by PLACEMENT ALONE is silently dropped when the vertices already exist.
 * The locks:
 *  - the class over n = 5, 6, 8, definite and named, at 24 seeds — equal sides, equal interior angles
 *    (n−2)·180/n, a convex ring, the step verified;
 *  - the one-line form (new vertices) is unchanged at every seed: the equal sides add a statement, not a move;
 *  - a stated unequal side refuses the regular statement in the contradiction frame, as the square analog does;
 *  - the inscribed regular reading over existing vertices (the bound and the re-entry branches).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { parse } from '@/parser';
import type { Vec } from '@/engine';
import { meetsRequirements } from '@/replay/core';

beforeEach(() => useGeoStore.getState().clear());

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const NOUNS: [number, string, string][] = [
  [5, 'מחומש', 'ABCDE'],
  [6, 'משושה', 'ABCDEF'],
  [8, 'מתומן', 'ABCDEFGH'],
];

const pos = (p: unknown, id: string): Vec => {
  const v = p instanceof Map ? p.get(id) : (p as Record<string, Vec>)[id];
  expect(v, `position of ${id}`).toBeDefined();
  return v as Vec;
};

/** The ring's sides, interior angles (degrees) and the sign of every turn. */
function ringShape(positions: unknown, ids: string[]) {
  const v = ids.map((id) => pos(positions, id));
  const n = v.length;
  const sides = v.map((a, i) => Math.hypot(v[(i + 1) % n].x - a.x, v[(i + 1) % n].y - a.y));
  const turns = v.map((_, i) => {
    const a = v[(i + n - 1) % n], b = v[i], c = v[(i + 1) % n];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  const angles = v.map((_, i) => {
    const a = v[(i + n - 1) % n], b = v[i], c = v[(i + 1) % n];
    const u = { x: a.x - b.x, y: a.y - b.y }, w = { x: c.x - b.x, y: c.y - b.y };
    return (Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))) * 180) / Math.PI;
  });
  return { sides, angles, turns };
}

/** The figure at `seed` is a verified, convex, regular ring. */
function expectRegular(facts: Fact[], seed: number, ids: string[], what: string) {
  const fig = replay(facts, seed);
  expect(meetsRequirements(facts, seed), `${what} @${seed}: displayable`).toBe(true);
  expect(fig.lastError, `${what} @${seed}: no error`).toBeNull();
  expect(fig.pending, `${what} @${seed}: nothing pending`).toBe(false);
  expect(fig.violations, `${what} @${seed}: the givens verifier is clean`).toEqual([]);
  for (const f of facts.filter((f) => f.enabled)) expect(fig.status[f.id], `${what} @${seed}: «${f.utterance}» ${f.cmd.type}`).toBe('ok');
  const n = ids.length;
  const { sides, angles, turns } = ringShape(fig.positions, ids);
  const s0 = sides[0];
  expect(s0, `${what} @${seed}: a non-degenerate side`).toBeGreaterThan(1e-3);
  for (const s of sides) expect(Math.abs(s - s0) / s0, `${what} @${seed}: sides ${sides.map((x) => x.toFixed(4)).join('/')}`).toBeLessThan(1e-6);
  const interior = ((n - 2) * 180) / n;
  for (const a of angles) expect(Math.abs(a - interior), `${what} @${seed}: angles ${angles.map((x) => x.toFixed(3)).join('/')}`).toBeLessThan(1e-4);
  const sign = Math.sign(turns[0]);
  expect(sign, `${what} @${seed}: the ring turns`).not.toBe(0);
  for (const t of turns) expect(Math.sign(t), `${what} @${seed}: convex`).toBe(sign);
}

/**
 * Every configuration the student can be SHOWN is regular. The app displays a seed only when it meets the view
 * requirements (`meetsRequirements`: it builds, every step holds, the verifier is clean, a declared ring is
 * simple — ADR-106, ADR-616); «הציגו תצורה אחרת» skips the rest. A seed whose sampled start leads the solve to
 * the PENTAGRAM (equal sides on one circle, crossed) or to no solution is such a rest. So the sweep asserts:
 * seed 0 — where a structural edit lands (ADR-484) — is displayable; every displayable seed is a convex regular
 * ring with every step verified; and at least `MIN_SHOWN` of the 24 are displayable.
 *
 * The floor is what is ACHIEVED, measured (docs/17 §9), not the ~20/24 target: 15/24 for the pentagon and the
 * hexagon, 22/24 for the octagon, 15–17/24 for the inscribed rows (the square analog, a typed shape that re-places
 * its corners, is 24/24). The missing seeds start the solve from the earlier free ring and land on the pentagram or
 * do not converge; nothing a student can see is lost, because a regular n-gon has ONE shape up to similarity, and
 * seed 0 always shows it. The whole-rate is recorded as a finding in ADR-739, not hidden by a lower bar elsewhere.
 */
const MIN_SHOWN = 14;
function sweep(facts: Fact[], ids: string[], what: string) {
  let shown = 0;
  for (const seed of SEEDS) {
    if (seed !== 0 && !meetsRequirements(facts, seed)) continue;
    expectRegular(facts, seed, ids, what);
    shown++;
  }
  console.log(`${what}: ${shown}/${SEEDS.length} displayable`);
  expect(shown, `${what}: displayable seeds`).toBeGreaterThanOrEqual(MIN_SHOWN);
}

describe('#2265 — a regular n-gon stated over existing vertices holds at every seed', () => {
  const ROWS = [
    ...NOUNS.flatMap(([, noun, run]) => [
      [`ה${noun} משוכלל`, [`${noun} ${run}`, `ה${noun} משוכלל`], run] as const,
      [`ה${noun} ${run} משוכלל`, [`${noun} ${run}`, `ה${noun} ${run} משוכלל`], run] as const,
    ]),
    ['English: "pentagon ABCDE" · "regular pentagon ABCDE"', ['pentagon ABCDE', 'regular pentagon ABCDE'], 'ABCDE'] as const,
  ];
  it.each(ROWS.map(([title, seq, run]) => [title, seq, run] as const))('%s', (_, seq, run) => {
    const { facts, refused } = driveThroughGate([...seq]);
    expect(refused, 'every line commits').toEqual([]);
    sweep(facts, run.split(''), seq.join(' · '));
  });
});

describe('#2265 — the one-line regular n-gon is unchanged (the equal sides add a statement, not a move)', () => {
  it.each(NOUNS.map(([n, noun, run]) => [`${noun} משוכלל ${run}`, n, run] as const))('%s', (line, n, run) => {
    const { facts, refused } = driveThroughGate([line]);
    expect(refused).toEqual([]);
    const ids = run.split('');
    expect(facts.filter((f) => f.cmd.type === 'set-equal')).toHaveLength(n - 1);
    // the same figure with the new statements taken out — the scaffold the pinned θ alone place
    const placed = facts.filter((f) => f.cmd.type !== 'set-equal');
    for (const seed of SEEDS) {
      expectRegular(facts, seed, ids, line);
      const with_ = replay(facts, seed).positions;
      const without = replay(placed, seed).positions;
      for (const id of ids) {
        const a = pos(with_, id), b = pos(without, id);
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${line} @${seed}: ${id} did not move`).toBeLessThan(1e-9);
      }
    }
  });
});

describe('#2265 — a regular statement that the stated sides contradict is refused in the contradiction frame', () => {
  it('the square analog (the [2-D] reference, measured at b7d6223c) is refused naming the earlier statement', () => {
    const { refused } = driveThroughGate(['מרובע ABCD', 'AB = 3', 'BC = 4', 'ABCD ריבוע']);
    expect(refused).toHaveLength(1);
    expect(refused[0].index).toBe(3);
    expect(refused[0].verdict).toEqual({ kind: 'refused', reason: 'error', detail: 'over-constrained: |AB| = |BC| cannot hold [vs #3]' });
  });
  it.each([['המחומש משוכלל'], ['המחומש ABCDE משוכלל']])('«מחומש ABCDE» · «AB = 3» · «BC = 4» · «%s» is refused the same way', (line) => {
    const { refused } = driveThroughGate(['מחומש ABCDE', 'AB = 3', 'BC = 4', line]);
    expect(refused).toHaveLength(1);
    expect(refused[0].index).toBe(3);
    expect(refused[0].verdict).toEqual({ kind: 'refused', reason: 'error', detail: 'over-constrained: |AB| = |BC| cannot hold [vs #3]' });
  });
});

describe('#2265 — the inscribed regular reading over existing vertices', () => {
  const ROWS: [string, string[]][] = [
    ['bound: «מחומש ABCDE» · «מחומש משוכלל ABCDE חסום במעגל»', ['מחומש ABCDE', 'מחומש משוכלל ABCDE חסום במעגל']],
    ['re-entry: «מחומש ABCDE חסום במעגל» · «מחומש משוכלל ABCDE חסום במעגל»', ['מחומש ABCDE חסום במעגל', 'מחומש משוכלל ABCDE חסום במעגל']],
    ['definite over an inscribed ring: «מחומש ABCDE חסום במעגל» · «המחומש משוכלל»', ['מחומש ABCDE חסום במעגל', 'המחומש משוכלל']],
  ];
  it.each(ROWS)('%s', (_, seq) => {
    const { facts, refused } = driveThroughGate(seq);
    expect(refused).toEqual([]);
    sweep(facts, 'ABCDE'.split(''), seq.join(' · '));
  });
  it('a PLAIN inscribed n-gon states no equal sides (ADR-610: free vertices, unequal sides)', () => {
    const r = parse('מחומש ABCDE חסום במעגל', {});
    expect(r.ok && r.commands.filter((c) => c.type === 'set-equal')).toEqual([]);
  });
  it('the regular scaffold states the n−1 consecutive equalities, in ring order', () => {
    const r = parse('מחומש משוכלל ABCDE', {});
    expect(r.ok && r.commands.filter((c) => c.type === 'set-equal')).toEqual([
      { type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' },
      { type: 'set-equal', a: 'B', b: 'C', c: 'C', d: 'D' },
      { type: 'set-equal', a: 'C', b: 'D', c: 'D', d: 'E' },
      { type: 'set-equal', a: 'D', b: 'E', c: 'E', d: 'A' },
    ]);
  });
});
