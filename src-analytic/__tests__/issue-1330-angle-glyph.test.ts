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
import { parseLengthExpr } from '../engine/lengths';

// #1334 (ADR-AG-143): with «AB = AC» this figure IS the needle the accept gate now refuses — the equivalence
// this file locks is between spellings, so it is asserted on a triangle the right angle can live in.
const FIG = ['משולש ABC'];
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

/**
 * #1333 ([ADR-AG-146](../../docs/06c-decisions-analytic.md#adr-ag-146)) — THE ENGLISH «=» ANGLE FORM
 * IS NOT A LENGTH.
 *
 * «angle ABC = 90» was claimed by `LENGTH_EQ` before the angle rule ever saw it: `parseLengthExpr`
 * found `AB` inside «angle ABC» and the leftover letters became free symbols, so the guard that
 * should have left the sentence alone («at least ONE side must mention a LENGTH») saw a length
 * expression. On «משולש ABC» · «AB = AC» the tool then answered about a measurement the student
 * never asked for, while «∠ABC = 90» and «angle ABC is right» — the same statement — refused.
 *
 * The lock is EQUIVALENCE across the spellings and CASES, for the same reason the glyph rows above
 * are: a sentence must not mean one thing in capitals and another in lower case.
 */
describe('#1333 — «angle ABC = 90» is an ANGLE in every case, never a length', () => {
  it.each([
    ['angle ABC = 90'],
    ['Angle ABC = 90'],
    ['ANGLE ABC = 90'],
    ['the angle ABC = 90'],
    ['the angle ABC is 90'],
  ])('«%s» lowers to what «angle ABC is right» lowers to', (line) => {
    expect(lowered(line)).toEqual(lowered('angle ABC is right'));
  });

  it('a length sentence is still a length — the guard did not simply stop claiming', () => {
    for (const line of ['AB = 4', 'AB = BC', 'AB + BC = 10', '2AB = BC', 'A1B2 = 5']) {
      const r = parseLine(line);
      expect(r.ok, line).toBe(true);
      expect(r.ok && r.facts[0]?.t, line).toBe('constraint');
      expect(r.ok && (r.facts[0] as { k: { t: string } }).k.t, line).toBe('length-eq');
    }
  });

  /**
   * The root, asserted directly: a length token is a WHOLE name, never a pair out of the middle of
   * a word. «ANGLE ABC» used to yield THREE measurements — `AN`, `GL`, `AB` — the #1151 honesty
   * failure the file's own docblock records, still live for a word no frame claimed.
   */
  it('a letter pair inside a longer word is not a length token', () => {
    expect(parseLengthExpr('ANGLE ABC')).toBeNull();
    expect(parseLengthExpr('angle ABC')).toBeNull();
    expect(parseLengthExpr('ABC')).toBeNull(); // a polygon, owned by the area frame that runs first
    expect(parseLengthExpr('2AB')?.terms).toEqual([{ a: 'A', b: 'B' }]); // a coefficient, not a boundary
  });

  it('scope unchanged: a non-right angle value falls through in BOTH languages, with no disparity', () => {
    for (const line of ['angle ABC = 45', 'זווית ABC = 45', 'ANGLE ABC = 45']) {
      const r = parseLine(line) as { ok: boolean; code?: string };
      expect(r.ok, line).toBe(false);
      expect(r.code, line).toBe('not-handled');
    }
  });
});
