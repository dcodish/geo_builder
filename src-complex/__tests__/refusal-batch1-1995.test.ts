/**
 * #1995 batch 1 ([ADR-W-155](../../docs/06w-decisions-workspace.md#adr-w-155)) — the declare-complex refusal names
 * the student's statement and gives one next step (the operator's rule of 2026-10-13, card 18 B). The old sentence
 * said «{{letter}} הוגדר כמספר מרוכב», which was false when the refused line IS the declaration (measured: «z1 = 3+4i»
 * · «|z1| = 9r» · «r מספר מרוכב»). The step — another letter — is submitted and taken (docs/17 §9).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { submitLine } from '../app/submit';
import { errorText } from '../app/errorText';
import { complexI18n } from '../i18n';
import { useComplexStore } from '../store/useComplexStore';

type T = Parameters<typeof errorText>[1];
const store = () => useComplexStore.getState();
const text = (lng: 'he' | 'en') => {
  const t = complexI18n.getFixedT(lng) as unknown as T;
  return errorText(store().lastError!, t).replace(/[⁦-⁩]/g, '');
};

beforeEach(() => store().resetSession());

describe('#1995 batch 1 — complex: a letter used as a real number cannot also be declared complex', () => {
  it('the declaration refused after the use: name the use, choose another letter — «w מספר מרוכב» is taken', () => {
    for (const l of ['z1 = 3+4i', '|z1| = 9r']) expect(submitLine(l), l).toBe(true);
    expect(submitLine('r מספר מרוכב')).toBe(false);
    expect(text('he')).toBe('«|z1| = 9r» משתמש ב-r כמספר ממשי (גודל או זווית), ולכן r אינו יכול להיות גם מספר מרוכב — המשפט לא נוסף. בחרו אות אחרת לאחד מהם.');
    expect(text('en')).toBe('«|z1| = 9r» uses r as a real number (a size or an angle), so r cannot also be a complex number — the statement was not added. Choose a different letter for one of them.');
    expect(submitLine('w מספר מרוכב')).toBe(true);
  });
});
