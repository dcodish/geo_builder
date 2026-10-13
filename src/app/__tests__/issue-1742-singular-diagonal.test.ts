/**
 * #1742 ([ADR-638](../../../docs/06-decisions.md#adr-638)) — a SINGULAR diagonal noun names one diagonal, in
 * both languages.
 *
 * Measured on `main` 6096b643 through `decideDeterministic2D`: «parallelogram ABCD» · "diagonal AC" committed
 * `segment A–C {diagonal}` PLUS `segment B–D`; «מקבילית ABCD» · «האלכסון AC» committed A–C alone. The PLURAL
 * `diagonals` rule (registered before `segment`) guarded English with `diagonals?`, so the singular took its
 * "every diagonal of the figure's polygon" form; its Hebrew guard never matched the singular. The same leak
 * reached the composed "diagonal AC = 8" (ADR-574's role half) and the side refusal "diagonal AB".
 *
 * Every lock calls the real pre-LLM decision; the model is mocked and never asked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function run(lines: string[], locale: 'he' | 'en'): Promise<Verdict2D[]> {
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
const cmdsOf = (v: Verdict2D): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
/** the segments a verdict draws, as sorted pairs; `*` marks a diagonal claim */
const segs = (v: Verdict2D) =>
  cmdsOf(v).flatMap((c) => (c.type === 'segment' ? [`${[c.a, c.b].sort().join('')}${c.diagonal ? '*' : ''}`] : [])).sort();
/** the segments the replayed figure holds */
const drawn = () =>
  replay(st().facts, st().seed).construction.objects.flatMap((o) => (o.kind === 'segment' ? [[o.a, o.b].sort().join('')] : []));

describe('#1742 — a singular diagonal is ONE diagonal, the English as the Hebrew', () => {
  const SHAPES: [string, string][] = [
    ['parallelogram ABCD', 'מקבילית ABCD'],
    ['rectangle ABCD', 'מלבן ABCD'],
    ['square ABCD', 'ריבוע ABCD'],
    ['quadrilateral ABCD', 'מרובע ABCD'],
  ];
  for (const [en, he] of SHAPES) {
    for (const [line, locale, shape] of [
      ['diagonal AC', 'en', en],
      ['the diagonal AC', 'en', en],
      ['diagonal BD', 'en', en],
      ['האלכסון AC', 'he', he],
      ['אלכסון BD', 'he', he],
    ] as const) {
      it(`${shape} → «${line}» draws that diagonal only`, async () => {
        const [, v] = await run([shape, line], locale);
        expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
        const pair = line.slice(-2);
        expect(segs(v)).toEqual([`${pair}*`]);
        const other = pair === 'AC' ? 'BD' : 'AC';
        expect(drawn()).toContain(pair);
        expect(drawn(), `${other} was never asked for`).not.toContain(other);
      });
    }
  }

  it('the composed length (ADR-574): "diagonal AC = 8" draws AC with its length, and not BD', async () => {
    const [, v] = await run(['parallelogram ABCD', 'diagonal AC = 8'], 'en');
    expect(v.kind).toBe('commit');
    expect(segs(v)).toEqual(['AC*']);
    expect(cmdsOf(v).some((c) => c.type === 'set-distance' && c.value === 8)).toBe(true);
  });

  it('the claim is still checked: "diagonal AB" on a parallelogram is refused naming the side, in both languages', async () => {
    for (const [lines, locale] of [
      [['parallelogram ABCD', 'diagonal AB'], 'en'],
      [['parallelogram ABCD', 'the diagonal AB is 8'], 'en'],
      [['מקבילית ABCD', 'האלכסון AB'], 'he'],
    ] as const) {
      const vs = await run([...lines], locale);
      const v = vs[vs.length - 1];
      expect(v.kind).toBe('refuse');
      expect(JSON.stringify(v)).toMatch(/AB is not a diagonal of ABCD — it is a side/);
    }
  });
});

describe('#1742 — the PLURAL still draws both (controls)', () => {
  for (const [lines, locale] of [
    [['parallelogram ABCD', 'the diagonals'], 'en'],
    [['parallelogram ABCD', 'diagonals of ABCD'], 'en'],
    [['מקבילית ABCD', 'האלכסונים'], 'he'],
  ] as const) {
    it(`«${lines[1]}» draws AC and BD`, async () => {
      const [, v] = await run([...lines], locale);
      expect(v.kind).toBe('commit');
      expect(segs(v).map((s) => s.replace('*', ''))).toEqual(['AC', 'BD']);
    });
  }
  it('"diagonals AC and BD" draws both, each with its claim', async () => {
    const [, v] = await run(['parallelogram ABCD', 'diagonals AC and BD'], 'en');
    expect(segs(v)).toEqual(['AC*', 'BD*']);
  });
});

describe('#1742 — a singular with no pair names no diagonal: the English reads as the Hebrew', () => {
  it('"the diagonal of ABCD" gets the verdict «האלכסון של ABCD» gets, and never draws both', async () => {
    const [, en] = await run(['parallelogram ABCD', 'the diagonal of ABCD'], 'en');
    const [, he] = await run(['מקבילית ABCD', 'האלכסון של ABCD'], 'he');
    expect(en.kind).toBe(he.kind);
    expect(segs(en)).toEqual([]);
  });
});
