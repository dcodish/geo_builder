/**
 * THE ASK LANE'S KNOWLEDGE GATE SEES EVERY LANE (#1450, ADR-3D-271).
 *
 * External review (2026-09-27): asking «k» answered «הנקודות האלו אינן בציור» — a note about
 * points, for a letter — while the panel printed «k = 2» one column over. Four more gate misses
 * measured: a positive-parameter figure, a free injected vector, a cone's own stated height, and
 * the distance between two equation planes — each a value the figure determined and the ask
 * withheld (or mis-noted).
 *
 * The fixes are the #481 rule (one decision, two surfaces) and the #517 class (the private
 * enumeration of absolute scale sources, three members added: revolution dims, stated-equation
 * plane pairs, numeric pair injections).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const ask = (q: string) => {
  const st = useGeo3.getState();
  return answerQuery(derive3(st.facts, st.seed).construction, q, st.seed);
};

beforeEach(reset);

describe('#1450 — the five measured rows answer their values', () => {
  it('a pivot-lane symbol answers from the PANEL’s own row — «k = 2», never a note about points', () => {
    submit('פירמידה משולשת ABCD');
    submit('AB = (k-1,k,3)');
    submit('k = 2');
    const a = ask('k');
    expect(a.answer).toBe('k = 2');
    // The lock CALLS the panel's decision (the #481 rule): query and panel cannot disagree.
    const st = useGeo3.getState();
    const row = dataView(derive3(st.facts, st.seed).construction, st.seed).params.find((p) => p.sym === 'k')!;
    expect(a.answer).toBe(row.text);
  });

  it('a free injected vector answers its components and its length', () => {
    submit('וקטור AB');
    submit('AB = (1,2,3)');
    expect(ask('AB').answer).toBe('(1, 2, 3)');
    expect(ask('|AB|').answer).toBe('3.74');
  });

  it('a cone’s stated height is real — «|SO|» answers 12, never «תלוי בקנה המידה»', () => {
    submit('חרוט שקודקודו S ומרכז בסיסו O, רדיוס הבסיס 5 וגובהו 12');
    expect(ask('|SO|').answer).toBe('12');
  });

  it('two equation planes fix their distance — 2, in the world’s own units', () => {
    submit('π1: z=3');
    submit('π2: z=1');
    expect(ask('המרחק בין π1 ל-π2').answer).toBe('2');
  });
});

describe('#1450 — the gate still withholds what is NOT knowledge', () => {
  it('a detached free cube’s edge stays undetermined — the frozen gauge is not a value', () => {
    submit('קובייה ABCDEFGH');
    const a = ask('AB');
    expect(a.answer).toBeNull();
  });

  it('an unstated symbol is undetermined — in a note about a symbol, never about points', () => {
    submit('פירמידה משולשת ABCD');
    submit('AB = (k-1,k,3)');
    const a = ask('k');
    expect(a.answer).toBeNull();
    expect(a.note).toBe('undetermined');
  });
});
