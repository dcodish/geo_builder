/**
 * S3 (#378, ADR-3D-105) — PLANE relations: ⟂ / ∥ / a stated angle / coincident, wherever a plane is
 * one of the sides.
 *
 * The geometry all comes from one function (`relDeviation`), whose whole content is that a relation
 * between two sides reads the same when the sides are the same TYPE and inverts when they are mixed.
 * These tests are about the STATEMENT: that it drives a free figure (anti-luck — asserted not
 * satisfied before), that a false one refuses instead of drawing, and that both locales agree.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { relDeviation } from '../engine/operands';
import { scalePinned } from '../engine/solve3';
import { newellNormal, type Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** The normal of a point-run plane at a given seed. */
const normalOf = (seed: number, ids: string[]): Vec3 => {
  const pos = derive3(state().facts, seed).resolved.positions;
  return newellNormal(ids.map((id) => pos.get(id)!));
};

/** Deviation of a stated relation between two point-run planes, at a seed. */
const planeDev = (seed: number, rel: 'perp' | 'parallel' | 'angle', a: string[], b: string[], deg?: number): number =>
  relDeviation(rel, deg, { normal: normalOf(seed, a) }, { normal: normalOf(seed, b) })!;

beforeEach(() => state().clear());

describe('plane ∥ plane', () => {
  it('verifies when it holds — a box\'s opposite faces', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", "המישור ABC מקביל למישור A'B'C'"]) submit(u);
    expect(state().lastError).toBeNull();
  });

  it('REFUSES when it does not — adjacent faces are not parallel', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", "המישור ABC מקביל למישור ABB'"]) submit(u);
    expect(state().lastError).not.toBeNull();
  });

  it('the English mirror behaves identically', () => {
    for (const u of ["box ABCDA'B'C'D'", "plane ABC is parallel to plane A'B'C'"]) submit(u);
    expect(state().lastError).toBeNull();
  });
});

describe('plane ⟂ plane — DRIVES a free figure', () => {
  it('«המישור ABC מאונך למישור ABD» flexes a free tetrahedron (asserted non-⟂ before)', () => {
    submit('פירמידה משולשת ABCD');
    expect(state().lastError).toBeNull();
    // anti-luck: the relation does NOT hold before it is stated
    for (const seed of [0, 1]) expect(planeDev(seed, 'perp', ['A', 'B', 'C'], ['A', 'B', 'D']), `not ⟂ before, seed ${seed}`).toBeGreaterThan(1e-3);

    submit('המישור ABC מאונך למישור ABD');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) expect(planeDev(seed, 'perp', ['A', 'B', 'C'], ['A', 'B', 'D']), `⟂ holds at seed ${seed}`).toBeLessThan(1e-4);
  });
});

describe('a stated ANGLE between planes', () => {
  it('drives a free tetrahedron to 60° (asserted otherwise before)', () => {
    submit('פירמידה משולשת ABCD');
    for (const seed of [0, 1]) expect(planeDev(seed, 'angle', ['A', 'B', 'C'], ['A', 'B', 'D'], 60), `not 60 before, seed ${seed}`).toBeGreaterThan(1e-3);
    submit('הזווית בין המישור ABC לבין המישור ABD היא 60');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) expect(planeDev(seed, 'angle', ['A', 'B', 'C'], ['A', 'B', 'D'], 60), `60° at seed ${seed}`).toBeLessThan(1e-4);
  });

  it('the English mirror drives identically', () => {
    for (const u of ['tetrahedron ABCD', 'the angle between plane ABC and plane ABD is 60']) submit(u);
    expect(state().lastError).toBeNull();
    expect(planeDev(0, 'angle', ['A', 'B', 'C'], ['A', 'B', 'D'], 60)).toBeLessThan(1e-4);
  });
});

describe('two EQUATION planes — the absolute×absolute lane is a claim', () => {
  it('verifies a true ∥', () => {
    for (const u of ['המישור π1: z = 0', 'המישור π2: z - 3 = 0', 'π1 מקביל ל-π2']) submit(u);
    expect(state().lastError).toBeNull();
  });

  it('refuses a false ⟂ instead of drawing it', () => {
    for (const u of ['המישור π1: z = 0', 'המישור π2: z - 3 = 0', 'π1 ניצב ל-π2']) submit(u);
    expect(state().lastError).not.toBeNull();
  });
});

describe('coincident planes', () => {
  it('two runs naming the SAME plane coincide — a box\'s base', () => {
    // A, B, C, D are all base vertices, so ABC and ABD are one plane
    for (const u of ["תיבה ABCDA'B'C'D'", 'המישור ABC מתלכד עם המישור ABD']) submit(u);
    expect(state().lastError).toBeNull();
  });

  it('…and a genuinely different plane is refused', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", "המישור ABC מתלכד עם המישור A'B'C'"]) submit(u);
    expect(state().lastError).not.toBeNull();
  });
});

describe('the relation is similarity-INVARIANT — it must not pin the scale', () => {
  it('a plane relation alone leaves the scale free (the S4 lesson, re-checked for this pin)', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המישור ABC מאונך למישור ABD']) submit(u);
    expect(scalePinned(derive3(state().facts, 0).construction)).toBe(false);
  });
});

describe('honesty', () => {
  it('a plane related to ITSELF is refused, not recorded as a vacuous truth', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המישור ABC מקביל למישור ABC']) submit(u);
    expect(state().lastError).not.toBeNull();
  });

  it('a stated plane relation materialises its point-run carrier, so the patch can be drawn (#383)', () => {
    for (const u of ['פירמידה משולשת ABCD', 'המישור ABC מאונך למישור ABD']) submit(u);
    const c = derive3(state().facts, state().seed).construction;
    expect(c.pointPlanes.has('ABC'), 'ABC exists as a plane').toBe(true);
    expect(c.pointPlanes.has('ABD'), 'ABD exists as a plane').toBe(true);
  });
});

describe('relDeviation — the one rule the whole matrix follows', () => {
  const xDir = { dir: { x: 1, y: 0, z: 0 } };
  const yDir = { dir: { x: 0, y: 1, z: 0 } };
  const zPlane = { normal: { x: 0, y: 0, z: 1 } }; // the z = 0 plane
  const xPlane = { normal: { x: 1, y: 0, z: 0 } };

  it('same-type sides read alike: two ⟂ directions and two ⟂ normals both satisfy ⟂', () => {
    expect(relDeviation('perp', undefined, xDir, yDir)!).toBeLessThan(1e-12);
    expect(relDeviation('perp', undefined, zPlane, xPlane)!).toBeLessThan(1e-12);
  });

  it('a MIXED pair inverts: a direction lying IN a plane is ∥ to it, not ⟂', () => {
    // x̂ lies in the z = 0 plane
    expect(relDeviation('parallel', undefined, xDir, zPlane)!).toBeLessThan(1e-12);
    expect(relDeviation('perp', undefined, xDir, zPlane)!).toBeGreaterThan(0.9);
    // …and a direction ALONG the normal is ⟂ to the plane
    expect(relDeviation('perp', undefined, { dir: { x: 0, y: 0, z: 1 } }, zPlane)!).toBeLessThan(1e-12);
  });

  it('the stated angle follows the same split (line↔plane uses sin β, the formula sheet form)', () => {
    // a direction at 30° above the z = 0 plane
    const d = { dir: { x: Math.cos(Math.PI / 6), y: 0, z: Math.sin(Math.PI / 6) } };
    expect(relDeviation('angle', 30, d, zPlane)!).toBeLessThan(1e-9);
    // between two PLANES the same 30° is the ordinary cosine of their normals
    const tilted = { normal: { x: Math.sin(Math.PI / 6), y: 0, z: Math.cos(Math.PI / 6) } };
    expect(relDeviation('angle', 30, zPlane, tilted)!).toBeLessThan(1e-9);
  });
});
