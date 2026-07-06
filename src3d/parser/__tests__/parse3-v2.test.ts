/**
 * V2 parser tests — the algebraic lane rules, both languages: plane equations
 * (with the single parameter), coordinate points + membership, the angle given,
 * perpendicular feet, the intersection line, and scalar claims.
 */

import { describe, expect, it } from 'vitest';
import { parse3, parseLinearEq } from '../parse3';

const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

describe('parseLinearEq', () => {
  it('plain and parameterised equations', () => {
    expect(parseLinearEq('z - 3 = 0')).toEqual({
      cx: { k: 0, p: 0 },
      cy: { k: 0, p: 0 },
      cz: { k: 1, p: 0 },
      d: { k: -3, p: 0 },
      param: undefined,
    });
    expect(parseLinearEq('ay + z - 8 = 0')).toEqual({
      cx: { k: 0, p: 0 },
      cy: { k: 0, p: 1 },
      cz: { k: 1, p: 0 },
      d: { k: -8, p: 0 },
      param: 'a',
    });
    expect(parseLinearEq('3x - 2y = 5')).toMatchObject({ cx: { k: 3 }, cy: { k: -2 }, d: { k: -5 } });
  });
  it('refuses junk, two parameters, and variable-free equations', () => {
    expect(parseLinearEq('hello = 0')).toBeNull();
    expect(parseLinearEq('ax + by = 1')).toBeNull();
    expect(parseLinearEq('3 = 3')).toBeNull();
  });
});

describe('planes and points', () => {
  it('plane by equation — Hebrew and English, pi/π normalised', () => {
    expect(cmds('המישור π1: z - 3 = 0')).toEqual([
      { type: 'plane3', name: 'π1', plane: { cx: { k: 0, p: 0 }, cy: { k: 0, p: 0 }, cz: { k: 1, p: 0 }, d: { k: -3, p: 0 }, src: 'z - 3 = 0' }, param: undefined },
    ]);
    expect(cmds('plane pi2: ay + z - 8 = 0')[0]).toMatchObject({ type: 'plane3', name: 'π2', param: 'a' });
  });

  it('coordinate point, bare and with the membership tails', () => {
    expect(cmds('A(2,-2,6)')).toEqual([{ type: 'point3', id: 'A', x: 2, y: -2, z: 6 }]);
    expect(cmds('A(2,-2,6) נמצאת על אחד המישורים')).toEqual([
      { type: 'point3', id: 'A', x: 2, y: -2, z: 6 },
      { type: 'on-planes', id: 'A', plane: 'any' },
    ]);
    expect(cmds('A(2,-2,6) is on one of the planes')[1]).toEqual({ type: 'on-planes', id: 'A', plane: 'any' });
    expect(cmds('B(1,0,3) על המישור π1')[1]).toEqual({ type: 'on-planes', id: 'B', plane: 'π1' });
  });

  it('standalone membership for an existing point', () => {
    expect(cmds('A נמצאת על אחד המישורים')).toEqual([{ type: 'on-planes', id: 'A', plane: 'any' }]);
    expect(cmds('A is on plane π2')).toEqual([{ type: 'on-planes', id: 'A', plane: 'π2' }]);
  });
});

describe('relations and constructions', () => {
  it('the angle between the planes', () => {
    expect(cmds('הזווית בין המישורים π1 ו-π2 היא 45')).toEqual([{ type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 }]);
    expect(cmds('the angle between planes π1 and π2 is 45')).toEqual([{ type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 }]);
  });

  it('perpendicular dropped to a plane / to the line', () => {
    expect(cmds('מ-A מורידים אנך למישור π1 החותך אותו בנקודה B')).toEqual([
      { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π1' },
    ]);
    expect(cmds('from A drop a perpendicular to plane π1, it cuts it at B')).toEqual([
      { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π1' },
    ]);
    expect(cmds('מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C')).toEqual([
      { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ' },
    ]);
    expect(cmds('from B drop a perpendicular to line ℓ, it cuts it at C')).toEqual([
      { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ' },
    ]);
  });

  it('the intersection line of the two planes', () => {
    expect(cmds('ℓ ישר החיתוך בין המישורים π1 ו-π2')).toEqual([{ type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' }]);
    expect(cmds('ℓ is the intersection line of π1 and π2')).toEqual([{ type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' }]);
  });
});

describe('scalar claims', () => {
  it('AB = 3 → a length claim (draws the segment); the on-segment ratio form is untouched', () => {
    expect(cmds('AB = 3')).toEqual([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 3 } },
    ]);
    // "AK = 2KA'" must stay a vector RELATION (pair = coeff·pair), never a length claim
    const r = cmds("AK = 2KA'");
    expect(r.at(-1)).toMatchObject({ type: 'vec-rel', from: 'A', to: 'K' });
  });

  it('area claim — Hebrew and English, draws the triangle', () => {
    const he = cmds('שטח המשולש ABC = 4.5');
    expect(he).toHaveLength(4);
    expect(he[3]).toEqual({ type: 'claim', claim: { type: 'area-eq', ids: ['A', 'B', 'C'], value: 4.5 } });
    expect(cmds('the area of triangle ABC = 4.5')[3]).toEqual({
      type: 'claim',
      claim: { type: 'area-eq', ids: ['A', 'B', 'C'], value: 4.5 },
    });
  });
});
