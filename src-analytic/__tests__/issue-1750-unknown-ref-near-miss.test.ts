/**
 * #1750 (ADR-AG-234) — an unknown name that is a NEAR MISS of a name the figure has is refused WITH that name.
 *
 * Operator, round #1736 play, T2: *"if i say «A היא נקודת המפגש של הישר 1 עם הישר 2» - it rejects without explaining
 * that l1 is not like 1"*. The refusal stays (a line «1» and a line «l1» are different names, #1609); it now names the
 * figure's line — and only when the student's sentence with that name in it records (the taught-remedies rule), which
 * every lock below checks by CALLING `decideSubmit` on the substituted sentence.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { nameKey, withName } from '../app/nearMiss';
import { analyticI18n } from '../i18n';

const L_NAMED = ['נתון הישר l1: y=x+1', 'נתון הישר l2: y=-x+5'];
const L_DIGIT = ['נתון הישר 1: y=x+1', 'נתון הישר 2: y=-x+5'];
const he = analyticI18n.getFixedT('he');
const en = analyticI18n.getFixedT('en');
/** The bidi isolates the Hebrew locale puts around a Latin name, removed so the text reads as written. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

function submit(prefix: readonly string[], line: string): { verdict: SubmitVerdict; lines: string[] } {
  const lines: string[] = [];
  for (const s of prefix) {
    const v = decideSubmit(s, lines, 0);
    expect(v.kind, s).toBe('record');
    if (v.kind === 'record') lines.push(v.line);
  }
  return { verdict: decideSubmit(line, lines, 0), lines };
}
function refusal(prefix: readonly string[], line: string) {
  const { verdict, lines } = submit(prefix, line);
  expect(verdict.kind, line).toBe('refused');
  if (verdict.kind !== 'refused') throw new Error('not refused');
  return { error: verdict.error, lines };
}

describe('#1750 — the operator’s line, through the real submit decision', () => {
  const LINE = 'A היא נקודת המפגש של הישר 1 עם הישר 2';

  it('is still refused, and the refusal names the figure’s lines and the one meant', () => {
    const { error } = refusal(L_NAMED, LINE);
    expect(error).toMatchObject({ key: 'unknown-reference', detail: '1', expected: 'line', nearMiss: { suggest: 'l1', existing: ['l1', 'l2'] } });
    expect(plain(errorText(error, he))).toBe(
      'הישר 1 עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו. באיור יש את הישרים l1 ו-l2. התכוונתם ל-l1?',
    );
    expect(errorText(error, en)).toBe(
      'The line 1 has not been defined yet. Define it first, then you can refer to it. The figure has the lines l1 and l2. Did you mean l1?',
    );
  });

  it('DRIVEN: the sentence in the figure’s names records', () => {
    const { lines } = refusal(L_NAMED, LINE);
    expect(decideSubmit('A היא נקודת המפגש של הישר l1 עם הישר l2', lines, 0).kind).toBe('record');
  });
});

describe('#1750 — the class: every near-miss shape, and both directions', () => {
  it('the canonical «A נקודת החיתוך של הישרים 1 ו-2» gets the same suggestion, and its rewrite records', () => {
    const { error, lines } = refusal(L_NAMED, 'A נקודת החיתוך של הישרים 1 ו-2');
    expect(error).toMatchObject({ detail: '1', nearMiss: { suggest: 'l1', existing: ['l1', 'l2'] } });
    expect(decideSubmit('A נקודת החיתוך של הישרים l1 ו-l2', lines, 0).kind).toBe('record');
  });

  it('the other direction: «l1» when the figure has «1» and «2»', () => {
    const { error, lines } = refusal(L_DIGIT, 'A נקודת החיתוך של הישרים l1 ו-l2');
    expect(error).toMatchObject({ detail: 'l1', nearMiss: { suggest: '1', existing: ['1', '2'] } });
    expect(decideSubmit('A נקודת החיתוך של הישרים 1 ו-2', lines, 0).kind).toBe('record');
  });

  it('the script variant «ℓ1» → l1', () => {
    const { error } = refusal(L_NAMED, 'A על הישר ℓ1');
    expect(error).toMatchObject({ detail: 'ℓ1', nearMiss: { suggest: 'l1' } });
  });

  it('a POINT near miss: «A₁» when the figure has A1 — singular noun', () => {
    const { error, lines } = refusal(['A1(-1,2)'], 'שיעור ה-x של A₁ הוא שלילי');
    expect(error).toMatchObject({ detail: 'A₁', expected: 'point', nearMiss: { suggest: 'A1', existing: ['A1'] } });
    expect(plain(errorText(error, he))).toContain('באיור יש את הנקודה A1. התכוונתם ל-A1?');
    expect(errorText(error, en)).toContain('The figure has the point A1. Did you mean A1?');
    expect(decideSubmit('שיעור ה-x של A1 הוא שלילי', lines, 0).kind).toBe('record');
  });
});

describe('#1750 — controls: no near miss, no suggestion; the message is unchanged', () => {
  it('a name with no near miss in the figure: «הישר 7»', () => {
    const { error } = refusal(L_NAMED, 'A על הישר 7');
    expect(error).toEqual({ key: 'unknown-reference', detail: '7', expected: 'line' });
    expect(plain(errorText(error, he))).toBe('הישר 7 עדיין לא הוגדר. הגדירו אותו קודם, ואז אפשר להתייחס אליו.');
  });

  it('a point the figure lacks: «B»', () => {
    const { error } = refusal(['A1(-1,2)'], 'שיעור ה-x של B הוא שלילי');
    expect(error).toEqual({ key: 'unknown-reference', detail: 'B', expected: 'point' });
  });

  it('NOT DRIVABLE: the near miss exists but the sentence in its name would be refused too — no suggestion', () => {
    // l1 has slope -2, so «שיפוע הישר l1 הוא חיובי» is false: teaching it would teach a refusal.
    const { error, lines } = refusal(['נתון הישר l1: y=-2x+1'], 'שיפוע הישר 1 הוא חיובי');
    expect(error).toEqual({ key: 'unknown-reference', detail: '1', expected: 'line' });
    expect(decideSubmit('שיפוע הישר l1 הוא חיובי', lines, 0).kind).toBe('refused');
  });
});

describe('#1750 — the pieces', () => {
  it('nameKey folds the l prefix, ℓ, primes, subscripts and case — and nothing else', () => {
    expect(['1', 'l1', 'ℓ1', 'L1'].map(nameKey)).toEqual(['1', '1', '1', '1']);
    expect(nameKey('A₁')).toBe(nameKey('A1'));
    expect(nameKey("A'")).toBe(nameKey('A'));
    expect(nameKey('l12')).not.toBe(nameKey('l1'));
    expect(nameKey('B')).not.toBe(nameKey('A'));
  });

  it('withName replaces a NAME, never a digit inside an equation, a number or a longer name', () => {
    expect(withName('A נקודת החיתוך של הישרים 1 ו-2', '2', 'l2')).toBe('A נקודת החיתוך של הישרים 1 ו-l2');
    expect(withName('נתון הישר 1: y=x+1', '1', 'l1')).toBe('נתון הישר l1: y=x+1');
    expect(withName('A על הישר 12', '1', 'l1')).toBeNull();
    expect(withName('x = 1.5', '1', 'l1')).toBeNull();
  });
});
