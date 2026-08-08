/**
 * Direct tests for the submit pipeline (S0.4 of docs/24) — the routing the docs/23 review found
 * untested: store-ops before the parser, the grammar commit, clarification refusals, the
 * already-drawn no-op, the LLM second attempt, its honesty gate, and the stale-store re-read race.
 * Runs against the REAL store singleton and REAL parser/engine — only the LLM call is mocked
 * (the no-live-calls rule).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const calls = {
    notes: [] as string[],
    renameNotes: [] as string[],
    llmDropped: [] as string[][],
    cleared: 0,
    busy: [] as boolean[],
    resolved: 0,
  };
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => calls.notes.push(m),
      setRenameNote: (m) => calls.renameNotes.push(m),
      setLlmDropped: (s) => calls.llmDropped.push(s),
      clearText: () => calls.cleared++,
      setBusy: (b) => calls.busy.push(b),
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed, st.radiusOverrides);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => calls.resolved++,
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  const notes = () => calls.notes.filter(Boolean); // drop the pipeline's initial '' reset
  return { deps, calls, notes };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
});

describe('submit pipeline — grammar path', () => {
  it('a parseable utterance commits as one batch, clears the text, and auto-resolves', async () => {
    const { deps, calls, notes } = makeDeps();
    await runSubmit('ריבוע ABCD', deps);
    const st = useGeoStore.getState();
    expect(st.facts.length).toBeGreaterThan(0);
    expect(calls.cleared).toBe(1);
    expect(calls.resolved).toBe(1);
    expect(notes()).toEqual([]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a store-op (swap) routes BEFORE the parser and never enters the figure', async () => {
    const { deps: d1 } = makeDeps();
    await runSubmit('ריבוע ABCD', d1);
    const before = useGeoStore.getState().facts;
    const { deps, calls } = makeDeps();
    await runSubmit('swap A and B', deps);
    expect(calls.cleared).toBe(1); // succeeded as a store-op
    expect(calls.resolved).toBe(0); // no geometry commit → no auto-resolve
    expect(useGeoStore.getState().facts.length).toBe(before.length); // relabel, not a new fact
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a clean re-entry of an existing figure is the friendly no-op, never an LLM escalation', async () => {
    const { deps: d1 } = makeDeps();
    await runSubmit('ריבוע ABCD', d1);
    const before = useGeoStore.getState().facts.length;
    const { deps, calls, notes } = makeDeps();
    await runSubmit('ריבוע ABCD', deps);
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(notes()).toEqual(['input.alreadyDrawn']);
    expect(calls.busy[calls.busy.length - 1]).toBe(false); // spinner cleared
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('an ambiguous single-vertex angle asks for three letters instead of guessing or escalating', async () => {
    const { deps: d1 } = makeDeps();
    await runSubmit('ריבוע ABCD', d1);
    await runSubmit('קטע BD', d1); // B now has 3 edges → "∠B" is ambiguous
    const before = useGeoStore.getState().facts.length;
    const { deps, notes } = makeDeps();
    await runSubmit('∠B = 90', deps);
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(notes()).toEqual(['input.ambiguousAngle:{"vertex":"B"}']);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('submit pipeline — LLM second attempt', () => {
  it('out-of-grammar input that the LLM also cannot build refuses honestly', async () => {
    llmParseMock.mockResolvedValue({ built: [], dropped: [] });
    const { deps, notes } = makeDeps();
    await runSubmit('דבר מה שאיננו גאומטריה כלל', deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
    expect(notes()).toEqual(['input.scope.unrelated']); // classified out-of-scope free text — the honest refusal lane
    expect(useGeoStore.getState().facts.length).toBe(0);
  });

  it("the honesty gate refuses an LLM decomposition that drops a stated NEW label (ADR-240)", async () => {
    const { deps: d1 } = makeDeps();
    await runSubmit('ריבוע ABCD', d1);
    const before = useGeoStore.getState().facts.length;
    // The decomposition builds E but silently loses the stated F — the gate must name it.
    llmParseMock.mockResolvedValue({
      built: [{ step: 'point E', commands: [{ type: 'free-point', id: 'E', x: 9, y: 9, free: true }] }],
      dropped: [],
    });
    const { deps, notes } = makeDeps();
    await runSubmit('שים את E ואת F איפשהו מוזר', deps);
    expect(useGeoStore.getState().facts.length).toBe(before); // nothing committed
    expect(notes().length).toBe(1);
    expect(notes()[0]).toContain('input.labelsDropped');
    expect(notes()[0]).toContain('F');
  });

  it('re-reads the store after the LLM await — a commit mid-flight is not clobbered (the race guard)', async () => {
    // While the LLM call is in flight, another action commits a square; the pipeline must dry-run and
    // commit against the CURRENT facts, appending to them rather than validating a stale snapshot.
    llmParseMock.mockImplementation(async () => {
      useGeoStore.getState().executeMany(
        [{ type: 'square', ids: ['A', 'B', 'C', 'D'] }],
        'ריבוע ABCD',
      );
      return {
        built: [{ step: 'point E', commands: [{ type: 'free-point', id: 'E', x: 9, y: 9, free: true }] }],
        dropped: [],
      };
    });
    const { deps, calls } = makeDeps();
    await runSubmit('נקודה חדשה E בבקשה', deps);
    const st = useGeoStore.getState();
    const utterances = st.facts.map((f) => f.utterance);
    expect(utterances).toContain('ריבוע ABCD'); // the mid-flight commit survived
    expect(st.facts.some((f) => JSON.stringify(f.cmd).includes('"E"'))).toBe(true); // and E landed on top
    expect(calls.resolved).toBe(1);
  });
});

describe('submit pipeline — the P3 guided-message batch (#329/#246, ADR-391)', () => {
  it('#329: LaTeX-pasted input → the latex guidance, PRE-parse, never an LLM call', async () => {
    const { deps, calls, notes } = makeDeps();
    await runSubmit('היחס בין הקטעים הוא $AD:DB = 1:2$.', deps);
    expect(notes()).toEqual(['input.scope.latex']);
    expect(llmParseMock).not.toHaveBeenCalled(); // pre-parse guard — no paid call
    expect(calls.resolved).toBe(0); // nothing committed
  });
  it('#329: the LaTeX compound (partial-parses to a wrong figure) is still caught pre-parse', async () => {
    const { deps, notes } = makeDeps();
    await runSubmit('במשולש $\\triangle ABC$, $D$ על $AB$, $DE \\parallel BC$', deps);
    expect(notes()).toEqual(['input.scope.latex']);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
  it('#329 NO THEFT: the same ratio WITHOUT $ is never brushed off as latex', async () => {
    const { deps, notes } = makeDeps();
    llmParseMock.mockResolvedValue({ built: [], dropped: [] }); // if it escalates, don't crash the post-LLM path
    await runSubmit('היחס בין הקטעים הוא AD:DB = 1:2', deps);
    expect(notes()).not.toContain('input.scope.latex');
  });
  it('#246: a «שורש N» magnitude that would escalate → the √ nudge, never an LLM call', async () => {
    const { deps, calls, notes } = makeDeps();
    // area-with-word-root drops its value (honesty gate) → reaches the seam → guidance
    await runSubmit('שטח משולש BEC שווה לשורש 27', deps);
    expect(notes()).toEqual(['input.scope.word-root']);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(calls.resolved).toBe(0);
  });
  it('#246 NO THEFT: «AB = שורש 27» on a figure with A,B BUILDS the measure (not the √ nudge)', async () => {
    const { deps, calls, notes } = makeDeps();
    await runSubmit('קטע AB', deps); // establish A, B first (the realistic order)
    await runSubmit('AB = שורש 27', deps); // #105 normalizes שורש→√ → measure-length commits
    expect(notes()).not.toContain('input.scope.word-root'); // never brushed off
    expect(calls.resolved).toBeGreaterThanOrEqual(2); // both steps committed
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#436 — a negated statement is refused, never committed as its opposite', () => {
  it('refuses PRE-parse and adds no fact, where it used to commit set-angle = 90', async () => {
    const { deps, notes } = makeDeps();
    // build the figure the reported session had (a shape whose vertex A has exactly two edges, so the
    // ADR-164 single-vertex path WOULD resolve the angle — this is the case that used to invert)
    await runSubmit('דלתון קמור', deps);
    const before = useGeoStore.getState().facts.length;
    expect(before).toBeGreaterThan(0);

    await runSubmit('זווית A לא ישרה', deps);

    expect(useGeoStore.getState().facts.length).toBe(before); // nothing committed
    expect(notes().some((n) => n.startsWith('input.scope.negation'))).toBe(true);
    expect(llmParseMock).not.toHaveBeenCalled(); // refused before the paid call
  });

  it('the POSITIVE form still commits — the refusal is about the negation, not the phrasing', async () => {
    const { deps } = makeDeps();
    await runSubmit('דלתון קמור', deps);
    const before = useGeoStore.getState().facts.length;
    await runSubmit('זווית A ישרה', deps);
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(before);
  });
});

describe('#447 (ADR-428) — the canonical form is TAUGHT on a successful commit', () => {
  it('`A=40` commits AND leaves a hint naming the canonical spelling', async () => {
    const { deps, notes } = makeDeps();
    await runSubmit('דלתון קמור', deps);
    const before = useGeoStore.getState().facts.length;

    await runSubmit('A=40', deps);

    // committed — this is a note on SUCCESS, never a refusal
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(before);
    expect(notes().some((n) => n.startsWith('input.canonicalHint'))).toBe(true);
    expect(llmParseMock).not.toHaveBeenCalled(); // the grammar owns it now, not the model
  });

  it('the canonical form commits with NO hint — we never nag someone writing it right', async () => {
    const { deps, notes } = makeDeps();
    await runSubmit('דלתון קמור', deps);
    const before = useGeoStore.getState().facts.length;
    await runSubmit('זווית A = 40', deps);
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(before);
    expect(notes().some((n) => n.startsWith('input.canonicalHint'))).toBe(false);
  });
});
