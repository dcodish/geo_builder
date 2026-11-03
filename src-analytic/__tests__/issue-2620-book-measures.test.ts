/**
 * #2620 A ([ADR-AG-383](../../docs/06c-decisions-analytic.md#adr-ag-383)) — the textbook's locus conditions in its own words.
 *
 * Measured before (24bce5fb, `decideSubmit`): every sentence below was refused `not-handled`, while its formula twin built
 * and the locus answered. Root cause: the measure grammar had no words for four things the book writes — a point given by
 * its coordinates as a distance operand (A1), the possessive «ממרחקה» for the first distance's subject (A2), the sum of
 * the squared distances spelled out (A3), and the length of the tangent from a point to a circle (A4).
 *
 * Every case runs the real path: `decideSubmit` per line, `derive`, and the locus answer of `askSettled`.
 */
import { describe, expect, it } from 'vitest';
import { askSettled } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import p95 from './fixtures/ellipse-book-p9-5-2620.analytic.json';
import p96 from './fixtures/ellipse-book-p9-6-2620.analytic.json';
import p97 from './fixtures/ellipse-book-p9-7-sum-2620.analytic.json';
import p108 from './fixtures/ellipse-book-p10-8-2620.analytic.json';

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const locus = (lines: readonly string[], of = 'P', seed = 0) => askSettled(derive([...lines], seed), `המקום הגיאומטרי של ${of}`, fmt).value;
const records = (lines: readonly string[]) => {
  for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
  expect(derive([...lines], 0).faults).toEqual([]);
};
/** the constraint a line lowers to, without its source text */
const constraintOf = (text: string) => {
  const r = parseLine(text);
  return r.ok ? r.facts.filter((f) => f.t === 'constraint').map((f) => ('k' in f ? f.k : null)) : null;
};

describe('#2620 A — the book\'s exercises, line by line (fixtures)', () => {
  it.each([
    ['p9-5', p95, 'P', 'ellipse · x²/16 + y²/12 = 1'],
    ['p9-6', p96, 'P', 'ellipse · x²/8 + y²/4 = 1'],
    ['p9-7', p97, 'P', 'ellipse · x²/20 + y²/5 = 1'],
    ['p10-8', p108, 'P', 'ellipse · x²/18 + y²/16 = 1'],
  ] as const)('%s records green and its locus answers the book', (_id, fx, of, want) => {
    records(fx.lines);
    expect(locus(fx.lines, of)).toBe(want);
  });
});

describe('#2620 A1 — a point by its coordinates inside a distance', () => {
  it('answers as the lettered point does', () => {
    const want = locus(['A(2,0)', 'נקודה P', 'המרחק של P מהנקודה A קטן פי 2 מהמרחק של P מהישר x=8']);
    expect(want).toBe('ellipse · x²/16 + y²/12 = 1');
    for (const line of [
      'המרחק של P מהנקודה (2,0) קטן פי 2 מהמרחק של P מהישר x=8',
      'המרחק של P מ-(2,0) קטן פי 2 מהמרחק של P מהישר x=8',
      'the distance of P from the line x=8 is 2 times the distance of P from the point (2,0)',
    ]) {
      records(['נקודה P', line]);
      expect(locus(['נקודה P', line]), line).toBe(want);
    }
  });

  it('the tool names the point: no letter the student did not write is asked for', () => {
    const d = derive(['נקודה P', 'המרחק של P מהנקודה (2,0) קטן פי 2 מהמרחק של P מהישר x=8'], 0);
    const named = d.figure.points.filter((p) => p.id !== 'P');
    expect(named.length).toBe(1);
    expect(Math.abs(named[0].x - 2) + Math.abs(named[0].y)).toBeLessThan(1e-9);
  });

  it('anti-widening: two coordinate points in one distance sentence still decline', () => {
    expect(decideSubmit('המרחק בין (1,0) ל-(3,0) הוא 2', [], 0).kind).not.toBe('record');
  });
});

describe('#2620 A2 — «ממרחקה»: the second distance\'s possessive is the first distance\'s subject', () => {
  it.each([
    'המרחק של P מהנקודה A קטן פי 2 ממרחקה מהישר x=8',
    'המרחק של P מהנקודה A קטן פי 2 מהמרחק שלה מהישר x=8',
    'the distance of P from the line x=8 is 2 times its distance from A',
  ])('«%s» lowers to the explicit sentence', (line) => {
    const explicit = /^the/.test(line) ? 'the distance of P from the line x=8 is 2 times the distance of P from A' : 'המרחק של P מהנקודה A קטן פי 2 מהמרחק של P מהישר x=8';
    expect(constraintOf(line)).toEqual(constraintOf(explicit));
    records(['A(2,0)', 'נקודה P', line]);
  });

  it('anti-widening: a first side with no lettered subject leaves the sentence unread', () => {
    expect(decideSubmit('AB קטן פי 2 ממרחקה מהישר x=8', ['משולש ABC'], 0).kind).not.toBe('record');
  });
});

describe('#2620 A3 — the sum of the squared distances, spelled out', () => {
  it.each<[string, string]>([
    ['סכום ריבועי המרחקים של P מהישר l ומהנקודה A הוא 16', 'd_{Pl}^2 + PA^2 = 16'],
    ['סכום ריבועי המרחקים של P מהנקודות A ו-B הוא 10', 'PA^2 + PB^2 = 10'],
    ['סכום ריבועי מרחקי P מ-A ומ-B הוא 10', 'PA^2 + PB^2 = 10'],
    ['the sum of the squares of the distances of P from l and from A is 16', 'd_{Pl}^2 + PA^2 = 16'],
    ['the sum of the squares of the distances of P from the points A and B is 10', 'PA^2 + PB^2 = 10'],
  ])('«%s» means «%s»', (book, formula) => {
    const ctx = ['A(0,2)', 'B(1,1)', 'הישר l: y=-2', 'נקודה P'];
    records([...ctx, book]);
    expect(locus([...ctx, book])).toBe(locus([...ctx, formula]));
    expect(constraintOf(book)).toEqual(constraintOf(formula));
  });

  it('two subjects, one line: «של A ו-B מהישר l» is the sum over A and B', () => {
    const ctx = ['A נקודה על ציר ה-x', 'B נקודה על ציר ה-y', 'הישר l: y=1/2x'];
    const book = 'סכום ריבועי המרחקים של A ו-B מהישר l הוא 4';
    records([...ctx, book]);
    expect(constraintOf(book)).toEqual(constraintOf('d_{Al}^2 + d_{Bl}^2 = 4'));
  });
});

describe('#2620 A4 — the length of the tangent from a point to a circle', () => {
  const circle = 'נתון מעגל שמרכזו בנקודה (1,0) ורדיוסו √8';

  it('√(PC² − r²), measured off the drawn figure at 8 seeds', () => {
    const lines = [circle, 'נקודה P', 'אורך המשיק מ-P למעגל הוא 3'];
    records(lines);
    for (let seed = 0; seed < 8; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const P = d.figure.points.find((p) => p.id === 'P')!;
      expect(Math.sqrt((P.x - 1) ** 2 + P.y ** 2 - 8), `seed ${seed}`).toBeCloseTo(3, 6);
    }
    expect(locus(lines)).toBe('circle · (x − 1)² + y² = 17');
  });

  it('a given that forces P inside the circle is refused, never answered with a clamped length', () => {
    const lines = [circle, 'P(1,1)', 'אורך המשיק מ-P למעגל הוא 3'];
    expect(decideSubmit(lines[2], lines.slice(0, 2), 0).kind).toBe('refused');
  });

  it('the circle by its name, and English', () => {
    records(['מעגל I: (x-1)^2+y^2=8', 'נקודה P', 'אורך המשיק מ-P למעגל I הוא 3']);
    records([circle, 'נקודה P', 'the length of the tangent from P to the circle = 3']);
  });

  it('no circle: refused naming the missing host, as «P מחוץ למעגל» is', () => {
    expect(decideSubmit('אורך המשיק מ-P למעגל הוא 3', ['נקודה P'], 0).kind).toBe('refused');
  });

  it('asked, it is not read (as before): a given only', () => {
    const d = derive([circle, 'P(5,0)'], 0);
    expect(askSettled(d, 'אורך המשיק מ-P למעגל', fmt).value).toBeNull();
  });
});
