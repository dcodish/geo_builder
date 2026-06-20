/**
 * "the circle circumscribing triangle ABC cuts CE at D" (`circumcircleMeetsSegment`) — the circumcircle
 * of a triangle intersected with a segment. The operator's input didn't parse (even via the LLM); this
 * pins the construct and its regression guards (triangle-rule defer, fresh circumcircle centre).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { Command } from '@/engine';

const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'E'] };
const types = (u: string) => {
  const r = parse(u, ctx);
  return r.ok ? r.commands.map((c) => c.type) : ['NOT-HANDLED'];
};

describe('circumcircle of a triangle cuts a segment', () => {
  it('"המעגל החוסם את משולש ABC חותך את CE בנקודה D" → circumcircle + line∩circle (avoid the shared vertex C)', () => {
    const r = parse('המעגל החוסם את משולש ABC חותך את CE בנקודה D', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cc = r.commands.find((c) => c.type === 'circumcircle') as Extract<Command, { type: 'circumcircle' }>;
    expect([cc.a, cc.b, cc.c]).toEqual(['A', 'B', 'C']);
    expect(cc.center, 'a FRESH centre — not the existing circle O').not.toBe('O');
    expect(r.commands).toContainEqual({ type: 'line-through', id: 'line-CE', a: 'C', b: 'E' });
    const lc = r.commands.find((c) => c.type === 'line-circle-intersection') as Extract<Command, { type: 'line-circle-intersection' }>;
    expect(lc.id).toBe('D');
    expect(lc.avoid, 'D is the crossing that ISN\'T the on-circle vertex C').toBe('C');
    expect(lc.circle).toBe(cc.id);
  });

  it('"מעגל חוסם את משולש ABC" (Hebrew, standalone) → circumcircle (no longer blocked by the triangle rule)', () => {
    expect(types('מעגל חוסם את משולש ABC')).toEqual(['circumcircle']);
  });

  it('does NOT break a plain triangle / right-triangle (the deferred `triangle` rule still fires otherwise)', () => {
    expect(types('משולש ABC')).toEqual(['triangle']);
    expect(types('משולש ישר זווית ABC')).toEqual(['right-triangle']);
    expect(parse('triangle DEF').ok).toBe(true);
  });
});
