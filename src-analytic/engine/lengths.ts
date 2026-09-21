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
  | { kind: 'point-line'; p: Id; line: string }
  /**
   * «המרחק בין AB ל-l1» — the distance between two LINES (#1205).
   *
   * Split from #1151, which added the point-to-line member and left this one with the note that it
   * was *"a real question, and a CAPABILITY rather than this bug"*. It is the third member of the
   * same union for the same reason the second was: a measure is a measure, so «המרחק בין AB ל-l1 = 5»
   * becomes the same constraint kind as «AB = 5» without any new solver code.
   *
   * **Defined only when the two lines are PARALLEL.** Between intersecting lines there is no single
   * distance — it is zero at the crossing and unbounded away from it — so the evaluator answers
   * `null` there and the ask lane refuses with an explanation. **Operator ruling, 2026-09-19:** asked
   * whether the intersecting case should answer `0` or refuse, he chose **refuse and explain**, on the
   * grounds that the refusal teaches the concept while `0` lets the misconception stand.
   *
   * Both names are AS WRITTEN, for the reason the point-line member records: «l1» and «AB» are both
   * legal and mean different things, and only the caller holding the figure can tell them apart.
   */
  | { kind: 'line-line'; u: string; v: string };

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
/**
 * THE DISTANCE QUESTION, WITH ROLES DECIDED BY THE OPERANDS (#1134, #1151).
 *
 * Before #1151 one regex carried the word orders and fixed the roles by POSITION -- the point had to
 * come first and the line second. Measured, that made four spellings of one question disagree:
 *
 * ```
 * המרחק בין C ל-AB      -> 5            (point, then line)
 * המרחק בין AB ל-C      -> «לא הבנתי»    the SAME question, other order
 * המרחק בין A ל-B       -> null         two points, read as a line named «B»
 * distance between C and AB -> null         and the English swallowed by LENGTH_TOKEN as «AB»
 * ```
 *
 * The last is the honesty failure: the token missed, `LENGTH_TOKEN` then ate `AB` out of the
 * sentence, and the student was answered about a DIFFERENT measurement.
 *
 * ## Roles come from the operands, and the operands say what they are
 *
 * A name's own spelling settles its role, with no figure needed: **one letter is a point** and can be
 * nothing else; two letters or a curve name denote a line. So the classification happens here, and
 * `lengths.ts` keeps the layering the rest of the file is careful about -- it still knows nothing
 * about objects.
 *
 * | operands | the question |
 * | --- | --- |
 * | `A`, `B` | the plain distance -- the same term «AB» produces, so one question is one term |
 * | `C`, `AB` (either order) | the point-to-line distance |
 * | `AB`, `l1` | NOT read here -- see below |
 *
 * **Two lines is a CAPABILITY, not this bug.** The distance between two parallel lines is a real
 * question and this token could reach it, but building it under a bug's banner is what CLAUDE.md
 * forbids; a pair of line operands is therefore left unconsumed and still answers «לא הבנתי»,
 * exactly as it does today. Filed separately.
 *
 * ## Frames, not one positional mega-regex
 *
 * Each spelling is its own small pattern with the SAME two operand slots, applied in turn. That is
 * what stopped the group-counting bug #1134 had to fix (four groups, only the first pair read) from
 * being able to come back: a frame that matches hands over exactly two operands, and the roles are
 * decided in one place for all of them.
 */
const OPERAND = String.raw`[A-Za-zℓ][0-9]?[A-Z]?[0-9]?`;
/** An optional noun before either operand -- «המרחק מ-C לישר AB». */
const NOUN = String.raw`(?:ה?(?:ישר|קטע|צלע)\s+|(?:the\s+)?line\s+)?`;
/**
 * The noun, with its ARTICLE — Hebrew's is a prefix (`ה?מרחק`) and English's is a separate word.
 *
 * «the distance between A and B» left `the ` unconsumed, and #1321's measurement is what exposed
 * it: the remainder went to `parseExpr`, which multiplied the leftover letters as juxtaposed
 * parameters, so the catalog's own F19 English row built `t·h·e·|AB| = 10` — three phantom free
 * symbols against the real distance term, satisfiable at any length. The row parsed, so the
 * catalog lock was green while the constraint it built was false. `NOUN` below already spells the
 * article for `line`; the measure noun simply never did.
 */
const DISTANCE = String.raw`(?:ה?מרחק|(?:the\s+)?[Dd]istance)\s+`;
const frame = (open: string, join: string) =>
  // `String.raw`, not a plain template: a template literal drops the backslash in `\s`, which would
  // silently turn every gap in these frames into a literal «s».
  new RegExp(String.raw`${DISTANCE}(?:${open})\s*${NOUN}(${OPERAND})\s+(?:${join})\s*${NOUN}(${OPERAND})`, 'g');

/**
 * Ordered most specific first, so «של … מ-» is not mis-read by the «מ- … ל-» frame, and
 * «לבין» is tried before the bare «ל-» it starts with.
 */
const DISTANCE_FRAMES: RegExp[] = [
  frame(String.raw`של\s+|of\s+`, String.raw`מ-?|from\s+`),
  frame(String.raw`בין\s+|between\s+`, String.raw`לבין\s+|א?ל-?|and\s+`),
  frame(String.raw`מ-?|from\s+`, String.raw`לבין\s+|א?ל-?|to\s+`),
];

/**
 * THE SYMBOLIC SPELLINGS, REWRITTEN INTO THE WORDED ONE (#1128).
 *
 * **Operator ruling, 2026-09-16:** *"`d_{AB}` should also work for questions. as well as `|AB|`"* —
 * and, asked about the spelling list, *"we need to support all of these"*.
 *
 * `d_{AB}`, `d_{A,B}`, `d(A,B)` and `|AB|` are NOTATIONS for the question «המרחק בין A ל-B», not
 * new questions. So they are rewritten into that sentence and handed to the frames below, rather
 * than given patterns of their own that would need their own copy of the role logic. The roles —
 * which operand is a point and which a line — are then decided in the ONE place #1151 put them, and
 * a spelling cannot disagree with its own synonym ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * That is also what makes `d_{A,l1}` work for free: the frame reads `l1` as a line exactly as the
 * worded «המרחק בין A לישר l1» does, so the symbolic form inherits the point-to-line capability
 * instead of being refused beside it.
 *
 * The operands are deliberately **not** restricted to point names here. Restricting them would make
 * `d_{A,l1}` fall through to `LENGTH_TOKEN`, which would eat a pair out of the middle of it and
 * answer a DIFFERENT measurement — the exact honesty failure #1151 records for the English form.
 */
const SYM_OPERAND = String.raw`[A-Za-zℓ][0-9]?[A-Z]?[0-9]?`;
const SYMBOLIC_DISTANCE: Array<[RegExp, string]> = [
  // d_{AB} · d_{A,B} · d_{A,l1}
  [new RegExp(String.raw`\bd\s*_\s*\{\s*(${SYM_OPERAND})\s*,?\s*(${SYM_OPERAND})\s*\}`, 'g'), 'המרחק בין $1 ל-$2'],
  // d(A,B) — the comma is required, or `d(x)` of a function would be claimed
  [new RegExp(String.raw`\bd\s*\(\s*(${SYM_OPERAND})\s*,\s*(${SYM_OPERAND})\s*\)`, 'g'), 'המרחק בין $1 ל-$2'],
  // |AB| — the bars are the absolute-value notation for a length, and only a POINT PAIR is a length
  [new RegExp(String.raw`\|\s*([A-Z][0-9]?)\s*([A-Z][0-9]?)\s*\|`, 'g'), 'המרחק בין $1 ל-$2'],
];

/**
 * A LENGTH NOUN standing directly in front of a pair — «אורך AB», «הקטע AB», «צלע AB» (#1128).
 *
 * Operator, playing the 2-D round of 2026-09-19: *"אורך הקטע BC = 10 is not recognized in analytics
 * tool"*. A student had exactly one way to state a length here — the bare symbolic `AB = 10` — and
 * every plain Hebrew word for it was refused. The noun adds no meaning to a pair that is already a
 * length, so it is removed and the pair speaks for itself.
 *
 * The LOOKAHEAD is the whole safety of this. The noun is dropped only where a point pair follows it
 * immediately, so «הקטע AB» becomes `AB` while «הקטע» in any other sentence is untouched — and
 * «המרחק בין A ל-B», which the frames above have already consumed, never reaches here at all.
 *
 * Runs AFTER the frames and BEFORE `LENGTH_TOKEN`, which is the same slot, and the same reason, as
 * the area token: a noun stripped too early would leave «בין A ל-B» with no frame left to read it.
 */
const LENGTH_NOUN = new RegExp(
  String.raw`(?:ה?אורך|ה?מרחק|[Ll]ength(?:\s+of)?|[Dd]istance)\s+(?:ה?(?:קטע|צלע|ישר)\s+)?(?=[A-Z][0-9]?[A-Z][0-9]?\b)|(?:ה?(?:קטע|צלע)|[Ss]egment|[Ss]ide)\s+(?=[A-Z][0-9]?[A-Z][0-9]?\b)`,
  'g',
);

/** One letter (with an optional index) is a POINT and can be nothing else. */
/**
 * The bar two lines must clear to be said to CROSS rather than be parallel, as a SINE (#1205).
 *
 * Same instrument and same magnitude as `CROSS_MIN_SINE` in `engine/crossings.ts` (ADR-AG-130), for
 * the same measured reason: the solve leaves ~2e-10 relative on a satisfied incidence, two
 * representations of one line were measured 6.65e-8 apart by this reading, and 1e-6 sits two orders
 * above that noise while corresponding to an angle of 5.7e-5 degrees — which no student means.
 *
 * Duplicated rather than imported because `crossings.ts` is a consumer of this layer and importing it
 * here would invert that; the two are pinned together by `issue-1205-line-line-distance.test.ts`.
 */
const PARALLEL_SINE = 1e-6;

const IS_POINT = /^[A-Z][0-9]?$/;

const AREA_TOKEN = /(?:שטח|[Aa]rea\s+of)\s+(?:ה?[א-ת]+(?:[- ][א-ת]+){0,2}\s+|(?:the\s+)?[a-z]+\s+)?((?:[A-Z][0-9]?){3,})/g;

export function parseLengthExpr(src: string): LengthExpr | null {
  const terms: MeasureTerm[] = [];
  // Areas first — see AREA_TOKEN. Each becomes a placeholder before any length token is looked for.
  // Point-to-line first: its tail contains a name that LENGTH_TOKEN would otherwise claim (#1048).
  /**
   * ONE role decision, for every spelling (#1151).
   *
   * Each frame hands over exactly two operands and knows nothing about which is which; the roles are
   * settled here, from the names themselves. That is what makes «המרחק בין C ל-AB» and
   * «המרחק בין AB ל-C» the same question rather than one answer and one «לא הבנתי».
   */
  // The symbolic notations become the worded question first, so the frames below decide the roles
  // for every spelling at once (#1128).
  let withPL = SYMBOLIC_DISTANCE.reduce((s, [re, to]) => s.replace(re, to), normalizeMath(src));
  for (const f of DISTANCE_FRAMES) {
    withPL = withPL.replace(f, (_m, x: string, y: string) => {
      const push = (t: MeasureTerm, same: (u: MeasureTerm) => boolean) => {
        const at = terms.findIndex(same);
        return String.fromCharCode(PLACEHOLDER_BASE + (at >= 0 ? at : terms.push(t) - 1));
      };
      // Two points are a plain distance -- the SAME term «AB» produces, so «המרחק בין A ל-B» and
      // «AB» are one question with one answer instead of a point-line term naming a line called «B».
      if (IS_POINT.test(x) && IS_POINT.test(y)) {
        if (x === y) return _m; // a degenerate statement, as LENGTH_TOKEN also refuses
        return push({ a: x, b: y }, (t) => t.kind !== 'area' && t.kind !== 'point-line' && t.kind !== 'line-line' && t.a === x && t.b === y);
      }
      // Exactly one point: the other operand is the line, whichever side it was written on.
      const p = IS_POINT.test(x) ? x : IS_POINT.test(y) ? y : null;
      const line = p === x ? y : p === y ? x : null;
      // Neither is a point: two LINES — the capability #1151 named and left (#1205). Consumed here
      // now, so the ask lane can answer it; whether the pair is actually parallel is a question about
      // the FIGURE, which this module deliberately cannot see, so it is the evaluator that decides.
      if (!p || !line) {
        if (x === y) return _m; // one line is no distance from itself — not this question
        const lkey = `${x}|${y}`;
        return push(
          { kind: 'line-line', u: x, v: y },
          (t) => t.kind === 'line-line' && `${t.u}|${t.v}` === lkey,
        );
      }
      const key = `${p}|${line}`;
      return push(
        { kind: 'point-line', p, line },
        (t) => t.kind === 'point-line' && `${t.p}|${t.line}` === key,
      );
    });
  }
  // A length noun in front of a bare pair adds nothing to it — «אורך AB» IS «AB» (#1128).
  const withNouns = withPL.replace(LENGTH_NOUN, '');
  const withAreas = withNouns.replace(AREA_TOKEN, (_m, run: string) => {
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
    const at = terms.findIndex((t) => t.kind !== 'area' && t.kind !== 'point-line' && t.kind !== 'line-line' && t.a === a && t.b === b);
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
    } else if (term.kind === 'line-line') {
      /**
       * THE DISTANCE BETWEEN TWO PARALLEL LINES (#1205).
       *
       * On normalised coefficients it is `|c₁ − c₂|` — which is why both sides are divided through by
       * their own norm first rather than compared raw. `app/lines.ts` produces `ax + by + c = 0` by
       * construction, so there is nothing to parse here.
       *
       * **Not parallel → `null`, deliberately.** Between intersecting lines no single distance exists,
       * and answering the perpendicular distance at some sampled point would be a magnitude the figure
       * never had (ADR-052). `null` is the same answer every other term gives for "cannot be judged",
       * so the ask lane refuses it through the path it already has.
       *
       * Parallelism is judged on the normalised cross term — the SINE of the angle between them, never
       * a raw determinant, which carries the lines’ coefficient magnitudes and is a threshold on
       * nothing (ADR-AG-021, and ADR-AG-130 one module over).
       */
      const lu = lineAt?.(term.u) ?? null;
      const lv = lineAt?.(term.v) ?? null;
      if (!lu || !lv) return null;
      const nu = Math.hypot(lu.a, lu.b);
      const nv = Math.hypot(lv.a, lv.b);
      if (nu < 1e-12 || nv < 1e-12) return null; // not a line at all
      if (Math.abs(lu.a * lv.b - lv.a * lu.b) / (nu * nv) > PARALLEL_SINE) return null; // they cross — the ask lane says so
      // Same normal DIRECTION, or the constants subtract the wrong way: orient v to u before comparing.
      const flip = lu.a * lv.a + lu.b * lv.b < 0 ? -1 : 1;
      value = Math.abs(lu.c / nu - (flip * lv.c) / nv);
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
  return le.terms.flatMap((t) => (t.kind === 'area' ? t.ids : t.kind === 'point-line' ? [t.p] : t.kind === 'line-line' ? [] : [t.a, t.b]));
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
          : t.kind === 'line-line'
            ? `מרחק ${t.u}-${t.v}`
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
    if (only.kind === 'area' || only.kind === 'point-line' || only.kind === 'line-line') continue;
    out.set(pairKey(only.a, only.b), v);
  }
  return out;
}

/** Unordered: `AB` and `BA` are one length. */
export const pairKey = (a: Id, b: Id): string => [a, b].sort().join('\u0000');
