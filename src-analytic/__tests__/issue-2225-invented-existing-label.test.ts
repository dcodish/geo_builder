/**
 * #2225 (ADR-AG-281) — the invented-name gate covers names ALREADY in the figure.
 *
 * The operator's prod session (2026-10-16, `e6eulylq`): «ישר l» is not read by the grammar, went to the model, and
 * the model answered «דרך P עובר ישר l» — a relation to the existing centroid P that the sentence never stated. It
 * recorded green (the row shows «ישר l»), pinned l through P, and the bagrut's DE = √8 was later refused.
 * #1355's gate exempted existing names from "invented"; the operator ruled (2026-10-16, "1 - yes") that a reading
 * naming any point the student did not write is refused, including one already in the figure.
 *
 * **No live call** (standing rule 2): the model's answer is the logged one, stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fallbackRefusal, runFallback } from '../app/fallback';
import { faithfulnessAnalytic, existingNamesAnalytic } from '../parser/honestyAnalytic';
import { derive } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { studentFacingViolations } from '../../shell/studentText';
import type { InputError } from '../store/useAnalyticStore';

/** The operator's lines before «ישר l» — the saved fixture. His first line, «משולש ABC ששטחו 12.5», is not read by the grammar alone; it is stored as its two canonical lines. */
const FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'issue-2225-before-free-line.analytic.json'), 'utf8'),
) as { lines: string[]; seed: number };
const CTX = FIXTURE.lines;
const plain = (s: string): string => s.replace(/[⁦-⁩‎‏]/g, '');
const t = (lng: 'he' | 'en') => analyticI18n.getFixedT(lng) as unknown as (k: string, o?: Record<string, unknown>) => string;

describe('#2225 — the operator’s exact sequence, the model mocked', () => {
  it('the fixture builds: P is in the figure before «ישר l»', () => {
    const d = derive(CTX, FIXTURE.seed);
    expect(d.faults).toEqual([]);
    expect(existingNamesAnalytic(d.construction).has('P')).toBe(true);
  });

  it('«ישר l» → «דרך P עובר ישר l» is refused, naming P, and nothing is recorded through P', async () => {
    const out = await runFallback('ישר l', CTX, FIXTURE.seed, vi.fn().mockResolvedValue({ steps: ['דרך P עובר ישר l'] }));
    expect(out).toEqual({ kind: 'unfaithful', dropped: [], invented: false, answer: ['דרך P עובר ישר l'], inventedExisting: ['P'] });
    const e = fallbackRefusal(out as Exclude<typeof out, { kind: 'lines' }>, 'ישר l', { key: 'not-handled', detail: 'ישר l' });
    expect(e).toEqual({ key: 'llm-invented-existing', detail: 'ישר l', labels: 'P' });
    expect(plain(errorText(e, t('he')))).toBe(
      'כדי לבנות את זה הייתי צריך לקשר את המשפט ל-P, שלא מופיע בו — לא רשמתי כלום. אם התכוונתם ל-P, כתבו זאת במשפט ונסו שוב.',
    );
    expect(plain(errorText(e, t('en')))).toContain('tie your sentence to P');
    // ADR-W-096: P may be named — the figure shows it.
    expect(studentFacingViolations(['P'], { typed: CTX.join(' '), names: ['P'] })).toEqual([]);
  });
});

describe('#2225 — the class: an existing point or line the sentence never wrote', () => {
  const gates = (utterance: string, answer: string[], ctx: string[]) =>
    faithfulnessAnalytic(utterance, answer, existingNamesAnalytic(derive(ctx, 0).construction));

  it.each<[string, string, string[], string[], string[]]>([
    ['an existing point', 'ישר l', ['דרך P עובר ישר l'], CTX, ['P']],
    ['an existing line', 'A(1,2)', ['A(1,2)', 'A על הישר l1'], ['הישר l1 הוא y=x'], ['l1']],
    ['the logged «הבסיס» → «הצלע BC» (the base resolved to letters the student did not write)', 'משוואת הבסיס היא x-2y+6=0', ['משוואת הצלע BC היא x-2y+6=0'], ['טרפז ABCD'], ['B', 'C']],
  ])('%s is refused', (_name, utterance, answer, ctx, existing) => {
    const f = gates(utterance, answer, ctx);
    expect(f.invented).toEqual([]);
    expect(f.inventedExisting).toEqual(existing);
  });

  it.each<[string, string, string[], string[]]>([
    ['a name the student wrote', 'דרך P עובר ישר l', ['דרך P עובר ישר l'], CTX],
    ['a lowercase spelling of an existing name (#779)', 'דרך p עובר ישר l', ['דרך P עובר ישר l'], CTX],
    ['a restatement the student made in full', 'הצלע BC מונחת על y=x+1', ['הצלע BC מונחת על y=x+1'], CTX],
  ])('%s is not', (_name, utterance, answer, ctx) => {
    expect(gates(utterance, answer, ctx)).toEqual({ dropped: [], invented: [], inventedExisting: [] });
  });

  it('a NEW invented name keeps its own message (it names nothing), even beside an existing one', () => {
    const original: InputError = { key: 'not-handled', detail: 'x' };
    expect(fallbackRefusal({ kind: 'unfaithful', dropped: [], invented: true, answer: [], inventedExisting: ['P'] }, 'x', original)).toEqual({ key: 'llm-invented', detail: 'x' });
  });
});
