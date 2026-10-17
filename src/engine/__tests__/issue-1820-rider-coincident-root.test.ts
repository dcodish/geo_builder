/**
 * #1820 ([ADR-725](../../../docs/06-decisions.md#adr-725)) — A RIDER'S COINCIDENT ROOT IS KEPT WHERE ITS CONSTRAINT IS DEFINED.
 *
 * Measured on `main` @ 688dfb96 through `decideDeterministic2D` → `commitVerdict` → `replay`: «משולש ABC · D על BC ·
 * שטח ABD = שטח ABC» (three spellings) and «BD = BC» were refused («cannot place D on segment BC …») while analytic built
 * them. Root cause: `solvedOnSegmentCandidates` dropped EVERY root that put the rider on a point its constraint references
 * — a filter written for the spurious sign-flip of a direction condition («CF ⟂ DF» at F = D) — so an area or length
 * equality whose one genuine root is D = C reported "no position". Fix: a coincident root is judged by whether the
 * constraint is DEFINED there (its residual is a number within tolerance, not the collapsed-ray NaN), and is used only when
 * the carrier offers no clean root. The figure then carries the coincidence and 2-D's existing notice names it.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { visibleCoincidences } from '@/render/pointDescriptions';
import { solvedOnSegmentCandidates } from '@/engine/solve';
import type { SolvedOnSegmentPoint, Vec } from '@/engine';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
type V = { kind: string };

async function play(lines: string[]): Promise<V[]> {
  st().clear();
  const out: V[] = [];
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as V;
    out.push(v);
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return out;
}
const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const banner = () =>
  visibleCoincidences(replay(st().facts, st().seed).coincidences).map(([a, b]) => i18n.getFixedT('he')('figure.converge', { a, b }).replace(/[⁦-⁩]/g, ''));

beforeEach(() => llmParseMock.mockReset());

describe('#1820 — the reported lines build with D on C and the coincidence notice', () => {
  const sentences = ['שטח ABD = שטח ABC', 'שטח משולש ABD = שטח משולש ABC', 'שטח המשולש ABD שווה לשטח המשולש ABC', 'BD = BC'];
  for (const s of sentences) {
    it(s, async () => {
      const v = await play(['משולש ABC', 'D על BC', s]);
      expect(v.at(-1)!.kind).toBe('commit');
      expect(llmParseMock).not.toHaveBeenCalled();
      const r = replay(st().facts, st().seed);
      expect(r.lastError).toBeFalsy();
      expect(d(r.positions.get('D')!, r.positions.get('C')!)).toBeLessThan(1e-9);
      expect(r.coincidences).toEqual([['C', 'D']]);
      expect(banner()).toEqual(['C ו-D נפלו על אותה נקודה.']);
    });
  }

  it('every configuration builds the same way (seeds 0–29)', async () => {
    for (const s of ['שטח ABD = שטח ABC', 'BD = BC']) {
      await play(['משולש ABC', 'D על BC', s]);
      for (let seed = 0; seed < 30; seed++) {
        const r = replay(st().facts, seed);
        expect(r.lastError, `${s} seed ${seed}`).toBeFalsy();
        expect(d(r.positions.get('D')!, r.positions.get('C')!), `${s} seed ${seed}`).toBeLessThan(1e-9);
      }
    }
  });

  // The same class in other rules (measured refused on 688dfb96 with «cannot place … on segment …»): a length equality on a
  // square's side, a right triangle's leg, and an angle equality whose rays stay defined at the coincidence.
  for (const [lines, rider, onto] of [
    [['ריבוע ABCD', 'G על AD', 'BG = BD'], 'G', 'D'],
    [['משולש ישר זווית ABC', 'זווית B = 90', 'E על BC', 'AE = AC'], 'E', 'C'],
    [['משולש ABC', 'D על BC', 'זווית BAD = זווית BAC'], 'D', 'C'],
  ] as [string[], string, string][]) {
    it(`the class: ${lines.join(' · ')} puts ${rider} on ${onto}, with the notice`, async () => {
      const v = await play(lines);
      expect(v.at(-1)!.kind).toBe('commit');
      const r = replay(st().facts, st().seed);
      expect(r.lastError).toBeFalsy();
      expect(d(r.positions.get(rider)!, r.positions.get(onto)!)).toBeLessThan(1e-6);
      expect(r.coincidences).toEqual([[onto, rider].sort()]);
    });
  }

  it('an interior solution still wins: «שטח משולש ABD = 2 * שטח משולש ADC» puts D at 2/3 of BC, no notice', async () => {
    const v = await play(['משולש ABC', 'D על BC', 'שטח משולש ABD = 2 * שטח משולש ADC']);
    expect(v.at(-1)!.kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    const [B, C, D] = ['B', 'C', 'D'].map((k) => r.positions.get(k)!);
    expect(d(B, D) / d(B, C)).toBeCloseTo(2 / 3, 6);
    expect(r.coincidences).toEqual([]);
  });
});

describe('#1820 — solvedOnSegmentCandidates, the well-definedness test', () => {
  const pos = new Map<string, Vec>([
    ['A', { x: 2, y: 4 }],
    ['B', { x: 6, y: 0 }],
    ['C', { x: 0, y: 0 }],
  ]);
  const rider = (constraint: SolvedOnSegmentPoint['constraint']): SolvedOnSegmentPoint => ({ kind: 'on-segment-solved', id: 'D', a: 'B', b: 'C', constraint, branch: 0 });

  it('an area equality keeps its root on the endpoint it references', () => {
    expect(solvedOnSegmentCandidates(rider({ type: 'area-ratio', ids1: ['A', 'B', 'D'], ids2: ['A', 'B', 'C'], k: 1 }), pos)).toEqual([1]);
  });

  it('a length equality keeps it too', () => {
    expect(solvedOnSegmentCandidates(rider({ type: 'equal', a: 'B', b: 'D', c: 'B', d: 'C' }), pos)).toEqual([1]);
  });

  it('a clean root wins over a coincident one: |AD| = |AC| gives the mirror of C, not C', () => {
    // A projects to (2,0) on BC, so |AD| = |AC| holds at D = C (t = 1) and at D = (4,0) (t = 1/3).
    const c = solvedOnSegmentCandidates(rider({ type: 'equal', a: 'A', b: 'D', c: 'A', d: 'C' }), pos) as number[];
    expect(c).toHaveLength(1);
    expect(c[0]).toBeCloseTo(1 / 3, 9);
  });

  it('a direction condition undefined at the coincidence is still dropped: AD ⟂ CD has no root on BC but C itself', () => {
    // dot(D−A, D−C) = 0 on BC: D = C (spurious — DC has no direction) and D = (2,0), the foot. Move A so the foot is off BC.
    const off = new Map(pos);
    off.set('A', { x: -3, y: 4 });
    expect(solvedOnSegmentCandidates(rider({ type: 'perpendicular', a: 'A', b: 'D', c: 'C', d: 'D' }), off)).toEqual([]);
  });

  it('…and when the foot is on the segment it is the one root', () => {
    const c = solvedOnSegmentCandidates(rider({ type: 'perpendicular', a: 'A', b: 'D', c: 'C', d: 'D' }), pos) as number[];
    expect(c).toHaveLength(1);
    expect(c[0]).toBeCloseTo(2 / 3, 9);
  });
});
