/**
 * #2620 B and C ([ADR-AG-370](../../docs/06c-decisions-analytic.md#adr-ag-370),
 * [ADR-AG-371](../../docs/06c-decisions-analytic.md#adr-ag-371)) — THE BOOK'S LOCUS QUESTIONS AND ITS TWO CONSTRUCTION
 * SPELLINGS, on the real path (`decideSubmit` → `derive` → `ask`, no model).
 *
 * B: a locus subject DESCRIBED by a sentence («כל הנקודות שמרחקן …», «מפגש הישרים l1 ו-l2») answers the row the lettered
 * question answers on the same figure, through a trial the figure never keeps (02c R24), and the helper letter it uses
 * reaches no answer. C: «דרך N מעבירים ישר l1 שמקביל ל-PO» is taught as «דרך N עובר ישר l1 מקביל ל-PO», and «A ו-B הן
 * נקודות על … בהתאמה» is «A ו-B נמצאות על … בהתאמה».
 *
 * Measured before (17f35282): every B question answered «missing point» named by the whole phrase; both C sentences were
 * `not-handled`.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { describedSubject } from '../parser/locusSubject';
import { parseLine } from '../parser/parseAnalytic';
import p109 from './fixtures/ellipse-book-p10-9-2620.analytic.json';
import p97 from './fixtures/ellipse-book-p9-7-2620.analytic.json';

const memo = new Map<string, ReturnType<typeof derive>>();
const fig = (lines: readonly string[], seed = 0) => {
  const key = `${seed}\n${lines.join('\n')}`;
  if (!memo.has(key)) memo.set(key, derive(lines, seed));
  return memo.get(key)!;
};
const answer = (lines: readonly string[], q: string) => {
  const { question: _q, locus: _l, ...rest } = ask(fig(lines), q, fmtAnalytic);
  return rest;
};
const value = (lines: readonly string[], q: string) => ask(fig(lines), q, fmtAnalytic).value;

/** p10-9 with the book's numbers replaced by 16 and 12 — the lines the taught cards record. */
const P109_NUM = ['נתונה אליפסה שמשוואתה x^2/16+y^2/12=1', ...p109.lines.slice(1)];
const P109_ELLIPSE = 'ellipse · x²/64 + y²/12 = 1';
const P97_ELLIPSE = 'ellipse · x²/20 + y²/5 = 1';
const FOCUS = ['A(2,0)', 'B(-2,0)'];

describe('#2620 B — the meet of two lines, described', () => {
  it.each([
    'מצא את המקום הגיאומטרי של מפגש הישרים l1 ו-l2',
    'המקום הגיאומטרי של מפגש הישרים l1 ו-l2',
    'המקום הגיאומטרי של נקודת החיתוך של הישרים l1 ו-l2',
    'המקום הגיאומטרי של נקודת המפגש של l1 עם l2',
    'המקום הגיאומטרי של מפגש הישר l1 עם הישר l2',
    'המקום הגיאומטרי של המפגש בין l1 לבין l2',
    'the locus of the intersection of lines l1 and l2',
  ])('p10-9 (16, 12): «%s» ≡ the lettered meet', (q) => {
    const lettered = [...P109_NUM, 'M נקודת החיתוך של l1 עם l2'];
    expect(value(lettered, 'המקום הגיאומטרי של M')).toBe(P109_ELLIPSE);
    expect(answer(P109_NUM, q)).toEqual(answer(lettered, 'המקום הגיאומטרי של M'));
  });
  it('p10-9 in the book’s letters: x²/(4a²) + y²/b² = 1', () => {
    expect(value(p109.lines, 'מצא את המקום הגיאומטרי של מפגש הישרים l1 ו-l2')).toBe('ellipse · x²/(4a²) + y²/b² = 1');
  });
  it.each([
    'מצא את המקום הגיאומטרי של מפגש הישר העובר דרך A והמאונך לציר ה-x עם הישר העובר דרך B והמאונך לציר ה-y',
    'מצא את המקום הגיאומטרי של מפגש הישר שעובר דרך A ומאונך לציר ה-x עם הישר שעובר דרך B ומאונך לציר ה-y',
  ])('p9-7: described lines «%s»', (q) => {
    expect(value(p97.lines, q)).toBe(P97_ELLIPSE);
  });
});

describe('#2620 B — «כל הנקודות ש…»: the plural clause about one point', () => {
  it.each([
    ['מצא את המקום הגיאומטרי של כל הנקודות שמרחקן מ-A הוא 5', 'המרחק של M מ-A הוא 5'],
    ['המקום הגיאומטרי של כל הנקודות שהמרחק שלהן מ-A הוא 5', 'המרחק של M מ-A הוא 5'],
    ['the locus of all the points whose distance from A = 5', 'המרחק של M מ-A הוא 5'],
    ['מצא את המקום הגיאומטרי של כל הנקודות שמרחקן מהנקודה A קטן פי 2 ממרחקן מהישר x=8', 'המרחק של M מהנקודה A קטן פי 2 מהמרחק של M מהישר x=8'],
    ['המקום הגיאומטרי של כל הנקודות שמרחקן מ-A שווה למרחקן מ-B', 'המרחק של M מ-A שווה למרחק של M מ-B'],
  ])('«%s» ≡ «%s» on a lettered M', (q, sentence) => {
    const lettered = [...FOCUS, 'נקודה M', sentence];
    const expected = answer(lettered, 'המקום הגיאומטרי של M');
    expect(expected.value).not.toBeNull();
    expect(answer(FOCUS, q)).toEqual(expected);
  });
  it('p9-5 with a lettered focus: the ellipse x²/16 + y²/12 = 1', () => {
    expect(value(FOCUS, 'מצא את המקום הגיאומטרי של כל הנקודות שמרחקן מהנקודה A קטן פי 2 ממרחקן מהישר x=8')).toBe('ellipse · x²/16 + y²/12 = 1');
  });
});

describe('#2620 B — the trial is discarded and its helper is never seen (02c R24)', () => {
  it('the figure is untouched, and no answer names the helper letter or line', () => {
    const d = fig(p97.lines);
    const before = JSON.stringify([d.lines, d.construction]);
    const a = ask(d, 'מצא את המקום הגיאומטרי של מפגש הישר העובר דרך A והמאונך לציר ה-x עם הישר העובר דרך B והמאונך לציר ה-y', fmtAnalytic);
    expect(JSON.stringify([d.lines, d.construction])).toBe(before);
    const { question: _q, ...shown } = a;
    expect(JSON.stringify(shown)).not.toMatch(/(?<![A-Za-z])(?:X|l9|l8)(?![A-Za-z0-9])/);
  });
  it('a figure that already has X: the helper steps aside, the answer is the same', () => {
    const withX = [...FOCUS, 'X(7,7)'];
    expect(value(withX, 'המקום הגיאומטרי של כל הנקודות שמרחקן מ-A הוא 5')).toBe(value(FOCUS, 'המקום הגיאומטרי של כל הנקודות שמרחקן מ-A הוא 5'));
    expect(fig(withX).figure.points.find((p) => p.id === 'X')).toMatchObject({ x: 7, y: 7 });
  });
});

describe('#2620 B — refusals and the anti-widening lock', () => {
  it('a line the figure lacks is the input’s own refusal, naming the student’s line', () => {
    expect(answer(P109_NUM, 'המקום הגיאומטרי של מפגש הישרים l1 ו-l7')).toEqual({ value: null, refused: { key: 'unknown-reference', detail: 'l7' } });
  });
  it('a clause in a measure not read yet is not understood, quoting the student’s words, never the helper', () => {
    expect(answer(FOCUS, 'מצא את המקום הגיאומטרי של כל הנקודות שמרחקן מהנקודה (2,0) קטן פי 2 ממרחקן מהישר x=8')).toEqual({
      value: null,
      refused: { key: 'not-handled', detail: 'כל הנקודות שמרחקן מהנקודה (2,0) קטן פי 2 ממרחקן מהישר x=8' },
    });
  });
  it.each([
    'המקום הגיאומטרי של כל הנקודות שהן ירוקות',
    'המקום הגיאומטרי של מפגש הישר העובר דרך A והירוק עם l1',
  ])('a description outside the tables is unread, never a missing point: «%s»', (q) => {
    expect(answer(P109_NUM, q)).toEqual({ value: null, unreadable: true });
  });
  it('a letter is still a letter', () => {
    expect(answer(P109_NUM, 'המקום הגיאומטרי של Q')).toEqual({ value: null, missing: { name: 'Q', kind: 'point' } });
  });
});

describe('#2620 C — the book’s construction spellings', () => {
  const HEAD = p109.lines.slice(0, 4);
  it.each([
    ['דרך N מעבירים ישר l1 שמקביל ל-PO', 'דרך N עובר ישר l1 מקביל ל-PO'],
    ['דרך P מעבירים ישר l2 שמקביל לציר ה-x', 'דרך P עובר ישר l2 מקביל לציר ה-x'],
    ['דרך הנקודה P מעבירים ישר l3 המאונך לציר ה-x', 'דרך הנקודה P עובר ישר l3 מאונך לציר ה-x'],
    ['דרך N מעבירים ישר שמקביל ל-PO', 'הישר העובר דרך הנקודה N מקביל ל-PO'],
  ])('«%s» is taught as «%s», which records', (line, canonical) => {
    expect(decideSubmit(line, HEAD, 0)).toEqual({ kind: 'teach', verb: 'מעבירים', canonical });
    expect(decideSubmit(canonical, HEAD, 0).kind).toBe('record');
  });
  it('the perpendicular’s own «ש» clause is not touched', () => {
    expect(decideSubmit('מנקודה P מורידים אנך לציר ה-x שחותך אותו בנקודה N', HEAD.slice(0, 2), 0)).toEqual({
      kind: 'teach',
      verb: 'מורידים',
      canonical: 'האנך מהנקודה P לציר ה-x שחותך אותו בנקודה N',
    });
  });
  it.each([
    ['A ו-B הן נקודות על ציר ה-x ועל ציר ה-y בהתאמה', 'A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה'],
    ['A ו-B נקודות על ציר ה-x ועל ציר ה-y בהתאמה', 'A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה'],
    ['A and B are points on the x-axis and the y-axis respectively', 'A and B are on the x-axis and the y-axis respectively'],
    ['D ו-E הן נקודות על AB ועל AC בהתאמה', 'D ו-E נמצאות על AB ועל AC בהתאמה'],
  ])('«%s» states what «%s» states', (line, twin) => {
    const a = parseLine(line);
    const b = parseLine(twin);
    expect(a.ok && b.ok).toBe(true);
    // the same facts, each carrying its own sentence as `src`
    const bare = (fs: readonly object[]) => fs.map(({ src: _s, ...f }: { src?: string }) => f);
    if (a.ok && b.ok) expect(bare(a.facts)).toEqual(bare(b.facts));
  });
  it('p9-7’s line records on an empty canvas', () => {
    expect(decideSubmit('A ו-B הן נקודות על ציר ה-x ועל ציר ה-y בהתאמה', [], 0).kind).toBe('record');
  });
});

describe('#2620 B — the rewrite itself (`describedSubject`)', () => {
  const none = () => false;
  it('the plural clause about one point', () => {
    expect(describedSubject('כל הנקודות שמרחקן מ-A קטן פי 2 ממרחקן מהישר x=8', none)?.lines).toEqual([
      'נקודה X',
      'המרחק של X מ-A קטן פי 2 מהמרחק של X מהישר x=8',
    ]);
    expect(describedSubject('כל הנקודות שמרחקן מ-A שווה למרחקן מ-B', none)?.lines[1]).toBe('המרחק של X מ-A שווה למרחק של X מ-B');
  });
  it('a described line takes a helper line name; the helpers skip what is taken', () => {
    const r = describedSubject('מפגש הישר העובר דרך A והמאונך לציר ה-x עם הישר l', (n) => n === 'X' || n === 'l9');
    expect(r).toMatchObject({ letter: 'Y', helpers: ['Y', 'l8'], lines: ['דרך A עובר ישר l8 מאונך לציר ה-x', 'Y נקודת החיתוך של l8 עם l'] });
  });
  it('nothing outside the tables', () => {
    expect(describedSubject('כל הנקודות שהן ירוקות', none)).toBeNull();
    expect(describedSubject('M', none)).toBeNull();
  });
});
