/**
 * Subscripted point labels — a point token is a letter + an optional digit
 * subscript (`[A-Za-z]\d*`), so `O1`/`O2` are distinct ids. The canonical id stays
 * plain ASCII ("O1"); the renderer draws the digit as a subscript (presentation
 * only). Plain multi-letter runs ("ABCD") still split into single-letter points.
 */

import { describe, it, expect } from 'vitest';
import type { AnyCommand } from '@/engine';
import { parse } from '@/parser';

const ok = (u: string, ctx?: Parameters<typeof parse>[1]): AnyCommand[] => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`parse failed for ${JSON.stringify(u)}: ${r.reason}`);
  return r.commands;
};
type C = Record<string, unknown> & { type: string };

describe('subscripted point labels (O1, O2)', () => {
  it('a circle centred at a subscripted point keeps the digit in the id', () => {
    const c = ok('circle O1 radius 5')[0] as C;
    expect(c.type).toBe('circle');
    expect(c.center).toBe('O1');
    expect(c.id).toBe('circle-O1'); // the circle-id convention carries the subscript
  });

  it('two subscripted circles tangent to each other read O1 / O2 distinctly', () => {
    const c = ok('מעגל O1 ומעגל O2 משיקים זה לזה בנקודה M')[0] as C;
    expect(c.type).toBe('circles-tangent');
    expect([c.circle1, c.circle2, c.at]).toEqual(['circle-O1', 'circle-O2', 'M']);
  });

  it('a segment between two subscripted points (spaced AND contiguous)', () => {
    for (const u of ['segment O1 O2', 'segment O1O2']) {
      const c = ok(u)[0] as C;
      expect(c.type).toBe('segment');
      expect([c.a, c.b]).toEqual(['O1', 'O2']);
    }
  });

  it('an angle at a subscripted vertex', () => {
    const a = ok('angle A1 B2 C3 = 40').find((c) => c.type === 'set-angle') as C;
    expect([a.ray1, a.vertex, a.ray2]).toEqual(['A1', 'B2', 'C3']);
  });

  it('REGRESSION: a plain letter run "ABCD" still splits into four single points', () => {
    const sq = ok('square ABCD')[0] as C;
    expect(sq.type).toBe('square');
    expect(sq.ids).toEqual(['A', 'B', 'C', 'D']); // digits-less letters never merge
  });
});
