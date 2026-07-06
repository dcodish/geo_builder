/**
 * V4 parser tests — the injection pivot's grammar: the נתון list, partial
 * (symbolic) components, the sign given, point-planes intersection, plane-eq claims.
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parse3';

const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

describe('the נתון injection list', () => {
  it('vectors + a point in one utterance (2020-ג)', () => {
    expect(cmds('נתון: v = (10,-5,0), u = (5,5,-5), P(0,4,6)')).toEqual([
      { type: 'inject-vector', name: 'v', x: 10, y: -5, z: 0 },
      { type: 'inject-vector', name: 'u', x: 5, y: 5, z: -5 },
      { type: 'point3', id: 'P', x: 0, y: 4, z: 6 },
    ]);
    expect(cmds('given: v = (10,-5,0)')).toEqual([{ type: 'inject-vector', name: 'v', x: 10, y: -5, z: 0 }]);
  });
  it('a standalone vector injection', () => {
    expect(cmds('u = (5,5,-5)')).toEqual([{ type: 'inject-vector', name: 'u', x: 5, y: 5, z: -5 }]);
  });
  it('a vector value must be numeric', () => {
    expect(parse3('נתון: v = (10,n,0)')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('symbolic point components', () => {
  it('A(3,n,p) — letters become null (only numerics constrain)', () => {
    expect(cmds('A(3,n,p)')).toEqual([{ type: 'point3', id: 'A', x: 3, y: null, z: null }]);
  });
});

describe('the sign given', () => {
  it('Hebrew and English', () => {
    expect(cmds("שיעור ה-z של C' חיובי")).toEqual([{ type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    expect(cmds("the z-coordinate of C' is positive")).toEqual([{ type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    expect(cmds('שיעור ה-y של B שלילי')).toEqual([{ type: 'sign-given', id: 'B', axis: 'y', positive: false }]);
  });
});

describe('point-planes and their intersection line', () => {
  it("ℓ between plane BC'D and plane BCC'B' (2023-ד)", () => {
    expect(cmds("ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'")).toEqual([
      { type: 'plane-through', name: "BC'D", ids: ['B', "C'", 'D'] },
      { type: 'plane-through', name: "BCC'B'", ids: ['B', 'C', "C'", "B'"] },
      { type: 'plane-plane-line', name: 'ℓ', p1: "BC'D", p2: "BCC'B'" },
    ]);
    expect(cmds("ℓ is the intersection line of plane BC'D and plane BCC'B'")).toHaveLength(3);
  });
});

describe('the plane-equation claim', () => {
  it('המישור KBC: x + 2y + 3z - 26 = 0', () => {
    expect(cmds('המישור KBC: x + 2y + 3z - 26 = 0')).toEqual([
      { type: 'claim', claim: { type: 'plane-eq', ids: ['K', 'B', 'C'], cx: 1, cy: 2, cz: 3, d: -26 } },
    ]);
    expect(cmds('plane KBC: x + 2y + 3z - 26 = 0')).toHaveLength(1);
  });
  it('a claimed plane equation with a parameter is refused', () => {
    expect(parse3('המישור KBC: mx + 2y = 0')).toEqual({ ok: false, reason: 'not-handled' });
  });
});
