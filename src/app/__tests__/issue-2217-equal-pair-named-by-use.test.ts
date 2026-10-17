/**
 * #2217 ([ADR-691](../../../docs/06-decisions.md#adr-691)) — A FRESH PAIR STATED WITH EQUAL RADII CAN BE NAMED BY USE,
 * as the pair without the equality is.
 *
 * Measured at f4df3ac4 through `decideDeterministic2D` + the store, model mocked (0 calls):
 *   «שני מעגלים משיקים ברדיוסים שווים» · «רדיוס מעגל O הוא 5» (and «…P…», «ששטחם שווה», English, the disjoint pair,
 *   «A על מעגל O / P»)                    → refused input.unknownCircle «אין מעגל בשם O…»
 *   the same without «ברדיוסים שווים»       → builds (named by use, ADR-565)
 * Root cause: `autosInterchangeable` serialized the k = 1 `ratio` that encodes the equality in operand order, so the
 * pair and its swap differed and the two circles were judged distinguishable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function submit(lines: string[]) {
  useGeoStore.getState().clear();
  const out: { kind: string; commands: readonly unknown[] | null }[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    out.push({ kind: v.kind, commands: v.kind === 'commit' ? v.commands : null });
  }
  return out;
}
const radii = (seed: number) => {
  const fig = replay(useGeoStore.getState().facts, seed);
  return [...fig.circles.values()].map((c) => c.r);
};
const green = () => {
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};

describe('#2217 — a fresh equal-radii pair is named by use', () => {
  it.each([
    ['שני מעגלים משיקים ברדיוסים שווים', 'רדיוס מעגל O הוא 5'], // the report
    ['שני מעגלים משיקים ברדיוסים שווים', 'רדיוס מעגל P הוא 5'],
    ['שני מעגלים משיקים ששטחם שווה', 'רדיוס מעגל O הוא 5'],
    ['two tangent circles with equal radii', 'the radius of circle O is 5'],
    ['שני מעגלים זרים ברדיוסים שווים', 'רדיוס מעגל O הוא 5'],
  ])('«%s» · «%s» builds; both circles are 5 at every seed', async (pair, line) => {
    const out = await submit([pair, line]);
    expect(out[1].kind).toBe('commit');
    for (const seed of [0, 1, 2, 3]) {
      const r = radii(seed);
      expect(r).toHaveLength(2);
      for (const x of r) expect(x).toBeCloseTo(5, 5);
    }
    green();
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([
    ['שני מעגלים משיקים ברדיוסים שווים', 'A על מעגל O', 'circle-O'],
    ['שני מעגלים זרים ברדיוסים שווים', 'A על מעגל P', 'circle-P'],
  ])('«%s» · «%s» puts A on one of the pair, which stay equal', async (pair, line, circle) => {
    const out = await submit([pair, line]);
    expect(out[1].kind).toBe('commit');
    expect(out[1].commands).toEqual([{ type: 'point-on-circle', id: 'A', circle }]);
    for (const seed of [0, 1, 2, 3]) {
      const [a, b] = radii(seed);
      expect(a).toBeCloseTo(b, 5); // the ratio is driven by the solver (its tolerance, as on the named pair)
    }
    expect(replay(useGeoStore.getState().facts, 0).circles.size).toBe(2);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#2217 — the controls are unchanged', () => {
  it.each([
    [['שני מעגלים משיקים', 'רדיוס מעגל O הוא 5'], [{ type: 'set-radius', circle: 'circle-O', value: 5 }]],
    [['שני מעגלים זרים', 'רדיוס מעגל O הוא 5'], [{ type: 'set-radius', circle: 'circle-O', value: 5 }]],
    [['שני מעגלים משיקים', 'A על מעגל O'], [{ type: 'point-on-circle', id: 'A', circle: 'circle-O' }]],
    [['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים ברדיוסים שווים', 'רדיוס מעגל O הוא 5'], [{ type: 'set-radius', circle: 'circle-O', value: 5 }]],
  ] as [string[], unknown[]][])('%j', async (lines, last) => {
    const out = await submit(lines);
    expect(out[out.length - 1].commands).toEqual(last);
  });
});
