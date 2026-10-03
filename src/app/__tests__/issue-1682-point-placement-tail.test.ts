/**
 * #1682 ([ADR-570](../../../docs/06-decisions.md#adr-570)) — a point-placement sentence keeps its tail: a
 * condition clause is a given, and «מעבר לנקודה X» picks the extension's end.
 *
 * Measured on `main` deed7b20 through `decideDeterministic2D` + the store, seed 0:
 *  - «מרובע ABCD» · «הנקודה E נמצאת על המשך הצלע BC ונתון כי DE = DC» committed only the extension; DE = DC
 *    gone (|DE| = 4.47, |DC| = 4.12), green;
 *  - «… על המשך הצלע BC מעבר לנקודה B» drew E past C;
 *  - «… על המשך BC ו-DE = DC», «…, DE = DC», «D על BC ונתון כי AD = AC» dropped the same way.
 * The dropped-relation gate counted the relation as carried because E is introduced by the line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { droppedGivenRelations } from '@/parser';

type V = { x: number; y: number };
const d = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y);

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
}

/** The figure after the sequence, through the gate, at `seed`. */
function figure(seq: string[], seed = 0) {
  const { facts, refused } = driveThroughGate(seq);
  expect(refused, 'the sequence builds').toEqual([]);
  const f = replay(facts, seed);
  return { at: (k: string) => f.positions.get(k)!, violations: f.violations };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1682 — a condition after a point placement is a given', () => {
  it.each([
    'הנקודה E נמצאת על המשך הצלע BC ונתון כי DE = DC',
    'E על המשך BC ונתון ש-DE = DC',
    'E על המשך BC וידוע כי DE = DC',
    'E on the extension of BC and it is given that DE = DC',
    'E על המשך BC ו-DE = DC',
    'E על המשך BC, DE = DC',
  ])('«%s» holds DE = DC on the figure (seeds 0–3)', async (line) => {
    const v = await decide(['מרובע ABCD'], line);
    expect(v.kind, 'committed by the grammar').toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
    for (const seed of [0, 1, 2, 3]) {
      const f = figure(['מרובע ABCD', line], seed);
      expect(d(f.at('D'), f.at('E')), `seed ${seed}`).toBeCloseTo(d(f.at('D'), f.at('C')), 6);
      expect(f.violations, `seed ${seed}`).toEqual([]);
    }
  });

  it('«על הצלע» too: «D על BC ונתון כי AD = AC» holds AD = AC', async () => {
    const v = await decide(['משולש ABC'], 'הנקודה D נמצאת על הצלע BC ונתון כי AD = AC');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'set-equal', a: 'A', b: 'D', c: 'A', d: 'C' });
  });

  it('a SHAPE with a given glued on stays the #108 two-step teaching', async () => {
    const v = await decide([], 'משולש ABC ונתון כי AB = AC');
    expect(v.kind).toBe('refuse');
  });

  it('the gate: a relation on a point the line never mentions is not carried by another point’s definition', () => {
    const cmds = [
      { type: 'segment', a: 'B', b: 'C' },
      { type: 'point-on-segment', id: 'E', a: 'B', b: 'C', t: 1.3, extension: true },
    ] as const;
    expect(droppedGivenRelations('E על המשך BC ונתון כי DE = DC', [...cmds])).toEqual(['DE = DC']);
    // the case the exemption exists for: the definition itself carries every label (t = 2 bakes AB = BK)
    expect(droppedGivenRelations('K על המשך AB כך ש AB=BK', [{ type: 'point-on-segment', id: 'K', a: 'A', b: 'B', t: 2, extension: true }])).toEqual([]);
  });
});

describe('#1682 — «מעבר לנקודה X» picks the end the extension passes', () => {
  /** Signed position of E along B→C: < 0 past B, > 1 past C. */
  const along = (f: ReturnType<typeof figure>) => {
    const B = f.at('B'), C = f.at('C'), E = f.at('E');
    return ((E.x - B.x) * (C.x - B.x) + (E.y - B.y) * (C.y - B.y)) / d(B, C) ** 2;
  };

  it.each([
    ['הנקודה E נמצאת על המשך הצלע BC מעבר לנקודה B', 'B'],
    ['E על המשך BC מעבר ל-B', 'B'],
    ['E on the extension of BC beyond B', 'B'],
    ['הנקודה E נמצאת על המשך הצלע BC מעבר לנקודה C', 'C'],
    ['E על המשך BC', 'C'],
  ])('«%s» puts E past %s (seeds 0–3)', (line, end) => {
    for (const seed of [0, 1, 2, 3]) {
      const t = along(figure(['מרובע ABCD', line], seed));
      if (end === 'B') expect(t, `seed ${seed}`).toBeLessThan(0);
      else expect(t, `seed ${seed}`).toBeGreaterThan(1);
    }
  });

  it('the qualifier and the condition together', () => {
    const f = figure(['מרובע ABCD', 'E על המשך BC מעבר לנקודה B ונתון כי DE = DC']);
    expect(along(f)).toBeLessThan(0);
    expect(d(f.at('D'), f.at('E'))).toBeCloseTo(d(f.at('D'), f.at('C')), 6);
  });

  it('a letter that is neither end is never dropped into a figure', async () => {
    const v = await decide(['מרובע ABCD'], 'E על המשך BC מעבר לנקודה A');
    expect(v.kind).not.toBe('commit');
  });
});
