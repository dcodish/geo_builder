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
 *    invents an exact value: a table hit is the ONLY way to an exact part. Whether an exact part is
 *    also PRINTED is a separate policy, {@link readableCartesianParts}: at most one root sign per part
 *    (operator ruling, 2026-09-25), else the whole reading is the `≈` decimal.
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

import { type Rat, ONE, add, div, eq as eqRat, floor, frac, fromNumber, isOne as ratIsOne, isZero, mul, neg, rat, sqrtExact, sub, toNumber } from './rational';
import { type ExpVec, evaluate as evalMod, format as fmtMod, fromRational as fromRationalVec, isPrimeAtom, pow as modPowVec } from './modulus';
import { type Angle, type LiteralPair, type RadicalTerm, fromTurns as fromTurnsAngle, isExactRational, literalAtomOf, registerLiteralAtom } from './angle';

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
  if (!isExactRational(arg)) {
    // #1435 — a LITERAL atom's pair is known exactly (`1+√2i`, `2+3i`), whatever its turn
    const t = literalAtomTerms(mod, arg);
    if (!t) return null;
    const re = partOf(t.re, UNIT_SPLIT);
    const im = partOf(t.im, UNIT_SPLIT);
    return re && im ? { re, im } : null;
  }
  const split = splitModulus(mod);
  if (!split) return null;
  const deg = mul(arg.turns, rat(360));
  const re = partOf(cosOf(deg), split);
  const im = partOf(sinOf(deg), split);
  return re && im ? { re, im } : null;
}

/**
 * How many ROOT SIGNS a spelling prints: every `√`, `∛` and `ⁿ√` (an index is a superscript before a
 * `√`, so the `√` is what is counted). `√(2+√2)` is two, `⁵√100·(√5-1)/4` is two, `-1` is none.
 */
export function rootSigns(text: string): number {
  return (text.match(/[√∛∜]/g) ?? []).length;
}

/** The most root signs one part may print and stay exact (operator ruling on #1404, 2026-09-25). */
export const MAX_ROOT_SIGNS_PER_PART = 1;

/**
 * THE printing policy for the cartesian reading — what every surface (canvas label, panel row,
 * `formatCartesian`) asks, never {@link exactCartesianParts} directly. The table still decides whether
 * a part is exact at all; this decides whether the exact form is READABLE:
 *
 * - each part (real, imaginary) is judged on its own — at most ONE root sign stays exact
 *   (`-1+√3i`, `√2+√2i`, `⁵√100`);
 * - a part needing two or more (`√(2+√2)`, `(√6+√2)/4`, `⁵√100·(√5-1)/4`) is not printed exactly;
 * - and one label carries one sign, `=` or `≈`, so if EITHER part fails the whole reading falls back
 *   to the decimal with `≈` (the mixed case `cis18°`: never an `=` over a rounded part, never an exact
 *   part under an `≈`).
 *
 * Null means "print the decimal": the caller's `≈` path.
 */
export function readableCartesianParts(mod: ExpVec, arg: Angle): { re: CartPart; im: CartPart } | null {
  const parts = exactCartesianParts(mod, arg);
  if (!parts) return null;
  const readable = (p: CartPart) => p.zero || rootSigns(p.text) <= MAX_ROOT_SIGNS_PER_PART;
  return readable(parts.re) && readable(parts.im) ? parts : null;
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

/**
 * #1435 — the RADICAL pair recognizer, the inverse direction of {@link exactCartesianParts}: given
 * `a·√k + b·√m·i` (each part one square-free radical term), find the exact polar value it is. The
 * modulus is √(a²k + b²m) — rational under the root, the modulus layer's own vector — and the
 * argument candidate comes from the numeric direction at the table's nice-turn denominators, then
 * is VERIFIED symbolically: the candidate turn's own exact cartesian parts must reproduce the
 * stated terms exactly. No verification, no value — the display never invents an exact form.
 * `√3 + i` → mod 2, arg 30°; `1 + i` → √2 · 45°; a direction outside the table answers null.
 */
export function fromRadicalParts(
  reIn: { c: Rat; k: bigint },
  imIn: { c: Rat; k: bigint },
): { mod: ExpVec; arg: Angle } | null {
  // normalize each part: square-free k, zero spelled {0, 1}
  const norm = (p: { c: Rat; k: bigint }): { c: Rat; k: bigint } | null => {
    if (isZero(p.c)) return { c: p.c, k: 1n };
    if (p.k < 1n) return null;
    const m = squareRoot(p.k);
    return { c: mul(p.c, rat(m)), k: p.k / (m * m) };
  };
  const re = norm(reIn);
  const im = norm(imIn);
  if (!re || !im) return null;
  const mod2 = add(mul(mul(re.c, re.c), rat(re.k)), mul(mul(im.c, im.c), rat(im.k)));
  if (isZero(mod2)) return null;
  const modVec = modPowVec(fromRationalVec(mod2), rat(1, 2));
  const x = toNumber(re.c) * Math.sqrt(Number(re.k));
  const y = toNumber(im.c) * Math.sqrt(Number(im.k));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const turns = fromNumber(deg / 360, 24, 1e-9);
  if (!turns) return null;
  // the symbolic verification: the candidate turn must spell the stated terms EXACTLY
  const split = splitModulus(modVec);
  if (!split || split.residual !== null) return null;
  const matches = (terms: Term[] | null, want: { c: Rat; k: bigint }): boolean => {
    if (terms === null) return false;
    const scaled = collect(terms.map((t) => scaleTerm(t, split.q, split.s)));
    if (isZero(want.c)) return scaled.length === 0;
    return scaled.length === 1 && scaled[0].nest === null && scaled[0].k === want.k && eqRat(scaled[0].c, want.c);
  };
  const degRat = mul(turns, rat(360));
  if (!matches(cosOf(degRat), re) || !matches(sinOf(degRat), im)) return null;
  return { mod: modVec, arg: fromTurnsAngle(turns) };
}

/** #1435 — a modulus as one radical term `q·√s`, or null (parametric, or a residual higher root). */
export function radicalOfModulus(mod: ExpVec): { c: Rat; k: bigint } | null {
  const split = splitModulus(mod);
  return split && split.residual === null ? { c: split.q, k: split.s } : null;
}

/**
 * The parts as exact RATIONALS, when `mod·cis(arg)` is a GAUSSIAN RATIONAL — `1+i`, `-2`, `3/2·i`
 * (#1436). The modulus's √-factor must fold completely into the angle's own radical terms (`√2` into
 * cos 45° = √2/2), leaving a single pure-rational term per part; any surviving root, nest or residual
 * higher root answers null. Null is honest: the caller keeps its `≈` decimal. This is what lets the
 * ask lane do bounded exact arithmetic (sums, differences, products) without a CAS — the Gaussian
 * rationals are closed under it, and √(rational) at the end is the modulus formatter's own job.
 */
export function gaussianRationalParts(mod: ExpVec, arg: Angle): { re: Rat; im: Rat } | null {
  // A single LITERAL atom (the direction of a stated off-axis `a+bi`, registered at mint time):
  // the value is `mod · cis(turns) · (a+bi)/|a+bi|`, Gaussian rational again whenever `mod/|a+bi|`
  // is rational and the residual turn is a quarter-turn multiple (·i per quarter). `2+3i` itself,
  // its conjugate (coefficient −1) and its ±i/−1 rotations all land here.
  if (arg.atoms.size === 1) {
    const t = literalAtomTerms(mod, arg);
    if (!t) return null;
    const ratOfTerms = (ts: Term[]): Rat | null => (ts.length === 0 ? rat(0) : ts.length === 1 && ts[0].k === 1n ? ts[0].c : null);
    const re = ratOfTerms(t.re);
    const im = ratOfTerms(t.im);
    return re !== null && im !== null ? { re, im } : null;
  }
  if (!isExactRational(arg)) return null;
  const split = splitModulus(mod);
  if (!split || split.residual !== null) return null;
  const deg = mul(arg.turns, rat(360));
  const ratOf = (terms: Term[] | null): Rat | null => {
    if (terms === null) return null;
    const scaled = collect(terms.map((t) => scaleTerm(t, split.q, split.s)));
    if (scaled.length === 0) return rat(0);
    if (scaled.length > 1) return null;
    const t = scaled[0];
    return t.k === 1n && t.nest === null ? t.c : null;
  };
  const re = ratOf(cosOf(deg));
  const im = ratOf(sinOf(deg));
  return re !== null && im !== null ? { re, im } : null;
}

/** A CartPart from an exact rational — `5`, `5/2` — for {@link composeCartesian} (#1436). */
export function ratPart(x: Rat): CartPart {
  if (isZero(x)) return ZERO_PART;
  const negative = x.n < 0n;
  const n = negative ? -x.n : x.n;
  return { zero: false, negative, text: x.d === 1n ? `${n}` : `${n}/${x.d}`, value: toNumber(x) };
}

/** The unit modulus split — terms that are already scaled. */
const UNIT_SPLIT: ModSplit = { q: ONE, s: 1n, residual: null, residualValue: 1 };

/**
 * #1435 — the exact terms of `mod·cis(arg)` when `arg` is a single LITERAL atom (coefficient ±1 —
 * the literal or its conjugate) plus a quarter-turn multiple: the value is
 * `mod·cis(turns)·(pair)/|pair|`, carried exactly whenever `mod/|pair|` is rational. Shared by the
 * cartesian display and the Gaussian-rational ask arithmetic (#1436), so both read one registry.
 */
function literalAtomTerms(mod: ExpVec, arg: Angle): { re: Term[]; im: Term[] } | null {
  if (arg.atoms.size !== 1) return null;
  const [[name, coef]] = [...arg.atoms.entries()];
  const conj = ratIsOne(neg(coef));
  if (!ratIsOne(coef) && !conj) return null;
  const g = literalAtomOf(name);
  if (!g) return null;
  const split = splitModulus(mod);
  if (!split || split.residual !== null) return null;
  const quarter = mul(frac(arg.turns), rat(4));
  if (quarter.d !== 1n) return null;
  const s = add(mul(mul(g.re.c, g.re.c), rat(g.re.k)), mul(mul(g.im.c, g.im.c), rat(g.im.k)));
  if (isZero(s)) return null;
  const k = sqrtExact(div(mul(mul(split.q, split.q), rat(split.s)), s));
  if (k === null) return null;
  const termsOf = (t: RadicalTerm, sign: Rat): Term[] => (isZero(t.c) ? [] : [T(mul(mul(k, sign), t.c), t.k)]);
  let re = termsOf(g.re, ONE);
  let im = termsOf(g.im, conj ? rat(-1) : ONE);
  for (let i = 0n; i < quarter.n; i++) [re, im] = [negTerms(im), re];
  return { re, im };
}

/** A radical term normalised: square-free `k`, zero spelled `{0, 1}`; null for a negative radicand. */
function normTerm(p: RadicalTerm): RadicalTerm | null {
  if (isZero(p.c)) return { c: p.c, k: 1n };
  if (p.k < 1n) return null;
  const m = squareRoot(p.k);
  return { c: mul(p.c, rat(m)), k: p.k / (m * m) };
}

/**
 * #1435 — `mod·cis(arg)` as ONE radical term per part (`c·√k`), when the angle is an exact table
 * turn and each part collects to a single term with no nest (`2·cis60°` → `1 + √3·i`,
 * `√2·cis45°` → `1 + i`). Null otherwise — the Gaussian-radical walk in the parser treats null as
 * "not a radical literal", never as a guess.
 */
export function radicalPartsOf(mod: ExpVec, arg: Angle): LiteralPair | null {
  if (!isExactRational(arg)) return null;
  const split = splitModulus(mod);
  if (!split || split.residual !== null) return null;
  const deg = mul(arg.turns, rat(360));
  const one = (terms: Term[] | null): RadicalTerm | null => {
    if (terms === null) return null;
    const scaled = collect(terms.map((t) => scaleTerm(t, split.q, split.s)));
    if (scaled.length === 0) return { c: rat(0), k: 1n };
    return scaled.length === 1 && scaled[0].nest === null ? { c: scaled[0].c, k: scaled[0].k } : null;
  };
  const re = one(cosOf(deg));
  const im = one(sinOf(deg));
  return re && im ? { re, im } : null;
}

/**
 * #1435 (ADR-CX-056 amendment 1) — a closed RADICAL literal (`a·√k + b·√m·i`, at least one part
 * irrational) as the exact value it is. ALWAYS a value: the modulus `√(a²k + b²m)` is rational
 * under the root, so it is exact on the modulus layer's own vector, and the argument is the angle
 * table's turn when {@link fromRadicalParts} verifies one (`√3 + i` → `2·cis30°`), otherwise a
 * LITERAL ATOM carrying the exact pair — exactly how `3+4i` is carried (`fromCartesian`), so
 * `1 + √2i` reads `√3`, `≈ cis54.74°` and `= 1+√2i`. `atom` names the atom and its degrees
 * for the caller's sample; null when the table answered. Null overall only for a zero or a
 * malformed pair.
 */
export function radicalLiteral(
  reIn: RadicalTerm,
  imIn: RadicalTerm,
): { mod: ExpVec; arg: Angle; atom: { name: string; degrees: number } | null } | null {
  const re = normTerm(reIn);
  const im = normTerm(imIn);
  if (!re || !im) return null;
  const table = fromRadicalParts(re, im);
  if (table) return { ...table, atom: null };
  const mod2 = add(mul(mul(re.c, re.c), rat(re.k)), mul(mul(im.c, im.c), rat(im.k)));
  if (isZero(mod2)) return null;
  const mod = modPowVec(fromRationalVec(mod2), rat(1, 2));
  const x = toNumber(re.c) * Math.sqrt(Number(re.k));
  const y = toNumber(im.c) * Math.sqrt(Number(im.k));
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const text = composeCartesian(partOf(isZero(re.c) ? [] : [T(re.c, re.k)], UNIT_SPLIT)!, partOf(isZero(im.c) ? [] : [T(im.c, im.k)], UNIT_SPLIT)!);
  const name = `∠(${text})`;
  registerLiteralAtom(name, { re, im });
  return { mod, arg: { turns: rat(0), atoms: new Map([[name, ONE]]) }, atom: { name, degrees } };
}
