/**
 * #2285 ([ADR-3D-417](../../../docs/06b-decisions-3d.md#adr-3d-417)) — A LONE ROOT IS PAID FOR BY ITS VALUE, NEVER BY ITS IMPLIED /1.
 *
 * The 3-D number gate (`droppedGivenNumbers3`) accounted a lone radical «√2» by `[val, −val, num, den]`. For a term with
 * no slash, `num` is the value itself and `den` the synthetic 1, so the only candidate those two added was a 1 — and a
 * shape relation carries one routinely (`c: 1` on every isosceles, rhombus, square and kite relation). A reading that
 * dropped the root and kept the shape committed green. 2-D closed the same hole in ADR-700
 * (`src/parser/__tests__/dropped-given-fraction-parts.test.ts`, row «AB = √2» ⇐ `k(1)`); this is its port.
 *
 * No model is called (rule 2): the model-lane answers are canned and go through the real model-lane decision.
 */
import { describe, expect, it } from 'vitest';
import { droppedGivenNumbers3 } from '../honesty3';
import { parse3 } from '../parse3';
import { decideDeterministic3 } from '../../app/decideDeterministic3';
import { decideSteps3, type Fact3 } from '../../store/store3';
import type { Command3 } from '../../engine/types';

const cmds = (line: string): Command3[] => {
  const r = parse3(line);
  if (!r.ok) throw new Error(`«${line}» does not parse`);
  return r.commands;
};

describe('#2285 — a lone root against a payload that only carries a 1 is flagged', () => {
  it.each([
    ['AB = √2', 'AB = 1', '√2'],
    ['משולש שווה שוקיים ABC ו-AB = √2', 'משולש שווה שוקיים ABC', '√2'],
    ['ריבוע ABCD ו-AB = √2', 'ריבוע ABCD', '√2'],
    ['מעוין ABCD ו-AB = √3', 'מעוין ABCD', '√3'],
    ['AB = 5√2', 'AB = 5', '5√2'],
    ['AB = √(2)', 'AB = 1', '√(2)'],
    ['√2|u| = |v|', '|u| = |v|', '√2'],
  ])('«%s» answered «%s» drops «%s»', (stated, answer, root) => {
    expect(droppedGivenNumbers3(stated, cmds(answer))).toEqual([root]);
  });
});

describe('#2285 — a root read whole is still accounted', () => {
  it.each(['AB = √2', 'AB = 2√3', 'AB = √(3/4)', 'AB = √6/4', 'AB = 3√7/2', 'AB = 2*√7', '|AB| = √5', 'AD = √7'])('«%s» against its own reading → []', (line) => {
    expect(droppedGivenNumbers3(line, cmds(line))).toEqual([]);
  });

  it('a root a magnitude ratio carries as its reciprocal («√2|u| = |v|» → c = 1/√2) is accounted, as a bare coefficient is', () => {
    expect(droppedGivenNumbers3('√2|u| = |v|', cmds('√2|u| = |v|'))).toEqual([]);
    expect(droppedGivenNumbers3('2|u| = |v|', cmds('2|u| = |v|'))).toEqual([]);
  });

  it('a root and a 1 that are both stated each need their own carrier', () => {
    expect(droppedGivenNumbers3('משולש שווה שוקיים ABC ו-AB = √2', [...cmds('משולש שווה שוקיים ABC'), ...cmds('AB = √2')])).toEqual([]);
  });

  it('the fraction rule (ADR-3D-340) is unchanged: «1/2» against a lone 1 is still flagged, against 1 and 2 not', () => {
    expect(droppedGivenNumbers3('ריבוע ABCD ו-AB = 1/2', cmds('ריבוע ABCD'))).toEqual(['1/2']);
    expect(droppedGivenNumbers3('AB = 1/2', cmds('AB = 1/2'))).toEqual([]);
  });
});

describe('#2285 — end to end, on the model lane', () => {
  type St = { facts: Fact3[]; seed: number };
  const EMPTY: St = { facts: [], seed: 0 };

  it('a student line with a root, answered by the shape alone, is refused naming the root', () => {
    const line = 'משולש שווה שוקיים ABC שבו AB = √2';
    // the line's own reading, whatever lane takes it, never commits without the root
    const v = decideSteps3(EMPTY, line, ['משולש שווה שוקיים ABC']);
    expect(v).toEqual({ kind: 'refused', error: { code: 'dropped-given', items: '√2' } });
  });

  it('the same line answered whole builds', () => {
    const v = decideSteps3(EMPTY, 'משולש שווה שוקיים ABC שבו AB = √2', ['משולש שווה שוקיים ABC', 'AB = √2']);
    expect(v.kind).toBe('record');
  });

  it('the grammar lane is unchanged: «AB = √2» on a triangle records', () => {
    const t = decideDeterministic3(EMPTY, 'משולש ABC');
    if (t.kind !== 'record') throw new Error(t.kind);
    expect(decideDeterministic3({ facts: t.facts, seed: t.seed }, 'AB = √2').kind).toBe('record');
  });
});
