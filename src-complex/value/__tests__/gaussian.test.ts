/**
 * #1481 (ADR-CX-057) — the exact normal form of a Gaussian-rational direction, and the three-valued
 * zero test that reads it.
 *
 * `arg(a+bi) = k/4 + m/8 + Σ (eₚ − ēₚ)·∠πₚ` over the canonical Gaussian primes. The relations between
 * typed literals (conjugate, ±i rotation, rational rescale, product, power) are then EQUALITIES of
 * angles in this basis, and a leftover that still carries a certified atom is nonzero by theorem.
 */
import { describe, expect, it } from 'vitest';

import * as A from '../angle';
import { NORM_BUDGET, canonicalPrime, gaussianDirection } from '../gaussian';
import { type Rat, rat } from '../rational';
import { gaussianRationalParts } from '../cartesian';
import { fromCartesian, isExact } from '../value';

const dir = (re: number | Rat, im: number | Rat): A.Angle => {
  const r = typeof re === 'number' ? rat(re) : re;
  const i = typeof im === 'number' ? rat(im) : im;
  return gaussianDirection(r, i)!.arg;
};
const same = (a: A.Angle, b: A.Angle) => expect(A.sameDirection(a, b)).toBe(true);
const atom = (x: number, y: number) => A.fromAtom(A.certifiedAtomName(BigInt(x), BigInt(y)));
const Q = (n: number, d = 1) => A.fromTurns(rat(n, d));

describe('the canonical primes', () => {
  it('x > y > 0 with x² + y² = p', () => {
    expect(canonicalPrime(5)).toEqual({ x: 2n, y: 1n });
    expect(canonicalPrime(13)).toEqual({ x: 3n, y: 2n });
    expect(canonicalPrime(17)).toEqual({ x: 4n, y: 1n });
    expect(canonicalPrime(29)).toEqual({ x: 5n, y: 2n });
  });
});

describe('the normal form (the plan’s identities)', () => {
  it('arg(2+3i) = ¼ − ∠(3+2i)', () => same(dir(2, 3), A.sub(Q(1, 4), atom(3, 2))));
  it('arg(−2+3i) = ¼ + ∠(3+2i)', () => same(dir(-2, 3), A.add(Q(1, 4), atom(3, 2))));
  it('arg(4+6i) = arg(2+3i) — a rational rescale moves nothing', () => same(dir(4, 6), dir(2, 3)));
  it('arg(−5+12i) = 2·arg(2+3i) — a power', () => same(dir(-5, 12), A.scale(dir(2, 3), rat(2))));
  it('arg(3+4i) = 2·∠(2+i)', () => same(dir(3, 4), A.scale(atom(2, 1), rat(2))));
  it('arg(1+7i) = arg(1+2i) + arg(3+i) — a product', () => same(dir(1, 7), A.add(dir(1, 2), dir(3, 1))));
  it('rational parts: arg(1/2 + 3/4·i) = arg(2+3i)', () => same(dir(rat(1, 2), rat(3, 4)), dir(2, 3)));
  it('an inert prime factor adds nothing: arg(3·(2+3i)) = arg(2+3i)', () => same(dir(6, 9), dir(2, 3)));
  it('conjugates are negatives: arg(2−3i) = −arg(2+3i)', () => same(dir(2, -3), A.neg(dir(2, 3))));
  it('an i-rotation of the conjugate: arg(3+2i) = ¼ − arg(2+3i)', () => same(dir(3, 2), A.sub(Q(1, 4), dir(2, 3))));
  it('the axis and diagonal directions carry no atom', () => {
    for (const [re, im, t] of [[1, 0, 0], [0, 1, 1 / 4], [-1, 0, 1 / 2], [0, -1, 3 / 4], [1, 1, 1 / 8], [-3, 3, 3 / 8]] as const) {
      const a = dir(re, im);
      expect(a.atoms.size).toBe(0);
      expect(A.toDegrees(a)).toBeCloseTo(t * 360, 12);
    }
  });

  it('a norm past the budget answers null — the caller keeps an opaque atom', () => {
    const big = BigInt(Math.floor(Math.sqrt(Number(NORM_BUDGET)))) + 10n;
    expect(gaussianDirection(rat(big), rat(big - 1n))).toBeNull();
    expect(gaussianDirection(rat(0), rat(0))).toBeNull();
  });

  it('property sweep: the normal form’s degrees equal atan2 to 1e-12 for every small pair', () => {
    const r = gaussianDirection(rat(1), rat(0))!; // warm the registry
    expect(r.bindings).toEqual([]);
    for (let a = -30; a <= 30; a++) {
      for (let b = -30; b <= 30; b++) {
        if (a === 0 && b === 0) continue;
        const g = gaussianDirection(rat(a), rat(b))!;
        const sample = new Map(g.bindings.map((x) => [x.atom, x.degrees]));
        const deg = A.toDegrees(g.arg, sample)!;
        const want = (Math.atan2(b, a) * 180) / Math.PI;
        const diff = (((deg - want) % 360) + 540) % 360 - 180;
        expect(Math.abs(diff)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('fromCartesian mints every rational literal in the certified basis', () => {
  it('2+3i: one certified atom, bound to its degrees', () => {
    const lit = fromCartesian(rat(2), rat(3));
    expect(lit.atomBindings.map((b) => b.atom)).toEqual(['∠(3+2i)']);
    expect(lit.atomBindings[0].degrees).toBeCloseTo((Math.atan2(2, 3) * 180) / Math.PI, 12);
  });

  it('the exact Gaussian parts read back from several atoms and coefficient 2 (M-d)', () => {
    for (const [re, im] of [[1, 7], [-5, 12], [3, 4], [2, 3], [-13, 0], [1, 2]] as const) {
      const v = fromCartesian(rat(re), rat(im)).value;
      if (!isExact(v)) throw new Error('not exact');
      expect(gaussianRationalParts(v.mod, v.arg)).toEqual({ re: rat(re), im: rat(im) });
    }
  });
});

describe('zeroness — three answers, and "unknown" is honest', () => {
  it('no atom: decided by the turns', () => {
    expect(A.zeroness(Q(2))).toBe('zero');
    expect(A.zeroness(Q(1, 3))).toBe('nonzero');
  });

  it('certified atoms only: nonzero, a theorem (no sample needed)', () => {
    expect(A.zeroness(dir(2, 3))).toBe('nonzero');
    // …and a true relation cancels to no atom at all: (2+3i)(−2+3i) = −13 is ½ turn
    expect(A.zeroness(A.sub(A.add(dir(2, 3), dir(-2, 3)), Q(1, 2)))).toBe('zero');
  });

  it('an opaque atom: numerically decided when clearly nonzero, unknown when it cancels or is unbound', () => {
    const t = A.fromAtom('θ');
    const p = A.fromAtom('φ');
    expect(A.zeroness(A.sub(t, p), new Map([['θ', 40], ['φ', 50]]))).toBe('nonzero');
    expect(A.zeroness(A.sub(t, p), new Map([['θ', 40], ['φ', 40]]))).toBe('unknown');
    expect(A.zeroness(t)).toBe('unknown');
  });
});
