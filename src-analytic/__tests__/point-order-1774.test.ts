/**
 * #1774 (ADR-AG-409) — «(3,5)A» is taught as «A(3,5)» (ADR-W-030), through the real submit decision.
 *
 * The prod session: «y=3x+2» · «(3,5)» · «(3,5)A». Both refused `not-handled` and reached the paid model. The letter-last
 * spelling no longer does, and neither does «A = (3,5)», which is never accepted (ruling 2026-09-19: *"analytics should not
 * accept E=()"*) and is taught (judged q8). The bare tuple awaits the operator (q7): its row records today's verdict.
 * The definite «הישר» binds the drawn line (judged q11, ADR-W-175 sr-12).
 */
import { describe, expect, it } from 'vitest';
import { confirmTaught, decideSubmit, sentenceOutcome, type SubmitVerdict } from '../app/submit';
import { pointSpelling } from '../app/pointOrder';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

const LINE = ['y=3x+2'];
const submit = (line: string, lines: readonly string[] = LINE): SubmitVerdict => decideSubmit(line, lines, 0, derive(lines, 0));
const keyOf = (v: SubmitVerdict) => (v.kind === 'refused' ? v.error.key : v.kind);

describe('#1774 — a letter after its coordinates is taught', () => {
  it('the reported line is taught, and one Enter records the taught sentence', () => {
    const v = submit('(3,5)A');
    expect(v).toEqual({ kind: 'teach', verb: '', canonical: 'A(3,5)', note: 'point-order' });
    expect(sentenceOutcome(v)).toEqual({ prefill: 'A(3,5)' });
    expect(submit('A(3,5)').kind).toBe('record');
    expect(confirmTaught(['y=3x+2', '(3,5)A'], 0)).toEqual(['y=3x+2', 'A(3,5)']);
  });

  it.each([
    ['(3,5)B', 'B(3,5)'],
    ['(3, 5) A', 'A(3, 5)'],
    ['(-3,5)A', 'A(-3,5)'],
    ['(3,5)A1', 'A1(3,5)'],
    ["(3,5)A'", "A'(3,5)"],
    ['(2a,0)A', 'A(2a,0)'],
    ['(3;5)A', 'A(3;5)'],
    ['הנקודה (3,5)A', 'הנקודה A(3,5)'],
    ['נתונה הנקודה (3,5)A', 'נתונה הנקודה A(3,5)'],
    ['point (3,5)A', 'point A(3,5)'],
    ['(3,5)A, (4,6)B', 'A(3,5), B(4,6)'],
  ])('«%s» → «%s»', (typed, canonical) => {
    expect(submit(typed)).toMatchObject({ kind: 'teach', canonical });
    expect(submit(canonical).kind).toBe('record');
  });

  it('the note says why, in both locales, and names the sentence', () => {
    expect(he('noticeTeachPointOrder', { canonical: 'A(3,5)' })).toBe('שם הנקודה נכתב לפני השיעורים. כתבתי לכם את המשפט בשורת הקלט: «A(3,5)» — לחצו Enter כדי לשרטט.');
    expect(en('noticeTeachPointOrder', { canonical: 'A(3,5)' })).toBe("A point's letter comes before its coordinates. I have put the sentence in the input box for you: «A(3,5)» — press Enter to draw it.");
  });

  it('a line the figure would not take is not taught', () => {
    expect(keyOf(submit('(x,5)A'))).not.toBe('teach'); // x is the plane's: the taught line would refuse
    expect(submit('(4,6)A', ['A(3,5)']).kind).not.toBe('teach'); // A is already elsewhere
  });

  it('other shapes stay out of the rewrite', () => {
    for (const line of ['√(3,5)', '(3,5)AB', '(3,5)', '(3,5) על הישר AB', 'A(3,5)', '(3,5)A על הישר AB', '(1,2,3)']) {
      expect([line, keyOf(submit(line))]).not.toEqual([line, 'teach']);
    }
    for (const line of ['√(3,5)', '(3,5)AB', '(3,5)', 'AB = (3,5)', 'A = 3', 'A = (3,5) על הישר', 'B:(3,5)']) expect([line, pointSpelling(line)]).toEqual([line, null]);
  });
});

describe('#1774 — «A = (3,5)» is taught, and = never builds (judged q8)', () => {
  it.each([
    ['A = (3,5)', 'A(3,5)'],
    ['A=(3,5)', 'A(3,5)'],
    ['B=(3,5)', 'B(3,5)'],
    ['A = (-1,7)', 'A(-1,7)'],
    ['הנקודה A=(3,5)', 'הנקודה A(3,5)'],
    ['נתונה הנקודה A = (3,5)', 'נתונה הנקודה A(3,5)'],
    ['A=(3,5), B=(4,6)', 'A(3,5), B(4,6)'],
  ])('«%s» → «%s»', (typed, canonical) => {
    expect(submit(typed)).toEqual({ kind: 'teach', verb: '', canonical, note: 'point-equals' });
    expect(submit(canonical).kind).toBe('record');
  });

  it('the note says why, in both locales', () => {
    expect(he('noticeTeachPointEquals', { canonical: 'A(3,5)' })).toBe('נקודה נכתבת בלי סימן שוויון. כתבתי לכם את המשפט בשורת הקלט: «A(3,5)» — לחצו Enter כדי לשרטט.');
    expect(en('noticeTeachPointEquals', { canonical: 'A(3,5)' })).toBe('A point is written without an equals sign. I have put the sentence in the input box for you: «A(3,5)» — press Enter to draw it.');
  });

  it('a line the figure would not take is not taught, and = itself never records', () => {
    expect(submit('A = (4,6)', ['A(3,5)']).kind).not.toBe('teach');
    expect(submit('A = (3,5)').kind).not.toBe('record');
    expect(keyOf(submit('B:(3,5)'))).toBe('not-handled'); // the ruling does not decide other separators
  });
});

describe('#1774 — the definite «הישר» binds the drawn line (judged q11)', () => {
  it.each(['P על הישר', 'P is on the line', 'הנקודה P(1,5) נמצאת על הישר', 'P(1,5) על הישר', 'הנקודה (1,5) על הישר', '(1,5) על הישר'])('«%s» on one line', (line) => {
    expect(submit(line).kind).toBe('record');
  });

  it('binds only the line: a curve of another kind does not count', () => {
    expect(submit('P על הישר', ['y=3x+2', 'x^2+y^2=25']).kind).toBe('record');
    expect(submit('P על הישר', ['A(0,0)', 'B(2,6)', 'הישר AB']).kind).toBe('record');
  });

  it('the point is really on it', () => {
    expect(submit('הנקודה (1,5) על הישר').kind).toBe('record');
    expect(keyOf(submit('הנקודה (1,4) על הישר'))).toBe('unsatisfiable');
  });

  it('two lines ask which, with the existing question', () => {
    const v = submit('P על הישר', ['y=x', 'y=2x']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape', host: { kind: 'line', found: 2 } } });
  });

  it('none drawn, and a side alone, keep today\'s verdict (not ruled: reported to the operator)', () => {
    for (const ctx of [[], ['A(0,0)', 'B(2,6)'], ['משולש ABC'], ['A(0,0)', 'B(2,6)', 'AB'], ['מעגל O'], ['y=x^2']]) {
      expect([ctx, keyOf(submit('P על הישר', ctx))]).toEqual([ctx, 'not-handled']);
    }
  });
});

describe('#1774 — what was not built', () => {
  it('the bare tuple keeps today\'s verdict until it is ruled on', () => {
    expect(keyOf(submit('(3,5)'))).toBe('not-handled');
  });

  it('the neighbours that already read still read', () => {
    for (const line of ['A(3,5)', 'A (3,5)', 'נתונה הנקודה (3,5)', 'הנקודה (3,5)', 'the point (3,5)', 'point (3,5)']) expect([line, submit(line).kind]).toEqual([line, 'record']);
    const ab = ['A(0,0)', 'B(2,6)'];
    for (const line of ['הנקודה P(1,3) נמצאת על הישר AB', 'הנקודה (1, 3) על הישר AB', '(1,3) על הישר AB']) expect([line, submit(line, ab).kind]).toEqual([line, 'record']);
  });
});
