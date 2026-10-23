/**
 * #2115 ([ADR-AG-299](../../docs/06c-decisions-analytic.md#adr-ag-299)) — A SIDE IS NOT A BISECTOR, in the analytic
 * builder too. 2-D's #2066 / #2085 item 3 (ADR-643 §4) is the reference (ADR-W-118 B1); its sentences are copied verbatim.
 *
 * Measured at de7c221f through `decideSubmit`: «משולש ABC» · «AB חוצה זווית» was `not-handled` (no reader for the
 * vertex-less bisector at all), and with the vertex written («AB חוצה את זווית A», «… זווית B», «… BAC») it got the
 * generic `degenerate-role` message. Nothing asked whether the segment is a SIDE of a declared polygon at the angle's
 * vertex. Operator ruling 2026-10-15: "analytic answers «AB חוצה זווית» on a polygon side with 2-D's refusal sentence".
 *
 * The tables are 2-D's `src/app/__tests__/issue-2066-bisector-on-side.test.ts`, row for row.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

const decide = (prefix: readonly string[], line: string): SubmitVerdict => {
  for (let i = 0; i < prefix.length; i++) {
    expect(decideSubmit(prefix[i], prefix.slice(0, i), 0).kind, `«${prefix[i]}» builds`).toBe('record');
  }
  return decideSubmit(line, prefix, 0);
};
const textOf = (v: SubmitVerdict, t: T): string | null => (v.kind === 'refused' ? errorText(v.error, t) : null);
const TRI = (side: string, v: string) => `${side} היא צלע של המשולש ולכן אינה יכולה לחצות את זווית ${v}. חוצה זווית יוצא מקודקוד אל הצלע שמולו — תנו לקצה השני שלו אות חדשה.`;

describe('#2115 — a bisector named by a side of the triangle is refused as a side', () => {
  it('the fixture (the operator’s sequence): its last line is refused with the side sentence', () => {
    const fx = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'issue-2115-bisector-on-side.analytic.json'), 'utf8')) as { lines: string[]; seed: number };
    const v = decide(fx.lines.slice(0, -1), fx.lines[fx.lines.length - 1]);
    expect(textOf(v, he)).toBe(TRI('AB', 'A'));
  });

  it.each([
    ['AB חוצה זווית', 'AB', 'A'],
    ['AB חוצה את זווית A', 'AB', 'A'],
    ['AB חוצה את הזווית BAC', 'AB', 'A'],
    ['AB חוצה זווית לצלע BC', 'AB', 'A'],
    ['AB bisects angle A', 'AB', 'A'],
    ['BA חוצה זווית', 'BA', 'B'],
    ['AB חוצה זווית B', 'AB', 'B'],
    ['AB חוצה את זווית ABC', 'AB', 'B'],
    ['AB הוא חוצה זווית', 'AB', 'A'],
    ['חוצה הזווית AB', 'AB', 'A'],
    ['AB is an angle bisector', 'AB', 'A'],
    ['the bisector AB', 'AB', 'A'],
    ['חוצה הזווית AB = 5', 'AB', 'A'],
    ['AC חוצה זווית', 'AC', 'A'],
    ['CB חוצה זווית', 'CB', 'C'],
    // the other spellings 2-D reads the same way (measured at de7c221f)
    ['AB bisects the angle', 'AB', 'A'],
    ['AB חוצה את הזווית', 'AB', 'A'],
    ['נתון AB חוצה זווית', 'AB', 'A'],
    ['הקטע AB חוצה זווית', 'AB', 'A'],
    ['AB חוצה זווית במשולש ABC', 'AB', 'A'],
  ])('«משולש ABC» · «%s» → «%s היא צלע של המשולש… את זווית %s…», nothing recorded', (line, side, vertex) => {
    const v = decide(['משולש ABC'], line);
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('bisector-is-side');
    expect(textOf(v, he)).toBe(TRI(side, vertex));
  });

  it('the English locale', () => {
    expect(textOf(decide(['משולש ABC'], 'AB חוצה זווית'), en)).toBe(
      'AB is a side of the triangle, so it cannot bisect angle A. An angle bisector runs from a vertex to the opposite side — give its other end a new letter.',
    );
  });

  it('a right triangle is a triangle: the triangle sentence', () => {
    expect(textOf(decide(['משולש ישר זווית ABC'], 'AB חוצה זווית'), he)).toBe(TRI('AB', 'A'));
  });
});

describe('#2115 — the same predicate on every other declared polygon, naming it', () => {
  it.each([
    ['מרובע ABCD', 'המרובע'],
    ['ריבוע ABCD', 'הריבוע'],
    ['מלבן ABCD', 'המלבן'],
    ['מקבילית ABCD', 'המקבילית'],
    ['טרפז ABCD', 'הטרפז'],
    ['מעוין ABCD', 'המעוין'],
    ['דלתון ABCD', 'הדלתון'],
    ['מחומש ABCDE', 'המחומש'],
  ])('«%s» · «AB חוצה זווית» → «AB היא צלע של %s ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני…»', (shape, noun) => {
    const v = decide([shape], 'AB חוצה זווית');
    expect(v.kind).toBe('refused');
    expect(textOf(v, he)).toBe(`AB היא צלע של ${noun} ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני של חוצה הזווית אות חדשה.`);
  });
  it('both letter orders: «מרובע ABCD» · «BA חוצה זווית» → the angle at B', () => {
    expect(textOf(decide(['מרובע ABCD'], 'BA חוצה זווית'), he)).toBe('BA היא צלע של המרובע ולכן אינה יכולה לחצות את זווית B. תנו לקצה השני של חוצה הזווית אות חדשה.');
  });
  it('the closing side: «ריבוע ABCD» · «AD חוצה זווית» → the square, the angle at A', () => {
    expect(textOf(decide(['ריבוע ABCD'], 'AD חוצה זווית'), he)).toBe('AD היא צלע של הריבוע ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני של חוצה הזווית אות חדשה.');
  });
  it('a regular pentagon is a pentagon: «מחומש משוכלל ABCDE» → המחומש', () => {
    expect(textOf(decide(['מחומש משוכלל ABCDE'], 'AB חוצה זווית'), he)).toBe('AB היא צלע של המחומש ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני של חוצה הזווית אות חדשה.');
  });
  it('English: "AB is a side of the rectangle, so it cannot bisect angle A."', () => {
    expect(textOf(decide(['מלבן ABCD'], 'AB חוצה זווית'), en)).toBe('AB is a side of the rectangle, so it cannot bisect angle A. Give the other end of the bisector a new letter.');
  });
});

describe('#2115 — controls', () => {
  it('«AB חוצה זווית C» keeps its honest wrong-apex refusal', () => {
    const v = decide(['משולש ABC'], 'AB חוצה זווית C');
    expect(v.kind === 'refused' && v.error.key).toBe('bisector-wrong-apex');
  });

  /** 2-D builds the bisector from A with D on BC; the vertex-less verb now reads the same angle here. */
  it.each(['AD חוצה זווית', 'AD bisects the angle'])('«משולש ABC» · «%s» builds, with D on BC and ∠BAD = ∠DAC', (line) => {
    expect(decide(['משולש ABC'], line).kind).toBe('record');
    const d = derive(['משולש ABC', line], 0);
    expect(d.faults).toEqual([]);
    const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
    const { A, B, C, D } = p;
    const cross = (B.x - D.x) * (C.y - D.y) - (B.y - D.y) * (C.x - D.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.hypot(C.x - B.x, C.y - B.y) ** 2);
    const ang = (u: { x: number; y: number }, w: { x: number; y: number }) =>
      Math.acos(((u.x - A.x) * (w.x - A.x) + (u.y - A.y) * (w.y - A.y)) / (Math.hypot(u.x - A.x, u.y - A.y) * Math.hypot(w.x - A.x, w.y - A.y)));
    expect(ang(B, D)).toBeCloseTo(ang(D, C), 6);
  });

  it('a diagonal is a real bisector: «מרובע ABCD» · «AC חוצה זווית» records', () => {
    expect(decide(['מרובע ABCD'], 'AC חוצה זווית').kind).toBe('record');
  });

  /** 2-D does not build these noun forms over a non-side from the deterministic path (it escalates «חוצה הזווית AD = 5»). */
  it.each(['חוצה הזווית AD', 'חוצה הזווית AD = 5', 'AD is an angle bisector', 'the bisector AD'])(
    '«משולש ABC» · «%s» — a noun form over a non-side stays not-handled (the model seam)',
    (line) => {
      const v = decide(['משולש ABC'], line);
      expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
    },
  );

  it('free points: «AB חוצה את הזווית BAC» keeps the generic degenerate-role answer', () => {
    const v = decide(['נקודה A', 'נקודה B', 'נקודה C'], 'AB חוצה את הזווית BAC');
    expect(v.kind === 'refused' && v.error.key).toBe('degenerate-role');
  });
  it('free points: «AB חוצה זווית לצלע BC» keeps the generic degenerate-role answer', () => {
    const v = decide(['נקודה A', 'נקודה B', 'נקודה C'], 'AB חוצה זווית לצלע BC');
    expect(v.kind === 'refused' && v.error.key).toBe('degenerate-role');
  });
  it('an empty canvas: «AB חוצה את הזווית BAC» is still degenerate-role, never an unknown point', () => {
    const v = decide([], 'AB חוצה את הזווית BAC');
    expect(v.kind === 'refused' && v.error.key).toBe('degenerate-role');
  });
});
