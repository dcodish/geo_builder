/**
 * #104 — a BARE free point «נקודה A» / «point A» (no coordinates) creates a 2-DOF free point positioned by
 * the next statement. A core primitive of the original model the rebuild never re-exposed. (ADR-052 free
 * DOF; prod log-triage 2026-07-13, ~4 distinct users.)
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const cmds = (u: string, ctx?: Parameters<typeof parse>[1]): AnyCommand[] => {
  const r = parse(u, ctx as never);
  expect(r.ok, u).toBe(true);
  return r.ok ? r.commands : [];
};
const fp = (u: string) => cmds(u).find((c) => c.type === 'free-point') as
  | { id: string; x: number; y: number; free?: boolean; ifAbsent?: boolean }
  | undefined;

describe('#104 — bare free point', () => {
  it('«נקודה A» / «הוסף נקודה A» / «point A» / «add point A» build a free 2-DOF point', () => {
    for (const u of ['נקודה A', 'הוסף נקודה P', 'point G', 'add point Q']) {
      const p = fp(u);
      expect(p, u).toMatchObject({ free: true, ifAbsent: true }); // a sampled DOF, idempotent (M1 no-op)
    }
    expect(fp('נקודה A')!.id).toBe('A');
    expect(fp('point G')!.id).toBe('G');
  });

  it('the coordinate form «נקודה A ב-(0,0)» / «A = (3,4)» still PINS (not a bare free point)', () => {
    const p = fp('נקודה A ב-(0,0)')!;
    expect(p).toMatchObject({ id: 'A', x: 0, y: 0 });
    expect(p.free).toBeUndefined(); // pinned, no free flag
    expect(fp('A = (3, 4)')!.x).toBe(3);
  });

  it('a trailing relation is NOT swallowed — «נקודה A על AB» stays a point-on-segment', () => {
    const c = cmds('נקודה A על AB');
    expect(c.some((x) => x.type === 'point-on-segment')).toBe(true);
    expect(c.some((x) => x.type === 'free-point')).toBe(false);
  });

  it('a lone letter «C» is NOT a bare free point (stays escalation)', () => {
    const r = parse('C', {} as never);
    // not claimed by bareFreePoint (keyword required) — either not-handled or a different rule, never a free-point-C
    if (r.ok) expect(r.commands.some((c) => c.type === 'free-point' && (c as { id: string }).id === 'C')).toBe(false);
  });
});
