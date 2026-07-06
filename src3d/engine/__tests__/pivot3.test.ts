/**
 * V4 pivot tests — the coordinate injection on the two mixed corpus questions,
 * hand-worked oracles:
 *  2020: v=(10,−5,0), u=(5,5,−5), P(0,4,6) ⇒ K = P − (u+v)/5 = (−3,4,7); the
 *        prism height is NEVER injected — it must stay a free (seed-varied) DOF.
 *  2023: D(0,0,0), C(4,3,0), A(3,n,p) ⇒ A=(3,−4,0) uniquely; C' = (4,3,±5) —
 *        the ± is the mirror branch, selected by the sign given.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { verifyClaim } from '../claims';
import { resolve3 } from '../evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../types';
import { dist3 } from '../vec3';

function build(cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

const PRISM_2020: Command3[] = [
  { type: 'solid', kind: 'prism3', ids: ['A', 'B', 'C', "A'", "B'", "C'"] },
  { type: 'point-on-segment3', id: 'M', a: "B'", b: "C'", t: 0.5 },
  { type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 },
  { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
  { type: 'name-vector', name: 'v', from: 'K', to: 'C' },
  { type: 'name-vector', name: 'u', from: 'K', to: 'B' },
  { type: 'point-in-span', id: 'P', a: 'A', b: 'M', vecFrom: 'K', span: ['u', 'v'] },
  { type: 'inject-vector', name: 'v', x: 10, y: -5, z: 0 },
  { type: 'inject-vector', name: 'u', x: 5, y: 5, z: -5 },
  { type: 'point3', id: 'P', x: 0, y: 4, z: 6 }, // P EXISTS → an injection pin, not an error
];

describe('2020-Q2 ג — vector + point injection onto the prism', () => {
  it('the pivot converges and K lands exactly at (−3, 4, 7), at every seed', () => {
    const c = build(PRISM_2020);
    for (const seed of [0, 1, 2]) {
      const r = resolve3(c, seed);
      expect(r.pivot?.solutions).toBeGreaterThan(0);
      const K = r.positions.get('K')!;
      expect(K.x).toBeCloseTo(-3, 5);
      expect(K.y).toBeCloseTo(4, 5);
      expect(K.z).toBeCloseTo(7, 5);
      // the injected values themselves hold
      const [vv, uu] = [c.vectors.get('v')!, c.vectors.get('u')!];
      const vVec = r.positions.get(vv.to)!;
      const vFrom = r.positions.get(vv.from)!;
      expect(vVec.x - vFrom.x).toBeCloseTo(10, 5);
      const uVec = r.positions.get(uu.to)!;
      expect(uVec.y - r.positions.get(uu.from)!.y).toBeCloseTo(5, 5);
    }
  });

  it('the claims verify: K = (−3,4,7) and the plane KBC equation x+2y+3z−26=0', () => {
    const c = build(PRISM_2020);
    expect(verifyClaim({ type: 'coords-eq', id: 'K', x: -3, y: 4, z: 7 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'coords-eq', id: 'K', x: -3, y: 4, z: 6 }, c, 0)).toBe(false);
    expect(verifyClaim({ type: 'plane-eq', ids: ['K', 'B', 'C'], cx: 1, cy: 2, cz: 3, d: -26 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'plane-eq', ids: ['K', 'B', 'C'], cx: 1, cy: 2, cz: 3, d: -25 }, c, 0)).toBe(false);
  });

  it('the prism height was never injected — it stays a FREE DOF, varied by the seed (ADR-052)', () => {
    const c = build(PRISM_2020);
    const h = (seed: number) => {
      const r = resolve3(c, seed);
      return dist3(r.positions.get('A')!, r.positions.get("A'")!);
    };
    expect(Math.abs(h(0) - h(1))).toBeGreaterThan(1e-4);
  });

  it('an impossible injection refuses (no placement exists)', () => {
    // |u| forced to disagree with itself via a contradictory K pin: K must equal P−(u+v)/5=(−3,4,7)
    const c = build([...PRISM_2020, { type: 'point3', id: 'K', x: 0, y: 0, z: 0 }]);
    expect(resolve3(c, 0).pivot).toMatchObject({ solutions: 0 });
  });
});

const CUBE_2023: Command3[] = [
  { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] },
  { type: 'point3', id: 'D', x: 0, y: 0, z: 0 },
  { type: 'point3', id: 'C', x: 4, y: 3, z: 0 },
  { type: 'point3', id: 'A', x: 3, y: null, z: null }, // A(3, n, p) — only x constrains
];

describe('2023-Q2 ג — partial injection + the sign branch', () => {
  it('A resolves uniquely to (3, −4, 0); the sign given selects C′ = (4, 3, 5)', () => {
    const c = build([...CUBE_2023, { type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    const r = resolve3(c, 0);
    expect(r.pivot?.solutions).toBeGreaterThan(0);
    const A = r.positions.get('A')!;
    expect(A.x).toBeCloseTo(3, 6);
    expect(A.y).toBeCloseTo(-4, 6);
    expect(A.z).toBeCloseTo(0, 6);
    const C2 = r.positions.get("C'")!;
    expect(C2.x).toBeCloseTo(4, 6);
    expect(C2.y).toBeCloseTo(3, 6);
    expect(C2.z).toBeCloseTo(5, 6);
    expect(verifyClaim({ type: 'coords-eq', id: 'A', x: 3, y: -4, z: 0 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'coords-eq', id: "C'", x: 4, y: 3, z: 5 }, c, 0)).toBe(true);
  });

  it('WITHOUT the sign given, the seed cycles the two mirror branches (C′.z = ±5)', () => {
    const c = build(CUBE_2023);
    const z = (seed: number) => resolve3(c, seed).positions.get("C'")!.z;
    const signs = new Set([Math.sign(z(0)), Math.sign(z(1))]);
    expect(signs).toEqual(new Set([1, -1]));
    expect(Math.abs(z(0))).toBeCloseTo(5, 5);
  });

  it('the ד intersection line through point-planes: ℓ = plane BC′D ∩ plane BCC′B′, dir ∥ BC′', () => {
    const c = build([
      ...CUBE_2023,
      { type: 'sign-given', id: "C'", axis: 'z', positive: true },
      { type: 'plane-through', name: "BC'D", ids: ['B', "C'", 'D'] },
      { type: 'plane-through', name: "BCC'B'", ids: ['B', 'C', "C'", "B'"] },
      { type: 'plane-plane-line', name: 'ℓ', p1: "BC'D", p2: "BCC'B'" },
    ]);
    const r = resolve3(c, 0);
    const ln = r.lines.get('ℓ')!;
    // both planes contain B=(7,−1,0) and C'=(4,3,5) → dir ∥ (−3,4,5)
    const k = ln.dir.x / -3;
    expect(ln.dir.y).toBeCloseTo(4 * k, 5);
    expect(ln.dir.z).toBeCloseTo(5 * k, 5);
  });
});
