/**
 * #2491 ([ADR-AG-401](../../docs/06c-decisions-analytic.md#adr-ag-401); ADR-W-118 B2; 2-D's ADR-542) — A GIVEN THE FIGURE
 * ALREADY SATISFIES, THAT ADDS A STATED VALUE, RECORDS, AND ITS VALUE IS DRAWN.
 *
 * Operator, 2026-10-24 (round #2466 T29): *"In this case, the AB=4 does add value. not for the data which we know but the
 * tool can draw 4 on the segment"*. «A(0,0)» · «B(4,0)» · «AB» · «AB = 4» answered «זה כבר קיים באיור» with no row, and
 * the 4 was nowhere. The entailment gate (#1063) judged only whether the line changes the solution, never whether it
 * adds something the student can SEE. Ruling 2026-10-24 (card e18, A): an area restated is recorded and shown too.
 */
import { describe, expect, it } from 'vitest';
import { addsStatedValue, decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

/** Every line but the last is context and must record; then the last line's verdict and, on record, the derivation. */
function last(lines: readonly string[], seed = 0) {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» is context and must record`).toBe('record');
    held.push(line);
  }
  const line = lines[lines.length - 1];
  const verdict = decideSubmit(line, held, seed);
  return { verdict, after: verdict.kind === 'record' ? derive([...held, line], seed) : null };
}

const pair = (a: string, b: string) => [a, b].sort().join('');

describe('#2491 — the operator\'s four lines record and the 4 is on AB', () => {
  it('«A(0,0)» · «B(4,0)» · «AB» · «AB = 4»', () => {
    const { verdict, after } = last(['A(0,0)', 'B(4,0)', 'AB', 'AB = 4']);
    expect(verdict.kind).toBe('record');
    expect(after!.faults).toEqual([]);
    expect(after!.stated.lengths.map((l) => [pair(l.a, l.b), 'num' in l.value ? l.value.num : l.value.text])).toContainEqual(['AB', 4]);
  });
});

type Row = [string, string[], (s: ReturnType<typeof derive>['stated']) => boolean];
const CLASS: Row[] = [
  ['a length: «BC = 4» on a square with AB = 4', ['ריבוע ABCD', 'AB = 4', 'BC = 4'], (s) => s.lengths.some((l) => pair(l.a, l.b) === 'BC')],
  ['a length: «AC = 4» on an equilateral triangle', ['משולש שווה צלעות ABC', 'AB = 4', 'AC = 4'], (s) => s.lengths.some((l) => pair(l.a, l.b) === 'AC')],
  ['a length: «AC = 5» on 3-4-5', ['משולש ABC', '∢ABC = 90', 'AB = 3', 'BC = 4', 'AC = 5'], (s) => s.lengths.some((l) => pair(l.a, l.b) === 'AC')],
  ['a length: «BC = 5» on coordinates', ['A(0,0)', 'B(3,0)', 'C(0,4)', 'משולש ABC', 'BC = 5'], (s) => s.lengths.some((l) => pair(l.a, l.b) === 'BC')],
  ['an angle: «∢C = 70» after the other two', ['משולש ABC', '∢A = 50', '∢B = 60', '∢C = 70'], (s) => s.angles.some((a) => a.v === 'C')],
  ['an angle: «∢BAC = 45» on coordinates', ['A(0,0)', 'B(1,0)', 'C(1,1)', 'משולש ABC', '∢BAC = 45'], (s) => s.angles.some((a) => a.v === 'A')],
  ['an angle: «∢ABC = 60» equilateral', ['משולש שווה צלעות ABC', '∢ABC = 60'], (s) => s.angles.some((a) => a.v === 'B')],
  ['an area: «שטח המשולש ABC הוא 6» on coordinates', ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'שטח המשולש ABC הוא 6'], (s) => s.areas.length === 1],
  ['an area: «שטח הריבוע ABCD הוא 16»', ['ריבוע ABCD', 'AB = 4', 'שטח הריבוע ABCD הוא 16'], (s) => s.areas.length === 1],
];

describe('#2491 — the class: a value the figure already satisfies records and is drawn', () => {
  it.each(CLASS)('%s', (_name, lines, shows) => {
    const { verdict, after } = last(lines);
    expect(verdict.kind).toBe('record');
    expect(after!.faults).toEqual([]);
    expect(shows(after!.stated)).toBe(true);
  });

  it('the same in the English spelling', () => {
    expect(last(['square ABCD', 'AB = 4', 'BC = 4']).verdict.kind).toBe('record');
  });
});

const CONTROLS: Array<[string, string[], string]> = [
  ['the same value twice', ['A(0,0)', 'B(4,0)', 'AB = 4', 'AB = 4'], 'already-known'],
  ['a right angle twice', ['משולש ABC', '∢ABC = 90', '∢ABC = 90'], 'already-known'],
  ['«∢ABC = 90» after «AB ⟂ BC» (the knee is already drawn)', ['משולש ABC', 'AB ⟂ BC', '∢ABC = 90'], 'already-known'],
  ['«AB ⟂ BC» after «∢ABC = 90»', ['משולש ABC', '∢ABC = 90', 'AB ⟂ BC'], 'already-known'],
  ['a radius twice', ['מעגל O ברדיוס 5', 'רדיוס המעגל O הוא 5'], 'already-known'],
  ['a line that states no value', ['A(0,0)', 'B(4,0)', 'B נמצא על ציר ה-x'], 'already-follows'],
  ['another spelling of a value already shown', ['קטע AB', 'AB=a+3', 'AB=3+a'], 'already-follows'],
  // The knee is not counted (ADR-AG-401: «∢ABC = 90» and «AB ⟂ BC» are one constraint here; the ⟂ restatement stays a no-op).
  ['a perpendicularity the pinned points already have', ['A(0,0)', 'B(4,0)', 'C(0,3)', 'AB', 'AC', 'AB מאונך ל-AC'], 'already-follows'],
  ['a right angle the square already has (not delivered: see ADR-AG-401)', ['ריבוע ABCD', '∢ABC = 90'], 'already-follows'],
];

describe('#2491 — a line whose value is already shown, or that states none, keeps the no-op answer', () => {
  it.each(CONTROLS)('%s', (_name, lines, kind) => {
    expect(last(lines).verdict.kind).toBe(kind);
  });

  it('a contradicting value is still refused', () => {
    expect(last(['A(0,0)', 'B(4,0)', 'AB = 4', 'AB = 5']).verdict.kind).toBe('refused');
  });
});

describe('#2491 — the predicate reads what is labelled, never a count', () => {
  it('a new key is a value; the same key in another spelling is not', () => {
    const none = derive(['A(0,0)', 'B(4,0)', 'AB'], 0);
    const ab = derive(['A(0,0)', 'B(4,0)', 'AB', 'AB = 4'], 0);
    const ba = derive(['A(0,0)', 'B(4,0)', 'AB', 'BA = 4'], 0);
    expect(addsStatedValue(none, ab)).toBe(true);
    expect(addsStatedValue(ab, ba)).toBe(false);
    expect(addsStatedValue(ab, ab)).toBe(false);
  });
});
