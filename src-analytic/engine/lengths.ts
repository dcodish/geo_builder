/**
 * Lengths as VALUES — the expression layer behind «AB+BC=10», «AB = AC», «AB = 4√5» (#1050).
 *
 * Every constraint kind before this one is a **fixed-arity relation**: an area equals a number, a
 * point is the midpoint of two others, two directions are parallel. `AB + BC = DE` is not that. It is
 * an equation between two EXPRESSIONS built from lengths, and neither side has an arity the grammar
 * fixes. So it needs an expression layer — one constraint kind with two trees, rather than one kind
 * per form, which is what makes `AB = 10`, `AB = AC`, `AB + BC = 10`, `AB + BC = DE` and `2·AB = 3·CD`
 * the same feature instead of five.
 *
 * **It reuses `expr.ts` rather than growing a second parser.** Operator precedence, juxtaposition
 * (`2AB`), `√`, powers and the typeset/keyboard normalisation are all already written, tested, and
 * load-bearing elsewhere; a parallel implementation would be a second place for `4√5` to be read
 * differently. The only thing `expr.ts` cannot do is see `AB` as ONE symbol — its tokenizer reads
 * single Latin letters, so `AB` is the product `A·B`.
 *
 * So each length term is rewritten to a single PLACEHOLDER character before parsing, and bound to the
 * measured distance at evaluation. The placeholders come from the Unicode private-use area, which no
 * student can type and no corpus phrasing contains, so the encoding cannot collide with a real
 * parameter — `2a·AB` keeps its `a`.
 */
import { evalExpr, normalizeMath, parseExpr, type Env, type Expr } from './expr';
import type { Pt } from './derived';
import type { Id } from './types';

/** One `|PQ|` in an expression — the pair whose distance the placeholder stands for. */
export interface LengthTerm {
  a: Id;
  b: Id;
}

/** A parsed length expression: the tree, plus what each placeholder means. */
export interface LengthExpr {
  expr: Expr;
  /** Positional: `terms[i]` is bound to `PLACEHOLDER_BASE + i` when the expression is evaluated. */
  terms: LengthTerm[];
}

/**
 * The private-use code point the first length term is encoded as.
 *
 * Private-use precisely so this is not a character anyone can type: an encoding that could collide
 * with student input would be the `[IVX]` defect again (ADR-AG-006), where an internal token class ate
 * real text.
 */
const PLACEHOLDER_BASE = 0xe000;

/** Two point names run together — `AB`, `A1B2`. The same shape the rest of the parser uses. */
const LENGTH_TOKEN = /([A-Z][0-9]?)([A-Z][0-9]?)/g;

/**
 * `AB + BC` → an expression over placeholders, plus the pairs they stand for.
 *
 * `null` when the text mentions no length at all — that is not a length expression, and saying so is
 * how the caller knows to leave the sentence to another rule rather than claiming it.
 */
export function parseLengthExpr(src: string): LengthExpr | null {
  const terms: LengthTerm[] = [];
  const encoded = normalizeMath(src).replace(LENGTH_TOKEN, (_m, a: string, b: string) => {
    // Identical endpoints have zero length always; they are a degenerate statement rather than a
    // term, and admitting them would let `AA = 5` look satisfiable-but-failing instead of wrong.
    if (a === b) return `${a}${b}`;
    const at = terms.findIndex((t) => t.a === a && t.b === b);
    const i = at >= 0 ? at : terms.push({ a, b }) - 1;
    return String.fromCharCode(PLACEHOLDER_BASE + i);
  });
  if (terms.length === 0) return null;
  const expr = parseExpr(encoded);
  if (!expr) return null;
  return { expr, terms };
}

/** A length expression that is only a number — the right-hand side of `AB = 10`. */
export function constantLengthExpr(src: string): LengthExpr | null {
  const expr = parseExpr(normalizeMath(src));
  return expr ? { expr, terms: [] } : null;
}

/**
 * Evaluate, given where the points landed.
 *
 * `null` when any referenced point is absent — "cannot be judged", the same answer every other
 * residual gives for a vanished point, and never a guessed zero.
 */
export function evalLengthExpr(
  le: LengthExpr,
  at: (id: Id) => Pt | null,
  env: Env,
): number | null {
  const bound: Record<string, number> = { ...env };
  for (let i = 0; i < le.terms.length; i += 1) {
    const { a, b } = le.terms[i];
    const p = at(a);
    const q = at(b);
    if (!p || !q) return null;
    bound[String.fromCharCode(PLACEHOLDER_BASE + i)] = Math.hypot(q.x - p.x, q.y - p.y);
  }
  const v = evalExpr(le.expr, bound);
  return Number.isFinite(v) ? v : null;
}

/** Every point a length expression references, so the solver knows which carriers may move. */
export function lengthRefs(le: LengthExpr): Id[] {
  return le.terms.flatMap((t) => [t.a, t.b]);
}

/** The student's own words are carried on the fact; this is the internal shorthand for a refusal. */
export function describeLengthExpr(le: LengthExpr): string {
  return le.terms.length === 0 ? 'ערך' : le.terms.map((t) => `${t.a}${t.b}`).join('+');
}
