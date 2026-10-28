/**
 * #2579 ([ADR-773](../../../docs/06-decisions.md#adr-773); operator ruling 2026-10-27: Q1 «always», Q2 «yes», Q3 «yes»)
 * — a stated PROPORTION between two segments draws the segments it names, whether or not their points existed, and
 * «AD:DB = 1:2» also places D on AB, between A and B, and draws AB.
 *
 * Measured at 422cda84 (main, after #1467's ADR-769 had landed) through `decideDeterministic2D` → `commitVerdict` →
 * `replay`, the model mocked: every spelling below committed `set-ratio` with NO segment, blank or over existing points;
 * «AD:DB = 1:2» left D a free point with A, D, B bent (the ratio held off the line).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => null }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict, type CreatedNotice2D } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();
let notice: CreatedNotice2D | null = null;
let last: readonly AnyCommand[] = [];
async function run(...lines: string[]) {
  st().clear();
  notice = null;
  for (const l of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, l, /[א-ת]/.test(l) ? 'he' : 'en');
    expect(v.kind, `«${l}»: ${JSON.stringify(v).slice(0, 300)}`).toBe('commit');
    if (v.kind === 'commit') last = v.commands;
    notice = commitVerdict(v, l);
  }
}
const fig = (seed = st().seed) => replay(st().facts, seed);
const segs = () => fig().construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id).sort();
const P = (id: string, seed?: number) => fig(seed).positions.get(id)!;
const dist = (a: string, b: string, seed?: number) => Math.hypot(P(a, seed).x - P(b, seed).x, P(a, seed).y - P(b, seed).y);
const green = () => {
  const d = fig();
  return Object.values(d.status).every((s) => s === 'ok') && d.violations.length === 0;
};
const POINTS = ['נקודה A', 'נקודה B', 'נקודה D'];

beforeEach(() => {
  st().clear();
  notice = null;
});

describe('#2579 — a proportion draws the segments it names (Q1 «always»)', () => {
  const CASES: [string, string[]][] = [
    ['AD:DB = 1:2', ['seg-AB', 'seg-AD', 'seg-BD']],
    ['AD/DB = 1/2', ['seg-AD', 'seg-BD']],
    ['AD = 2DB', ['seg-AD', 'seg-BD']],
    ['AB = 2 AD', ['seg-AB', 'seg-AD']],
    ['AB פי 2 מ-AD', ['seg-AB', 'seg-AD']],
    ['AB קטן פי 2 מ-AD', ['seg-AB', 'seg-AD']],
  ];
  it.each(CASES)('blank «%s» draws %j, green', async (line, expected) => {
    await run(line);
    expect(green()).toBe(true);
    expect(segs()).toEqual(expected);
  });
  it.each(CASES)('«%s» over existing bare points draws %j too', async (line, expected) => {
    await run(...POINTS, line);
    expect(green()).toBe(true);
    expect(segs()).toEqual(expected);
  });
  it('the notice still names the created points, in typed order', async () => {
    await run('AD:DB = 1:2');
    expect(notice?.names).toEqual(['A', 'D', 'B']);
    await run('AB = 2 AD');
    expect(notice?.names).toEqual(['A', 'B', 'D']);
  });
  it('a segment the figure already draws is not drawn twice («משולש ABC» · «AB = 2 AC»)', async () => {
    await run('משולש ABC', 'AB = 2 AC');
    expect(segs()).toEqual(['seg-AB', 'seg-AC', 'seg-BC']);
    expect(dist('A', 'B')).toBeCloseTo(2 * dist('A', 'C'), 5);
  });
});

describe('#2579 — «AD:DB = 1:2» places D on AB, between A and B (Q2, Q3)', () => {
  const between = (seed: number) => {
    expect(dist('A', 'D', seed) + dist('D', 'B', seed)).toBeCloseTo(dist('A', 'B', seed), 5);
    expect(dist('D', 'B', seed)).toBeCloseTo(2 * dist('A', 'D', seed), 5);
  };
  it.each([[['AD:DB = 1:2']], [[...POINTS, 'AD:DB = 1:2']], [['משולש ABC', 'AD:DB = 1:2']], [['נקודה D', 'AD:DB = 1:2']]])(
    '%j: D lies between A and B with AD:DB = 1:2 at seeds 0–3',
    async (lines) => {
      await run(...lines);
      expect(green()).toBe(true);
      for (const s of [0, 1, 2, 3]) between(s);
      expect(segs()).toContain('seg-AB');
    },
  );
  it('the placement is a slider the ratio drives, not a free point (the «D על AB» · «AD:DB» figure)', async () => {
    await run('משולש ABC', 'AD:DB = 1:2');
    const D = fig().construction.objects.find((o) => o.id === 'D')!;
    expect(D.kind).toBe('on-segment-solved');
    expect(notice?.names).toEqual(['D']);
  });
  it('stability: placing D moves no point of the triangle', async () => {
    await run('משולש ABC');
    const before = ['A', 'B', 'C'].map((id) => P(id));
    await run('משולש ABC', 'AD:DB = 1:2');
    ['A', 'B', 'C'].forEach((id, i) => {
      expect(P(id).x).toBeCloseTo(before[i].x, 9);
      expect(P(id).y).toBeCloseTo(before[i].y, 9);
    });
  });
  it('over «D על AB» the line adds the segments only (D is placed already)', async () => {
    await run('משולש ABC', 'D על AB', 'AD:DB = 1:2');
    expect(last.some((c) => c.type === 'point-on-segment')).toBe(false);
    expect(segs()).toEqual(['seg-AB', 'seg-AC', 'seg-AD', 'seg-BC', 'seg-BD']);
    for (const s of [0, 1, 2]) between(s);
  });
  it('a shared point the figure already places keeps the plain proportion: a triangle vertex stays a vertex', async () => {
    await run('משולש ABD', 'AD:DB = 1:2');
    expect(last.some((c) => c.type === 'point-on-segment')).toBe(false);
    expect(green()).toBe(true);
    expect(dist('D', 'B')).toBeCloseTo(2 * dist('A', 'D'), 5);
    expect(dist('A', 'D') + dist('D', 'B') - dist('A', 'B')).toBeGreaterThan(1e-3); // not flattened onto AB
  });
  it('the same for any letters: «משולש ABC» · «AB:BC = 5:3» relates two sides and moves no vertex onto AC', async () => {
    await run('משולש ABC', 'AB:BC = 5:3');
    expect(last.map((c) => c.type)).toEqual(['segment', 'segment', 'set-ratio']);
    expect(dist('A', 'B') / dist('B', 'C')).toBeCloseTo(5 / 3, 6);
  });
  it('two segments with no shared point place nothing («AB:CD = 5:4»)', async () => {
    await run('AB:CD = 5:4');
    expect(last.some((c) => c.type === 'point-on-segment')).toBe(false);
    expect(segs()).toEqual(['seg-AB', 'seg-CD']);
  });
});
