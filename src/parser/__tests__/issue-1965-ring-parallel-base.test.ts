/**
 * #1965 + #2090 ([ADR-665](../../../docs/06-decisions.md#adr-665)) — a ring's parallel bases are read off THAT RING.
 *
 * Measured on `main` b0ef3240 through `decideDeterministic2D`: «משולש ABC · AB מקביל ל-DE · AF גובה» dropped F onto DE
 * (a segment that is no side of the triangle), green; «טרפז ABCD · AD מקביל ל-EF · AG גובה» lost its base DC to BC
 * (the extra pair cancelled the real one); «EF קטע אמצעים» / «EL מקביל לבסיסים» after an unrelated parallel went to
 * the AI. Root cause: every reader counted the whole `ctx.parallels`. Fix: `ringParallelPairs` (both edges sides of
 * the ring), read by the altitude (`ringParallelBase`), the midsegment and the bases reader (`trapezoidBasePair`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { ctxOf } from '../../__tests__/scenario-pipeline';
import { parse } from '@/parser';

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

/** The side the height's foot is dropped onto, as a sorted pair («BC»), or the verdict kind when it is not a commit. */
async function heightSide(prefix: string[], line: string): Promise<string> {
  const v = await decide(prefix, line);
  if (v.kind !== 'commit') return v.kind;
  const foot = v.commands.find((c) => c.type === 'foot') as { a: string; b: string } | undefined;
  return foot ? [foot.a, foot.b].sort().join('') : 'no-foot';
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1965 — a height lands on a side of the shape it is in', () => {
  it.each([
    [['משולש ABC', 'AB מקביל ל-DE'], 'AF גובה', 'BC'],
    [['משולש ABC', 'AB מקביל ל-DE'], 'גובה מ-A', 'BC'],
    [['משולש ABC', 'AB מקביל ל-DE'], 'BF גובה', 'AC'],
    // a trapezoid whose real base an unrelated parallel through the apex used to cancel
    [['טרפז ABCD', 'AD מקביל ל-EF'], 'AG גובה', 'CD'],
    // the rows that were already right
    [['טרפז ABCD', 'AB מקביל ל-EF'], 'CG גובה', 'AB'],
    [['משולש ABC', 'AC מקביל ל-DE'], 'BF גובה', 'AC'],
  ])('%j · «%s» → the foot on %s', async (prefix, line, side) => {
    expect(await heightSide(prefix, line)).toBe(side);
  });

  it.each([
    ['A', 'CD'],
    ['B', 'CD'],
    ['C', 'AB'],
    ['D', 'AB'],
  ])('ADR-169 unchanged: the trapezoid height from %s drops onto %s', async (apex, side) => {
    expect(await heightSide(['טרפז ABCD'], `גובה מ-${apex}`)).toBe(side);
    expect(await heightSide(['טרפז ABCD', 'AD מקביל ל-EF'], `גובה מ-${apex}`)).toBe(side);
  });

  it.each([['טרפז שווה שוקיים ABCD'], ['טרפז ישר זווית ABCD']])('%s: the height from A drops onto the base CD', async (shape) => {
    expect(await heightSide([shape], 'AE גובה')).toBe('CD');
    expect(await heightSide([shape, 'AD מקביל ל-KL'], 'AE גובה')).toBe('CD');
  });

  it('a parallelogram (two own pairs) keeps the draw-one steer: the first opposite side BC', async () => {
    expect(await heightSide(['מקבילית ABCD'], 'AE גובה')).toBe('BC');
  });

  it('the reported figure: F on line BC, AF ⟂ BC, verified', () => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(['משולש ABC', 'AB מקביל ל-DE', 'AF גובה']);
    expect(refused).toEqual([]);
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    const [A, B, C, F] = ['A', 'B', 'C', 'F'].map((id) => fig.positions.get(id)!);
    expect(Math.abs((B.x - C.x) * (F.y - C.y) - (B.y - C.y) * (F.x - C.x))).toBeLessThan(1e-6);
    expect(Math.abs((A.x - F.x) * (B.x - C.x) + (A.y - F.y) * (B.y - C.y))).toBeLessThan(1e-6);
  });
});

describe("#2090 — the midsegment and «מקביל לבסיסים» read the trapezoid ring's own pair", () => {
  it.each([
    [['טרפז ABCD', 'AC מקביל ל-KL'], ['טרפז ABCD'], 'EF קטע אמצעים'],
    [['טרפז ABCD', 'AC מקביל ל-KL'], ['טרפז ABCD'], 'EL מקביל לבסיסים'],
  ])('%j · «%s» decides exactly as without the unrelated parallel', async (withPar, control, line) => {
    const a = await decide(withPar, line);
    const b = await decide(control, line);
    expect(a.kind).toBe(b.kind);
    if (b.kind === 'commit') expect(a.kind === 'commit' && a.commands).toEqual(b.commands);
  });

  it('«E על AD» first: «EL מקביל לבסיסים» lowers to the same commands as without the unrelated parallel', () => {
    // The verdicts may differ: L is a POINT of «KL» in the first figure and new in the control, and the control is
    // refused by #2102 (a separate false refusal). What this reader decides — the bases — is the same.
    const lower = (prefix: string[]) => {
      useGeoStore.getState().clear();
      const { facts } = driveThroughGate(prefix);
      const r = parse('EL מקביל לבסיסים', ctxOf(facts));
      return r.ok ? r.commands : r.reason;
    };
    expect(lower(['טרפז ABCD', 'AC מקביל ל-KL', 'E על AD'])).toEqual(lower(['טרפז ABCD', 'E על AD']));
  });

  it('with the unrelated parallel, both lines commit deterministically (never the AI)', async () => {
    expect((await decide(['טרפז ABCD', 'AC מקביל ל-KL'], 'EF קטע אמצעים')).kind).toBe('commit');
    expect((await decide(['טרפז ABCD', 'AC מקביל ל-KL'], 'EL מקביל לבסיסים')).kind).toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a parallelogram is still ambiguous for «מקביל לבסיסים» (two own pairs): not guessed', async () => {
    expect((await decide(['מקבילית ABCD'], 'EL מקביל לבסיסים')).kind).not.toBe('commit');
  });
});
