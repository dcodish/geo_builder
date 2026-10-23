/**
 * #1974 (ADR-CX-063) — a RESERVED CONSTANT as a subject is NAMED, never «לא הצלחתי להבין את המשפט».
 *
 * #1948 (ADR-CX-062) closed the honesty hole: «i ממשי» no longer draws a point «i» and marks the
 * claim ✓ real. But it refused with the generic not-understood, and the tool understood the sentence
 * perfectly — it refused because `i` is the imaginary unit. That is the message docs/10 forbids for
 * something the tool CAN decide, and the operator ruled the two sentences (2026-10-10):
 *
 * - «i ממשי» → «i הוא מספר מדומה» — `i` IS a number, so the sentence says what it is;
 * - «o ממשי» → «o מסמן את ראשית הצירים — אפשר לבחור שם אחר» — `o` is a POSITION, so the sentence
 *   says what it marks and tells the student they may pick another name.
 *
 * The root cause was the FLOOR (`isDeclarableName`) rejecting for two different reasons through one
 * boolean. It carries the reason now (`declarabilityOf`), the subject reader passes it out of the
 * rule, and `parseLineV2` reports it — so EVERY sentence that reads a subject gives the new message,
 * not only the type claim. The #1948 class («foo») keeps the not-understood message, because for a
 * word that is no name at all "I did not understand" is honest.
 *
 * Everything runs through the real `submitLine` + `errorText`, in both languages.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { errorText } from '../app/errorText';
import { activeLines, submitLine } from '../app/submit';
import { deriveLines, lowerLines } from '../app/deriveLines';
import { declarabilityOf, isDeclarableName } from '../parser/exprParse';
import { parseLineV2 } from '../parser/rules';
import { complexI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const tHe = complexI18n.getFixedT('he');
const tEn = complexI18n.getFixedT('en');
const shown = (lang: 'he' | 'en'): string => {
  const e = store().lastError;
  if (!e) return '';
  const t = lang === 'he' ? tHe : tEn;
  return stripFormatControls(errorText(e, (k, p) => t(k, p)));
};

const play = (...lines: string[]): boolean => {
  let ok = false;
  for (const l of lines) ok = submitLine(l);
  return ok;
};
const derived = (seed = 0) => deriveLines(activeLines(), seed, seed, []);

const I_SENTENCE = 'i הוא מספר מדומה';
const O_SENTENCE = 'o מסמן את ראשית הצירים — אפשר לבחור שם אחר';

describe('#1974 — the operator\'s own line', () => {
  /** The exact utterance he played in round #1959, case T28 — the permanent lock. */
  it('«i ממשי» answers «i הוא מספר מדומה» and draws nothing', () => {
    expect(play('i ממשי')).toBe(false);
    expect(store().lastError?.key).toBe('reserved-constant');
    expect(shown('he')).toBe(I_SENTENCE);
    expect(activeLines()).toEqual([]);
    expect(derived().points).toEqual([]);
    expect(derived().claims).toEqual([]);
    expect(derived().params).toEqual([]);
  });

  it('«o ממשי» answers the origin sentence he chose', () => {
    expect(play('o ממשי')).toBe(false);
    expect(shown('he')).toBe(O_SENTENCE);
    expect(activeLines()).toEqual([]);
    expect(derived().points).toEqual([]);
  });

  it('neither sentence is the not-understood message any more', () => {
    for (const line of ['i ממשי', 'o ממשי']) {
      store().resetSession();
      play(line);
      expect(shown('he')).not.toContain('לא הבנתי את הבקשה');
    }
  });

  it('English reads the same two sentences', () => {
    expect(play('i is real')).toBe(false);
    expect(shown('en')).toBe('i is an imaginary number');
    store().resetSession();
    expect(play('o is real')).toBe(false);
    expect(shown('en')).toBe('o marks the origin — you may choose another name');
  });
});

/**
 * The CLASS: every rule that reads a subject (ADR-CX-062's census of seven) gives the same answer.
 * «i ברביע הראשון» and «arg i = 45» are the same student mistake as «i ממשי».
 */
describe('#1974 — every subject-reading sentence, both constants', () => {
  const FORMS: readonly [string, (n: string) => string][] = [
    ['typeClaim · real', (n) => `${n} ממשי`],
    ['typeClaim · real, spelled', (n) => `${n} מספר ממשי`],
    ['typeClaim · real, copula', (n) => `${n} הוא מספר ממשי`],
    ['typeClaim · english', (n) => `${n} is a real number`],
    ['typeClaim · pure imaginary', (n) => `${n} מדומה טהור`],
    ['typeClaim · pair, left', (n) => `${n} ו-z2 ממשיים`],
    ['quadrantGiven', (n) => `${n} ברביע הראשון`],
    ['quadrantGiven · english', (n) => `${n} is in the first quadrant`],
    ['argumentRelation · one', (n) => `arg ${n} = 45`],
    ['argumentRelation · minus', (n) => `arg ${n} - arg z2 = 90`],
    ['argumentRelation · plus', (n) => `arg ${n} + arg z2 = 90`],
    ['argumentInequality · one-sided', (n) => `arg ${n} < 45`],
    ['argumentInequality · window', (n) => `90 < arg ${n} < 180`],
    ['conjugatesClaim', (n) => `${n} ו-z2 צמודים זה לזה`],
    ['conjugatesClaim · english', (n) => `${n} and z2 are conjugates`],
    ['solutionSelection', (n) => `${n} הוא הפתרון ברביע הרביעי`],
  ];

  for (const [rule, form] of FORMS) {
    it.each([
      ['i', I_SENTENCE],
      ['o', O_SENTENCE],
    ])(`${rule} — «%s» is named, not pleaded`, (name, sentence) => {
      const line = form(name);
      expect(play(line)).toBe(false);
      expect(store().lastError?.key).toBe('reserved-constant');
      expect(shown('he')).toBe(sentence);
      expect(activeLines()).toEqual([]);
      for (const seed of [0, 1, 2]) expect(derived(seed).points).toEqual([]);
      expect(derived().claims).toEqual([]);
      expect(lowerLines([line]).declared).toEqual([]);
    });
  }

  it('both constants in one sentence answer for the one the figure met first', () => {
    expect(play('arg i - arg o = 90')).toBe(false);
    expect(shown('he')).toBe(I_SENTENCE);
    store().resetSession();
    expect(play('o ו-i צמודים זה לזה')).toBe(false);
    expect(shown('he')).toBe(O_SENTENCE);
  });

  /**
   * A word that is no name at all leaves the line genuinely unread, so «foo» keeps #1948's message
   * even beside a constant: the tool really did not understand *that* subject.
   */
  it('a constant beside an unreadable word stays in the #1948 class', () => {
    expect(play('foo ו-i צמודים זה לזה')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
    store().resetSession();
    expect(play('arg i - arg foo = 90')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
  });

  it('the refusal never leaks internal state — it is the sentence and nothing else', () => {
    play('i ברביע הראשון');
    expect(shown('he')).toBe(I_SENTENCE);
    expect(shown('he')).not.toContain('reserved');
    expect(shown('he')).not.toContain('{{');
  });
});

describe('#1974 — the floor carries the reason, and only the reason', () => {
  it('the two constants are «reserved-constant»; a word is «not-a-name»', () => {
    expect(declarabilityOf('i')).toEqual({ ok: false, why: 'reserved-constant', constant: 'i' });
    expect(declarabilityOf('o')).toEqual({ ok: false, why: 'reserved-constant', constant: 'o' });
    expect(declarabilityOf('foo')).toEqual({ ok: false, why: 'not-a-name' });
    expect(declarabilityOf('ab')).toEqual({ ok: false, why: 'not-a-name' });
  });

  /**
   * An INDEXED relative is not a constant — `i2` means nothing this tool knows, it merely shares a
   * reserved letter. So it stays in the #1948 class, and the floor's yes/no is unchanged for it.
   */
  it('`i2` / `o3` are not constants: the floor still refuses them, with the honest reason', () => {
    for (const n of ['i2', 'o3', 'i12']) {
      expect(declarabilityOf(n)).toEqual({ ok: false, why: 'not-a-name' });
      expect(isDeclarableName(n)).toBe(false);
    }
  });

  it('the yes/no floor is unchanged for every name', () => {
    for (const n of ['z1', 'w', 'a', 'a12', 'r', 'A1']) expect(isDeclarableName(n)).toBe(true);
    for (const n of ['i', 'o', 'i2', 'foo', 'ab', 'zz1']) expect(isDeclarableName(n)).toBe(false);
  });

  it('a declined rule never short-circuits the rule list: the parse outcome names the reason', () => {
    const p = parseLineV2('i ממשי');
    expect(p.ok).toBe(false);
    expect(!p.ok && p.reason).toBe('reserved-constant');
    expect(!p.ok && p.reason === 'reserved-constant' && p.constant).toBe('i');
  });
});

describe('#1974 — nothing else moved', () => {
  it('«foo ממשי» and the #1948 class keep the not-understood message', () => {
    for (const line of ['foo ממשי', 'foo מדומה טהור', 'arg foo = 45', 'AB ממשי', 'i2 ממשי', 'o3 ברביע הראשון']) {
      store().resetSession();
      expect(play(line)).toBe(false);
      expect(store().lastError?.key).toBe('not-handled');
      expect(shown('he')).toContain('לא הבנתי את הבקשה');
    }
  });

  it('the false-refusal net: a legitimate name still reads', () => {
    for (const [line, points] of [
      ['z1 ממשי', ['z1']],
      ['A1 ממשי', ['A1']],
      ['arg z1 = 45', ['z1']],
    ] as const) {
      store().resetSession();
      expect(play(line)).toBe(true);
      expect(derived().points.map((p) => p.name)).toEqual(points);
    }
  });

  it('a legitimate indexed parameter still types: «a12 ממשי», «z1 ממשי»', () => {
    expect(play('a12 ממשי')).toBe(true);
    expect(derived().params).toEqual([{ name: 'a12', value: null }]);
    expect(derived().claims.map((c) => c.verdict.status)).toEqual(['holds']);
  });

  it('a DECLARED family still reads after the change', () => {
    expect(play('u מספר מרוכב', 'u2 ממשי')).toBe(true);
    expect(derived().points.map((p) => p.name).slice().sort()).toEqual(['u', 'u2']);
  });

  it('`i` as the imaginary UNIT is untouched — it is only a SUBJECT that is refused', () => {
    expect(play('z1 = 3+4i')).toBe(true);
    expect(derived().points.map((p) => p.name)).toEqual(['z1']);
    store().resetSession();
    expect(play('z1 = 2i')).toBe(true);
  });

  it('the origin is still the origin: «|z1-o| = 5» reads', () => {
    expect(play('|z1-o| = 5')).toBe(true);
    expect(activeLines()).toEqual(['|z1-o| = 5']);
  });
});
