/**
 * #2032 (ADR-AG-408, operator ruling 2026-11-04, card q5 = B: *"Refuse «קשת AB = 4π» honestly now, then build A"*).
 *
 * 2-D reads «קשת AB = 4π» and «אורך הקשת AB הוא 4π» as the arc's LENGTH (ADR-632, ADR-664). Analytic has no such measure
 * until #2710, and its arc reader drew every π value as DEGREES: a 12.57° arc, green. Each is now refused through the
 * real submit decision, naming what is read; a plain degree value is untouched. This file is #2710's to rewrite.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

const SECTOR = ['גזרה AOB'];
const CIRCLE = ['מעגל O', 'A על מעגל O', 'B על מעגל O'];
const EQUATION = ['המעגל x^2+y^2=25', 'A על המעגל', 'B על המעגל'];
const submit = (line: string, lines: readonly string[]): SubmitVerdict => decideSubmit(line, lines, 0, derive(lines, 0));
const keyOf = (v: SubmitVerdict) => (v.kind === 'refused' ? v.error.key : v.kind);

describe('#2032 — analytic refuses an arc length, never degrees', () => {
  it('the reported sequence is refused: not a fallback, not a figure', () => {
    expect(keyOf(submit('קשת AB = 4π', SECTOR))).toBe('arc-length-unread');
    // a line stored before the fix draws nothing either
    expect(derive([...SECTOR, 'קשת AB = 4π'], 0).construction.objects).toEqual(derive(SECTOR, 0).construction.objects);
  });

  const BARE = [
    'קשת AB = 4π', 'קשת AB = 3π', 'קשת AB = π', 'קשת AB = 4pi', 'קשת AB = 0.5π', 'קשת AB = 4*π',
    'קשת AB = 2π/3', 'קשת AB = π/2', // 2-D escalates these; here they drew 2.09° and 1.57°: the same wrong outcome
    'הקשת AB = 4π', '⌢AB = 4π', '⏜AB = 4π', '⌢{AB} = 4π', 'arc AB = 4π', 'arc AB is 4π', 'arc AB equals 4π',
    'הקשת AB היא 4π', 'הקשת AB היא π', 'קשת AB שווה ל-4π', 'קשת AB = 4π במעגל O', 'קשת AB במעגל O = 4π', '2 קשת AB = 4π',
  ];
  const SPELLED = [
    'אורך הקשת AB הוא 4π', 'אורך הקשת AB = 4π', 'אורך קשת AB = 4π', 'אורך הקשת = 4π', 'arc length AB = 4π',
    'arc length AB is 4π', 'the length of the arc AB is 4π', 'אורך הקשת AB הוא 5', 'אורך הקשת AB = L',
    'אורך הקשת AB הוא רבע מהיקף המעגל',
  ];
  it.each([...BARE, ...SPELLED])('«%s» on a sector, a named circle and an equation circle', (line) => {
    for (const ctx of [SECTOR, CIRCLE, EQUATION]) expect([ctx[0], keyOf(submit(line, ctx))]).toEqual([ctx[0], 'arc-length-unread']);
  });

  it("the sentence says so, in both locales, with the student's own arc", () => {
    const v = submit('קשת PQ = 4π', ['מעגל O', 'P על מעגל O', 'Q על מעגל O']);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error, t)).toBe('הכלי עדיין לא קורא אורך של קשת. קשת נכתבת כאן במעלות — למשל קשת PQ = 40');
    expect(errorText(v.error, tEn)).toBe("This tool does not read an arc's length yet. An arc is written here in degrees — for example arc PQ = 40");
  });

  it('the taught sentence is one the next Enter reads (docs/17 §9)', () => {
    for (const ctx of [SECTOR, CIRCLE, EQUATION]) expect(submit('קשת AB = 40', ctx).kind).toBe('record');
    expect(errorText({ key: 'arc-length-unread', detail: 'AB' }, t)).toContain('קשת AB = 40');
  });

  it('an arc in degrees is unchanged', () => {
    for (const line of ['קשת AB = 40', 'קשת AB = 40°', 'קשת AB = 40 במעגל O', 'הקשת AB היא 40 מעלות', 'arc AB = 40', 'קשת AB = 200']) {
      expect([line, submit(line, SECTOR).kind]).toEqual([line, 'record']);
    }
  });

  it("an arc sum written with π is an angle in radians (found in round: #1837's rule, ADR-W-142)", () => {
    const four = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O'];
    for (const line of ['קשת AB + קשת CD = π', 'קשת AB + קשת CD = 2π/3', 'קשת AB - קשת CD = π', 'arc AB + arc CD = π']) {
      expect([line, keyOf(submit(line, four))]).toEqual([line, 'radian-angle']);
    }
    expect(submit('קשת AB + קשת CD = 180', four).kind).toBe('record');
    expect(submit('קשת AB = 2 קשת CD', four).kind).toBe('record');
  });

  it("a question about an arc's length is not a statement", () => {
    expect(keyOf(submit('מהו אורך הקשת AB', SECTOR))).not.toBe('arc-length-unread');
  });
});
