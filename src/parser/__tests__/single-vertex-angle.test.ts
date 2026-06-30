import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

/**
 * Single-vertex angle value — "∠B = 90" / "זווית B = 90". Resolves the two arms from the figure's
 * `neighbors` ONLY when the vertex has exactly two edges (one possible angle); with a different count the
 * intended angle is ambiguous, so the parser returns a clarification ('ambiguous-angle') asking the student
 * to name all three letters, rather than guessing or escalating to the LLM.
 */
const sa = (cmds: any[]) => cmds.find((c) => c.type === 'set-angle');

describe('single-vertex angle value', () => {
  const ctx2 = { points: ['A', 'B', 'C'], circles: [], circleMembers: [], neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } } as any;

  it('"זווית B = 90" with exactly 2 edges → set-angle, arms A,C from neighbors', () => {
    const r = parse('זווית B = 90', ctx2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sa(r.commands)).toMatchObject({ vertex: 'B', value: 90 });
    if (r.ok) expect(new Set([sa(r.commands).ray1, sa(r.commands).ray2])).toEqual(new Set(['A', 'C']));
  });

  it('English "angle B = 90" works the same', () => {
    const r = parse('angle B = 90', ctx2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sa(r.commands)).toMatchObject({ vertex: 'B', value: 90 });
  });

  it('"∠B = 90" with >2 edges at B → ambiguous, asks for three letters', () => {
    const ctx3 = { points: ['A', 'B', 'C', 'D'], circles: [], circleMembers: [], neighbors: { B: ['A', 'C', 'D'] } } as any;
    const r = parse('∠B = 90', ctx3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-angle');
    if (!r.ok && r.reason === 'ambiguous-angle') expect(r.vertex).toBe('B');
  });

  it('"∠B = 90" with the vertex absent (no edges) → ambiguous (no arms to use)', () => {
    const r = parse('∠B = 90', { points: [], circles: [], circleMembers: [], neighbors: {} } as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-angle');
  });

  it('the three-letter form still parses regardless of neighbors', () => {
    const r = parse('זווית ABC = 90', { points: [], circles: [], circleMembers: [], neighbors: {} } as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sa(r.commands)).toMatchObject({ vertex: 'B', ray1: 'A', ray2: 'C', value: 90 });
  });
});
