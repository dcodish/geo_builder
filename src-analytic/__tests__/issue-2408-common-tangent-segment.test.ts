/**
 * #2408 ([ADR-AG-415](../../docs/06c-decisions-analytic.md#adr-ag-415)) — A SENTENCE THAT NAMES NO LINE DRAWS THE SEGMENT.
 *
 * Operator, 2026-11-06, on «AB משיק משותף למעגלים O ו-K»: *"the inputs dont say a line so only the segments should be
 * drawn"*; on a later line: *"yes - if later we talk about a line - we draw the line"*; on «כל המשיקים המשותפים»: *"they should
 * also just be the segments. if a user want the line he can later say that in a later input"*. 2-D draws these segments.
 * The line stays as an undrawn carrier, so the equation row, the axis side and the ask lane read what they always read.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { panelKnowledge } from '../app/panelRows';
import { ask } from '../app/ask';
import { derive, type Derivation } from '../engine/derive';
import fixed from './fixtures/issue-2408-four-tangents-fixed.analytic.json';
import free from './fixtures/issue-2408-four-tangents-free.analytic.json';
import saved from './fixtures/issue-2408-set-then-line.analytic.json';

type Verdict = { kind: string; line?: string; error?: { key?: string }; configuration?: number };
function play(lines: readonly string[], start = 0): Derivation {
  const acc: string[] = [];
  let seed: Parameters<typeof derive>[1] = start;
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as unknown as Verdict;
    if (v.kind !== 'record') throw new Error(`«${line}»: ${v.kind} (${v.error?.key})`);
    acc.push(v.line ?? line);
    seed = v.configuration ?? seed;
  }
  const d = derive(acc, seed);
  expect(d.faults).toEqual([]);
  return d;
}
const inkedLines = (d: Derivation) => d.figure.curves.filter((c) => c.stated && c.curve.kind === 'line').map((c) => c.id).sort();
const segments = (d: Derivation) => d.figure.segments.map((s) => s.id).sort();
const lineObjects = (d: Derivation) => d.figure.curves.filter((c) => c.curve.kind === 'line').map((c) => c.id).sort();
const row = (d: Derivation, id: string) => panelKnowledge(d).curves.find((c) => c.id === id);
const fmt = (v: number) => String(Math.round(v * 1e4) / 1e4);

const O = 'נתון מעגל שמרכזו O(0,0) ורדיוסו 2';
const K = 'נתון מעגל שמרכזו K(6,0) ורדיוסו 1';
const FIXED = [O, K];
const AB = 'AB משיק משותף למעגלים O ו-K';
const ALL = 'כל המשיקים המשותפים לשני המעגלים';
const BELOW = 'הישר AB חותך את ציר ה-y מתחת לציר ה-x';

describe('a sentence that names no line draws the segment, and keeps the equation row', () => {
  it.each([
    ['the letters', [...FIXED, AB]],
    ['the kind', [...FIXED, 'AB משיק משותף חיצוני למעגלים O ו-K']],
    ['internal', [...FIXED, 'AB משיק משותף פנימי לשני המעגלים']],
    ['English', [...FIXED, 'AB is a common tangent to circles O and K']],
    ['no letters: the tool’s, as 2-D', [...FIXED, 'משיק חיצוני משותף לשני המעגלים']],
    ['the exam’s definition', [...FIXED, 'משיק משותף ששני המעגלים נמצאים באותו צד שלו']],
    ['the touch point on it', ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'T על AB', 'AB משיק משותף למעגלים M ו-N']],
  ] as const)('%s: the segment AB and no line in ink', (_, lines) => {
    const d = play(lines);
    expect(inkedLines(d)).toEqual([]);
    expect(segments(d)).toEqual(['seg-AB']);
    expect(row(d, 'line-AB')).toBeDefined();
  });
  it('the row lists the open tangents, the same object the ask lane answers from', () => {
    const d = play([...FIXED, 'AB משיק משותף חיצוני למעגלים O ו-K']);
    expect(row(d, 'line-AB')!.options).toHaveLength(2);
    expect(ask(d, 'משוואת הישר AB', fmt).value).toContain('או');
  });
  it.each([
    ['fixed', fixed.lines, ['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']],
    ['free', free.lines, ['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']],
  ] as const)('the operator’s four, %s circles, at seeds 0–4: four segments, no line', (_, lines, want) => {
    for (const seed of [0, 1, 2, 3, 4]) {
      const d = play(lines, seed);
      expect(inkedLines(d)).toEqual([]);
      expect(segments(d)).toEqual(want);
    }
  });
  it('the ink ends at the touch points', () => {
    const d = play([...FIXED, AB]);
    const s = d.figure.segments[0];
    const on = (p: { x: number; y: number }, cx: number, r: number) => Math.abs(Math.hypot(p.x - cx, p.y) - r) < 1e-6;
    expect(on(s.a, 0, 2) || on(s.a, 6, 1)).toBe(true);
    expect(on(s.b, 0, 2) || on(s.b, 6, 1)).toBe(true);
  });
});

describe('a sentence that says a line keeps it', () => {
  it.each([
    ['«הישר l … בנקודות»', [...FIXED, 'הישר l משיק לשני מעגלים O ו-K בנקודות P ו-Q בהתאמה'], 'line-l'],
    ['«הישר l משיק משותף»', [...FIXED, 'הישר l משיק משותף חיצוני לשני המעגלים'], 'line-l'],
    ['«הישר AB משיק משותף»', [...FIXED, 'הישר AB משיק משותף למעגלים O ו-K'], 'line-AB'],
  ] as const)('%s', (_, lines, id) => {
    const d = play(lines);
    expect(inkedLines(d)).toEqual([id]);
    expect(segments(d)).toEqual([]);
  });
  it('«AB» after «הישר AB» leaves the line the student drew', () => {
    const d = play(['A(0,0)', 'B(4,0)', 'הישר AB']);
    expect(inkedLines(d)).toEqual(['line-AB']);
  });
});

describe('a later sentence that speaks of the line draws it, the same object: never a twin', () => {
  const twice = [...FIXED, AB];
  it.each([
    ['«הישר AB»', 'הישר AB', ['line-AB']],
    ['the axis side', BELOW, ['line-AB']],
    ['«נסמן»', 'נסמן את הישר AB ב-l', ['line-l']],
    ['«נסמן ב-l»', 'נסמן ב-l את הישר AB', ['line-l']],
    ['a point on the line', 'C על הישר AB', ['line-AB']],
    ['a crossing', 'הישר AB חותך את ציר ה-x בנקודה C', ['line-AB']],
    ['the right / left twin', 'הישר AB חותך את ציר ה-x מימין לציר ה-y', ['line-AB']],
  ] as const)('%s', (_, sentence, want) => {
    const d = play([...twice, sentence]);
    expect(inkedLines(d)).toEqual(want);
    expect(lineObjects(d)).toEqual(want);
    expect(segments(d)).toEqual(['seg-AB']);
  });
  it('the axis side still picks the tangent, and the segment stays beside the line', () => {
    const d = play([...twice, BELOW]);
    const p = d.figure.points as Array<{ id: string; x: number; y: number }>;
    const [A, B] = [p.find((q) => q.id === 'A')!, p.find((q) => q.id === 'B')!];
    expect(A.y - (A.x * (B.y - A.y)) / (B.x - A.x)).toBeLessThan(0);
  });
  it('the sentence that draws the line moves nothing', () => {
    const before = play(['מעגל O', 'מעגל K', AB]);
    const after = play(['מעגל O', 'מעגל K', AB, 'הישר AB']);
    expect(after.figure.points).toEqual(before.figure.points);
  });
  it.each([
    ['the question', (d: Derivation) => ask(d, 'משוואת הישר AB', fmt)],
  ])('%s draws nothing', (_, read) => {
    const d = play(twice);
    read(d);
    expect(inkedLines(d)).toEqual([]);
  });
  it.each([
    ['a point on the segment’s name', ['T על AB'], false],
    ['the tangent again', [AB], false],
  ] as const)('%s leaves the segment', (_, more, _drawn) => {
    const lines = [...twice];
    for (const m of more) {
      const v = decideSubmit(m, lines, 0) as unknown as Verdict;
      if (v.kind === 'record') lines.push(v.line ?? m);
    }
    expect(inkedLines(derive(lines, 0))).toEqual([]);
  });
});

describe('«כל המשיקים המשותפים» draws segments too, lettered as 2-D letters them', () => {
  const OM = 'נתון מעגל שמרכזו M(0,0) ורדיוסו 2';
  const ON = 'נתון מעגל שמרכזו N(6,0) ורדיוסו 1';
  const SET = [OM, ON, ALL];
  it('apart: AB, CD, EF, GH, no line in ink, every equation row', () => {
    const d = play(SET);
    expect(inkedLines(d)).toEqual([]);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']);
    for (const id of ['line-l1', 'line-l2', 'line-l3', 'line-l4']) expect(row(d, id)?.known, id).toBeTruthy();
  });
  it('external first, as 2-D: the ends of AB and CD lie on one side of the line of centres each, EF and GH cross it', () => {
    const d = play(SET);
    const y = (id: string) => (d.figure.points as Array<{ id: string; y: number }>).find((p) => p.id === id)!.y;
    expect(y('A') * y('B')).toBeGreaterThan(0);
    expect(y('C') * y('D')).toBeGreaterThan(0);
    expect(y('E') * y('F')).toBeLessThan(0);
    expect(y('G') * y('H')).toBeLessThan(0);
  });
  it('crossing: two segments and no spare letters on the figure', () => {
    const d = play(['נתון מעגל שמרכזו M(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו N(3,0) ורדיוסו 2', ALL]);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD']);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'M', 'N']);
  });
  it('touching from outside: the two externals are segments, the tangent at the touch point its line (2-D’s tan-T)', () => {
    const d = play(['נתון מעגל שמרכזו M(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו N(3,0) ורדיוסו 1', ALL]);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD']);
    expect(inkedLines(d)).toEqual(['line-l3']);
  });
  it('the student’s names keep naming the rows', () => {
    const d = play([OM, ON, 'המשיקים המשותפים l5, l6, l7 ו-l8 לשני המעגלים']);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']);
    expect(row(d, 'line-l5')?.known).toBeTruthy();
    expect(inkedLines(d)).toEqual([]);
  });
  it.each([
    ['by its name', 'הישר l2 חותך את ציר ה-y מתחת לציר ה-x', ['line-l2']],
    ['by its letters', 'הישר CD', ['line-l2']],
    ['the axis side by its letters', 'הישר AB חותך את ציר ה-y מעל ציר ה-x', ['line-l1']],
    ['a point on it', 'P על הישר l3', ['line-l3']],
    ['named by a touch', 'P נקודת ההשקה של l2 עם מעגל M', ['line-l2']],
  ] as const)('a later line %s draws that line alone', (_, sentence, want) => {
    const d = play([...SET, sentence]);
    expect(inkedLines(d)).toEqual(want);
    expect(lineObjects(d)).toHaveLength(4);
  });
  it('the student’s letter for a touch takes the tool’s: one point, one name', () => {
    const d = play([...SET, 'P נקודת ההשקה של l2 עם מעגל M', 'Q נקודת ההשקה של l2 עם מעגל N']);
    const ids = d.figure.points.map((p) => p.id).sort();
    expect(ids).toEqual(['A', 'B', 'E', 'F', 'G', 'H', 'M', 'N', 'P', 'Q']);
    expect(segments(d)).toContain('seg-PQ');
  });
  it('found in round: the set again is 2-D’s refusal, never four more lines; a fifth too', () => {
    const lines = play(SET).lines ?? [];
    for (const again of [ALL, 'IJ משיק משותף לשני המעגלים']) {
      expect(decideSubmit(again, lines, 0)).toMatchObject({ kind: 'refused', error: { key: 'no-common-tangent', tangents: 'Any' } });
    }
  });
  it('found in round: tangents already drawn count toward the set, as in 2-D: AB, then the three missing', () => {
    const d = play([OM, ON, 'AB משיק משותף לשני המעגלים', ALL]);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']);
    const keys = new Set(d.figure.curves.filter((c) => c.curve.kind === 'line').map((c) => JSON.stringify(c.curve)));
    expect(keys.size).toBe(4);
    expect(decideSubmit(ALL, d.lines ?? [], 0)).toMatchObject({ kind: 'refused', error: { key: 'no-common-tangent' } });
  });
  it('the saved figure: the set, then the line by its letters', () => {
    const d = play(saved.lines);
    expect(inkedLines(d)).toEqual(['line-l2']);
    expect(segments(d)).toEqual(['seg-AB', 'seg-CD', 'seg-EF', 'seg-GH']);
  });
  it('the one-touch sentence stays a line', () => {
    const d = play(['נתון מעגל שמרכזו M(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו N(3,0) ורדיוסו 1', 'המשיק המשותף בנקודת ההשקה']);
    expect(inkedLines(d)).toHaveLength(1);
  });
});
