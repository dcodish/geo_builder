/**
 * The deterministic bilingual parser — `utterance → Fact[]`.
 *
 * Slice A of the docs/19 §10 language: **F1** (point by coordinates), **F3** (line by equation),
 * **F5** (circle by equation), **F6** (conic by equation) and **F11** (parameter declaration). The
 * governing principle (ADR-AG-005 D8) is that **the student types the exam's own sentence** —
 * every form below occurs in the corpus, so the rules admit the exam's phrasing rather than a
 * command language invented for the parser's convenience.
 *
 * Two traps are inherited rather than rediscovered, both from `src3d`:
 *
 *  - **`ℓ` is not a `\w` character.** A `\b` after a line name silently fails, so line names are
 *    matched with explicit character classes and lookaheads, never word boundaries.
 *  - **A Hebrew keyword gate must admit every spelling AND the optional prefixes** — the definite
 *    article (`ה?מעגל`) and the subject noun (`הנקודה A` ≡ `נקודה A` ≡ `A`). A gate that admits
 *    one spelling is a silent drop, which is the single most productive bug class in the 3-D tree.
 *
 * Unmatched input returns `not-handled`, which is the seam where the LLM fallback escalates.
 */
import type { DerivedRule } from '../engine/derived';
import type { Constraint, Direction } from '../engine/solve';
import { parseExpr, normalizeMath, symbolsOf, type Expr } from '../engine/expr';
import { RESERVED_SYMBOLS } from '../engine/carriers';
import { constantLengthExpr, parseLengthExpr } from '../engine/lengths';
import { UNBOUNDED, type CurveKind, type Domain, type Fact, type Id } from '../engine/types';

/**
 * Why a line did not become facts.
 *
 * The codes below `out-of-scope` are OWNED refusals: the rule recognised its own sentence and
 * found something wrong with it. That distinction is the point of #1039/#1042 — a rule that
 * returns `null` on a sentence it clearly matched sends the student to `not-handled` ("I did not
 * understand"), which is false and which routes a well-formed statement to the LLM seam instead of
 * answering it. A rule that matched owes the student an answer about what it matched.
 */
export type ParseFailure =
  /** No rule matched — the LLM-escalation seam. */
  | { code: 'not-handled'; detail: string }
  /** A rule matched but the equation would not parse. */
  | { code: 'bad-equation'; detail: string }
  /** Understood, and deliberately outside the product's scope. */
  | { code: 'out-of-scope'; detail: string }
  /**
   * A coordinate written in `x` or `y` — «M(3,y)» (#1039).
   *
   * They are the PLANE's variables, not a point's unknown: `RESERVED_SYMBOLS` keeps them out of the
   * free register, so a point holding one is never sampled and never drawn. Until this code existed
   * the filter dropped the symbol by OMISSION and the line committed, drew nothing and said nothing
   * — a stated given vanishing.
   */
  | { code: 'reserved-coordinate'; detail: string }
  /**
   * A shape noun and a vertex count that disagree — «משולש ABCD», «מפגש התיכונים במרובע ABC» (#1042).
   *
   * Covers both halves: the count the student wrote against the noun they wrote, and the noun
   * against the construct's own arity.
   */
  | { code: 'bad-arity'; detail: string }
  /** One label used for two vertices of the same figure — «משולש ABA» (#1042). */
  | { code: 'repeated-vertex'; detail: string }
  /**
   * A relation whose VERB was understood and whose operand was not — «DE מקביל לפיל» (#1052).
   *
   * Its own code because the student got the sentence shape right: telling them "I did not
   * understand" would send them to rewrite the relation, when the thing to fix is the operand.
   */
  | { code: 'bad-operand'; detail: string };

export type ParseResult = { ok: true; facts: Fact[] } | ({ ok: false } & ParseFailure);

/** A rule's answer: facts, an owned refusal, or `null` for "not my sentence — keep looking". */
type RuleOutcome = ParseResult | null;

const made = (facts: Fact[]): ParseResult => ({ ok: true, facts });
const refuse = (code: ParseFailure['code'], detail: string): ParseResult =>
  ({ ok: false, code, detail }) as ParseResult;

// ---------------------------------------------------------------------------
// Shared tokens — spelled ONCE (the 3-D lesson: a noun gate re-spelled inline drifts)
// ---------------------------------------------------------------------------

/**
 * «נתון» / «נתונה» / «נתונים» / «נתונות», optional.
 *
 * The masculine singular ends in FINAL NUN (ן, U+05DF) and every other form in MEDIAL nun
 * (נ, U+05E0) — so `נתונ(?:ה|ים|ות)?` matches three of the four and silently drops «נתון», which
 * is the commonest of them. This is the `מאונ[ךכ]` class from `src3d` ([src3d/CLAUDE.md] recurring
 * traps) reappearing on a different letter: a Hebrew gate that admits one spelling is a silent
 * drop, and the alternation must be written out.
 */
const HE_GIVEN = '(?:נתו(?:ן|נה|נים|נות)\\s+)?';
/** «הנקודה» / «נקודה» / «הנקודות» / «נקודות», optional — the subject noun. */
const HE_POINT = '(?:ה?נקוד(?:ה|ות)\\s+)?';
/** «הישר» / «ישר». */
const HE_LINE = 'ה?ישר';
/** «המעגל» / «מעגל». */
const HE_CIRCLE = 'ה?מעגל';
/** «שמשוואתו» / «שמשוואתה» / «משוואת» / «שמשוואת» — the "whose equation is" connector. */
const HE_EQ_OF = '(?:ש?משוואת(?:ו|ה)?)';
/** «הוא» / «היא» / «הם» / «הן» — the copula, optional. */
const HE_IS = '(?:\\s*(?:הוא|היא|הם|הן))?';

/** A point/vertex name: a capital letter with an optional digit subscript (`F1`, `D2`). */
const NAME = '[A-Z][0-9]?';
/** A line name: `ℓ`, `ℓ1`, `l`, `l1`, or a two-point run like `AC`. */
const LINE_NAME = '(?:[ℓl][0-9]?|[A-Z][0-9]?[A-Z][0-9]?)';

/**
 * A line name that is TWO POINT NAMES — `AB`, `A1B2` — as opposed to an arbitrary one like `ℓ1`.
 *
 * The distinction is the whole of #1066: an arbitrary name asserts nothing about any point, while a
 * two-point name asserts that the line passes through both of them.
 */
const TWO_POINT_NAME = new RegExp(`^(${NAME})(${NAME})$`);

const trim = (s: string) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Equations
// ---------------------------------------------------------------------------

/**
 * `lhs = rhs` → the residual expression `lhs − rhs`, whose zero set IS the curve. Returns null on
 * anything that is not a single well-formed equation — never a partial reading.
 */
export function equationExpr(src: string): Expr | null {
  const parts = normalizeMath(src).split('=');
  if (parts.length !== 2) return null;
  const a = parseExpr(parts[0]);
  const b = parseExpr(parts[1]);
  if (!a || !b) return null;
  return { kind: 'sub', a, b };
}

// ---------------------------------------------------------------------------
// F11 — parameter declaration (D7 kind 1: a DOMAIN, not a constraint)
// ---------------------------------------------------------------------------

const HE_POSITIVE = /חיובי/;
const HE_NEGATIVE = /שלילי/;
const HE_NONZERO = /שונה\s+מ-?\s*אפס|שונה\s+מ-?\s*0/;
const HE_LESS = /קטן\s+מ-?\s*(-?[0-9.]+)/;
const HE_GREATER = /גדול\s+מ-?\s*(-?[0-9.]+)/;

function parseParamHe(line: string): Fact | null {
  // «a הוא פרמטר חיובי» · «t הוא פרמטר קטן מ-9» · «a הוא פרמטר שונה מאפס» · «a הוא פרמטר»
  const m = line.match(new RegExp(`^([a-zA-Z])${HE_IS}\\s*פרמטר(.*)$`));
  if (!m) return null;
  const sym = m[1];
  const rest = m[2] ?? '';
  const domain: Domain = { ...UNBOUNDED };
  if (HE_POSITIVE.test(rest)) {
    domain.min = 0;
    domain.minOpen = true;
  }
  if (HE_NEGATIVE.test(rest)) {
    domain.max = 0;
    domain.maxOpen = true;
  }
  if (HE_NONZERO.test(rest)) domain.exclude = [0];
  const less = rest.match(HE_LESS);
  if (less) {
    domain.max = Number(less[1]);
    domain.maxOpen = true;
  }
  const greater = rest.match(HE_GREATER);
  if (greater) {
    domain.min = Number(greater[1]);
    domain.minOpen = true;
  }
  return { t: 'param', sym, domain, src: line };
}

function parseParamEn(line: string): Fact | null {
  const m = line.match(/^([a-zA-Z])\s+is\s+a\s+(positive\s+|negative\s+|nonzero\s+)?parameter(.*)$/i);
  if (!m) return null;
  const sym = m[1];
  const flag = (m[2] ?? '').toLowerCase();
  const rest = (m[3] ?? '').toLowerCase();
  const domain: Domain = { ...UNBOUNDED };
  if (flag.startsWith('positive')) {
    domain.min = 0;
    domain.minOpen = true;
  }
  if (flag.startsWith('negative')) {
    domain.max = 0;
    domain.maxOpen = true;
  }
  if (flag.startsWith('nonzero')) domain.exclude = [0];
  const less = rest.match(/less\s+than\s+(-?[0-9.]+)/);
  if (less) {
    domain.max = Number(less[1]);
    domain.maxOpen = true;
  }
  const greater = rest.match(/greater\s+than\s+(-?[0-9.]+)/);
  if (greater) {
    domain.min = Number(greater[1]);
    domain.minOpen = true;
  }
  return { t: 'param', sym, domain, src: line };
}

/** A bare inequality chain: `0 < k < 6`, `a > 0`, `t < 9`, `a ≠ 0`. Language-neutral. */
function parseInequality(line: string): Fact | null {
  const s = normalizeMath(line).replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=');
  const ne = s.match(/^([a-zA-Z])\s*!=\s*(-?[0-9.]+)$/);
  if (ne) return { t: 'param', sym: ne[1], domain: { exclude: [Number(ne[2])] }, src: line };

  const chain = s.match(/^(-?[0-9.]+)\s*(<=?)\s*([a-zA-Z])\s*(<=?)\s*(-?[0-9.]+)$/);
  if (chain) {
    return {
      t: 'param',
      sym: chain[3],
      domain: {
        min: Number(chain[1]),
        minOpen: chain[2] === '<',
        max: Number(chain[5]),
        maxOpen: chain[4] === '<',
      },
      src: line,
    };
  }
  const one = s.match(/^([a-zA-Z])\s*(<=?|>=?)\s*(-?[0-9.]+)$/);
  if (one) {
    const v = Number(one[3]);
    const open = one[2] === '<' || one[2] === '>';
    const domain: Domain = one[2].startsWith('<')
      ? { max: v, maxOpen: open }
      : { min: v, minOpen: open };
    return { t: 'param', sym: one[1], domain, src: line };
  }
  return null;
}

// ---------------------------------------------------------------------------
// F1 — points
// ---------------------------------------------------------------------------

/** `A(2,6)`, `B(-9a, 0)`, `F1(0, 3)` — one or more, comma-separated. */
function parsePoints(line: string): RuleOutcome {
  const body = line
    .replace(new RegExp(`^${HE_GIVEN}${HE_POINT}`), '')
    .replace(/^points?\s+/i, '')
    .trim();
  const re = new RegExp(`(${NAME})\\s*\\(([^()]*)\\)`, 'g');
  const facts: Fact[] = [];
  let seen = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    seen += 1;
    const id = m[1];
    const inside = m[2].split(',');
    if (inside.length !== 2) return null;
    const x = parseExpr(inside[0]);
    const y = parseExpr(inside[1]);
    if (!x || !y) return null;
    /**
     * `x` and `y` name the PLANE, so they cannot also name this point's unknown (#1039).
     *
     * The decision has to be made here, where the sentence is still in front of us. Downstream,
     * `RESERVED_SYMBOLS` filters them out of the free register (`carriers.ts`), which is correct for
     * a curve's equation and silent for a coordinate: the point ends up carrying a symbol nothing
     * will ever sample, so it is `vacant` at every configuration — drawn nowhere, reported as
     * nothing. A filter that drops by omission must be a decision at the point of entry instead.
     */
    if ([...symbolsOf(x), ...symbolsOf(y)].some((s) => RESERVED_SYMBOLS.has(s))) {
      return refuse('reserved-coordinate', line);
    }
    facts.push({ t: 'point', id, x, y, src: line });
  }
  if (seen === 0) return null;
  // Everything outside the matched point runs must be separators only — otherwise the line said
  // something more than "here are points", and half-understanding it would drop a given.
  const leftover = body.replace(new RegExp(`(${NAME})\\s*\\(([^()]*)\\)`, 'g'), '').replace(/[, ו-]/g, '');
  if (leftover.length > 0) return null;
  return made(facts);
}

// ---------------------------------------------------------------------------
// F3/F5/F6 — curves by equation
// ---------------------------------------------------------------------------

interface CurveHit {
  id: Id;
  name: string;
  kind: CurveKind;
  eqSrc: string;
}

/**
 * The circle numeral. Written as an explicit alternation and matched CASE-SENSITIVELY with a
 * following separator, because neither shortcut survives contact with the corpus: a case-insensitive
 * `[IVX]{1,3}` reads the `x` of «the circle x²+y²−2ax−2x=0» as a Roman numeral and swallows it, and a
 * class that admits `X` while the validator does not silently turns a numeral into an anonymous id.
 */
const ROMAN_RUN = '(?:(I|II|III|IV|V)(?=[\\s:]))?';

function matchCurve(line: string): CurveHit | null {
  // --- line: «נתון הישר ℓ1: 4y-3x-20=0» · «משוואת הישר AC היא y=-2x+8» · «הישר x=-4» ---
  const heLineNamed = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_LINE}\\s+(${LINE_NAME})${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heLineNamed) {
    return { id: `line-${heLineNamed[1]}`, name: heLineNamed[1], kind: 'line', eqSrc: heLineNamed[2] };
  }
  /**
   * The NOUN is optional after «משוואת», and the NAME survives — «משוואת AB היא y=2x» (#1072).
   *
   * [02c R6](../../docs/02c-requirements-analytic.md) ruled the shape noun optional for an equation.
   * [ADR-AG-019](../../docs/06c-decisions-analytic.md#adr-ag-019) built the half where the noun AND
   * the name are both dropped (a fully bare `y^2=54x`); this is the commoner half, where the student
   * keeps the name they gave the object and drops only the noun.
   *
   * **The id must match the noun-carrying form exactly**, or the two phrasings become two objects for
   * one line — the duplication [ADR-AG-023](../../docs/06c-decisions-analytic.md#adr-ag-023) removed
   * for anonymous curves, for the same reason: a name is an identity. So the NAME’s own shape says
   * which id to mint, and the corpus is unambiguous about it — a two-point run or the `ℓ` device is a
   * line, a Roman numeral is a circle.
   *
   * The KIND still comes from the fit, per R6: the id records what the student NAMED it, the
   * classifier decides what it IS, and a mismatch is R7’s named refusal.
   */
  const heNamedNoNoun = line.match(
    new RegExp(`^${HE_GIVEN}${HE_EQ_OF}\\s+(${LINE_NAME})${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heNamedNoNoun) {
    return {
      id: `line-${heNamedNoNoun[1]}`,
      name: heNamedNoNoun[1],
      kind: 'line',
      eqSrc: heNamedNoNoun[2],
    };
  }
  /** The same omission in the colon form — «AB: y=2x», «l1: y=2x». */
  const heNamedColon = line.match(new RegExp(`^${HE_GIVEN}(${LINE_NAME}):\\s*(.+)$`));
  if (heNamedColon) {
    return {
      id: `line-${heNamedColon[1]}`,
      name: heNamedColon[1],
      kind: 'line',
      eqSrc: heNamedColon[2],
    };
  }

  const heLineBare = line.match(new RegExp(`^${HE_GIVEN}${HE_LINE}\\s+(.+=.+)$`));
  if (heLineBare) {
    return { id: `curve-${anonIndex(heLineBare[1])}`, name: '', kind: 'line', eqSrc: heLineBare[1] };
  }
  const enLine = line.match(new RegExp(`^(?:the\\s+)?line\\s+(${LINE_NAME})\\s*:?\\s*(?:is\\s+)?(.+)$`, 'i'));
  if (enLine) return { id: `line-${enLine[1]}`, name: enLine[1], kind: 'line', eqSrc: enLine[2] };
  const enLineBare = line.match(/^(?:the\s+)?line\s+(.+=.+)$/i);
  if (enLineBare) {
    return { id: `curve-${anonIndex(enLineBare[1])}`, name: '', kind: 'line', eqSrc: enLineBare[1] };
  }

  /** The circle numeral with the noun dropped — «משוואת I היא x^2+y^2=9» (#1072). */
  const heCircleNoNoun = line.match(
    new RegExp(`^${HE_GIVEN}${HE_EQ_OF}\\s+(I|II|III|IV|V)${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircleNoNoun) {
    return {
      id: `circle-${heCircleNoNoun[1]}`,
      name: `מעגל ${heCircleNoNoun[1]}`,
      kind: 'circle',
      eqSrc: heCircleNoNoun[2],
    };
  }

  // --- circle: «נתון מעגל I שמשוואתו …» · «משוואת המעגל …» ---
  const heCircle = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_CIRCLE}\\s*${ROMAN_RUN}\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircle) {
    const roman = heCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `curve-${anonIndex(heCircle[2])}`,
      name: roman ? `מעגל ${roman}` : '',
      kind: 'circle',
      eqSrc: heCircle[2],
    };
  }
  const enCircle = line.match(new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s*${ROMAN_RUN}\\s*:?\\s*(?:is\\s+)?(.+)$`));
  if (enCircle) {
    const roman = enCircle[1] ?? '';
    return {
      id: roman ? `circle-${roman}` : `curve-${anonIndex(enCircle[2])}`,
      name: roman ? `circle ${roman}` : '',
      kind: 'circle',
      eqSrc: enCircle[2],
    };
  }

  /**
   * Conics are anonymous (D6 — the corpus never names them), so the id comes from the EQUATION,
   * exactly as it already did for an unnamed line or circle (#1026).
   *
   * The fixed ids `parabola` / `ellipse` made two DIFFERENT parabolas collide on one name, and the
   * collision was then reported as a policy («a figure holds one parabola and one ellipse») that
   * nothing had actually decided — an id collision wearing a policy's clothes. A content id keeps
   * the M1 absorb working (restating the same equation is still one object, which is what lets a
   * later section of a question re-state an earlier given) while a different equation is a
   * different object, because it is one.
   *
   * The namespace is `curve-`, shared with every other unnamed curve, because an anonymous curve is
   * identified by its EQUATION and nothing else ([02c R44](../../docs/02c-requirements-analytic.md)).
   * A kind prefix here would put «נתונה פרבולה שמשוואתה y^2=54x» and the bare «y^2=54x» in different
   * namespaces, and the figure would hold two objects for one parabola — exactly the duplication
   * #1037 removed for lines and circles.
   */
  const heParabola = line.match(new RegExp(`^${HE_GIVEN}ה?פרבולה(?:\\s+קנונית)?\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`));
  if (heParabola) return { id: `curve-${anonIndex(heParabola[1])}`, name: '', kind: 'parabola', eqSrc: heParabola[1] };
  const enParabola = line.match(/^(?:the\s+)?(?:canonical\s+)?parabola\s*:?\s*(?:is\s+)?(.+)$/i);
  if (enParabola) return { id: `curve-${anonIndex(enParabola[1])}`, name: '', kind: 'parabola', eqSrc: enParabola[1] };

  const heEllipse = line.match(new RegExp(`^${HE_GIVEN}ה?אליפסה(?:\\s+קנונית)?\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`));
  if (heEllipse) return { id: `curve-${anonIndex(heEllipse[1])}`, name: '', kind: 'ellipse', eqSrc: heEllipse[1] };
  const enEllipse = line.match(/^(?:the\s+)?(?:canonical\s+)?ellipse\s*:?\s*(?:is\s+)?(.+)$/i);
  if (enEllipse) return { id: `curve-${anonIndex(enEllipse[1])}`, name: '', kind: 'ellipse', eqSrc: enEllipse[1] };

  return null;
}

/** A stable id for an unnamed object: derived from its own equation, so re-stating it is idempotent. */
function anonIndex(eqSrc: string): string {
  const s = normalizeMath(eqSrc).replace(/\s+/g, '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `anon${Math.abs(h).toString(36)}`;
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Derived points, segments and polygons over STATED vertices (#1028)
// ---------------------------------------------------------------------------

/** Two or more point names running together — `AB`, `ABC`, `ABCD`. */
const NAME_RUN = `(?:${NAME})+`;

const splitNames = (run: string): string[] => run.match(/[A-Z][0-9]?/g) ?? [];

/**
 * The concurrency points, keyed by the role noun the corpus uses.
 *
 * Each entry says how many vertices the construct needs, so a miscounted statement
 * («מפגש התיכונים במרובע ABCD») is refused rather than quietly reading the first three.
 */
const ROLES: Array<{ he: RegExp; en: RegExp; t: DerivedRule['t']; n: number }> = [
  { he: /ה?תיכונים/, en: /centroid|medians/i, t: 'centroid', n: 3 },
  { he: /חוצי\s+ה?זוויות/, en: /incent(?:re|er)|angle\s+bisectors/i, t: 'incentre', n: 3 },
  { he: /ה?גבהים/, en: /orthocent(?:re|er)|altitudes/i, t: 'orthocentre', n: 3 },
  { he: /ה?אנכים\s+ה?אמצעיים/, en: /circumcent(?:re|er)|perpendicular\s+bisectors/i, t: 'circumcentre', n: 3 },
  { he: /ה?אלכסונים/, en: /diagonals/i, t: 'diagonals', n: 4 },
];

/** `M אמצע AB` · `M הוא אמצע הצלע AB` · `M is the midpoint of AB`. The corpus's commonest construct. */
const MIDPOINT_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*אמצע\\s+(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})$`,
);
const MIDPOINT_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+midpoint\\s+of\\s+(?:segment\\s+|side\\s+)?(${NAME})(${NAME})$`,
  'i',
);

/** `M מפגש התיכונים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD`. */
const CONCURRENCY_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מפגש\\s+(.+?)\\s+ב-?\\s*(?:ה?(משולש|מרובע)\\s+)?(${NAME_RUN})$`,
);
const CONCURRENCY_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+(?:intersection\\s+of\\s+the\\s+)?(.+?)\\s+of\\s+(?:(triangle|quadrilateral)\\s+)?(${NAME_RUN})$`,
  'i',
);

/**
 * How many vertices each shape noun asserts. The noun is CAPTURED rather than skipped (#1042),
 * because a noun the parser cannot see is a noun it cannot check: «משולש ABCD» built a four-sided
 * "triangle" and «מפגש התיכונים במרובע ABC» built a centroid from a "quadrilateral" of three
 * points — the student's own word contradicted the figure and nothing said so.
 */
const SHAPE_ARITY: ReadonlyArray<{ re: RegExp; n: number }> = [
  { re: /^(?:משולש|triangle)$/i, n: 3 },
  { re: /^(?:מרובע|quadrilateral)$/i, n: 4 },
];

const arityOf = (noun: string | undefined): number | null =>
  noun ? (SHAPE_ARITY.find((s) => s.re.test(noun))?.n ?? null) : null;

/** A label naming two different vertices of one figure is not a figure — «משולש ABA» (#1042). */
const hasRepeat = (v: readonly string[]): boolean => new Set(v).size !== v.length;

function parseDerived(line: string): RuleOutcome {
  const mid = MIDPOINT_HE.exec(line) ?? MIDPOINT_EN.exec(line);
  if (mid) {
    const [, id, a, b] = mid;
    if (a === b) return refuse('repeated-vertex', line); // «M אמצע AA» is a point, not a segment
    return made([{ t: 'derived', id, rule: { t: 'midpoint', a, b }, src: line }]);
  }

  const con = CONCURRENCY_HE.exec(line) ?? CONCURRENCY_EN.exec(line);
  if (con) {
    const [, id, roleSrc, noun, run] = con;
    const role = ROLES.find((r) => r.he.test(roleSrc) || r.en.test(roleSrc));
    if (!role) return null; // an unknown role noun is not this rule's business — let it fall through
    const v = splitNames(run);
    /**
     * Three ways this sentence can be wrong about its own vertices, and all three were falling
     * through to `not-handled` or, worse, building (#1042):
     *
     *  - the count disagrees with the CONSTRUCT — «מפגש התיכונים במשולש ABCD» (a centroid takes 3);
     *  - the count disagrees with the NOUN the student wrote — the noun was skipped by the regex,
     *    so «מפגש התיכונים במרובע ABC» built a centroid and silently ignored the word «מרובע»;
     *  - a label repeats.
     *
     * The first two are one refusal to the student ("the vertices and the shape do not agree") and
     * two different mistakes in the code, which is why both are checked here rather than only the
     * one the reported case happened to hit.
     */
    const stated = arityOf(noun);
    if (v.length !== role.n || (stated !== null && stated !== role.n)) {
      return refuse('bad-arity', line);
    }
    if (hasRepeat(v)) return refuse('repeated-vertex', line);
    const rule: DerivedRule =
      role.t === 'diagonals'
        ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
        : { t: role.t, v: [v[0], v[1], v[2]] } as DerivedRule;
    return made([{ t: 'derived', id, rule, src: line }]);
  }

  return null;
}

/**
 * Shape nouns that carry NO constraint of their own — a triangle is three points and their sides,
 * a quadrilateral four.
 *
 * `מקבילית` / `טרפז` / `ריבוע` are deliberately NOT here: each carries a given (AB ∥ DC, four equal
 * sides) that this slice cannot honour, and drawing one as a plain ring of sides would silently drop
 * a stated given — the one thing the root CLAUDE.md says may never happen. They are refused by name
 * below, which is a refusal the product OWNS rather than a question outsourced to the LLM
 * ([ADR-3D-214](../../docs/06b-decisions-3d.md#adr-3d-214) D2).
 */
const NEUTRAL_SHAPE_HE = new RegExp(`^${HE_GIVEN}ה?(משולש|מרובע)\\s+(${NAME_RUN})$`);
const NEUTRAL_SHAPE_EN = new RegExp(`^(triangle|quadrilateral)\\s+(${NAME_RUN})$`, 'i');
const CONSTRAINED_SHAPE = /^(?:נתו(?:ן|נה)\s+)?ה?(?:מקבילית|טרפז|ריבוע|מעוין|מלבן)\s|^(?:parallelogram|trapezoid|trapezium|square|rhombus|rectangle)\s/i;

const SEGMENT_HE = new RegExp(`^${HE_GIVEN}ה?(?:קטע|צלע)\\s+(${NAME})(${NAME})$`);
const SEGMENT_EN = new RegExp(`^(?:segment|side)\\s+(${NAME})(${NAME})$`, 'i');

/**
 * A segment's id is CANONICAL — «הקטע AB» and «הקטע BA» are one object, so they must be one id.
 *
 * Deterministic ids are what make re-issuing a statement idempotent (root CLAUDE.md), and M1's
 * absorb is keyed on the id: without canonicalisation the undirected comparison in `apply` is never
 * even reached, and the same segment draws twice.
 */
const segmentId = (a: string, b: string) => `seg-${[a, b].sort().join('')}`;

/**
 * A polygon's id is canonical over the ROTATIONS and REFLECTIONS of its vertex ring, which are
 * exactly the rewritings that name the same figure: `ABCD`, `BCDA` and `ADCB` are one
 * quadrilateral, while `ABDC` is a genuinely different one and keeps its own id.
 *
 * The lexicographically smallest rotation of the ring and of its reverse — the standard canonical
 * form for a cycle, and the only one that is correct for n > 3 as well as for triangles.
 */
function polygonId(vertices: string[]): string {
  const rings: string[][] = [];
  for (const base of [vertices, [...vertices].reverse()]) {
    for (let i = 0; i < base.length; i += 1) rings.push([...base.slice(i), ...base.slice(0, i)]);
  }
  const best = rings.map((r) => r.join('')).sort()[0];
  return `poly-${best}`;
}

function parseShape(line: string): RuleOutcome {
  const seg = SEGMENT_HE.exec(line) ?? SEGMENT_EN.exec(line);
  if (seg) {
    const [, a, b] = seg;
    if (a === b) return refuse('repeated-vertex', line); // «הקטע AA» has no length to draw
    return made([{ t: 'segment', id: segmentId(a, b), a, b, src: line }]);
  }

  const poly = NEUTRAL_SHAPE_HE.exec(line) ?? NEUTRAL_SHAPE_EN.exec(line);
  if (poly) {
    const [, noun, run] = poly;
    const vertices = splitNames(run);
    // The noun the student wrote is the assertion to check against — `< 3` only ever caught the
    // shapeless case and let «משולש ABCD» through as a four-sided triangle (#1042).
    const stated = arityOf(noun);
    if (vertices.length < 3 || (stated !== null && vertices.length !== stated)) {
      return refuse('bad-arity', line);
    }
    if (hasRepeat(vertices)) return refuse('repeated-vertex', line);
    return made([{ t: 'polygon', id: polygonId(vertices), vertices, src: line }]);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Constraints and cevians (#1034, #1047, #1033) — the «lines and points» givens
// ---------------------------------------------------------------------------

/**
 * `שטח המשולש ABC הוא 20` — the corpus's commonest PIN (~10 of 40 exercises in 02c §8).
 *
 * The noun is optional and so is the definite article, per the morphology rule this tree keeps
 * relearning: «משולש» / «המשולש» / «משולש ABC ששטחו 20» all name the same thing.
 */
const AREA_HE = new RegExp(
  `^${HE_GIVEN}שטח\\s+(?:ה?משולש|ה?מרובע|ה?מצולע)?\\s*(${NAME_RUN})${HE_IS}\\s*(?:שווה\\s+ל-?)?\\s*(.+)$`,
);
const AREA_EN = new RegExp(
  `^(?:the\\s+)?area\\s+of\\s+(?:triangle\\s+|quadrilateral\\s+|polygon\\s+)?(${NAME_RUN})\\s+is\\s+(.+)$`,
  'i',
);

/**
 * `AD תיכון לצלע BC` · `AD גובה לצלע BC` — a named cevian (#1047).
 *
 * NOT the construction decoration of ADR-AG-014: that is anonymous scaffolding attached to a derived
 * point, while this is an object the student named, measures, and makes the subject of the next
 * sentence. Same geometry, opposite status.
 */
const CEVIAN_HE = new RegExp(
  `^${HE_GIVEN}(${NAME})(${NAME})${HE_IS}\\s*(?:ה?)(תיכון|גובה)\\s+(?:ל|אל\\s+ה?)?(?:ה?צלע\\s+)?(${NAME})(${NAME})(?:\\s+ב?ה?משולש\\s+${NAME_RUN})?$`,
);
const CEVIAN_EN = new RegExp(
  `^(${NAME})(${NAME})\\s+is\\s+(?:the\\s+)?(median|altitude)\\s+to\\s+(?:side\\s+)?(${NAME})(${NAME})(?:\\s+in\\s+triangle\\s+${NAME_RUN})?$`,
  'i',
);

/** `B נמצא על ציר ה-x` / `B על החלק החיובי של ציר x` — incidence, optionally with a side selector. */
const ON_AXIS_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת)?\\s+)?על\\s+(?:ה?חלק\\s+(ה?חיובי|ה?שלילי)\\s+של\\s+)?ציר\\s+ה?-?\\s*([xy])$`,
);
const ON_AXIS_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+on\\s+the\\s+(?:(positive|negative)\\s+)?([xy])-axis$`,
  'i',
);

// ---------------------------------------------------------------------------
// The relation vocabulary (#1052, #1051) — one resolver, one relation
// ---------------------------------------------------------------------------

/**
 * A DIRECTION phrase → a {@link Direction}, or `null` if the phrase does not name one.
 *
 * This is the whole design (#1052). «DE», «הצלע AB», «הקטע AB», «ציר ה-x» and «הישר l1» are five
 * spellings of "a thing with a direction", so they are resolved ONCE here and every rule that relates
 * directions — parallel, perpendicular, slope, and the shape nouns that lower to them — consumes the
 * result without learning what kind of phrase produced it. Sixteen operand pairs, one implementation.
 *
 * The noun and the definite article are optional throughout, as everywhere else in this grammar.
 */
const AXIS_HE = /^ציר\s+ה?-?\s*([xy])$/;
const AXIS_EN = /^(?:the\s+)?([xy])[- ]axis$/i;
/** «הישר l1» / «ישר ℓ2» / «l1» — a line the student NAMED, whose direction comes from its equation. */
const NAMED_LINE = new RegExp(`^(?:ה?ישר\\s+|[Ll]ine\\s+)?([ℓl][0-9]?)$`);
/** «הצלע AB» / «הקטע AB» / «הישר AB» / «AB» — two named points, whichever noun fronts them. */
/**
 * The noun in front of a point pair is optional and may be Hebrew or English. Spelled out rather than
 * flagged `i`, because `NAME` is deliberately uppercase-only and a case-insensitive whole-pattern
 * would quietly start accepting `ab` as two vertices.
 */
const TWO_POINTS = new RegExp(
  `^(?:ה?(?:צלע|קטע|ישר)\\s+|[Ss]ide\\s+|[Ss]egment\\s+|[Ll]ine\\s+)?(${NAME})(${NAME})$`,
);

function direction(phrase: string): Direction | null {
  const p = trim(phrase).replace(/^ה(?=ישר|צלע|קטע)/, 'ה'); // keep the article; normalise spacing only
  const axis = AXIS_HE.exec(p) ?? AXIS_EN.exec(p);
  if (axis) return { k: 'axis', axis: axis[1].toLowerCase() === 'x' ? 'x' : 'y' };
  const named = NAMED_LINE.exec(p);
  if (named) return { k: 'curve', id: `line-${named[1]}` };
  const pts = TWO_POINTS.exec(p);
  // A two-letter run reads as its two POINTS even when fronted by «הישר», and that is deliberate:
  // «הישר AC» relates the direction A→C whether or not a `line-AC` object was ever stated, so the
  // sentence means the same thing before and after the line is given a name.
  if (pts && pts[1] !== pts[2]) return { k: 'points', a: pts[1], b: pts[2] };
  return null;
}

/**
 * «DE מקביל ל-BF» · «הצלע AB מאונכת לצלע BC» · «AB מקביל לציר ה-x» · «DE is parallel to BF».
 *
 * The synonym sets are written out rather than stemmed — this tree's recurring trap is a Hebrew gate
 * that admits one spelling and silently drops the rest (`src-analytic/CLAUDE.md`). Both relations take
 * the full gender/number run, the definite article is optional, and so is the hyphen after «ל».
 */
const PARALLEL_WORDS = 'מקביל(?:ה|ים|ות)?';
const PERP_WORDS = '(?:מאונכ(?:ת|ים|ות)?|מאונך|ניצב(?:ת|ים|ות)?)';
const RELATION_HE = new RegExp(
  `^${HE_GIVEN}(.+?)\\s+(${PARALLEL_WORDS}|${PERP_WORDS})\\s+ל-?\\s*(.+)$`,
);
const RELATION_EN = /^(.+?)\s+(?:is\s+)?(parallel|perpendicular)\s+to\s+(.+)$/i;

/** «שיפוע AB הוא 2» · «שיפוע הישר l1 הוא 2» · «השיפוע של הצלע AB הוא ½» · «the slope of AB is 2». */
/**
 * The copula is REQUIRED here, unlike almost everywhere else in this grammar.
 *
 * With it optional, the lazy operand group takes the shortest thing that lets the rest match — «שיפוע
 * AB הוא 2» resolved its operand to `A` and its value to `B הוא 2`, and the refusal then complained
 * about an operand the student had written perfectly. A separator that can be omitted is fine when
 * what follows is unmistakable; here both sides are free text, so something has to divide them.
 */
const SLOPE_HE = new RegExp(
  `^${HE_GIVEN}ה?שיפוע\\s+(?:של\\s+)?(.+?)\\s+(?:הוא|היא|שווה(?:\\s+ל-?)?)\\s*(-?\\S.*)$`,
);
const SLOPE_EN = /^(?:the\s+)?slope\s+of\s+(.+?)\s+is\s+(.+)$/i;

/**
 * `AB = 10` · `AB = AC` · `AB + BC = 10` · `AB + BC = DE` · `AB = 4√5` · `2·AB = 3·CD` (#1050).
 *
 * An equation between two expressions over LENGTHS, which is a shape no other constraint has: every
 * other kind is a fixed-arity relation, and neither side of this one has an arity the grammar fixes.
 *
 * **The collision this has to survive.** `AB` is a length here and a LINE NAME elsewhere —
 * «משוואת הישר AB היא y=2x» is corpus vocabulary too. The disambiguation is position, not tokens:
 * this rule runs inside `parseConstraint`, which `parseLine` reaches only AFTER `matchCurve`, so any
 * sentence carrying a curve noun is already spoken for. That ordering is the whole guard, and it is
 * asserted rather than assumed — this tree has twice been bitten by a token class eating real input
 * ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)).
 *
 * A side with no length token at all is a plain number (`10`, `4√5`); a sentence with NO length on
 * either side is not this rule’s business and falls through untouched.
 */
const LENGTH_EQ = /^(?:נתון\s+כי\s+|נתון\s+)?(.+?)\s*=\s*(.+)$/;
function parseConstraint(line: string): RuleOutcome {
  /**
   * The relation rules run FIRST among the constraints (#1052).
   *
   * «הצלע AB מקבילה לצלע DC» would otherwise be read by whichever noun rule matched «הצלע AB» and
   * the rest handed away — the same swallowing defect #1059 records for the circle and line gates.
   * A relation is recognisable from its verb, which no other rule uses, so matching it early costs
   * nothing and removes the ambiguity entirely.
   */
  const rel = RELATION_HE.exec(line) ?? RELATION_EN.exec(line);
  if (rel) {
    const [, left, word, right] = rel;
    const u = direction(left);
    const v = direction(right);
    // The verb was understood; if an operand was not, that is an OWNED refusal about this sentence
    // rather than a fall-through to "I did not understand you" (ADR-AG-017).
    if (!u || !v) return refuse('bad-operand', line);
    const parallel = /^מקביל|^parallel/i.test(word);
    return made([
      { t: 'constraint', k: { t: 'relation', rel: parallel ? 'parallel' : 'perpendicular', u, v }, src: line },
    ]);
  }

  const slope = SLOPE_HE.exec(line) ?? SLOPE_EN.exec(line);
  if (slope) {
    const u = direction(slope[1]);
    if (!u) return refuse('bad-operand', line);
    const value = parseExpr(normalizeMath(slope[2]));
    if (!value) return refuse('bad-equation', trim(slope[2]));
    return made([{ t: 'constraint', k: { t: 'slope', u, value }, src: line }]);
  }


  const lengthEq = LENGTH_EQ.exec(line);
  if (lengthEq) {
    const left = parseLengthExpr(lengthEq[1]);
    const right = parseLengthExpr(lengthEq[2]) ?? constantLengthExpr(lengthEq[2]);
    // At least ONE side must mention a length, or this is an ordinary equation (`y=2x`) that the
    // bare-equation branch reads far better than we would.
    if (left && right) {
      return made([{ t: 'constraint', k: { t: 'length-eq', left, right }, src: line }]);
    }
  }
  const area = AREA_HE.exec(line) ?? AREA_EN.exec(line);
  if (area) {
    const ids = splitNames(area[1]);
    const value = parseExpr(normalizeMath(area[2]));
    // The same class as the shape nouns (#1042): this rule recognised its own sentence, so a
    // figure with too few vertices or an unreadable value is answered rather than handed to
    // `not-handled` as if the sentence were unintelligible.
    if (ids.length < 3) return refuse('bad-arity', line);
    if (hasRepeat(ids)) return refuse('repeated-vertex', line);
    if (!value) return refuse('bad-equation', trim(area[2]));
    return made([{ t: 'constraint', k: { t: 'area', ids, value }, src: line }]);
  }

  const cev = CEVIAN_HE.exec(line) ?? CEVIAN_EN.exec(line);
  if (cev) {
    const [, apex, foot, roleSrc, u, v] = cev;
    const median = /תיכון|median/i.test(roleSrc);
    if (u === v) return refuse('repeated-vertex', line); // «AD תיכון לצלע BB» names no side
    return made([
      // The sentence NAMES the foot — «AD תיכון לצלע BC» is where `D` first appears — so it is
      // declared here. Without this the segment below would refuse it as an unknown reference, which
      // is right for a sentence that merely mentions a point and wrong for one that introduces it.
      { t: 'declare', id: apex, src: line },
      { t: 'declare', id: foot, src: line },
      // The cevian's own segment, so «AD» is a thing on the canvas and not only a relation.
      { t: 'segment', id: segmentId(apex, foot), a: apex, b: foot, src: line },
      median
        ? { t: 'constraint', k: { t: 'midpoint', id: foot, a: u, b: v }, src: line }
        : { t: 'constraint', k: { t: 'perpendicular', a: apex, b: foot, c: u, d: v }, src: line },
    ]);
  }

  const ax = ON_AXIS_HE.exec(line) ?? ON_AXIS_EN.exec(line);
  if (ax) {
    const [, id, sideSrc, axis] = ax;
    // ON the axis is an INCIDENCE; the «positive part» clause is a SELECTOR over the solutions —
    // D7's two different kinds in one sentence (ADR-AG-005). The incidence is emitted here; the
    // selector rides as a domain on the surviving coordinate and is applied after the solve.
    const onX = axis.toLowerCase() === 'x';
    const k: Constraint = onX
      ? { t: 'on-line', id, a: 0, b: 1, c: 0 }
      : { t: 'on-line', id, a: 1, b: 0, c: 0 };
    const facts: Fact[] = [{ t: 'constraint', k, src: line }];
    if (sideSrc) {
      const positive = /חיובי|positive/i.test(sideSrc);
      facts.push({ t: 'selector', id, axis: onX ? 'x' : 'y', positive, src: line });
    }
    return made(facts);
  }

  return null;
}

export function parseLine(raw: string): ParseResult {
  const line = trim(raw);
  if (!line) return { ok: false, code: 'not-handled', detail: raw };

  const param = parseParamHe(line) ?? parseParamEn(line) ?? parseInequality(line);
  if (param) return { ok: true, facts: [param] };

  const curve = matchCurve(line);
  /**
   * A noun gate may not claim the rest of the line unconditionally (#1059).
   *
   * Every branch of `matchCurve` ends in `(.+)` and calls it the equation. That is right for
   * «נתון הישר ℓ1: 4y-3x-20=0» and wrong for «הישר DE מקביל לישר BF», where the rule recognised only
   * the NOUN and then reported «לא הצלחתי לקרוא את המשוואה» about a sentence containing no equation —
   * sending the student to hunt for a typo in an equation they never wrote.
   *
   * **The discriminator is that the tail contains no HEBREW.** An equation in this grammar is written
   * in Latin variables, digits and operators; a Hebrew word in the tail means the sentence continued
   * in prose and the noun rule has no claim on it.
   *
   * "Contains an `=`" was the obvious test and it is wrong — caught by this tree's own existing lock.
   * «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2» is a TRUNCATED equation with no `=` in it, and that student
   * must be told their equation is unreadable, not that the sentence was not understood. The two
   * failures look alike and want opposite answers, and only the Hebrew test separates them.
   *
   * NOTE: this is the swallowing half of #1059. The other half — that «מעגל O» names a CENTRE, per
   * the operator's 2026-09-15 ruling — belongs with the circle-by-centre object #1060 needs, and is
   * deliberately not done here.
   */
  if (curve && /[֐-׿]/.test(curve.eqSrc)) {
    // fall through: the noun matched, the tail is not an equation, so this rule has no claim
  } else if (curve) {
    const eq = equationExpr(curve.eqSrc);
    if (!eq) return { ok: false, code: 'bad-equation', detail: trim(curve.eqSrc) };
    /**
     * A line NAMED BY TWO POINTS is a statement about those points (#1066).
     *
     * «הישר ℓ1» is an arbitrary name and asserts nothing. **«הישר AB» asserts that the line passes
     * through A and through B** — the name is a geometric claim. Minting a curve whose id merely
     * happened to read `line-AB` left the figure holding a line that missed both points, and with
     * both points already placed the tool accepted it in silence.
     *
     * Operator ruling, 2026-09-15: when A and B do not exist yet, **introduce them, with DOF** —
     * matching the shape nouns (ADR-AG-013), because a line named by two points is naming them
     * rather than mentioning them in passing. `declare` leaves each a 2-DOF free vertex and the two
     * incidences take one each, so the figure sits at 2 DOF and the points slide along the line.
     *
     * Every piece of this already existed: `declare` (the cevian rule), the `free` kind (#1017) and
     * the incidence. The defect was never missing geometry — it was a name nothing was checking.
     */
    const named = curve.kind === 'line' ? TWO_POINT_NAME.exec(curve.name) : null;
    const through: Fact[] = named
      ? [
          { t: 'declare', id: named[1], src: line },
          { t: 'declare', id: named[2], src: line },
          { t: 'constraint', k: { t: 'on-curve', id: named[1], curve: curve.id }, src: line },
          { t: 'constraint', k: { t: 'on-curve', id: named[2], curve: curve.id }, src: line },
        ]
      : [];
    return {
      ok: true,
      facts: [
        {
          t: 'curve',
          id: curve.id,
          label: { name: curve.name, kind: curve.kind },
          curve: { kind: curve.kind, eq },
          src: line,
        },
        ...through,
      ],
    };
  }

  /**
   * Each rule answers one of three ways: facts, an owned refusal, or `null` for "not my sentence".
   * Only the third continues the chain — a rule that recognised the sentence and found it wrong
   * gets the last word, rather than having its refusal overwritten by `not-handled` downstream.
   */
  const matched =
    parseConstraint(line) ?? parseDerived(line) ?? parseShape(line) ?? parsePoints(line);
  if (matched) return matched;

  // Recognised and deliberately unsupported: a constrained shape noun carries a given this slice
  // cannot honour, so it is refused BY NAME rather than escalated as if we did not understand it.
  if (CONSTRAINED_SHAPE.test(line)) return { ok: false, code: 'out-of-scope', detail: line };

  /**
   * F3/F5/F6 WITHOUT the noun — `x-y+2=0`, `y^2=54x`, `(x-3)^2+(y-4)^2=9` (#1037).
   *
   * [02c R6](../../docs/02c-requirements-analytic.md) (operator ruling, 2026-09-04) made the shape
   * noun **optional for an equation and load-bearing for a shape**, "because the fit already knows
   * the kind" — and `y^2=54x` is the requirement's own example. It was ruled and never implemented:
   * every `matchCurve` branch is gated on a noun or a name, so a bare equation fell through every
   * rule to `not-handled` and escalated to the paid LLM as though we had not understood a sentence
   * we understand perfectly. The corpus writes figures this way — image 6 gives a triangle as
   * `4x+3y=0`, `12x-5y=0`, `x=15` — and it is the shortest thing a student can type.
   *
   * **It runs LAST, after every named form, parameter declaration, inequality, shape, derived point
   * and coordinate has had first refusal.** The issue placed it "last in `matchCurve`", but
   * `matchCurve` itself runs before the point and shape rules, and the protection this branch needs
   * is precisely that those rules answer first.
   *
   * **The discriminator is that the equation is in the PLANE's variables**, read off the PARSED
   * expression's symbol set rather than by looking for an `x` in the text. That distinction is the
   * whole defence, and it is the `[IVX]` Roman-numeral trap on a new letter
   * ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)): a branch that matched anything
   * containing `=` would eat `AB = 4√5` (a metric given) and `x_A = 5` (the component form). Measured
   * against those rather than reasoned about — `AB = 4√5` parses to the symbols `A` and `B`, which
   * are not the plane's, and `x_A = 5` does not parse as an equation at all.
   *
   * No kind is claimed: `classify` fits the six coefficients and names the family, and a bare
   * hyperbola or rotated conic is still refused BY NAME at evaluation
   * ([ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008)).
   */
  const bare = equationExpr(line);
  if (bare && symbolsOf(bare).some((s) => RESERVED_SYMBOLS.has(s))) {
    return {
      ok: true,
      facts: [
        {
          t: 'curve',
          id: `curve-${anonIndex(line)}`,
          label: { name: '' },
          curve: { eq: bare },
          src: line,
        },
      ],
    };
  }

  return { ok: false, code: 'not-handled', detail: line };
}
