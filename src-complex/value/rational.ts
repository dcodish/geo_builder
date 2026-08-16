/**
 * Exact rational arithmetic on BigInt — the ground field of the whole value layer
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)).
 *
 * Everything above this file is linear algebra over ℚ: a modulus is a ℚ-exponent vector
 * ({@link ../modulus}), an argument is a ℚ number of turns ({@link ../angle}), and the tier-1 solver
 * eliminates over ℚ. Floats cannot carry that — `0.1 + 0.2 !== 0.3` is a wrong ANSWER here, not a
 * display artifact, because the corpus asks questions ("is `w^(4n)` real for every natural n?") that
 * are decided by exact equality of rationals.
 *
 * BigInt rather than a number pair: exponents accumulate through powers (`z^5`, `(z^3)^4`) and
 * denominators through roots (`(z^(1/3))^(1/5)`), so a 53-bit mantissa is reachable in ordinary
 * corpus expressions. BigInt makes overflow impossible instead of unlikely.
 *
 * INVARIANT, held by construction: every `Rat` is normalised — `d > 0n` and `gcd(|n|, d) === 1n`.
 * That is what makes {@link eq} a structural comparison, which the solver relies on when it decides
 * whether two constraints are the same equation.
 */

export interface Rat {
  /** numerator; carries the sign */
  readonly n: bigint;
  /** denominator; always > 0n */
  readonly d: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
};

/** The one constructor. Normalises sign and reduces; `d === 0n` is a programming error, not a value. */
export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let bn = BigInt(n);
  let bd = BigInt(d);
  if (bd === 0n) throw new Error('rational with zero denominator');
  if (bd < 0n) {
    bn = -bn;
    bd = -bd;
  }
  const g = gcd(bn, bd) || 1n;
  return { n: bn / g, d: bd / g };
}

export const ZERO: Rat = { n: 0n, d: 1n };
export const ONE: Rat = { n: 1n, d: 1n };

export const isZero = (a: Rat): boolean => a.n === 0n;
export const isOne = (a: Rat): boolean => a.n === 1n && a.d === 1n;
/** An integer rational — the predicate the congruence decisions are phrased in. */
export const isInt = (a: Rat): boolean => a.d === 1n;

export const add = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rat, b: Rat): Rat => {
  if (isZero(b)) throw new Error('rational division by zero');
  return rat(a.n * b.d, a.d * b.n);
};
export const neg = (a: Rat): Rat => ({ n: -a.n, d: a.d });

/** Structural equality — sound because the constructor is the only way to build a `Rat`. */
export const eq = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d;
export const cmp = (a: Rat, b: Rat): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

/** Floor division toward −∞ (not toward zero) so {@link fracTurn} lands in [0, 1) for negatives too. */
export function floor(a: Rat): bigint {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}

/** The fractional part in [0, 1). The angle layer's "modulo one turn" is exactly this. */
export const frac = (a: Rat): Rat => sub(a, rat(floor(a)));

export const toNumber = (a: Rat): number => Number(a.n) / Number(a.d);

/**
 * Recognise a float as a rational with denominator ≤ `maxDen`, or null.
 *
 * Continued fractions rather than the 2-D formatter's `for (q = 1..12)` scan: the corpus needs
 * denominators like 360 (degrees as turns) and 64, which a small fixed scan cannot reach, and the
 * scan's cost grows with the bound while this does not. `tol` is RELATIVE so recognising 0.0001 and
 * 10000 behave the same.
 */
export function fromNumber(x: number, maxDen = 10_000, tol = 1e-9): Rat | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1n : 1n;
  let v = Math.abs(x);
  // h/k are the convergent's numerator/denominator; the recurrence is the standard one.
  let [h0, h1] = [0n, 1n];
  let [k0, k1] = [1n, 0n];
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const ba = BigInt(a);
    [h0, h1] = [h1, ba * h1 + h0];
    [k0, k1] = [k1, ba * k1 + k0];
    if (k1 === 0n || k1 > BigInt(maxDen)) break;
    const approx = Number(h1) / Number(k1);
    if (Math.abs(approx - Math.abs(x)) <= tol * Math.max(1, Math.abs(x))) {
      return rat(sign * h1, k1);
    }
    const rem = v - a;
    if (rem < 1e-12) break;
    v = 1 / rem;
  }
  return null;
}

/** `3`, `-1/2`, `7/8` — plain text; the UI typesets it. */
export const format = (a: Rat): string => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
