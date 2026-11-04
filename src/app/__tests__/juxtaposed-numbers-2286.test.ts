/**
 * #2286 ([ADR-AG-397](../../../docs/06c-decisions-analytic.md#adr-ag-397), operator ruling 2026-11-03: *"Refuse it,
 * naming the line, in every builder … 2-D and 3-D stop sending «AB = 2 3» to the AI"*) — 2-D's lock.
 *
 * Measured at ebacadd1 through `decideDeterministic2D`, after «משולש ABC»: «AB = 2 3», «∠ABC = 2 3» and «מעגל O
 * ברדיוס 2 3» ESCALATED to the model, which decides on its own what «2 3» means. Now each is refused BEFORE the
 * parser, `guided`, with the suite's sentence (`shell/juxtaposedNumbers`); the model is never asked. The mixed number
 * «2 1/2» is not this shape: it is #2248's.
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
import { findNumberPair } from '../../../shell/juxtaposedNumbers';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
const tEn = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'en' }) as string;
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

async function submit(line: string) {
  const d = makeDeps();
  await runSubmit(line, d.deps);
  expect(d.calls.cleared, `«${line}» is accepted`).toBe(1);
}

async function decide(line: string) {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

beforeEach(async () => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
  await submit('משולש ABC');
});

const ROWS: readonly [line: string, text: string][] = [
  ['AB = 2 3', '2 3'],
  ['∠ABC = 2 3', '2 3'],
  ['מעגל O ברדיוס 2 3', '2 3'],
  ['AB = 2.5 3', '2.5 3'],
];

describe('#2286 — 2-D refuses two numbers with only a space between them, before the model', () => {
  it.each(ROWS)('«%s» → guided refusal naming «%s»', async (line, text) => {
    const v = await decide(line);
    expect(v.kind).toBe('refuse');
    if (v.kind !== 'refuse' || !('key' in v.note)) throw new Error('not a keyed refusal');
    expect(v.category).toBe('guided');
    expect(v.note.key).toMatch(/^suite\.refusal\.juxtaposedNumbers/);
    expect((v.note.params as { detail: string }).detail).toBe(text);
  });

  it('through runSubmit: nothing is committed, the model is never asked, and the note teaches the readings', async () => {
    const before = useGeoStore.getState().facts;
    const d = makeDeps();
    await runSubmit('AB = 2 3', d.deps);
    expect(d.calls.cleared).toBe(0);
    expect(useGeoStore.getState().facts).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
    // this grammar reads no `*`, so the product is taught as its value
    expect(d.calls.notes.filter(Boolean).map(plain)).toEqual(['לא ברור מה פירוש «2 3». כתבו 2.3 (מספר עשרוני), 23 (מספר אחד) או 6 (מכפלה).']);
  });

  it('English: the same sentence', async () => {
    const v = await decide('AB = 2 3');
    if (v.kind !== 'refuse' || !('key' in v.note)) throw new Error('not a keyed refusal');
    expect(plain(tEn(v.note.key, v.note.params as Record<string, unknown>))).toBe('It is not clear what «2 3» means. Write 2.3 (a decimal), 23 (one number) or 6 (a product).');
  });

  it('every reading the sentence teaches builds (#1156)', async () => {
    for (const [line] of ROWS) {
      const v = await decide(line);
      if (v.kind !== 'refuse' || !('key' in v.note)) throw new Error(line);
      const p = v.note.params as Record<string, string>;
      for (const s of [p.decimal, p.joined, p.product, p.comma].filter(Boolean)) {
        const fixed = line.replace(p.detail, s);
        const w = await decide(fixed);
        expect(w.kind, `«${fixed}»`).toBe('commit');
      }
    }
  });

  it('the ✎ edit seam refuses it too, and the edited step is unchanged', async () => {
    await submit('AB = 5');
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, 'AB = 2 3', { t, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toBe(facts);
    expect(notes.map(plain)).toEqual(['לא ברור מה פירוש «2 3». כתבו 2.3 (מספר עשרוני), 23 (מספר אחד) או 6 (מכפלה).']);
  });

  it('what is not a pair is unchanged: «AB = 2 √3», «AB = 5 ס"מ», «AB = 2.3» commit; «AB = 2 1/2» is #2248’s', async () => {
    for (const line of ['AB = 2 √3', 'AB = 5 ס"מ', 'AB = 2.3', 'AB = 23']) expect((await decide(line)).kind, line).toBe('commit');
    expect((await decide('AB = 2 1/2')).kind).not.toBe('refuse');
  });

  it('no line of the 2-D catalog is a pair of numbers', () => {
    const hits = COMMAND_CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && findNumberPair(s));
    expect(hits).toEqual([]);
  });
});
