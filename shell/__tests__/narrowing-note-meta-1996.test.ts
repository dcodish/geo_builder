/**
 * THE META-LOCK (#1996, docs/28 §5c step 5) — the shared forced-narrowing rows are run against deliberately
 * BROKEN gates, and each check is shown to catch its own defect. A shared suite that passes everything would let
 * all three thin locks go green while the rule is held by nothing.
 */
import { describe, expect, it } from 'vitest';
import { NARROW_ROWS, narrowingFaults, rowFor, type Builder, type NarrowGate, type NarrowRow } from './fixtures/narrowing-note-rows';

/** A conforming gate for builder `b`: every row records and shows exactly its note (a gap row fails, as it does today). */
const conforming = (b: Builder, mutate: (note: string | null, steps: readonly string[]) => string | null = (n) => n): NarrowGate => (steps) => {
  const row = NARROW_ROWS.find((r) => rowFor(r, b)?.steps.join('|') === steps.join('|'));
  if (!row) throw new Error(`no row for ${steps.join(' · ')}`);
  if (row.gap?.[b]) return { recorded: false, notes: [] };
  const n = mutate(rowFor(row, b)!.note, steps);
  return { recorded: true, notes: n === null ? [] : [n] };
};

describe('#1996 — the shared narrowing rows catch a broken gate', () => {
  it('a conforming gate passes, in every builder', async () => {
    for (const b of ['2d', '3d', 'analytic'] as const) expect(await narrowingFaults(conforming(b), b)).toEqual([]);
  });

  it('catches a builder that says nothing (2-D and analytic before #1996)', async () => {
    const faults = await narrowingFaults(() => ({ recorded: true, notes: [] }), '2d');
    expect(faults.join('\n')).toMatch(/«מקבילית ABCD · ABCD חסום במעגל» in 2d: expected/);
    expect(faults.join('\n')).toMatch(/«מקבילית ABCD · AB = BC» in 2d/);
  });

  it('catches 3-D’s old base-derived sentence on a declared isosceles trapezoid (nothing narrowed)', async () => {
    const old = conforming('3d', (n, steps) => (steps.join(' · ') === 'טרפז שווה שוקיים ABCD · ABCD חסום במעגל' ? 'כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל מ־טרפז ל־טרפז שווה שוקיים.' : n));
    expect((await narrowingFaults(old, '3d')).join('\n')).toMatch(/טרפז שווה שוקיים ABCD · ABCD חסום במעגל/);
  });

  it('catches the circle named when a right angle typed first already did it (the #1915 re-attribution)', async () => {
    const circleFirst = conforming('2d', (n, steps) => (steps.join(' · ') === 'מקבילית ABCD · זווית DAB = 90 · ABCD חסום במעגל' ? 'כדי שהמעגל יעבור דרך כל הקודקודים, ABCD הוגבל ממקבילית למלבן — מלבן הוא סוג של מקבילית.' : n));
    expect((await narrowingFaults(circleFirst, '2d')).join('\n')).toMatch(/זווית DAB = 90 · ABCD חסום במעגל/);
  });

  it('catches a note on the typed right angle (card 3) and on numbers alone (card 4)', async () => {
    const eager = conforming('analytic', (n, steps) => n ?? `בגלל הנתון ${steps.at(-1)}, …`);
    const faults = (await narrowingFaults(eager, 'analytic')).join('\n');
    expect(faults).toMatch(/«משולש ABC · זווית C = 90»/);
    expect(faults).toMatch(/«משולש ABC · AB = 3 · BC = 4 · AC = 5»/);
    expect(faults).toMatch(/«משולש שווה צלעות ABC»/); // a noun alone, adjective included
  });

  it('catches the family clause dropped (3-D’s pre-#1996 «מ־X ל־Y.» form)', async () => {
    const bare = conforming('2d', (n) => n?.replace(/ — .*\.$/, '.') ?? null);
    expect((await narrowingFaults(bare, '2d')).length).toBeGreaterThan(5);
  });

  it('catches a refusal of a row the builder must read', async () => {
    const refusing: NarrowGate = (steps) => (steps.length === 1 ? { recorded: false, notes: [] } : conforming('2d')(steps));
    expect((await narrowingFaults(refusing, '2d')).join('\n')).toMatch(/did not record in 2d/);
  });

  it('a known gap that starts passing says "move it" (and a gap still failing says nothing)', async () => {
    // a synthetic gap row — the live rows hold none since ADR-656 closed 2-D's #1914 row
    const gapRow: NarrowRow = { steps: ['ABCD חסום במעגל', 'מקבילית ABCD'], note: NARROW_ROWS[0].note, gap: { '2d': 1914 } };
    const healed: NarrowGate = () => ({ recorded: true, notes: [gapRow.note!] });
    expect(await narrowingFaults(healed, '2d', [gapRow])).toEqual(['«ABCD חסום במעגל · מקבילית ABCD» passes in 2d — the known gap #1914 closed: move it to a plain row']);
    expect(await narrowingFaults(() => ({ recorded: false, notes: [] }), '2d', [gapRow])).toEqual([]);
  });

  it('the rows are not trivial', () => {
    expect(NARROW_ROWS.filter((r) => r.note !== null).length).toBeGreaterThan(15);
    expect(NARROW_ROWS.filter((r) => r.note === null).length).toBeGreaterThan(8);
  });
});
