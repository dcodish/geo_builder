/**
 * #2874 (ADR-W-210 phase 1) — A REJECTED PREFOLD CAN NO LONGER LEAVE THE TOOL BUSY.
 *
 * Reproduced on `main` (2026-11-13) by running this sequence through the pipeline as it was: the worker's
 * prefold rejects with an error that is not a cancel, the pipeline rethrows it AFTER `setBusy(true)`, and
 * no exit clears the flag — `setBusy` was called `[true]` and never `false`, `busyRef` stayed set, and the
 * student's next submit was dropped by the E3 gate (`isBusy()`), committing nothing. Every later line was
 * lost the same way until a reload.
 *
 * pipeline-lock: the wedge is the pipeline's own exit after a rejected prefold. Only a submit through `runSubmit`,
 * with the worker call rejecting, reaches it; the release itself is unit-tested in `shell/__tests__/work-queue-2874`.
 *
 * The busy flag had three owners and no `finally`. It is now the work queue's count, released in the
 * queue's own `finally`, so the pipeline has no exit that can leave it set.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => null }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { geoWork } from '@/store/geoWork';
import { createWorkQueue } from '../../../shell/work';

function makeDeps(): SubmitDeps {
  return {
    t: (key) => key,
    locale: 'he',
    ui: { setInputNote: () => {}, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    work: createWorkQueue(),
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
}

describe('#2874 — a submit that throws leaves the tool idle', () => {
  beforeEach(() => {
    useGeoStore.getState().clear();
    useGeoStore.temporal.getState().clear();
  });

  it('a prefold that rejects (not a cancel): the submit rejects, the queue is idle, and the next submit commits', async () => {
    const deps = makeDeps();
    const prefold = vi.spyOn(geoWork, 'prefold').mockRejectedValueOnce(new Error('the worker crashed'));
    await expect(runSubmit('משולש ABC', deps)).rejects.toThrow('the worker crashed');
    prefold.mockRestore();
    expect(deps.work.working(), 'not left working').toBe(false);
    expect(useGeoStore.getState().facts, 'the failed line committed nothing').toEqual([]);
    await runSubmit('משולש ABC', deps); // the student tries again — on `main` this line was dropped
    expect(useGeoStore.getState().facts.map((f) => f.utterance)).toContain('משולש ABC');
    expect(deps.work.working()).toBe(false);
  });

  it('a post-commit search that rejects is released too (it is joined to the job of the submit)', async () => {
    const deps = { ...makeDeps(), resolveAfterCommit: () => Promise.reject(new Error('the search crashed')) };
    await expect(runSubmit('משולש ABC', deps)).rejects.toThrow('the search crashed');
    expect(deps.work.working()).toBe(false);
    await runSubmit('AB = 5', { ...deps, resolveAfterCommit: () => {} });
    expect(useGeoStore.getState().facts.map((f) => f.utterance)).toEqual(expect.arrayContaining(['משולש ABC', 'AB = 5']));
  });

  it('while a submit is working, a second one is not taken and its line is left alone (E3, ADR-W-198)', async () => {
    const deps = makeDeps();
    let release: (() => void) | null = null;
    const held = { ...deps, resolveAfterCommit: () => new Promise<void>((r) => (release = r)) };
    const first = runSubmit('משולש ABC', held);
    for (let i = 0; i < 100 && !release; i++) await new Promise((r) => setTimeout(r, 5));
    expect(deps.work.working(), 'the search holds the job').toBe(true);
    let cleared = 0;
    await runSubmit('AB = 5', { ...deps, ui: { ...deps.ui, clearText: () => cleared++ } });
    expect(cleared, 'the second line was not consumed').toBe(0);
    expect(useGeoStore.getState().facts.map((f) => f.utterance)).not.toContain('AB = 5');
    release!();
    await first;
    expect(deps.work.working()).toBe(false);
  });
});
