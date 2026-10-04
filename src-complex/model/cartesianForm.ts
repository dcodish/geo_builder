/**
 * #1365 ([ADR-CX-058](../../docs/06d-decisions-complex.md#adr-cx-058)) — the SYMBOLIC cartesian
 * reading of a number DEFINED by real parameters: `z1 = a+bi` reads «z₁ = a+bi» while a and b are
 * free, «z₁ = 3+bi» once a = 3 is forced, and «z₁ = 3+4i» once both are.
 *
 * A definition `name = E` qualifies when E names no complex number and is AFFINE in its parameters
 * over the Gaussian rationals — each part (real, imaginary) a rational constant plus rational multiples
 * of parameters. That is exactly the textbook register (`a+bi`, `x+yi`, `a-bi`, `2+ri`, `3a+2bi`), and
 * it is closed: a product of two parameters, a parameter under a power or a modulus, or a non-rational
 * constant leaves the shape and the reading stays the bare name (the no-guess rule, unchanged).
 *
 * A parameter is substituted only when its value is an exact RATIONAL with a known sign — knowledge,
 * by the same predicate the parameter rows print from. A known irrational value (√2) keeps its
 * letter: still true, never a decimal posing as exact.
 *
 * This is a READING over the student's own statement. It does not make the number a function of its
 * parameters in the solver — that is the definition mechanism (#1410), which this does not build.
 */

import type { Expr } from './expr';
import { refsOf } from './expr';
import { type Rat, rat, add, sub, mul, div, neg, isZero, cmp, ZERO } from '../value/rational';
import { gaussianRationalParts, type CartPart, ratPart } from '../value/cartesian';
import type { Constraint } from './constraint';

/** One part (real or imaginary): `c + Σ kₚ·p`, terms in first-seen order. */
export interface AffinePart {
  readonly c: Rat;
  readonly terms: ReadonlyMap<string, Rat>;
}

/** A Gaussian-affine form in real parameters: `re + im·i`. */
export interface CartesianForm {
  readonly re: AffinePart;
  readonly im: AffinePart;
}

const constPart = (c: Rat): AffinePart => ({ c, terms: new Map() });
const ZERO_PART: AffinePart = constPart(ZERO);
const isConstPart = (p: AffinePart): boolean => p.terms.size === 0;

function combine(a: AffinePart, b: AffinePart, f: (x: Rat, y: Rat) => Rat): AffinePart {
  const terms = new Map<string, Rat>();
  for (const k of new Set([...a.terms.keys(), ...b.terms.keys()])) {
    const v = f(a.terms.get(k) ?? ZERO, b.terms.get(k) ?? ZERO);
    if (!isZero(v)) terms.set(k, v);
  }
  return { c: f(a.c, b.c), terms };
}
const plus = (a: AffinePart, b: AffinePart) => combine(a, b, add);
const minus = (a: AffinePart, b: AffinePart) => combine(a, b, sub);
const scale = (a: AffinePart, k: Rat): AffinePart => combine(a, ZERO_PART, (x) => mul(x, k));

/** The form of `e`, or null when it leaves the Gaussian-affine shape. */
export function cartesianFormOf(e: Expr): CartesianForm | null {
  switch (e.t) {
    case 'num':
      return { re: constPart(e.v), im: ZERO_PART };
    case 'val': {
      if (e.v.kind === 'zero') return { re: ZERO_PART, im: ZERO_PART };
      if (e.v.kind !== 'exact') return null;
      const g = gaussianRationalParts(e.v.mod, e.v.arg);
      return g ? { re: constPart(g.re), im: constPart(g.im) } : null;
    }
    case 'i':
      return { re: ZERO_PART, im: constPart(rat(1)) };
    case 'param':
      return { re: { c: ZERO, terms: new Map([[e.name, rat(1)]]) }, im: ZERO_PART };
    case 'add':
    case 'sub': {
      const l = cartesianFormOf(e.l);
      const r = cartesianFormOf(e.r);
      if (!l || !r) return null;
      const f = e.t === 'add' ? plus : minus;
      return { re: f(l.re, r.re), im: f(l.im, r.im) };
    }
    case 'neg': {
      const x = cartesianFormOf(e.e);
      return x ? { re: scale(x.re, rat(-1)), im: scale(x.im, rat(-1)) } : null;
    }
    case 'mul': {
      const l = cartesianFormOf(e.l);
      const r = cartesianFormOf(e.r);
      if (!l || !r) return null;
      // affine × affine stays affine only when one side is a CONSTANT (a product of two parameters is not)
      const [k, x] = isConstPart(l.re) && isConstPart(l.im) ? [l, r] : isConstPart(r.re) && isConstPart(r.im) ? [r, l] : [null, null];
      if (!k || !x) return null;
      // (kr + ki·i)(xr + xi·i) = (kr·xr − ki·xi) + (kr·xi + ki·xr)i
      return {
        re: minus(scale(x.re, k.re.c), scale(x.im, k.im.c)),
        im: plus(scale(x.im, k.re.c), scale(x.re, k.im.c)),
      };
    }
    case 'div': {
      const l = cartesianFormOf(e.l);
      const r = cartesianFormOf(e.r);
      // only by a nonzero REAL rational — anything else is not affine in the parameters
      if (!l || !r || !isConstPart(r.re) || !isConstPart(r.im) || !isZero(r.im.c) || isZero(r.re.c)) return null;
      const k = div(rat(1), r.re.c);
      return { re: scale(l.re, k), im: scale(l.im, k) };
    }
    default:
      return null;
  }
}

const hasParams = (f: CartesianForm): boolean => f.re.terms.size > 0 || f.im.terms.size > 0;

/**
 * The DEFINITION of `name` in the student's own words: the first full equation `name = E` (either
 * side) whose other side names no complex number, mentions at least one parameter, and is
 * Gaussian-affine. Null when there is none — the reading then says what it always said.
 */
export function definitionOf(name: string, constraints: readonly Constraint[]): CartesianForm | null {
  for (const c of constraints) {
    if ((c.kind ?? 'eq') !== 'eq') continue;
    const other = c.lhs.t === 'ref' && c.lhs.name === name ? c.rhs : c.rhs.t === 'ref' && c.rhs.name === name ? c.lhs : null;
    if (!other || refsOf(other).length > 0) continue;
    const f = cartesianFormOf(other);
    if (f && hasParams(f)) return f;
  }
  return null;
}

/** Substitute every parameter whose exact rational value is KNOWN. */
export function substituteKnown(f: CartesianForm, known: ReadonlyMap<string, Rat>): CartesianForm {
  const sub1 = (p: AffinePart): AffinePart => {
    let c = p.c;
    const terms = new Map<string, Rat>();
    for (const [k, coef] of p.terms) {
      const v = known.get(k);
      if (v) c = add(c, mul(coef, v));
      else terms.set(k, coef);
    }
    return { c, terms };
  };
  return { re: sub1(f.re), im: sub1(f.im) };
}

/** The rational parts when no parameter is left — the number itself — or null. */
export const closedParts = (f: CartesianForm): { re: Rat; im: Rat } | null =>
  hasParams(f) ? null : { re: f.re.c, im: f.im.c };

const absRat = (q: Rat): Rat => (cmp(q, ZERO) < 0 ? neg(q) : q);

/** `2a`, `a`, `a/2`, `3a/2` — a term's MAGNITUDE spelling (the sign is the caller's). */
function termText(name: string, coef: Rat): string {
  const k = absRat(coef);
  const n = k.n === 1n ? '' : `${k.n}`;
  return k.d === 1n ? `${n}${name}` : `${n}${name}/${k.d}`;
}

/**
 * One part as a {@link CartPart}, so the ONE composer (`composeCartesian`) spells the pair: the
 * constant first, then the parameters in first-seen order. A leading minus is carried as the part's
 * sign, so `a-bi` reads «a-bi» and not «a+(-b)i».
 */
function partOf(p: AffinePart, value: number): CartPart {
  if (isConstPart(p)) return ratPart(p.c);
  const pieces: { negative: boolean; text: string }[] = [];
  if (!isZero(p.c)) pieces.push({ negative: cmp(p.c, ZERO) < 0, text: ratPart(absRat(p.c)).text });
  for (const [name, coef] of p.terms) pieces.push({ negative: cmp(coef, ZERO) < 0, text: termText(name, coef) });
  const negative = pieces[0].negative;
  const text = pieces
    .map((x, i) => (i === 0 ? x.text : `${x.negative !== negative ? '-' : '+'}${x.text}`))
    .join('');
  return { zero: false, negative, text, value };
}

/** The pair of parts for `composeCartesian`; `at` is the drawn value, for the parts' numeric field. */
export function symbolicParts(f: CartesianForm, at: { re: number; im: number }): { re: CartPart; im: CartPart } {
  return { re: partOf(f.re, at.re), im: partOf(f.im, at.im) };
}
