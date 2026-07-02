/**
 * Verifier tolerance ladder — PINNED ([docs/15-hardening-plan.md](../../../docs/15-hardening-plan.md) A4 / TST-6).
 *
 * The 2026-07-02 review flagged that the givens verifier's incidence tolerance (`onCircleTol = max(0.05,
 * 2%·r)`, [verify.ts](../verify.ts)) is ~100× looser than the solver's own accept tolerance — and on the
 * under-determined figures ONLY the verifier guards, so a point can drift visibly and still read green.
 * Nothing pinned the ladder, so a future "loosen to stop false ambers" edit could silently take 2% to 10%.
 *
 * This test builds a verified on-circle figure and asserts the boundary is where it should be: a point
 * displaced by HALF the tolerance stays clean, and one displaced by TWICE the tolerance is flagged. Widen
 * the ladder and the 2×-displaced case stops flagging → this fails, forcing an explicit, reviewed change.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate, checkGivens } from '@/engine';
import type { Command, Vec } from '@/engine';

/** The verifier's on-circle tolerance (mirror of `onCircleTol` in verify.ts — pinned here on purpose). */
const onCircleTol = (r: number) => Math.max(0.05, r * 0.02);

describe('verifier on-circle tolerance is pinned (A4/TST-6)', () => {
  // "circle centered at O radius 5" + "A on circle O" — A is a genuine on-circle given the verifier checks.
  const cmds: Command[] = [
    ...(parse('circle centered at O radius 5').ok ? (parse('circle centered at O radius 5') as { commands: Command[] }).commands : []),
    ...(parse('A is on circle O', { circles: ['O'] }).ok ? (parse('A is on circle O', { circles: ['O'] }) as { commands: Command[] }).commands : []),
  ];

  const setup = () => {
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    if (!ev.ok) throw new Error(ev.error);
    const circle = ev.circles.get('circle-O')!;
    return { ev, circle };
  };

  /** Place A at radial distance `r + delta` from the centre (delta>0 pushes it off the circle outward). */
  const displaceRadially = (positions: Map<string, Vec>, center: Vec, r: number, delta: number): Map<string, Vec> => {
    const A = positions.get('A')!;
    const ux = (A.x - center.x) / r;
    const uy = (A.y - center.y) / r;
    const m = new Map(positions);
    m.set('A', { x: center.x + ux * (r + delta), y: center.y + uy * (r + delta) });
    return m;
  };

  it('the built figure verifies clean (A exactly on the circle)', () => {
    const { ev } = setup();
    expect(checkGivens(cmds, ev.positions, ev.circles)).toEqual([]);
  });

  it('a point displaced by HALF the tolerance stays green', () => {
    const { ev, circle } = setup();
    const tol = onCircleTol(circle.r);
    const moved = displaceRadially(ev.positions, circle.center, circle.r, 0.5 * tol);
    expect(checkGivens(cmds, moved, ev.circles).some((v) => v.relation === 'on-circle')).toBe(false);
  });

  it('a point displaced by TWICE the tolerance is FLAGGED (the ladder has not been widened)', () => {
    const { ev, circle } = setup();
    const tol = onCircleTol(circle.r);
    const moved = displaceRadially(ev.positions, circle.center, circle.r, 2 * tol);
    expect(checkGivens(cmds, moved, ev.circles).some((v) => v.relation === 'on-circle' && v.ids.includes('A'))).toBe(true);
  });
});
