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
import { constantLengthExpr, parseLengthExpr, type LengthExpr } from '../engine/lengths';
import { UNBOUNDED, type CurveKind, type Domain, type Fact, type Id } from '../engine/types';
import { EN_SHAPE, normalizeShapeNoun, rightAngleAt, shapeRow } from '../engine/shapes';

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
/**
 * The optional subject noun before a point's name.
 *
 * `קדקוד` is the EXAM's own word for a vertex (#1127), and it belongs here rather than inline at
 * any call site: this tree's stated rule is that a noun gate re-spelled inline drifts, and it has paid
 * for that three times. One alternation, and every construct that admits a point gains the spelling.
 */
const HE_POINT = '(?:ה?(?:נקוד(?:ה|ות)|קדקוד)\\s+)?';
/** «הישר» / «ישר». */
/**
 * The line NOUNS — «הישר AC», and «האלכסון AC», which is the same object (#1070).
 *
 * «משוואת האלכסון AC היא y=2x» failed while «משוואת הישר AC היא y=2x» worked, and the two say the
 * identical thing: a diagonal of a quadrilateral IS the line through those two vertices. So this is
 * a noun the line rule did not accept, not a new construct — and adding it here means the diagonal
 * inherits ADR-AG-026 (the name is a claim: A and C are ON that line) rather than re-deriving it.
 */
const HE_LINE = 'ה?(?:ישר|אלכסון)';
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
  /**
   * The letter the student gave as this circle`s CENTRE — «מעגל O שמשוואתו …» (#1059).
   *
   * Operator ruling, 2026-09-15: *"«מעגל O» means the center letter is O"*. So the letter names a
   * POINT, not the curve, and the curve keeps the anonymous content-derived id a bare equation
   * would have given it — which is also what stops `O` colliding with the circle in the id space.
   */
  centre?: Id;
}

/**
 * The circle numeral. Written as an explicit alternation and matched CASE-SENSITIVELY with a
 * following separator, because neither shortcut survives contact with the corpus: a case-insensitive
 * `[IVX]{1,3}` reads the `x` of «the circle x²+y²−2ax−2x=0» as a Roman numeral and swallows it, and a
 * class that admits `X` while the validator does not silently turns a numeral into an anonymous id.
 */
/** The numerals themselves, for the lookahead that keeps a NAME from eating one (#1059). */
const ROMAN_LETTERS = '(?:I|II|III|IV|V)';
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
  /**
   * The same omission in the colon form — «AB: y=2x», «l1: y=2x».
   *
   * IT MUST DECLINE, NOT REFUSE, WHEN THE TAIL IS NOT AN EQUATION (#1123).
   *
   * `LINE_NAME`'s second alternative is a two-point run, so «AC:» matches as a line name and this rule
   * claimed everything after the colon as that line's equation. «AC:CB = 3:2» was therefore answered
   * `bad-equation` quoting **`CB = 3:2`** — a string that appears nowhere in what the student typed,
   * manufactured by cutting their sentence at the first colon. `parseLine` stops there, so no later rule
   * ever saw it, and the figure drew `C` wherever the sampler put it while the given vanished.
   *
   * That breaks both honesty invariants at once: an error names the conflicting STATEMENT, never
   * internal state; and no stated magnitude is ever dropped.
   *
   * **This is the fourth instance of one class**, three of them documented in this same file:
   * `[IVX]{1,3}` with an `i` flag eating a circle equation's `x` (ADR-AG-006); a case-insensitive
   * `LINE_NAME` reading the `th` of *"the line through P"* (#1093 — the same alternative as here); and
   * `HAS_A_WORD` drawing «my answer = x» as a line (#1068). **A rule recognises a PREFIX, claims the
   * remainder unconditionally, then refuses on the student's behalf.** Each prior fix narrowed one
   * discriminator; this branch never had one.
   *
   * The discriminator is the one the bare-equation branch already uses at the bottom of this file: the
   * tail must parse as an equation AND mention the PLANE's own variables. Declining is right *here
   * specifically* because the bare-colon form carries **no noun** — «נתון הישר AB: …» has evidence the
   * student meant an equation and must keep refusing loudly (the #1059 ruling, which the
   * truncated-equation lock rides on). This form has no such evidence.
   *
   * Special-casing a `p:q` tail would leave the class alive for every other `XY:<not-an-equation>`
   * sentence — the patch tripwire docs/17 names.
   */
  const heNamedColon = line.match(new RegExp(`^${HE_GIVEN}(${LINE_NAME}):\\s*(.+)$`));
  if (heNamedColon) {
    const tail = heNamedColon[2];
    const colonEq = tail.includes('=') ? equationExpr(tail) : null;
    if (colonEq && symbolsOf(colonEq).some((sym) => RESERVED_SYMBOLS.has(sym))) {
      return {
        id: `line-${heNamedColon[1]}`,
        name: heNamedColon[1],
        kind: 'line',
        eqSrc: tail,
      };
    }
    // Not an equation in the plane's variables — this rule has no claim on the sentence. Fall through.
  }

  const heLineBare = line.match(new RegExp(`^${HE_GIVEN}${HE_LINE}\\s+(.+=.+)$`));
  if (heLineBare) {
    return { id: `curve-${anonIndex(heLineBare[1])}`, name: '', kind: 'line', eqSrc: heLineBare[1] };
  }
  /**
   * NOT flagged `i`, and the English words carry their own case alternatives instead (#1093).
   *
   * `LINE_NAME` contains `[A-Z][0-9]?[A-Z][0-9]?`, so a whole-pattern `i` made it match any two
   * lowercase letters — «the line **th**rough P is perpendicular to AB» was claimed by this rule
   * with `th` as the line's NAME, and the student was told their equation («rough P is …») was
   * unreadable. This is exactly the trap `TWO_POINTS` spells out a few lines above and avoids the
   * same way: *"a case-insensitive whole-pattern would quietly start accepting `ab` as two
   * vertices."* Found while adding the «through a point» construction, which the bug swallowed.
   */
  const enLine = line.match(new RegExp(`^(?:[Tt]he\\s+)?[Ll]ine\\s+(${LINE_NAME})\\s*:?\\s*(?:is\\s+)?(.+)$`));
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

  /**
   * «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» — the letter is the CENTRE (#1059).
   *
   * Operator ruling, 2026-09-15: *"«מעגל O» means the center letter is O"*. The corpus uses Roman
   * numerals to NAME circles (ADR-AG-005 D6) and any other letter for the centre, so the two
   * readings of one sentence shape are told apart by which letter it is — which is why the branch
   * above runs first and this one only sees what it declined.
   *
   * The circle itself stays anonymous, with the content-derived id a bare equation would give it.
   * That is not a detail: it keeps `O` free to be the point, so the student`s letter means one
   * thing and the M1 id space has no collision in it.
   */
  const heCircleCentre = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_CIRCLE}\\s+(?!${ROMAN_LETTERS}(?=[\\s:]))(${NAME})\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircleCentre) {
    return {
      id: `curve-${anonIndex(heCircleCentre[2])}`,
      name: '',
      kind: 'circle',
      eqSrc: heCircleCentre[2],
      centre: heCircleCentre[1],
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

  // The English centre form, for the same reason and with the same numeral exclusion (#1059).
  const enCircleCentre = line.match(
    new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s+(?!${ROMAN_LETTERS}(?=[\\s:]))(${NAME})\\s*:?\\s*(?:is\\s+|whose equation is\\s+)?(.+)$`),
  );
  if (enCircleCentre) {
    return {
      id: `curve-${anonIndex(enCircleCentre[2])}`,
      name: '',
      kind: 'circle',
      eqSrc: enCircleCentre[2],
      centre: enCircleCentre[1],
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
  { he: /ה?תיכונ(?:ים|י)/, en: /centroid|medians/i, t: 'centroid', n: 3 },
  { he: /חוצי\s+ה?זוויות/, en: /incent(?:re|er)|angle\s+bisectors/i, t: 'incentre', n: 3 },
  { he: /ה?גבה(?:ים|י)/, en: /orthocent(?:re|er)|altitudes/i, t: 'orthocentre', n: 3 },
  { he: /ה?אנכ(?:ים|י)\s+ה?אמצעיים/, en: /circumcent(?:re|er)|perpendicular\s+bisectors/i, t: 'circumcentre', n: 3 },
  { he: /ה?אלכסונ(?:ים|י)/, en: /diagonals/i, t: 'diagonals', n: 4 },
];

/**
 * The CONSTRUCT state is part of the noun (#1070).
 *
 * Hebrew inflects a plural noun when it governs another: «האלכסונים» standing alone becomes
 * «אלכסוני המרובע» in front of the shape. The noun-phrase form («מפגש האלכסונים במרובע») only ever
 * sees the free state, so the table was written with it — and the VERB form, which is the one the
 * corpus writes as a sentence, only ever sees the construct state. Both spellings are one noun.
 */

/**
 * The VERB phrasing of a concurrency point (#1070).
 *
 * «אלכסוני המרובע ABCD נפגשים בנקודה O» and «O מפגש האלכסונים במרובע ABCD» say the identical
 * thing: the first is a SENTENCE, the second a NOUN PHRASE naming the point. The corpus writes
 * both, and D8 is that the student types the exam`s own sentence.
 *
 * One alternation over the SAME `ROLES` table, so «התיכונים נפגשים בנקודה M» and «הגבהים נפגשים
 *
 * **The VERB is an alternation too (#1081).** It was written around «נפגשים», which is what the
 * corpus examples in front of us used; «נחתכים» is the other everyday word for the same thing and
 * the student who typed it was told the tool did not understand them. That is the fifth
 * one-spelling gate in this file (#1069, #1072, #1074, #1070, this) — so the lock asserts the
 * FORMS, every verb over every role, and the sixth spelling has a place to be added.
 * בנקודה H» arrive with it rather than as three more rules.
 *
 * The vertices are OPTIONAL: «אלכסוני המרובע נפגשים בנקודה O» is a contextual reference to the
 * one quadrilateral the student has drawn, resolved at M1 like «שטח הדלתון הוא 24» (#1049).
 */
/**
 * «משוואת האלכסון הראשי היא y=2x» — the diagonal named by its ROLE (#1070).
 *
 * Operator, 2026-09-15: *"for a דלתון - i want to be able to say משוואת האלכסון הראשי or האלכסון
 * המשני and give the equation"*, and *"what i said about a kite should be true for other quads"*.
 *
 * The generalisation holds in one direction only, and that is the whole modelling decision:
 * **every quadrilateral has two diagonals; only some have a PRINCIPAL one.** Which diagonal is
 * principal is a fact about the figure — a kite's axis of symmetry — so it is meaningful only for
 * a noun whose registry row distinguishes them, and M1 is where the figure is known.
 */
const DIAGONAL_EQ_HE = new RegExp(
  `^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?ה?אלכסון\\s+ה?(ראשי|משני)${HE_IS}\\s*:?\\s*(.+)$`,
);
const DIAGONAL_EQ_EN = new RegExp(
  `^(?:the\\s+)?(main|principal|major|secondary|minor)\\s+diagonal\\s+(?:is\\s+|=\\s*)(.+)$`,
  'i',
);

const MEET_HE = new RegExp(
  `^${HE_GIVEN}(.+?)\\s+(?:נפגשים|נחתכים|מצטלבים)\\s+ב-?\\s*(?:ה?נקוד(?:ה|ת))?\\s*(${NAME})$`,
);
const MEET_EN = new RegExp(
  `^(?:the\\s+)?(.+?)\\s+(?:meet|intersect|cross)\\s+(?:at\\s+)?(?:the\\s+)?(?:point\\s+)?(${NAME})$`,
  'i',
);

/** `M אמצע AB` · `M הוא אמצע הצלע AB` · `M is the midpoint of AB`. The corpus's commonest construct. */
const MIDPOINT_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*אמצע\\s+(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})$`,
);
const MIDPOINT_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+midpoint\\s+of\\s+(?:segment\\s+|side\\s+)?(${NAME})(${NAME})$`,
  'i',
);

/**
 * `O מרכז המעגל I` · `O הוא מרכז המעגל I` · `O is the centre of circle I` (#1109).
 *
 * Operator, playing T10/T12: *"when a center of a circle is defined by the equation, it should be
 * clickable so user can assign the center with a letter"*.
 *
 * ## It NAMES; it never asserts
 *
 * His ruling: *"the click only names what doesn't have a name"*. So this emits the **`circle-centre`
 * derived rule** — the one #1059/#1060 already shipped, whose parent is a CURVE rather than a set of
 * points — and nothing else. No constraint, no degree of freedom. On «נתון מעגל O משיק לציר x» the
 * centre keeps its freedom after the naming, because a label is not a given.
 *
 * ## The engine half already existed, and that is why this is a parser rule
 *
 * The issue warned that the missing grammar was *"probably the larger part"*, and measured it is the
 * ONLY part: none of six spellings parsed, while `{ t: 'circle-centre', curve }` has been a
 * `DerivedRule` since #1059. A rule that minted a second kind of centre-point would be the divergence
 * ADR-AG-023 names, so this reuses the fact the circle-by-centre form already produces.
 *
 * ## Siblings, decided explicitly rather than left implied
 *
 * A parabola's FOCUS and an ellipse's CENTRE are the same question and are **not** in this slice: they
 * have no `DerivedRule`, so each would be new engine work rather than a spelling. Circle-only, said out
 * loud, per the issue's step 5.
 */
const CENTRE_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מרכז\\s+(?:ה?מעגל\\s+)?(${NAME})$`,
);
const CENTRE_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+cent(?:re|er)\\s+of\\s+(?:circle\\s+)?(${NAME})$`,
  'i',
);

/** `M מפגש התיכונים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD`. */
const CONCURRENCY_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מפגש\\s+(.+?)\\s+ב-?\\s*(?:ה?([א-ת]+(?:[- ][א-ת]+){0,2})\\s+)?(${NAME_RUN})$`,
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
 * Read from the REGISTRY (#1070). This was the FIFTH hand-written list of shape nouns in this
 * file, and it knew only two of them — so «מפגש האלכסונים בדלתון ABCD» could not be checked at
 * all. One table, asked five ways.
 */
const arityOf = (noun: string | undefined): number | null => {
  if (!noun) return null;
  const key = EN_SHAPE[normalizeShapeNoun(noun).toLowerCase()] ?? noun;
  return shapeRow(key)?.arity ?? null;
};

/** A label naming two different vertices of one figure is not a figure — «משולש ABA» (#1042). */
const hasRepeat = (v: readonly string[]): boolean => new Set(v).size !== v.length;

/**
 * A POINT WHERE TWO THINGS CROSS — «P נקודת החיתוך של המעגל עם ציר ה-x» (#1025).
 *
 * The corpus asks for these constantly: where a curve meets an axis, where two lines meet. The
 * issue was filed as CLICKABLE dots on the canvas; this is the same capability in the product’s own
 * idiom, which is a sentence — and the sentence is what the exam actually writes.
 *
 * ## It needs no new mechanism, which is the point
 *
 * An intersection is a point that is ON BOTH things: two incidences, each consuming one of its two
 * degrees of freedom. So it lowers to a `declare` and two constraints the engine already has, the
 * joint solve finds a crossing, and — where there are two — different configurations find different
 * ones and [ADR-AG-047](../../docs/06c-decisions-analytic.md#adr-ag-047) lists both in the panel.
 *
 * Modelling it as a DERIVED point would have been the wrong shape: a derived point is one answer in
 * closed form, and a line meets a circle twice.
 */
/**
 * The ORDINAL that names WHICH crossing (#1113), non-capturing on purpose.
 *
 * A line meets a conic twice and both crossings are offered, so the sentence must be able to say
 * which one it means — the operator's ruling, 2026-09-16, over storing a branch index behind the
 * student's back. The word is accepted and carried in the student's own line; what makes the two
 * words denote different points is the `crossing-distinct` selector below, which every intersection
 * gets. It is non-capturing so the operand groups keep their indices.
 */
const NTH_HE = '(?:ה?ראשונה|ה?שניי?ה|ה?אחרת)?';
const INTERSECT_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:ה?נקודת|ה?נקודות)?\\s*ה?חיתוך\\s*${NTH_HE}\\s*(?:של\\s+)?(.+?)\\s+(?:עם|ו-?)\\s+(.+)$`
);
const INTERSECT_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+(?:first\\s+|second\\s+|other\\s+)?intersection\\s+(?:point\\s+)?of\\s+(.+?)\\s+(?:and|with)\\s+(.+)$`
,  'i',
);

/**
 * One operand of an intersection, as the incidence it means.
 *
 * The axis cases carry NUMERIC coefficients because an axis needs no figure to be known; everything
 * else goes through `direction()` — the same resolver the relations use — so «הישר AB», «הצלע AB»
 * and «הישר l1» mean here exactly what they mean there, and cannot drift.
 */
function incidenceOn(operand: string, id: Id): Constraint | null {
  const axis = AXIS_HE.exec(trim(operand)) ?? AXIS_EN.exec(trim(operand));
  if (axis) {
    return axis[1].toLowerCase() === 'x'
      ? { t: 'on-line', id, a: 0, b: 1, c: 0 }
      : { t: 'on-line', id, a: 1, b: 0, c: 0 };
  }
  /**
   * A CIRCLE by its numeral — «המעגל I». `direction()` resolves lines and axes, because that is all a
   * RELATION can be about; an incidence can be about any curve, so the naming forms `matchCurve`
   * mints are mapped here to the same ids it mints. Same id, or the two rules would build two objects
   * for one circle (the ADR-AG-023 defect).
   */
  const circle = /^ה?מעגל\s+(I|II|III|IV|V)$/.exec(trim(operand)) ?? /^(?:the\s+)?circle\s+(I|II|III|IV|V)$/i.exec(trim(operand));
  if (circle) return { t: 'on-curve', id, curve: `circle-${circle[1]}` };

  const dir = direction(trim(operand));
  if (dir?.k === 'curve') return { t: 'on-curve', id, curve: dir.id };
  if (dir?.k === 'points') return { t: 'on-line-2pt', id, a: dir.a, b: dir.b };

  /**
   * A CURVE NAMED BY ITS EQUATION — «הישר y=9», or the bare «y=9» (#1092).
   *
   * Operator, 2026-09-15 (T34): a bare «נתון הישר y=9» crossing a triangle offered no ring, because
   * the canvas may only offer a crossing it can put into a SENTENCE (ADR-AG-054) and this rule
   * could not read one back.
   *
   * The resolver itself already existed and was already right — the on-curve rule mints
   * `curve-${anonIndex(...)}` for exactly this operand — and this caller simply never reached it.
   * The docblock above states the contract it was missing: *the naming forms `matchCurve` mints are
   * mapped here to the same ids it mints.* An equation is one of those forms.
   *
   * Written kind-agnostically because `anonIndex` is: the id is derived from the equation text, and
   * a parabola's equation names its parabola exactly as a line's names its line.
   *
   * The reserved-symbol guard is the on-curve rule's, for the on-curve rule's reason (#1068): without
   * it «עם הערך x=5» — prose that happens to contain an `=` — would mint a curve. An operand with
   * no plane variable in it is still `bad-operand`, which is the honest answer.
   */
  // Any curve NOUN may front an equation (#1096): «הפרבולה y^2=54x» is how a student refers to a
  // conic that has only its equation to go by, and it is the phrasing the canvas's own rings offer.
  const bare = trim(operand).replace(
    /^(?:ה?ישר|ה?עקום|ה?מעגל|ה?פרבולה|ה?אליפסה|(?:the\s+)?(?:line|curve|circle|parabola|ellipse))\s+/i,
    '',
  );
  if (bare.includes('=')) {
    const eq = equationExpr(bare);
    if (eq && symbolsOf(eq).some((sym) => RESERVED_SYMBOLS.has(sym))) {
      return { t: 'on-curve', id, curve: `curve-${anonIndex(bare)}` };
    }
  }
  return null;
}

function parseIntersection(line: string): RuleOutcome {
  const m = INTERSECT_HE.exec(line) ?? INTERSECT_EN.exec(line);
  if (!m) return null;
  const [, id, leftSrc, rightSrc] = m;
  const left = incidenceOn(leftSrc, id);
  const right = incidenceOn(rightSrc, id);
  // The verb was understood and an operand was not — #1052’s refusal, which names the formats that
  // do work rather than calling the whole sentence unintelligible.
  if (!left || !right) return refuse('bad-operand', line);
  return made([
    { t: 'declare', id, src: line },
    { t: 'constraint', k: left, src: line },
    { t: 'constraint', k: right, src: line },
    /**
     * AND IT IS NOT ITS SIBLING (#1113).
     *
     * Emitted for EVERY intersection, not only for one that says «השנייה» — the defect is a property
     * of the construct, not of the wording. Two crossings of the same pair carry identical
     * incidences, so without this the solve settles both on the same root and the student gets two
     * letters on one point. With one crossing named there is no sibling and the selector judges
     * nothing, which costs nothing.
     */
    { t: 'selector', sel: { kind: 'crossing-distinct', id }, src: line },
  ]);
}
function parseDerived(line: string): RuleOutcome {
  const crossing = parseIntersection(line);
  if (crossing) return crossing;

  const mid = MIDPOINT_HE.exec(line) ?? MIDPOINT_EN.exec(line);
  if (mid) {
    const [, id, a, b] = mid;
    if (a === b) return refuse('repeated-vertex', line); // «M אמצע AA» is a point, not a segment
    return made([{ t: 'derived', id, rule: { t: 'midpoint', a, b }, src: line }]);
  }

  /**
   * Naming a circle`s CENTRE (#1109) — it names, it never asserts.
   *
   * The curve is resolved by NAME to the id the rest of the tree uses (`circle-I`), rather than a
   * second id minted here: two ids for one curve is ADR-AG-023`s defect. An unknown name refuses by
   * name instead of inventing a circle, which is the same rule every other operand follows.
   */
  const centre = CENTRE_HE.exec(line) ?? CENTRE_EN.exec(line);
  if (centre) {
    const [, id, circleName] = centre;
    return made([{ t: 'derived', id, rule: { t: 'circle-centre', curve: `circle-${circleName}` }, src: line }]);
  }

  const diag = DIAGONAL_EQ_HE.exec(line) ?? DIAGONAL_EQ_EN.exec(line);
  if (diag) {
    const [, which, eqSrc] = diag;
    const eq = equationExpr(eqSrc);
    if (!eq) return refuse('bad-equation', trim(eqSrc));
    const principal = /ראשי|main|principal|major/i.test(which);
    return made([{ t: 'diagonal-eq', principal, eq, src: line }]);
  }

  const meet = MEET_HE.exec(line) ?? MEET_EN.exec(line);
  if (meet) {
    const [, subject, id] = meet;
    const role = ROLES.find((r) => r.he.test(subject) || r.en.test(subject));
    // Not a concurrency subject — «הישרים נפגשים בנקודה O» is a different sentence and this rule
    // has no claim on it. Declining leaves it to the rules after this one.
    if (role) {
      // The shape may be named with its vertices or only by its noun; the trailing run of names is
      // the figure when it is there, and the NOUN carries it otherwise.
      const shape = /([A-Z][0-9]?){3,}$/.exec(trim(subject));
      if (shape) {
        const v = splitNames(shape[0]);
        if (v.length !== role.n) return refuse('bad-arity', line);
        if (hasRepeat(v)) return refuse('repeated-vertex', line);
        const rule: DerivedRule =
          role.t === 'diagonals'
            ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
            : ({ t: role.t, v: [v[0], v[1], v[2]] } as DerivedRule);
        return made([{ t: 'derived', id, rule, src: line }]);
      }
      // No vertices: the shape is whichever one the figure has, which only M1 can say.
      return made([{ t: 'meet-of', role: role.t, arity: role.n, id, src: line }]);
    }
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
    // The shape the sentence named is drawn too (#1080) — «במשולש ABC» is the student telling us
    // there is a triangle, not only which points the centroid is of.
    const shape = namedShapeFacts(noun, v, line);
    if (shape === 'bad-arity') return refuse('bad-arity', line);
    return made([...shape, { t: 'derived', id, rule, src: line }]);
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
/**
 * ONE shape rule, over the registry (#1049).
 *
 * Operator, 2026-09-15: *"we need support for all kinds of 2d shapes. **I don`t want to mention each
 * one.**"* — so the noun is CAPTURED, not enumerated, and what decides whether it is a shape is
 * whether {@link shapeRow} has a row for it. Three hand-written lists of shape nouns had already
 * drifted apart in this file; replacing them with a lookup is what makes an eleventh noun a table
 * row rather than a change to the parser.
 *
 * The noun is up to three Hebrew words, which covers «משולש ישר-זווית» and «טרפז שווה שוקיים» and
 * stops well short of a sentence. A phrase with no row FALLS THROUGH rather than refusing, because
 * this rule has no claim on a sentence it does not recognise.
 */
const SHAPE_HE = new RegExp(`^${HE_GIVEN}(ה?[א-ת]+(?:[- ][א-ת]+){0,2})\\s+(${NAME_RUN})$`);
const SHAPE_EN = new RegExp(`^(?:the\\s+)?([a-z]+(?:[- ][a-z]+){0,2})\\s+(${NAME_RUN})$`, 'i');

/**
 * The NOUN IS OPTIONAL — «EF» is «הקטע EF» (#1074).
 *
 * Operator, 2026-09-15: *"when there are 2 points like E and F defined, and I write EF, i want the
 * segment drawn"*. The exam writes it that way constantly — "חשבו את EF", "העבירו את EF" — and a
 * student transcribing givens writes what the page writes.
 *
 * This is the same class as #1072 and #1069: a matcher written around the FULLEST phrasing the
 * corpus shows, so every shorter spelling of the same statement falls off the end of the chain into
 * `not-handled`. It is the third time, which is why the answer is "the noun is optional" as a rule
 * rather than as a patch.
 *
 * Safe in the LAST-but-one position it already occupies: a bare pair of names cannot be a
 * coordinate (no parentheses), an equation (no `=`) or a relation (no verb), so nothing else has a
 * claim on it. An `=`-bearing line reaches `parseConstraint` first, which is what keeps «AB = 5» a
 * LENGTH rather than a segment.
 */
const SEGMENT_HE = new RegExp(`^${HE_GIVEN}(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})$`);
const SEGMENT_EN = new RegExp(`^(?:(?:segment|side)\\s+)?(${NAME})(${NAME})$`, 'i');

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

/**
 * A CIRCLE GIVEN BY ITS CENTRE, and its tangency to the axes (#1060).
 *
 * Operator, 2026-09-15: *"we need to support מעגל O משיק לציר x and all verses of the axis
 * tangency"*. Measured then: 0 of 11 phrasings, every one refused as a bad equation.
 *
 * Tangency to an axis is how the corpus pins a circle WITHOUT giving its radius — «מעגל המשיק
 * לציר ה-x» says r = |y_O|, which is exactly one equation and exactly the sentence a student is
 * handed instead of a number. Without it they must do that algebra themselves and type the
 * finished equation, which is the student doing the part the figure was meant to show.
 *
 * The RADIUS is a parameter named after the centre — `r_O` — so it needs no resolution against
 * the figure and cannot collide with a student’s own single letters. It is declared POSITIVE:
 * #1019 made an undeclared parameter sample negative, which is right for a coefficient and wrong
 * for a length.
 */
const CIRCLE_AT_HE = new RegExp(
  `^${HE_GIVEN}ה?מעגל\\s+(?:ש?מרכזו\\s+)?(${NAME})(?:\\s+(?:ה?משיק|ומשיק)\\s+ל(?:ה?ציר\\s+ה?-?\\s*([xy])|שני\\s+ה?צירים|(?:the\\s+)?([xy])[- ]axis|both\\s+axes))?$`
);
const CIRCLE_AT_EN = new RegExp(
  `^(?:the\\s+)?circle\\s+(?:cent(?:re|er)d\\s+at\\s+)?(${NAME})(?:\\s+is\\s+tangent\\s+to\\s+(?:ה?ציר\\s+ה?-?\\s*([xy])|שני\\s+ה?צירים|(?:the\\s+)?([xy])[- ]axis|both\\s+axes))?$`
,  'i',
);

/** The CONTEXTUAL form — the one circle the student has drawn: «המעגל משיק לציר ה-x». */
const CIRCLE_TANGENT_HE = new RegExp(
  `^${HE_GIVEN}ה?מעגל\\s+(?:ה?משיק|ומשיק)\\s+ל(?:ה?ציר\\s+ה?-?\\s*([xy])|שני\\s+ה?צירים|(?:the\\s+)?([xy])[- ]axis|both\\s+axes)$`
);
const CIRCLE_TANGENT_EN = new RegExp(
  `^(?:the\\s+)?circle\\s+is\\s+tangent\\s+to\\s+(?:ה?ציר\\s+ה?-?\\s*([xy])|שני\\s+ה?צירים|(?:the\\s+)?([xy])[- ]axis|both\\s+axes)$`
,  'i',
);

/** Which axes a matched tangency phrase names — one, or both. */
function axesOf(m: RegExpExecArray, from: number): Array<'x' | 'y'> {
  const named = (m[from] ?? m[from + 1]) as string | undefined;
  if (named) return [named.toLowerCase() as 'x' | 'y'];
  // «שני הצירים» / «both axes» — the phrase matched but named no single axis.
  return m[0] && /שני|both/i.test(m[0]) ? ['x', 'y'] : [];
}

/**
 * The facts a circle-on-a-point lowers to: the centre as a free vertex, a positive radius, and the
 * circle itself. Shared by the named and the contextual forms so the two cannot drift.
 */
function circleAtFacts(centre: Id, axes: Array<'x' | 'y'>, line: string): Fact[] {
  const sym = `r_${centre}`;
  const r: Expr = { kind: 'sym', name: sym };
  return [
    { t: 'declare', id: centre, src: line },
    { t: 'param', sym, domain: { ...UNBOUNDED, min: 0, minOpen: true }, src: line },
    { t: 'circle-at', id: `circle-at-${centre}`, centre, r, src: line },
    ...axes.map((axis) => ({
      t: 'constraint' as const,
      k: { t: 'tangent-axis' as const, centre, r, axis },
      src: line,
    })),
  ];
}

function parseCircleAt(line: string): RuleOutcome {
  const named = CIRCLE_AT_HE.exec(line) ?? CIRCLE_AT_EN.exec(line);
  if (named) {
    // The tangency phrase is optional: «נתון מעגל O» alone is a circle with a free centre and a
    // free radius, which is 3 degrees of freedom and an honest figure.
    return made(circleAtFacts(named[1], axesOf(named, 2), line));
  }
  const bare = CIRCLE_TANGENT_HE.exec(line) ?? CIRCLE_TANGENT_EN.exec(line);
  if (bare) {
    // No centre named: the sentence is about the one circle in the figure, which only M1 knows.
    return made([{ t: 'tangent-of', axes: axesOf(bare, 1), src: line }]);
  }
  return null;
}
/**
 * The SHAPE a sentence named, as a fact, so that naming it draws it (#1080).
 *
 * Operator, 2026-09-15, looking at «שטח המשולש ABC הוא 7» over three points and no triangle:
 * *"in such a case, the triangle should be drawn as the user mentions and refers to it"*.
 *
 * The ruling generalises past the area sentence: **naming a shape in a given makes the shape part
 * of the figure.** «שטח המשולש ABC», «M מפגש התיכונים במשולש ABC» — each names a triangle the
 * student is plainly thinking about, and drawing only the ones typed on a line of their own left
 * the figure showing three loose dots for a question about a triangle.
 *
 * It is the SAME fact «משולש ABC» produces, so the ring is identical however it arrived, the id is
 * canonical, and stating it twice is absorbed by M1 rather than drawn twice.
 *
 * Returns nothing when the noun is absent (there is no shape to name) or unknown to the registry.
 * A noun whose arity disagrees with the vertex count is a REFUSAL, which is #1042 applied to a
 * sentence that had never been checked for it.
 */
function namedShapeFacts(noun: string | undefined, ids: Id[], line: string): Fact[] | 'bad-arity' {
  if (!noun) return [];
  const key = EN_SHAPE[normalizeShapeNoun(noun).toLowerCase()] ?? normalizeShapeNoun(noun);
  const row = shapeRow(key);
  if (!row) return [];
  if (ids.length !== row.arity) return 'bad-arity';
  return [
    { t: 'polygon', id: polygonId(ids), vertices: ids, noun: key, src: line },
    ...row.givens(ids).map((k: Constraint) => ({ t: 'constraint' as const, k, src: line })),
  ];
}
function parseShape(line: string): RuleOutcome {
  const seg = SEGMENT_HE.exec(line) ?? SEGMENT_EN.exec(line);
  if (seg) {
    const [, a, b] = seg;
    if (a === b) return refuse('repeated-vertex', line); // «הקטע AA» has no length to draw
    return made([{ t: 'segment', id: segmentId(a, b), a, b, src: line }]);
  }

  const poly = SHAPE_HE.exec(line) ?? SHAPE_EN.exec(line);
  if (poly) {
    const [, nounSrc, run] = poly;
    const noun = EN_SHAPE[normalizeShapeNoun(nounSrc).toLowerCase()] ?? nounSrc;
    const row = shapeRow(noun);
    // Not a shape noun at all — leave the sentence to the rules after this one.
    if (!row) return null;
    const vertices = splitNames(run);
    // The noun the student wrote is the assertion to check against — `< 3` only ever caught the
    // shapeless case and let «משולש ABCD» through as a four-sided triangle (#1042). The arity now
    // comes from the row, so a new noun brings its own answer with it.
    if (vertices.length !== row.arity) return refuse('bad-arity', line);
    if (hasRepeat(vertices)) return refuse('repeated-vertex', line);
    /**
     * The RING first, then the givens the noun carries.
     *
     * Order matters: the polygon introduces the vertices (ADR-AG-013), and a constraint may not
     * name a point the figure does not have yet. So a shape noun is one object plus N constraints,
     * and «מקבילית ABCD» is «מרובע ABCD» plus two parallel relations — which is exactly how a
     * student would describe it.
     */
    return made([
      { t: 'polygon', id: polygonId(vertices), vertices, noun: normalizeShapeNoun(noun), src: line },
      /**
       * The given every shape noun carries and none of them wrote down (#1077): these are DIFFERENT
       * POINTS. Without it the solve may satisfy «דלתון ABCD» by putting `B` and `D` in one place,
       * where both equal-side givens hold trivially — measured in 25 of 60 configurations.
       */
      { t: 'selector' as const, sel: { kind: 'distinct' as const, ids: vertices }, src: line },
      ...row.givens(vertices).map((k: Constraint) => ({ t: 'constraint' as const, k, src: line })),
    ]);
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
/**
 * «שטח המשולש ABC הוא 20» — and every other shape the registry knows (#1049).
 *
 * This rule had its OWN list of shape nouns — משולש|מרובע|מצולע — which is the FOURTH hand-written
 * list of them this file held, and the reason «שטח הדלתון ABCD» was refused by a tool that had just
 * drawn the kite. Lists drift; a lookup cannot (ADR-043 class).
 *
 * Both the noun and the vertices are OPTIONAL, and each absence means something different:
 *
 *  - «שטח ABCD הוא 24» — no noun, and none is needed: the vertices say which figure;
 *  - «שטח הדלתון הוא 24» — no vertices, and the NOUN says which figure, provided the student has
 *    exactly one of them. That resolution needs the construction, so it happens at M1.
 */
const AREA_HE = new RegExp(
  `^${HE_GIVEN}שטח\\s+(ה?[א-ת]+(?:[- ][א-ת]+){0,2})?\\s*(${NAME_RUN})?${HE_IS}\\s*(?:שווה\\s+ל-?)?\\s*(.+)$`,
);
const AREA_EN = new RegExp(
  `^(?:the\\s+)?area\\s+of\\s+(?:the\\s+)?([a-z]+(?:[- ][a-z]+){0,2})?\\s*(${NAME_RUN})?\\s+is\\s+(.+)$`,
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
/**
 * `D על הצלע BC` · `נקודה D נמצאת על הקטע BC` · `B על הישר y=x` · `P נמצאת על הישר l1`.
 *
 * The morphology is written out rather than stemmed — «נמצא» ends differently for each gender and
 * number, and a gate admitting one spelling is a silent drop, which is this tree's most productive bug
 * class. The NOUN is captured because the operator's ruling makes it load-bearing: it decides whether
 * the carrier is bounded.
 *
 * The noun list carries the CURVE families too (#1076). A point on a parabola is the same sentence
 * as a point on a line — one carrier, one degree of freedom — and leaving «פרבולה» out of the
 * alternation would not have refused it: the sentence fell through to `not-handled`, which reads to
 * a student as "this tool does not do parabolas". None of the curve nouns is BOUNDED; only a side
 * and a segment are, which is why `bounded` tests for those two by name rather than for "has a noun".
 */
const ON_OBJECT_HE = new RegExp(
  `^${HE_GIVEN}${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת|ים|ות)?\\s+)?על\\s+(ה?(?:צלע|קטע|ישר|מעגל|פרבולה|אליפסה))?\\s*(?:${HE_EQ_OF}\\s+)?(.+)$`,
);
const ON_OBJECT_EN = new RegExp(
  `^(?:the\\s+)?(?:point\\s+)?(${NAME})\\s+(?:is\\s+|lies\\s+)?on\\s+(?:the\\s+)?(side|segment|line|circle|parabola|ellipse)?\\s*(.+)$`,
  'i',
);

/**
 * A RIGHT ANGLE, named four ways (#1049).
 *
 * Operator, 2026-09-15: *"It also doesn`t support זווית B ישרה so I can tell the tool what is the
 * right angle."* That sentence is what CONSUMES the discrete freedom «משולש ישר-זווית ABC» leaves
 * open, which is why it ships with the registry rather than after it.
 *
 * Three letters name the angle outright. ONE letter names it only relative to a figure, so that
 * form lowers to a `right-angle` fact and is resolved at the M1 boundary, where the shapes are
 * known — and refused by name where the vertex belongs to no single shape.
 *
 * Only 90° for now: a general «זווית ABC היא 60» needs an angle RESIDUAL, which is its own
 * mechanism and its own issue. A stated value that is not 90 therefore falls through rather than
 * being quietly treated as a right angle.
 */
const ANGLE_HE = new RegExp(
  `^${HE_GIVEN}ה?זווית\\s+(${NAME})(${NAME})?(${NAME})?${HE_IS}\\s*(?:ישרה|=\\s*90|90)$`,
);
const ANGLE_SIGN = new RegExp(`^${HE_GIVEN}∡\\s*(${NAME})(${NAME})?(${NAME})?\\s*=\\s*90°?$`);
const ANGLE_EN = new RegExp(
  `^(?:the\\s+)?angle\\s+(${NAME})(${NAME})?(${NAME})?\\s+(?:is\\s+)?(?:right|=\\s*90°?|90°?)$`,
  'i',
);
/**
 * «C ברביע השלישי» — a point placed in a REGION (#1071).
 *
 * A quadrant is not a curve and not a value: it is a pair of inequalities. That makes it D7's SECOND
 * kind — a branch selector, a filter over configurations the solve already produced — and not the
 * third, a constraint that removes freedom. A point in the third quadrant is still a 2-DOF point; it
 * is simply not drawn anywhere else. Lowering it to constraints would make the DOF cue lie, which is
 * the one thing D7 exists to prevent.
 *
 * So it needs no new mechanism: it is two `axis-side` selectors, the ones #1033 built for
 * «B על החלק החיובי של ציר x», stated at once.
 */
const QUADRANT_HE = new RegExp(
  `^${HE_GIVEN}${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת)?\\s+)?ב-?ה?רביע\\s+(ה?ראשון|ה?שני|ה?שלישי|ה?רביעי)$`,
);
const QUADRANT_EN = new RegExp(
  `^(?:the\\s+)?(?:point\\s+)?(${NAME})\\s+(?:is\\s+|lies\\s+)?in\\s+(?:the\\s+)?(first|second|third|fourth)\\s+quadrant$`,
  'i',
);

/** Which way each axis points in each quadrant — the only thing the rule has to know. */
const QUADRANT_SIGNS: Record<string, [boolean, boolean]> = {
  ראשון: [true, true],
  שני: [false, true],
  שלישי: [false, false],
  רביעי: [true, false],
  first: [true, true],
  second: [false, true],
  third: [false, false],
  fourth: [true, false],
};

/**
 * ONE COORDINATE of a point — «שיעור ה-x של M הוא 3» (#1040).
 *
 * Operator, 2026-09-15: *"how would i be able to say that the x value of M is 3"*. It is the same
 * given as «M(3, y)» with the y left open, and `coord` has carried optional components since V0 —
 * [02c R31](../../docs/02c-requirements-analytic.md) ruled the form and nothing implemented it.
 *
 * The corpus writes «שיעור ה-x», «שיעור ה-x של», «ערך ה-x» and the bare «x של M»; English writes
 * "the x value of M" and "the x-coordinate of M". One alternation, because a gate admitting one
 * spelling is a silent drop and this tree has paid for that three times.
 */
const COMPONENT_HE = new RegExp(
  `^${HE_GIVEN}(?:ה?שיעור|ה?ערך|ה?קואורדינט[הת])\\s+ה?-?\\s*([xy])\\s+(?:של\\s+)?(?:ה?נקודה\\s+)?(${NAME})${HE_IS}\\s*:?\\s*(.+)$`,
);
/**
 * THE SUBSCRIPTED SPELLING (#1127) — `x_A = 5`.
 *
 * The panel PRINTS coordinates this way and 02c R31c calls it canonical, and the parser would not read
 * it back: `xA = 5` worked, `x_A = 5` was `not-handled`. A tool that writes a notation and refuses to
 * read it is teaching the student that their own transcription is wrong.
 *
 * Language-neutral on purpose — a subscript is symbolic, not Hebrew or English.
 */
const COMPONENT_SUB = new RegExp(
  `^${HE_GIVEN}([xy])\\s*_\\s*\\{?\\s*(${NAME})\\s*\\}?${HE_IS}\\s*=\\s*(.+)$`,
);
/**
 * The BARE «x של A» form, which this file's own docblock already claimed to support (#1127).
 *
 * Measured: it did not. The noun (`שיעור`/`ערך`/`קואורדינטה`) was required, so «x של A הוא 5» was refused
 * while «שיעור ה-x של A הוא 5» worked. The `של` is what makes the bare form unambiguous, so it is
 * required here rather than making the noun optional in the pattern above — a lone `x` at the start of a
 * line is too weak a claim.
 */
const COMPONENT_OF = new RegExp(
  `^${HE_GIVEN}([xy])\\s+של\\s+${HE_POINT}(${NAME})${HE_IS}\\s*:?\\s*(.+)$`,
);
const COMPONENT_EN = new RegExp(
  `^(?:the\\s+)?([xy])[- ](?:value|coordinate|coord)\\s+of\\s+(?:point\\s+)?(${NAME})\\s+is\\s+(.+)$`,
  'i',
);
/**
 * A point on a curve named only by its KIND — «הנקודה A נמצאת על האליפסה» (#1057).
 *
 * The corpus writes this constantly (docs/19 §4a, F2) and the tool could not read it: every
 * on-object form until now needed the curve`s equation or its name in the same sentence.
 *
 * The reference is unambiguous because the CORPUS is: *"no exam in twenty carries two parabolas
 * or two ellipses; at most one of each per figure"* (docs/19 §4a). Where a student does put two
 * on the canvas, M1 refuses rather than picking — and no ordinal is invented, because a phrase
 * the exam never uses is a phrase the student has never seen (ADR-AG-005 D8).
 */
const ON_KIND_HE = new RegExp(
  `^${HE_GIVEN}${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת|ים|ות)?\\s+)?על\\s+ה(מעגל|פרבולה|אליפסה)$`
);
const ON_KIND_EN = new RegExp(
  `^(?:the\\s+)?(?:point\\s+)?(${NAME})\\s+(?:is\\s+|lies\\s+)?on\\s+the\\s+(circle|parabola|ellipse)$`
,  'i',
);

/** The registry of kind nouns, in both languages, onto the classifier’s own names. */
const KIND_NOUNS: Record<string, CurveKind> = {
  מעגל: 'circle',
  פרבולה: 'parabola',
  אליפסה: 'ellipse',
  circle: 'circle',
  parabola: 'parabola',
  ellipse: 'ellipse',
};

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

/**
 * A LINE CONSTRUCTED THROUGH A POINT — «דרך P עובר ישר מקביל ל AB» (#1093).
 *
 * Operator, 2026-09-15: *"דרך P עובר ישר מקביל ל AB - not supported"*. It was not: the grammar had no
 * «דרך» rule at all, so this is a missing capability rather than a broken gate.
 *
 * **It is a CONSTRUCTION, not a statement about something that exists.** The line does not exist until
 * this sentence creates it, and its equation is never given — it is fixed by a point it passes through
 * and a direction it copies. That is why it lowers to an OBJECT (`line-at`) and not to constraints on
 * a curve with free coefficients: the closed form is immediate, and putting two DOF into the solve
 * only to take them straight back out would be the long way round to the same line.
 *
 * The direction operand goes through `direction()` — the same resolver the relation and slope rules
 * use — so «AB», «הצלע AB», «הישר l1» and «ציר ה-x» mean here exactly what they mean there.
 *
 * The verb is optional and takes its full inflection run, and «מקביל»/«מאונך» take theirs, because
 * this tree's recurring trap is a Hebrew gate that admits one spelling and silently drops the rest
 * (five times by #1081's count, and #1088 made it six).
 */
const THROUGH_HE = new RegExp(
  `^${HE_GIVEN}דרך\\s+${HE_POINT}(${NAME})\\s+(?:עובר(?:ת)?\\s+)?ה?(?:ישר|קו)\\s+(${PARALLEL_WORDS}|${PERP_WORDS})\\s+ל-?\\s*(.+)$`,
);
const THROUGH_EN = new RegExp(
  `^(?:a\\s+|the\\s+)?line\\s+(?:passes\\s+)?through\\s+(?:point\\s+)?(${NAME})\\s+(?:and\\s+is\\s+|is\\s+)?(parallel|perpendicular)\\s+to\\s+(.+)$`,
  'i',
);

function parseThroughLine(line: string): RuleOutcome {
  const m = THROUGH_HE.exec(line) ?? THROUGH_EN.exec(line);
  if (!m) return null;
  const [, through, word, dirSrc] = m;
  const dir = direction(trim(dirSrc));
  // The verb was understood and the operand was not — an OWNED refusal about this sentence, naming
  // what a direction may be, rather than a fall-through to "I did not understand you" (ADR-AG-017).
  if (!dir) return refuse('bad-operand', line);
  const perp = new RegExp(`^(?:${PERP_WORDS})$|^perpendicular$`, 'i').test(word);
  /**
   * The id is content-derived, so stating the same construction twice is ONE object (ADR-AG-023) —
   * the same discipline the anonymous curves follow, keyed on what actually identifies this line:
   * the point, the direction and which of the two readings it is.
   */
  const id = `curve-${anonIndex(`through:${through}:${perp ? 'perp' : 'par'}:${describeDirId(dir)}`)}`;
  /**
   * The ANCHOR is introduced if it does not exist, with DOF — the operator's 2026-09-15 ruling for
   * «הישר AB» (#1066), applied here because it is the same act: «דרך P» NAMES P and asserts a line
   * passes through it, exactly as «הישר AB» names A and B and asserts the line passes through both.
   *
   * The DIRECTION operand is not declared, and that asymmetry is deliberate: it is a REFERENCE to
   * something whose direction is being copied, which is what a relation's operands are, and relations
   * do not introduce their operands either. Naming the thing a construction is ABOUT differs from
   * mentioning the thing it is measured against.
   */
  return made([
    { t: 'declare', id: through, src: line },
    { t: 'line-at', id, through, dir, perp, src: line },
  ]);
}

/** A direction as a STABLE string, for the content-derived id above. */
function describeDirId(d: Direction): string {
  if (d.k === 'axis') return `axis-${d.axis}`;
  if (d.k === 'curve') return `curve-${d.id}`;
  return `pts-${d.a}${d.b}`;
}

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
/**
 * COMPARISON words, rewritten into the equation they mean (#1075).
 *
 * Operator, 2026-09-15: *"שטח ABEF גדול פי 3 משטח משולש CEF - is not supported"*. Measured, the
 * nouns were not the problem — «שטח המשולש ABC גדול פי 3 משטח המשולש CEF», with both nouns
 * present, failed identically. What was missing is that a MEASURE can stand on both sides of a
 * relation at all.
 *
 * A REWRITE rather than a constraint kind, and that is the decision: «X גדול פי 3 מ-Y» means
 * «X = 3Y», which `length-eq` already expresses, so the comparison is vocabulary and not
 * mechanism. It therefore inherits everything — areas as terms, parameters, the solve, the
 * refusal — instead of needing each of them again.
 *
 * The rewrite runs BEFORE every constraint rule, on the raw line, so nothing downstream learns
 * that these words exist. «שווה ל-» needs no entry: it IS an equation once the words are gone.
 */
const COMPARISONS: Array<{ re: RegExp; eq: (x: string, k: string, y: string) => string }> = [
  // «X גדול פי 3 מ-Y» — a RATIO. The multiplier sits with the larger side.
  { re: /^(.+?)\s+(?:גדול|גדולה)\s+פי\s+(.+?)\s+מ-?\s*(.+)$/, eq: (x, k, y) => `${x} = (${k})*(${y})` },
  { re: /^(.+?)\s+(?:קטן|קטנה)\s+פי\s+(.+?)\s+מ-?\s*(.+)$/, eq: (x, k, y) => `(${k})*(${x}) = ${y}` },
  // «X גדול ב-5 מ-Y» — a DIFFERENCE. A different word, and a different equation.
  { re: /^(.+?)\s+(?:גדול|גדולה)\s+ב-?\s*(.+?)\s+מ-?\s*(.+)$/, eq: (x, k, y) => `${x} = ${y} + (${k})` },
  { re: /^(.+?)\s+(?:קטן|קטנה)\s+ב-?\s*(.+?)\s+מ-?\s*(.+)$/, eq: (x, k, y) => `${x} = ${y} - (${k})` },
  { re: /^(.+?)\s+is\s+(.+?)\s+times\s+(.+)$/i, eq: (x, k, y) => `${x} = (${k})*(${y})` },
];

/** The line as an EQUATION, when it was written as a comparison. `null` leaves it untouched. */
function asEquation(line: string): string | null {
  for (const c of COMPARISONS) {
    const m = c.re.exec(line);
    if (m) return c.eq(trim(m[1]), trim(m[2]), trim(m[3]));
  }
  return null;
}

const LENGTH_EQ = /^(?:נתון\s+כי\s+|נתון\s+)?(.+?)\s*=\s*(.+)$/;
function parseConstraint(raw: string): RuleOutcome {
  /**
   * A comparison is REWRITTEN into its equation before any rule sees the line (#1075), so every
   * rule below reads one shape of sentence. The student’s own words still reach the refusals,
   * because those carry the source from the caller rather than from here.
   */
  const line = asEquation(raw) ?? raw;
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
  const areaHe = AREA_HE.exec(line);
  const area = areaHe ?? AREA_EN.exec(line);
  if (area) {
    const [, nounSrc, run, valueSrc] = area;
    /**
     * The COPULA is not part of the noun.
     *
     * «שטח הדלתון הוא 24» has no vertices, so the noun group runs on and swallows «הוא» — and
     * «דלתון הוא» has no registry row, which turned the operator`s own sentence into `not-handled`.
     * Trimming it here rather than excluding it in the pattern keeps the pattern readable and
     * covers every gender of the copula at once.
     */
    const nounPlain = nounSrc
      ? normalizeShapeNoun(nounSrc).replace(/\s+(?:הוא|היא|הם|הן)$/, '')
      : undefined;
    const noun = nounPlain ? EN_SHAPE[nounPlain.toLowerCase()] ?? nounPlain : undefined;
    // A word that is not a shape noun means this is not an area sentence about a figure — leave
    // it rather than refuse it, which is the rule contract for "not my sentence".
    if (noun && !shapeRow(noun)) return null;
    const value = parseExpr(normalizeMath(valueSrc));
    if (!value) return refuse('bad-equation', trim(valueSrc));
    if (run) {
      const ids = splitNames(run);
      // The same class as the shape nouns (#1042): this rule recognised its own sentence, so a
      // figure with too few vertices is answered rather than handed to `not-handled` as if the
      // sentence were unintelligible.
      if (ids.length < 3) return refuse('bad-arity', line);
      if (hasRepeat(ids)) return refuse('repeated-vertex', line);
      // The shape FIRST: it introduces the vertices, and a constraint may not name a point the
      // figure does not have yet.
      const shape = namedShapeFacts(noun, ids, line);
      if (shape === 'bad-arity') return refuse('bad-arity', line);
      return made([...shape, { t: 'constraint', k: { t: 'area', ids, value }, src: line }]);
    }
    // The noun alone — which figure it names is a question about the CONSTRUCTION, so M1 answers it.
    if (noun) return made([{ t: 'area-of', noun, value, src: line }]);
    return null;
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

  /**
   * A point ON AN OBJECT — «נקודה D נמצאת על הצלע BC», «B על הישר y=x» (#1069, #1073).
   *
   * **The product's defining 1-DOF carrier**, and this tree never had it. The root CLAUDE.md describes
   * Geo Builder as the tool where a student says *"point G on AD"* and G slides along AD;
   * `carriers.ts` has named the `on-curve` family since slice A and left it empty.
   *
   * **Operator ruling, 2026-09-15: the NOUN decides whether the carrier is bounded.**
   *
   *  - «על הצלע BC» / «על הקטע BC» — between `B` and `C`;
   *  - «על הישר BC» — anywhere on the infinite line, including beyond either end.
   *
   * Either way the point has ONE degree of freedom: the bound is a REGION and consumes none, so it
   * rides as a `between` selector beside the collinearity constraint rather than inside it. A bounded
   * reading that dropped the DOF to 0 would be wrong in a way the cue would advertise.
   *
   * The operand vocabulary is `direction()`'s, not a second list of ways to name a segment — the same
   * resolver the relations use ([ADR-AG-024](../../docs/06c-decisions-analytic.md#adr-ag-024)), so
   * «הצלע AB» cannot come to mean one thing here and another there.
   */
  const on = ON_OBJECT_HE.exec(line) ?? ON_OBJECT_EN.exec(line);
  if (on) {
    const [, id, noun, operandRaw] = on;
    const operand = trim(operandRaw);
    const bounded = /צלע|קטע|side|segment/i.test(noun ?? '');
    const dir = direction(`${noun ?? ''} ${operand}`.trim()) ?? direction(operand);

    if (dir?.k === 'points') {
      const facts: Fact[] = [
        { t: 'declare', id, src: line },
        { t: 'constraint', k: { t: 'on-line-2pt', id, a: dir.a, b: dir.b }, src: line },
      ];
      // The bound, and ONLY when the noun carried one — the operator's ruling.
      if (bounded) {
        facts.push({ t: 'selector', sel: { kind: 'between', id, a: dir.a, b: dir.b }, src: line });
      }
      return made(facts);
    }

    if (dir?.k === 'curve') {
      return made([
        { t: 'declare', id, src: line },
        { t: 'constraint', k: { t: 'on-curve', id, curve: dir.id }, src: line },
      ]);
    }

    /**
     * The object given INLINE by its equation — «B על הישר y=x».
     *
     * The line is minted as an object so it draws and the panel carries it, exactly as #1066 chose for
     * «משוואת הישר AB היא y=2x». Its id is content-derived, so stating the same line twice — here and
     * in a sentence of its own — is ONE object (ADR-AG-023).
     *
     * The same plane-variables test the bare-equation branch uses, for the same reason: without it
     * «P is on the line to nowhere» would mint a curve out of prose (#1068).
     */
    const eq = operand.includes('=') ? equationExpr(operand) : null;
    if (eq && symbolsOf(eq).some((sym) => RESERVED_SYMBOLS.has(sym))) {
      const cid = `curve-${anonIndex(operand)}`;
      return made([
        // NOT stated (#1076): this line exists to put a point on a line, not to draw the line.
        { t: 'curve', id: cid, label: { name: '' }, curve: { eq }, stated: false, src: line },
        { t: 'declare', id, src: line },
        { t: 'constraint', k: { t: 'on-curve', id, curve: cid }, src: line },
      ]);
    }
    // An AXIS operand belongs to the rule below, which already owns that sentence; anything else is
    // not a thing a point can be on. Fall through rather than returning — a `return null` here would
    // exit `parseConstraint` entirely and skip the area, cevian and axis rules that follow.
  }

  const ang = ANGLE_HE.exec(line) ?? ANGLE_SIGN.exec(line) ?? ANGLE_EN.exec(line);
  if (ang) {
    const [, a, b, c] = ang;
    // Three letters: the middle one is the vertex and the outer two are the rays. That is the
    // universal reading of ∡ABC, and it needs no figure.
    if (b && c) {
      if (a === b || b === c || a === c) return refuse('repeated-vertex', line);
      return made([{ t: 'constraint', k: rightAngleAt(b, a, c), src: line }]);
    }
    // One letter: the figure decides which rays, so M1 does (see `apply`).
    if (!b && !c) return made([{ t: 'right-angle', id: a, src: line }]);
    // Two letters name no angle at all; saying so beats guessing which one was meant.
    return refuse('bad-operand', line);
  }

  const quad = QUADRANT_HE.exec(line) ?? QUADRANT_EN.exec(line);
  if (quad) {
    const [, id, ordSrc] = quad;
    const ord = ordSrc.toLowerCase().replace(/^ה/, '');
    const signs = QUADRANT_SIGNS[ord];
    if (signs) {
      const [px, py] = signs;
      return made([
        // It DECLARES, like every other rule that names a point on something (#1069) — a student
        // saying where a point is has introduced it.
        { t: 'declare', id, src: line },
        { t: 'selector', sel: { kind: 'axis-side', id, axis: 'x', positive: px }, src: line },
        { t: 'selector', sel: { kind: 'axis-side', id, axis: 'y', positive: py }, src: line },
      ]);
    }
  }

  const comp =
    COMPONENT_HE.exec(line) ??
    COMPONENT_EN.exec(line) ??
    COMPONENT_OF.exec(line) ??
    COMPONENT_SUB.exec(line);
  if (comp) {
    const [, axis, id, valueSrc] = comp;
    const value = parseExpr(normalizeMath(valueSrc));
    if (!value) return refuse('bad-equation', trim(valueSrc));
    // It DECLARES, like every rule that names a point and says where it is (#1069). The other
    // component is simply absent, which is what leaves it free.
    return made([
      { t: 'declare', id, src: line },
      {
        t: 'constraint',
        k: axis.toLowerCase() === 'x' ? { t: 'coord', id, x: value } : { t: 'coord', id, y: value },
        src: line,
      },
    ]);
  }

  const onKind = ON_KIND_HE.exec(line) ?? ON_KIND_EN.exec(line);
  if (onKind) {
    const kind = KIND_NOUNS[onKind[2].toLowerCase()];
    if (kind) {
      return made([
        { t: 'declare', id: onKind[1], src: line },
        { t: 'on-kind', id: onKind[1], kind, src: line },
      ]);
    }
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
    /**
     * The axis rule DECLARES its point too, as the general on-object rule above does (#1069).
     *
     * It did not, so «B נמצא על ציר ה-x» with no `B` yet answered `unknown-reference` while
     * «B נמצא על הישר y=x» introduced it — the same sentence shape behaving two ways, which is exactly
     * the drift #1069 warned about in keeping two rules for one sentence. The operator's #1066 ruling
     * settles which way: a sentence that NAMES a point on an object introduces it, with the freedom the
     * object leaves it. A `declare` for a point that already exists is absorbed, so nothing that worked
     * before changes.
     */
    const facts: Fact[] = [
      { t: 'declare', id, src: line },
      { t: 'constraint', k, src: line },
    ];
    if (sideSrc) {
      const positive = /חיובי|positive/i.test(sideSrc);
      facts.push({
        t: 'selector',
        sel: { kind: 'axis-side', id, axis: onX ? 'x' : 'y', positive },
        src: line,
      });
    }
    return made(facts);
  }

  return null;
}

/**
 * THE COLON-RATIO FAMILY (#1124) — «AC:CB = 3:2» and its two spoken spellings.
 *
 * Operator: *"the analytics tool doesnt support the ratio AC:CB=3:2"*. The MECHANISM was already here —
 * `length-eq` carries `AB = 10`, `AB = AC` and `2·AB = 3·CD` as one kind with different trees — and only
 * the notation was missing. 2-D has had all three forms since #519.
 *
 * ## The split is 2-D's, ported rather than reinvented
 *
 * | form | what it is | lowering |
 * | --- | --- | --- |
 * | «AC:CB = 3:2» | a RELATION between two lengths over points that already exist | one `length-eq` |
 * | «C מחלקת את AB ביחס 3:2» | a PLACEMENT that mints the divider | `declare` + `on-line-2pt` + `between` + the same `length-eq` |
 * | «היחס בין AC ל-CB הוא 3:2» | the exam's prose spelling of the placement | the same as the divider |
 *
 * Deciding by FORM rather than picking one lowering is what makes «C מחלקת את AB ביחס 3:2» a single
 * sentence: the bare colon references endpoints, the keyworded divider creates one.
 *
 * ## Why the constraint is `AC = (p/q)·CB` and not a new kind
 *
 * `AC:CB = p:q` means `|AC|/|CB| = p/q`, so `|AC| = (p/q)·|CB|` — which is exactly what «AC = 1.5CB»
 * already lowers to. The identity lock asserts the two produce the **same construction**, because a
 * second mechanism for one meaning is how two surfaces of a tool start disagreeing.
 *
 * ## Ordering is the whole risk, and it is why #1123 came first
 *
 * These run BEFORE `matchCurve`, whose bare-colon branch would otherwise claim «AC:CB = 3:2» as a line
 * named `AC` with the equation `CB = 3:2` — the reported bug, fixed in #1123 by making that branch
 * decline a tail that is not an equation in the plane's variables. Ordering here as well is belt and
 * braces; 2-D learned the same lesson the same way and says so in `dividesInRatio`'s own comment.
 *
 * No CAS is needed: `p` and `q` are literal digits and `p/q` is arithmetic, well inside ADR-AG-001 D1.
 */
const RATIO_PQ = String.raw`(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)`;
const RATIO_END = String.raw`\s*` + '$';

/**
 * The relation itself: |first| = (p/q)·|second|. Shared by all three spellings.
 *
 * **Built by CALLING `parseLengthExpr`, never by hand.** A hand-written tree looked right, printed
 * identically to the one «AC = 1.5CB» produces, and silently did nothing: `LengthExpr.terms[i]` is bound
 * to a PRIVATE-USE code point (`PLACEHOLDER_BASE`, U+E000), so the placeholder symbol's name is an
 * invisible character — and `JSON.stringify` renders it as an invisible glyph between the quotes, making
 * `name: ""` and `name: ""` look like the same string in every diff and every console.
 *
 * Measured: with the hand-built tree the constraint was simply not evaluated. `C` floated to wherever the
 * sampler put it (3.75 instead of 6.00 on `A(0,0) B(10,0)`), `unsatisfied` stayed **empty**, and the
 * construction printed byte-identical to the working one. Exactly the class
 * [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053) names: reproducing a decision instead of
 * calling it, agreeing with itself, and being wrong.
 *
 * Scaling wraps the REAL parsed expr rather than rebuilding it, so the result is identical to the
 * multiplication spelling by construction — which is what the identity lock asserts.
 */
const ratioFact = (
  first: [string, string],
  second: [string, string],
  p: number,
  q: number,
  src: string,
): Fact | null => {
  const left = parseLengthExpr(first[0] + first[1]);
  const right = parseLengthExpr(second[0] + second[1]);
  if (!left || !right) return null;
  const scaled: LengthExpr = {
    expr: { kind: 'mul', a: { kind: 'num', value: p / q }, b: right.expr },
    terms: right.terms,
  };
  return { t: 'constraint', k: { t: 'length-eq', left, right: scaled }, src };
};

/**
 * «AC:CB = 3:2» — a bare ratio between two named segments, no keyword.
 *
 * Anchored on the FULL `seg:seg = p:q` shape, so it never claims a lone segment, an equality, or a
 * `p:q` that lacks two named segments on the left.
 */
function parseRatioColon(line: string): Fact[] | null {
  const m = line.match(
    new RegExp(
      String.raw`^\s*([A-Z]\d?)\s*([A-Z]\d?)\s*:\s*([A-Z]\d?)\s*([A-Z]\d?)\s*=\s*` + RATIO_PQ + RATIO_END,
    ),
  );
  if (!m) return null;
  const p = Number(m[5]);
  const q = Number(m[6]);
  if (!(p > 0) || !(q > 0)) return null;
  const fact = ratioFact([m[1], m[2]], [m[3], m[4]], p, q, line);
  return fact ? [fact] : null;
}

/** The placement shared by the divider and prose spellings: `C` sits on `AB`, between its ends. */
function ratioDividerFacts(id: string, a: string, b: string, p: number, q: number, src: string): Fact[] | null {
  const ratio = ratioFact([a, id], [id, b], p, q, src);
  if (!ratio) return null;
  return [
    { t: 'declare', id, src },
    { t: 'constraint', k: { t: 'on-line-2pt', id, a, b }, src },
    { t: 'selector', sel: { kind: 'between', id, a, b }, src },
    ratio,
  ];
}

/**
 * «C מחלקת את AB ביחס 3:2» / "C divides AB in ratio 3:2", and the prose «היחס בין AC ל-CB הוא 3:2».
 *
 * Keyword-anchored on `מחלק`/`divides` or `יחס`/`ratio` PLUS a literal `p:q`, so neither spelling can
 * claim a plain segment or a bare equality.
 */
function parseDividesInRatio(line: string): Fact[] | null {
  // (a) divider-first — the one-liner that makes this worth having.
  const div = line.match(
    new RegExp(
      String.raw`([A-Z]\d?)\s+(?:מחלק[הת]?|divides?)\s+(?:את\s+)?(?:ה?(?:קטע|צלע)\s+)?([A-Z]\d?)\s*([A-Z]\d?)[\s\S]*?(?:ביחס|יחס|ratio)\D*?` +
        RATIO_PQ,
      'i',
    ),
  );
  if (div) {
    const p = Number(div[4]);
    const q = Number(div[5]);
    if (p > 0 && q > 0) return ratioDividerFacts(div[1], div[2], div[3], p, q, line);
  }

  /**
   * (b) sub-segments named — «היחס בין AC ל-CB הוא 3:2».
   *
   * The two segments SHARE the divider, and the host runs from the first's free end to the second's.
   * Refusing when they share no letter is deliberate: «היחס בין AB ל-CD הוא 3:2» is a relation between
   * two unrelated segments, not a division, and guessing which point to mint would be inventing a given.
   */
  const two = line.match(
    new RegExp(
      String.raw`(?:ה?יחס|ratio)[\s\S]*?([A-Z]\d?)([A-Z]\d?)\s*(?::|\/|ל-?|to|and|ו-?|,)\s*([A-Z]\d?)([A-Z]\d?)[\s\S]*?` +
        RATIO_PQ,
      'i',
    ),
  );
  if (two) {
    const [a1, b1, a2, b2] = [two[1], two[2], two[3], two[4]];
    const shared = [a1, b1].find((x) => x === a2 || x === b2);
    if (shared) {
      const start = a1 === shared ? b1 : a1;
      const end = a2 === shared ? b2 : a2;
      const p = Number(two[5]);
      const q = Number(two[6]);
      if (p > 0 && q > 0 && start !== end) return ratioDividerFacts(shared, start, end, p, q, line);
    }
  }
  return null;
}

export function parseLine(raw: string): ParseResult {
  const line = trim(raw);
  if (!line) return { ok: false, code: 'not-handled', detail: raw };

  const param = parseParamHe(line) ?? parseParamEn(line) ?? parseInequality(line);
  if (param) return { ok: true, facts: [param] };

  /**
   * A circle stated by its CENTRE runs before `matchCurve` (#1060), because that rule’s tail is
   * `(.+)` and it would read the centre letter as an equation — the #1059 shape, which the Hebrew
   * guard catches only when the tail HAS Hebrew in it. «נתון מעגל O» has none.
   */
  const centred = parseCircleAt(line);
  if (centred) return centred;

  /**
   * THE RATIO FAMILY RUNS BEFORE `matchCurve` (#1124).
   *
   * Its bare-colon branch would otherwise claim «AC:CB = 3:2» as a line named `AC` with the equation
   * `CB = 3:2` — the reported bug, fixed in #1123 by making that branch decline a tail that is not an
   * equation in the plane's variables. Ordering here as well is belt and braces, and it is what 2-D
   * does for the same reason.
   */
  const ratio = parseRatioColon(line) ?? parseDividesInRatio(line);
  if (ratio) return { ok: true, facts: ratio };

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
    /**
     * The CENTRE the student named, as a derived point on the curve they just gave (#1059).
     *
     * It is a real object because the student named it: they can then say «AO = 5» about it, and it
     * appears in the data panel with its coordinates like any other point they introduced. That is
     * the difference from #1024, which marks EVERY circle`s centre and mints nothing — an unnamed
     * centre must spend no letter.
     */
    const centre: Fact[] = curve.centre
      ? [{ t: 'derived', id: curve.centre, rule: { t: 'circle-centre', curve: curve.id }, src: line }]
      : [];

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
          /**
           * An UNNAMED curve carries its equation as its label (#1092), so the canvas can offer a
           * sentence about it. A named one does not: its name is how the student refers to it.
           */
          label: { name: curve.name, kind: curve.kind, ...(curve.name ? {} : { eqSrc: trim(curve.eqSrc) }) },
          curve: { kind: curve.kind, eq },
          // The student named the curve and gave its equation — this sentence IS the curve.
          stated: true,
          src: line,
        },
        ...through,
        ...centre,
      ],
    };
  }

  /**
   * Each rule answers one of three ways: facts, an owned refusal, or `null` for "not my sentence".
   * Only the third continues the chain — a rule that recognised the sentence and found it wrong
   * gets the last word, rather than having its refusal overwritten by `not-handled` downstream.
   */
  const matched =
    // `parseThroughLine` FIRST (#1093). «דרך P עובר ישר מקביל ל AB» ends in a relation phrase, so
    // RELATION_HE matches it with «דרך P עובר ישר» as its left operand and then refuses an operand
    // the student wrote perfectly — the swallowing defect #1059 records, and the relation rule's own
    // docblock gives the cure: a construction recognisable from a keyword no other rule uses costs
    // nothing to match early and removes the ambiguity entirely.
    parseThroughLine(line) ?? parseConstraint(line) ?? parseDerived(line) ?? parseShape(line) ?? parsePoints(line);
  if (matched) return matched;

  // NO constrained-shape refusal here any more (#1049). It existed because those nouns carried
  // givens the tool could not honour (ADR-AG-013); the registry honours them, so keeping it would
  // reject sentences the tool now understands. Removing it IS the fix, not a side effect of it.

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
  /**
   * **Maths has no words** (#1068).
   *
   * The symbol test below asks whether the plane’s variables are PRESENT. It was measured against
   * the corpus of GIVENS, where every line is maths, and it is right about all of them. It was never
   * measured against prose — and `expr.ts` multiplies by juxtaposition, so every letter of an English
   * sentence becomes a symbol:
   *
   *     "P is on the line y=x"  →  symbols [P,e,h,i,l,n,o,s,t,x,y]
   *     "my answer = x"         →  symbols [a,e,m,n,r,s,w,x,y]
   *
   * Both contain `x`, both passed, and both were DRAWN. «my answer = x» produced a line.
   *
   * So the branch must first ask whether the text is an equation at all. A space-delimited run of
   * three or more letters is a word, and no equation in this grammar contains one: `normalizeMath`
   * has already turned `sqrt` into `√` by the time this runs, and every parameter is a single letter.
   * Juxtaposed parameters (`2abc`) are NOT space-delimited and stay legal.
   *
   * Declining rather than refusing is deliberate: a sentence with words is not a malformed equation,
   * it is a sentence this rule has no claim on. It falls through to `not-handled` and the LLM seam,
   * which is what that seam is for.
   *
   * This is the `[IVX]` trap a third time ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)),
   * and the lesson is sharper than "measure it": **a discriminator measured only against the inputs it
   * was designed for has not been measured.**
   */
  const HAS_A_WORD = /(?:^|\s)[A-Za-z]{3,}(?=\s|$)/;

  const bare = equationExpr(line);
  if (bare && !HAS_A_WORD.test(normalizeMath(line)) && symbolsOf(bare).some((s) => RESERVED_SYMBOLS.has(s))) {
    return {
      ok: true,
      facts: [
        {
          t: 'curve',
          id: `curve-${anonIndex(line)}`,
          // Its equation is its name (#1092) — the same string `anonIndex` just hashed, so a
          // sentence the canvas offers about it re-parses to THIS object.
          label: { name: '', eqSrc: trim(line) },
          curve: { eq: bare },
          // A bare equation on a line of its own is the student asking for that curve.
          stated: true,
          src: line,
        },
      ],
    };
  }

  return { ok: false, code: 'not-handled', detail: line };
}
