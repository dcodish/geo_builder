/**
 * #2040 ([ADR-636](../../../docs/06-decisions.md#adr-636)) — a comparative or partitive ratio is read by its
 * MEANING in every 2-D ratio slot, or it escalates; it is never drawn as another ratio.
 *
 * Measured at pickup (#2008's tip `fdac649c`, `decideDeterministic2D` + `replay`, the model mocked):
 *  - «משולש ABC · AB קטן פי 2 מ-AC» committed `set-ratio k = 2` (AB twice AC), green — «קטנה», «פחות», «קצר» the same;
 *  - «שטח ABC קטן פי 2 משטח DEF» → `set-area-ratio k = 2`; «היקף … קטן פי 2 …», the sector and "3 times smaller" the same;
 *  - «שטח DEF הוא שלושה רבעים משטח ABC» → k = ¼; «שני שלישים» → ⅓; «שלוש חמישיות» and "three quarters of" → 1;
 *  - «פי שניים», «פי שלושה», "twice", "three times", «כפול» → k = 1; «פי אחד וחצי» → ½; «רבעים» alone → ¼.
 * Angle and arc comparatives escalated (no reader takes them) — honest, and unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { readWordFraction } from '../lexicon';
import { dist, type AnyCommand, type Vec } from '@/engine';

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
const ratioOf = (v: Awaited<ReturnType<typeof decide>>): { type: string; k: number } | null => {
  const c = (v.kind === 'commit' ? v.commands : []).find((x: AnyCommand) => /ratio$/.test(x.type)) as { type: string; k: number } | undefined;
  return c ? { type: c.type, k: c.k } : null;
};

const TRIANGLE = ['משולש ABC'];
const TWO = ['משולש ABC', 'משולש DEF'];
const SECTOR = ['גזרה AOB'];
const FOUR_ON_CIRCLE = ['מעגל O', 'A על המעגל O', 'B על המעגל O', 'C על המעגל O', 'D על המעגל O'];

describe('#2040 — the lexicon reads a word fraction whole', () => {
  it.each([
    ['שלושה רבעים', 3, 4], ['רבע', 1, 4], ['לחצי', 1, 2], ['מחצית', 1, 2], ['שני שלישים', 2, 3], ['שתי חמישיות', 2, 5],
    ['שלוש חמישיות', 3, 5], ['three quarters', 3, 4], ['a quarter', 1, 4], ['half', 1, 2], ['two thirds', 2, 3],
  ])('«%s» is %d/%d', (w, p, q) => {
    expect(readWordFraction(`הוא ${w} מ`)).toMatchObject({ p, q });
  });
  it.each(['רבעים', 'שלושה רבע', 'a thirds'])('«%s» is a fraction word it cannot spell exactly — unread, never another number', (w) => {
    expect(readWordFraction(`הוא ${w} מ`)).toBe('unread');
  });
  it.each(['חציון', 'מרובע', 'רבעון', 'משולש'])('«%s» is not a fraction word', (w) => {
    expect(readWordFraction(w)).toBeNull();
  });
});

describe('#2040 — a comparative inverts its factor; a partitive is read whole', () => {
  it.each([
    // length (the segment-ratio reader)
    [TRIANGLE, 'AB קטן פי 2 מ-AC', 'set-ratio', 0.5],
    [TRIANGLE, 'AB קטנה פי 2 מ-AC', 'set-ratio', 0.5],
    [TRIANGLE, 'הצלע AB קטנה פי 2 מהצלע AC', 'set-ratio', 0.5],
    [TRIANGLE, 'AB פחות פי 2 מ-AC', 'set-ratio', 0.5],
    [TRIANGLE, 'AB קצר פי 2 מ-AC', 'set-ratio', 0.5],
    [TRIANGLE, 'AB קטן פי 1.5 מ-AC', 'set-ratio', 1 / 1.5],
    [TRIANGLE, 'AB גדול פי 2 מ-AC', 'set-ratio', 2],
    [TRIANGLE, 'AB ארוך פי 2 מ-AC', 'set-ratio', 2],
    [TRIANGLE, 'AB פי 2 מ-AC', 'set-ratio', 2],
    // area
    [TWO, 'שטח ABC קטן פי 2 משטח DEF', 'set-area-ratio', 0.5],
    [TWO, 'שטח ABC קטן פי 3 משטח DEF', 'set-area-ratio', 1 / 3],
    [TWO, 'שטח ABC גדול פי 3 משטח DEF', 'set-area-ratio', 3],
    [TWO, 'שטח ABC הוא פי 2 משטח DEF', 'set-area-ratio', 2],
    [TWO, 'שטח DEF הוא שלושה רבעים משטח ABC', 'set-area-ratio', 0.75],
    [TWO, 'שטח ABC שווה לשלושה רבעים משטח DEF', 'set-area-ratio', 0.75],
    [TWO, 'שטח DEF הוא שני שלישים משטח ABC', 'set-area-ratio', 2 / 3],
    [TWO, 'שטח DEF הוא שלוש חמישיות משטח ABC', 'set-area-ratio', 0.6],
    [TWO, 'שטח DEF הוא חצי משטח ABC', 'set-area-ratio', 0.5],
    [TWO, 'שטח DEF רבע משטח ABC', 'set-area-ratio', 0.25],
    [TWO, 'שטח DEF הוא שליש משטח ABC', 'set-area-ratio', 1 / 3],
    [TWO, 'SABC = 2SDEF', 'set-area-ratio', 2],
    [TWO, 'SABC/SDEF = 3/4', 'set-area-ratio', 0.75],
    [TWO, 'שטח ABC שווה לשטח DEF', 'set-area-ratio', 1],
    // perimeter
    [TWO, 'היקף ABC קטן פי 2 מהיקף DEF', 'set-perimeter-ratio', 0.5],
    [TWO, 'היקף DEF הוא שלושה רבעים מהיקף ABC', 'set-perimeter-ratio', 0.75],
    [TWO, 'היקף DEF הוא חצי מהיקף ABC', 'set-perimeter-ratio', 0.5],
    [TWO, 'היקף ABC = 2 היקף DEF', 'set-perimeter-ratio', 2],
    // the round measures (ADR-632)
    [SECTOR, 'שטח הגזרה AOB קטן פי 4 משטח המעגל', 'set-area-ratio', 0.25],
    [SECTOR, 'אורך הקשת AB קטן פי 4 מהיקף המעגל', 'set-perimeter-ratio', 0.25],
    [SECTOR, 'שטח הגזרה AOB הוא רבע משטח המעגל', 'set-area-ratio', 0.25],
  ] as [string[], string, string, number][])('after %j «%s» → %s k = %d', async (prefix, line, type, k) => {
    const v = await decide(prefix, line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    const r = ratioOf(v)!;
    expect(r.type).toBe(type);
    expect(r.k).toBeCloseTo(k, 9);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each([
    [TWO, 'area ABC is 3 times smaller than area DEF', 'set-area-ratio', 1 / 3],
    [TWO, 'area ABC is 3 times larger than area DEF', 'set-area-ratio', 3],
    [TWO, 'area DEF is three quarters of area ABC', 'set-area-ratio', 0.75],
    [TWO, 'area DEF is a quarter of area ABC', 'set-area-ratio', 0.25],
  ] as [string[], string, string, number][])('English: after %j «%s» → %s k = %d', async (prefix, line, type, k) => {
    const r = ratioOf(await decide(prefix, line, 'en'))!;
    expect(r.type).toBe(type);
    expect(r.k).toBeCloseTo(k, 9);
  });

  it.each([
    // a factor or a comparative the reader cannot spell exactly: honest escalation, never another ratio
    [TWO, 'שטח ABC גדול פי שניים משטח DEF'],
    [TWO, 'שטח ABC קטן פי שניים משטח DEF'],
    [TWO, 'שטח ABC גדול פי שלושה משטח DEF'],
    [TWO, 'שטח ABC גדול פי אחד וחצי משטח DEF'],
    [TWO, 'שטח ABC כפול משטח DEF'],
    [TWO, 'שטח ABC הוא רבעים משטח DEF'],
    [TWO, 'שטח ABC גדול משטח DEF'],
    [TWO, 'שטח DEF קטן ברבע משטח ABC'],
    [TWO, 'area ABC is twice area DEF'],
    [TRIANGLE, 'AB גדול פי שניים מ-AC'],
    // angle and arc comparatives: no reader takes them (unchanged)
    [TRIANGLE, 'זווית A קטנה פי 2 מזווית B'],
    [FOUR_ON_CIRCLE, 'קשת AB קטנה פי 2 מקשת CD'],
  ] as [string[], string][])('after %j «%s» escalates', async (prefix, line) => {
    const v = await decide(prefix, line, /[א-ת]/.test(line) ? 'he' : 'en');
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('escalate');
  });

  it('a length partitive in words is still TAUGHT, not read (the ADR-591 ruling)', async () => {
    const v = await decide(TRIANGLE, 'AB הוא שלושה רבעים מ-AC');
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toContain('AB = 3/4 AC');
  });
});

describe('#2040 — the figure holds the stated ratio', () => {
  const shoelace = (ps: Vec[]): number => Math.abs(ps.reduce((s, p, i) => s + p.x * ps[(i + 1) % ps.length].y - ps[(i + 1) % ps.length].x * p.y, 0)) / 2;
  const build = (lines: string[]) => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(lines);
    expect(refused).toEqual([]);
    const d = replay(facts, 0);
    expect(d.violations).toEqual([]);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    return (id: string) => d.positions.get(id) as Vec;
  };

  it('«AB קטן פי 2 מ-AC» draws AB at half of AC (it drew AB at twice AC)', () => {
    const p = build([...TRIANGLE, 'AB קטן פי 2 מ-AC']);
    expect(dist(p('A'), p('B')) / dist(p('A'), p('C'))).toBeCloseTo(0.5, 6);
  });

  it('«שטח ABC קטן פי 2 משטח DEF» draws ABC at half of DEF', () => {
    const p = build([...TWO, 'שטח ABC קטן פי 2 משטח DEF']);
    expect(shoelace(['A', 'B', 'C'].map(p)) / shoelace(['D', 'E', 'F'].map(p))).toBeCloseTo(0.5, 6);
  });

  it('«שטח DEF הוא שלושה רבעים משטח ABC» draws DEF at three quarters of ABC (it drew a quarter)', () => {
    const p = build([...TWO, 'שטח DEF הוא שלושה רבעים משטח ABC']);
    expect(shoelace(['D', 'E', 'F'].map(p)) / shoelace(['A', 'B', 'C'].map(p))).toBeCloseTo(0.75, 6);
  });
});
