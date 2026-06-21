/**
 * Givens verifier — checkGivens re-derives the relations the INPUT asserts and checks them against
 * the final coordinates, so a figure that applied cleanly but doesn't match its givens is caught
 * (the "green ≠ correct" net). See src/engine/verify.ts.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate, checkGivens } from '@/engine';
import type { Command, Id } from '@/engine';

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

// Comprehensive metric / incidence verification (ADR-053 extended): re-derive each asserted relation
// and check it against the final coordinates. A built figure passes clean; a tampered point is flagged
// with the right relation type — proving the new checks actually fire (not silently skip).
describe('checkGivens — metric & incidence relations', () => {
  /** Build a figure, assert it verifies clean, then tamper `move` and assert the relation is flagged. */
  const probe = (cmds: Command[], move: Id, rel: string) => {
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok, 'figure builds').toBe(true);
    if (!ev.ok) return;
    expect(checkGivens(cmds, ev.positions, ev.circles), 'the built figure satisfies its givens').toEqual([]);
    const tampered = new Map(ev.positions);
    const p = tampered.get(move)!;
    tampered.set(move, { x: p.x + 7, y: p.y + 9 }); // shove it well past any tolerance
    const v = checkGivens(cmds, tampered, ev.circles);
    expect(v.some((x) => x.relation === rel), `a broken ${rel} relation is flagged`).toBe(true);
  };

  it('flags a violated DISTANCE given (and passes a satisfied one)', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-distance', a: 'A', b: 'B', value: 6 }], 'B', 'distance');
  });
  it('flags a violated ANGLE given', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 50 }], 'A', 'angle');
  });
  it('flags a violated PERPENDICULAR given', () => {
    probe([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }], 'B', 'perpendicular');
  });
  it('flags a violated PARALLEL given', () => {
    probe([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-parallel', a: 'A', b: 'B', c: 'D', d: 'C' }], 'B', 'parallel');
  });
  it('flags a violated EQUAL-segments given', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' }], 'B', 'equal');
  });
});
