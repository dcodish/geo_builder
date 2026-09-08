/**
 * #929 (ADR-485) — A LETTER THE STUDENT NAMED IS A QUANTITY: printed when the figure determines it,
 * askable by name.
 *
 * Operator, playing round #927 (T9): *"basically working but i played a bit more and see screenshot.
 * the data panel should know what x is."* On
 *
 *   משולש ABC · AB = 3x · AC = x · BC=10 · ∠BAC = 120
 *
 * the panel listed AB = 8.32, AC = 2.77, BC = 10 and the angles, and never said **x = 2.77** — though
 * the cosine rule determines it (13x² = 100, so x = 10/√13). Asking «x» answered *"not recognised"*.
 *
 * The letter was first-class to the LOWERING (ADR-031's symbol table) and to the UNIT lane (#427), and
 * was a quantity in neither the panel nor the ask lane: both grammars were built around named OBJECTS
 * (a segment, a wedge, a polygon), and a named UNKNOWN was in neither. One symbol lane now feeds both
 * seams (docs/17 §3 — no second enumeration, M3 — one sample pool).
 *
 * The class is *"a letter the student named"*, not "print x on this triangle": a letter bound by an
 * ANGLE, a letter bound by two segments, two letters at once, and a letter the student VALUED are all
 * the same quantity kind, and each has a case below.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { computeValues } from '@/replay/core';
import { parseValueQuery } from '@/parser/valueQuery';
import type { ValueRow } from '@/engine/valuesPanel';

const panel = (steps: string[], asks: string[] = []) =>
  computeValues(factsOf(steps), asks.map((text) => ({ text, q: parseValueQuery(text) })));

const symbolRow = (rows: ValueRow[], sym: string) => rows.find((r) => r.kind === 'symbol' && r.label === sym);
const OPERATOR = ['משולש ABC', 'AB = 3x', 'AC = x', 'BC=10', '∠BAC = 120'];

describe('#929 — the operator’s figure', () => {
  it('prints «x = 2.77» as a נגזר row, and it is the cosine rule’s answer', () => {
    const r = panel(OPERATOR);
    const x = symbolRow(r.rows, 'x');
    expect(x, 'no symbol row for x').toBeDefined();
    // 13x² = 100 ⇒ x = 10/√13 = 2.7735…, and the panel's own AC row must agree with it.
    expect(x!.value).toBeCloseTo(10 / Math.sqrt(13), 4);
    expect(x!.stated).toBe(false); // נגזר — the figure forced it, the student did not say it
    expect(r.rows.find((y) => y.kind === 'length' && y.label === 'AC')!.value).toBeCloseTo(x!.value, 6);
  });

  it('and «x» is askable, answering the same number the row prints', () => {
    const r = panel(OPERATOR, ['x']);
    const [q] = r.queryRows;
    expect(q.kind).toBe('var');
    expect(q.note ?? null).toBeNull();
    expect(q.value).toBeCloseTo(10 / Math.sqrt(13), 4);
  });
});

describe('#929 — the scale discipline is unchanged (ADR-052/#426)', () => {
  const FREE = ['משולש ABC', 'AB = 3x', 'AC = x', '∠BAC = 120'];

  it('under a free gauge the letter IS the unit, so no number is printed and the ask says why', () => {
    const r = panel(FREE, ['x']);
    // Printing x = 1.94 here would assert the drawing's own scale as a given — the whole point of #426.
    expect(symbolRow(r.rows, 'x')).toBeUndefined();
    expect(r.queryRows[0].note).toBe('scale');
  });

  it('the #427 unit-lane rows are BYTE-UNCHANGED by this feature', () => {
    // The guard that this is an addition, not a rewrite: every length still reports as a multiple of x.
    const lens = panel(FREE).rows.filter((r) => r.kind === 'length');
    expect(lens.map((r) => r.label).sort()).toEqual(['AB', 'AC', 'BC']);
    expect(lens.every((r) => r.unit?.sym === 'x')).toBe(true);
    expect(lens.find((r) => r.label === 'AB')!.unit!.coef).toBeCloseTo(3, 6);
    expect(lens.find((r) => r.label === 'AC')!.unit!.coef).toBeCloseTo(1, 6);
  });
});

describe('#929 — the class, beyond the reported figure', () => {
  it('a VALUED letter is a נתון row and answers its own value', () => {
    const r = panel(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4'], ['x']);
    const x = symbolRow(r.rows, 'x');
    expect(x!.value).toBeCloseTo(4, 9);
    expect(x!.stated).toBe(true); // נתון — the student said it
    expect(r.queryRows[0].value).toBeCloseTo(4, 9);
  });

  it('TWO letters are two quantities — the unit lane’s single-symbol rule does not apply here', () => {
    // `declaredLengthUnit` deliberately returns null for two symbols (expressing CD as 1.5a would be
    // arithmetic the student never wrote). A QUANTITY has no such restriction, and this is the case
    // that proves the symbol lane is a separate reading of the same table rather than a reuse of it.
    const r = panel(['ריבוע ABCD', 'AB = 3x', 'AC = 2y', 'BC = 6'], ['x', 'y']);
    expect(symbolRow(r.rows, 'x')!.value).toBeCloseTo(2, 4);
    expect(symbolRow(r.rows, 'y')!.value).toBeCloseTo((6 * Math.SQRT2) / 2, 4);
    expect(r.queryRows.map((q) => q.note ?? null)).toEqual([null, null]);
  });

  it('an ANGLE letter is scale-free: it prints whenever the shape is determined', () => {
    const r = panel(['משולש ABC', '∠ABC = α', '∠BCA = 50', '∠CAB = 60'], ['α']);
    const a = symbolRow(r.rows, 'α');
    expect(a!.value).toBeCloseTo(70, 6); // 180 − 50 − 60
    expect(a!.stated).toBe(false);
    expect(r.queryRows[0].value).toBeCloseTo(70, 6);
  });

  it('a letter the figure never mentions is still «not understood»', () => {
    const r = panel(['משולש ABC', 'AB = 5'], ['x']);
    expect(symbolRow(r.rows, 'x')).toBeUndefined();
    // It is not a quantity HERE, which is the truth — and it is the pre-#929 answer, unchanged.
    expect(r.queryRows[0].note).toBe('not-understood');
  });

  it('the var rule cannot swallow the named forms it is tried after', () => {
    expect(parseValueQuery('AB')).toEqual({ kind: 'length', a: 'A', b: 'B' });
    expect(parseValueQuery('שטח ABC')).toEqual({ kind: 'area', ids: ['A', 'B', 'C'] });
    expect(parseValueQuery('∠ABC')).toEqual({ kind: 'angle', vertex: 'B', ray1: 'A', ray2: 'C' });
    expect(parseValueQuery('x')).toEqual({ kind: 'var', name: 'x' });
    expect(parseValueQuery('α')).toEqual({ kind: 'var', name: 'α' });
    expect(parseValueQuery('x1')).toEqual({ kind: 'var', name: 'x1' });
  });
});
