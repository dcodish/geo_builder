/**
 * #1919 (ADR-626, ADR-W-118 B1) — analytic's thin lock on the shared unreadable-letter rows
 * (`shell/__tests__/fixtures/unread-letter-rows.ts`, docs/28 §5c).
 *
 * Analytic never DREW such a letter: measured at `ad8df1d3`, every row below was `not-handled` — the one
 * refusal that reaches the paid model. 2-D's verdict is the reference for a plane sentence (the operator,
 * 2026-10-02: *"analytics and 2d should have same user experience"*), and 2-D now refuses these by name,
 * so analytic joins with the same two sentences — and the look-alikes, which it could not read either,
 * now fold and build («משולש КМО» records KMO).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { unreadScriptRuns } from '../../shell/inputScript';
import { unreadLetterFaults, type UnreadGate } from '../../shell/__tests__/fixtures/unread-letter-rows';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** The REAL submit decision — the function `App.tsx` dispatches — on an empty figure. */
const gate: UnreadGate = (line) => {
  const v = decideSubmit(line, [], 0);
  const key = v.kind === 'refused' ? v.error.key : null;
  const unread = key === 'unread-name' ? 'name' : key === 'unread-word' ? 'word' : null;
  return { unread, recorded: v.kind === 'record', text: v.kind === 'refused' ? errorText(v.error, t) : null };
};

describe('#1919 — analytic gives 2-D’s verdict on a letter the tool cannot read', () => {
  it('the shared rows hold through decideSubmit', async () => {
    expect(await unreadLetterFaults(gate)).toEqual([]);
  });

  it('the two sentences are the ones every builder uses, Hebrew and English', () => {
    const name = decideSubmit('משולש ДЖФ', [], 0);
    expect(name.kind).toBe('refused');
    if (name.kind === 'refused') {
      expect(errorText(name.error, t)).toBe('«ДЖФ» אינו שם של נקודה. שם נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.');
      expect(errorText(name.error, tEn)).toContain('is not a point name');
    }
    const word = decideSubmit('треугольник ABC', [], 0);
    expect(word.kind).toBe('refused');
    if (word.kind === 'refused') {
      expect(errorText(word.error, t)).toBe('הכלי קורא עברית ואנגלית בלבד — «треугольник» אינו באחת מהן. נסו לכתוב את השורה בעברית או באנגלית.');
    }
  });

  it('the refusal is analytic’s own, so the line never reaches the model', () => {
    const v = parseLine('Д(1,2)');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('unread-name');
  });

  it('the look-alikes fold and build — the ruling’s «fold them silently»', () => {
    expect(decideSubmit('משולש КМО', [], 0).kind).toBe('record');
  });

  it('Greek and ℓ are unchanged — notation, not another language', () => {
    expect(gate('ℓ: y = 2x')).toMatchObject({ unread: null });
    expect(decideSubmit('α = 30', [], 0).kind).not.toBe('refused');
  });

  it('no sentence of the analytic catalog carries a letter the tool cannot read', () => {
    const hits = COMMAND_CATALOG_ANALYTIC.flatMap((e) => [e.he, e.en]).filter((s) => s && unreadScriptRuns(s).length > 0);
    expect(hits).toEqual([]);
  });
});
