/**
 * #1434 (ADR-CX-050) — THE ROOTS OF A CLOSED POLYNOMIAL, as the values its named solutions carry.
 *
 * G1 ([ADR-CX-007](../../docs/06d-decisions-complex.md#adr-cx-007)): *"satisfied by Durand–Kerner over
 * degree ≤ 4 … with the exact recognizer lifting nice roots back into ADR-CX-006's carriers"*. The root
 * finder is the census's ({@link allRoots}, ADR-CX-049) — one root finder in this tree, not two — and
 * this module adds the two things an ENUMERATION needs that a census does not:
 *
 *  1. **A seed-free order**, so the names are stable: X₁ is the root of smallest direction in
 *     [0°, 360°), ties by modulus — the order `X^n = …` already uses (argument order from the principal
 *     root), extended to roots that are not one rotation apart. `z² − 4z + 13 = 0` names z₁ = 2+3i,
 *     z₂ = 2−3i.
 *  2. **The exact lift.** A root is carried EXACTLY when its modulus is: some power |r|ᵏ (k ≤ 4) is a
 *     rational with a small denominator, so the modulus is an exponent vector — `|2+3i| = √13`,
 *     `|2+√2i| = √6`, a root of unity 1. Its direction is then a rational number of turns when it is one
 *     (`cis 72°` is 1/5), and otherwise an ATOM bound to its degrees — the carrier a typed `3+4i` already
 *     uses — shared, negated, by its conjugate so `z₂ = conj(z₁)` is decidable exactly. A modulus no
 *     small power makes rational (`1+√2`) is carried NUMERICALLY: a real number the value layer has no
 *     exact form for, and pretending otherwise would print a fraction the equation never had.
 *
 * Recognition is numeric, and its contract is stated rather than hidden: the root is polished to
 * machine precision by Newton, the candidate rational must agree to 1e-10 relative with a denominator
 * ≤ 1000, and the lifted value is re-evaluated and must land back on the root.
 */

import { type Expr, refsOf } from '../model/expr';
import type { PolyEquation } from '../model/solutionSet';
import { type Angle, fromTurns, isCertifiedAtom } from '../value/angle';
import { gaussianDirection } from '../value/gaussian';
import { fromRational, pow as modPow } from '../value/modulus';
import { fromNumber, rat } from '../value/rational';
import { type Cx, type Value, ZERO_VALUE, cArgDeg, evaluate, exact, numeric } from '../value/value';
import { allRoots, degreeOf, polyOf } from './census';
import { evalComplex } from './residuals';

/** The solutions of one enumerated polynomial: carried values in naming order, and the atoms they bind. */
export interface PolySolutions {
  readonly values: readonly Value[];
  /** each root numerically, in the same order — what #1396's membership matching compares against */
  readonly numeric: readonly Cx[];
  readonly atoms: ReadonlyMap<string, number>;
}

/** Turn denominators kept symbolic — the value layer's own "nice angle" bound (15°). */
const NICE_TURN_DEN = 24;
/** The largest power of the modulus tried for a rational: |r|, |r|², |r|³, |r|⁴. */
const MAX_MOD_POWER = 4;

/**
 * Every DISTINCT root of `lhs − rhs` as a polynomial in the letter, carried and ordered — or null when
 * the equation is not a polynomial of degree ≥ 2 once its closed coefficients are evaluated.
 *
 * `atoms` are the angle atoms the figure's literals already bound (a coefficient written `2+i` is one).
 */
export function polySolutions(eq: PolyEquation, atoms: ReadonlyMap<string, number>): PolySolutions | null {
  const x = eq.varName;
  const closed = { at: () => undefined, param: () => undefined, atoms };
  const poly = polyOf({ t: 'sub', l: eq.lhs, r: eq.rhs } as Expr, {
    involves: (e) => refsOf(e).includes(x),
    constant: (e) => evalComplex(e, closed),
    monomial: (name) => (name === x ? { c: { re: 1, im: 0 }, a: 1 } : null),
  });
  if (!poly || degreeOf(poly) < 2) return null;
  const roots = allRoots(poly);
  const scale = Math.max(1, ...roots.map((r) => Math.hypot(r.re, r.im)));
  // a root the polish did not land is not a number to name
  const residual = (z: Cx): number => {
    let acc = { re: 0, im: 0 };
    for (let k = poly.length - 1; k >= 0; k--) {
      acc = { re: acc.re * z.re - acc.im * z.im + poly[k].re, im: acc.re * z.im + acc.im * z.re + poly[k].im };
    }
    return Math.hypot(acc.re, acc.im);
  };
  const coefScale = Math.max(...poly.map((c) => Math.hypot(c.re, c.im)));
  if (roots.some((r) => residual(r) > 1e-8 * coefScale * scale ** degreeOf(poly))) return null;

  const ordered = [...roots].sort((a, b) => {
    const da = directionOf(a);
    const db = directionOf(b);
    if (Math.abs(da - db) > 1e-9) return da - db;
    return Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im);
  });

  const bound = new Map<string, number>();
  const values = ordered.map((r, k) => lift(r, `∠${x}${k + 1}`, bound, scale));
  return { values, numeric: ordered, atoms: bound };
}

/** A root's direction in [0°, 360°), with float noise at the seam folded to 0. */
function directionOf(z: Cx): number {
  if (Math.hypot(z.re, z.im) < 1e-12) return 0;
  const d = cArgDeg(z);
  return d > 360 - 1e-9 ? 0 : d;
}

/** One root, as exactly as the carriers allow (see the module comment). */
function lift(r: Cx, atomName: string, bound: Map<string, number>, scale: number): Value {
  const m = Math.hypot(r.re, r.im);
  if (m <= 1e-12 * scale) return ZERO_VALUE;
  const mod = exactModulus(m);
  if (!mod) return numeric(r.re, r.im);
  const deg = directionOf(r);
  const arg = gaussianRootDirection(r, bound) ?? exactDirection(deg, atomName, bound);
  const v = exact(mod, arg);
  // the lift must land back on the root it came from
  const back = evaluate(v, bound);
  if (!back || Math.hypot(back.re - r.re, back.im - r.im) > 1e-9 * Math.max(1, m)) return numeric(r.re, r.im);
  return v;
}

function exactModulus(m: number) {
  for (let k = 1; k <= MAX_MOD_POWER; k++) {
    const q = fromNumber(m ** k, 1000, 1e-10);
    if (!q || q.n <= 0n || q.n > 1_000_000n) continue;
    return modPow(fromRational(q), rat(1, k));
  }
  return null;
}

/**
 * #1481 (ADR-CX-057) — a root that is numerically a GAUSSIAN RATIONAL takes the certified direction
 * a typed literal of the same number takes (`value/gaussian.ts`), so the stated `z1 = 2+3i` and the
 * root 2+3i of `z² − 4z + 13` carry THE SAME angle, and every relation between them is exact. The
 * recognition is `lift`'s own (denominator ≤ 1000, 1e-10), and the lifted value is still re-evaluated
 * against the root by the caller.
 */
function gaussianRootDirection(r: Cx, bound: Map<string, number>): Angle | null {
  const re = fromNumber(r.re, 1000, 1e-10);
  const im = fromNumber(r.im, 1000, 1e-10);
  if (!re || !im) return null;
  const g = gaussianDirection(re, im);
  if (!g) return null;
  for (const b of g.bindings) bound.set(b.atom, b.degrees);
  return g.arg;
}

/**
 * A direction as a rational number of turns when it is a nice one, else an atom — reusing, negated, the
 * OPAQUE atom of a root already lifted at the mirror direction, so a conjugate pair is exactly conjugate.
 * Since #1481 this is the path for roots that are NOT Gaussian rationals only; a certified atom is
 * never reused for one (it would claim a Gaussian-prime relation the root does not have).
 */
function exactDirection(deg: number, atomName: string, bound: Map<string, number>): Angle {
  const turns = fromNumber(deg / 360, NICE_TURN_DEN, 1e-12);
  if (turns) return fromTurns(turns);
  // ±atom + a nice turn: −2+3i is ½ turn − ∠(2+3i), so (2+3i)(−2+3i) = −13 is decided exactly, not
  // refused as two unrelated symbols that happen to sum to 180°
  for (const [atom, d] of bound) {
    if (isCertifiedAtom(atom)) continue;
    for (const sign of [1, -1] as const) {
      const offset = fromNumber((((deg - sign * d) / 360) % 1 + 1) % 1, NICE_TURN_DEN, 1e-12);
      if (offset) return { turns: offset, atoms: new Map([[atom, rat(sign)]]) };
    }
  }
  bound.set(atomName, deg);
  return { turns: rat(0), atoms: new Map([[atomName, rat(1)]]) };
}
