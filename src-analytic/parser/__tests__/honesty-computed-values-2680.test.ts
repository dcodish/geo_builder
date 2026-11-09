/**
 * #2680 ([ADR-AG-405](../../../docs/06c-decisions-analytic.md#adr-ag-405)) — an AI answer that COMPUTES a stated value is
 * accepted when its curve really has that value (operator ruling 2026-11-04, round #2697 card q2 = B: *"Accept when the
 * answer's curve really has the value"*). This lifts ADR-AG-279's refusal of `y=4x-5` for «(2,3), slope 4».
 *
 * The test reads the value's stated ROLE, so a value the curve holds in ANOTHER role stays refused: «x^2+y^2=25» passes
 * through (3,4), and that does not pay a stated CENTRE (3,4).
 *
 * **No live call** (standing rule 2): every model answer is a stub, authored by the session as the oracle.
 */
import { describe, expect, it, vi } from 'vitest';
import { faithfulnessAnalytic } from '../honestyAnalytic';
import { fallbackRefusal, runFallback } from '../../app/fallback';

const dropped = (utterance: string, answer: string[]): string[] => faithfulnessAnalytic(utterance, answer, new Set()).dropped;

describe('#2680 — a value the answer computed, and its curve really has, is paid', () => {
  it.each<[string, string, string]>([
    // the five rows the thread left for the ruling, and the plan's lock
    ['a diameter halved', 'מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 9'],
    ['a point the circle passes through', 'מעגל שמרכזו (0,0) ועובר דרך (3,0)', 'x^2 + y^2 = 9'],
    ['a point the line passes through', 'ישר ששיפועו 1 ועובר דרך (0,3)', 'y = x + 3'],
    ['a parabola’s focus', 'פרבולה שמוקדה (1,0)', 'y^2 = 4x'],
    ['an ellipse’s foci and major axis', 'אליפסה שמוקדיה (4,0) ו-(-4,0) וצירה הגדול 10', 'x^2/25 + y^2/9 = 1'],
    ['ADR-AG-279’s own refused row', 'ישר שעובר דרך (2,3) ושיפועו 4', 'y=4x-5'],
    // the other spellings of each role
    ['English', 'a line through (2,3) with slope 4', 'y=4x-5'],
    ['English diameter', 'circle with diameter 6 and centre (0,0)', 'x^2 + y^2 = 9'],
    ['English focus', 'parabola with focus (1,0)', 'y^2 = 4x'],
    ['«דרך הנקודה»', 'ישר דרך הנקודה (2,3) ששיפועו 4', 'y=4x-5'],
    ['«עובר בנקודה»', 'ישר העובר בנקודה (2,3) ושיפועו 4', 'y=4x-5'],
    ['a list of points', 'ישר דרך (1,2) ו-(3,4)', 'y=x+1'],
    ['a y-major ellipse', 'אליפסה שמוקדיה (0,4) ו-(0,-4)', 'x^2/9 + y^2/25 = 1'],
    ['a minor axis and the distance between the foci', 'אליפסה שהמרחק בין המוקדים 8 וצירה הקטן 6', 'x^2/25 + y^2/9 = 1'],
    ['a directrix', 'פרבולה שהמדריך שלה x=-1', 'y^2=4x'],
    ['an x-intercept', 'ישר ששיפועו 3 וחותך את ציר x ב-2', 'y=3x-6'],
    ['a pair on an axis, by its crossing', 'ישר ששיפועו 3 וחותך את ציר x בנקודה (2,0)', 'y=3x-6'],
    ['a radical coordinate', 'מעגל שמרכזו (0,0) ועובר דרך (√2,√2)', 'x^2 + y^2 = 4'],
  ])('%s: «%s» answered «%s»', (_name, utterance, answer) => {
    expect(dropped(utterance, [answer])).toEqual([]);
  });

  it.each<[string, string, string]>([
    ['a diameter paid by a stated radius', 'מעגל O שקוטרו 6', 'מעגל O ברדיוס 3'],
    ['a radius paid by a stated diameter', 'מעגל O שרדיוסו 3', 'מעגל O בקוטר 6'],
    ['an unnamed circle', 'מעגל שקוטרו 6', 'מעגל ברדיוס 3'],
  ])('with no equation in the answer, %s: «%s» answered «%s»', (_name, utterance, answer) => {
    expect(dropped(utterance, [answer])).toEqual([]);
  });
});

describe('#2680 — a value the curve does not have stays refused, naming it', () => {
  it.each<[string, string, string, string[]]>([
    ['the plan’s wrong diameter', 'מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 16', ['6']],
    ['the plan’s wrong slope', 'ישר שעובר דרך (2,3) ושיפועו 4', 'y=3x-3', ['4']],
    // ADR-AG-449: the contradicted role names its own values: the point is off the line, the slope 4 holds
    ['the point is not on the line', 'ישר שעובר דרך (2,3) ושיפועו 4', 'y=4x-1', ['2', '3']],
    ['the wrong focus', 'פרבולה שמוקדה (3,0)', 'y^2 = 4x', ['3']],
    ['the wrong intercept', 'ישר ששיפועו 3 וחותך את ציר x ב-2', 'y=3x-5', ['2']],
    ['the sign a pair states: (2,1) is on this circle, (-2,1) is not', 'מעגל שמרכזו (1,1) ועובר דרך (-2,1)', '(x-1)^2 + (y-1)^2 = 1', ['2', '1']],
  ])('%s: «%s» answered «%s»', (_name, utterance, answer, expected) => {
    expect(dropped(utterance, [answer])).toEqual(expected);
  });

  /** The role is what the test reads: each answer's curve holds the number, in a role the student did not state. */
  it.each<[string, string, string, string[]]>([
    ['a stated CENTRE the curve only passes through', 'מעגל שמרכזו (3,4) ורדיוסו 5', 'x^2 + y^2 = 25', ['3', '4']],
    ['a stated RADIUS that is the curve’s diameter', 'מעגל שרדיוסו 6 ומרכזו (0,0)', 'x^2 + y^2 = 9', ['6']],
    ['«חצי קוטר» is a radius, not a diameter', 'מעגל שחצי קוטר 6 ומרכזו (0,0)', 'x^2 + y^2 = 9', ['6']],
    ['a semi-major axis, not an axis', 'אליפסה שחצי צירה הגדול 10', 'x^2/25 + y^2/9 = 1', ['10']],
    ['a list stops at a pair with no role', 'מעגל שעובר דרך (5,0) ומרכזו (3,4)', 'x^2 + y^2 = 25', ['3', '4']],
    // ADR-AG-449: the focus (1/2, 0) has neither coordinate
    ['a stated focus that is only a point of the curve', 'פרבולה שמוקדה (8,4)', 'y^2 = 2x', ['8', '4']],
  ])('%s: «%s» answered «%s»', (_name, utterance, answer, expected) => {
    expect(dropped(utterance, [answer])).toEqual(expected);
  });
});

/**
 * #2680 ([ADR-AG-449](../../../docs/06c-decisions-analytic.md#adr-ag-449), operator ruling 2026-11-06: *"We would want the
 * correct to be accepted and wrong not"*) — THE ROLE DECIDES. Each answer below holds the stated number somewhere (an
 * exponent, a square, a root, another parameter), and its curve contradicts the role the student gave it. Before, the
 * number paid by coincidence and the answer was accepted.
 */
describe('#2680 — a value whose stated role the curve contradicts is refused, whatever pays the number', () => {
  const gate = (utterance: string, answer: string[]) => faithfulnessAnalytic(utterance, answer, new Set());

  it.each<[string, string, string, string[], string[]]>([
    // the plan's three measured rows
    ['a focus paid by the parabola’s p', 'פרבולה שמוקדה (2,0)', 'y^2 = 4x', ['2'], ['שמוקדה (2,0)']],
    ['a diameter paid by the root of r²', 'מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 36', ['6'], ['שקוטרו 6']],
    ['foci paid by the semi-minor axis', 'אליפסה שמוקדיה (4,0) ו-(-4,0) וצירה הגדול 10', 'x^2/25 + y^2/16 = 1', ['4', '4'], ['שמוקדיה (4,0) ו-(-4,0)']],
    // the same class in the roles the plan lists
    ['a radius paid by the equation’s constant', 'מעגל שרדיוסו 6 ומרכזו (0,0)', 'x^2 + y^2 = 6', ['6'], ['שרדיוסו 6']],
    ['a slope paid by the intercept', 'ישר ששיפועו 2 ועובר דרך (0,3)', 'y = 3x + 2', ['2', '0', '3'], ['ששיפועו 2', 'דרך (0,3)']],
    ['a slope’s sign', 'ישר ששיפועו -2 ועובר דרך (0,3)', 'y = 2x + 3', ['2'], ['ששיפועו -2']],
    ['a major axis paid by a square', 'אליפסה שצירה הגדול 4', 'x^2/16 + y^2/9 = 1', ['4'], ['שצירה הגדול 4']],
    ['a directrix', 'פרבולה שהמדריך שלה x=-2', 'y^2 = 2x', ['2'], ['שהמדריך שלה x=-2']],
    ['English', 'parabola with focus (2,0)', 'y^2 = 4x', ['2'], ['focus (2,0)']],
  ])('%s: «%s» answered «%s»', (_name, utterance, answer, dropped, contradicted) => {
    expect(gate(utterance, [answer])).toMatchObject({ dropped, contradicted });
  });

  it.each<[string, string, string]>([
    // the correct twins of the plan's rows
    ['the right focus', 'פרבולה שמוקדה (2,0)', 'y^2 = 8x'],
    ['the right diameter', 'מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 9'],
    ['the right foci', 'אליפסה שמוקדיה (4,0) ו-(-4,0) וצירה הגדול 10', 'x^2/25 + y^2/9 = 1'],
    ['the right radius', 'מעגל שרדיוסו 6 ומרכזו (0,0)', 'x^2 + y^2 = 36'],
    ['the right signed slope', 'ישר ששיפועו -2 ועובר דרך (0,3)', 'y = -2x + 3'],
  ])('%s is still accepted: «%s» answered «%s»', (_name, utterance, answer) => {
    expect(gate(utterance, [answer])).toMatchObject({ dropped: [], contradicted: [] });
  });

  it.each<[string, string, string[]]>([
    // a role with no curve of its kind to test it on keeps the number gate
    ['no equation: the answer restates the radius', 'מעגל O שרדיוסו 3', ['מעגל O ברדיוס 3']],
    ['the answer restates the pair as a given, outside any equation', 'ישר דרך (2,3) המקביל לישר y=2x', ['ישר דרך (2,3) המקביל לישר y=2x']],
    ['a focus, and no parabola or ellipse drawn', 'פרבולה שמוקדה (2,0)', ['F(2,0)']],
  ])('%s: «%s» answered %j', (_name, utterance, answer) => {
    expect(gate(utterance, answer)).toMatchObject({ dropped: [], contradicted: [] });
  });
});

describe('#2680 — end to end through the model lane (mocked)', () => {
  it.each<[string, string[]]>([
    ['מעגל שקוטרו 6 ומרכזו (0,0)', ['x^2 + y^2 = 9']],
    ['ישר שעובר דרך (2,3) ושיפועו 4', ['y=4x-5']],
    ['פרבולה שמוקדה (1,0)', ['y^2 = 4x']],
  ])('«%s» commits', async (utterance, steps) => {
    const ask = vi.fn().mockResolvedValue({ steps });
    const out = await runFallback(utterance, [], 0, ask);
    expect(out.kind, JSON.stringify(out)).toBe('lines');
  });

  it.each<[string, string, string[]]>([
    ['מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 16', ['6']],
    ['ישר שעובר דרך (2,3) ושיפועו 4', 'y=3x-3', ['4']],
    ['מעגל שמרכזו (3,4) ורדיוסו 5', 'x^2 + y^2 = 25', ['3', '4']],
  ])('«%s» answered «%s» is refused, naming the value', async (utterance, answer, names) => {
    const ask = vi.fn().mockResolvedValue({ steps: [answer] });
    const out = await runFallback(utterance, [], 0, ask);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: names });
    if (out.kind !== 'unfaithful') throw new Error('expected an unfaithful answer');
    expect(fallbackRefusal(out, utterance, { key: 'not-handled', detail: utterance })).toMatchObject({ key: 'llm-dropped' });
  });
});
