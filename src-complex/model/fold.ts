/**
 * THE VALUE CORE OF A CLOSED EXPRESSION — which number a name-free subtree IS, exactly.
 *
 * It lived in the parser (`parser/exprParse.ts`), where it makes a typed `3+4i` one exact literal.
 * #1818 ([ADR-CX-082](../../docs/06d-decisions-complex.md#adr-cx-082)) moved it here, below both the
 * parser and replay, because the fold needs the SAME core: a definition in real parameters
 * (`z1 = (2a^2+5a+4) + (2a^2+3a+2)i`) becomes closed only once the earlier lines have made its
 * parameters known, and that is a question only the fold can answer. One core, two callers — never a
 * second copy that drifts (replay may not import the parser: `import-direction.test.ts`).
 */

import { type Expr, val } from './expr';
import { rat, type Rat } from '../value/rational';
import { evaluate, exact, fromCartesian } from '../value/value';
import { radicalLiteral, radicalOfModulus, radicalPartsOf } from '../value/cartesian';
import { fromRational as modFromRational, pow as modPow } from '../value/modulus';

/**
 * #1435 — a constant subtree as a GAUSSIAN-RADICAL pair: `a·√k + b·√m·i`, one square-free radical
 * term per axis, carried exactly. Null whenever a node leaves that shape (two incompatible radicals
 * on one axis, a residual higher root, a name). A root of a literal already arrives as an exact `val`
 * from the parser, so the `pow` case reads only an INTEGER power (#1818: `a^2` once `a = -1` is
 * known) — repeated multiplication, exact. The parser never reaches it: its fold asks `constValue`
 * first, which is null for any power (`foldConstantsOnce`), so typed powers stay as written.
 */
type RadPart = { c: Rat; k: bigint };
type RadPair = { re: RadPart; im: RadPart };
const RZERO: RadPart = { c: rat(0), k: 1n };

function radicalValue(e: Expr): RadPair | null {
  const one = (c: Rat, k: bigint): RadPart => ({ c, k });
  const addParts = (a: RadPart, b: RadPart, sign: 1n | -1n): RadPart | null => {
    const bc = sign === 1n ? b.c : rat(-b.c.n, b.c.d);
    if (a.c.n === 0n) return { c: bc, k: b.k };
    if (b.c.n === 0n) return a;
    if (a.k !== b.k) return null;
    const c = rat(a.c.n * bc.d + bc.n * a.c.d, a.c.d * bc.d);
    return { c, k: a.k };
  };
  const mulParts = (a: RadPart, b: RadPart): RadPart => {
    if (a.c.n === 0n || b.c.n === 0n) return RZERO;
    const g = ((x: bigint, y: bigint): bigint => {
      let p = x < 0n ? -x : x;
      let q = y < 0n ? -y : y;
      while (q) [p, q] = [q, p % q];
      return p;
    })(a.k, b.k);
    return { c: rat(a.c.n * b.c.n * g, a.c.d * b.c.d), k: (a.k / g) * (b.k / g) };
  };
  const mulPairs = (l: RadPair, r: RadPair): RadPair | null => {
    const re = addParts(mulParts(l.re, r.re), mulParts(l.im, r.im), -1n);
    const im = addParts(mulParts(l.re, r.im), mulParts(l.im, r.re), 1n);
    return re && im ? { re, im } : null;
  };
  switch (e.t) {
    case 'num':
      return { re: one(e.v, 1n), im: RZERO };
    case 'i':
      return { re: RZERO, im: one(rat(1), 1n) };
    case 'val': {
      if (e.v.kind === 'zero') return { re: RZERO, im: RZERO };
      // any exact table turn whose parts are one radical term each: `√2`, `2cis60`, `√2cis45`
      return e.v.kind === 'exact' ? radicalPartsOf(e.v.mod, e.v.arg) : null;
    }
    case 'abs': {
      // |a√k + b√m·i| = √(a²k + b²m) — rational under the root, so always one radical term
      const x = radicalValue(e.e);
      if (!x) return null;
      const s = ratAddLocal(ratMulLocal(ratMulLocal(x.re.c, x.re.c), rat(x.re.k)), ratMulLocal(ratMulLocal(x.im.c, x.im.c), rat(x.im.k)));
      if (s.n === 0n) return { re: RZERO, im: RZERO };
      const m = radicalOfModulus(modPow(modFromRational(s), rat(1n, 2n)));
      return m ? { re: m, im: RZERO } : null;
    }
    case 'neg': {
      const x = radicalValue(e.e);
      return x && { re: { c: rat(-x.re.c.n, x.re.c.d), k: x.re.k }, im: { c: rat(-x.im.c.n, x.im.c.d), k: x.im.k } };
    }
    case 'conj': {
      const x = radicalValue(e.e);
      return x && { re: x.re, im: { c: rat(-x.im.c.n, x.im.c.d), k: x.im.k } };
    }
    case 'add':
    case 'sub': {
      const l = radicalValue(e.l);
      const r = radicalValue(e.r);
      if (!l || !r) return null;
      const s = e.t === 'add' ? 1n : -1n;
      const re = addParts(l.re, r.re, s as 1n | -1n);
      const im = addParts(l.im, r.im, s as 1n | -1n);
      return re && im ? { re, im } : null;
    }
    case 'mul': {
      const l = radicalValue(e.l);
      const r = radicalValue(e.r);
      return l && r ? mulPairs(l, r) : null;
    }
    case 'div': {
      const l = radicalValue(e.l);
      const r = radicalValue(e.r);
      if (!l || !r) return null;
      const inv = reciprocal(r);
      return inv ? mulPairs(l, inv) : null;
    }
    case 'pow': {
      // #1818 — an integer power only, by repeated multiplication (bounded: a corpus power is small)
      if (e.exp.d !== 1n) return null;
      const n = e.exp.n < 0n ? -e.exp.n : e.exp.n;
      if (n > MAX_INT_POWER) return null;
      const b = radicalValue(e.base);
      if (!b) return null;
      let acc: RadPair | null = { re: one(rat(1), 1n), im: RZERO };
      for (let j = 0n; j < n && acc; j++) acc = mulPairs(acc, b);
      if (!acc) return null;
      return e.exp.n < 0n ? reciprocal(acc) : acc;
    }
    default:
      return null;
  }
}
const ratMulLocal = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
const MAX_INT_POWER = 64n;

/** 1/(a+bi) = conj / |·|², and |·|² = a²k + b²m is rational; null for zero */
function reciprocal(r: RadPair): RadPair | null {
  const s = rat(
    r.re.c.n * r.re.c.n * r.re.k * r.im.c.d * r.im.c.d + r.im.c.n * r.im.c.n * r.im.k * r.re.c.d * r.re.c.d,
    r.re.c.d * r.re.c.d * r.im.c.d * r.im.c.d,
  );
  if (s.n === 0n) return null;
  const invS = rat(s.d, s.n);
  return {
    re: { c: ratMulLocal(r.re.c, invS), k: r.re.k },
    im: { c: ratMulLocal(rat(-r.im.c.n, r.im.c.d), invS), k: r.im.k },
  };
}
const ratAddLocal = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);

/** The numeric value of a subtree that mentions no name, or null. */
function constValue(e: Expr, withPow = false): { re: number; im: number } | null {
  const cv = (x: Expr) => constValue(x, withPow);
  switch (e.t) {
    case 'num':
      return { re: Number(e.v.n) / Number(e.v.d), im: 0 };
    case 'i':
      return { re: 0, im: 1 };
    case 'val': {
      const n = evaluate(e.v);
      return n ? { re: n.re, im: n.im } : null;
    }
    case 'add':
    case 'sub':
    case 'mul':
    case 'div': {
      const l = cv(e.l);
      const r = cv(e.r);
      if (!l || !r) return null;
      if (e.t === 'add') return { re: l.re + r.re, im: l.im + r.im };
      if (e.t === 'sub') return { re: l.re - r.re, im: l.im - r.im };
      if (e.t === 'mul') return { re: l.re * r.re - l.im * r.im, im: l.re * r.im + l.im * r.re };
      const d = r.re * r.re + r.im * r.im;
      if (d === 0) return null;
      return { re: (l.re * r.re + l.im * r.im) / d, im: (l.im * r.re - l.re * r.im) / d };
    }
    case 'neg': {
      const x = cv(e.e);
      return x ? { re: -x.re, im: -x.im } : null;
    }
    case 'conj': {
      const x = cv(e.e);
      return x ? { re: x.re, im: -x.im } : null;
    }
    case 'abs': {
      const x = cv(e.e);
      return x ? { re: Math.hypot(x.re, x.im), im: 0 } : null;
    }
    case 'pow': {
      // only for the radicand check (`√(i^2)`): the fold itself leaves powers to the exact tier
      if (!withPow) return null;
      const b = cv(e.base);
      if (!b) return null;
      const r = Math.hypot(b.re, b.im);
      if (r === 0) return { re: 0, im: 0 };
      const x = Number(e.exp.n) / Number(e.exp.d);
      const th = Math.atan2(b.im, b.re) * x;
      return { re: r ** x * Math.cos(th), im: r ** x * Math.sin(th) };
    }
    default:
      return null; // a ref or a param
  }
}

/** The numeric value of a CLOSED subtree, powers included — what a radicand's sign is read from. */
export const closedValue = (e: Expr): { re: number; im: number } | null => constValue(e, true);

/**
 * Replace every name-free subtree the EXACT walk can read with its exact VALUE.
 *
 * `3+4i` is written as an addition, and addition is the one operation the exact core cannot carry —
 * so without this the most basic input there is would route to the numeric tier. But a constant
 * expression is a LITERAL whatever its syntax: `3+4i` is one number with modulus exactly 5. Folding
 * before classifying is what keeps the SYNTAX of a literal from deciding whether the engine can be
 * exact about it. (The S3 bridge did this; the parser has to do it too, and the conjugates claim is
 * what caught that it did not.)
 *
 * #2134 (ADR-CX-071) — a constant subtree is a literal when the exact walk can say WHICH number it is,
 * and never because a float landed near a fraction. A closed subtree the walk does not read
 * (`15cis(π/7)`, `5cis(π/7) + 1`) stays as written — the exact tier carries the product, the sum is
 * the numeric residue — and its children still fold. The float read-back that used to stand here
 * replaced `15cis(π/7)` with the Gaussian rational 104616/7741 + (44933/6904)i: a different number,
 * so two numbers stated at one argument carried two arguments, and «|z1| = 15» was refused.
 */
export function foldConstants(e: Expr, atoms: Map<string, number>): Expr {
  const folded = foldConstantsOnce(e, atoms);
  // a written `cis θ` keeps its polar mark through the re-read of its value (ADR-CX-070)
  return e.t === 'val' && e.polar && folded.t === 'val' && !folded.polar ? { ...folded, polar: true } : folded;
}

function foldConstantsOnce(e: Expr, atoms: Map<string, number>): Expr {
  const k = constValue(e);
  if (k) {
    /**
     * #1435 (ADR-CX-056 amendment 1) — the EXACT walk decides first. A closed subtree whose parts are
     * one radical term each (`3+4i`, `√3 + i`, `1 + √2i`, `(1+√2i)/3`, `2cis60 + 1`) is ALWAYS a
     * known number: a Gaussian rational goes through `fromCartesian` as it always did, and a radical
     * one through `radicalLiteral` — the table's exact turn when it verifies one, otherwise a literal
     * atom carrying the exact pair, exactly as `3+4i` is carried. Nothing typed as a closed radical
     * literal is left a compound with no value.
     */
    const rp = radicalValue(e);
    const lit = rp ? literalOf(rp, atoms) : null;
    if (lit) return lit;
    // no float read-back (#2134, ADR-CX-071): what the exact walk cannot read stays as written
  }
  switch (e.t) {
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return { ...e, l: foldConstants(e.l, atoms), r: foldConstants(e.r, atoms) };
    case 'pow':
      return { ...e, base: foldConstants(e.base, atoms) };
    case 'conj':
    case 'neg':
    case 'abs':
      return { ...e, e: foldConstants(e.e, atoms) };
    default:
      return e;
  }
}

/**
 * The exact LITERAL a radical pair is, registering any angle atom it needs; null for a closed zero
 * (a zero stays as written — the log-polar carrier has no zero) and for a pair the table cannot carry.
 */
function literalOf(rp: RadPair, atoms: Map<string, number>): Expr | null {
  const rational = (p: RadPart) => p.k === 1n || p.c.n === 0n;
  if (rational(rp.re) && rational(rp.im)) {
    if (rp.re.c.n === 0n && rp.im.c.n === 0n) return null;
    const lit = fromCartesian(rp.re.c, rp.im.c);
    for (const b of lit.atomBindings) atoms.set(b.atom, b.degrees);
    return val(lit.value);
  }
  const lit = radicalLiteral(rp.re, rp.im);
  if (!lit) return null;
  if (lit.atom) atoms.set(lit.atom.name, lit.atom.degrees);
  return val(exact(lit.mod, lit.arg));
}

/**
 * #1818 ([ADR-CX-082](../../docs/06d-decisions-complex.md#adr-cx-082)) — the number an expression in
 * real parameters IS once those parameters are known: every `param` in `known` replaced by its exact
 * rational value, the result read by the exact walk above (integer powers included). Null when a name
 * is left (a complex number, or a parameter not in `known`), when the value is zero, or when the exact
 * walk cannot say which number it is — the definition then stays the numeric residue it was.
 */
export function closedUnder(e: Expr, known: ReadonlyMap<string, Rat>, atoms: Map<string, number>): Expr | null {
  const sub = (x: Expr): Expr | null => {
    switch (x.t) {
      case 'param': {
        const v = known.get(x.name);
        return v ? { t: 'num', v } : null;
      }
      case 'ref':
        return null;
      case 'add':
      case 'sub':
      case 'mul':
      case 'div': {
        const l = sub(x.l);
        const r = sub(x.r);
        return l && r ? { ...x, l, r } : null;
      }
      case 'pow': {
        const base = sub(x.base);
        return base ? { ...x, base } : null;
      }
      case 'conj':
      case 'neg':
      case 'abs': {
        const inner = sub(x.e);
        return inner ? { ...x, e: inner } : null;
      }
      default:
        return x;
    }
  };
  const closed = sub(e);
  const rp = closed ? radicalValue(closed) : null;
  return rp ? literalOf(rp, atoms) : null;
}
