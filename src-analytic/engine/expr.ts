/**
 * The numeric expression layer — the smallest thing that lets a coefficient carry a PARAMETER.
 *
 * The corpus does not hand the tool numbers; it hands it coefficients with a symbol inside:
 * `x²/144 + y²/(144−4k²) = 1`, `(x−a)² + y² = r²`, `y² = 2ax`, `AB = 4√5`, `A(−9a, 0)`
 * (docs/19 §2a — a symbolic parameter appears in 10 of the 20 exams, always in a coefficient
 * slot). So every numeric slot in this engine is an `Expr`, evaluated against a parameter
 * assignment, and a slot with no symbols is simply the constant case of the same thing.
 *
 * This is NOT a CAS and must never become one ([ADR-AG-001](../../docs/06c-decisions-analytic.md)
 * D1): it parses and EVALUATES. There is no simplification, no solving, no symbolic manipulation.
 * Pinning a parameter is a numeric root-find over `evaluate`, exactly as `src3d` does it.
 *
 * Grammar (lowest precedence first):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary | JUXTAPOSITION unary)*
 *   unary   := ('-')* power
 *   power   := atom ('^' unary)?          -- right-associative, so 2^3^2 = 2^9
 *   atom    := number | symbol | '(' expr ')' | '√' unary
 *
 * JUXTAPOSITION is the reason this is hand-written rather than a one-line eval: `2a`, `4√5`,
 * `25k²` and `2ax` are all products in the exam's notation, and a student typing `2a` means the
 * same thing. Two atoms in a row multiply.
 */

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'sym'; name: string }
  | { kind: 'neg'; a: Expr }
  | { kind: 'add'; a: Expr; b: Expr }
  | { kind: 'sub'; a: Expr; b: Expr }
  | { kind: 'mul'; a: Expr; b: Expr }
  | { kind: 'div'; a: Expr; b: Expr }
  | { kind: 'pow'; a: Expr; b: Expr }
  | { kind: 'sqrt'; a: Expr };

/** A parameter assignment. A symbol absent from the environment makes evaluation fail (NaN). */
export type Env = Readonly<Record<string, number>>;

// ---------------------------------------------------------------------------
// Normalization — the single chokepoint (docs/19 §10c). Never per rule.
// ---------------------------------------------------------------------------

/**
 * Typeset ⇄ keyboard. The exam is typeset (`²`, `−`, `√`, `·`); a student types `^2`, `-`,
 * `sqrt`, `*`. Both reach one internal form HERE, so no downstream rule ever has to know that
 * two spellings exist.
 */
export function normalizeMath(src: string): string {
  return src
    .replace(/−/g, '-') // U+2212 MINUS SIGN → hyphen-minus
    .replace(/[·⋅×]/g, '*') // · ⋅ × → *
    .replace(/⁄/g, '/') // ⁄ FRACTION SLASH → /
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁰/g, '^0')
    .replace(/[⁴-⁹]/g, (c) => `^${c.charCodeAt(0) - 0x2070}`)
    .replace(/\bsqrt\s*/gi, '√')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: number }
  | { t: 'sym'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'sqrt' };

/** Symbols are SINGLE latin letters — the corpus's whole parameter alphabet (a b t k p m n r R). */
const SYMBOL_RE = /[A-Za-z]/;

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i += 1;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j += 1;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (SYMBOL_RE.test(c)) {
      out.push({ t: 'sym', v: c });
      i += 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      out.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    if (c === '(') {
      out.push({ t: 'lp' });
      i += 1;
      continue;
    }
    if (c === ')') {
      out.push({ t: 'rp' });
      i += 1;
      continue;
    }
    if (c === '√') {
      out.push({ t: 'sqrt' });
      i += 1;
      continue;
    }
    return null; // an unknown character is a REFUSAL, never a silently dropped term
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class P {
  constructor(
    private readonly toks: Tok[],
    private pos = 0,
  ) {}

  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }

  expr(): Expr | null {
    const head = this.term();
    if (!head) return null;
    let a: Expr = head;
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const b = this.term();
        if (!b) return null;
        a = { kind: t.v === '+' ? 'add' : 'sub', a, b };
      } else return a;
    }
  }

  term(): Expr | null {
    const head = this.unary();
    if (!head) return null;
    let a: Expr = head;
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next();
        const b = this.unary();
        if (!b) return null;
        a = { kind: t.v === '*' ? 'mul' : 'div', a, b };
      } else if (t && (t.t === 'num' || t.t === 'sym' || t.t === 'lp' || t.t === 'sqrt')) {
        // JUXTAPOSITION: `2a`, `4√5`, `25k^2`, `2ax`, `(x-3)(x+1)` — two atoms in a row multiply.
        const b = this.unary();
        if (!b) return null;
        a = { kind: 'mul', a, b };
      } else return a;
    }
  }

  unary(): Expr | null {
    const t = this.peek();
    if (t?.t === 'op' && t.v === '-') {
      this.next();
      const a = this.unary();
      return a ? { kind: 'neg', a } : null;
    }
    if (t?.t === 'op' && t.v === '+') {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  power(): Expr | null {
    const a = this.atom();
    if (!a) return null;
    const t = this.peek();
    if (t?.t === 'op' && t.v === '^') {
      this.next();
      const b = this.unary(); // right-associative, and `x^-1` parses
      return b ? { kind: 'pow', a, b } : null;
    }
    return a;
  }

  atom(): Expr | null {
    const t = this.next();
    if (!t) return null;
    if (t.t === 'num') return { kind: 'num', value: t.v };
    if (t.t === 'sym') return { kind: 'sym', name: t.v };
    if (t.t === 'sqrt') {
      // √5, √(x+1) — binds tighter than multiplication, so `4√5` is 4·√5 and not √20.
      const a = this.power();
      return a ? { kind: 'sqrt', a } : null;
    }
    if (t.t === 'lp') {
      const e = this.expr();
      if (!e) return null;
      const close = this.next();
      return close?.t === 'rp' ? e : null;
    }
    return null;
  }
}

/** Parse a numeric expression. Returns null on ANY malformed input — never a partial reading. */
export function parseExpr(src: string): Expr | null {
  const toks = tokenize(normalizeMath(src));
  if (!toks || toks.length === 0) return null;
  const p = new P(toks);
  const e = p.expr();
  if (!e || !p.atEnd()) return null; // trailing junk is a refusal (the unaccounted-input rule)
  return e;
}

/** Evaluate against a parameter assignment. A missing symbol yields NaN, never a guessed 0. */
export function evalExpr(e: Expr, env: Env = {}): number {
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'sym':
      return Object.prototype.hasOwnProperty.call(env, e.name) ? env[e.name] : NaN;
    case 'neg':
      return -evalExpr(e.a, env);
    case 'add':
      return evalExpr(e.a, env) + evalExpr(e.b, env);
    case 'sub':
      return evalExpr(e.a, env) - evalExpr(e.b, env);
    case 'mul':
      return evalExpr(e.a, env) * evalExpr(e.b, env);
    case 'div':
      return evalExpr(e.a, env) / evalExpr(e.b, env);
    case 'pow':
      return Math.pow(evalExpr(e.a, env), evalExpr(e.b, env));
    case 'sqrt':
      return Math.sqrt(evalExpr(e.a, env));
  }
}

/** Every parameter symbol the expression mentions, in first-seen order. */
export function symbolsOf(e: Expr, out: string[] = []): string[] {
  switch (e.kind) {
    case 'num':
      break;
    case 'sym':
      if (!out.includes(e.name)) out.push(e.name);
      break;
    case 'neg':
    case 'sqrt':
      symbolsOf(e.a, out);
      break;
    default:
      symbolsOf(e.a, out);
      symbolsOf(e.b, out);
  }
  return out;
}

/** A constant expression — no parameters — which is the common case and worth asking about. */
export function isConstant(e: Expr): boolean {
  return symbolsOf(e).length === 0;
}

/** Convenience: parse and evaluate a constant. Returns null when it is not a plain number. */
export function constValue(src: string): number | null {
  const e = parseExpr(src);
  if (!e || !isConstant(e)) return null;
  const v = evalExpr(e);
  return Number.isFinite(v) ? v : null;
}
