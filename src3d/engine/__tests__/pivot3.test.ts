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
import { dimsFanStats, ssaFanStats } from '../solve3';
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

/**
 * #2714 (ADR-3D-447) — a DETERMINED flat triangle's other discrete root is reached from the found one.
 * SSA («AB = 5 · BC = 4 · ∠BAC = 40°») has two triangles, AC = 6.21 and AC = 1.45; before, every cold start's
 * apex sat in the sample box and AC = 6.21 was drawn at 48/48 seeds. The fan runs only on a shape the givens
 * determine: one-root givens keep one value and a free shape keeps its spread.
 */
describe('#2714 — a determined flat triangle with two roots pools both', () => {
  const tri: Command3 = { type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] };
  const len = (a: string, b: string, value: number): Command3 => ({ type: 'claim', claim: { type: 'length-eq', a, b, value } }) as Command3;
  const ang = (vertex: string, p: string, q: string, deg: number): Command3 =>
    ({ type: 'claim', claim: { type: 'vertex-angle-eq', vertex, p, q, deg } }) as Command3;
  const values = (cmds: Command3[], a: string, b: string, seeds = 48): Map<string, number> => {
    const c = build(cmds);
    const hist = new Map<string, number>();
    for (let s = 0; s < seeds; s++) {
      const p = resolve3(c, s).positions;
      const v = dist3(p.get(a)!, p.get(b)!).toFixed(2);
      hist.set(v, (hist.get(v) ?? 0) + 1);
    }
    return hist;
  };
  const twoRoots = (hist: Map<string, number>, r1: string, r2: string) => {
    expect([...hist.keys()].sort()).toEqual([r1, r2].sort());
    expect(hist.get(r1)!).toBeGreaterThanOrEqual(20);
    expect(hist.get(r2)!).toBeGreaterThanOrEqual(20);
  };

  it('the report, in all three entry orders: AC 6.21 and 1.45, each at ≥ 20 of 48 seeds', () => {
    const before = ssaFanStats.found;
    twoRoots(values([tri, len('A', 'B', 5), len('B', 'C', 4), ang('A', 'B', 'C', 40)], 'A', 'C'), '6.21', '1.45');
    twoRoots(values([tri, ang('A', 'B', 'C', 40), len('A', 'B', 5), len('B', 'C', 4)], 'A', 'C'), '6.21', '1.45');
    twoRoots(values([tri, len('B', 'C', 4), ang('A', 'B', 'C', 40), len('A', 'B', 5)], 'A', 'C'), '6.21', '1.45');
    expect(ssaFanStats.found, 'the fan ran and found the second root (docs/17 §9)').toBeGreaterThan(before);
  });

  it('consecutive configurations alternate the two triangles, the first drawing the one found before', () => {
    const c = build([tri, len('A', 'B', 5), len('B', 'C', 4), ang('A', 'B', 'C', 40)]);
    const seq = [0, 1, 2, 3, 4, 5].map((s) => {
      const p = resolve3(c, s).positions;
      return dist3(p.get('A')!, p.get('C')!).toFixed(2);
    });
    expect(seq).toEqual(['6.21', '1.45', '6.21', '1.45', '6.21', '1.45']);
  });

  it('the class: other SSA spellings and the angle at another vertex reach both triangles', () => {
    twoRoots(values([tri, len('A', 'B', 5), len('B', 'C', 3.5), ang('A', 'B', 'C', 40)], 'A', 'C'), '5.22', '2.44');
    twoRoots(values([tri, len('A', 'B', 7), len('B', 'C', 5), ang('A', 'B', 'C', 30)], 'A', 'C'), '9.63', '2.49');
    twoRoots(values([tri, len('A', 'B', 5), len('A', 'C', 4), ang('B', 'A', 'C', 40)], 'B', 'C'), '6.21', '1.45');
    twoRoots(values([tri, len('A', 'B', 4), len('B', 'C', 5), ang('C', 'A', 'B', 40)], 'A', 'C'), '6.21', '1.45');
  });

  it('givens with one triangle keep one value', () => {
    const one = (cmds: Command3[], a: string, b: string, v: string) => expect([...values(cmds, a, b, 24)]).toEqual([[v, 24]]);
    one([tri, len('A', 'B', 5), len('A', 'C', 4), ang('A', 'B', 'C', 40)], 'B', 'C', '3.22'); // SAS
    one([tri, len('A', 'B', 5), len('A', 'C', 4), len('B', 'C', 4)], 'B', 'C', '4.00'); // SSS
    one([tri, len('A', 'B', 4), len('B', 'C', 5), ang('A', 'B', 'C', 40)], 'A', 'C', '7.35'); // the longer side: one triangle
    one([tri, len('A', 'B', 5), len('B', 'C', 4), ang('C', 'A', 'B', 40)], 'A', 'C', '7.35'); // the other root's angles exceed 180°
    one([tri, len('A', 'B', 5), len('B', 'C', 2.5), ang('A', 'B', 'C', 30)], 'A', 'C', '4.33'); // tangent: the double root
  });

  it('a free triangle keeps its spread and never runs the fan', () => {
    const before = ssaFanStats.runs;
    const hist = values([tri, len('A', 'B', 5), len('B', 'C', 4)], 'A', 'C');
    expect(hist.size).toBeGreaterThanOrEqual(40);
    expect(ssaFanStats.runs).toBe(before);
  });
});

describe('#2814 — a determined shape\'s reflected dims root is pooled from the found one (ADR-3D-461)', () => {
  const D_SYM: Command3 = { type: 'point3', id: 'D', x: 3, y: null, z: 0, syms: [null, 'p', null], srcs: ['3', 'p', '0'] } as unknown as Command3;
  const UV: Command3 = {
    type: 'mag-rel', e1: [{ coeff: 1, atom: { kind: 'named', name: 'u' } }], e2: [{ coeff: 1, atom: { kind: 'named', name: 'v' } }], c: 1,
  } as unknown as Command3;
  const vec = (name: string, from: string, to: string): Command3[] =>
    [{ type: 'segment3', a: from, b: to }, { type: 'name-vector', name, from, to }] as Command3[];
  /** The operator's #827 exam pyramid, as its nine lines lower: p = ±4, no sign given. */
  const PYRAMID: Command3[] = [
    { type: 'solid', kind: 'pyramidPar', ids: ['A', 'B', 'C', 'D', 'S'] },
    { type: 'seg-plane-rel', rel: 'perp', a: 'S', b: 'A', plane: [] } as unknown as Command3,
    { type: 'point-on-segment3', id: 'M', a: 'B', b: 'D', t: 0.5 },
    ...vec('u', 'A', 'B'), ...vec('v', 'A', 'D'), ...vec('w', 'A', 'S'),
    { type: 'point3', id: 'A', x: 0, y: 0, z: 0 },
    { type: 'point3', id: 'B', x: 0, y: 5, z: 0 },
    { type: 'point3', id: 'S', x: 0, y: 0, z: 6 },
    D_SYM,
    UV,
  ];
  /** The same base with no height and no S: a free apex beside the discrete D. */
  const FREE_APEX: Command3[] = [
    { type: 'solid', kind: 'pyramidPar', ids: ['A', 'B', 'C', 'D', 'S'] },
    ...vec('u', 'A', 'B'), ...vec('v', 'A', 'D'),
    { type: 'point3', id: 'A', x: 0, y: 0, z: 0 },
    { type: 'point3', id: 'B', x: 0, y: 5, z: 0 },
    D_SYM,
    UV,
  ];
  const signsOfD = (c: Construction3, s: number): string[] => {
    const roots = resolve3(c, s).pivot?.pointRoots?.D ?? [resolve3(c, s).positions.get('D')!];
    return [...new Set(roots.map((q) => q.y.toFixed(2)))].sort();
  };

  it('the #827 pyramid: the pool carries D.y = +4 AND −4 at every seed 0–23, and the fan is what reached it', () => {
    const c = build(PYRAMID);
    const before = dimsFanStats.found;
    for (let s = 0; s < 24; s++) expect(signsOfD(c, s).join(' '), `seed ${s}`).toBe('-4.00 4.00');
    expect(dimsFanStats.found, 'the driven-dims fan ran and added the reflected root (docs/17 §9)').toBeGreaterThan(before);
  });

  it('the pick is over the two distinct configurations: seeds alternate the sign of p', () => {
    const c = build(PYRAMID);
    const ys = [0, 1, 2, 3, 4, 5].map((s) => resolve3(c, s).positions.get('D')!.y.toFixed(0));
    for (let s = 0; s < 6; s++) expect(resolve3(c, s).pivot?.solutions, `seed ${s}`).toBe(2);
    expect(new Set(ys.filter((_, i) => i % 2 === 0)).size).toBe(1);
    expect(new Set(ys.filter((_, i) => i % 2 === 1)).size).toBe(1);
    expect(ys[0]).not.toBe(ys[1]);
  });

  it('the free-apex variant: both signs pooled at every seed 0–23', () => {
    const c = build(FREE_APEX);
    for (let s = 0; s < 24; s++) expect(signsOfD(c, s).join(' '), `seed ${s}`).toBe('-4.00 4.00');
  });

  it('the continuum guard: a free side is never reflected into extra configurations, and stays the seed\'s sample', () => {
    // the first prototype (no "driven only" / "settle did not move" gate) drew AB = 20.08 on the rectangle
    const rect = build([
      { type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment3', a: 'A', b: 'D' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'D', value: 2 * Math.sqrt(7), src: '2√7' } },
    ] as Command3[]);
    const trap = build([
      { type: 'quad-shape', base: 'trapezoid', ids: ['A', 'B', 'C', 'D'] },
      { type: 'perp-to-base', from: 'A' },
      { type: 'segment3', a: 'A', b: 'E' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'E', value: 3 } },
    ] as Command3[]);
    const ab = new Set<string>();
    for (let s = 0; s < 24; s++) {
      for (const c of [rect, trap]) expect(resolve3(c, s).pivot?.solutions ?? 1, `seed ${s}`).toBeLessThanOrEqual(2);
      const p = resolve3(rect, s).positions;
      const v = dist3(p.get('A')!, p.get('B')!);
      expect(v, `seed ${s}: AB is a sampled side, not a far reflection`).toBeLessThan(15);
      ab.add(v.toFixed(2));
    }
    expect(ab.size, 'AB is still sampled per seed').toBeGreaterThanOrEqual(12);
  });

  it('a fixed vertex mirrored over a side, with a FREE vertex beside it, is the mirror pass figure: never pooled', () => {
    // measured: without the determined-points twin test the fan pooled C mirrored over AB on «מרובע ABCD · |AB| = 10 ·
    // |BC| = 9.99 · AC ⊥ BC» (D free), the pool grew 2 → 4 and the submit's seed search walked 9 → 36 (118 → 868 ms)
    const quad = build([
      { type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 10 } },
      { type: 'segment3', a: 'B', b: 'C' },
      { type: 'claim', claim: { type: 'length-eq', a: 'B', b: 'C', value: 9.99 } },
      { type: 'cos-angle', u: { kind: 'pair', from: 'A', to: 'C' }, v: { kind: 'pair', from: 'B', to: 'C' }, cos: 0 },
    ] as unknown as Command3[]);
    for (let s = 0; s < 8; s++) expect(resolve3(quad, s).pivot?.solutions ?? 1, `seed ${s}`).toBeLessThanOrEqual(2);
  });

  it('work count: a free figure pays nothing; a mirror twin (a rectangle turned over) is never solved', () => {
    const runs = dimsFanStats.runs, tries = dimsFanStats.tries;
    const free = build([{ type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'C', 'D'] }] as Command3[]);
    for (let s = 0; s < 6; s++) resolve3(free, s);
    expect(dimsFanStats.runs).toBe(runs);
    const det = build([
      { type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 1 } },
      { type: 'segment3', a: 'A', b: 'D' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'D', value: Math.sqrt(7) } },
    ] as Command3[]);
    const r0 = dimsFanStats.runs, t0 = dimsFanStats.tries;
    for (let s = 0; s < 6; s++) resolve3(det, s);
    // ≤ (driven dims + 1) starts per fan run; a congruent (mirror-twin) start costs no LM solve at all
    expect(dimsFanStats.tries - t0).toBeLessThanOrEqual(2 * (dimsFanStats.runs - r0));
    void tries;
  });
});
