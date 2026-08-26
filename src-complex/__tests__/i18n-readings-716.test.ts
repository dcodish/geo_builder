/**
 * #716 — THE ENGINE'S READINGS FOLLOW THE UI LANGUAGE.
 *
 * The operator's report (B3 parity round, 2026-08-18): with the UI toggled to English, the honesty
 * strip and the panel readings still rendered Hebrew — «אין תצורה תקפה», «הצורה נקבעה במלואה», the
 * ✗/?/⚠ row suffixes. The strings were COMPOSED in the solve/replay layers, so no toggle could
 * reach them.
 *
 * The fix: the engine publishes structured codes (`model/why.ts`); `whyText` in `replay/scene2.ts`
 * words them through the product i18n, in the language it is handed. These locks drive every
 * reading surface through the REAL resources in both languages:
 *   - under `en`, no reading may contain a Hebrew codepoint (the class, not one string);
 *   - under `he`, the exact wordings the product always showed still render.
 * Student SOURCES are exempt by design — a Hebrew line the student typed is quoted verbatim in
 * any language, which is why the English sweep uses English input.
 */
import { describe, expect, it } from 'vitest';

import { stripFormatControls } from '../../shell/bidi';
import { deriveLines } from '../app/deriveLines';
import { complexI18n } from '../i18n';
import type { Translate } from '../model/why';
import { v2Claims, v2Contradiction, v2Freedom, v2Knowledge, v2Measures, whyText } from '../replay/scene2';

// The real product resources, with the bidi isolates stripped: the locks compare VISIBLE text,
// exactly as ADR-W-029 draws the line between display markup and content.
const fixed = (lng: 'he' | 'en'): Translate => {
  const t = complexI18n.getFixedT(lng);
  return (key, params) => stripFormatControls(t(key, params));
};
const tHe = fixed('he');
const tEn = fixed('en');
const HEBREW = /[֐-׿]/;

/** Every reading surface for one figure, in one language — the full #716 class. */
const readings = (lines: string[], t: typeof tEn): string[] => {
  const d = deriveLines(lines, 0, 0);
  return [
    v2Freedom(d, t),
    v2Contradiction(d, t) ?? '',
    ...v2Knowledge(d, t),
    ...v2Measures(d, t),
    ...v2Claims(d, t),
    ...d.untranslated.map((u) => whyText(u.why, t)),
    // the strip suffixes the App composes around unsatisfied/undecided sources
    t('stripUnsatisfied'),
    t('stripUndecided'),
  ];
};

// English input across the families: free DOF, a claim verdict, a measure verdict, a withheld
// value, an unreadable line, and (separately below) a contradiction.
const EN_LINES = [
  'z1 = 3+4i',
  'z2',
  'length z1z2 = 99',
  'area Oz1z2',
  'z1 is real',
  'this line parses nowhere',
];

describe('#716 — English mode answers in English', () => {
  it('no reading surface emits a Hebrew codepoint over English input', () => {
    for (const r of readings(EN_LINES, tEn)) {
      expect(r, r).not.toMatch(HEBREW);
    }
  });

  it('the contradiction line and its axis word are English', () => {
    const line = v2Contradiction(deriveLines(['z1 = 3+4i', '|z1| = 7'], 0, 0), tEn)!;
    expect(line).toContain('✗');
    expect(line).not.toMatch(HEBREW);
    expect(line).toContain('modulus'); // the axis code is worded, never leaked raw… in English here
  });

  it('a claim verdict words its why in English', () => {
    const d = deriveLines(['z = 3', 'z is real'], 0, 0);
    expect(d.claims[0].verdict.status).toBe('holds');
    expect(v2Claims(d, tEn)[0]).toContain('forced by the givens');
  });
});

describe('#716 — the Hebrew wordings are unchanged', () => {
  it('the freedom cue', () => {
    expect(v2Freedom(deriveLines(['z1 = 3+4i'], 0, 0), tHe)).toBe('הצורה נקבעה במלואה');
    expect(v2Freedom(deriveLines(['z1 = 3+4i', 'w = z1*z2'], 0, 0), tHe)).toBe('דרגות חופש: 2');
    // a filter that empties the enumerated branch set is the configCount-0 case
    expect(v2Freedom(deriveLines(['z', 'z^2 = 1', 'z ברביע השני'], 0, 0), tHe)).toBe('אין תצורה תקפה');
  });

  it('a measure verdict', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 99'], 0, 0);
    expect(v2Measures(d, tHe)[0]).toBe('✗ «אורך z1z2 = 99» — אינו מתקיים בתצורה הזו');
  });

  it('a claim verdict', () => {
    const d = deriveLines(['z = 3', 'z מדומה טהור'], 0, 0);
    expect(v2Claims(d, tHe)[0]).toBe('✗ z מדומה טהור — z אינו מדומה טהור');
  });

  it('a withheld value names the student’s situation', () => {
    const d = deriveLines(['z1 = 4', 'z2', 'שטח Oz1z2'], 0, 0);
    expect(v2Knowledge(d, tHe)[0]).toBe(
      'שטח Oz1z2 — הערך תלוי בדרגות החופש שנותרו — הוסיפו נתון שיקבע אותן',
    );
  });

  it('an unreadable line', () => {
    const d = deriveLines(['שורה שאיננה נתון'], 0, 0);
    expect(whyText(d.untranslated[0].why, tHe)).toBe('הדקדוק לא מזהה את השורה הזו');
  });
});
