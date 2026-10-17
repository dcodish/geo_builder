/**
 * #2111 ([ADR-699](../../../docs/06-decisions.md#adr-699)) — «AB = r» · «r = 3» on a circle with no stated radius letter
 * gives the circle radius 3, with AB = r.
 *
 * Measured on `main` 4b0b4592 through the submit gate + `replay`: «מעגל O» · «A, B על מעגל O» · «AB = r» · «r = 3»
 * committed green with the circle at its free default 5 and |AB| = 3 (also with the value first, and «AB = 2r» gave
 * |AB| = 6 at radius 5). The reserved-letter fallback (ADR-071) let go of r the moment it had a value, so the value
 * landed on AB alone. Operator ruling 2026-10-15 (ADR-034 Am. 1 + ADR-071): the circle is drawn with radius 3.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
const dir = (p: P, a: string, b: string) => Math.atan2(p.get(b)!.y - p.get(a)!.y, p.get(b)!.x - p.get(a)!.x);

/** Drive the sequence, assert it all commits green and verified, and return the facts and the drawn figure. */
function build(lines: string[], seed?: number) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, seed ?? useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return { facts, fig };
}
const radius = (fig: ReturnType<typeof replay>, id = 'circle-O') => fig.circles.get(id)!.r;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const REPORTED = ['מעגל O', 'A, B על מעגל O', 'AB = r', 'r = 3'];

describe('#2111 — «r = 3» sizes the circle the reserved r names', () => {
  it('the reported sequence: radius 3, AB = 3, A and B on the circle', () => {
    const { fig } = build(REPORTED);
    expect(radius(fig)).toBeCloseTo(3, 6);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
    expect(len(fig.positions, 'O', 'A')).toBeCloseTo(3, 6);
    expect(len(fig.positions, 'O', 'B')).toBeCloseTo(3, 6);
  });

  it('the value typed before «AB = r»: the same figure', () => {
    const { fig } = build(['מעגל O', 'r = 3', 'A, B על מעגל O', 'AB = r']);
    expect(radius(fig)).toBeCloseTo(3, 6);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
  });

  it('«AB = 2r» · «r = 3»: radius 3, AB = 6 (a diameter)', () => {
    const { fig } = build(['מעגל O', 'A, B על מעגל O', 'AB = 2r', 'r = 3']);
    expect(radius(fig)).toBeCloseTo(3, 6);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(6, 6);
  });

  it('every seed of 24 draws radius 3 and AB = 3, verified (docs/17 §9 whole-rate)', () => {
    const { facts } = build(REPORTED);
    for (let seed = 0; seed < 24; seed++) {
      const fig = replay(facts, seed);
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      expect(fig.violations, `seed ${seed}`).toEqual([]);
      expect(radius(fig), `seed ${seed}`).toBeCloseTo(3, 6);
      expect(len(fig.positions, 'A', 'B'), `seed ${seed}`).toBeCloseTo(3, 6);
    }
  });

  it('stability: the centre stays put when «r = 3» lands, and the figure only rescales (A keeps its ray from O)', () => {
    const before = build(REPORTED.slice(0, 3)).fig;
    useGeoStore.getState().clear();
    const after = build(REPORTED).fig;
    const o0 = before.positions.get('O')!;
    const o1 = after.positions.get('O')!;
    expect(Math.hypot(o0.x - o1.x, o0.y - o1.y)).toBeLessThan(1e-6);
    expect(dir(after.positions, 'O', 'A')).toBeCloseTo(dir(before.positions, 'O', 'A'), 3);
  });

  describe('unchanged', () => {
    it('«AB = r» with no value: r is the radius, which stays free (ADR-071)', () => {
      const { fig } = build(REPORTED.slice(0, 3));
      expect(len(fig.positions, 'A', 'B')).toBeCloseTo(radius(fig), 6);
      const circle = fig.construction.objects.find((o) => o.id === 'circle-O') as unknown as { radius: { via: string } };
      expect(circle.radius.via).toBe('free');
    });

    it('the explicit «מעגל O ברדיוס r» (#2101): radius 3, AB = 3', () => {
      const { fig } = build(['מעגל O ברדיוס r', 'A, B על מעגל O', 'AB = r', 'r = 3']);
      expect(radius(fig)).toBeCloseTo(3, 6);
      expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
    });

    it('two circles: r keeps meaning the circle it meant before the value (O, which carries A and B)', () => {
      const { fig } = build(['מעגל O', 'מעגל P', 'A, B על מעגל O', 'AB = r', 'r = 3']);
      expect(radius(fig, 'circle-O')).toBeCloseTo(3, 6);
      expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
    });

    it('a circle with no point on it: nothing couples, AB = 3 and the circle keeps its free radius', () => {
      const { fig } = build(['מעגל O', 'משולש ABC', 'AB = r', 'r = 3']);
      expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
      const circle = fig.construction.objects.find((o) => o.id === 'circle-O') as unknown as { radius: { via: string } };
      expect(circle.radius.via).toBe('free');
    });
  });
});
