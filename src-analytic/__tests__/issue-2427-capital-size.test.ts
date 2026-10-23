/**
 * #2427 ([ADR-AG-325](../../docs/06c-decisions-analytic.md#adr-ag-325)) — A CAPITAL LETTER USED AS A SIZE IS REFUSED, TEACHING
 * THE LOWERCASE LETTER.
 *
 * Operator, on the #2414 play sheet (T38, «נתון מעגל O שרדיוסו K»): *"Need a message to user saying that sizes are small
 * letters except for R"*. Ruling 2026-10-20 on #2427 (*"accept syntax and recommendations"*): the wording ending with the
 * corrected sentence; the capitals still accepted as sizes («M(K,0)», «K הוא פרמטר חיובי», «שיפוע AB הוא M») refused with
 * the same message; S for an area stays accepted; "only R" stays analytic-only (an EXCEPTIONS family, X11). Ruling
 * 2026-10-21 on #2440 (*"area letter only capital S"*, ADR-AG-325 Amendment 1): an area labelled with any other capital
 * is refused the same way.
 *
 * Every assertion calls the decision the app calls: `decideSubmit`, `reachesFallback`, `decideEdit`, `errorText`.
 */
import { describe, expect, it } from 'vitest';
import { decideEdit, decideSubmit, reachesFallback, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { lowerLone, mayHoldCapitalSize } from '../app/capitalSize';
import { analyticI18n } from '../i18n';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import type { InputError } from '../store/useAnalyticStore';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Submit `lines` in order, as the store does; every line must record (or be known). */
function submitAll(lines: readonly string[]): string[] {
  const recorded: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0);
    if (v.kind === 'record') recorded.push(v.line);
    else if (v.kind !== 'already-known' && v.kind !== 'already-follows') throw new Error(`«${line}» → ${v.kind} ${v.kind === 'refused' ? v.error.key : ''}`);
  }
  return recorded;
}

/** The verdict on the LAST line, after its context recorded. */
function last(steps: readonly string[]): SubmitVerdict {
  const ctx = submitAll(steps.slice(0, -1));
  return decideSubmit(steps[steps.length - 1], ctx, 0);
}

const capitalError = (v: SubmitVerdict): Extract<InputError, { key: 'capital-magnitude' }> | null =>
  v.kind === 'refused' && v.error.key === 'capital-magnitude' ? v.error : null;

const TRI = ['A(0,0)', 'B(3,1)', 'C(1,4)'];

/** The class (the plan's table): each member, its context, the letter and the sentence the refusal teaches. */
const CLASS: readonly { steps: readonly string[]; letter: string; corrected: string }[] = [
  // radius — every spelling
  { steps: ['נתון מעגל O שרדיוסו K'], letter: 'K', corrected: 'נתון מעגל O שרדיוסו k' },
  { steps: ['נתון מעגל שמרכזו O ורדיוסו K'], letter: 'K', corrected: 'נתון מעגל שמרכזו O ורדיוסו k' },
  { steps: ['מעגל שמרכזו M(1,2) ורדיוסו K'], letter: 'K', corrected: 'מעגל שמרכזו M(1,2) ורדיוסו k' },
  { steps: ['נתון מעגל O', 'רדיוס המעגל O הוא K'], letter: 'K', corrected: 'רדיוס המעגל O הוא k' },
  { steps: ['circle O with radius K'], letter: 'K', corrected: 'circle O with radius k' },
  // length
  { steps: [...TRI, 'AB = K'], letter: 'K', corrected: 'AB = k' },
  { steps: [...TRI, 'AB = 2K'], letter: 'K', corrected: 'AB = 2k' },
  { steps: [...TRI, 'אורך AB הוא K'], letter: 'K', corrected: 'אורך AB הוא k' },
  // a parameter inside an equation
  { steps: ['y = Kx + 1'], letter: 'K', corrected: 'y = kx + 1' },
  { steps: ['x² + y² = K²'], letter: 'K', corrected: 'x² + y² = k²' },
  // angle
  { steps: [...TRI, 'זווית ABC = K'], letter: 'K', corrected: 'זווית ABC = k' },
  // the capitals the grammar READ as parameters until the ruling (question 2)
  { steps: ['M(K,0)'], letter: 'K', corrected: 'M(k,0)' },
  { steps: ['M(2K,1)'], letter: 'K', corrected: 'M(2k,1)' },
  { steps: ['K הוא פרמטר חיובי'], letter: 'K', corrected: 'k הוא פרמטר חיובי' },
  { steps: ['A(0,0)', 'B(3,1)', 'שיפוע AB הוא M'], letter: 'M', corrected: 'שיפוע AB הוא m' },
  // a capital left over in a length (the #1701 row)
  { steps: ['משולש ABC', 'AB = AC + D'], letter: 'D', corrected: 'AB = AC + d' },
  // #2440: an area's label is S and only S — every other capital, in every spelling of a stated area
  { steps: ['משולש ABC', 'שטח ABC = T'], letter: 'T', corrected: 'שטח ABC = t' },
  { steps: ['משולש ABC', 'שטח המשולש ABC הוא K'], letter: 'K', corrected: 'שטח המשולש ABC הוא k' },
  { steps: ['משולש ABC', 'שטח ABC = 2T'], letter: 'T', corrected: 'שטח ABC = 2t' },
  { steps: ['משולש ABC', 'נסמן את שטח ABC ב-T'], letter: 'T', corrected: 'נסמן את שטח ABC ב-t' },
  { steps: ['משולש ABC', 'area of ABC is T'], letter: 'T', corrected: 'area of ABC is t' },
];

describe('#2427 — T38, the operator\'s line', () => {
  it('«נתון מעגל O שרדיוסו K» is refused with the ruled sentence, never the model', () => {
    const v = decideSubmit('נתון מעגל O שרדיוסו K', [], 0);
    expect(capitalError(v)).toMatchObject({ letter: 'K', corrected: 'נתון מעגל O שרדיוסו k' });
    expect(reachesFallback(v)).toBe(false);
    if (v.kind !== 'refused') throw new Error('refused');
    expect(errorText(v.error, t)).toBe(
      'אות גדולה היא שם של נקודה, ולכן K לא יכולה לסמן גודל. גדלים מסמנים באות קטנה (r, a, k…), מלבד R לרדיוס. נסו: «נתון מעגל O שרדיוסו k»',
    );
    expect(errorText(v.error, tEn)).toBe(
      'A capital letter is a point\'s name, so K cannot mark a size. Sizes are marked with a lowercase letter (r, a, k…), except R for a radius. Try: "נתון מעגל O שרדיוסו k"',
    );
  });
});

describe('#2427 — every member of the class is refused, owned, and teaches a sentence the next Enter records', () => {
  it.each(CLASS.map((c) => [c.steps[c.steps.length - 1], c] as const))('«%s»', (_, c) => {
    const v = last(c.steps);
    expect(capitalError(v)).toMatchObject({ letter: c.letter, corrected: c.corrected });
    expect(reachesFallback(v)).toBe(false);
    // the taught remedy is one the next Enter accepts
    expect(last([...c.steps.slice(0, -1), c.corrected]).kind).toBe('record');
  });
});

describe('#2427 — controls: what stays as it was', () => {
  it.each([
    [['נתון מעגל O שרדיוסו R']],
    [['נתון מעגל O שרדיוסו k']],
    [[...TRI, 'AB = R']],
    [['(x-13)²+y²=R²']],
    [['y = kx + 1']],
    [[...TRI, 'זווית ABC = k']],
    // S for an area stays accepted (the rulings), in every spelling
    [[...TRI, 'שטח המשולש ABC הוא S']],
    [['A(0,0)', 'B(3,1)', 'C(1,4)', 'D(0,4)', 'מרובע ABCD', 'נסמן את שטח ABCD ב-S']],
    [['משולש ABC', 'שטח ABC = S']],
    [['משולש ABC', 'area of ABC is S']],
    // …and a lowercase area label, the remedy #2440 teaches
    [['משולש ABC', 'שטח ABC = t']],
    // a capital that is a POINT of the figure is the student naming it — left exactly as it was
    [['K(1,1)', 'M(K,0)']],
    [['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'מרכז המעגל I הוא K']],
  ])('«%s» records', (steps) => {
    expect(last(steps).kind).toBe('record');
  });

  it.each([
    [['K(1,1)', 'AB = K']],
    [['משולש ABC', '∠ABC = A']],
    [['משולש ABC', 'AB = 2A']],
    [['משולש ABC', 'AB = A1']],
  ])('«%s» — a capital that names a point still declines, as in 2-D', (steps) => {
    const v = last(steps);
    expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
  });

  it('the R clash is unchanged: «R(1,2)» then «נתון מעגל N שרדיוסו R» is radius-letter-taken', () => {
    const v = last(['R(1,2)', 'N(5,0)', 'נתון מעגל N שרדיוסו R']);
    expect(v.kind === 'refused' && v.error.key).toBe('radius-letter-taken');
  });

  it('a capital the figure ALREADY registered (a saved session) is not new, and is not refused', () => {
    // a session saved before the ruling holds «M(K,0)»; a later line about K is about that parameter
    expect(decideSubmit('K > 0', ['M(K,0)'], 0).kind).toBe('record');
  });

  it('an area label is exempt only inside the area fact: a coordinate capital on the same figure is still asked', () => {
    const v = last(['משולש ABC', 'שטח ABC = S', 'M(K,0)']);
    expect(capitalError(v)).toMatchObject({ letter: 'K', corrected: 'M(k,0)' });
    // and S itself is a size only as the area's label: «M(S,0)» is asked like any other capital
    expect(capitalError(last(['משולש ABC', 'M(S,0)']))).toMatchObject({ letter: 'S', corrected: 'M(s,0)' });
  });

  it('the edit seam asks the same question (ADR-W-006)', () => {
    const lines = ['A(0,0)', 'M(1,0)'];
    expect(decideEdit(1, 'M(K,0)', lines, [], 0)).toBe(false);
    expect(decideEdit(1, 'M(k,0)', lines, [], 0)).toBe(true);
  });
});

describe('#2427 — the lone capital', () => {
  it('lowercases only a capital standing alone; a segment, an indexed or primed name stays', () => {
    expect(lowerLone("AB = 2K + K1 + K' + Kx", 'K')).toBe("AB = 2k + K1 + K' + kx");
    expect(lowerLone('M(K,0)', 'K')).toBe('M(k,0)');
    expect(mayHoldCapitalSize('AB = R')).toBe(false);
    expect(mayHoldCapitalSize('AB = r')).toBe(false);
    expect(mayHoldCapitalSize('AB = K')).toBe(true);
  });
});

describe('#2427 — catalog guard: no advertised sentence is a capital size', () => {
  const entries = COMMAND_CATALOG_ANALYTIC.filter((e) => e.lane !== 'rewrite');
  it.each(entries.flatMap((e) => [[e.he, e.needs ?? []], [e.en, e.needs ?? []]] as const))('«%s»', (s, needs) => {
    let ctx: string[] = [];
    try {
      ctx = submitAll(needs);
    } catch {
      return; // a context that does not type here is the catalog guard's own question, not this one
    }
    expect(capitalError(decideSubmit(s, ctx, 0))).toBeNull();
  });
});
