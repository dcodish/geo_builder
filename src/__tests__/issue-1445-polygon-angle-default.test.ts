/**
 * #1445 ([ADR-590](../../docs/06-decisions.md#adr-590), operator ruling 2026-09-27) — «זווית B» in a triangle
 * means the TRIANGLE's angle, said aloud, however many cevians leave B.
 *
 * Measured at pickup (9d1b0b1f, the real `decideDeterministic2D`): «משולש ABC · זווית B = 2 זווית C» committed,
 * and so did the same line after «D על AC». After ANY cevian at B («BD חוצה זווית B», «BD גובה», «BD תיכון»,
 * or the segment «BD») it was refused «יש יותר מזווית אחת בקודקוד B…» — and so were «זווית B = 30», «B = 30»,
 * «זווית B = זווית C», «זווית B חדה», «זווית B = α», «זווית B + זווית C = 100» and «BE חוצה זווית B».
 *
 * The ruling: a vertex of exactly ONE declared polygon names that polygon's interior angle and the tool says
 * «הובן כ-∠ABC»; with 0 or ≥ 2 polygons at the vertex it still asks — now LISTING the candidate angles. One
 * resolver (`resolveVertexAngle`) serves every lone-vertex site, so this table is the class, not one rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { parse } from '@/parser';
import type { ParseContext } from '@/parser/parse';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from './submit-gate';
import { ctxOf, factsOf } from './scenario-pipeline';
import i18n from '@/i18n';

type V = { x: number; y: number };
const deg = (a: V, v: V, b: V) => {
  const ux = a.x - v.x, uy = a.y - v.y, wx = b.x - v.x, wy = b.y - v.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decide(prefix: string[], line: string, lng: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, `the prefix «${prefix.join(' · ')}» builds`).toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lng);
  const note = 'note' in v && v.note && 'key' in v.note ? v.note : null;
  const text = note ? plain(i18n.t(note.key, { ...(note.params ?? {}), lng }) as string) : null;
  return { v, key: note?.key ?? null, params: note?.params as Record<string, unknown> | undefined, text };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const ctx = (steps: string[]) => ctxOf(factsOf(steps));
const CEVIAN_PREFIXES = [
  ['משולש ABC', 'BD חוצה זווית B'],
  ['משולש ABC', 'BD גובה'],
  ['משולש ABC', 'BD תיכון'],
  ['משולש ABC', 'D על AC', 'BD'],
];

describe('#1445 — the resolver, by edge count × declared polygons', () => {
  const hand = (neighbors: Record<string, string[]>, polygons: string[][] = []): ParseContext =>
    ({ points: ['A', 'B', 'C', 'D', 'E'], circles: [], circleMembers: [], neighbors, polygons }) as ParseContext;

  it('two edges, no polygon: the one angle there — unchanged, and NOT announced', () => {
    const r = parse('∠B = 40', hand({ B: ['A', 'C'] }));
    expect(r).toEqual({ ok: true, commands: expect.arrayContaining([{ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 }]) });
    expect(r.ok && r.angleReadings).toBeUndefined();
  });

  it('two edges in a triangle: the same angle, still not announced (there was never a choice)', () => {
    const r = parse('∠B = 40', ctx(['משולש ABC']));
    expect(r.ok && r.angleReadings).toBeUndefined();
  });

  it('three and four edges in ONE polygon: its interior angle, announced', () => {
    for (const nb of [['A', 'C', 'D'], ['A', 'C', 'D', 'E']]) {
      const r = parse('∠B = 40', hand({ B: nb }, [['A', 'B', 'C']]));
      if (!r.ok) throw new Error(JSON.stringify(r));
      expect(r.commands).toContainEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 });
      expect(r.angleReadings).toEqual(['ABC']);
    }
  });

  it('a shape stated twice is ONE shape', () => {
    const r = parse('∠B = 40', hand({ B: ['A', 'C', 'D'] }, [['A', 'B', 'C'], ['C', 'A', 'B']]));
    expect(r.ok && r.angleReadings).toEqual(['ABC']);
  });

  it('three edges and NO polygon: ambiguous, every pair listed', () => {
    expect(parse('∠B = 40', hand({ B: ['A', 'C', 'D'] }))).toEqual({ ok: false, reason: 'ambiguous-angle', vertex: 'B', options: ['ABC', 'ABD', 'CBD'] });
  });

  it('three edges and TWO polygons at the vertex (a sub-triangle): ambiguous, listed', () => {
    expect(parse('∠B = 40', hand({ B: ['A', 'C', 'D'] }, [['A', 'B', 'C'], ['A', 'B', 'D']]))).toMatchObject({ ok: false, reason: 'ambiguous-angle', vertex: 'B', options: ['ABC', 'ABD', 'CBD'] });
  });

  it('no edges: ambiguous with nothing to list (no arms yet)', () => {
    expect(parse('∠B = 40', hand({}))).toEqual({ ok: false, reason: 'ambiguous-angle', vertex: 'B' });
  });

  it('a straight pair the construction states (V rides that segment) is not offered', () => {
    // G on AD of square ABCD, joined to B, A and D: ∠AGD is a straight angle, not a candidate
    const r = parse('∠G = 40', ctx(['ריבוע ABCD', 'G על AD', 'BG', 'GA', 'GD']));
    if (r.ok || r.reason !== 'ambiguous-angle') throw new Error(JSON.stringify(r));
    expect(r.options).toHaveLength(2);
    expect(r.options!.every((o) => !(o.includes('A') && o.includes('D')))).toBe(true);
  });

  it('a quadrilateral with a diagonal: ∠A is the quadrilateral\'s angle', () => {
    const r = parse('זווית A = 80', ctx(['מרובע ABCD', 'אלכסון AC']));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.commands).toContainEqual(expect.objectContaining({ type: 'set-angle', vertex: 'A', value: 80 }));
    const sa = r.commands.find((c) => c.type === 'set-angle') as { ray1: string; ray2: string };
    expect(new Set([sa.ray1, sa.ray2])).toEqual(new Set(['B', 'D']));
  });

  it('the reading sink is per call: a later parse that read nothing reports nothing', () => {
    expect(parse('זווית B = 30', ctx(['משולש ABC', 'BD גובה'])).ok).toBe(true);
    const r = parse('זווית ABC = 30', ctx(['משולש ABC', 'BD גובה']));
    expect(r.ok && r.angleReadings).toBeUndefined();
  });
});

describe('#1445 — EVERY lone-vertex site reads the triangle\'s angle after a cevian at B', () => {
  const LINES: [string, (cmds: Record<string, unknown>[]) => boolean][] = [
    ['זווית B = 2 זווית C', (c) => c.some((x) => x.type === 'set-angle-ratio' && x.v1 === 'B' && new Set([x.a1, x.b1]).size === 2 && [x.a1, x.b1].every((y) => y === 'A' || y === 'C'))],
    ['זווית B = 30', (c) => c.some((x) => x.type === 'set-angle' && x.vertex === 'B' && x.value === 30 && [x.ray1, x.ray2].sort().join('') === 'AC')],
    ['B = 30', (c) => c.some((x) => x.type === 'set-angle' && x.vertex === 'B' && [x.ray1, x.ray2].sort().join('') === 'AC')],
    ['∠B = ∠C', (c) => c.some((x) => x.type === 'set-angle-ratio' && x.v1 === 'B' && [x.a1, x.b1].sort().join('') === 'AC')],
    ['זווית B חדה', (c) => c.some((x) => x.type === 'set-angle-acuteness' && x.vertex === 'B' && [x.ray1, x.ray2].sort().join('') === 'AC')],
    ['זווית B = α', (c) => c.some((x) => x.type === 'measure-angle' && x.vertex === 'B' && [x.ray1, x.ray2].sort().join('') === 'AC')],
    ['זווית B + זווית C = 100', (c) => c.some((x) => x.type === 'set-measure-sum' && (x.points as string[]).slice(0, 3).sort().join('') === 'ABC' && (x.points as string[])[1] === 'B')],
    ['BE חוצה זווית B', (c) => c.some((x) => x.type === 'bisector' && x.vertex === 'B' && [x.p, x.q].sort().join('') === 'AC')],
    ['BE חוצה זווית', (c) => c.some((x) => x.type === 'bisector' && x.vertex === 'B' && [x.p, x.q].sort().join('') === 'AC')],
    ['חוצה זוית B וחוצה זוית C נפגשים בנקודה O', (c) => c.some((x) => x.type === 'bisector' && x.vertex === 'B' && [x.p, x.q].sort().join('') === 'AC')],
  ];
  for (const prefix of CEVIAN_PREFIXES)
    it.each(LINES)(`after «${prefix.join(' · ')}»: «%s» lowers to ∠ABC and announces it`, (line, holds) => {
      const r = parse(line, ctx(prefix));
      if (!r.ok) throw new Error(`«${line}» ${JSON.stringify(r)}`);
      expect(holds(r.commands as unknown as Record<string, unknown>[]), JSON.stringify(r.commands)).toBe(true);
      expect(r.angleReadings).toEqual(['ABC']);
    });

  it('the bisector at the segment\'s FAR end reads the polygon\'s angle there too («BD חוצה זווית D» in a rhombus with a third edge at D)', () => {
    const r = parse('BD חוצה זווית D', ctx(['מעוין ABCD', 'E על AB', 'DE']));
    if (!r.ok) throw new Error(JSON.stringify(r));
    // B already exists, so the bisector is stated as two equal angles at D, between DB and the rhombus's sides
    const k = r.commands.find((c) => c.type === 'set-angle-ratio') as { v1: string; a1: string; b1: string; v2: string; a2: string; b2: string };
    expect([k.v1, k.v2]).toEqual(['D', 'D']);
    expect(new Set([k.a1, k.b1, k.a2, k.b2])).toEqual(new Set(['A', 'B', 'C']));
    expect(r.angleReadings).toHaveLength(1);
    expect([...r.angleReadings![0]].sort().join('')).toBe('ACD');
  });
});

describe('#1445 — through the real submit gate', () => {
  for (const prefix of CEVIAN_PREFIXES)
    it(`«${[...prefix, 'זווית B = 2 זווית C'].join(' · ')}» commits and says «הובן כ-∠ABC»`, async () => {
      const { v, key, params, text } = await decide(prefix, 'זווית B = 2 זווית C');
      expect(v.kind, JSON.stringify(v)).toBe('commit');
      expect(key).toBe('input.vertexAngleReadAs');
      expect(params).toEqual({ angles: '∠ABC' });
      expect(text).toContain('הובן כ-∠ABC');
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('without a cevian the line commits as before, with no announcement', async () => {
    const { v, key } = await decide(['משולש ABC'], 'זווית B = 2 זווית C');
    expect(v.kind).toBe('commit');
    expect(key).toBeNull();
  });

  it('the bare form keeps teaching its canonical spelling (which names the angle read)', async () => {
    const { v, key, params } = await decide(['משולש ABC', 'BD גובה'], 'B = 30');
    expect(v.kind).toBe('commit');
    expect(key).toBe('input.canonicalHint');
    expect(params).toEqual({ canonical: '∠ABC = 30' });
  });

  it('the English message says it too', async () => {
    const { text } = await decide(['משולש ABC', 'BD גובה'], 'angle B = 30', 'en');
    expect(text).toContain('Read as ∠ABC');
  });

  it('REFUSAL — two triangles at B (the cevian declared its own): asks, listing the candidates, never escalates', async () => {
    const { v, key, params, text } = await decide(['משולש ABC', 'D על AC', 'BD', 'משולש ABD'], 'זווית B = 30');
    expect(v.kind).toBe('refuse');
    expect(key).toBe('input.ambiguousAngleOptions');
    expect(params).toEqual({ vertex: 'B', options: '∠ABC, ∠ABD, ∠CBD', example: 'ABC' });
    expect(text).toContain('∠ABC, ∠ABD, ∠CBD');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('…and the line the refusal teaches builds (a taught remedy is a hypothesis)', async () => {
    const { v } = await decide(['משולש ABC', 'D על AC', 'BD', 'משולש ABD'], 'זווית B = 30');
    const example = v.kind === 'refuse' && 'key' in v.note ? (v.note.params as { example: string }).example : '';
    const taught = await decide(['משולש ABC', 'D על AC', 'BD', 'משולש ABD'], `∠${example} = 30`);
    expect(taught.v.kind, JSON.stringify(taught.v)).toBe('commit');
  });

  it('REFUSAL — no polygon at all (three loose segments at B): asks, listing them', async () => {
    const { v, key, params } = await decide(['AB', 'BC', 'BD'], 'זווית B = 30');
    expect(v.kind).toBe('refuse');
    expect(key).toBe('input.ambiguousAngleOptions');
    expect(String(params?.options).split(', ')).toHaveLength(3);
  });
});

describe('#1445 — the figure HOLDS ∠ABC = 2∠ACB with the bisector drawn', () => {
  it('at several seeds', () => {
    const facts = factsOf(['משולש ABC', 'BD חוצה זווית B', 'זווית B = 2 זווית C']);
    for (const seed of [0, 1, 2, 3, 5, 8]) {
      const P = replay(facts, seed).positions;
      const at = (k: string) => P.get(k)!;
      expect(deg(at('A'), at('B'), at('C')), `seed ${seed}`).toBeCloseTo(2 * deg(at('A'), at('C'), at('B')), 4);
      expect(deg(at('A'), at('B'), at('D')), `seed ${seed}: BD bisects`).toBeCloseTo(deg(at('D'), at('B'), at('C')), 4);
    }
  });
});
