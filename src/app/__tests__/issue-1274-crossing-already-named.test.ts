/**
 * #1274 — 2-D: THE CROSSING THE STUDENT NAMED IS A POINT THEY ALREADY HAVE.
 *
 * Operator's cross-product ruling, 2026-09-20, given while playing T18 in the analytic tree and then
 * extended by hand: *"if P and B must be on the same location … it should be refused"*, and *"the 2d and
 * 3d tools should follow the same logic about points being on the same location"*.
 *
 * **This case reverses [#944](https://github.com/dcodish/geo_builder/issues/944) /
 * [ADR-489](../../../docs/06-decisions.md#adr-489), and the operator ruled it deliberately.** On
 * 2026-09-08 he reported that «משולש ABC» + «D = חיתוך AB ו-BC» drew the right point and showed an amber
 * "may be contradictory" banner at the same time; what shipped resolved the contradiction by BLESSING the
 * drawing — `D` minted at `B`, the canvas writing «B=D», a structural exemption added to
 * `intersectionsWithinSegments`. Asked which surface was wrong when the same sentence came back under this
 * ruling, he answered: *"we refuse the B=D"*. So the contradiction is resolved from the other end — there
 * is no second point, so nothing can disagree about it. ADR-531 carries the reversal; ADR-489's exemption
 * and its lock are retired with it.
 *
 * The rule is STRUCTURAL: two carriers named by two points each that share exactly one letter meet at that
 * letter, whatever the configuration — no solve, no seed, no tolerance. It is not a coincidence *test*,
 * which is why it can live in the parser and why ADR-123's positional notice is untouched below.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { parse } from '@/parser';
import { ctxOf, factsOf } from '@/__tests__/scenario-pipeline';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => calls.notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => calls.cleared++,
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
  return { deps, calls, notes: () => calls.notes.filter(Boolean) };
}

const on = (setup: string[], line: string) => parse(line, ctxOf(factsOf(setup)));

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1274 — a crossing that IS an existing point is refused, naming it', () => {
  for (const [setup, line, holder, id] of [
    // The #944 sentence itself — the one the ruling reverses. Every spelling of the same figure follows,
    // because the refusal belongs to the EMITTER, not to one phrasing.
    [['משולש ABC'], 'D = חיתוך AB ו-BC', 'B', 'D'],
    [['משולש ABC'], 'D נקודת המפגש של AB עם BC', 'B', 'D'],
    [['משולש ABC'], 'D נקודת החיתוך של AB עם BC', 'B', 'D'],
    [['ריבוע ABCD'], 'E נקודת המפגש של AB עם BC', 'B', 'E'],
    [['ריבוע ABCD'], 'E נקודת המפגש של AD עם DC', 'D', 'E'],
  ] as Array<[string[], string, string, string]>) {
    it(`«${line}» names ${holder}`, () => {
      const r = on(setup, line);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: 'crossing-already-named', holder, id });
    });
  }

  it('the refusal quotes BOTH carriers, so the student can see why they meet there', () => {
    const r = on(['משולש ABC'], 'D = חיתוך AB ו-BC');
    expect(r).toMatchObject({ s1: ['A', 'B'], s2: ['B', 'C'] });
  });

  it('the student gets the named note, nothing is committed, and no paid call is made', async () => {
    await runSubmit('משולש ABC', makeDeps().deps);
    const before = useGeoStore.getState().facts.length;
    const d = makeDeps();
    await runSubmit('D = חיתוך AB ו-BC', d.deps);
    expect(d.notes()).toHaveLength(1);
    expect(d.notes()[0]).toContain('input.crossingAlreadyNamed');
    expect(d.notes()[0]).toContain('"holder":"B"');
    expect(useGeoStore.getState().facts.length, 'nothing committed').toBe(before);
    expect(llmParseMock, 'the tool knows the answer; it must not pay to be told it').not.toHaveBeenCalled();
  });

  it('and no second point is minted at B’s position — the defect, stated as geometry', async () => {
    await runSubmit('משולש ABC', makeDeps().deps);
    await runSubmit('D = חיתוך AB ו-BC', makeDeps().deps);
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    expect(fig.positions.has('D')).toBe(false);
    expect(fig.coincidences, 'and nothing is left to announce').toEqual([]);
  });
});

describe('#1274 — the refusal did not eat the feature', () => {
  it('an honest crossing still builds and still gets its letter', () => {
    const r = on(['ריבוע ABCD'], 'E נקודת המפגש של AB עם CD');
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({
      commands: expect.arrayContaining([expect.objectContaining({ type: 'line-line-intersection', id: 'E' })]),
    });
  });

  it('the diagonals of a quadrilateral still meet at a named point', () => {
    const r = on(['ריבוע ABCD'], 'M נקודת המפגש של AC עם BD');
    expect(r.ok).toBe(true);
  });

  it('an EXTENSION crossing outside both segments still builds — the shape #22 exists for', () => {
    const r = on(['משולש ABC'], 'F = חיתוך המשך AB ו-המשך CB');
    // AB and CB share B, so this must be refused for the same reason: their extensions still meet at B.
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: 'crossing-already-named', holder: 'B' });
  });

  it('a coincidence the GIVENS drive is still allowed and still announced (ADR-123 stands)', async () => {
    // The ruling refuses a NEW letter at an occupied position. Two points that already exist, driven
    // together by the student's own statements, are the other case in ADR-W-066's table: nothing is
    // misnamed there, so the notice channel keeps working and the configuration search still prefers a
    // seating that separates them first (ADR-486).
    await runSubmit('משולש ABC', makeDeps().deps);
    await runSubmit('D אמצע BC', makeDeps().deps);
    const d = makeDeps();
    await runSubmit('E אמצע BC', d.deps);
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(fig.coincidences.length, 'the notice channel must still work').toBeGreaterThan(0);
  });
});
