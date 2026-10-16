/**
 * #1355 (ADR-AG-279) — the analytic LLM seam accounts the model's answer against the student's sentence.
 *
 * Before: `runFallback` committed any answer whose lines re-parsed. A real student lost the stated leg 5 to a
 * green figure (prod, 2026-10-13), and the log holds nine more answers that dropped or invented a name. Now a
 * stated name or number the answer loses, or a name it writes that nobody stated, refuses the whole answer.
 *
 * **No live call anywhere in this file** (standing rule 2): every model answer is a stub returning the logged
 * (or, where marked ORACLE, authored) answer. The real rows are the model's own output, from
 * `logs/prod-events-analytic.jsonl` and `logs/debug-log-analytic.jsonl`.
 */
import { describe, expect, it, vi } from 'vitest';
import { fallbackRefusal, runFallback, type FallbackOutcome } from '../app/fallback';
import { faithfulnessAnalytic, existingNamesAnalytic } from '../parser/honestyAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { PROMPT_SPEC_ANALYTIC } from '../parser/llmSharedAnalytic';
import { derive } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { studentFacingViolations } from '../../shell/studentText';
import type { InputError } from '../store/useAnalyticStore';

/** The text without the bidi isolates the i18n post-processor wraps Latin runs in. */
const plain = (s: string): string => s.replace(/[⁦-⁩‎‏]/g, '');
const ask = (steps: string[]) => vi.fn().mockResolvedValue({ steps });
const run = (utterance: string, ctx: string[], answer: string[]): Promise<FallbackOutcome> => runFallback(utterance, ctx, 0, ask(answer));
const gates = (utterance: string, answer: string[], ctx: string[] = []) =>
  faithfulnessAnalytic(utterance, answer, existingNamesAnalytic(derive(ctx, 0).construction));

const OMG = ['משולש OMG', 'O(0,0)'];
const LINE_AND_CIRCLE = ['נתון מעגל I שמשוואתו x^2+y^2=16', 'הישר l1 הוא y=x'];
const LEG5 = 'משולש ישר זוית ABC  על מערכת צירים ברביע 1 2 3 4  כך שאורכי הניצבים 12 5 ושעורי הקודקודיים  B(10,-11) A(10,1)';

describe('#1355 (a) — the logged answers that lose or invent a name are refused, naming what was lost', () => {
  it.each<[string, string, string[], string[], string[], boolean]>([
    // [log row, utterance, context, model answer, dropped (as typed), invented]
    ['#20 dev 09-28 (B, C dropped: the altitude went to another side)', 'MH גובה לצלה BC', OMG, ['MH גובה לצלע OG'], ['B', 'C'], false],
    ['#4 dev 09-20 (the line «ישר 1» renamed l1)', 'משוואת ישר 1 היא 2x-y+8=0', [], ['line l1: 2x-y+8=0'], ['ישר 1'], true],
    ['#5 dev 09-21 (B invented)', 'נתונה הנקודה (3, -1)', [], ['נתונה הנקודה B(3,-1)'], [], true],
    ['#59 prod 09-28 (H invented)', 'גובה מנקודה M לצלע OG', OMG, ['MH גובה לצלע OG'], [], true],
    ['#34 prod 09-25 (l1 dropped: the crossing is gone)', 'A נקודת החיתוך של הישר l1 והמעגל I', LINE_AND_CIRCLE, ['A על המעגל I'], ['l1'], false],
    ['#42 prod 09-25 (l1, B dropped)', 'הישר l1 חותך את המעגל I בנקודות A ו-B', LINE_AND_CIRCLE, ['A על מעגל I'], ['l1', 'B'], false],
    ['#66 prod 10-01 (C dropped: BC’s tangency is gone)', 'AB ו- BC משיקים למעגל', ['מעגל O', 'A(0,5)', 'B(5,5)'], ['AB משיק למעגל O'], ['C'], false],
    ['#65 prod 09-29 (A, B, C, D invented)', 'מרובע חסום במעגל', [], ['המעגל החוסם את המרובע ABCD'], [], true],
    ['prod 2026-10-13 f3yiwxyu (the leg 5 lost behind a green figure)', LEG5, [], ['A(10,1)', 'B(10,-11)', 'משולש ישר זווית ABC'], ['2', '3', '4', '12', '5', '1'], false],
  ])('%s', async (_row, utterance, ctx, answer, dropped, invented) => {
    const out = await run(utterance, ctx, answer);
    expect(out).toEqual({ kind: 'unfaithful', dropped, invented, answer });
  });

  /** Rows whose answer is refused EARLIER (an unknown reference), so the gate never runs: locked on the gate itself. */
  it.each<[string, string, string[], string[], string[], string[]]>([
    ['#60 prod 09-28 (l2 dropped)', 'מעגל M משיק לישרים l1 ו- l2', ['הישר l1 הוא y=x'], ['מעגל M משיק לישר l1'], ['l2'], []],
    ['prod 10-?? wnyd1luh (the triangle and both legs dropped)', 'משולש ישר זוית ABC  על מערכת צירים ברביע 1 2 3 4 הנקודה (10,1)A כך שאורכי הניצבים 12 5  ', [], ['A(10,1)'], ['B', 'C', '2', '3', '4', '1', '12', '5'], []],
    ['prod (the origin named O by the model)', 'המשך DA ו CB נפגשים בראשית הצירים', ['טרפז ABCD'], ['המשכי הצלעות AD ו-BC נפגשים בנקודה O'], [], ['O']],
  ])('%s', (_row, utterance, ctx, answer, dropped, invented) => {
    expect(gates(utterance, answer, ctx)).toEqual({ dropped, invented });
  });
});

describe('#1355 (b) — the logged FAITHFUL answers still commit (must-not-change)', () => {
  it.each<[string, string[], string[]]>([
    ['Given point A(2,6)', [], ['point A(2,6)']],
    ['ABCD דלתון', [], ['דלתון ABCD']],
    ['BD מונח על הישר y=x', ['דלתון ABCD'], ['הישר BD היא y=x']],
    ['O ראשית הצירים', [], ['O(0,0)']],
    ['∠ABC = 90', ['משולש ABC'], ['הצלע AB מאונכת לצלע BC']],
    ['c נמצא על הישר y=-2x+17', [], ['C על הישר y=-2x+17']],
    ['דרך נקודה C מעבירים ישר l2 המקביל ל- AB', ['משולש ABC'], ['דרך C עובר ישר l2', 'l2 ∥ AB']],
    ['(3,5)', [], ['נתונה הנקודה (3,5)']],
    ['(3,5)A', [], ['A(3,5)']],
    ['c(4,7)', [], ['C(4,7)']],
    ["C(-3'5)", [], ['C(-3,5)']],
    ['nauka ABC', [], ['משולש ABC']],
    ['C', [], ['נקודה C']],
    ['AB = 3 ו-BC = 4', ['משולש ABC'], ['AB = 3', 'BC = 4']],
    ['AB = 3, בלה בלה', ['משולש ABC'], ['AB = 3']],
    ['נתון מעגל I - x^2+y^2=16', [], ['נתון מעגל I שמשוואתו x^2+y^2=16']],
    ['משוואת הבסיס היא x-2y+6=0', ['טרפז ABCD'], ['משוואת הצלע BC היא x-2y+6=0']],
    ['דרך הנקודה ‎P‎ מעבירים אנך לישר ‎AB‎', ['A(0,0)', 'B(4,0)', 'P(1,3)'], ['ישר דרך P מאונך ל-AB']],
  ])('«%s» still records', async (utterance, ctx, answer) => {
    const out = await run(utterance, ctx, answer);
    expect(out.kind, JSON.stringify(out)).toBe('lines');
  });
});

describe('#1355 (c) — ORACLE rows (authored by the session as the model, not evidence)', () => {
  it.each<[string, string, string[], string[], boolean]>([
    ['O1 the centre lost', 'נתון מעגל שמרכזו בנקודה (2,3) ושרדיוסו הוא 5', ['נתון מעגל שמשוואתו x^2+y^2=25'], ['2', '3'], false],
    ['O2b computed, and a name invented', 'ישר שעובר דרך (2,3) ושיפועו 4', ['משוואת הישר l1 היא y=4x-5'], ['3', '4'], true],
    ['O4 the parameter’s bound lost', 'הפרמטר a קטן מ 13 בבקשה', ['a פרמטר'], ['13'], false],
    ['O5 the ratio lost', 'הנקודה P מחלקת את הקטע AB ביחס של 2 ל 3', ['P אמצע AB'], ['2', '3'], false],
    ['O7 B dropped and l1 invented', 'תעביר ישר דרך A ודרך B', ['דרך A עובר ישר l1'], ['B'], true],
    ['#437 multiset: one 4 cannot pay for two', 'ריבוע ABCD במידות 4*4', ['ריבוע ABCD', 'AB = 4'], ['4'], false],
  ])('%s refuses', (_name, utterance, answer, dropped, invented) => {
    const f = gates(utterance, answer, ['A(0,0)', 'B(4,0)']);
    expect(f.dropped).toEqual(dropped);
    expect(f.invented.length > 0).toBe(invented);
  });

  it.each<[string, string, string[]]>([
    ['O1f the centre kept', 'נתון מעגל שמרכזו בנקודה (2,3) ושרדיוסו הוא 5', ['נתון מעגל שמשוואתו (x-2)^2+(y-3)^2=25']],
    ['O2 the ADR-AG-186 point-slope form', 'ישר שעובר דרך (2,3) ושיפועו 4', ['הישר y-3=4(x-2)']],
    ['O5f the ratio kept', 'הנקודה P מחלקת את הקטע AB ביחס של 2 ל 3', ['P מחלקת את AB ביחס 2:3']],
    ['O8 90 is a right angle', 'הזווית ABC שווה 90 מעלות', ['הצלע AB מאונכת לצלע BC']],
    ['a radius stated, r² in the equation', 'מעגל שמרכזו בראשית ורדיוסו 3', ['נתון מעגל שמשוואתו x^2+y^2=9']],
    ['the English article is not the parameter a', 'a line through A and B', ['the line AB']],
    ['a juxtaposed parameter is read in the equation', 'the parabola y=ax^2+bx+c', ['the parabola y=ax^2+bx+c']],
    ['a numeral name in words («ישר שלוש» is the student’s 3)', 'תוסיף ישר שלוש', ['ישר 3']],
    ['plural numeral names («הישרים 1 ו-2»)', 'A נקודת החיתוך של הישרים 1 ו-2', ['A היא נקודת החיתוך של ישר 1 וישר 2']],
    ['a count is not a magnitude', 'מנקודה A יוצאים 2 משיקים למעגל O', ['המשיקים מ-A למעגל O']],
  ])('%s commits', (_name, utterance, answer) => {
    expect(gates(utterance, answer, ['A(0,0)', 'B(4,0)', 'מעגל O'])).toEqual({ dropped: [], invented: [] });
  });
});

/**
 * (d) THE FALSE-POSITIVE NET for the whole grammar: every catalogue example, as both the sentence and the
 * answer, trips no gate — in both locales. A vocabulary that misreads a name or a number in any family fails here.
 */
describe('#1355 (d) — every catalogue example is faithful to itself', () => {
  it.each(COMMAND_CATALOG_ANALYTIC.flatMap((e) => [[e.he], [e.en]]))('«%s»', (line) => {
    expect(faithfulnessAnalytic(line, [line], new Set())).toEqual({ dropped: [], invented: [] });
  });
});

describe('#1355 (e) — what the student reads', () => {
  const original: InputError = { key: 'not-handled', detail: 'x' };
  const t = (lng: 'he' | 'en') => analyticI18n.getFixedT(lng) as unknown as (k: string, o?: Record<string, unknown>) => string;

  it('a dropped given names the student’s own tokens; dropped wins over invented (2-D’s order)', () => {
    const e = fallbackRefusal({ kind: 'unfaithful', dropped: ['l1', 'B'], invented: true, answer: [] }, 'הישר l1 חותך את המעגל I בנקודות A ו-B', original);
    expect(e).toEqual({ key: 'llm-dropped', detail: 'הישר l1 חותך את המעגל I בנקודות A ו-B', labels: 'l1, B' });
    expect(plain(errorText(e, t('he')))).toBe('הבנתי רק חלקית — לא הצלחתי למקם את l1, B. נסחו את הצעד מחדש (למשל פרקו אותו לשני צעדים).');
    expect(plain(errorText(e, t('en')))).toContain("I couldn't place l1, B.");
    expect(studentFacingViolations(['l1, B'], { typed: e.detail, names: [] })).toEqual([]);
  });

  it('an invented name interpolates nothing — the model’s letter is not the student’s (ADR-W-096)', () => {
    const e = fallbackRefusal({ kind: 'unfaithful', dropped: [], invented: true, answer: ['MH גובה לצלע OG'] }, 'גובה מנקודה M לצלע OG', original);
    expect(e).toEqual({ key: 'llm-invented', detail: 'גובה מנקודה M לצלע OG' });
    for (const lng of ['he', 'en'] as const) expect(errorText(e, t(lng))).not.toMatch(/\bH\b/);
  });

  it('#20, the operator’s exact sequence: nothing is recorded, and the figure keeps B and C out', async () => {
    const out = await run('MH גובה לצלה BC', OMG, ['MH גובה לצלע OG']);
    expect(out.kind).toBe('unfaithful');
    expect(derive(OMG, 0).construction.objects.map((o) => o.id)).not.toContain('H');
  });

  it('the prompt asks for what the gates enforce (He and En prompts share the rules)', () => {
    expect(PROMPT_SPEC_ANALYTIC.rules.join('\n')).toMatch(/Never name what the student did not name/);
    expect(PROMPT_SPEC_ANALYTIC.rules.join('\n')).toMatch(/every number the student states/);
  });
});
