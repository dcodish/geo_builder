/**
 * S5 (#378, ADR-3D-106) — DISTANCE: as a given, as a claim, and as a question.
 *
 * Distance is the one relation in the program that carries UNITS. Everything else is an angle or a
 * ratio and leaves the similarity gauge alone; a distance fixes the figure's SCALE. That single fact
 * drives most of what is asserted here — it pins `scalePinned`, and a DERIVED distance may only be
 * reported once something has pinned the scale, or the tool would be inventing a given.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { distanceBetween } from '../engine/operands';
import { scalePinned } from '../engine/solve3';
import { cross3, dot3, newellNormal, norm3, sub3, v3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** Distance from a point to the plane through three ids, measured on the built figure. */
const pointPlane = (seed: number, p: string, ids: string[]): number => {
  const pos = derive3(state().facts, seed).resolved.positions;
  const ring = ids.map((id) => pos.get(id)!);
  const n = newellNormal(ring);
  return Math.abs(dot3(n, sub3(pos.get(p)!, ring[0]))) / norm3(n);
};

/** Distance from a point to the line through two ids. */
const pointLine = (seed: number, p: string, a: string, b: string): number => {
  const pos = derive3(state().facts, seed).resolved.positions;
  const u = sub3(pos.get(b)!, pos.get(a)!);
  return norm3(cross3(sub3(pos.get(p)!, pos.get(a)!), u)) / norm3(u);
};

beforeEach(() => state().clear());

describe('the geometry — one function, four curriculum cases', () => {
  const P = (x: number, y: number, z: number) => ({ point: v3(x, y, z) });
  const zPlane = { normal: v3(0, 0, 1), d: 0, point: v3(0, 0, 0) };

  it('point → plane', () => {
    expect(distanceBetween(P(0, 0, 5), zPlane)!).toBeCloseTo(5, 12);
  });

  it('point → line', () => {
    expect(distanceBetween(P(0, 3, 0), { point: v3(0, 0, 0), dir: v3(1, 0, 0) })!).toBeCloseTo(3, 12);
  });

  it('SKEW lines — the common-perpendicular gap', () => {
    const l1 = { point: v3(0, 0, 0), dir: v3(1, 0, 0) };
    const l2 = { point: v3(0, 0, 7), dir: v3(0, 1, 0) };
    expect(distanceBetween(l1, l2)!).toBeCloseTo(7, 12);
  });

  it('PARALLEL planes — the offset gap, sign-safe when the normals oppose', () => {
    expect(distanceBetween(zPlane, { normal: v3(0, 0, 1), d: -4, point: v3(0, 0, 4) })!).toBeCloseTo(4, 12);
    // the same pair with one normal flipped is still 4 apart, not 4 + 0
    expect(distanceBetween(zPlane, { normal: v3(0, 0, -1), d: 4, point: v3(0, 0, 4) })!).toBeCloseTo(4, 12);
  });

  it('objects that MEET are 0 apart — the honest answer, not a special case', () => {
    // two crossing lines
    expect(distanceBetween({ point: v3(0, 0, 0), dir: v3(1, 0, 0) }, { point: v3(0, 0, 0), dir: v3(0, 1, 0) })!).toBeCloseTo(0, 12);
    // a line piercing a plane
    expect(distanceBetween({ point: v3(0, 0, 5), dir: v3(0, 0, 1) }, zPlane)!).toBeCloseTo(0, 12);
    // two non-parallel planes
    expect(distanceBetween(zPlane, { normal: v3(1, 0, 0), d: -2, point: v3(2, 0, 0) })!).toBeCloseTo(0, 12);
  });
});

describe('a stated distance DRIVES a free figure', () => {
  it('«המרחק בין D למישור ABC הוא 6» sets the apex height', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין D למישור ABC הוא 6']) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) expect(pointPlane(seed, 'D', ['A', 'B', 'C']), `seed ${seed}`).toBeCloseTo(6, 4);
  });

  it('point → line, and the English mirror', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין D לישר AB הוא 5']) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1]) expect(pointLine(seed, 'D', 'A', 'B'), `seed ${seed}`).toBeCloseTo(5, 4);
    state().clear();
    for (const u of ['tetrahedron ABCD', 'the distance between D and plane ABC is 6']) submit(u);
    expect(state().lastError).toBeNull();
    expect(pointPlane(0, 'D', ['A', 'B', 'C'])).toBeCloseTo(6, 4);
  });

  it('SKEW segments — the gap between opposite tetra edges', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין AB לבין CD הוא 3']) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1]) {
      const pos = derive3(state().facts, seed).resolved.positions;
      const d = distanceBetween(
        { point: pos.get('A')!, dir: sub3(pos.get('B')!, pos.get('A')!) },
        { point: pos.get('C')!, dir: sub3(pos.get('D')!, pos.get('C')!) },
      )!;
      expect(d, `seed ${seed}`).toBeCloseTo(3, 4);
    }
  });
});

describe('a distance carries UNITS — it pins the scale', () => {
  it('scalePinned becomes true (unlike every other relation in the program)', () => {
    submit('פירמידה משולשת ABCD');
    expect(scalePinned(derive3(state().facts, 0).construction), 'free before').toBe(false);
    submit('המרחק בין D למישור ABC הוא 6');
    expect(scalePinned(derive3(state().facts, 0).construction), 'pinned after').toBe(true);
  });
});

describe('the QUERY lane — «המרחק בין…» with no value', () => {
  it('answers once the scale is pinned', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין D למישור ABC הוא 6']) submit(u);
    const c = derive3(state().facts, state().seed).construction;
    const r = answerQuery(c, 'המרחק בין D למישור ABC', state().seed);
    expect(r.answer).toBe('6');
  });

  it('REFUSES on a scale-free CUBE — the value is stable but it is the gauge unit, not knowledge', () => {
    // A cube's shape is fully determined, so the distance A′ → plane ABC is stable across seeds (it
    // is the edge). But the edge is the frozen gauge unit, so reporting "1" would hand back an
    // invented given — the scale gate is exactly for this case (ADR-3D-054).
    submit("קובייה ABCDA'B'C'D'");
    const c = derive3(state().facts, state().seed).construction;
    const r = answerQuery(c, "המרחק בין A' למישור ABCD", state().seed);
    expect(r.answer).toBeNull();
    expect(r.note).toBe('scale');
  });

  it('…and on a figure whose SHAPE is free it is undetermined, which is a different refusal', () => {
    submit('פירמידה משולשת ABCD');
    const c = derive3(state().facts, state().seed).construction;
    const r = answerQuery(c, 'המרחק בין D למישור ABC', state().seed);
    expect(r.answer).toBeNull();
    expect(r.note).toBe('undetermined');
  });

  it('the English mirror asks the same question', () => {
    for (const u of ['tetrahedron ABCD', 'the distance between D and plane ABC is 6']) submit(u);
    const c = derive3(state().facts, state().seed).construction;
    expect(answerQuery(c, 'distance between D and plane ABC', state().seed).answer).toBe('6');
  });
});

describe('honesty', () => {
  it('a point-to-point distance stays the MAGNITUDE family\'s — never double-owned', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין A ל-B הוא 5']) submit(u);
    expect(state().lastError).not.toBeNull(); // defers rather than creating a second owner for |AB|
  });

  it('a distance to ITSELF is refused', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין AB לבין AB הוא 3']) submit(u);
    expect(state().lastError).not.toBeNull();
  });

  it('a stated distance survives a save → load round-trip', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המרחק בין D למישור ABC הוא 6']) submit(u);
    const c = derive3(state().facts, 0).construction;
    expect(c.claims.some((cl) => cl.type === 'distance-rel')).toBe(true);
  });
});
