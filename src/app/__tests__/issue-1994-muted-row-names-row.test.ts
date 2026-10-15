/**
 * #1994 ([ADR-667](../../../docs/06-decisions.md#adr-667)) — a refusal names the student's ROW, not the engine's
 * points. The operator's T15 (round #1992 play sheet): «משולש ABC», untick it, then «משולש ACB».
 *
 * Measured on 097f1889 through `runSubmit` (model mocked) and the page's `explainError`:
 *   «לא ניתן לבנות: A, C, B שייכות לשורה המבוטלת «משולש ABC» — סמנו אותה שוב או מחקו אותה.»
 * — the points the fold reserved for the unticked row (ADR-010), which is bookkeeping the student never sees.
 * The ruled sentence (2026-10-11) names the row and the action, and drops the point list entirely.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import { explainError, humanizeError, type Translate } from '@/i18n/humanizeError';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { runSetGroupEnabled } from '@/app/editPipeline';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const en: Translate = (k, o) => i18n.getFixedT('en')(k, o) as string;
const st = () => useGeoStore.getState();
const notes: string[] = [];
const raws: string[] = [];
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

function deps(): SubmitDeps {
  return {
    t: he,
    locale: 'he',
    ui: {
      setInputNote: (m) => { if (m) notes.push(m); },
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw, said, other) => { if (raw) raws.push(raw); return explainError(raw, he, said, other); },
  };
}

beforeEach(() => {
  st().clear();
  notes.length = 0;
  raws.length = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

const RULED_HE = 'השורה «משולש ABC» מסומנת כרגע כלא מוצגת, ולכן אי אפשר לבנות עליה. סמנו אותה שוב ברשימת הנתונים — אין צורך להוסיף שורה חדשה.';
const RULED_EN = "The row «משולש ABC» is currently marked as not shown, so it can't be built on. Tick it again in the list of givens — there's no need to add a new row.";

describe('#1994 — T15: an unticked row’s letters re-used name the ROW, not the points', () => {
  it('«משולש ABC» · untick · «משולש ACB»: the ruled sentence, and still a refusal', async () => {
    await runSubmit('משולש ABC', deps());
    runSetGroupEnabled(groupKey(st().facts[0]), false, { resolveAfterCommit: () => {} });
    await runSubmit('משולש ACB', deps());
    // behaviour unchanged: nothing added, the row still unticked
    expect(st().facts.map((f) => [f.utterance, f.enabled])).toEqual([['משולש ABC', false]]);
    expect(notes).toHaveLength(1);
    const shown = plain(notes[0]);
    expect(shown.startsWith(RULED_HE)).toBe(true);
    // the engine's subject is gone: no point list, no "belongs to the cancelled row"
    expect(shown).not.toMatch(/A, C, B|שייכות|המבוטלת/);
    // the same refusal in English
    expect(plain(humanizeError(raws[0], en))).toBe(RULED_EN);
  });

  it('class: any re-use of an unticked row’s letters reads the row — not only a re-ordered triangle', async () => {
    for (const [row, line] of [['משולש ABC', 'קטע AB'], ['ריבוע ABCD', 'משולש ABC']] as const) {
      st().clear();
      notes.length = 0;
      raws.length = 0;
      await runSubmit(row, deps());
      runSetGroupEnabled(groupKey(st().facts[0]), false, { resolveAfterCommit: () => {} });
      await runSubmit(line, deps());
      expect(notes, `${row} · ${line}`).toHaveLength(1);
      const shown = plain(notes[0]);
      expect(shown, `${row} · ${line}`).toContain(`השורה «${row}» מסומנת כרגע כלא מוצגת`);
      expect(shown).not.toMatch(/שייכות/);
    }
  });
});
