/**
 * #2231 ([ADR-W-189](../../../docs/06w-decisions-workspace.md#adr-w-189)) — 2-D's one retry, through `runSubmit` with a mocked
 * model (standing rule 2). The answers are real canonical lines through the real parser; only the transport is a stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import i18n from '@/i18n';

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
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

async function given(lines: string[]) {
  useGeoStore.getState().clear();
  for (const line of lines) {
    const d = makeDeps();
    await runSubmit(line, d.deps);
    expect(d.calls.cleared, `«${line}» is accepted`).toBe(1);
  }
}

/** The answer object `llmParse` hands back for these canonical lines on the current figure. */
const answer = (...steps: string[]) => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const ctx = buildParseCtx(d.construction, d.positions);
  return {
    built: steps.map((step) => {
      const r = parse(step, ctx);
      if (!r.ok) throw new Error(`«${step}» does not parse`);
      return { step, commands: r.commands };
    }),
    dropped: [],
  };
};

const FIGURE = ['משולש ABC', 'M על AC'];
/** A sentence the grammar misses, so it reaches the model, and which names a new K. */
const RAW = 'M שולח קו ל-AB ונוחת ב-K';

describe('#2231 — 2-D asks once more when the answer loses a typed label', () => {
  beforeEach(async () => {
    llmParseMock.mockReset();
    await given(FIGURE);
  });

  it('the first answer drops K, the second keeps it: K is committed, two calls', async () => {
    llmParseMock.mockResolvedValueOnce(answer('הגובה מ-M ל-AB')).mockResolvedValueOnce(answer('K רגל האנך מ-M ל-AB'));
    const d = makeDeps();
    await runSubmit(RAW, d.deps);
    expect(llmParseMock).toHaveBeenCalledTimes(2);
    expect(llmParseMock.mock.calls[0][3]).not.toHaveProperty('keep');
    expect(llmParseMock.mock.calls[1][3]).toMatchObject({ keep: ['K'] });
    expect(llmParseMock.mock.calls[1][3].signal).toBe(llmParseMock.mock.calls[0][3].signal); // the cancel button reaches the retry
    expect(d.calls.cleared).toBe(1);
    const st = useGeoStore.getState();
    expect(replay(st.facts, st.seed).positions.has('K')).toBe(true);
  });

  it('both answers drop K: the refusal naming K, nothing committed, two calls', async () => {
    const lossy = answer('הגובה מ-M ל-AB');
    llmParseMock.mockResolvedValue(lossy);
    const before = useGeoStore.getState().facts.length;
    const d = makeDeps();
    await runSubmit(RAW, d.deps);
    expect(llmParseMock).toHaveBeenCalledTimes(2);
    expect(d.calls.cleared).toBe(0);
    expect(d.calls.notes.join(' ')).toContain('K');
    expect(useGeoStore.getState().facts).toHaveLength(before);
  });

  it('an answer that loses only a stated number: one call, today\'s refusal', async () => {
    llmParseMock.mockResolvedValue(answer('K על AB'));
    const d = makeDeps();
    await runSubmit('K על AB במרחק 5 מ-A בדיוק וזהו', d.deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
    expect(d.calls.cleared).toBe(0);
    expect(d.calls.notes.join(' ')).toContain('5');
  });

  it('a throttled or empty answer is not a loss: one call', async () => {
    llmParseMock.mockResolvedValue({ built: [], dropped: [], busy: 'rate-limited' });
    await runSubmit(RAW, makeDeps().deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
    llmParseMock.mockReset();
    llmParseMock.mockResolvedValue({ built: [], dropped: [] });
    await runSubmit(RAW, makeDeps().deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
  });
});

describe('#2231 — the transport sends keep on the retry only', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keep rides the body', async () => {
    const real = await vi.importActual<typeof import('@/parser/llm')>('@/parser/llm');
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ steps: [] }) };
    });
    await real.llmParse('u', 'c');
    await real.llmParse('u', 'c', undefined, { keep: ['K'] });
    expect(bodies[0]).not.toHaveProperty('keep');
    expect(bodies[1]).toMatchObject({ keep: ['K'] });
  });
});
