/**
 * #1867 ([ADR-634](../../docs/06-decisions.md#adr-634)) — a quantity the givens fix to exactly TWO values shows both, in
 * the 2-D data panel and in the answer to a question.
 *
 * Operator rulings: B12 (2026-10-07) every builder shows both values, joined by «או»; #1861 *"up to 2. if there are 3
 * and more, dont show options and the user can switch between configs"*; W1 (2026-10-08) «x = ±a» when the two are
 * opposites, otherwise «x = a או x = b».
 *
 * Measured before (main 403efe66): the SSA triangle «משולש ABC · AB = 5 · BC = 4 · זווית BAC = 40» has two triangles
 * (AC = 6.21 or 1.45); the panel printed only the three stated values and every question answered «undetermined».
 * The figure's determinacy is `{ determined: true, configurations: 2, stable: false, complete: true }` — so the gate
 * is the COMPLETE admissible set, never the configuration count's `stable`.
 *
 * The figure locks run the real parse → replay path and the panel's own `computeValues`; the gate's edges (three
 * values, a stray value seen at one seed, an incomplete pool) are driven through `computeValuesPanel` directly.
 */
import { describe, expect, it } from 'vitest';
import { computeValues } from '@/replay/core';
import { computeValuesPanel, valueText, type ValueRow } from '@/engine/valuesPanel';
import { parseValueQuery } from '@/parser/valueQuery';
import { buildParseCtx, parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { Id, Vec } from '@/engine/types';

const factsFrom = (utterances: string[]): Fact[] => {
  const facts: Fact[] = [];
  utterances.forEach((u, g) => {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
  });
  return facts;
};
const QUESTIONS = ['AC', 'זווית ACB', 'זווית ABC'];
const panel = (steps: string[]) => computeValues(factsFrom(steps), QUESTIONS.map((text) => ({ text, q: parseValueQuery(text) })));
/** a row as the panel prints it: «label = answer», under the W1 spelling */
const line = (r: { label: string | null; value: number | null } & Parameters<typeof valueText>[0]) =>
  `${r.label} = ${valueText(r, { or: 'או', label: r.label ?? '' })}`;

const SSA = ['משולש ABC', 'AB = 5', 'BC = 4', 'זווית BAC = 40'];

describe('#1867 — the SSA triangle lists its two triangles', () => {
  it('the derived rows print both values, joined by «או»', () => {
    const rows = panel(SSA).rows.map(line);
    expect(rows).toContain('AC = 1.45 או AC = 6.21');
    expect(rows).toContain('∠ABC = 13.46 או ∠ABC = 86.54');
    expect(rows).toContain('∠BCA = 53.46 או ∠BCA = 126.54');
    // the stated values are unchanged
    expect(rows).toEqual(expect.arrayContaining(['AB = 5', 'BC = 4', '∠CAB = 40']));
  });

  it('the questions answer both values, as the rows do (an angle answers in degrees, never a radical)', () => {
    const q = panel(SSA).queryRows;
    expect(q.map((r) => r.note)).toEqual([undefined, undefined, undefined]);
    expect(q.map((r) => line({ ...r, value: r.value! }))).toEqual([
      'AC = 1.45 או AC = 6.21',
      '∠ACB = 53.46 או ∠ACB = 126.54',
      '∠ABC = 13.46 או ∠ABC = 86.54',
    ]);
  });

  it('the one-triangle control (AB = 4, BC = 5) is unchanged: one value each', () => {
    const p = panel(['משולש ABC', 'AB = 4', 'BC = 5', 'זווית BAC = 40']);
    expect(p.rows.map(line)).toContain('AC = 7.35');
    expect(p.queryRows.map((r) => line({ ...r, value: r.value! }))).toEqual(['AC = 7.35', '∠ACB = 30.95', '∠ABC = 109.05']);
    expect(p.rows.some((r) => r.or || r.pm)).toBe(false);
  });

  it('English reads «or»', () => {
    const ac = panel(SSA).rows.find((r) => r.label === 'AC')!;
    expect(valueText(ac, { or: 'or', label: 'AC' })).toBe('1.45 or AC = 6.21');
  });
});

describe('#1867 — the gate: two values over a COMPLETE set, each seen at two seeds', () => {
  const c = replay(factsFrom(['משולש ABC'])).construction;
  /** a pool whose apex C sits at the given points (A, B fixed), one sample per entry */
  const pool = (apexes: Vec[]): Map<Id, Vec>[] =>
    apexes.map((C) => new Map<Id, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 4, y: 0 }], ['C', C]]));
  const angleA = (samples: Map<Id, Vec>[], opts: { determined?: boolean; complete?: boolean; seedOf?: number[] } = {}) =>
    computeValuesPanel([c], samples, samples.map(() => new Map()), null, null, [], [], opts.determined ?? true, opts.complete ?? true, opts.seedOf)
      .rows.find((r: ValueRow) => r.label === '∠CAB' || r.label === '∠BAC');
  const P = { x: 1, y: 1 }; // ∠A = 45°
  const Q = { x: 0, y: 2 }; // ∠A = 90°
  const R = { x: -1, y: 1 }; // ∠A = 135°

  it('two values, each at ≥ 2 seeds → both', () => {
    const r = angleA(pool([P, Q, P, Q]));
    expect(r && valueText(r, { or: 'או', label: '∠A' })).toBe('45 או ∠A = 90');
  });

  it('three values → no value (#1861)', () => {
    expect(angleA(pool([P, Q, R, P, Q, R]))).toBeUndefined();
  });

  it('a value seen at ONE seed only is a stray sample, never an option', () => {
    expect(angleA(pool([P, P, P, Q]), { seedOf: [0, 1, 2, 3] })).toBeUndefined();
    // the same value at two samples of ONE seed is still one seed
    expect(angleA(pool([P, P, Q, Q]), { seedOf: [0, 1, 2, 2] })).toBeUndefined();
    expect(angleA(pool([P, P, Q, Q]), { seedOf: [0, 1, 2, 3] })).toBeDefined();
  });

  it('a pool that is not the complete admissible set never lists', () => {
    expect(angleA(pool([P, Q, P, Q]), { complete: false })).toBeUndefined();
    expect(angleA(pool([P, Q, P, Q]), { determined: false })).toBeUndefined();
  });
});
