/**
 * ADR-3D-033 — a MEMBERSHIP statement about an existing point DRIVES the figure's
 * free DOFs (M1: "fit the diagram to match input"), never a bare pass/fail check.
 *
 * The operator's prod session `n6lmx1rj` (2026-07-10): on the ADR-3D-032 exam box
 * (top face pinned to a plane equation, B injected, A pinned by line+length+sign,
 * M(k,1,3) with k pinned to 2√15 by the 60° angle) the final exam given
 * `M על מישור DCC'D'` was refused `not-on-plane` — although face DCC'D' rides the
 * box's one remaining free dim (its depth), so exactly one depth satisfies it
 * (|AD| = 40√3/9 ≈ 7.698). The membership now joins the pivot's drive machinery
 * (a stage-4 failure-path re-solve, warm-started from the pinned figure's own
 * solution, transactional — rolled back if it breaks any sibling given).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dot3, norm3, dist3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);

const planeDist = (d: ReturnType<typeof derived>, plane: string, id: string): number => {
  const pl = d.resolved.planes.get(plane)!;
  const p = d.resolved.positions.get(id)!;
  return Math.abs(dot3(pl.n, p) + pl.d) / norm3(pl.n);
};

/** The exam figure (ADR-3D-032's BASE + part-ד M) — the operator's session n6lmx1rj. */
const EXAM = [
  'תיבה',
  "מישור A'B'C'D' הוא x+4y-8z-142=0",
  'B(0,7,6)',
  'משוואת הישר AB היא x = (0,7,6) + t(0,2,1)',
  'אורך המקצוע AB הוא 5√5',
  'שיעור ה-y של הקודקוד A שלילי',
  'M(k, 1, 3)',
  'הזוית בין AB ו AM היא 60',
  'k>0',
];

describe('ADR-3D-033 — scenario: M on a face plane drives the box depth (session n6lmx1rj)', () => {
  beforeEach(reset);

  it("the operator's exact sequence builds; the depth lands at 40√3/9 and every given still holds", () => {
    for (const u of EXAM) submit(u);
    submit("M על מישור DCC'D'"); // the operator's exact final utterance
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const P = (id: string) => d.resolved.positions.get(id)!;
    // the stated membership holds — the face was driven THROUGH M
    expect(planeDist(d, "DCC'D'", 'M')).toBeLessThan(1e-4);
    // the drive moved ONLY the free depth — every earlier given is untouched:
    expect(d.resolved.param?.value).toBeCloseTo(2 * Math.sqrt(15), 5); // k (the book answer)
    expect(P('B').x).toBeCloseTo(0, 6);
    expect(P('B').y).toBeCloseTo(7, 6);
    expect(P('B').z).toBeCloseTo(6, 6);
    expect(P('A').x).toBeCloseTo(0, 4);
    expect(P('A').y).toBeCloseTo(-3, 4); // the sign given kept its branch
    expect(P('A').z).toBeCloseTo(1, 4);
    expect(dist3(P('A'), P('B'))).toBeCloseTo(5 * Math.sqrt(5), 4);
    for (const id of ["A'", "B'", "C'", "D'"]) {
      const p = P(id);
      expect(Math.abs(p.x + 4 * p.y - 8 * p.z - 142)).toBeLessThan(1e-4); // top face on its plane
    }
    // the driven depth = the closed form |AD| = 40√3/9
    expect(dist3(P('A'), P('D'))).toBeCloseTo((40 * Math.sqrt(3)) / 9, 3);
  });

  it('"show another configuration" keeps the membership satisfied (a requirement, not a sample)', () => {
    for (const u of EXAM) submit(u);
    submit("M על מישור DCC'D'");
    for (const seed of [1, 2, 3]) {
      const d = derived(seed);
      expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
      expect(planeDist(d, "DCC'D'", 'M')).toBeLessThan(1e-4);
    }
  });

  it('order-independence (M2): the membership typed BEFORE the pinning givens still lands the same figure', () => {
    // the membership arrives right after M exists; the angle + sign givens come later
    submit('תיבה');
    submit("מישור A'B'C'D' הוא x+4y-8z-142=0");
    submit('B(0,7,6)');
    submit('משוואת הישר AB היא x = (0,7,6) + t(0,2,1)');
    submit('אורך המקצוע AB הוא 5√5');
    submit('שיעור ה-y של הקודקוד A שלילי');
    submit('M(k, 1, 3)');
    submit("M על מישור DCC'D'"); // ← early
    submit('הזוית בין AB ו AM היא 60');
    submit('k>0');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.resolved.param?.value).toBeCloseTo(2 * Math.sqrt(15), 5);
    expect(planeDist(d, "DCC'D'", 'M')).toBeLessThan(1e-4);
    const P = (id: string) => d.resolved.positions.get(id)!;
    expect(dist3(P('A'), P('D'))).toBeCloseTo((40 * Math.sqrt(3)) / 9, 3);
  });
});

describe('ADR-3D-033 — the class, beyond the reported instance', () => {
  beforeEach(reset);

  it('a coordinate point stated onto a free box face drives the box (no parameter involved)', () => {
    submit('תיבה');
    submit('M(4, 1, 3)');
    submit("M על מישור DCC'D'");
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(planeDist(d, "DCC'D'", 'M')).toBeLessThan(1e-4);
    // resample: the membership survives every configuration
    useGeo3.getState().resample();
    const d2 = derived();
    expect(planeDist(d2, "DCC'D'", 'M')).toBeLessThan(1e-4);
  });

  it('an existing vertex stated onto a numeric EQUATION plane drives placement', () => {
    submit('תיבה');
    submit('המישור π1: z-8=0');
    submit("A' על המישור π1");
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.resolved.positions.get("A'")!.z).toBeCloseTo(8, 3);
  });

  it('an IMPOSSIBLE membership still refuses honestly: a cube vertex cannot reach the opposite diagonal plane', () => {
    // a cube is rigid up to similarity — no free DOF can put A on plane BC'D
    submit('קובייה ABCD');
    const n = state().facts.length;
    submit("A על המישור BC'D");
    expect(state().facts).toHaveLength(n); // keep-prior
    expect(state().lastError).toEqual({ code: 'not-on-plane', id: 'A' });
  });

  it('a degenerate-only "solution" is rejected: B on face DCC\'D\' would need depth 0 (a collapsed box)', () => {
    for (const u of EXAM) submit(u);
    const n = state().facts.length;
    submit("B על מישור DCC'D'"); // B−C ∥ the face normal — only a zero depth "satisfies" it
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).toEqual({ code: 'not-on-plane', id: 'B' });
  });

  it("a driven membership never breaks sibling givens (transactional): the figure with M on the WRONG side still keeps A's sign", () => {
    for (const u of EXAM) submit(u);
    submit("M על מישור DCC'D'");
    const d = derived();
    expect(d.resolved.positions.get('A')!.y).toBeLessThan(0); // the sign given held through the drive
    expect(d.resolved.param?.roots?.length).toBeGreaterThan(0); // the root-find survived
  });
});
