/**
 * THE META-LOCK (#2169 / #2171 / #2180, ADR-W-131; docs/28 §5c step 5) — the shared two-noun rows are run against
 * deliberately BROKEN gates (each one a defect a builder had at ef78f15c), and each is shown to be caught. A shared
 * suite that passed everything would let all three thin locks go green while the rule is held by nothing.
 */
import { describe, expect, it } from 'vitest';
import { QUAD_NOUN_ROWS, pairFaults, stepsOf, type Builder, type PairGate, type PairRow, type PairVerdict } from './fixtures/quad-noun-pairs';
import { kindRelation, type NarrowKind } from '../narrowing';

const rowOf = (steps: readonly string[]): PairRow => {
  const row = QUAD_NOUN_ROWS.find((r) => stepsOf(r).join('|') === steps.join('|'));
  if (!row) throw new Error(`no row for ${steps.join(' · ')}`);
  return row;
};

/** A conforming gate for builder `b` (a gap row answers wrongly, as it does today); `mutate` breaks one verdict. */
const conforming = (b: Builder, mutate: (v: PairVerdict, steps: readonly string[]) => PairVerdict = (v) => v): PairGate => (steps) => {
  const row = rowOf(steps);
  const v: PairVerdict = { last: row.last, ...(row.refusal ? { refusal: row.refusal } : {}), notes: [...(row.notes ?? [])], earlierAccepted: true };
  if (row.gap?.[b]) return { ...v, last: 'refused', refusal: 'gap' };
  return mutate(v, steps);
};
const is = (steps: readonly string[], ...nouns: string[]) => steps.join(' · ') === nouns.map((n) => `${n} ABCD`).join(' · ');

describe('#2169 — the shared two-noun rows catch a broken gate', () => {
  it('a conforming gate passes, in every builder', async () => {
    for (const b of ['2d', '3d', 'analytic'] as const) expect(await pairFaults(conforming(b), b)).toEqual([]);
  });

  it('catches analytic drawing a kite over a trapezoid (D1, the P1)', async () => {
    const old = conforming('analytic', (v, s) => (is(s, 'דלתון', 'טרפז') ? { last: 'refines', notes: [], earlierAccepted: true } : v));
    expect((await pairFaults(old, 'analytic')).join('\n')).toMatch(/«דלתון ABCD · טרפז ABCD» in analytic: last line refines, expected refused/);
  });

  it('catches a second row for an implied noun (D2 — the `builds` verdict could not)', async () => {
    const old = conforming('analytic', (v, s) => (is(s, 'ריבוע', 'דלתון') ? { ...v, last: 'refines' } : v));
    expect((await pairFaults(old, 'analytic')).join('\n')).toMatch(/«ריבוע ABCD · דלתון ABCD» in analytic: last line refines, expected restates/);
  });

  it('catches a silent sibling pair (D3)', async () => {
    const old = conforming('3d', (v, s) => (is(s, 'מלבן', 'מעוין') ? { ...v, notes: [] } : v));
    expect((await pairFaults(old, '3d')).join('\n')).toMatch(/«מלבן ABCD · מעוין ABCD» in 3d: notes \[\]/);
  });

  it('catches 3-D’s false «adds nothing» on a narrowing adjective (D4)', async () => {
    const old = conforming('3d', (v, s) => (is(s, 'טרפז', 'טרפז שווה שוקיים') ? { ...v, notes: ['already-known: ABCD'] } : v));
    expect((await pairFaults(old, '3d')).join('\n')).toMatch(/«טרפז ABCD · טרפז שווה שוקיים ABCD» in 3d: notes/);
  });

  it('catches the isosceles + right trapezoid drawn as a rectangle (D5), and the adjective dropped from a refusal', async () => {
    const drawn = conforming('2d', (v, s) => (is(s, 'טרפז שווה שוקיים', 'טרפז ישר זווית') ? { last: 'refines', notes: [], earlierAccepted: true } : v));
    expect((await pairFaults(drawn, '2d')).join('\n')).toMatch(/«טרפז שווה שוקיים ABCD · טרפז ישר זווית ABCD» in 2d: last line refines/);
    const bare = conforming('3d', (v) => (v.refusal ? { ...v, refusal: v.refusal.replace(/טרפז (שווה שוקיים|ישר זווית)/g, 'טרפז') } : v));
    expect((await pairFaults(bare, '3d')).length).toBeGreaterThan(10);
  });

  it('catches a third noun recorded after a sibling merge (#2180)', async () => {
    const old = conforming('3d', (v, s) => (is(s, 'מלבן', 'מעוין', 'ריבוע') ? { ...v, last: 'refines' } : v));
    expect((await pairFaults(old, '3d')).join('\n')).toMatch(/«מלבן ABCD · מעוין ABCD · ריבוע ABCD» in 3d/);
  });

  it('a known gap that starts passing says "move it"', async () => {
    // The shared rows carry no gap since #2193 closed 2-D's (ADR-711); the mechanism is held on a synthetic row.
    const gapped: PairRow[] = [{ ...rowOf(['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD']), gap: { '2d': 2193 } }];
    const healed: PairGate = (steps) => {
      const row = rowOf(steps);
      return { last: row.last, ...(row.refusal ? { refusal: row.refusal } : {}), notes: [...(row.notes ?? [])], earlierAccepted: true };
    };
    expect((await pairFaults(healed, '2d', gapped)).join('\n')).toMatch(/known gap #2193 closed: move it/);
    // …and a gap row that still fails is not a fault
    expect(await pairFaults(conforming('2d', (v) => ({ ...v, last: 'refused', refusal: 'gap' })), '2d', gapped)).toEqual([]);
  });
});

describe('#2169 — the rows are measured answers, and they agree with the lattice they lock (not derived from it)', () => {
  const KIND: Record<string, NarrowKind> = {
    מרובע: 'quadrilateral', ריבוע: 'square', מלבן: 'rectangle', מעוין: 'rhombus', מקבילית: 'parallelogram', דלתון: 'kite',
    טרפז: 'trapezoid', 'טרפז שווה שוקיים': 'isosceles-trapezoid', 'טרפז ישר זווית': 'right-trapezoid',
  };
  it('every ordered pair of the nine nouns is a row, and refused exactly when the lattice says the two exclude', () => {
    const pairs = QUAD_NOUN_ROWS.filter((r) => r.nouns.length === 2);
    expect(pairs).toHaveLength(81);
    for (const r of pairs) expect(r.last === 'refused', r.nouns.join(' · ')).toBe(kindRelation(KIND[r.nouns[0]], KIND[r.nouns[1]]) === 'excludes');
  });
});
