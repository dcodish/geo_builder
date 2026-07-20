/**
 * #230 / ADR-377 — the point-on-circle (d) fall-through pushes the membership as a RESIDUAL
 * (`length-radius` k=1 through a witness member) instead of leaving it verifier-amber-only. The
 * reported member: «BC מיתר במעגל» over rectangle ABCD — B (free) converts to a rider, C (the
 * derived perp-offset corner) used to stay off the circle forever with every structural
 * reinterpretation cycle-gated; the residual now drives the free radius/centre so BC is a real
 * chord. An IMPOSSIBLE membership (a rigid figure) is an honest over-constraint refusal — never
 * silent green, never amber-forever.
 */
import { describe, expect, it } from 'vitest';
import { build, applyStep, evaluate } from '../index';
import { checkGivens } from '../verify';
import type { AnyCommand, Command } from '../index';

describe('#230 — membership on a derived point is DRIVEN via the residual', () => {
  it('«BC מיתר» over a rectangle: both endpoints land exactly on the circle', () => {
    const cmds: AnyCommand[] = [
      { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, ifAbsent: true },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'segment', a: 'B', b: 'C' },
    ];
    const { construction, positions } = build(cmds);
    const O = positions.get('O')!;
    const dB = Math.hypot(positions.get('B')!.x - O.x, positions.get('B')!.y - O.y);
    const dC = Math.hypot(positions.get('C')!.x - O.x, positions.get('C')!.y - O.y);
    expect(Math.abs(dB - dC), '|OB| = |OC| — BC a real chord').toBeLessThan(1e-3);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const violations = checkGivens(cmds as Command[], ev.positions, ev.circles);
    expect(violations.filter((v) => v.relation === 'on-circle'), 'memberships verified').toEqual([]);
  });

  it('an IMPOSSIBLE membership on a rigid figure refuses honestly (over-constrained), never silent green', () => {
    // circle centred at the square's A through corner C (radius = the diagonal); asking corner D on it
    // demands |AD| = |AC| — impossible on the square (side ≠ diagonal), and no free DOF can fix it
    const base = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'circle-through', id: 'circle-A', center: 'A', through: 'C' },
    ]);
    const r = applyStep(base.construction, { type: 'point-on-circle', id: 'D', circle: 'circle-A' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained|cannot hold/i);
  });
});
