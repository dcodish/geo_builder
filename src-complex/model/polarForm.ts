/**
 * #2002 ([ADR-CX-103](../../docs/06d-decisions-complex.md#adr-cx-103)) — the SYMBOLIC POLAR reading of a number
 * the student typed in polar form with a letter in its modulus: «z = r·cis(30°)», «z = (r+1)·cis30°»,
 * «z = r(cos30° + i sin30°)», or the W7 pair «|z| = 9r» · «arg(z) = 30°».
 *
 * `definitionOf` (`./cartesianForm`, ADR-CX-058) reads a definition only when it is Gaussian-affine over ℚ, and
 * `r·cis30°` = r·(√3/2 + i/2) is not, so such a number had no reading of its own and the canvas printed the panel's
 * string: the tool-solved letter's value, or the drawn sample as a decimal. This is the polar half of the same
 * reader: the modulus as a ℚ-affine form in real parameters and the argument as an exact angle, read off the
 * constraint SHAPES (never the line text, ADR-CX-065 §2).
 *
 * The modulus keeps the order the student wrote its terms in («r+1», never «1+r»): it is printed as typed.
 */

import type { Constraint } from './constraint';
import type { Expr } from './expr';
import { refsOf } from './expr';
import { type Rat, rat, add, mul, div, neg, isZero, cmp, ZERO } from '../value/rational';
import { type Angle, add as angleAdd, format as fmtAngle, fromTurns, isExactRational, isReal, zero as angleZero } from '../value/angle';
import { gaussianRationalParts, ratPart } from '../value/cartesian';

/** The constant term's key in {@link PolarModulus.terms}: no parameter is named by the empty string. */
export const CONSTANT = '';

/** A real ℚ-affine form `Σ kₚ·p (+ c)`, its terms (the constant under {@link CONSTANT}) in the order typed. */
export interface PolarModulus {
  readonly terms: ReadonlyMap<string, Rat>;
}

/** A typed polar definition: `name = M·cis θ`, M real and ℚ-affine in parameters, θ an exact angle. */
export interface PolarDefinition {
  readonly mod: PolarModulus;
  readonly arg: Angle;
}

/** One factor read so far: its real affine part and the direction a polar literal gave it (null: none). */
interface Read {
  readonly m: Map<string, Rat>;
  readonly dir: Angle | null;
}

const constant = (c: Rat): Map<string, Rat> => (isZero(c) ? new Map() : new Map([[CONSTANT, c]]));
const isConstant = (m: ReadonlyMap<string, Rat>): boolean => [...m.keys()].every((k) => k === CONSTANT);
const constantOf = (m: ReadonlyMap<string, Rat>): Rat => m.get(CONSTANT) ?? ZERO;
const hasLetter = (m: ReadonlyMap<string, Rat>): boolean => [...m.keys()].some((k) => k !== CONSTANT);

function combine(a: ReadonlyMap<string, Rat>, b: ReadonlyMap<string, Rat>, sign: 1 | -1): Map<string, Rat> {
  const out = new Map<string, Rat>();
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const v = add(a.get(k) ?? ZERO, sign === 1 ? (b.get(k) ?? ZERO) : neg(b.get(k) ?? ZERO));
    if (!isZero(v)) out.set(k, v);
  }
  return out;
}
const scaled = (m: ReadonlyMap<string, Rat>, k: Rat): Map<string, Rat> =>
  isZero(k) ? new Map() : new Map([...m].map(([n, c]) => [n, mul(c, k)]));

/** A literal: a real rational (its sign included), or a rational modulus times a direction. Null otherwise. */
function literal(e: Extract<Expr, { t: 'val' }>): Read | null {
  if (e.v.kind === 'zero') return { m: new Map(), dir: null };
  if (e.v.kind !== 'exact' || !isExactRational(e.v.arg)) return null;
  if (!e.polar && isReal(e.v.arg)) {
    const g = gaussianRationalParts(e.v.mod, e.v.arg);
    return g ? { m: constant(g.re), dir: null } : null;
  }
  const q = gaussianRationalParts(e.v.mod, angleZero());
  return q && isZero(q.im) ? { m: constant(q.re), dir: e.v.arg } : null;
}

/** `e` as (real ℚ-affine part) × (one direction), or null when it leaves that shape. */
function readPolar(e: Expr): Read | null {
  switch (e.t) {
    case 'num':
      return { m: constant(e.v), dir: null };
    case 'val':
      return literal(e);
    case 'param':
      return { m: new Map([[e.name, rat(1)]]), dir: null };
    case 'add':
    case 'sub': {
      const l = readPolar(e.l);
      const r = readPolar(e.r);
      // a sum of two directions is no polar form
      if (!l || !r || l.dir || r.dir) return null;
      return { m: combine(l.m, r.m, e.t === 'add' ? 1 : -1), dir: null };
    }
    case 'neg': {
      const x = readPolar(e.e);
      return x ? { m: scaled(x.m, rat(-1)), dir: x.dir } : null;
    }
    case 'mul': {
      const l = readPolar(e.l);
      const r = readPolar(e.r);
      if (!l || !r) return null;
      // affine × affine stays affine only when one side is a constant
      const m = isConstant(l.m) ? scaled(r.m, constantOf(l.m)) : isConstant(r.m) ? scaled(l.m, constantOf(r.m)) : null;
      if (!m) return null;
      const dir = l.dir && r.dir ? angleAdd(l.dir, r.dir) : (l.dir ?? r.dir);
      return { m, dir };
    }
    case 'div': {
      const l = readPolar(e.l);
      const r = readPolar(e.r);
      // only by a nonzero real rational
      if (!l || !r || r.dir || !isConstant(r.m) || isZero(constantOf(r.m))) return null;
      return { m: scaled(l.m, div(rat(1), constantOf(r.m))), dir: l.dir };
    }
    default:
      return null;
  }
}

const unAbs = (e: Expr): Expr => (e.t === 'abs' ? e.e : e);

/**
 * The POLAR definition of `name` in the student's own words, holding at least one parameter in its modulus:
 *
 * - a typed `name = M·cis θ` (either side; the trig form lowers to the same literal, FR-CN-11), the other side
 *   naming no complex number;
 * - the W7 pair: `|name| = M` and `arg name = θ`, both naming no other number.
 *
 * Null otherwise — a closed modulus, or a letter in the argument. A form that is also Gaussian-affine (`r·cis90°` is
 * `ri`) is read here too; the canvas asks `definitionOf` first, so it keeps reading «z = ri».
 */
export function polarDefinitionOf(name: string, constraints: readonly Constraint[]): PolarDefinition | null {
  const isName = (e: Expr): boolean => e.t === 'ref' && e.name === name;
  let mod: PolarModulus | null = null;
  let arg: Angle | null = null;
  for (const c of constraints) {
    const kind = c.kind ?? 'eq';
    if (kind === 'eq') {
      const other = isName(c.lhs) ? c.rhs : isName(c.rhs) ? c.lhs : null;
      if (!other || refsOf(other).length > 0) continue;
      const r = readPolar(other);
      if (r && r.dir && hasLetter(r.m)) return { mod: { terms: r.m }, arg: r.dir };
      continue;
    }
    if (kind === 'mod' && mod === null) {
      const other = isName(unAbs(c.lhs)) ? c.rhs : isName(unAbs(c.rhs)) ? c.lhs : null;
      if (!other || refsOf(other).length > 0) continue;
      const r = readPolar(unAbs(other));
      if (r && !r.dir && hasLetter(r.m)) mod = { terms: r.m };
      continue;
    }
    if (kind === 'arg' && arg === null && isName(c.lhs) && c.deltaTurns && c.rhs.t === 'num' && cmp(c.rhs.v, ZERO) > 0) {
      arg = fromTurns(c.deltaTurns);
    }
  }
  return mod && arg ? { mod, arg } : null;
}

/** Substitute every letter whose value is SHOWN (ADR-CX-065 §3–4): the constant keeps its place in the order. */
export function substitutePolar(d: PolarDefinition, shown: ReadonlyMap<string, Rat>): PolarDefinition {
  // the constant stands where it was typed, or where the first letter it absorbs stood: «(a+b)» with a = 1 is «(1+b)»
  const order: string[] = [];
  let c = ZERO;
  for (const [k, coef] of d.mod.terms) {
    const v = k === CONSTANT ? coef : shown.has(k) ? mul(coef, shown.get(k)!) : null;
    if (v === null) order.push(k);
    else {
      c = add(c, v);
      if (!order.includes(CONSTANT)) order.push(CONSTANT);
    }
  }
  const out = new Map<string, Rat>();
  for (const k of order) {
    if (k !== CONSTANT) out.set(k, d.mod.terms.get(k)!);
    else if (!isZero(c)) out.set(CONSTANT, c);
  }
  return { mod: { terms: out }, arg: d.arg };
}

/** Does the modulus still hold a letter? */
export const polarHoldsLetter = (d: PolarDefinition): boolean => hasLetter(d.mod.terms);

const absRat = (q: Rat): Rat => (cmp(q, ZERO) < 0 ? neg(q) : q);

/** `9r`, `r`, `r/2`, `3r/2`, `1` — a term's magnitude spelling; the sign is the caller's. */
function termText(name: string, coef: Rat): string {
  const k = absRat(coef);
  if (name === CONSTANT) return ratPart(k).text;
  const n = k.n === 1n ? '' : `${k.n}`;
  return k.d === 1n ? `${n}${name}` : `${n}${name}/${k.d}`;
}

/** `r`, `9r`, `(r+1)`, `(2r+1)`, `-r` — the modulus as typed, bracketed when it has more than one term. */
export function polarModulusText(m: PolarModulus): string {
  const terms = [...m.terms];
  const text = terms
    .map(([k, c], i) => `${cmp(c, ZERO) < 0 ? '-' : i === 0 ? '' : '+'}${termText(k, c)}`)
    .join('');
  return terms.length > 1 ? `(${text})` : text;
}

/** `9r·cis30°` — the typed polar form, its angle spelled as the closed polar reading spells it (`formatPolar`). */
export const polarFormText = (d: PolarDefinition): string => `${polarModulusText(d.mod)}·cis${fmtAngle(d.arg)}`;
