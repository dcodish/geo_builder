/**
 * #2368 (ADR-3D-375) — AN ANCHORED PLACEMENT'S LEFTOVER RIGID FREEDOM IS MEASURED, AND THE READ-BACK
 * SAMPLES IT.
 *
 * The operator's four lines, «קובייה ABCDA'B'C'D'» · «A(0,0,0)» · «AB=(2,0,0)» · «מישור ABCD», leave the cube
 * free to turn about AB. At seed 0 the panel printed «C(2, 2, 0) או (2, -2, 0)», «D(0, 2, 0) או …» and
 * «ABCD: z = 0», all false; at seed 5 the ask lane answered «z = 0» too. Every knowledge gate decides
 * "fixed" by agreement across resolves, and the turn is varied by nothing: the funnel freezes rotation about
 * a pinned point (the ADR-3D-101 deferral) and the pivot's eight start rotations do not depend on the seed,
 * so the orbit lands in the same handful of basins at every seed.
 *
 * The fix measures the freedom (the rank of the primary residuals over the six rigid gauge unknowns) and
 * `knowledgeSamples3({ readback: true })` adds, per sample that keeps one, an exact image walked along it.
 * No gate is rewritten. The drawing is untouched (asserted below).
 */
import { describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { knowledgeSamples3, resolve3 } from '../engine/evaluate';
import { answerQuery } from '../engine/queries';
import { symmetricEigen } from '../engine/solve3';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
const CUBE = "קובייה ABCDA'B'C'D'";
const REPORT = [CUBE, 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD'];

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const cAt = (st: St, seed: number) => derive3(st.facts, seed).construction;
const panel = (st: St, seed: number) => dataView(cAt(st, seed), seed);
const ask = (st: St, q: string, seed: number) => answerQuery(cAt(st, seed), q, seed);
/** seeds 0 and 5 were the false ones; 1, 2 and 7 were already correct by luck */
const SEEDS = [0, 5, 1, 2, 7];

describe('#2368 — the operator’s four lines', () => {
  const st = build(REPORT);
  for (const seed of SEEDS) {
    it(`seed ${seed}: the panel prints only what a turn about AB keeps — no «או» row, no plane`, () => {
      const p = panel(st, seed);
      expect(p.points).toEqual(['A(0, 0, 0)', 'B(2, 0, 0)', 'C(2, ?, ?)', 'D(0, ?, ?)', "A'(0, ?, ?)", "B'(2, ?, ?)", "C'(2, ?, ?)", "D'(0, ?, ?)"]);
      expect(p.points.some((r) => r.includes('או'))).toBe(false);
      expect(p.planes).toEqual([]);
    });
    it(`seed ${seed}: the ask lane agrees — the plane, D and z_D are undetermined; x_D is 0`, () => {
      expect(ask(st, 'מישור ABCD', seed)).toMatchObject({ answer: null, note: 'undetermined' });
      expect(ask(st, 'D', seed).answer).toBe('(0, ?, ?)');
      expect(ask(st, 'z_D', seed)).toMatchObject({ answer: null, note: 'undetermined' });
      // the positive half: the turn keeps D in the plane x = 0, so x is truly fixed
      expect(ask(st, 'x_D', seed).answer).toBe('0');
    });
  }

  it('the FIGURE is unchanged: the drawing lands where it always did (seed 0 flat, seed 1 tilted)', () => {
    const d0 = derive3(st.facts, 0).positions.get('D')!;
    expect([d0.x, d0.y, d0.z].map((v) => +v.toFixed(3))).toEqual([0, 2, 0]);
    const d1 = derive3(st.facts, 1).positions.get('D')!;
    expect([d1.x, d1.y, d1.z].map((v) => +v.toFixed(3))).toEqual([0, -0.907, -1.782]);
  });

  it('the plain sampler (claims, narrowing, the drawing) gains nothing: the image is read-back only', () => {
    const c = cAt(st, 0);
    expect(knowledgeSamples3(c, [0])).toHaveLength(1);
    expect(knowledgeSamples3(c, [0], { readback: true })).toHaveLength(2);
  });

  it('the image keeps every given exactly, and moves the turned vertices', () => {
    const c = cAt(st, 0);
    const [base, img] = knowledgeSamples3(c, [0], { readback: true });
    const a = img.positions.get('A')!;
    const b = img.positions.get('B')!;
    expect(Math.hypot(a.x, a.y, a.z)).toBeLessThan(1e-6);
    expect(Math.hypot(b.x - 2, b.y, b.z)).toBeLessThan(1e-6);
    const d = img.positions.get('D')!;
    const d0 = base.positions.get('D')!;
    expect(Math.hypot(d.x - d0.x, d.y - d0.y, d.z - d0.z)).toBeGreaterThan(0.1);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(2, 6); // still a cube of edge 2 at A
    expect(Math.abs(d.x)).toBeLessThan(1e-6); // AD ⟂ AB
    expect(img.pivot?.pointRoots).toBeUndefined(); // a one-entry pool: a moved point is not a second configuration
  });
});

describe('#2368 — the rank probe', () => {
  const freedom = (lines: string[], seed = 0) => resolve3(cAt(build(lines), seed), seed).pivot?.placementFreedom?.();

  it('the report: dim 1, a rotation about the line AB (through A, ∥ x)', () => {
    for (const seed of [0, 1, 5]) {
      const fr = freedom(REPORT, seed)!;
      expect(fr.dim, `seed ${seed}`).toBe(1);
      const [tx, ty, tz, wx, wy, wz] = fr.generators[0];
      // the chart is a world rotation about the origin (= A) then a translation: a turn about AB is pure ω ∥ x
      expect(Math.hypot(tx, ty, tz), `seed ${seed}`).toBeLessThan(1e-4);
      expect(Math.abs(wx), `seed ${seed}`).toBeCloseTo(1, 4);
      expect(Math.hypot(wy, wz), `seed ${seed}`).toBeLessThan(1e-4);
    }
  });
  it('«B(2,0,0)» in place of the vector reads the same freedom', () => {
    expect(freedom([CUBE, 'A(0,0,0)', 'B(2,0,0)'])!.dim).toBe(1);
  });
  it('«AD=(0,2,0)» added: dim 0 (rigid; the mirror pair is a genuine finite pair)', () => {
    for (const seed of [0, 1, 5]) expect(freedom([...REPORT, 'AD=(0,2,0)'], seed)!.dim, `seed ${seed}`).toBe(0);
  });
  it('the vertex A alone: dim 3 (rotation about A)', () => {
    const fr = freedom([CUBE, 'A(0,0,0)'])!;
    expect(fr.dim).toBe(3);
    for (const g of fr.generators) expect(Math.hypot(g[0], g[1], g[2])).toBeLessThan(1e-4);
  });
  it('symmetricEigen: ascending eigenvalues, orthonormal eigenvectors', () => {
    const m = [[2, 1, 0], [1, 2, 0], [0, 0, 5]];
    const { values, vectors } = symmetricEigen(m);
    expect(values.map((v) => +v.toFixed(9))).toEqual([1, 3, 5]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dot = vectors[i].reduce((a, v, k) => a + v * vectors[j][k], 0);
      expect(dot).toBeCloseTo(i === j ? 1 : 0, 9);
    }
  });
});

describe('#2368 — the class: every solid placed by one vertex and one edge', () => {
  const MATRIX: { name: string; lines: string[] }[] = [
    { name: 'cube, B as a point', lines: [CUBE, 'A(0,0,0)', 'B(2,0,0)', 'מישור ABCD'] },
    { name: 'box', lines: ["תיבה ABCDA'B'C'D'", 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD'] },
    { name: 'square-based pyramid', lines: ['פירמידה ABCDS שבסיסה ריבוע', 'A(0,0,0)', 'B(2,0,0)', 'מישור ABCD'] },
    { name: 'tetrahedron', lines: ['טטראדר ABCD', 'A(0,0,0)', 'B(2,0,0)', 'מישור ABC'] },
    { name: 'right triangular prism', lines: ['מנסרה ישרה משולשת ABC', 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABC'] },
  ];
  for (const { name, lines } of MATRIX) {
    it(`${name}: no coordinate a turn about AB moves prints, and no plane through AB`, () => {
      const st = build(lines);
      for (const seed of [0, 1, 5]) {
        const p = panel(st, seed);
        for (const [id, comps] of Object.entries(p.pointComps)) {
          if (id === 'A' || id === 'B') continue;
          expect(comps[1], `${id} y, seed ${seed}`).toMatch(/\?/);
          expect(comps[2], `${id} z, seed ${seed}`).toMatch(/\?/);
        }
        expect(p.points.some((r) => r.includes('או')), `seed ${seed}`).toBe(false);
        expect(p.planes, `seed ${seed}`).toEqual([]);
      }
    });
  }
});

describe('#2368 — controls: a truly fixed figure loses nothing', () => {
  it('«AD=(0,2,0)» added keeps D, the A′ «או» pair and both plane forms', () => {
    const st = build([...REPORT, 'AD=(0,2,0)']);
    for (const seed of [0, 1, 5]) {
      const p = panel(st, seed);
      expect(p.points, `seed ${seed}`).toContain('D(0, 2, 0)');
      expect(p.points, `seed ${seed}`).toContain("A'(0, 0, 2) או (0, 0, -2)");
      expect(p.planes, `seed ${seed}`).toEqual(['ABCD: z = 0', 'ABCD: π = (0, 0, 0) + t·(2, 0, 0) + s·(0, 2, 0)']);
    }
  });
  it('«D(0,2,0)» added keeps the full C and D', () => {
    const st = build([...REPORT, 'D(0,2,0)']);
    for (const seed of [0, 1, 5]) {
      const p = panel(st, seed);
      expect(p.points, `seed ${seed}`).toContain('C(2, 2, 0)');
      expect(p.points, `seed ${seed}`).toContain('D(0, 2, 0)');
    }
  });
  it('«מישור ABCD מקביל למישור xy» still drives: C(2, ?, 0) and ABCD: z = 0', () => {
    const st = build([...REPORT, 'מישור ABCD מקביל למישור xy']);
    for (const seed of [0, 1]) {
      const p = panel(st, seed);
      expect(p.points, `seed ${seed}`).toContain('C(2, ?, 0)');
      expect(p.planes, `seed ${seed}`).toContain('ABCD: z = 0');
    }
  });
});
