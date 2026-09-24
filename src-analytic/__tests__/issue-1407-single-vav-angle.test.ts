/**
 * #1407 arm 1 ([ADR-AG-155](../../docs/06c-decisions-analytic.md#adr-ag-155)) — THE DEFECTIVE SPELLING
 * «זוית» IS THE ANGLE NOUN HERE TOO.
 *
 * Operator, 2026-09-24, playing round #1397 T19: *"writing זוית C=200 is not recognized"*. Measured at
 * eef9dda4 after «משולש ABC»: «זווית ABC=200» was refused `unsatisfiable`, but «זוית ABC=200» and even
 * «זוית C ישרה» were `not-handled` — every Hebrew angle pattern in analytic spelled the word with the
 * double vav, while 2-D has read both since #244 (`זו?וי`, the ADR-3D-032 vav class).
 *
 * The fix is one stem, `ANGLE_STEM_HE`, composed by every angle pattern. The lock is EQUIVALENCE: each
 * single-vav line must lower to what its double-vav twin lowers to, so the spelling can never drift
 * into a second meaning. Arm 2 (a one-letter NUMERIC angle, «זווית C = 60») is a separate feature and is
 * NOT asserted here.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, reachesFallback } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { normalizeShapeNoun, shapeRow } from '../engine/shapes';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const TRI = ['משולש ABC'];
const lowered = (line: string) => {
  const r = parseLine(line);
  expect(r.ok, `${line} did not parse`).toBe(true);
  return r.ok ? r.facts.map(({ src: _src, ...rest }) => rest) : [];
};

describe('#1407 — the issue\'s table, both spellings, through the real submit gate', () => {
  it.each(['זווית ABC=200', 'זוית ABC=200'])('«%s» after «משולש ABC» is refused as unsatisfiable, never escalated', (line) => {
    const v = decideSubmit(line, TRI, 0);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('unsatisfiable');
    expect(reachesFallback(v)).toBe(false);
  });

  it.each(['זווית C ישרה', 'זוית C ישרה'])('«%s» after «משולש ABC» is accepted', (line) => {
    const v = decideSubmit(line, TRI, 0);
    expect(v.kind).toBe('record');
    expect(reachesFallback(v)).toBe(false);
  });
});

describe('#1407 — every angle rule reads «זוית» exactly as it reads «זווית»', () => {
  it.each([
    ['זוית ABC ישרה', 'זווית ABC ישרה'],
    ['זוית C ישרה', 'זווית C ישרה'],
    ['הזוית ABC ישרה', 'הזווית ABC ישרה'],
    ['זוית ABC = 60', 'זווית ABC = 60'],
    ['זוית ABC היא 40', 'זווית ABC היא 40'],
    ['זוית ABC = זוית ACB', 'זווית ABC = זווית ACB'],
    ['זוית ABC שווה לזוית ACB', 'זווית ABC שווה לזווית ACB'],
    ['∠ABC = 2זוית ACB', '∠ABC = 2זווית ACB'],
    ['O מפגש חוצי הזויות במשולש ABC', 'O מפגש חוצי הזוויות במשולש ABC'],
    ['משולש ישר-זוית ABC', 'משולש ישר-זווית ABC'],
    ['טרפז ישר זוית ABCD', 'טרפז ישר זווית ABCD'],
  ])('«%s» lowers to what «%s» lowers to', (single, double) => {
    expect(lowered(single)).toEqual(lowered(double));
  });

  it('the single-vav right angle builds the same figure as the double-vav one', () => {
    const pts = (line: string) => {
      const d = derive([...TRI, line], 0);
      expect(d.faults, line).toEqual([]);
      return d.figure.points.map((p) => [p.id, +p.x.toFixed(9), +p.y.toFixed(9)]);
    };
    expect(pts('זוית C ישרה')).toEqual(pts('זווית C ישרה'));
  });

  it('the question lane reads it too — «הזוית בין AB לציר ה-x» is the #1322 question, not unreadable', () => {
    const d = derive(['משולש ABC', 'הקטע AB'], 0);
    const fmt = (v: number) => v.toFixed(3);
    const single = ask(d, 'הזוית בין AB לציר ה-x', fmt);
    expect(single.unreadable).toBeUndefined();
    expect(single.value).toBe(ask(d, 'הזווית בין AB לציר ה-x', fmt).value);
  });
});

describe('#1407 class audit — the shape-noun table folds the plene/defective variants 2-D folds (ADR-405)', () => {
  it.each([
    ['ישר-זוית', 'ישר זווית'],
    ['משולש ישר זוית', 'משולש ישר זווית'],
    ['המעויין', 'מעוין'],
    ['משולש שוה שוקיים', 'משולש שווה שוקיים'],
    ['טרפז שוה שוקיים', 'טרפז שווה שוקיים'],
  ])('«%s» normalises to «%s»', (variant, canonical) => {
    expect(normalizeShapeNoun(variant)).toBe(canonical);
  });

  it.each([
    ['מעויין ABCD', 'מעוין ABCD'],
    ['משולש שוה שוקיים ABC', 'משולש שווה שוקיים ABC'],
    ['טרפז שוה שוקיים ABCD', 'טרפז שווה שוקיים ABCD'],
  ])('«%s» lowers to what «%s» lowers to — the shape, with its givens', (variant, canonical) => {
    expect(lowered(variant)).toEqual(lowered(canonical));
  });

  it('a fold never fires inside a longer word', () => {
    expect(normalizeShapeNoun('שוהם')).toBe('שוהם');
    expect(shapeRow('זויתי')).toBeNull();
  });
});

describe('#1407 — the catalog carries the single-vav spelling, so the coverage guard exercises it', () => {
  it('a «זוית» row exists and parses in both languages', () => {
    const row = COMMAND_CATALOG_ANALYTIC.find((e) => /(?<![א-ת])זוית(?![א-ת])/.test(e.he));
    expect(row).toBeDefined();
    expect(parseLine(row!.he).ok).toBe(true);
    expect(parseLine(row!.en).ok).toBe(true);
  });
});
