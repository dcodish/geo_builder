/**
 * #1798 / #553 ([ADR-598](../../../docs/06-decisions.md#adr-598)) — a one-line compound is ALL OR NOTHING.
 *
 * Operator ruling, 2026-10-06: *"when a user enters several clauses in one line and one of them fails, reject
 * the entire line. so we accept all or none"* — compounds stay allowed («AB=4, CD=3», «AB=u, AC=v, AS=w») when
 * every clause is honoured, and every rejection is the one shared `input.scope.split-statements` message.
 *
 * Measured on the #1795 tip (7f4a170c) through `decideDeterministic2D`, the LLM mocked:
 *  - «מרובע ABCD» · «AB מקביל ל-CD ו-D על BC» committed `set-parallel` with «D על BC» gone, green;
 *  - «משולש ABC» · «מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC» committed the ⊥ with the circle gone, green;
 *  - #553's «ריבוע ABCD» · «F אמצע DO, O - חיתוך של AC ו-BD» (both orders, and the «ן-» typo) escalated
 *    `weak:dropped` to a paid call, against the 2026-10-04 ruling ("they should be 2 lines").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { clausesOf } from '../independence';
import { compoundNotHonoured, droppedClause } from '../clauseCoverage';
import { parse } from '@/parser';
import { ctxOf } from '../../__tests__/scenario-pipeline';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1798 — a clause is not honoured: the whole line is refused with the shared message', () => {
  it.each([
    [['מרובע ABCD'], 'AB מקביל ל-CD ו-D על BC', ['AB מקביל ל-CD', 'D על BC']],
    [['מרובע ABCD'], 'AB מאונך ל-CD ו-D על BC', ['AB מאונך ל-CD', 'D על BC']],
    [['משולש ABC'], 'מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC', ['מעגל חוסם את המשולש ABC', 'AD מאונך ל-BC']],
    // #553, folded in by the 2026-10-06 ruling: both orders, and the «ן-» typo the prod line carried
    [['ריבוע ABCD'], 'F אמצע DO, O - חיתוך של AC ו-BD', ['F אמצע DO', 'O - חיתוך של AC ו-BD']],
    [['ריבוע ABCD'], 'O - חיתוך של AC ו-BD, F אמצע DO', ['O - חיתוך של AC ו-BD', 'F אמצע DO']],
    [['ריבוע ABCD'], 'F אמצע DO, O - חיתוך של AC ן-BD', ['F אמצע DO', 'O - חיתוך של AC ן-BD']],
  ] as [string[], string, string[]][])('«%s» · «%s» is refused whole, naming its clauses, with no paid call', async (prefix, line, clauses) => {
    const v = await decide(prefix, line);
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.category).toBe('guided');
    expect(v.note).toMatchObject({ key: 'input.scope.split-statements', params: { all: clauses.map((c, i) => `(${i + 1}) ${c}`).join('  ') } });
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
    expect('commands' in v, 'a refusal carries nothing to commit').toBe(false);
    expect(v.binds, 'and changes nothing on the figure').toEqual([]);
  });

  it('the taught lines build one by one, through the real gate (#553)', () => {
    for (const order of [
      ['ריבוע ABCD', 'O - חיתוך של AC ו-BD', 'F אמצע DO'],
      ['ריבוע ABCD', 'F אמצע DO', 'O - חיתוך של AC ו-BD'],
    ]) {
      const { facts, refused } = driveThroughGate(order);
      expect(refused, order.join(' · ')).toEqual([]);
      const f = replay(facts, 0);
      const [A, C, D, O, F] = ['A', 'C', 'D', 'O', 'F'].map((k) => f.positions.get(k)!);
      expect(Math.hypot(O.x - (A.x + C.x) / 2, O.y - (A.y + C.y) / 2), 'O is the diagonals’ crossing').toBeLessThan(1e-6);
      expect(Math.hypot(F.x - (D.x + O.x) / 2, F.y - (D.y + O.y) / 2), 'F is the midpoint of DO').toBeLessThan(1e-6);
    }
  });
});

describe('#1798 — every clause honoured: the compound commits as before (the operator’s own examples)', () => {
  it.each([
    [['מרובע ABCD'], 'AB=4, CD=3'],
    [['משולש ABC'], 'AB=4, BC=3'],
    [['משולש ABC'], 'AB=u, AS=w'],
    [['משולש ABC'], 'AB=u, AC=v, AS=w'],
    [[], 'ריבוע ABCD, נקודה G על AD'],
    [[], 'מעגל O, נקודה A על המעגל'],
    // a piece with no subject continues the clause before it — one statement about AB, two predicates
    [['מעגל O', 'מעגל P'], 'AB מיתר במעגל O ומשיק למעגל P'],
    // #1795's split reading of a compound about existing points
    [['משולש ABC'], 'מעגל שקוטרו AB ו-C על המעגל'],
  ] as [string[], string][])('«%s» · «%s» commits', async (prefix, line) => {
    const v = await decide(prefix, line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('two independent constructs keep their split ADVISORY on a successful step (#786)', async () => {
    const v = await decide([], 'משולש ABC, ריבוע DEFG');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.note).toMatchObject({ key: 'input.scope.split-advisory' });
  });
});

describe('#1798 — the one splitter keeps operand pairs, subjects and decimals together', () => {
  it.each([
    ['AB מקביל ל-CD ו-D על BC', ['AB מקביל ל-CD', 'D על BC']],
    ['מעגל חוסם את המשולש ABC ו-AD מאונך ל-BC', ['מעגל חוסם את המשולש ABC', 'AD מאונך ל-BC']],
    ['O - חיתוך של AC ו-BD', ['O - חיתוך של AC ו-BD']],
    ['D ו-E על BC', ['D ו-E על BC']],
    ['נקודות F, G, H על הקטעים AB, AC, CB', ['נקודות F, G, H על הקטעים AB, AC, CB']],
    ['AB = 2.5', ['AB = 2.5']],
    ['AB מיתר במעגל O ומשיק למעגל P', ['AB מיתר במעגל O ומשיק למעגל P']],
    ['AB=4, CD=3', ['AB=4', 'CD=3']],
  ])('«%s»', (line, clauses) => {
    expect(clausesOf(line)).toEqual(clauses);
  });
});

describe('#1798 — the coverage judgement itself', () => {
  it('a clause the whole line carries in its own type is covered; one it lost is not', () => {
    const ctx = ctxOf(driveThroughGate(['מרובע ABCD']).facts);
    const r = parse('AB מקביל ל-CD ו-D על BC', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // with an entailment test that never finds the clause implied, the lost «D על BC» is a drop
    expect(droppedClause('AB מקביל ל-CD ו-D על BC', r.commands, ctx, () => false)).toMatchObject({ messageKey: 'input.scope.split-statements' });
    // the same line with both clauses carried is not
    const both = [...r.commands, { type: 'point-on-segment', id: 'D', a: 'B', b: 'C' } as const];
    expect(droppedClause('AB מקביל ל-CD ו-D על BC', both, ctx, () => false)).toBeNull();
  });

  it('a declaration of an object the figure already has is a reference, not a lost given', () => {
    const ctx = ctxOf(driveThroughGate(['מעגל A', 'מעגל B']).facts);
    const cmds = [{ type: 'circle-circle-intersection', id: 'G', circle1: 'circle-A', circle2: 'circle-B', branch: 0 }] as const;
    expect(droppedClause('G חיתוך מעגל A ומעגל B', [...cmds], ctx, () => false)).toBeNull();
  });

  it('the weak path offers the split only when every clause reads on its own', () => {
    const ctx = ctxOf(driveThroughGate(['ריבוע ABCD']).facts);
    expect(compoundNotHonoured('F אמצע DO, O - חיתוך של AC ו-BD', ctx)).toMatchObject({ messageKey: 'input.scope.split-statements' });
    expect(compoundNotHonoured('F אמצע DO, זה לא משפט בכלל', ctx)).toBeNull();
  });
});
