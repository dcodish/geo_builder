/**
 * #1676 ([ADR-630](../../../docs/06-decisions.md#adr-630)) — the exam's sentence frame, read at 2-D's one boundary.
 *
 * Measured on 57e6ed50 through `decideDeterministic2D`: «המרובע ABCD הוא טרפז (AB ∥ CD)» was refused
 * `split-statements`; «O – מרכז המעגל», «המרובע ABCD מלבן», «בסרטוט שלפניך מתואר משולש ABC» and «המרובע ABCO הוא טרפז
 * ישר זווית» escalated `not-handled` — each a sentence 2-D reads in its canonical spelling. Analytic reads all five
 * (`frameAnalytic.ts`, ADR-AG-187); 2-D now reads them through its copy, `src/parser/frame.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { readFrame } from '@/parser/frame';
import { normalizeUtterance } from '@/parser/parse';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const cmds = (v: Awaited<ReturnType<typeof decide>>) => (v.kind === 'commit' ? v.commands : null);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1676 — readFrame: the wrapper off, the canonical sentence out', () => {
  it.each([
    ['המרובע ABCD הוא טרפז (AB ∥ CD)', 'טרפז ABCD (AB ∥ CD)'],
    ['O – מרכז המעגל', 'O מרכז המעגל'],
    ['O - מרכז המעגל', 'O מרכז המעגל'],
    ['המרובע ABCD מלבן', 'מלבן ABCD'],
    ['המרובע ABCD הוא מלבן', 'מלבן ABCD'],
    ['בסרטוט שלפניך מתואר משולש ABC', 'משולש ABC'],
    ['בסרטוט שלפניכם מתוארת מקבילית ABCD', 'מקבילית ABCD'],
    ['המרובע ABCO הוא טרפז ישר זווית', 'טרפז ישר זווית ABCO'],
    ['המשולש ABC הוא ישר זווית', 'משולש ישר זווית ABC'],
    ['the quadrilateral ABCD is a trapezoid', 'trapezoid ABCD'],
  ])('«%s» → «%s»', (typed, canonical) => {
    expect(readFrame(typed)).toBe(canonical);
  });

  it.each([
    'המשולש ABCD הוא טרפז', // a noun that does not fit the letters
    'המרובע ABC הוא משולש', // a quadrilateral cannot be a triangle
    'המרובע ABCD הוא פיל', // not a shape
    'משולש ABC ישר זווית ב-B', // a locative the phrase does not consume — ADR-611 teaches it
    'ריבוע ABCD שצלעו 5',
    'משולש ABC חסום במעגל',
    'טרפז ABCD (AD ∥ BC)',
    'the quadrilateral abcd is a trapezoid', // lowercase letters are taught (#779), never read here
  ])('«%s» is not this frame and is left as typed', (typed) => {
    expect(readFrame(typed)).toBe(typed);
  });

  it('it runs inside normalizeUtterance, the boundary every rule and gate reads', () => {
    expect(normalizeUtterance('המרובע ABCD מלבן')).toBe('מלבן ABCD');
  });
});

describe('#1676 — through the real decision: the framed line commits what its canonical sentence commits', () => {
  it.each([
    [[], 'המרובע ABCD הוא טרפז (AB ∥ CD)', 'טרפז ABCD (AB ∥ CD)'],
    [['מעגל O'], 'O – מרכז המעגל', 'O מרכז המעגל'],
    [[], 'המרובע ABCD מלבן', 'מלבן ABCD'],
    [[], 'בסרטוט שלפניך מתואר משולש ABC', 'משולש ABC'],
    [[], 'המרובע ABCO הוא טרפז ישר זווית', 'טרפז ישר זווית ABCO'],
    [[], 'the quadrilateral ABCD is a trapezoid', 'ABCD is a trapezoid'],
  ])('on %j, «%s» = «%s»', async (prefix, typed, canonical) => {
    const framed = await decide(prefix, typed);
    expect(framed.kind, typed).toBe('commit');
    useGeoStore.getState().clear();
    expect(cmds(framed)).toEqual(cmds(await decide(prefix, canonical)));
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the parenthetical is honoured: «(AB ∥ CD)» is a stated parallel, not the trapezoid\'s assumed one', async () => {
    expect(cmds(await decide([], 'המרובע ABCD הוא טרפז (AB ∥ CD)'))).toContainEqual({ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'D' });
  });

  it('a predicate the frame does not read is unchanged (escalates, never a guessed shape)', async () => {
    const v = await decide([], 'המרובע ABC הוא משולש');
    expect(v.kind).not.toBe('commit');
  });
});
