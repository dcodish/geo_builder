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
import { isAngleRef, type AngleName, type Constraint, type Direction, type TangentLineRef } from '../engine/solve';
import { parseExpr, normalizeMath, symbolsOf, type Expr } from '../engine/expr';
import { RESERVED_SYMBOLS, directionSymbol, mentionsPlane } from '../engine/carriers';

/** A student's VALUE — a number or an expression in parameters, never the plane's x/y (#1496, `mentionsPlane`). */
function valueExpr(src: string): Expr | null {
  const e = parseExpr(normalizeMath(src));
  return e && !mentionsPlane(e) ? e : null;
}
import { constantLengthExpr, parseLengthExpr, type LengthExpr } from '../engine/lengths';
import { NUMERAL_ALT, ROMAN_ALT, isNumeralName, lineIdOf, lineNameOf, numeralCurveId, type NumeralKind } from '../engine/names';
import { CENTRE_SENTINEL, CIRCLE_SENTINEL, UNBOUNDED, circleDefPoints, diameterCircleId, factsWithin, incircleId, tangentLineId, type CurveKind, type Domain, type Fact, type Id, type Selector } from '../engine/types';
import { ANGLE_STEM_HE, ANY_POLYGON_NOUN, EN_SHAPE, SHAPES, normalizeShapeNoun, rightAngleAt, shapeRow } from '../engine/shapes';
import {
  centreClauses,
  diameterClauses,
  distributeClauses,
  elidedSubjectClauses,
  sharedSubjectClauses,
  isBareName,
  isProofTarget,
  orthography,
  originClauses,
  parenClauses,
  partitions,
  pointClauses,
  segmentsOf,
  shapeClauses,
  sideClauses,
  unwrap,
} from './frameAnalytic';

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
   * What the student is asked to PROVE — «הוכיחו כי OB ⊥ AC», «הראו כי …» (#1618, operator ruling 3
   * on #1616). The tool draws the givens; it is not a proof engine, and a claim typed as a statement
   * must never become a constraint.
   */
  | { code: 'proof-target'; detail: string }
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
   * A sentence that names a construct by the ROLE one point plays relative to an object, whose own
   * letters contradict the incidence that role requires — «BD תיכון לצלע AB» (#1231).
   *
   * Its OWN code, and not `repeated-vertex`: nothing repeats inside a run here. «AB» is a perfectly
   * good side and «BD» a perfectly good segment; what is wrong is the RELATION between them — a
   * median runs from a vertex to the OPPOSITE side, and `B` is an endpoint of `AB`. Telling the
   * student "the same letter appears twice" would send them to fix a run that is already correct.
   */
  | { code: 'degenerate-role'; detail: string }
  /**
   * A cevian named by its TRIANGLE whose apex is not one of that triangle's vertices — «XD תיכון
   * במשולש ABC» (#1165).
   *
   * Its own code because the two near neighbours would both say something untrue. «ABC» has exactly
   * three vertices, so `bad-arity`'s "a triangle has three vertices and a quadrilateral four"
   * describes a run that is already correct. And `degenerate-role` says the apex "lies on the side
   * itself", which it does not — `X` is not in the figure's triangle at all. What is actually
   * missing is the apex's membership, which is the ONE thing that makes the triangle spelling
   * determinate: remove the apex from the ring and the other two letters are the side.
   */
  | { code: 'apex-not-a-vertex'; detail: string }
  /**
   * A crossing the student asked to NAME that is a point the figure already names — «P נקודת החיתוך
   * של הישר AB עם הישר BC», where `AB` and `BC` meet at `B` (#1175).
   *
   * Its own code because it carries `holder`: the refusal's whole job is to tell the student WHICH
   * letter is already there, which is the information they are missing — the operator's ruling,
   * 2026-09-17 (*"AB and BC meet at B"*). A code with only a detail could not say it.
   *
   * NOT `already-named` (#1153): that one is about naming an object twice and its message tells the
   * student to delete a line and rewrite it, which is advice for a different mistake.
   */
  | { code: 'crossing-already-named'; detail: string; holder: string }
  /**
   * A crossing of a line WITH ITSELF (#1255) — «הישר AB עם הישר BA» names one line twice, and a line
   * has no crossing with itself, so the sentence defines no point. Owned, never `not-handled`: the
   * grammar read it, and the seam would ask a model to accept the very spelling just ruled out.
   */
  | { code: 'self-crossing'; detail: string }
  /**
   * A relation whose VERB was understood and whose operand was not — «DE מקביל לפיל» (#1052).
   *
   * Its own code because the student got the sentence shape right: telling them "I did not
   * understand" would send them to rewrite the relation, when the thing to fix is the operand.
   */
  | { code: 'bad-operand'; detail: string }
  /**
   * A shape noun that can never be inscribed in a circle, said to be inscribed in one (#1554 ruling 1, re-affirmed
   * 2026-10-01; ADR-AG-198) — «טרפז ישר זווית ABCD חסום במעגל». `shape` is the noun the student wrote and
   * `forced` the noun the circle would force (both registry keys, `notCyclic`), so the refusal names both.
   * Never drawn as the forced shape: that would be a figure drawn green for givens that cannot hold.
   */
  | { code: 'inscribed-contradicts-noun'; detail: string; shape: string; forced: string };

export type ParseResult = { ok: true; facts: Fact[] } | ({ ok: false } & ParseFailure);

/** A rule's answer: facts, an owned refusal, or `null` for "not my sentence — keep looking". */
type RuleOutcome = ParseResult | null;

const made = (facts: Fact[]): ParseResult => ({ ok: true, facts });
const refuse = (code: ParseFailure['code'], detail: string): ParseResult =>
  ({ ok: false, code, detail }) as ParseResult;

/**
 * A RULE OWNS ONLY WHAT IT PARSED (#1272, [ADR-AG-139](../../docs/06c-decisions-analytic.md#adr-ag-139)
 * — ADR-AG-114's claim gate, generalised to every claiming site).
 *
 * `refuse` is an OWNED answer: "I recognised your sentence and it is wrong". It is honest only about a
 * tail the rule actually read. Three tails a rule matched by its NOUN and never read, measured:
 *
 *   «פרבולה I: y^2=2x»          → `bad-equation` about «I: y^2=2x», an equation the student never wrote
 *   «נתון מעגל I - x^2+y^2=16»  → the connective read as a SIGN: a hyperbola labelled "circle", `out-of-scope`
 *   «שיפוע הישר AB הוא חיובי»   → `bad-equation` about a Hebrew word
 *
 * Each is terminal at the LLM seam — `not-handled` is the ONE code that escalates (#1251) — so a
 * mis-owning rule cost the student the escape the operator expects for minor deviations (#1271). The
 * answer is not to widen the seam (a genuinely owned refusal beats a guess — #1183's lesson) but to
 * make the claim honest. A tail is NOT the rule's to refuse when it
 *
 *   - carries Hebrew letters — a word, not an expression;
 *   - opens with a connective dash — a hyphen followed by a space, or any en/em dash;
 *   - opens with a NAME the rule did not consume, followed by a connective («I:», «AB -») — the
 *     plane's own variables excepted, so «y - 2x = 0» stays an equation.
 *
 * Then the rule answers `null`, the chain moves on, and the sentence reaches `not-handled`: the seam
 * fires by itself, with no change to the seam. A hyphen glued to its term («-x+y=1») is a sign and
 * stays claimable; the one spelling this leaves ambiguous is «מעגל I -x^2+…», which reads as a sign.
 */
const claimable = (tail: string): boolean => {
  const t = tail.trim();
  if (/[\u0590-\u05FF]/.test(t)) return false;
  if (/^(?:-\s|[–—])/.test(t)) return false;
  const lead = /^([A-Za-zℓ]+\d?)\s*(?::|\s[-–—]|[–—])/.exec(t);
  if (lead && !RESERVED_SYMBOLS.has(lead[1])) return false;
  return true;
};

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
/**
 * THE NOUNS THAT NAME A STRAIGHT OBJECT, WITH THE EXTENT EACH ONE MEANS (#1236 / #1234).
 *
 * `HE_LINE` used to be `ה?(?:ישר|אלכסון)` — a two-member list that decided whether a sentence was
 * UNDERSTOOD AT ALL. «משוואת הצלע BD היא 4x+5y=0» was `not-handled` while «משוואת הישר BD …» worked,
 * for one noun's difference, and the student had to guess a different word for the same thing.
 *
 * That list had already been fixed once, one member at a time: the comment #1070 left above it
 * records «אלכסון» being added for exactly this reason. «צלע», «קטע», «תיכון», «גובה», «שוק»,
 * «בסיס» and «יתר» were still missing, and adding three of them would have been the same fix a
 * fourth, fifth and sixth time.
 *
 * **A list is unavoidable here and the registry is what makes it safe.** An unknown noun MUST stay
 * `not-handled` — «משוואת הפיל BD היא …» may not mint anything — so the rule cannot simply accept
 * any word. What it can do is stop keeping the vocabulary in a regex, in one rule, with the
 * meaning of each noun decided somewhere else. Here every noun carries its own extent, so adding
 * one is a single row and its semantics arrive with it.
 *
 * **Operator ruling, 2026-09-19:** *"משוואת הישר should draw the line. משוואת הצלע or הקטע should
 * draw a segment (in not yet draw)"*, and — asked whether the infinite line still EXISTS behind a
 * bounded noun — *"only draws CE"*. So a bounded noun draws the segment and nothing else; see the
 * emit site for how the line survives as an undrawn carrier rather than as a second drawn object.
 *
 * «תיכון» and «גובה» are bounded by DEFINITION rather than by the ruling, which did not name them:
 * a median and an altitude are segments, and reading them as infinite lines would contradict every
 * other rule in the tree that draws them.
 */
const STRAIGHT_NOUNS: readonly { he: string; bounded: boolean }[] = [
  { he: 'ישר', bounded: false },
  { he: 'אלכסון', bounded: false },
  { he: 'צלע', bounded: true },
  { he: 'קטע', bounded: true },
  { he: 'תיכון', bounded: true },
  { he: 'גובה', bounded: true },
  { he: 'שוק', bounded: true },
  { he: 'בסיס', bounded: true },
  { he: 'יתר', bounded: true },
];
/** The nouns as an alternation — DERIVED from the registry, so the two can never drift. */
const HE_LINE = `ה?(?:${STRAIGHT_NOUNS.map((n) => n.he).join('|')})`;
/** What extent a captured noun means. An unrecognised or absent noun decides nothing. */
const extentOfNoun = (noun: string | undefined): 'line' | 'segment' | undefined => {
  const hit = noun ? STRAIGHT_NOUNS.find((n) => noun.includes(n.he)) : undefined;
  return hit ? (hit.bounded ? 'segment' : 'line') : undefined;
};
/** «המעגל» / «מעגל». */
const HE_CIRCLE = 'ה?מעגל';
/** «שמשוואתו» / «שמשוואתה» / «משוואת» / «שמשוואת» — the "whose equation is" connector. */
const HE_EQ_OF = '(?:ש?משוואת(?:ו|ה)?)';
/** «הוא» / «היא» / «הם» / «הן» — the copula, optional. */
/**
 * THE CLOSED SET OF WORDS THAT MEAN "IS" (#1260).
 *
 * Every rule that admits a Hebrew copula reads it from HERE. Before #1260 the vocabulary was
 * spelled inline in each rule, which is how `LENGTH_EQ` came to admit a literal `=` and nothing
 * else while `AREA_HE` beside it admitted the words and not the `=`: the same sentence shape,
 * two different answers, decided by which rule happened to spell what.
 *
 * «שווה» / «שווה ל-» is part of the set, not a separate case — `AREA_HE` already
 * treated it as one.
 */
const COPULA_WORDS = 'הוא|היא|הם|הן|הינו|הינה|הינם|הינן|שווה(?:\\s*ל\\s*-?)?';
/** A copula as an OPTIONAL suffix of a noun phrase — the long-standing spelling, now sourced from the set. */
const HE_IS = `(?:\\s*(?:${COPULA_WORDS}))?`;

/** A point/vertex name: a capital letter with an optional digit subscript (`F1`, `D2`). */
const NAME = '[A-Z][0-9₀-₉]?';
/**
 * A NUMERAL naming a line — the exam's own «הישר 1» / «הישר I» (#1298, #1318; ADR-AG-144).
 *
 * Operator ruling, 2026-09-21: *a digit MAY name a line or a circle* — the student is copying the exam,
 * and a digit name is not invented by the tool, it is theirs. The Roman range mirrors the circle's
 * (`CIRCLE_NUMERALS`), for the circle's reason.
 *
 * The SEPARATOR LOOKAHEAD is the whole safety of the token, and it is the fourth time this file
 * records why ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)): «הישר 2x-y+8=0» begins
 * with a digit that is a COEFFICIENT, and only the `x` after it says so. Without the lookahead the
 * numeral branch would claim `2` as the name and hand `x-y+8=0` to the student as their equation.
 */
// ONE numeral table for every named curve (engine/names.ts, operator ruling 2026-09-29): 1–9 and I–IX.
const LINE_NUMERAL = `(?:${NUMERAL_ALT})`;
const LINE_NUMERAL_RE = new RegExp(`^${LINE_NUMERAL}$`);
/**
 * A line name: `ℓ`, `ℓ1`, `l`, `l1`, a numeral, or a two-point run like `AC`.
 *
 * THE NUMERAL ALTERNATIVE COMES BEFORE THE TWO-POINT ONE, and that order is a decision (#1318): `II`
 * and `IV` are Latin capitals, so the two-point run read them as *"the line through I and I"* and
 * minted a phantom point `I` the student never wrote. A Roman numeral in the name slot is a NUMERAL; a
 * line through the points I and V is not a sentence the corpus writes, and it is still sayable by its
 * points («הישר העובר דרך I ו-V» is #1281's converse).
 */
const LINE_NAME = `(?:[ℓl][0-9]?|${LINE_NUMERAL}(?=[\\s:,]|$)|[A-Z][0-9₀-₉]?[A-Z][0-9₀-₉]?)`;
/**
 * The name slot of the NOUN-LESS forms («משוואת AB היא …», «AB: …») keeps the pre-numeral token: with
 * the noun dropped, a Roman numeral is a CIRCLE («משוואת I היא x²+y²=9», #1072) and the circle branch
 * below owns it. A numeral names a LINE only where the student wrote the line noun.
 */
const LINE_NAME_PLAIN = '(?:[ℓl][0-9]?|[A-Z][0-9₀-₉]?[A-Z][0-9₀-₉]?)';

// How a numeral-named line is CALLED («ישר 1» / «line 1») is `lineNameOf` in engine/names.ts (#1350), so
// `nameReading` inverts it from the same table.

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
  /**
   * A CAPITAL IS A POINT'S NAME, NEVER A PARAMETER (#1496, ADR-AG-163).
   *
   * Parameters in this grammar are lowercase (`k הוא פרמטר`, `2ax`, `y^2=2px`); a capital letter is what
   * names a point (`NAME`). So an "equation" whose symbols include a capital is prose or a point reference
   * read letter by letter: «AB is y=x-4», once the length rule declined it, came here as the curve
   * `A·B·i·s·y = x−4` — four invented parameters and the stated line nowhere. Declining sends it to
   * `not-handled` and the LLM seam, which is what #1068 intended for words.
   */
  if ([...symbolsOf(a), ...symbolsOf(b)].some((s) => /^[A-Z]/.test(s))) return null;
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
   * «משוואת המעגל היא …» — the equation of THE circle, definite and unnamed (#1633, ADR-AG-196): a statement
   * about the circle the figure has when it has one, lowered through `the-circle`; only with none is it the
   * circle's own creation.
   */
  contextual?: boolean;
  /**
   * WHAT THE NOUN SAID THE OBJECT IS (#1234) — `'line'` infinite, `'segment'` bounded, `undefined`
   * when the student wrote no noun and the extent must be inherited from what the figure already
   * holds. `direction()` deliberately discards the noun, so routing the operand through it alone
   * would throw away exactly the information the operator's ruling turns on; the noun is captured
   * separately instead — the split `ON_OBJECT` already uses for its `bounded` decision.
   */
  extent?: 'line' | 'segment';
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
 *
 * ARABIC DIGITS NAME A CIRCLE TOO (#1216). **Operator ruling, 2026-09-19:** *"I think the rule of I,
 * II, III for circle names AND 1,2,3 are ok. so נתון מעגל 1 should be ok too. any other capital
 * letters would become the name of the center."* This EXTENDS [#1059](../../docs/06c-decisions-analytic.md)
 * rather than changing it — the set of tokens that NAME a circle grows; every other capital letter
 * still means the centre.
 *
 * Digits are in a stronger position than the Roman letters, which is why they need no new machinery:
 * `NAME` is `[A-Z][0-9]?`, so a bare digit **cannot be a point name at all** and «מעגל 1» has no
 * competing centre reading to be told apart from. `I` and `V` ARE legal point names, which is
 * exactly why #1059 needed an ordered pair of rules and a case-sensitive lookahead.
 *
 * The range is **1–5, mirroring the Roman range exactly** — that range was itself chosen from corpus
 * evidence about how many circles one question carries, so the two halves of the token have one
 * justification instead of two. Widening it is a one-character edit if a question ever needs it.
 *
 * The separator lookahead is what keeps this safe, and it is doing more work now than it was: it is
 * the whole reason «המעגל 4x^2+4y^2=1» is not read as a circle named 4 — the `x` after the digit is
 * not a separator, so the numeral branch cannot claim it. That is the digit twin of the trap the
 * paragraph above records.
 */
/** The numerals themselves, for the lookahead that keeps a NAME from eating one (#1059). */
const CIRCLE_NUMERALS = `(?:${NUMERAL_ALT})`;
/**
 * What may FOLLOW a name in the name slot: a space, a colon, or a COMMA — «נתונה פרבולה I, שמשוואתה …»
 * (#1514 pre-play). The comma was missing, so the textbook's own punctuation refused `not-handled`.
 */
const NUMERAL_SEP = '(?=[\\s:,])';
const CIRCLE_NUMERAL_RUN = `(?:(${NUMERAL_ALT})${NUMERAL_SEP})?`;
/**
 * THE CONNECTIVE between a named curve and its equation — ONE grammar for every naming clause
 * (lines, circles, conics, a circle's centre letter), so a connective one clause accepts every clause
 * accepts (#1514 pre-play: the conic clause lacked the «משוואת» prefix the circle had, and every
 * clause lacked the comma). An optional comma, the dash («נתונה פרבולה I - y^2=2x»), «שמשוואתה», the
 * copula (`COPULA_WORDS`), a colon — each optional, in the order the textbook writes them.
 */
const NAMING_TAIL_HE = `(?:\\s*,)?(?:\\s+[-–](?=\\s))?\\s*(?:${HE_EQ_OF})?${HE_IS}\\s*:?\\s*`;
const NAMING_TAIL_EN = '(?:\\s*,)?(?:\\s+[-–](?=\\s))?\\s*:?\\s*(?:is\\s+|whose equation is\\s+)?';

/**
 * «משוואת המעגל היא …» · «נתונה משוואת המעגל: …» — the equation PREDICATED of THE circle (#1633, ADR-AG-196): a
 * copula or a colon after «המעגל». Without one («משוואת המעגל x²+y²=25», the catalog's naming form) the phrase
 * names a circle by its equation and keeps creating it.
 */
const CONTEXTUAL_CIRCLE_EQ_HE = new RegExp(`^${HE_GIVEN}${HE_EQ_OF}\\s+המעגל(?:\\s+הנתון)?\\s*(?::|\\s(?:היא|הוא)(?=[\\s:]))`);

function matchCurve(line: string): CurveHit | null {
  // --- line: «נתון הישר ℓ1: 4y-3x-20=0» · «משוואת הישר AC היא y=-2x+8» · «הישר x=-4» ---
  const heLineNamed = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?(${HE_LINE})\\s+(${LINE_NAME})${NAMING_TAIL_HE}(.+)$`),
  );
  if (heLineNamed) {
    return {
      id: lineIdOf(heLineNamed[2]),
      name: lineNameOf(heLineNamed[2], 'he'),
      kind: 'line',
      eqSrc: heLineNamed[3],
      extent: extentOfNoun(heLineNamed[1]),
    };
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
    new RegExp(`^${HE_GIVEN}${HE_EQ_OF}\\s+(${LINE_NAME_PLAIN})${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heNamedNoNoun) {
    return {
      id: lineIdOf(heNamedNoNoun[1]),
      name: lineNameOf(heNamedNoNoun[1], 'he'),
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
  const heNamedColon = line.match(new RegExp(`^${HE_GIVEN}(${LINE_NAME_PLAIN}):\\s*(.+)$`));
  if (heNamedColon) {
    const tail = heNamedColon[2];
    const colonEq = tail.includes('=') ? equationExpr(tail) : null;
    if (colonEq && symbolsOf(colonEq).some((sym) => RESERVED_SYMBOLS.has(sym))) {
      return {
        id: lineIdOf(heNamedColon[1]),
        name: lineNameOf(heNamedColon[1], 'he'),
        kind: 'line',
        eqSrc: tail,
      };
    }
    // Not an equation in the plane's variables — this rule has no claim on the sentence. Fall through.
  }

  const heLineBare = line.match(new RegExp(`^${HE_GIVEN}(${HE_LINE})\\s+(.+=.+)$`));
  if (heLineBare) {
    // An ANONYMOUS straight given by its equation alone: there are no endpoints to bound it between,
    // so a bounded noun has nothing to draw a segment over and the line is what the student gets.
    return { id: `curve-${anonIndex(heLineBare[2])}`, name: '', kind: 'line', eqSrc: heLineBare[2] };
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
  if (enLine) return { id: lineIdOf(enLine[1]), name: lineNameOf(enLine[1], 'en'), kind: 'line', eqSrc: enLine[2] };
  const enLineBare = line.match(/^(?:the\s+)?line\s+(.+=.+)$/i);
  if (enLineBare) {
    return { id: `curve-${anonIndex(enLineBare[1])}`, name: '', kind: 'line', eqSrc: enLineBare[1] };
  }

  /** The circle numeral with the noun dropped — «משוואת I היא x^2+y^2=9» (#1072). */
  const heCircleNoNoun = line.match(
    new RegExp(`^${HE_GIVEN}${HE_EQ_OF}\\s+(${ROMAN_ALT})${HE_IS}\\s*:?\\s*(.+)$`),
  );
  if (heCircleNoNoun) {
    return {
      id: numeralCurveId('circle', heCircleNoNoun[1]),
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
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?${HE_CIRCLE}\\s+(?!${CIRCLE_NUMERALS}${NUMERAL_SEP})(${NAME})${NAMING_TAIL_HE}(.+)$`),
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

  /**
   * ONE NAMING CLAUSE FOR EVERY NUMERAL-NAMED CURVE, per language (#1271, ADR-AG-170 + Amendment 1).
   *
   * «נתון מעגל I שמשוואתו …», «נתונה פרבולה I - y^2=2x», «משוואת האליפסה II: …». Before the #1514
   * pre-play the circle and the conics each had a clause, and they had drifted exactly the way two
   * copies drift: the circle's took the «משוואת» PREFIX and the conics' did not, so «משוואת הפרבולה I
   * היא y^2=2x» was `not-handled` beside a working «משוואת המעגל I היא …». Now the noun is an
   * alternation and the prefix, the numeral, the separators and the connective set are spelled once
   * (`NAMING_TAIL`), so a spelling one curve accepts every curve accepts.
   *
   * Operator: *"since we can have more than 1 parabola on a diagram, we need to support things like
   * «נתונה פרבולה I - y^2=2x»"*, widened 2026-09-20: *"we need to support all such forms of
   * writing."* The numeral is optional (an anonymous curve keeps its content id — D6/#1026: two
   * different unnamed parabolas are two objects, and restating one is still one), the noun's gender
   * is not enforced («נתון פרבולה» meant the parabola), and the id goes through `numeralCurveId`, so
   * «פרבולה 1» and «הפרבולה I» are one parabola (ADR-AG-168's circle policy, for every kind). The
   * LABEL keeps the student's own numeral.
   *
   * The KIND recorded here is the student's CLAIM, not the answer: `classify` fits the equation and
   * a mismatch — «פרבולה I שמשוואתה x^2+y^2=16» — is refused naming what the equation describes
   * (02c R7, `kind-mismatch`).
   */
  const heNamed = line.match(
    new RegExp(`^${HE_GIVEN}(?:${HE_EQ_OF}\\s+)?ה?(מעגל|פרבולה|אליפסה)(?:\\s+קנונית)?\\s*${CIRCLE_NUMERAL_RUN}${NAMING_TAIL_HE}(.+)$`),
  );
  if (heNamed) {
    const kind = KIND_NOUNS[heNamed[1]] as NumeralKind;
    const numeral = heNamed[2] ?? '';
    return {
      id: numeral ? numeralCurveId(kind, numeral) : `curve-${anonIndex(heNamed[3])}`,
      name: numeral ? `${heNamed[1]} ${numeral}` : '',
      kind,
      eqSrc: heNamed[3],
      ...(kind === 'circle' && !numeral && CONTEXTUAL_CIRCLE_EQ_HE.test(line) ? { contextual: true } : {}),
    };
  }

  // The English centre form, for the same reason and with the same numeral exclusion (#1059).
  const enCircleCentre = line.match(
    new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s+(?!${CIRCLE_NUMERALS}${NUMERAL_SEP})(${NAME})${NAMING_TAIL_EN}(.+)$`),
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

  /**
   * The English twin — NOT `i`-flagged: a whole-pattern `i` lets the numeral alternation read a
   * lowercase `i`/`v` as a name (the ADR-AG-006 / #1093 trap), so the words carry their own case.
   */
  const enNamed = line.match(
    new RegExp(`^(?:[Tt]he\\s+)?(?:[Cc]anonical\\s+)?([Cc]ircle|[Pp]arabola|[Ee]llipse)\\s*${CIRCLE_NUMERAL_RUN}${NAMING_TAIL_EN}(.+)$`),
  );
  if (enNamed) {
    const noun = enNamed[1].toLowerCase();
    const kind = KIND_NOUNS[noun] as NumeralKind;
    const numeral = enNamed[2] ?? '';
    return {
      id: numeral ? numeralCurveId(kind, numeral) : `curve-${anonIndex(enNamed[3])}`,
      name: numeral ? `${noun} ${numeral}` : '',
      kind,
      eqSrc: enNamed[3],
    };
  }

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
/** The English shape nouns, longest first — DERIVED from the registry (read by the concurrency and measure roles). */
const ROLE_SHAPE_EN = [...Object.keys(EN_SHAPE), 'polygon'].sort((a, b) => b.length - a.length).join('|');

const splitNames = (run: string): string[] => run.match(/[A-Z][0-9₀-₉]?/g) ?? [];

/**
 * The concurrency points, keyed by the role noun the corpus uses.
 *
 * Each entry says how many vertices the construct needs, so a miscounted statement
 * («מפגש התיכונים במרובע ABCD») is refused rather than quietly reading the first three.
 */
const ROLES: Array<{ he: RegExp; en: RegExp; t: DerivedRule['t']; n: number }> = [
  { he: /ה?תיכונ(?:ים|י)/, en: /centroid|medians/i, t: 'centroid', n: 3 },
  { he: new RegExp(`חוצי\\s+ה?${ANGLE_STEM_HE}ות`), en: /incent(?:re|er)|angle\s+bisectors/i, t: 'incentre', n: 3 },
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
/*
 * The CIRCLE slot reads the one numeral table (#1529, ADR-AG-179). It read `NAME` only, which is a
 * capital letter — so «I» and «V» worked by the accident of being letters, and «1», «2» and «II»–«IX»
 * were `not-handled`, while `centresOf` offered exactly those sentences as rings (a click that
 * fails, ADR-AG-054). NAME first, so a single capital keeps its old reading (and its old id); a
 * numeral only after the noun, because a numeral needs its noun (#1298).
 */
const CENTRE_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מרכז\\s+(?:(?:ה?מעגל\\s+)?(${NAME})|ה?מעגל\\s+(${NUMERAL_ALT}))$`,
);
const CENTRE_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+cent(?:re|er)\\s+of\\s+(?:(?:circle\\s+)?(${NAME})|circle\\s+(${NUMERAL_ALT}))$`,
  'i',
);

/**
 * «O מרכז המעגל» · «O היא מרכז המעגל» · «P מרכז המעגל x^2+y^2=16» · «P מרכז המעגל שמשוואתו …» · "O is the
 * centre of the circle (x^2+y^2=16)" — the centre of the circle the figure HAS, named (#1598, #1619 B1).
 *
 * The named form above («O מרכז המעגל I») needs a name the student may not have: an equation circle is
 * anonymous, and «המעגל» is how the exam refers to its one circle. Which circle is M1's question
 * (`centre-of`) — by the equation when the sentence carries one, through the ADR-AG-023/#1342 identity
 * resolver, else the one circle. The creation sentence the student would otherwise have typed rides along
 * as `create`, lowered here by the rule that owns it, so a figure with no such circle gets exactly that
 * circle and no second lowering of it exists.
 */
const CENTRE_CTX_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מרכז\\s+(?:של\\s+)?ה?מעגל(?:\\s+(?:${HE_EQ_OF}${HE_IS}\\s*:?\\s*)?(.+))?$`,
);
const CENTRE_CTX_EN = new RegExp(
  `^(?:[Tt]he\\s+)?(?:[Pp]oint\\s+)?(${NAME})\\s+is\\s+the\\s+cent(?:re|er)\\s+of\\s+the\\s+circle(?:\\s+(?:whose\\s+equation\\s+is\\s+)?(.+))?$`,
);

function centreOfCircle(line: string): RuleOutcome {
  const m = CENTRE_CTX_HE.exec(line) ?? CENTRE_CTX_EN.exec(line);
  if (!m) return null;
  const [, id, tail] = m;
  // Only a creation that NAMES this centre is the statement — «מעגל I שמשוואתו …» reads I as the circle's
  // numeral, and would create a circle with no centre named at all.
  const created = (sentence: string): Fact[] | undefined => {
    const r = parseClause(sentence);
    if (!r.ok || !r.facts.flatMap(factsWithin).some((f) => (f.t === 'derived' || f.t === 'circle-at' || f.t === 'declare') && ('centre' in f ? f.centre : f.id) === id)) return undefined;
    return r.facts.map((f) => ({ ...f, src: line }));
  };
  if (tail === undefined) {
    const create = created(`נתון מעגל שמרכזו ${id}`);
    return made([{ t: 'centre-of', id, ...(create ? { create } : {}), src: line }]);
  }
  // A tail must be the circle's EQUATION (in the plane's variables) — anything else is not this sentence.
  const src = trim(tail);
  if (!src.includes('=')) return null;
  const eq = equationExpr(src);
  if (!eq || !symbolsOf(eq).some((s) => RESERVED_SYMBOLS.has(s))) return null;
  const create = created(`נתון מעגל ${id} שמשוואתו ${src}`);
  return made([{ t: 'centre-of', id, eq, ...(create ? { create } : {}), src: line }]);
}

/**
 * `M מפגש התיכונים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD` · `M מפגש האלכסונים במרובע` ·
 * `M מפגש האלכסונים` (#1283).
 *
 * Only the POINT and the head word are read here; everything after «מפגש» is the SUBJECT, read by
 * `concurrencyOf` — the same reader the verb form's subject goes through. The shape tail used to be
 * part of this regex and REQUIRED its letters, so the noun phrase could resolve its shape only from
 * the sentence while the verb form resolved it from the figure: two spellings #1070 calls identical,
 * two mechanisms, and «M מפגש האלכסונים» went to the LLM.
 */
const CONCURRENCY_HE = new RegExp(`^${HE_POINT}(${NAME})${HE_IS}\\s*(?:נקודת\\s+)?מפגש\\s+(.+)$`);
const CONCURRENCY_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+(?:(?:intersection|meeting)(?:\\s+point)?\\s+of\\s+(?:the\\s+)?)?(.+)$`,
  'i',
);

/**
 * WHAT A CONCURRENCY ROLE IS OF — the tail after the role noun, in either form (#1283).
 *
 * «אלכסוני המרובע ABCD» · «האלכסונים במרובע ABCD» · «האלכסונים במרובע» · «האלכסונים» ·
 * «the diagonals of quadrilateral ABCD» · «the diagonals of the quadrilateral» · «the diagonals».
 * The shape NOUN and its LETTERS are each optional: letters name the ring; a noun alone (or
 * nothing) leaves the ring to the figure, resolved at M1 (`meet-of`).
 */
const ROLE_OF_HE = new RegExp(`^\\s*(?:(?:ב-?|של)\\s*)?(?:ה?([א-ת]+(?:[- ][א-ת]+){0,2}))?\\s*(${NAME_RUN})?$`);
const ROLE_OF_EN = new RegExp(
  `^\\s*(?:of\\s+)?(?:the\\s+)?(?:(${ROLE_SHAPE_EN})(?=\\s|$))?\\s*(${NAME_RUN})?$`,
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
 * student's back. The word lowers to the `crossing-nth` selector below (#1268), which picks that root
 * on its own; a sentence without one gets `crossing-distinct`. It is non-capturing so the operand groups
 * keep their indices — `ordinalOf` reads the word beside the match.
 */
const NTH_HE = '(?:ה?ראשונה|ה?שניי?ה|ה?אחרת)?';
/**
 * WHICH ROOT the ordinal names (#1268): 0 for «הראשונה»/«first», 1 for «השנייה»/«second», `null` when the
 * sentence names none — «האחרת»/«other» says only "not its sibling", which is `crossing-distinct`'s job.
 * Read beside the match rather than as a capture, so the operand groups keep their indices.
 */
function ordinalOf(line: string): 0 | 1 | null {
  const he = /חיתוך\s*(ה?ראשונה|ה?שניי?ה)(?=\s|$)/.exec(line);
  if (he) return /ראשונה/.test(he[1]) ? 0 : 1;
  const en = /\bthe\s+(first|second)\s+intersection\b/i.exec(line);
  if (en) return en[1].toLowerCase() === 'first' ? 0 : 1;
  return null;
}
/**
 * THE CONNECTIVE ADMITS THE CLITIC «ו» AS IT IS WRITTEN (#1429). The old form demanded whitespace
 * on both sides (`\s+ו-?\s+`), so «ו-l2» and «והישר l2» — the two commonest spellings — never
 * matched and the whole sentence fell to `not-handled`. The lookahead keeps «ונקודה…» prose out:
 * the clitic joins an operand only when an operand follows it.
 */
const INTERSECT_JOIN = '(?:\\s+עם\\s+|\\s+ו\\s+|\\s+ו-\\s*|\\s+ו(?=ה|ל|צ|מ|פ|א))';
/**
 * «B היא אחת מנקודות החיתוך של המעגל עם ציר ה-y» (#1619 B1) — "one of the crossings" names a crossing and
 * says nothing about WHICH: it is the sentence without an ordinal, so it is read as that sentence (the
 * `crossing-distinct` reading, and which root it takes is the configuration's — «הציגו תצורה אחרת»).
 */
const ONE_OF_HE = '(?:אחת\\s+מ-?\\s*)?';
const INTERSECT_HE = new RegExp(
  `^${HE_POINT}(${NAME})${HE_IS}\\s*${ONE_OF_HE}(?:ה?נקודת|ה?נקודות)?\\s*ה?חיתוך\\s*${NTH_HE}\\s*(?:של\\s+)?(.+?)${INTERSECT_JOIN}(.+)$`
);
const INTERSECT_EN = new RegExp(
  `^(?:point\\s+)?(${NAME})\\s+is\\s+(?:the\\s+(?:first\\s+|second\\s+|other\\s+)?intersection\\s+(?:point\\s+)?|one\\s+of\\s+the\\s+(?:intersection\\s+points|intersections|points\\s+of\\s+intersection)\\s+)of\\s+(.+?)\\s+(?:and|with)\\s+(.+)$`
,  'i',
);

/**
 * One operand of an intersection, as the incidence it means.
 *
 * The axis cases carry NUMERIC coefficients because an axis needs no figure to be known; everything
 * else goes through `direction()` — the same resolver the relations use — so «הישר AB», «הצלע AB»
 * and «הישר l1» mean here exactly what they mean there, and cannot drift.
 */
/** The nouns that mean the DRAWN piece rather than the infinite line (#1168, ADR-AG-111’s pair). */
const BOUNDED_NOUN = /^(?:ה?צלע|ה?קטע|ה?בסיס|(?:the\s+)?(?:side|segment|base))\s/i;

/** A CONTEXTUAL operand — «המעגל», «הפרבולה» with no name: which curve is M1's question (#1429). */
type KindOperand = { t: 'kind'; kind: 'circle' | 'parabola' | 'ellipse' | 'tangent'; circle?: string };

// «המעגל 1» and «המעגל I» are one circle (#1429) — the digit→Roman map now lives in `engine/names.ts`
// (`numeralCurveId`), shared by the mint and every reference site, for every numeral-named kind.

function incidenceOn(operand: string, id: Id): Constraint | KindOperand | null {
  // «המשיק למעגל בנקודה A» — the tangent object at A; bare «המשיק» — the one in the figure (#1619 B3).
  const tangent = readTangentNoun(trim(operand));
  if (tangent) return tangent.at ? { t: 'on-curve', id, curve: tangentLineId(tangent.at) } : { t: 'kind', kind: 'tangent' };
  const axis = AXIS_HE.exec(trim(operand)) ?? AXIS_EN.exec(trim(operand));
  if (axis) {
    return axis[1].toLowerCase() === 'x'
      ? { t: 'on-line', id, a: 0, b: 1, c: 0 }
      : { t: 'on-line', id, a: 1, b: 0, c: 0 };
  }
  /**
   * A CONTEXTUAL kind noun (#1429) — «עם המעגל» in a crossing. `ON_KIND` could read the whole
   * sentence «P על המעגל» and nothing could read the same reference as an OPERAND, which is the
   * three-resolvers defect this issue names. Answered here as a marker the caller lowers to the
   * fold-resolved fact, so the crossing and the point-on sentence share one M1 resolution.
   */
  const kindWord = /^ה(מעגל|פרבולה|אליפסה)$/.exec(trim(operand)) ?? /^(?:the\s+)?(circle|parabola|ellipse)$/i.exec(trim(operand));
  if (kindWord) {
    const kind = KIND_NOUNS[kindWord[1].toLowerCase()];
    if (kind && kind !== 'line') return { t: 'kind', kind: kind as KindOperand['kind'] };
  }
  /**
   * A CURVE by its numeral — «המעגל I», «הפרבולה 2», «the ellipse II». `direction()` resolves lines and
   * axes, because that is all a RELATION can be about; an incidence can be about any curve, so the
   * naming forms `matchCurve` mints are mapped here to the SAME ids, through the same
   * `numeralCurveId` the mint uses (#1271, #1514 pre-play) — two id rules would build two objects for
   * one curve (the ADR-AG-023 defect), which is exactly what «פרבולה 1» + «הפרבולה I» did. The English
   * nouns carry their own case: a whole-pattern `i` would read a lowercase `i` as the numeral I.
   */
  const named =
    new RegExp(`^ה?(מעגל|פרבולה|אליפסה)\\s+(${NUMERAL_ALT})$`).exec(trim(operand)) ??
    new RegExp(`^(?:[Tt]he\\s+)?([Cc]ircle|[Pp]arabola|[Ee]llipse)\\s+(${NUMERAL_ALT})$`).exec(trim(operand));
  if (named) return { t: 'on-curve', id, curve: numeralCurveId(KIND_NOUNS[named[1].toLowerCase()] as NumeralKind, named[2]) };
  /**
   * A circle by its CENTRE LETTER — «מעגל M», «המעגל M», "circle M" (#1619 B1). The exam names a circle by
   * its centre («נתון מעגל שמרכזו M … A על מעגל M»), and which circle that is — `circle-at-M`, or an
   * equation circle whose centre was named M — only the figure knows, so it rides the contextual marker
   * with the name and M1 resolves it through the one name chain. A numeral is read above, first.
   */
  const byCentre =
    new RegExp(`^ה?מעגל\\s+(${NAME})$`).exec(trim(operand)) ?? new RegExp(`^(?:[Tt]he\\s+)?[Cc]ircle\\s+(${NAME})$`).exec(trim(operand));
  if (byCentre) return { t: 'kind', kind: 'circle', circle: byCentre[1] };

  const dir = direction(trim(operand));
  if (dir?.k === 'curve') return { t: 'on-curve', id, curve: dir.id };
  /**
   * #1168: `direction()` deliberately forgets the noun — «הישר AC» and «הצלע AC» relate the same
   * direction, and for a RELATION that is right. For an INCIDENCE it is not: the operator ruled that
   * the noun decides which root a named crossing comes up on, so the boundedness is read here, where
   * the operand text is still available, rather than by widening `direction` for every caller.
   */
  if (dir?.k === 'points') {
    const bounded = BOUNDED_NOUN.test(trim(operand));
    return { t: 'on-line-2pt', id, a: dir.a, b: dir.b, ...(bounded ? { bounded: true } : {}) };
  }

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
      /**
       * The equation RIDES the constraint (#1429): the apply boundary resolves it to an EXISTING
       * curve with the same equation (a named circle referenced by its equation is THAT circle,
       * ADR-AG-023/#1342), and mints the curve `stated: false` when the figure has none — so this
       * operand never again refuses `unknown-reference` with a `curve-anon…` id the student never
       * wrote (#1145's class).
       */
      return { t: 'on-curve', id, curve: `curve-${anonIndex(bare)}`, eqSrc: bare, eq };
    }
  }
  return null;
}

function parseIntersection(line: string): RuleOutcome {
  const spelled = intersectionSpellings(line);
  if (spelled) return spelled;
  const m = INTERSECT_HE.exec(line) ?? INTERSECT_EN.exec(line);
  if (!m) return null;
  const [, id, leftRaw, rightRaw] = m;
  /**
   * «…עם החלק החיובי של ציר ה-x» (#1619 B1) — an axis operand may name ONE PART of the axis. Being ON the
   * axis is the incidence; which part is the `axis-side` selector «B על החלק החיובי של ציר x» already
   * carries (D7 kind 2) — the same two facts that sentence lowers to, so the crossing on a half-axis and
   * the point on a half-axis cannot drift.
   */
  const axisPart: Fact[] = [];
  const peelPart = (src: string): string => {
    const t = trim(src);
    const he = /^ה?חלק\s+(ה?חיובי|ה?שלילי)\s+של\s+(ציר\s+ה?-?\s*([xy]))$/.exec(t);
    const en = he ? null : /^(?:the\s+)?(positive|negative)\s+(?:part\s+of\s+(?:the\s+)?)?(([xy])[- ]axis)$/i.exec(t);
    const hit = he ?? en;
    if (!hit) return src;
    const axis = hit[3].toLowerCase() as 'x' | 'y';
    axisPart.push({ t: 'selector', sel: { kind: 'axis-side', id, axis, positive: /חיובי|positive/i.test(hit[1]) }, src: line });
    return he ? hit[2] : `the ${hit[2]}`;
  };
  const leftSrc = peelPart(leftRaw);
  const rightSrc = peelPart(rightRaw);
  // #1286 (ADR-AG-135): a crossing's incidences are marked as such — the drawn extent bounds the
  // SOLUTION set for a crossing only (the operator's T11 ruling and ruling (a) were about this
  // sentence); a cevian's foot or a point «על הישר» keeps the line reading its own ruling gave it.
  const asCrossing = (k: Constraint | KindOperand | null) =>
    k && k.t === 'on-line-2pt' ? { ...k, crossing: true as const } : k;
  const left = asCrossing(incidenceOn(leftSrc, id));
  const right = asCrossing(incidenceOn(rightSrc, id));
  // The verb was understood and an operand was not — #1052’s refusal, which names the formats that
  // do work rather than calling the whole sentence unintelligible.
  if (!left || !right) return refuse('bad-operand', line);
  // A tangent named by its touch point is BUILT by the sentence that names it (#1619 B3) — idempotent, so
  // «המשיק למעגל בנקודה A חותך את …» states the tangent and its crossing in one sentence.
  const built = [leftSrc, rightSrc].flatMap((op) => tangentObjectFacts(trim(op), line));
  if (built.length > 0) {
    const rest = parseIntersectionPlain(line, id, left, right, axisPart);
    return rest && rest.ok ? made([...built, ...rest.facts]) : rest;
  }
  return parseIntersectionPlain(line, id, left, right, axisPart);
}

/** The crossing once its two operands are read — split out so a built tangent can lead it (#1619 B3). */
function parseIntersectionPlain(
  line: string,
  id: Id,
  left: Constraint | KindOperand,
  right: Constraint | KindOperand,
  axisPart: readonly Fact[],
): RuleOutcome {
  const ordinal = ordinalOf(line);
  /**
   * A CONTEXTUAL operand — «עם המעגל» (#1429) — lowers to the fold-resolved `on-kind` fact, the
   * SAME resolution «P על המעגל» has always had, so the crossing and the point-on sentence cannot
   * disagree about which circle «המעגל» means. An ORDINAL over an unresolved operand is refused:
   * the sentence names a root order this rule cannot see yet, and guessing one would name the
   * wrong crossing silently.
   */
  if (left.t === 'kind' || right.t === 'kind') {
    if (ordinalOf(line) !== null) return refuse('bad-operand', line);
    const side = (k: Constraint | KindOperand): Fact =>
      k.t === 'kind'
        ? { t: 'on-kind', id, kind: k.kind, ...(k.circle ? { circle: k.circle } : {}), src: line }
        : { t: 'constraint', k, src: line };
    return made([
      { t: 'declare', id, src: line },
      side(left),
      side(right),
      { t: 'selector', sel: { kind: 'crossing-distinct', id }, src: line },
      ...axisPart,
    ]);
  }
  /**
   * THE CROSSING THE STUDENT NAMED IS A POINT THEY ALREADY HAVE (#1175).
   *
   * Operator, playing round #1169 T4: *"the data input should have been rejected since point B is
   * already there"*. Measured, «P נקודת החיתוך של הישר AB עם הישר BC» minted `P` at `|PB| = 1.2e-8`
   * with `faults: []` — two letters for one position, and the student's own «משולש ABC» had already
   * given it one. It is the #1113 family (*"four ring clicks give four letters on ONE point"*),
   * reached through a typed sentence rather than a click, and it compounds: `P` becomes a separate
   * object with its own constraints and its own DOF, so every later statement about `P` is solved
   * against a point the student believes is distinct from `B`.
   *
   * The test is STRUCTURAL and needs no figure: both operands are written in the sentence, so two
   * lines named by two points each that share exactly one letter meet at that letter, whatever the
   * configuration. No solve, no seed, no tolerance.
   *
   * **Sharing BOTH letters is the same family, one step over (#1255, ADR-AG-140).** «הישר AB עם
   * הישר BA» is one line written twice, so its "crossing" is the whole line and the sentence names no
   * point. Measured before the arm: it BUILT an under-determined `P` floating along AB with
   * `faults: []`. Operator ruling, 2026-09-20: **refuse it** — the alternative, reading it as a free
   * point on AB, was put to him with its argument and declined. The refusal is OWNED (`self-crossing`),
   * never `not-handled`: the grammar read the sentence, and the LLM seam would ask a model to accept
   * the very spelling just ruled out (the argument ADR-AG-130 made for the ring half, unchanged).
   *
   * ⚠ THIS IS THE STRUCTURAL MEMBER ONLY, and that is deliberate. Two lines given by EQUATIONS that
   * happen to cross where a point already sits is the same defect — measured, «l1: y=x» and
   * «l2: y=-x» with `A(0,0)` mints `P` at `|PA| = 1e-9` — but catching it needs a POSITIONAL test
   * with its own tolerance question, which the operator's ruling pre-declared an escalation rather
   * than an expansion. Filed separately; see the ADR.
   */
  if (left.t === 'on-line-2pt' && right.t === 'on-line-2pt') {
    const shared = [left.a, left.b].filter((p) => p === right.a || p === right.b);
    if (shared.length === 1) {
      return { ok: false, code: 'crossing-already-named', detail: line, holder: shared[0] } as ParseResult;
    }
    if (shared.length === 2) return refuse('self-crossing', line);
  }
  return made([
    { t: 'declare', id, src: line },
    { t: 'constraint', k: left, src: line },
    { t: 'constraint', k: right, src: line },
    /**
     * WHICH ROOT (#1113, #1268 — ADR-AG-157).
     *
     * An ORDINAL names its root: «הראשונה»/«השנייה» lower to `crossing-nth`, which picks that crossing
     * in the pair's canonical order (`crossing-order.ts`) on its own — no second named point needed.
     * That is #1113's ruling, *the sentence names the root*; before #1268 the word was carried and
     * chose nothing.
     *
     * A sentence WITHOUT an ordinal («נקודת החיתוך», «האחרת») keeps `crossing-distinct`: it names no
     * root, only that it is not its sibling. Two crossings of the same pair carry identical incidences,
     * so without it the solve settles both on the same root and the student gets two letters on one
     * point; with one crossing named there is no sibling and it judges nothing, which costs nothing.
     */
    ordinal === null
      ? { t: 'selector', sel: { kind: 'crossing-distinct', id }, src: line }
      : { t: 'selector', sel: { kind: 'crossing-nth', id, nth: ordinal, pair: [left, right] }, src: line },
    ...axisPart,
  ]);
}
/**
 * THE CROSSING'S OTHER SPELLINGS (#1429) — each normalised to the canonical «E נקודת החיתוך של X
 * עם Y» and re-parsed (`viaCanonical`, the #1495 seam), so one rule owns the semantics:
 *
 * - the DISTRIBUTIVE plural: «E נקודת החיתוך של הישרים l1 ו-l2» reads as «…של הישר l1 עם הישר l2»;
 * - the BARE plural: «E נקודת החיתוך של הישרים» — which two lines is M1's question (`crossing-kind`);
 * - the VERB forms: «הישרים l1 ו-l2 נחתכים בנקודה E», «הישר l1 חותך את הישר l2 בנקודה E» — the
 *   subject-order normalisation #1281/#1239 established.
 *
 * - BOTH CROSSINGS IN ONE SENTENCE (#1512): «הישר l1 חותך את המעגל I בנקודות A ו-B», «A ו-B נקודות
 *   החיתוך של הישר l1 עם המעגל I» — see `bothCrossings`.
 */
function intersectionSpellings(line: string): RuleOutcome {
  const both = bothCrossings(line);
  if (both) return both;
  const ordWord = (s: string | undefined) => (s ? ` ${s.replace(/^ה?/, 'ה')}` : '');
  const HEAD = `^${HE_POINT}(${NAME})${HE_IS}\\s*${ONE_OF_HE}(?:ה?נקודת|ה?נקודות)?\\s*ה?חיתוך\\s*(ה?ראשונה|ה?שניי?ה|ה?אחרת)?\\s*`;
  const dist =
    new RegExp(`${HEAD}(?:של\\s+)?ה?ישרים\\s+(\\S+)\\s+ו-?\\s*(\\S+)$`).exec(line) ??
    new RegExp(`^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+()intersection\\s+of\\s+(?:the\\s+)?lines\\s+(\\S+)\\s+and\\s+(\\S+)$`, 'i').exec(line);
  if (dist) {
    const [, id, ord, a, b] = dist;
    return viaCanonical(line, null, () => [`${id} נקודת החיתוך${ordWord(ord)} של הישר ${a} עם הישר ${b}`]);
  }
  const bare = new RegExp(`${HEAD}(?:של\\s+)?ה?ישרים$`).exec(line) ??
    new RegExp(`^(?:point\\s+)?(${NAME})\\s+is\\s+the\\s+()intersection\\s+of\\s+the\\s+lines$`, 'i').exec(line);
  if (bare) {
    // WHICH two lines is a question about the figure — M1 answers it (exactly two, else refuse),
    // exactly as «המעגל» resolves for the one circle.
    if (bare[2]) return refuse('bad-operand', line); // an ordinal over unresolved lines names nothing
    return made([
      { t: 'declare', id: bare[1], src: line },
      { t: 'crossing-kind', id: bare[1], kind: 'line', src: line },
      { t: 'selector', sel: { kind: 'crossing-distinct', id: bare[1] }, src: line },
    ]);
  }
  const meet =
    new RegExp(`^(.+?)${INTERSECT_JOIN}(.+?)\\s+נחתכ(?:ים|ות)\\s+ב?נקודה\\s+(${NAME})$`).exec(line) ??
    new RegExp(`^(.+?)\\s+and\\s+(.+?)\\s+intersect\\s+at\\s+(?:point\\s+)?(${NAME})$`, 'i').exec(line);
  if (meet) {
    const [, a, b, id] = meet;
    return viaCanonical(line, null, () => [`${id} נקודת החיתוך של ${withLineNoun(a)} עם ${withLineNoun(b)}`]);
  }
  // «X חותך את Y בנקודה B ואת Z בנקודה A» — one subject, two crossings: each is its own sentence (#1619 B3).
  const cutsTwo = new RegExp(
    `^(.+?)\\s+חות(?:ך|כת|כים|כות)\\s+את\\s+(.+?)\\s+ב?נקודה\\s+(${NAME})\\s*,?\\s+ו(?:את\\s+|-)(.+?)\\s+ב?נקודה\\s+(${NAME})$`,
  ).exec(line);
  if (cutsTwo) {
    const [, a, b, p, c2, q] = cutsTwo;
    return viaCanonical(line, null, () => [
      `${p} נקודת החיתוך של ${withLineNoun(a)} עם ${withLineNoun(b)}`,
      `${q} נקודת החיתוך של ${withLineNoun(a)} עם ${withLineNoun(c2)}`,
    ]);
  }
  const cuts =
    new RegExp(`^(.+?)\\s+חות(?:ך|כת|כים|כות)\\s+את\\s+(.+?)\\s+ב?נקודה\\s+(${NAME})$`).exec(line) ??
    new RegExp(`^(.+?)\\s+(?:cuts|intersects)\\s+(.+?)\\s+at\\s+(?:point\\s+)?(${NAME})$`, 'i').exec(line);
  if (cuts) {
    const [, a, b, id] = cuts;
    return viaCanonical(line, null, () => [`${id} נקודת החיתוך של ${withLineNoun(a)} עם ${withLineNoun(b)}`]);
  }
  return null;
}

/**
 * BOTH CROSSINGS NAMED IN ONE SENTENCE (#1512, [ADR-AG-185](../../docs/06c-decisions-analytic.md#adr-ag-185)).
 *
 * «הישר l1 חותך את המעגל I בנקודות A ו-B» / «A ו-B נקודות החיתוך של הישר l1 עם המעגל I» — and the
 * plural verb «l1 והמעגל I נחתכים בנקודות A ו-B», and English. The operator's ruling, 2026-09-29, option
 * (a): *"arbitrary, and the user can change the letters if he wants"* — the FIRST letter takes the first
 * root of the pair's canonical order (`crossing-order.ts`, #1268) and the second letter the second. It is
 * deterministic and never cycles under «הציגו תצורה אחרת»: a student who wants the other assignment
 * swaps the letters in the sentence.
 *
 * ## No new mechanism — the ordinal sentences, twice
 *
 * That assignment is EXACTLY what «A נקודת החיתוך הראשונה של X עם Y» + «B נקודת החיתוך השנייה של X עם
 * Y» already say, so the sentence is lowered to those two and each is re-parsed by the one crossing rule
 * (`parseIntersection`): two declares, the four incidences, and a `crossing-nth` selector each. One rule
 * owns the semantics, so the two-name form cannot drift from the ordinal form it abbreviates.
 *
 * ## One thing the two sentences do not say, and this one does
 *
 * The plural «נקודות» states TWO points. Two ordinal sentences on a tangent pair are both satisfied by
 * the one touching point (`nthHolds` answers true at a tangency, where the crossings coincide), so the
 * two letters would share a position with no fault — the one thing #1113 ruled may never happen. So both
 * selectors carry `both`, and `meetsTwice` (`crossing-order.ts`) judges it: a tangency, two roots
 * within the solver's resolution, two straights (which meet once) or two conics (which have no canonical
 * order, so "A the first root" names nothing) is not a configuration of this sentence. A figure with
 * freedom left walks past such a seed; one with none is reported by `derive` on THIS sentence as
 * `unsatisfiable`. A pair that misses entirely is refused by its incidences, as the single-crossing
 * form always was. (A `distinct` selector was measured and rejected: its threshold is relative to the
 * points' own spread, and with A and B the only points that is their own distance — it never fails.)
 *
 * A sub-sentence's OWNED refusal is this sentence's refusal (with this sentence as its detail) — the
 * rule read every word of it; only a `not-handled` sub-parse hands the line back to the chain.
 */
const PAIR_JOIN = '\\s+ו[-־]?\\s*';
const BOTH_HE = [
  // «X חותך את Y בנקודות A ו-B»
  new RegExp(`^(.+?)\\s+חות(?:ך|כת|כים|כות)\\s+את\\s+(.+?)\\s+ב?נקודות\\s+(${NAME})${PAIR_JOIN}(${NAME})$`),
  // «X ו-Y נחתכים בנקודות A ו-B»
  new RegExp(`^(.+?)${INTERSECT_JOIN}(.+?)\\s+נחתכ(?:ים|ות)\\s+ב?נקודות\\s+(${NAME})${PAIR_JOIN}(${NAME})$`),
];
const BOTH_HE_NOUN = new RegExp(
  `^(?:ה?נקודות\\s+)?(${NAME})${PAIR_JOIN}(${NAME})(?:\\s+(?:הן|הם))?\\s+ה?נקודות\\s+ה?חיתוך\\s+(?:של\\s+)?(.+?)${INTERSECT_JOIN}(.+)$`,
);
const BOTH_EN = [
  new RegExp(`^(.+?)\\s+(?:cuts|intersects|meets)\\s+(.+?)\\s+at\\s+(?:the\\s+)?(?:points\\s+)?(${NAME})\\s+and\\s+(${NAME})$`, 'i'),
  new RegExp(`^(.+?)\\s+and\\s+(.+?)\\s+(?:intersect|meet)\\s+at\\s+(?:the\\s+)?(?:points\\s+)?(${NAME})\\s+and\\s+(${NAME})$`, 'i'),
];
const BOTH_EN_NOUN = new RegExp(
  `^(?:points\\s+)?(${NAME})\\s+and\\s+(${NAME})\\s+are\\s+the\\s+(?:two\\s+)?(?:intersection\\s+points|intersections|points\\s+of\\s+intersection)\\s+of\\s+(.+?)\\s+(?:and|with)\\s+(.+)$`,
  'i',
);

function bothCrossings(line: string): RuleOutcome {
  let hit: { a: Id; b: Id; x: string; y: string; he: boolean } | null = null;
  for (const re of BOTH_HE) {
    const m = re.exec(line);
    if (m) { hit = { x: withLineNoun(m[1]), y: withLineNoun(m[2]), a: m[3], b: m[4], he: true }; break; }
  }
  const noun = hit ? null : BOTH_HE_NOUN.exec(line);
  if (noun) hit = { a: noun[1], b: noun[2], x: withLineNoun(noun[3]), y: withLineNoun(noun[4]), he: true };
  for (const re of hit ? [] : BOTH_EN) {
    const m = re.exec(line);
    if (m) { hit = { x: m[1], y: m[2], a: m[3], b: m[4], he: false }; break; }
  }
  const en = hit ? null : BOTH_EN_NOUN.exec(line);
  if (en) hit = { a: en[1], b: en[2], x: en[3], y: en[4], he: false };
  if (!hit) return null;
  const { a, b, x, y, he } = hit;
  if (a === b) return refuse('repeated-vertex', line); // «בנקודות A ו-A» names one point twice
  /**
   * A CONTEXTUAL operand — «המעגל חותך את ציר ה-x בנקודות B ו-C» (#1619 B1). The ordinal reading needs the
   * pair's canonical order, which an operand M1 has not resolved yet cannot give (the single-crossing rule
   * refuses an ordinal over one, for that reason). So the two letters are the two crossings WITHOUT an
   * ordinal: each carries `crossing-distinct`, which makes them two different points (a tangency, where
   * the roots coincide, fails it), and which letter takes which root is the CONFIGURATION's — it moves with
   * «הציגו תצורה אחרת» rather than being fixed by a default the sentence never stated (ADR-052).
   */
  const contextual = [x, y].some((s) => incidenceOn(s, 'Z')?.t === 'kind');
  const sentences = contextual
    ? he
      ? [`${a} נקודת החיתוך של ${x} עם ${y}`, `${b} נקודת החיתוך של ${x} עם ${y}`]
      : [`${a} is the intersection of ${x} with ${y}`, `${b} is the intersection of ${x} with ${y}`]
    : he
      ? [`${a} נקודת החיתוך הראשונה של ${x} עם ${y}`, `${b} נקודת החיתוך השנייה של ${x} עם ${y}`]
      : [`${a} is the first intersection of ${x} with ${y}`, `${b} is the second intersection of ${x} with ${y}`];
  const facts: Fact[] = [];
  for (const sentence of sentences) {
    const r = parseClause(sentence);
    if (!r.ok) return r.code === 'not-handled' ? null : ({ ...r, detail: line } as ParseResult);
    facts.push(...r.facts);
  }
  return made(
    facts.map((f) =>
      f.t === 'selector' && f.sel.kind === 'crossing-nth' ? { ...f, sel: { ...f.sel, both: true as const }, src: line } : { ...f, src: line },
    ),
  );
}

/** A bare token («l1», «AB») gets its noun back for the canonical spelling; a PLURAL noun that
 *  distributed over the pair («הישרים l1») is normalised to its singular; a full phrase passes. */
function withLineNoun(s: string): string {
  const t = trim(s).replace(/^ה?ישרים\s+/, 'הישר ');
  return /^[ℓl][0-9]?$/.test(t) || /^[A-Z][0-9₀-₉]?[A-Z][0-9₀-₉]?$/.test(t) ? `הישר ${t}` : t;
}

/**
 * THE ONE READER for a concurrency point, whichever form names it (#1283).
 *
 * «אלכסוני המרובע נפגשים בנקודה M» and «M מפגש האלכסונים במרובע» say the identical thing (#1070),
 * so both hand their SUBJECT here and get one answer: letters → the derived point on that ring
 * (and the ring itself, #1080); no letters → `meet-of`, the ring resolved against the figure at M1,
 * refused there when the figure has none or several. Two readers is what let the spellings drift.
 *
 * A NOUN without letters is still checked (#1042): «מפגש התיכונים במרובע» names a four-vertex
 * shape for a three-vertex construct, and is refused for arity rather than read as whichever
 * triangle the figure holds. `null` = not a concurrency sentence, including one that would drop a
 * stated name the tail does not account for (the leftover guard, ADR-024).
 */
function concurrencyOf(id: Id, subject: string, line: string): RuleOutcome {
  let role: (typeof ROLES)[number] | undefined;
  let hit: RegExpExecArray | null = null;
  for (const r of ROLES) {
    hit = r.he.exec(subject) ?? r.en.exec(subject);
    if (hit) {
      role = r;
      break;
    }
  }
  if (!role || !hit) return null;
  if (/[A-Z]/.test(subject.slice(0, hit.index))) return null;
  const rest = subject.slice(hit.index + hit[0].length);
  const of = ROLE_OF_HE.exec(rest) ?? ROLE_OF_EN.exec(rest);
  if (!of) return null;
  const [, noun, run] = of;
  const stated = arityOf(noun);
  if (stated !== null && stated !== role.n) return refuse('bad-arity', line);
  // No letters: the shape is whichever one the figure has, which only M1 can say.
  if (!run) return made([{ t: 'meet-of', role: role.t, arity: role.n, id, src: line }]);
  const v = splitNames(run);
  /**
   * Three ways this sentence can be wrong about its own vertices, and all three were falling
   * through to `not-handled` or, worse, building (#1042):
   *
   *  - the count disagrees with the CONSTRUCT — «מפגש התיכונים במשולש ABCD» (a centroid takes 3);
   *  - the count disagrees with the NOUN the student wrote — checked above, letters or not;
   *  - a label repeats.
   */
  if (v.length !== role.n) return refuse('bad-arity', line);
  if (hasRepeat(v)) return refuse('repeated-vertex', line);
  const rule: DerivedRule =
    role.t === 'diagonals'
      ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
      : ({ t: role.t, v: [v[0], v[1], v[2]] } as DerivedRule);
  // The shape the sentence named is drawn too (#1080) — «במשולש ABC» is the student telling us
  // there is a triangle, not only which points the centroid is of.
  const shape = namedShapeFacts(noun, v, line);
  if (shape === 'bad-arity') return refuse('bad-arity', line);
  return made([...shape, { t: 'derived', id, rule, src: line }]);
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
    const [, id, letter, numeral] = centre;
    // The EN rule is `i`-flagged for its words; a numeral is case-sensitive (the [IVX] trap, ADR-AG-006).
    if (numeral !== undefined && !isNumeralName(numeral)) return refuse('not-handled', line);
    const circleName = letter ?? numeral;
    return made([{ t: 'derived', id, rule: { t: 'circle-centre', curve: numeralCurveId('circle', circleName) }, src: line }]);
  }

  const contextual = centreOfCircle(line);
  if (contextual) return contextual;

  const diag = DIAGONAL_EQ_HE.exec(line) ?? DIAGONAL_EQ_EN.exec(line);
  if (diag && claimable(diag[2])) {
    const [, which, eqSrc] = diag;
    const eq = equationExpr(eqSrc);
    if (!eq) return refuse('bad-equation', trim(eqSrc));
    const principal = /ראשי|main|principal|major/i.test(which);
    return made([{ t: 'diagonal-eq', principal, eq, src: line }]);
  }

  // «אלכסוני המרובע ABCD נפגשים בנקודה O» — the VERB form (#1070). Not a concurrency subject («הישרים
  // נפגשים בנקודה O») answers `null` and the rules after this one get the sentence.
  const meet = MEET_HE.exec(line) ?? MEET_EN.exec(line);
  if (meet) {
    const found = concurrencyOf(meet[2], meet[1], line);
    if (found) return found;
  }

  // «O מפגש האלכסונים במרובע ABCD» — the NOUN form, through the same reader (#1283).
  const con = CONCURRENCY_HE.exec(line) ?? CONCURRENCY_EN.exec(line);
  if (con) return concurrencyOf(con[1], con[2], line);

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
// «הבסיס CD» names a side exactly as «הצלע CD» does — a trapezoid's side, in the exam's word (#1281).
const SEGMENT_HE = new RegExp(`^${HE_GIVEN}(?:ה?(?:קטע|צלע|בסיס)\\s+)?(${NAME})(${NAME})$`);
const SEGMENT_EN = new RegExp(`^(?:(?:segment|side)\\s+)?(${NAME})(${NAME})$`, 'i');
/** «הישר BC» / "the line BC" on a line of its own — the LINE the pair names, drawn (#1639, ADR-AG-198). */
const LINE_PIECE_HE = new RegExp(`^${HE_GIVEN}ה?ישר\\s+(${NAME})(${NAME})$`);
const LINE_PIECE_EN = new RegExp(`^(?:the\\s+)?[Ll]ine\\s+(${NAME})(${NAME})$`);

/**
 * A segment's id is CANONICAL — «הקטע AB» and «הקטע BA» are one object, so they must be one id.
 *
 * Deterministic ids are what make re-issuing a statement idempotent (root CLAUDE.md), and M1's
 * absorb is keyed on the id: without canonicalisation the undirected comparison in `apply` is never
 * even reached, and the same segment draws twice.
 */
const segmentId = (a: string, b: string) => `seg-${[a, b].sort().join('')}`;

/**
 * THE PIECE A SENTENCE NAMES, DRAWN (#1639, ADR-AG-198) — one declaration for every sentence whose subject is a
 * named pair, whichever relation it states (a tangent, a diameter, «AB ⊥ CD», a side on an axis, «CD עובר דרך
 * …»). The class: the tangent and diameter rules lowered to constraints on the ENDPOINTS and never declared the
 * piece, so «BC משיק למעגל בנקודה B» held and drew nothing, while the chord rule — which declares it — drew.
 *
 * The NOUN decides the extent, as everywhere (#1234): «הישר BC» draws the line (`line-2pt`, resolved at M1),
 * «הצלע/הקטע/הבסיס BC» and the bare «BC» draw the segment — the very fact the bare line «BC» declares, so the
 * bare line typed afterwards answers «כבר ידוע». Emitted AFTER the sentence's own facts, so a sentence that
 * refers to points the figure does not have still fails on them (a reference never invents a point, #1028).
 */
type PieceNoun = 'line' | 'segment';
const pieceNounOf = (noun: string | undefined): PieceNoun => (noun && /ישר|^(?:the\s+)?lines?$/i.test(noun.trim()) ? 'line' : 'segment');
function pieceFacts(noun: PieceNoun, a: Id, b: Id, src: string): Fact[] {
  if (a === b) return [];
  return noun === 'line' ? [{ t: 'line-2pt', a, b, src }] : [{ t: 'segment', id: segmentId(a, b), a, b, ref: true, src }];
}

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
 * THE BRANCH WORDS — which touch two tangent circles make — ONE list for every position (#1504,
 * ADR-AG-167 amendment 1).
 *
 * The pre-play found the list written out three times, each copy with a different subset and a fixed
 * position: «מבחוץ» read at the end of «משיק למעגל K מבחוץ» and not before the target («משיק מבחוץ
 * למעגל K»), «חיצונית»/«פנימית» nowhere, «מבחוץ זה לזה» in one order only. Every reader below takes
 * its word from THIS table, and a word may stand after the verb, after the target, or after the
 * whole sentence.
 */
const TANGENT_BRANCH: Readonly<Record<string, 'external' | 'internal'>> = {
  מבחוץ: 'external',
  חיצונית: 'external',
  externally: 'external',
  מבפנים: 'internal',
  פנימית: 'internal',
  internally: 'internal',
};
const BRANCH_WORD = `(?:${Object.keys(TANGENT_BRANCH).join('|')})`;
const branchOf = (word: string) => TANGENT_BRANCH[word.toLowerCase()];
/** «זה לזה» — the reciprocal a PLURAL subject may carry; it adds nothing the plural did not say. */
const RECIPROCAL = '(?:זה\\s+לזה|זו\\s+לזו|אחד\\s+לשני|to\\s+each\\s+other|to\\s+one\\s+another)';
/** «בנקודה T» — the touch point named (amendment 1). */
const CONTACT = `(?:ב(?:נקודה|נקודת\\s+ה?השקה|נקודת\\s+ה?מגע)\\s+|ב-|at\\s+(?:the\\s+)?(?:point\\s+)?)(${NAME})`;

/**
 * THE RADIUS TAIL — every way the exam attaches a radius to a circle it is creating (#1432, am. 1):
 * «שרדיוסו 5», «ורדיוסו 5», «שאורך רדיוסו 5», «ברדיוס 5», «באורך רדיוס 5», «עם רדיוס 5», each with
 * the optional copula («שרדיוסו הוא 5», «ורדיוסו = 5»). ONE atom, read by the creation rule and by the
 * post-hoc «המעגל ברדיוס 5», so a spelling admitted in one is admitted in the other.
 */
const RADIUS_TAIL_HE = `(?:[שו]?(?:אורך\\s+)?רדיוסו|ב(?:אורך\\s+)?רדיוס|עם\\s+רדיוס(?:\\s+של)?)\\s*(?:(?:${COPULA_WORDS})\\s*|=\\s*)?(\\S+)`;
const RADIUS_TAIL_EN = `(?:(?:and\\s+)?with\\s+(?:a\\s+)?radius(?:\\s+of)?|(?:and\\s+)?(?:whose\\s+)?radius(?:\\s+is)?)\\s*=?\\s*(\\S+)`;
/**
 * THE CENTRE — a letter, a letter with its coordinates «O(2,3)», or coordinates alone «(2,3)» (the
 * bagrut's «מעגל שמרכזו (2,3) ורדיוסו 5»), with the optional «בנקודה». The coordinate text is read by
 * `pointSlot` at the rule, which owns what a coordinate pair may hold. Composed into the ONE circle-subject
 * reader (`readCircleSubject`, #1504) — the subject grammar and the creation grammar are the same pattern.
 */
const CENTRE_SLOT = `(?:(${NAME})\\s*(\\([^()]*\\))?|(\\([^()]*\\)))`;

/** What a tangency sentence says ABOUT its relation, wherever it said it. */
interface TangencyMods {
  branch?: 'external' | 'internal';
  reciprocal: boolean;
  at?: Id;
  /** «בנקודות A ו-C בהתאמה» — one touch point per target, in order (#1619 B3, #1430). */
  ats?: Id[];
  /** Two different branch words, or two contact points — a sentence at odds with itself. */
  clash: boolean;
}

/** Peel modifiers off the END (`tail`) or the START (`head`) of a fragment, in any order. */
function peelMods(text: string, where: 'head' | 'tail', mods: TangencyMods): string {
  const one = `(${BRANCH_WORD})|(${RECIPROCAL})|${CONTACT}`;
  const re = where === 'tail' ? new RegExp(`\\s+(?:${one})$`, 'i') : new RegExp(`^(?:(${BRANCH_WORD})|(${RECIPROCAL}))(?:\\s+|$)`, 'i');
  let rest = trim(text);
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (m[1]) {
      const b = branchOf(m[1]);
      if (mods.branch && mods.branch !== b) mods.clash = true;
      mods.branch = b;
    } else if (m[2]) mods.reciprocal = true;
    else if (m[3]) {
      if (mods.at && mods.at !== m[3]) mods.clash = true;
      mods.at = m[3];
    }
    rest = trim(where === 'tail' ? rest.slice(0, m.index) : rest.slice(m[0].length));
  }
  return rest;
}

/** What one tangency sentence touches: axes (#1060), lines (#1501), circles (#1504), and the facts
 *  inline equations mint. */
interface TangentTargets {
  axes: Array<'x' | 'y'>;
  lines: TangentLineRef[];
  /** CIRCLE targets (#1504) — the other circle by the name the sentence used (letter or
   *  numeral; a numeral names an equation circle, which the apply boundary refuses by name),
   *  with the touch branch when the student said it on the piece itself. */
  circles: Array<{ name?: string; branch?: 'external' | 'internal' }>;
  facts: Fact[];
  /** The axis and line targets IN THE STUDENT'S ORDER — what «בנקודות A ו-C בהתאמה» pairs with (#1619 B3). */
  ordered: Array<{ axis: 'x' | 'y' } | { line: TangentLineRef }>;
  /** Each two-point target with the noun it was written with (#1639): the piece the sentence draws. */
  pieces: Array<{ a: Id; b: Id; noun: PieceNoun }>;
}

/**
 * The TARGETS of a tangency phrase — the one resolution for every order and every sentence shape.
 *
 * Pieces are joined by «ו-», a comma, or "and"; an equation contains none of those, so the split
 * cannot cut one apart. Each piece is an axis («ציר ה-x», «שני הצירים»), a NAMED line («ישר l1»,
 * «הישר 3» — a numeral needs its noun, #1298), a TWO-POINT line («ישר AB», the pair reading), or
 * an inline EQUATION («ישר 3x+4y=0», «ישר שמשוואתו y=2x») — which mints the curve exactly as
 * «A על הישר y=2x» does, `stated: false`, under the content id that keeps restating idempotent.
 *
 * A CIRCLE piece — «מעגל K», «המעגל I», "circle K", optionally with a branch word from THE list —
 * is circle-to-circle tangency (#1504); it rides `circles` and resolves at the apply boundary. A
 * piece this grammar cannot read still declines the WHOLE sentence (`null`) — guessing half a
 * target list would build half the student's given.
 */
function tangentTargets(tail: string, src: string): TangentTargets | null {
  const out: TangentTargets = { axes: [], lines: [], circles: [], facts: [], ordered: [], pieces: [] };
  /*
   * A PLURAL noun heads the whole list — «הצלעות AO, BO ו-AB», "the sides AB, BC and CA" (#1619 B2's touch
   * sentence, read here since the integration so the plural touch has ONE reader). It says what every piece
   * is: «צלעות»/«קטעים» bound each tangency to its drawn piece (#1503's noun rule), «ישרים» does not.
   */
  const plural = /^(?:ה?(צלעות|קטעים|ישרים)|(?:the\s+)?(sides|segments|lines))\s+(?=\S)/i.exec(trim(tail));
  const boundedAll = !!plural && /^(?:צלעות|קטעים|sides|segments)$/i.test(plural[1] ?? plural[2]);
  const pieces = trim(plural ? trim(tail).slice(plural[0].length) : tail)
    .split(/\s*,\s*|\s+ו-?(?=\S)|\s+and\s+/i)
    .map(trim)
    .filter(Boolean);
  if (pieces.length === 0) return null;
  for (const raw of pieces) {
    // A later conjunct repeats the preposition — «ולישר l1», «לציר ה-y» — strip it before the noun.
    const piece = raw.replace(/^ל-?\s*/, '');
    if (/^(?:שני\s+ה?צירים|both\s+axes)$/i.test(piece)) {
      out.axes.push('x', 'y');
      out.ordered.push({ axis: 'x' }, { axis: 'y' });
      continue;
    }
    const axis = /^ה?ציר\s+ה?-?\s*([xy])$/.exec(piece) ?? /^(?:the\s+)?([xy])[- ]axis$/i.exec(piece);
    if (axis) {
      out.axes.push(axis[1].toLowerCase() as 'x' | 'y');
      out.ordered.push({ axis: axis[1].toLowerCase() as 'x' | 'y' });
      continue;
    }
    // A CIRCLE piece (#1504) — read before the line nouns, because it carries its own noun. The
    // name may be a letter or a numeral (a numeral names an equation circle, refused by name at
    // the apply boundary — the ADR-AG-165 discipline, unchanged).
    // Unnamed («למעגל», "the circle") it is the CONTEXTUAL circle — which one is M1's question.
    const circ =
      new RegExp(`^ה?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?(?:\\s+(${BRANCH_WORD}))?$`).exec(piece) ??
      new RegExp(`^(?:the\\s+)?circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?(?:\\s+(${BRANCH_WORD}))?$`, 'i').exec(piece);
    if (circ) {
      out.circles.push({ ...(circ[1] ? { name: circ[1] } : {}), ...(circ[2] ? { branch: branchOf(circ[2]) } : {}) });
      continue;
    }
    // WHICH noun the piece used, read BEFORE the strip discards it (#1503): «צלע»/«קטע»/«בסיס»
    // bounds the tangency to the side itself — the #1168 class, the noun decides the extent.
    // `BOUNDED_NOUN` is the one list, so incidence and tangency cannot disagree on what is bounded.
    const boundedNoun = boundedAll || BOUNDED_NOUN.test(piece);
    const bare = piece
      .replace(/^(?:ה?ישרים|ה?ישר|ה?צלע|ה?קטע|ה?בסיס|(?:the\s+)?(?:lines?|side|segment|base))\s+/i, '')
      .replace(new RegExp(`^${HE_EQ_OF}\\s+`), '');
    const hadNoun = bare !== piece;
    const named = /^([ℓl][0-9]?)$/.exec(bare) ?? (hadNoun ? LINE_NUMERAL_RE.exec(bare) : null);
    if (named) {
      const ref: TangentLineRef = { kind: 'curve', id: lineIdOf(named[0]), label: named[0] };
      out.lines.push(ref);
      out.ordered.push({ line: ref });
      continue;
    }
    const pts = TWO_POINT_NAME.exec(bare);
    if (pts && pts[1] !== pts[2]) {
      const ref: TangentLineRef = { kind: 'points', a: pts[1], b: pts[2], ...(boundedNoun ? { bounded: true as const } : {}) };
      out.lines.push(ref);
      out.ordered.push({ line: ref });
      // «הישרים»/«הישר» the line; a bounded noun or none the segment.
      const lineNoun = plural ? /^(?:ישרים|lines)$/i.test(plural[1] ?? plural[2]) : /^(?:ה?ישר|(?:the\s+)?line)\s/i.test(piece);
      out.pieces.push({ a: pts[1], b: pts[2], noun: lineNoun ? 'line' : 'segment' });
      continue;
    }
    if (bare.includes('=')) {
      const eq = equationExpr(bare);
      if (eq && symbolsOf(eq).some((sym) => RESERVED_SYMBOLS.has(sym))) {
        const cid = `curve-${anonIndex(bare)}`;
        out.facts.push({ t: 'curve', id: cid, label: { name: '', eqSrc: trim(bare) }, curve: { eq }, stated: false, src });
        const ref: TangentLineRef = { kind: 'curve', id: cid, label: trim(bare) };
        out.lines.push(ref);
        out.ordered.push({ line: ref });
        continue;
      }
    }
    return null; // a target this rule cannot read — decline the sentence, never guess half of it
  }
  return out;
}

/**
 * The facts a circle-on-a-point lowers to: the centre as a free vertex, a positive radius, and the
 * circle itself. Shared by every subject that NAMES its centre letter, so they cannot drift.
 *
 * The minted-curve facts come FIRST: a tangency constraint may name a line its own sentence
 * created, and the apply boundary checks the curve exists before the constraint lands (#1150).
 */
function circleAtFacts(centre: Id, targets: TangentTargets, line: string, at?: Id, rStated?: Expr): Fact[] {
  const sym = `r_${centre}`;
  const r: Expr = { kind: 'sym', name: sym };
  return [
    ...targets.facts,
    { t: 'declare', id: centre, src: line },
    { t: 'param', sym, domain: { ...UNBOUNDED, min: 0, minOpen: true }, src: line },
    { t: 'circle-at', id: `circle-at-${centre}`, centre, r, src: line },
    ...targets.axes.map((axis) => ({
      t: 'constraint' as const,
      k: { t: 'tangent-axis' as const, centre, r, axis },
      src: line,
    })),
    ...targets.lines.map((ref) => ({
      t: 'constraint' as const,
      k: { t: 'tangent-line' as const, centre, r, line: ref },
      src: line,
    })),
    // A circle target names the OTHER circle (#1504) — which circle the name means is M1's
    // question, so the fact carries the names and the apply boundary resolves both.
    ...targets.circles.map((t) => ({
      t: 'tangent-circles' as const,
      a: centre,
      ...(t.name ? { b: t.name } : {}),
      ...(t.branch ? { branch: t.branch } : {}),
      ...(at ? { at } : {}),
      src: line,
    })),
    /**
     * A STATED radius (#1432) is the SAME given the post-hoc «רדיוס המעגל הוא 5» is — so it lowers to
     * the same `radius-of` fact, applied to this very circle LAST — after the tangencies, so the substitution reaches their `r` too — instead of a literal slipped past the
     * radius's domain (am. 1: «שרדיוסו -3» was accepted and the circle vanished). The substitution
     * seam checks the domain and retires the parameter: born with 2 DOF, not 3, as before.
     */
    ...(rStated ? [{ t: 'radius-of' as const, circleId: `circle-at-${centre}`, value: rStated, src: line }] : []),
  ];
}

const NO_TARGETS: TangentTargets = { axes: [], lines: [], circles: [], facts: [], ordered: [], pieces: [] };

/**
 * «בנקודות A ו-C בהתאמה» / "at the points A and C respectively" — the touch points of a PLURAL tangency,
 * one per target in order (#1619 B3, #1430). Peeled off the END of the sentence before the singular
 * modifiers; `null` ats when the sentence has none.
 */
const TOUCH_LIST_HE = new RegExp(
  `\\s+ב(?:ה)?(?:נקודות(?:\\s+ה?השקה|\\s+ה?מגע)?)\\s+(${NAME}(?:\\s*,\\s*${NAME})*\\s*,?\\s*ו-?\\s*${NAME})(?:\\s+בהתאמה)?$`,
);
const TOUCH_LIST_EN = new RegExp(
  `\\s+at\\s+(?:(?:the\\s+)?points\\s+)?(${NAME}(?:\\s*,\\s*${NAME})*,?\\s+and\\s+${NAME})(?:,?\\s+respectively)?$`,
  'i',
);
function peelTouchList(text: string): { rest: string; ats?: Id[] } {
  const m = TOUCH_LIST_HE.exec(text) ?? TOUCH_LIST_EN.exec(text);
  if (!m) return { rest: text };
  const ats = m[1].match(new RegExp(NAME, 'g')) ?? [];
  return { rest: trim(text.slice(0, m.index)), ats };
}

/**
 * THE TOUCH POINTS NAMED (#1619 B3, #1430, ADR-AG-195) — «המעגל משיק לציר ה-x בנקודה A», «AB ו-BC משיקים
 * למעגל בנקודות A ו-C בהתאמה». One `tangent-of` per target, each carrying ITS touch point; the apply
 * boundary lowers each to «A on the circle, A on the line, the line ⊥ the radius at A».
 *
 * The sentence INTRODUCES what it names — the touch points and a two-point line's ends («הקטע CD משיק
 * למעגל בנקודה A» is how the exam first mentions C, D and A) — exactly as «משוואת הישר AB היא …» does
 * (ADR-AG-026's ruling). A circle target, or a count that does not pair up, declines (`null`).
 */
function touchFacts(targets: TangentTargets, ats: readonly Id[], circle: string | undefined, line: string): Fact[] | null {
  if (targets.circles.length > 0 || ats.length === 0 || ats.length !== targets.ordered.length) return null;
  const named = new Set<Id>();
  targets.ordered.forEach((t, i) => {
    named.add(ats[i]);
    if ('line' in t && t.line.kind === 'points') {
      named.add(t.line.a);
      named.add(t.line.b);
    }
  });
  return [
    ...targets.facts,
    ...[...named].map((id) => ({ t: 'declare' as const, id, src: line })),
    /*
     * The SELECTORS the touch carries — here, not at M1, so `derive` blames a configuration that fails one on
     * this line: the two ends of a named line are two points («PA משיק … בנקודה A» with P ON the circle has
     * only the degenerate A = P), and a bounded noun («הקטע CD») puts the touch BETWEEN the ends.
     */
    ...targets.ordered.flatMap((t, i): Fact[] =>
      'line' in t && t.line.kind === 'points'
        ? [
            { t: 'selector', sel: { kind: 'distinct', ids: [t.line.a, t.line.b] }, src: line },
            ...(t.line.bounded && ats[i] !== t.line.a && ats[i] !== t.line.b
              ? [{ t: 'selector' as const, sel: { kind: 'between' as const, id: ats[i], a: t.line.a, b: t.line.b }, src: line }]
              : []),
          ]
        : [],
    ),
    ...targets.ordered.map((t, i) => ({
      t: 'tangent-of' as const,
      axes: 'axis' in t ? [t.axis] : [],
      ...('line' in t ? { lines: [t.line] } : {}),
      ...(circle !== undefined ? { circle } : {}),
      at: ats[i],
      src: line,
    })),
    ...targets.pieces.flatMap((q) => pieceFacts(q.noun, q.a, q.b, line)),
  ];
}

/** The touch points the sentence named — the plural list, or the singular «בנקודה A» — or none. */
const touchesOf = (mods: TangencyMods): Id[] | null => mods.ats ?? (mods.at !== undefined ? [mods.at] : null);

/** A touch reading applies when the points name AXIS/LINE targets, never a circle-to-circle touch. */
const touchApplies = (targets: TangentTargets | null, mods: TangencyMods): boolean =>
  !!targets && touchesOf(mods) !== null && targets.circles.length === 0 && targets.ordered.length > 0;

// ---------------------------------------------------------------------------
// THE MEASURE ROLES — one reader per role, shared by the given and the ask (#1432, amendment 1)
// ---------------------------------------------------------------------------

/**
 * What a ROLE PHRASE names — «רדיוס המעגל I», «מוקד הפרבולה», «ישר המדריך», «היקף המשולש ABC».
 *
 * The pre-play of PR #1513 found every role readable in exactly one spelling: «רדיוס המעגל הוא 5»
 * worked and «רדיוס המעגל 5», «אורך הרדיוס הוא 5» did not; «מדריך הפרבולה» answered and «משוואת
 * המדריך» reported a missing curve named «המדריך». The class was one hand-written regex per sentence,
 * each admitting its own subset. So the NOUN PHRASE is read here, once, and both surfaces compose it:
 * the given is `<role> <copula>? <value>` in either order (`parseMeasureRoles`), the ask is the role
 * phrase alone after the ask lane's opener normaliser (`app/ask.ts`). A spelling admitted by one is
 * admitted by the other by construction — the sayable ⇒ askable rule (02c R23).
 */
export type RoleRef =
  | { role: 'radius'; circle?: string }
  | { role: 'focus'; host?: 'parabola' | 'ellipse' }
  | { role: 'foci' }
  | { role: 'directrix' }
  | { role: 'perimeter'; noun?: string; ids?: Id[] };

/** The shape nouns, longest first so «משולש ישר זווית» is not read as «משולש» — DERIVED from the registry. */
const ROLE_SHAPE_HE = [...Object.keys(SHAPES), ANY_POLYGON_NOUN]
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/ /g, '[\\s-]+'))
  .join('|');
const ROLE_RUN = `((?:${NAME}){3,})`;
const ROLE_CIRCLE_HE = `(?:\\s+(?:של\\s+)?ה?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?)?`;
const ROLE_CIRCLE_EN = `(?:\\s+of\\s+(?:the\\s+)?circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?)?`;

const ROLE_RADIUS_HE = new RegExp(`^(?:ה?אורך\\s+(?:של\\s+)?)?ה?רדיוס${ROLE_CIRCLE_HE}$`);
const ROLE_RADIUS_EN = new RegExp(`^(?:the\\s+)?(?:length\\s+of\\s+(?:the\\s+)?)?radius${ROLE_CIRCLE_EN}$`, 'i');
const ROLE_FOCUS_HE = /^(?:ה?שיעורי\s+)?ה?מוקד(?:\s+(?:של\s+)?ה?(פרבולה|אליפסה))?$/;
const ROLE_FOCUS_EN = /^(?:the\s+)?(?:coordinates\s+of\s+(?:the\s+)?)?focus(?:\s+of\s+(?:the\s+)?(parabola|ellipse))?$/i;
const ROLE_FOCI_HE = /^(?:ה?שיעורי\s+)?ה?מוקדי(?:ם)?(?:\s+(?:של\s+)?ה?אליפסה)?$/;
const ROLE_FOCI_EN = /^(?:the\s+)?(?:coordinates\s+of\s+(?:the\s+)?)?foci(?:\s+of\s+(?:the\s+)?ellipse)?$/i;
const ROLE_DIRECTRIX_HE = /^(?:ה?משוואת\s+)?(?:ה?ישר\s+)?ה?מדריך(?:\s+(?:של\s+)?ה?פרבולה)?$/;
const ROLE_DIRECTRIX_EN = /^(?:the\s+)?(?:equation\s+of\s+(?:the\s+)?)?directrix(?:\s+of\s+(?:the\s+)?parabola)?$/i;
const ROLE_PERIMETER_HE = new RegExp(`^ה?היקף(?:\\s+(?:של\\s+)?(?:ה?(${ROLE_SHAPE_HE})(?=\\s|$))?\\s*(?:${ROLE_RUN})?)?$`);
const ROLE_PERIMETER_EN = new RegExp(
  `^(?:the\\s+)?perimeter(?:\\s+(?:of\\s+)?(?:(?:the\\s+)?(${ROLE_SHAPE_EN})(?=\\s|$))?\\s*(?:${ROLE_RUN})?)?$`,
  'i',
);

export function readRoleRef(raw: string): RoleRef | null {
  const text = trim(raw);
  const radius = ROLE_RADIUS_HE.exec(text) ?? ROLE_RADIUS_EN.exec(text);
  if (radius) return { role: 'radius', ...(radius[1] ? { circle: radius[1] } : {}) };
  const focus = ROLE_FOCUS_HE.exec(text) ?? ROLE_FOCUS_EN.exec(text);
  if (focus) {
    const host = focus[1] ? (/אליפסה|ellipse/i.test(focus[1]) ? 'ellipse' : 'parabola') : undefined;
    return { role: 'focus', ...(host ? { host } : {}) };
  }
  if (ROLE_FOCI_HE.test(text) || ROLE_FOCI_EN.test(text)) return { role: 'foci' };
  if (ROLE_DIRECTRIX_HE.test(text) || ROLE_DIRECTRIX_EN.test(text)) return { role: 'directrix' };
  const per = ROLE_PERIMETER_HE.exec(text) ?? ROLE_PERIMETER_EN.exec(text);
  if (per) {
    // «היקף» must name SOMETHING or nothing at all — «היקף גדול» is not a perimeter reference.
    const [, nounSrc, run] = per;
    // The English pattern is case-blind for its words; a vertex run is capitals or it is no run.
    if (run && splitNames(run).join('') !== run) return null;
    const plain = nounSrc ? normalizeShapeNoun(nounSrc) : undefined;
    const noun = plain ? (/^polygon$/i.test(plain) ? ANY_POLYGON_NOUN : EN_SHAPE[plain.toLowerCase()] ?? plain) : undefined;
    return { role: 'perimeter', ...(noun ? { noun } : {}), ...(run ? { ids: splitNames(run) } : {}) };
  }
  return null;
}

/** A scalar the student states for a radius or a perimeter — a number or a parameter expression, never a point name. */
function roleScalar(src: string): Expr | null {
  const t = trim(src);
  if (!claimable(t) || /[A-Z]/.test(t)) return null;
  return valueExpr(t);
}

/**
 * THE WAYS A ROLE GIVEN SPLITS INTO ITS TWO SIDES — in order of preference.
 *
 * A copula («הוא», «היא», «שווה ל-», «=», «:», "is") where there is one; else the value is the last
 * or the first token («רדיוס המעגל 5», «ישר המדריך x=-2», «F מוקד הפרבולה»). Both orders of each
 * split are tried, because the exam writes «מוקד הפרבולה הוא F» and «הנקודה F היא מוקד הפרבולה».
 * The role side must read as a role phrase EXACTLY (`readRoleRef` is anchored), so no split can
 * steal a sentence that merely contains the noun.
 */
function roleSplits(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const add = (m: RegExpExecArray | null) => {
    if (m) out.push([m[1], m[2]], [m[2], m[1]]);
  };
  add(new RegExp(`^(.+?)\\s+(?:${COPULA_WORDS}|is|equals)\\s*(.+)$`, 'i').exec(body));
  add(/^(.+?)\s*[=:]\s*(.+)$/.exec(body));
  add(/^(.+?)\s+(\([^()]*\)|\S+)$/.exec(body));
  add(/^(\([^()]*\)|\S+)\s+(.+)$/.exec(body));
  return out;
}

/**
 * THE MEASURE-ROLE GIVENS (#1432, amendment 1) — radius, focus, directrix and perimeter, each
 * sayable as its own sentence in every order and copula the reader admits.
 *
 * Which OBJECT a contextual role means is M1's question, so each lowers to a fact the apply
 * boundary resolves (the «O מרכז המעגל» pattern) — except a perimeter with its vertices spelled
 * out, which lowers straight to the side sum «AB+BC+CA=12» carries, plus the polygon it names (the
 * area rule's #1080 ruling: naming a shape draws it).
 */
function parseMeasureRoles(line: string): RuleOutcome {
  const body = trim(line)
    .replace(/^נתו(?:ן|נה|נים|נות)\s+(?:כי\s+|ש(?=\S))?/, '')
    .replace(/^(?:it\s+is\s+)?given\s+(?:that\s+)?/i, '');
  for (const [roleSide, valueSide] of roleSplits(body)) {
    const ref = readRoleRef(roleSide);
    if (!ref) continue;
    const value = trim(valueSide);
    switch (ref.role) {
      case 'radius': {
        const v = roleScalar(value);
        if (v) return made([{ t: 'radius-of', ...(ref.circle ? { circle: ref.circle } : {}), value: v, src: line }]);
        /**
         * «אורך הקטע AB שווה לרדיוס המעגל» · «AB = רדיוס המעגל» (#1619 B1) — the radius against a MEASURED
         * length, read by the one length reader (`parseLengthExpr`) after the segment noun the exam puts
         * in front of it. M1 puts the circle's own radius on the other side (`radius-length`).
         */
        const lengthSrc = value
          .replace(/^(?:ה?אורך\s+(?:של\s+)?)?(?:ה?(?:קטע|צלע)\s+)?/, '')
          .replace(/^(?:the\s+)?(?:length\s+of\s+)?(?:(?:the\s+)?(?:segment|side)\s+)?/i, '');
        const length = /[A-Z]/.test(lengthSrc) ? parseLengthExpr(lengthSrc) : null;
        if (!length) continue;
        return made([{ t: 'radius-length', ...(ref.circle ? { circle: ref.circle } : {}), length, src: line }]);
      }
      case 'perimeter': {
        const v = roleScalar(value);
        if (!v) continue;
        if (!ref.ids) return made([{ t: 'perimeter-of', ...(ref.noun ? { noun: ref.noun } : {}), value: v, src: line }]);
        const ids = ref.ids;
        if (hasRepeat(ids)) return refuse('repeated-vertex', line);
        const shape = namedShapeFacts(ref.noun && ref.noun !== ANY_POLYGON_NOUN ? ref.noun : undefined, ids, line);
        if (shape === 'bad-arity') return refuse('bad-arity', line);
        const left = parseLengthExpr(ids.map((a, i) => `${a}${ids[(i + 1) % ids.length]}`).join('+'));
        const right = constantLengthExpr(value);
        if (!left || !right) continue;
        return made([...shape, { t: 'constraint', k: { t: 'length-eq', left, right }, src: line }]);
      }
      case 'focus': {
        const slot = pointSlot(value);
        if (!slot) continue;
        // An ellipse's focus is a derived point the engine has no rule for yet — understood, and
        // refused by name rather than guessed (ADR-AG-169 am. 1, not built).
        if (ref.host === 'ellipse') return refuse('out-of-scope', line);
        if ('name' in slot) return made([{ t: 'focus-of', id: slot.name, src: line }]);
        // «מוקד הפרבולה הוא (2,0)»: the coordinates become a point (the tool names it, #1263) that IS
        // the focus — a fixed parabola judges it, a parameterised one is pinned by it (M1).
        return viaCanonical(line, slot, (p) => [`${p} מוקד הפרבולה`]);
      }
      case 'directrix': {
        const src = value.replace(/^(?:ה?ישר\s+)?(?:ש?משוואתו\s+)?/, '').replace(/^(?:the\s+)?line\s+/i, '');
        if (!src.includes('=')) continue;
        const eq = equationExpr(src);
        if (!eq) return refuse('bad-equation', trim(src));
        return made([{ t: 'directrix-eq', eq, eqSrc: trim(src), src: line }]);
      }
      case 'foci':
        // «F1 ו-F2 מוקדי האליפסה» — naming two role points in one sentence is not built (am. 1).
        return refuse('out-of-scope', line);
    }
  }
  return null;
}

/**
 * THE SUBJECT of a circle sentence — ONE reader (#1504 amendment 1).
 *
 * Operator, on the pre-play: *«מעגל O ומעגל M משיקים מבחוץ»* — `not-handled`, while «המעגלים
 * משיקים מבחוץ» built. The subject had been read by four separate patterns (the named circle, the
 * contextual circle, the unnamed plural, the English), and each knew a different subset of the
 * shapes a student writes. They are one question — WHICH circle(s) is this sentence about — so one
 * reader answers it:
 *
 *  - `one` — «(ה)מעגל M», «מעגל שמרכזו M», "circle M", "the circle centred at M" (named), or
 *    «המעגל» / "the circle" (contextual: the one circle the figure holds);
 *  - `pair` — «מעגל O ומעגל M», «המעגל O והמעגל M», «(ה)מעגלים O ו-M» (also «O וM», «O, M»),
 *    «(שני) המעגלים» unnamed, "circle O and circle M", "circles O and M", "the (two) circles".
 *
 * The CREATION grammar is the same reader (#1432 am. 1, merged with #1504): the centre may carry its
 * coordinates («מעגל שמרכזו O(2,3)») or be coordinates alone («מעגל שמרכזו (2,3)»), and the subject may
 * carry the RADIUS TAIL («שרדיוסו 5», «ברדיוס 5», «שאורך רדיוסו 5», "with radius 5") — so «נתון מעגל O
 * ברדיוס 5 משיק לציר ה-x» is one subject and one verb, not a second circle grammar beside this one.
 */
type CircleSubject =
  /** `numeral`: the name is a circle's NUMERAL («המעגל 1», «מעגל II») — a REFERENCE to that circle, never a centre. */
  | { kind: 'one'; name?: string; placed?: string; coords?: string; radius?: string; numeral?: true }
  | { kind: 'pair'; names: string[] };

const SUBJECT_ONE_HE = new RegExp(
  `^ה?מעגל(?:\\s+(?:ש?מרכזו\\s+(?:(?:הוא|ב)\\s*)?(?:ה?נקודה\\s+)?)?${CENTRE_SLOT})?(?:\\s+${RADIUS_TAIL_HE})?$`,
);
const SUBJECT_ONE_EN = new RegExp(
  `^(?:the\\s+|a\\s+)?circle(?:\\s+(?:(?:cent(?:re|er)d\\s+at|with\\s+(?:its\\s+)?cent(?:re|er)(?:\\s+at)?|whose\\s+cent(?:re|er)\\s+is)\\s+(?:the\\s+point\\s+)?)?${CENTRE_SLOT})?(?:\\s+${RADIUS_TAIL_EN})?$`,
  'i',
);
const SUBJECT_PLURAL = new RegExp(`^(?:שני\\s+)?ה?מעגלים(?:\\s+(.+))?$|^(?:the\\s+)?(?:two\\s+)?circles(?:\\s+(.+))?$`, 'i');
const NAME_PAIR = new RegExp(
  `^(${NAME}|${CIRCLE_NUMERALS})\\s*(?:,|ו-?|\\s+and\\s+)\\s*(${NAME}|${CIRCLE_NUMERALS})$`,
  'i',
);

/**
 * A circle SUBJECT named by its NUMERAL — «המעגל 1», «מעגל II», "circle IV" (#1514 merge with #1511).
 * The numeral is a circle's NAME (ADR-AG-118, the 2026-09-19 ruling: «I» leaves the centre unnamed), so
 * it refers to the existing circle through `numeralCurveId` — and so the 1 ≡ I notation rule of
 * 2026-09-29 holds here too — rather than being read by `CENTRE_SLOT` as a centre letter, which minted
 * a second circle on a phantom point «I» beside the student's circle I.
 */
const SUBJECT_NUMERAL = new RegExp(`^(?:ה?מעגל|(?:the\\s+)?[Cc]ircle)\\s+(${NUMERAL_ALT})$`);

function readCircleSubject(s: string, numerals = true): CircleSubject | null {
  const num = numerals ? SUBJECT_NUMERAL.exec(trim(s)) : null;
  if (num) return { kind: 'one', name: num[1], numeral: true };
  const one = SUBJECT_ONE_HE.exec(s) ?? SUBJECT_ONE_EN.exec(s);
  if (one) {
    const [, name, placed, coords, radius] = one;
    return {
      kind: 'one',
      ...(name ? { name } : {}),
      ...(placed ? { placed } : {}),
      ...(coords ? { coords } : {}),
      ...(radius ? { radius } : {}),
    };
  }
  const plural = SUBJECT_PLURAL.exec(s);
  if (plural) {
    const list = plural[1] ?? plural[2];
    if (list === undefined) return { kind: 'pair', names: [] };
    const pair = NAME_PAIR.exec(trim(list));
    return pair ? { kind: 'pair', names: [pair[1], pair[2]] } : null;
  }
  // Two singular circles joined — «מעגל O ומעגל M», "circle O and circle M".
  const parts = s.split(/\s+ו-?\s*(?=ה?מעגל\s)|\s+and\s+(?=(?:the\s+)?circle\s)/i);
  if (parts.length === 2) {
    const ms = parts.map((p) => SUBJECT_NUMERAL.exec(trim(p)) ?? SUBJECT_ONE_HE.exec(trim(p)) ?? SUBJECT_ONE_EN.exec(trim(p)));
    // A part carrying coordinates or a radius is DECLINED, never half-read (not built for the pair form).
    if (ms.some((m) => m && (m[2] || m[3] || m[4]))) return null;
    const names = ms.map((m) => m?.[1]);
    if (names[0] && names[1]) return { kind: 'pair', names: [names[0], names[1]] };
  }
  return null;
}

/** «משיק» in its full inflection run, with the relative ה-, the conjunctive ו- and the ש- prefix —
 *  the one-spelling gate is this tree's recurring trap (`src-analytic/CLAUDE.md`). */
const HE_TANGENT_VERB = '(?:ה|ו|ש)?משיק(?:ה|ים|ות)?';
/** The sentence split at its VERB — the subject before it, the rest after (targets and modifiers). */
const TANGENT_SPLIT_HE = new RegExp(`^(.+?)\\s+${HE_TANGENT_VERB}(?=\\s|$)\\s*(.*)$`);
const TANGENT_SPLIT_EN = new RegExp(
  `^(.+?)\\s+(?:(?:is|are|which\\s+is|that\\s+is)\\s+)?(?:(${BRANCH_WORD})\\s+)?tangent(?=\\s|$)\\s*(.*)$`,
  'i',
);
/**
 * A CIRCLE GIVEN BY ITS CENTRE, and every TANGENCY sentence — to the axes (#1060), to LINES
 * (#1501) and to another CIRCLE (#1504) — read by one subject reader, one target reader and one
 * modifier list.
 *
 * Operator, 2026-09-15: *"we need to support מעגל O משיק לציר x and all verses of the axis
 * tangency"*. Operator, 2026-09-28: *"we need to support tangents — מעגל M משיק לישרים l1 ו- l2 …"*.
 * Operator, 2026-09-29 (pre-play of #1504): *«מעגל O ומעגל M משיקים מבחוץ»*.
 *
 * Tangency to an axis is how the corpus pins a circle WITHOUT giving its radius — «מעגל המשיק
 * לציר ה-x» says r = |y_O|, which is exactly one equation and exactly the sentence a student is
 * handed instead of a number.
 *
 * The RADIUS is a parameter named after the centre — `r_O` — so it needs no resolution against
 * the figure and cannot collide with a student's own single letters. It is declared POSITIVE:
 * #1019 made an undeclared parameter sample negative, which is right for a coefficient and wrong
 * for a length.
 *
 * The readings, in order: the subject as a CIRCLE subject (named ones create their circle, as
 * «נתון מעגל M» does), else the LINE-FIRST order («הישר l1 משיק למעגל M» — the subject is a
 * target list, read by the same `tangentTargets`, so the two orders cannot drift: #1281/#1495's
 * incidence-in-every-order rule, applied to tangency). A modifier — a branch word, «זה לזה», «בנקודה
 * T» — must land on a circle-to-circle relation; one that has none to land on declines the sentence
 * rather than vanish (the honesty invariant: no stated word is silently dropped).
 */
/**
 * The creation extras a ONE-circle subject carries (#1432 am. 1): the centre's own coordinates as a point
 * fact FIRST, then the circle, with a stated radius lowered by `circleAtFacts` to the same `radius-of`
 * the post-hoc sentence carries (the domain seam). A contextual subject («המעגל ברדיוס 5») has no circle
 * to create, so its radius is the contextual `radius-of`.
 */
function oneCircleFacts(subject: CircleSubject & { kind: 'one' }, targets: TangentTargets, line: string, at?: Id): Fact[] {
  const r = subject.radius !== undefined ? roleScalar(subject.radius) ?? undefined : undefined;
  if (!subject.name) return r ? [{ t: 'radius-of', value: r, src: line }] : [];
  const placed = subject.placed !== undefined ? parseClause(`${subject.name}${subject.placed}`) : null;
  return [
    ...(placed?.ok ? placed.facts.map((f) => ({ ...f, src: line })) : []),
    ...circleAtFacts(subject.name, targets, line, at, r),
  ];
}

/**
 * What a one-circle subject needs BEFORE its facts are built: a centre given by coordinates alone is
 * re-read with the tool's point name in its place (the #1263 mint, `viaCanonical`), and an unreadable
 * radius or centre is refused by name. `null` = carry on.
 */
function circleSubjectGate(subject: CircleSubject | null, line: string): RuleOutcome {
  if (!subject || subject.kind !== 'one') return null;
  if (subject.radius !== undefined && !roleScalar(subject.radius)) return refuse('bad-equation', subject.radius);
  if (subject.placed !== undefined) {
    const placed = parseClause(`${subject.name}${subject.placed}`);
    if (!placed.ok) return placed;
  }
  if (subject.coords !== undefined) {
    const slot = pointSlot(subject.coords);
    if (!slot || 'name' in slot) return refuse('bad-equation', subject.coords);
    const coords = subject.coords;
    return viaCanonical(line, slot, (p) => [line.replace(coords, p)]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE TANGENT AS AN OBJECT, AND CHORDS (#1619 B3, #1430, ADR-AG-195)
// ---------------------------------------------------------------------------

/**
 * «המשיק (למעגל (M)?)? (בנקודה A)?» / "the tangent (to the circle (M)?)? (at (the point)? A)?" — the
 * tangent NOUN PHRASE, one reader for every sentence that names it: the crossing operand, the equation
 * given, and the sentence that states the tangent alone. With a touch point it names (and builds) the
 * tangent object at that point; without one it is «המשיק» — the one tangent the figure holds (M1).
 */
const TANGENT_NOUN_HE = new RegExp(
  `^ה?משיק(?:\\s+(?:ל|של\\s+)ה?מעגל(?:\\s+(?:ש?מרכזו\\s+)?(${NAME}|${CIRCLE_NUMERALS}))?)?(?:\\s+ב(?:נקודה\\s+|-\\s*|נקודת\\s+ה?השקה\\s+)(${NAME}))?$`,
);
const TANGENT_NOUN_EN = new RegExp(
  `^(?:[Tt]he\\s+)?[Tt]angent(?:\\s+line)?(?:\\s+(?:to|of)\\s+(?:the\\s+)?circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?)?(?:\\s+at\\s+(?:the\\s+)?(?:point\\s+)?(${NAME}))?$`,
);
function readTangentNoun(text: string): { circle?: string; at?: Id } | null {
  const m = TANGENT_NOUN_HE.exec(text) ?? TANGENT_NOUN_EN.exec(text);
  if (!m) return null;
  return { ...(m[1] ? { circle: m[1] } : {}), ...(m[2] ? { at: m[2] } : {}) };
}

/** The facts that BUILD the tangent a phrase names at a point — none for bare «המשיק». */
function tangentObjectFacts(text: string, line: string): Fact[] {
  const t = readTangentNoun(text);
  if (!t || !t.at) return [];
  return [
    { t: 'declare', id: t.at, src: line },
    { t: 'tangent-line-at', at: t.at, ...(t.circle ? { circle: t.circle } : {}), src: line },
  ];
}

/** «משוואת המשיק (למעגל) (בנקודה A) היא …» / "the equation of the tangent (at A) is …". */
const TANGENT_EQ_HE = new RegExp(`^${HE_GIVEN}(?:ה)?משוואת\\s+(ה?משיק(?:\\s+.+?)?)\\s*(?:\\s(?:היא|הוא|הינה)\\s*:?|:)\\s*(.+)$`);
const TANGENT_EQ_EN = /^(?:[Tt]he\s+)?[Ee]quation\s+of\s+(?:the\s+)?(tangent.*?)\s+is\s*:?\s*(.+)$/;

/**
 * THE TANGENT AS AN OBJECT (#1619 B3, #1430, ADR-AG-195).
 *
 * - «(נתון) המשיק למעגל בנקודה A» — builds the tangent at A (A on the circle; the line ⊥ the radius).
 * - «משוואת המשיק למעגל בנקודה A היא y = 2x» — builds it AND states its equation: the stated line passes
 *   through A and is tangent there, which is the `tangent-of` touch lowering over that line. The line is
 *   a CARRIER (`stated: false`) — the tangent object is what is drawn, so one line is never drawn twice.
 * - «משוואת המשיק היא 4x + 3y = 40» — no point named: WHICH tangent is M1's question (`tangent-eq`).
 */
function parseTangentObject(line: string): RuleOutcome {
  const eqm = TANGENT_EQ_HE.exec(line) ?? TANGENT_EQ_EN.exec(line);
  if (eqm) {
    const noun = readTangentNoun(trim(eqm[1]));
    if (!noun) return null;
    const eqSrc = trim(eqm[2]);
    const eq = equationExpr(eqSrc);
    if (!eq || !symbolsOf(eq).some((sym) => RESERVED_SYMBOLS.has(sym))) return refuse('bad-equation', eqSrc);
    const id = `curve-${anonIndex(eqSrc)}`;
    if (!noun.at) return made([{ t: 'tangent-eq', id, eq, eqSrc, ...(noun.circle ? { circle: noun.circle } : {}), src: line }]);
    return made([
      ...tangentObjectFacts(trim(eqm[1]), line),
      { t: 'curve', id, label: { name: '', eqSrc }, curve: { eq }, stated: false, src: line },
      {
        t: 'tangent-of',
        axes: [],
        lines: [{ kind: 'curve', id, label: eqSrc }],
        ...(noun.circle ? { circle: noun.circle } : {}),
        at: noun.at,
        src: line,
      },
    ]);
  }
  const bare = line.replace(/^נתו(?:ן|נה|נים|נות)\s+/, '').replace(/^(?:it\s+is\s+)?given\s+(?:that\s+)?/i, '');
  // «דרך P עובר משיק למעגל» — a tangent FROM a point (#1430 step 3): the free-direction line through P
  // («דרך P עובר ישר», #1319) and its tangency, so the two tangents are the two roots the solve can find.
  const fromHe = TANGENT_FROM_HE.exec(trim(bare));
  const fromEn = fromHe ? null : TANGENT_FROM_EN.exec(trim(bare));
  if (fromHe || fromEn) {
    const [p, circle] = fromHe ? [fromHe[1], fromHe[2]] : [fromEn![2], fromEn![1]];
    const through = parseClause(`דרך ${p} עובר ישר`);
    if (!through.ok) return null;
    const lineAt = through.facts.find((x) => x.t === 'line-at');
    if (!lineAt || lineAt.t !== 'line-at') return null;
    return made([
      ...through.facts.map((x) => ({ ...x, src: line })),
      {
        t: 'tangent-of',
        axes: [],
        lines: [{ kind: 'curve', id: lineAt.id, label: `משיק דרך ${p}` }],
        ...(circle ? { circle } : {}),
        src: line,
      },
    ]);
  }
  const built = tangentObjectFacts(trim(bare), line);
  return built.length > 0 ? made(built) : null;
}

/** «דרך (הנקודה) P עובר משיק למעגל» / "a tangent to the circle passes through P" (#1430). */
const TANGENT_FROM_HE = new RegExp(
  `^דרך\\s+${HE_POINT}(${NAME})\\s+(?:עובר(?:ת)?\\s+)?(?:ישר\\s+)?(?:ה)?משיק\\s+(?:ל|של\\s+)?ה?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?$`,
);
const TANGENT_FROM_EN = new RegExp(
  `^(?:[Aa]\\s+|[Tt]he\\s+)?[Tt]angent(?:\\s+line)?\\s+to\\s+(?:the\\s+)?circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?\\s+(?:passes\\s+)?through\\s+(?:(?:the\\s+)?point\\s+)?(${NAME})$`,
);

/**
 * CHORDS (#1619 B3, ruling 4 on #1616: *"Chord: yes"*). A chord is a segment whose two ends lie on the
 * circle — so it lowers to exactly that, through the sentences that already say it («A על המעגל»,
 * «הקטע AB»), and needs no object of its own:
 *
 * - «AB מיתר (במעגל (M)?)», «(ה)מיתר AB (במעגל …)», «AB הוא מיתר במעגל», "AB is a chord (of the circle)";
 * - «במעגל (שמרכזו M)? המיתרים AC ו-BD נפגשים בנקודה E» — both chords, and E their crossing (the two
 *   SEGMENTS cross, so the crossing is bounded on both);
 * - «במעגל (שמרכזו M)? המיתרים AB ו-BC שווים» — both chords, and |AB| = |BC|.
 *
 * «במעגל שמרכזו M» names the circle by its centre: the sentence is about that circle, which «נתון מעגל
 * שמרכזו M» states (idempotent when it already exists).
 */
const CHORD_CIRCLE_HE = `ב(?:ה)?מעגל(?:\\s+(?:ש?מרכזו\\s+(${NAME})|(${NAME}|${CIRCLE_NUMERALS})))?`;
const CHORD_ONE_HE = new RegExp(
  `^${HE_GIVEN}(?:(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})\\s+(?:(?:הוא|היא)\\s+)?(?:ה)?מיתר|(?:ה)?מיתר\\s+(${NAME})(${NAME}))(?:\\s+${CHORD_CIRCLE_HE})?$`,
);
const CHORD_ONE_EN = new RegExp(
  `^(?:(?:the\\s+)?(?:segment\\s+)?(${NAME})(${NAME})\\s+is\\s+(?:a|the)\\s+chord|(?:the\\s+)?chord\\s+(${NAME})(${NAME}))(?:\\s+(?:of|in)\\s+(?:the\\s+)?circle(?:\\s+(?:centred\\s+at\\s+|centered\\s+at\\s+)?(${NAME}|${CIRCLE_NUMERALS}))?)?$`,
);
const CHORD_PAIR_HE = new RegExp(
  `^(?:${CHORD_CIRCLE_HE}\\s*,?\\s+)?(?:ה)?מיתרים\\s+(${NAME})(${NAME})\\s+ו-?\\s*(${NAME})(${NAME})\\s+(.+)$`,
);
const CHORD_PAIR_EN = new RegExp(
  `^(?:[Ii]n\\s+the\\s+circle(?:\\s+(${NAME}))?\\s*,?\\s+)?(?:[Tt]he\\s+)?[Cc]hords\\s+(${NAME})(${NAME})\\s+and\\s+(${NAME})(${NAME})\\s+(.+)$`,
);

/**
 * The facts for one chord: both ends introduced and ON the circle, and the segment drawn. The circle is
 * the one the phrase named — by its centre letter (`circle-at-M`), by its numeral, or the contextual one
 * (`on-kind`, resolved at M1 exactly as «A על המעגל» is).
 */
function chordFacts(a: Id, b: Id, circle: string | undefined, line: string): Fact[] | null {
  const seg = parseClause(`הקטע ${a}${b}`);
  if (!seg.ok) return null;
  const host = circle === undefined ? undefined : isNumeralName(circle) ? numeralCurveId('circle', circle) : `circle-at-${circle}`;
  const on = (id: Id): Fact =>
    host === undefined ? { t: 'on-kind', id, kind: 'circle', src: line } : { t: 'constraint', k: { t: 'on-curve', id, curve: host }, src: line };
  return [
    { t: 'declare', id: a, src: line },
    { t: 'declare', id: b, src: line },
    on(a),
    on(b),
    ...seg.facts.map((x) => ({ ...x, src: line })),
    // A CHORD HAS TWO ENDS (#1638, ADR-AG-197): a configuration that collapses it onto one point is not the
    // chord the noun named — the polygon's `distinct`, for the two-point figure a chord is.
    { t: 'selector', sel: { kind: 'distinct', ids: [a, b] }, src: line },
  ];
}

/**
 * THE POINTS ONE CHORD SENTENCE NAMES ARE DIFFERENT POINTS (#1638, ADR-AG-197). «המיתרים AB ו-BC» names three
 * points, and the plural noun names two chords: with A = C the "two chords" are one. So the sentence carries a
 * `distinct` over every letter it named — through the noun, exactly as a polygon's vertices are, never a global
 * rule (ADR-AG-125: a coincidence the figure merely reaches elsewhere is a different question).
 */
const chordPairDistinct = (letters: readonly Id[], line: string): Fact => ({
  t: 'selector',
  sel: { kind: 'distinct', ids: [...new Set(letters)] },
  src: line,
});

/** A canonical clause's facts, re-attributed to the student's line — `null` when it does not parse. */
function clauseFacts(clause: string, line: string): Fact[] | null {
  const r = parseClause(clause);
  return r.ok ? r.facts.map((x) => ({ ...x, src: line })) : null;
}

function parseChord(line: string): RuleOutcome {
  const one = CHORD_ONE_HE.exec(line);
  const oneEn = one ? null : CHORD_ONE_EN.exec(line);
  if (one || oneEn) {
    const a = one ? (one[1] ?? one[3]) : (oneEn![1] ?? oneEn![3]);
    const b = one ? (one[2] ?? one[4]) : (oneEn![2] ?? oneEn![4]);
    if (a === b) return refuse('repeated-vertex', line);
    const centre = one ? one[5] : undefined;
    const name = one ? one[6] : oneEn![5];
    const created = centre ? clauseFacts(`נתון מעגל שמרכזו ${centre}`, line) : [];
    const chord = chordFacts(a, b, centre ?? name, line);
    return created && chord ? made([...created, ...chord]) : null;
  }
  const he = CHORD_PAIR_HE.exec(line);
  const en = he ? null : CHORD_PAIR_EN.exec(line);
  if (!he && !en) return null;
  const [centre, name, a, b, c, d, rest] = he ? [he[1], he[2], he[3], he[4], he[5], he[6], he[7]] : [undefined, en![1], en![2], en![3], en![4], en![5], en![6]];
  if (a === b || c === d) return refuse('repeated-vertex', line);
  const created = centre ? clauseFacts(`נתון מעגל שמרכזו ${centre}`, line) : [];
  const first = chordFacts(a, b, centre ?? name, line);
  const second = chordFacts(c, d, centre ?? name, line);
  if (!created || !first || !second) return null;
  const chords = [...created, ...first, ...second, chordPairDistinct([a, b, c, d], line)];
  const meet =
    new RegExp(`^(?:נפגשים|נחתכים|מצטלבים)\\s+ב-?\\s*(?:ה?נקודה\\s+)?(${NAME})$`).exec(trim(rest)) ??
    new RegExp(`^(?:meet|intersect|cross)\\s+at\\s+(?:the\\s+)?(?:point\\s+)?(${NAME})$`, 'i').exec(trim(rest));
  if (meet) {
    const crossing = clauseFacts(`${meet[1]} נקודת החיתוך של הקטע ${a}${b} עם הקטע ${c}${d}`, line);
    return crossing ? made([...chords, ...crossing]) : null;
  }
  const equal = /^(?:שווים|שווים\s+זה\s+לזה|שווים\s+באורכם|are\s+equal(?:\s+in\s+length)?)$/i.test(trim(rest));
  if (equal) {
    const same = clauseFacts(`${a}${b} = ${c}${d}`, line);
    return same ? made([...chords, ...same]) : null;
  }
  return null;
}

function parseCircleAt(line: string): RuleOutcome {
  const mods: TangencyMods = { reciprocal: false, clash: false };
  /*
   * English "touch(es)" is "tangent to" (#1619 B2's "the sides AB, BC and CA touch the circle at D, E and F
   * respectively", read here since the integration): one verb list, so the two verbs cannot drift.
   */
  const listed = peelTouchList(
    line.replace(/^נתו(?:ן|נה|נים|נות)\s+/, '').replace(/\s+touch(?:es)?\s+(?=(?:the\s+)?(?:circle|[xy][- ]axis|line)\b)/i, ' tangent to '),
  );
  if (listed.ats) mods.ats = listed.ats;
  const body = peelMods(listed.rest, 'tail', mods);
  if (mods.ats && mods.at !== undefined) return null; // «בנקודות A ו-C … בנקודה E» — at odds with itself
  // «המעגל משיק לציר ה-y בנקודה C וחותך את ציר ה-x בנקודה B» — ONE subject, two verbs: each verb is its
  // own sentence about that subject (#1619 B3), read by the rules that own them.
  const twoVerbs = new RegExp(`^(.+?)\\s+(${HE_TANGENT_VERB}\\s+.+?)\\s+ו(חות(?:ך|כת|כים|כות)\\s+.+)$`).exec(line.replace(/^נתו(?:ן|נה|נים|נות)\s+/, ''));
  if (twoVerbs) {
    const [, subj, tangent, crossing] = twoVerbs;
    return viaCanonical(line, null, () => [`${subj} ${tangent}`, `${subj} ${crossing}`]);
  }
  const he = TANGENT_SPLIT_HE.exec(body);
  const en = he ? null : TANGENT_SPLIT_EN.exec(body);
  if (!he && !en) {
    // No verb: «נתון מעגל O» alone — a circle with a free centre and a free radius (3 DOF). A bare
    // NUMERAL circle («נתון מעגל 1») is #1257's open named circle, not built: the numeral reader is off
    // here, so the sentence keeps exactly the reading it had.
    const subject = readCircleSubject(body, false);
    const gate = circleSubjectGate(subject, line);
    if (gate) return gate;
    if (!subject || subject.kind !== 'one' || (!subject.name && subject.radius === undefined)) return null;
    if (mods.branch || mods.reciprocal || mods.at) return null;
    return made(oneCircleFacts(subject, NO_TARGETS, line));
  }
  const isEn = en !== null;
  const subjectText = trim((he ?? en)![1]);
  // English may put its branch word before "tangent" ("is externally tangent to").
  if (en?.[2]) peelMods(en[2], 'head', mods);
  const rest = peelMods(he ? he[2] : en![3], 'head', mods);
  if (mods.clash) return null;
  // The object: Hebrew «ל…», English "to …". An empty rest is the plural's «המעגלים משיקים».
  let objectText: string | null = null;
  if (rest) {
    const obj = isEn ? /^to\s+(.+)$/i.exec(rest) : /^(ל.+)$/.exec(rest);
    if (!obj) return null;
    objectText = obj[1];
  }

  const subject = readCircleSubject(subjectText);
  const gate = circleSubjectGate(subject, line);
  if (gate) return gate;
  const circleSubject = subject ? circleSubjectFacts(subject, objectText, mods, line) : null;
  if (circleSubject) return made(circleSubject);
  if (objectText === null) return null;

  // THE LINE-FIRST ORDER — the subject is a target list, the object ONE circle (named or contextual),
  // both read by the one target reader.
  const object = tangentTargets(objectText, line);
  if (!object || object.circles.length !== 1 || object.axes.length + object.lines.length + object.facts.length > 0) return null;
  if (object.circles[0].branch) return null;
  const targets = tangentTargets(subjectText, line);
  if (!targets) return null;
  // «הישר BC משיק למעגל בנקודה B», «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה» (#1619 B3, #1430).
  if (touchApplies(targets, mods)) {
    if (mods.branch || mods.reciprocal) return null;
    const touched = touchFacts(targets, touchesOf(mods)!, object.circles[0].name, line);
    return touched ? made(touched) : null;
  }
  if (mods.ats) return null;
  const circles = withSentenceMods(targets.circles, mods);
  if (!circles) return null;
  const host = object.circles[0].name;
  return made([
    ...targets.facts,
    // «המעגל I משיק למעגל M» — a circle SUBJECT before a named (or contextual) circle (#1504).
    ...circles.map((t) => ({
      t: 'tangent-circles' as const,
      ...(t.name ? { a: t.name } : {}),
      ...(host ? { b: host } : {}),
      ...(t.branch ? { branch: t.branch } : {}),
      ...(mods.at ? { at: mods.at } : {}),
      src: line,
    })),
    ...(targets.axes.length + targets.lines.length > 0 || circles.length === 0
      ? [
          {
            t: 'tangent-of' as const,
            axes: targets.axes,
            ...(targets.lines.length ? { lines: targets.lines } : {}),
            ...(host ? { circle: host } : {}),
            src: line,
          },
        ]
      : []),
    // The subject names its pieces, so it draws them (#1639).
    ...targets.pieces.flatMap((q) => pieceFacts(q.noun, q.a, q.b, line)),
  ]);
}

/**
 * A SENTENCE-LEVEL modifier lands on the circle relations (#1504 amendment 1): a branch word said
 * after the verb or after the whole target list applies to each circle target that did not carry
 * its own; «בנקודה T» names ONE touch, so it needs exactly one circle relation; «זה לזה» belongs to
 * a plural subject only. Anything that cannot land declines the sentence — `null`.
 */
function withSentenceMods(
  circles: TangentTargets['circles'],
  mods: TangencyMods,
): TangentTargets['circles'] | null {
  if (mods.reciprocal) return null;
  if ((mods.branch || mods.at) && circles.length === 0) return null;
  if (mods.at && circles.length !== 1) return null;
  if (!mods.branch) return circles;
  if (circles.some((t) => t.branch && t.branch !== mods.branch)) return null; // «…מבפנים … מבחוץ» — at odds with itself
  return circles.map((t) => ({ ...t, branch: mods.branch }));
}

/** The facts for a sentence whose subject is a CIRCLE (or two) — `null` when it is not this reading. */
function circleSubjectFacts(subject: CircleSubject, objectText: string | null, mods: TangencyMods, line: string): Fact[] | null {
  const targets = objectText === null ? null : tangentTargets(objectText, line);
  if (objectText !== null && !targets) return null;

  if (subject.kind === 'one') {
    if (!targets) return null; // «המעגל משיק» with nothing after it states nothing
    // «(ה)מעגל (שמרכזו M) משיק לציר ה-x בנקודה A» — the touch point named (#1619 B3, ADR-AG-195).
    if (touchApplies(targets, mods)) {
      if (mods.branch || mods.reciprocal) return null;
      const ats = touchesOf(mods)!;
      if (subject.name && !subject.numeral) {
        const touched = touchFacts(targets, ats, subject.name, line);
        return touched ? [...oneCircleFacts(subject, NO_TARGETS, line), ...touched] : null;
      }
      const touched = touchFacts(targets, ats, subject.numeral ? subject.name : undefined, line);
      return touched ? [...touched, ...(subject.numeral ? [] : oneCircleFacts(subject, NO_TARGETS, line))] : null;
    }
    if (mods.ats) return null;
    const circles = withSentenceMods(targets.circles, mods);
    if (!circles) return null;
    const withMods = { ...targets, circles };
    const drawn = targets.pieces.flatMap((q) => pieceFacts(q.noun, q.a, q.b, line));
    if (subject.name && !subject.numeral) return [...oneCircleFacts(subject, withMods, line, mods.at), ...drawn];
    // A NUMERAL subject names an existing circle: it rides `a`/`circle` exactly as the line-first
    // order's host does, and M1 resolves it through the one naming chokepoint.
    const named = subject.numeral ? subject.name : undefined;
    // No centre named: the sentence is about the one circle in the figure, which only M1 knows.
    // «המעגל משיק למעגל K» — the contextual subject rides `a: undefined`; M1 reads it as the one
    // OTHER circle (#1504). `tangent-of` is emitted only when it has work.
    return [
      ...targets.facts,
      ...circles.map((t) => ({
        t: 'tangent-circles' as const,
        ...(named ? { a: named } : {}),
        ...(t.name ? { b: t.name } : {}),
        ...(t.branch ? { branch: t.branch } : {}),
        ...(mods.at ? { at: mods.at } : {}),
        src: line,
      })),
      ...(targets.axes.length + targets.lines.length > 0 || circles.length === 0
        ? [{ t: 'tangent-of' as const, axes: targets.axes, ...(targets.lines.length ? { lines: targets.lines } : {}), ...(named ? { circle: named } : {}), src: line }]
        : []),
      // «המעגל ברדיוס 5 משיק לציר ה-x» — the contextual radius LAST, so its substitution reaches the tangency (#1432 am. 1).
      ...(subject.numeral ? [] : oneCircleFacts(subject, NO_TARGETS, line)),
      ...drawn,
    ];
  }

  if (mods.ats) return null;
  // TWO circles. A named one is introduced by the sentence exactly as «מעגל M משיק…» introduces M
  // (a numeral names an existing circle and introduces nothing).
  // A NUMERAL is a circle's name, never a centre letter — «I» included (the 2026-09-19 ruling).
  const letters = subject.names.filter((n) => !isNumeralName(n) && new RegExp(`^${NAME}$`).test(n));
  const introduce = (t: TangentTargets) => letters.flatMap((n) => circleAtFacts(n, t, line));
  if (targets) {
    // «המעגלים O ו-M משיקים לציר ה-x» — EACH is tangent to the targets. Needs the names, and a
    // numeral cannot carry its own circle facts; a touch point would not say which touch.
    if (subject.names.length !== 2 || letters.length !== 2 || mods.reciprocal || mods.at) return null;
    const circles = withSentenceMods(targets.circles, { ...mods, reciprocal: false });
    if (!circles) return null;
    const each = { ...targets, circles };
    return [...targets.facts, ...introduce({ ...each, facts: [] })];
  }
  // «המעגלים (O ו-M) משיקים (זה לזה) (מבחוץ) (בנקודה T)» — the two circles touch each other.
  const [a, b] = subject.names;
  return [
    ...introduce(NO_TARGETS),
    {
      t: 'tangent-circles' as const,
      ...(a ? { a } : {}),
      ...(b ? { b } : {}),
      ...(mods.branch ? { branch: mods.branch } : {}),
      ...(mods.at ? { at: mods.at } : {}),
      src: line,
    },
  ];
}

// ---------------------------------------------------------------------------
// INSCRIBED AND CIRCUMSCRIBED — a polygon in a circle, a circle in a polygon (#1619 B2, #1554, ADR-AG-194)
// ---------------------------------------------------------------------------

/**
 * ONE RULE FAMILY OVER EVERY SHAPE NOUN, with the CONTAINER deciding the direction.
 *
 * Measured on the 471 corpus before this: «מרובע ABCD חסום במעגל», «המרובע ABCD חסום במעגל שמרכזו M», «מרובע
 * ABCD חסום במעגל שמשוואתו …», «משולש ABC חסום במעגל שקוטרו AC», «במעגל שמרכזו M חסום משולש חד זוויות ABC»,
 * «במשולש AOB חסום מעגל שמרכזו C» — every one `not-handled`. Only a three-letter run inscribed in a circle
 * with no description existed (`CIRCUM_HE`), and only once the triangle's vertices had been drawn.
 *
 * The class is not "the quadrilateral sentence" (#1554's diagnosis): it is **a polygon noun of any arity, in
 * either direction, in a circle the sentence may itself introduce**. So the sentence is lowered as the
 * sentences it is made of, each read by the rule that already owns it:
 *
 * - the POLYGON is «<noun> <run>» — `parseShape`, with every given the noun carries («מקבילית» ⇒ two parallel
 *   pairs; a cyclic one is then a rectangle, by the solve), absorbed by M1 when the ring already exists;
 * - the CIRCLE is «מעגל <tail>» — «שמרכזו M» is the circle on a centre, «שמשוואתו …» the equation circle,
 *   «שקוטרו AC» the circle on a diameter — read by the circle rules, so every way the grammar can introduce
 *   a circle can introduce this one, and it is «המעגל» afterwards like any other. With no tail it is the
 *   circle COMPUTED through the first three vertices (ADR-AG-160: no solve, no invented centre letter);
 * - the INCIDENCE: each vertex the circle does not already pass through is ON it. Three vertices define the
 *   computed circle, so the triangle is the n = 3 case of the same rule with zero incidences — the old
 *   `CIRCUM_HE` is this rule now, not a second copy beside it.
 *
 * The converse direction («מעגל חסום במשולש ABC», «במשולש AOB חסום מעגל», «משולש ABC חוסם מעגל») is the
 * INCIRCLE — the container marker «ב» and the verb must agree (2-D's #31 / #38), and a rule that read the
 * letters alone built the converse. It is a computed circle too (`CircleDef` `incircle`); a quadrilateral's
 * carries its Pitot condition AB + CD = BC + DA as the stated given it is (#1554's lowering).
 */
const INSCRIBED_RUN = `((?:${NAME}){3,4})`;
/** A noun phrase — the noun and its adjectives; `inscribedShape` decides whether the registry knows it. */
const NOUN_PHRASE = '([א-ת]+(?:[- ][א-ת]+){0,3})';
const INSCRIBED_VERB_HE = '(?:(?:הוא|היא)\\s+)?(?:ה)?(?:חסום|חסומה)';
const CIRCUMSCRIBING_VERB_HE = '(?:(?:הוא|היא)\\s+)?(?:ה)?(?:חוסם|חוסמת)';
/** The circle's own words after «מעגל» — a numeral name, «שמרכזו M», «שמשוואתו …», «שקוטרו AC». */
const CIRCLE_TAIL = '(?:\\s+(.+?))?';

/** Polygon in circle — the polygon is the subject: «(ה)מרובע ABCD (הוא) חסום במעגל (שמרכזו M)». */
const CYCLIC_SUBJECT_HE = new RegExp(
  `^${HE_GIVEN}(?:${NOUN_PHRASE}\\s+)?${INSCRIBED_RUN}\\s+${INSCRIBED_VERB_HE}\\s+ב(?:ה)?מעגל${CIRCLE_TAIL}$`,
);
/** «מרובע ABCD בר חסימה» — INSCRIBABLE: the same statement, with no circle described. */
const CYCLIC_ABLE_HE = new RegExp(
  `^${HE_GIVEN}(?:${NOUN_PHRASE}\\s+)?${INSCRIBED_RUN}\\s+(?:(?:הוא|היא)\\s+)?(?:ה)?בר[\\s-]+חסימה$`,
);
/** The circle is the subject: «(ה)מעגל (I) (ה)חוסם (את) (ה)מרובע ABCD». */
const CYCLIC_CIRCLE_HE = new RegExp(
  `^${HE_GIVEN}ה?מעגל${CIRCLE_TAIL}\\s+${CIRCUMSCRIBING_VERB_HE}\\s+(?:את\\s+)?(?:${NOUN_PHRASE}\\s+)?${INSCRIBED_RUN}$`,
);
/** The container first: «במעגל (שמרכזו M) חסום משולש (חד זוויות) ABC». */
const CYCLIC_CONTAINER_HE = new RegExp(
  `^${HE_GIVEN}ב(?:ה)?מעגל${CIRCLE_TAIL}\\s+${INSCRIBED_VERB_HE}\\s+(?:${NOUN_PHRASE}\\s+)?${INSCRIBED_RUN}$`,
);

/** Circle in polygon — the circle is the subject: «(ה)מעגל (שמרכזו C) (ה)חסום ב(ה)משולש ABC». */
const INCIRCLE_SUBJECT_HE = new RegExp(
  `^${HE_GIVEN}ה?מעגל${CIRCLE_TAIL}\\s+${INSCRIBED_VERB_HE}\\s+ב${NOUN_PHRASE}\\s+${INSCRIBED_RUN}$`,
);
/** The container first: «במשולש AOB חסום מעגל (שמרכזו C)». */
const INCIRCLE_CONTAINER_HE = new RegExp(
  `^${HE_GIVEN}ב${NOUN_PHRASE}\\s+${INSCRIBED_RUN}\\s+${INSCRIBED_VERB_HE}\\s+(?:ה)?מעגל${CIRCLE_TAIL}$`,
);
/** The polygon circumscribes: «(ה)משולש ABC (ה)חוסם (את ה)מעגל». */
const INCIRCLE_POLYGON_HE = new RegExp(
  `^${HE_GIVEN}(?:${NOUN_PHRASE}\\s+)?${INSCRIBED_RUN}\\s+${CIRCUMSCRIBING_VERB_HE}\\s+(?:את\\s+)?(?:ה)?מעגל${CIRCLE_TAIL}$`,
);

const EN_NOUN = '([a-z]+(?:[\\s-][a-z]+){0,3})';
const CYCLIC_EN: readonly RegExp[] = [
  new RegExp(`^(?:the\\s+)?circumcircle\\s+of\\s+(?:the\\s+)?(?:${EN_NOUN}\\s+)?${INSCRIBED_RUN}$`, 'i'),
  new RegExp(`^(?:the\\s+|a\\s+)?circle\\s+circumscribing\\s+(?:the\\s+)?(?:${EN_NOUN}\\s+)?${INSCRIBED_RUN}$`, 'i'),
  new RegExp(
    `^(?:the\\s+|a\\s+)?(?:${EN_NOUN}\\s+)?${INSCRIBED_RUN}\\s+is\\s+inscribed\\s+in\\s+(?:a|the)\\s+circle` +
      `(?:\\s+(?:with|whose)\\s+cent(?:re|er)\\s+(?:is\\s+)?(${NAME}))?$`,
    'i',
  ),
  new RegExp(`^(?:the\\s+|a\\s+)?(?:${EN_NOUN}\\s+)?${INSCRIBED_RUN}\\s+is\\s+(?:cyclic|inscribable)$`, 'i'),
  new RegExp(`^(?:a\\s+|the\\s+)?cyclic\\s+(quadrilateral)\\s+${INSCRIBED_RUN}$`, 'i'),
];
const INCIRCLE_EN: readonly RegExp[] = [
  new RegExp(`^(?:the\\s+)?incircle\\s+of\\s+(?:the\\s+)?${EN_NOUN}\\s+${INSCRIBED_RUN}$`, 'i'),
  new RegExp(`^(?:the\\s+|a\\s+)?circle\\s+(?:is\\s+)?inscribed\\s+in\\s+(?:the\\s+|a\\s+)?${EN_NOUN}\\s+${INSCRIBED_RUN}$`, 'i'),
  new RegExp(`^(?:the\\s+|a\\s+)?${EN_NOUN}\\s+${INSCRIBED_RUN}\\s+circumscribes\\s+(?:a|the)\\s+circle$`, 'i'),
  new RegExp(`^(?:a\\s+|the\\s+)?tangential\\s+(quadrilateral)\\s+${INSCRIBED_RUN}$`, 'i'),
];

/**
 * The polygon a sentence names — its own lowering (`parseShape`), or, with no noun, the generic ring of its
 * arity («ABCD חסום במעגל» is a quadrilateral). `null` when the phrase is not a shape noun the registry knows,
 * so a phrase that merely LOOKS like one leaves the sentence to the rules after this one.
 */
function inscribedShape(noun: string | undefined, run: string, en: boolean): { facts: Fact[]; vertices: Id[] } | ParseResult | null {
  const vertices = splitNames(run);
  const phrase = noun ?? (vertices.length === 3 ? (en ? 'triangle' : 'משולש') : en ? 'quadrilateral' : 'מרובע');
  const r = parseShape(`${phrase.trim()} ${run}`);
  if (!r) return null;
  if (!r.ok) return r;
  if (!r.facts.some((f) => f.t === 'polygon')) return null;
  return { facts: r.facts, vertices };
}

/** The circle a cyclic sentence describes: the facts that introduce it, its id, and the points it already passes through. */
interface CircleHost {
  facts: Fact[];
  id: Id;
  through: Id[];
}

/**
 * «… במעגל <tail>» — the circle, read by the circle rules. No tail (or «חדש»): the circle computed through the
 * first three vertices. A NUMERAL tail is the circle's own name, as in «מעגל I העובר דרך …» (the old
 * `CIRCUM_HE` reading, kept). Anything else is «מעגל <tail>» — «שמרכזו M», «שמשוואתו …», «שקוטרו AC» — and
 * must introduce exactly ONE circle, or the sentence is not this rule's.
 */
function cyclicHost(tail: string | undefined, vertices: Id[], line: string): CircleHost | ParseResult | null {
  const t = tail?.trim();
  const pts: [Id, Id, Id] = [vertices[0], vertices[1], vertices[2]];
  if (!t || /^ה?חדש$/.test(t)) {
    const id = `circle-thru-${[...pts].sort().join('')}`;
    return { facts: [{ t: 'circle-thru', id, def: { t: 'through', pts }, src: line }], id, through: pts };
  }
  if (new RegExp(`^(?:${CIRCLE_NUMERALS})$`).test(t)) {
    const id = numeralCurveId('circle', t);
    return { facts: [{ t: 'circle-thru', id, def: { t: 'through', pts }, name: t, src: line }], id, through: pts };
  }
  const parsed = parseClause(`מעגל ${t}`);
  if (!parsed.ok) return parsed.code === 'not-handled' ? null : parsed;
  // The circle the tail describes, as its creation: a described circle comes back wrapped (`the-circle`,
  // ADR-AG-196), and the inscribed sentence decides the binding for the whole statement itself.
  const r = { facts: parsed.facts.flatMap((f): Fact[] => (f.t === 'the-circle' ? f.create : [f])) };
  const makers = r.facts.filter(
    (f) =>
      f.t === 'circle-at' ||
      f.t === 'circle-thru' ||
      (f.t === 'curve' && f.curve.kind === 'circle') ||
      (f.t === 'diameter-of' && f.define),
  );
  if (makers.length !== 1) return null;
  const m = makers[0];
  if (m.t === 'diameter-of') return { facts: r.facts, id: diameterCircleId(m.a, m.b), through: [m.a, m.b] };
  if (m.t === 'circle-thru') return { facts: r.facts, id: m.id, through: circleDefPoints(m.def) };
  if (m.t === 'circle-at' || m.t === 'curve') return { facts: r.facts, id: m.id, through: [] };
  return null;
}

/** A polygon IN a circle: the polygon, the circle, and each vertex the circle does not already pass through ON it. */
function cyclicFacts(noun: string | undefined, run: string, tail: string | undefined, line: string, en = false): RuleOutcome {
  const shape = inscribedShape(noun, run, en);
  if (!shape || !('vertices' in shape)) return shape;
  // A noun no circle can pass around (#1554 ruling 1): the sentence contradicts itself — refused naming both nouns.
  const ring = shape.facts.find((f): f is Extract<Fact, { t: 'polygon' }> => f.t === 'polygon');
  const forced = ring?.noun ? shapeRow(ring.noun)?.notCyclic : undefined;
  if (ring?.noun && forced) return { ok: false, code: 'inscribed-contradicts-noun', detail: line, shape: ring.noun, forced };
  const host = cyclicHost(tail, shape.vertices, line);
  if (!host || !('id' in host)) return host;
  const on = shape.vertices
    .filter((v) => !host.through.includes(v))
    .map((id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: host.id }, src: line }));
  const created = [...host.facts, ...on].map((f) => ({ ...f, src: line }));
  /*
   * WHICH circle (ADR-AG-196): «חסום במעגל» with no description is THE circle — the figure's one circle when
   * it has one; a circle the sentence describes («שמרכזו M», «שמשוואתו …») is that circle when the figure
   * already holds it. Bound, every vertex is ON it — the statement the sentence makes about that circle.
   * «במעגל חדש» and a numeral name say which circle outright, and keep their own reading.
   */
  const t = tail?.trim();
  const maker = host.facts.find((g) => g.t === 'circle-at' || g.t === 'curve');
  // A centre letter the description names — «שמרכזו M», or «M שמשוואתו …» (the letter is the centre, #1059).
  const centre =
    maker?.t === 'circle-at'
      ? maker.centre
      : host.facts.find((g): g is Extract<Fact, { t: 'derived' }> => g.t === 'derived' && g.rule.t === 'circle-centre')?.id;
  const match = !t ? undefined : centre ? { centre } : maker?.t === 'curve' ? { eq: maker.curve.eq } : null;
  if (match === null || (t && /^ה?חדש$/.test(t))) return made([...shape.facts.map((g) => ({ ...g, src: line })), ...created]);
  // Bound to a circle the figure has, an equation in the description is a statement about it too (#1633).
  const about: Fact[] = [
    ...(maker?.t === 'curve' ? [{ t: 'circle-eq' as const, circleId: CIRCLE_SENTINEL, eq: maker.curve.eq, src: line }] : []),
    ...shape.vertices.map((id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: CIRCLE_SENTINEL }, src: line })),
  ];
  return made([
    ...shape.facts.map((g) => ({ ...g, src: line })),
    { t: 'the-circle', create: created, about, ...(match ? { match } : {}), src: line },
  ]);
}

/**
 * A circle IN a polygon — the computed incircle, its centre when the sentence names one, and for a
 * quadrilateral the Pitot condition that makes the incircle exist. A tail this rule cannot honour (a radius,
 * an equation, a centre letter for a quadrilateral) is refused BY NAME — a stated given never vanishes.
 */
function incircleFacts(noun: string, run: string, tail: string | undefined, line: string, en = false): RuleOutcome {
  const shape = inscribedShape(noun, run, en);
  if (!shape || !('vertices' in shape)) return shape;
  const v = shape.vertices;
  const ring = shape.facts.find((f) => f.t === 'polygon') as Extract<Fact, { t: 'polygon' }>;
  const circle: Fact = { t: 'circle-thru', id: incircleId(ring.id), def: { t: 'incircle', pts: v }, src: line };
  const pitot: Fact[] =
    v.length === 4
      ? [
          {
            t: 'constraint',
            k: {
              t: 'length-eq',
              left: parseLengthExpr(`${v[0]}${v[1]}+${v[2]}${v[3]}`)!,
              right: parseLengthExpr(`${v[1]}${v[2]}+${v[3]}${v[0]}`)!,
            },
            src: line,
          },
        ]
      : [];
  const t = tail?.trim();
  let centre: Fact[] = [];
  let about: Fact[] = [];
  if (t) {
    const named = new RegExp(`^ש(?:ה)?מרכזו\\s+(?:(?:הוא|היא)\\s+)?(?:ה?נקודה\\s+)?(${NAME})$`).exec(t);
    // A parenthesised tail is the sentence's givens, not the circle's words — the frame splits it off
    // (`parenClauses`) only when this rule leaves the whole line alone.
    if (!named && t.includes('(')) return null;
    if (!named || v.length !== 3) return refuse('out-of-scope', line);
    centre = [{ t: 'derived', id: named[1], rule: { t: 'incentre', v: [v[0], v[1], v[2]] }, src: line }];
    about = [{ t: 'centre-of', id: named[1], circleId: CIRCLE_SENTINEL, src: line }];
  }
  /*
   * WHICH circle (ADR-AG-196, extended by ADR-AG-198 / #1619 ruling b): a circle the figure already states tangent
   * to every side of this ring — the touch sentence typed first created it — IS the circle this sentence means, and
   * the sentence names its centre; with none, the sentence states the computed incircle, as before.
   */
  return made([
    ...[...shape.facts, ...pitot].map((f) => ({ ...f, src: line })),
    { t: 'the-circle', create: [circle, ...centre].map((f) => ({ ...f, src: line })), about, match: { inscribed: v }, src: line },
  ]);
}

function parseInscribed(line: string): RuleOutcome {
  const sub = CYCLIC_SUBJECT_HE.exec(line);
  if (sub) return cyclicFacts(sub[1], sub[2], sub[3], line);
  const able = CYCLIC_ABLE_HE.exec(line);
  if (able) return cyclicFacts(able[1], able[2], undefined, line);
  const circ = CYCLIC_CIRCLE_HE.exec(line);
  if (circ) return cyclicFacts(circ[2], circ[3], circ[1], line);
  const cont = CYCLIC_CONTAINER_HE.exec(line);
  if (cont) return cyclicFacts(cont[2], cont[3], cont[1], line);

  const inSub = INCIRCLE_SUBJECT_HE.exec(line);
  if (inSub) return incircleFacts(inSub[2], inSub[3], inSub[1], line);
  const inCont = INCIRCLE_CONTAINER_HE.exec(line);
  if (inCont) return incircleFacts(inCont[1], inCont[2], inCont[3], line);
  const inPoly = INCIRCLE_POLYGON_HE.exec(line);
  if (inPoly) {
    const noun = inPoly[1] ?? (splitNames(inPoly[2]).length === 3 ? 'משולש' : 'מרובע');
    return incircleFacts(noun, inPoly[2], inPoly[3], line);
  }

  for (const re of CYCLIC_EN) {
    const m = re.exec(line);
    // "… with centre M" is «שמרכזו M» — the same circle on a centre, read by the same rule.
    if (m) return cyclicFacts(m[1], m[2], m[3] ? `שמרכזו ${m[3]}` : undefined, line, true);
  }
  for (const re of INCIRCLE_EN) {
    const m = re.exec(line);
    if (m) return incircleFacts(m[1], m[2], undefined, line, true);
  }
  return null;
}

/**
 * A CIRCLE COMPUTED FROM POINTS — through three of them, or on a diameter (#1464, #1324, ADR-AG-160).
 *
 * Operator, prod session `j73pikxb` on the kite: «מעגל BDA», «מעגל שעובר בנקודות ABD», «BD קוטר», «DB קוטר
 * במעגל» — every one `not-handled`, and so were the LLM's own translations. The capability half-existed
 * behind a four-line workaround («נתון מעגל O» + three «על המעגל»); the operator ruled (2026-09-27, #1464)
 * that the circle is COMPUTED from its points instead — no solve, no invented centre letter.
 *
 * Runs after `parseCircleAt` and before `matchCurve`, for `parseCircleAt`'s reason: `matchCurve`'s tail is
 * `(.+)`, and it would read «ABD» or «שקוטרו BD» as an equation.
 *
 * The pieces are written out, not stemmed (this tree's recurring one-spelling trap, `src-analytic/CLAUDE.md`):
 * the verb «עובר / עוברת / שעובר / העובר», the preposition «דרך / ב», the optional «(ה)נקודות», and a point
 * list the exam writes three ways («ABD», «A, B, D», «A, B ו-D»).
 */
/** Three point names, however the exam separates them — «ABD», «A, B, D», «A, B ו-D», «A B and D». */
function threePoints(run: string): [Id, Id, Id] | null {
  const bare = run
    .replace(/\s+(?:and|ו-?)\s*(?=[A-Z])/g, ' ')
    .replace(/(?:^|[\s,])ו-?(?=[A-Z])/g, ' ')
    .replace(/[\s,]+/g, '');
  if (!new RegExp(`^(?:${NAME}){3}$`).test(bare)) return null;
  const ns = splitNames(bare);
  return ns.length === 3 ? [ns[0], ns[1], ns[2]] : null;
}
/** The point list's own text: names, commas, spaces and the conjunction — nothing else. */
const POINT_LIST = `([A-Z0-9,\\s]+?(?:(?:\\s+and\\s+|\\s*ו-?\\s*)${NAME})?)`;
/** A circle's own name, when the student gives one («מעגל I העובר דרך…») — the numerals `matchCurve` uses. */
const THRU_NAME = `(?:\\s+(${CIRCLE_NUMERALS}))?`;

const THRU_HE = new RegExp(
  // The comma is the textbook's own punctuation before the relative clause — «מעגל, העובר דרך הנקודות O, C, A»
  // (#1619 B1, corpus 16/4): the same sentence, so the same rule.
  `^${HE_GIVEN}ה?מעגל${THRU_NAME}\\s*,?\\s+(?:ש|ה)?עובר(?:ת)?\\s+(?:דרך|ב)\\s*(?:ה?נקודות\\s+)?${POINT_LIST}$`,
);
const THRU_EN = new RegExp(
  `^(?:the\\s+|a\\s+)?circle${THRU_NAME}\\s+(?:that\\s+)?(?:passing\\s+|passes\\s+|going\\s+)?through\\s+(?:the\\s+points\\s+)?${POINT_LIST}$`,
  'i',
);
/** «מעגל ABD» — the three points as the circle's own name. One letter is a CENTRE («מעגל O», #1060). */
const THRU_BARE = new RegExp(`^${HE_GIVEN}ה?מעגל\\s+(${NAME}${NAME}${NAME})$|^(?:the\\s+)?circle\\s+(${NAME}${NAME}${NAME})$`);
/*
 * The circumscribed circle («המשולש ABD חסום במעגל», «המעגל החוסם את המשולש ABD», "the circumcircle of
 * triangle ABD") lived here as `CIRCUM_HE`/`CIRCUM_EN`, three letters only. It is now the n = 3 case of
 * `parseInscribed` above (#1619 B2), which runs before this rule.
 */

/**
 * «BD קוטר במעגל» — a DIAMETER (#1324). The sentence names the two ends and, optionally, the circle; WHICH
 * circle it means is decided at M1 (`diameter-of`), because the parser is pure over one line.
 *
 * A defining phrase CREATES the circle whatever the figure holds — 2-D's `DEFINE` set, ported: «שקוטרו»,
 * «של מעגל» (a circle, indefinite), «במעגל חדש», "with diameter", "a new circle". «של המעגל» / «במעגל» are
 * the definite reading and attach to the figure's circle when it has one.
 */
const DIAM_HE = new RegExp(
  `^${HE_GIVEN}(?:ה?(?:קטע|צלע)\\s+)?(${NAME})(${NAME})\\s+(?:(?:הוא|היא)\\s+)?(?:ה)?קוטר` +
    `(?:\\s+(ב|של\\s+)(ה)?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?(\\s+ה?חדש)?)?$`,
);
/** «קוטר BD במעגל» — the noun first, the same statement. */
const DIAM_NOUN_FIRST_HE = new RegExp(
  `^${HE_GIVEN}(?:ה)?קוטר\\s+(${NAME})(${NAME})\\s+(ב|של\\s+)(ה)?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?(\\s+ה?חדש)?$`,
);
/** «נתון מעגל שקוטרו BD» — the circle DEFINED by its diameter, always a new circle. */
const DIAM_DEFINE_HE = new RegExp(`^${HE_GIVEN}ה?מעגל\\s+ש(?:ה)?קוטר(?:ו|\\s+שלו)(?:\\s+(?:הוא|היא))?\\s+(${NAME})(${NAME})$`);
const DIAM_EN = new RegExp(
  `^(?:the\\s+)?(?:segment\\s+)?(${NAME})(${NAME})\\s+is\\s+(?:a|the)\\s+diameter` +
    `(?:\\s+of\\s+(the\\s+|a\\s+(new\\s+)?)?circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?)?$`,
);
const DIAM_DEFINE_EN = new RegExp(`^(?:the\\s+|a\\s+)?circle\\s+(?:with|on)\\s+(?:the\\s+|a\\s+)?diameter\\s+(${NAME})(${NAME})$`, 'i');

function parseCircleThru(line: string): RuleOutcome {
  const thru = THRU_HE.exec(line) ?? THRU_EN.exec(line);
  const bare = thru ? null : THRU_BARE.exec(line);
  if (thru || bare) {
    // Group layout: THRU_* (name, list) · THRU_BARE (he run, en run).
    const name = thru?.[1];
    const run = thru ? thru[2] : (bare![1] ?? bare![2]);
    const pts = threePoints(run);
    if (!pts) return null;
    // «מעגל III» is a circle's NUMERAL name, not three points I, I, I: a run that repeats a letter in the
    // bare form falls through to the rules that own it. The other forms name points explicitly, and a
    // repeat there is the student's to be told about (`repeated-vertex`, at M1).
    if (bare && new Set(pts).size < 3) return null;
    const id = name ? numeralCurveId('circle', name) : `circle-thru-${[...pts].sort().join('')}`;
    const creation: Fact = { t: 'circle-thru', id, def: { t: 'through', pts }, ...(name ? { name } : {}), src: line };
    /*
     * «המעגל עובר דרך הנקודות A, B ו-C» — THE circle as the subject of a predicate (ADR-AG-196): three
     * statements about the figure's one circle when it has one, the circle through the three when it has
     * none. «מעגל העובר דרך …» / «נתון מעגל ש…» describe a circle and keep creating it.
     */
    if (thru && !name && /^(?:המעגל\s+עובר(?:ת)?\s|the\s+circle\s+passes\s)/i.test(line)) {
      // Bound, it is «A על המעגל» three times: each point introduced and put on THE circle (B1's reading of
      // the one-point sentence).
      const about = pts.flatMap((p): Fact[] => [
        { t: 'declare', id: p, src: line },
        { t: 'constraint', k: { t: 'on-curve', id: p, curve: CIRCLE_SENTINEL }, src: line },
      ]);
      return made([{ t: 'the-circle', create: [creation], about, src: line }]);
    }
    return made([creation]);
  }

  const define = DIAM_DEFINE_HE.exec(line) ?? DIAM_DEFINE_EN.exec(line);
  if (define) {
    return made([{ t: 'diameter-of', a: define[1], b: define[2], define: true, src: line }]);
  }
  const he = DIAM_HE.exec(line) ?? DIAM_NOUN_FIRST_HE.exec(line);
  if (he) {
    const [, a, b, prep, article, circle, fresh] = he;
    // «של מעגל» — OF A circle, indefinite — defines one; «במעגל חדש» says so outright.
    const isDefine = Boolean(fresh) || (prep !== undefined && prep.startsWith('של') && !article);
    return made([{ t: 'diameter-of', a, b, define: isDefine, ...(circle ? { circle } : {}), src: line }, ...pieceFacts('segment', a, b, line)]);
  }
  const en = DIAM_EN.exec(line);
  if (en) {
    const [, a, b, det, fresh, circle] = en;
    const isDefine = Boolean(fresh) || (det !== undefined && /^a\s/i.test(det));
    return made([{ t: 'diameter-of', a, b, define: isDefine, ...(circle ? { circle } : {}), src: line }, ...pieceFacts('segment', a, b, line)]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// A COORDINATE COMPARED — «x_B > x_D», «שיעור ה-x של B גדול משיעור ה-x של D» (#1462, ADR-AG-161)
// ---------------------------------------------------------------------------

/**
 * Operator, prod session `j73pikxb`, on the kite: «שיעור ה- x של נקודה B גדול משיעור ה- x של נקודה D» and then
 * «B_x>D_x» — both `not-handled`, and the LLM's own translation `x_B > x_D` too. The operator then typed
 * `B(7,7)`: he solved the exercise's condition by hand to get the figure. It is the exam's standard way of
 * choosing a root, so it is a construct, not one sentence: a point's coordinate compared with another
 * point's, or with a value. It lowers to the `coord-compare` selector, which `axis-side` already is at 0.
 *
 * The symbolic atom is the panel's own notation (`x_A`, #1127) plus the two spellings the operator typed
 * (`B_x`) and the bare run `xB` the component rule already reads. Both sides must name the SAME axis —
 * «x_B > y_D» compares two different things and is left to the rules below, which refuse it honestly.
 */
const COORD_ATOM = `(?:([xy])\\s*_\\s*\\{?\\s*(${NAME})\\s*\\}?|(${NAME})\\s*_\\s*\\{?\\s*([xy])\\s*\\}?|([xy])(${NAME}))`;
const COMPARE_SYM = new RegExp(`^${HE_GIVEN}${COORD_ATOM}\\s*(>|<)\\s*(.+)$`);
/** One side of a symbolic comparison as `{axis, id}`, from `COORD_ATOM`'s three alternatives. */
function atomOf(m: RegExpExecArray | RegExpMatchArray, at: number): { axis: 'x' | 'y'; id: Id } | null {
  if (m[at]) return { axis: m[at] as 'x' | 'y', id: m[at + 1] };
  if (m[at + 2]) return { axis: m[at + 3] as 'x' | 'y', id: m[at + 2] };
  if (m[at + 4]) return { axis: m[at + 4] as 'x' | 'y', id: m[at + 5] };
  return null;
}
const COORD_ATOM_ONLY = new RegExp(`^${COORD_ATOM}$`);

/**
 * The Hebrew sentence. «שיעור», «ערך» and «קואורדינטה/ת» are the corpus nouns (#1127's list), the bare
 * «x של B» is the same form without the noun, and the comparative is written out in both genders
 * («שיעור» is masculine, «קואורדינטה» feminine) — `קטן` ends in a FINAL nun, `קטנה` in a medial one, the
 * `נתונ(ה|ים)` trap this tree keeps recording. «מ» is a prefix («משיעור», «מ-3»), so it is matched as one.
 */
const HE_COORD = `(?:(?:ה?שיעור|ה?ערך|ה?קואורדינט[הת])\\s+ה?-?\\s*([xy])|([xy]))\\s+(?:של\\s+)?(?:ה?נקודה\\s+)?(${NAME})`;
const COMPARE_HE = new RegExp(
  `^${HE_GIVEN}${HE_COORD}\\s+(?:(?:הוא|היא)\\s+)?(גדול|גדולה|קטן|קטנה)(?:\\s+יותר)?\\s+מ-?\\s*(.+)$`,
);
/** The RIGHT side of the Hebrew comparison, after «מ»: another point's coordinate, or a value. */
const HE_RHS_COORD = new RegExp(
  `^(?:(?:ה?שיעור|ה?ערך|ה?קואורדינט[הת])\\s+ה?-?\\s*([xy])\\s+(?:של\\s+)?|([xy])\\s+של\\s+|(?:זה|זו)\\s+של\\s+)(?:ה?נקודה\\s+)?(${NAME})$`,
);
/** «שיעור ה-x של B חיובי» — the comparison with 0, in the sign words. */
const SIGN_HE = new RegExp(`^${HE_GIVEN}${HE_COORD}\\s+(?:(?:הוא|היא)\\s+)?(חיובי|חיובית|שלילי|שלילית)$`);
const COMPARE_EN = new RegExp(
  `^(?:the\\s+)?([xy])[- ]?(?:value|coordinate|coord)\\s+of\\s+(?:point\\s+)?(${NAME})\\s+is\\s+(greater|larger|bigger|less|smaller)\\s+than\\s+(.+)$`,
  'i',
);
const EN_RHS_COORD = new RegExp(
  `^(?:(?:the\\s+)?([xy])[- ]?(?:value|coordinate|coord)\\s+of\\s+|that\\s+of\\s+)(?:point\\s+)?(${NAME})$`,
  'i',
);

/**
 * A value on the right: a number or an expression in the parameters — never the plane's own `x`/`y`,
 * which would make «x_B > x» a curve rather than a comparison. «אפס» is the one number word the corpus
 * writes here.
 */
function compareValue(src: string): Expr | null {
  const s = trim(src).replace(/^אפס$/, '0').replace(/^zero$/i, '0');
  return valueExpr(s);
}

function compareFacts(id: Id, axis: 'x' | 'y', greater: boolean, rhs: CoordCompareRhs, line: string): ParseResult {
  if ('point' in rhs && rhs.point === id) return { ok: false, code: 'repeated-vertex', detail: line };
  return made([{ t: 'selector', sel: { kind: 'coord-compare', id, axis, greater, rhs }, src: line }]);
}
type CoordCompareRhs = Extract<Selector, { kind: 'coord-compare' }>['rhs'];

function parseCompare(line: string): RuleOutcome {
  const sym = COMPARE_SYM.exec(line);
  if (sym) {
    const lhs = atomOf(sym, 1);
    const op = sym[7];
    const rest = trim(sym[8]);
    if (!lhs) return null;
    const other = COORD_ATOM_ONLY.exec(rest);
    if (other) {
      const r = atomOf(other, 1);
      // Two different axes are two different quantities: not this construct.
      if (!r || r.axis !== lhs.axis) return null;
      return compareFacts(lhs.id, lhs.axis, op === '>', { point: r.id }, line);
    }
    const v = compareValue(rest);
    return v ? compareFacts(lhs.id, lhs.axis, op === '>', { value: v }, line) : null;
  }

  const he = COMPARE_HE.exec(line);
  if (he) {
    const axis = (he[1] ?? he[2]) as 'x' | 'y';
    const id = he[3];
    const greater = he[4].startsWith('גדול');
    const rest = trim(he[5]);
    const other = HE_RHS_COORD.exec(rest);
    if (other) {
      const ax = other[1] ?? other[2];
      if (ax && ax !== axis) return null;
      return compareFacts(id, axis, greater, { point: other[3] }, line);
    }
    const v = compareValue(rest);
    return v ? compareFacts(id, axis, greater, { value: v }, line) : null;
  }

  const sign = SIGN_HE.exec(line);
  if (sign) {
    const axis = (sign[1] ?? sign[2]) as 'x' | 'y';
    return compareFacts(sign[3], axis, sign[4].startsWith('חיובי'), { value: { kind: 'num', value: 0 } }, line);
  }

  const en = COMPARE_EN.exec(line);
  if (en) {
    const axis = en[1].toLowerCase() as 'x' | 'y';
    const greater = /greater|larger|bigger/i.test(en[3]);
    const rest = trim(en[4]);
    const other = EN_RHS_COORD.exec(rest);
    if (other) {
      if (other[1] && other[1].toLowerCase() !== axis) return null;
      return compareFacts(en[2], axis, greater, { point: other[2] }, line);
    }
    const v = compareValue(rest);
    return v ? compareFacts(en[2], axis, greater, { value: v }, line) : null;
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
  const linePiece = LINE_PIECE_HE.exec(line) ?? LINE_PIECE_EN.exec(line);
  if (linePiece) {
    const [, a, b] = linePiece;
    if (a === b) return refuse('repeated-vertex', line);
    // NAMING the line introduces its points (the 2026-09-15 «הישר AB» ruling), then the line is drawn.
    return made([{ t: 'declare', id: a, src: line }, { t: 'declare', id: b, src: line }, ...pieceFacts('line', a, b, line)]);
  }

  const poly = SHAPE_HE.exec(line) ?? SHAPE_EN.exec(line);
  if (poly) {
    const [, phrase, run] = poly;
    // «משולש חד זוויות ABC» — the ACUTE adjective is a given of its own (#1619 B2): peeled off the noun and
    // stated as the `acute` selector below, never dropped.
    const { noun: nounSrc, acute } = acuteAdjective(phrase);
    const noun = EN_SHAPE[normalizeShapeNoun(nounSrc).toLowerCase()] ?? nounSrc;
    const row = shapeRow(noun);
    // Not a shape noun at all — leave the sentence to the rules after this one.
    if (!row) return null;
    // Acuteness is a triangle's adjective; on any other ring the phrase is not one this rule reads.
    if (acute && row.arity !== 3) return null;
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
      ...(acute ? [{ t: 'selector' as const, sel: { kind: 'acute' as const, ids: vertices }, src: line }] : []),
    ]);
  }

  return null;
}

/**
 * «חד זוויות» / «חד-זווית» / "acute(-angled)" — the triangle's angles are all acute (#1619 B2, ADR-AG-194).
 *
 * The 471 exam writes it inside the noun phrase («במעגל שמרכזו M חסום משולש חד זוויות ABC»), so it is peeled
 * off here and stated as the `acute` selector — an inequality, D7's kind 2. Only a TRIANGLE noun carries it
 * (the arity check below refuses it on anything else, through the row); the noun that remains must still be
 * one the registry knows, so «משולש חד זוויות» is «משולש» plus the given, and nothing else is read.
 */
const ACUTE_HE = new RegExp(`\\s+חד(?:ת|ות|י)?[\\s-]+${ANGLE_STEM_HE}ו?ת$`);
const ACUTE_EN = /^acute(?:[\s-]+angled)?\s+/i;
function acuteAdjective(phrase: string): { noun: string; acute: boolean } {
  if (ACUTE_HE.test(phrase)) return { noun: phrase.replace(ACUTE_HE, ''), acute: true };
  if (ACUTE_EN.test(phrase)) return { noun: phrase.replace(ACUTE_EN, ''), acute: true };
  return { noun: phrase, acute: false };
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
/**
 * THE TRIANGLE IDENTIFIES THE SIDE, INSTEAD OF DECORATING IT (#1165).
 *
 * Operator, 2026-09-17, with a screenshot: *"we need to support things like `AD תיכון` and
 * `AD חוצה זווית` like we do in the 2d tool."* «AD תיכון במשולש ABC» was `not-handled` here while
 * 2-D answers the same sentence — a sibling disparity, which is the framing that makes it worth
 * fixing rather than tail work.
 *
 * The side run was MANDATORY and «במשולש ABC» only an optional trailing decoration after it, so the
 * triangle was recognised as text and could never be the thing that identifies the target. It is now
 * an ALTERNATIVE: a cevian starts at a named vertex, so apex `A` plus triangle `ABC` determines the
 * opposite side `BC` with no ambiguity, and the existing lowering is reused unchanged.
 *
 * Determined from the SENTENCE, never from the figure — this parser is context-free by design, and
 * the two forms here name everything they need. The spellings that name no target at all
 * («AD גובה», «גובה מנקודה A») genuinely require the figure and are #1240, not this.
 *
 * The maqaf is admitted with it (#1222): «AD תיכון ל-BC» failed only because the rule had no `-`
 * allowance before a Latin run, while the tool relies on that convention itself elsewhere.
 */
const CEVIAN_ROLE_HE = 'תיכון|גובה';
/** Either the side named outright, or the triangle that determines it. Groups: side u, side v, triangle run. */
const CEVIAN_TARGET_HE =
  `(?:(?:ל|אל\\s+ה?)?-?\\s*(?:ה?צלע\\s+)?(${NAME})(${NAME})(?:\\s+ב?ה?משולש\\s+${NAME_RUN})?|ב?ה?משולש\\s+(${NAME_RUN}))`;
const CEVIAN_HE = new RegExp(
  `^${HE_GIVEN}(${NAME})(${NAME})${HE_IS}\\s*(?:ה?)(${CEVIAN_ROLE_HE})\\s*${CEVIAN_TARGET_HE}$`,
);
const CEVIAN_TARGET_EN =
  `(?:to\\s+(?:side\\s+)?(${NAME})(${NAME})(?:\\s+in\\s+triangle\\s+${NAME_RUN})?|in\\s+triangle\\s+(${NAME_RUN}))`;
const CEVIAN_EN = new RegExp(
  `^(${NAME})(${NAME})\\s+is\\s+(?:the\\s+)?(median|altitude)\\s+${CEVIAN_TARGET_EN}$`,
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
 * Only 90° here: any other value falls through to the numeric rule below (#1331; with a lone vertex,
 * #1407), which resolves a one-letter angle through the SAME M1 resolver as this rule's
 * `right-angle` fact — never quietly treated as a right angle.
 *
 * THE NOUN IS ONE ATOM, AND THE GLYPHS ARE IN IT (#1330, ADR-AG-142). Operator, playing the #1328
 * sheet on this page: *"the errors on the 90 is לא הצלחתי להבין את המשפט: «∠ABC = 90» which is wrong
 * error"*. The angle noun was spelled three times — «זווית», a separate `∡`-only pattern, «angle» —
 * and `∠` (U+2220, the glyph the 2-D tool teaches on its palette, in its catalog and in its
 * messages) was in none of them, so a student who learned it there was told this tool cannot do
 * right angles. Both glyphs sit in the noun alternation, once per language, the 2-D lexicon's
 * `ANGLE_WORD` shape: an angle rule that reads the noun reads every spelling of it, and the `∡`-only
 * pattern is gone rather than kept beside a `∠` twin.
 *
 * BOTH SPELLINGS OF THE WORD (#1407, ADR-AG-155): the word is composed from `ANGLE_STEM_HE` (`זו?וי`),
 * so the defective «זוית» reaches every angle rule — right, numeric, ratio — exactly as «זווית» does.
 */
const ANGLE_NOUN_HE = `(?:ה?${ANGLE_STEM_HE}ת\\s+|[∠∡]\\s*)`;
const ANGLE_NOUN_EN = '(?:(?:the\\s+)?angle\\s+|[∠∡]\\s*)';
const ANGLE_HE = new RegExp(
  `^${HE_GIVEN}${ANGLE_NOUN_HE}(${NAME})(${NAME})?(${NAME})?${HE_IS}\\s*(?:ישרה|=\\s*90°?|90°?)$`,
);
const ANGLE_EN = new RegExp(
  `^${ANGLE_NOUN_EN}(${NAME})(${NAME})?(${NAME})?\\s*(?:is\\s+)?(?:right|=\\s*90°?|90°?)$`,
  'i',
);
/**
 * A NUMERIC angle, and an angle in RATIO to another (#1331) — «∠ABC = 60», «זווית ABC היא 40»,
 * «∠ABC = ∠ACB», «∠ABC = 2∠ACB», in both languages and both glyphs.
 *
 * Operator, 2026-09-21: *"∠ABC = ∠ACB gives לא הצלחתי להבין את המשפט"*, and on round #1332's T19
 * (*"should be supported (a 60 degree angle)"*); ruled 2026-09-24 that both halves build. The noun is the
 * SAME atom the right-angle rule reads (#1330), so every spelling of it reaches both.
 * The right-angle rule runs FIRST, so «∠ABC = 90» keeps its exact `perpendicular` lowering.
 *
 * ONE LETTER OR THREE, on either side (#1407, ADR-AG-158). Operator, 2026-09-24: *"writing זוית C=200 is
 * not recognized"*. A lone vertex names an angle only relative to a figure, so it is not lowered here: it
 * becomes a `vertex-angle` fact and M1 reads its rays off the one shape through it — the resolver
 * «זווית B ישרה» has used since #1049. `ANGLE_LETTERS` ends at a letter boundary, so two letters
 * («זווית AB = 5») name no angle and are never read as a lone `A`.
 */
const ANGLE_LETTERS = `(${NAME})(?:(${NAME})(${NAME}))?(?![A-Za-z0-9])`;
const ANGLE_VALUE_HE = new RegExp(
  `^${HE_GIVEN}${ANGLE_NOUN_HE}${ANGLE_LETTERS}${HE_IS}\\s*(?:=\\s*)?(.+)$`,
);
const ANGLE_VALUE_EN = new RegExp(
  `^${ANGLE_NOUN_EN}${ANGLE_LETTERS}\\s*(?:is\\s+|equals?\\s+)?(?:=\\s*)?(.+)$`,
  'i',
);
/** The right side as ANOTHER angle, with an optional numeric factor: «2∠ACB», «זווית ACB», «2·∠C». */
const ANGLE_OF = new RegExp(
  `^(?:(\\d+(?:\\.\\d+)?(?:/\\d+)?)\\s*[·*]?\\s*)?(?:${ANGLE_NOUN_HE}|${ANGLE_NOUN_EN})${ANGLE_LETTERS}$`,
  'i',
);
/**
 * The angle a rule's three letter groups name: the middle letter is the vertex and the outer two its
 * rays, or — one letter — the vertex alone. `null` for a repeated letter («∠ABA»), which names nothing.
 */
const angleNameOf = (p: string, v?: string, q?: string): AngleName | null => {
  if (v === undefined || q === undefined) return { v: p };
  if (p === v || v === q || p === q) return null;
  return { v, a: p, b: q };
};
/** A degree tail the value may carry: «60°», «60 מעלות», "60 degrees". */
const DEGREE_TAIL = /\s*(?:°|מעלות|degrees?)\s*$/i;

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
/**
 * «הישר l1» / «ישר ℓ2» / «l1» — a line the student NAMED, whose direction comes from its equation.
 *
 * A NUMERAL name needs its noun here («הישר 3», never a bare «3»): an operand slot is free text, and a
 * bare digit in one is a number before it is a name (#1298, ADR-AG-144).
 */
const NAMED_LINE = new RegExp(`^(?:ה?ישר\\s+|[Ll]ine\\s+)?([ℓl][0-9]?)$|^(?:ה?ישר\\s+|[Ll]ine\\s+)(${LINE_NUMERAL})$`);
/** «הצלע AB» / «הקטע AB» / «הישר AB» / «AB» — two named points, whichever noun fronts them. */
/**
 * The noun in front of a point pair is optional and may be Hebrew or English. Spelled out rather than
 * flagged `i`, because `NAME` is deliberately uppercase-only and a case-insensitive whole-pattern
 * would quietly start accepting `ab` as two vertices.
 */
const TWO_POINTS = new RegExp(
  `^(?:ה?(?:צלע|קטע|ישר|בסיס)\\s+|[Ss]ide\\s+|[Ss]egment\\s+|[Bb]ase\\s+|[Ll]ine\\s+)?(${NAME})(${NAME})$`,
);

function direction(phrase: string): Direction | null {
  const p = trim(phrase).replace(/^ה(?=ישר|צלע|קטע)/, 'ה'); // keep the article; normalise spacing only
  const axis = AXIS_HE.exec(p) ?? AXIS_EN.exec(p);
  if (axis) return { k: 'axis', axis: axis[1].toLowerCase() === 'x' ? 'x' : 'y' };
  const named = NAMED_LINE.exec(p);
  if (named) return { k: 'curve', id: lineIdOf(named[1] ?? named[2]) };
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
  // The connector is OPTIONAL (#1160): «AB מקביל DC» is written as often as «AB מקביל ל-DC», and the
  // verb alone already identifies the sentence — nothing else in the grammar uses it.
  `^${HE_GIVEN}(.+?)\\s+(${PARALLEL_WORDS}|${PERP_WORDS})\\s+(?:ל-?\\s*)?(.+)$`,
);
const RELATION_EN = /^(.+?)\s+(?:is\s+)?(parallel|perpendicular)(?:\s+to)?\s+(.+)$/i;

/**
 * THE EXAM'S OWN NOTATION — «AB ∥ DC», «AB || DC», «AB ⊥ DC» (#1160).
 *
 * The relation itself was fully built and well tested; only its SYMBOLS were unreadable, so a student
 * writing what the exam prints got «לא הבנתי» for a capability that already existed. That is this
 * tree's recurring one-spelling gate — #1081 counted five, and #1128 and #1151 are the same shape.
 *
 * A separate pattern rather than more alternatives inside `PARALLEL_WORDS`, because a symbol needs no
 * connector and no surrounding spaces: «AB∥DC» is one token to a student. It feeds the SAME handler,
 * so this is a second spelling of one rule and not a second rule.
 *
 * **`//` is deliberately NOT admitted.** It is the one candidate symbol that collides with real
 * mathematics, and this rule runs BEFORE the equation parser — so a line it claimed wrongly would be
 * refused as a bad operand instead of falling through to be read as the equation it is. A narrower
 * symbol set is fine; a mis-parsed equation is not. Both ⊥ (U+22A5) and ⟂ (U+27C2) are admitted,
 * because both are typed and they are indistinguishable on screen.
 */
const REL_PARALLEL_SYM = String.raw`∥|\|\|`;
const REL_PERP_SYM = String.raw`⊥|⟂`;
const RELATION_SYM = new RegExp(`^${HE_GIVEN}(.+?)\\s*(${REL_PARALLEL_SYM}|${REL_PERP_SYM})\\s*(.+)$`);

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

/**
 * A LINE THROUGH A POINT WITH A FREE DIRECTION — «דרך N עובר ישר», «דרך M עובר ישר l4» (#1319, ADR-AG-144).
 *
 * The exam says it twice, and both times the direction is exactly what the question withholds:
 * *«דרך הנקודה N עובר ישר החותך את ציר ה-y בנקודה M»*, *«דרך הנקודה M עובר ישר נוסף … כך שהנקודה M היא
 * אמצע הקטע AB»*. The parallel/perpendicular members (#1093) supply a direction; this member states
 * that the direction is UNKNOWN — a `line-at` whose direction is a FREE angle in the register, sampled
 * like any unstated magnitude and solved once a later given pins it (the #1317 seam).
 *
 * The name is optional and is a line name (`l4`, a numeral) — never a two-point run, which would be a
 * statement about two points rather than a construction through one. The English form takes the name
 * before «through» («line l4 through M»), as the language puts it.
 */
const FREE_LINE_NAME = `(?:[ℓl][0-9]?|${LINE_NUMERAL})`;
const THROUGH_FREE_HE = new RegExp(
  `^${HE_GIVEN}דרך\\s+${HE_POINT}(${NAME})\\s+(?:עובר(?:ת)?\\s+)?ה?(?:ישר|קו)(?:\\s+(${FREE_LINE_NAME}))?$`,
);
const THROUGH_FREE_EN = new RegExp(
  `^(?:[Aa]\\s+|[Tt]he\\s+)?[Ll]ine(?:\\s+(${FREE_LINE_NAME}))?\\s+(?:passes\\s+)?through\\s+(?:(?:the\\s+)?point\\s+)?(${NAME})$`,
);

function parseThroughLine(line: string): RuleOutcome {
  const he = THROUGH_FREE_HE.exec(line);
  const en = he ? null : THROUGH_FREE_EN.exec(line);
  if (he || en) {
    const through = he ? he[1] : en![2];
    const token = he ? he[2] : en![1];
    const name = token ? lineNameOf(token, he ? 'he' : 'en') : undefined;
    // Named: the name IS the identity, like every named line. Anonymous: content-derived from the
    // anchor, so the same construction stated twice is one object (ADR-AG-023).
    const id = token ? lineIdOf(token) : `curve-${anonIndex(`through:${through}:free`)}`;
    return made([
      { t: 'declare', id: through, src: line },
      {
        t: 'line-at',
        id,
        through,
        dir: { k: 'free', sym: directionSymbol(id) },
        perp: false,
        ...(name ? { name } : {}),
        src: line,
      },
    ]);
  }
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
  if (d.k === 'free') return `free-${d.sym}`;
  if (d.k === 'radius') return `radius-${d.circle}-${d.at}`;
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

/** The sign words (#1323): the adjective, the comparison with zero, and the symbol form. */
const SIGN_WORDS_HE = '(שלילי|חיובי|קטן\\s+מ-?\\s*0|גדול\\s+מ-?\\s*0|<\\s*0|>\\s*0)';
const SLOPE_SIGN_HE = new RegExp(
  `^${HE_GIVEN}ה?שיפוע(?:ו|ה)?\\s+(?:של\\s+)?(.+?)(?:\\s+(?:הוא|היא))?\\s*${SIGN_WORDS_HE}$`,
);
const SLOPE_SIGN_EN = /^(?:the\s+)?slope\s+of\s+(.+?)\s+is\s+(negative|positive|less\s+than\s+0|greater\s+than\s+0|<\s*0|>\s*0)$/i;

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

/**
 * THE CONNECTIVE OF A LENGTH GIVEN IS AN **ALLOWLIST OF COPULAS**, NEVER "anything that is not `=`"
 * (#1260 · ADR-AG-NNN, porting 2-D’s ADR-524 Am. 1 mechanism).
 *
 * A length given used to admit a literal `=` and nothing else, so «אורך הקטע AB הוא 10» — an ordinary
 * Hebrew sentence — was refused while its symbolic twin was understood.
 *
 * **Why an allowlist and not a denylist.** 2-D shipped this widening as a DENYLIST of relation words and
 * it produced a P1 (#1248): «אורך הקטע BC > 10» — a stated RANGE — committed an EQUALITY at its own
 * bound, and no honesty gate could catch it because the `10` *was* accounted for, by the wrong
 * constraint. A denylist cannot be completed, because *the ways a sentence can relate two things are
 * not enumerable*. The other question IS closed — **the ways to say "is"** — so the guard is inverted.
 *
 * So this fails CLOSED: an unfamiliar connective is not read as an equality, the line falls through to
 * the later rules and, failing those, to an honest `not-handled`. A false equality would instead invent
 * a given the student never gave.
 *
 * **The vocabulary is deliberately the same set as 2-D’s `LENGTH_COPULA`** (`src/parser/parse.ts`).
 * The two trees hold their own copy because the `lexicon` layer’s cross-product sharing is recorded
 * UNDECIDED in `BOUNDARIES.json` (ADR-W-003) and deciding it is not this fix’s business; the drift that
 * duplication invites is caught by `shell/__tests__/length-copula-parity.test.ts`, which reads both
 * definitions rather than restating either.
 *
 * Unlike 2-D’s, this connective is **not optional**: 2-D locates the value positionally inside a verbose
 * length phrase, whereas here the connective is what splits the sentence in two, so an empty one would
 * make «אורך הקטע AB 10» an equality — a widening nobody asked for.
 */

const LENGTH_EQ = new RegExp(
  String.raw`^(?:נתון\s+כי\s+|נתון\s+)?(.+?)\s*(?:=|\s(?:${COPULA_WORDS}))\s*(.+)$`,
);
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
  const rel = RELATION_HE.exec(line) ?? RELATION_EN.exec(line) ?? RELATION_SYM.exec(line);
  if (rel) {
    const [, left, word, right] = rel;
    const u = direction(left);
    const v = direction(right);
    // The verb was understood; if an operand was not, that is an OWNED refusal about this sentence
    // rather than a fall-through to "I did not understand you" (ADR-AG-017).
    if (!u || !v) return refuse('bad-operand', line);
    const parallel = new RegExp(`^(?:מקביל|parallel|${REL_PARALLEL_SYM})`, 'i').test(word);
    // Each operand that names a PAIR is drawn, by its own noun (#1639) — after the relation, which refers to them.
    const drawn = ([[left, u], [right, v]] as const).flatMap(([text, d]) =>
      d.k === 'points' ? pieceFacts(pieceNounOf(/^(ה?ישר|[Ll]ine)\s/.exec(trim(text))?.[1]), d.a, d.b, line) : [],
    );
    return made([
      { t: 'constraint', k: { t: 'relation', rel: parallel ? 'parallel' : 'perpendicular', u, v }, src: line },
      ...drawn,
    ]);
  }

  /**
   * THE SIGN OF A SLOPE — «שיפוע הישר l1 שלילי», «השיפוע של l1 חיובי», «שיפוע l1 קטן מ-0»,
   * «the slope of l1 is negative» (#1323, ADR-AG-144).
   *
   * BEFORE the slope rule, because that rule's value group goes straight to the expression parser —
   * and the expression parser reads a letter run as a PRODUCT OF SYMBOLS, so «the slope of l1 is
   * negative» was accepted as `n·e·g·a·t·i·v·e` and built green (measured; the #1321 trap on this
   * sentence). Its Hebrew twin died as `not-handled`. Both are one sentence and it lowers to a SIGN
   * SELECTOR over a derived quantity — never a fourth value keyword in the slope rule, which would give
   * the #1201 shape: accepted, reported satisfied, not honoured.
   *
   * The operand is `direction()`'s, like the slope rule's, so «הישר l1», «AB», «הצלע AB» mean here what
   * they mean there. A student who wrote a sign about nothing the resolver knows is told the formats
   * that work (`bad-operand`), not that the sentence was unintelligible.
   */
  const sign = SLOPE_SIGN_HE.exec(line) ?? SLOPE_SIGN_EN.exec(line);
  if (sign) {
    const u = direction(sign[1]);
    if (!u) return refuse('bad-operand', line);
    const positive = /חיובי|גדול|>|positive|greater/i.test(sign[2]);
    return made([{ t: 'selector', sel: { kind: 'sign', q: { k: 'slope', u }, positive }, src: line }]);
  }

  const slope = SLOPE_HE.exec(line) ?? SLOPE_EN.exec(line);
  if (slope && claimable(slope[2])) {
    const u = direction(slope[1]);
    if (!u) return refuse('bad-operand', line);
    const value = valueExpr(slope[2]);
    if (!value) return refuse('bad-equation', trim(slope[2]));
    return made([{ t: 'constraint', k: { t: 'slope', u, value }, src: line }]);
  }


  /**
   * AN AREA GIVEN BELONGS TO THE AREA RULE, EVEN THOUGH THIS ONE COULD READ IT (#1260).
   *
   * Both rules can read «שטח המשולש ABC הוא 24»: `parseLengthExpr` carries an `area` term, so the
   * length rule produces a correct area CONSTRAINT — but only the area rule also DECLARES the
   * polygon the student named. Before #1260 the split was decided by an accident of spelling: the
   * `=` form reached the length rule and the copula form did not, because this rule admitted no
   * copula. Widening the connective without this guard would have moved the copula form here too
   * and silently dropped «המשולש ABC» from the figure — a stated object going unrecorded, which
   * the honesty invariant forbids.
   *
   * The guard calls the AREA rule’s own pattern rather than restating it, and yields only when that
   * rule will really claim the line — a plain value it can read. «שטח ABC = שטח CEF + 4» (#1075,
   * an area as one term among others) has no such value, so it stays here, where it belongs.
   */
  const areaGiven = AREA_HE.exec(line) ?? AREA_EN.exec(line);
  const areaGivenValue = areaGiven ? valueExpr(areaGiven[3]) : null;
  const lengthEq = areaGivenValue ? null : LENGTH_EQ.exec(line);
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
  if (area && claimable(area[3])) {
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
    const value = valueExpr(valueSrc);
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
    const [, apex, foot, roleSrc, u0, v0, triRun] = cev;
    const median = /תיכון|median/i.test(roleSrc);
    /**
     * The side, from whichever form the student used (#1165).
     *
     * Named outright it is those two letters. Named by the TRIANGLE it is the two vertices that are
     * not the apex — which is exactly what makes the triangle form unambiguous, and also what makes
     * an apex outside the run meaningless: «XD תיכון במשולש ABC» leaves three candidates, so it is
     * refused rather than guessed at (ADR-052 — never invent what the student did not state).
     */
    let u = u0;
    let v = v0;
    if (!u || !v) {
      const ring = (triRun ?? '').match(new RegExp(NAME, 'g')) ?? [];
      const others = ring.filter((p) => p !== apex);
      // Two different wrongs, answered separately, because one message cannot be true of both:
      // «במשולש ABCD» is a noun disagreeing with its own vertex count, and «XD … במשולש ABC» is a
      // run that is a perfectly good triangle the apex simply is not part of.
      if (ring.length !== 3) return refuse('bad-arity', line);
      if (others.length !== 2) return refuse('apex-not-a-vertex', line);
      [u, v] = others;
    }
    if (u === v) return refuse('repeated-vertex', line); // «AD תיכון לצלע BB» names no side
    /**
     * THE ROLE'S OWN INCIDENCE, CHECKED (#1231).
     *
     * The rule used to validate only the SIDE's internal well-formedness (`u === v`) and then emit
     * unconditionally — it checked the letters of one operand and never the relation between the two,
     * which is the part «תיכון»/«גובה» actually asserts. So «BD תיכון לצלע AB» was accepted and drawn:
     * measured, `|BD|` was exactly `|AB|/2` at every seed, with `faults: []` — the segment the tool
     * drew as a median was the second half of the side it was supposedly drawn to, and the tool
     * asserted the figure was correct.
     *
     * Stated as the DEFINITION rather than as the three observed failures: a cevian runs apex → foot,
     * the foot lies on side (u,v), the apex does NOT, and the apex is not the foot itself. `foot ∈ side`
     * is refused here rather than left to the solver's `unsatisfiable`, because parse time is where the
     * message can name the student's statement instead of reporting an unsatisfiable system.
     *
     * A refusal, never `null`: `null` routes a sentence this rule clearly matched to the LLM seam,
     * which #1039/#1042 ruled against in this tree — a rule that matched owes the student an answer.
     * This is the one place the analytic tree deliberately does NOT copy 2-D, whose median gate
     * escalates (see the 2-D sibling, #1233).
     */
    if (apex === u || apex === v || apex === foot || foot === u || foot === v)
      return refuse('degenerate-role', line);
    return made([
      // The sentence NAMES the foot — «AD תיכון לצלע BC» is where `D` first appears — so it is
      // declared here. Without this the segment below would refuse it as an unknown reference, which
      // is right for a sentence that merely mentions a point and wrong for one that introduces it.
      { t: 'declare', id: apex, src: line },
      { t: 'declare', id: foot, src: line },
      // The cevian's own segment, so «AD» is a thing on the canvas and not only a relation.
      { t: 'segment', id: segmentId(apex, foot), a: apex, b: foot, src: line },
      /**
       * EVERY CONDITION THE ROLE MEANS, NOT ONLY THE ONE IT IS NAMED AFTER (#1232).
       *
       * Both cevians are a CONJUNCTION: the foot lies on the side, **and** the segment to it has the
       * role's own property. The median's `midpoint` happens to carry both halves in one kind — a
       * midpoint is on the side by construction — so its leg read correctly while stating only one
       * constraint. The altitude's does not: `perpendicular` is a pure direction condition, two
       * vectors whose dot product is driven to zero, and it says nothing about where `D` sits. Emitting
       * it alone dropped the incidence half silently, and the tool drew a "height" floating off its own
       * side with `faults: []` at every seed — a stated given vanishing, which is the honesty
       * invariant this repo treats as cardinal.
       *
       * So the incidence is stated HERE, for both roles, and each role then adds what is left. It is
       * `on-line-2pt` — the tree's one incidence residual, degenerate-safe at an endpoint — rather
       * than a new compound kind, for three reasons: a refusal can then name WHICH half failed
       * («D על BC» or «AD ⊥ BC») instead of a lump; a student who already stated «AD ⊥ BC» has that
       * half recognised as known by `canonicalConstraint`; and a line lowering to several facts is
       * this rule's existing shape ([ADR-AG-025](../../docs/06c-decisions-analytic.md#adr-ag-025)
       * counts the median at four), not a new one.
       *
       * The foot is on the **LINE** `uv`, with no `between` selector: an obtuse triangle's altitude
       * lands beyond an endpoint and is a perfectly honest figure. Bounding it to the segment would
       * refuse a correct construction, which is the opposite failure and no better.
       *
       * For the median the incidence is implied by `midpoint`, so it is redundant rather than wrong —
       * it is stated anyway so the conjunction lives in ONE place and neither leg can drift from it.
       */
      { t: 'constraint', k: { t: 'on-line-2pt', id: foot, a: u, b: v }, src: line },
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
    /**
     * ONE OPERAND RESOLVER (#1429). This handler, the crossing operand and «P על המעגל» each
     * hand-rolled "which curve does this name" and each knew a different subset — «P על המעגל I»
     * was `not-handled` while the same operand in a crossing resolved. `incidenceOn` is now the
     * one answer; what stays here is what genuinely differs BY SENTENCE: a bounded noun in a
     * point-on sentence is a `between` SELECTOR (the #1069/#1168 ruling), not the crossing's
     * hard extent, so the flag is lifted off the constraint and re-expressed as the selector.
     */
    const k = incidenceOn(`${noun ?? ''} ${operand}`.trim(), id) ?? incidenceOn(operand, id);
    if (k && k.t === 'kind') {
      return made([
        { t: 'declare', id, src: line },
        { t: 'on-kind', id, kind: k.kind, ...(k.circle ? { circle: k.circle } : {}), src: line },
      ]);
    }
    // A bare AXIS operand keeps belonging to the ON_AXIS rule below, which also reads the
    // positive/negative-part clause — one owner for that whole sentence family.
    if (k && k.t !== 'on-line') {
      if (k.t === 'on-line-2pt') {
        const { bounded: _basin, ...rest } = k;
        const facts: Fact[] = [
          { t: 'declare', id, src: line },
          { t: 'constraint', k: rest, src: line },
        ];
        // The bound, and ONLY when the noun carried one — the operator's ruling.
        if (bounded) {
          facts.push({ t: 'selector', sel: { kind: 'between', id, a: rest.a, b: rest.b }, src: line });
        } else if (!noun && new RegExp(`^${NAME}${NAME}$`).test(operand)) {
          // NO noun (#1636, ADR-AG-198): the pair inherits the extent of what the figure draws over it — M1's call.
          facts.push({ t: 'extent-of', id, a: rest.a, b: rest.b, src: line });
        }
        return made(facts);
      }
      return made([
        { t: 'declare', id, src: line },
        { t: 'constraint', k, src: line },
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
    // The inline-equation operand is `incidenceOn`'s eq branch now — one resolver (#1429); the
    // apply boundary owns mint-or-match, so «B על הישר y=x» beside a stated l1: y=x is ON l1.
    // An AXIS operand belongs to the rule below, which already owns that sentence; anything else is
    // not a thing a point can be on. Fall through rather than returning — a `return null` here would
    // exit `parseConstraint` entirely and skip the area, cevian and axis rules that follow.
  }

  const ang = ANGLE_HE.exec(line) ?? ANGLE_EN.exec(line);
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

  const angVal = ANGLE_VALUE_HE.exec(line) ?? ANGLE_VALUE_EN.exec(line);
  if (angVal) {
    const [, p, v, q, rhsSrc] = angVal;
    const rhs = trim(rhsSrc);
    // Read the same way as the right angle: the middle letter is the vertex, the outer two the rays.
    const left = angleNameOf(p, v, q);
    if (!left) return refuse('repeated-vertex', line);
    const other = ANGLE_OF.exec(rhs);
    if (other) {
      const [, kSrc, p2, v2, q2] = other;
      const right = angleNameOf(p2, v2, q2);
      if (!right) return refuse('repeated-vertex', line);
      const k = valueExpr(kSrc ?? '1');
      if (!k) return refuse('bad-equation', rhs);
      // Three letters on both sides need no figure; a lone vertex on either side is resolved at M1.
      if (isAngleRef(left) && isAngleRef(right)) {
        return made([{ t: 'constraint', k: { t: 'angle-ratio', left, right, k }, src: line }]);
      }
      return made([{ t: 'vertex-angle', left, rhs: { t: 'angle', of: right, k }, src: line }]);
    }
    const valueSrc = rhs.replace(DEGREE_TAIL, '');
    // A word on the right («חדה», «acute») is not a value this rule reads — leave the sentence to
    // whoever owns it rather than answer with an equation error.
    if (claimable(valueSrc)) {
      const value = valueExpr(valueSrc);
      if (!value) return refuse('bad-equation', valueSrc);
      if (isAngleRef(left)) return made([{ t: 'constraint', k: { t: 'angle', at: left, value }, src: line }]);
      return made([{ t: 'vertex-angle', left, rhs: { t: 'value', value }, src: line }]);
    }
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
  if (comp && claimable(comp[3])) {
    const [, axis, id, valueSrc] = comp;
    const value = valueExpr(valueSrc);
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

/**
 * ONE LINE → FACTS, through the sentence frame (#1618).
 *
 * The rules below read ONE canonical sentence (`parseClause`). The exam writes its givens inside a
 * textbook frame — a given-prefix, a figure reference, a context shape, a parenthetical, two givens on
 * one line — and this is the single boundary that reads the frame (`frameAnalytic.ts`), so a wrapper
 * is taught once rather than to every rule.
 *
 * A READING is a list of clauses; it is taken only when EVERY clause parses, so the frame can never
 * accept what the grammar does not, and a line is never half-accepted. The shape/origin/distribution
 * readings are structural and run first (their patterns are unambiguous, and a rule that half-claims
 * «טרפז ישר זווית ABCD (AB ∥ CD, …)» would otherwise answer first); the comma/«ו» split runs only when
 * no rule owns the line, so it can never override a rule's deliberate refusal.
 */
export function parseLine(raw: string): ParseResult {
  const typed = trim(raw);
  const line = orthography(typed);
  if (!line) return { ok: false, code: 'not-handled', detail: raw };
  if (isProofTarget(unwrap(line))) return { ok: false, code: 'proof-target', detail: raw };
  const { result, framed } = readLine(line, 0);
  if (!result.ok) return result.code === 'not-handled' ? { ...result, detail: raw } : result;
  /*
   * A refusal names the STUDENT'S statement (the honesty invariant): an apply error quotes its fact's
   * `src`, and a framed line's facts were parsed from a canonical clause the student never typed — so
   * «O ראשית הצירים» after «O(1,1)» was refused quoting "O(0,0)". When the frame changed anything,
   * every fact carries the line as typed.
   */
  return framed || line !== typed ? made(result.facts.map((f) => ({ ...f, src: typed }))) : result;
}

/** Splits are bounded: a clause may itself be framed, but a reading never nests deeper than this. */
const MAX_FRAME_DEPTH = 2;

/** One reading of `text`; `framed` says whether the frame changed it or took a reading at all. */
function readLine(text: string, depth: number): { result: ParseResult; framed: boolean } {
  const s = unwrap(text);
  if (!s) return { result: { ok: false, code: 'not-handled', detail: text }, framed: false };
  const attempt = (clauses: readonly string[]): ParseResult | null => {
    const facts: Fact[] = [];
    for (const c of clauses) {
      const { result } = readLine(c, depth + 1);
      if (!result.ok) return null;
      facts.push(...result.facts);
    }
    return made(facts);
  };
  if (depth < MAX_FRAME_DEPTH) {
    for (const reading of [
      originClauses(s),
      shapeClauses(s),
      distributeClauses(s),
      pointClauses(s),
      sideClauses(s),
      centreClauses(s),
      sharedSubjectClauses(s),
      elidedSubjectClauses(s),
      diameterClauses(s),
    ]) {
      const r = reading && attempt(reading);
      if (r) return { result: r, framed: true };
    }
  }
  const direct = parseClause(s);
  const unwrapped = s !== text.trim();
  if (direct.ok || depth >= MAX_FRAME_DEPTH) return { result: direct, framed: unwrapped };
  if (direct.code !== 'not-handled' && direct.code !== 'bad-operand') return { result: direct, framed: unwrapped };
  for (const reading of partitions(segmentsOf(s))) {
    if (reading.some(isBareName)) continue;
    const r = attempt(reading);
    if (r) return { result: r, framed: true };
  }
  // A sentence with its givens in parentheses at the end (#1619 B2) — last, like the comma split, so it can
  // never override a rule that owns the whole line.
  const paren = parenClauses(s);
  const withParen = paren && attempt(paren);
  if (withParen) return { result: withParen, framed: true };
  return { result: direct, framed: unwrapped };
}

/** A space-delimited run of three or more Latin letters is a WORD — no equation in this grammar has one (#1068). */
const HAS_A_WORD = /(?:^|\s)[A-Za-z]{3,}(?=\s|$)/;

function parseClause(raw: string): ParseResult {
  const line = trim(raw);
  if (!line) return { ok: false, code: 'not-handled', detail: raw };

  const param = parseParamHe(line) ?? parseParamEn(line) ?? parseInequality(line);
  if (param) return { ok: true, facts: [param] };

  // A coordinate compared (#1462) — after the parameter domains, whose atoms are single symbols.
  const compared = parseCompare(line);
  if (compared) return compared;

  /**
   * A circle stated by its CENTRE runs before `matchCurve` (#1060), because that rule’s tail is
   * `(.+)` and it would read the centre letter as an equation — the #1059 shape, which the Hebrew
   * guard catches only when the tail HAS Hebrew in it. «נתון מעגל O» has none.
   */
  // Inscribed and circumscribed (#1619 B2) — before `parseCircleAt`, whose subject reader would take
  // «מעגל שמרכזו C» off the front of «מעגל שמרכזו C חסום במשולש AOB».
  const inscribed = parseInscribed(line);
  if (inscribed) return inscribed;
  // The tangent as an object and chords (#1619 B3) — before `parseCircleAt`, whose verb split would
  // read «משוואת המשיק …» as a subject «משוואת» before the verb «המשיק».
  const tangentObject = parseTangentObject(line) ?? parseChord(line);
  if (tangentObject) return tangentObject;

  const centred = parseCircleAt(line);
  if (centred) return centred;

  const roles = parseMeasureRoles(line);
  if (roles) return roles;

  // A circle COMPUTED from points (#1464, #1324) — before `matchCurve` for the same reason.
  const computed = parseCircleThru(line);
  if (computed) return computed;

  // Incidence in every order and over every operand (#1281, #1495) — normalised to the sentences below.
  const incidence = parseIncidence(line);
  if (incidence) return incidence;

  // The circle's centre by its role, and the circle's regions (#1619 B1).
  const centreSubject = parseCentreSubject(line) ?? parseCircleRegion(line);
  if (centreSubject) return centreSubject;

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
  /**
   * A NOUN GATE MAY NOT CLAIM A TAIL THAT IS NOT AN EQUATION (#1246) — the second half of the #1059
   * guard below, and the half it was missing.
   *
   * The Hebrew test alone asks *"did the sentence continue in prose?"*. It does not ask *"is this an
   * equation at all?"*, and «הקטע BC = 10» is neither prose nor an equation — it is a LENGTH. So the
   * rule claimed it, handed `10` to `equationExpr`, and answered «לא הצלחתי לקרוא את המשוואה» about
   * an equation the student never wrote, sending them to hunt for a typo in something that does not
   * exist. That breaks the honesty invariant on messages: an error names the conflicting STATEMENT,
   * never internal state.
   *
   * ADR-AG-111 did not create this — it enlarged it. «הישר BC = 10» answered `bad-equation` before
   * that ADR too; widening the noun registry from two members to nine simply took the same defect
   * from one noun to nine. The fix closes the older member as well, which is how it is known to be at
   * the right altitude rather than aimed at the new nouns.
   *
   * **The discriminator is the plane's own variables** — the signal the bare-colon and bare-equation
   * branches also key on: *does the tail name `x` or `y`?* `10` names neither, so the rule has no
   * claim on it. It deliberately does NOT require the tail to PARSE as an equation: a truncated one
   * («…שמשוואתו (x-3)^2+(y-4)^2», no `=`) parses as nothing and must still be told it is unreadable,
   * and requiring a clean parse turned that honest `bad-equation` into `not-handled` — measured, and
   * the reason this asks what the student MEANT rather than what the text achieves. Asked HERE, at
   * `matchCurve`'s single exit, it covers every branch at once — asked per-branch it does not, and
   * measurably so: gating `heLineNamed` alone lets the sentence fall through to the no-noun branch,
   * which claims it and MINTS A CURVE. That was tried and rejected.
   *
   * A truncated equation is still `bad-equation`: «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2» mentions
   * `x` and `y`, so the student meant an equation and got it wrong, and must be told so (#1059).
   */
  const curveTailMeansEquation = ((): boolean => {
    if (!curve) return false;
    /*
     * PROSE IN ENGLISH IS PROSE TOO (#1619 B1). The Hebrew test above never saw an English sentence: «the
     * circle cuts the x-axis at B» names `x` (in "x-axis"), so the circle noun claimed it and answered
     * `bad-equation` about an equation the student never wrote — #1068's trap, one rule over. The bare
     * branch's discriminator (`HAS_A_WORD`) is the one asked here: a WORD in the tail is a sentence.
     */
    if (HAS_A_WORD.test(normalizeMath(curve.eqSrc))) return false;
    // Deliberately NOT "does it parse as an equation". A TRUNCATED equation must still be told it is
    // unreadable (#1059's «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2» — no `=`, so it parses as nothing),
    // and requiring a clean parse here turned that honest `bad-equation` into `not-handled`. The
    // question is what the student MEANT, and naming the plane's own variables is what says it.
    return [...RESERVED_SYMBOLS].some((v) =>
      new RegExp(`(?<![A-Za-z])${v}(?![A-Za-z])`).test(curve.eqSrc),
    );
  })();
  if (curve && (!claimable(curve.eqSrc) || !curveTailMeansEquation)) {
    // fall through: the noun matched, the tail is not an equation — or opens with a name/connective
    // the rule never read (#1272, `claimable`) — so this rule has no claim
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

    /**
     * A NUMERAL IS NOT TWO POINTS, AND A REPEATED LETTER IS NOT A LINE (#1318, ADR-AG-144).
     *
     * `II` is Latin capitals twice, so this read it as *"through I and I"* and minted a phantom point the
     * student never wrote — the [IVX] trap on the rule written to catch it. A numeral name asserts
     * nothing about any point. And a two-point run that repeats its letter («הישר AA») names no line
     * at all: it is refused as the shape nouns refuse «משולש ABA», by the same predicate.
     */
    const named =
      curve.kind === 'line' && !LINE_NUMERAL_RE.test(curve.name) ? TWO_POINT_NAME.exec(curve.name) : null;
    if (named && named[1] === named[2]) return { ok: false, code: 'repeated-vertex', detail: line };
    /**
     * THE NOUN DECIDES THE EXTENT, AND A BOUNDED ONE DRAWS ONLY THE SEGMENT (#1234 / #1236).
     *
     * Operator ruling, 2026-09-19: *"משוואת הישר should draw the line. משוואת הצלע or הקטע should
     * draw a segment (in not yet draw)"* and, asked whether the infinite line still EXISTS behind a
     * bounded noun, *"only draws CE"*.
     *
     * So a bounded noun emits the segment — minted here, idempotent if the figure already has it —
     * and the line survives as an UNDRAWN CARRIER (`stated: false`). That is not a new concept: it
     * is the same flag «B על הישר y=x» already uses for a line that exists to hold a point rather
     * than to be drawn, and `scene.ts` draws only `stated` curves. The carrier is what the two
     * endpoints are constrained ONTO, so the equation is a real condition rather than decoration;
     * without it «משוואת הצלע CE היא x-3y=0» would state nothing at all.
     *
     * A student who later writes «משוואת הישר CE היא …» upgrades the same object to `stated: true`
     * (the fold already does this), which is the deliberate line-over-segment pair #1234 describes —
     * reached only by asking for it, never minted behind the student's back.
     *
     * With NO noun the extent is inherited from what the figure already holds, and that is a
     * question this parser cannot answer: it takes no figure context. The fact carries
     * `inheritExtent` and the fold decides.
     */
    const bounded = curve.extent === 'segment' && named !== null;
    const inherits = curve.extent === undefined && named !== null;
    const boundedSeg: Fact[] =
      bounded && named
        ? [{ t: 'segment', id: segmentId(named[1], named[2]), a: named[1], b: named[2], src: line }]
        : [];
    const through: Fact[] = named
      ? [
          { t: 'declare', id: named[1], src: line },
          { t: 'declare', id: named[2], src: line },
          { t: 'constraint', k: { t: 'on-curve', id: named[1], curve: curve.id }, src: line },
          { t: 'constraint', k: { t: 'on-curve', id: named[2], curve: curve.id }, src: line },
        ]
      : [];
    const curveFacts: Fact[] = [
        {
          t: 'curve',
          id: curve.id,
          /**
           * An UNNAMED curve carries its equation as its label (#1092), so the canvas can offer a
           * sentence about it. A named one does not: its name is how the student refers to it.
           */
          label: { name: curve.name, kind: curve.kind, ...(curve.name ? {} : { eqSrc: trim(curve.eqSrc) }) },
          curve: { kind: curve.kind, eq },
          // The student named the curve and gave its equation — this sentence IS the curve, UNLESS a
          // bounded noun said the drawn object is the segment (then the line is its carrier).
          stated: !bounded,
          ...(inherits ? { inheritExtent: true as const } : {}),
          src: line,
        },
        ...through,
        ...boundedSeg,
        ...centre,
    ];
    /*
     * The equation of THE circle (#1633, ADR-AG-196): about the figure's one circle when it has one. A circle
     * described by its centre letter («נתון מעגל M שמשוואתו …», «משוואת המעגל M היא …») is the circle the figure
     * already has on that centre when it has one — the same statement, matched by the centre.
     */
    if (curve.contextual || curve.centre) {
      const about: Fact[] = [{ t: 'circle-eq', circleId: CIRCLE_SENTINEL, eq, src: line }];
      return made([{ t: 'the-circle', create: curveFacts, about, ...(curve.centre ? { match: { centre: curve.centre } } : {}), src: line }]);
    }
    return { ok: true, facts: curveFacts };
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
   * A POINT NAMED WITHOUT BEING PLACED — «נקודה M», «נתונה נקודה M», «M היא נקודה» (#1136).
   *
   * The `free` carrier family has existed since slice A — *"a named but unplaced point, two degrees
   * of freedom, its own"* (#1017) — and `evaluate` places it, solves it and counts it. **The engine
   * was complete; only the sentence was missing.** So this rule emits the `declare` fact the cevian
   * and polygon rules already emit, and adds no engine concept.
   *
   * Until now the only route to a 2-DOF point was to smuggle it in as a polygon vertex —
   * «משולש ABM» — which asserts a triangle the student never mentioned: a given the question never
   * gave, [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin arriving through the front
   * door. Every worked example in #1136 and in the locus issues had to use that workaround to be
   * measured at all.
   *
   * **It runs LAST among the point forms, and matches only to end-of-line.** «נקודה D נמצאת על הצלע
   * BC» and «נקודה M(3,4)» are longer sentences that `parsePoints` has already answered; a rule that
   * matched a prefix would swallow them, which is the #1059 swallowing defect. The anchor is what
   * keeps this a declaration rather than a wildcard.
   *
   * Hebrew morphology is written out rather than abbreviated (`HE_GIVEN`): «נתון» ends in FINAL nun
   * and every other form in medial nun, so the convenient `נתונ(ה|ים|ות)?` silently drops the
   * commonest spelling. This tree has paid for that letter three times.
   *
   * **The sibling nouns were measured at the same time** (#1136's class check). «מעגל O» already
   * declares a free-centred circle; «ישר k» and «line k» are refused for the SAME reason this was,
   * and are NOT fixed here — a free line has no object kind and no `carrierOf` row, so it is real
   * engine work rather than a sentence. Filed rather than folded in.
   */
  const FREE_POINT_HE = new RegExp(
    `^${HE_GIVEN}(?:ה?(?:נקוד(?:ה|ות)|קדקוד)\\s+(${NAME})|(${NAME})\\s+(?:היא|הינה)?\\s*ה?(?:נקודה|קדקוד))$`,
  );
  const FREE_POINT_EN = new RegExp(
    `^(?:a\\s+|the\\s+|given\\s+(?:a\\s+|the\\s+)?)?point\\s+(${NAME})$`,
    'i',
  );
  const freePt = FREE_POINT_HE.exec(line) ?? FREE_POINT_EN.exec(line);
  if (freePt) {
    const id = freePt[1] ?? freePt[2];
    if (id) return { ok: true, facts: [{ t: 'declare', id, src: line }] };
  }

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
   *
   * (`HAS_A_WORD` is module-level since #1619 B1: the noun gate above asks the same question of its tail.)
   */
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

// ---------------------------------------------------------------------------
// INCIDENCE IN EVERY ORDER AND OVER EVERY OPERAND (#1281, #1495, ADR-AG-164)
// ---------------------------------------------------------------------------

/**
 * One relation, many sentences. «P על הישר CD» was the only way to say a point lies on a line; the exam also
 * writes the LINE first («הישר CD עובר דרך P», «ישר 3 עובר דרך הנקודה N»), a SIDE as the subject («הצלע BC
 * נמצאת על הישר y=x-4», «האלכסון BD מונח על הישר y=x», «הבסיס CD נמצא על ישר העובר דרך …»), and a point by its
 * COORDINATES with no letter («הנקודה (-3,7)»). Every one was `not-handled` while the relation, its residual
 * and its solve all existed.
 *
 * So these are NORMALISED, in one place, into the sentences the grammar already reads — «P על …»,
 * «משוואת הצלע BC היא …», «דרך P עובר ישר l3» — and those sentences are parsed by the rules that own them.
 * Two spellings of one relation then produce the IDENTICAL facts by construction, which is what the locks
 * assert, and no second lowering exists to drift (docs/17: a normalisation at the rule, never a regex per
 * phrasing).
 */

/** A point given by its coordinates — «(-3,7)», «(2, a)» — the two values, as the exam writes them. */
const COORD_PAIR = String.raw`\(\s*([^(),;]+?)\s*[,;]\s*([^(),;]+?)\s*\)`;
const COORD_ONLY = new RegExp(`^${COORD_PAIR}$`);
/**
 * THE PLACEHOLDER a coordinate-only point carries out of the parser (#1281, the #1263 ruling).
 *
 * The parser is pure over one line and cannot know which reserved name is free, or whether the student has
 * already stated a point at those coordinates — `derive` resolves it over the whole list (`resolveMints`).
 * The key is the coordinates' own text, so the same point stated twice is one point.
 */
export const MINT_PREFIX = '@mint:';
/** A name no student writes and no mint takes — the stand-in while a canonical sentence is parsed. */
const MINT_SENTINEL = 'Z₀';

type PointSlot = { name: Id } | { x: Expr; y: Expr; key: string };

/** A point slot: a name, or a coordinate pair, with the optional noun «(ה)נקודה» / "point". */
function pointSlot(raw: string): PointSlot | null {
  const t = trim(raw)
    .replace(/^ה?נקודה\s+/, '')
    .replace(/^(?:the\s+)?point\s+/i, '');
  if (new RegExp(`^${NAME}$`).test(t)) return { name: t };
  const m = COORD_ONLY.exec(t);
  if (!m) return null;
  const x = valueExpr(m[1]);
  const y = valueExpr(m[2]);
  if (!x || !y) return null;
  const key = `${normalizeMath(m[1]).replace(/\s+/g, '')},${normalizeMath(m[2]).replace(/\s+/g, '')}`;
  return { x, y, key };
}

/**
 * Parse the canonical sentence(s) `build` writes for the slot's point, and re-attribute every fact to the
 * student's own line. A coordinate slot is parsed through the sentinel name and re-labelled with its mint
 * placeholder, preceded by the point itself — so the canonical rules never learn that a mint exists.
 */
function viaCanonical(line: string, slot: PointSlot | null, build: (p: Id) => string[]): RuleOutcome {
  const p = slot && 'name' in slot ? slot.name : MINT_SENTINEL;
  const facts: Fact[] = [];
  for (const s of build(p)) {
    const r = parseClause(s);
    if (!r.ok) return null;
    facts.push(...r.facts);
  }
  let out: Fact[] = facts.map((f) => ({ ...f, src: line }));
  if (slot && !('name' in slot)) {
    const id = `${MINT_PREFIX}${slot.key}`;
    // EMBEDDED too, not only whole strings (#1432 am. 1): a circle centred on a coordinate point carries the
    // placeholder inside its own ids — `circle-at-Z₀`, `r_Z₀` — and they must follow the point's name.
    out = JSON.parse(JSON.stringify(out).split(MINT_SENTINEL).join(JSON.stringify(id).slice(1, -1))) as Fact[];
    out.unshift({ t: 'point', id, x: slot.x, y: slot.y, src: line });
  }
  return made(out);
}

/** «מרכז המעגל» · «נקודת מרכז המעגל» · "the centre of the circle" — the centre named by its ROLE (#1619 B1). */
const CENTRE_PHRASE = /^(?:ה?נקודת\s+)?ה?מרכז\s+(?:של\s+)?ה?מעגל$|^(?:the\s+)?cent(?:re|er)\s+of\s+the\s+circle$/i;

/**
 * A sentence about the circle's centre BY ROLE (#1619 B1): `canonical` is the sentence with
 * `CENTRE_SENTINEL` where the centre's letter goes, parsed by the rule that owns it; M1 resolves which
 * point the centre is (`via-centre`). `phrase` is the student's own words for the centre, so an unnamed
 * centre is refused quoting them.
 */
function viaCentre(line: string, phrase: string, canonical: string): RuleOutcome {
  const r = parseClause(canonical);
  if (!r.ok) return null;
  return made([{ t: 'via-centre', facts: r.facts.map((f) => ({ ...f, src: line })), phrase, src: line }]);
}

/**
 * «מרכז המעגל נמצא על ציר ה-y» · "the centre of the circle lies on the line y=x" — the centre as the
 * SUBJECT of any sentence about a point (#1619 B1). With a letter («מרכז המעגל M נמצא …») the frame reads it
 * as the naming plus the sentence about M (`centreClauses`); without one, the sentence is about the point
 * the figure's circle has at its centre.
 */
const CENTRE_SUBJECT = /^(?:ה?נקודת\s+)?(ה?מרכז\s+(?:של\s+)?ה?מעגל)\s+(.+)$|^((?:the\s+)?cent(?:re|er)\s+of\s+the\s+circle)\s+(.+)$/i;
function parseCentreSubject(line: string): RuleOutcome {
  const m = CENTRE_SUBJECT.exec(line);
  if (!m) return null;
  const phrase = m[1] ?? m[3];
  const rest = m[2] ?? m[4];
  // A letter right after the phrase NAMES the centre — the frame's sentence, not this one.
  if (new RegExp(`^${NAME}(?:\\s|$)`).test(rest)) return null;
  return viaCentre(line, phrase, `${CENTRE_SENTINEL} ${rest}`);
}

/**
 * «הנקודה B נמצאת מחוץ למעגל» · «… בתוך המעגל» · «E נמצאת על הקשת הקטנה AC» · "B is outside the circle" ·
 * "E is on the minor arc AC" (#1619 B1) — a REGION of the circle, lowered to `circle-region` for M1 to
 * resolve the circle (contextual, numeral or centre letter). The circle reference is the one `incidenceOn`
 * reads, so «מחוץ למעגל M» means the same circle «על מעגל M» does.
 */
const REGION_CIRCLE_HE = `ה?מעגל(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?`;
const REGION_HE = new RegExp(
  `^${HE_GIVEN}${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת|ים|ות)?\\s+)?(מחוץ\\s+ל-?|בתוך\\s+|בפנים\\s+)${REGION_CIRCLE_HE}$`,
);
const ARC_HE = new RegExp(
  `^${HE_GIVEN}${HE_POINT}(${NAME})${HE_IS}\\s*(?:נמצא(?:ת|ים|ות)?\\s+)?על\\s+ה?קשת\\s+ה?(קטנה|גדולה)\\s+(${NAME})(${NAME})(?:\\s+(?:של|ב)\\s*${REGION_CIRCLE_HE})?$`,
);
const REGION_EN = new RegExp(`^(?:[Tt]he\\s+)?(?:[Pp]oint\\s+)?(${NAME})\\s+(?:is|lies)\\s+(outside|inside)\\s+(?:of\\s+)?the\\s+circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?$`);
const ARC_EN = new RegExp(
  `^(?:[Tt]he\\s+)?(?:[Pp]oint\\s+)?(${NAME})\\s+(?:is|lies)\\s+on\\s+the\\s+(minor|major)\\s+arc\\s+(${NAME})(${NAME})(?:\\s+of\\s+the\\s+circle(?:\\s+(${NAME}|${CIRCLE_NUMERALS}))?)?$`,
);

function parseCircleRegion(line: string): RuleOutcome {
  const r = REGION_HE.exec(line) ?? REGION_EN.exec(line);
  if (r) {
    const [, id, word, circle] = r;
    const region = /מחוץ|outside/.test(word) ? 'outside' : 'inside';
    return made([{ t: 'circle-region', id, region, ...(circle ? { circle } : {}), src: line }]);
  }
  const arc = ARC_HE.exec(line) ?? ARC_EN.exec(line);
  if (arc) {
    const [, id, size, a, b, circle] = arc;
    const region = /קטנה|minor/.test(size) ? 'minor-arc' : 'major-arc';
    if (a === b || id === a || id === b) return refuse('repeated-vertex', line);
    return made([{ t: 'circle-region', id, region, a, b, ...(circle ? { circle } : {}), src: line }]);
  }
  return null;
}

/** What a line-phrase names, in the grammar's own terms. */
type LineObject =
  | { k: 'pair'; noun: string; a: Id; b: Id }
  | { k: 'named'; name: string }
  | { k: 'eq'; src: string }
  | { k: 'through'; slot: PointSlot }
  | { k: 'curve' };

/** English nouns onto the Hebrew noun the canonical sentence carries (a base is a side, #1281). */
const NOUN_OF: Record<string, string> = { line: 'הישר', side: 'הצלע', segment: 'הקטע', base: 'הצלע' };
function heNoun(noun: string | undefined): string {
  if (!noun) return 'הישר';
  const n = noun.trim().replace(/^the\s+/i, '').toLowerCase();
  if (NOUN_OF[n]) return NOUN_OF[n];
  if (/בסיס/.test(n)) return 'הצלע';
  return /^ה/.test(n) ? n : `ה${n}`;
}

const OBJ_PAIR = new RegExp(
  `^((?:ה?(?:ישר|צלע|קטע|בסיס))|(?:[Tt]he\\s+)?(?:[Ll]ine|[Ss]ide|[Ss]egment|[Bb]ase))?\\s*(${NAME})(${NAME})$`,
);
const OBJ_NAMED = new RegExp(`^(?:ה?ישר|(?:[Tt]he\\s+)?[Ll]ine)\\s+(${FREE_LINE_NAME})$|^([ℓl][0-9]?)$`);
const OBJ_CURVE = /^(?:ה?(?:מעגל|פרבולה|אליפסה)|(?:the\s+|a\s+)?(?:circle|parabola|ellipse))(?:\s|$)/i;
const OBJ_EQ = /^(?:ה?ישר\s+|(?:the\s+)?line\s+)?([^=]+=[^=]+)$/i;
/** «ישר העובר דרך הנקודה (-3,7)» · «ישר שעובר ב-P» · "a line through P" — a line given by one point. */
const OBJ_THROUGH = /^(?:ה?ישר\s+(?:ה|ש)?עובר(?:ת)?\s+(?:דרך|ב-?)\s*|(?:a\s+|the\s+)?line\s+(?:that\s+)?(?:passes\s+|passing\s+|going\s+)?through\s+)(.+)$/i;

/** A pair object as the canonical sentence writes it — with its noun, or bare (the extent then inherited at M1). */
const pairText = (o: { noun: string; a: Id; b: Id }): string => `${o.noun ? `${o.noun} ` : ''}${o.a}${o.b}`;

function lineObject(raw: string): LineObject | null {
  const t = trim(raw);
  if (OBJ_CURVE.test(t)) return { k: 'curve' };
  const through = OBJ_THROUGH.exec(t);
  if (through) {
    const slot = pointSlot(through[1]);
    return slot ? { k: 'through', slot } : null;
  }
  const pair = OBJ_PAIR.exec(t);
  // A BARE pair keeps no noun (#1636): «CD עובר דרך …» inherits CD's extent from the figure at M1, so it is not
  // rewritten as «הישר CD», which would decide the extent here, blind.
  if (pair && pair[2] !== pair[3]) return { k: 'pair', noun: pair[1] ? heNoun(pair[1]) : '', a: pair[2], b: pair[3] };
  const named = OBJ_NAMED.exec(t);
  if (named) return { k: 'named', name: named[1] ?? named[2] };
  const eq = OBJ_EQ.exec(t);
  if (eq) return { k: 'eq', src: trim(eq[1]) };
  return null;
}

/** «הישר CD עובר דרך P» · «CD מכיל את P» · «ישר 3 עובר בנקודה N» · "the line CD passes through P". */
const CONVERSE_HE = new RegExp(`^${HE_GIVEN}(.+?)\\s+(?:עובר(?:ת)?\\s+(?:דרך|ב-?)\\s*|מכיל(?:ה)?\\s+את\\s+)(.+)$`);
const CONVERSE_EN = /^(.+?)\s+(?:passes\s+through|goes\s+through|contains)\s+(.+)$/i;

/** «הצלע BC נמצאת על …» · «האלכסון BD מונח על …» · "the side BC lies on …" — a SIDE as the subject (#1495). */
const SIDE_ON_HE = new RegExp(
  `^${HE_GIVEN}(?:(ה?(?:צלע|קטע|בסיס|ישר|אלכסון))\\s+)?(${NAME})(${NAME})\\s+(?:(?:הוא|היא)\\s+)?(?:(?:נמצא|נמצאת|מונח|מונחת)\\s+)?על\\s+(.+)$`,
);
const SIDE_ON_EN = new RegExp(
  `^(?:[Tt]he\\s+)?(?:(side|segment|base|diagonal|line)\\s+)?(${NAME})(${NAME})\\s+(?:lies|is|lie)\\s+on\\s+(.+)$`,
);
/** The noun «משוואת …» takes for the side: a side, a segment, a line or a diagonal (a base is a side). */
function eqNounOf(noun: string | undefined): string {
  const n = (noun ?? '').replace(/^ה/, '').toLowerCase();
  if (n === 'קטע' || n === 'segment') return 'הקטע';
  if (n === 'ישר' || n === 'line') return 'הישר';
  if (n === 'אלכסון' || n === 'diagonal') return 'האלכסון';
  return 'הצלע';
}

/** «הנקודה (-3,7) על הישר CD» · "the point (2,5) lies on the line l1" — a coordinate as the subject. */
const COORD_ON_HE = new RegExp(`^${HE_GIVEN}(?:ה?נקודה\\s+)?(${COORD_PAIR})\\s+(?:(?:הוא|היא)\\s+)?(?:נמצא(?:ת)?\\s+)?על\\s+(.+)$`);
const COORD_ON_EN = new RegExp(`^(?:the\\s+)?(?:point\\s+)?(${COORD_PAIR})\\s+(?:is\\s+|lies\\s+)?on\\s+(.+)$`, 'i');
/** «נתונה הנקודה (-3,7)» — a point by its coordinates alone; the tool names it (#1263 ruling). */
const COORD_POINT = new RegExp(`^${HE_GIVEN}(?:ה?נקודה\\s+|(?:the\\s+)?point\\s+)?(${COORD_PAIR})$`, 'i');

function parseIncidence(line: string): RuleOutcome {
  const bare = COORD_POINT.exec(line);
  if (bare) {
    const slot = pointSlot(bare[1]);
    return slot && !('name' in slot) ? viaCanonical(line, slot, (p) => [`נקודה ${p}`]) : null;
  }

  const coordOn = COORD_ON_HE.exec(line) ?? COORD_ON_EN.exec(line);
  if (coordOn) {
    const slot = pointSlot(coordOn[1]);
    const rest = coordOn[4];
    if (!slot) return null;
    return viaCanonical(line, slot, (p) => [`${p} על ${rest}`]);
  }

  const side = SIDE_ON_HE.exec(line) ?? SIDE_ON_EN.exec(line);
  if (side && side[2] !== side[3]) {
    const [, noun, a, b, objectText] = side;
    const obj = lineObject(objectText);
    if (!obj) return null;
    const drawn = noun && /ישר|line/i.test(noun) ? [] : [`${/קטע|segment/i.test(noun ?? '') ? 'הקטע' : 'הצלע'} ${a}${b}`];
    /**
     * A SIDE ON A CIRCLE IS A CHORD (#1619 B3, ruling 4 on #1616: *"Chord: yes … lift the out-of-scope
     * refusal"*). It used to be refused here as a different sentence; it is the same statement as «BC מיתר
     * במעגל» — both ends on the curve, the side drawn — and lowers to exactly that (a parabola's chord too).
     */
    if (obj.k === 'curve') return viaCanonical(line, null, () => [`${a} על ${objectText}`, `${b} על ${objectText}`, ...drawn]);
    if (obj.k === 'eq') return viaCanonical(line, null, () => [`משוואת ${eqNounOf(noun)} ${a}${b} היא ${obj.src}`]);
    if (obj.k === 'named') return viaCanonical(line, null, () => [`${a} על הישר ${obj.name}`, `${b} על הישר ${obj.name}`, ...drawn]);
    if (obj.k === 'through') return viaCanonical(line, obj.slot, (p) => [`${p} על הישר ${a}${b}`, ...drawn]);
    // «הצלע BC נמצאת על הישר DE» — two collinear pairs; the grammar has no sentence for it yet.
    return null;
  }

  const conv = CONVERSE_HE.exec(line) ?? CONVERSE_EN.exec(line);
  if (conv) {
    const obj = lineObject(conv[1]);
    /**
     * «CD עובר דרך מרכז המעגל» (#1619 B1) — the centre by its ROLE, as the point. The same sentence with the
     * letter written in, wrapped for M1 to say which letter that is (`via-centre`).
     */
    if (obj && obj.k !== 'curve' && obj.k !== 'through' && CENTRE_PHRASE.test(trim(conv[2]))) {
      const p = CENTRE_SENTINEL;
      const canonical =
        obj.k === 'pair' ? `${p} על ${pairText(obj)}` : obj.k === 'named' ? `דרך ${p} עובר ישר ${obj.name}` : `${p} על הישר ${obj.src}`;
      const centred = viaCentre(line, trim(conv[2]), canonical);
      // The subject pair is NAMED by the sentence, so it is drawn (#1639) — after the incidence, which refers to it.
      return centred?.ok && obj.k === 'pair' ? made([...centred.facts, ...pieceFacts(pieceNounOf(obj.noun), obj.a, obj.b, line)]) : centred;
    }
    const slot = pointSlot(conv[2]);
    if (!obj || !slot || obj.k === 'through') return null;
    /**
     * «המעגל עובר דרך A» · «המעגל עובר דרך ראשית הצירים O» · "the circle passes through A" (#1619 B1) — the
     * converse of «A על המעגל», and that sentence is what it means: lowered onto it, so the circle is
     * resolved by the one rule that owns a point on a circle (contextual, by numeral, or by centre letter).
     * Three listed points are the computed circle's sentence (`parseCircleThru`), which answers first.
     */
    if (obj.k === 'curve') return viaCanonical(line, slot, (p) => [`${p} על ${trim(conv[1])}`]);
    if (obj.k === 'pair') {
      const on = viaCanonical(line, slot, (p) => [`${p} על ${pairText(obj)}`]);
      return on?.ok ? made([...on.facts, ...pieceFacts(pieceNounOf(obj.noun), obj.a, obj.b, line)]) : on;
    }
    // A NAMED line: «דרך P עובר ישר l3» — M1 decides whether it is an incidence on the existing line or a new one.
    if (obj.k === 'named') return viaCanonical(line, slot, (p) => [`דרך ${p} עובר ישר ${obj.name}`]);
    return viaCanonical(line, slot, (p) => [`${p} על הישר ${obj.src}`]);
  }
  return null;
}

/**
 * #1409 — THE ANGLE REFERENCE AN ASK NAMES: «זווית BMC», «הזווית BMC», «∠BMC», «angle BMC»,
 * «גודל הזווית BMC». Composed from the SAME atoms the given rules read (`ANGLE_NOUN_HE/EN` +
 * `ANGLE_LETTERS`, #1330/#1331), so every spelling the given accepts is askable by construction —
 * the sayable ⇒ askable rule (02c R23). Three letters only: a lone vertex names an angle only
 * relative to a figure (#1407) and stays out of the ask's scope for now. Null for a repeated
 * letter, which names nothing.
 */
const ANGLE_ASK = new RegExp(String.raw`^(?:גודל\s+)?(?:${ANGLE_NOUN_HE}|${ANGLE_NOUN_EN})${ANGLE_LETTERS}$`, 'i');
export function readAngleAsk(text: string): { a: string; v: string; b: string } | null {
  const m = ANGLE_ASK.exec(text.trim());
  if (!m) return null;
  const [, p, v, q] = m;
  if (!v || !q) return null;
  if (p === v || v === q || p === q) return null;
  return { a: p, v, b: q };
}

/**
 * #1154 — A RENAME REQUEST: «שנה שם A ל-G», «שנה את האות A ל-G», «החלף A ב-G», "rename A to G".
 *
 * NOT a fact and not part of `parseLine`: a rename rewrites the session's history (every stored line
 * that names the letter), it states nothing about the figure. The submit path reads it BEFORE the
 * grammar — the shape 2-D (`parseRename`) and 3-D (`parseRename3`) both have; the pattern is copied,
 * never imported (`BOUNDARIES.json`).
 *
 * The SOURCE must look like a point letter, or this is not a rename at all («החלף בין A ל-B» is the
 * swap, #1303, and falls through). The TARGET is returned as typed, whatever it is: «ל-AB» or «ל-5» is
 * still a rename the student asked for, and refusing it BY NAME is the submit path's job — returning
 * null would hand an understood sentence to the LLM seam.
 */
const RENAME_SOURCE = '([A-Za-z](?:[0-9]|[₀-₉])?)';
const RENAME_HE = new RegExp(
  String.raw`^(?:שנה|שנו|החלף|החליפו)\s+(?:את\s+)?(?:ה?שם\s+|ה?אות\s+)?(?:של\s+)?(?:ה?נקודה\s+)?${RENAME_SOURCE}\s+(?:ל|ב)\s*[-־]?\s*(\S+?)\.?$`,
);
const RENAME_EN = new RegExp(
  String.raw`^(?:(?:rename|relabel)\s+(?:the\s+)?(?:point\s+)?|change\s+(?:the\s+)?(?:name|letter)\s+(?:of\s+)?(?:(?:the\s+)?point\s+)?)${RENAME_SOURCE}\s+(?:to|as|into)\s+(\S+?)\.?$`,
  'i',
);
export function parseRenameAnalytic(raw: string): { from: string; to: string } | null {
  const s = trim(raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ''));
  const m = RENAME_HE.exec(s) ?? RENAME_EN.exec(s);
  if (!m) return null;
  return { from: m[1].toUpperCase(), to: m[2] };
}

/**
 * #1303 / #1631 — A SWAP REQUEST: «החלף בין A ל-B», «החליפו בין A ל-B», «החלף בין A לבין B»,
 * "swap A and B", "switch A with B", "swap the letters A and B".
 *
 * «בין» is what marks a swap rather than a rename (2-D's `parse.ts` note): «החלף A ב-G» names ONE
 * letter and its replacement, and stays a rename. Like the rename, a session edit read before the
 * grammar; the second letter is returned as typed, so «בין A ל-AB» is refused BY NAME.
 */
const SWAP_HE = new RegExp(
  String.raw`^(?:החלף|החליפו|החלפ)\s+(?:את\s+)?(?:ה?אותיות\s+|ה?נקודות\s+|ה?שמות\s+)?בין\s+(?:ה?נקודה\s+)?${RENAME_SOURCE}\s+(?:ל|ו)\s*[-־]?\s*(?:בין\s+)?(?:ה?נקודה\s+)?(\S+?)\.?$`,
);
const SWAP_EN = new RegExp(
  String.raw`^(?:swap|switch|exchange|interchange)\s+(?:the\s+)?(?:letters\s+|names\s+|labels\s+|points\s+)?(?:of\s+)?(?:point\s+)?${RENAME_SOURCE}\s+(?:and|with|&)\s+(?:point\s+)?(\S+?)\.?$`,
  'i',
);
export function parseSwapAnalytic(raw: string): { a: string; b: string } | null {
  const s = trim(raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ''));
  const m = SWAP_HE.exec(s) ?? SWAP_EN.exec(s);
  if (!m) return null;
  return { a: m[1].toUpperCase(), b: m[2] };
}
