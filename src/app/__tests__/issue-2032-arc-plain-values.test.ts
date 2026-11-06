/**
 * #2032 ([ADR-789](../../../docs/06-decisions.md#adr-789), judged rulings q9 and q10 of round #2722).
 *
 * The operator, 2026-11-02: *"An arc is in degrees, unless specifically says something about the length of an arc. So if no
 * units are given an arc is degrees."* Measured before, through this door: «קשת AB = 2/3» drew the CHORD AB = 2/3, and
 * «קשת AB = 4 ס"מ» drew an arc of 4 DEGREES, the unit stripped at the boundary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { stepLabel } from '@/parser';
import { readArcUnitValue } from '../../../shell/arcLengthUnit';

const st = () => useGeoStore.getState();
const SECTOR = ['גזרה AOB'];
const CIRCLE = ['מעגל O', 'A על מעגל O', 'B על מעגל O'];

const decide = async (line: string): Promise<Verdict2D> => {
  const d = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
};
const after = async (ctx: readonly string[], line: string): Promise<Verdict2D> => {
  st().clear();
  for (const l of ctx) commitVerdict(await decide(l), l);
  return decide(line);
};
const commandOf = (v: Verdict2D) => (v.kind === 'commit' ? v.commands[v.commands.length - 1] : null);

beforeEach(() => st().clear());

describe('ADR-789 — a plain fraction on an arc is degrees, never the chord', () => {
  it.each(['קשת AB = 2/3', '⌢AB = 2/3', 'arc AB = 2/3'])('«%s»', async (line) => {
    for (const ctx of [SECTOR, CIRCLE]) {
      const v = await after(ctx, line);
      expect(v.kind === 'commit' && v.commands.some((c) => c.type === 'measure-length')).toBe(false);
      expect(commandOf(v)).toMatchObject({ type: 'set-angle', arcOf: expect.any(String) });
      expect((commandOf(v) as { value: number }).value).toBeCloseTo(2 / 3);
    }
  });

  // Pre-play of round #2722: the row read «∠AOB = 0.6666666666666666», with no degree sign and not the given's spelling.
  describe('a fraction keeps the student\'s spelling (ADR-W-179)', () => {
    const committed = async (ctx: readonly string[], line: string) => {
      const v = await after(ctx, line);
      if (v.kind !== 'commit') throw new Error(`${line}: ${v.kind}`);
      commitVerdict(v, line);
      return v;
    };

    it.each([['2/3'], ['3/7'], ['22/7'], ['7/2'], ['4/6']])('«קשת AB = %s»: the row, the hint, and the figure', async (typed) => {
      const line = `קשת AB = ${typed}`;
      const v = await committed(SECTOR, line);
      expect(stepLabel([...v.commands], line, 'he')).toBe(`∠AOB = ${typed}°`);
      expect(v).toMatchObject({ note: { key: 'input.canonicalHint', params: { canonical: `∠AOB = ${typed}` } } });
      const labels = JSON.stringify(replay(st().facts, st().seed).labels);
      expect(labels).toContain(`${typed}°`);
      expect(labels).not.toMatch(/\d\.\d{6}/);
    });

    it('the taught sentence is read, and keeps the same spelling', async () => {
      const v = await after(SECTOR, '∠AOB = 2/3');
      expect(v.kind).toBe('commit');
      if (v.kind === 'commit') expect(stepLabel([...v.commands], '∠AOB = 2/3', 'he')).toBe('∠AOB = 2/3°');
    });

    it('the same printer: an angle given as a fraction', async () => {
      for (const line of ['∠ABC = 2/3', 'זווית ABC = 3/7']) {
        const v = await after(['משולש ABC'], line);
        if (v.kind !== 'commit') throw new Error(line);
        expect(stepLabel([...v.commands], line, 'he')).toMatch(/^∠ABC = \d\/\d°$/);
      }
    });

    it('a decimal and a whole number print as before, with no src', async () => {
      for (const [line, row] of [['קשת AB = 0.5', '∠AOB = 0.5'], ['קשת AB = 40', '∠AOB = 40']]) {
        const v = await after(SECTOR, line);
        if (v.kind !== 'commit') throw new Error(line);
        expect(stepLabel([...v.commands], line, 'he')).toBe(row);
        expect(commandOf(v)).not.toHaveProperty('src');
      }
    });
  });

  it('the neighbours keep their verdicts', async () => {
    expect(commandOf(await after(SECTOR, 'קשת AB = 40'))).toMatchObject({ type: 'set-angle', value: 40 });
    expect(commandOf(await after(SECTOR, 'קשת AB = 4π'))).toMatchObject({ type: 'measure-perimeter' });
    expect((await after(SECTOR, 'קשת AB = 2√3')).kind).toBe('escalate'); // #2174
    expect((await after(SECTOR, 'קשת AB = 2/0')).kind).not.toBe('commit');
  });
});

describe('ADR-789 — a length unit on an arc is its length', () => {
  const SPELLINGS = ['קשת AB = 4 ס"מ', 'קשת AB = 4 ס״מ', 'קשת AB = 4 סנטימטרים', 'arc AB = 4 cm', 'הקשת AB היא 4 ס"מ', 'קשת AB שווה ל-4 ס"מ', 'קשת AB = 4 יחידות', 'קשת AB = 4 ס"מ במעגל O'];

  it.each(SPELLINGS)('«%s» commits what «אורך הקשת AB הוא 4» commits', async (line) => {
    const twin = commandOf(await after(SECTOR, 'אורך הקשת AB הוא 4'));
    expect(twin).toMatchObject({ type: 'measure-perimeter' });
    expect(commandOf(await after(SECTOR, line))).toEqual(twin);
  });

  it('with no drawn arc it answers as the length sentence does', async () => {
    expect((await after(CIRCLE, 'אורך הקשת AB הוא 4')).kind).toBe('escalate');
    expect((await after(CIRCLE, 'קשת AB = 4 ס"מ')).kind).toBe('escalate');
  });

  it('a degree unit stays degrees, and other lines are not the reader\'s', () => {
    for (const line of ['קשת AB = 40 מעלות', 'קשת AB = 40°', 'קשת AB = 4m', 'AB = 4 ס"מ', 'אורך הקשת AB = 4 ס"מ', 'קשת AB + קשת CD = 4 ס"מ']) expect([line, readArcUnitValue(line)]).toEqual([line, null]);
    expect(readArcUnitValue('קשת AB = 2/3 ס"מ')).toEqual({ a: 'A', b: 'B', value: '2/3' });
  });
});
