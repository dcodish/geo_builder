/**
 * ADR-3D-015 — plane HIGHLIGHT + point on/above/below a plane, parser layer:
 *  - a bare `מישור ABC` / `plane ABCD` lowers to plane-through (the patch renderer
 *    already covers the named points — the highlight is the declaration);
 *  - `E על/מעל/מתחת ל-מישור ABC` lowers to an idempotent plane-through + on-planes
 *    (side above/below); π-named planes accept the side forms too;
 *  - π membership WITHOUT a side stays with the older `membership` rule (one owner).
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parse3';

function cmds(u: string) {
  const r = parse3(u);
  if (!r.ok) throw new Error(`did not parse: ${u} (${r.reason})`);
  return r.commands;
}

describe('bare plane declaration — מישור ABC / plane ABCD', () => {
  it.each([
    ['מישור ABC', 'ABC', ['A', 'B', 'C']],
    ['המישור ABC', 'ABC', ['A', 'B', 'C']],
    ["המישור BC'D", "BC'D", ['B', "C'", 'D']],
    ['plane ABCD', 'ABCD', ['A', 'B', 'C', 'D']],
    ['the plane ABC', 'ABC', ['A', 'B', 'C']],
    ["מישור ABB'A'", "ABB'A'", ['A', 'B', "B'", "A'"]],
  ])('%s → plane-through', (u, name, ids) => {
    expect(cmds(u)).toEqual([{ type: 'plane-through', name, ids }]);
  });

  it('a 2-letter run is NOT a plane — honest refusal, never a guess', () => {
    expect(parse3('מישור AB').ok).toBe(false);
    expect(parse3('plane AB').ok).toBe(false);
  });
});

describe('point on / above / below a point-run plane', () => {
  it.each([
    ['E על המישור ABC', undefined],
    ['E נמצאת על המישור ABC', undefined],
    ['E is on plane ABC', undefined],
    ['E lies on the plane ABC', undefined],
    ['E מעל המישור ABC', 'above'],
    ['E מעל למישור ABC', 'above'],
    ['E נמצאת מעל המישור ABC', 'above'],
    ['E is above plane ABC', 'above'],
    ['E above the plane ABC', 'above'],
    ['E מתחת למישור ABC', 'below'],
    ['E is below plane ABC', 'below'],
  ])('%s', (u, side) => {
    expect(cmds(u)).toEqual([
      { type: 'plane-through', name: 'ABC', ids: ['A', 'B', 'C'] },
      side ? { type: 'on-planes', id: 'E', plane: 'ABC', side } : { type: 'on-planes', id: 'E', plane: 'ABC' },
    ]);
  });

  it('a primed 4-run plane works too', () => {
    expect(cmds("F מעל המישור BCC'B'")).toEqual([
      { type: 'plane-through', name: "BCC'B'", ids: ['B', 'C', "C'", "B'"] },
      { type: 'on-planes', id: 'F', plane: "BCC'B'", side: 'above' },
    ]);
  });
});

describe('π-named planes', () => {
  it('above/below a π plane is a single on-planes with side (no plane-through)', () => {
    expect(cmds('E מעל המישור π1')).toEqual([{ type: 'on-planes', id: 'E', plane: 'π1', side: 'above' }]);
    expect(cmds('E is below plane π2')).toEqual([{ type: 'on-planes', id: 'E', plane: 'π2', side: 'below' }]);
  });

  it('π membership WITHOUT a side is unchanged (the membership rule owns it)', () => {
    expect(cmds('A על המישור π1')).toEqual([{ type: 'on-planes', id: 'A', plane: 'π1' }]);
    expect(cmds('A נמצאת על אחד המישורים')).toEqual([{ type: 'on-planes', id: 'A', plane: 'any' }]);
  });
});
