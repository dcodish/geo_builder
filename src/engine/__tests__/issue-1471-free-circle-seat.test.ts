/**
 * #1471 ([ADR-576](../../../docs/06-decisions.md#adr-576)) — SEAT THE CIRCLE, NOT THE POINT.
 *
 * «משולש ABC · מעגל O · המעגל עובר דרך A, B ו-C» was refused as over-constrained: putting an existing free vertex
 * on a circle whose place/size were never stated converted the vertex at its bearing ONTO THE DEFAULT RING, so B and
 * C (on one ray from the default centre) collided. The fix re-seats the circle's unstated centre/radius through the
 * new member and its existing members (apply.ts `reseatFreeCircle`, called in the `point-on-circle` (c2) branch).
 *
 * The runner is the real pre-LLM decision `decideDeterministic2D` with each accepted line committed to the store as
 * the pipeline commits it; the figure is `replay` over the store's facts. The model is mocked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { meetsRequirements } from '@/replay/core';
import { humanizeError } from '@/i18n/humanizeError';
import { circumcenter } from '@/engine/geometry';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();
const fig = () => replay(st().facts, st().seed);
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Each line through the real deterministic decision; a commit is applied to the store. Returns every verdict
 *  and the positions BEFORE each line (the stability baseline). */
async function run(lines: string[], locale: 'he' | 'en' = 'he') {
  st().clear();
  const verdicts: Verdict2D[] = [];
  const before: Map<string, Vec>[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    before.push(new Map(d.positions));
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    if (v.kind === 'commit') st().executeMany([...v.commands], line);
    verdicts.push(v);
  }
  return { verdicts, before };
}
const p = (id: string): Vec => {
  const v = fig().positions.get(id);
  expect(v, `${id} placed`).toBeDefined();
  return v!;
};
const greenNow = () => {
  const f = fig();
  expect(f.lastError).toBeNull();
  expect(f.violations).toEqual([]);
  expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
};
/** The listed points sit exactly where they were before the last line (the first-class stability invariant). */
const unmoved = (before: Map<string, Vec>, ids: string[]) => {
  for (const id of ids) expect(dist(p(id), before.get(id)!), `${id} must not jump`).toBeLessThan(1e-6);
};
const onCircleO = (ids: string[]) => {
  const f = fig();
  const circ = f.construction.objects.find((o) => o.kind === 'circle' && o.center === 'O');
  expect(circ, 'circle O').toBeDefined();
  const r = dist(p('O'), p(ids[0]));
  for (const id of ids) expect(Math.abs(dist(p('O'), p(id)) - r), `${id} on the circle`).toBeLessThan(1e-6);
};

const TRI = ['A', 'B', 'C'];

describe('#1471 — three vertices of a drawn triangle on a drawn circle make it the circumcircle', () => {
  it('the report: accepted, triangle unmoved, O = circumcentre, 24/24 seeds meet the requirements', async () => {
    const { verdicts, before } = await run(['משולש ABC', 'מעגל O', 'המעגל עובר דרך A, B ו-C']);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    greenNow();
    unmoved(before[2], TRI);
    onCircleO(TRI);
    const cc = circumcenter(p('A'), p('B'), p('C'))!;
    expect(dist(p('O'), cc)).toBeLessThan(1e-6);
    let ok = 0;
    for (let s = 0; s < 24; s++) if (meetsRequirements(st().facts, s)) ok++;
    expect(ok).toBe(24);
  });

  it.each([
    [['משולש ABC', 'מעגל O', 'A, B ו-C על המעגל'], 'he'],
    [['משולש ABC', 'מעגל O', 'C, A ו-B על המעגל'], 'he'],
    [['משולש ABC', 'מעגל O', 'B, C ו-A על המעגל'], 'he'],
    [['מעגל O', 'משולש ABC', 'A, B ו-C על המעגל'], 'he'],
    [['triangle ABC', 'circle O', 'A, B and C are on the circle'], 'en'],
  ] as [string[], 'he' | 'en'][])('class permutation %j: accepted, triangle unmoved', async (lines, loc) => {
    const { verdicts, before } = await run(lines, loc);
    expect(verdicts.map((v) => v.kind)).toEqual(['commit', 'commit', 'commit']);
    greenNow();
    unmoved(before[2], TRI);
    onCircleO(TRI);
  });

  it('one membership per line: each accepted, nothing ever jumps', async () => {
    const lines = ['משולש ABC', 'מעגל O', 'A על המעגל', 'B על המעגל', 'C על המעגל'];
    const { verdicts, before } = await run(lines);
    expect(verdicts.every((v) => v.kind === 'commit')).toBe(true);
    greenNow();
    unmoved(before[2], TRI);
    unmoved(before[4], TRI);
    onCircleO(TRI);
  });
});

describe('#1471 — fewer members, stated radius, collapsed-seat siblings', () => {
  it('two vertices B, C: accepted, unmoved, O on the perpendicular bisector of BC', async () => {
    const { verdicts, before } = await run(['משולש ABC', 'מעגל O', 'B ו-C על המעגל']);
    expect(verdicts[2].kind).toBe('commit');
    greenNow();
    unmoved(before[2], TRI);
    expect(Math.abs(dist(p('O'), p('B')) - dist(p('O'), p('C')))).toBeLessThan(1e-6);
  });

  it('two vertices A, B: accepted and unmoved (they used to jump onto the default ring)', async () => {
    const { verdicts, before } = await run(['משולש ABC', 'מעגל O', 'A ו-B על המעגל']);
    expect(verdicts[2].kind).toBe('commit');
    greenNow();
    unmoved(before[2], TRI);
    onCircleO(['A', 'B']);
  });

  it.each([
    ['ריבוע ABCD', ['A', 'B', 'C', 'D']],
    ['מלבן ABCD', ['A', 'B', 'C', 'D']],
    ['קטע AB', ['A', 'B']],
  ])('%s · מעגל O · A ו-B על המעגל: the default seed is no longer collapsed, figure unmoved', async (shape, ids) => {
    const { verdicts, before } = await run([shape, 'מעגל O', 'A ו-B על המעגל']);
    expect(verdicts[2].kind).toBe('commit');
    expect(meetsRequirements(st().facts, 0)).toBe(true);
    greenNow();
    unmoved(before[2], ids);
    expect(dist(p('A'), p('B'))).toBeGreaterThan(1);
  });

  it('stated radius 3, |BC| = 6 ≤ 2R: accepted, B and C unmoved (only the centre moves)', async () => {
    const { verdicts, before } = await run(['משולש ABC', 'מעגל O ברדיוס 3', 'B ו-C על המעגל']);
    expect(verdicts[2].kind).toBe('commit');
    greenNow();
    unmoved(before[2], TRI);
    expect(Math.abs(dist(p('O'), p('B')) - 3)).toBeLessThan(1e-6);
    expect(Math.abs(dist(p('O'), p('C')) - 3)).toBeLessThan(1e-6);
  });

  it('stated radius 2, |BC| = 6 > 2R (arm 2): accepted, the triangle shrinks to fit, B ≠ C', async () => {
    const { verdicts } = await run(['משולש ABC', 'מעגל O ברדיוס 2', 'B ו-C על המעגל']);
    expect(verdicts[2].kind).toBe('commit');
    greenNow();
    expect(dist(p('B'), p('C'))).toBeLessThanOrEqual(4 + 1e-6);
    expect(dist(p('B'), p('C'))).toBeGreaterThan(1e-3);
  });
});

describe('#1471 — honest refusals and guards kept', () => {
  it('a chord longer than the stated diameter is refused, naming |AB| = 10', async () => {
    const { verdicts } = await run(['משולש ABC', 'AB = 10', 'מעגל O ברדיוס 3', 'A ו-B על המעגל']);
    const v = verdicts[3];
    expect(v.kind).toBe('refuse');
    const raw = v.kind === 'refuse' && 'explain' in v.note ? v.note.explain : '';
    expect(raw).toMatch(/\|AB\| = 10/);
    expect(st().facts.some((f) => f.utterance === 'A ו-B על המעגל')).toBe(false);
  });

  it('collinear A, B, C (C on segment AB) is never committed with a violation and never shows an internal id', async () => {
    const { verdicts } = await run(['קטע AB', 'C על AB', 'מעגל O', 'A, B ו-C על המעגל']);
    const v = verdicts[3];
    if (v.kind === 'refuse') {
      const raw = 'explain' in v.note ? v.note.explain : '';
      const shown = humanizeError(raw, (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`);
      expect(shown).not.toMatch(/line-|circle-/);
    } else {
      expect(fig().violations).toEqual([]);
    }
  });

  it('four vertices are unchanged: a quadrilateral, a square and a rectangle are accepted', async () => {
    for (const shape of ['מרובע ABCD', 'ריבוע ABCD', 'מלבן ABCD']) {
      const { verdicts } = await run([shape, 'מעגל O', 'A, B, C ו-D על המעגל']);
      expect(verdicts[2].kind, shape).toBe('commit');
      greenNow();
    }
  });

  it('a STATED centre (O placed by coordinates — pinned) is not re-seated: the old projection stands', async () => {
    st().clear();
    st().executeMany([{ type: 'free-point', id: 'O', x: 20, y: 20 }], 'O = (20,20)');
    for (const line of ['משולש ABC', 'מעגל O', 'A על המעגל']) {
      const d = replay(st().facts, st().seed);
      const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
      expect(v.kind, line).toBe('commit');
      if (v.kind === 'commit') st().executeMany([...v.commands], line);
    }
    greenNow();
    expect(dist(p('O'), { x: 20, y: 20 })).toBeLessThan(1e-6);
    onCircleO(['A']);
  });
});
