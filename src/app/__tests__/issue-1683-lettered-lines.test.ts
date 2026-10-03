/**
 * #1683 ([ADR-569](../../../docs/06-decisions.md#adr-569)) — lines a sentence names by letters are read as
 * named, and a role noun on them is a claim.
 *
 * Measured on `main` deed7b20 through `decideDeterministic2D`:
 *  - «מרובע ABCD» · «האלכסונים AB ו-CD נפגשים בנקודה E» committed `line-line-intersection E of A–C and B–D`:
 *    the student named two SIDES and got the meet of the real diagonals;
 *  - «האלכסון AB חותך את CD בנקודה E» committed plain segments: the diagonal claim on a side was dropped;
 *  - «משולש ABC» · «D על BC» · «E על AC» · «התיכונים AD ו-BE נפגשים בנקודה G» committed the centroid with
 *    hidden midpoints, D and E untouched — AD was never made a median.
 * Analytic refuses the first (`not-a-diagonal`, ADR-AG-208).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import type { AnyCommand } from '@/engine';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const cmds = (v: Awaited<ReturnType<typeof decide>>): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
const segs = (v: Awaited<ReturnType<typeof decide>>) =>
  cmds(v).flatMap((c) => (c.type === 'segment' ? [`${[c.a, c.b].sort().join('')}${c.diagonal ? '*' : ''}`] : []));
const meet = (v: Awaited<ReturnType<typeof decide>>) =>
  cmds(v).find((c) => c.type === 'line-line-intersection') as { a: string; b: string; c: string; d: string } | undefined;
const pairsOf = (m: { a: string; b: string; c: string; d: string } | undefined) =>
  m ? [[m.a, m.b].sort().join(''), [m.c, m.d].sort().join('')].sort() : null;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1683 — diagonals named by letters are claims about those letters', () => {
  it.each([
    'האלכסונים AB ו-CD נפגשים בנקודה E',
    'האלכסונים AB ו-CD נחתכים בנקודה E',
    'the diagonals AB and CD meet at E',
    'האלכסון AB חותך את CD בנקודה E',
  ])('in ABCD «%s» is refused naming the side, never drawn as AC ∩ BD', async (line) => {
    const v = await decide(['מרובע ABCD'], line);
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toMatch(/AB is not a diagonal of ABCD/);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('«האלכסונים AC ו-AB» shares A: refused as a meet at A (#1274), never AC ∩ BD', async () => {
    const v = await decide(['מרובע ABCD'], 'האלכסונים AC ו-AB נפגשים בנקודה E');
    expect(v.kind).toBe('refuse');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each(['האלכסונים AC ו-BD נפגשים בנקודה E', 'האלכסונים BD ו-AC נפגשים בנקודה E', 'the diagonals AC and BD intersect at point E'])(
    'in ABCD «%s» builds the named meet, both diagonals drawn and claimed',
    async (line) => {
      const v = await decide(['מרובע ABCD'], line);
      expect(segs(v).sort()).toEqual(['AC*', 'BD*']);
      expect(pairsOf(meet(v))).toEqual(['AC', 'BD']);
    },
  );

  it('with no ring the named pairs are read as written (and claimed, as «האלכסון AC» is)', async () => {
    const v = await decide([], 'האלכסונים AC ו-BD נפגשים בנקודה E');
    expect(segs(v).sort()).toEqual(['AC*', 'BD*']);
    expect(pairsOf(meet(v))).toEqual(['AC', 'BD']);
  });

  it('a later ring that makes the claim true leaves the figure without violations', () => {
    const { facts, refused } = driveThroughGate(['האלכסונים AC ו-BD נפגשים בנקודה E', 'מרובע ABCD']);
    expect(refused).toEqual([]);
    expect(replay(facts, 0).violations).toEqual([]);
  });

  it('the diagonals of two rings: the named ones are kept, not the unique-quad fallback', async () => {
    const v = await decide(['מרובע ABCD', 'מרובע ABEF'], 'האלכסונים AE ו-BF נפגשים בנקודה K');
    expect(pairsOf(meet(v))).toEqual(['AE', 'BF']);
  });

  it('the unlettered forms are unchanged: the meet of the ring\'s diagonals, nothing drawn', async () => {
    for (const line of ['האלכסונים נפגשים בנקודה E', 'אלכסוני ABCD נפגשים בנקודה E']) {
      useGeoStore.getState().clear();
      const v = await decide(['מרובע ABCD'], line);
      expect(pairsOf(meet(v)), line).toEqual(['AC', 'BD']);
      expect(segs(v), line).toEqual([]);
    }
  });
});

describe('#1683 — centre lines named by letters go through their own rule', () => {
  const sides = ['משולש ABC', 'D על BC', 'E על AC'];

  it('«התיכונים AD ו-BE נפגשים בנקודה G» makes D and E the midpoints, G their crossing (several seeds)', async () => {
    const v = await decide(sides, 'התיכונים AD ו-BE נפגשים בנקודה G');
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'midpoint', id: 'D' }));
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'midpoint', id: 'E' }));
    expect(pairsOf(meet(v))).toEqual(['AD', 'BE']);
    const { facts } = driveThroughGate([...sides, 'התיכונים AD ו-BE נפגשים בנקודה G']);
    for (const seed of [0, 1, 2, 3]) {
      const p = replay(facts, seed).positions;
      const [A, B, C, G] = ['A', 'B', 'C', 'G'].map((k) => p.get(k)!);
      expect(G.x, `seed ${seed}: G is the centroid`).toBeCloseTo((A.x + B.x + C.x) / 3, 6);
      expect(G.y).toBeCloseTo((A.y + B.y + C.y) / 3, 6);
    }
  });

  it('«הגבהים AD ו-BE נחתכים בנקודה H» drops the named feet', async () => {
    const v = await decide(['משולש ABC'], 'הגבהים AD ו-BE נחתכים בנקודה H');
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'foot', id: 'D', from: 'A' }));
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'foot', id: 'E', from: 'B' }));
    expect(pairsOf(meet(v))).toEqual(['AD', 'BE']);
  });

  it('«חוצי הזווית AD ו-BE נפגשים בנקודה I» places D and E on the bisectors', async () => {
    const v = await decide(['משולש ABC'], 'חוצי הזווית AD ו-BE נפגשים בנקודה I');
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'bisector', vertex: 'A' }));
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'bisector', vertex: 'B' }));
    expect(pairsOf(meet(v))).toEqual(['AD', 'BE']);
  });

  it('the unlettered centre stays the hidden construction', async () => {
    const v = await decide(['משולש ABC'], 'התיכונים נפגשים בנקודה G');
    expect(cmds(v)).toContainEqual(expect.objectContaining({ type: 'midpoint', id: '~med-BC' }));
  });
});
