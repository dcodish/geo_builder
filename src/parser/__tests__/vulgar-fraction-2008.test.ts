/**
 * #2008 ([ADR-635](../../../docs/06-decisions.md#adr-635)) — a number written as a FRACTION, in any 2-D slot that
 * reads a number, is read as that number.
 *
 * Measured at pickup (`main` 6096b643, `decideDeterministic2D` + `replay`, the model mocked):
 *  - «שטח EFGH = ¼ משטח ABCD» committed `set-area-ratio k = 1`, green; ¾ ⅛ ⅖ ½ the same; «2½» read 2;
 *  - «היקף DEF = ½ מהיקף ABC» → k = 1; «∠A = ½∠B» → k = 1; «קשת AB = ½ קשת CD» → k = 1; «∠A = ½α» → coef 1;
 *  - «∠A = 22½°» drew 22°;
 *  - «שטח ADE = ¼ משטח ABC» was refused with a message quoting «1·area(ABC)»;
 *  - «מעגל O בקוטר 3/2» drew r = 1.5 and «רדיוס המעגל O הוא 1/2» drew r = 1 (the legacy decimal atom stopped at
 *    the slash);
 *  - «∠A = 1/2∠B», «קשת AB = 1/2 קשת CD», «∠A = 1/2α» escalated while their decimal twins built.
 *
 * Every lock drives the real submit door. A line is read EXACTLY, or it escalates — never 1, never truncated.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { spellVulgarFractions } from '../lexicon';
import type { AnyCommand, Vec } from '@/engine';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}
const cmds = (v: Awaited<ReturnType<typeof decide>>): AnyCommand[] => (v.kind === 'commit' ? [...v.commands] : []);
/** The one value-bearing command the line committed, as `{type, value}`. */
const valueOf = (v: Awaited<ReturnType<typeof decide>>): { type: string; value: number } | null => {
  for (const c of cmds(v) as unknown as Record<string, unknown>[]) {
    const t = c.type as string;
    if (typeof c.k === 'number') return { type: t, value: c.k };
    if (t === 'set-angle' || t === 'set-distance' || t === 'set-radius') return { type: t, value: c.value as number };
    if (t === 'circle') return { type: t, value: c.radius as number };
    const expr = c.expr as { value?: number; coef?: number } | undefined;
    if (expr?.coef !== undefined) return { type: t, value: expr.coef };
    if (expr?.value !== undefined) return { type: t, value: expr.value };
    if (t === 'set-measure-sum') return { type: t, value: c.target as number };
  }
  return null;
};

const TWO_TRIANGLES = ['משולש ABC', 'משולש DEF'];
const TWO_SQUARES = ['ריבוע ABCD', 'ריבוע EFGH'];
const TRIANGLE = ['משולש ABC'];
const FOUR_ON_CIRCLE = ['מעגל O', 'A על המעגל O', 'B על המעגל O', 'C על המעגל O', 'D על המעגל O'];

describe('#2008 — the boundary spells every vulgar-fraction glyph', () => {
  it.each([
    ['½', '1/2'], ['⅓', '1/3'], ['⅔', '2/3'], ['¼', '1/4'], ['¾', '3/4'], ['⅕', '1/5'], ['⅖', '2/5'], ['⅗', '3/5'], ['⅘', '4/5'],
    ['⅙', '1/6'], ['⅚', '5/6'], ['⅐', '1/7'], ['⅛', '1/8'], ['⅜', '3/8'], ['⅝', '5/8'], ['⅞', '7/8'], ['⅑', '1/9'], ['⅒', '1/10'],
  ])('a lone «%s» is %s', (g, spelled) => {
    expect(spellVulgarFractions(`= ${g} משטח`)).toBe(`= ${spelled} משטח`);
  });

  it.each([
    ['22½°', '22.5°'], ['2½', '2.5'], ['2 ½', '2.5'], ['1¼', '1.25'], ['3⅜', '3.375'], ['2⅓', '7/3'], ['1⅙', '7/6'], ['12½', '12.5'],
  ])('a mixed number «%s» is ONE number, %s', (raw, spelled) => {
    expect(spellVulgarFractions(raw)).toBe(spelled);
  });

  it.each([
    ['½BC', '1/2BC'], ['½∠B', '1/2∠B'], ['פי½', 'פי 1/2'], ['√½', '√(1/2)'], ['½√3', '√3/2'], ['¾√3', '3√3/4'], ['⅓√(2)', '√(2)/3'],
  ])('glued «%s» is %s (a root keeps its operand whole)', (raw, spelled) => {
    expect(spellVulgarFractions(raw)).toBe(spelled);
  });

  it('a subscripted label is not a mixed number', () => {
    expect(spellVulgarFractions('A1½')).toBe('A1 1/2');
  });
});

describe('#2008 — a glyph in every 2-D slot that reads a number is its value (or escalates)', () => {
  it.each([
    // polygon area ratio (ADR-118): Hebrew, S-notation, English, mixed, «פי»
    [TWO_SQUARES, 'שטח EFGH = ¼ משטח ABCD', 'set-area-ratio', 0.25],
    [TWO_SQUARES, 'שטח EFGH = ¾ משטח ABCD', 'set-area-ratio', 0.75],
    [TWO_TRIANGLES, 'שטח DEF = ⅛ משטח ABC', 'set-area-ratio', 0.125],
    [TWO_TRIANGLES, 'שטח DEF = ⅖ משטח ABC', 'set-area-ratio', 0.4],
    [TWO_TRIANGLES, 'שטח DEF = ½ שטח ABC', 'set-area-ratio', 0.5],
    [TWO_TRIANGLES, 'שטח DEF = ½·שטח ABC', 'set-area-ratio', 0.5],
    [TWO_TRIANGLES, 'SDEF = ½SABC', 'set-area-ratio', 0.5],
    [TWO_TRIANGLES, 'שטח DEF = 2½ משטח ABC', 'set-area-ratio', 2.5],
    [TWO_TRIANGLES, 'שטח DEF גדול פי 2½ משטח ABC', 'set-area-ratio', 2.5],
    // perimeter ratio (ADR-228)
    [TWO_TRIANGLES, 'היקף DEF = ½ מהיקף ABC', 'set-perimeter-ratio', 0.5],
    [TWO_TRIANGLES, 'היקף DEF = ¾ מהיקף ABC', 'set-perimeter-ratio', 0.75],
    // angle ratio, arc ratio, symbolic coefficient, angle value
    [TRIANGLE, '∠A = ½∠B', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = ½ ∠B', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = ¾∠B', 'set-angle-ratio', 0.75],
    [FOUR_ON_CIRCLE, 'קשת AB = ½ קשת CD', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = ½α', 'measure-angle', 0.5],
    [TRIANGLE, '∠A = 22½°', 'set-angle', 22.5],
    // segment ratio, length, area value, measure sum, radical
    [TRIANGLE, 'AB = ½ BC', 'set-ratio', 0.5],
    [TRIANGLE, 'AB = ⅓ BC', 'set-ratio', 1 / 3],
    [TRIANGLE, 'AB = 1½ BC', 'set-ratio', 1.5],
    [TRIANGLE, 'AB גדול פי 1½ מ-BC', 'set-ratio', 1.5],
    [TRIANGLE, 'AB = ½', 'measure-length', 0.5],
    [TRIANGLE, 'AB = 2½', 'set-distance', 2.5],
    [TRIANGLE, 'AB = 2 ½', 'set-distance', 2.5],
    [TRIANGLE, 'AB = ½√3', 'measure-length', Math.sqrt(3) / 2],
    [TRIANGLE, 'AB = √½', 'measure-length', Math.SQRT1_2],
    [TRIANGLE, 'AB = BC + ½', 'set-measure-sum', 0.5],
    [TRIANGLE, 'שטח ABC = ½', 'measure-area', 0.5],
    [TRIANGLE, 'שטח ABC = 12½', 'measure-area', 12.5],
    // radius and circle size
    [[], 'מעגל O ברדיוס ½', 'circle', 0.5],
    [[], 'מעגל O ברדיוס 2½', 'circle', 2.5],
    [['מעגל O'], 'רדיוס המעגל O הוא ½', 'set-radius', 0.5],
  ] as [string[], string, string, number][])('after %j «%s» → %s carrying %d', async (prefix, line, type, value) => {
    const v = await decide(prefix, line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    const got = valueOf(v)!;
    expect(got.type).toBe(type);
    expect(got.value).toBeCloseTo(value, 9);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([
    [TWO_TRIANGLES, 'area DEF = ¼ area ABC', 'set-area-ratio', 0.25],
    [TRIANGLE, 'angle A = ½ angle B', 'set-angle-ratio', 0.5],
    [TRIANGLE, 'the area of triangle ABC is 12½', 'measure-area', 12.5],
  ] as [string[], string, string, number][])('English: after %j «%s» → %s carrying %d', async (prefix, line, type, value) => {
    const v = await decide(prefix, line, 'en');
    const got = valueOf(v)!;
    expect(got.type).toBe(type);
    expect(got.value).toBeCloseTo(value, 9);
  });

  it.each([
    // forms no reader takes yet: honest escalation, never a misread
    'AB = ½π',
    'AB = ½x',
  ])('«%s» escalates — it is never read as 1 or truncated', async (line) => {
    const v = await decide(TRIANGLE, line);
    expect(v.kind).toBe('escalate');
  });
});

describe('#2008 — an ASCII fraction in a former legacy-decimal slot is ONE value', () => {
  it.each([
    [[], 'מעגל O בקוטר 3/2', 'circle', 0.75],
    [['מעגל O'], 'רדיוס המעגל O הוא 1/2', 'set-radius', 0.5],
    [['מעגל O'], 'היקף המעגל O הוא 3/2π', 'set-radius', 0.75],
    [TRIANGLE, '∠A = 1/2∠B', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = 1/2 ∠B', 'set-angle-ratio', 0.5],
    [FOUR_ON_CIRCLE, 'קשת AB = 1/2 קשת CD', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = 1/2α', 'measure-angle', 0.5],
    // the decimal and integer twins are unchanged
    [TRIANGLE, '∠A = 0.5∠B', 'set-angle-ratio', 0.5],
    [TRIANGLE, '∠A = 2∠B', 'set-angle-ratio', 2],
    [TRIANGLE, '∠A = ∠B', 'set-angle-ratio', 1],
    [TRIANGLE, '∠A = 2α', 'measure-angle', 2],
    [FOUR_ON_CIRCLE, 'קשת AB = 2 קשת CD', 'set-angle-ratio', 2],
    [TWO_TRIANGLES, 'SDEF = 2SABC', 'set-area-ratio', 2],
    [TWO_TRIANGLES, 'שטח DEF = 2 שטח ABC', 'set-area-ratio', 2],
    [[], 'מעגל O בקוטר 10', 'circle', 5],
    [['מעגל O'], 'רדיוס המעגל O הוא 4', 'set-radius', 4],
  ] as [string[], string, string, number][])('after %j «%s» → %s carrying %d', async (prefix, line, type, value) => {
    const v = await decide(prefix, line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    const got = valueOf(v)!;
    expect(got.type).toBe(type);
    expect(got.value).toBeCloseTo(value, 9);
  });

  it.each(['∠A = 22 1/2°', 'AB = 2 1/2'])('an ASCII mixed number «%s» escalates — never truncated', async (line) => {
    const v = await decide(TRIANGLE, line);
    expect(v.kind).toBe('escalate');
  });
});

describe('#2008 — the figure holds the stated ratio', () => {
  const shoelace = (ps: Vec[]): number => Math.abs(ps.reduce((s, p, i) => s + p.x * ps[(i + 1) % ps.length].y - ps[(i + 1) % ps.length].x * p.y, 0)) / 2;
  const build = (lines: string[]) => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(lines);
    expect(refused).toEqual([]);
    const d = replay(facts, 0);
    expect(d.violations).toEqual([]);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    return (ids: string[]) => shoelace(ids.map((id) => d.positions.get(id) as Vec));
  };

  it('«שטח EFGH = ¼ משטח ABCD» draws EFGH a quarter of ABCD', () => {
    const area = build([...TWO_SQUARES, 'שטח EFGH = ¼ משטח ABCD']);
    expect(area(['E', 'F', 'G', 'H']) / area(['A', 'B', 'C', 'D'])).toBeCloseTo(0.25, 6);
  });

  it('«שטח ADE = ¼ משטח ABC» builds: D and E slide until the area is a quarter (it was refused, misquoted as «1·area»)', () => {
    const area = build([...TRIANGLE, 'D על AB', 'E על AC', 'שטח ADE = ¼ משטח ABC']);
    expect(area(['A', 'D', 'E']) / area(['A', 'B', 'C'])).toBeCloseTo(0.25, 6);
  });
});
