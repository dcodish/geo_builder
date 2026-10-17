/**
 * #2186 ([ADR-679](../../../docs/06-decisions.md#adr-679)) — a stated equal size on a circle pair lands on every
 * two-circle rule, or the line is not committed.
 *
 * Measured at be2e5e74 through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked: «שני מעגלים
 * נחתכים ברדיוסים שווים» and every meet / crossing / common-tangent spelling committed GREEN with radii 5 / 3.6 (the
 * equality dropped); «שני מעגלים בעלי מרכז משותף O ברדיוסים שווים» drew 5 / 2.75; «שני מעגלים שווים נחתכים» the
 * same; «מעגל מוכל (במעגל O) ברדיוסים שווים» drew green with the equality dropped. ADR-455 wired the reading into three
 * rules, and no gate watched the words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

const lang = (line: string): 'he' | 'en' => (/[א-ת]/.test(line) ? 'he' : 'en');

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lang(line));
}

function build(lines: string[]) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return { facts, fig };
}

/** Each named point lies on one of the two circles (the crossings on both). */
function onCircles(fig: ReturnType<typeof replay>, points: string[], both: boolean) {
  const circles = [...fig.circles.values()];
  for (const X of points) {
    const p = fig.positions.get(X)!;
    const on = circles.filter((c) => Math.abs(Math.hypot(p.x - c.center.x, p.y - c.center.y) - c.r) < 1e-6).length;
    expect(on, X).toBeGreaterThanOrEqual(both ? 2 : 1);
  }
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2186 — intersecting circles stated equal are drawn equal, in every spelling', () => {
  const ROWS: [string[], string, string[], boolean][] = [
    [[], 'שני מעגלים נחתכים ברדיוסים שווים', ['A', 'B'], true],
    [[], 'שני מעגלים נחתכים בנקודות A ו-B ורדיוסיהם שווים', ['A', 'B'], true],
    [['מעגל O', 'מעגל P'], 'המעגלים O ו-P נחתכים ברדיוסים שווים', ['A', 'B'], true],
    [[], 'שני מעגלים נחתכים בנקודות A ו-B ברדיוסים שווים', ['A', 'B'], true],
    [[], 'שני מעגלים נפגשים בנקודות A ו-B ברדיוסים שווים', ['A', 'B'], true],
    [[], 'שני מעגלים נחתכים, רדיוסיהם שווים', ['A', 'B'], true],
    [[], 'two intersecting circles with equal radii', ['A', 'B'], true],
    [[], 'two circles with equal radii intersect at A and B', ['A', 'B'], true],
    [[], 'שני מעגלים נחתכים ששטחם שווה', ['A', 'B'], true],
    [[], 'שני מעגלים נחתכים שהיקפם שווה', ['A', 'B'], true],
    [['מעגל O', 'מעגל P'], 'המעגלים נחתכים בנקודות A ו-B ורדיוסיהם שווים', ['A', 'B'], true],
    [['מעגל O', 'מעגל P'], 'מעגל O חותך את מעגל P בנקודה A ברדיוסים שווים', ['A'], true],
    [[], 'AB משיק משותף חיצוני לשני מעגלים ברדיוסים שווים', ['A', 'B'], false],
    [['מעגל O', 'מעגל P'], 'AB משיק משותף למעגלים O ו-P ברדיוסים שווים', ['A', 'B'], false],
    [[], 'ישר חותך את שני מעגלים ברדיוסים שווים בנקודות C, D, E ו-F', ['C', 'D', 'E', 'F'], false],
  ];
  for (const [prefix, line, points, both] of ROWS) {
    it(`«${line}» → equal radii, the points on their circles, verifier clean, the model never asked`, async () => {
      const v = await decide(prefix, line);
      expect(v.kind, line).toBe('commit');
      const { facts, fig } = build([...prefix, line]);
      const [r1, r2] = [...fig.circles.values()].map((c) => c.r);
      expect(Math.abs(r1 - r2), 'equal radii').toBeLessThan(1e-6);
      onCircles(fig, points, both);
      expect(facts.some((f) => f.cmd.type === 'set-radius-ratio'), 'the given is in the givens list').toBe(true);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('a stated radius holds and the partner follows — in both entry orders', () => {
    const before = build(['מעגל O ברדיוס 3', 'מעגל P', 'המעגלים O ו-P נחתכים ברדיוסים שווים']).fig;
    for (const c of before.circles.values()) expect(c.r).toBeCloseTo(3, 5);
    const after = build(['מעגל O', 'מעגל P', 'המעגלים O ו-P נחתכים ברדיוסים שווים', 'רדיוס מעגל O הוא 3']).fig;
    for (const c of after.circles.values()) expect(c.r).toBeCloseTo(3, 6);
  });

  it('24-seed whole-rate on the report: equal, crossing twice, verifier clean at every seed', () => {
    const { facts } = build(['שני מעגלים נחתכים ברדיוסים שווים']);
    let whole = 0;
    for (let seed = 0; seed < 24; seed++) {
      const fig = replay(facts, seed);
      const [r1, r2] = [...fig.circles.values()].map((c) => c.r);
      const a = fig.positions.get('A')!;
      const b = fig.positions.get('B')!;
      if (fig.lastError === null && fig.violations.length === 0 && Math.abs(r1 - r2) < 1e-6 && Math.hypot(a.x - b.x, a.y - b.y) > 1e-3) whole++;
    }
    expect(whole).toBe(24);
  });
});

describe('#2186 — where the words cannot be drawn, the line is not committed', () => {
  it.each([
    // «שני מעגלים בעלי מרכז משותף O ברדיוסים שווים» is refused naming the contradiction since #2206 (ADR-713).
    [[], 'שני מעגלים שווים נחתכים'], // the equal-circle noun phrase, not read yet (#2187)
    [[], 'שני מעגלים שווים משיקים'],
    [[], 'two equal circles intersect'],
    // «מעגל מוכל (במעגל O) ברדיוסים שווים» moved to a refusal naming the contradiction: #2200 (ADR-712), its lock
    // issue-2200-equal-circles.test.ts.
  ] as [string[], string][])('%j «%s» → escalate (weak: dropped), never drawn unequal', async (prefix, line) => {
    const v = await decide(prefix, line);
    expect(v.kind, line).toBe('escalate');
    expect(v.kind === 'escalate' && v.weak).toBe('dropped');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('«ברדיוס 5» on intersecting circles is never committed with a radius other than 5 (ADR-677)', () => {
    const { fig } = build(['שני מעגלים נחתכים ברדיוס 5']);
    for (const c of fig.circles.values()) expect(c.r).toBeCloseTo(5, 9);
  });

  it('unchanged: the tangent and disjoint lanes, the internal-tangency refusal (#2206), the clause refusal', async () => {
    for (const line of ['שני מעגלים משיקים ברדיוסים שווים', 'שני מעגלים זרים ברדיוסים שווים']) {
      const { fig } = build([line]);
      const [r1, r2] = [...fig.circles.values()].map((c) => c.r);
      expect(Math.abs(r1 - r2), line).toBeLessThan(1e-6);
    }
    expect((await decide([], 'שני מעגלים משיקים מבפנים ברדיוסים שווים')).kind).toBe('refuse'); // #2206 (ADR-713): refused, no longer escalated
    const split = await decide([], 'שני מעגלים נחתכים בנקודות A ו-B, AB=6');
    expect(split.kind).toBe('refuse');
  });
});
