/**
 * Givens verifier — checkGivens re-derives the relations the INPUT asserts and checks them against
 * the final coordinates, so a figure that applied cleanly but doesn't match its givens is caught
 * (the "green ≠ correct" net). See src/engine/verify.ts.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate, checkGivens } from '@/engine';
import type { Command } from '@/engine';

const cmdsOf = (u: string): Command[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse failed: ${u}`);
  return r.commands as Command[];
};

describe('checkGivens — does the figure satisfy its stated givens?', () => {
  it('a valid two-circle figure reports NO violations', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    expect(checkGivens(cmds, ev.positions, ev.circles)).toEqual([]);
  });

  it('CATCHES a point that drifted off its circle, even though every step applied (green ≠ correct)', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    // Simulate the failure class: a point that should be on both circles ends up nowhere near them
    // (a silently-dropped on-circle fact, or a solver that drifted). The verifier must flag it.
    const tampered = new Map(ev.positions);
    const A = tampered.get('A')!;
    tampered.set('A', { x: A.x + 100, y: A.y + 100 });
    const v = checkGivens(cmds, tampered, ev.circles);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.relation === 'on-circle' && x.ids.includes('A'))).toBe(true);
  });

  it('a point exactly on its circle is NOT flagged (no false positives)', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    // B is constructed exactly on both circles — must pass clean.
    expect(checkGivens(cmds, ev.positions, ev.circles).some((x) => x.ids.includes('B'))).toBe(false);
  });
});
