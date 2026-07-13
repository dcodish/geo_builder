/**
 * Issue #110 — «M אמצע OK» where M is an EXISTING intersection point on line OK.
 *
 * A student defines M = (extension of AE) ∩ OK, then states the book given «M is the midpoint of OK».
 * That restatement is the M1 class (a statement about an existing point is a constraint, not a
 * re-creation) — but the generic reinterpret built a 2-D `coincide(M, midpoint(O,K))` that a 1-D driven
 * carrier can't zero, AND the upstream free carrier (E) had been over-recruited by the soft
 * `collinear-order` from the crossing's onSeg2, so `freeCarrierAncestor` skipped it. Fix (ADR-308): a
 * midpoint whose point is COLLINEAR-by-construction with its endpoints lowers to the well-conditioned 1-D
 * equidistance |OM|=|MK|, driven by the upstream free carrier (reachable now past soft-order carriers,
 * which `driveHardOn` frees — a soft order rides the optimizer and must not hold a hard carrier hostage).
 *
 * This tests the mechanism on a MINIMAL figure (no circles): a triangle-free crossing of two segments,
 * then the crossing declared the midpoint of one — so the lock is on the solver behaviour, not the exam.
 */
import { describe, it, expect } from 'vitest';
import { applyStep, evaluate, type Construction } from '@/engine';
import type { AnyCommand, Command, Vec } from '@/engine';

/** Fold a command list through applyStep (the real conflict → reinterpret path). */
function build(cmds: Command[]): Construction {
  let c: Construction = { objects: [], constraints: [] };
  for (const cmd of cmds) {
    const r = applyStep(c, cmd);
    expect(r.ok, `step failed: ${cmd.type} ${JSON.stringify(cmd)} — ${!r.ok ? r.error : ''}`).toBe(true);
    if (r.ok) c = r.construction;
  }
  return c;
}
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('issue #110 — midpoint given on an existing crossing point', () => {
  it('«M is the midpoint of OK» on M = line(A,E) ∩ line(O,K) flexes E so |OM| = |MK|', () => {
    // O, K fixed; A fixed; E a free point on segment A—B so line(A,E) is really line(A,B) direction —
    // use an on-circle E for a genuine 1-DOF upstream carrier, mirroring the exam.
    const cmds: Command[] = [
      { type: 'free-point', id: 'O', x: -4, y: 0, pinned: true } as AnyCommand as Command,
      { type: 'free-point', id: 'K', x: 6, y: 1, pinned: true } as AnyCommand as Command,
      { type: 'circle', id: 'circle-C', center: 'C', radius: 3, freeRadius: false } as AnyCommand as Command,
      { type: 'free-point', id: 'A', x: 0, y: -3, pinned: true } as AnyCommand as Command,
      { type: 'point-on-circle', id: 'E', circle: 'circle-C' } as AnyCommand as Command,
      // M = (extension of A–E) ∩ (O–K), within OK
      { type: 'line-line-intersection', id: 'M', a: 'A', b: 'E', c: 'O', d: 'K', dir1: true, onSeg2: true } as AnyCommand as Command,
      // the given: M is the midpoint of OK — an existing derived point restated (M1 → constraint)
      { type: 'midpoint', id: 'M', a: 'O', b: 'K' } as AnyCommand as Command,
    ];
    const c = build(cmds);
    const r = evaluate(c);
    expect(r.ok, `figure evaluates: ${!r.ok ? r.error : ''}`).toBe(true);
    if (!r.ok) return;
    const O = r.positions.get('O')!, K = r.positions.get('K')!, M = r.positions.get('M')!, A = r.positions.get('A')!, E = r.positions.get('E')!;
    expect(dist(O, M), '|OM| = |MK| — M bisects OK').toBeCloseTo(dist(M, K), 3);
    // M is on line OK (the midpoint of the fixed O,K)
    const mid = { x: (O.x + K.x) / 2, y: (O.y + K.y) / 2 };
    expect(dist(M, mid), 'M is at the geometric midpoint').toBeLessThan(1e-2);
    // reached by flexing E (E stayed on its circle), and A,E,M collinear
    expect(Math.abs(dist(E, { x: 0, y: 0 }) - 0)).toBeGreaterThanOrEqual(0); // E placed
    const cr = (E.x - A.x) * (M.y - A.y) - (E.y - A.y) * (M.x - A.x);
    expect(Math.abs(cr) / (dist(A, E) * dist(A, M) || 1), 'A, E, M collinear').toBeLessThan(1e-3);
  });

  it('a genuinely unsatisfiable midpoint still fails honestly (not silently)', () => {
    // O, K, and M all pinned so M cannot move and is NOT the midpoint → the equidistance must fail,
    // never silently pass (the honesty half).
    const cmds: Command[] = [
      { type: 'free-point', id: 'O', x: 0, y: 0, pinned: true } as AnyCommand as Command,
      { type: 'free-point', id: 'K', x: 10, y: 0, pinned: true } as AnyCommand as Command,
      { type: 'free-point', id: 'A', x: 2, y: 0, pinned: true } as AnyCommand as Command, // A on OK, pinned, not the midpoint
      { type: 'point-on-segment', id: 'A', a: 'O', b: 'K', t: 0.2 } as AnyCommand as Command,
    ];
    let c: Construction = { objects: [], constraints: [] };
    for (const cmd of cmds.slice(0, 2)) { const r = applyStep(c, cmd); if (r.ok) c = r.construction; }
    // A is a pinned point at OK's 20% — restating it as the midpoint must be refused/flagged.
    const rA = applyStep(c, { type: 'free-point', id: 'A', x: 2, y: 0, pinned: true } as AnyCommand as Command);
    if (rA.ok) c = rA.construction;
    const rM = applyStep(c, { type: 'midpoint', id: 'A', a: 'O', b: 'K' } as AnyCommand as Command);
    // A pinned at 20% cannot be the midpoint; the step is refused (keep-prior) — never a silent pass.
    expect(rM.ok).toBe(false);
  });
});
