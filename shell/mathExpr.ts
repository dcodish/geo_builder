/**
 * THE EXPRESSION LEVEL of the shared math renderer (#1125).
 *
 * `shell/math.tsx` was built for **stated magnitudes** — ADR-298 / #77 / #40, the `BC = 35/√32` case —
 * and its grammar bottoms out at a literal number:
 *
 * ```
 * RADICAND := ( NUM [/ NUM] ) | NUM
 * RTERM    := [NUM] √ RADICAND | NUM
 * VALUE    := RTERM [/ RTERM]
 * ```
 *
 * The #1053 formula traces are arithmetic **expressions**, whose operands are sub-expressions —
 * `3² + (-4)²`, `(3 - 0)² + (4 - 0)²`, `(4 - 0)`. None of those is a `NUM`, so nothing above matched:
 * the `√` and the `/` were left as literal glyphs and the tokenizer fell through to its innermost
 * atoms, emitting **one `<math>` island per superscript** with plain text between them. Measured on the
 * operator's own panel: *"the sqrt is not on the whole line and ratios are not shown nicely"*, and a
 * third defect he did not name — one expression rendering as N disjoint formulas with a broken baseline.
 *
 * So the class is: **a lane that emits expressions was pointed at a renderer whose grammar stops at
 * values.** Widening `NUM` would not fix it — it would still produce islands and still bottom out one
 * level down. This module is the missing level: a small recursive-descent parser whose operands are
 * themselves expressions, emitting ONE `<math>` root per run.
 *
 * ## Why it lives beside `math.tsx` rather than inside it
 *
 * `math.tsx` owns which SPANS of a line are mathematical — and those boundaries are load-bearing and
 * asserted: «BC = 35/√32» keeps `BC = ` as text, «קשת AC + קשת BE» stays two arc islands, and a lone
 * number is never wrapped. Whole-line runs would be a simpler story and would break every one of those.
 * This module is handed one already-identified span and answers only *what MathML is it*.
 *
 * ## Precedence, and the one rule that is not conventional
 *
 * ```
 * expr   := term (('+' | '-') term)*
 * term   := factor (('·' | '*' | '/' | juxtaposition) factor)*
 * factor := '-' factor | power
 * power  := atom ('^' digits | '²')?
 * atom   := '√' factor | '(' expr ')' | '|' expr '|' | id ['_{' id '}'] | num
 * ```
 *
 * **`√` binds tighter than `/`, by taking a FACTOR rather than a term** — so `√2/3` is `(√2)/3` and
 * `√(2/3)` is the whole fraction under the root. That is ADR-298's disambiguation rule, and it is the
 * reason the `√()` grouping exists in the toolbar at all; getting it backwards would silently change
 * what a student's own notation means.
 */

/** A lexical atom. `op` covers operators, brackets and separators alike — the parser distinguishes. */
interface Tok {
  k: 'num' | 'id' | 'op';
  v: string;
}

const NUM_RE = /^\d+(?:\.\d+)?/;
const ID_RE = /^[A-Za-z]+\d*/;

const esc = (s: string): string =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

const mn = (s: string) => `<mn>${esc(s)}</mn>`;
const mi = (s: string) => `<mi>${esc(s)}</mi>`;
const mo = (s: string) => `<mo>${esc(s)}</mo>`;

/** `a`, `ab`, `a1` — and `x_{A}`, which the value layer also understands. */
function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const rest = src.slice(i);
    const num = NUM_RE.exec(rest);
    if (num) { out.push({ k: 'num', v: num[0] }); i += num[0].length; continue; }
    const id = ID_RE.exec(rest);
    if (id) { out.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    out.push({ k: 'op', v: c });
    i += 1;
  }
  return out;
}

/**
 * The parser. Every level returns MathML for what it consumed, or `null` when the input is not the
 * shape it expects — a `null` anywhere aborts the whole render and the caller keeps the text verbatim.
 *
 * Refusing rather than guessing matters here: this renderer is shared by four products, and a partial
 * parse that silently drops a term would show the student a formula that is not the one they were given.
 */
class Parser {
  private i = 0;
  /**
   * How many absolute-value groups are open.
   *
   * `|` is the one bracket whose opening and closing forms are the same character, so without this the
   * juxtaposition rule below reads the CLOSING bar of `|3·2 - 4·5 + 1|` as the start of another
   * factor, consumes it, and the whole parse fails -- which is exactly what happened to the operator's
   * distance formula, the headline case of this issue.
   */
  private absDepth = 0;
  constructor(private readonly t: Tok[]) {}

  private peek(): Tok | undefined { return this.t[this.i]; }
  private isOp(v: string): boolean { const p = this.peek(); return !!p && p.k === 'op' && p.v === v; }
  private eat(): Tok | undefined { return this.t[this.i++]; }

  atEnd(): boolean { return this.i >= this.t.length; }

  expr(): string | null {
    let left = this.term();
    if (left === null) return null;
    for (;;) {
      const p = this.peek();
      if (!p || p.k !== 'op' || (p.v !== '+' && p.v !== '-')) break;
      this.eat();
      const right = this.term();
      if (right === null) return null;
      left += mo(p.v) + right;
    }
    return left;
  }

  term(): string | null {
    let left = this.factor();
    if (left === null) return null;
    for (;;) {
      const p = this.peek();
      if (!p) break;

      if (p.k === 'op' && p.v === '/') {
        this.eat();
        const right = this.factor();
        if (right === null) return null;
        // A fraction is a CONTAINER, not an infix operator — that is the whole point of the issue.
        left = `<mfrac>${wrap(left)}${wrap(right)}</mfrac>`;
        continue;
      }
      if (p.k === 'op' && (p.v === '·' || p.v === '*' || p.v === '×')) {
        this.eat();
        const right = this.factor();
        if (right === null) return null;
        left += mo('·') + right;
        continue;
      }
      // JUXTAPOSITION — `5√2`, `2x`. The exam writes multiplication this way and so does the parser.
      const opensFactor = p.k === 'num' || p.k === 'id'
        || (p.k === 'op' && (p.v === '(' || p.v === '√' || (p.v === '|' && this.absDepth === 0)));
      if (opensFactor) {
        const right = this.factor();
        if (right === null) return null;
        left += right;
        continue;
      }
      break;
    }
    return left;
  }

  factor(): string | null {
    if (this.isOp('-')) {
      this.eat();
      const inner = this.factor();
      return inner === null ? null : mo('-') + inner;
    }
    return this.power();
  }

  power(): string | null {
    const base = this.atom();
    if (base === null) return null;
    const p = this.peek();
    if (p && p.k === 'op' && p.v === '²') { this.eat(); return `<msup>${wrap(base)}${mn('2')}</msup>`; }
    if (p && p.k === 'op' && p.v === '^') {
      this.eat();
      const e = this.peek();
      if (!e || e.k !== 'num') return null;
      this.eat();
      return `<msup>${wrap(base)}${mn(e.v)}</msup>`;
    }
    return base;
  }

  atom(): string | null {
    const p = this.peek();
    if (!p) return null;

    if (p.k === 'op' && p.v === '√') {
      this.eat();
      // A FACTOR, not a term: `√2/3` is `(√2)/3`, `√(2/3)` puts the fraction under the root (ADR-298).
      const rad = this.factor();
      return rad === null ? null : `<msqrt>${strip(rad)}</msqrt>`;
    }
    if (p.k === 'op' && p.v === '(') {
      this.eat();
      const inner = this.expr();
      if (inner === null || !this.isOp(')')) return null;
      this.eat();
      return `<mrow>${mo('(')}${inner}${mo(')')}</mrow>`;
    }
    if (p.k === 'op' && p.v === '|') {
      this.eat();
      this.absDepth += 1;
      const inner = this.expr();
      this.absDepth -= 1;
      if (inner === null || !this.isOp('|')) return null;
      this.eat();
      // Fences, not literal pipes — the absolute value reads as one bracketed group (#1125 step 3).
      return `<mrow>${mo('|')}${inner}${mo('|')}</mrow>`;
    }
    if (p.k === 'num') { this.eat(); return mn(p.v); }
    if (p.k === 'id') {
      this.eat();
      // `x_{A}` — the subscript the value layer also understands, kept working inside an expression.
      if (this.isOp('_')) {
        const save = this.i;
        this.eat();
        if (this.isOp('{')) {
          this.eat();
          const s = this.peek();
          if (s && (s.k === 'id' || s.k === 'num')) {
            this.eat();
            if (this.isOp('}')) { this.eat(); return `<msub>${mi(p.v)}${mi(s.v)}</msub>`; }
          }
        }
        this.i = save;
      }
      return mi(p.v);
    }
    return null;
  }
}

/** A single MathML element already, or several that need an `<mrow>` to be one. */
function wrap(ml: string): string {
  return isSingleElement(ml) ? ml : `<mrow>${ml}</mrow>`;
}

/** `√(2/3)` parses its radicand as a parenthesised row; the root supplies the bracket, so drop it. */
function strip(ml: string): string {
  const m = /^<mrow><mo>\(<\/mo>([\s\S]*)<mo>\)<\/mo><\/mrow>$/.exec(ml);
  return m ? (isSingleElement(m[1]) ? m[1] : `<mrow>${m[1]}</mrow>`) : wrap(ml);
}

/** Is this MathML exactly one top-level element? Used to avoid `<mrow>` around something already whole. */
function isSingleElement(ml: string): boolean {
  if (!ml.startsWith('<')) return false;
  const tag = /^<([a-z]+)[\s>]/.exec(ml);
  if (!tag) return false;
  let depth = 0;
  const re = /<(\/?)([a-z]+)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ml))) {
    if (m[3] === '/') continue;            // self-closing
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return re.lastIndex === ml.length;
  }
  return false;
}

/**
 * Render one already-identified mathematical span as a SINGLE `<math>` root.
 *
 * Returns `null` when the span is not a well-formed expression, so the caller can keep it verbatim —
 * a renderer that half-parses a formula is worse than one that declines.
 */
export function exprML(src: string): string | null {
  const toks = lex(src);
  if (toks.length === 0) return null;
  const p = new Parser(toks);
  const body = p.expr();
  if (body === null || !p.atEnd()) return null;
  return `<math>${body}</math>`;
}
