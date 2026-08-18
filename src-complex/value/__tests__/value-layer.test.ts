/**
 * S1 gate (#618): the exact value layer carries what the 572 corpus actually needs.
 *
 * These are not unit tests of convenience — each block is a question from a real exam that a float
 * core cannot answer, which is the whole argument for
 * [ADR-CX-006](../../../docs/06d-decisions-complex.md#adr-cx-006).
 */
import { describe, expect, it } from 'vitest';

import * as R from '../rational';
import * as M from '../modulus';
import * as A from '../angle';
import * as V from '../value';

const rat = R.rat;
const turns = (n: number, d: number) => A.fromTurns(rat(n, d));

describe('rational — the ground field', () => {
  it('normalises sign and reduces, so equality is structural', () => {
    expect(R.eq(rat(2, -4), rat(-1, 2))).toBe(true);
    expect(R.format(rat(6, 4))).toBe('3/2');
    expect(R.format(rat(-6, 3))).toBe('-2');
  });

  it('floors toward −∞ so the fractional part is always in [0, 1)', () => {
    expect(R.floor(rat(-1, 2))).toBe(-1n);
    expect(R.format(R.frac(rat(-1, 4)))).toBe('3/4');
    expect(R.format(R.frac(rat(9, 4)))).toBe('1/4');
  });

  it('recognises a float as a rational via continued fractions, including exam denominators', () => {
    expect(R.format(R.fromNumber(0.125)!)).toBe('1/8');
    expect(R.format(R.fromNumber(135 / 360)!)).toBe('3/8');
    expect(R.format(R.fromNumber(1 / 64)!)).toBe('1/64');
    // atan(1/2) as a fraction of a turn is NOT nice — the recognizer must decline, not invent
    expect(R.fromNumber(Math.atan(0.5) / (2 * Math.PI), 24, 1e-12)).toBeNull();
  });

  it('carries exponents past a float mantissa, where repeated float multiplication drifts', () => {
    let acc = rat(3, 7);
    let flt = 3 / 7;
    for (let i = 0; i < 12; i++) {
      acc = R.mul(acc, rat(3, 7));
      flt *= 3 / 7;
    }
    // exact: the denominator is 7^13 on the nose, with no rounding anywhere
    expect(acc.n).toBe(3n ** 13n);
    expect(acc.d).toBe(7n ** 13n);
    // the float accumulation has already lost the last bits — which is the point of not using it
    expect(flt).not.toBe(R.toNumber(acc));
    expect(Math.abs(flt - R.toNumber(acc)) / R.toNumber(acc)).toBeLessThan(1e-14);
  });
});

describe('modulus — a ℚ-exponent vector, closed under the multiplicative core', () => {
  it('√2 is an exponent of one half, and formats as a radical', () => {
    const root2 = M.pow(M.fromInt(2), rat(1, 2));
    expect(M.format(root2)).toBe('√2');
    expect(M.evaluate(root2)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('2^(3/2) keeps its integer part as a coefficient: 2√2', () => {
    const v = M.pow(M.fromInt(2), rat(3, 2));
    expect(R.format(v.get('2')!)).toBe('3/2');
    expect(M.format(v)).toBe('2√2');
    expect(M.evaluate(v)).toBeCloseTo(2 * Math.SQRT2, 12);
  });

  it('a cube root is expressible — the case a p/q·√n recognizer cannot reach', () => {
    const v = M.pow(M.fromInt(2), rat(1, 3));
    expect(M.format(v)).toBe('∛2');
    expect(M.evaluate(v)).toBeCloseTo(Math.cbrt(2), 12);
  });

  it('rational moduli fold to negative exponents: 1/64 = 2^-6', () => {
    const v = M.fromRational(rat(1, 64));
    expect(R.format(v.get('2')!)).toBe('-6');
    expect(M.evaluate(v)).toBeCloseTo(1 / 64, 12);
  });

  it('equal-degree roots combine into ONE radical: |5+7i| is √74, never √2√37 (#702 class)', () => {
    // operator, 2026-08-18: "we have √74 (if that is correct), or use decimal"
    const v = M.pow(M.fromInt(74), rat(1, 2)); // 74 = 2·37 — carried factored, printed combined
    expect(M.format(v)).toBe('√74');
    expect(M.evaluate(v)).toBeCloseTo(Math.sqrt(74), 12);
  });

  it('…and for higher roots with exam typography: (2·5)^(2/5) is ⁵√100, never 2^(2/5)5^(2/5) (#702)', () => {
    const v = M.pow(M.fromInt(10), rat(2, 5));
    expect(M.format(v)).toBe('⁵√100');
    expect(M.evaluate(v)).toBeCloseTo(10 ** 0.4, 12);
  });

  it('THE §2b GATE: |z4| = |z2|²/|z1| with 12r and 9r is exactly 16r', () => {
    const z1 = M.mul(M.fromInt(9), M.fromParam('r')); //  9r
    const z2 = M.mul(M.fromInt(12), M.fromParam('r')); // 12r
    const z4 = M.div(M.pow(z2, rat(2)), z1);
    expect(M.format(z4)).toBe('16r');
    // and it is 16r for EVERY r, not for a lucky sample (ADR-052)
    for (const r of [0.4, 1, 2.5, 7]) {
      expect(M.evaluate(z4, new Map([['r', r]]))).toBeCloseTo(16 * r, 10);
    }
  });

  it('is parametric exactly when it mentions a symbol, and declines to evaluate unbound', () => {
    const v = M.mul(M.fromInt(3), M.fromParam('r'));
    expect(M.paramsOf(v)).toEqual(['r']);
    expect(M.evaluate(v)).toBeNull();
    expect(M.evaluate(v, new Map([['r', 2]]))).toBeCloseTo(6, 12);
  });

  it('equality is structural, and a zero exponent is never stored', () => {
    const v = M.div(M.fromInt(6), M.fromInt(6));
    expect(v.size).toBe(0);
    expect(M.isOne(v)).toBe(true);
    expect(M.eq(M.mul(M.fromInt(2), M.fromInt(3)), M.fromInt(6))).toBe(true);
  });
});

describe('angle — rational turns plus symbolic atoms', () => {
  it('3π/4 is 3/8 of a turn, and prints in both registers', () => {
    const a = A.fromPi(rat(3, 4));
    expect(R.format(a.turns)).toBe('3/8');
    expect(A.format(a)).toBe('135°');
    expect(A.formatPi(a)).toBe('3π/4');
  });

  it('decides real and pure-imaginary exactly, never by sampling', () => {
    expect(A.isReal(turns(0, 1))).toBe(true);
    expect(A.isReal(turns(1, 2))).toBe(true); // 180° — real and negative
    expect(A.isReal(turns(1, 4))).toBe(false);
    expect(A.isImaginary(turns(1, 4))).toBe(true);
    expect(A.isImaginary(turns(3, 4))).toBe(true);
    expect(A.isImaginary(turns(1, 8))).toBe(false);
  });

  it('an angle carrying an atom is honestly undecidable rather than guessed', () => {
    const t0 = A.fromAtom('θ₀');
    expect(A.isReal(t0)).toBe(false);
    expect(A.isImaginary(t0)).toBe(false);
    expect(A.period(t0)).toBeNull();
    expect(A.toDegrees(t0)).toBeNull();
    expect(A.toDegrees(t0, new Map([['θ₀', 26.565]]))).toBeCloseTo(26.565, 9);
  });

  it('THE §2b SPACING: an opaque base keeps EXACT 72° offsets', () => {
    const base = A.fromAtom('θ₀');
    const fifths = [0, 1, 2, 3, 4].map((k) => A.add(base, turns(k, 5)));
    // the offsets are exact even though θ₀ is only ever numeric
    expect(fifths.map((a) => R.format(a.turns))).toEqual(['0', '1/5', '2/5', '3/5', '4/5']);
    for (const a of fifths) expect(R.format(a.atoms.get('θ₀')!)).toBe('1');
    const sample = new Map([['θ₀', 26.56505117707799]]);
    const degs = fifths.map((a) => A.toDegrees(a, sample)!);
    for (let k = 1; k < degs.length; k++) expect(degs[k] - degs[k - 1]).toBeCloseTo(72, 9);
  });

  it('sameDirection is provable equality, not numeric coincidence', () => {
    expect(A.sameDirection(turns(1, 4), turns(5, 4))).toBe(true); // one whole turn apart
    expect(A.sameDirection(turns(1, 4), turns(1, 2))).toBe(false);
    expect(A.sameDirection(A.fromAtom('α'), turns(1, 4))).toBe(false); // α MIGHT be 90°, but nothing says so
  });

  it('period is the reduced denominator — what makes a power cycle plottable', () => {
    expect(A.period(turns(1, 8))).toBe(8n);
    expect(A.period(turns(2, 8))).toBe(4n);
    expect(A.period(turns(1, 2))).toBe(2n);
  });
});

describe('THE CORPUS DECISIONS a float core cannot make', () => {
  it('2023 קיץ ב ג: z_4n is REAL and z_{4n-2} is PURE IMAGINARY, for every natural n', () => {
    // q = z1 = √2·cis45°, and z_k = q^k, so arg z_k = k/8 turn.
    const step = turns(1, 8);

    // The structural decision: arg z_{4n} = n·(4·step), and n·b is real for every n iff b is real.
    const b = A.scale(step, rat(4));
    expect(A.isReal(b)).toBe(true); // 4·45° = 180° — so every z_4n is real, decided once

    // and z_{4n-2} = z_{4n} rotated back by 2 steps = a quarter turn
    const shift = A.scale(step, rat(-2));
    expect(A.isImaginary(A.add(b, shift))).toBe(true);

    // the sweep confirms the decision rather than standing in for it
    for (let n = 1; n <= 8; n++) {
      expect(A.isReal(A.scale(step, rat(4 * n))), `z_${4 * n}`).toBe(true);
      expect(A.isImaginary(A.scale(step, rat(4 * n - 2))), `z_${4 * n - 2}`).toBe(true);
    }
  });

  it('2023 קיץ א ד: the MINIMAL n with wⁿ pure imaginary is found by congruence', () => {
    const step = turns(3, 8); // arg w = 135°
    const candidates = [rat(1, 4), rat(3, 4)]
      .map((t) => A.smallestPower(step, t))
      .filter((n): n is bigint => n !== null);
    const minimal = candidates.reduce((a, b) => (a < b ? a : b));
    expect(minimal).toBe(2n);
    // check it: w² has argument 270°, which is pure imaginary; w¹ is not
    expect(A.isImaginary(A.scale(step, rat(2)))).toBe(true);
    expect(A.isImaginary(step)).toBe(false);
  });

  it('a minimal-n ask with no solution says so instead of searching forever', () => {
    // arg w = 1/3 turn: n·120° is never ≡ 90° (mod 180°)
    expect(A.smallestPower(turns(1, 3), rat(1, 4))).toBeNull();
  });

  it('2022 חורף ב: w1 = (z1/√2)^(4n) is real for every n, from the argument alone', () => {
    // z1 and z2 are conjugates on |z| = √2, so arg(z1/√2) = 45°; the ask is "prove real for all n".
    const perStep = A.scale(turns(1, 8), rat(4));
    expect(A.isReal(perStep)).toBe(true);
    // the sibling ask: (z2/√2)^(4n+2) is pure imaginary for all n
    expect(A.isImaginary(A.add(perStep, A.scale(turns(-1, 8), rat(2))))).toBe(true);
  });
});

describe('value — the exactness rule is structural', () => {
  const two = V.exact(M.fromInt(2), A.zero());
  const i = V.exact(M.one(), turns(1, 4));

  it('multiplication adds arguments and multiplies moduli, exactly', () => {
    const p = V.mul(two, i)!;
    expect(V.formatPolar(p)).toBe('2·cis90°');
    expect(V.formatCartesian(p)).toBe('2i');
  });

  it('THE #607 SHAPE: z1 = √2·cis45°, z3 = z1³, and −2·z1 = conj(z3) holds EXACTLY', () => {
    const z1 = V.exact(M.pow(M.fromInt(2), rat(1, 2)), turns(1, 8));
    const z3 = V.pow(z1, rat(3))!;
    expect(V.formatPolar(z3)).toBe('2√2·cis135°');
    const lhs = V.mul(V.exact(M.fromInt(2), turns(1, 2)), z1)!; // −2·z1 (the sign is a half turn)
    expect(V.provablyEqual(lhs, V.conj(z3))).toBe(true);
  });

  it('n-th roots are the enumerated configuration set, exactly spaced', () => {
    const eight = V.exact(M.fromInt(8), A.zero());
    const roots = V.nthRoots(eight, 3).map((r) => V.formatPolar(r!));
    expect(roots).toEqual(['2·cis0°', '2·cis120°', '2·cis240°']);
  });

  it('a root constellation over an OPAQUE base still spaces exactly (the §2b ד ask)', () => {
    const z2 = V.exact(M.mul(M.fromInt(12), M.fromParam('r')), A.fromAtom('θ₀'));
    const target = V.pow(z2, rat(5))!; // Z⁵ = Z2⁵ by the question's construction
    const sols = V.nthRoots(target, 5).map((s) => s!);
    // every solution sits on |Z| = 12r ...
    for (const s of sols) expect(M.format((s as { mod: M.ExpVec }).mod)).toBe('12r');
    // ... 72° apart, with one of them Z2 itself
    expect(sols.some((s) => V.provablyEqual(s, z2))).toBe(true);
    const sample = new Map([
      ['r', 1.7],
      ['θ₀', 26.56505117707799],
    ]);
    const degs = sols.map((s) => V.cArgDeg(V.evaluate(s, sample)!));
    const gaps = degs.slice(1).map((d, k) => ((d - degs[k]) % 360 + 360) % 360);
    for (const g of gaps) expect(g).toBeCloseTo(72, 8);
  });

  it('addition drops to numeric — the boundary is real, so it is declared, not hidden', () => {
    expect(V.mul(two, V.numeric(1, 1))).toBeNull(); // mixed: the caller must evaluate at a sample
    expect(V.isExact(two)).toBe(true);
    expect(V.isExact(V.numeric(1, 1))).toBe(false);
  });

  it('zero is its own case — it has no logarithm and no argument', () => {
    expect(V.isZeroValue(V.numeric(0, 0))).toBe(true);
    expect(V.mul(two, V.ZERO_VALUE)).toEqual(V.ZERO_VALUE);
    expect(() => V.div(two, V.ZERO_VALUE)).toThrow(/division by zero/);
  });

  it('provable equality refuses a numeric coincidence', () => {
    const exactHalfTurn = V.exact(M.fromInt(1), turns(1, 2));
    const alsoMinusOne = V.numeric(-1, 0);
    expect(V.evaluate(exactHalfTurn)!.re).toBeCloseTo(-1, 12);
    expect(V.provablyEqual(exactHalfTurn, alsoMinusOne)).toBe(false); // one is not carried exactly
  });
});

describe('cartesian literals keep the modulus exact even when the angle is not', () => {
  it('1+i is exactly √2·cis45° — no recognition needed for the modulus', () => {
    const { value, atomBinding } = V.fromCartesian(rat(1), rat(1));
    expect(atomBinding).toBeUndefined();
    expect(V.formatPolar(value)).toBe('√2·cis45°');
  });

  it('3+4i has modulus exactly 5 and an ATOM for its argument, honestly reported', () => {
    const { value, atomBinding } = V.fromCartesian(rat(3), rat(4), 'z1');
    expect(V.isExact(value) && M.format(value.mod)).toBe('5');
    expect(atomBinding?.atom).toBe('∠z1');
    expect(atomBinding?.degrees).toBeCloseTo(53.13010235415598, 9);
    // |z1³| = 125 exactly, even though arg z1 is opaque
    expect(M.format((V.pow(value, rat(3)) as { mod: M.ExpVec }).mod)).toBe('125');
  });

  it('the axis cases are exact with no recognition step', () => {
    expect(V.formatPolar(V.fromCartesian(rat(-2), rat(0)).value)).toBe('2·cis180°');
    expect(V.formatPolar(V.fromCartesian(rat(0), rat(2)).value)).toBe('2·cis90°');
    expect(V.formatPolar(V.fromCartesian(rat(0), rat(-3)).value)).toBe('3·cis270°');
  });

  it('a 15°-grid angle is recognised; a non-nice one is not invented', () => {
    const nice = V.fromCartesian(rat(1), rat(-1));
    expect(nice.atomBinding).toBeUndefined();
    expect(V.formatPolar(nice.value)).toBe('√2·cis315°');
    expect(V.fromCartesian(rat(2), rat(1)).atomBinding).toBeDefined();
  });
});
