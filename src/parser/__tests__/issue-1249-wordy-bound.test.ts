/**
 * #1249 ([ADR-539](../../../docs/06-decisions.md#adr-539)) — A BOUND STATED THE WORDY WAY IS THE SAME
 * BOUND, AND «לפחות» / «לכל היותר» ARE THE NON-STRICT WORDS.
 *
 * Operator, 2026-09-19 (round #1244 T5): *"rejected and not accepted. it is true that there is no way to
 * show this but this is something that should be part of future buildings of the shape"*. Measured:
 * «BC > 10» and five siblings lowered to `set-length-bound`; «אורך הקטע BC גדול מ-10» — the spelling a
 * student writes after an exam question — lowered to the segment alone, the 10 dropped.
 *
 * Every row is a PARITY assertion against its bare twin, never a hand-written expectation: the verbose
 * frame is stripped and the relation handed verbatim to the rule that owns it (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';

const cmds = (u: string): unknown[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands as unknown[];
};
const boundOf = (u: string) => (cmds(u) as { type: string }[]).find((c) => c.type === 'set-length-bound') as
  | { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }
  | undefined;

describe('#1249 — the wordy frame routes a bound to the bound rule', () => {
  it.each([
    ['אורך הקטע BC גדול מ-10', 'BC גדול מ-10'],
    ['אורך הקטע BC קטן מ-10', 'BC קטן מ-10'],
    ['אורך הקטע BC > 10', 'BC > 10'],
    ['אורך הקטע BC ≥ 10', 'BC ≥ 10'],
    ['אורך הקטע BC < 10', 'BC < 10'],
    ['הקטע BC > 10', 'BC > 10'],
    ['הצלע BC > 10', 'BC > 10'],
    ['אורך BC > 10', 'BC > 10'],
    ['אורך הצלע BC קטן מ-10', 'BC קטן מ-10'],
    ['אורך הקטע BC בין 5 ל-9', 'BC בין 5 ל-9'],
    ['אורך הקטע BC לפחות 10', 'BC לפחות 10'],
    ['אורך הקטע BC לכל היותר 10', 'BC לכל היותר 10'],
  ])('«%s» produces exactly what «%s» produces', (wordy, bare) => {
    expect(cmds(wordy)).toEqual(cmds(bare));
    expect(boundOf(bare), 'the bare twin is a bound, so the row proves routing and not two equal failures').toBeDefined();
  });

  it('«לפחות» / «לכל היותר» / "at least" / "at most" are NON-STRICT — they admit their value, as ≥ / ≤ do', () => {
    expect(boundOf('BC לפחות 10')).toMatchObject({ min: 10, minStrict: false });
    expect(boundOf('BC לפחות 10')?.max).toBeUndefined();
    expect(boundOf('BC לכל היותר 10')).toMatchObject({ max: 10, maxStrict: false });
    expect(boundOf('BC לכל היותר 10')?.min).toBeUndefined();
    expect(cmds('BC at least 10')).toEqual(cmds('BC לפחות 10'));
    expect(cmds('BC at most 10')).toEqual(cmds('BC לכל היותר 10'));
    expect(cmds('BC לפחות 10')).toEqual(cmds('BC ≥ 10'));
    expect(cmds('BC לכל היותר 10')).toEqual(cmds('BC ≤ 10'));
  });

  it('the EQUALITY still routes to the equality — the row that proves routing by connective did not blur the two', () => {
    expect(cmds('אורך הקטע BC = 10')).toEqual(cmds('BC = 10'));
    expect(cmds('אורך הקטע BC הוא 10')).toEqual(cmds('BC = 10'));
    expect((cmds('אורך הקטע BC = 10') as { type: string }[]).some((c) => c.type === 'set-distance')).toBe(true);
  });

  it('#1248 stays closed: no non-copula connective yields an equality', () => {
    for (const u of ['אורך הקטע BC > 10', 'אורך הקטע BC גדול מ-10', 'אורך הקטע BC לפחות 10', 'אורך הקטע BC לכל היותר 10']) {
      expect((cmds(u) as { type: string }[]).some((c) => c.type === 'set-distance'), u).toBe(false);
    }
  });

  it('the bound genuinely constrains what is built next — «אורך הקטע BC גדול מ-10» refuses a later «BC = 4»', () => {
    const fig = replay(factsOf(['משולש ABC', 'אורך הקטע BC גדול מ-10', 'BC = 4'] as never));
    const last = String(Object.values(fig.status).at(-1));
    expect(last, 'the equality row is refused against the bound').toMatch(/^over-constrained: \|BC\| = 4 cannot hold/);
    // parity with the bare twin — the same verdict, the same classification
    const bare = replay(factsOf(['משולש ABC', 'BC גדול מ-10', 'BC = 4'] as never));
    expect(String(Object.values(bare.status).at(-1))).toBe(last);
    expect(fig.pending).toBe(bare.pending);
  });

  it('and a non-strict wordy bound admits its own value — «אורך הקטע BC לפחות 10» then «BC = 10» builds (#1265)', () => {
    const fig = replay(factsOf(['משולש ABC', 'אורך הקטע BC לפחות 10', 'BC = 10'] as never));
    expect(fig.lastError).toBeNull();
    const B = fig.positions.get('B')!, C = fig.positions.get('C')!;
    expect(Math.hypot(B.x - C.x, B.y - C.y)).toBeCloseTo(10, 3);
  });
});
