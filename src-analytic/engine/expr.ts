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
import { findJuxtaposedNumbers } from '../../shell/juxtaposedNumbers';
import { fmtNum } from '../../shell/format';
import { readLiteral } from '../../shell/literal';


export type Expr =
  /** `pi` (#2033, ADR-AG-407): this number IS π. It still evaluates as `value`; the mark only lets a printer write «π». */
  | { kind: 'num'; value: number; pi?: true }
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
// Two numbers side by side — refused, never multiplied (#2222 ADR-AG-284, #2286 ADR-AG-397)
// ---------------------------------------------------------------------------

/*
 * AN ASCII MIXED NUMBER «5 1/2» (#2222) AND ANY OTHER NUMBER–SPACE–NUMBER «2 3» (#2286).
 *
 * Juxtaposition (below) reads two atoms in a row as a product, so «5 1/2» read 2.5 and «A(2 3, 1)» drew A at (6, 1),
 * silently, in every numeric slot. Both are AMBIGUOUS as written. **Operator rulings:** 2026-10-16 (#2222) *"if the
 * user used a symbol of 1/2 so yes - it should be 5.5. otherwise we should reject a 5 1/2 syntax and teach to either
 * use decimal or 5+1/2 or 5*1/2"* — the glyph «5½» keeps its reading (`frameAnalytic.orthography` spells it 5.5) —
 * and 2026-11-03 (#2286) *"Refuse it, naming the line, in every builder"*. The detector is the suite's
 * (`shell/juxtaposedNumbers`, one copy for all four builders): the tokenizer refuses either shape (so no reader of a
 * value can multiply it, whichever rule or route reaches `parseExpr`), and `parseLine` asks it before every rule and
 * before the model, so the student gets one teaching sentence instead of each rule's own verdict. Number-then-symbol
 * juxtaposition («2x», «1/2x», «2 x», «2 √3») is untouched.
 */
export { findMixedNumber, findJuxtaposedNumbers, type MixedNumber, type NumberPair } from '../../shell/juxtaposedNumbers';

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: number; pi?: true }
  | { t: 'sym'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'sqrt' };

/** Symbols are SINGLE latin letters — the corpus's whole parameter alphabet (a b t k p m n r R). */
/**
 * A parameter symbol is ONE Latin letter — plus the private-use range, which is how `lengths.ts`
 * encodes a length term (`AB`) as a single symbol so this parser's precedence, juxtaposition, `√` and
 * powers all apply to length arithmetic without a second implementation (#1050).
 *
 * Private-use characters cannot appear in student input or in any corpus phrasing, so widening the
 * class here cannot change how a real expression is read.
 */
/**
 * …and ONE lowercase GREEK letter (#1621, ADR-AG-215) — the exam's angle names: «נסמן ∢DCB = 2α», «∢ABC = α».
 * The 2-D parser's variable alphabet is `[a-zα-ω]` (ADR-031: Latin for lengths, Greek for angles); here a
 * Greek letter is a parameter like any other — free and sampled until a given pins it (ADR-052). π (U+03C0)
 * is NOT in the class: it is the constant below, so the range is written around it. Distinct code points
 * from the Latin letters, so a figure may hold both `a` and `α` and they never meet. The tool's own
 * symbols (`θ_<id>`, carriers.ts) are never one character, so a student's `θ` cannot be one of them.
 */
const SYMBOL_RE = /[A-Za-z-α-ορ-ω]/;

/**
 * The LATIN half of `SYMBOL_RE`, separately, because the letter-run rules below are about what a
 * student can type. The private-use range is `lengths.ts`'s encoding of a length term (`AB` as one
 * character) and can never appear in student input, so it is never a "run" and is never refused.
 */
const LATIN_RE = /[A-Za-z]/;

/** The letters a student can index (Latin and Greek — never the private-use length encoding), and what starts an index (#1785). */
const INDEXED_LETTER_RE = /[A-Za-zα-ορ-ω]/;
/** Is this symbol a letter a student wrote — never a tool symbol (`r_O`, `θ_<id>`) or a private-use length placeholder? (#2566) */
export const isStudentLetter = (name: string): boolean => name.length === 1 && INDEXED_LETTER_RE.test(name);
const INDEX_START_RE = /[0-9_₀-₉]/;

function tokenize(src: string): Tok[] | null {
  // Two numbers side by side (a mixed number «5 1/2», a bare pair «2 3») are ambiguous as written, so they are a
  // refusal here, never a product (#2222 ADR-AG-284, #2286 ADR-AG-397).
  if (findJuxtaposedNumbers(src)) return null;
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
      /**
       * A LETTER RUN IS NOT AUTOMATICALLY A PRODUCT OF PARAMETERS (#1321).
       *
       * Juxtaposition is why this parser is hand-written — `2a`, `2ax`, `25k²` are products in the
       * exam's notation. But the same rule read `tan(30)` as `t·a·n·30`, minting three symbols the
       * student never wrote: the register takes its parameters from what expressions USE (#1014), so
       * those became free DOF and the residual could always be driven to zero. «שיפוע l1 הוא tan(30)»
       * on `y=2x` therefore built GREEN — a false given, drawn. `√` is the only function in this
       * language (`sqrt` normalises to it above), so an unknown letter run is not a function the tool
       * has, and an honest grammar must say which letter runs are symbols.
       *
       * **The word test is not invented here.** `parseAnalytic`'s `HAS_A_WORD` already answers
       * *"is this letter run a word?"* for the bare-equation branch, and #1068 ruled its boundary:
       * SPACE-DELIMITED and ≥3 letters, deliberately, so that `x²+y²-2abc=0` stays a legal product
       * of juxtaposed parameters. That decision stands and its lock is untouched. The defect #1321
       * reports is that the test guarded **one branch** — a value slot inside a recognised sentence
       * never passed through it. It moves HERE, the tokenizer every value slot in the grammar routes
       * through, so one place makes every sentence honest at once (docs/17 — the chokepoint, never
       * the calling rule, and never a list of function names, which would miss the next one).
       *
       * One boundary is added, for the form the word test cannot see: a run applied to `(`.
       * `tan(30)` is not space-delimited, and a function APPLICATION is unambiguous — `√` is the
       * only function there is. A single letter keeps juxtaposition, because `k(x+1)` is a product
       * and the corpus writes it.
       */
      if (LATIN_RE.test(c)) {
        let j = i;
        while (j < src.length && LATIN_RE.test(src[j])) j += 1;
        const run = j - i;
        const spaceDelimited = (i === 0 || src[i - 1] === ' ') && (j === src.length || src[j] === ' ');
        if (run >= 3 && spaceDelimited) return null; // a WORD — #1068's ruled boundary
        if (run >= 2 && src[j] === '(') return null; // a function APPLICATION — the only function is √
      }
      /**
       * AN INDEXED NAME IS NOT A PRODUCT (#1785, ADR-AG-244) — the third boundary, one character class over.
       *
       * «S1», «a2», «α1», «m1», «A1» are the book's indexed names: ONE name each. Juxtaposition read them as letter ×
       * index, so «S1» and «S2» became `S` and `2S` — one shared parameter and a 1 : 2 ratio the student never
       * stated, drawn green. The tool has no indexed-name symbol (that is a capability, not this fix), so a letter
       * followed IMMEDIATELY by a digit, a `_` or a subscript digit is refused here, and the value readers map the
       * refusal to a decline (`INDEXED_TOKEN`, carriers.ts) — the LLM fallback can rewrite it into a supported form.
       * Number-then-letter (`2a`, `25k²`, `2π`) is unchanged: only letter-then-index is a name. The private-use
       * range (`lengths.ts`'s encoding of `AB`, `A1B2` as one character) is never a student's letter, so it is exempt.
       * Curve and point names («l1», «A1») are consumed by their sentence rules before any text reaches here.
       */
      if (INDEXED_LETTER_RE.test(c) && i + 1 < src.length && INDEX_START_RE.test(src[i + 1])) return null;
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
    /**
     * π IS A NUMBER, not a symbol (#1129).
     *
     * **Operator ruling, 2026-09-16**, asked which glyphs belong in the analytic palette: *"Be
     * INCLUSIVE: π is in (needs a one-line expr.ts constant)."*
     *
     * A `num` token and not a `sym`, and the distinction is the whole of it: a symbol is a free
     * parameter the figure may SAMPLE, so `AB = 2π` as a symbol would make the length free and let
     * the solver choose it. π is a constant, so it is tokenised as its value and the juxtaposition
     * rule that already reads `2a` and `4√5` reads `2π` for free.
     *
     * #2033 (ADR-AG-407): the token remembers it was π, so a printer can write what the student wrote. Its value is
     * still `Math.PI`: #1129's constant semantics hold and no solve changes.
     */
    if (c === 'π') {
      out.push({ t: 'num', v: Math.PI, pi: true });
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
    if (t.t === 'num') return { kind: 'num', value: t.v, ...(t.pi ? { pi: true as const } : {}) };
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


/**
 * An expression back to TEXT — the inverse of the parser, and the thing this tree deliberately did
 * not build until something needed it (#1023).
 *
 * It was specified in #1023 as the enabling primitive behind the circle centre and the intersection
 * dots, and left unbuilt twice on purpose ([ADR-AG-036](../../docs/06c-decisions-analytic.md#adr-ag-036)):
 * a mechanism with no caller is this tree`s most repeated defect (#1020, #1045, #1065). Its caller is
 * the CURVE ROW: a curve whose coefficients carry a free parameter is not knowledge and cannot print
 * a number, and printing nothing threw away the student`s own equation.
 *
 * ## It prints no VALUE, so the honesty gate is untouched
 *
 * `y² − 2px = 0` states no magnitude. It names the dependency, which is strictly more than the dash
 * said and strictly less than a number — exactly the line [ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2 draws.
 *
 * ## Parentheses only where they change the reading
 *
 * Driven by PRECEDENCE rather than by wrapping everything: `a*b + c` reads as it was written, while
 * `(a + b)*c` keeps the parentheses it needs. A printer that brackets defensively produces
 * `((a)*(b))+((c))`, which is correct and unreadable, and a student comparing it with their notebook
 * would not recognise their own equation.
 */
export function exprText(e: Expr): string {
  return print(e, 0);
}

/**
 * The same expression in the student's notation (#1497, ADR-W-179): the exam multiplies a number by JUXTAPOSITION
 * (`6√5`, `3a`, `3√7/2`), so a stated value reads that way wherever it sits in the expression. `exprText` keeps `·`,
 * which an equation's reader needs.
 */
export function spelledText(e: Expr): string {
  return print(e, 0, true);
}

/** Binding power, matching the parser's own levels: add/sub < mul/div < pow < atom. */
const POW: Record<Expr['kind'], number> = {
  num: 9,
  sym: 9,
  sqrt: 9,
  pow: 4,
  neg: 3,
  mul: 2,
  div: 2,
  add: 1,
  sub: 1,
};

function print(e: Expr, need: number, spelled = false): string {
  const body = ((): string => {
    switch (e.kind) {
      case 'num':
        // The SHARED formatter, never a local rounder — the #723 chokepoint. A π prints as π (#2033).
        return e.pi ? 'π' : fmtNum(e.value);
      case 'sym':
        return e.name;
      case 'neg':
        return `-${print(e.a, POW.neg, spelled)}`;
      case 'sqrt':
        return `√${print(e.a, 9, spelled)}`;
      case 'add':
        return `${print(e.a, POW.add, spelled)} + ${print(e.b, POW.add, spelled)}`;
      case 'sub':
        // The right operand binds tighter: `a - (b - c)` must keep its parentheses.
        return `${print(e.a, POW.sub, spelled)} - ${print(e.b, POW.sub + 1, spelled)}`;
      case 'mul':
        if (e.a.kind === 'num' && ((spelled && (e.b.kind === 'sym' || e.b.kind === 'sqrt')) || (e.b.kind === 'num' && e.b.pi))) return `${print(e.a, POW.mul, spelled)}${print(e.b, POW.mul, spelled)}`;
        return `${print(e.a, POW.mul, spelled)}·${print(e.b, POW.mul, spelled)}`;
      case 'div':
        return `${print(e.a, POW.div, spelled)}/${print(e.b, POW.div + 1, spelled)}`;
      case 'pow':
        return `${print(e.a, POW.pow + 1, spelled)}^${print(e.b, POW.pow, spelled)}`;
      default: {
        const unprinted: never = e;
        throw new Error(`expression kind has no text: ${JSON.stringify(unprinted)}`);
      }
    }
  })();
  return POW[e.kind] < need ? `(${body})` : body;
}

/**
 * A number the student wrote as a literal, in their spelling, or undefined (#1497, ADR-AG-413). The parse substitutes a
 * valued letter, so «t = 0.5» · «A(2t,1)» holds the constant `2·0.5`: that is arithmetic, not a spelling, and reads the tiers.
 */
export function literalText(e: Expr): string | undefined {
  const text = spelledText(e);
  return symbolsOf(e).length === 0 && (readLiteral(text) !== null || carriesPi(e)) && !/^-?\d+$/.test(text) ? text : undefined; // an integer spells itself
}

/** Does the expression hold a typed π? `shell/literal` reads no π: the `Expr` is the half it cannot supply (#2033). */
function carriesPi(e: Expr): boolean {
  if (e.kind === 'num') return e.pi === true;
  if (e.kind === 'sym') return false;
  return carriesPi(e.a) || ('b' in e && carriesPi(e.b));
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
