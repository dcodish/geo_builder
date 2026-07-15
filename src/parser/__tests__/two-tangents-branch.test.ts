/**
 * Two single tangents from the same external apex are DISTINCT ([ADR-333](../../../docs/06-decisions.md#adr-333),
 * issue #142): `tangentFromExternal` always emitted `branch: 0`, so two «tangent from A» statements shared the
 * deterministic Thales aux circle `tanaux-OA` and both took branch 0 → the two touch points coincided. The
 * SECOND tangent from the same apex (its aux circle already present, via `ctx.tangentAuxes`) now takes branch 1.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const F = (id: string, cmd: AnyCommand): Fact => ({ id, cmd, enabled: true });
const branchOf = (cmds: AnyCommand[]) =>
  (cmds.find((c) => c.type === 'circle-circle-intersection') as { branch?: number } | undefined)?.branch;

describe('two tangents from the same apex (#142)', () => {
  it('the FIRST tangent from A takes branch 0; the SECOND takes branch 1', () => {
    const facts: Fact[] = [F('c', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand)];

    // first tangent from A → branch 0 (no aux circle yet)
    let d = replay(facts);
    const r1 = parse('מנקודה A יוצא משיק למעגל בנקודה B', buildParseCtx(d.construction, d.positions));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(branchOf(r1.commands)).toBe(0);
    r1.commands.forEach((cmd, i) => facts.push(F(`t1.${i}`, cmd)));

    // the aux circle now exists → the context surfaces it
    d = replay(facts);
    const ctx = buildParseCtx(d.construction, d.positions);
    expect(ctx.tangentAuxes).toContain('tanaux-OA');

    // second tangent from the SAME apex A → branch 1 (the OTHER touch)
    const r2 = parse('מנקודה A יוצא משיק למעגל בנקודה C', ctx);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(branchOf(r2.commands)).toBe(1);
  });

  it('a tangent from a DIFFERENT apex is still branch 0 (its own aux circle)', () => {
    const facts: Fact[] = [
      F('c', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand),
      // an existing tangent from A (aux tanaux-OA present)
      F('a', { type: 'free-point', id: 'A', x: 12, y: 0, free: true } as AnyCommand),
      F('m', { type: 'midpoint', id: '~tanmid-OA', a: 'O', b: 'A' } as AnyCommand),
      F('x', { type: 'circle-through', id: 'tanaux-OA', center: '~tanmid-OA', through: 'O', hidden: true } as AnyCommand),
      F('b', { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'tanaux-OA', branch: 0 } as AnyCommand),
    ];
    const d = replay(facts);
    // a tangent from a NEW apex E → its aux tanaux-OE does not exist → branch 0
    const r = parse('מנקודה E יוצא משיק למעגל בנקודה F', buildParseCtx(d.construction, d.positions));
    expect(r.ok).toBe(true);
    if (r.ok) expect(branchOf(r.commands)).toBe(0);
  });
});
