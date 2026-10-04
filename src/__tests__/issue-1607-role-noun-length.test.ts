/**
 * #1607 ([ADR-574](../../docs/06-decisions.md#adr-574)) — a ROLE noun before a length keeps BOTH the role and the
 * length. «האלכסון AC = 8» went to the paid model: the `segment` rule read «האלכסון AC», ignored the residue, and
 * the honesty gate (correctly) refused a parse that lost the 8. Same for «התיכון AM = 5» and «הגובה AH = 5».
 *
 * These locks CALL the real pre-LLM decision (`decideDeterministic2D`, what `runSubmit` dispatches) and apply
 * each accepted line to the store as the pipeline does, then measure the replayed figure. The model is mocked
 * and never asked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

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
const cmdsOf = (v: Verdict2D): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
const allOk = () => {
  const f = fig();
  expect(Object.values(f.status).every((s) => s === 'ok'), JSON.stringify(f.status)).toBe(true);
  expect(f.violations).toEqual([]);
};
const setDistance = (cs: readonly AnyCommand[], a: string, b: string) =>
  cs.find((c) => c.type === 'set-distance' && [c.a, c.b].sort().join('') === [a, b].sort().join('')) as
    | Extract<AnyCommand, { type: 'set-distance' }>
    | undefined;

describe('#1607 — the diagonal: the claim AND the length, every copula and the «אורך ה…» prefix', () => {
  const LINES = ['האלכסון AC = 8', 'אלכסון AC = 8', 'האלכסון AC הוא 8', 'אורך האלכסון AC הוא 8', 'האלכסון AC שווה ל-8', 'האלכסון AC 8'];
  for (const shape of ['מקבילית ABCD', 'מלבן ABCD', 'ריבוע ABCD']) {
    for (const line of LINES) {
      it(`${shape} → «${line}» commits the diagonal claim + |AC| = 8, and the figure has it`, async () => {
        const [, v] = await run([shape, line]);
        expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
        const cs = cmdsOf(v);
        expect(cs.some((c) => c.type === 'segment' && c.diagonal === true), 'the ADR-499 diagonal claim survives').toBe(true);
        expect(setDistance(cs, 'A', 'C')?.value).toBe(8);
        allOk();
        expect(dist(pos('A'), pos('C'))).toBeCloseTo(8, 4);
      });
    }
  }
  it('the claim is still CHECKED: «האלכסון AB = 8» on a parallelogram is refused naming the side, never drawn', async () => {
    const [, v] = await run(['מקבילית ABCD', 'האלכסון AB = 8']);
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toMatch(/not a diagonal/);
  });
});

describe('#1607 — the median and the altitude: the construct (its foot) AND the length', () => {
  const CASES: [string, 'midpoint' | 'foot', string, number][] = [
    ['התיכון AM = 5', 'midpoint', 'M', 5],
    ['אורך התיכון AM הוא 5', 'midpoint', 'M', 5],
    ['התיכון AM שווה 5', 'midpoint', 'M', 5],
    ['הגובה AH = 5', 'foot', 'H', 5],
    ['הגובה AH הוא 5', 'foot', 'H', 5],
    ['אורך הגובה AH הוא 5', 'foot', 'H', 5],
  ];
  for (const [line, kind, foot, value] of CASES) {
    it(`משולש ABC → «${line}» mints ${foot} as the ${kind} and pins |A${foot}| = ${value}`, async () => {
      const [, v] = await run(['משולש ABC', line]);
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      const cs = cmdsOf(v);
      expect(cs.some((c) => c.type === kind && c.id === foot)).toBe(true);
      expect(setDistance(cs, 'A', foot)?.value).toBe(value);
      allOk();
      expect(dist(pos('A'), pos(foot))).toBeCloseTo(value, 4);
      const B = pos('B'), C = pos('C'), F = pos(foot);
      if (kind === 'midpoint') expect(dist(F, { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 })).toBeLessThan(1e-4);
      else expect(Math.abs((F.x - pos('A').x) * (C.x - B.x) + (F.y - pos('A').y) * (C.y - B.y))).toBeLessThan(1e-4);
    });
  }
});

describe('#1607 — English, the same composition', () => {
  const CASES: [string, string, string, string][] = [
    ['triangle ABC', 'the median AM is 5', 'M', 'midpoint'],
    ['triangle ABC', 'altitude AH = 5', 'H', 'foot'],
    ['triangle ABC', 'the height AH is 5', 'H', 'foot'],
  ];
  for (const [shape, line, foot, kind] of CASES) {
    it(`${shape} → «${line}»`, async () => {
      const [, v] = await run([shape, line], 'en');
      expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
      expect(cmdsOf(v).some((c) => c.type === kind && (c as { id?: string }).id === foot)).toBe(true);
      expect(setDistance(cmdsOf(v), 'A', foot)?.value).toBe(5);
    });
  }
});

describe('#1607 — a relation is not an equality (#1248 stays closed)', () => {
  for (const line of ['התיכון AM גדול מ-5', 'האלכסון AC גדול מ-5']) {
    it(`«${line}» never commits |…| = 5 — the role construct + a BOUND (the #1249 routing), or nothing`, async () => {
      const shape = line.includes('תיכון') ? 'משולש ABC' : 'מקבילית ABCD';
      const [, v] = await run([shape, line]);
      const cs = cmdsOf(v);
      expect(cs.some((c) => c.type === 'set-distance'), 'a bound read as an equality is ADR-390’s cardinal sin').toBe(false);
      expect(v.kind).toBe('commit');
      expect(cs.some((c) => c.type === 'set-length-bound')).toBe(true);
    });
  }
  it('a connective that is neither a copula nor a relation is not rewritten — the line still escalates honestly', async () => {
    const [, v] = await run(['משולש ABC', 'התיכון AM פי 2 מ-AB']);
    expect(v.kind).not.toBe('commit');
    expect(cmdsOf(v).some((c) => c.type === 'set-distance')).toBe(false);
  });
});
