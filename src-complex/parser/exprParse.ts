/**
 * The expression sub-grammar — normalized text → the v2 `Expr` AST.
 *
 * docs/27 §5.2 names this as one of the four genuinely new pieces: the 2-D parser reads relation
 * *sentences*, while here the givens are *expressions* — `w = (z₁/√2)^{4n}`, `z₃·(z₁z₂)²`,
 * `−2z₁ = conj(z₃)`. It is deliberately small and closed: literals, the six operations, conjugation,
 * `|·|`, and rational powers. No general algebra, and no CAS.
 *
 * **Names are typed by the exam's own convention** ([ADR-CX-004](../../docs/06d-decisions-complex.md#adr-cx-004)):
 * a `z`/`w`-family name is a COMPLEX unknown without being declared, everything else is a real
 * parameter. That is the operator's ruling — *"z and w are complex numbers, so if I just write z or z2
 * or z10 or w1 it should be a complex number without having to specify it"* — and it is what keeps
 * `|z₁| = 9r` from auto-creating a complex `r`.
 *
 * Every parse reports the SPAN it consumed, because the accountant needs a claim, not a promise.
 */

import { type Expr, I, abs, conj, div, mul, neg, num, param, pow, ref, val } from '../model/expr';
import { fromNumber, rat, type Rat } from '../value/rational';
import { evaluate, exact, fromCartesian } from '../value/value';
import { fromDegrees } from '../value/angle';
import { one as modOne } from '../value/modulus';

/** A z/w-family name is complex by the exam's convention; anything else is a real parameter. */
export const isComplexName = (name: string): boolean => /^[zw]\d*$/i.test(name);

const nameExpr = (raw: string): Expr => {
  const name = raw.toLowerCase();
  return isComplexName(name) ? ref(name) : param(name);
};

type Tok =
  | { t: 'num'; v: Rat; at: number; len: number }
  | { t: 'name'; v: string; at: number; len: number }
  | { t: 'i'; at: number; len: number }
  | { t: 'cis'; at: number; len: number }
  | { t: 'conj'; at: number; len: number }
  | { t: 'op'; v: string; at: number; len: number };

// `cis` and `conj` end on a non-LETTER, not on a word boundary. `\b` does not fire between `cis` and
// `150`, so `2cis150` lexed the tail as the NAME `cis150` — a polar literal silently became a product
// with an invented parameter, and printed as `2cis150`.
const TOKEN = /\s+|conj(?![A-Za-z])|cis(?![A-Za-z])|[A-Za-z][A-Za-z]*\d*|\d+(?:\.\d+)?|[()|^*/+\-]/giu;

function lex(src: string, from: number, to: number): Tok[] | null {
  const out: Tok[] = [];
  TOKEN.lastIndex = from;
  let pos = from;
  for (let m = TOKEN.exec(src); m && m.index < to; m = TOKEN.exec(src)) {
    if (m.index !== pos) return null; // a gap means a character the grammar does not know
    const text = m[0];
    pos = m.index + text.length;
    if (/^\s+$/.test(text)) continue;
    const at = m.index;
    const len = text.length;
    const low = text.toLowerCase();
    if (low === 'conj') out.push({ t: 'conj', at, len });
    else if (low === 'cis') out.push({ t: 'cis', at, len });
    else if (low === 'i') out.push({ t: 'i', at, len });
    else if (/^\d/.test(text)) {
      const [w, f = ''] = text.split('.');
      out.push({ t: 'num', v: rat(BigInt(w + f), 10n ** BigInt(f.length)), at, len });
    } else if (/^[A-Za-z]/.test(text)) out.push({ t: 'name', v: text, at, len });
    else out.push({ t: 'op', v: text, at, len });
  }
  return pos >= to ? out : null;
}

/** Parse the whole range as one expression, or null. */
export function parseExpr(
  src: string,
  from = 0,
  to = src.length,
  /** angle atoms a cartesian literal introduced, collected for the caller's sample */
  atoms: Map<string, number> = new Map(),
): Expr | null {
  const toks = lex(src, from, to);
  if (!toks || toks.length === 0) return null;
  let i = 0;
  let absDepth = 0;

  const peek = (): Tok | undefined => toks[i];
  const isOp = (v: string): boolean => {
    const t = peek();
    return !!t && t.t === 'op' && t.v === v;
  };

  const parseSum = (): Expr | null => {
    let left = parseProduct();
    if (!left) return null;
    for (;;) {
      if (isOp('+')) {
        i++;
        const r = parseProduct();
        if (!r) return null;
        left = { t: 'add', l: left, r };
      } else if (isOp('-')) {
        i++;
        const r = parseProduct();
        if (!r) return null;
        left = { t: 'sub', l: left, r };
      } else return left;
    }
  };

  const parseProduct = (): Expr | null => {
    let left = parsePower();
    if (!left) return null;
    for (;;) {
      if (isOp('*')) {
        i++;
        const r = parsePower();
        if (!r) return null;
        left = mul(left, r);
      } else if (isOp('/')) {
        i++;
        const r = parsePower();
        if (!r) return null;
        left = div(left, r);
      } else {
        // implicit product: `2z1`, `9r`, `2i`, `3cis45` — juxtaposition, the register the exam writes
        const t = peek();
        // `|` is ambiguous — it opens an absolute value and also closes one. Inside an `abs` the next
        // `|` must CLOSE it, so it may only start an implicit product at depth zero. Treating it as a
        // product unconditionally makes `|z1|` itself unparseable, which is how `2|z2|` and `|z1| = 9r`
        // broke together.
        if (
          t &&
          (t.t === 'name' ||
            t.t === 'num' ||
            t.t === 'i' ||
            t.t === 'conj' ||
            (t.t === 'op' && (t.v === '(' || (t.v === '|' && absDepth === 0))))
        ) {
          const r = parsePower();
          if (!r) return null;
          left = mul(left, r);
        } else return left;
      }
    }
  };

  const parsePower = (): Expr | null => {
    const base = parseUnary();
    if (!base) return null;
    if (!isOp('^')) return base;
    i++;
    let sign = 1n;
    if (isOp('-')) {
      sign = -1n;
      i++;
    }
    const t = peek();
    if (!t || t.t !== 'num') return null;
    i++;
    // `^1/2` is a rational exponent — the n-th root, written the way the exam writes it
    if (isOp('/')) {
      i++;
      const d = peek();
      if (!d || d.t !== 'num') return null;
      i++;
      return pow(base, rat(sign * t.v.n, t.v.d * d.v.n));
    }
    return pow(base, rat(sign * t.v.n, t.v.d));
  };

  const parseUnary = (): Expr | null => {
    if (isOp('-')) {
      i++;
      const e = parseUnary();
      return e ? neg(e) : null;
    }
    return parseAtom();
  };

  const parseAtom = (): Expr | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === 'num') {
      i++;
      // `3cis45` — a modulus and an angle, the exam's polar literal
      if (peek()?.t === 'cis') {
        i++;
        const a = parseAtom();
        if (!a) return null;
        const unit = cisOf(a);
        return unit ? mul(num(t.v), unit) : null;
      }
      return num(t.v);
    }
    if (t.t === 'i') {
      i++;
      return I;
    }
    if (t.t === 'cis') {
      i++;
      const a = parseAtom();
      return a ? cisOf(a) : null;
    }
    if (t.t === 'name') {
      i++;
      return nameExpr(t.v);
    }
    if (t.t === 'conj') {
      i++;
      if (!isOp('(')) return null;
      i++;
      const e = parseSum();
      if (!e || !isOp(')')) return null;
      i++;
      return conj(e);
    }
    if (t.t === 'op' && t.v === '(') {
      i++;
      const e = parseSum();
      if (!e || !isOp(')')) return null;
      i++;
      return e;
    }
    if (t.t === 'op' && t.v === '|') {
      i++;
      absDepth++;
      const e = parseSum();
      if (!e || !isOp('|')) return null;
      i++;
      absDepth--;
      return abs(e);
    }
    return null;
  };

  const result = parseSum();
  if (!result || i !== toks.length) return null;
  return foldConstants(result, atoms);
}

/** The numeric value of a subtree that mentions no name, or null. */
function constValue(e: Expr): { re: number; im: number } | null {
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
      const l = constValue(e.l);
      const r = constValue(e.r);
      if (!l || !r) return null;
      if (e.t === 'add') return { re: l.re + r.re, im: l.im + r.im };
      if (e.t === 'sub') return { re: l.re - r.re, im: l.im - r.im };
      if (e.t === 'mul') return { re: l.re * r.re - l.im * r.im, im: l.re * r.im + l.im * r.re };
      const d = r.re * r.re + r.im * r.im;
      if (d === 0) return null;
      return { re: (l.re * r.re + l.im * r.im) / d, im: (l.im * r.re - l.re * r.im) / d };
    }
    case 'neg': {
      const x = constValue(e.e);
      return x ? { re: -x.re, im: -x.im } : null;
    }
    case 'conj': {
      const x = constValue(e.e);
      return x ? { re: x.re, im: -x.im } : null;
    }
    case 'abs': {
      const x = constValue(e.e);
      return x ? { re: Math.hypot(x.re, x.im), im: 0 } : null;
    }
    default:
      return null; // a ref, a param, or a power over one
  }
}

/**
 * Replace every name-free subtree with its exact VALUE.
 *
 * `3+4i` is written as an addition, and addition is the one operation the exact core cannot carry —
 * so without this the most basic input there is would route to the numeric tier. But a constant
 * expression is a LITERAL whatever its syntax: `3+4i` is one number with modulus exactly 5. Folding
 * before classifying is what keeps the SYNTAX of a literal from deciding whether the engine can be
 * exact about it. (The S3 bridge did this; the parser has to do it too, and the conjugates claim is
 * what caught that it did not.)
 */
function foldConstants(e: Expr, atoms: Map<string, number>): Expr {
  const k = constValue(e);
  if (k) {
    const re = fromNumber(k.re, 10_000, 1e-9);
    const im = fromNumber(k.im, 10_000, 1e-9);
    if (re && im && !(re.n === 0n && im.n === 0n)) {
      const lit = fromCartesian(re, im);
      if (lit.atomBinding) atoms.set(lit.atomBinding.atom, lit.atomBinding.degrees);
      return val(lit.value);
    }
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
 * `cis θ` is `cos θ + i sin θ` — a unit number at a stated angle.
 *
 * Represented as a literal-valued rotation rather than as a trigonometric expression, because the
 * angle is a rational number of degrees and the value layer carries that exactly. Only a NUMERIC angle
 * is accepted here; a symbolic one (`cis α`) is a free direction and belongs to the relation rules,
 * not to a literal.
 */
function cisOf(angle: Expr): Expr | null {
  if (angle.t !== 'num') return null;
  return { t: 'val', v: unitAt(angle.v) };
}

const unitAt = (deg: Rat) => exact(modOne(), fromDegrees(deg));
