/**
 * #1611 ([ADR-591](../../docs/06-decisions.md#adr-591)) — a word fraction / wish-wrapped length given is TAUGHT,
 * never accepted and never sent to the paid model (operator ruling 2026-09-30).
 *
 * Measured at pickup (worktree tip 9d1b0b1f): the four prod lines, «BE = רבע BC», «BE = רבע מ-BC» and
 * «BE הוא רבע מ-BC» all answered `not-handled` and escalated to the LLM.
 *
 * The locks drive the REAL `runSubmit` with the model mocked:
 *  1. each prod line gets the teaching note, the canonical line is PRE-FILLED, and the model is not called;
 *  2. THE TAUGHT REMEDY IS DRIVEN, NOT MATCHED (#1183): the pre-filled text is submitted through the same
 *     `runSubmit` on the same figure, and must COMMIT — the facts grow by the taught givens, no refusal note;
 *  3. negatives: no comparand («BE = רבע») and a proposal the figure refuses both stay as they were (escalate).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { runSubmit } from '../app/submitPipeline';
import type { SubmitDeps } from '../app/submitPipeline';
import { buildParseCtx, fractionTeachCandidate, type ParseContext } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const notes: string[] = [];
  const texts: string[] = [];
  const deps: SubmitDeps = {
    t: (key) => key,
    locale: 'he',
    ui: {
      setInputNote: (m) => notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => texts.push(''),
      setText: (s) => texts.push(s),
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
  return { deps, notes: () => notes.filter(Boolean), texts };
}

/** The student's figure, built through the real submit path. */
const FIGURE = ['מקבילית ABCD', 'E על BC', 'F על AD'];

async function build(lines: readonly string[]) {
  for (const u of lines) {
    const { deps, notes } = makeDeps();
    await runSubmit(u, deps);
    expect(notes(), `setup «${u}»`).toEqual([]);
  }
}

const ctxNow = (): ParseContext => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The operator's exact prod lines (log-triage 2026-09-30, F2), with the line each one must teach. */
const PROD: readonly [string, string][] = [
  ['אני רוצה ש- BE ו- DF יהיו רבע מהצלע של המקבילית', 'BE = 1/4 BC, DF = 1/4 AD'],
  ['אני רוצה ש- BE ו- DF יהיו שלושה רבעים מהצלע של המקבילית', 'BE = 3/4 BC, DF = 3/4 AD'],
  ['הפוך את BE ואת DF להיות 3/4 מצלע המקבילית', 'BE = 3/4 BC, DF = 3/4 AD'],
  ['הפוך את BE ואת DF להיות שלושה רבעים מצלע המקבילית', 'BE = 3/4 BC, DF = 3/4 AD'],
  // the word fraction alone, no wrapper (the issue's measured row)
  ['BE = רבע BC', 'BE = 1/4 BC'],
  ['BE הוא רבע מ-BC', 'BE = 1/4 BC'],
];

describe('#1611 — a word fraction / wrapped length given is taught, and the taught line builds', () => {
  it.each(PROD)('«%s» → teaches and pre-fills «%s», no model call; the pre-filled line then COMMITS', async (said, taught) => {
    await build(FIGURE);
    const before = useGeoStore.getState().facts.length;
    const first = makeDeps();
    await runSubmit(said, first.deps);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(first.notes()).toEqual(['input.scope.teach-fraction']);
    expect(first.texts).toEqual([taught]);
    expect(useGeoStore.getState().facts.length).toBe(before); // a refusal: nothing committed

    // THE REMEDY IS DRIVEN: what the box now holds goes through the same submit, on the same figure
    const second = makeDeps();
    await runSubmit(first.texts[0], second.deps);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(second.notes()).toEqual([]);
    expect(second.texts).toEqual(['']); // committed → the box clears
    const st = useGeoStore.getState();
    const added = st.facts.slice(before).map((f) => f.cmd.type);
    expect(added.filter((t) => t === 'set-ratio')).toHaveLength(taught.split(',').length);
    const d = replay(st.facts, st.seed);
    expect(Object.values(d.status).every((x) => x === 'ok'), JSON.stringify(d.status)).toBe(true);
    expect(d.lastError).toBeNull();
    expect(d.pending).toBe(false);
    expect(d.violations).toEqual([]);
  }, 120_000);

  it('NEGATIVE: «BE = רבע» has no comparand — nothing to teach, it escalates as before', async () => {
    await build(FIGURE);
    const { deps, notes, texts } = makeDeps();
    await runSubmit('BE = רבע', deps);
    expect(notes()).not.toContain('input.scope.teach-fraction');
    expect(texts.filter(Boolean)).toEqual([]);
    expect(llmParseMock).toHaveBeenCalled();
  }, 120_000);

  it('NEGATIVE (the proof gate): a proposal the figure refuses is never taught', async () => {
    // BC = 8 and BE = 5 are given, so «BE = 1/4 BC» (= 2) contradicts the figure — proposed, not proved
    await build([...FIGURE, 'BC = 8', 'BE = 5']);
    expect(fractionTeachCandidate('אני רוצה ש-BE יהיה רבע מ-BC', ctxNow())?.line).toBe('BE = 1/4 BC');
    const { deps, notes, texts } = makeDeps();
    await runSubmit('אני רוצה ש-BE יהיה רבע מ-BC', deps);
    expect(notes()).not.toContain('input.scope.teach-fraction');
    expect(texts.filter(Boolean)).toEqual([]);
    expect(llmParseMock).toHaveBeenCalled(); // falls through exactly as before
  }, 120_000);
});

describe('#1611 — fractionTeachCandidate (the proposal, pure)', () => {
  it('reads every word fraction, Hebrew and English, as p/q', async () => {
    await build(FIGURE);
    const ctx = ctxNow();
    const cases: [string, string | null][] = [
      ['BE = חצי BC', 'BE = 1/2 BC'],
      ['BE = שליש מ-BC', 'BE = 1/3 BC'],
      ['BE שווה לשני שלישים מ-BC', 'BE = 2/3 BC'],
      ['BE = שלוש חמישיות מ-BC', 'BE = 3/5 BC'],
      ['BE is a quarter of BC', 'BE = 1/4 BC'],
      ['BE is three quarters of BC', 'BE = 3/4 BC'],
      ['I want BE and DF to be a third of the side of the parallelogram', 'BE = 1/3 BC, DF = 1/3 AD'],
      ['make BE be two thirds of BC', 'BE = 2/3 BC'],
      // no comparand / unresolvable / already canonical → nothing
      ['BE = רבע', null],
      ['BE = 1/4 BC', null],
      ['BC = רבע מהצלע של המקבילית', null], // the side itself
      ['BE = רבע מהצלע של הטרפז', null], // no trapezoid in the figure
      ['AC = רבע מהצלע של המקבילית', null], // a diagonal lies on no side
    ];
    for (const [u, want] of cases) expect(fractionTeachCandidate(u, ctx)?.line ?? null, u).toBe(want);
  }, 120_000);
});
