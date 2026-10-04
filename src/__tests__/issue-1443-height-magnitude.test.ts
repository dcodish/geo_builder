/**
 * #1443 ([ADR-575](../../docs/06-decisions.md#adr-575)) — a HEIGHT stated as a magnitude, with no segment named.
 *
 * External review relayed by the operator (2026-09-27): *"«גובה הטרפז 4» isn't understood"* — *"you can't give a
 * height as a value; you have to name the segment first."* Operator ruling the same day: the stated height is
 * DRAWN. A trapezoid has one height (between its bases) and builds; a parallelogram (two) and a triangle (three)
 * ASK which, quoting sentences that each build; «הגובה לצלע BC הוא 4» names the side and builds.
 *
 * These locks CALL the real pre-LLM decision (`decideDeterministic2D`) and apply each accepted line to the store
 * as the pipeline does, then measure the replayed figure. The model is mocked and never asked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { parse } from '@/parser';
import type { AnyCommand, Vec } from '@/engine';
import { ctxOf } from './scenario-pipeline';

const st = () => useGeoStore.getState();

async function run(lines: string[], locale: 'he' | 'en' = 'he'): Promise<Verdict2D[]> {
  st().clear();
  const out: Verdict2D[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
    if (v.kind === 'commit') st().executeMany([...v.commands], line);
    out.push(v);
  }
  return out;
}
const fig = () => replay(st().facts, st().seed);
const pos = (id: string): Vec => {
  const p = fig().positions.get(id);
  expect(p, `${id} has a position`).toBeDefined();
  return p!;
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** distance from p to the LINE through a, b */
const toLine = (p: Vec, a: Vec, b: Vec) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / dist(a, b);
const cmdsOf = (v: Verdict2D): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
const allOk = () => {
  const f = fig();
  expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
  expect(f.violations).toEqual([]);
};
const footOf = (cs: readonly AnyCommand[]) => cs.find((c) => c.type === 'foot') as Extract<AnyCommand, { type: 'foot' }> | undefined;
const distances = (cs: readonly AnyCommand[]) => cs.filter((c) => c.type === 'set-distance') as Extract<AnyCommand, { type: 'set-distance' }>[];

describe('#1443 — the trapezoid’s height: minted, DRAWN, and it is the distance between the bases', () => {
  const LINES: [string, 'he' | 'en'][] = [
    ['גובה הטרפז 4', 'he'],
    ['גובה הטרפז הוא 4', 'he'],
    ['גובה הטרפז = 4', 'he'],
    ['גובה הטרפז שווה 4', 'he'],
    ['גובה הטרפז ABCD הוא 4', 'he'],
    ['הגובה הוא 4', 'he'],
    ['גובה 4', 'he'],
    ['the height of the trapezoid is 4', 'en'],
  ];
  for (const [line, locale] of LINES) {
    it(`טרפז ABCD → «${line}»: a foot from D on AB, the height drawn, |DF| = 4 and C is 4 from AB too`, async () => {
      const [, v] = await run([locale === 'he' ? 'טרפז ABCD' : 'trapezoid ABCD', line], locale);
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      const cs = cmdsOf(v);
      const foot = footOf(cs);
      expect(foot && [foot.from, foot.a, foot.b]).toEqual(['D', 'A', 'B']);
      expect(cs.some((c) => c.type === 'segment' && [c.a, c.b].sort().join('') === ['D', foot!.id].sort().join('')), 'the height is DRAWN').toBe(true);
      const ds = distances(cs);
      expect(ds.length, 'only the height is fixed — no other magnitude is invented').toBe(1);
      expect([ds[0].a, ds[0].b, ds[0].value]).toEqual(['D', foot!.id, 4]);
      allOk();
      expect(dist(pos('D'), pos(foot!.id))).toBeCloseTo(4, 4);
      expect(toLine(pos('C'), pos('A'), pos('B')), 'the distance between the bases').toBeCloseTo(4, 4);
    });
  }
  it('a stated base pair (BC ∥ AD) moves the height onto those bases', async () => {
    const [, , v] = await run(['טרפז ABCD', 'BC מקביל ל-AD', 'גובה הטרפז 4']);
    expect(v.kind).toBe('commit');
    const foot = footOf(cmdsOf(v));
    expect(foot && [foot.from, [foot.a, foot.b].sort().join('')]).toEqual(['A', 'BC']);
    allOk();
    expect(toLine(pos('D'), pos('B'), pos('C'))).toBeCloseTo(4, 4);
  });
  it('a bound stays a bound: «גובה הטרפז גדול מ-4» draws the height and never fixes it at 4', async () => {
    const [, v] = await run(['טרפז ABCD', 'גובה הטרפז גדול מ-4']);
    expect(v.kind).toBe('commit');
    expect(distances(cmdsOf(v))).toEqual([]);
    expect(cmdsOf(v).some((c) => c.type === 'set-length-bound')).toBe(true);
  });
});

describe('#1443 — a parallelogram and a triangle ASK which height, and every option they offer builds', () => {
  const CASES: [string, string, number, 'he' | 'en'][] = [
    ['משולש ABC', 'גובה המשולש 4', 3, 'he'],
    ['משולש ABC', 'גובה המשולש הוא 4', 3, 'he'],
    ['מקבילית ABCD', 'גובה המקבילית הוא 4', 2, 'he'],
    ['parallelogram ABCD', 'the height of the parallelogram is 4', 2, 'en'],
    ['triangle ABC', 'the height of the triangle is 4', 3, 'en'],
  ];
  for (const [shape, line, n, locale] of CASES) {
    it(`${shape} → «${line}» asks between ${n} heights; each quoted sentence builds a height of 4`, async () => {
      const [, v] = await run([shape, line], locale);
      expect(v.kind).toBe('refuse');
      expect(JSON.stringify(v)).toContain('input.ambiguousConstruct');
      const r = parse(line, ctxOf(st().facts));
      expect(r.ok).toBe(false);
      const options = !r.ok && r.reason === 'ambiguous-construct' ? r.options : [];
      expect(options.length).toBe(n);
      expect(new Set(options).size, 'the options are different heights').toBe(n);
      for (const option of options) {
        const [, w] = await run([shape, option], locale);
        expect(w.kind, `the offered «${option}» must build`).toBe('commit');
        const foot = footOf(cmdsOf(w));
        expect(foot, option).toBeDefined();
        allOk();
        expect(dist(pos(foot!.from), pos(foot!.id))).toBeCloseTo(4, 4);
      }
    });
  }
});

describe('#1443 — a height (or median) phrase that names its side or apex keeps its value', () => {
  const CASES: [string, string, 'foot' | 'midpoint', string, number][] = [
    ['משולש ABC', 'הגובה לצלע BC הוא 4', 'foot', 'A', 4],
    ['משולש ABC', 'הגובה מ-A הוא 4', 'foot', 'A', 4],
    ['משולש ABC', 'הגובה לצלע AC הוא 4', 'foot', 'B', 4],
    ['מקבילית ABCD', 'הגובה מ-A לצלע CD הוא 4', 'foot', 'A', 4],
    ['משולש ABC', 'התיכון לצלע BC הוא 5', 'midpoint', 'A', 5],
    ['משולש ABC', 'התיכון מ-A הוא 5', 'midpoint', 'A', 5],
  ];
  for (const [shape, line, kind, apex, value] of CASES) {
    it(`${shape} → «${line}»`, async () => {
      const [, v] = await run([shape, line]);
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      const cs = cmdsOf(v);
      const minted = cs.find((c) => c.type === kind) as { id: string } | undefined;
      expect(minted).toBeDefined();
      const ds = distances(cs);
      expect(ds.length).toBe(1);
      expect([[ds[0].a, ds[0].b].sort().join(''), ds[0].value]).toEqual([[apex, minted!.id].sort().join(''), value]);
      allOk();
      expect(dist(pos(apex), pos(minted!.id))).toBeCloseTo(value, 4);
    });
  }
});

describe('#1443 — what it does not do', () => {
  it('«גובה הטרפז 4» with no trapezoid is refused naming the shape, never drawn', async () => {
    const [, v] = await run(['משולש ABC', 'גובה הטרפז 4']);
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toContain('input.shapeNotFound');
  });
  it('another quadrilateral (a rectangle) is not given a height by this rule — unchanged', async () => {
    const [, v] = await run(['מלבן ABCD', 'גובה המלבן 4']);
    expect(v.kind).not.toBe('commit');
  });
});

describe('#1443 — a trapezoid named by its letters on an empty canvas is introduced with its height', () => {
  for (const [line, locale] of [['גובה הטרפז ABCD הוא 4', 'he'], ['the height of trapezoid ABCD is 4', 'en']] as const) {
    it(`«${line}» on an empty canvas: trapezoid ABCD, the height from D onto AB, the bases 4 apart`, async () => {
      const [v] = await run([line], locale);
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      const cs = cmdsOf(v);
      expect(cs.some((c) => c.type === 'trapezoid')).toBe(true);
      const foot = footOf(cs);
      expect(foot && [foot.from, foot.a, foot.b]).toEqual(['D', 'A', 'B']);
      allOk();
      expect(toLine(pos('D'), pos('A'), pos('B'))).toBeCloseTo(4, 4);
      expect(toLine(pos('C'), pos('A'), pos('B')), 'AB ∥ DC: the height is the distance between the bases').toBeCloseTo(4, 4);
    });
  }
  it('a ring that is partly on the figure is not guessed at', async () => {
    const [, v] = await run(['נקודה A', 'גובה הטרפז ABCD הוא 4']);
    expect(v.kind).not.toBe('commit');
  });
});
