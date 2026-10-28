/**
 * #2489 part A ([ADR-770](../../../docs/06-decisions.md#adr-770); operator 2026-10-24, T34 «מעגל O ברדיוס r» · «OR=r»:
 * *"This should be accepted with dof. Only location for R is on the circle so a point that lins exists."*) — a length
 * given in a letter, a fraction or a root names its endpoints like any other statement, so #1467's implied-point pass
 * (ADR-769) creates them.
 *
 * Measured at d9494206 (before #1467): «OR=r» after «מעגל O ברדיוס r» was refused «|OR| = 1·R references an unknown
 * point» (he and en, «RO=r», «OR=2r» alike); blank «AB = 35/2» / «AB = 12√2» were refused the same way; blank «AB = k» /
 * «AB = 3x» committed a label with no points at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => null }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict, type CreatedNotice2D } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();
let notice: CreatedNotice2D | null = null;
async function run(...lines: string[]) {
  st().clear();
  for (const l of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, l, /[א-ת]/.test(l) ? 'he' : 'en');
    expect(v.kind, `«${l}»: ${JSON.stringify(v).slice(0, 200)}`).toBe('commit');
    notice = commitVerdict(v, l);
  }
}
const at = (id: string, seed: number) => replay(st().facts, seed).positions.get(id)!;
const dist = (a: string, b: string, seed: number) => Math.hypot(at(a, seed).x - at(b, seed).x, at(a, seed).y - at(b, seed).y);
const radius = (seed: number) => [...replay(st().facts, seed).circles.values()][0].r;
const green = () => Object.values(replay(st().facts, st().seed).status).every((s) => s === 'ok') && replay(st().facts, st().seed).violations.length === 0;

beforeEach(() => {
  st().clear();
  notice = null;
});

describe('#2489 T34 — «OR=r» creates R on the circle', () => {
  it.each([
    [['מעגל O ברדיוס r', 'OR=r']],
    [['מעגל O ברדיוס r', 'RO=r']],
    [['מעגל שמרכזו O ורדיוסו r', 'OR=r']],
    [['circle O with radius r', 'OR=r']],
  ])('%j builds green; |OR| is the radius at seeds 0–3; the notice names R only', async (lines) => {
    await run(...lines);
    expect(green()).toBe(true);
    for (const s of [0, 1, 2, 3]) expect(dist('O', 'R', s)).toBeCloseTo(radius(s), 6);
    expect(notice?.names).toEqual(['R']);
    expect(new Set([0, 1, 2, 3].map((s) => radius(s).toFixed(3))).size, 'the radius is free and moves').toBeGreaterThan(1);
  });

  it('then «r = 5» pins it: |OR| = 5 at every seed', async () => {
    await run('מעגל O ברדיוס r', 'OR=r', 'r = 5');
    for (const s of [0, 1, 2, 3]) expect(dist('O', 'R', s)).toBeCloseTo(5, 6);
  });

  it('«OR=2r» is a distance, twice the radius', async () => {
    await run('מעגל O ברדיוס r', 'OR=2r');
    for (const s of [0, 1, 2]) expect(dist('O', 'R', s)).toBeCloseTo(2 * radius(s), 6);
  });
});

describe('#2489 — every symbolic length on a fresh page creates its endpoints', () => {
  it.each(['AB = k', 'AB = 3x', 'AB = 35/2', 'AB = 12√2'])('blank «%s» creates A and B, with the notice', async (line) => {
    await run(line);
    expect(green()).toBe(true);
    expect(notice?.names).toEqual(['A', 'B']);
  });
  it('the stated values hold', async () => {
    await run('AB = 35/2');
    expect(dist('A', 'B', 0)).toBeCloseTo(17.5, 5);
    await run('AB = 12√2');
    expect(dist('A', 'B', 1)).toBeCloseTo(12 * Math.SQRT2, 5);
  });
});
