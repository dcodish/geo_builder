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
  // #794 (ADR-3D-168): the numeric-only gate is LIFTED — vector components take the same COMP
  // grammar as point components. A bare distinct letter is a placeholder (that component does
  // not constrain), exactly the #325 point register.
  it('a bare letter in a vector value is a placeholder component (#794)', () => {
    expect(cmds('נתון: v = (10,n,0)')).toEqual([{ type: 'inject-vector', name: 'v', x: 10, y: null, z: 0 }]);
  });
  it('a vector value with affine symbolic components carries symExprs (#794)', () => {
    expect(cmds('נתון: v = (k-1, k, 3)')).toEqual([
      {
        type: 'inject-vector', name: 'v', x: null, y: null, z: 3,
        symExprs: [{ sym: 'k', k: 1, c: -1 }, { sym: 'k', k: 1, c: 0 }, null],
      },
    ]);
  });
  // #793: the harvest requires FULL coverage — residue anywhere (leading, between, trailing) defers
  // the whole utterance, and an item can never start mid-run. A pair-vector given must not be
  // reinterpreted as point coordinates, and no stated text may be silently dropped.
  // #794 (ADR-3D-168): what #793 turned from a misparse into an honest refusal now BUILDS —
  // the pair item exists, in the standalone rule and in the «נתון:» list.
  it("«AA' = (k-1, k-7, k+1)» — the operator's exact utterance is a symbolic pair-vector injection (#794)", () => {
    const expected = [
      {
        type: 'inject-pair', a: 'A', b: "A'", x: null, y: null, z: null,
        symExprs: [{ sym: 'k', k: 1, c: -1 }, { sym: 'k', k: 1, c: -7 }, { sym: 'k', k: 1, c: 1 }],
      },
    ];
    expect(cmds("AA'=(k-1,k-7, k+1)")).toEqual(expected);
    expect(cmds("נתון: AA' = (k-1, k-7, k+1)")).toEqual(expected);
  });
  it('«נתון: AB = (1,2,3)» is a pair-vector given, never point B (#793 → #794)', () => {
    expect(cmds('נתון: AB = (1,2,3)')).toEqual([{ type: 'inject-pair', a: 'A', b: 'B', x: 1, y: 2, z: 3 }]);
  });
  it('a «נתון:» list mixes pair items with vector and point items (#794)', () => {
    expect(cmds('נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)')).toEqual([
      {
        type: 'inject-pair', a: 'A', b: 'B', x: null, y: null, z: 3,
        symExprs: [{ sym: 'k', k: 1, c: -1 }, { sym: 'k', k: 1, c: 0 }, null],
      },
      {
        type: 'inject-pair', a: 'A', b: 'C', x: null, y: 0, z: null,
        symExprs: [{ sym: 'k', k: 1, c: 1 }, null, { sym: 'k', k: 1, c: -3 }],
      },
    ]);
  });
  it('the numeric pair injection is byte-identical to before (#794)', () => {
    expect(cmds('BD = (-4,5,12)')).toEqual([{ type: 'inject-pair', a: 'B', b: 'D', x: -4, y: 5, z: 12 }]);
  });
  it('residue between items defers the whole utterance (#793)', () => {
    expect(parse3('נתון: v = (1,2,3) junk u = (4,5,6)')).toEqual({ ok: false, reason: 'not-handled' });
  });
  it('a bare list conjunction between items is a separator, not residue (#793)', () => {
    expect(cmds('נתון: v = (1,2,3) ו-u = (4,5,6)')).toEqual([
      { type: 'inject-vector', name: 'v', x: 1, y: 2, z: 3 },
      { type: 'inject-vector', name: 'u', x: 4, y: 5, z: 6 },
    ]);
    expect(cmds('given: v = (1,2,3) and u = (4,5,6)')).toHaveLength(2);
  });
});

describe('symbolic point components', () => {
  it('A(3,n,p) — letters become null (only numerics constrain); ADR-3D-032 keeps the letters for apply', () => {
    expect(cmds('A(3,n,p)')).toEqual([{ type: 'point3', id: 'A', x: 3, y: null, z: null, syms: [null, 'n', 'p'] }]);
  });
});

describe('the sign given', () => {
  it('Hebrew and English', () => {
    expect(cmds("שיעור ה-z של C' חיובי")).toEqual([{ type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    expect(cmds("the z-coordinate of C' is positive")).toEqual([{ type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    expect(cmds('שיעור ה-y של B שלילי')).toEqual([{ type: 'sign-given', id: 'B', axis: 'y', positive: false }]);
  });
  it('spaced article + copula (operator report 2026-07-09)', () => {
    const neg = [{ type: 'sign-given', id: 'A', axis: 'y', positive: false }];
    expect(cmds('שיעור ה y של A הוא שלילי')).toEqual(neg); // the exact reported phrasing
    expect(cmds('שיעור ה y של A שלילי')).toEqual(neg); // spaced article alone
    expect(cmds('שיעור ה-y של A הוא שלילי')).toEqual(neg); // copula alone
    expect(cmds('שיעור הy של A היא שלילי')).toEqual(neg); // glued article + feminine copula
    expect(cmds("שיעור ה z של C' הוא חיובי")).toEqual([{ type: 'sign-given', id: "C'", axis: 'z', positive: true }]);
    expect(cmds('y coordinate of A is negative')).toEqual(neg); // En mirror: optional "the"
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
  it("מישור A'B'C'D' הוא x-4y-8z-142=0 — bare מישור, the copula הוא, a primed run (operator report 2026-07-09)", () => {
    expect(cmds("מישור A'B'C'D' הוא x-4y-8z-142=0")).toEqual([
      { type: 'claim', claim: { type: 'plane-eq', ids: ["A'", "B'", "C'", "D'"], cx: 1, cy: -4, cz: -8, d: -142 } },
    ]);
    expect(cmds("plane A'B'C'D' is x-4y-8z-142=0")).toHaveLength(1);
  });
  it('a claimed plane equation with a parameter is refused', () => {
    expect(parse3('המישור KBC: mx + 2y = 0')).toEqual({ ok: false, reason: 'not-handled' });
  });
});
