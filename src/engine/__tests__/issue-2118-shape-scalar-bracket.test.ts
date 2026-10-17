/**
 * #2118 ([ADR-717](../../../docs/06-decisions.md#adr-717)) — A DRIVEN SHAPE SCALAR IS BRACKETED ON THE FAILURE PATH.
 *
 * «טרפז ABCD» · «טרפז ABCD חסום במעגל» folds the trapezoid's top to `C = D + k·(B − A)` driven by
 * `concyclic(A, B, C, D)`. At seed 1 the sampled A, B, D have an exact convex root k = 1.590 (C is D reflected
 * in AB's perpendicular bisector), but the joint solve starts at the fold's k = 0.6 and reaches only the near
 * basin and the cardinal restarts (u ± 0.5…2) — it descended toward the collapsed root k = 0 and failed, and the
 * figure read «A, B, D are still free». The rescue gives the scalar a bracket (ADR-071's radius bracket,
 * extended) and seeds one more multi-start from the binding-aware sweep — on the failure path only.
 */
import { describe, expect, it } from 'vitest';
import { evaluate, drivenSolveStats } from '../evaluate';
import type { Construction } from '../types';

/** The fold's construction at a sampled A, B, D: C a scaled offset of D along A→B, k driven by the concyclicity. */
function cyclicTrapezoid(A: [number, number], B: [number, number], D: [number, number], k = 0.6): Construction {
  return {
    objects: [
      { kind: 'free-point', id: 'A', x: A[0], y: A[1] },
      { kind: 'free-point', id: 'B', x: B[0], y: B[1] },
      { kind: 'free-point', id: 'D', x: D[0], y: D[1] },
      { kind: 'scaled-offset', id: 'C', anchor: 'D', from: 'A', to: 'B', k, solve: { constraint: { type: 'concyclic', points: ['A', 'B', 'C', 'D'] }, branch: 0 } },
      { kind: 'polygon', id: 'poly-ABCD', vertices: ['A', 'B', 'C', 'D'], declaredAs: 'trapezoid' },
    ],
    constraints: [
      { type: 'concyclic', points: ['A', 'B', 'C', 'D'] },
      { type: 'parallel', a: 'A', b: 'B', c: 'C', d: 'D' },
    ],
  } as Construction;
}

/** The sampled A, B, D of the reported seed (seed 1 of the operator's two lines, measured at de7c221f). */
const SEED1 = {
  A: [0.898364399516653, 0.767541069277712] as [number, number],
  B: [6.8819664072749065, -0.06202354843875568] as [number, number],
  D: [-0.7163149745710446, 2.091893112364928] as [number, number],
};

describe('#2118 — a driven shape scalar whose root lies outside the restarts’ reach still solves', () => {
  it('the reported seed: the solve from k₀ = 0.6 lands on the convex root C = (8.796, 0.773)', () => {
    const before = drivenSolveStats.shapeRescue;
    const r = evaluate(cyclicTrapezoid(SEED1.A, SEED1.B, SEED1.D));
    expect(r.ok, JSON.stringify(r.ok ? '' : r)).toBe(true);
    if (!r.ok) return;
    const C = r.positions.get('C')!;
    expect(C.x).toBeCloseTo(8.796, 3);
    expect(C.y).toBeCloseTo(0.7731, 3);
    // the closed form: C is D reflected in AB's perpendicular bisector
    const [ax, ay] = SEED1.A, [bx, by] = SEED1.B, [dx, dy] = SEED1.D;
    const ux = (bx - ax) / Math.hypot(bx - ax, by - ay), uy = (by - ay) / Math.hypot(bx - ax, by - ay);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const along = (dx - mx) * ux + (dy - my) * uy;
    expect(C.x).toBeCloseTo(dx - 2 * along * ux, 6);
    expect(C.y).toBeCloseTo(dy - 2 * along * uy, 6);
    expect(drivenSolveStats.shapeRescue - before, 'the rescue is what solved it').toBe(1);
  });

  it('a solve that already succeeds never reaches the rescue (the success path is bit-identical)', () => {
    const before = drivenSolveStats.shapeRescue;
    const r = evaluate(cyclicTrapezoid([0, 0], [6, 0], [1, 3]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.positions.get('C')!.x).toBeCloseTo(5, 6);
    expect(r.positions.get('C')!.y).toBeCloseTo(3, 6);
    expect(drivenSolveStats.shapeRescue - before, 'no rescue on a green solve').toBe(0);
  });
});
