/**
 * #2202 phase A ([ADR-W-149](../../docs/06w-decisions-workspace.md#adr-w-149)) — ONE QUOTE STYLE for a quoted value, in
 * every builder's Hebrew; and in its English since #2241 ([ADR-W-150](../../docs/06w-decisions-workspace.md#adr-w-150)).
 *
 * Operator ruling 2026-10-16 (ballot card 8, row d2202-d1): *"A — «…» everywhere"*. A Hebrew message that quotes
 * what the student typed (a refusal's `{{detail}}`, a notice's `{{line}}`) puts it in «…». Before the ruling the
 * four tables had each chosen their own: 2-D mixed both, analytic and complex used "…" almost throughout, 3-D «…».
 * There was no single statement of the convention, so each new message picked one — the #2201 class (one decision,
 * N copies) over a convention instead of a string.
 *
 * The lock is about the CLASS: in every table (the four builders' own and the suite file, Hebrew and English), no
 * straight double-quoted span holds an interpolation, and an interpolated message carries no unpaired straight
 * quote that could hide one. A message that quotes only fixed words (`"מעל"`) is outside the ruling and is not
 * asserted.
 *
 * English joined on 2026-10-16 (decisions round 3, card g2241-accept: *"the English versions … follow the Hebrew
 * rulings"*): before it, 2-D, analytic and complex English quoted a value with "…" in 137 messages, while the same
 * tables already used «…» in others, so one message read differently by builder and by locale.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTS, productTable, suiteTable, type Lang, type Table } from './fixtures/locale-tables';

/** The straight-quote faults of one Hebrew table: a paired "…" span around `{{…}}`, or an odd quote count. */
function straightQuotedValues(name: string, table: Table): string[] {
  const faults: string[] = [];
  for (const [k, v] of Object.entries(table)) {
    if (!v.includes('{{') || !v.includes('"')) continue;
    const at = [...v.matchAll(/"/g)].map((m) => m.index!);
    if (at.length % 2) {
      faults.push(`${name} ${k}: an unpaired straight quote in a message that inserts a value: ${v}`);
      continue;
    }
    for (let i = 0; i < at.length; i += 2) {
      const span = v.slice(at[i], at[i + 1] + 1);
      if (span.includes('{{')) faults.push(`${name} ${k}: ${span} — a quoted value goes in «…»`);
    }
  }
  return faults;
}

const tablesOf = (lang: Lang): Record<string, Table> => ({
  ...Object.fromEntries(PRODUCTS.map((p) => [p, productTable(p, lang)])),
  suite: suiteTable(lang),
});
const tables = tablesOf('he');
const english = tablesOf('en');

describe('#2202 d1 — a quoted value is «…» in every Hebrew table', () => {
  it('no straight-quoted span holds an inserted value, in any builder', () => {
    expect(Object.entries(tables).flatMap(([name, t]) => straightQuotedValues(name, t))).toEqual([]);
  });

  it('the reader is not vacuous: it reads the «…»-quoted values the ruling produced, in every builder', () => {
    const count = (t: Table) => Object.values(t).reduce((n, v) => n + (v.match(/«[^«»]*\{\{[^«»]*»/g) ?? []).length, 0);
    // measured at landing: 2-D 94, 3-D 70, complex 24, analytic 112 (120 messages converted by #2202)
    expect(count(tables['2d'])).toBeGreaterThanOrEqual(90);
    expect(count(tables['3d'])).toBeGreaterThanOrEqual(65);
    expect(count(tables.complex)).toBeGreaterThanOrEqual(20);
    expect(count(tables.analytic)).toBeGreaterThanOrEqual(105);
  });

  it('#2241: English follows the ruling — no straight-quoted span holds an inserted value, in any builder', () => {
    expect(Object.entries(english).flatMap(([name, t]) => straightQuotedValues(`${name} en`, t))).toEqual([]);
  });

  it('#2241: the English reader is not vacuous either', () => {
    const count = (t: Table) => Object.values(t).reduce((n, v) => n + (v.match(/«[^«»]*\{\{[^«»]*»/g) ?? []).length, 0);
    // measured at landing: 2-D 94, 3-D 71, complex 24, analytic 115 (137 messages converted by #2241)
    expect(count(english['2d'])).toBeGreaterThanOrEqual(90);
    expect(count(english['3d'])).toBeGreaterThanOrEqual(65);
    expect(count(english.complex)).toBeGreaterThanOrEqual(20);
    expect(count(english.analytic)).toBeGreaterThanOrEqual(105);
  });

  it('the lock bites: a straight-quoted value, an unpaired quote — and NOT a quoted fixed word', () => {
    expect(straightQuotedValues('stub', { a: 'לא הבנתי: "{{detail}}"' })).toHaveLength(1);
    expect(straightQuotedValues('stub', { a: 'בשורה "{{detail}}" ו"{{other}}"' })).toHaveLength(2);
    expect(straightQuotedValues('stub', { a: 'ד"ר {{name}}' })).toHaveLength(1);
    expect(straightQuotedValues('stub', { a: 'המישור {{id}} אנכי — אין לו "מעל" ו"מתחת"' })).toEqual([]);
    expect(straightQuotedValues('stub', { a: 'לא הבנתי: «{{detail}}»' })).toEqual([]);
    expect(straightQuotedValues('stub', { a: 'I could not understand the statement: "{{detail}}"' })).toHaveLength(1);
  });
});
