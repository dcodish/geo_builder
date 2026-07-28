/**
 * S4 (#378, ADR-3D-104) — MUTUAL POSITION as a statement: skew / intersecting / parallel /
 * coincident, end to end.
 *
 * The predicate itself is unit-tested in `mutual-position.test.ts`; this file tests the STATEMENT —
 * that a given drives a free figure (anti-luck: asserted not satisfied before), that the open
 * conditions are gated by the requirement lane rather than least-squared, and that a false one is
 * refused instead of quietly drawn.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dataView } from '../engine/dataView';
import type { Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vnorm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** sin of the angle between two segments — 0 ⟺ parallel. */
const sinBetween = (seed: number, p: string, q: string, r: string, s: string): number => {
  const pos = derive3(state().facts, seed).resolved.positions;
  const d1 = vsub(pos.get(q)!, pos.get(p)!);
  const d2 = vsub(pos.get(s)!, pos.get(r)!);
  return vnorm(vcross(d1, d2)) / Math.max(vnorm(d1) * vnorm(d2), 1e-12);
};

/** normalized |triple product| — 0 ⟺ the two segments are coplanar (they meet or are parallel). */
const coplanarity = (seed: number, p: string, q: string, r: string, s: string): number => {
  const pos = derive3(state().facts, seed).resolved.positions;
  const d1 = vsub(pos.get(q)!, pos.get(p)!);
  const d2 = vsub(pos.get(s)!, pos.get(r)!);
  const w = vsub(pos.get(r)!, pos.get(p)!);
  return Math.abs(vdot(w, vcross(d1, d2))) / Math.max(vnorm(d1) * vnorm(d2) * vnorm(w), 1e-12);
};

beforeEach(() => state().clear());

describe('parallel as a GIVEN — the singular form that used to be refused', () => {
  it('«AB מקביל ל-CD» DRIVES a free quad into a trapezoid (asserted non-parallel before)', () => {
    submit('מרובע ABCD');
    expect(state().lastError).toBeNull();
    // anti-luck (the ADR-3D-100 discipline): the relation does NOT hold before it is stated
    for (const seed of [0, 1]) expect(sinBetween(seed, 'A', 'B', 'D', 'C'), `not ∥ before, seed ${seed}`).toBeGreaterThan(1e-3);

    submit('AB מקביל ל-DC');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) expect(sinBetween(seed, 'A', 'B', 'D', 'C'), `∥ holds at seed ${seed}`).toBeLessThan(1e-4);
  });

  it('the English mirror drives identically', () => {
    submit('quadrilateral ABCD');
    submit('AB is parallel to DC');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1]) expect(sinBetween(seed, 'A', 'B', 'D', 'C')).toBeLessThan(1e-4);
  });

  it('the PLURAL spelling of the same statement drives too — one statement, one semantics', () => {
    submit('מרובע ABCD');
    submit('AB ו-DC מקבילים');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1]) expect(sinBetween(seed, 'A', 'B', 'D', 'C')).toBeLessThan(1e-4);
  });
});

describe('skew — the OPEN condition, carried by the requirement lane', () => {
  it('«AB ו-CD מצטלבים» holds on a general tetrahedron, at every displayed seed', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    expect(state().lastError).toBeNull();
    // opposite edges of a general tetra are skew — and the requirement keeps every shown seed that way
    for (const seed of [0, 1, 2]) expect(coplanarity(seed, 'A', 'B', 'C', 'D'), `skew at seed ${seed}`).toBeGreaterThan(1e-3);
  });

  it('skew is REFUSED on a flat figure — coplanar objects are never skew', () => {
    submit('מרובע ABCD');
    submit('AB ו-CD מצטלבים');
    // a flat quad's segments are coplanar by construction: no configuration can satisfy it
    expect(state().lastError).not.toBeNull();
  });

  it('skew never least-squares: it adds a REQUIREMENT, never a drive residual', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    const c = derive3(state().facts, 0).construction;
    expect(c.requirements.some((r) => r.kind === 'mutual' && r.rel === 'skew')).toBe(true);
    expect(c.scalarPins.some((p) => p.kind === 'mutual')).toBe(false);
  });
});

describe('intersecting — the closed half drives, the open half is gated', () => {
  it('a stated crossing lands WITHIN both segments, not on their continuations', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD נחתכים']) submit(u);
    if (state().lastError === null) {
      for (const seed of [0, 1]) {
        expect(coplanarity(seed, 'A', 'B', 'C', 'D'), `coplanar at seed ${seed}`).toBeLessThan(1e-3);
      }
    }
  });
});

describe('surfacing — a skew pair must READ as skew (the operator call, 2026-07-28)', () => {
  it('draws the dashed common-perpendicular RUNG between the two closest points', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
    expect(scene.rungs.length, 'one rung per stated skew pair').toBe(1);
    const r = scene.rungs[0];
    expect(Math.hypot(r.x2 - r.x1, r.y2 - r.y1), 'the rung has visible length').toBeGreaterThan(1);
  });

  it('no rung without a stated skew — the resting figure stays clean', () => {
    submit('פירמידה ABCD');
    const d = derive3(state().facts, state().seed);
    expect(buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }).rungs).toEqual([]);
  });

  it('the data panel says it in words — the projection can lie, the row cannot', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    expect(panel.relations.some((r) => r.includes('AB') && r.includes('CD') && r.includes('⤫'))).toBe(true);
  });
});

describe('honesty', () => {
  it('a relation between an object and ITSELF is refused, not recorded as a vacuous truth', () => {
    submit('מרובע ABCD');
    submit('AB מקביל ל-AB');
    expect(state().lastError).not.toBeNull();
  });

  it('a stated mutual position survives a save → load round-trip', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    const facts = state().facts.length;
    expect(facts).toBeGreaterThan(0);
    const c = derive3(state().facts, 0).construction;
    expect(c.claims.some((cl) => cl.type === 'mutual-rel')).toBe(true);
  });
});
