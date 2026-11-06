/**
 * #1775 ([ADR-792](../../../docs/06-decisions.md#adr-792)) — an operand's own noun reaches the same operand.
 *
 * Measured on c0029d25 through `decideDeterministic2D`: «דרך P מעבירים אנך ל-AB» commits, and the exam's «דרך הנקודה P
 * מעבירים אנך לישר AB» escalated; «מ-P מורידים אנך ל-AB» commits, and «… לישר AB» was refused as an unread part. Each
 * frame read a bare label. The verdict stays 2-D's existing one; the teach is #1358's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const commandsOf = async (prefix: string[], line: string) => {
  const v = await decide(prefix, line);
  return v.kind === 'commit' ? v.commands : v.kind;
};

beforeEach(() => useGeoStore.getState().clear());

const P_ON_AB = ['קטע AB', 'P על AB'];
const TRIANGLE = ['משולש ABC'];

describe('#1775 — the through-frame', () => {
  const POINT = ['P', 'הנקודה P', 'נקודה P'];
  const LINE = ['ל-AB', 'לישר AB', 'להישר AB', 'לצלע AB', 'לקטע AB'];

  it.each(POINT.flatMap((p) => LINE.map((l) => [p, l])))('דרך %s מעבירים אנך %s', async (p, l) => {
    expect(await commandsOf(P_ON_AB, `דרך ${p} מעבירים אנך ${l}`)).toEqual(await commandsOf(P_ON_AB, 'דרך P מעבירים אנך ל-AB'));
  });

  it.each(POINT.flatMap((p) => LINE.map((l) => [p, l])))('דרך %s מעבירים ישר המאונך %s', async (p, l) => {
    expect(await commandsOf(P_ON_AB, `דרך ${p} מעבירים ישר המאונך ${l}`)).toEqual(await commandsOf(P_ON_AB, 'דרך P מעבירים ישר המאונך ל-AB'));
  });

  it.each(POINT.flatMap((p) => LINE.map((l) => [p, l])))('דרך %s מעבירים ישר המקביל %s', async (p, l) => {
    expect(await commandsOf(TRIANGLE, `דרך ${p.replace('P', 'A')} מעבירים ישר המקביל ${l.replace('AB', 'BC')}`)).toEqual(await commandsOf(TRIANGLE, 'דרך A מעבירים ישר המקביל ל-BC'));
  });

  it('a vertex is a through-point too: «דרך הקודקוד A»', async () => {
    expect(await commandsOf(TRIANGLE, 'דרך הקודקוד A מעבירים ישר המקביל לצלע BC')).toEqual(await commandsOf(TRIANGLE, 'דרך A מעבירים ישר המקביל ל-BC'));
  });

  it('English reads the same nouns', async () => {
    expect(await commandsOf(P_ON_AB, 'line through point P perpendicular to line AB')).toEqual(await commandsOf(P_ON_AB, 'line through P perpendicular to AB'));
    expect(await commandsOf(TRIANGLE, 'line through point A parallel to side BC')).toEqual(await commandsOf(TRIANGLE, 'line through A parallel to BC'));
  });

  it('the point stays the operand: its noun is not read as the line’s name', async () => {
    const cmds = await commandsOf(TRIANGLE, 'דרך הנקודה A מעבירים אנך לישר BC');
    expect(cmds).toEqual([{ type: 'perpendicular-line', id: 'perp-A-BC', through: 'A', a: 'B', b: 'C', visible: true }]);
  });
});

describe('#1775 — the from-frame', () => {
  it.each(['מ-A מורידים אנך לישר BC', 'מהנקודה A מורידים אנך לישר BC', 'מהקודקוד A מורידים אנך לישר BC', 'הורידו אנך מהנקודה A לישר BC'])('%s', async (line) => {
    expect(await commandsOf(TRIANGLE, line)).toEqual(await commandsOf(TRIANGLE, 'מ-A מורידים אנך ל-BC'));
  });

  it('«ישר» is the operand of the perpendicular, never of a cevian: a height still takes a side', async () => {
    expect(await commandsOf(TRIANGLE, 'תיכון מ-A לישר BC')).toBe('refuse');
  });

  it('a stated line wins over the figure: «לישר AC» is AC, not the side opposite the point', async () => {
    const cmds = await commandsOf(['משולש ABC', 'D על BC'], 'מ-D מורידים אנך לישר AC');
    expect(cmds).toContainEqual(expect.objectContaining({ type: 'foot', from: 'D', a: 'A', b: 'C' }));
  });
});

describe('#1775 — refusals stay', () => {
  it('no line operand: the frame is not read', async () => {
    expect((await decide(P_ON_AB, 'דרך הנקודה P מעבירים אנך')).kind).toBe('escalate');
  });
});
