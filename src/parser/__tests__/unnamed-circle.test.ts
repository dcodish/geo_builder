import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

/**
 * Operator principle (2026-06-22): "when there is only ONE circle in the diagram, I should not have to
 * say its name." A rule that refers to a circle by the definite article ("the circle" / "המעגל") must
 * resolve to the single circle in context — but a generic line∩line / point-on-extension that mentions
 * NO circle must NOT be silently grabbed as a circle intersection (ADR-083).
 */
const oneCircle = { circles: ['O'], points: ['A', 'B', 'C', 'D', 'O'], circleMembers: [{ center: 'O', points: ['C', 'D'] }] };
const types = (u: string) => {
  const r = parse(u, oneCircle);
  return r.ok ? r.commands.map((c) => c.type) : null;
};

describe('one circle → no name needed (ADR-083)', () => {
  it('"BD cuts the circle at A" (unnamed) resolves to a line-circle intersection', () => {
    expect(types('BD חותך את המעגל בנקודה A')).toContain('line-circle-intersection');
    expect(types('BD cuts the circle at A')).toContain('line-circle-intersection');
  });

  it('"the extension of AC meets the circle at D" (unnamed) resolves to extend-onto-circle', () => {
    expect(types('המשך AC חותך את המעגל בנקודה D')).toContain('extend-onto-circle');
    expect(types('the extension of AC meets the circle at D')).toContain('extend-onto-circle');
  });

  it('still works when the circle IS named (no regression)', () => {
    expect(types('BD חותך את מעגל O בנקודה A')).toContain('line-circle-intersection');
  });

  it('NEGATIVE: a plain line∩line that mentions NO circle stays a line-line intersection', () => {
    const t = types('AC חותך את BD בנקודה E');
    expect(t).toContain('line-line-intersection');
    expect(t).not.toContain('line-circle-intersection');
  });
});
