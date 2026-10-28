/**
 * #2547 ([ADR-AG-334](../../docs/06c-decisions-analytic.md#adr-ag-334)) — A THROUGH-CLAUSE ON A SEGMENT IS REFUSED WHOLE,
 * AS 2-D REFUSES IT (ADR-765), AND NEVER HANDED TO THE MODEL.
 *
 * Operator, 2026-10-26 (D10 = A): *"refuse now, like 2-D … instead of passing it to the AI. The two builders then give
 * the same verdict."* And 2026-10-27, of the three lines the same rule catches where 2-D hands to the AI or calls the
 * line analytic: *"Refuse them too"*. Analytic handed «מעגל O» · «AB מיתר העובר דרך מרכז המעגל» to the model (its frame
 * declines the line, and arm 2 of the lost part leaves a rest that says something). Arm 3 (`declinedThrough`) refuses
 * it with 2-D's parts, string for string — every row's `parts` below is 2-D's, measured at d9494206.
 *
 * Every verdict is the one `App.tsx` dispatches (`decideSubmit`, `reachesFallback`); every text is the one the page
 * renders (`errorText`). No model call is reachable: a model-bound verdict is only asserted.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, reachesFallback, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Type `lines` one by one, as the app does; the verdict of the LAST line, and the lines held before it. */
function typed(lines: readonly string[], seed = 0): { v: SubmitVerdict; held: string[] } {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return { v: decideSubmit(lines[lines.length - 1], held, seed), held };
}

const O = ['מעגל O'];
const EN_O = ['circle O'];
const C = 'העובר דרך מרכז המעגל';

/** [id, context, line, 2-D's parts at d9494206] */
const REFUSED: Array<[string, string[], string, string[]]> = [
  ['01 the report', O, `AB מיתר ${C}`, ['AB מיתר', C]],
  ['02 שעובר', O, 'AB מיתר שעובר דרך מרכז המעגל', ['AB מיתר', 'שעובר דרך מרכז המעגל']],
  ['03 המיתר AB', O, `המיתר AB ${C}`, ['המיתר AB', C]],
  ['04 מיתר AB', O, `מיתר AB ${C}`, ['מיתר AB', C]],
  ['05 מרכז מעגל O', O, 'AB מיתר העובר דרך מרכז מעגל O', ['AB מיתר', 'העובר דרך מרכז מעגל O']],
  ['07 העובר במרכז', O, 'AB מיתר העובר במרכז המעגל', ['AB מיתר', 'העובר במרכז המעגל']],
  ['08 המרכז', O, 'AB מיתר העובר דרך המרכז', ['AB מיתר', 'העובר דרך המרכז']],
  ['09 מרכזו', O, 'AB מיתר במעגל העובר דרך מרכזו', ['AB מיתר במעגל', 'העובר דרך מרכזו']],
  ['R3 במעגל O … מרכזו', O, 'AB מיתר במעגל O העובר דרך מרכזו', ['AB מיתר במעגל O', 'העובר דרך מרכזו']],
  ['R10 ועובר', O, 'AB מיתר ועובר דרך מרכז המעגל', ['AB מיתר', 'ועובר דרך מרכז המעגל']],
  ['R11 comma', O, `AB מיתר, ${C}`, ['AB מיתר', C]],
  ['16 במרכז', O, 'AB מיתר במרכז המעגל', ['AB מיתר', 'במרכז המעגל']],
  ['14 empty canvas', [], `AB מיתר ${C}`, ['AB מיתר', C]],
  ['R6 unnamed circle', ['מעגל'], `AB מיתר ${C}`, ['AB מיתר', C]],
  ['R7 two circles', ['מעגל O', 'מעגל P'], `AB מיתר במעגל O ${C}`, ['AB מיתר במעגל O', C]],
  ['R15 tangent', ['מעגל O', 'C על מעגל O'], `AB משיק למעגל בנקודה C ${C}`, ['AB משיק למעגל בנקודה C', C]],
  ['R16 altitude', ['משולש ABC', 'מעגל O'], `AD גובה ${C}`, ['AD גובה', C]],
  ['S9 median', ['משולש ABC'], `AD תיכון ${C}`, ['AD תיכון', C]],
  ['R13 המעגל החוסם', ['משולש ABC'], 'DE מיתר העובר דרך מרכז המעגל החוסם', ['DE מיתר', 'העובר דרך מרכז המעגל החוסם']],
  ['S7 אמצע AB', ['מעגל O', 'AB מיתר'], 'CD מיתר העובר דרך אמצע AB', ['CD מיתר', 'העובר דרך אמצע AB']],
  ['X9 אמצע BC', O, 'AB מיתר העובר דרך אמצע BC', ['AB מיתר', 'העובר דרך אמצע BC']],
  ['D diameter (true, but unread)', O, `AB קוטר ${C}`, ['AB קוטר', C]],
  ['X10 a further given', O, `AB מיתר ${C} ו-AB = 4`, ['AB מיתר', C, 'AB = 4']],
  ['X12 ומאונך', O, `AB מיתר ${C} ומאונך ל-OC`, ['AB מיתר', `${C} ומאונך ל-OC`]],
  ['X6b מרכז המשולש (a triangle)', ['מעגל O', 'משולש DEF'], 'AB מיתר העובר דרך מרכז המשולש', ['AB מיתר', 'העובר דרך מרכז המשולש']],
  ['X17 הנקודה (bare)', O, 'AB מיתר העובר דרך הנקודה', ['AB מיתר', 'העובר דרך הנקודה']],
  ['X18 מרכז הכובד', O, 'AB מיתר העובר דרך מרכז הכובד', ['AB מיתר', 'העובר דרך מרכז הכובד']],
  ['E1 English', EN_O, 'AB is a chord passing through the centre of the circle', ['AB is a chord', 'passing through the centre of the circle']],
  ['E2 English bare through', EN_O, 'chord AB through the center of the circle', ['chord AB', 'through the center of the circle']],
  ['E4 English the centre', EN_O, 'AB is a chord through the centre', ['AB is a chord', 'through the centre']],
  ['R4 English its centre', EN_O, 'AB is a chord of circle O through its centre', ['AB is a chord of circle O', 'through its centre']],
  ['R5 English segment', EN_O, 'segment AB through the centre of the circle', ['segment AB', 'through the centre of the circle']],
  // operator, 2026-10-27, "Refuse them too": 2-D hands the first two to the AI and calls the third analytic
  ['X5 נקודת החיתוך (asked)', O, 'AB מיתר העובר דרך נקודת החיתוך', ['AB מיתר', 'העובר דרך נקודת החיתוך']],
  ['X6 מרכז המשולש, no triangle (asked)', O, 'AB מיתר העובר דרך מרכז המשולש', ['AB מיתר', 'העובר דרך מרכז המשולש']],
  ['X7 ראשית הצירים (asked)', O, 'AB מיתר העובר דרך ראשית הצירים', ['AB מיתר', 'העובר דרך ראשית הצירים']],
];

const refusal = (v: SubmitVerdict) => {
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${v.kind}`);
  return v.error as { key: string; parts?: string[] };
};

describe('#2547 — a through-clause on a segment is refused whole, with 2-D’s parts', () => {
  it.each(REFUSED)('%s', (_id, context, line, parts) => {
    const { v } = typed([...context, line]);
    const e = refusal(v);
    expect(e.key).toBe('split-statements');
    expect(e.parts).toEqual(parts);
    expect(reachesFallback(v)).toBe(false);
  });

  it('the page renders 2-D’s exact sentence, in Hebrew and in English', () => {
    const { v } = typed([...O, `AB מיתר ${C}`]);
    if (v.kind !== 'refused') throw new Error(v.kind);
    expect(errorText(v.error, he)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: (1) AB מיתר  (2) העובר דרך מרכז המעגל',
    );
    const e = typed([...EN_O, 'AB is a chord passing through the centre of the circle']).v;
    if (e.kind !== 'refused') throw new Error(e.kind);
    expect(errorText(e.error, en)).toBe(
      'One given per line — that way the tool can build and verify each one separately. We spotted two givens here; try entering them as two steps: (1) AB is a chord  (2) passing through the centre of the circle',
    );
  });
});

describe('#2547 — the controls keep their verdicts', () => {
  it('R1 «AB מיתר במעגל O העובר דרך O» keeps arm 2’s parts (ADR-AG-251)', () => {
    const e = refusal(typed([...O, 'AB מיתר במעגל O העובר דרך O']).v);
    expect(e.key).toBe('split-statements');
    expect(e.parts).toEqual(['AB מיתר במעגל O', 'העובר דרך O']);
  });

  /** These go to the model in both builders (or 2-D builds them / refuses them by another member): unchanged here. */
  const TO_MODEL: Array<[string, string[], string]> = [
    ['S5 secant', O, `AB חותך ${C}`],
    ['X1 a fresh letter', ['מעגל O', 'נקודה C'], 'AB מיתר העובר דרך C'],
    ['X2 the point C', ['מעגל O', 'נקודה C'], 'AB מיתר העובר דרך הנקודה C'],
    ['X3 diameter through C (2-D builds)', ['מעגל O', 'C על מעגל O'], 'AB קוטר העובר דרך C'],
    ['X4 circle through A (2-D builds)', ['נקודה A'], 'מעגל העובר דרך A'],
    ['X13 ישר AB', O, `ישר AB ${C}`],
    ['X14 הישר AB', O, `הישר AB ${C}`],
    ['X15 AB ישר', O, `AB ישר ${C}`],
    ['X16 ישר', O, `ישר ${C}`],
    ['L letter not in the head', O, 'AB מיתר העובר דרך O'],
    ['L2 הנקודה O', O, 'AB מיתר העובר דרך הנקודה O'],
    ['LE English letter', EN_O, 'AB is a chord passing through O'],
    ['S1 AB קטע', O, `AB קטע ${C}`],
    ['X8 הראשית', O, 'AB מיתר העובר דרך הראשית'],
    ['X11 a comma before a given', O, `AB מיתר ${C}, AB = 4`],
    ['X19 English origin', EN_O, 'AB is a chord passing through the origin'],
  ];
  it.each(TO_MODEL)('%s still goes to the model', (_id, context, line) => {
    const { v } = typed([...context, line]);
    expect(reachesFallback(v)).toBe(true);
  });

  /** Analytic reads these, and keeps reading them (ADR-AG-193). */
  const RECORDS: Array<[string, string[]]> = [
    ['main verb', [...O, 'המיתר AB עובר דרך מרכז המעגל']],
    ['AB עובר after a chord', [...O, 'AB מיתר', 'AB עובר דרך מרכז המעגל']],
    ['CD עובר after a chord', [...O, 'CD מיתר', 'CD עובר דרך מרכז המעגל']],
    ['O על AB', [...O, 'AB מיתר', 'O על AB']],
    ['AB קוטר', [...O, 'AB קוטר']],
    ['AB קוטר במעגל O', [...O, 'AB קוטר במעגל O']],
  ];
  it.each(RECORDS)('%s still records', (_id, lines) => {
    expect(typed(lines).v.kind).toBe('record');
  });
});

describe('#2547 — the honest remedy builds', () => {
  it('«מעגל O» · «AB מיתר» · «O על AB» puts the centre on AB at every seed', () => {
    const lines = ['מעגל O', 'AB מיתר', 'O על AB'];
    for (let seed = 0; seed < 8; seed++) {
      const { v, held } = typed(lines, seed);
      expect(v.kind).toBe('record');
      const points = derive([...held, lines[2]], seed).figure.points;
      const pt = (id: string) => {
        const p = points.find((q) => q.id === id);
        if (!p) throw new Error(`no point ${id}`);
        return p;
      };
      const [O1, A, B] = [pt('O'), pt('A'), pt('B')];
      const cross = (B.x - A.x) * (O1.y - A.y) - (B.y - A.y) * (O1.x - A.x);
      expect(Math.abs(cross) / Math.hypot(B.x - A.x, B.y - A.y)).toBeLessThan(1e-6);
    }
  });
});
