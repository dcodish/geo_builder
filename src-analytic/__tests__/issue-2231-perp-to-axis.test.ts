/**
 * #2231 ([ADR-AG-410](../../docs/06c-decisions-analytic.md#adr-ag-410)) — «MK אנך לציר x» is read, with no model: the noun, from
 * a placed M to a new K, makes K the foot. The operator, 2026-10-16: *"despite me calling it K"*; ruling B: *"yes"*.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { rewriteLine } from '../app/rename';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import fixture from './fixtures/issue-2231-rhombus-perp-foot.analytic.json';

const at = (lines: string[], id: string) => derive(lines, 0).figure.points.find((p) => p.id === id);
const kinds = (ctx: string[], line: string) => decideSubmit(line, ctx, 0).kind;

describe('#2231 — the noun «אנך» from a placed point to a new letter', () => {
  it.each([
    ['MK אנך לציר x', 3, 0],
    ['MK אנך לציר ה-x', 3, 0],
    ['MK אנך לציר ה x', 3, 0],
    ['MK אנך לציר y', 0, 4],
    ['MK אנך לציר ה-y', 0, 4],
    ['MK הוא אנך לציר x', 3, 0],
    ['MK אנך לציר x בנקודה K', 3, 0],
    ['MK is a perpendicular to the x-axis', 3, 0],
    ['MK is a perpendicular to the y-axis', 0, 4],
  ])('«%s» on M(3,4) records, and K is the foot', (line, x, y) => {
    const v = decideSubmit(line, ['M(3,4)'], 0);
    expect(v.kind).toBe('record');
    expect(v).not.toHaveProperty('created'); // K is named by the sentence, not created by a mention
    const d = derive(['M(3,4)', line], 0);
    expect(d.faults).toEqual([]);
    expect(at(['M(3,4)', line], 'K')).toMatchObject({ x, y });
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['K', 'M']); // no minted letter
  });

  it('the piece MK is drawn, as the «האנך» sentence draws it', () => {
    expect(JSON.stringify(parseLine('MK אנך לציר x'))).toContain('"id":"seg-KM"');
  });

  it('the target is any line, as the foot sentence\'s (2-D\'s «MK אנך ל-AB», ADR-786)', () => {
    const ctx = ['A(0,0)', 'B(4,0)', 'M(1,3)'];
    for (const line of ['MK אנך ל-AB', 'MK אנך לישר AB', 'MK is a perpendicular to AB']) expect(at([...ctx, line], 'K'), line).toMatchObject({ x: 1, y: 0 });
  });

  it('a rename follows the letter', () => {
    expect(rewriteLine('MK אנך לציר x', 'K', 'Q')?.line).toBe('MQ אנך לציר x');
  });
});

describe('#2231 — every other figure keeps its verdict', () => {
  it('the adjectives keep the relation: «MK מאונך לציר x» does not say K is on the axis', () => {
    for (const line of ['MK מאונך לציר x', 'MK ניצב לציר x']) {
      expect(kinds(['M(3,4)'], line), line).toBe('record');
      expect(at(['M(3,4)', line], 'K')?.y, line).not.toBeCloseTo(0, 6);
    }
  });

  it.each([
    ['K already placed', ['M(3,4)', 'K(3,0)'], 'MK אנך לציר x'],
    ['M not placed', ['K(3,0)'], 'MK אנך לציר x'],
    ['an empty figure', [], 'MK אנך לציר x'],
    ['M on the line: the foot would be M', ['M(3,0)'], 'MK אנך לציר x'],
    ['M a letter of the line', ['A(0,0)', 'B(4,0)'], 'AK אנך ל-AB'],
    ['M on the pair', ['A(0,0)', 'B(4,0)', 'M(1,0)'], 'MK אנך ל-AB'],
    ['the line\'s letters unknown', ['M(3,4)'], 'MK אנך ל-AB'],
    ['a trailing point that is not the foot', ['M(3,4)'], 'MK אנך לציר x בנקודה L'],
  ])('%s: `not-handled`, the model\'s seam', (_name, ctx, line) => {
    const v = decideSubmit(line, ctx, 0);
    expect(v.kind).toBe('refused');
    expect((v as { error: { key: string } }).error.key).toBe('not-handled');
  });
});

describe('#2231 — the operator\'s rhombus (fixture)', () => {
  it('every line records, and the foot is K with no minted letter', () => {
    const { lines } = fixture;
    for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
    expect(lines[lines.length - 1]).toBe('MK אנך לציר x');
    const d = derive(lines, fixture.seed);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.find((p) => p.id === 'K')).toMatchObject({ x: 3, y: 0 });
    expect(d.figure.points.some((p) => p.id === 'H')).toBe(false);
  });
});
