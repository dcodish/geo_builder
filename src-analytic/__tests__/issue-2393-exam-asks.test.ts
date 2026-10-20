/**
 * #2393 ([ADR-AG-316](../../docs/06c-decisions-analytic.md#adr-ag-316)) — THE ASK LANE READS THE EXAM'S QUESTIONS (phase R).
 *
 * Sayable ⇒ askable (02c R23): each exam question is a reference form the lane did not resolve, or a question shape it did
 * not frame. Every answer below is the real value through `derive` → `ask`, and each new spelling is held EQUAL to the
 * spelling the lane already answered («שיעורי A» ≡ «A», «משוואת המעגל שמרכזו M» ≡ «משוואת מעגל M»), and «משוואת l1» to
 * the panel row's own text — the two-resolver root cause.
 *
 * Phase Y (yes/no questions) is NOT built: operator ruling 2026-10-20 on #2393, «the tool doesnt answer such questions» —
 * they keep the lane's existing "unreadable" answer, locked below.
 *
 * Measured before (3cae7f25, model mocked): every exam spelling here answered `unreadable` or `missing`; «משוואת l1»
 * answered null beside a panel row listing two equations; «שיפוע המקום הגיאומטרי של M» said the figure had no curve so named.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { curveParts } from '../app/curveText';
import { panelKnowledge, valueText } from '../app/panelRows';
import { derive } from '../engine/derive';
import { knownValue } from '../engine/evaluate';
import { fmtAnalytic } from '../format';
import q1 from './fixtures/issue-2391-q1-exam-wording.analytic.json';
import q2 from './fixtures/issue-2391-q2-centres.analytic.json';

const Q1 = q1.lines;
const Q1_HEAD = Q1.slice(0, 5); // M stated (the tangents meet), MA = MB not yet
const Q1_G = [...Q1, 'שטח המשולש KLM הוא 9'];
const Q2 = q2.lines;
const Q2_TANGENT = [...Q2, 'המשיק למעגל M בנקודה T', 'T על מעגל N'];
const Q2_D = [...Q2, 'הישר l1: mx-y+n=0', 'הישר l1 משיק למעגל M', 'הישר l1 משיק למעגל N'];
const Q3_A = ['מעגל שמרכזו M(8,-3) משיק לישר 4x+3y+2=0 בנקודה A'];
const Q3_B = [...Q3_A, 'שני מעגלים שמרכזיהם בנקודות N₁ ו-N₂ והרדיוס של כל אחד מהם הוא 10 , משיקים למעגל M בנקודה A'];

const memo = new Map<string, ReturnType<typeof derive>>();
const fig = (lines: readonly string[]) => {
  const key = lines.join('\n');
  if (!memo.has(key)) memo.set(key, derive(lines, 0));
  return memo.get(key)!;
};
const answer = (lines: readonly string[], q: string) => {
  const { question: _q, locus: _l, ...rest } = ask(fig(lines), q, fmtAnalytic);
  return rest;
};
const value = (lines: readonly string[], q: string) => ask(fig(lines), q, fmtAnalytic).value;

describe('#2393 R1 — a point by «שיעורי»: the bare name’s own answer', () => {
  it.each([
    [Q1_G, 'מצאו את שיעורי הנקודה M', 'M'],
    [Q1_G, 'שיעורי M', 'M'],
    [Q3_A, 'מצאו את שיעורי הנקודה A', 'A'],
    [Q3_A, 'שיעורי הנקודה A', 'A'],
    [Q3_A, 'the coordinates of point A', 'A'],
    [Q3_A, 'the coordinates of A', 'A'],
  ])('%#: «%s» ≡ «%s»', (lines, q, bare) => {
    expect(answer(lines, q)).toEqual(answer(lines, bare));
    expect(value(lines, q)).not.toBeNull();
  });
  it('Q3 א: the answer is A’s coordinates', () => expect(value(Q3_A, 'מצאו את שיעורי הנקודה A')).toBe('(4, -6)'));
  it('a point the figure lacks is the missing-point answer', () => expect(answer(Q3_A, 'שיעורי Z')).toEqual({ value: null, missing: { name: 'Z', kind: 'point' } }));
});

describe('#2393 R2 — a parameter by its symbol: the panel row’s value', () => {
  it.each(['a', 'מהו a', 'מצאו את a', 'הערך של a', 'a = ?', 'the value of a'])('Q2 «%s» → a = 4', (q) => {
    const d = fig(Q2);
    expect(value(Q2, q)).toBe(valueText(knownValue(d.construction, (f) => f.env.a ?? null), fmtAnalytic));
    expect(value(Q2, q)).toBe('4');
  });
  it('Q2: r = 3', () => expect(value(Q2, 'r')).toBe('3'));
  it('controls — a letter that is not a parameter keeps the lane’s answer', () => {
    expect(answer(Q2, 'x')).toEqual({ value: null, unreadable: true });
    expect(answer(Q2, 'm')).toEqual({ value: null, unreadable: true }); // m before l1 exists
  });
});

describe('#2393 R3–R5 — a circle by its centre, THE circle, an English noun', () => {
  it.each([
    [Q2, 'מצאו את משוואת המעגל שמרכזו N', 'משוואת מעגל N'],
    [Q2, 'משוואת המעגל שמרכזו M', 'משוואת מעגל M'],
    [Q2, 'the circle centred at M', 'משוואת מעגל M'],
    [Q2, 'the equation of the circle with centre N', 'משוואת מעגל N'],
    [Q2, 'the equation of circle M', 'משוואת מעגל M'],
    [Q3_A, 'מצאו את משוואת המעגל', 'משוואת מעגל M'],
    [Q3_A, 'the equation of the circle', 'משוואת מעגל M'],
  ])('%#: «%s» ≡ «%s»', (lines, q, twin) => {
    expect(answer(lines, q)).toEqual(answer(lines, twin));
    expect(value(lines, q)).not.toBeNull();
  });
  it('Q2 א: the circle on N is (x - 13)² + y² = 36; Q3 א: the circle is (x - 8)² + (y + 3)² = 25', () => {
    expect(value(Q2, 'מצאו את משוואת המעגל שמרכזו N')).toBe('(x - 13)² + y² = 36');
    expect(value(Q3_A, 'מצאו את משוואת המעגל')).toBe('(x - 8)² + (y + 3)² = 25');
  });
  it('THE circle over several circles is the host answer, never a pick', () => {
    expect(answer(Q3_B, 'מצאו את משוואת המעגל')).toEqual({ value: null, host: { kind: 'circle', found: 3 } });
  });
  it('a centre that is no point is the missing point; a point that is no circle’s centre keeps the missing curve', () => {
    expect(answer(Q2, 'משוואת המעגל שמרכזו Z')).toEqual({ value: null, missing: { name: 'Z', kind: 'point' } });
    expect(answer(['נתון מעגל x^2+y^2=25', 'A(5,0)'], 'משוואת המעגל שמרכזו A')).toMatchObject({ value: null, missing: { kind: 'curve' } });
  });
});

describe('#2393 R6 — a tangent by its noun', () => {
  it.each(['משוואת המשיק', 'מצאו את משוואת המשיק', 'משוואת המשיק למעגל M בנקודה T', 'משוואת המשיק בנקודה T', 'the equation of the tangent'])(
    'Q2 ג «%s» → x - 7 = 0',
    (q) => expect(value(Q2_TANGENT, q)).toBe('x - 7 = 0'),
  );
  it('no tangent in the figure keeps the missing-curve answer', () => {
    expect(answer(Q2, 'משוואת המשיק')).toMatchObject({ value: null, missing: { kind: 'curve' } });
  });
});

describe('#2393 R7 — «משוואת l1» answers what the panel row shows (one decision, `curveEquationOf`)', () => {
  it('Q2 ד: the two options, equal to the panel row; the slope answer unchanged', () => {
    const d = fig(Q2_D);
    const row = panelKnowledge(d).curves.find((c) => c.id === 'line-l1')!;
    expect(row.known).toBeNull();
    const panel = [...new Set(row.options!.map((o) => curveParts(o).equation))].join(' או ');
    expect(value(Q2_D, 'משוואת l1')).toBe(panel);
    expect(value(Q2_D, 'משוואת הישר l1')).toBe(panel);
    expect(panel).toContain(' או ');
    expect(value(Q2_D, 'שיפוע l1')).toBe('±0.35');
  });
});

describe('#2393 R8/R9 — options and conjunctions: each part is its own row', () => {
  it('Q2 א as printed: the circle on N, and the circle on M', () => {
    const a = ask(fig(Q2), 'מצאו את משוואת המעגל שמרכזו N ואת שתי האפשרויות למשוואת המעגל שמרכזו M', fmtAnalytic);
    expect(a.parts?.map((p) => p.value)).toEqual([value(Q2, 'משוואת מעגל N'), value(Q2, 'משוואת מעגל M')]);
  });
  it('a trailing «(שתי אפשרויות)» says nothing the answer does not', () => {
    expect(value(Q2_D, 'משוואת l1 (שתי אפשרויות)')).toBe(value(Q2_D, 'משוואת l1'));
  });
  it.each(['מצאו את m ואת n', 'm ו-n'])('Q2 ד «%s» → m’s and n’s values, as the panel prints them', (q) => {
    const a = ask(fig(Q2_D), q, fmtAnalytic);
    expect(a.parts?.map((p) => p.value)).toEqual([value(Q2_D, 'm'), value(Q2_D, 'n')]);
    expect(a.parts?.every((p) => p.value !== null)).toBe(true);
  });
  it('a plural noun over named members: «משוואות המעגלים M ו-N»', () => {
    const a = ask(fig(Q2), 'משוואות המעגלים M ו-N', fmtAnalytic);
    expect(a.parts?.map((p) => p.value)).toEqual([value(Q2, 'משוואת מעגל M'), value(Q2, 'משוואת מעגל N')]);
  });
  it('control — «מצאו את m ואת z»: m’s value, and z unread', () => {
    const a = ask(fig(Q2_D), 'מצאו את m ואת z', fmtAnalytic);
    expect(a.parts?.map(({ question: _q, ...p }) => p)).toEqual([{ value: value(Q2_D, 'm') }, { value: null, unreadable: true }]);
  });
  it('control — a question that reads whole is never split («the distance between K and L»)', () => {
    expect(ask(fig(Q1), 'the distance between K and L', fmtAnalytic).parts).toBeUndefined();
  });
});

describe('#2393 R10 — the set-former: the locus the question names', () => {
  const LOCUS = 'line · 4x + y + 3 = 0';
  it.each([
    'מצאו את משוואת המקום הגיאומטרי של כל הנקודות M המקיימות MA = MB',
    'המקום הגיאומטרי של כל הנקודות M',
    'המקום הגיאומטרי של הנקודות M',
    'the locus of all the points M such that MA = MB',
  ])('Q1 (MA = MB stated) «%s» ≡ «המקום הגיאומטרי של M»', (q) => {
    expect(answer(Q1, q)).toEqual(answer(Q1, 'המקום הגיאומטרי של M'));
    expect(value(Q1, q)).toBe(LOCUS);
  });
  it('the condition not yet stated: the locus under it, traced on the figure plus the condition — and the figure is untouched', () => {
    const before = JSON.stringify(fig(Q1_HEAD).construction);
    expect(value(Q1_HEAD, 'מצאו את משוואת המקום הגיאומטרי של כל הנקודות M המקיימות MA = MB')).toBe(LOCUS);
    expect(value(Q1_HEAD, 'המקום הגיאומטרי של M')).toBeNull();
    expect(JSON.stringify(fig(Q1_HEAD).construction)).toBe(before);
  });
  it('a condition the figure refuses is the input’s own refusal of it', () => {
    expect(answer(Q1, 'המקום הגיאומטרי של כל הנקודות M המקיימות ML = MK')).toEqual({ value: null, refused: { key: 'unsatisfiable', detail: 'ML = MK' } });
  });
  it('a point the figure lacks is the missing point — named, never «כל הנקודות Q …»', () => {
    expect(answer(Q1_HEAD, 'המקום הגיאומטרי של כל הנקודות Q המקיימות QA = QB')).toEqual({ value: null, missing: { name: 'Q', kind: 'point' } });
  });
});

describe('#2389 → #2393 — a measure of the locus is understood, and not supported (never «no curve»)', () => {
  it.each(['שיפוע המקום הגיאומטרי של M', 'שיפוע המקום הגיאומטרי', 'the slope of the locus of M'])('«%s»', (q) => {
    expect(answer(Q1, q)).toEqual({ value: null, unsupported: true });
  });
});

describe('#2393 ruling 2026-10-20 — yes/no questions are not answered (phase Y dropped)', () => {
  it.each(['האם ML = MK', 'האם קיימת נקודה M שמתקיים בעבורה ML = MK?', 'האם KA מאונך ל-AM'])('Q1 «%s» keeps the unreadable answer', (q) => {
    expect(answer(Q1, q)).toEqual({ value: null, unreadable: true });
  });
  it('Q3 «האם הקטע N₂A הוא קוטר המעגל M?» keeps the unreadable answer', () => {
    expect(answer(Q3_B, 'האם הקטע N₂A הוא קוטר המעגל M?')).toEqual({ value: null, unreadable: true });
  });
});
