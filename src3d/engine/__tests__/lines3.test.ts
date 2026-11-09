/**
 * V3 engine tests — parameters in lines, on the 2024-Q2 oracles (worked by hand):
 * ℓ ⟂ π pins m = −5 (unique); A = ℓ∩π = (2, 0, −10); (5,−5,−9) lies ON ℓ;
 * dir·n = −m²+6m−15 has no real roots → never parallel.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { verifyClaim } from '../claims';
import { intersectPlanes, paramRoots, resolve3, type ResolvedPlane } from '../evaluate';
import { MUTUAL_VERIFY_TOL } from '../operands';
import { cross3, dot3, norm3, normalize3, scale3, v3, type Vec3 } from '../vec3';
import { emptyConstruction3, type Command3, type Construction3, type LinExpr } from '../types';

const e = (k: number, p = 0): LinExpr => ({ k, p });

const LINE: Command3 = {
  type: 'line3',
  name: 'ℓ',
  anchor: [e(-1), e(5), e(-11)],
  dir: [e(-1, 1), e(5, -1), e(-2)],
  src: 'x = (-1,5,-11) + t·(m-1, 5-m, -2)',
  param: 'm',
};
const PLANE: Command3 = {
  type: 'plane3',
  name: 'π',
  plane: { cx: e(3), cy: e(0, 1), cz: e(6, 1), d: e(4), src: '3x + my + (m+6)z + 4 = 0' },
  param: 'm',
};

function build(cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

describe('2024-Q2 (engine level)', () => {
  it('the ⟂ given pins m = −5, uniquely (minima-scan roots)', () => {
    const c = build([LINE, PLANE, { type: 'line-perp-plane', line: 'ℓ', plane: 'π' }]);
    expect(paramRoots(c)).toEqual([-5]);
    expect(resolve3(c, 0).param).toMatchObject({ name: 'm', value: -5, roots: [-5] });
  });

  it('the cut point lands exactly at A = (2, 0, −10)', () => {
    const c = build([
      LINE,
      PLANE,
      { type: 'line-perp-plane', line: 'ℓ', plane: 'π' },
      { type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π' },
    ]);
    const r = resolve3(c, 0);
    expect(r.positions.get('A')!.x).toBeCloseTo(2, 9);
    expect(r.positions.get('A')!.y).toBeCloseTo(0, 9);
    expect(r.positions.get('A')!.z).toBeCloseTo(-10, 9);
    expect(verifyClaim({ type: 'coords-eq', id: 'A', x: 2, y: 0, z: -10 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'coords-eq', id: 'A', x: 2, y: 0, z: -9 }, c, 0)).toBe(false);
  });

  it('never-parallel holds for the exam pair, and refutes when a parallel value exists', () => {
    const c = build([LINE, PLANE]);
    expect(verifyClaim({ type: 'never-parallel', line: 'ℓ', plane: 'π' }, c, 0)).toBe(true);
    // π2: my + z = 0 → dir·n = m(5−m) − 2, which has real roots → parallel happens
    const c2 = build([
      LINE,
      { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(0, 1), cz: e(1), d: e(0), src: 'my + z = 0' }, param: 'm' },
    ]);
    expect(verifyClaim({ type: 'never-parallel', line: 'ℓ', plane: 'π2' }, c2, 0)).toBe(false);
  });

  it('an unpinned line parameter is a sampled free DOF; the ⟂ given collapses it to the root', () => {
    const free = build([LINE, PLANE]);
    const v0 = resolve3(free, 0).param!.value;
    const v1 = resolve3(free, 1).param!.value;
    expect(v0).not.toBe(v1);
  });

  it('a parameter-free parallel line∩plane yields NO position (flagged upstream)', () => {
    const c = build([
      { type: 'line3', name: 'ℓ', anchor: [e(0), e(0), e(0)], dir: [e(1), e(0), e(0)], src: 'x = (0,0,0) + t·(1,0,0)' },
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
      { type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π1' },
    ]);
    expect(resolve3(c, 0).positions.has('A')).toBe(false);
  });
});

/**
 * #2707 (ADR-3D-445) — "two planes are parallel" is read at the figure's own verdict bar, relative to the normals'
 * size. The solver holds a stated ∥ to ~1e-6; read at an absolute 1e-10 on raw normals, such a pair "crossed" along
 * a line ~1e6 from the figure, the scene centred both patches on it and every point fell on one pixel.
 */
describe('#2707 — intersectPlanes: parallel at the verdict bar, scale-free', () => {
  /** A plane through `p` with normal `n` (unnormalised, as the resolver leaves it). */
  const plane = (n: Vec3, p: Vec3): ResolvedPlane => ({ n, d: -dot3(n, p) });
  /** The normal (0,0,1)·k tilted by `sin` about the x-axis. */
  const tilted = (sin: number, k = 1): Vec3 => scale3(v3(0, -sin, Math.sqrt(1 - sin * sin)), k);

  it('two planes the solver holds parallel (sin ≈ 1e-6, the measured seeds) have no crossing line', () => {
    for (const sin of [3e-7, 1.1e-6, 6.9e-6]) {
      expect(intersectPlanes(plane(v3(0, 3e-16, 1.24), v3(0, 0, 0)), plane(tilted(sin, -4.65), v3(0, 0, -0.93))), `sin ${sin}`).toBeNull();
    }
  });

  it('the verdict does not depend on how long the normals are (the old absolute bar did)', () => {
    const sin = MUTUAL_VERIFY_TOL / 2;
    for (const k of [1e-3, 1, 1e3]) {
      expect(intersectPlanes(plane(v3(0, 0, k), v3(0, 0, 0)), plane(tilted(sin, k), v3(0, 0, 1))), `k ${k}`).toBeNull();
    }
    const big = intersectPlanes(plane(v3(0, 0, 1e-3), v3(0, 0, 0)), plane(tilted(2 * MUTUAL_VERIFY_TOL, 1e-3), v3(0, 0, 1)));
    expect(big).not.toBeNull();
  });

  it('a real crossing (1°) keeps its fold line, and the line lies on both planes', () => {
    const a = plane(v3(0, 0, 2), v3(1, 2, 0));
    const b = plane(tilted(Math.sin(Math.PI / 180), 5), v3(0, 0, 1));
    const line = intersectPlanes(a, b)!;
    expect(line).not.toBeNull();
    expect(norm3(cross3(normalize3(line.dir), v3(1, 0, 0)))).toBeLessThan(1e-9);
    for (const pl of [a, b]) expect(Math.abs(dot3(pl.n, line.anchor) + pl.d) / norm3(pl.n)).toBeLessThan(1e-9);
  });

  it('a stated crossing line of two parallel planes resolves to NO line (never a far-away one)', () => {
    const c = build([
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(0), src: 'z = 0' } },
      { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(1e-6), cz: e(1), d: e(-1), src: '1e-6·y + z - 1 = 0' } },
      { type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' },
    ]);
    expect(resolve3(c, 0).lines.has('ℓ')).toBe(false);
  });
});
