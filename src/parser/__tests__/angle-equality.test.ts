import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

/**
 * Angle EQUALITY "∠ABC = ∠DEF" (ADR-100). The operator typed "∠GEC=∠CBA" on the bagrut-Q4 figure and
 * it returned not-understood — the `angle` rule requires a numeric value, so a two-angle equality fell
 * through. The engine already has the relation (`set-angle-ratio` k=1, as `similarity` uses); this adds
 * the parser rule. Both Hebrew ("זווית") and the ∠ symbol, with an optional coefficient on the RHS.
 */
const ctx = { points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], circles: [], circleMembers: {} } as any;
const ratio = (cmds: any[]) => cmds.find((c) => c.type === 'set-angle-ratio');

describe('angle equality ∠1 = ∠2', () => {
  it('∠GEC = ∠CBA → ∠(G,E,C) = ∠(C,B,A)', () => {
    const r = parse('∠GEC=∠CBA', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ratio(r.commands)).toMatchObject({ type: 'set-angle-ratio', v1: 'E', a1: 'G', b1: 'C', v2: 'B', a2: 'C', b2: 'A', k: 1 });
  });

  it('Hebrew "זווית ABC = זווית DEF"', () => {
    const r = parse('זווית ABC = זווית DEF', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ratio(r.commands)).toMatchObject({ v1: 'B', a1: 'A', b1: 'C', v2: 'E', a2: 'D', b2: 'F', k: 1 });
  });

  it('English "angle ABC = angle DEF"', () => {
    const r = parse('angle ABC = angle DEF', ctx);
    expect(r.ok && ratio(r.commands)?.k).toBe(1);
  });

  it('coefficient: "∠ABC = 2∠DEF" → k = 2', () => {
    const r = parse('∠ABC = 2∠DEF', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ratio(r.commands)).toMatchObject({ v1: 'B', v2: 'E', k: 2 });
  });

  it('draws both angles\' arms (idempotent segments)', () => {
    const r = parse('∠ABC = ∠DEF', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const segs = r.commands.filter((c) => c.type === 'segment');
    expect(segs).toHaveLength(4); // BA, BC, ED, EF
  });

  it('a single angle with a NUMERIC value is still the `angle` rule (set-angle), not equality', () => {
    const r = parse('∠ABC = 37', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-angle')).toBe(true);
    expect(r.commands.some((c) => c.type === 'set-angle-ratio')).toBe(false);
  });

  it('a single angle with a SYMBOLIC value is still measureAngle, not equality', () => {
    const r = parse('∠ABC = 2α', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'measure-angle')).toBe(true);
    expect(r.commands.some((c) => c.type === 'set-angle-ratio')).toBe(false);
  });

  it('a bare segment equality "AB = CD" (no angle marker) is NOT read as angle equality', () => {
    const r = parse('AB = CD', ctx);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-angle-ratio')).toBe(false);
  });
});
