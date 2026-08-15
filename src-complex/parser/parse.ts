// Bilingual line parser for the C0 prototype. Deterministic, tiny expression grammar
// (docs/27 §5.2 subset): literals a+bi and r·cis θ, + - * / ^int, conj, parens.
// Unmatched input returns { ok: false, key: 'not-handled' } — the sibling seam.
import { cisDeg, cx } from '../engine/complex';
import { factId, IMPLICIT_COMPLEX_RE, type Expr, type Fact } from '../engine/model';

export type ParseResult =
  | { ok: true; fact: Fact }
  | { ok: false; key: 'not-handled' | 'parse-error'; detail?: string };

// Display transforms must never reach the parser (ADR-448 / ADR-3D-144): strip invisible
// bidi controls first, then normalize the math typography students paste from exams.
const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

// Exam PDFs paste names with Unicode subscripts: Z₁ ≡ z1 (ADR-CX-003 P2).
const SUBSCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};

const normalize = (raw: string): string =>
  raw
    .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\u00a0/g, ' ')
    // z-bar: a combining overline/macron after a name is the conjugate (2024 locus notation)
    .replace(/([a-zA-Z])[\u0304\u0305](\w*)/g, 'conj($1$2)')
    .replace(/[·×]/g, '*')
    .replace(/−/g, '-')
    .replace(/÷/g, '/')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => `^${s.split('').map((c) => SUPERSCRIPTS[c]).join('')}`)
    // a subscript run ENDS a name: Z₁Z₄ is two names (→ z1*z4), never the identifier z1z4
    .replace(/([₀₁₂₃₄₅₆₇₈₉]+)(?=[A-Za-z(])/g, (s) => `${s.split('').map((c) => SUBSCRIPTS[c]).join('')}*`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUBSCRIPTS[c])
    .replace(/°/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// --- expression tokenizer/parser (recursive descent) ---

type Tok =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'i' }
  | { t: 'cis' }
  | { t: 'conj' }
  | { t: 'inv' }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | '|' };

const tokenize = (s: string): Tok[] | null => {
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  const re = /\s*(?:(\d+(?:\.\d+)?)|([a-zA-Z]\w*)|([-+*/^()|]))/y;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m) return null;
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) {
      const w = m[2].toLowerCase();
      const cisGlued = /^cis(\d+(?:\.\d+)?)$/.exec(w); // "2cis150" tokenizes NUM then "cis150"
      if (w === 'i') toks.push({ t: 'i' });
      else if (w === 'cis') toks.push({ t: 'cis' });
      else if (cisGlued) {
        toks.push({ t: 'cis' });
        toks.push({ t: 'num', v: Number(cisGlued[1]) });
      } else if (w === 'conj') toks.push({ t: 'conj' });
      else if (w === 'inv') toks.push({ t: 'inv' });
      else toks.push({ t: 'ident', v: w });
    } else toks.push({ t: 'op', v: m[3] as '+' });
  }
  return toks;
};

class P {
  pos = 0;
  constructor(public toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === 'op' && t.v === v;
  }
  expr(): Expr {
    let l = this.term();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) {
        const op = (this.toks[this.pos++] as { t: 'op'; v: '+' | '-' }).v;
        l = { t: 'bin', op, l, r: this.term() };
      } else return l;
    }
  }
  term(): Expr {
    let l = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.toks[this.pos++] as { t: 'op'; v: '*' | '/' }).v;
        l = { t: 'bin', op, l, r: this.unary() };
      } else {
        // implicit multiplication: 2i·z1, (1+i)z2, 3(...)
        const nx = this.peek();
        if (nx && (nx.t === 'i' || nx.t === 'ident' || nx.t === 'conj' || (nx.t === 'op' && nx.v === '('))) {
          l = { t: 'bin', op: '*', l, r: this.unary() };
        } else return l;
      }
    }
  }
  unary(): Expr {
    if (this.isOp('-')) {
      this.pos++;
      return { t: 'neg', e: this.unary() };
    }
    if (this.isOp('+')) {
      this.pos++;
      return this.unary();
    }
    return this.postfix();
  }
  postfix(): Expr {
    let e = this.primary();
    while (this.isOp('^')) {
      this.pos++;
      let sign = 1;
      if (this.isOp('-')) {
        this.pos++;
        sign = -1;
      }
      const t = this.peek();
      if (t?.t !== 'num' || !Number.isInteger(t.v)) throw new Error('int exponent expected');
      this.pos++;
      e = { t: 'pow', base: e, exp: sign * t.v };
    }
    return e;
  }
  /** cis θ — plain number, optionally negative / parenthesized: 2cis150, 2 cis (-30) */
  cisAngle(): number {
    const paren = this.isOp('(');
    if (paren) this.pos++;
    let sign = 1;
    if (this.isOp('-')) {
      this.pos++;
      sign = -1;
    }
    const t = this.peek();
    if (t?.t !== 'num') throw new Error('cis angle expected');
    this.pos++;
    if (paren) {
      if (!this.isOp(')')) throw new Error('missing )');
      this.pos++;
    }
    return sign * t.v;
  }
  primary(): Expr {
    const t = this.peek();
    if (!t) throw new Error('unexpected end');
    if (t.t === 'num') {
      this.pos++;
      const nx = this.peek();
      if (nx?.t === 'cis') {
        this.pos++;
        return { t: 'lit', v: cisDeg(t.v, this.cisAngle()) };
      }
      if (nx?.t === 'i') {
        this.pos++;
        return { t: 'lit', v: cx(0, t.v) };
      }
      return { t: 'lit', v: cx(t.v) };
    }
    if (t.t === 'i') {
      this.pos++;
      return { t: 'lit', v: cx(0, 1) };
    }
    if (t.t === 'conj' || t.t === 'inv') {
      this.pos++;
      let inner: Expr;
      if (this.isOp('(')) {
        this.pos++;
        inner = this.expr();
        if (!this.isOp(')')) throw new Error('missing )');
        this.pos++;
      } else {
        inner = this.primary();
      }
      return t.t === 'conj'
        ? { t: 'conj', e: inner }
        : { t: 'bin', op: '/', l: { t: 'lit', v: cx(1) }, r: inner };
    }
    if (t.t === 'op' && t.v === '|') {
      // non-nested absolute-value bars: |expr|
      this.pos++;
      const e = this.expr();
      if (!this.isOp('|')) throw new Error('missing |');
      this.pos++;
      return { t: 'abs', e };
    }
    if (t.t === 'ident') {
      this.pos++;
      return { t: 'ref', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      this.pos++;
      const e = this.expr();
      if (!this.isOp(')')) throw new Error('missing )');
      this.pos++;
      return e;
    }
    throw new Error('unexpected token');
  }
}

const parseExpr = (s: string): Expr | null => {
  const toks = tokenize(s);
  if (!toks || toks.length === 0) return null;
  try {
    const p = new P(toks);
    const e = p.expr();
    return p.pos === toks.length ? e : null;
  } catch {
    return null;
  }
};

// --- line forms ---

const FREE_RE =
  /^([a-zA-Z]\w*)\s+(?:הוא\s+)?מספר\s+מרוכב$|^([a-zA-Z]\w*)\s+(?:is\s+)?(?:a\s+)?complex(?:\s+number)?$/;
const ROOTS_RE = /^(?:הפתרונות\s+של\s+|solutions\s+of\s+)?([a-zA-Z]\w*)\s*\^\s*(\d+)\s*=\s*(.+)$/;
const DEF_RE = /^([a-zA-Z]\w*)\s*=\s*(.+)$/;

export const parseLine = (raw: string): ParseResult => {
  const line = normalize(raw)
    .replace(/הצמוד\s+של\s+/g, 'conj ')
    .replace(/ההופכי\s+של\s+/g, 'inv ');
  if (line === '') return { ok: false, key: 'not-handled' };

  const free = FREE_RE.exec(line);
  if (free) {
    const name = (free[1] ?? free[2]).toLowerCase();
    const f = { kind: 'free' as const, name, src: raw.trim() };
    return { ok: true, fact: { ...f, id: factId(f) } };
  }

  const roots = ROOTS_RE.exec(line);
  if (roots) {
    const n = Number(roots[2]);
    if (n < 2 || n > 12) return { ok: false, key: 'parse-error', detail: raw.trim() };
    const rhs = parseExpr(roots[3]);
    if (!rhs) return { ok: false, key: 'parse-error', detail: raw.trim() };
    const f = { kind: 'roots' as const, varName: roots[1].toLowerCase(), n, rhs, src: raw.trim() };
    return { ok: true, fact: { ...f, id: factId(f) } };
  }

  const def = DEF_RE.exec(line);
  if (def) {
    const expr = parseExpr(def[2]);
    if (!expr) return { ok: false, key: 'parse-error', detail: raw.trim() };
    const f = { kind: 'def' as const, name: def[1].toLowerCase(), expr, src: raw.trim() };
    return { ok: true, fact: { ...f, id: factId(f) } };
  }

  // a bare z/w-family name IS its free declaration (ADR-CX-004: "if I just write z or z2…")
  const bareName = /^([a-zA-Z]\w*)$/.exec(line);
  if (bareName) {
    const name = bareName[1].toLowerCase();
    if (!IMPLICIT_COMPLEX_RE.test(name)) return { ok: false, key: 'not-handled' };
    const f = { kind: 'free' as const, name, src: raw.trim() };
    return { ok: true, fact: { ...f, id: factId(f) } };
  }

  // a bare expression line ("|z1|", "z1^5") plots as an anonymous point labeled by itself —
  // the D3 always-visualize rule; deterministic id from the NORMALIZED text (idempotent).
  const bare = parseExpr(line);
  if (bare) {
    const f = { kind: 'show' as const, expr: bare, src: raw.trim(), norm: line };
    return { ok: true, fact: { ...f, id: factId(f) } };
  }

  return { ok: false, key: 'not-handled' };
};
