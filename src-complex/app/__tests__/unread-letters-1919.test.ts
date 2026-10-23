/**
 * #1919 (ADR-626) — complex's thin lock on the shared unreadable-letter rows
 * (`shell/__tests__/fixtures/unread-letter-rows.ts`, docs/28 §5c).
 *
 * Complex never silently dropped a letter: measured at `ad8df1d3`, «ДЖФ = 2 + i» and every row below
 * were already refused — but with the generic «לא הצלחתי להבין את המשפט», which says nothing about the
 * letters. Its share of the operator's ruling (*"any letter … that is not in these languages is
 * rejected. in all tools"*) is the WORDING, and the two sentences are the same in all four builders.
 *
 * Complex is NOT a caller of the glyph fold (a superscript digit is an exponent here, #1912) and does not
 * need to be: the shared rule folds the look-alike LETTERS itself, so «КМО» reads as KMO while «zⁿ» and
 * «Xₖ» reach the grammar untouched.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useComplexStore } from '../../store/useComplexStore';
import { submitLine } from '../submit';
import { errorText } from '../errorText';
import { complexI18n } from '../../i18n';
import { unreadScriptRuns } from '../../../shell/inputScript';
import { CATALOG } from '../../parser/catalog';
import { unreadLetterFaults, type UnreadGate } from '../../../shell/__tests__/fixtures/unread-letter-rows';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(complexI18n.getFixedT('he') as unknown as T);
const tEn = plain(complexI18n.getFixedT('en') as unknown as T);
const store = () => useComplexStore.getState();

beforeEach(() => {
  store().clearAll();
});

/** The REAL entry point the input box uses, on an empty figure. */
const gate: UnreadGate = (line) => {
  store().clearAll();
  const ok = submitLine(line);
  const err = store().lastError;
  const unread = err?.key === 'unread-name' ? 'name' : err?.key === 'unread-word' ? 'word' : null;
  const out = { unread, recorded: ok, text: err ? errorText(err, t) : null } as const;
  store().clearAll();
  return out;
};

describe('#1919 — complex names the letters it cannot read', () => {
  it('the shared rows hold through submitLine', async () => {
    expect(await unreadLetterFaults(gate)).toEqual([]);
  });

  it('a complex statement with such a letter is refused by name, not by «I did not understand»', () => {
    expect(submitLine('ДЖФ = 2 + i')).toBe(false);
    expect(store().lastError).toEqual({ key: 'unread-name', detail: 'ДЖФ' });
    expect(errorText(store().lastError!, t)).toBe('«ДЖФ» אינו שם של נקודה. שם נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.');
    expect(errorText(store().lastError!, tEn)).toContain('is not a point name');
  });

  it('a word in another language gets the Hebrew-and-English sentence', () => {
    expect(submitLine('треугольник ABC')).toBe(false);
    expect(store().lastError).toEqual({ key: 'unread-word', detail: 'треугольник' });
    expect(errorText(store().lastError!, t)).toBe('הכלי קורא עברית ואנגלית בלבד — «треугольник» אינו באחת מהן. נסו לכתוב את השורה בעברית או באנגלית.');
  });

  it('nothing is recorded, and the figure is untouched', () => {
    expect(submitLine('z = 2 + i')).toBe(true);
    const lines = store().lines;
    expect(submitLine('ДЖФ = 2 + i')).toBe(false);
    expect(store().lines).toEqual(lines);
  });

  it('this tool’s own notation still reads — a superscript is a power, not another script', () => {
    expect(submitLine('z = 2 + i')).toBe(true);
    expect(store().lastError).toBeNull();
    for (const line of ['z^3 = 8', 'zⁿ = 8', '|z| = 5']) {
      store().clearError();
      submitLine(line);
      expect(store().lastError?.key, line).not.toBe('unread-name');
      expect(store().lastError?.key, line).not.toBe('unread-word');
    }
  });

  it('no sentence of the complex catalog carries a letter the tool cannot read', () => {
    const hits = CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && unreadScriptRuns(s).length > 0);
    expect(hits).toEqual([]);
  });
});
