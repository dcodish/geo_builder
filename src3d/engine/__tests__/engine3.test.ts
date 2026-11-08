/**
 * V0 engine tests (docs/20 §9): Vec3 math, the command reducer, seeded evaluation,
 * free-DOF sampling, and the first-class STABILITY regression (adding a fact must
 * not move existing points).
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3, freeDims } from '../apply';
import { verifyClaim } from '../claims';
import { evaluate3, freeDofCount3, resolve3 } from '../evaluate';
import { pointParents3 } from '../carriers';
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

  it('re-declaring the SAME solid no-ops; a DIFFERENT solid on taken ids still refuses (#199, ADR-3D-047)', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    // same kind + same ids = a re-statement of the figure (M1) — idempotent, never a dead-end
    const same = applyCommand3(c, { type: 'solid', kind: 'cube', ids: CUBE_IDS });
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.next.solids).toHaveLength(1);
    // a conflicting overlap keeps the honest refusal
    const clash = applyCommand3(c, { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error).toEqual({ code: 'already-defined', id: 'A' });
  });

  it('wrong vertex count is refused (bad-solid)', () => {
    const r = applyCommand3(emptyConstruction3(), { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad-solid');
  });

  it('on-segment needs existing parents; an EXISTING id lowers to the M1 claim (#199, ADR-3D-047)', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const missing = applyCommand3(c, { type: 'point-on-segment3', id: 'M', a: 'X', b: 'B' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toEqual({ code: 'unknown-point', id: 'X' });
    // a taken id is a STATEMENT about the existing point — recorded as a claim, judged at derive
    const taken = applyCommand3(c, { type: 'point-on-segment3', id: 'A', a: 'B', b: 'C', t: 0.5 });
    expect(taken.ok).toBe(true);
    if (taken.ok) expect(taken.next.claims.length).toBeGreaterThan(c.claims.length);
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

/**
 * #1816 (ADR-3D-432) — A STATED LENGTH ON A POINT THAT SITS ON SOMETHING, ON A FIGURE THE PIVOT DOES NOT RUN ON.
 *
 * «A(0,0,0) · B(4,0,0) · D על AB כך ש-AD = 1» was judged against D's random sample and refused «בדקו את החישוב». The
 * claim arm records a `length` determination (apply), and `resolve3`'s determination step solves the rider's one free
 * parameter from it (a quadratic in t, probed through the real point pass). These call the reducer and the resolver;
 * the operator's sequences are the fixtures `rider-length-coords-1816*.geo3.json`.
 */
describe('#1816 — a stated length places a rider of a coordinate figure (resolve3, ADR-3D-432)', () => {
  const pt = (id: string, x: number | null, y: number | null, z: number | null): Command3 => ({ type: 'point3', id, x, y, z });
  const length = (a: string, b: string, value: number): Command3[] => [
    { type: 'segment3', a, b },
    { type: 'claim', claim: { type: 'length-eq', a, b, value } },
  ];
  const AB = [pt('A', 0, 0, 0), pt('B', 4, 0, 0), { type: 'point-on-segment3', id: 'D', a: 'A', b: 'B' } as Command3];
  const SEEDS = Array.from({ length: 24 }, (_, s) => s);
  const lengthClaim = (c: Construction3) => c.claims[c.claims.length - 1];

  it('the report: AD = 1 places D at (1,0,0) at every seed, the claim holds, and the rider counts as determined', () => {
    const c = build(...AB, ...length('A', 'D', 1));
    expect(c.determinations).toEqual([{ kind: 'length', a: 'A', b: 'D', value: 1 }]);
    for (const s of SEEDS) {
      const r = resolve3(c, s);
      expect(r.positions.get('D')).toEqual(v3(1, 0, 0));
      expect(r.determined.get('D')).toBe('determined');
    }
    expect(verifyClaim(lengthClaim(c), c, 0)).toBe(true);
    expect(freeDofCount3(c, resolve3(c, 0))).toBe(0);
  });

  it('the mirrored spelling «DA = 1» places D the same', () => {
    const c = build(pt('A', 0, 0, 0), pt('B', 4, 0, 0), { type: 'point-on-segment3', id: 'D', a: 'A', b: 'B' }, ...length('D', 'A', 1));
    for (const s of SEEDS) expect(resolve3(c, s).positions.get('D')).toEqual(v3(1, 0, 0));
  });

  it('a slanted segment off the origin: |AD| is exact and D stays on AB', () => {
    const c = build(pt('A', 1, 2, 3), pt('B', 5, 4, 7), { type: 'point-on-segment3', id: 'D', a: 'A', b: 'B' }, ...length('A', 'D', 2));
    for (const s of SEEDS) {
      const p = resolve3(c, s).positions;
      expect(dist3(p.get('A')!, p.get('D')!)).toBeCloseTo(2, 12);
      expect(dist3(p.get('A')!, p.get('D')!) + dist3(p.get('D')!, p.get('B')!)).toBeCloseTo(dist3(p.get('A')!, p.get('B')!), 12);
    }
  });

  it('two positions meet the length: one is drawn, and the seeds reach both (an unstated choice, ADR-052)', () => {
    const c = build(...AB, pt('C', 2, 1, 0), ...length('C', 'D', 1.25));
    const xs = new Set(SEEDS.map((s) => +resolve3(c, s).positions.get('D')!.x.toFixed(9)));
    expect([...xs].sort()).toEqual([1.25, 2.75]);
    for (const s of SEEDS) expect(dist3(resolve3(c, s).positions.get('C')!, resolve3(c, s).positions.get('D')!)).toBeCloseTo(1.25, 12);
  });

  it('a point BUILT FROM the rider reaches its parameter: M the midpoint of DB, AM = 2.5 puts D at (1,0,0)', () => {
    const c = build(...AB, { type: 'point-on-segment3', id: 'M', a: 'D', b: 'B', t: 0.5 }, ...length('A', 'M', 2.5));
    for (const s of SEEDS) {
      expect(resolve3(c, s).positions.get('D')).toEqual(v3(1, 0, 0));
      expect(resolve3(c, s).positions.get('M')).toEqual(v3(2.5, 0, 0));
    }
  });

  it('every carrier of the table, one step: a line rider (two sides) and a point on the positive x-axis', () => {
    const line = build(
      { type: 'line3', name: 'ℓ1', anchor: [{ k: 0, p: 0 }, { k: 0, p: 0 }, { k: 0, p: 0 }], dir: [{ k: 1, p: 0 }, { k: 0, p: 0 }, { k: 0, p: 0 }] } as Command3,
      { type: 'on-line', id: 'P', line: 'ℓ1' } as Command3,
      pt('A', 0, 3, 0),
      ...length('A', 'P', 5),
    );
    const xs = new Set(SEEDS.map((s) => +resolve3(line, s).positions.get('P')!.x.toFixed(9) + 0));
    expect([...xs].sort((a, b) => a - b)).toEqual([-4, 4]);
    const axis = build(pt('A', 0, 0, 0), pt('D', null, 0, 0), { type: 'sign-given', id: 'D', axis: 'x', positive: true } as Command3, ...length('A', 'D', 3));
    for (const s of SEEDS) expect(resolve3(axis, s).positions.get('D')).toEqual(v3(3, 0, 0));
  });

  it('no position of the segment meets it (AD = 5 on AB = 4), or only an endpoint does (AD = 4): nothing is placed, the claim fails', () => {
    for (const value of [5, 4]) {
      const c = build(...AB, ...length('A', 'D', value));
      const r = resolve3(c, 0);
      expect(r.determined.has('D')).toBe(false);
      expect(dist3(r.positions.get('A')!, r.positions.get('D')!)).toBeLessThan(4); // still the sampled interior seat
      expect(verifyClaim(lengthClaim(c), c, 0)).toBe(false);
    }
  });

  it('not a 1-DOF solve: two riders (DE = 2) and a plane rider (two offsets) are left to the claim, as before', () => {
    const two = build(...AB, pt('C', 0, 4, 0), { type: 'point-on-segment3', id: 'E', a: 'A', b: 'C' }, ...length('D', 'E', 2));
    expect(resolve3(two, 0).determined.size).toBe(0);
    const plane = build(
      { type: 'plane3', name: 'π', plane: { cx: { k: 0, p: 0 }, cy: { k: 0, p: 0 }, cz: { k: 1, p: 0 }, d: { k: 0, p: 0 }, src: 'z = 0' } } as Command3,
      { type: 'on-planes', id: 'P', plane: 'π' } as Command3,
      pt('A', 0, 0, 0),
      ...length('A', 'P', 3),
    );
    expect(resolve3(plane, 0).determined.size).toBe(0);
  });

  it('a later length on a placed rider is a claim about it: BD = 3 holds, BD = 2 does not', () => {
    for (const [value, holds] of [[3, true], [2, false]] as const) {
      const c = build(...AB, ...length('A', 'D', 1), ...length('B', 'D', value));
      expect(resolve3(c, 0).positions.get('D')).toEqual(v3(1, 0, 0));
      expect(verifyClaim(lengthClaim(c), c, 0)).toBe(holds);
    }
  });

  it('the parameter lane keeps a coord-sym reach (ADR-3D-032), and a solid figure keeps its pivot: no determination is recorded or solved', () => {
    const sym = build(pt('A', 0, 0, 0), { type: 'point3', id: 'B', x: null, y: 0, z: 0, syms: ['k', null, null] } as Command3, { type: 'point-on-segment3', id: 'D', a: 'A', b: 'B' }, ...length('A', 'D', 1));
    expect(sym.determinations).toEqual([]);
    const cube = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'point-on-segment3', id: 'E', a: 'A', b: 'B' }, ...length('A', 'E', 0.5));
    expect(resolve3(cube, 0).determined.size).toBe(0); // the pivot's pin drives it (#1782); the step does not run
  });
});

/**
 * #2490 (ADR-3D-434) — a pyramid over a base that already exists is a BOUND solid: the base keeps its own points, the
 * solid owns its apex, and the apex's three numbers are its only dims, placed in the ring's frame.
 */
describe('#2490 — a pyramid over an existing base is a bound solid', () => {
  const cube = (): Construction3 => build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
  const plane = (c: Construction3, seed: number, ring: string[]) => {
    const p = evaluate3(c, seed);
    const [a, b, d] = ring.map((id) => p.get(id)!);
    const n = cross3(sub3(b, a), sub3(d, a));
    return { p, off: (id: string) => dot3(n, sub3(p.get(id)!, a)) / norm3(n) };
  };

  it('owns only its apex: bound = the base, the apex its solid-vertex, the cube untouched', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(c.solids).toHaveLength(2);
    expect(c.solids[1].bound).toEqual(['A', 'B', 'C', 'D']);
    expect(c.points.get('S')).toEqual({ kind: 'solid-vertex', solid: 1, index: 4 });
    for (const [i, id] of CUBE_IDS.entries()) expect(c.points.get(id)).toEqual({ kind: 'solid-vertex', solid: 0, index: i });
    expect(pointParents3(c, c.points.get('S')!)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('carries the apex dims alone: host + 3, host + 1 when right (no similarity of its own)', () => {
    expect(freeDims(cube())).toBe(0);
    expect(freeDims(build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] }))).toBe(3);
    expect(freeDims(build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4r', ids: ['A', 'B', 'C', 'D', 'S'] }))).toBe(1);
    expect(freeDims(build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'S'] }))).toBe(3);
  });

  it('the apex is off the base at every seed, moves with the seed, and stands on either side (ADR-052)', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] });
    const offs = Array.from({ length: 24 }, (_, seed) => plane(c, seed, ['A', 'B', 'D']).off('S'));
    for (const o of offs.slice(0, 6)) expect(Math.abs(o)).toBeGreaterThan(0.3);
    expect(new Set(offs.map((o) => o.toFixed(6))).size).toBe(24);
    expect(offs.some((o) => o > 0)).toBe(true);
    expect(offs.some((o) => o < 0)).toBe(true);
  });

  it('over a FLAT host the sides are one figure mirrored: the apex stands up, on the floor frame\'s side (FR-SP-4)', () => {
    const c = build({ type: 'quad-shape', base: 'square', ids: ['A', 'B', 'C', 'D'] }, { type: 'solid', kind: 'pyramid4g', ids: ['A', 'B', 'C', 'D', 'S'] });
    for (let seed = 0; seed < 12; seed++) {
      const p = evaluate3(c, seed);
      for (const id of ['A', 'B', 'C', 'D']) expect(Math.abs(p.get(id)!.z)).toBeLessThan(1e-9);
      expect(p.get('S')!.z).toBeGreaterThan(0.3);
    }
  });

  it('adding it never moves the host (stability)', () => {
    const before = cube();
    const after = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] });
    for (const seed of [0, 7]) {
      const p0 = evaluate3(before, seed);
      const p1 = evaluate3(after, seed);
      for (const id of CUBE_IDS) expect(p1.get(id)).toEqual(p0.get(id));
    }
  });

  it('a right kind stands over the ring\'s centre', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'solid', kind: 'pyramid4r', ids: ['A', 'B', 'C', 'D', 'S'] });
    for (const seed of [0, 1, 2]) {
      const p = evaluate3(c, seed);
      const S = p.get('S')!;
      const ctr = lerp3(p.get('A')!, p.get('C')!, 0.5);
      const n = cross3(sub3(p.get('B')!, p.get('A')!), sub3(p.get('D')!, p.get('A')!));
      const along = dot3(sub3(S, ctr), n) / norm3(n);
      expect(dist3(S, ctr)).toBeCloseTo(Math.abs(along), 9);
    }
  });

  it('a ring of free points places the apex at its turn in the point pass', () => {
    const c = emptyConstruction3();
    for (const id of ['A', 'B', 'C']) c.points.set(id, { kind: 'free3' });
    const r = applyCommand3(c, { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'S'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.solids[0].bound).toEqual(['A', 'B', 'C']);
    for (const seed of [0, 3]) expect(Math.abs(plane(r.next, seed, ['A', 'B', 'C']).off('S'))).toBeGreaterThan(1e-3);
  });

  it('a placeholder apex yields (#841) and keeps its slot in the point order', () => {
    const c = cube();
    c.points.set('S', { kind: 'free3' });
    c.points.set('M', { kind: 'on-segment', a: 'A', b: 'S', t: 0.5 });
    const r = applyCommand3(c, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.points.get('S')).toEqual({ kind: 'solid-vertex', solid: 1, index: 4 });
    expect([...r.next.points.keys()].indexOf('S')).toBeLessThan([...r.next.points.keys()].indexOf('M'));
    const p = evaluate3(r.next, 0);
    expect(dist3(p.get('M')!, lerp3(p.get('A')!, p.get('S')!, 0.5))).toBeLessThan(1e-12);
  });

  it('keeps the refusals that are not this run: a base only partly there, a tetra inside one face', () => {
    const tri = build({ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] });
    expect(applyCommand3(tri, { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] })).toEqual({ ok: false, error: { code: 'already-defined', id: 'A' } });
    expect(applyCommand3(cube(), { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] })).toEqual({ ok: false, error: { code: 'already-defined', id: 'A' } });
  });

  it('a base shape the kind states is a statement about the ring: a disjoint one refuses naming both', () => {
    const par = build({ type: 'quad-shape', base: 'parallelogram', ids: ['A', 'B', 'C', 'D'] });
    const r = applyCommand3(par, { type: 'solid', kind: 'pyramidTrap', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(r).toEqual({ ok: false, error: { code: 'shape-disjoint', stated: 'trapezoid', actual: 'parallelogram' } });
  });

  it('a stated narrower base retires the ring\'s drawing preference it now contradicts (rectangle → square)', () => {
    const rect = build({ type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'C', 'D'] });
    expect(rect.requirements.some((q) => q.kind === 'quad-general')).toBe(true);
    const r = applyCommand3(rect, { type: 'solid', kind: 'pyramid4g', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next.requirements.some((q) => q.kind === 'quad-general')).toBe(false);
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
