import { describe, it, expect } from 'vitest';
import { build, evaluate } from '@/engine';
import type { Command, Vec } from '@/engine';

/**
 * #161: a triangle drawn on a NEW canvas uses the textbook orientation — the first
 * vertex (A) at the apex, the other two on a horizontal base, B bottom-right and C
 * bottom-left (operator choice). Still deliberately scalene: a generic triangle must
 * not silently read as isosceles (ADR-052/ADR-085).
 */
const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);

describe('default triangle orientation (#161)', () => {
  const cmds: Command[] = [{ type: 'triangle', ids: ['A', 'B', 'C'] }];

  it('A is at the apex, BC is the horizontal base, B on the right', () => {
    const ev = evaluate(build(cmds).construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => ev.positions.get(id)!);
    expect(A.y).toBeGreaterThan(B.y); // apex above the base
    expect(A.y).toBeGreaterThan(C.y);
    expect(B.y).toBeCloseTo(C.y, 9); // base horizontal
    expect(B.x).toBeGreaterThan(C.x); // B bottom-right, C bottom-left
  });

  it('the default triangle stays scalene (no silently-asserted equal pair)', () => {
    const ev = evaluate(build(cmds).construction);
    if (!ev.ok) return;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => ev.positions.get(id)!);
    const [ab, bc, ca] = [d(A, B), d(B, C), d(C, A)];
    expect(Math.abs(ab - bc)).toBeGreaterThan(0.5);
    expect(Math.abs(bc - ca)).toBeGreaterThan(0.5);
    expect(Math.abs(ab - ca)).toBeGreaterThan(0.5);
  });
});
