/**
 * THE NUMERIC CENSUS — stage 3b of [docs/LADDER-CX.md](../../docs/LADDER-CX.md) (#1427, ADR-CX-049).
 *
 * Tier 2 used to land on ONE isolated solution — the one its starting sample fell towards — and the
 * others never became configurations. `z² − 4z + 13 = 0` has two roots and the figure knew one, so a
 * value that differs between them (`Im z = ±3`) printed as fact, and a value they share (`Re z = 2`)
 * was withheld as «not determined». The knowledge question is *invariant across every valid
 * configuration*; it cannot be asked of a set that is missing members.
 *
 * So stage 3 reports its distinct converged solutions and says HOW MUCH it knows about them:
 *
 *  - **`complete`** — the set is provably every solution. That is the case exactly when some stated
 *    equation is a nonzero holomorphic POLYNOMIAL in the one complex unknown the linear tier left: its
 *    roots (fundamental theorem of algebra — all of them, found by Durand–Kerner) contain every
 *    solution, and each is then verified against every other relation.
 *  - **`floor`** — a multi-start census of a system with no such certificate. Every member is a real
 *    solution, but nothing proves there is no other, so no value may be read as invariant over it.
 *
 * The polynomial is read off the AST, structurally — never inferred from samples. That is the
 * [ADR-421](../../docs/06-decisions.md#adr-421) rule this whole tree keeps: a conclusion drawn from how
 * little some samples varied inverts silently exactly when the samples are few.
 */

import type { Cx } from '../value/value';
import type { Expr } from '../model/expr';
import { toNumber } from '../value/rational';

/** Ascending coefficients: `p[k]` multiplies `t^k`. */
export type Poly = Cx[];

/** How much the census proves about its own size. */
export type Completeness = 'complete' | 'floor';

/** Degrees above this are not read as polynomials — the corpus stops at 4, and the root finder at ~12. */
export const MAX_DEGREE = 12;

const C = (re: number, im: number): Cx => ({ re, im });
const cadd = (a: Cx, b: Cx): Cx => C(a.re + b.re, a.im + b.im);
const csub = (a: Cx, b: Cx): Cx => C(a.re - b.re, a.im - b.im);
const cmul = (a: Cx, b: Cx): Cx => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a: Cx, b: Cx): Cx | null => {
  const d = b.re * b.re + b.im * b.im;
  return d === 0 ? null : C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cabs = (a: Cx): number => Math.hypot(a.re, a.im);

const padd = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, k) => cadd(a[k] ?? C(0, 0), b[k] ?? C(0, 0)));
const pneg = (a: Poly): Poly => a.map((c) => C(-c.re, -c.im));
const pscale = (a: Poly, s: Cx): Poly => a.map((c) => cmul(c, s));
const pmul = (a: Poly, b: Poly): Poly | null => {
  if (a.length + b.length - 2 > MAX_DEGREE) return null;
  const out: Poly = Array.from({ length: a.length + b.length - 1 }, () => C(0, 0));
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] = cadd(out[i + j], cmul(x, y)))));
  return out;
};

/** What {@link polyOf} needs to know about the figure, supplied by the fold. */
export interface PolyContext {
  /** does this subtree read the unknown at all (through any name that depends on it)? */
  readonly involves: (e: Expr) => boolean;
  /** the value of a subtree that does NOT involve the unknown — null when it cannot be evaluated */
  readonly constant: (e: Expr) => Cx | null;
  /**
   * A name that depends on the unknown, as `c·t^a` with `a` a non-negative integer — the only way a
   * name can be a polynomial in `t`. Null when the linear tier made it anything else (`conj t`,
   * `|t|`, `t^(1/2)`): then no expression reading it is a polynomial, and the census is a floor.
   */
  readonly monomial: (name: string) => { readonly c: Cx; readonly a: number } | null;
}

/**
 * An expression, read as a polynomial in the unknown — or null when it is not one.
 *
 * Structural: sums, products, non-negative integer powers and division by a constant are closed over
 * polynomials; a conjugate, a modulus or a non-integer power of anything that involves the unknown is
 * not holomorphic, and the answer is then "not a polynomial", never an approximation of one.
 */
export function polyOf(e: Expr, ctx: PolyContext): Poly | null {
  if (!ctx.involves(e)) {
    const v = ctx.constant(e);
    return v ? [v] : null;
  }
  switch (e.t) {
    case 'ref': {
      const m = ctx.monomial(e.name);
      if (!m || !Number.isInteger(m.a) || m.a < 0 || m.a > MAX_DEGREE) return null;
      const out: Poly = Array.from({ length: m.a + 1 }, () => C(0, 0));
      out[m.a] = m.c;
      return out;
    }
    case 'add':
    case 'sub': {
      const l = polyOf(e.l, ctx);
      const r = polyOf(e.r, ctx);
      if (!l || !r) return null;
      return padd(l, e.t === 'add' ? r : pneg(r));
    }
    case 'neg': {
      const x = polyOf(e.e, ctx);
      return x ? pneg(x) : null;
    }
    case 'mul': {
      const l = polyOf(e.l, ctx);
      const r = polyOf(e.r, ctx);
      return l && r ? pmul(l, r) : null;
    }
    case 'div': {
      if (ctx.involves(e.r)) return null;
      const l = polyOf(e.l, ctx);
      const d = ctx.constant(e.r);
      if (!l || !d || cabs(d) === 0) return null;
      const inv = cdiv(C(1, 0), d);
      return inv ? pscale(l, inv) : null;
    }
    case 'pow': {
      const k = toNumber(e.exp);
      if (!Number.isInteger(k) || k < 0) return null;
      const b = polyOf(e.base, ctx);
      if (!b) return null;
      let out: Poly | null = [C(1, 0)];
      for (let i = 0; i < k && out; i++) out = pmul(out, b);
      return out;
    }
    default:
      // conj / abs of something that moves with the unknown: not holomorphic
      return null;
  }
}

/** Drop leading coefficients that are zero relative to the polynomial's scale. */
function trim(p: Poly): Poly {
  const scale = Math.max(0, ...p.map(cabs));
  if (scale === 0) return [];
  let n = p.length;
  while (n > 0 && cabs(p[n - 1]) <= 1e-12 * scale) n--;
  return p.slice(0, n);
}

/** The DEGREE of a polynomial once numerical noise is trimmed — −1 for the zero polynomial. */
export const degreeOf = (p: Poly): number => trim(p).length - 1;

const horner = (p: Poly, z: Cx): Cx => {
  let acc = C(0, 0);
  for (let k = p.length - 1; k >= 0; k--) acc = cadd(cmul(acc, z), p[k]);
  return acc;
};

/**
 * EVERY root of a polynomial, counted once each — Durand–Kerner (Weierstrass), then Newton polish.
 *
 * Degree ≤ {@link MAX_DEGREE}, so a fixed iteration cap is a real bound, not a hope. A repeated root is
 * found as a cluster and deduplicated: the configuration set counts DISTINCT drawings.
 */
export function allRoots(poly: Poly): Cx[] {
  const p = trim(poly);
  const n = p.length - 1;
  if (n < 1) return [];
  const lead = p[n];
  const monic = p.map((c) => cdiv(c, lead) ?? C(0, 0));
  if (n === 1) return [C(-monic[0].re, -monic[0].im)];

  // Cauchy's bound puts every root inside this radius, so the starts surround them
  const radius = 1 + Math.max(...monic.slice(0, n).map(cabs));
  let z: Cx[] = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    return C(radius * 0.5 * Math.cos(ang), radius * 0.5 * Math.sin(ang));
  });
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    const next = z.map((zi, i) => {
      let den = C(1, 0);
      z.forEach((zj, j) => {
        if (j !== i) den = cmul(den, csub(zi, zj));
      });
      const step = cdiv(horner(monic, zi), den);
      if (!step) return zi;
      moved = Math.max(moved, cabs(step));
      return csub(zi, step);
    });
    z = next;
    if (moved <= 1e-14 * radius) break;
  }
  // Newton polish on the monic polynomial — converges quadratically from DK's neighbourhood
  const deriv: Poly = monic.slice(1).map((c, k) => C(c.re * (k + 1), c.im * (k + 1)));
  z = z.map((zi) => {
    let x = zi;
    for (let i = 0; i < 8; i++) {
      const d = horner(deriv, x);
      const s = cdiv(horner(monic, x), d);
      if (!s || !Number.isFinite(s.re) || !Number.isFinite(s.im)) break;
      x = csub(x, s);
    }
    return x;
  });
  const distinct: Cx[] = [];
  for (const r of z) {
    if (!distinct.some((d) => cabs(csub(d, r)) <= 1e-6 * Math.max(1, cabs(r)))) distinct.push(r);
  }
  return distinct;
}

/**
 * Deterministic starting points for the n-D census — spread over the bounded box, never seeded.
 *
 * Seed-independent on purpose: the census is the CONFIGURATION SET, and a set that changed with the
 * seed would make "show another configuration" walk a different list at every press.
 */
export function censusStarts(
  kinds: readonly ('mod' | 'arg' | 'par')[],
  bounds: readonly { readonly lo?: number; readonly hi?: number }[],
  count: number,
): number[][] {
  const out: number[][] = [];
  const PHI = 0.6180339887498949;
  for (let j = 0; j < count; j++) {
    out.push(
      kinds.map((k, i) => {
        const u = (((j + 1) * PHI + i * 0.3819660112501051) % 1 + 1) % 1; // 0 .. 1, low-discrepancy
        const b = bounds[i] ?? {};
        if (k === 'arg') {
          const lo = b.lo ?? 0;
          const hi = b.hi ?? lo + 360;
          return lo + (0.05 + 0.9 * u) * (hi - lo);
        }
        const mag = Math.exp(-1.2 + 3.2 * u); // ≈ 0.3 .. 7.4
        if (k === 'par' && b.lo === undefined && b.hi === undefined) return j % 2 === 0 ? mag : -mag;
        if (b.hi !== undefined && b.hi <= 0) return -mag;
        return mag;
      }),
    );
  }
  return out;
}
