/**
 * #2231 ([ADR-AG-421](../../docs/06c-decisions-analytic.md#adr-ag-421)) — «MK אנך לציר x» assumes nothing about K. Operator,
 * 2026-11-06: *"If user want the point to be on a, they will need to say so. This is true to all tools."* The noun reads as
 * «MK מאונך …» reads; «בנקודה K», which says so, is the foot (reverses the foot reading of ADR-AG-410).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { rewriteLine } from '../app/rename';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import fixture from './fixtures/issue-2231-rhombus-perp-foot.analytic.json';

const at = (lines: string[], id: string) => derive(lines, 0).figure.points.find((p) => p.id === id);
/** The facts, without the text they came from: two spellings of one statement lower alike. */
const lowering = (line: string) => JSON.stringify(parseLine(line)).split(line).join('');

describe('#2231 — the noun «אנך» is the relation: K is not assumed on the line', () => {
  it.each([
    ['MK אנך לציר x', 'MK מאונך לציר x'],
    ['MK הוא אנך לציר x', 'MK מאונך לציר x'],
    ['MK אנך לציר ה-y', 'MK מאונך לציר ה-y'],
    ['MK אנך ל-AB', 'MK מאונך ל-AB'],
    ['MK is a perpendicular to the x-axis', 'MK מאונך לציר the x-axis'.replace('לציר ', 'ל-')],
  ])('«%s» lowers as «%s»', (noun, adjective) => {
    expect(lowering(noun)).toBe(lowering(adjective));
  });

  it('on M(3,4), «MK אנך לציר x»: K is created on x = 3 and is NOT on the axis', () => {
    const v = decideSubmit('MK אנך לציר x', ['M(3,4)'], 0);
    expect(v).toMatchObject({ kind: 'record', created: ['K'] });
    const k = at(['M(3,4)', 'MK אנך לציר x'], 'K')!;
    expect(k.x).toBeCloseTo(3, 6);
    expect(Math.abs(k.y)).toBeGreaterThan(1e-3);
  });

  it('«MK אנך לציר ה-y»: K on y = 4, not on the axis', () => {
    const k = at(['M(3,4)', 'MK אנך לציר ה-y'], 'K')!;
    expect(k.y).toBeCloseTo(4, 6);
    expect(Math.abs(k.x)).toBeGreaterThan(1e-3);
  });

  it('«MK אנך ל-AB» on a pair: MK ⟂ AB, K off AB', () => {
    const ctx = ['A(0,0)', 'B(4,0)', 'M(1,3)'];
    const k = at([...ctx, 'MK אנך ל-AB'], 'K')!;
    expect(k.x).toBeCloseTo(1, 6);
    expect(Math.abs(k.y)).toBeGreaterThan(1e-3);
  });

  it('«AK אנך ל-BC» on a triangle is a relation, not a foot', () => {
    expect(JSON.stringify(parseLine('AK אנך ל-BC'))).not.toContain('"foot"');
    expect(decideSubmit('AK אנך ל-BC', ['משולש ABC'], 0).kind).toBe('record');
  });

  it('a K already on the axis stays where it is', () => {
    expect(at(['M(3,4)', 'K(3,0)', 'MK אנך לציר x'], 'K')).toMatchObject({ x: 3, y: 0 });
  });

  it('a rename follows the letter', () => {
    expect(rewriteLine('MK אנך לציר x', 'K', 'Q')?.line).toBe('MQ אנך לציר x');
  });
});

describe('#2231 — «בנקודה K» says so, and K is the foot', () => {
  it.each([
    ['MK אנך לציר x בנקודה K', 3, 0],
    ['MK אנך לציר ה-y בנקודה K', 0, 4],
    ['MK הוא אנך לציר x בנקודה K', 3, 0],
    ['MK is a perpendicular to the x-axis at K', 3, 0],
  ])('«%s» on M(3,4)', (line, x, y) => {
    expect(decideSubmit(line, ['M(3,4)'], 0).kind).toBe('record');
    const d = derive(['M(3,4)', line], 0);
    expect(d.faults).toEqual([]);
    expect(at(['M(3,4)', line], 'K')).toMatchObject({ x, y });
    expect(JSON.stringify(parseLine(line))).toContain('"id":"seg-KM"');
  });

  it('over a pair', () => {
    expect(at(['A(0,0)', 'B(4,0)', 'M(1,3)', 'MK אנך ל-AB בנקודה K'], 'K')).toMatchObject({ x: 1, y: 0 });
  });

  it.each([
    ['K already placed', ['M(3,4)', 'K(3,0)'], 'MK אנך לציר x בנקודה K'],
    ['M not placed', ['K(3,0)'], 'MK אנך לציר x בנקודה K'],
    ['M on the line: the foot would be M', ['M(3,0)'], 'MK אנך לציר x בנקודה K'],
    ['a trailing point that is not the foot', ['M(3,4)'], 'MK אנך לציר x בנקודה L'],
  ])('%s: `not-handled`, the model\'s seam', (_name, ctx, line) => {
    const v = decideSubmit(line, ctx, 0);
    expect(v.kind).toBe('refused');
    expect((v as { error: { key: string } }).error.key).toBe('not-handled');
  });
});

describe('#2231 — the operator\'s rhombus, with the foot stated (fixture)', () => {
  it('every line records, and the foot is K with no minted letter', () => {
    const { lines } = fixture;
    for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
    expect(lines[lines.length - 1]).toBe('MK אנך לציר x בנקודה K');
    const d = derive(lines, fixture.seed);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.find((p) => p.id === 'K')).toMatchObject({ x: 3, y: 0 });
    expect(d.figure.points.some((p) => p.id === 'H')).toBe(false);
  });
});
