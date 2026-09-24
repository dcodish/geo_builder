/**
 * #1357 (defect 1) — junk is identified as junk and was paid for anyway.
 *
 * Measured at pickup: `classifyOutOfScope` called ten of twelve junk strings `unrelated` BEFORE the
 * paid call, and the pre-LLM short-circuit set did not contain `unrelated`, so all twelve were sent to
 * the model. The other two («12345», «xkcd 42 zz») scored nothing, because a digit counted as a
 * geometry signal; «Hello there» slipped the same way on its capital H.
 *
 * Fix: `unrelated` joins `PRE_LLM`, and `unrelated` is decided by the shared POSITIVE test
 * (`shell/llm/constructionSignal.ts`). The locks drive the REAL `runSubmit` with the model mocked, and
 * assert both directions: junk never calls it, and a real grammar gap still does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { runSubmit } from '../app/submitPipeline';
import type { SubmitDeps } from '../app/submitPipeline';
import { classifyOutOfScope } from '../parser/scope';
import { COMMAND_CATALOG } from '../parser/catalog';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const notes: string[] = [];
  const deps: SubmitDeps = {
    t: (key) => key,
    locale: 'he',
    ui: {
      setInputNote: (m) => notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, notes: () => notes.filter(Boolean) };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const JUNK = [
  'asdkjh', 'qqqqqqqq', '....', 'aaaa bbbb cccc', 'lorem ipsum dolor sit', 'סתם משהו', 'אבגדהוז', '!!!!',
  'hello there friend', 'שלום מה נשמע', '12345', 'xkcd 42 zz', 'Hello there', 'Lorem Ipsum',
];

/** The filed construct gaps from the issue — real geometry the grammar lacks, which the model may build. */
const GAPS = [
  'המשכי הגבהים חותכים את המעגל בנקודות K L M',
  'CD חותך את המעגל',
  'שטח הגזרה AOB = 12',
  'השטח האפור ABCDE',
];

describe('#1357 — junk never reaches the paid call (2-D)', () => {
  it.each(JUNK)('«%s» is answered as unrelated, with no model call', async (u) => {
    const { deps, notes } = makeDeps();
    await runSubmit(u, deps);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(notes()).toEqual(['input.scope.unrelated']);
  });

  it.each(GAPS)('a real construct gap «%s» still escalates', async (u) => {
    const { deps } = makeDeps();
    await runSubmit(u, deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
  });
});

describe('#1357 — no catalog line is brushed off as unrelated', () => {
  it('every supported catalog specimen, in both languages, carries a construction signal', () => {
    const brushed = COMMAND_CATALOG.filter((c) => c.supported)
      .flatMap((c) => [c.he, c.en])
      .filter((u) => classifyOutOfScope(u)?.category === 'unrelated');
    expect(brushed).toEqual([]);
  });
});
