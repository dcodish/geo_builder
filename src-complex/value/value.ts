/**
 * A complex VALUE: either exactly carried (modulus as a ℚ-exponent vector, argument as ℚ turns plus
 * atoms) or numeric — [ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006).
 *
 * The rule for which one you get is structural, not a heuristic:
 *
 *   **a value is exact iff its whole derivation is multiplicative over exact atoms.**
 *
 * Multiplication, division, integer powers, n-th roots and conjugation preserve exactness because each
 * is linear in `(ln|z|, arg z)`. Addition and subtraction do not — there is no closed form for the
 * modulus of a sum — so an additive node is numeric, and the solver routes its constraints to the
 * numeric tier. That is a real boundary in the mathematics, and drawing it here rather than in the
 * solver is what keeps the solver from having to guess.
 *
 * This module deliberately does NOT auto-degrade: `mul` of two exacts is exact, and mixing an exact
 * with a numeric is the caller's decision, made where the parameter sample is in scope. An implicit
 * degradation is how a value layer starts lying about what it knows.
 */

import {
  type ExpVec,
  evaluate as evalMod,
  eq as modEq,
  format as fmtMod,
  fromRational,
  isParametric,
  mul as modMul,
  div as modDiv,
  one as modOne,
  paramsOf,
  pow as modPow,
} from './modulus';
import {
  type Angle,
  add as angAdd,
  atomsOf,
  format as fmtAng,
  fromTurns,
  isExactRational,
  neg as angNeg,
  sameDirection,
  scale as angScale,
  sub as angSub,
  toRadians,
  zero as angZero,
} from './angle';
import { type Rat, ZERO, cmp, isZero as ratIsZero, mul as ratMul, rat, add as ratAdd, fromNumber, toNumber } from './rational';

/** A plain numeric complex number — the shadow every value can be evaluated to. */
export interface Cx {
  readonly re: number;
  readonly im: number;
}

export const cx = (re: number, im = 0): Cx => ({ re, im });
export const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
export const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
export const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cNeg = (a: Cx): Cx => ({ re: -a.re, im: -a.im });
export const cConj = (a: Cx): Cx => ({ re: a.re, im: -a.im });
export const cAbs = (a: Cx): number => Math.hypot(a.re, a.im);
/** Degrees in [0, 360) — the register the exam and the canvas both use. */
export const cArgDeg = (a: Cx): number => ((Math.atan2(a.im, a.re) * 180) / Math.PI + 360) % 360;
export function cDiv(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new Error('complex division by zero');
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
export const cPolar = (mod: number, deg: number): Cx => ({
  re: mod * Math.cos((deg * Math.PI) / 180),
  im: mod * Math.sin((deg * Math.PI) / 180),
});

/** The exact carrier pair. `|z| = mod`, `arg z = arg`. */
export interface Exact {
  readonly mod: ExpVec;
  readonly arg: Angle;
}

/** Exactly zero — no logarithm and no argument, so it is its own case rather than a modulus of 0. */
export interface ZeroValue {
  readonly kind: 'zero';
}
export interface ExactValue extends Exact {
  readonly kind: 'exact';
}
export interface NumericValue {
  readonly kind: 'numeric';
  readonly re: number;
  readonly im: number;
}

/** The members are named rather than inlined so the `is` predicates below narrow the union. */
export type Value = ZeroValue | ExactValue | NumericValue;

export const ZERO_VALUE: ZeroValue = { kind: 'zero' };
export const exact = (mod: ExpVec, arg: Angle): ExactValue => ({ kind: 'exact', mod, arg });
export const numeric = (re: number, im = 0): Value =>
  re === 0 && im === 0 ? ZERO_VALUE : { kind: 'numeric', re, im };
export const ONE_VALUE: ExactValue = exact(modOne(), angZero());

export const isExact = (v: Value): v is ExactValue => v.kind === 'exact';
export const isZeroValue = (v: Value): v is ZeroValue => v.kind === 'zero';

/** Which parameter symbols a value's exact form depends on — modulus atoms and angle atoms alike. */
export function symbolsOf(v: Value): string[] {
  if (!isExact(v)) return [];
  return [...new Set([...paramsOf(v.mod), ...atomsOf(v.arg)])].sort();
}

/** True when the value's numeric shadow needs no sample. */
export const isDetermined = (v: Value): boolean =>
  isZeroValue(v) || v.kind === 'numeric' || (!isParametric(v.mod) && isExactRational(v.arg));

// ---------------------------------------------------------------------------
// The multiplicative core — exactness-preserving by construction
// ---------------------------------------------------------------------------

/** `a·b`. Exact when both sides are; zero absorbs. */
export function mul(a: Value, b: Value): Value | null {
  if (isZeroValue(a) || isZeroValue(b)) return ZERO_VALUE;
  if (isExact(a) && isExact(b)) return exact(modMul(a.mod, b.mod), angAdd(a.arg, b.arg));
  return null; // mixed or numeric — the caller evaluates at a sample and uses cMul
}

/** `a/b`. Exact when both sides are. Division by zero is a caller error, not a value. */
export function div(a: Value, b: Value): Value | null {
  if (isZeroValue(b)) throw new Error('complex division by zero');
  if (isZeroValue(a)) return ZERO_VALUE;
  if (isExact(a) && isExact(b)) return exact(modDiv(a.mod, b.mod), angSub(a.arg, b.arg));
  return null;
}

/** `a^k` for any rational k — integer powers AND the principal n-th root (k = 1/n). */
export function pow(a: Value, k: Rat): Value | null {
  if (isZeroValue(a)) return cmp(k, ZERO) > 0 ? ZERO_VALUE : null;
  if (isExact(a)) return exact(modPow(a.mod, k), angScale(a.arg, k));
  return null;
}

/**
 * The k-th of the n n-th roots, `k = 0 … n−1` — the exam's «כל האפשרויות», enumerated.
 *
 * The whole point of carrying turns exactly: the roots are `arg/n + k/n` turns apart, so a regular
 * n-gon comes out EXACT even when the base argument is an opaque atom (the §2b case, where θ₀ is only
 * numeric but the 72° spacing must not be).
 */
export function nthRoot(a: Value, n: number, k: number): Value | null {
  if (n < 1 || !Number.isInteger(n)) throw new Error(`nthRoot: n must be a positive integer, got ${n}`);
  if (isZeroValue(a)) return ZERO_VALUE;
  if (!isExact(a)) return null;
  const base = exact(modPow(a.mod, rat(1, n)), angScale(a.arg, rat(1, n)));
  return mul(base, exact(modOne(), fromTurns(rat(k, n))));
}

/** All n roots of `z^n = a`, in branch order 0 … n−1. */
export function nthRoots(a: Value, n: number): (Value | null)[] {
  return Array.from({ length: n }, (_, k) => nthRoot(a, n, k));
}

export function conj(a: Value): Value {
  if (isZeroValue(a)) return ZERO_VALUE;
  if (isExact(a)) return exact(a.mod, angNeg(a.arg));
  return numeric(a.re, -a.im);
}

/** `−a` — a half turn, which is why negation stays inside the exact core. */
export function neg(a: Value): Value {
  if (isZeroValue(a)) return ZERO_VALUE;
  if (isExact(a)) return exact(a.mod, angAdd(a.arg, fromTurns(rat(1, 2))));
  return numeric(-a.re, -a.im);
}

/** `|a|` as a value (a non-negative real, argument zero). */
export function abs(a: Value): Value {
  if (isZeroValue(a)) return ZERO_VALUE;
  if (isExact(a)) return exact(a.mod, angZero());
  return numeric(Math.hypot(a.re, a.im), 0);
}

// ---------------------------------------------------------------------------
// Evaluation and comparison
// ---------------------------------------------------------------------------

/** The numeric shadow at a parameter sample. Null when a symbol the value needs is unbound. */
export function evaluate(v: Value, sample: ReadonlyMap<string, number> = new Map()): Cx | null {
  if (isZeroValue(v)) return cx(0, 0);
  if (v.kind === 'numeric') return cx(v.re, v.im);
  const m = evalMod(v.mod, sample);
  if (m === null) return null;
  const r = toRadians(v.arg, sample);
  if (r === null) return null;
  return { re: m * Math.cos(r), im: m * Math.sin(r) };
}

/**
 * PROVABLE equality — same modulus vector, same direction. Conservative by design: two values that
 * merely agree at the current sample are NOT equal, because nothing in the givens forces that, and
 * saying otherwise is asserting one drawing's coincidence as knowledge (ADR-052).
 */
export function provablyEqual(a: Value, b: Value): boolean {
  if (isZeroValue(a) || isZeroValue(b)) return isZeroValue(a) && isZeroValue(b);
  if (!isExact(a) || !isExact(b)) return false;
  return modEq(a.mod, b.mod) && sameDirection(a.arg, b.arg);
}

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

/** How fine an angle counts as "nice" enough to keep symbolically: 24 turns-denominator = 15°. */
const NICE_TURN_DEN = 24;

export interface CartesianLiteral {
  readonly value: Value;
  /**
   * Present when the argument could not be recognised as a rational number of turns: the argument is
   * an opaque ATOM and this is the numeric degrees it stands for. The caller binds it into the sample.
   * The MODULUS is still exact — `|3+4i| = 5` exactly — which is the half that usually matters.
   */
  readonly atomBinding?: { readonly atom: string; readonly degrees: number };
}

/**
 * `a + bi` with rational components, carried as exactly as it can be.
 *
 * The modulus is ALWAYS exact: `|a+bi|² = a² + b²` is a rational, and halving an exponent vector is
 * exact, so `1+i` is `√2` and `3+4i` is `5` with no recognition step at all. Only the argument may
 * need an atom, and only when it is not a multiple of 15°.
 */
export function fromCartesian(re: Rat, im: Rat, label = ''): CartesianLiteral {
  if (ratIsZero(re) && ratIsZero(im)) return { value: ZERO_VALUE };

  const sq = ratAdd(ratMul(re, re), ratMul(im, im));
  const mod = modPow(fromRational(sq), rat(1, 2));

  // The axis cases are exact with no recognition: 0, 90, 180, 270 degrees.
  if (ratIsZero(im)) return { value: exact(mod, fromTurns(cmp(re, ZERO) > 0 ? rat(0) : rat(1, 2))) };
  if (ratIsZero(re)) return { value: exact(mod, fromTurns(cmp(im, ZERO) > 0 ? rat(1, 4) : rat(3, 4))) };

  const deg = cArgDeg({ re: toNumber(re), im: toNumber(im) });
  const turns = fromNumber(deg / 360, NICE_TURN_DEN, 1e-12);
  if (turns) return { value: exact(mod, fromTurns(turns)) };

  const atom = label ? `∠${label}` : `∠(${fmtRatPair(re, im)})`;
  return {
    value: exact(mod, { turns: ZERO, atoms: new Map([[atom, rat(1)]]) }),
    atomBinding: { atom, degrees: deg },
  };
}

const fmtRatPair = (re: Rat, im: Rat): string => {
  const r = toNumber(re);
  const i = toNumber(im);
  return `${r}${i < 0 ? '-' : '+'}${Math.abs(i)}i`;
};

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** `√2·cis45°` — the polar form, exact when the value is. */
export function formatPolar(v: Value, sample?: ReadonlyMap<string, number>): string {
  if (isZeroValue(v)) return '0';
  if (isExact(v)) return `${fmtMod(v.mod)}·cis${fmtAng(v.arg)}`;
  const n = evaluate(v, sample);
  return n ? `${round(cAbs(n))}·cis${round(cArgDeg(n))}°` : '?';
}

/** `1+i`, `-2`, `3-4i` — the cartesian form; exact values are evaluated for display only. */
export function formatCartesian(v: Value, sample?: ReadonlyMap<string, number>): string {
  const n = evaluate(v, sample);
  if (!n) return '?';
  const re = round(n.re);
  const im = round(n.im);
  if (im === 0) return `${re}`;
  if (re === 0) return im === 1 ? 'i' : im === -1 ? '-i' : `${im}i`;
  const mag = Math.abs(im);
  return `${re}${im < 0 ? '-' : '+'}${mag === 1 ? '' : mag}i`;
}

const round = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};
