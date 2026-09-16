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
import { evalExpr, normalizeMath, parseExpr, symbolsOf, type Env, type Expr } from './expr';
import { RESERVED_SYMBOLS } from './carriers';
import type { Pt } from './derived';
import type { Id } from './types';

/**
 * One MEASURE in an expression — what a placeholder stands for (#1075).
 *
 * Two members, and the second is why this is a union rather than a pair of ids: «שטח המשולש ABC
 * גדול פי 3 משטח המשולש CEF» compares one measure to another, and an area is a measure exactly as
 * a length is. Encoding both the same way means «AB = 2CD» and «שטח ABC = 3·שטח CEF» are ONE
 * constraint kind with different trees, which is the property `length-eq` was built for.
 */
export type MeasureTerm =
  | { kind?: 'length'; a: Id; b: Id }
  | { kind: 'area'; ids: Id[] }
  /**
   * «המרחק מ-A לישר l1» — the distance from a POINT to a LINE (#1048).
   *
   * The operator named it as one of the three things this topic teaches. It is a measure exactly as
   * the other two are, so it joins the union rather than becoming a second grammar — which is what
   * lets «המרחק מ-A לישר l1 = 5» be the same constraint kind as «AB = 5» without new solver code.
   *
   * `line` is the name AS WRITTEN, not an id: «l1» and «AB» are both legal and mean different things
   * (a named curve, and the line through two points), and only the caller holding the figure can
   * tell them apart. Resolving it here would mean this module knowing about objects, which is the
   * layering the rest of the file is careful to avoid.
   */
  | { kind: 'point-line'; p: Id; line: string };

/** @deprecated the name the union grew out of — kept so existing callers read unchanged. */
export type LengthTerm = MeasureTerm;

/** A parsed length expression: the tree, plus what each placeholder means. */
export interface LengthExpr {
  expr: Expr;
  /** Positional: `terms[i]` is bound to `PLACEHOLDER_BASE + i` when the expression is evaluated. */
  terms: MeasureTerm[];
}

/** The unsigned area of a polygon — the shoelace, which is what the `area` constraint measures too. */
const polygonArea = (ps: Pt[]): number => {
  let s = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const q = ps[(i + 1) % ps.length];
    s += ps[i].x * q.y - q.x * ps[i].y;
  }
  return Math.abs(s) / 2;
};

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
/**
 * An AREA inside a measure expression — «שטח המשולש ABC» (#1075).
 *
 * Matched BEFORE the length tokens, and that order is the whole of it: `ABC` would otherwise be
 * read as the length `AB` followed by a stray `C`. An optional Hebrew noun sits between the word
 * and the vertices because the corpus writes «שטח המשולש ABC» as often as «שטח ABC».
 */
/**
 * «המרחק מ-A לישר l1» · «המרחק בין A לבין הישר AB» · «distance from A to line l1» (#1048).
 *
 * Matched BEFORE the length token, for the reason areas are: «…ל AB» would otherwise be eaten as the
 * length `AB`, and the sentence would silently become a different measurement. The noun and the
 * definite article are optional throughout, as everywhere else in this grammar, and both «ל» and
 * «אל» front the target because both are written.
 */
const POINT_LINE_TOKEN =
  /(?:ה?מרחק|[Dd]istance)\s+(?:מ-?|בין\s+|from\s+)([A-Z][0-9]?)\s+(?:לבין\s+|א?ל-?|to\s+)\s*(?:ה?(?:ישר|קטע|צלע)\s+|(?:the\s+)?line\s+)?([A-Za-zℓ][0-9]?[A-Z]?[0-9]?)/g;

const AREA_TOKEN = /(?:שטח|[Aa]rea\s+of)\s+(?:ה?[א-ת]+(?:[- ][א-ת]+){0,2}\s+|(?:the\s+)?[a-z]+\s+)?((?:[A-Z][0-9]?){3,})/g;

export function parseLengthExpr(src: string): LengthExpr | null {
  const terms: MeasureTerm[] = [];
  // Areas first — see AREA_TOKEN. Each becomes a placeholder before any length token is looked for.
  // Point-to-line first: its tail contains a name that LENGTH_TOKEN would otherwise claim (#1048).
  const withPL = normalizeMath(src).replace(POINT_LINE_TOKEN, (_m, p: string, line: string) => {
    const key = `${p}|${line}`;
    const at = terms.findIndex((t) => t.kind === 'point-line' && `${t.p}|${t.line}` === key);
    const i = at >= 0 ? at : terms.push({ kind: 'point-line', p, line }) - 1;
    return String.fromCharCode(PLACEHOLDER_BASE + i);
  });
  const withAreas = withPL.replace(AREA_TOKEN, (_m, run: string) => {
    const ids = run.match(/[A-Z][0-9]?/g) ?? [];
    const key = ids.join();
    const at = terms.findIndex((t) => t.kind === 'area' && t.ids.join() === key);
    const i = at >= 0 ? at : terms.push({ kind: 'area', ids }) - 1;
    return String.fromCharCode(PLACEHOLDER_BASE + i);
  });
  const encoded = withAreas.replace(LENGTH_TOKEN, (_m, a: string, b: string) => {
    // Identical endpoints have zero length always; they are a degenerate statement rather than a
    // term, and admitting them would let `AA = 5` look satisfiable-but-failing instead of wrong.
    if (a === b) return `${a}${b}`;
    const at = terms.findIndex((t) => t.kind !== 'area' && t.kind !== 'point-line' && t.a === a && t.b === b);
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
  /**
   * Resolve a line NAMED in the text to `ax + by + c = 0` (#1048).
   *
   * Optional, so every existing caller reads unchanged: a caller that supplies none simply cannot
   * evaluate a point-to-line term, which is the honest outcome for one that has no figure to resolve
   * against.
   */
  lineAt?: (name: string) => { a: number; b: number; c: number } | null,
): number | null {
  const bound: Record<string, number> = { ...env };
  for (let i = 0; i < le.terms.length; i += 1) {
    const term = le.terms[i];
    let value: number;
    if (term.kind === 'area') {
      const ps = term.ids.map(at);
      if (ps.some((p) => p === null)) return null;
      value = polygonArea(ps as Pt[]);
    } else if (term.kind === 'point-line') {
      const p = at(term.p);
      const l = lineAt?.(term.line) ?? null;
      if (!p || !l) return null;
      const n = Math.hypot(l.a, l.b);
      if (n < 1e-12) return null; // not a line at all
      // The textbook form: |a·x₀ + b·y₀ + c| / √(a² + b²). UNSIGNED, because a distance is.
      value = Math.abs(l.a * p.x + l.b * p.y + l.c) / n;
    } else {
      const p = at(term.a);
      const q = at(term.b);
      if (!p || !q) return null;
      value = Math.hypot(q.x - p.x, q.y - p.y);
    }
    bound[String.fromCharCode(PLACEHOLDER_BASE + i)] = value;
  }
  const v = evalExpr(le.expr, bound);
  return Number.isFinite(v) ? v : null;
}

/** Every point a length expression references, so the solver knows which carriers may move. */
export function lengthRefs(le: LengthExpr): Id[] {
  // A point-to-line term references the POINT only: the line is named, and whether that name is a
  // curve or a pair of vertices is the caller's question, not the solver's.
  return le.terms.flatMap((t) => (t.kind === 'area' ? t.ids : t.kind === 'point-line' ? [t.p] : [t.a, t.b]));
}

/** The student's own words are carried on the fact; this is the internal shorthand for a refusal. */
export function describeLengthExpr(le: LengthExpr): string {
  if (le.terms.length === 0) return 'ערך';
  return le.terms
    .map((t) =>
      t.kind === 'area'
        ? `שטח ${t.ids.join('')}`
        : t.kind === 'point-line'
          ? `מרחק ${t.p}-${t.line}`
          : `${t.a}${t.b}`,
    )
    .join('+');
}

/**
 * The lengths the STUDENT’s own givens pin, and the value each was pinned to (#1065).
 *
 * [ADR-AG-016](../../docs/06c-decisions-analytic.md#adr-ag-016) settled where a value belongs: the
 * canvas shows the QUESTION, the data panel shows the ANSWER. A length the student STATED is part of
 * their question and belongs on the segment; one the tool DERIVED is an answer and belongs in the
 * panel. The operator drew the line themselves — *"since this is a given and not calculated"*.
 *
 * So this answers only the narrow question: **is there a given that pins this length by itself?**
 * That is a `length-eq` with exactly one length term on one side and none on the other — «AB = 10»,
 * «AB = 4√5». «AB = AC» pins NEITHER on its own: it relates them, and whichever becomes known does
 * so through the other, which is derivation rather than statement.
 *
 * The value is deliberately NOT computed here. Whether a pinned length is knowledge still has to pass
 * `isKnowledge` — a given written in terms of a free parameter is stated and still not a number — and
 * that gate lives where the figure does.
 */
export function pinnedLengths(
  constraints: readonly { t: string }[],
  env: Env,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of constraints) {
    if (k.t !== 'length-eq') continue;
    const { left, right } = k as unknown as { left: LengthExpr; right: LengthExpr };
    const sides = [left, right];
    const lengthy = sides.filter((e) => e.terms.length > 0);
    // Exactly one side mentions lengths, and it mentions exactly one: that is a length against a
    // value. Anything else relates two lengths, or combines several, and pins none of them alone.
    if (lengthy.length !== 1 || lengthy[0].terms.length !== 1) continue;
    const value = sides.find((e) => e !== lengthy[0]);
    if (!value) continue;
    /**
     * **The stated value must be KNOWLEDGE**, not one seed’s sample of it.
     *
     * «AB = a» with a free `a` is a given, and it is not a number: drawing `3.46` on the segment
     * would assert a value the question never gave — [#1020](https://github.com/dcodish/geo_builder/issues/1020)
     * in a new place, and the exact thing this function’s first draft did because the caller
     * hardcoded the gate. The test is the same one `provenanceOf` uses for a point’s coordinates:
     * every symbol must be one of the plane’s reserved ones, i.e. there are no free parameters.
     */
    if (!symbolsOf(value.expr).every((sym) => RESERVED_SYMBOLS.has(sym))) continue;
    const v = evalExpr(value.expr, env);
    if (!Number.isFinite(v)) continue;
    // A pinned LENGTH only: an area term pins no segment, and the `lengthy` filter above already
    // required exactly one term — this says which kind it must be (#1075).
    const only = lengthy[0].terms[0];
    // A pinned SEGMENT only. An area pins none, and a point-to-line distance pins a point against a
    // line rather than a pair of vertices — a different thing, and not what this map is for (#1048).
    if (only.kind === 'area' || only.kind === 'point-line') continue;
    out.set(pairKey(only.a, only.b), v);
  }
  return out;
}

/** Unordered: `AB` and `BA` are one length. */
export const pairKey = (a: Id, b: Id): string => [a, b].sort().join('\u0000');
