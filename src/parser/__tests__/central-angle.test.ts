/**
 * #106 (ADR-323): the CENTRAL angle — the angle at a circle's centre subtending two on-circle points (or
 * an arc). Was `not-handled` (→ LLM). A `centralAngle` rule resolves the centre (the middle letter, or
 * implicitly from the arc endpoints' circle) and draws the two radii; a value → `set-angle` (drives), a
 * valueless statement → `mark-angle` (a highlightable stated-angle mark, FR-RN-7). He + En.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { ParseContext } from '@/parser';
import type { AnyCommand } from '@/engine';

const cmds = (s: string, ctx?: ParseContext): AnyCommand[] => {
  const r = parse(s, ctx);
  if (!r.ok) throw new Error(`did not parse: ${s} (${r.reason})`);
  return r.commands;
};
const types = (s: string, ctx?: ParseContext) => cmds(s, ctx).map((c) => c.type);

describe('central angle (issue #106)', () => {
  it('the valueless three-letter form marks the angle at the middle vertex (the centre)', () => {
    const c = cmds('זוית מרכזית COD');
    expect(c).toContainEqual({ type: 'segment', a: 'O', b: 'C' });
    expect(c).toContainEqual({ type: 'segment', a: 'O', b: 'D' });
    expect(c).toContainEqual({ type: 'mark-angle', vertex: 'O', ray1: 'C', ray2: 'D' });
  });

  it('a value makes it an angle given (set-angle at the centre)', () => {
    for (const u of ['זוית מרכזית COD = 80', 'central angle COD = 80', 'זוית מרכזית COD היא 80']) {
      expect(cmds(u), u).toContainEqual({ type: 'set-angle', vertex: 'O', ray1: 'C', ray2: 'D', value: 80 });
    }
  });

  it('the arc-subtended form resolves the centre from the circle the arc endpoints ride', () => {
    const ctx: ParseContext = { circleMembers: [{ id: 'circle-O', center: 'O', points: ['C', 'D'] }] };
    const c = cmds('זוית מרכזית נשענת על קשת CD', ctx);
    expect(c).toContainEqual({ type: 'mark-angle', vertex: 'O', ray1: 'C', ray2: 'D' });
    expect(cmds('central angle subtending arc CD', ctx)).toContainEqual({ type: 'mark-angle', vertex: 'O', ray1: 'C', ray2: 'D' });
  });

  it('the arc form DEFERS (never guesses a centre) when the circle cannot be resolved', () => {
    const r = parse('זוית מרכזית נשענת על קשת CD'); // no circle in context
    expect(r.ok).toBe(false);
  });

  it('a plain angle given is untouched (no "מרכזית"/"central" keyword)', () => {
    expect(types('זווית ABC = 40')).toContain('set-angle');
    // and it does NOT emit a mark-angle (that path is central-angle only)
    expect(types('זווית ABC = 40')).not.toContain('mark-angle');
  });
});
