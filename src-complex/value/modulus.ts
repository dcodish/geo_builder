/**
 * A modulus as a ℚ-EXPONENT VECTOR over atoms — the exact carrier for `|z|`
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)).
 *
 * `|z| = Π atom^exponent`, exponents rational. Two kinds of atom:
 *   - a **prime**, keyed by its decimal string — `√2` is `{2: 1/2}`, `9` is `{3: 2}`, `1/64` is `{2: -6}`
 *   - a **real parameter** the student never valued — `9r` is `{3: 2, r: 1}`
 *
 * Why this shape and not a `(p/q)·√n` recognizer like the 2-D formatter's: the corpus multiplies,
 * divides, powers and n-th-roots moduli constantly, and this representation is CLOSED under all four
 * (they are add / subtract / scale / divide on the exponents). A radical recognizer is closed under
 * none of them, and cannot express `2^(1/3)` at all — which 2020 קיץ ב needs. It is also why the
 * §2b gate falls out as arithmetic rather than as a special case: `|z4| = |z2|²/|z1|` with `|z2| = 12r`
 * and `|z1| = 9r` is `{2:2,3:1,r:1}·2 − {3:2,r:1}` = `{2:4, r:1}` = **16r**.
 *
 * The sign of a number is NOT here. A modulus is positive by definition; `−2` is modulus 2 with a
 * half-turn argument. Keeping the sign in the angle is what lets conjugation and negation stay linear.
 *
 * INVARIANT: no atom is ever stored with a zero exponent, so {@link eq} is a size-then-entries
 * comparison and `{}` is unambiguously 1.
 */

import { type Rat, ONE, ZERO, add, eq as ratEq, floor, isZero, mul as ratMul, rat, sub, toNumber, format as fmtRat } from './rational';

/** atom → exponent. Never carries a zero exponent. */
export type ExpVec = ReadonlyMap<string, Rat>;

export const one = (): ExpVec => new Map();
export const isOne = (v: ExpVec): boolean => v.size === 0;

/** An atom key is a prime when it is all digits; anything else is a real-parameter symbol. */
export const isPrimeAtom = (atom: string): boolean => /^\d+$/.test(atom);
export const paramsOf = (v: ExpVec): string[] => [...v.keys()].filter((a) => !isPrimeAtom(a)).sort();
export const isParametric = (v: ExpVec): boolean => paramsOf(v).length > 0;

const put = (m: Map<string, Rat>, atom: string, e: Rat): void => {
  if (isZero(e)) m.delete(atom);
  else m.set(atom, e);
};

export function mul(a: ExpVec, b: ExpVec): ExpVec {
  const out = new Map(a);
  for (const [atom, e] of b) put(out, atom, add(out.get(atom) ?? ZERO, e));
  return out;
}

export function div(a: ExpVec, b: ExpVec): ExpVec {
  const out = new Map(a);
  for (const [atom, e] of b) put(out, atom, sub(out.get(atom) ?? ZERO, e));
  return out;
}

/** Scale every exponent — this is `|z|^k` for integer k AND the n-th root for k = 1/n. */
export function pow(a: ExpVec, k: Rat): ExpVec {
  const out = new Map<string, Rat>();
  for (const [atom, e] of a) put(out, atom, ratMul(e, k));
  return out;
}

export const inv = (a: ExpVec): ExpVec => pow(a, rat(-1));

export function eq(a: ExpVec, b: ExpVec): boolean {
  if (a.size !== b.size) return false;
  for (const [atom, e] of a) {
    const o = b.get(atom);
    if (!o || !ratEq(e, o)) return false;
  }
  return true;
}

/**
 * Deterministic prime factorisation, bounded by design.
 *
 * Trial division to 1e6; a residue above that is kept AS ITS OWN ATOM rather than factored further.
 * That stays exact and stays sound for {@link eq} — the same integer always produces the same atoms —
 * it only means two spellings of one very large composite would not be recognised as equal. No corpus
 * magnitude is anywhere near the bound, and the alternative (a general factoriser) is the CAS this
 * product does not have.
 */
function factorize(n: bigint): Map<string, Rat> {
  const out = new Map<string, Rat>();
  if (n <= 0n) throw new Error('factorize expects a positive integer');
  let m = n;
  for (let p = 2n; p * p <= m && p <= 1_000_000n; p += p === 2n ? 1n : 2n) {
    let e = 0n;
    while (m % p === 0n) {
      m /= p;
      e += 1n;
    }
    if (e > 0n) out.set(p.toString(), rat(e));
  }
  if (m > 1n) out.set(m.toString(), ONE);
  return out;
}

/** A positive rational as an exponent vector: `12` → `{2:2, 3:1}`, `1/64` → `{2:-6}`. */
export function fromRational(q: Rat): ExpVec {
  if (q.n <= 0n) throw new Error('a modulus must be positive — the sign belongs to the argument');
  return div(factorize(q.n), factorize(q.d));
}

export const fromInt = (n: number | bigint): ExpVec => fromRational(rat(n));

/** A real parameter the student never valued: `r` → `{r: 1}`. */
export function fromParam(name: string): ExpVec {
  if (isPrimeAtom(name)) throw new Error(`"${name}" is a number, not a parameter symbol`);
  return new Map([[name, ONE]]);
}

/**
 * The numeric value at a parameter sample. Returns null when the vector mentions a parameter the
 * sample does not bind — the caller decides whether that is "not yet determined" (fine, the solver is
 * still sampling) or an error, and that decision does not belong here.
 */
export function evaluate(v: ExpVec, sample: ReadonlyMap<string, number> = new Map()): number | null {
  let acc = 1;
  for (const [atom, e] of v) {
    const base = isPrimeAtom(atom) ? Number(atom) : sample.get(atom);
    if (base === undefined) return null;
    if (base <= 0) return null;
    acc *= Math.pow(base, toNumber(e));
  }
  return acc;
}

/** Split an exponent into its integer part and a remainder in [0, 1) — `3/2` → `1` and `1/2`. */
const splitExp = (e: Rat): { whole: bigint; frac: Rat } => {
  const whole = floor(e);
  return { whole, frac: sub(e, rat(whole)) };
};

const radical = (base: string, f: Rat): string => {
  const body = f.n === 1n ? base : `${base}^${f.n}`;
  if (f.d === 2n) return `√${body}`;
  if (f.d === 3n) return `∛${body}`;
  return `${base}^(${fmtRat(f)})`;
};

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: bigint): string => `${n}`.split('').map((c) => SUP[c] ?? c).join('');

/** `body^(1/d)` the way the exam prints it: `√74`, `∛100`, `⁵√100`. */
const rootOf = (body: bigint, d: bigint): string => {
  if (d === 2n) return `√${body}`;
  if (d === 3n) return `∛${body}`;
  return `${sup(d)}√${body}`;
};

/**
 * Student-facing text: `√2`, `2√2`, `9r`, `16r`, `∛2`, `3/4`.
 *
 * Integer exponent parts fold into one integer coefficient (that is what makes `{2:4, r:1}` read as
 * `16r` rather than `2^4·r`), fractional parts become radicals, and negative exponents move to a
 * denominator. This is the ONE modulus formatter — the canvas label, the data panel and any export
 * call it, so they cannot disagree about how a number is spelled (the ADR-3D-156 lesson).
 */
export function format(v: ExpVec): string {
  let numCoef = 1n;
  let denCoef = 1n;
  /** root degree d → the combined body ∏ pᵏ, so equal-degree prime roots print as ONE radical:
   *  `{2:½, 37:½}` reads `√74`, never `√2√37`, and `{2:⅖, 5:⅖}` reads `⁵√100`, never
   *  `2^(2/5)5^(2/5)` — the #702 class, ruled again by the operator on 2026-08-18 ("we have
   *  √74, or use decimal"). */
  const primeRoots = new Map<bigint, bigint>();
  const paramParts: string[] = [];
  const denParts: string[] = [];

  for (const atom of [...v.keys()].sort((a, b) => {
    const pa = isPrimeAtom(a);
    const pb = isPrimeAtom(b);
    if (pa !== pb) return pa ? -1 : 1; // numbers first, then parameters
    return pa ? Number(a) - Number(b) : a.localeCompare(b);
  })) {
    const e = v.get(atom)!;
    const { whole, frac } = splitExp(e);
    if (isPrimeAtom(atom)) {
      const base = BigInt(atom);
      if (whole > 0n) numCoef *= base ** whole;
      else if (whole < 0n) denCoef *= base ** -whole;
      if (!isZero(frac)) primeRoots.set(frac.d, (primeRoots.get(frac.d) ?? 1n) * base ** frac.n);
    } else {
      if (whole > 0n) paramParts.push(whole === 1n ? atom : `${atom}^${whole}`);
      else if (whole < 0n) denParts.push(-whole === 1n ? atom : `${atom}^${-whole}`);
      if (!isZero(frac)) paramParts.push(radical(atom, frac));
    }
  }

  const numParts = [
    ...[...primeRoots.entries()].sort((a, b) => Number(a[0] - b[0])).map(([d, body]) => rootOf(body, d)),
    ...paramParts,
  ];

  const join = (coef: bigint, parts: string[]): string => {
    if (parts.length === 0) return `${coef}`;
    return coef === 1n ? parts.join('') : `${coef}${parts.join('')}`;
  };
  const num = join(numCoef, numParts);
  const den = join(denCoef, denParts);
  return den === '1' ? num : `${num}/${den}`;
}
