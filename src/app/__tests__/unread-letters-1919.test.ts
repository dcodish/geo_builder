/**
 * #1919 ([ADR-626](../../../docs/06-decisions.md#adr-626)) — 2-D's thin lock on the shared
 * unreadable-letter rows (`shell/__tests__/fixtures/unread-letter-rows.ts`, docs/28 §5c).
 *
 * Measured at `ad8df1d3` through this very door: «משולש ДЖФ» COMMITTED `A B C seg-AB seg-BC seg-AC
 * poly-ABC` — the student's three Cyrillic letters replaced by three he never typed, with a green ✓ —
 * and so did «ריבוע ДЖФИ», «מחומש ДЖФИЛ», «מקבילית ДЖФИ», «משולש ישר זווית ДЖФ», «משולש ДЖФ שווה
 * שוקיים», «משולש ДЖФ חסום במעגל», «triangle ДЖФ», «משולש ابج» (Arabic) and «משולש ÉÜÇ». The partial
 * runs and the point lines («משולש ДBC», «נקודה Д», «M אמצע Д») escalated to the paid model instead.
 * Now each is refused BEFORE the parser, naming the letters.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser/catalog';
import i18n from '@/i18n';
import { unreadScriptRuns } from '../../../shell/inputScript';
import { unreadLetterFaults, type UnreadGate } from '../../../shell/__tests__/fixtures/unread-letter-rows';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t,
    locale: 'he',
    ui: { setInputNote: (m) => calls.notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => calls.cleared++, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  return { deps, calls };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The REAL pre-LLM decision `runSubmit` dispatches, on an empty canvas. */
const gate: UnreadGate = async (line) => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
  const key = v.kind === 'refuse' && 'key' in v.note ? v.note.key : null;
  const unread = key === 'input.scope.unread-name' ? 'name' : key === 'input.scope.unread-word' ? 'word' : null;
  const text = v.kind === 'refuse' && 'key' in v.note ? plain(t(v.note.key, v.note.params as Record<string, unknown>)) : null;
  return { unread, recorded: v.kind === 'commit', text };
};

describe('#1919 — 2-D refuses a letter it cannot read, naming it', () => {
  it('the shared rows hold through decideDeterministic2D', async () => {
    expect(await unreadLetterFaults(gate)).toEqual([]);
  });

  it('through runSubmit: nothing is committed, the model is never asked, and the note names the letters', async () => {
    const before = useGeoStore.getState().facts;
    const d = makeDeps();
    await runSubmit('משולש ДЖФ', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(useGeoStore.getState().facts).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([
      '«ДЖФ» אינו שם של נקודה. שם נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.',
    ]);
  });

  it('a word in another language gets the Hebrew-and-English sentence, not the point-name one', async () => {
    const d = makeDeps();
    await runSubmit('треугольник ABC', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual([
      'הכלי קורא עברית ואנגלית בלבד — «треугольник» אינו באחת מהן. נסו לכתוב את השורה בעברית או באנגלית.',
    ]);
  });

  it('the ✎ edit seam refuses it too, and the edited step is unchanged', async () => {
    const d = makeDeps();
    await runSubmit('משולש ABC', d.deps);
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, 'משולש ДЖФ', { t, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toBe(facts);
    expect(notes.map(plain)).toEqual([expect.stringContaining('«ДЖФ» אינו שם של נקודה')]);
  });

  it('the look-alikes still build, as the ruling says — K, M, O, not a refusal', async () => {
    const d = makeDeps();
    await runSubmit('משולש КМО', d.deps);
    expect(d.calls.cleared).toBe(1);
    const view = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(Object.values(view.construction.objects).map((o) => o.id)).toContain('poly-KMO');
  });

  it('English: both refusals are in English', () => {
    expect(plain(i18n.t('input.scope.unread-name', { detail: 'ДЖФ', lng: 'en' }) as string)).toBe(
      '«ДЖФ» is not a point name. A point is named by one capital Latin letter, optionally with a digit — e.g. G or A1.',
    );
    expect(plain(i18n.t('input.scope.unread-word', { detail: 'треугольник', lng: 'en' }) as string)).toBe(
      'This tool reads Hebrew and English only — «треугольник» is in neither. Try writing the line in Hebrew or English.',
    );
  });

  it('no sentence of the 2-D catalog carries a letter the tool cannot read', () => {
    const hits = COMMAND_CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && unreadScriptRuns(s).length > 0);
    expect(hits).toEqual([]);
  });
});
