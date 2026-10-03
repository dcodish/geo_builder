/**
 * #1684 ([ADR-568](../../../docs/06-decisions.md#adr-568)) — a cevian sentence's stated vertex and its target
 * shape are honoured or asked, never dropped or picked.
 *
 * Measured on `main` deed7b20 through `decideDeterministic2D`:
 *  - «משולש ABC» · «AD חוצה זווית C» committed `bisector bis-BAC (vertex A)` — the bisector of ∠A, the stated
 *    vertex C gone (a segment from A cannot bisect ∠C);
 *  - «משולש ABC» · «משולש ABD» · «AE גובה» committed `foot E from A to BC` — triangle ABC picked silently over
 *    ABD, and «AE תיכון» on the same figure escalated to the paid model.
 * Analytic answers both (`bisector-wrong-apex`, `ambiguous-cevian`, ADR-AG-209); 2-D now does too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import i18n from '@/i18n';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lng);
  const note = v.kind === 'refuse' && 'key' in v.note ? v.note : null;
  const text = note
    ? plain(i18n.t(note.key, { ...Object.fromEntries(Object.entries(note.params ?? {}).map(([k, x]) => [k, x && typeof x === 'object' && 't' in x ? i18n.t((x as { t: string }).t, { lng }) : x])), lng }) as string)
    : null;
  return { v, key: note?.key ?? null, params: note?.params as Record<string, unknown> | undefined, text };
}

const cmds = (v: Awaited<ReturnType<typeof decide>>['v']) => (v.kind === 'commit' ? v.commands : []);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1684 — the angle a bisector sentence names is its vertex', () => {
  it.each([
    ['AD חוצה זווית C', 'C'],
    ['AD חוצה את זווית C', 'C'],
    ['AD חוצה את הזווית B', 'B'],
    ['AD bisects angle C', 'C'],
    ['AD bisects the angle C', 'C'],
  ])('«%s» on triangle ABC is refused naming vertex %s, never drawn as the bisector of ∠A', async (line, stated) => {
    const r = await decide(['משולש ABC'], line);
    expect(r.key).toBe('input.bisectorWrongApex');
    expect(r.params).toMatchObject({ apex: 'A', stated });
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the same refusal holds with a triangle named (#1285) — one reader for both forms', async () => {
    expect((await decide(['משולש ABC'], 'CE חוצה זווית A במשולש ABC')).key).toBe('input.bisectorWrongApex');
  });

  it('a foot named after the angle word is not read as the vertex', async () => {
    const r = await decide(['משולש ABC'], 'AD חוצה זווית A');
    expect(cmds(r.v)).toContainEqual(expect.objectContaining({ type: 'bisector', vertex: 'A' }));
  });

  it('the stated vertex at the apex still builds, with and without a triangle', async () => {
    for (const line of ['AD חוצה זווית A', 'CE חוצה זווית C במשולש ABC', 'CD חוצה זווית במשולש ABC']) {
      useGeoStore.getState().clear();
      const r = await decide(['משולש ABC'], line);
      const apex = line[0];
      expect(cmds(r.v), line).toContainEqual(expect.objectContaining({ type: 'bisector', vertex: apex }));
    }
  });

  it('a stated vertex at the segment\'s FAR end is the angle at that existing point (a constraint there)', async () => {
    const r = await decide(['מרובע ABCD'], 'BD חוצה זווית D');
    expect(cmds(r.v)).toContainEqual(expect.objectContaining({ type: 'set-angle-ratio', v1: 'D', v2: 'D', b1: 'B', a2: 'B' }));
  });

  it('a far-end vertex that is not yet a point is refused, not redirected to the apex', async () => {
    const r = await decide(['משולש ABC'], 'AD חוצה זווית D');
    expect(r.key).toBe('input.bisectorWrongApex');
    expect(r.params).toMatchObject({ apex: 'A', stated: 'D' });
  });
});

describe('#1684 — a cevian whose apex is in several shapes asks which', () => {
  const TWO = ['משולש ABC', 'משולש ABD'];

  it.each(['AE גובה', 'AE תיכון', 'גובה מ-A', 'תיכון מ-A', 'AE height', 'height from A'])('«%s» with A in ABC and ABD asks, quoting the sentence and both shapes', async (line) => {
    const r = await decide(TWO, line);
    expect(r.v.kind).toBe('refuse');
    expect(r.key).toBe('input.ambiguousCevian');
    expect(r.params).toMatchObject({ apex: 'A', shapes: 'ABC, ABD' });
    expect(r.text).toContain(line);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the English note reads', async () => {
    const r = await decide(TWO, 'AE גובה', 'en');
    expect(r.text).toMatch(/vertex A belongs to several shapes \(ABC, ABD\)/);
  });

  it.each([
    ['AE גובה לצלע BD', 'B', 'D'],
    ['AE גובה במשולש ABD', 'B', 'D'],
    ['AE גובה במשולש ABC', 'B', 'C'],
    ['AE תיכון לצלע BC', 'B', 'C'],
  ])('naming the side or the triangle answers it: «%s»', async (line, a, b) => {
    const r = await decide(TWO, line);
    const c = cmds(r.v).find((x) => x.type === 'foot' || x.type === 'midpoint') as { a: string; b: string } | undefined;
    expect(c && [c.a, c.b].sort()).toEqual([a, b]);
  });

  it('a foot the figure already puts on one candidate side answers it (analytic ADR-AG-222)', async () => {
    const r = await decide([...TWO, 'E על BC'], 'AE גובה');
    expect(cmds(r.v)).toContainEqual(expect.objectContaining({ type: 'foot', id: 'E', from: 'A', a: 'B', b: 'C' }));
  });

  it('ONE shape with several heights keeps the draw-one steer (a parallelogram), and one triangle builds', async () => {
    expect(cmds((await decide(['מקבילית ABCD'], 'AE גובה')).v)).toContainEqual(expect.objectContaining({ type: 'foot', from: 'A' }));
    useGeoStore.getState().clear();
    expect(cmds((await decide(['משולש ABC'], 'AE גובה')).v)).toContainEqual(expect.objectContaining({ type: 'foot', from: 'A', a: 'B', b: 'C' }));
  });
});
