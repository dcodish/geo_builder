/**
 * #2672 ([ADR-AG-382](../../docs/06c-decisions-analytic.md#adr-ag-382)) — a line constructed through a point is read in
 * every clause order 2-D reads, and with a bare «ו» before its relation word.
 *
 * Measured before (3225756c, `decideSubmit`): «ישר l1 עובר דרך A ומאונך לציר x» (the operator's T14 line), «… ומקביל …»,
 * the anonymous «ישר העובר דרך A ומאונך …» and «דרך A עובר ישר l1 ומאונך …» were `not-handled`; «l1 מאונך לציר ה-x
 * ועובר דרך A» and «ישר l1 מאונך לציר ה-x דרך A» were refused `bad-operand`. Root cause: the relation clause admitted
 * the conjunction «ו» only with an article after it («והמאונך»), and the grammar had no frame for the relation before
 * the point. Every spelling here goes through the real submit decision and lowers to the catalog form's `line-at`.
 */
import { describe, expect, it } from 'vitest';
import { askSettled } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import operator from './fixtures/issue-2672-line-through-and-perp.analytic.json';

const BASE = operator.lines.slice(0, 4);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** the construction a line lowers to, without its source text */
function lineAt(text: string) {
  const r = parseLine(text);
  if (!r.ok) return null;
  return r.facts.filter((f) => f.t === 'line-at').map((f) => ({ ...f, src: undefined }));
}

describe('#2672 — the operator\'s T14 flow', () => {
  it('every line records, and the figure builds green (fixture)', () => {
    const lines = operator.lines;
    for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
    expect(derive(lines, operator.seed).faults).toEqual([]);
  });

  it('«המקום הגיאומטרי של P» answers the ellipse', () => {
    expect(askSettled(derive(operator.lines, operator.seed), 'המקום הגיאומטרי של P', fmt).value).toBe('ellipse · x²/20 + y²/5 = 1');
  });
});

describe('#2672 — the class: every clause order and the bare «ו», named and anonymous, both relations', () => {
  const perpX = lineAt('דרך A עובר ישר l1 מאונך לציר ה-x');
  const parY = lineAt('דרך A עובר ישר l1 מקביל לציר ה-y');
  const anonPerpX = lineAt('דרך A עובר ישר מאונך לציר ה-x');

  it.each<[string, ReturnType<typeof lineAt>]>([
    ['ישר l1 עובר דרך A ומאונך לציר x', perpX],
    ['ישר l1 עובר דרך A ומאונך לציר ה-x', perpX],
    ['הישר l1 עובר דרך A ומאונך לציר ה-x', perpX],
    ['ישר l1 העובר דרך A ומאונך לציר ה-x', perpX],
    ['דרך A עובר ישר l1 ומאונך לציר ה-x', perpX],
    ['l1 מאונך לציר ה-x ועובר דרך A', perpX],
    ['הישר l1 מאונך לציר ה-x ועובר דרך הנקודה A', perpX],
    ['ישר l1 מאונך לציר ה-x דרך A', perpX],
    ['ישר l1 מאונך לציר ה-x העובר דרך A', perpX],
    ['ישר l1 עובר דרך A ומקביל לציר ה-y', parY],
    ['l1 מקביל לציר ה-y ועובר דרך A', parY],
    ['ישר העובר דרך A ומאונך לציר ה-x', anonPerpX],
    ['ישר מאונך לציר ה-x ועובר דרך A', anonPerpX],
    ['line l1 perpendicular to the x-axis through A', perpX],
    ['l1 is perpendicular to the x-axis and passes through A', perpX],
  ])('«%s» records the catalog form\'s line', (text, want) => {
    expect(want).not.toBeNull();
    expect(decideSubmit(text, BASE, 0).kind, text).toBe('record');
    expect(lineAt(text)).toEqual(want);
  });

  it('control — «l1 מאונך לציר ה-x» alone stays the relation rule\'s: no line is created', () => {
    const r = parseLine('l1 מאונך לציר ה-x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.some((f) => f.t === 'line-at')).toBe(false);
  });

  it('control — an existing l1 is never re-created by the relation-first order (refused as the catalog order is)', () => {
    const ctx = ['A(1,2)', 'הישר l1: y=2x+1'];
    const catalog = decideSubmit('דרך A עובר ישר l1 מאונך לציר ה-x', ctx, 0);
    const first = decideSubmit('l1 מאונך לציר ה-x ועובר דרך A', ctx, 0);
    expect(catalog.kind).toBe('refused');
    expect(first.kind).toBe('refused');
    if (first.kind === 'refused' && catalog.kind === 'refused') expect(first.error.key).toBe(catalog.error.key);
  });
});
