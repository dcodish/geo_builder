import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

/**
 * Angle ACUTENESS — "זווית קהה" (obtuse, >90°) / "זווית חדה" (acute, <90°), ADR-108. Named by three
 * letters (vertex = middle) or by a SINGLE vertex (arms resolved from the figure's `neighbors`).
 */
const ctx = { points: ['A', 'B', 'C', 'D'], circles: [], circleMembers: [], neighbors: { C: ['A', 'B'] } } as any;
const ac = (cmds: any[]) => cmds.find((c) => c.type === 'set-angle-acuteness');

describe('angle acuteness (obtuse/acute)', () => {
  it('"∠ABC קהה" → obtuse at vertex B', () => {
    const r = parse('∠ABC קהה', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ac(r.commands)).toMatchObject({ vertex: 'B', ray1: 'A', ray2: 'C', obtuse: true });
  });

  it('"∠ABC חדה" → acute at vertex B', () => {
    const r = parse('∠ABC חדה', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ac(r.commands)).toMatchObject({ vertex: 'B', obtuse: false });
  });

  it('English "angle ABC is obtuse"', () => {
    const r = parse('angle ABC is obtuse', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ac(r.commands)).toMatchObject({ vertex: 'B', obtuse: true });
  });

  it('single-vertex "∠C קהה" resolves arms A,B from neighbors', () => {
    const r = parse('∠C קהה', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ac(r.commands)).toMatchObject({ vertex: 'C', obtuse: true });
  });

  it('single-vertex "זווית C חדה" → acute', () => {
    const r = parse('זווית C חדה', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ac(r.commands)).toMatchObject({ vertex: 'C', obtuse: false });
  });

  it('stating the angle also draws its arms (idempotent segments)', () => {
    const r = parse('∠ABC קהה', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.filter((c) => c.type === 'segment')).toHaveLength(2);
  });

  it('a single vertex with no resolvable arms (no neighbors) does NOT match here', () => {
    const r = parse('∠C קהה', { points: ['C'] } as any);
    // No neighbors → the acuteness rule returns null; the LTR fallback won't build it → not ok.
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-angle-acuteness')).toBe(false);
  });
});
