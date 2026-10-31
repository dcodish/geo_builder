/**
 * #2630 (ADR-3D-400, amends ADR-3D-272) — A SOLID STAYS ON THE FLOOR UNTIL THE STUDENT PLACES IT.
 *
 * Operator 2026-10-31: *"they are on the floor until they are placed by user somewhere"*. #1421's
 * normalisation skipped every figure holding a solid (a declared polygon is one), so once a length
 * drove the solve, «הציגו תצורה אחרת» turned the whole figure: his triangle left the floor, and a
 * pyramid's apex went below it (seed 2). The frame is now the first solid's own base. A figure whose
 * orientation the student stated (a component given, a coordinate, an equation) is never turned:
 * before this, «AB = (1,2,3)» with two lengths drew AB as (3.74, 0, 0).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const derived = (seed: number) => derive3(useGeo3.getState().facts, seed);
const len = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const SEEDS = [0, 1, 2, 3, 7];

beforeEach(reset);

interface Row {
  name: string;
  lines: string[];
  base: string[];
  above: string[];
  lengths: [string, string, number][];
}

const ROWS: Row[] = [
  { name: 'the reported triangle', lines: ['משולש ABC', 'אורך AB = 5', 'אורך AC = 3'], base: ['A', 'B', 'C'], above: [], lengths: [['A', 'B', 5], ['A', 'C', 3]] },
  { name: 'a quadrilateral', lines: ['מרובע ABCD', 'אורך AB = 5', 'אורך BC = 3'], base: ['A', 'B', 'C', 'D'], above: [], lengths: [['A', 'B', 5], ['B', 'C', 3]] },
  { name: 'a square-based pyramid (apex went below the floor)', lines: ['פירמידה SABCD', 'אורך AB = 4', 'אורך SA = 6'], base: ['A', 'B', 'C', 'D'], above: ['S'], lengths: [['A', 'B', 4], ['S', 'A', 6]] },
  { name: 'a triangular pyramid', lines: ['פירמידה SABC', 'אורך AB = 4', 'אורך SA = 6'], base: ['A', 'B', 'C'], above: ['S'], lengths: [['A', 'B', 4], ['S', 'A', 6]] },
  {
    name: 'a box',
    lines: ["תיבה ABCDA'B'C'D'", 'אורך AB = 3', 'אורך BC = 4', "אורך AA' = 5"],
    base: ['A', 'B', 'C', 'D'],
    above: ["A'", "B'", "C'", "D'"],
    lengths: [['A', 'B', 3], ['B', 'C', 4], ['A', "A'", 5]],
  },
  { name: 'two triangles (the first one carries the floor)', lines: ['משולש ABC', 'משולש DEF', 'אורך AB = 5', 'אורך DE = 2'], base: ['A', 'B', 'C'], above: [], lengths: [['A', 'B', 5], ['D', 'E', 2]] },
];

describe('#2630 — a driven, unplaced solid keeps its base on the floor at every configuration', () => {
  for (const row of ROWS) {
    it(row.name, () => {
      for (const l of row.lines) submit(l);
      const shapes = new Set<string>();
      for (const seed of SEEDS) {
        const d = derived(seed);
        for (const f of useGeo3.getState().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
        const pos = d.resolved.positions;
        const [b0, b1] = [pos.get(row.base[0])!, pos.get(row.base[1])!];
        expect(Math.hypot(b0.x, b0.y, b0.z), `seed ${seed}: ${row.base[0]} at the origin`).toBeLessThan(1e-6);
        expect(Math.abs(b1.y) + Math.abs(b1.z), `seed ${seed}: the first edge along +x`).toBeLessThan(1e-6);
        expect(b1.x, `seed ${seed}`).toBeGreaterThan(0);
        for (const id of row.base) expect(Math.abs(pos.get(id)!.z), `seed ${seed}: ${id} on the floor`).toBeLessThan(1e-6);
        for (const id of row.above) expect(pos.get(id)!.z, `seed ${seed}: ${id} above the floor`).toBeGreaterThan(1e-6);
        for (const [p, q, v] of row.lengths) expect(len(pos.get(p)!, pos.get(q)!), `seed ${seed}: ${p}${q}`).toBeCloseTo(v, 4);
        shapes.add([...pos.values()].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join(' '));
      }
      // The shape still cycles: «הציגו תצורה אחרת» changes the figure, never only its turn.
      expect(shapes.size, 'the shape varies across configurations').toBeGreaterThan(1);
    });
  }
});

describe('#2630 — a figure whose orientation the student stated is never turned', () => {
  it('«AB = (1,2,3)» with two lengths keeps its components (no solid)', () => {
    for (const l of ['AB = (1,2,3)', 'אורך AC = 2', 'אורך BC = 3']) submit(l);
    expect(useGeo3.getState().facts).toHaveLength(3);
    for (const seed of SEEDS) {
      const d = derived(seed);
      for (const f of useGeo3.getState().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
      const [a, b] = [d.resolved.positions.get('A')!, d.resolved.positions.get('B')!];
      expect([b.x - a.x, b.y - a.y, b.z - a.z].map((v) => +v.toFixed(4)), `seed ${seed}`).toEqual([1, 2, 3]);
    }
  });

  it('a prism with its edge vectors given by components keeps them', () => {
    for (const l of ['מנסרה ישרה משולשת ABC', "AA'=(k-1,k-7, k+1)", 'AB = (k-1, k, 3)', 'AC = (k+1, 0, k-3)', 'k חיובי']) submit(l);
    const pos = derived(0).resolved.positions;
    const [a, b] = [pos.get('A')!, pos.get('B')!];
    expect([b.x - a.x, b.y - a.y, b.z - a.z].map((v) => +v.toFixed(4))).toEqual([1, 2, 3]);
  });
});
