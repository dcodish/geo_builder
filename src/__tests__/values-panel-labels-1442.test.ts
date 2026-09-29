/**
 * #1442 ([ADR-552](../../docs/06-decisions.md#adr-552)) — THE VALUES PANEL NAMES ONLY WHAT THE STUDENT CAN SEE.
 *
 * External review of prod: «רדיוס @ctr-O», «שטח (~tanmid-OE)». The radii loop iterated EVERY circle —
 * hidden scaffolding included — and labelled each by its centre id, which for an ADR-342 unnamed circle is
 * the anonymous `@ctr-O`. The fix names circles through one seam (`circleRefs`, worded by `valueRowText`).
 *
 * The CLASS lock runs the real `computeValues` → `valueRowText` (Hebrew locale) over the issue's sequences
 * AND every saved fixture, and holds each rendered label to the workspace student-text check
 * (`studentFacingViolations`, ADR-W-096): no id-shaped token, no letter the student neither typed nor can
 * see. It counts what it checked, so it cannot pass by checking nothing.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { computeValues } from '@/replay/core';
import { circleRefs, emptyConstruction, applyCommand, isGeoPoint } from '@/engine';
import type { Construction, ValueRow } from '@/engine';
import { valueRowText } from '@/render/valueRowText';
import { deserializeFigure } from '@/store/figureFile';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { studentFacingViolations } from '../../shell/studentText';
import { factsOf } from './scenarios-harness';

const tHe = i18n.getFixedT('he');
/** The rendered label, with the bidi post-processor's isolate marks (#464) removed for comparison. */
const text = (r: ValueRow): string => valueRowText(r, (k, p) => tHe(k, p) as string).replace(/[\u2066-\u2069]/g, '');
const CIRCLE_KINDS = new Set(['radius', 'area', 'perimeter']);
const circleRows = (rows: ValueRow[]) => rows.filter((r) => CIRCLE_KINDS.has(r.kind) && r.circle);

/** The issue's measured sequences (main 7234e7be). */
const ISSUE_SEQUENCES: string[][] = [
  ['מעגל ברדיוס 3'],
  ['משולש ABC חסום במעגל', 'AB=6', 'BC=8', 'AC=10'],
  ['משולש שווה צלעות ABC', 'AB=6', 'מעגל חסום במשולש ABC'],
  ['שני מעגלים נחתכים', 'רדיוס מעגל O הוא 3'],
  ['מעגל O ברדיוס 5', 'משיק מנקודה E למעגל', 'OE=13'],
];

const build = (cmds: Parameters<typeof applyCommand>[1][]): Construction =>
  cmds.reduce((c, cmd) => applyCommand(c, cmd), emptyConstruction());

describe('circleRefs — how a surface names a circle (#1442)', () => {
  it('a circle whose centre the student sees is named by that letter', () => {
    const c = build([{ type: 'circle', id: 'circle-O', center: 'O', radius: 3 }]);
    expect(circleRefs(c).get('circle-O')).toEqual({ via: 'centre', name: 'O' });
  });
  it('the only circle, with an anonymous centre, is «the circle»', () => {
    const c = build([{ type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 3, autoCenter: true }]);
    expect(circleRefs(c).get('circle-O')).toEqual({ via: 'sole' });
  });
  it('one of several anonymous-centre circles is named by its ADR-342 token', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 3, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: '@ctr-P', radius: 2, autoCenter: true },
    ]);
    expect(circleRefs(c).get('circle-O')).toEqual({ via: 'token', name: 'O' });
    expect(circleRefs(c).get('circle-P')).toEqual({ via: 'token', name: 'P' });
  });
  it('a hidden circle has no reference, and does not count toward «the only circle»', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 3, autoCenter: true },
      { type: 'circle', id: 'tanaux-OE', center: 'Q', radius: 2, hidden: true },
    ]);
    const refs = circleRefs(c);
    expect(refs.has('tanaux-OE')).toBe(false);
    expect(refs.get('circle-O')).toEqual({ via: 'sole' });
  });
});

describe('valueRowText — the words (#1442)', () => {
  const row = (kind: ValueRow['kind'], label: string, circle?: ValueRow['circle']): ValueRow =>
    ({ kind, ids: [], label, value: 1, exact: null, stated: false, ...(circle ? { circle } : {}) });
  it('keeps the ADR-410 wording for a named centre', () => {
    expect(text(row('radius', 'O', { via: 'centre', name: 'O' }))).toContain('רדיוס O');
    expect(text(row('area', '(O)', { via: 'centre', name: 'O' }))).toContain('שטח (O)');
  });
  it('«the circle» for the sole unnamed circle, «circle O» by token', () => {
    expect(text(row('radius', '', { via: 'sole' }))).toBe('רדיוס המעגל');
    expect(text(row('perimeter', '', { via: 'sole' }))).toBe('היקף המעגל');
    expect(text(row('area', 'P', { via: 'token', name: 'P' }))).toContain('שטח מעגל');
  });
});

describe("the issue's sequences (#1442)", () => {
  const rowsOf = (steps: string[]) => computeValues(factsOf(steps)).rows;
  it('«מעגל ברדיוס 3» — the radius, area and circumference of «the circle»', () => {
    const rows = circleRows(rowsOf(['מעגל ברדיוס 3']));
    expect(rows.map(text)).toEqual(['רדיוס המעגל', 'שטח המעגל', 'היקף המעגל']);
    expect(rows[0].value).toBeCloseTo(3, 6);
  });
  it('two unnamed circles — each by its reference token', () => {
    const rows = circleRows(rowsOf(['שני מעגלים נחתכים', 'רדיוס מעגל O הוא 3']));
    const radius = rows.find((r) => r.kind === 'radius');
    expect(radius && text(radius)).toMatch(/^רדיוס מעגל .*O/);
    expect(radius?.value).toBeCloseTo(3, 6);
  });
  it('a tangent from E — the hidden Thales circle prints NO row; circle O prints once', () => {
    const rows = circleRows(rowsOf(['מעגל O ברדיוס 5', 'משיק מנקודה E למעגל', 'OE=13']));
    expect(rows.filter((r) => r.kind === 'radius').map((r) => [text(r), r.value.toFixed(2)])).toEqual([[expect.stringContaining('רדיוס O'), '5.00']]);
    expect(rows).toHaveLength(3);
  });
});

/** Every name the figure shows: its visible points, plus the ADR-342 circle tokens «הצג מרכזים» draws. */
function vocabOf(facts: Fact[]): { typed: string; names: string[] } {
  const { construction } = replay(facts, 0);
  const names = construction.objects.filter((o) => isGeoPoint(o) && !/^[~@]/.test(o.id)).map((o) => o.id);
  for (const r of circleRefs(construction).values()) if (r.via === 'token') names.push(r.name);
  return { typed: facts.map((f) => f.utterance ?? '').join(' '), names };
}

describe('CLASS LOCK — no values-panel label names an internal id (#1442)', () => {
  const fixtures = import.meta.glob('./fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  const cases: [string, () => Fact[]][] = [
    ...ISSUE_SEQUENCES.map((s) => [s.join(' · '), () => factsOf(s)] as [string, () => Fact[]]),
    ...Object.entries(fixtures).map(([file, raw]) => [file, () => {
      const r = deserializeFigure(raw);
      if (!r.ok) throw new Error(`fixture refused: ${file}`);
      return r.file.facts;
    }] as [string, () => Fact[]]),
  ];

  it('every rendered row label passes the student-text check', () => {
    let checked = 0;
    let circleChecked = 0;
    const violations: string[] = [];
    for (const [name, get] of cases) {
      const facts = get();
      const rows = computeValues(facts).rows;
      const texts = rows.map(text);
      checked += texts.length;
      circleChecked += circleRows(rows).length;
      for (const v of studentFacingViolations(texts, vocabOf(facts))) violations.push(`${name}: ${v}`);
      for (const tx of texts) if (/[~@]/.test(tx)) violations.push(`${name}: «${tx}»`);
    }
    expect(violations).toEqual([]);
    // exercised-counter: the lock must have read real circle rows, or it passes by checking nothing
    expect(circleChecked).toBeGreaterThanOrEqual(12);
    expect(checked).toBeGreaterThan(circleChecked);
  }, 300_000);
});
