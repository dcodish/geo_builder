/**
 * Subscripted point labels — a point token is a letter + an optional digit
 * subscript (`[A-Za-z]\d*`), so `O1`/`O2` are distinct ids. The canonical id stays
 * plain ASCII ("O1"); the renderer draws the digit as a subscript (presentation
 * only). Plain multi-letter runs ("ABCD") still split into single-letter points.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const ok = (u: string, ctx?: Parameters<typeof parse>[1]) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`parse failed for ${JSON.stringify(u)}: ${r.reason}`);
  return r.commands;
};

describe('subscripted point labels (O1, O2)', () => {
  it('a circle centred at a subscripted point keeps the digit in the id', () => {
    const [c] = ok('circle O1 radius 5') as [{ type: string; id: string; center: string }];
    expect(c.type).toBe('circle');
    expect(c.center).toBe('O1');
    expect(c.id).toBe('circle-O1'); // the circle-id convention carries the subscript
  });

  it('two subscripted circles tangent to each other read O1 / O2 distinctly', () => {
    const cmds = ok('מעגל O1 ומעגל O2 משיקים זה לזה בנקודה M') as [
      { type: string; circle1: string; circle2: string; at: string },
    ];
    expect(cmds[0].type).toBe('circles-tangent');
    expect([cmds[0].circle1, cmds[0].circle2, cmds[0].at]).toEqual(['circle-O1', 'circle-O2', 'M']);
  });

  it('a segment between two subscripted points (spaced AND contiguous)', () => {
    for (const u of ['segment O1 O2', 'segment O1O2']) {
      const cmds = ok(u) as [{ type: string; a: string; b: string }];
      expect(cmds[0].type).toBe('segment');
      expect([cmds[0].a, cmds[0].b]).toEqual(['O1', 'O2']);
    }
  });

  it('an angle at a subscripted vertex', () => {
    const cmds = ok('angle A1 B2 C3 = 40') as [{ type: string; vertex: string; ray1: string; ray2: string }];
    const a = cmds.find((c) => c.type === 'set-angle')!;
    expect([a.ray1, a.vertex, a.ray2]).toEqual(['A1', 'B2', 'C3']);
  });

  it('REGRESSION: a plain letter run "ABCD" still splits into four single points', () => {
    const [sq] = ok('square ABCD') as [{ type: string; ids: string[] }];
    expect(sq.type).toBe('square');
    expect(sq.ids).toEqual(['A', 'B', 'C', 'D']); // digits-less letters never merge
  });
});
