/**
 * #2355 ([ADR-750](../../../docs/06-decisions.md#adr-750)) — AN INSCRIBED 3-/4-GON STATES ITS NOUN'S SHAPE, so a
 * square, rectangle, rhombus or right triangle inscribed in a circle is that shape, held and verified, whether its
 * vertices are new or already drawn.
 *
 * Measured at `37800b85` through the submit gate: «מרובע ABCD» · «ריבוע ABCD חסום במעגל» committed GREEN with
 * sides 6.000 / 5.099 / 4.564 / 4.579 and angles 84 / 79 / 96 / 101. `inscribedPolygon` stated a RIGID kind's
 * shape only by its pinned θ, which place NEW vertices on the rule's own fresh circle and say nothing about
 * existing ones (a `point-on-circle` over an existing id is membership, M1), an existing circle (no θ at all) or
 * a ring already on its circle (the ADR-156 re-entry, which answered «כבר קיים»). No constraint stated the shape,
 * so the verifier had nothing to check. The remedy is the noun's ONE standalone lowering (`lowerShape`, ADR-595)
 * plus circle membership; the θ stay as the seed (the ADR-739 pattern, n ≥ 5).
 *
 * LOCK HAZARD: within one process the replay of a fact list can depend on what was replayed before it (a fold-memo
 * order dependence, its own issue). So every row clears the replay caches first AND asserts on the lowered
 * commands, so a lock cannot pass on geometry a cache leaked from an earlier row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import type { Vec } from '@/engine';
import { clearReplayCaches, meetsRequirements } from '@/replay/core';

beforeEach(() => {
  useGeoStore.getState().clear();
  clearReplayCaches();
});

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const MIN_SHOWN = 22;

type Kind = 'square' | 'rectangle' | 'rhombus' | 'right-triangle';
/** [kind, Hebrew noun, English noun, the typed command the inscription must state] */
const KINDS: [Kind, string, string][] = [
  ['square', 'ריבוע', 'square'],
  ['rectangle', 'מלבן', 'rectangle'],
  ['rhombus', 'מעוין', 'rhombus'],
  ['right-triangle', 'משולש ישר זווית', 'right triangle'],
];

const pos = (p: unknown, id: string): Vec => {
  const v = p instanceof Map ? p.get(id) : (p as Record<string, Vec>)[id];
  expect(v, `position of ${id}`).toBeDefined();
  return v as Vec;
};
const angleAt = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y }, w = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))) * 180) / Math.PI;
};

/** The figure at `seed` is a verified `kind` whose every vertex lies on one drawn (or hidden) circle. */
function expectShape(facts: Fact[], seed: number, kind: Kind, what: string) {
  const fig = replay(facts, seed);
  expect(fig.lastError, `${what} @${seed}: no error`).toBeNull();
  expect(fig.pending, `${what} @${seed}: nothing pending`).toBe(false);
  expect(fig.violations, `${what} @${seed}: the givens verifier is clean`).toEqual([]);
  for (const f of facts.filter((f) => f.enabled)) expect(fig.status[f.id], `${what} @${seed}: «${f.utterance}» ${f.cmd.type}`).toBe('ok');
  const ids = kind === 'right-triangle' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  const v = ids.map((id) => pos(fig.positions, id));
  const n = v.length;
  // concyclic: some circle of the figure carries every vertex
  const circles = [...(fig.circles as Map<string, { center: Vec; r: number }>).values()];
  const carrier = circles.find((c) => v.every((p) => Math.abs(Math.hypot(p.x - c.center.x, p.y - c.center.y) - c.r) < 1e-6 * Math.max(1, c.r)));
  expect(carrier, `${what} @${seed}: every vertex on one circle`).toBeDefined();
  const angles = v.map((b, i) => angleAt(v[(i + n - 1) % n], b, v[(i + 1) % n]));
  if (kind === 'right-triangle') {
    expect(Math.abs(angles[2] - 90), `${what} @${seed}: ∠C = ${angles[2].toFixed(4)}`).toBeLessThan(1e-4);
    return;
  }
  for (const a of angles) expect(Math.abs(a - 90), `${what} @${seed}: angles ${angles.map((x) => x.toFixed(3)).join("/")}`).toBeLessThan(1e-4);
  const sides = v.map((a, i) => Math.hypot(v[(i + 1) % n].x - a.x, v[(i + 1) % n].y - a.y));
  expect(sides[0], `${what} @${seed}: non-degenerate`).toBeGreaterThan(1e-3);
  // a cyclic rhombus IS a square
  if (kind !== 'rectangle') for (const s of sides) expect(Math.abs(s - sides[0]) / sides[0], `${what} @${seed}: sides ${sides.map((x) => x.toFixed(4)).join('/')}`).toBeLessThan(1e-6);
  const turns = v.map((_, i) => {
    const a = v[(i + n - 1) % n], b = v[i], c = v[(i + 1) % n];
    return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  });
  for (const t of turns) expect(t, `${what} @${seed}: convex`).toBe(turns[0]);
}

function sweep(facts: Fact[], kind: Kind, what: string) {
  let shown = 0;
  for (const seed of SEEDS) {
    if (!meetsRequirements(facts, seed)) {
      expect(seed, `${what}: seed 0 (where a structural edit lands) is displayable`).not.toBe(0);
      continue;
    }
    expectShape(facts, seed, kind, what);
    shown++;
  }
  expect(shown, `${what}: displayable seeds`).toBeGreaterThanOrEqual(MIN_SHOWN);
}

/** The typed shape is IN the lowered commands — the command-level half of the lock (see the hazard above). */
function expectStated(facts: Fact[], kind: Kind, what: string) {
  const ids = kind === 'right-triangle' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  const typed = facts.filter((f) => f.cmd.type === kind && JSON.stringify((f.cmd as { ids?: string[] }).ids) === JSON.stringify(ids));
  expect(typed.length, `${what}: the commands state «${kind} ${ids.join('')}»`).toBeGreaterThan(0);
}

/** Every branch of the rule: existing ring, re-entry, a named circle (existing / fresh letters), one letter drawn, English, hidden. */
function rows(kind: Kind, he: string, en: string): [string, string[]][] {
  const tri = kind === 'right-triangle';
  const run = tri ? 'ABC' : 'ABCD';
  const base = tri ? 'משולש' : 'מרובע';
  const baseEn = tri ? 'triangle' : 'quadrilateral';
  return [
    ['all exist', [`${base} ${run}`, `${he} ${run} חסום במעגל`]],
    ['re-entry', [`${base} ${run} חסום במעגל`, `${he} ${run} חסום במעגל`]],
    ['named O + existing ring', ['מעגל O', `${base} ${run}`, `${he} ${run} חסום במעגל O`]],
    ['named O + fresh letters', ['מעגל O', `${he} ${run} חסום במעגל O`]],
    ['one letter drawn', ['נקודה A', `${he} ${run} חסום במעגל`]],
    ['English, existing ring', [`${baseEn} ${run}`, `${en} ${run} inscribed in a circle`]],
    ['hidden circle («בר חסימה»), existing ring', [`${base} ${run}`, `${he} ${run} בר חסימה`]],
  ];
}

describe('#2355 — an inscribed rigid 3-/4-gon is its noun on every branch, at every displayable seed', () => {
  const CASES = KINDS.flatMap(([kind, he, en]) => rows(kind, he, en).map(([branch, seq]) => [`${kind} · ${branch}: ${seq.join(' · ')}`, kind, seq] as const));
  it.each(CASES)('%s', (what, kind, seq) => {
    const { facts, refused } = driveThroughGate([...seq]);
    expect(refused, 'every line commits').toEqual([]);
    expectStated(facts, kind, what);
    sweep(facts, kind, what);
  });
});

describe('#2355 — the right angle of an inscribed right triangle is at C on every branch', () => {
  it('a stated «∠A = 90°» moves it (the soft default yields, M4)', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', 'משולש ישר זווית ABC חסום במעגל', 'זווית A = 90']);
    expect(refused).toEqual([]);
    const fig = replay(facts, 0);
    expect(fig.violations).toEqual([]);
    expect(angleAt(pos(fig.positions, 'B'), pos(fig.positions, 'A'), pos(fig.positions, 'C'))).toBeCloseTo(90, 6);
  });
});

describe('#2355 — the one-line fresh inscription is unchanged (the typed shape adds a statement, not a move)', () => {
  // The θ-only scaffold of `37800b85`, the same figure with the typed shape's statement taken back out
  const LINES: [Kind, string, string][] = [
    ['square', 'ריבוע ABCD חסום במעגל', 'quadrilateral'],
    ['rectangle', 'מלבן ABCD חסום במעגל', 'quadrilateral'],
    ['rhombus', 'מעוין ABCD חסום במעגל', 'quadrilateral'],
    ['right-triangle', 'משולש ישר זווית ABC חסום במעגל', 'triangle'],
  ];
  it.each(LINES)('%s: %s', (kind, line, bare) => {
    const { facts, refused } = driveThroughGate([line]);
    expect(refused).toEqual([]);
    expectStated(facts, kind, line);
    const placed = facts.map((f) =>
      f.cmd.type === kind ? { ...f, cmd: { type: bare, ids: (f.cmd as { ids: string[] }).ids } as Fact['cmd'] } : f,
    );
    for (const seed of SEEDS) {
      expectShape(facts, seed, kind, line);
      clearReplayCaches();
      const with_ = replay(facts, seed).positions;
      clearReplayCaches();
      const without = replay(placed, seed).positions;
      for (const id of kind === 'right-triangle' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']) {
        const a = pos(with_, id), b = pos(without, id);
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${line} @${seed}: ${id} did not move`).toBeLessThan(1e-9);
      }
    }
  });
});

describe('#2355 — the free inscribed kinds keep their own relations (not routed through the typed lowering)', () => {
  it.each([
    ['שווה צלעות', ['משולש ABC', 'משולש שווה צלעות ABC חסום במעגל'], 'set-equal'],
    ['שווה שוקיים', ['משולש ABC', 'משולש שווה שוקיים ABC חסום במעגל'], 'set-equal'],
    ['טרפז', ['מרובע ABCD', 'טרפז ABCD חסום במעגל'], 'set-parallel'],
    ['דלתון', ['מרובע ABCD', 'דלתון ABCD חסום במעגל'], 'shape-variant'],
  ] as const)('%s', (_, seq, rel) => {
    const { facts, refused } = driveThroughGate([...seq]);
    expect(refused).toEqual([]);
    const last = facts.filter((f) => f.utterance === seq[seq.length - 1]).map((f) => f.cmd.type);
    expect(last).toContain(rel);
    for (const t of ['trapezoid', 'right-triangle', 'square', 'rectangle', 'rhombus']) expect(last).not.toContain(t);
  });
});

describe('#2355 — an inscription the stated sides contradict is refused as the standalone noun is', () => {
  const OVER = 'over-constrained: |AB| = |BC| cannot hold [vs #3]';
  it('the [2-D] reference: «ABCD ריבוע» over AB = 3, BC = 4', () => {
    const { refused } = driveThroughGate(['מרובע ABCD', 'AB = 3', 'BC = 4', 'ABCD ריבוע']);
    expect(refused.map((r) => r.verdict)).toEqual([{ kind: 'refused', reason: 'error', detail: OVER }]);
  });
  it.each([['ריבוע'], ['מעוין']])('«%s ABCD חסום במעגל» over AB = 3, BC = 4', (noun) => {
    const { refused } = driveThroughGate(['מרובע ABCD', 'AB = 3', 'BC = 4', `${noun} ABCD חסום במעגל`]);
    expect(refused).toHaveLength(1);
    expect(refused[0].index).toBe(3);
    expect(refused[0].verdict).toEqual({ kind: 'refused', reason: 'error', detail: OVER });
  });
  it('the right triangle over 3 / 4 / 6 is refused as «ABC משולש ישר זווית» is', () => {
    const standalone = driveThroughGate(['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 6', 'ABC משולש ישר זווית']).refused;
    expect(standalone).toHaveLength(1);
    clearReplayCaches();
    const { refused } = driveThroughGate(['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 6', 'משולש ישר זווית ABC חסום במעגל']);
    expect(refused).toHaveLength(1);
    expect(refused[0].index).toBe(4);
    expect(refused[0].verdict).toEqual(standalone[0].verdict);
  });
  it('«מלבן ABCD חסום במעגל» over AB = 3, BC = 4 builds the 3×4 rectangle on its circle', () => {
    const { facts, refused } = driveThroughGate(['מרובע ABCD', 'AB = 3', 'BC = 4', 'מלבן ABCD חסום במעגל']);
    expect(refused).toEqual([]);
    expectStated(facts, 'rectangle', 'מלבן 3×4');
    expectShape(facts, 0, 'rectangle', 'מלבן 3×4');
    const fig = replay(facts, 0);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => pos(fig.positions, id));
    expect(Math.hypot(B.x - A.x, B.y - A.y)).toBeCloseTo(3, 6);
    expect(Math.hypot(C.x - B.x, C.y - B.y)).toBeCloseTo(4, 6);
  });
});

describe('#2355 — restatements', () => {
  it('a square already on its circle, re-inscribed, is still the honest «כבר קיים» (no new fact)', () => {
    const once = driveThroughGate(['ריבוע ABCD חסום במעגל']).facts.length;
    const { facts, refused } = driveThroughGate(['ריבוע ABCD חסום במעגל', 'ריבוע ABCD חסום במעגל']);
    expect(refused).toEqual([]);
    expect(facts).toHaveLength(once);
  });
  it('«משולש ABC בר חסימה» · «משולש ABC חסום במעגל» still reveals the circle (ADR-624)', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC בר חסימה', 'משולש ABC חסום במעגל']);
    expect(refused).toEqual([]);
    expect(facts.filter((f) => f.utterance === 'משולש ABC חסום במעגל').length).toBeGreaterThan(0);
  });
});
