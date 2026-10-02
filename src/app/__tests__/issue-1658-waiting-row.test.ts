/**
 * #1658 Am. 1 ([ADR-562](../../../docs/06-decisions.md#adr-562)) — A ROW WAITING FOR ITS LETTER READS AS
 * WAITING: no broken mark, no «no configuration» notice.
 *
 * Pre-played in the browser after ADR-562 merged: «משולש ABC» · «0 < k < 6» committed (correct), but the
 * row showed a red ✗ («בעיה») and the input area «לא נמצאה תצורה שמקיימת את כל הדרישות יחד…». Both
 * readers judged the row by `status === 'ok'`: the row mark in App.tsx, and `meetsRequirements` — the
 * post-commit bar whose failure launches the configuration search, which then exhausted (no seed can
 * bind a letter) into the notice. One predicate now answers "is this row waiting for a letter?"
 * (`factsWaitingForLetter`, the fold's own `unboundSubjectOf` over the same table), and both read it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { factsWaitingForLetter, meetsRequirements, replay, useGeoStore } from '@/store/geoStore';

/** The App's post-commit flow with its REAL requirements bar; the worker search is a recorder. */
async function submitAll(lines: string[]) {
  useGeoStore.getState().clear();
  const seen = { exhausted: 0, searched: 0 };
  for (const l of lines) {
    let cleared = 0;
    const deps: SubmitDeps = {
      t: (k) => k,
      locale: 'he',
      ui: { setInputNote: () => {}, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => cleared++, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const d = replay(st.facts, st.seed);
        return { construction: d.construction, positions: d.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {
        void runViewResolve({
          getState: () => useGeoStore.getState(),
          meetsRequirements,
          autoResolve: async () => { seen.searched++; return null; }, // as the worker answers when nothing fits
          applyView: () => {},
          setPending: () => {},
          onExhausted: () => { seen.exhausted++; },
          isCancelled: () => false,
        });
      },
      llmAbortRef: { current: null },
      explainError: (raw) => String(raw),
    };
    await runSubmit(l, deps);
    expect(cleared, `«${l}» is accepted`).toBe(1);
  }
  await new Promise((r) => setTimeout(r, 0));
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  const last = st.facts[st.facts.length - 1];
  return { seen, fig, last, waiting: factsWaitingForLetter(st.facts), facts: st.facts, seed: st.seed };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1658 Am. 1 — the waiting row is waiting, in the status AND the notice', () => {
  it.each([
    ['the reported bound', ['משולש ABC', '0 < k < 6']],
    ['a one-sided bound', ['משולש ABC', 'k > 40']],
    ['an order between two unbound letters', ['משולש ABC', 'α < β']],
    ['a value (the #926 member of the family)', ['משולש ABC', 'α = 70']],
  ])('%s', async (_label, lines) => {
    const r = await submitAll(lines);
    expect(r.last.utterance).toBe(lines[lines.length - 1]);
    expect(r.fig.status[r.last.id], 'the fold still says WHY it is not in effect').toMatch(/^variable \S+ is not defined/);
    expect(r.waiting.has(r.last.id), 'the row reads as waiting').toBe(true);
    expect(r.fig.violations, 'no violated given').toEqual([]);
    expect(r.fig.lastError, 'no red banner').toBeNull();
    expect(r.fig.pending, 'the blue «recorded, not yet in effect» cue').toBe(true);
    expect(meetsRequirements(r.facts, r.seed), 'the view meets its requirements').toBe(true);
    expect(r.seen.searched, 'no configuration search is launched').toBe(0);
    expect(r.seen.exhausted, 'and so no «לא נמצאה תצורה…» notice').toBe(0);
  });

  it('after «AB = k» every row is ok and nothing waits', async () => {
    const r = await submitAll(['משולש ABC', '0 < k < 6', 'AB = k']);
    for (const f of r.facts) expect(r.fig.status[f.id], f.utterance).toBe('ok');
    expect(r.waiting.size).toBe(0);
    const a = r.fig.positions.get('A')!, b = r.fig.positions.get('B')!;
    const ab = Math.hypot(a.x - b.x, a.y - b.y);
    expect(ab).toBeGreaterThan(0);
    expect(ab).toBeLessThan(6);
    expect(r.seen.exhausted).toBe(0);
  });

  it('a genuinely broken row is still broken (the predicate is not a blanket pass)', async () => {
    const r = await submitAll(['משולש ABC', 'AB = k²']);
    useGeoStore.getState().executeMany([{ type: 'measure-bound', name: 'k', min: 0, max: 6, minStrict: true, maxStrict: true }], '0 < k < 6');
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    const last = st.facts[st.facts.length - 1];
    expect(fig.status[last.id]).toMatch(/^relation on k cannot be enforced/);
    expect(factsWaitingForLetter(st.facts).has(last.id)).toBe(false);
    expect(meetsRequirements(st.facts, st.seed)).toBe(false);
    void r;
  });
});
