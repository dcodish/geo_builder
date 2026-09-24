/**
 * The CARTESIAN spelling of a point — `a+bi` — and the exact radical parts behind it (#1404,
 * [ADR-CX-046](../../docs/06d-decisions-complex.md#adr-cx-046)).
 *
 * Two questions live here, and both are display questions the value layer owns (the #653 rule:
 * rounding or spelling anywhere else is how two surfaces start printing one number differently):
 *
 * 1. **Which parts are EXACT radicals?** `2·cis120°` is `-1+√3i`, not `-1+1.73i`. When the modulus
 *    is an exact exponent vector over primes and the argument an exact rational part of a turn,
 *    `r·cos θ` and `r·sin θ` are computed in closed form for the turns whose cosine has a
 *    real-radical form this layer knows: multiples of 15° (√2, √3, (√6±√2)/4), of 18°
 *    ((√5±1)/4, √(10±2√5)/4) and of 22.5° (√(2±√2)/2). Anything else — cos 20°, an angle atom, a
 *    parametric modulus — answers `null`, and the caller keeps its `≈` decimal. The display never
 *    invents an exact value: a table hit is the ONLY way to an exact part.
 * 2. **How is a pair of parts composed?** ONE composer, {@link composeCartesian}, for exact and
 *    decimal parts alike: a part that is zero is DROPPED («-2», «2i», never «-2+0i» or «0+2i»), a unit
 *    imaginary part reads `i`, and an imaginary part that is a fraction or a sum is parenthesised
 *    before its `i` so `√3/2i` can never be read as `√3/(2i)`.
 *
 * A term here is `c·√k·√(a+b√d)` — a rational coefficient, a square-free square root and at most one
 * nested root. The modulus is split into a rational factor, a square-root factor (folded into the
 * terms, so `√2·√6/4` becomes `√3/2`) and a RESIDUAL higher root (`⁵√100`), which is spelled by the one
 * modulus formatter and multiplies the part from outside. No CAS: the table is finite and the
 * arithmetic is bounded integer work on these three shapes (the ADR-CX-006 boundary).
 */

import { type Rat, ONE, add, floor, frac, isZero, mul, neg, rat, sub, toNumber } from './rational';
import { type ExpVec, evaluate as evalMod, format as fmtMod, isPrimeAtom } from './modulus';
import { type Angle, isExactRational } from './angle';

/** `a + b√d` under a square root — the nested radicand of the 18° and 22.5° families. */
interface Nest {
  readonly a: bigint;
  readonly b: bigint;
  readonly d: bigint;
}

/** `c · √k · √(nest)`. `k` is square-free and ≥ 1; a term never carries both `k > 1` and a nest. */
interface Term {
  readonly c: Rat;
  readonly k: bigint;
  readonly nest: Nest | null;
}

const T = (c: Rat, k = 1n, nest: Nest | null = null): Term => ({ c, k, nest });
const q4 = rat(1, 4);
const q2 = rat(1, 2);

/**
 * cos of a reference angle in [0°, 90°], keyed by the exact degrees. The table IS the promise: an
 * angle absent here has no exact cartesian part in this product.
 */
const COS: ReadonlyMap<string, readonly Term[]> = new Map([
  ['0', [T(ONE)]],
  ['15', [T(q4, 6n), T(q4, 2n)]],
  ['18', [T(q4, 1n, { a: 10n, b: 2n, d: 5n })]],
  ['45/2', [T(q2, 1n, { a: 2n, b: 1n, d: 2n })]],
  ['30', [T(q2, 3n)]],
  ['36', [T(q4, 5n), T(q4)]],
  ['45', [T(q2, 2n)]],
  ['54', [T(q4, 1n, { a: 10n, b: -2n, d: 5n })]],
  ['60', [T(q2)]],
  ['135/2', [T(q2, 1n, { a: 2n, b: -1n, d: 2n })]],
  ['72', [T(q4, 5n), T(rat(-1, 4))]],
  ['75', [T(q4, 6n), T(rat(-1, 4), 2n)]],
  ['90', []],
]);

const keyOf = (deg: Rat): string => (deg.d === 1n ? `${deg.n}` : `${deg.n}/${deg.d}`);
const negTerms = (ts: readonly Term[]): Term[] => ts.map((t) => ({ ...t, c: neg(t.c) }));
const cmpRat = (a: Rat, b: Rat): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

/** cos of any exact angle in DEGREES, reduced to the first quadrant; null when not in the table. */
function cosOf(degIn: Rat): Term[] | null {
  const deg = mul(frac(mul(degIn, rat(1, 360))), rat(360)); // [0, 360)
  const d90 = rat(90);
  const d180 = rat(180);
  const d270 = rat(270);
  const look = (ref: Rat, sign: 1 | -1): Term[] | null => {
    const hit = COS.get(keyOf(ref));
    if (!hit) return null;
    return sign === 1 ? [...hit] : negTerms(hit);
  };
  if (cmpRat(deg, d90) <= 0) return look(deg, 1);
  if (cmpRat(deg, d180) <= 0) return look(sub(d180, deg), -1);
  if (cmpRat(deg, d270) <= 0) return look(sub(deg, d180), -1);
  return look(sub(rat(360), deg), 1);
}

const sinOf = (deg: Rat): Term[] | null => cosOf(sub(rat(90), deg));

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
};

/** The largest m with m² | n (n > 0). Bounded trial division — the radicands here are small. */
function squareRoot(n: bigint): bigint {
  let m = 1n;
  let rest = n;
  for (let p = 2n; p * p <= rest; p++) {
    while (rest % (p * p) === 0n) {
      rest /= p * p;
      m *= p;
    }
  }
  return m;
}

/** The modulus split into what the terms can absorb and what multiplies them from outside. */
interface ModSplit {
  /** the rational factor (integer exponent parts) */
  readonly q: Rat;
  /** the square-free square-root factor √s (exponent parts ½) */
  readonly s: bigint;
  /** every other fractional part — `⁵√100` — spelled by the one modulus formatter, or null */
  readonly residual: string | null;
  /** the residual's numeric value (1 when there is none) */
  readonly residualValue: number;
}

function splitModulus(mod: ExpVec): ModSplit | null {
  let num = 1n;
  let den = 1n;
  let s = 1n;
  const residual = new Map<string, Rat>();
  for (const [atom, e] of mod) {
    if (!isPrimeAtom(atom)) return null; // a parametric modulus has no numeric part to spell
    const p = BigInt(atom);
    const whole = floor(e);
    const f = sub(e, rat(whole));
    if (whole > 0n) num *= p ** whole;
    else if (whole < 0n) den *= p ** -whole;
    if (isZero(f)) continue;
    if (f.n === 1n && f.d === 2n) s *= p;
    else residual.set(atom, f);
  }
  return {
    q: rat(num, den),
    s,
    residual: residual.size === 0 ? null : fmtMod(residual),
    residualValue: evalMod(residual) ?? Number.NaN,
  };
}

/** Multiply a term by `q·√s`, keeping `k` square-free and folding √k into a nest. */
function scaleTerm(t: Term, q: Rat, s: bigint): Term {
  // k and s are both square-free, so k·s = g²·(k/g)(s/g) with g = gcd(k, s) and the rest square-free
  const g = gcd(t.k, s);
  let c = mul(mul(t.c, q), rat(g));
  let k = (t.k / g) * (s / g);
  let nest = t.nest;
  if (nest && k > 1n) {
    // √k·√(a+b√d) = √(ka + kb√d): one radical, never `√2√(2+√2)`
    nest = { a: nest.a * k, b: nest.b * k, d: nest.d };
    k = 1n;
  }
  if (nest) {
    const m = squareRoot(gcd(nest.a, nest.b));
    if (m > 1n) {
      nest = { a: nest.a / (m * m), b: nest.b / (m * m), d: nest.d };
      c = mul(c, rat(m));
    }
  }
  return { c, k, nest };
}

const termValue = (t: Term): number =>
  toNumber(t.c) * Math.sqrt(Number(t.k)) * (t.nest ? Math.sqrt(Number(t.nest.a) + Number(t.nest.b) * Math.sqrt(Number(t.nest.d))) : 1);

const nestKey = (n: Nest | null): string => (n ? `${n.a},${n.b},${n.d}` : '');

/** Merge like terms and drop the ones that cancelled. */
function collect(ts: readonly Term[]): Term[] {
  const by = new Map<string, Term>();
  for (const t of ts) {
    const key = `${t.k}|${nestKey(t.nest)}`;
    const prev = by.get(key);
    by.set(key, prev ? { ...prev, c: add(prev.c, t.c) } : t);
  }
  return [...by.values()].filter((t) => !isZero(t.c));
}

/** One part of the pair: its sign, its magnitude text, and whether it is zero. */
export interface CartPart {
  readonly zero: boolean;
  readonly negative: boolean;
  /** the MAGNITUDE's spelling — no leading sign */
  readonly text: string;
  /** the signed numeric value the spelling stands for — what the locks check the spelling against */
  readonly value: number;
}

const ZERO_PART: CartPart = { zero: true, negative: false, text: '0', value: 0 };

const nestText = (n: Nest): string => `${n.a}${n.b < 0n ? '-' : '+'}${n.b === 1n || n.b === -1n ? '' : n.b < 0n ? -n.b : n.b}√${n.d}`;
const radText = (t: Term): string => `${t.k > 1n ? `√${t.k}` : ''}${t.nest ? `√(${nestText(t.nest)})` : ''}`;

/** Spell a (positive) sum of terms, times an optional residual root. */
function spell(terms: Term[], residual: string | null): string {
  const L = terms.reduce((acc, t) => (acc * t.c.d) / gcd(acc, t.c.d), 1n);
  const sorted = [...terms].sort((x, y) => termValue(y) - termValue(x));
  const nums = sorted.map((t) => (t.c.n * L) / t.c.d);
  const pieces = sorted.map((t, i) => {
    const n = nums[i] < 0n ? -nums[i] : nums[i];
    const rad = radText(t);
    return rad === '' ? `${n}` : n === 1n ? rad : `${n}${rad}`;
  });
  if (sorted.length === 1) {
    const n = nums[0] < 0n ? -nums[0] : nums[0];
    const rad = radText(sorted[0]);
    let numText: string;
    if (residual === null) numText = pieces[0];
    else numText = `${n === 1n ? '' : n}${residual}${rad === '' ? '' : `·${rad}`}`;
    return L === 1n ? numText : `${numText}/${L}`;
  }
  const sum = pieces.map((p, i) => (i === 0 ? p : `${nums[i] < 0n ? '-' : '+'}${p}`)).join('');
  const core = L === 1n ? sum : `(${sum})/${L}`;
  if (residual === null) return core;
  return L === 1n ? `${residual}·(${sum})` : `${residual}·${core}`;
}

function partOf(terms: Term[] | null, split: ModSplit): CartPart | null {
  if (terms === null) return null;
  const scaled = collect(terms.map((t) => scaleTerm(t, split.q, split.s)));
  if (scaled.length === 0) return ZERO_PART;
  const v = scaled.reduce((acc, t) => acc + termValue(t), 0);
  const negative = v < 0;
  return {
    zero: false,
    negative,
    text: spell(negative ? negTerms(scaled) : scaled, split.residual),
    value: v * split.residualValue,
  };
}

/**
 * The EXACT cartesian parts of `mod·cis(arg)`, or null when either part has no closed form this
 * layer knows (an angle atom, a parametric modulus, a turn outside the 15°/18°/22.5° families).
 * Null is an honest answer: the caller prints its decimal with `≈`.
 */
export function exactCartesianParts(mod: ExpVec, arg: Angle): { re: CartPart; im: CartPart } | null {
  if (!isExactRational(arg)) return null;
  const split = splitModulus(mod);
  if (!split) return null;
  const deg = mul(arg.turns, rat(360));
  const re = partOf(cosOf(deg), split);
  const im = partOf(sinOf(deg), split);
  return re && im ? { re, im } : null;
}

/**
 * A DECIMAL part, spelled by the caller's formatter. Zero is decided on the SPELLING: a part that
 * reads `0` at the display precision is zero for the reading — float noise (`2·sin 180° = 2.4e-16`)
 * is exactly what the precision exists to absorb, and «-2+0i» printed it as a coordinate.
 */
export function numericPart(x: number, fmt: (magnitude: number) => string): CartPart {
  const text = fmt(Math.abs(x));
  if (text === '0' || Number(text) === 0) return ZERO_PART;
  return { zero: false, negative: x < 0, text, value: x };
}

/** Does an imaginary magnitude need parentheses before its `i`? A fraction or a sum does. */
const needsParens = (text: string): boolean => {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '/' || ch === '+' || ch === '-' || ch === '·')) return true;
  }
  return text.startsWith('(');
};

/**
 * THE one composition of `a+bi` — exact and decimal parts alike. Zero parts are dropped; both zero
 * reads `0`.
 */
export function composeCartesian(re: CartPart, im: CartPart): string {
  const imText = im.text === '1' ? 'i' : needsParens(im.text) ? `(${im.text})i` : `${im.text}i`;
  const reSigned = `${re.negative ? '-' : ''}${re.text}`;
  if (re.zero && im.zero) return '0';
  if (im.zero) return reSigned;
  if (re.zero) return `${im.negative ? '-' : ''}${imText}`;
  return `${reSigned}${im.negative ? '-' : '+'}${imText}`;
}
