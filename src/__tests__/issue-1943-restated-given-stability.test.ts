/**
 * #1943 + #1819 ([ADR-623](../../docs/06-decisions.md#adr-623)) — A GIVEN THE FIGURE ALREADY SATISFIES
 * MOVES NOTHING.
 *
 * CLAUDE.md: *"adding a constraint never makes the existing figure jump"*; docs/08 calls the stability
 * regression first-class. Two reports, one cause:
 *  - **#1943** «טרפז ישר זווית ABCD» · «∠ADC = 90» (and «AD ⊥ DC») re-seated D and C. Measured on
 *    `main` @ 06fc51dd through the real submit gate: max move 0.22 / 7.88 / 1.04 / 0.65 / 5.17 / 10.75
 *    at seeds 0–5.
 *  - **#1819** «משולש ABC» · «AB ⟂ BC» · «∠ABC = 90» moved B by 2.27 / 3.05 / 2.58 / 1.83 / 2.60 / 1.98
 *    and C by 1.72 / 2.46 / 3.50 / 2.45 / 3.60 / 2.76 at seeds 0–5 (the #1182 planning pass's numbers,
 *    reproduced exactly at pickup).
 *
 * Cause: `driveOrCheck`'s EAGER pick claimed a solve carrier for the re-stated row before anything was
 * solved, so the driven re-solve landed in another (equally valid) configuration — and the carrier left
 * `freeDofs`, freezing a freedom the figure never lost. `releaseImpliedOwnership` (step.ts) gives the
 * claim back when the row already HOLDS on the prior figure and is FORCED by it (`impliedByFigure`, the
 * ADR-536 rank machinery). The row stays a listed check: recorded, verified, drawn, counted.
 *
 * The locks below are the STABILITY form the fix is judged by — the max point displacement across the
 * re-stated line, asserted zero at six seeds — plus the false-freeze net, which matters more: a row that
 * is NOT already forced must still re-seat the figure exactly as far as it does today.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { driveThroughGate, gateVerdict } from './submit-gate';
import { ctxOf } from './scenario-pipeline';
import { parse } from '@/parser';
import { allConstraints, applyStep, buildSymTab, evaluate, freeDofs, impliedByFigure, lowerOne, movableIds } from '@/engine';
import type { Construction, Id, Vec } from '@/engine';

const SEEDS = [0, 1, 2, 3, 4, 5];

/** The figure the app holds after `prefix` — driven through the REAL submit gate, so a line the app
 *  would have refused can never silently become a fact (`submit-gate.ts`). */
function prefixFacts(prefix: string[]): Fact[] {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(prefix);
  expect(refused, `the prefix builds: ${JSON.stringify(refused)}`).toEqual([]);
  return [...facts];
}

/** Commit `line` onto `prefix` through the gate and return both folds at `seed`. */
function addLine(prefix: string[], line: string, seed: number): { before: ReturnType<typeof replay>; after: ReturnType<typeof replay>; facts: Fact[] } {
  const before = prefixFacts(prefix);
  const v = gateVerdict(before, line, seed);
  expect(v.kind, `«${line}» commits at seed ${seed} (got ${JSON.stringify(v)})`).toBe('commit');
  if (v.kind !== 'commit') throw new Error('unreachable');
  useGeoStore.getState().clear();
  driveThroughGate(prefix);
  const group = `g${useGeoStore.getState().facts.length}`;
  for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
  const after = useGeoStore.getState().facts;
  return { before: replay(before, seed), after: replay(after, seed), facts: after };
}

/** How far the FARTHEST already-drawn point moved when `line` was added. The quantity both issues report. */
function displacement(prefix: string[], line: string, seed: number): number {
  const { before, after } = addLine(prefix, line, seed);
  let max = 0;
  for (const [id, p] of before.positions) {
    const q = after.positions.get(id);
    expect(q, `${id} is still drawn after «${line}»`).toBeDefined();
    if (q) max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return max;
}

/** The engine's own tolerance for "it did not move": the fix returns the PRIOR carrier values, so the
 *  re-solve is the prior figure's and the positions are bit-identical. Scaled by the figure's extent. */
function extent(positions: Map<Id, Vec>): number {
  let s = 1;
  for (const p of positions.values()) s = Math.max(s, Math.abs(p.x), Math.abs(p.y));
  return s;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1943 — «טרפז ישר זווית ABCD» · a right angle it already shows', () => {
  for (const line of ['זווית ADC = 90', 'AD מאונך ל-DC']) {
    it(`«${line}» moves nothing, at every seed`, () => {
      for (const seed of SEEDS) {
        const { before, after } = addLine(['טרפז ישר זווית ABCD'], line, seed);
        const tol = 1e-9 * extent(before.positions);
        for (const [id, p] of before.positions) {
          const q = after.positions.get(id)!;
          expect(Math.hypot(p.x - q.x, p.y - q.y), `${id} at seed ${seed}`).toBeLessThanOrEqual(tol);
        }
      }
    });
  }

  it('the given is RECORDED, green and verified — a no-op in the figure is not a no-op in the record', () => {
    const { after, facts } = addLine(['טרפז ישר זווית ABCD'], 'זווית ADC = 90', 1);
    expect(facts.length).toBeGreaterThan(1);
    expect(after.lastError).toBeNull();
    expect(after.violations).toEqual([]);
    for (const f of facts) expect(after.status[f.id], `«${f.utterance}»`).toBe('ok');
    // The stated 90° is on the figure (the honesty invariant: every stated value is visible).
    expect(after.angleMarks.some((m) => m.vertex === 'D')).toBe(true);
    // And the row is a CHECK the evaluator reads, not a dropped statement.
    const cons = [...allConstraints(after.construction)];
    expect(cons.some((k) => k.type === 'angle' && k.vertex === 'D')).toBe(true);
  });

  it('the freedom the figure never lost is still SAMPLED (ADR-052 / ADR-536)', () => {
    const before = replay(prefixFacts(['טרפז ישר זווית ABCD']), 1);
    const { after } = addLine(['טרפז ישר זווית ABCD'], 'זווית ADC = 90', 1);
    expect(freeDofs(after.construction).sort()).toEqual(freeDofs(before.construction).sort());
  });

  it('a DIFFERENT right angle of the same trapezoid — the unreported sibling — moves nothing either', () => {
    // Measured on `main` @ 06fc51dd: 0.90 / 1.75 / 0.99 / 0.96 at seeds 0–3.
    for (const seed of [0, 1, 2, 3]) expect(displacement(['טרפז ישר זווית ABCD'], 'זווית DAB = 90', seed)).toBeLessThan(1e-9);
  });
});

describe('#1819 — «משולש ABC» · «AB ⟂ BC» · a right angle that restates it', () => {
  it('«זווית ABC = 90» moves nothing, at every seed', () => {
    for (const seed of SEEDS) {
      const { before, after } = addLine(['משולש ABC', 'AB מאונך ל-BC'], 'זווית ABC = 90', seed);
      const tol = 1e-9 * extent(before.positions);
      for (const [id, p] of before.positions) {
        const q = after.positions.get(id)!;
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${id} at seed ${seed}`).toBeLessThanOrEqual(tol);
      }
    }
  });

  it('the 90° still commits and is still drawn (#1346, operator 2026-09-22)', () => {
    const { after, facts } = addLine(['משולש ABC', 'AB מאונך ל-BC'], 'זווית ABC = 90', 0);
    expect(facts.filter((f) => f.utterance === 'זווית ABC = 90').length).toBeGreaterThan(0);
    for (const f of facts) expect(after.status[f.id], `«${f.utterance}»`).toBe('ok');
    expect(after.lastError).toBeNull();
    expect(after.violations).toEqual([]);
    expect(after.angleMarks.some((m) => m.vertex === 'B')).toBe(true);
  });

  it('the same statement in ANOTHER SPELLING — «זווית B = 90» — moves nothing (the class, not the sentence)', () => {
    // Measured on `main` @ 06fc51dd: 2.27 / 3.05 / 3.50 / 2.45 at seeds 0–3.
    for (const seed of [0, 1, 2, 3]) expect(displacement(['משולש ABC', 'AB מאונך ל-BC'], 'זווית B = 90', seed)).toBeLessThan(1e-9);
  });
});

describe('THE FALSE-FREEZE NET — a statement that is NOT already forced still re-seats the figure', () => {
  // Each `before` number is this sequence measured on `main` @ 06fc51dd. The assertion is deliberately
  // one-sided: the fix must not freeze these, and it must not move them FURTHER than today either.
  const MOVERS: [string, string[], string, number[]][] = [
    ['a right angle the triangle does not have', ['משולש ABC'], 'זווית ABC = 90', [4.4598, 4.9894, 5.8535, 3.5289]],
    ['a stated length', ['משולש ABC'], 'AB = 5', [0.3822, 1.8689, 1.2961, 0.6621]],
    ['a stated equality', ['משולש ABC'], 'AB = AC', [1.2635, 1.8629, 2.2388, 1.212]],
    ['a length on a rectangle', ['מלבן ABCD'], 'AB = 5', [1.019, 0.9518, 2.133, 0.1817]],
    ['a diagonal angle on a rectangle', ['מלבן ABCD'], 'זווית ABD = 30', [0.9282, 0.9117, 3.9496, 3.3387]],
  ];
  for (const [what, prefix, line, was] of MOVERS) {
    it(`${what} — «${line}» still moves the figure, and no further than before`, () => {
      was.forEach((expected, seed) => {
        const got = displacement(prefix, line, seed);
        expect(got, `seed ${seed} must still MOVE`).toBeGreaterThan(1e-3);
        expect(got, `seed ${seed} must not move FURTHER than main @ 06fc51dd (${expected})`).toBeLessThanOrEqual(expected * 1.05 + 1e-6);
      });
    });
  }
});

describe('impliedByFigure — the forcing test itself', () => {
  /** The figure `prefix` builds, plus the construction that `line`'s lowered command would add. */
  function newRows(prefix: string[], line: string): { prev: Construction; rows: ReturnType<typeof allConstraints> } {
    const facts = prefixFacts(prefix);
    const prev = replay(facts, 0).construction;
    const symtab = buildSymTab(facts.map((f) => f.cmd));
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `«${line}» parses`).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    let cur = prev;
    for (const c of r.commands.flatMap((cmd) => lowerOne(cmd as never, symtab))) {
      const st = applyStep(cur, c);
      expect(st.ok, `«${line}» applies`).toBe(true);
      if (!st.ok) throw new Error('unreachable');
      cur = st.construction;
    }
    const had = new Set([...allConstraints(prev)].map((k) => JSON.stringify(k)));
    return { prev, rows: new Set([...allConstraints(cur)].filter((k) => !had.has(JSON.stringify(k)))) };
  }

  const verdict = (prefix: string[], line: string): boolean[] => {
    const { prev, rows } = newRows(prefix, line);
    expect([...rows].length, `«${line}» adds a row`).toBeGreaterThan(0);
    const existing = [...allConstraints(prev)];
    return [...rows].map((k) => impliedByFigure(prev, movableIds(prev), existing, k));
  };

  it('«∠ABC = 90» after «AB ⟂ BC» is FORCED — ADR-536’s own pair, read for ownership', () => {
    expect(verdict(['משולש ABC', 'AB מאונך ל-BC'], 'זווית ABC = 90')).toEqual([true]);
  });

  it('«∠ADC = 90» on a right trapezoid is FORCED', () => {
    expect(verdict(['טרפז ישר זווית ABCD'], 'זווית ADC = 90')).toEqual([true]);
  });

  it('«∠ABC = 90» on a plain triangle is NOT forced — it is a genuinely new row', () => {
    expect(verdict(['משולש ABC'], 'זווית ABC = 90')).toEqual([false]);
  });

  it('«AB = 5» on a plain triangle is NOT forced', () => {
    expect(verdict(['משולש ABC'], 'AB = 5')).toEqual([false]);
  });

  it('a figure with nothing movable answers NOT forced (fails closed, never a vacuous true)', () => {
    const empty: Construction = { objects: [], constraints: [] };
    expect(evaluate(empty).ok).toBe(true); // it evaluates — the EMPTY column space is the trap
    expect(movableIds(empty)).toEqual([]);
    expect(impliedByFigure(empty, movableIds(empty), [], { type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 })).toBe(false);
  });

  it('an ORDER constraint is never "forced" — it is a region, not a row (ADR-039)', () => {
    const facts = prefixFacts(['משולש ABC', 'AB מאונך ל-BC']);
    const prev = replay(facts, 0).construction;
    // A row that is trivially true of itself: if the order family were rankable it would read as forced.
    expect(impliedByFigure(prev, movableIds(prev), [...allConstraints(prev)], { type: 'angle-order', v1: 'B', a1: 'A', b1: 'C', v2: 'B', a2: 'A', b2: 'C' })).toBe(false);
  });
});
