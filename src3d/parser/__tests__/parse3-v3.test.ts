/**
 * V3 parser tests — parameters in lines (2024-Q2): typed parametric lines,
 * parenthesised plane coefficients, the ⟂ given, the cut point, the
 * never-parallel probe, coordinate claims, and on-line membership.
 */

import { describe, expect, it } from 'vitest';
import { parse3, parseParamExpr } from '../parse3';

const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

describe('parseParamExpr', () => {
  it('components with and without the parameter', () => {
    expect(parseParamExpr('m-1')).toEqual({ expr: { k: -1, p: 1 }, param: 'm' });
    expect(parseParamExpr('5-m')).toEqual({ expr: { k: 5, p: -1 }, param: 'm' });
    expect(parseParamExpr('-2')).toEqual({ expr: { k: -2, p: 0 }, param: undefined });
    expect(parseParamExpr('2m')).toEqual({ expr: { k: 0, p: 2 }, param: 'm' });
    expect(parseParamExpr('m+6')).toEqual({ expr: { k: 6, p: 1 }, param: 'm' });
    expect(parseParamExpr('hello')).toBeNull();
    expect(parseParamExpr('m+n')).toBeNull(); // two letters — refused
  });
});

describe('typed parametric line', () => {
  it('lowers to LinExpr triples, Hebrew and English', () => {
    for (const input of ['הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', 'line ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)']) {
      expect(cmds(input)).toEqual([
        {
          type: 'line3',
          name: 'ℓ',
          anchor: [{ k: -1, p: 0 }, { k: 5, p: 0 }, { k: -11, p: 0 }],
          dir: [{ k: -1, p: 1 }, { k: 5, p: -1 }, { k: -2, p: 0 }],
          src: 'x = (-1,5,-11) + t·(m-1, 5-m, -2)',
          param: 'm',
        },
      ]);
    }
  });
  it('a parameter-free line parses too', () => {
    expect(cmds('l: x = (0,0,0) + t(1,0,0)')[0]).toMatchObject({ type: 'line3', param: undefined });
  });
});

describe('parenthesised plane coefficients', () => {
  it('(m+6)z folds into the z coefficient; the bare π name canonicalises', () => {
    expect(cmds('המישור π: 3x + my + (m+6)z + 4 = 0')).toEqual([
      {
        type: 'plane3',
        name: 'π',
        plane: {
          cx: { k: 3, p: 0 },
          cy: { k: 0, p: 1 },
          cz: { k: 6, p: 1 },
          d: { k: 4, p: 0 },
          src: '3x + my + (m+6)z + 4 = 0',
        },
        param: 'm',
      },
    ]);
  });
  it('mismatched parameters inside parentheses refuse', () => {
    expect(parse3('המישור π: (n+1)x + my = 0')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('V3 relations and constructions', () => {
  it('line ⟂ plane (a pinning given)', () => {
    expect(cmds('הישר ℓ ניצב למישור π')).toEqual([{ type: 'line-perp-plane', line: 'ℓ', plane: 'π' }]);
    expect(cmds('line ℓ is perpendicular to plane π')).toEqual([{ type: 'line-perp-plane', line: 'ℓ', plane: 'π' }]);
  });
  it('the cut point', () => {
    expect(cmds('ℓ חותך את π בנקודה A')).toEqual([{ type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π' }]);
    expect(cmds('ℓ cuts plane π at A')).toEqual([{ type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π' }]);
  });
  it('the never-parallel probe (a claim)', () => {
    expect(cmds('ℓ אינו מקביל ל-π לכל m')).toEqual([{ type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: 'π' } }]);
    expect(cmds('ℓ is not parallel to plane π for every m')).toEqual([
      { type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: 'π' } },
    ]);
  });
  it('coordinate claims and on-line membership', () => {
    expect(cmds('A = (2, 0, -10)')).toEqual([{ type: 'claim', claim: { type: 'coords-eq', id: 'A', x: 2, y: 0, z: -10 } }]);
    expect(cmds('B(5,-5,-9) על הישר ℓ')).toEqual([
      { type: 'point3', id: 'B', x: 5, y: -5, z: -9 },
      { type: 'on-line', id: 'B', line: 'ℓ' },
    ]);
    expect(cmds('B is on line ℓ')).toEqual([{ type: 'on-line', id: 'B', line: 'ℓ' }]);
  });
});
