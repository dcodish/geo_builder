/**
 * #2378 + #2504 (ADR-3D-379) — AN ANCHORED FIGURE'S LEFTOVER TURN AND SIZE ARE COUNTED AND SAMPLED.
 *
 * The operator's four lines, «קובייה ABCDA'B'C'D'» · «A(0,0,0)» · «AB=(2,0,0)» · «מישור ABCD», leave the cube
 * free to turn about AB. The status line read «✓ הציור נקבע במלואו על ידי הנתונים» and «הציגו תצורה אחרת»
 * never turned it: `freeDofCount3` let the pins absorb the gauge and never added back what they left, and the
 * funnel froze the partial rotation (ADR-3D-101), so the multi-start's fixed basins were all that was drawn.
 *
 * The operator's rulings:
 *  - 2026-10-23, #2378 card d04 A: *"\"Another configuration\" turns the cube. Each press turns the cube about
 *    AB to a new angle. The first drawing may no longer sit square on the floor."*
 *  - 2026-10-24, #2505 e23 A: a pure slide of the whole figure is not counted; e24 A: a vector-only figure
 *    turns about its vector, and the cue counts it.
 *  - 2026-10-24, #2504 d03 A/A: the cue counts the free size («A(0,0,0)» alone reads «דרגות חופש: 4»), and the
 *    button resizes every anchored figure whose size no given fixes.
 *
 * One source for the count and the drawing (ADR-3D-124): the rank probe's `counted` (turn + size, a pure
 * translation excluded), and stage 6 of `resolve3` parks the size and walks the turn along the same probe.
 */
import { describe, expect, it } from 'vitest';
import { freeDofCount3, resolve3 } from '../engine/evaluate';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
type P = { x: number; y: number; z: number };
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
const cue = (st: St, seed: number) => {
  const d = derive3(st.facts, seed);
  return freeDofCount3(d.construction, d.resolved);
};
const pos = (st: St, seed: number, id: string): P => derive3(st.facts, seed).positions.get(id)!;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const SEEDS24 = Array.from({ length: 24 }, (_, i) => i);
const SEEDS8 = [0, 1, 2, 3, 4, 5, 6, 7];

describe('#2378 — the operator’s four lines', () => {
  const st = build(REPORT);
  it('the cue reads 1 (the turn about AB), never ✓, at seeds 0, 1, 2, 5, 7', () => {
    for (const seed of [0, 1, 2, 5, 7]) expect(cue(st, seed), `seed ${seed}`).toBe(1);
  });
  it('«הציגו תצורה אחרת» turns the cube about AB: 24 seeds give ≥ 20 distinct angles, no angle more than 3 times', () => {
    const angles = SEEDS24.map((s) => {
      const d = pos(st, s, 'D');
      return Math.atan2(d.z, d.y).toFixed(2);
    });
    const counts = new Map<string, number>();
    for (const a of angles) counts.set(a, (counts.get(a) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(20);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    // spread over the full turn: both half-planes about AB are reached
    expect(angles.some((a) => +a > 0) && angles.some((a) => +a < 0)).toBe(true);
  });
  it('every turned drawing is exact: A and B fixed, a cube of edge 2', () => {
    for (const s of SEEDS8) {
      const d = derive3(st.facts, s).positions;
      const A = d.get('A')!, B = d.get('B')!, D = d.get('D')!, A1 = d.get("A'")!, C1 = d.get("C'")!;
      expect(dist(A, { x: 0, y: 0, z: 0 }), `seed ${s}`).toBeLessThan(1e-6);
      expect(dist(B, { x: 2, y: 0, z: 0 }), `seed ${s}`).toBeLessThan(1e-6);
      expect(dist(A, D)).toBeCloseTo(2, 6);
      expect(dist(A, A1)).toBeCloseTo(2, 6);
      expect(Math.abs(D.x)).toBeLessThan(1e-6); // AD ⟂ AB
      expect(Math.abs((D.x - A.x) * (A1.x - A.x) + (D.y - A.y) * (A1.y - A.y) + (D.z - A.z) * (A1.z - A.z))).toBeLessThan(1e-6);
      expect(dist(A, C1)).toBeCloseTo(2 * Math.sqrt(3), 6);
    }
  });
  it('the turned rotation is recorded as sampled (the #512 frame verdict reads it)', () => {
    const d = derive3(st.facts, 0);
    expect(d.resolved.placementSampledParts.rotation).toBe(true);
  });
});

describe('#2378 — the class: every anchored figure with a leftover turn', () => {
  const ROWS: { name: string; lines: string[]; cue: number; turned: string }[] = [
    { name: 'cube · A · B', lines: [CUBE, 'A(0,0,0)', 'B(2,0,0)'], cue: 1, turned: 'D' },
    { name: 'box · A · AB', lines: ["תיבה ABCDA'B'C'D'", 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD'], cue: 3, turned: 'D' },
    { name: 'square pyramid · A · B', lines: ['פירמידה ABCDS שבסיסה ריבוע', 'A(0,0,0)', 'B(2,0,0)', 'מישור ABCD'], cue: 4, turned: 'D' },
    { name: 'right prism · A · AB', lines: ['מנסרה ישרה משולשת ABC', 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABC'], cue: 4, turned: 'C' },
    { name: 'tetrahedron · A · B', lines: ['טטראדר ABCD', 'A(0,0,0)', 'B(2,0,0)', 'מישור ABC'], cue: 6, turned: 'C' },
    { name: 'cube · A · base perpendicular to ℓ', lines: [CUBE, 'A(0,0,0)', 'הישר ℓ: x = (0,0,0) + t(0,0,1)', 'מישור ABCD אנך לישר ℓ'], cue: 2, turned: 'B' },
    { name: 'cube · two vertices on an equation plane', lines: [CUBE, 'המישור π1: z - 3 = 0', 'A על המישור π1', 'B על המישור π1'], cue: 3, turned: "A'" },
  ];
  for (const r of ROWS) {
    it(`${r.name}: the cue reads ${r.cue}, and the drawing turns`, () => {
      const st = build(r.lines);
      for (const s of [0, 1]) expect(cue(st, s), `seed ${s}`).toBe(r.cue);
      // the turned vertex, relative to A (a slide is not what is asserted): distinct directions across seeds
      const dirs = new Set(
        SEEDS8.map((s) => {
          const a = pos(st, s, 'A');
          const q = pos(st, s, r.turned);
          const n = dist(a, q);
          return [(q.x - a.x) / n, (q.y - a.y) / n, (q.z - a.z) / n].map((v) => v.toFixed(2)).join(',');
        }),
      );
      expect(dirs.size).toBeGreaterThanOrEqual(6);
    });
  }
});

describe('#2504 — the free size is counted and resampled', () => {
  it('«קובייה …» · «A(0,0,0)»: the cue reads 4 (three for turning, one for size); 24 seeds give ≥ 20 sizes', () => {
    const st = build([CUBE, 'A(0,0,0)']);
    for (const s of [0, 1, 2, 5, 7]) expect(cue(st, s), `seed ${s}`).toBe(4);
    const sizes = new Set(SEEDS24.map((s) => dist(pos(st, s, 'A'), pos(st, s, 'B')).toFixed(3)));
    expect(sizes.size).toBeGreaterThanOrEqual(20);
  });
  const ROWS: { name: string; lines: string[]; cue: number }[] = [
    { name: 'the base on the xy-plane, with A', lines: [CUBE, 'A(0,0,0)', 'המישור ABCD מונח על המישור xy'], cue: 2 },
    { name: 'oriented by two coordinate-plane relations, with A', lines: [CUBE, 'A(0,0,0)', 'מישור ABCD מקביל למישור xy', "מישור ABB'A' מקביל למישור xz"], cue: 1 },
    { name: 'the base on the xy-plane, no point', lines: [CUBE, 'המישור ABCD מונח על המישור xy'], cue: 2 },
    { name: 'on the xy-plane and the xz-plane, no point', lines: [CUBE, 'המישור ABCD מונח על המישור xy', "המישור ABB'A' מונח על המישור xz"], cue: 1 },
    { name: 'a vertex on an equation plane', lines: [CUBE, 'המישור π1: z - 3 = 0', 'A על המישור π1'], cue: 4 },
  ];
  for (const r of ROWS) {
    it(`${r.name}: the cue reads ${r.cue}; the size changes at every seed, never parked at 1 by a skipped park`, () => {
      const st = build(r.lines);
      for (const s of [0, 1]) expect(cue(st, s), `seed ${s}`).toBe(r.cue);
      const sizes = SEEDS8.map((s) => dist(pos(st, s, 'A'), pos(st, s, 'B')));
      expect(new Set(sizes.map((v) => v.toFixed(3))).size).toBeGreaterThanOrEqual(7);
      for (const v of sizes) expect(Math.abs(v - 1)).toBeGreaterThan(1e-6);
    });
  }
});

describe('#2378 / #2505 e24 — a vector-only figure turns about its vector', () => {
  it('«קובייה …» · «AB=(2,0,0)»: the cue reads 1; AB keeps its direction and length while the cube turns', () => {
    const st = build([CUBE, 'AB=(2,0,0)']);
    for (const s of [0, 1, 2]) expect(cue(st, s), `seed ${s}`).toBe(1);
    const dirs = new Set<string>();
    for (const s of SEEDS8) {
      const a = pos(st, s, 'A');
      const b = pos(st, s, 'B');
      const d = pos(st, s, 'D');
      expect(dist(b, { x: a.x + 2, y: a.y, z: a.z }), `seed ${s}`).toBeLessThan(1e-6);
      dirs.add([(d.y - a.y) / 2, (d.z - a.z) / 2].map((v) => v.toFixed(2)).join(','));
    }
    expect(dirs.size).toBeGreaterThanOrEqual(6);
  });
});

describe('#2378 / #2505 e23 — a pure slide is not counted', () => {
  it('T45 (three vectors · «z_A=2»): the probe leaves x/y free, and the cue does not count it', () => {
    const BOX = "תיבה ABCDA'B'C'D'";
    const st = build([BOX, 'AB=(1,0,0)', 'AD=(0,1,0)', "AA'=(0,0,2)", 'z_A=2', 'מישור ABCD', "מישור ABB'A'"]);
    const d = derive3(st.facts, 0);
    const fr = d.resolved.pivot!.placementFreedom!();
    expect(fr.dim).toBe(2); // the x/y slide is measured…
    expect(fr.counted).toBe(0); // …and not counted
    expect(freeDofCount3(d.construction, d.resolved)).toBe(0);
    const a = d.positions.get('A')!;
    expect(dist(a, { x: 0, y: 0, z: 2 })).toBeLessThan(1e-6); // and not drawn elsewhere
  });
  it('the probe: `counted` is the turn plus the size, never the translation', () => {
    const fr = (lines: string[]) => {
      const c = derive3(build(lines).facts, 0).construction;
      return resolve3(c, 0).pivot!.placementFreedom!();
    };
    expect(fr(REPORT)).toMatchObject({ dim: 1, counted: 1, scaleFree: false });
    expect(fr([CUBE, 'A(0,0,0)'])).toMatchObject({ dim: 3, counted: 4, scaleFree: true });
    expect(fr([CUBE, 'AB=(2,0,0)'])).toMatchObject({ dim: 4, counted: 1, scaleFree: false });
    expect(fr([CUBE, 'A(0,0,0)'])!.rotation).toHaveLength(3);
    expect(fr(REPORT)!.rotation).toHaveLength(1);
  });
});

describe('#2378 — controls: a determined or unanchored figure does not move', () => {
  const FIXED: { name: string; lines: string[]; edge: number }[] = [
    { name: '«AD=(0,2,0)» added', lines: [CUBE, 'A(0,0,0)', 'AB=(2,0,0)', 'AD=(0,2,0)'], edge: 2 },
    { name: '«D(0,2,0)» added', lines: [CUBE, 'A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)'], edge: 2 },
    { name: 'the bare cube (unanchored: keep it flat on the floor)', lines: [CUBE], edge: 1 },
    { name: 'the bare cube with «|AB| = 3»', lines: [CUBE, '|AB| = 3'], edge: 3 },
  ];
  for (const r of FIXED) {
    it(`${r.name}: the cue reads 0 and D is the same at every seed`, () => {
      const st = build(r.lines);
      const d0 = pos(st, 0, 'D');
      for (const s of [0, 1, 2, 5]) {
        expect(cue(st, s), `seed ${s}`).toBe(0);
        expect(dist(pos(st, s, 'A'), pos(st, s, 'B'))).toBeCloseTo(r.edge, 6);
        expect(dist(pos(st, s, 'D'), d0), `seed ${s}`).toBeLessThan(1e-6);
      }
    });
  }
  it('«מישור ABCD מקביל למישור xy» added: the cue reads 0 and the base stays on z = 0', () => {
    const st = build([...REPORT, 'מישור ABCD מקביל למישור xy']);
    for (const s of [0, 1, 2]) {
      expect(cue(st, s)).toBe(0);
      expect(Math.abs(pos(st, s, 'D').z)).toBeLessThan(1e-6);
    }
  });
});

describe('#2378 — a stated sign survives the turn', () => {
  it('«שיעור ה-z של D חיובי»: the cube still turns (cue 1), and D stays above the floor at every seed', () => {
    const st = build([...REPORT, 'שיעור ה-z של D חיובי']);
    expect(cue(st, 0)).toBe(1);
    const angles = new Set<string>();
    for (const s of SEEDS8) {
      const d = pos(st, s, 'D');
      expect(d.z, `seed ${s}`).toBeGreaterThan(0);
      angles.add(Math.atan2(d.z, d.y).toFixed(2));
    }
    expect(angles.size).toBeGreaterThanOrEqual(4);
  });
});
