/**
 * #1427 (ADR-CX-049) — the stage-3b census primitives: the structural polynomial reader and the
 * all-roots finder. The completeness flag is only as honest as these two: a polynomial must be READ
 * (never inferred from samples), and every root must be FOUND (never the nearest one).
 */
import { describe, expect, it } from 'vitest';

import { type PolyContext, allRoots, censusStarts, degreeOf, polyOf } from '../census';
import { type Expr, refsOf } from '../../model/expr';
import { rat } from '../../value/rational';

const C = (re: number, im = 0) => ({ re, im });
const z: Expr = { t: 'ref', name: 'z' };
const n = (v: number): Expr => ({ t: 'num', v: rat(v) });

/** z is the unknown; `w` is 2·z (a holomorphic monomial); `c` is conj z (not one) */
const ctx: PolyContext = {
  involves: (e) => refsOf(e).length > 0,
  constant: (e) => (e.t === 'num' ? C(Number(e.v.n) / Number(e.v.d)) : e.t === 'i' ? C(0, 1) : null),
  monomial: (name) => (name === 'z' ? { c: C(1), a: 1 } : name === 'w' ? { c: C(2), a: 1 } : null),
};

describe('polyOf — a polynomial is READ off the expression, never approximated', () => {
  it('z² − 4z + 13 has coefficients 13, −4, 1', () => {
    const e: Expr = { t: 'add', l: { t: 'sub', l: { t: 'pow', base: z, exp: rat(2) }, r: { t: 'mul', l: n(4), r: z } }, r: n(13) };
    const p = polyOf(e, ctx)!;
    expect(degreeOf(p)).toBe(2);
    expect(p.map((c) => c.re)).toEqual([13, -4, 1]);
  });

  it('a name that is c·z^a enters with its coefficient', () => {
    const p = polyOf({ t: 'sub', l: { t: 'ref', name: 'w' }, r: n(6) }, ctx)!;
    expect(p.map((c) => c.re)).toEqual([-6, 2]);
  });

  it.each<[string, Expr]>([
    ['a conjugate of the unknown', { t: 'conj', e: z }],
    ['a modulus of the unknown', { t: 'abs', e: z }],
    ['a root of the unknown', { t: 'pow', base: z, exp: rat(1, 2) }],
    ['a division BY the unknown', { t: 'div', l: n(1), r: z }],
    ['a name that is not a holomorphic monomial', { t: 'ref', name: 'c' }],
  ])('%s is not a polynomial (null → the census is a floor)', (_, e) => {
    expect(polyOf(e, ctx)).toBeNull();
  });
});

describe('allRoots — every root, each once', () => {
  const sorted = (rs: { re: number; im: number }[]) =>
    rs.map((r) => [Math.round(r.re * 1e6) / 1e6, Math.round(r.im * 1e6) / 1e6]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  it('z² − 4z + 13 → 2 ± 3i', () => {
    expect(sorted(allRoots([C(13), C(-4), C(1)]))).toEqual([[2, -3], [2, 3]]);
  });

  it('z³ − 1 → the three cube roots of unity', () => {
    const h = Math.round((Math.sqrt(3) / 2) * 1e6) / 1e6;
    expect(sorted(allRoots([C(-1), C(0), C(0), C(1)]))).toEqual([[-0.5, -h], [-0.5, h], [1, 0]]);
  });

  it('a repeated root is ONE configuration: (z − 1)² → 1', () => {
    expect(sorted(allRoots([C(1), C(-2), C(1)]))).toEqual([[1, 0]]);
  });

  it('a degree-4 polynomial with complex coefficients: z⁴ = −16 → four roots of modulus 2', () => {
    const rs = allRoots([C(16), C(0), C(0), C(0), C(1)]);
    expect(rs).toHaveLength(4);
    for (const r of rs) expect(Math.hypot(r.re, r.im)).toBeCloseTo(2, 9);
  });

  it('a constant has no roots, and noise in the leading coefficient is trimmed', () => {
    expect(allRoots([C(3)])).toEqual([]);
    expect(allRoots([C(-2), C(1), C(1e-17)])).toHaveLength(1);
  });
});

describe('censusStarts — deterministic, inside the box', () => {
  it('is seed-free and repeatable, and respects the bounds', () => {
    const a = censusStarts(['mod', 'arg', 'par'], [{ lo: 1e-6 }, { lo: 0, hi: 90 }, {}], 6);
    expect(a).toEqual(censusStarts(['mod', 'arg', 'par'], [{ lo: 1e-6 }, { lo: 0, hi: 90 }, {}], 6));
    for (const x of a) {
      expect(x[0]).toBeGreaterThan(0);
      expect(x[1]).toBeGreaterThan(0);
      expect(x[1]).toBeLessThan(90);
    }
    // an unbounded parameter is started on both sides of zero
    expect(new Set(a.map((x) => Math.sign(x[2])))).toEqual(new Set([1, -1]));
  });
});
