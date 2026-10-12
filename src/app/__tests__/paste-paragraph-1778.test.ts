/**
 * #1778 (ADR-W-125) — 2-D's thin lock for `shell/__tests__/fixtures/paste-paragraph-rows.ts`: a pasted paragraph
 * goes through `runSubmit`, the pipeline the input box calls, one sentence per row. The model is mocked to answer
 * nothing (standing rule 2), so a sentence the grammar does not read is refused exactly as it would be alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';
import { pasteSuite, type PasteRunner } from '../../../shell/__tests__/fixtures/paste-paragraph-rows';

/** The box as the student sees it, through every way the pipeline touches it. */
function makeDeps(initial: string) {
  const box = { text: initial, notes: [] as string[], resolves: 0 };
  const deps: SubmitDeps = {
    t: (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string,
    locale: 'he',
    ui: {
      setInputNote: (m) => box.notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {
        box.text = '';
      },
      setText: (t) => {
        box.text = t;
      },
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: async () => {
      box.resolves++;
    },
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  return { deps, box };
}

/** The rows, as the fact list shows them: one per submission group, its utterance. */
const rowTexts = (): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of useGeoStore.getState().facts) {
    const g = f.group ?? f.id;
    if (seen.has(g)) continue;
    seen.add(g);
    out.push(f.utterance ?? '');
  }
  return out;
};

const run: PasteRunner = async (setup, paste) => {
  useGeoStore.getState().clear();
  for (const l of setup) {
    const d = makeDeps(l);
    await runSubmit(l, d.deps);
    expect(d.box.text, `«${l}» is taken`).toBe('');
  }
  const before = rowTexts().length;
  const d = makeDeps(paste);
  await runSubmit(paste, d.deps);
  return { rows: rowTexts().slice(before), box: d.box.text };
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

pasteSuite('2d', run);

describe('#1778 — 2-D specifics', () => {
  it('the post-commit search runs after EACH sentence, and is awaited before the next', async () => {
    const d = makeDeps('משולש ABC. M אמצע BC.');
    await runSubmit('משולש ABC. M אמצע BC.', d.deps);
    expect(d.box.resolves).toBe(2);
    expect(rowTexts()).toEqual(['משולש ABC', 'M אמצע BC']);
  });

  it('the refused sentence gets the message it gets alone, naming nothing from the other sentences', async () => {
    const alone = makeDeps('שלום לכולם');
    await runSubmit('שלום לכולם', alone.deps);
    useGeoStore.getState().clear();
    const d = makeDeps('משולש ABC. שלום לכולם. M אמצע BC.');
    await runSubmit('משולש ABC. שלום לכולם. M אמצע BC.', d.deps);
    expect(d.box.notes.filter(Boolean).at(-1)).toBe(alone.box.notes.filter(Boolean).at(-1));
    // the model saw the one sentence, never the paragraph
    for (const call of llmParseMock.mock.calls) expect(call[0]).toBe('שלום לכולם');
  });

  it('one sentence is untouched by the split: «משולש ABC» then «AB = 2.5» go through as typed', async () => {
    for (const l of ['משולש ABC', 'AB = 2.5']) {
      const d = makeDeps(l);
      await runSubmit(l, d.deps);
      expect(d.box.text, l).toBe('');
    }
    expect(rowTexts()).toEqual(['משולש ABC', 'AB = 2.5']);
  });
});
