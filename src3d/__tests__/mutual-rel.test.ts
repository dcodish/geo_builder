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
import { scalePinned } from '../engine/solve3';
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

describe('surfacing — the DATA PANEL says it, the canvas stays clean (operator, 2026-07-28)', () => {
  it('the canvas draws NO extra ink for a stated relation', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    const withRel = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
    state().clear();
    submit('פירמידה ABCD');
    const d0 = derive3(state().facts, state().seed);
    const without = buildScene3(d0.construction, d0.resolved, HOME_CAMERA, { width: 640, height: 460 });
    // the segments AB/CD are drawn by the statement; nothing ELSE appears — in particular no dashed
    // rung, since dashed already means HIDDEN in this renderer and would read as a hidden edge
    expect(Object.keys(withRel)).toEqual(Object.keys(without));
    expect(withRel.marks.length).toBe(without.marks.length);
    expect(withRel.seams.length).toBe(without.seams.length);
    expect(withRel.curves.length).toBe(without.curves.length);
  });

  it('the panel reports the STATED relation as a structured row (words are the App\'s to pick)', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    expect(panel.mutual).toContainEqual({ a: 'AB', b: 'CD', rel: 'skew' });
  });

  it('…and reports a relation the figure merely HOLDS, never stated', () => {
    // the operator's ask: "we should also be able to calc such cases and write them if figure holds
    // them". A cube's AB and CC′ are skew by construction — the student never says so.
    for (const u of ["תיבה ABCDA'B'C'D'", 'AB', "CC'"]) submit(u);
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    expect(panel.mutual.some((m) => m.rel === 'skew' && m.a === 'AB' && m.b === "CC'")).toBe(true);
  });

  it('derived PERPENDICULARITY between drawn segments is reported alongside the position', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", 'AB', "CC'"]) submit(u);
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    // AB and CC′ are skew AND perpendicular — both facts, so both rows
    expect(panel.mutual.some((m) => m.rel === 'perpendicular' && m.a === 'AB' && m.b === "CC'")).toBe(true);
  });

  it('a pair SHARING an endpoint is skipped — "they meet at B" is noise, not knowledge', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", 'AB', 'BC']) submit(u);
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    expect(panel.mutual.some((m) => (m.a === 'AB' && m.b === 'BC') || (m.a === 'BC' && m.b === 'AB'))).toBe(false);
  });
});

describe('a mutual relation is similarity-INVARIANT — it must not pin the scale', () => {
  it('«AB מקביל ל-DC» on a free quad reports NO magnitude (operator, 2026-07-28)', () => {
    // The regression this locks: `scalePinned` was an EXCLUSION list, so the new `mutual` pin
    // defaulted to "pins the scale" and the panel began printing `AB = 1` — a number that is pure
    // gauge (a figure's first dim is the frozen unit) and that the student was never given.
    for (const u of ['מרובע ABCD', 'AB מקביל ל-DC']) submit(u);
    expect(state().lastError).toBeNull();
    const panel = dataView(derive3(state().facts, state().seed).construction, state().seed);
    expect(panel.relations.filter((r) => /^\|[A-Z]/.test(r) && r.includes('=')), 'no invented magnitude').toEqual([]);
    expect(panel.vectors.every((v) => v.mag === null), 'no vector magnitude either').toBe(true);
  });

  it('scalePinned stays FALSE for a figure whose only given is a mutual relation', () => {
    for (const u of ['פירמידה ABCD', 'AB ו-CD מצטלבים']) submit(u);
    expect(scalePinned(derive3(state().facts, 0).construction)).toBe(false);
  });

  it('…and TRUE the moment a real size is stated — the predicate still works', () => {
    for (const u of ['מרובע ABCD', 'AB מקביל ל-DC', '|AB| = 3']) submit(u);
    expect(scalePinned(derive3(state().facts, 0).construction)).toBe(true);
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
