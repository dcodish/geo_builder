/**
 * V0 engine tests (docs/20 §9): Vec3 math, the command reducer, seeded evaluation,
 * free-DOF sampling, and the first-class STABILITY regression (adding a fact must
 * not move existing points).
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { evaluate3 } from '../evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../types';
import { cross3, dist3, dot3, lerp3, norm3, sub3, v3 } from '../vec3';

const CUBE_IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];
const PRISM_IDS = ['A', 'B', 'C', "A'", "B'", "C'"];

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

describe('vec3', () => {
  it('dot / norm / cross basics', () => {
    expect(dot3(v3(1, 0, 0), v3(0, 1, 0))).toBe(0);
    expect(norm3(v3(3, 4, 0))).toBeCloseTo(5, 12);
    // right-handed: x × y = z (internal-only device — never student-facing)
    expect(cross3(v3(1, 0, 0), v3(0, 1, 0))).toEqual(v3(0, 0, 1));
  });

  it('lerp3 hits the midpoint at t = ½', () => {
    expect(lerp3(v3(0, 0, 0), v3(2, 4, 6), 0.5)).toEqual(v3(1, 2, 3));
  });
});

describe('apply — solids', () => {
  it('cube: 8 points, 12 edges, 6 faces', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    expect(c.points.size).toBe(8);
    expect(c.solids[0].edges).toHaveLength(12);
    expect(c.solids[0].faces).toHaveLength(6);
  });

  it('prism3: 6 points, 9 edges, 5 faces', () => {
    const c = build({ type: 'solid', kind: 'prism3', ids: PRISM_IDS });
    expect(c.points.size).toBe(6);
    expect(c.solids[0].edges).toHaveLength(9);
    expect(c.solids[0].faces).toHaveLength(5);
  });

  it('re-using a taken id is refused (already-defined)', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const r = applyCommand3(c, { type: 'solid', kind: 'cube', ids: CUBE_IDS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ code: 'already-defined', id: 'A' });
  });

  it('wrong vertex count is refused (bad-solid)', () => {
    const r = applyCommand3(emptyConstruction3(), { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad-solid');
  });

  it('on-segment needs existing parents and a fresh id', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const missing = applyCommand3(c, { type: 'point-on-segment3', id: 'M', a: 'X', b: 'B' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toEqual({ code: 'unknown-point', id: 'X' });
    const taken = applyCommand3(c, { type: 'point-on-segment3', id: 'A', a: 'B', b: 'C' });
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error).toEqual({ code: 'already-defined', id: 'A' });
  });
});

describe('evaluate — solids', () => {
  it('cube: every edge has length 1 and meets its neighbours at right angles', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const pos = evaluate3(c, 0);
    for (const [a, b] of c.solids[0].edges) {
      expect(dist3(pos.get(a)!, pos.get(b)!)).toBeCloseTo(1, 12);
    }
    const A = pos.get('A')!;
    const ab = sub3(pos.get('B')!, A);
    const ad = sub3(pos.get('D')!, A);
    const aa = sub3(pos.get("A'")!, A);
    expect(dot3(ab, ad)).toBeCloseTo(0, 12);
    expect(dot3(ab, aa)).toBeCloseTo(0, 12);
    expect(dot3(ad, aa)).toBeCloseTo(0, 12);
  });

  it('box: depth and height are FREE shape DOFs — not 1, and resampled by a new seed (ADR-052)', () => {
    const c = build({ type: 'solid', kind: 'box', ids: CUBE_IDS });
    const p0 = evaluate3(c, 0);
    const depth0 = dist3(p0.get('A')!, p0.get('D')!);
    const height0 = dist3(p0.get('A')!, p0.get("A'")!);
    expect(dist3(p0.get('A')!, p0.get('B')!)).toBeCloseTo(1, 12); // the scale gauge
    expect(depth0).not.toBeCloseTo(1, 2);
    const p1 = evaluate3(c, 1);
    expect(dist3(p1.get('A')!, p1.get('D')!)).not.toBeCloseTo(depth0, 4);
    expect(dist3(p1.get('A')!, p1.get("A'")!)).not.toBeCloseTo(height0, 4);
  });

  it('prism3: base in one plane, tops straight up by a shared height (a RIGHT prism)', () => {
    const c = build({ type: 'solid', kind: 'prism3', ids: PRISM_IDS });
    const pos = evaluate3(c, 0);
    const h = pos.get("A'")!.z - pos.get('A')!.z;
    expect(h).toBeGreaterThan(0);
    for (const base of ['A', 'B', 'C']) {
      expect(pos.get(base)!.z).toBe(0);
      expect(pos.get(`${base}'`)!.z).toBeCloseTo(h, 12);
      expect(pos.get(`${base}'`)!.x).toBeCloseTo(pos.get(base)!.x, 12);
      expect(pos.get(`${base}'`)!.y).toBeCloseTo(pos.get(base)!.y, 12);
    }
    // the base triangle is non-degenerate
    expect(norm3(cross3(sub3(pos.get('B')!, pos.get('A')!), sub3(pos.get('C')!, pos.get('A')!)))).toBeGreaterThan(0.1);
  });
});

describe('evaluate — on-segment points', () => {
  it('midpoint (t = ½) is exact', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 },
    );
    const pos = evaluate3(c, 0);
    expect(dist3(pos.get('M')!, pos.get('B')!)).toBeCloseTo(dist3(pos.get('M')!, pos.get("B'")!), 12);
  });

  it('the stated ratio AK = 2·KA′ holds exactly (t = ⅔)', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 },
    );
    const pos = evaluate3(c, 0);
    expect(dist3(pos.get('K')!, pos.get('A')!)).toBeCloseTo(2 * dist3(pos.get('K')!, pos.get("A'")!), 12);
  });

  it('an UNSTATED t is a free DOF: interior, and resampled by a new seed', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'P', a: 'A', b: 'B' },
    );
    const t = (seed: number) => {
      const pos = evaluate3(c, seed);
      return dist3(pos.get('P')!, pos.get('A')!) / dist3(pos.get('B')!, pos.get('A')!);
    };
    expect(t(0)).toBeGreaterThan(0.05);
    expect(t(0)).toBeLessThan(0.95);
    expect(t(1)).not.toBeCloseTo(t(0), 4);
  });
});

describe('stability (first-class regression)', () => {
  it('adding a fact never moves existing points — same seed, same samples', () => {
    const before = build({ type: 'solid', kind: 'box', ids: CUBE_IDS });
    const after = build(
      { type: 'solid', kind: 'box', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 },
      { type: 'point-on-segment3', id: 'P', a: 'A', b: 'B' },
    );
    const p0 = evaluate3(before, 7);
    const p1 = evaluate3(after, 7);
    for (const id of CUBE_IDS) {
      expect(p1.get(id)).toEqual(p0.get(id));
    }
  });
});
