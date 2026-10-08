/**
 * #1890 (ADR-CX-060) — a property sentence claims only the words it read.
 *
 * Five rules (type claim, conjugates, «לכל n», minimal n, «הפתרון …») found their keyword anywhere in
 * the line and then claimed the WHOLE line, so «z1 אינו ממשי» was recorded as «z1 ממשי» under ✓ and
 * «z1 על הציר הממשי החיובי» drew z₁ at −2.45. The locks: the issue's exact sequences through the real
 * `submitLine`, the per-spelling table, the controls that must read as before, the W20 negation
 * sentence (and that both of its taught examples really read), and the census — an inserted negation
 * or qualifier at any token boundary of any catalog line never parses `ok`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { errorText } from '../app/errorText';
import { activeLines, submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { CATALOG } from '../parser/catalog';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';
import { stripFormatControls } from '../../shell/bidi';

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

/** Submit every line; return whether the LAST was accepted. */
const play = (...lines: string[]): boolean => {
  let ok = false;
  for (const l of lines) ok = submitLine(l);
  return ok;
};

const NEG_HE = (word: string) =>
  `עדיין אי אפשר לקלוט שלילה ("${word}"). ניתן לציין מה כן נתון — למשל "z1 מדומה טהור" או "arg(z1) = 30°".`;
const UNREAD_HE = (detail: string) => `הבנתי חלק מהשורה, אבל לא את: ${detail}`;

describe('#1890 — the issue\'s exact sequences are refused, never recorded as the opposite', () => {
  it.each([
    ['z1 אינו ממשי', 'אינו'],
    ['z1 לא ממשי', 'לא'],
    ['z1 אינו מדומה טהור', 'אינו'],
  ])('«%s» — 2-D\'s negation sentence, nothing drawn, no ✓', (line, word) => {
    expect(play(line)).toBe(false);
    expect(store().lastError?.key).toBe('negation');
    expect(shown('he')).toBe(NEG_HE(word));
    expect(store().lines).not.toContain(line);
    const d = deriveLines(activeLines(), 0, 0);
    expect(d.points).toHaveLength(0);
    expect(d.claims).toHaveLength(0);
  });

  it('«z1 is not real» — the English sentence names "not"', () => {
    expect(play('z1 is not real')).toBe(false);
    expect(store().lastError?.key).toBe('negation');
    expect(shown('en')).toBe(
      'Negation ("not") is not supported yet. State what IS given instead — e.g. "z1 is pure imaginary" or "arg(z1) = 30°".',
    );
  });

  it.each([
    ['z1 על הציר הממשי החיובי', 'החיובי'],
    ['z1 is a positive real number', 'positive'],
  ])('«%s» — a sign word is refused, not dropped (z₁ is no longer drawn at −2.45)', (line, detail) => {
    expect(play(line)).toBe(false);
    expect(store().lastError?.key).toBe('unaccounted');
    expect(shown('he')).toBe(UNREAD_HE(detail));
    expect(store().lines).not.toContain(line);
  });

  it('«z1 = r + i» · «r מספר ממשי שונה מאפס» · «r = 0» — the qualifier is refused, r = 0 is its own given', () => {
    expect(play('z1 = r + i')).toBe(true);
    expect(play('r מספר ממשי שונה מאפס')).toBe(false);
    expect(store().lastError?.key).toBe('unaccounted');
    expect(shown('he')).toBe(UNREAD_HE('שונה, מאפס'));
    expect(play('r = 0')).toBe(true);
    expect(store().lines).toEqual(['z1 = r + i', 'r = 0']);
    expect(deriveLines(activeLines(), 0, 0).claims).toHaveLength(0);
  });

  it('a determined number no longer gets the opposite verdict', () => {
    expect(play('z1 = 3', 'z1 אינו ממשי')).toBe(false);
    expect(store().lastError?.key).toBe('negation');
    store().resetSession();
    expect(play('z1 = 3+4i', 'z1 אינו ממשי')).toBe(false);
    expect(store().lastError?.key).toBe('negation');
  });
});

describe('#1890 — the per-spelling table', () => {
  /** [line, the refusal key, the detail (unread words), the negation word when the key is `negation`] */
  const TABLE: readonly (readonly [string, 'negation' | 'unaccounted', string, string?])[] = [
    ['z1 אינו נמצא על הציר הממשי', 'negation', 'אינו', 'אינו'],
    ['z1 לא מדומה טהור', 'negation', 'לא', 'לא'],
    ['z1 לא על הציר המדומה', 'negation', 'לא', 'לא'],
    ['z1 איננו מספר ממשי', 'negation', 'איננו', 'איננו'],
    ['z1 הוא מספר מרוכב שאינו ממשי', 'negation', 'שאינו', 'שאינו'],
    ['z1 is not pure imaginary', 'negation', 'not', 'not'],
    ['z1 is a complex number that is not real', 'negation', 'not', 'not'],
    ["z1 isn't real", 'negation', "isn, ', t", "isn't"],
    ['z1 is non-real', 'negation', 'non, -', 'non'],
    ['z1 is unreal', 'unaccounted', 'unreal'],
    ['z1 על הציר המדומה החיובי', 'unaccounted', 'החיובי'],
    ['z1 מספר ממשי חיובי', 'unaccounted', 'חיובי'],
    ['z1 ממשי שלילי', 'unaccounted', 'שלילי'],
    ['z1 מדומה טהור שלילי', 'unaccounted', 'שלילי'],
    ['z1 on the positive real axis', 'unaccounted', 'positive'],
    ['z1 is real and positive', 'unaccounted', 'positive'],
    ['z1 is a negative real number', 'unaccounted', 'negative'],
    ['z1 is on the negative imaginary axis', 'unaccounted', 'negative'],
    ['z1 ממשי שונה מאפס', 'unaccounted', 'שונה, מאפס'],
    ['z1 is a nonzero real number', 'unaccounted', 'nonzero'],
    ['z1 ממשי ו-|z1| = 2', 'unaccounted', '-, |, z1, |, =, 2'],
    ['z1 is real, |z1| = 2', 'unaccounted', ',, |, z1, |, =, 2'],
    ['z1 ממשי ו-z2 מדומה טהור', 'unaccounted', 'ממשי, -, z2'],
    ['z1 is real or imaginary', 'unaccounted', 'real'],
    ['z1 has real part 3', 'unaccounted', 'has, part, 3'],
    ['z1 מספר ממשי גדול מ-2', 'unaccounted', 'גדול, מ, -, 2'],
    ['let z1 be real', 'unaccounted', 'z1'],
    ['w ממשי טהור', 'unaccounted', 'טהור'],
    ['z1 ממשי בלבד', 'unaccounted', 'בלבד'],
    ['z1 is real valued', 'unaccounted', 'valued'],
    ['z1 ו-z2 אינם צמודים', 'negation', 'אינם', 'אינם'],
    ['z1 and z2 are not conjugates', 'negation', 'not', 'not'],
    ['z1 ו-z2 צמודים ו-|z1| = 5', 'unaccounted', '-, |, z1, |, =, 5'],
    ['לכל n טבעי w^(4n) אינו ממשי', 'negation', 'אינו', 'אינו'],
    ['for every natural n, w^(4n) is not real', 'negation', 'not', 'not'],
    ['ה-n המינימלי שעבורו w^n אינו ממשי הוא 3', 'negation', 'אינו', 'אינו'],
    ['the minimal n for which w^n is not real is 3', 'negation', 'not', 'not'],
    ['z1 לא ברביע הראשון', 'negation', 'לא', 'לא'],
    ['z1 is not in the first quadrant', 'negation', 'not', 'not'],
  ];
  it.each(TABLE.map(([l, k, d, w]) => [l, k, d, w ?? ''] as [string, string, string, string]))('«%s» → %s (%s)', (line, key, detail, word) => {
    expect(play(line)).toBe(false);
    const e = store().lastError;
    expect(e?.key).toBe(key);
    expect(e && 'detail' in e ? e.detail : '').toBe(detail);
    if (word) expect(shown('he')).toBe(NEG_HE(word));
    else expect(shown('he')).toBe(UNREAD_HE(detail));
    expect(store().lines).toHaveLength(0);
  });

  it.each([
    ['z0 הוא הפתרון שאינו ברביע השלישי', 'שאינו'],
    ['z0 הוא הפתרון שלא ברביע השני', 'שלא'],
    ['z0 is the solution not in the third quadrant', 'not'],
  ])('after «z^3 = 8», «%s» is refused, never the selection IN that quadrant', (line, word) => {
    expect(play('z^3 = 8')).toBe(true);
    expect(play(line)).toBe(false);
    expect(store().lastError).toMatchObject({ key: 'negation', word });
    expect(store().lines).toEqual(['z^3 = 8']);
  });
});

describe('#1890 — what complex can represent is read as typed', () => {
  it('«z1 ו-z2 ממשיים» is two claims, the same as «z1 ממשי» + «z2 ממשי»', () => {
    const r = parseLineV2('z1 ו-z2 ממשיים');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.line.assertions.map((a) => `${a.kind}:${'name' in a ? a.name : ''}`)).toEqual(['real:z1', 'real:z2']);
    expect(r.line.declares).toEqual(['z1', 'z2']);
    expect(play('z1 ו-z2 ממשיים')).toBe(true);
    const pair = deriveLines(activeLines(), 0, 0);
    store().resetSession();
    play('z1 ממשי', 'z2 ממשי');
    const two = deriveLines(activeLines(), 0, 0);
    expect(pair.configCount).toBe(two.configCount);
    expect(pair.claims.map((c) => c.verdict.status)).toEqual(['holds', 'holds']);
    expect(two.claims.map((c) => c.verdict.status)).toEqual(['holds', 'holds']);
  });
});

describe('#1890 — unchanged controls', () => {
  it.each([
    ['z1 ממשי', 'real'],
    ['z1 מספר ממשי', 'real'],
    ['z1 הוא מספר ממשי', 'real'],
    ['z1 הינו מספר ממשי', 'real'],
    ['z1 is real', 'real'],
    ['z1 is a real number', 'real'],
    ['z1 מדומה טהור', 'imaginary'],
    ['z1 is pure imaginary', 'imaginary'],
    ['z1 is purely imaginary', 'imaginary'],
    ['z1 is imaginary', 'imaginary'],
    ['z1 על הציר הממשי', 'real'],
    ['z1 נמצא על הציר המדומה', 'imaginary'],
    ['z1 lies on the real axis', 'real'],
  ])('«%s» reads as the %s claim, ✓', (line, kind) => {
    expect(play(line)).toBe(true);
    const d = deriveLines(activeLines(), 0, 0);
    expect(d.claims.map((c) => [c.claim.kind, c.verdict.status])).toEqual([[kind, 'holds']]);
  });

  it.each(['z1 ו-z2 צמודים', 'z1 ו-z2 צמודים זה לזה', 'z1 and z2 are conjugates of each other'])(
    '«%s» reads as the conjugates claim',
    (line) => {
      const r = parseLineV2(line);
      expect(r.ok && r.line.assertions.map((a) => a.kind)).toEqual(['conjugates']);
    },
  );

  it('«z^3 = 8» · «z0 הוא הפתרון ברביע השלישי» is still a selection', () => {
    expect(play('z^3 = 8', 'z0 הוא הפתרון ברביע השלישי')).toBe(true);
    const r = parseLineV2('z0 הוא הפתרון ברביע השלישי');
    expect(r.ok && r.line.selections.map((x) => x.filter)).toEqual([
      { kind: 'quadrant', name: 'z0', q: 3, src: 'z0 הוא הפתרון ברביע השלישי' },
    ]);
  });

  it('verdicts: «z1 = 3+4i» · «z1 מדומה טהור» stays ✗; «w ממשי» · «w = (2+3i)(2-3i)» stays ✓', () => {
    play('z1 = 3+4i', 'z1 מדומה טהור');
    expect(deriveLines(activeLines(), 0, 0).claims.map((c) => c.verdict.status)).toEqual(['refuted']);
    store().resetSession();
    play('w ממשי', 'w = (2+3i)(2-3i)');
    expect(deriveLines(activeLines(), 0, 0).claims.map((c) => c.verdict.status)).toEqual(['holds']);
  });

  it('«z1, z2 ו-z3 ממשיים» stays not-handled', () => {
    expect(play('z1, z2 ו-z3 ממשיים')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
  });
});

describe('#1890 (W20) — the negation sentence teaches lines that really read', () => {
  // A taught remedy is a hypothesis until it drives: both examples go through the real submit path.
  it.each(['z1 מדומה טהור', 'arg(z1) = 30°', 'z1 is pure imaginary'])('«%s» is accepted', (line) => {
    expect(play(line)).toBe(true);
    expect(store().lines).toEqual([line]);
  });
});

describe('#1890 — the class guard: no catalog line reads with an inserted negation or qualifier', () => {
  const extra = [
    'z1 ממשי', 'z1 מדומה טהור', 'z1 is real', 'z1 is pure imaginary', 'z1 על הציר הממשי', 'z1 ו-z2 צמודים זה לזה',
    'z1 and z2 are conjugates', 'z0 הוא הפתרון ברביע השלישי', 'z0 is the solution in the third quadrant',
    'z1 ברביע הראשון', 'ה-n המינימלי שעבורו w^n מדומה טהור הוא 5', 'arg z1 = 30', '|z1| = 2', '30 < arg z1 < 60',
  ];
  const lines = [
    ...CATALOG.flatMap((e) => [{ line: e.he, lang: 'he' as const }, { line: e.en, lang: 'en' as const }]),
    ...extra.map((l) => ({ line: l, lang: /[֐-׿]/u.test(l) ? ('he' as const) : ('en' as const) })),
  ];
  const WORDS = { he: ['אינו', 'חיובי', 'שונה מאפס'], en: ['not', 'positive', 'nonzero'] };

  it('every variant is refused (186 parsed ok before ADR-CX-060)', () => {
    let tried = 0;
    const leaks: string[] = [];
    for (const { line, lang } of lines) {
      if (!parseLineV2(line).ok) continue;
      const toks = line.split(/\s+/);
      for (let i = 1; i <= toks.length; i++) {
        for (const w of WORDS[lang]) {
          const v = [...toks.slice(0, i), w, ...toks.slice(i)].join(' ');
          tried++;
          if (parseLineV2(v).ok) leaks.push(v);
        }
      }
    }
    expect(tried).toBeGreaterThan(1000);
    expect(leaks).toEqual([]);
  });
});
