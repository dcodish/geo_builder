/**
 * The rule list — normalized text → constraints, with a SPAN CLAIM for everything consumed.
 *
 * Ordered, first match wins. Every rule composes from `lexicon` atoms and spells no fragment inline
 * ([ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §4), and every rule returns the range
 * it claimed so the accountant can refuse a parse that quietly dropped half the line — there is no
 * `dropped*` gate here and there never will be (§2).
 *
 * The families implemented are the ones the S3 bridge covered, so this replaces it rather than
 * sitting beside it: F1 declarations · F2 value definitions · F3 modulus relations · F4 argument
 * relations · F5 quadrant givens · F8 `Xⁿ = expr` equations. The rest of docs/27 §10 and §10b grows
 * against this same shape.
 */

import { type Expr, abs, ref } from '../model/expr';
import type { BranchFilter, Constraint } from '../model/constraint';
import type { Claim as Assertion } from '../model/claim';
import {
  type SequenceKind,
  type SequenceStatement,
  type SequenceTerm,
  sequenceConstraints,
} from '../model/sequence';
import { type FigureObject, isOrigin, objectDeclares } from '../model/figure';
import {
  MEASURE_ARITY,
  type MeasureKind,
  type MeasureQuery,
  type MeasureRelation,
} from '../model/measure';
import { rat } from '../value/rational';
import { isComplexName, parseExpr } from './exprParse';
import {
  ACCUSATIVE_KW,
  AND_KW,
  AREA_KW,
  ARG_KW,
  ARITHMETIC_KW,
  CENTER_KW,
  EQUATES_KW,
  FORALL_KW,
  FOR_WHICH_KW,
  HE_THE_VAR,
  MINIMAL_KW,
  NATURAL_KW,
  LENGTH_KW,
  PERIMETER_KW,
  CIRCLE_KW,
  CIRCUMSCRIBED_KW,
  CONJUGATE_KW,
  COPULA_KW,
  POLYGON_KW,
  QUADRILATERAL_KW,
  RADIUS_KW,
  RUN,
  RUN_ATOM,
  RUN_GLUED,
  SEGMENT_KW,
  TRIANGLE_KW,
  WITH_KW,
  FIRST_TERMS_PHRASE,
  GEOMETRIC_KW,
  IMAGINARY_KW,
  NAME,
  OF_A,
  ORDINAL_ANY,
  ORDINALS,
  QUADRANT_KW,
  REAL_KW,
  SEQUENCE_KW,
  TERM_KW,
  TERM_ORDINALS,
  WHERE_KW,
  rx,
} from './lexicon';
import { normalize } from './normalize';
import { type Claim, claimAll, unaccountedText } from './span';

export interface ParsedLine {
  readonly constraints: Constraint[];
  readonly filters: BranchFilter[];
  /**
   * The student's ANSWERS — verified, never allowed to move the figure. Named `assertions` and not
   * `claims` because `claims` on this interface already means the SPAN ranges the rule consumed, and
   * two different `claims` on one object is how a reader ends up checking the wrong one.
   */
  readonly assertions: Assertion[];
  /** the things to DRAW that are not numbers — segments, polygons, circles (F6) */
  readonly objects: FigureObject[];
  /**
   * Stated MEASURES — length, perimeter, area (F7).
   *
   * Kept apart from `constraints` because they are never monomial and so never reach tier 1; and apart
   * from `assertions` because, unlike a claim, a measure MAY drive when the figure has a free degree
   * of freedom for it to consume. One form, and the engine decides (docs/27 §10 P1).
   */
  readonly measures: MeasureRelation[];
  /** «שטח OZ₁Z₂Z₃» — a request to DISPLAY a measure, answered only when the value is knowledge */
  readonly queries: MeasureQuery[];
  /** stated sequences as STATEMENTS — what the series pictures are drawn from (F9) */
  readonly sequences: SequenceStatement[];
  /** names the line brings into existence, whether or not a constraint mentions them */
  readonly declares: string[];
  readonly claims: Claim[];
  /** angle atoms a cartesian literal introduced, with the degrees they stand for */
  readonly atoms: Map<string, number>;
}

export type ParseOutcome =
  | { readonly ok: true; readonly line: ParsedLine; readonly normalized: string }
  /** the grammar recognised nothing — the seam where the LLM fallback escalates */
  | { readonly ok: false; readonly reason: 'not-handled'; readonly normalized: string }
  /** a rule matched but left part of the student's line unclaimed — never committed */
  | {
      readonly ok: false;
      readonly reason: 'unaccounted';
      readonly normalized: string;
      readonly items: string[];
    };

const empty = (): ParsedLine => ({
  constraints: [],
  filters: [],
  assertions: [],
  objects: [],
  measures: [],
  queries: [],
  sequences: [],
  declares: [],
  claims: [],
  atoms: new Map(),
});

type Rule = (s: string) => ParsedLine | null;

/** F1 — a bare name declares a number. `z1` on its own line is a legitimate given. */
const declaration: Rule = (s) => {
  const m = s.match(rx(`^(${NAME})$`));
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!isComplexName(name)) return null; // a bare parameter declares nothing to draw
  return { ...empty(), declares: [name], claims: [claimAll(s)] };
};

/** F5 — «z1 ברביע הראשון» / «z1 in the first quadrant». A filter, never a driver. */
const quadrantGiven: Rule = (s) => {
  // The two languages order the noun and the ordinal differently — «ברביע הראשון» against «in the
  // first quadrant» — so the rule requires BOTH to be present in the tail rather than fixing a word
  // order. Spelling one order would refuse half the register: the ADR-3D-145 class.
  const m = s.match(rx(`^(${NAME})\\s+(.*)$`));
  if (!m) return null;
  const tail = m[2];
  const tailAt = s.length - tail.length;
  const kw = tail.match(rx(QUADRANT_KW));
  if (!kw) return null;
  const name = m[1].toLowerCase();
  const found = ORDINALS.find(([re]) => re.test(tail));
  if (!found) return null;
  const ord = tail.match(found[0]);
  if (!ord) return null;
  // Claim ONLY what was understood: the name, the noun, the ordinal. Claiming the whole line would
  // let «z1 ברביע הראשון ומקבילית» through with the last word silently dropped — which is precisely
  // what the accountant exists to refuse, and it caught this rule doing it.
  return {
    ...empty(),
    declares: [name],
    filters: [{ kind: 'quadrant', name, q: found[1] }],
    claims: [
      { start: 0, end: m[1].length },
      { start: tailAt + (kw.index ?? 0), end: tailAt + (kw.index ?? 0) + kw[0].length },
      { start: tailAt + (ord.index ?? 0), end: tailAt + (ord.index ?? 0) + ord[0].length },
    ],
  };
};

/**
 * F4 — an ARGUMENT relation: `arg z1 - arg z2 = 90`, `arg z1 = 45`.
 *
 * Emitted as an argument-only constraint, because a direction given says nothing about magnitude —
 * writing it as a full equation would invent the half the student did not state (ADR-052).
 */
const argumentRelation: Rule = (s) => {
  const two = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*([+-])\\s*${ARG_KW}\\s*(${NAME})\\s*=\\s*(-?\\d+)$`));
  if (two) {
    const [, a, sign, b, deg] = two;
    if (sign === '-') {
      return {
        ...empty(),
        declares: [a.toLowerCase(), b.toLowerCase()],
        constraints: [
          { kind: 'arg', lhs: ref(a.toLowerCase()), rhs: ref(b.toLowerCase()), deltaTurns: rat(Number(deg), 360), src: s },
        ],
        claims: [claimAll(s)],
      };
    }
    // arg a + arg b = c  ⟺  arg(a) − arg(conj b) = c
    return {
      ...empty(),
      declares: [a.toLowerCase(), b.toLowerCase()],
      constraints: [
        {
          kind: 'arg',
          lhs: ref(a.toLowerCase()),
          rhs: { t: 'conj', e: ref(b.toLowerCase()) },
          deltaTurns: rat(Number(deg), 360),
          src: s,
        },
      ],
      claims: [claimAll(s)],
    };
  }
  const one = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*=\\s*(-?\\d+)$`));
  if (!one) return null;
  const name = one[1].toLowerCase();
  return {
    ...empty(),
    declares: [name],
    constraints: [{ kind: 'arg', lhs: ref(name), rhs: { t: 'num', v: rat(1) }, deltaTurns: rat(Number(one[2]), 360), src: s },
    ],
    claims: [claimAll(s)],
  };
};

/**
 * F2 / F3 / F8 — an EQUATION between two expressions.
 *
 * One sentence form, and the engine decides what it means: both sides wrapped in `|·|` is a magnitude
 * relation (modulus row only), anything else is a complex equation (both rows). That is docs/27 §10's
 * P1 — one form, driveOrCheck decides — so a magnitude given and a magnitude claim are never two
 * phrasings.
 */
const equation: Rule = (s) => {
  const eq = s.indexOf('=');
  if (eq < 0) return null;
  const atoms = new Map<string, number>();
  const lhs = parseExpr(s, 0, eq, atoms);
  const rhs = parseExpr(s, eq + 1, s.length, atoms);
  if (!lhs || !rhs) return null;
  const modulusOnly = lhs.t === 'abs' || rhs.t === 'abs';
  return {
    ...empty(),
    atoms,
    declares: refNames(lhs).concat(refNames(rhs)),
    constraints: [
      modulusOnly
        ? { kind: 'mod', lhs: lhs.t === 'abs' ? lhs : abs(lhs), rhs: rhs.t === 'abs' ? rhs : abs(rhs), src: s }
        : { lhs, rhs, src: s },
    ],
    claims: [claimAll(s)],
  };
};

function refNames(e: Expr): string[] {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    switch (x.t) {
      case 'ref':
        out.push(x.name);
        return;
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
        walk(x.l);
        walk(x.r);
        return;
      case 'pow':
        walk(x.base);
        return;
      case 'conj':
      case 'neg':
      case 'abs':
        walk(x.e);
        return;
      default:
        return;
    }
  };
  walk(e);
  return out;
}

/**
 * F10 — NUMBER-TYPE CLAIMS: «w ממשי», «w מדומה טהור», «z1 ו-z2 צמודים זה לזה».
 *
 * These produce an assertion, never a constraint. A claim that could move the figure would make every
 * answer correct, which is the opposite of the point (`src3d/CLAUDE.md`: *"CLAIMS are the student's
 * answer, never a driver"*).
 */
const conjugatesClaim: Rule = (s) => {
  const m = s.match(rx(`^(${NAME})\\s*${AND_KW}\\s*(${NAME})\\s+.*${CONJUGATE_KW}`));
  if (!m) return null;
  return {
    ...empty(),
    declares: [m[1].toLowerCase(), m[2].toLowerCase()],
    assertions: [{ kind: 'conjugates' as const, a: m[1].toLowerCase(), b: m[2].toLowerCase(), src: s }],
    claims: [claimAll(s)],
  };
};

const typeClaim: Rule = (s) => {
  const m = s.match(rx(`^(${NAME})\\s+${COPULA_KW}(.*)$`));
  if (!m) return null;
  const name = m[1].toLowerCase();
  const tail = m[2];
  // the imaginary test runs FIRST: «מדומה טהור» contains no real-keyword, but an English
  // "pure imaginary" must not be caught by a laxer real rule if one is ever added above it
  if (rx(IMAGINARY_KW).test(tail)) {
    return { ...empty(), declares: [name], assertions: [{ kind: 'imaginary' as const, name, src: s }], claims: [claimAll(s)] };
  }
  if (rx(REAL_KW).test(tail)) {
    return { ...empty(), declares: [name], assertions: [{ kind: 'real' as const, name, src: s }], claims: [claimAll(s)] };
  }
  return null;
};

// --- F6: objects ------------------------------------------------------------

/** The point names inside a run, in order. `z1*z2` and `z1z2` split identically. */
const splitRun = (text: string): string[] =>
  (text.toLowerCase().match(rx(RUN_ATOM, 'giu')) ?? []).map((s) => s);

/** The shape nouns, with the arity each one promises. `null` = any arity from three up. */
const SHAPES: readonly (readonly [string, number | null])[] = [
  [SEGMENT_KW, 2],
  [TRIANGLE_KW, 3],
  [QUADRILATERAL_KW, 4],
  [POLYGON_KW, null],
];

const objectLine = (o: FigureObject, s: string): ParsedLine => ({
  ...empty(),
  objects: [o],
  declares: objectDeclares(o),
  claims: [claimAll(s)],
});

/**
 * F6 — «הקטע Z₁Z₂», «המשולש OZ₁Z₂», «המרובע OZ₁Z₂Z₃», «המצולע …».
 *
 * The stated arity is ENFORCED: «המשולש OZ₁Z₂Z₃» names four points and is refused rather than drawn
 * as something the student did not say. A noun that promises three vertices and receives four is a
 * mis-typed line, and drawing it anyway would be the figure quietly disagreeing with its own label.
 */
const namedShape: Rule = (s) => {
  for (const [kw, arity] of SHAPES) {
    const m = s.match(rx(`^${kw}\\s+(${RUN})$`));
    if (!m) continue;
    const points = splitRun(m[1]);
    if (arity !== null && points.length !== arity) return null;
    if (points.length < 2) return null;
    return objectLine(
      points.length === 2
        ? { kind: 'segment', points, src: s }
        : { kind: 'polygon', points, src: s },
      s,
    );
  }
  return null;
};

/**
 * F6 — a BARE run: «OZ₁Z₂Z₃» on its own line is the figure.
 *
 * No separator is tolerated here, and that is the operator's drawing convention rather than an
 * oversight: `z1*z2` is the PRODUCT of two numbers (F2) and must keep meaning that, while a glued
 * `z1z2` cannot be an identifier — the name grammar puts digits last — so it is unambiguously a run.
 * With a keyword in front the ambiguity is gone and the separator is allowed again.
 */
const bareRun: Rule = (s) => {
  const m = s.match(rx(`^(${RUN_GLUED})$`));
  if (!m) return null;
  const points = splitRun(m[1]);
  if (points.length < 2) return null;
  return objectLine(
    points.length === 2 ? { kind: 'segment', points, src: s } : { kind: 'polygon', points, src: s },
    s,
  );
};

/**
 * F6 — «המעגל החוסם את המשולש Z₁Z₂Z₃» / «the circumscribed circle of triangle Z₁Z₂Z₃».
 *
 * Both noun/adjective orders are spelled. Hebrew puts the adjective after the noun («המעגל החוסם») and
 * English before it («circumscribed circle») — the same asymmetry that «ברביע הראשון» / «in the first
 * quadrant» has, and the third time in this grammar that assuming one order would have refused half
 * the register.
 */
const circumscribedCircle: Rule = (s) => {
  const shapeNoun = `(?:${SHAPES.map(([kw]) => kw).join('|')})`;
  const m = s.match(
    rx(
      `^${OF_A}(?:${CIRCLE_KW}\\s+${CIRCUMSCRIBED_KW}|${CIRCUMSCRIBED_KW}\\s+${CIRCLE_KW})\\s+` +
        `${ACCUSATIVE_KW}${OF_A}(?:${shapeNoun}\\s+)?(${RUN})$`,
    ),
  );
  if (!m) return null;
  const points = splitRun(m[1]);
  // Three points determine a circle. More is a CYCLIC claim about the extra vertices — a different
  // family (F11), and asserting it here would let a false statement draw a circle that fits three of
  // the four points and silently ignore the fourth.
  if (points.length !== 3) return null;
  return objectLine({ kind: 'circumcircle', points, src: s }, s);
};

/**
 * F6 — «המעגל שמרכזו O ורדיוסו r» / «the circle with centre O and radius 2».
 *
 * The radius is parsed as an EXPRESSION over the span it occupies, so `r`, `2` and `2r` are one form.
 * Both English spellings of «centre» are in the atom: textbooks and students split on it, and refusing
 * one is the same shape of defect as refusing one Hebrew word order.
 */
const circleByCenterRadius: Rule = (s) => {
  const m = s.match(
    rx(`^${OF_A}${CIRCLE_KW}\\s+${WITH_KW}${CENTER_KW}\\s+(${RUN_ATOM})\\s+${AND_KW}?\\s*${RADIUS_KW}\\s+(.+)$`),
  );
  if (!m) return null;
  // the radius text is anchored to the end of the line, so its span starts exactly that far back
  const radius = parseExpr(s, s.length - m[2].length, s.length);
  if (!radius) return null;
  return objectLine({ kind: 'circle', center: m[1].toLowerCase(), radius, src: s }, s);
};

// --- F7: measures -----------------------------------------------------------

const MEASURE_NOUNS: readonly (readonly [string, MeasureKind])[] = [
  [LENGTH_KW, 'length'],
  [PERIMETER_KW, 'perimeter'],
  [AREA_KW, 'area'],
];

/**
 * F7 — «אורך Z₁Z₂ = 15r», «שטח OZ₁Z₂Z₃ הוא 150r²», «היקף המרובע OZ₁Z₂Z₃ = 60r».
 *
 * ONE form, and the engine decides whether it drives or checks (docs/27 §10 P1). Nothing here asks
 * which the student meant: the relation becomes a residual, and if the figure still has a free degree
 * of freedom the numeric tier drives it to zero, while a determined figure simply evaluates it. That
 * is why there is no second sentence shape for "verify that the area is 150r²".
 */
const measureRelation: Rule = (s) => {
  const shapeNoun = `(?:${SHAPES.map(([kw]) => kw).join('|')})`;
  for (const [kw, kind] of MEASURE_NOUNS) {
    const m = s.match(
      rx(`^${kw}\\s+${ACCUSATIVE_KW}${OF_A}(?:${shapeNoun}\\s+)?(${RUN})\\s*${EQUATES_KW}\\s*(.+)$`),
    );
    if (!m) continue;
    const points = splitRun(m[1]);
    const arity = MEASURE_ARITY[kind];
    if (points.length < arity.min) return null;
    if (arity.exact !== undefined && points.length !== arity.exact) return null;
    const rhs = parseExpr(s, s.length - m[2].length, s.length);
    if (!rhs) return null;
    return {
      ...empty(),
      measures: [{ kind, points, rhs, src: s }],
      declares: points.filter((n) => !isOrigin(n)),
      claims: [claimAll(s)],
    };
  }
  return null;
};

/**
 * F7 — «שטח OZ₁Z₂Z₃», with no value: a request to DISPLAY the measure.
 *
 * Ordered after {@link measureRelation}, so a sentence that states a value is read as a statement and
 * only a sentence that states none is read as a question.
 */
const measureQuery: Rule = (s) => {
  const shapeNoun = `(?:${SHAPES.map(([kw]) => kw).join('|')})`;
  for (const [kw, kind] of MEASURE_NOUNS) {
    const m = s.match(rx(`^${kw}\\s+${ACCUSATIVE_KW}${OF_A}(?:${shapeNoun}\\s+)?(${RUN})$`));
    if (!m) continue;
    const points = splitRun(m[1]);
    const arity = MEASURE_ARITY[kind];
    if (points.length < arity.min) return null;
    if (arity.exact !== undefined && points.length !== arity.exact) return null;
    return {
      ...empty(),
      queries: [{ kind, points, src: s }],
      declares: points.filter((n) => !isOrigin(n)),
      claims: [claimAll(s)],
    };
  }
  return null;
};

// --- F9: sequences ----------------------------------------------------------

/** The type word, and which tier will end up reading the relations it implies. */
const SEQ_PHRASE = `(?:${SEQUENCE_KW}\\s+(?:${GEOMETRIC_KW}|${ARITHMETIC_KW})|(?:${GEOMETRIC_KW}|${ARITHMETIC_KW})\\s+${SEQUENCE_KW})`;
const NAME_LIST = `(?:${NAME}(?:\\s*,\\s*${NAME})+)`;

const kindOf = (s: string): SequenceKind => (rx(ARITHMETIC_KW).test(s) ? 'arithmetic' : 'geometric');

const ordinalOf = (s: string): number | null => TERM_ORDINALS.find(([re]) => re.test(s))?.[1] ?? null;

const sequenceLine = (
  kind: SequenceKind,
  terms: SequenceTerm[],
  s: string,
): ParsedLine | null => {
  const constraints = sequenceConstraints(kind, terms, s);
  if (!constraints) return null;
  return {
    ...empty(),
    constraints,
    // the STATEMENT travels beside its constraints: the relations say what is true of these numbers,
    // and the statement is what the scene draws as a spiral and a chain of partial sums
    sequences: [{ kind, terms, src: s }],
    declares: terms.map((t) => t.name),
    claims: [claimAll(s)],
  };
};

/**
 * F9 — «z1, z2, z4 סדרה הנדסית», in either word order.
 *
 * Both orders are spelled because RTL typing makes the order genuinely ambiguous, and the sibling
 * trees paid for assuming one (#598, ADR-3D-145). Listed names are CONSECUTIVE terms.
 */
const sequenceList: Rule = (s) => {
  const m =
    s.match(rx(`^(${NAME_LIST})\\s+${COPULA_KW}${OF_A}${SEQ_PHRASE}$`)) ??
    s.match(rx(`^${SEQ_PHRASE}\\s*:?\\s*(${NAME_LIST})$`));
  if (!m) return null;
  const list = m[1].split(',').map((n) => n.trim().toLowerCase());
  if (!list.every(isComplexName)) return null; // a real parameter is not a term of a complex sequence
  return sequenceLine(
    kindOf(s),
    list.map((name, i) => ({ name, position: i + 1 })),
    s,
  );
};

/**
 * F9 — the corpus witness, verbatim from §2b ג:
 * «Z₁ ו-Z₂ הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא Z₄».
 *
 * The ordinal is READ rather than assumed, so «האיבר החמישי» states position 5 and the relation
 * between positions 1, 2 and 5 is emitted — which is what makes term-position givens («בהתאמה») the
 * general case here instead of a second rule.
 */
const sequenceFirstTerms: Rule = (s) => {
  // The TARGET term is the only ordinal the rule reads, and the two languages order it the other way
  // round — «האיבר השלישי» against «the third term» — so both orders are spelled and whichever group
  // matched carries the position.
  const target = `(?:${TERM_KW}\\s+(${ORDINAL_ANY})|(${ORDINAL_ANY})\\s+${TERM_KW})`;
  const m = s.match(
    rx(
      `^(${NAME})\\s*${AND_KW}\\s*(${NAME})\\s+${COPULA_KW}${OF_A}${FIRST_TERMS_PHRASE}\\s+` +
        `${OF_A}${SEQ_PHRASE}\\s+${WHERE_KW}\\s+${OF_A}${target}\\s+${COPULA_KW}(${NAME})$`,
    ),
  );
  if (!m) return null;
  const at = ordinalOf(m[3] ?? m[4] ?? '');
  if (at === null) return null;
  const [a, b, c] = [m[1], m[2], m[5]].map((n) => n.toLowerCase());
  if (![a, b, c].every(isComplexName)) return null;
  return sequenceLine(
    kindOf(s),
    [
      { name: a, position: 1 },
      { name: b, position: 2 },
      { name: c, position: at },
    ],
    s,
  );
};


// --- F12: quantified claims over the powers of a number ---------------------

/**
 * The exponent of a quantified power: `n`, `4n`, `4n+2` — the corpus's shape, and nothing wider.
 *
 * Returned as `(k, c)` for `k·n + c`, so the verifier reads a congruence rather than a syntax tree.
 * A bare `n` is `k = 1, c = 0`; a plain integer is not accepted here at all, because «for every n» over
 * an exponent that does not mention n is not a quantified claim, it is F10 with extra words.
 */
const exponentKN = (text: string): { k: number; c: number } | null => {
  const m = text.match(rx(`^\\(?\\s*(\\d*)\\s*n\\s*(?:([+-])\\s*(\\d+))?\\s*\\)?$`));
  if (!m) return null;
  const k = m[1] === '' ? 1 : Number(m[1]);
  const c = m[3] === undefined ? 0 : Number(m[3]) * (m[2] === '-' ? -1 : 1);
  return Number.isFinite(k) && k !== 0 ? { k, c } : null;
};

/** Which of the two sheet-decidable properties the tail states, if either. */
const propertyOf = (tail: string): 'real' | 'imaginary' | null =>
  rx(IMAGINARY_KW).test(tail) ? 'imaginary' : rx(REAL_KW).test(tail) ? 'real' : null;

/**
 * F12 — «לכל n טבעי, w^(4n) ממשי» / «for every natural n, w^(4n) is real», in either word order.
 *
 * Hebrew puts the quantifier first and English can put it last («w^(4n) is real for every natural n»),
 * so both orders are spelled — the third family in a row to need that, which is why the rule is stated
 * as a rule rather than discovered again (ADR-CX-012).
 */
const forallPower: Rule = (s) => {
  // «לכל n טבעי» puts the adjective AFTER the variable; «for every natural n» puts it before. Same
  // asymmetry as «ברביע הראשון» / «in the first quadrant» and «שני האיברים הראשונים» / «the first two
  // terms» — every noun-plus-modifier phrase in this grammar needs both orders spelled.
  const quantifier = `${FORALL_KW}\\s+(?:${NATURAL_KW}\\s+)?n(?:\\s+${NATURAL_KW})?`;
  const power = `(${NAME})\\s*\\^\\s*([^\\s]+?)`;
  const m =
    s.match(rx(`^${quantifier}\\s*,?\\s*${power}\\s+${COPULA_KW}(.+)$`)) ??
    s.match(rx(`^${power}\\s+${COPULA_KW}(.+?)\\s+${quantifier}$`));
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!isComplexName(name)) return null;
  const exp = exponentKN(m[2]);
  const prop = propertyOf(m[3]);
  if (!exp || !prop) return null;
  return {
    ...empty(),
    declares: [name],
    assertions: [{ kind: 'forall-power' as const, name, k: exp.k, c: exp.c, prop, src: s }],
    claims: [claimAll(s)],
  };
};

/**
 * F12 — «ה-n המינימלי שעבורו w^n מדומה טהור הוא 5» / «the minimal n for which w^n is pure imaginary is 5».
 *
 * The student states their answer and the engine solves the same congruence for its least solution.
 * There is no question form here on purpose: «find the minimal n» is what the exam asks the STUDENT,
 * and a tool that printed it unprompted would be answering the question rather than checking it.
 */
const minimalPower: Rule = (s) => {
  const m = s.match(
    rx(
      // «ה-n המינימלי» against «the minimal n» — the same both-orders rule as every other modifier here
      `^${OF_A}(?:${HE_THE_VAR}n\\s*${MINIMAL_KW}|${MINIMAL_KW}\\s+n)\\s+${FOR_WHICH_KW}\\s+(${NAME})\\s*\\^\\s*n\\s+` +
        `${COPULA_KW}(.+?)\\s+${EQUATES_KW}\\s*(\\d+)$`,
    ),
  );
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!isComplexName(name)) return null;
  const prop = propertyOf(m[2]);
  if (!prop) return null;
  return {
    ...empty(),
    declares: [name],
    assertions: [
      { kind: 'minimal-power' as const, name, prop, stated: Number(m[3]), src: s },
    ],
    claims: [claimAll(s)],
  };
};

/** First match wins. Order is specific-to-general: a relation sentence before the bare equation. */
export const RULES: readonly { readonly name: string; readonly rule: Rule }[] = [
  { name: 'declaration', rule: declaration },
  { name: 'quadrant', rule: quadrantGiven },
  { name: 'conjugates-claim', rule: conjugatesClaim },
  // the QUANTIFIED claims outrank the plain type claim: «לכל n טבעי w^(4n) ממשי» ends in the same
  // words as «w ממשי», and the general rule would read the quantifier as part of a name
  { name: 'forall-power', rule: forallPower },
  { name: 'minimal-power', rule: minimalPower },
  { name: 'type-claim', rule: typeClaim },
  // the long sequence sentence first: its tail «האיבר השלישי הוא Z4» would otherwise be read as a
  // type-claim about a number called «האיבר»
  { name: 'sequence-first-terms', rule: sequenceFirstTerms },
  { name: 'sequence-list', rule: sequenceList },
  // the circle sentences before the plain shape nouns: «המעגל החוסם את המשולש …» contains a shape
  // noun, and the shape rule would otherwise claim the tail and drop the circumscription
  // a measure sentence carries a shape noun too, so it must outrank the shape rules
  { name: 'measure-relation', rule: measureRelation },
  // a measure with NO value is a question, so it may only be tried once the statement form has failed
  { name: 'measure-query', rule: measureQuery },
  { name: 'circumscribed-circle', rule: circumscribedCircle },
  { name: 'circle-centre-radius', rule: circleByCenterRadius },
  { name: 'named-shape', rule: namedShape },
  { name: 'argument-relation', rule: argumentRelation },
  { name: 'equation', rule: equation },
  // last: a bare glued run is a figure only when nothing else read the line as maths
  { name: 'bare-run', rule: bareRun },
];

/**
 * Parse one line.
 *
 * A rule that matches but leaves content unclaimed does NOT commit — the line is refused with the
 * student's own words, which is the whole point of the accountant. `not-handled` is reserved for
 * "no rule recognised this", and is the only outcome that escalates.
 */
export function parseLineV2(raw: string): ParseOutcome {
  const normalized = normalize(raw);
  if (!normalized) return { ok: false, reason: 'not-handled', normalized };
  for (const { rule } of RULES) {
    const line = rule(normalized);
    if (!line) continue;
    const items = unaccountedText(normalized, line.claims);
    if (items.length) return { ok: false, reason: 'unaccounted', normalized, items };
    return { ok: true, line, normalized };
  }
  return { ok: false, reason: 'not-handled', normalized };
}
