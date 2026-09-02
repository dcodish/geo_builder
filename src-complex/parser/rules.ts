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
import { type RootsEquation, asRootsEquation } from '../model/solutionSet';
import type { Selection } from '../model/constraint';
import {
  MEASURE_ARITY,
  type MeasureKind,
  type MeasureQuery,
  type MeasureRelation,
  type RatioQuery,
  type ExprQuery,
} from '../model/measure';
import { rat } from '../value/rational';
import { frac as ratFrac } from '../value/rational';
import { normalize as angNormalize } from '../value/angle';

/**
 * #719 — is this right-hand side a value that is NOT a positive real?
 *
 * `-5` reaches the rules as an exact `val` whose argument is half a turn (the literal was linearised
 * on the way in), never as a bare negative `num`, which is why the shape is tested on the ARGUMENT
 * rather than on a sign. An argument that is a known non-zero constant means the value points
 * somewhere other than the positive real axis — so no magnitude can equal it. A value whose argument
 * carries symbols is not decidable here and is left alone.
 */
const isNotPositiveReal = (e: Expr): boolean => {
  if (e.t !== 'val' || e.v.kind !== 'exact') return false;
  const a = angNormalize(e.v.arg);
  return a.atoms.size === 0 && ratFrac(a.turns).n !== 0n;
};
import { canonName, isComplexName, isPointLabel, parseExpr } from './exprParse';
import {
  ACCUSATIVE_KW,
  AND_KW,
  AREA_KW,
  ARG_KW,
  ARITHMETIC_KW,
  CENTER_KW,
  BETWEEN_KW,
  EQUATES_KW,
  RATIO_KW,
  TO_KW,
  FORALL_KW,
  FOR_WHICH_KW,
  HE_THE_VAR,
  MINIMAL_KW,
  NATURAL_KW,
  NUM,
  LENGTH_KW,
  PERIMETER_KW,
  CIRCLE_KW,
  CIRCUMSCRIBED_KW,
  COMPLEX_KW,
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
  QUADRANT_KW, SOLUTION_KW,
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
  /** «היחס בין … ל…» — a ratio of two measures, knowable where neither half is (G8) */
  readonly ratios: RatioQuery[];
  /** a bare expression: «what is this value?» — answered only when it is knowledge */
  readonly exprQueries: ExprQuery[];
  /** stated sequences as STATEMENTS — what the series pictures are drawn from (F9) */
  readonly sequences: SequenceStatement[];
  /**
   * `X^n = …` seen as a SHAPE, not yet as a constraint (#680).
   *
   * The reading depends on what earlier lines mentioned — ADR-CX-005's three modes — and this parser is
   * stateless per line, so it reports the shape and the fold decides. A line that produces a `roots`
   * entry deliberately produces NO constraint for it: emitting the narrow reading as a default is how
   * the enumeration went missing on this path in the first place.
   */
  readonly roots: RootsEquation[];
  /**
   * #694 — «z₀ הוא הפתרון ברביע הרביעי»: bind a NEW name to the member of an enumerated solution
   * set that satisfies a filter. Reported as a shape; the fold resolves it, because WHICH member
   * satisfies the filter is only knowable once the directions are solved.
   */
  readonly selections: Selection[];
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
  ratios: [],
  exprQueries: [],
  sequences: [],
  roots: [],
  selections: [],
  declares: [],
  claims: [],
  atoms: new Map(),
});

type Rule = (s: string) => ParsedLine | null;

/**
 * F1 — a name declares a number: `z1` on its own line, or «z1 מספר מרוכב» / «z1 is a complex number».
 *
 * The bare form is the ADR-CX-004 convention (z- and w-names need no declaration); the spelled-out form
 * is how the exam itself opens («המספרים המרוכבים Z₁ ו-Z₂…»), and it is the one form in which a name
 * OUTSIDE that convention can be declared complex at all — without it, a student who writes `a` and
 * says it is a complex number is told the line is not understood.
 */
const declaration: Rule = (s) => {
  const bare = s.match(rx(`^(${NAME})$`));
  if (bare) {
    const name = canonName(bare[1]);
    if (!isComplexName(name)) return null; // a bare parameter declares nothing to draw
    return { ...empty(), declares: [name], claims: [claimAll(s)] };
  }
  // «z1 ו-z2 מספרים מרוכבים» — any number of names, either language, the copula optional in Hebrew
  const spelled = s.match(
    rx(`^(${NAME}(?:\\s*(?:,|${AND_KW})\\s*${NAME})*)\\s+${COPULA_KW}${OF_A}${COMPLEX_KW}$`),
  );
  if (!spelled) return null;
  const names = (spelled[1].match(rx(NAME, 'giu')) ?? []).map((n) => canonName(n));
  if (!names.length) return null;
  return { ...empty(), declares: names, claims: [claimAll(s)] };
};

/**
 * F5b (#694) — «z₀ הוא הפתרון ברביע הרביעי» / «z0 is the solution in the fourth quadrant».
 *
 * The exam's own sentence, and the one with no grammar at all before this: it measured as
 * `line-unaccounted: «הפתרון»`. It is a SELECTION, not a filter on the named number — see
 * {@link Selection}. Distinguished from F5 by the solution NOUN, which is what makes «z₀ הוא
 * הפתרון ברביע הרביעי» mean "of those solutions, the one in that quadrant" rather than "z₀ happens
 * to lie there".
 *
 * The filter is built by the SAME ordinal vocabulary F5 uses, so the two can never disagree about
 * what «הרביעי» means; the shared part is deliberately the predicate, not the sentence.
 */
const solutionSelection: Rule = (s) => {
  // The solution noun, definite: «הפתרון» / «the solution». Indefinite «פתרון» is not this
  // sentence — it does not point at a set that already exists.
  if (!rx(SOLUTION_KW).test(s)) return null;
  const nameFirst = s.match(rx(`^(${NAME})\\s+(.*)$`));
  const nameLast = s.match(rx(`^(.*?)\\s+(${NAME})$`));
  const placement = nameFirst ? { raw: nameFirst[1], rest: nameFirst[2] } : nameLast ? { raw: nameLast[2], rest: nameLast[1] } : null;
  if (!placement) return null;
  const { rest } = placement;
  if (!rx(QUADRANT_KW).test(rest)) return null;
  const found = ORDINALS.find(([re]) => re.test(rest));
  if (!found) return null;
  const name = canonName(placement.raw);
  return {
    ...empty(),
    declares: [name],
    selections: [{ name, filter: { kind: 'quadrant', name, q: found[1], src: s }, src: s }],
    claims: [claimAll(s)],
  };
};

/** F5 — «z1 ברביע הראשון» / «z1 in the first quadrant». A filter, never a driver. */
const quadrantGiven: Rule = (s) => {
  // The two languages order the noun and the ordinal differently — «ברביע הראשון» against «in the
  // first quadrant» — so the rule requires BOTH to be present in the tail rather than fixing a word
  // order. Spelling one order would refuse half the register: the ADR-3D-145 class.
  //
  // The NAME's own order is free for the same reason, and RTL typing makes it genuinely so: «ברביע
  // הראשון z2» is what the operator types (#599, and #598 for the sequence twin). Both placements are
  // tried rather than searched for generally, because the region searched for the ordinal must exclude
  // the name — otherwise «z4 quadrant 4» finds its ordinal inside `z4`.
  const nameFirst = s.match(rx(`^(${NAME})\\s+(.*)$`));
  const nameLast = s.match(rx(`^(.*?)\\s+(${NAME})$`));
  const placement = nameFirst
    ? { raw: nameFirst[1], nameAt: 0, rest: nameFirst[2], restAt: s.length - nameFirst[2].length }
    : nameLast
      ? { raw: nameLast[2], nameAt: s.length - nameLast[2].length, rest: nameLast[1], restAt: 0 }
      : null;
  if (!placement) return null;
  const { rest } = placement;
  const restAt = placement.restAt;
  const kw = rest.match(rx(QUADRANT_KW));
  if (!kw) return null;
  const name = canonName(placement.raw);
  const found = ORDINALS.find(([re]) => re.test(rest));
  if (!found) return null;
  const ord = rest.match(found[0]);
  if (!ord) return null;
  // Claim ONLY what was understood: the name, the noun, the ordinal. Claiming the whole line would
  // let «z1 ברביע הראשון ומקבילית» through with the last word silently dropped — which is precisely
  // what the accountant exists to refuse, and it caught this rule doing it.
  return {
    ...empty(),
    declares: [name],
    filters: [{ kind: 'quadrant', name, q: found[1], src: s }],
    claims: [
      { start: placement.nameAt, end: placement.nameAt + placement.raw.length },
      { start: restAt + (kw.index ?? 0), end: restAt + (kw.index ?? 0) + kw[0].length },
      { start: restAt + (ord.index ?? 0), end: restAt + (ord.index ?? 0) + ord[0].length },
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
        declares: [canonName(a), canonName(b)],
        constraints: [
          { kind: 'arg', lhs: ref(canonName(a)), rhs: ref(canonName(b)), deltaTurns: rat(Number(deg), 360), src: s },
        ],
        claims: [claimAll(s)],
      };
    }
    // arg a + arg b = c  ⟺  arg(a) − arg(conj b) = c
    return {
      ...empty(),
      declares: [canonName(a), canonName(b)],
      constraints: [
        {
          kind: 'arg',
          lhs: ref(canonName(a)),
          rhs: { t: 'conj', e: ref(canonName(b)) },
          deltaTurns: rat(Number(deg), 360),
          src: s,
        },
      ],
      claims: [claimAll(s)],
    };
  }
  const one = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*=\\s*(-?\\d+)$`));
  if (!one) return null;
  const name = canonName(one[1]);
  return {
    ...empty(),
    declares: [name],
    constraints: [{ kind: 'arg', lhs: ref(name), rhs: { t: 'num', v: rat(1) }, deltaTurns: rat(Number(one[2]), 360), src: s },
    ],
    claims: [claimAll(s)],
  };
};

/**
 * F2's generic polar form — «z1 = 2cis(θ)»: a stated MAGNITUDE at a free direction.
 *
 * `cis` with a symbolic angle is not a literal (the value layer can only carry a numeric direction
 * exactly), and the expression grammar rightly refuses to invent one. But the sentence still states
 * something — the modulus — and refusing the whole line would drop a given the student made, which is
 * the one thing this parser may never do. So it lowers exactly as the prototype's own rule did: the
 * name is declared, `|z1| = 2` is emitted, and the direction stays a free degree of freedom that
 * "another configuration" resamples.
 */
const genericPolar: Rule = (s) => {
  // Either half may be symbolic, so both are read as "number or name" and the SHAPE decides the
  // lowering. Writing only the numeric-modulus case meant «z1 = r cis θ» — the spelling the exam
  // prints — fell through to the expression grammar, which lexed `rcis` as one name and read the line
  // as a product of two invented parameters. The modulus group backtracks over `rcis`, which is what
  // lets the unspaced and spaced spellings be one rule rather than two (#691).
  const HALF = `(?:${NUM}|${NAME})`;
  const m = s.match(rx(`^(${NAME})\\s*=\\s*(${HALF})?\\s*cis\\s*\\(?\\s*(${HALF})\\s*\\)?$`));
  if (!m) return null;
  const name = canonName(m[1]);
  if (!isComplexName(name)) return null;
  const angle = canonName(m[3]);
  if (isComplexName(angle)) return null; // `z1 = 2cis z2` is not an angle, it is a product
  const isNumeric = (t: string): boolean => rx(`^${NUM}$`).test(t);
  const modIsNum = m[2] !== undefined && isNumeric(m[2]);
  const angIsNum = isNumeric(angle);
  // both numeric is a LITERAL and belongs to the expression grammar, which reads it exactly
  if (modIsNum && angIsNum) return null;
  // a magnitude is not negative; `-2 cis θ` is not this sentence, so it goes to the equation rule
  if (modIsNum && Number(m[2]) < 0) return null;
  if (m[2] !== undefined && !modIsNum && isComplexName(canonName(m[2]))) return null;

  /**
   * What the sentence actually STATES — never more (ADR-052: an unstated magnitude is a free DOF).
   *
   * A numeric modulus pins the magnitude and leaves the direction free; a numeric angle pins the
   * direction and leaves the magnitude free; two symbolic halves pin nothing and the line is a plain
   * declaration. An ABSENT modulus is `cis θ`, which is the unit circle and so states 1.
   */
  const constraints: Constraint[] = [];
  if (m[2] === undefined || modIsNum) {
    const modulus = m[2] === undefined ? rat(1) : rat(Math.round(Number(m[2]) * 1000), 1000);
    constraints.push({ kind: 'mod', lhs: abs(ref(name)), rhs: { t: 'num', v: modulus }, src: s });
  }
  if (angIsNum) {
    constraints.push({
      kind: 'arg',
      lhs: ref(name),
      rhs: { t: 'num', v: rat(1) },
      deltaTurns: rat(Math.round(Number(angle)), 360),
      src: s,
    });
  }
  return { ...empty(), declares: [name], constraints, claims: [claimAll(s)] };
};

/**
 * F4's other half — an argument INEQUALITY: «arg z2 < 45», «90 < arg z1 < 180».
 *
 * docs/27 §10 F4 is explicit that these are **branch selectors**, not drivers: a whole region satisfies
 * `arg z₂ < 45°`, so it prunes the configurations the equations already produced and bounds the sampling
 * of a direction they left free. The engine has carried `BranchFilter.range` since S2 and the sampler
 * has honoured its window since S3 — only the sentence was missing, which is why the §2b capstone's own
 * branch selector («arg Z₂ < 45°», the line that prunes θ ≈ 63.4° and leaves arctan ½) could not be
 * typed at all.
 *
 * A one-sided form gives one bound; a chained one gives both. Every comparator the corpus writes is
 * accepted, and `≤` differs from `<` by nothing the figure can show — the filter is over an open region
 * either way, which is the honest reading of a strict inequality on a continuum.
 */
const CMP = String.raw`(?:<=|>=|≤|≥|<|>)`;
const isBelow = (op: string): boolean => op === '<' || op === '<=' || op === '≤';

const argumentInequality: Rule = (s) => {
  // «90 < arg z1 < 180» — a two-sided window, in the exam's own order
  const both = s.match(rx(`^(-?\\d+)\\s*(${CMP})\\s*${ARG_KW}\\s*(${NAME})\\s*(${CMP})\\s*(-?\\d+)$`));
  if (both) {
    const [, lo, opLo, name, opHi, hi] = both;
    // the left comparator points INTO the window, so «90 < arg z» is a lower bound and «90 > arg z» an upper one
    const low = isBelow(opLo) ? Number(lo) : Number(hi);
    const high = isBelow(opLo) ? Number(hi) : Number(lo);
    if (!isBelow(opLo) !== !isBelow(opHi)) return null; // «90 < arg z > 180» is not a window
    return {
      ...empty(),
      declares: [canonName(name)],
      filters: [{ kind: 'range', name: canonName(name), minDeg: rat(low, 1), maxDeg: rat(high, 1), src: s }],
      claims: [claimAll(s)],
    };
  }
  const one = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*(${CMP})\\s*(-?\\d+)$`));
  if (!one) return null;
  const [, raw, op, deg] = one;
  const name = canonName(raw);
  return {
    ...empty(),
    declares: [name],
    filters: [
      isBelow(op)
        ? { kind: 'range', name, maxDeg: rat(Number(deg), 1), src: s }
        : { kind: 'range', name, minDeg: rat(Number(deg), 1), src: s },
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
  /**
   * A `|·|` on one side asks a THREE-way question, and reading it as two is how givens went missing.
   *
   * The side opposite the bars decides which sentence this is:
   *
   * - a bare NAME — «w1 = |z1|» — is a DEFINITION. It states the number completely: w1 is the real
   *   |z1|, argument included. Lowering it modulus-only kept `|w1| = 5` and left the direction free to
   *   be sampled, so `w1 = |z1|` over `z1 = 3+4i` drew 1.91 + 4.62i instead of 5. Half a given, dropped
   *   in silence. `abs` is already exact in the value layer — real and non-negative — so the ordinary
   *   equation carries both rows and needs nothing added.
   * - a real-valued EXPRESSION — «|z1| = 9r», «|z1| = 2|z2|» — is a magnitude relation, and must stay
   *   modulus-only or it would invent a direction the student never stated (ADR-052).
   * - a complex expression — «|z1| = 9w» — is a TYPE ERROR. Wrapping it in `abs` re-read it as
   *   «|z1| = 9|w|», invented a complex `w` and drew a phantom for it. The student is told instead.
   */
  const other = lhs.t === 'abs' ? rhs : lhs;
  const barred = lhs.t === 'abs' || rhs.t === 'abs';
  if (barred && other.t !== 'ref' && hasBareComplexRef(other)) return null;
  const modulusOnly = barred && other.t !== 'ref';
  // `X^n = rhs` on a bare letter: report the SHAPE and let the fold read it, because which of
  // ADR-CX-005's three modes it is depends on what earlier lines mentioned (#680, model/solutionSet.ts).
  const roots = modulusOnly ? null : asRootsEquation(lhs, rhs, s);
  if (roots) {
    return { ...empty(), atoms, roots: [roots], declares: refNames(rhs), claims: [claimAll(s)] };
  }
  return {
    ...empty(),
    atoms,
    declares: refNames(lhs).concat(refNames(rhs)),
    constraints: [
      modulusOnly
        ? {
            kind: 'mod',
            lhs: lhs.t === 'abs' ? lhs : abs(lhs),
            /**
             * #719 (ADR-CX-035) — a NEGATIVE literal passes through UNWRAPPED, so the magnitude lane
             * can refuse it.
             *
             * `abs(rhs)` is right for a name or a positive number — a magnitude equation compares
             * magnitudes — but on «|z1| = -5» it silently rewrote the student's statement into
             * «|z1| = |-5|», i.e. «|z1| = 5», and nothing downstream could ever know a sign had been
             * stated. That is the honesty invariant exactly: a stated magnitude must parse to a
             * constraint, escalate, or error, but never vanish. Left unwrapped, tier1 sees an RHS
             * whose argument is a known ½ turn and refuses the given by itself.
             */
            rhs: rhs.t === 'abs' || isNotPositiveReal(rhs) ? rhs : abs(rhs),
            src: s,
          }
        : { lhs, rhs, src: s },
    ],
    claims: [claimAll(s)],
  };
};

/**
 * Does a complex name appear OUTSIDE every `|·|`? — the type question a magnitude relation must ask.
 *
 * Inside the bars a complex number is a magnitude and belongs there (`|z1| = 2|z2|`); outside them it
 * is a direction as well as a length, and equating it to a magnitude states nothing coherent.
 */
function hasBareComplexRef(e: Expr): boolean {
  switch (e.t) {
    case 'abs':
      return false; // everything under the bars is a magnitude
    case 'ref':
      return true;
    case 'num':
    case 'val':
    case 'i':
    case 'param':
      return false;
    case 'conj':
    case 'neg':
      return hasBareComplexRef(e.e);
    case 'pow':
      return hasBareComplexRef(e.base);
    default:
      return hasBareComplexRef(e.l) || hasBareComplexRef(e.r);
  }
}

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
    declares: [canonName(m[1]), canonName(m[2])],
    assertions: [{ kind: 'conjugates' as const, a: canonName(m[1]), b: canonName(m[2]), src: s }],
    claims: [claimAll(s)],
  };
};

const typeClaim: Rule = (s) => {
  const m = s.match(rx(`^(${NAME})\\s+${COPULA_KW}(.*)$`));
  if (!m) return null;
  const name = canonName(m[1]);
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

/**
 * The point names inside a run, in order. `z1*z2` and `z1z2` split identically.
 *
 * #791: capital point labels join the run alphabet CASE-SENSITIVELY — «אורך AB», «שטח OAB» — while
 * the o/z/w family keeps folding («Oz1Z2» is o,z1,z2 as it always was). The sentence-level RUN
 * pattern matches case-insensitively (the grammar's flags), so validation lives here: any atom that
 * is neither run-alphabet nor a label rejects the whole run, and the rule declines the line instead
 * of silently reading «אורך ab» as points.
 */
const splitRun = (text: string): string[] => {
  const out: string[] = [];
  for (const a of text.match(rx(String.raw`[A-Za-z]\d*`, 'gu')) ?? []) {
    const low = a.toLowerCase();
    if (low === 'o' || /^[zw]\d*$/.test(low)) out.push(low);
    else if (isPointLabel(a)) out.push(a);
    else return [];
  }
  return out;
};

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
  return objectLine({ kind: 'circle', center: canonName(m[1]), radius, src: s }, s);
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

/**
 * G8 — «היחס בין שטח Oz1z2 לשטח Oz2z3» / «the ratio between area Oz1z2 and area Oz2z3».
 *
 * A ratio is knowable where neither half is: the unit cancels. The two measure phrases are read by the
 * same noun list as every other measure sentence, so nothing about lengths, perimeters or areas is
 * spelled twice — a second spelling is how the two would come to disagree about what «היקף» means.
 */
const measureRatio: Rule = (s) => {
  const shapeNoun = `(?:${SHAPES.map(([kw]) => kw).join('|')})`;
  const phrase = `(?:${MEASURE_NOUNS.map(([kw]) => kw).join('|')})\\s+${ACCUSATIVE_KW}${OF_A}(?:${shapeNoun}\\s+)?${RUN}`;
  const m = s.match(rx(`^${OF_A}${RATIO_KW}\\s+${BETWEEN_KW}(${phrase})\\s+${TO_KW}(${phrase})$`));
  if (!m) return null;
  const one = measureTerm(m[1]);
  const two = measureTerm(m[2]);
  if (!one || !two) return null;
  return {
    ...empty(),
    ratios: [{ numerator: one, denominator: two, src: s }],
    declares: [...one.points, ...two.points].filter((n) => !isOrigin(n)),
    claims: [claimAll(s)],
  };
};

/** One measure phrase — «שטח Oz1z2» — as the query it denotes, or null when the arity is wrong. */
const measureTerm = (text: string): MeasureQuery | null => {
  const shapeNoun = `(?:${SHAPES.map(([kw]) => kw).join('|')})`;
  for (const [kw, kind] of MEASURE_NOUNS) {
    const m = text.match(rx(`^${kw}\\s+${ACCUSATIVE_KW}${OF_A}(?:${shapeNoun}\\s+)?(${RUN})$`));
    if (!m) continue;
    const points = splitRun(m[1]);
    const arity = MEASURE_ARITY[kind];
    if (points.length < arity.min) return null;
    if (arity.exact !== undefined && points.length !== arity.exact) return null;
    return { kind, points, src: text };
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
  const [a, b, c] = [m[1], m[2], m[5]].map((n) => canonName(n));
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
  const name = canonName(m[1]);
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
  const name = canonName(m[1]);
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

/**
 * A BARE EXPRESSION — «|z1-z2|», «im(z1)», «z1*z2». The student is asking what a value is.
 *
 * Last of all the rules, and deliberately: almost every sentence in this grammar would also parse as
 * an expression if nothing else claimed it first, so this rule may only see what every other rule has
 * already refused. It states nothing and constrains nothing — the names it mentions are declared (so
 * «|z1-z2|» draws both numbers, always-visualise) and the value is answered by the knowledge rule.
 */
const bareExpression: Rule = (s) => {
  if (s.includes('=')) return null; // an equation is a statement, and its rule has already run
  /**
   * TWO WORDS ARE A SENTENCE, NOT AN EXPRESSION — and this rule may not rescue a refused sentence.
   *
   * «triangle Oz1z2z3» is a shape noun with the wrong vertex count, and the shape rule REFUSES it on
   * purpose: a noun promising three vertices and given four is a mistyped line, and drawing it anyway
   * is the class where a green ✓ sits over a wrong picture. Reading the leftovers as an implicit
   * product (`triangle · O · z1 · z2 · z3`) would quietly undo that refusal — a last-resort rule
   * turning every honest refusal into a silent acceptance is the worst thing a last-resort rule can do.
   *
   * A student writes a bare expression the way maths is written, with no space between operands, so
   * requiring that is enough to keep this rule to the lines it is for.
   */
  if (/[A-Za-z0-9)|]\s+[A-Za-z(|]/u.test(s)) return null;
  const atoms = new Map<string, number>();
  const expr = parseExpr(s, 0, s.length, atoms);
  if (!expr) return null;
  const names = refNames(expr);
  // a bare literal («5») asks nothing about the figure; a bare name is F1 and was matched above
  if (!names.length || expr.t === 'ref') return null;
  return {
    ...empty(),
    atoms,
    exprQueries: [{ expr, src: s }],
    declares: names,
    claims: [claimAll(s)],
  };
};

/** First match wins. Order is specific-to-general: a relation sentence before the bare equation. */
export const RULES: readonly { readonly name: string; readonly rule: Rule }[] = [
  { name: 'declaration', rule: declaration },
  // #694: BEFORE `quadrant` — «z0 הוא הפתרון ברביע הרביעי» also matches that rule's NAME+quadrant
  // shape, and would lower to a filter ON z0 instead of a selection FROM the set.
  { name: 'solution-selection', rule: solutionSelection },
  { name: 'quadrant', rule: quadrantGiven },
  // an INEQUALITY before the equation rule: «arg z2 < 45» has no '=' but the chained form does not
  // either, and a comparator is a filter, never a relation to solve
  { name: 'argument-inequality', rule: argumentInequality },
  // a SYMBOLIC-angle polar form before the equation rule, which cannot read one and would refuse the line
  { name: 'generic-polar', rule: genericPolar },
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
  // a RATIO names two measures, so it must outrank both single-measure rules
  { name: 'measure-ratio', rule: measureRatio },
  { name: 'circumscribed-circle', rule: circumscribedCircle },
  { name: 'circle-centre-radius', rule: circleByCenterRadius },
  { name: 'named-shape', rule: namedShape },
  { name: 'argument-relation', rule: argumentRelation },
  { name: 'equation', rule: equation },
  // last: a bare glued run is a figure only when nothing else read the line as maths
  { name: 'bare-run', rule: bareRun },
  // LAST: a bare expression is a question, and it may only see what every statement rule refused
  { name: 'bare-expression', rule: bareExpression },
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
