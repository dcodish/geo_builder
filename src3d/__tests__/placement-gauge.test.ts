/**
 * #367 (ADR-3D-095): a solid's placement is a GAUGE only while nothing in the figure is absolute.
 *
 * Operator report (2026-07-28, playing PR #356): `פירמידה משולשת ABCD` then `l1:x=t(0,m,2m-2)` drew the
 * line straight through vertex A, and "show another configuration" never separated them — "it seems that
 * A is hard coded at 0,0,0". It was: the canonical placement puts the first vertex at the origin and the
 * second along +x, and only the SHAPE dims were sampled, so a line through the origin passed through A in
 * every configuration. The figure asserted a coincidence the student never stated (ADR-052 / M4).
 *
 * The class is NOT "lines": it is "an unstated placement relative to an absolute-frame object is frozen".
 * Equation planes and coordinate points are the same case, so they are asserted here too.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { hasAbsoluteFrameObject } from '../engine/evaluate';
import type { Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** Distance from a point to the resolved line — the quantity the operator was looking at. */
const distToLine = (p: Vec3, anchor: Vec3, dir: Vec3): number => {
  const ap = { x: p.x - anchor.x, y: p.y - anchor.y, z: p.z - anchor.z };
  const dd = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
  const t = (ap.x * dir.x + ap.y * dir.y + ap.z * dir.z) / dd;
  return Math.hypot(ap.x - t * dir.x, ap.y - t * dir.y, ap.z - t * dir.z);
};

const at = (seed: number, id: string): Vec3 => derive3(state().facts, seed).resolved.positions.get(id)!;

describe('#367 — an unstated placement against an absolute object is sampled, not frozen', () => {
  beforeEach(() => state().clear());

  it("the operator's sequence: the line no longer passes through A, at any seed", () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    expect(state().lastError).toBeNull();

    for (let seed = 0; seed < 24; seed++) {
      const res = derive3(state().facts, seed).resolved;
      const line = res.lines.get('ℓ1')!;
      expect(line, 'the line resolves').toBeTruthy();
      for (const id of ['A', 'B', 'C', 'D']) {
        const d = distToLine(res.positions.get(id)!, line.anchor, line.dir);
        expect(d, `${id} clears ℓ1 at seed ${seed}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('A is no longer pinned at the origin, and the placement genuinely varies', () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    const seen = [0, 1, 2, 3, 4, 5].map((s) => at(s, 'A'));
    for (const A of seen) {
      expect(Math.hypot(A.x, A.y, A.z), 'A is off the origin').toBeGreaterThan(1e-6);
    }
    // distinct placements, not one value repeated
    const distinct = new Set(seen.map((A) => `${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`));
    expect(distinct.size, 'the placement varies across configurations').toBeGreaterThan(3);
  });

  it('the shape is untouched — only the placement moved (a rigid motion)', () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    const edge = (seed: number, a: string, b: string): number => {
      const p = at(seed, a);
      const q = at(seed, b);
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    };
    // |AB| is the similarity gauge: identical at every seed. The placement must not have scaled it.
    expect(edge(0, 'A', 'B')).toBeCloseTo(edge(5, 'A', 'B'), 9);
    expect(edge(0, 'A', 'B')).toBeCloseTo(1, 9);
  });

  it('WITHOUT an absolute object the placement stays frozen (stability — the figure must not wander)', () => {
    submit('פירמידה משולשת ABCD');
    const A0 = at(0, 'A');
    const A3 = at(3, 'A');
    expect(A0.x).toBeCloseTo(0, 12);
    expect(A0.y).toBeCloseTo(0, 12);
    expect(A0.z).toBeCloseTo(0, 12);
    expect(A3.x).toBeCloseTo(0, 12);
    expect(at(0, 'B').x).toBeCloseTo(1, 12);
  });

  it('a PINNED figure is unaffected — the pivot owns the placement (no double placement)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('A(1,2,3)');
    expect(state().lastError).toBeNull();
    const A = at(0, 'A');
    expect(A.x).toBeCloseTo(1, 6);
    expect(A.y).toBeCloseTo(2, 6);
    expect(A.z).toBeCloseTo(3, 6);
  });

  describe('the class beyond the reported instance', () => {
    it('an EQUATION plane frames the figure the same way', () => {
      submit("תיבה ABCDA'B'C'D'");
      submit('המישור π1: z - 3 = 0');
      expect(state().lastError).toBeNull();
      const seen = [0, 1, 2, 3].map((s) => at(s, 'A'));
      const distinct = new Set(seen.map((A) => `${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`));
      expect(distinct.size, 'the box is placed differently against the plane each time').toBeGreaterThan(2);
    });

    it('the predicate answers ONE question for both consumers', () => {
      submit('פירמידה משולשת ABCD');
      const bare = derive3(state().facts, 0);
      expect(hasAbsoluteFrameObject(bare.construction)).toBe(false);
      submit('l1:x=t(0,m,2m-2)');
      const framed = derive3(state().facts, 0);
      expect(hasAbsoluteFrameObject(framed.construction), 'a parametric line IS an absolute frame').toBe(true);
    });
  });
});
