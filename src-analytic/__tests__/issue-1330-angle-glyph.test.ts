/**
 * #1330 ([ADR-AG-142](../../docs/06c-decisions-analytic.md#adr-ag-142)) — THE ∠ GLYPH THE 2-D TOOL
 * TEACHES IS AN ANGLE NOUN HERE TOO.
 *
 * Operator, 2026-09-21, playing the #1328 sheet on the analytic page: *"the errors on the 90 is לא הצלחתי
 * להבין את המשפט: «∠ABC = 90» which is wrong error"*. Measured: «∡ABC = 90» and «זווית ABC = 90» built a
 * right angle; «∠ABC = 90» — the glyph on the 2-D palette, catalog and messages — was `not-handled`.
 *
 * The lock is EQUIVALENCE, not acceptance: every glyph spelling must lower to the same facts and build
 * the same figure as its word twin, so the glyph can never drift into a second meaning.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const FIG = ['משולש ABC', 'AB = AC'];
/** The lowered facts, with the sentence itself stripped — what the two spellings must share. */
const lowered = (line: string) => {
  const r = parseLine(line);
  expect(r.ok, `${line} did not parse`).toBe(true);
  return r.ok ? r.facts.map(({ src: _src, ...rest }) => rest) : [];
};
const placed = (line: string) => {
  const d = derive([...FIG, line], 0);
  expect(d.faults, line).toEqual([]);
  return d.figure.points.map((p) => [p.id, +p.x.toFixed(9), +p.y.toFixed(9)]);
};

describe('#1330 — «∠ABC = 90» is «זווית ABC = 90»', () => {
  it.each([
    ['∠ABC = 90', 'זווית ABC = 90'],
    ['∠ABC = 90°', 'זווית ABC = 90'],
    ['∠ABC=90', 'זווית ABC = 90'],
    ['∠ABC ישרה', 'זווית ABC ישרה'],
    ['נתון ∠ABC = 90', 'זווית ABC = 90'],
    ['∡ABC = 90°', 'זווית ABC = 90'], // the glyph that already worked — unchanged
  ])('«%s» lowers to what «%s» lowers to, and builds the same figure', (glyph, word) => {
    expect(lowered(glyph)).toEqual(lowered(word));
    expect(placed(glyph)).toEqual(placed(word));
  });

  it('the one-letter form takes the glyph too — «∠B ישרה» is «זווית B ישרה», a right-angle fact resolved by the figure', () => {
    expect(lowered('∠B ישרה')).toEqual(lowered('זווית B ישרה'));
    expect(lowered('∠B = 90')).toEqual(lowered('זווית B ישרה'));
    expect(lowered('∠B ישרה')[0]?.t).toBe('right-angle');
  });

  it('the English word twin agrees, and a two-letter angle is still refused by name in every spelling', () => {
    expect(lowered('∠ABC = 90')).toEqual(lowered('angle ABC is right'));
    for (const line of ['∠AB = 90', 'זווית AB ישרה']) {
      const r = parseLine(line) as { ok: boolean; code?: string };
      expect(r.ok, line).toBe(false);
      expect(r.code, line).toBe('bad-operand');
    }
  });

  it('scope unchanged: a value other than 90 still falls through (no angle residual yet), and the catalog teaches both spellings', () => {
    const r = parseLine('∠ABC = 60') as { ok: boolean; code?: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not-handled');
    expect(COMMAND_CATALOG_ANALYTIC.some((e) => e.he === '∠ABC = 90')).toBe(true);
    expect(COMMAND_CATALOG_ANALYTIC.some((e) => e.he === 'זווית ABC ישרה')).toBe(true);
  });
});
