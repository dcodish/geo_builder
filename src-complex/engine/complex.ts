// Numeric complex arithmetic for the C0 prototype (issue #585, docs/27 §9).
// PROTOTYPE BOUNDARY: this is IEEE-double arithmetic only. The accepted design (ADR-CX-001 D1,
// refined in ADR-CX-002) calls for an exact layer — symbolic-base + rational-π arguments — which is
// deliberately NOT built here: a throwaway walking skeleton must not pay for the exact core.
//
// What is left here is the part that DIES with the prototype (#624): the doubles-only operators the
// evaluator sweeps with, and the Gauss plane's two label formatters. Everything the cutover leaves
// standing has moved down a layer — `Cx`/`cx`/`cPolar` and `fmtNum` to `value/value.ts`, the fact
// vocabulary to `model/fact.ts`. The duplicate operators below (`add` vs `value`'s `cAdd`, …) are
// deliberately NOT reconciled: they have no consumer outside this directory, so the cutover deletes
// them rather than a rename touching two hundred call sites in a file about to be removed.

import { type Cx, cPolar, cx, fmtNum } from '../value/value';

export const add = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im);
export const sub = (a: Cx, b: Cx): Cx => cx(a.re - b.re, a.im - b.im);
export const mul = (a: Cx, b: Cx): Cx =>
  cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const neg = (a: Cx): Cx => cx(-a.re, -a.im);
export const conj = (a: Cx): Cx => cx(a.re, -a.im);
export const absC = (a: Cx): number => Math.hypot(a.re, a.im);

/** Argument in degrees, normalized to [0, 360) — the bagrut convention. */
export const argDeg = (a: Cx): number => {
  let d = (Math.atan2(a.im, a.re) * 180) / Math.PI;
  if (d < 0) d += 360;
  return d;
};

/** Integer power (negative allowed; ipow(0, n<=0) yields NaN components, surfaced as an eval error). */
export const ipow = (a: Cx, n: number): Cx => {
  if (n < 0) return div(cx(1), ipow(a, -n));
  let acc = cx(1);
  let base = a;
  let k = n;
  while (k > 0) {
    if (k & 1) acc = mul(acc, base);
    base = mul(base, base);
    k >>= 1;
  }
  return acc;
};

/** All n solutions of z^n = w, in argument order — the formula-sheet roots formula, numerically. */
export const nthRoots = (w: Cx, n: number): Cx[] => {
  const r = Math.pow(absC(w), 1 / n);
  const base = argDeg(w) / n;
  return Array.from({ length: n }, (_, k) => cPolar(r, base + (360 * k) / n));
};

// --- display formatting (rounding only at the display seam) ---

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const formatCart = (z: Cx): string => {
  const re = round3(z.re);
  const im = round3(z.im);
  const imPart = (v: number): string =>
    v === 1 ? 'i' : v === -1 ? '-i' : `${fmtNum(v)}i`;
  if (im === 0) return fmtNum(re);
  if (re === 0) return imPart(im);
  const sign = im < 0 ? '-' : '+';
  const mag = Math.abs(im);
  return `${fmtNum(re)}${sign}${mag === 1 ? 'i' : `${fmtNum(mag)}i`}`;
};

export const formatPolar = (z: Cx): string => {
  const r = absC(z);
  if (round3(r) === 0) return '0';
  return `${fmtNum(r)}·cis ${fmtNum(argDeg(z))}°`;
};
