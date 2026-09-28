/**
 * REPLAY (v2) — the ordered fact list folded into a figure, through the tier-1 solver.
 *
 * Same discipline as every sibling: **the fact list is the source of truth and the figure is derived**,
 * so positions are never stored and undo cannot desync. What is new is what sits in the middle — the
 * exact linear solve ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)) instead of per-fact
 * iteration, which is why the systems in #607's family reach a figure at all.
 *
 * ## The one way in
 *
 * `foldConstraints` is the fold, and `app/deriveLines.ts` is the only sanctioned way to reach it —
 * lines in, figure out. There was a second entry once: `bridgeFacts` + `derive2(facts)` read the
 * prototype parser's own facts, so the exact solver could be played through the old input box before
 * the v2 grammar existed. It was written to be deleted, and the cutover deleted it
 * ([ADR-CX-027](../../docs/06d-decisions-complex.md#adr-cx-027)).
 *
 * Its parting lesson is kept, because it cost a slice to learn: a capability that lives on only ONE of
 * two entry paths is invisible to tests aimed at the other. ADR-CX-021's solution set lived inside the
 * bridge, so `?engine=v2` never had it and eight green tests described a path the product did not ship
 * (#680, #686). One way in is the fix.
 *
 * A statement this layer cannot use is REPORTED, never silently skipped — it would otherwise vanish
 * from a figure that still looked plausible, which is the silent-drop class the siblings paid for 33
 * times over.
 */

import { fmtNum } from '../../shell/format';
import type { Cx } from '../value/value';
import { cPolar, evaluate, exact, formatPolar } from '../value/value';
import { type Rat, rat, toNumber, add as ratAdd, sub as ratSub, mul as ratMul, div as ratDiv, neg as ratNeg, isZero as ratIsZero, sqrtExact } from '../value/rational';
import { composeCartesian, gaussianRationalParts, numericPart, ratPart, readableCartesianParts } from '../value/cartesian';
import { type ExpVec, evaluate as evalMod, format as fmtMod, fromRational as modFromRational, pow as modPow, isOne as modIsOne, isParametric } from '../value/modulus';
import {
  type Angle,
  add as angAdd,
  fromTurns,
  period as anglePeriod,
  sameDirection,
  scale as angScale,
  toDegrees,
  zero as angZero,
} from '../value/angle';
import { type Expr, paramsOf, refsOf } from '../model/expr';
import { type Branch, isTurnUnknown, solveTier1, substituteSolvedParams } from '../solve/tier1';
import { isSignUnknown, linearize, paramOfSignUnknown, signUnknown } from '../solve/logpolar';
import { paramSigns } from '../model/paramSign';
import type { Claim as Assertion, CheckedClaim } from '../model/claim';
import { type FigureObject, ORIGIN, objectPoints } from '../model/figure';
import {
  type CheckedMeasure,
  type MeasureQuery,
  type MeasureRelation,
  type RatioQuery,
  type ExprQuery,
  measureOf,
} from '../model/measure';
import { type Completeness, type KnowledgeRow, knowledgeOf, realValue, whyNotKnowledge } from '../model/knowledge';
import { prettyName } from '../model/naming';
import { substitute } from '../model/solutionSet';
import type { SequenceKind, SequenceStatement } from '../model/sequence';
import { type SurfacedFormula, surfacedFormulas } from '../formulas/table';
import { type Bound, solveResiduals } from '../solve/tier2';
import { type PolyContext, allRoots, censusStarts, degreeOf, polyOf } from '../solve/census';
import {
  type Env,
  type ResidualSpec,
  deferredResidual,
  evalComplex,
  evalReal,
  measureResidual,
} from '../solve/residuals';
import { verifyClaims } from '../solve/claims';
import { claimDriveRows } from '../solve/claimDrive';
import { filterBranches } from '../solve/filter';
import { type AffineArg, projectWindow, statedWindow, violatesDeg } from '../solve/window';
import type { BranchFilter, Constraint, Selection as SolutionSelection } from '../model/constraint';
import type { Why } from '../model/why';

/** One real parameter, for the data panel's «פרמטרים» section (#1389). */
export interface ParamRow {
  readonly name: string;
  /** the exact value when the givens determine it (`2`, `5/9`, or `s/2` in a free s); null = free */
  readonly value: string | null;
}

/** A statement the fold could not use, with the reason — surfaced, never swallowed. */
export interface Untranslated {
  readonly factId: string;
  readonly src: string;
  /** a structured code (#716) — worded by the reading layer in the UI's language */
  readonly why: Why;
}

export interface DerivedPoint {
  readonly name: string;
  /**
   * #791 — the point's DISPLAY name, composed once here (the ADR-CX-015 rule): the bare pretty name
   * («z₁», «A»), or the dual form «A (z₁)» when a binding names the same point twice. Every surface
   * prints this; none re-derives it.
   */
  readonly display: string;
  readonly z: Cx;
  readonly modulus: string;
  readonly argumentDeg: number;
  /**
   * THE TEXT THIS NUMBER CARRIES — composed once here, printed unchanged by every surface.
   *
   * Never null and never empty: a plotted number the student can see always has a reading, because
   * «what is this point?» always has an answer. `exactLabel` answers a different question — whether a
   * SYMBOLIC form exists — and reading it as "have we anything to say" is what left `z1 = 3+4i`, the
   * commonest input form in the corpus, drawn as a bare name with no value beside it (#675). The
   * angle of `3+4i` is not a rational multiple of π, so it has no closed form; it is knowledge all
   * the same and only its typography is decimal.
   *
   * Composed at this layer rather than at each consumer because the canvas and the banner answering
   * the same question from different sources is the [#653](https://github.com/dcodish/geo_builder/issues/653)
   * class, and the renderer's own contract forbids it deciding: *the engine owns what exists; the
   * renderer owns where the ink goes.*
   */
  readonly reading: string;
  /** #703 — the same point in the a+bi lens, same chokepoint, same no-guess rule. */
  readonly readingCart: string;
  /** the exact polar text, when the whole value is carried exactly — a VALUE question, not a display one */
  readonly exactLabel: string | null;
  /**
   * How many powers `z, z², z³, …` this number visits before returning to itself — null when it never
   * does, which is the ordinary case.
   *
   * A finite cycle needs BOTH halves decided exactly: modulus exactly 1 (otherwise the powers walk
   * outward or inward forever) and an argument that is a rational multiple of a turn (otherwise they
   * never land on the same direction twice). Both are questions the exact carriers answer and floats
   * cannot — «z^(6n) takes only two values» is a corpus ask, and a sampled 59.9999° would answer it
   * wrong with total confidence.
   */
  readonly cyclePeriod: number | null;
  /** the givens FORCE this magnitude — otherwise it is one sample of many (ADR-052) */
  readonly modulusKnown: boolean;
  /** the givens FORCE this direction */
  readonly argumentKnown: boolean;
}

/**
 * An object RESOLVED against the configuration on screen — positions, not names.
 *
 * Resolved here rather than in the scene layer because this is where the parameter sample lives: a
 * circle of radius `r` has no drawable size until `r` has a value, and the scene must not be the layer
 * that invents one. `known` travels with it for the same reason a point's does — an object over
 * sampled vertices is one configuration of many and the ink says so.
 */
export interface DerivedObject {
  readonly kind: 'segment' | 'polygon' | 'circle';
  readonly key: string;
  readonly label: string;
  /** the endpoints or vertices, in the stated order; empty for a circle */
  readonly vertices: readonly Cx[];
  readonly center?: Cx;
  readonly radius?: number;
  /** every position it rests on is FORCED by the givens */
  readonly known: boolean;
  /**
   * #1425 (ADR-CX-053) — a polygon's OWN corners: the vertex names that are not also members of an
   * enumerated solution set. They lie on the polygon by definition, so the inside/on/outside count
   * leaves them out. A vertex that IS a solution («z^3 = 8», then the triangle z1z2z3) is one of the
   * numbers the question counts, so it is not listed here and still counts as on.
   */
  readonly cornerNames?: readonly string[];
}

/**
 * A stated sequence, RESOLVED to the configuration on screen (F9).
 *
 * The terms carry their positions because the picture depends on them: consecutive terms make the
 * partial-sum chain meaningful, and a gap («the first two terms … and the fifth») means the spiral
 * passes through more than one multiplication per drawn segment.
 */
export interface DerivedSequence {
  readonly kind: SequenceKind;
  readonly src: string;
  /** the STATED terms only, in position order — no term the student never named is invented */
  readonly terms: readonly { readonly name: string; readonly position: number; readonly z: Cx }[];
  /**
   * The per-position step of this configuration: the ratio `q` of a geometric sequence, the difference
   * `d` of an arithmetic one. Null when the stated terms are not adjacent, because then the step is a
   * Δ-th root with Δ values and choosing one would assert an intermediate term the student never gave.
   */
  readonly step: Cx | null;
  /** every term rests on a position the givens force */
  readonly known: boolean;
}

/**
 * `w = z·u` seen as what it IS: a rotation by `arg u` and a scaling by `|u|` (docs/27 §2, the
 * operation the corpus uses most and the one the Gauss plane exists to make visible).
 *
 * Read off the RESOLVED positions rather than re-evaluated from the expression: the angle drawn is
 * then the angle between the two points the student can see, and cannot disagree with them.
 */
export interface DerivedRotation {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly src: string;
  /** the sweep, signed, in degrees — `arg(to) − arg(from)` folded into (−180°, 180°] */
  readonly byDeg: number;
  /** `|to| / |from|` — 1 when the multiplication is a pure rotation */
  readonly scale: number;
  readonly known: boolean;
}

export interface Derived2 {
  /** null when the givens contradict each other, with which system found it */
  readonly contradiction: null | 'modulus' | 'argument';
  readonly points: DerivedPoint[];
  /** the figure's non-numeric objects, resolved to this configuration (F6) */
  readonly objects: readonly DerivedObject[];
  /** stated sequences, resolved — what the term spiral and the partial-sum chain are drawn from */
  readonly sequences: readonly DerivedSequence[];
  /** products between drawn numbers, read as rotation-and-scale */
  readonly rotations: readonly DerivedRotation[];
  /**
   * How many branches the ENUMERATION kept — what "show another" cycles.
   *
   * This is a SIZE, never an existence claim: 0 means "no enumerated branch", which is the ordinary
   * state of an under-determined figure (nothing to enumerate — the free directions are sampled) as
   * much as it is the state of a refuted one. Ask {@link hasConfiguration} whether a figure exists;
   * reading this count as that answer is what printed «אין תצורה תקפה» over a drawn point (#698).
   */
  readonly enumeratedConfigCount: number;
  /**
   * Does the figure HAVE a valid configuration? The existence half, split from the count.
   *
   * False only when something REFUTED the givens: contradictory moduli/arguments (`contradiction`),
   * or a filter that emptied a non-empty enumerated set (`emptiedBy`). A figure with no enumeration
   * at all still has configurations — a continuous family of them — and one of them is on screen.
   */
  readonly hasConfiguration: boolean;
  readonly configIndex: number;
  /** the still-open degrees of freedom, named the way the cue shows them */
  readonly freeDof: readonly string[];
  readonly untranslated: readonly Untranslated[];
  /** constraints tier 1 could not read — solved by the numeric tier, and listed either way */
  readonly deferred: readonly Constraint[];
  /** stated measures, re-verified against the FINAL values (stage 3e) */
  readonly measures: readonly CheckedMeasure[];
  /**
   * How many of the free coordinates the numeric tier actually consumed.
   *
   * Without this the DOF cue lies the moment a measure drives: tier 1's nullspace dimension is the
   * freedom BEFORE stage 3, and reporting it afterwards tells a student the figure can still move in
   * directions a given has just pinned.
   */
  readonly drivenDof: number;
  /** a relation the numeric tier could not satisfy — reported, never rounded away (stage 3e) */
  readonly unsatisfied: readonly string[];
  /** #887 — why each refusal happened, keyed by the line. Absent entry = the generic tail. */
  readonly refusalReasons: ReadonlyMap<string, RefusalReason>;
  /**
   * A stated relation the engine could not EVALUATE — undecided, which is not the same as violated.
   *
   * Listed rather than dropped: an equation that produces no drive, no refusal and no row is a given
   * the figure quietly ignored while looking finished.
   */
  readonly undecided: readonly string[];
  /** answers to what the student ASKED to see — a number only when the givens force one (stage 5d) */
  readonly knowledge: readonly KnowledgeRow[];
  /**
   * #1389/#1390 — every real PARAMETER the figure mentions, with its value when the givens force it.
   *
   * A parameter draws no point, so without this row a line like «u^5 = 32» (u = 2, ADR-CX-004 +
   * ADR-CX-041) was accepted and left nothing on screen: the silent-drop class behind a green state.
   * `value` is exact (from tier 1's `paramValues`) or `null` when the givens leave it free. It is
   * never printed from the sample.
   */
  readonly params: readonly ParamRow[];
  /**
   * Is there ANOTHER drawing to show? — the one definition the button reads.
   *
   * "Show another configuration" does two things: it walks the enumerated branch set, and it resamples
   * whatever the givens left free. When there is neither a second configuration nor a free degree of
   * freedom, pressing it cannot change the picture, and a button that visibly does nothing tells a
   * student their figure might be wrong when it is simply *determined* (operator ruling, 2026-08-17:
   * *"if there are no dofs left, the button can be disabled"*).
   *
   * Published rather than recomputed in the component for the reason every count in this engine is
   * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)): the cue, the knowledge gates and
   * this button must not be able to disagree about how free the figure is.
   */
  readonly canCycle: boolean;
  /**
   * #1427 (ADR-CX-049) — how many VALID configurations the fold holds: tier-1 kept branches × the
   * numeric tier's distinct solutions. What "show another" walks and what `canCycle` reads.
   * `enumeratedConfigCount` stays the tier-1 count.
   */
  readonly configCount: number;
  /** whether {@link configCount} is provably every configuration (`complete`) or a census floor */
  readonly configCompleteness: Completeness;
  /** the filter that emptied the configuration set, when one did */
  readonly emptiedBy: BranchFilter | null;
  /** the student's ANSWERS, checked against the figure the givens produced — never drivers */
  readonly claims: readonly CheckedClaim[];
  /**
   * Which of the three official sheet formulas this figure is USING, with the lines that brought each
   * up (S6, #623). Published from the fold so the panel and the canvas highlight from one list.
   */
  readonly formulas: readonly SurfacedFormula[];
}

/** A deterministic positive sample for a parameter the student never valued (ADR-052: a START, not a fixed value). */
const paramSample = (name: string, seed: number): number => {
  let h = 2166136261;
  for (const ch of `${name}@${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 0.6 + ((h >>> 0) % 181) / 100;
};

/**
 * ADR-CX-045 — the STARTING sign of a sign-free parameter that no exact equation reaches (`a` in
 * `z1 = a + b·i`). A start, never a fixed value (ADR-052): the sign is part of the parameter's freedom,
 * so "show another configuration" varies it. Seed 0 — the first drawing — starts positive, the
 * register's conventional reading.
 */
const paramSignSample = (name: string, seed: number): 1 | -1 => {
  if (seed === 0) return 1;
  let h = 2166136261;
  for (const ch of `sign:${name}@${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2 === 0 ? 1 : -1;
};

/** A parameter map read as MAGNITUDES — the log-space modulus carrier only knows positive atoms. */
const magnitudes = (m: ReadonlyMap<string, number>): Map<string, number> =>
  new Map([...m].map(([k, v]) => [k, Math.abs(v)]));

const HALF_TURN = fromTurns(rat(1, 2));

/**
 * #1427 — how many multi-start solves the n-D census may spend over ALL branches of one fold. Split
 * evenly (at least 4 per branch), fixed rather than timed so the configuration set is deterministic:
 * a timed census would draw a different list on a slower machine.
 */
const CENSUS_STARTS = 8;

/**
 * Everything a fold reads, named rather than ordered.
 *
 * It was eleven positional parameters and every family since F6 has added another. A call site of
 * eleven bare arguments is one transposition away from a figure that is quietly about something else,
 * and the transposition typechecks whenever two neighbours share a type.
 */
export interface FoldInput {
  readonly constraints: readonly Constraint[];
  readonly filters: readonly BranchFilter[];
  /** names the lines brought into existence, whether or not a constraint mentions them */
  readonly declared: readonly string[];
  /** angle atoms a cartesian literal introduced, with the degrees they stand for */
  readonly atoms: ReadonlyMap<string, number>;
  readonly untranslated: readonly Untranslated[];
  readonly configIndex: number;
  readonly seed: number;
  readonly assertions?: readonly Assertion[];
  readonly objects?: readonly FigureObject[];
  readonly measures?: readonly MeasureRelation[];
  readonly queries?: readonly MeasureQuery[];
  /** «היחס בין … ל…» — G8 ratio questions, answered when the quotient is invariant */
  readonly ratios?: readonly RatioQuery[];
  /** bare expressions the student asked the value of */
  readonly exprQueries?: readonly ExprQuery[];
  /** stated sequences, kept as STATEMENTS as well as constraints — the spiral is drawn from these */
  readonly sequences?: readonly SequenceStatement[];
  /**
   * #791 — «z1 = A» bindings: number name → point label. The tie itself is an ordinary eq
   * constraint (two refs, solved exactly); this map is the DISPLAY half — the label node hides and
   * the number's display name becomes «A (z₁)» at the stage-5d chokepoint.
   */
  readonly aliases?: ReadonlyMap<string, string>;
  /** #694 — «z0 is the solution in the fourth quadrant»: bind a new name to a member of the set. */
  readonly selections?: readonly ResolvedSelection[];
  /**
   * #1434 (ADR-CX-050) — each ENUMERATED solution set, by its reserved letter: `z → [z1, z2]` after
   * `z^2 - 4z + 13 = 0`. The letter is drawn as no point (it stands for the set), so a question about it
   * — «Re(z)», «|z|» — is asked of every member, and prints only when the members agree.
   */
  readonly solutionSets?: ReadonlyMap<string, readonly string[]>;
}

/**
 * A {@link Selection} with the SET it picks from, supplied by the lowering (the parser is stateless
 * per line and cannot know what earlier lines enumerated).
 *
 * `candidates` empty means there was no enumeration in scope — the sentence points at nothing, and
 * that refuses like any other unsatisfiable given rather than inventing a set to satisfy it.
 */
/**
 * #887 — the REASON behind a refusal, so the strip can say why rather than only that.
 *
 * `reason` is an i18n key suffix, never prose: the engine decides WHICH sentence, the UI owns the words
 * (the one place a computed value reaches a string is stage 5d, and this keeps that true).
 */
export interface RefusalReason {
  readonly reason: string;
  readonly params?: Record<string, string>;
}

export interface ResolvedSelection extends SolutionSelection {
  readonly candidates: readonly string[];
}

/**
 * The one derivation both entry points share.
 *
 * Extracted rather than duplicated: two folds that must agree are two folds that will drift, and the
 * sibling trees paid for that repeatedly (ADR-346's mirror class). The bridge and the v2 parser differ only
 * in how they PRODUCE constraints; what happens to them afterwards is identical.
 */
export function foldConstraints(input: FoldInput): Derived2 {
  const {
    constraints,
    filters: filterList,
    declared: declaredNames,
    atoms: literalSample,
    untranslated,
    configIndex,
    seed,
    assertions = [],
    objects = [],
    measures = [],
    queries = [],
    ratios = [],
    exprQueries = [],
    sequences = [],
    aliases = new Map<string, string>(),
    selections = [],
    solutionSets = new Map<string, readonly string[]>(),
  } = input;
  /**
   * #688 — DRIVE OR CHECK. Tier 1 is solved once to learn what the OTHER lines determined; a claim whose
   * subject that solve left FREE then contributes its constraint rows and tier 1 is re-solved with them.
   * A claim over a determined subject contributes nothing and is verified exactly as before.
   *
   * This is why the seam is here rather than in the parser: `parseLineV2` is stateless by construction,
   * so a per-line lowering structurally CANNOT decide "is my subject already pinned?". `foldConstraints`
   * is the one place that knows — it already holds tier 1's `freeDof` and `knownModulus` — and #680 hits
   * the same wall with `rootsMode`, so fixing the seam once serves both. See `solve/claimDrive.ts`.
   */
  /**
   * #1387/#1406 (ADR-CX-045) — a parameter's SIGN follows its use: a size (`|z1| = 9r`, a radius, a
   * measure, a scale factor) is positive; any other use (`a + b·i`, `u^5 = -32`) is any real. Decided
   * ONCE here, over everything the figure states, and read by both tiers.
   */
  const { signed } = paramSigns({ constraints, objects, measures });
  const t1Base = solveTier1(constraints, signed);
  const driveRows = claimDriveRows(assertions, t1Base);
  const t1 = driveRows.length ? solveTier1([...constraints, ...driveRows], signed) : t1Base;

  const baseSample = new Map(literalSample);
  for (const c of constraints) {
    for (const p of collectParams(c)) if (!baseSample.has(p)) baseSample.set(p, paramSample(p, seed));
  }
  // An OBJECT or a MEASURE can be the only mention of a parameter — «המעגל שמרכזו O ורדיוסו r» and
  // «אורך z1z2 = 15r» each name `r` where no constraint does. Sampling only what the constraints
  // mention left the circle with no radius (it silently did not draw) and the measure undecidable
  // (it silently did not drive): the same omission, surfacing two different ways.
  for (const o of objects) {
    if (o.kind !== 'circle') continue;
    for (const p of paramsOf(o.radius)) if (!baseSample.has(p)) baseSample.set(p, paramSample(p, seed));
  }
  for (const m of measures) {
    for (const p of paramsOf(m.rhs)) if (!baseSample.has(p)) baseSample.set(p, paramSample(p, seed));
  }
  /**
   * #1366 — a parameter the givens DETERMINE is drawn at its solved value, and is not a free DOF.
   *
   * `z1 = 3+4i` with `|z1| = 9r` solves `r = 5/9` (tier 1's `params`). Left at its seed baseSample, `r`
   * would print as free, and tier 2 — which may move every free parameter — could drive it off 5/9 to
   * satisfy some other given, silently breaking the one that pinned it. A parameter determined in terms
   * of other, still-free parameters follows them: their samples are taken first, then it is computed.
   */
  const solvedParams = new Set<string>();
  for (const [p, d] of t1.params.determined) {
    let v = evalMod(d.konst, magnitudes(baseSample));
    if (v === null) continue;
    for (const [fn, c] of d.coefs) v *= Math.pow(Math.abs(baseSample.get(fn) ?? paramSample(fn, seed)), toNumber(c));
    if (!Number.isFinite(v) || v <= 0) continue;
    baseSample.set(p, v);
    solvedParams.add(p);
  }

  const { kept, emptiedBy } = filterBranches(t1.branches, filterList, baseSample);
  const enumeratedConfigCount = kept.length;
  /**
   * EXISTENCE, asked separately from the count (#698, ADR-CX-034).
   *
   * A kept branch is a configuration. With none enumerated the figure still has configurations —
   * `tier1` returns `branches: []` when no argument is determined, i.e. "nothing to enumerate", not
   * "nothing survived" — unless the givens were actually refuted: `t1.inconsistent` (which already
   * carries `integralityFailed`), or a filter that emptied a set that HAD members (`filterBranches`
   * sets `emptiedBy` only in that case, never for an empty input).
   */
  const hasConfiguration = enumeratedConfigCount > 0 || (!t1.inconsistent && emptiedBy === null);

  /**
   * The sign of a parameter as KNOWLEDGE: the direction every kept configuration agrees on, or null when
   * they differ (`u^2 = 4` is u = ±2). A size, or a sign-free parameter no exact equation reaches, has
   * no enumerated sign — the former is positive by its use and the latter is not solved exactly anyway.
   */
  /**
   * The modulus carrier holds a sign-free parameter's MAGNITUDE, so a reading must say `|u|`, not
   * `u`: `z1 = u` in its negative configuration is `|u|·cis180°`, and `u·cis180°` would read as a
   * positive number there. A size parameter prints bare, as always.
   */
  const asMagnitude = (v: ExpVec): ExpVec => {
    if (![...v.keys()].some((k) => signed.has(k))) return v;
    return new Map([...v].map(([k, e]) => [signed.has(k) ? `|${k}|` : k, e]));
  };
  const signKnowledge = (p: string): Angle | null => {
    if (!t1.signedParams.includes(p)) return angZero();
    const dirs = kept.map((b) => b.angles.get(signUnknown(p)));
    if (dirs.every((a) => a !== undefined && sameDirection(a, HALF_TURN))) return HALF_TURN;
    if (dirs.every((a) => a === undefined || !sameDirection(a, HALF_TURN))) return angZero();
    return null;
  };

  /**
   * ONE TIER-1 BRANCH, SOLVED — its numeric system, its census, and the readers over it (#1427).
   *
   * Everything from here to the numeric solve depends on which branch is drawn: the sign each
   * sign-free parameter takes, the windows a filter leaves on the free directions, the free basis
   * itself. It used to run once, for the ONE branch on screen, so the numeric tier never saw the
   * other branches and never reported its own other roots — and the knowledge gate, which must ask
   * about EVERY valid configuration, could only count them. Now each kept branch is solved, and each
   * reports the distinct solutions it has (`census`) and whether that list is provably all of them.
   */
  const systemFor = (branch: Branch | undefined, censusStartCount: number) => {
    const sample = new Map(baseSample);
    /**
     * ADR-CX-045 — GIVE EACH SIGN-FREE PARAMETER ITS SIGN in this configuration. One tier 1 carries (it
     * appears in an exact equation) takes the sign the BRANCH chose — `u^5 = -32` enumerates exactly one,
     * s = ½, so u = −2. One only the numeric tier sees (`a` in `a + b·i`) starts at a per-seed sign and
     * tier 2 may move it through zero. The magnitude is untouched: it is still the sample or the exact
     * solve above.
     */
    const branchSign = (p: string): 1 | -1 => {
      const a = branch?.angles.get(signUnknown(p));
      return a !== undefined && sameDirection(a, HALF_TURN) ? -1 : 1;
    };
    for (const p of signed) {
      const v = sample.get(p);
      if (v === undefined) continue;
      const sgn = t1.signedParams.includes(p) ? branchSign(p) : paramSignSample(p, seed);
      sample.set(p, sgn * Math.abs(v));
    }

    /**
     * SAMPLE THE FREE DEGREES OF FREEDOM, then draw everything.
     *
     * The first version plotted only numbers whose magnitude the givens forced, and so drew NOTHING for
     * any partially-specified figure — which is every figure while the student is still typing. That
     * conflated two different rules. «Do not print an unknown value as knowledge» is right and is kept,
     * at the LABEL. «Do not draw it» is wrong: the standing product rule is *always visualise*
     * ([ADR-CX-001](../../docs/06d-decisions-complex.md#adr-cx-001) D3), and
     * [ADR-052](../../docs/06-decisions.md#adr-052) permits a default as a **starting** value precisely
     * so the figure can exist — provided it moves when the configuration changes, which it does, because
     * the sample is keyed on the seed that "show another configuration" advances.
     */
    /**
     * THE ANGULAR WINDOW a filter leaves open for a FREE direction.
     *
     * An inequality prunes enumerated branches — but a direction the givens never pin is not a branch,
     * it is a sampled degree of freedom, and pruning cannot reach it. «z1 ברביע הראשון» on its own is
     * exactly that case, and it drew z1 on the +Re axis: a point on an axis is in NO quadrant, so the
     * figure contradicted its own given while every check passed, because nothing had asked the sample
     * to respect the filter.
     *
     * So a filter does two jobs, not one: it PRUNES the configurations the equations produced, and it
     * BOUNDS the sampling of what they left free. Both are the same statement about the same direction.
     *
     * And it must do the second job on the coordinate the sampler actually MOVES, which is not always the
     * name the student wrote — see `solve/window.ts`. Keying the window by the stated name reached the
     * filter only while that name was the pivot; a name elimination made dependent was reached by neither
     * this map nor the branch pruner, and the given was silently dropped (#690, ADR-CX-025).
     */
    const windows = new Map<string, { min: number; max: number }>();
    const narrow = (name: string, min: number, max: number): void => {
      const prev = windows.get(name);
      windows.set(name, { min: Math.max(prev?.min ?? -Infinity, min), max: Math.min(prev?.max ?? Infinity, max) });
    };

    /**
     * The affine form the linear tier left for a direction: `arg(name) = K + Σ c·arg(basis)`.
     *
     * The turn unknowns are folded into `K` because the branch has already chosen them — they are a
     * constant here, not a coordinate anything may move. Mirrors `argumentOf` below, which is the
     * function this must agree with: if the two ever disagreed, the window would bound one number while
     * the figure drew another.
     */
    const affineArgOf = (name: string): AffineArg | null => {
      const d = t1.argument.determined.get(name);
      if (!d) return null;
      let konstDeg = toDegrees(d.konst, sample);
      if (konstDeg === null) return null;
      const terms = new Map<string, number>();
      for (const [fn, c] of d.coefs) {
        const coef = toNumber(c);
        if (isTurnUnknown(fn)) konstDeg += coef * Number(branch?.k.get(fn) ?? 0n) * 360;
        else terms.set(fn, (terms.get(fn) ?? 0) + coef);
      }
      return { konstDeg, terms };
    };

    for (const f of filterList) {
      const stated = statedWindow(f);
      if (stated === null) continue;
      // a direction the BRANCH fixed is already handled by pruning — bounding it would bound nothing
      if (branch?.angles.has(f.name)) continue;
      const affine = affineArgOf(f.name);
      if (affine === null) {
        // the name is in the free basis: the window is about the coordinate itself, as it always was
        narrow(f.name, stated.min, stated.max);
        continue;
      }
      // …otherwise it is DEPENDENT, and the window belongs on the basis coordinate that carries it
      const projected = projectWindow(stated, affine, (n) => windows.get(n));
      // `null` means it is not expressible as one interval — stage 3e verifies it instead of dropping it
      if (projected !== null) narrow(projected.name, projected.min, projected.max);
    }

    /**
     * Sample a free direction, STRICTLY inside its window when it has one.
     *
     * Strictly, because a quadrant is an open region: 0° and 90° are on the axes and belong to neither
     * neighbour. The 0.12–0.88 inset also keeps the drawn point clear of the boundary, so a student can
     * see which quadrant it is in rather than having to judge a point sitting on a ray.
     */
    const sampleArgDeg = (name: string): number => {
      const t = (paramSample(`arg ${name}`, seed) - 0.6) / 1.8; // 0 .. 1, deterministic per seed
      const w = windows.get(name);
      if (!w || !Number.isFinite(w.min) || !Number.isFinite(w.max)) {
        const lo = Number.isFinite(w?.min ?? NaN) ? w!.min : 0;
        const hi = Number.isFinite(w?.max ?? NaN) ? w!.max : 360;
        return lo + (0.12 + 0.76 * t) * (hi - lo);
      }
      return w.min + (0.12 + 0.76 * t) * (w.max - w.min);
    };

    const sampleModulus = (name: string): number => 0.8 + paramSample(`|${name}|`, seed);

    /**
     * THE FREE BASIS — the coordinates tier 1 could not remove, and the only ones tier 2 may move.
     *
     * Three kinds, and the third is easy to get wrong: the sample map holds both the real PARAMETERS the
     * student named (`r`, `d`) and the opaque ANGLE ATOMS a cartesian literal introduced. The atoms are
     * not free — `arg(3+4i)` is a fixed number the value layer carries symbolically — so optimising over
     * them would let the solver "satisfy" an area given by quietly redefining what `3+4i` means.
     */
    const drawnNames = [...new Set([...t1.names, ...declaredNames])];

    /**
     * The free basis is taken over the DRAWN names, not over the constraint names.
     *
     * Tier 1 only ever sees names a constraint mentions, so a number the student merely declared — «z2»
     * on its own line, or a vertex an object named — was absent from `t1.modulus.free`. It was still
     * drawn, at an ad-hoc sample. The consequence was subtle and bad: «אורך z1z2 = 5» with z2 free
     * reported VIOLATED, because the one point the measure could have moved was not in the vector tier 2
     * was allowed to move. A point that is free enough to draw is free enough to drive.
     */
    /**
     * #1434 (ADR-CX-050) — a name a CLOSED NUMBER defines is determined, not a coordinate to search.
     *
     * `z1 = (a number with no exact carrier)` — an enumerated polynomial root like 1+√2, whose modulus
     * no exponent vector carries — reaches this tier as a definition over no unknown at all. Left in
     * the free basis it was one more complex unknown for the census, and two of them already make the
     * basis too wide for the polynomial certificate: `z² − 2z − 1 = 0` would read every value as
     * «may have more than one possibility» while each root is a stated number. So the definition places
     * the name, the way tier 1 places a name an exact value defines, and its residual stays live as the
     * stage-3e check. Only a name tier 1 left free in BOTH halves is placed here — a half tier 1
     * determined is a given this must not override.
     */
    const pinned = new Map<string, Cx>();
    const closedEnv: Env = { at: () => undefined, param: () => undefined, atoms: sample };
    for (const c of t1.deferred) {
      if ((c.kind ?? 'eq') !== 'eq') continue;
      const [name, value] =
        c.lhs.t === 'ref' && isClosed(c.rhs) ? [c.lhs.name, c.rhs] : c.rhs.t === 'ref' && isClosed(c.lhs) ? [c.rhs.name, c.lhs] : [null, null];
      if (name === null || value === null || pinned.has(name)) continue;
      if (t1.modulus.determined.has(name) || t1.argument.determined.has(name) || branch?.angles.has(name)) continue;
      const v = evalComplex(value, closedEnv);
      if (v && Number.isFinite(v.re) && Number.isFinite(v.im)) pinned.set(name, v);
    }
    const freeModNames = [
      ...new Set([...t1.modulus.free, ...drawnNames.filter((n) => !t1.modulus.determined.has(n))]),
    ].filter((n) => !pinned.has(n));
    const freeArgNames = [
      ...new Set([
        ...t1.argument.free.filter((n) => !isTurnUnknown(n) && !isSignUnknown(n)),
        ...drawnNames.filter((n) => !t1.argument.determined.has(n) && !branch?.angles.has(n)),
      ]),
    ].filter((n) => !isTurnUnknown(n) && !pinned.has(n));
    const freeParamNames = [...sample.keys()].filter((p) => !literalSample.has(p) && !solvedParams.has(p));

    /**
     * THE PUBLISHED FREE-DOF LIST — derived from the basis above, not from `t1.freeDof`.
     *
     * [ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006) makes the free-DOF count ONE
     * definition, read by the cue, the knowledge gates and the sampler alike. Publishing tier 1's list
     * while tier 2 optimised over a different (larger) basis was two definitions of one quantity, and
     * they drifted exactly where it hurts: «z2» declared but unconstrained is genuinely free, tier 1
     * never saw it, so the figure reported ZERO degrees of freedom — and the knowledge panel, asking
     * that same count, then printed a sampled area as though the givens forced it.
     *
     * Real parameters are in the list because they are free by the same rule: `r` unstated is a free
     * magnitude, and a measure in `r` is not a number until something pins it.
     */
    const freeDofNames = [
      ...freeModNames.map((n) => `|${n}|`),
      ...freeArgNames.map((n) => `arg ${n}`),
      ...freeParamNames,
    ];

    interface State {
      readonly mod: ReadonlyMap<string, number>;
      readonly arg: ReadonlyMap<string, number>;
      readonly par: ReadonlyMap<string, number>;
    }

    const initial: State = {
      mod: new Map(freeModNames.map((n) => [n, sampleModulus(n)])),
      arg: new Map(freeArgNames.map((n) => [n, sampleArgDeg(n)])),
      par: new Map(sample),
    };

    const modulusOf = (name: string, st: State): { value: number; exact: ExpVec | null } => {
      const at = pinned.get(name);
      if (at) return { value: Math.hypot(at.re, at.im), exact: null };
      const d = t1.modulus.determined.get(name);
      if (!d) return { value: st.mod.get(name) ?? sampleModulus(name), exact: null };
      const base = evalMod(d.konst, magnitudes(st.par));
      if (base === null) return { value: sampleModulus(name), exact: null };
      let v = base;
      for (const [fn, c] of d.coefs) v *= Math.pow(st.mod.get(fn) ?? 1, toNumber(c));
      // #1389 — a solved parameter inside the exact modulus is substituted: `18r` with r = 5/9 reads 10
      return { value: v, exact: d.coefs.size === 0 ? substituteSolvedParams(d.konst, t1.paramValues) : null };
    };

    const argumentOf = (name: string, st: State): { deg: number; exact: Angle | null } => {
      const at = pinned.get(name);
      if (at) return { deg: (Math.atan2(at.im, at.re) * 180) / Math.PI, exact: null };
      const fixed = branch?.angles.get(name);
      if (fixed) {
        const deg = toDegrees(fixed, st.par);
        if (deg !== null) return { deg, exact: fixed };
      }
      const d = t1.argument.determined.get(name);
      if (!d) return { deg: st.arg.get(name) ?? sampleArgDeg(name), exact: null };
      let deg = toDegrees(d.konst, st.par);
      if (deg === null) return { deg: sampleArgDeg(name), exact: null };
      for (const [fn, c] of d.coefs) {
        const turn = branch?.k.get(fn);
        deg += toNumber(c) * (isTurnUnknown(fn) ? Number(turn ?? 0n) * 360 : (st.arg.get(fn) ?? 0));
      }
      return { deg, exact: null };
    };

    const positionsOf = (st: State): Map<string, Cx> => {
      const out = new Map<string, Cx>([[ORIGIN, { re: 0, im: 0 }]]);
      for (const name of drawnNames) {
        const m = modulusOf(name, st);
        const a = argumentOf(name, st);
        if (Number.isFinite(m.value) && Number.isFinite(a.deg)) out.set(name, cPolar(m.value, a.deg));
      }
      return out;
    };

    const envFor = (st: State): Env => {
      const pos = positionsOf(st);
      // `st.par` carries the literal ANGLE ATOMS as well as the real parameters — both are numbers the
      // residuals need, and keeping them in one map is what lets a `5+2i` literal be evaluated at all
      return { at: (n) => pos.get(n), param: (p) => st.par.get(p), atoms: st.par };
    };

    // --- TIER 2: drive the free basis to satisfy what tier 1 could not read ----
    const specs: ResidualSpec[] = [
      ...t1.deferred.map((c, i) => deferredResidual(c, i)),
      ...measures.map((m, i) => measureResidual(m, i)),
    ];
    /**
     * Only relations that can be EVALUATED join the residual vector — its length has to be constant for
     * the minimiser — and the ones that cannot are **collected and reported**.
     *
     * They used to be dropped here in silence. A stated equation the engine could not read then produced
     * nothing at all: no drive, no refusal, no row — a figure that ignored a given while looking finished,
     * which is the silent-drop class the whole tree is built to refuse (`src-complex/CLAUDE.md`:
     * *nothing stated is ever silently dropped*). `undecided` is a distinct answer from `unsatisfied` and
     * is now shown as one.
     */
    const initialEnv = envFor(initial);
    const live: { spec: ResidualSpec; width: number }[] = [];
    const undecided: string[] = [];
    for (const spec of specs) {
      const v = spec.values(initialEnv);
      if (v !== null) live.push({ spec, width: v.length });
      else if (spec.key.startsWith('deferred')) undecided.push(spec.describe);
    }

    const encode = (st: State): number[] => [
      ...freeModNames.map((n) => st.mod.get(n) ?? 1),
      ...freeArgNames.map((n) => st.arg.get(n) ?? 0),
      ...freeParamNames.map((n) => st.par.get(n) ?? 1),
    ];

    const decode = (x: readonly number[]): State => {
      const mod = new Map<string, number>();
      const arg = new Map<string, number>();
      const par = new Map(sample);
      let i = 0;
      for (const n of freeModNames) mod.set(n, x[i++]);
      for (const n of freeArgNames) arg.set(n, x[i++]);
      for (const n of freeParamNames) par.set(n, x[i++]);
      return { mod, arg, par };
    };

    const evaluateAt = (x: readonly number[]): number[] => {
      const env = envFor(decode(x));
      const out: number[] = [];
      for (const { spec, width } of live) {
        const v = spec.values(env);
        // a relation that stops being evaluable mid-search is far from satisfied, never zero — and the
        // vector must keep its length, or the minimiser is solving a different problem each step
        if (v === null) out.push(...new Array<number>(width).fill(1e6));
        else out.push(...v);
      }
      return out;
    };

    const bounds: Bound[] = [
      // a modulus is a length: strictly positive, or the point is the origin and its direction is a lie
      ...freeModNames.map(() => ({ lo: 1e-6 })),
      ...freeArgNames.map((n) => {
        const w = windows.get(n);
        return {
          lo: w && Number.isFinite(w.min) ? w.min + 1e-6 : undefined,
          hi: w && Number.isFinite(w.max) ? w.max - 1e-6 : undefined,
        };
      }),
      /**
       * ADR-CX-045 — a SIZE parameter (`r` in `|z1| = 9r`) is a positive magnitude; a sign-free one an
       * exact equation carries keeps the sign its branch chose (the branch owns it, and tier 2 crossing
       * zero would draw a figure the enumeration never produced); a sign-free one only this tier sees
       * (`a`, `b` in `a + b·i`) is any real, unbounded.
       */
      ...freeParamNames.map((p): Bound => {
        if (!signed.has(p)) return { lo: 1e-6 };
        if (!t1.signedParams.includes(p)) return {};
        return (sample.get(p) ?? 1) < 0 ? { hi: -1e-6 } : { lo: 1e-6 };
      }),
    ];

    const solved =
      live.length > 0 && !t1.inconsistent
        ? solveResiduals(evaluateAt, encode(initial), { bounds })
        : null;

    // --- STAGE 3b: the census — every distinct solution this branch's numeric system has (#1427) ---
    const lmState = solved ? decode(solved.x) : initial;
    const n = freeModNames.length + freeArgNames.length + freeParamNames.length;
    const scaleOf = (z: Cx): number => Math.max(1, Math.hypot(z.re, z.im));
    /**
     * Two solutions are ONE configuration when every drawn number sits in the same place. `tol` is
     * the solve's own precision, not the print's: a root the residual only TOUCHES (`6|sin θ| = 6`)
     * converges to ~1e-5, and a tighter test counted one drawing eight times. Polynomial roots are
     * Newton-polished to machine precision, so they are compared at 1e-6.
     */
    const sameDrawing = (a: State, b: State, tol = 1e-6): boolean => {
      const pa = positionsOf(a);
      const pb = positionsOf(b);
      for (const [name, z] of pa) {
        const w = pb.get(name);
        if (!w || Math.hypot(z.re - w.re, z.im - w.im) > tol * scaleOf(z)) return false;
      }
      return true;
    };
    /** the n-D census compares at the precision LM reaches on a touching root */
    const FLOOR_TOL = 1e-3;
    /** a candidate the census keeps: polished onto the system, verified against EVERY live relation */
    const settle = (x: readonly number[]): State | null => {
      const polished = solveResiduals(evaluateAt, x, { bounds, restarts: 0, alternatives: false });
      if (polished.solved && sameDrawing(decode(polished.x), decode(x))) return decode(polished.x);
      return evaluateAt(x).every((r) => Math.abs(r) <= 1e-8) ? decode(x) : null;
    };

    /**
     * The 1-unknown POLYNOMIAL certificate: the free basis is one complex number z (its modulus and
     * its argument), and some stated equation is a nonzero holomorphic polynomial in z — or in z̄,
     * which is the same certificate read in the other orientation (tier 1 may have chosen `z2` as the
     * basis of `z2 = conj(z1)`, and then `z1² − 4z1 + 6 = 0` is a polynomial in z̄₂). Its roots are
     * then EVERY candidate — the fundamental theorem of algebra, not a search — and the census is
     * complete. `null` when the figure is not of that shape.
     */
    const polynomialCensus = (): State[] | null => {
      if (freeParamNames.length > 0 || freeModNames.length !== 1 || freeArgNames.length !== 1) return null;
      const z = freeModNames[0];
      if (freeArgNames[0] !== z) return null;
      const here = positionsOf(lmState);
      const zAt = here.get(z);
      if (!zAt || Math.hypot(zAt.re, zAt.im) < 1e-9) return null;
      /** how a drawn name depends on z: |w| ∝ |z|^a and arg w = const + b·arg z */
      const exponents = (name: string): { a: number; b: number } | null => {
        if (name === z) return { a: 1, b: 1 };
        const dm = t1.modulus.determined.get(name);
        if (!dm) return null;
        let a = 0;
        for (const [fn, c] of dm.coefs) {
          if (fn !== z) return null;
          a = toNumber(c);
        }
        let b = 0;
        if (!branch?.angles.has(name)) {
          const da = t1.argument.determined.get(name);
          if (!da) return null;
          for (const [fn, c] of da.coefs) {
            if (isTurnUnknown(fn) || isSignUnknown(fn)) continue;
            if (fn !== z) return null;
            b = toNumber(c);
          }
        }
        return { a, b };
      };
      const involvesName = (name: string): boolean => {
        const e = exponents(name);
        return e === null || e.a !== 0 || e.b !== 0;
      };
      const hereEnv = envFor(lmState);
      const cmul = (x: Cx, y: Cx): Cx => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });

      /** the roots of the lowest-degree polynomial certificate in `t` (t = z, or t = z̄), as z values */
      const rootsIn = (orientation: 1 | -1): Cx[] | null => {
        const tAt = orientation === 1 ? zAt : { re: zAt.re, im: -zAt.im };
        const ctx: PolyContext = {
          involves: (e) => refsOf(e).some(involvesName),
          constant: (e) => evalComplex(e, hereEnv),
          monomial: (name) => {
            const e = exponents(name);
            // w = c·t^a exactly when the modulus and the argument move together in this orientation
            if (!e || e.a !== orientation * e.b || !Number.isInteger(e.a) || e.a < 0) return null;
            const w = here.get(name);
            if (!w) return null;
            let tp: Cx = { re: 1, im: 0 };
            for (let i = 0; i < e.a; i++) tp = cmul(tp, tAt);
            const d = tp.re * tp.re + tp.im * tp.im;
            return { a: e.a, c: { re: (w.re * tp.re + w.im * tp.im) / d, im: (w.im * tp.re - w.re * tp.im) / d } };
          },
        };
        let best: Cx[] | null = null;
        for (const c of t1.deferred) {
          if ((c.kind ?? 'eq') !== 'eq') continue;
          const poly = polyOf({ t: 'sub', l: c.lhs, r: c.rhs }, ctx);
          if (!poly || degreeOf(poly) < 1) continue;
          const roots = allRoots(poly);
          if (best === null || roots.length < best.length) best = roots;
        }
        return best && best.map((t) => (orientation === 1 ? t : { re: t.re, im: -t.im }));
      };

      const roots = rootsIn(1) ?? rootsIn(-1);
      if (roots === null) return null;
      const w = windows.get(z);
      const out: State[] = [];
      for (const r of roots) {
        const mod = Math.max(Math.hypot(r.re, r.im), 1e-9);
        let deg = (Math.atan2(r.im, r.re) * 180) / Math.PI;
        if (w && Number.isFinite(w.min) && Number.isFinite(w.max)) {
          const fit = [-720, -360, 0, 360, 720].map((k) => deg + k).find((d) => d > w.min && d < w.max);
          if (fit === undefined) continue; // the filter prunes this root, exactly as it prunes a branch
          deg = fit;
        } else deg = ((deg % 360) + 360) % 360;
        const st = settle([mod, deg]);
        if (st && !out.some((o) => sameDrawing(o, st))) out.push(st);
      }
      return out;
    };

    /** The n-D FLOOR: deterministic multi-start, kept only where the solve is isolated. */
    const multiStartCensus = (): State[] => {
      const out: State[] = solved && solved.solved ? [lmState] : [];
      const kinds = [
        ...freeModNames.map(() => 'mod' as const),
        ...freeArgNames.map(() => 'arg' as const),
        ...freeParamNames.map(() => 'par' as const),
      ];
      for (const x0 of censusStarts(kinds, bounds, censusStartCount)) {
        const r = solveResiduals(evaluateAt, x0, { bounds, restarts: 0, alternatives: false });
        if (!r.solved || consumedDimensions(evaluateAt, r.x) !== n) continue;
        const st = decode(r.x);
        if (!out.some((o) => sameDrawing(o, st, FLOOR_TOL))) out.push(st);
      }
      return out;
    };

    /** a deterministic order, so "show another configuration" walks one list whatever the seed */
    const ordered = (sts: State[]): State[] => {
      const keyOf = (st: State): number[] => {
        const pos = positionsOf(st);
        return drawnNames.flatMap((name) => {
          const p = pos.get(name);
          if (!p) return [];
          const deg = (((Math.atan2(p.im, p.re) * 180) / Math.PI) % 360 + 360) % 360;
          return [Math.round(deg * 1e4) / 1e4, Math.round(Math.hypot(p.re, p.im) * 1e6) / 1e6];
        });
      };
      const keys = new Map(sts.map((s) => [s, keyOf(s)]));
      return [...sts].sort((a, b) => {
        const ka = keys.get(a)!;
        const kb = keys.get(b)!;
        for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return 0;
      });
    };

    let states: State[];
    let completeness: Completeness = 'complete';
    if (t1.inconsistent || live.length === 0 || n === 0) {
      // nothing numeric to be plural about: the check passed or it did not
      states = !solved || solved.solved ? [lmState] : [];
    } else {
      const poly = polynomialCensus();
      if (poly !== null) states = ordered(poly);
      else {
        completeness = 'floor';
        const isolated = solved !== null && solved.solved && consumedDimensions(evaluateAt, solved.x) === n;
        // a continuum is one member per sample — the seed moves along it; an isolated solve is censused
        states = !solved || !solved.solved ? [] : isolated ? ordered(multiStartCensus()) : [lmState];
      }
    }
    return {
      branch, sample, freeModNames, freeArgNames, freeParamNames, freeDofNames, live, undecided, drawnNames,
      modulusOf, argumentOf, positionsOf, envFor, evaluateAt, encode, states, completeness, fallback: lmState,
    };
  };

  /**
   * THE CONFIGURATION SET — every kept branch times the numeric solutions it holds (#1427).
   *
   * A branch whose numeric system has no solution is not a configuration: it is left out, so
   * cycling only ever draws figures that satisfy every given. Only when NO branch has one is the
   * failed solve drawn — the stage-3e backstop then names the given it could not satisfy, which is
   * what the acceptance gate reads to refuse the line.
   */
  const branchList: (Branch | undefined)[] = kept.length ? [...kept] : [undefined];
  const startsPerBranch = Math.max(2, Math.floor(CENSUS_STARTS / branchList.length));
  const systems = branchList.map((b) => systemFor(b, startsPerBranch));
  const valid = systems.flatMap((sys) => sys.states.map((st) => ({ sys, state: st })));
  const configs = valid.length
    ? valid
    : (() => {
        const sys = systems[((configIndex % systems.length) + systems.length) % systems.length];
        return [{ sys, state: sys.fallback }];
      })();
  const configCount = valid.length;
  const completeness: Completeness = systems.every((s) => s.completeness === 'complete') ? 'complete' : 'floor';
  const index = ((configIndex % configs.length) + configs.length) % configs.length;
  const shown = configs[index];
  const {
    branch, sample, freeParamNames, freeDofNames, live, undecided, drawnNames,
    modulusOf, argumentOf, envFor, evaluateAt, encode,
  } = shown.sys;
  type State = (typeof shown)['state'];

  const state: State = shown.state;
  // the solved parameter values must reach everything downstream, objects included
  for (const [k, v] of state.par) sample.set(k, v);

  /**
   * #694 ([ADR-CX-037](../../docs/06d-decisions-complex.md#adr-cx-037)) — RESOLVE the selections.
   *
   * «z0 הוא הפתרון ברביע הרביעי» binds a NEW name to the member of an enumerated set that satisfies a
   * filter. It is resolved HERE, beside the filter re-verification, because that is the first point at
   * which each candidate has a DRAWN direction — the question "which of these is in that quadrant?"
   * has no answer before the solve.
   *
   * The three outcomes, and two of them are refusals the operator named at the ask:
   *  - exactly ONE member satisfies → bind, as an alias (the #791 display tie: the row reads «z₀ (z₆)»);
   *  - NONE → refuse, NAMING the student’s statement. Never bind nothing, and never bind the nearest;
   *  - TWO OR MORE → refuse, naming it. Never pick one — picking would assert a given the student did
   *    not state (ADR-052). In the exams a ≥2 result is usually the question telling the student to
   *    answer «שתי האפשרויות», so this reads as information rather than as a malfunction.
   *
   * A selection whose set is EMPTY (no enumeration in scope) refuses through the same door: the
   * sentence points at nothing, and inventing a set to satisfy it is the silent-invention class.
   */
  const selectionAliases = new Map<string, string>();
  /** #887 — why a refusal happened, keyed by the student's line. The UI renders the specific message
   *  when there is one and the generic tail when there is not. */
  const refusalReasons = new Map<string, RefusalReason>();
  const unresolvedSelections: string[] = [];
  for (const sel of selections) {
    const matched = sel.candidates.filter((c) => {
      const a = argumentOf(c, state);
      if (!Number.isFinite(a.deg)) return false;
      return !violatesDeg(sel.filter, ((a.deg % 360) + 360) % 360);
    });
    if (matched.length === 1) {
      selectionAliases.set(matched[0], sel.name);
      continue;
    }
    // #887 (docs/10 guideline 8) — the refusal still goes through `unsatisfied`, because that is what
    // the acceptance gate reads and the line must not commit. What is added is the REASON: zero, many
    // and no-set-in-scope are three different things and the student is owed the one that applies.
    unresolvedSelections.push(sel.src);
    const q = sel.filter.kind === 'quadrant' ? String(sel.filter.q) : '';
    refusalReasons.set(
      sel.src,
      sel.candidates.length === 0
        ? { reason: 'selectionNoSet' }
        : matched.length === 0
          ? { reason: 'selectionNone', params: { quadrant: q } }
          : { reason: 'selectionMany', params: { quadrant: q, names: matched.map(prettyName).join(', ') } },
    );
  }

  const points: DerivedPoint[] = [];
  if (!t1.inconsistent) {
    // the union: names the constraints mention PLUS bare declarations, so a number the student merely
    // named is still on the canvas (always-visualise) rather than waiting for a constraint to earn it
    // #694: a resolved selection is an alias like any other — «z₀ (z₆)» through the #791 display tie.
    const allAliases = new Map<string, string>([...aliases, ...selectionAliases]);
    const boundLabels = new Set(allAliases.values());
    for (const name of drawnNames) {
      // #791: a bound label is the SAME point as its number — one dot, one dual-named reading
      if (boundLabels.has(name)) continue;
      const m = modulusOf(name, state);
      const a = argumentOf(name, state);
      if (!Number.isFinite(m.value) || !Number.isFinite(a.deg)) continue;
      const modulus = m.exact ? fmtMod(asMagnitude(m.exact)) : round2(m.value);
      // a cycle needs BOTH halves exact: unit modulus, and an argument that is a rational part of a turn
      const cycle = m.exact && a.exact && modIsOne(m.exact) ? anglePeriod(a.exact) : null;
      // a DIRECTION, folded into one turn — see the note on `argumentDeg` below
      const argumentDeg = ((a.deg % 360) + 360) % 360;
      const exactLabel = m.exact && a.exact ? exactLabelOf(m.exact, a.exact) : null;
      const alias = allAliases.get(name);
      const display = alias ? `${alias} (${prettyName(name)})` : prettyName(name);
      points.push({
        name,
        display,
        z: cPolar(m.value, a.deg),
        modulus,
        /**
         * A DIRECTION, folded into one turn — not a winding.
         *
         * Tier 1 deliberately does not reduce turns, because `z⁵` genuinely winds five times and
         * `smallestPower` solves over the winding count. But that is a property of the exact ANGLE
         * carrier; a drawn point has a direction and nothing else. Passing the raw value through
         * printed «z₂ ≈ 3·cis-190440°» for a number sitting on the positive real axis — arithmetically
         * true, and useless. The exact carriers keep the winding; the plotted point does not.
         */
        argumentDeg,
        reading: readingOf({
          display,
          exactLabel,
          modulus,
          modulusKnown: m.exact !== null,
          argumentDeg,
          argumentKnown: a.exact !== null,
        }),
        /**
         * #703 — the CARTESIAN reading, composed at the same stage-5d chokepoint so the canvas
         * and the panel can never disagree (the #653/#675 one-source rule, now per VIEW). The
         * same no-guess rule binds: a value prints only when the givens determine it.
         */
        readingCart: readingCartOf({
          display,
          z: cPolar(m.value, a.deg),
          known: m.exact !== null && a.exact !== null,
          // #1404 — the SAME exactness condition as the polar `exactLabel`: both carriers exact;
          // the printing policy (≤ one root sign per part) is the value layer's, not ours
          exactParts: m.exact && a.exact && exactLabel !== null ? readableCartesianParts(m.exact, a.exact) : null,
        }),
        exactLabel,
        cyclePeriod: cycle === null ? null : Number(cycle),
        modulusKnown: m.exact !== null,
        argumentKnown: a.exact !== null,
      });
    }
  }
  points.sort((a, b) => a.name.localeCompare(b.name));

  // --- stage 3e: the honesty backstop ---------------------------------------
  // Every relation is re-verified against the FINAL values. A minimiser that stopped near a solution
  // will report success if nobody asks it to prove otherwise, and a figure that quietly violates a
  // stated given under a green tick is the one outcome this product cannot ship.
  const finalEnv = envFor(state);
  const checkedMeasures: CheckedMeasure[] = measures.map((m, i) => {
    const spec = measureResidual(m, i);
    const v = spec.values(finalEnv);
    if (v === null) return { relation: m, status: 'undecided', why: { code: 'measure-uncomputable', src: m.src } };
    // RELATIVE, because an area of 150r² and a length of 15r are not accurate to the same absolute
    // amount — a fixed epsilon would call the big one violated and the small one satisfied for the
    // same quality of solve.
    const want = evalReal(m.rhs, finalEnv) ?? 1;
    return Math.abs(v[0]) <= 1e-6 * Math.max(1, Math.abs(want))
      ? { relation: m, status: 'holds', why: { code: 'measure-holds', src: m.src } }
      : { relation: m, status: 'violated', why: { code: 'measure-violated', src: m.src } };
  });

  /**
   * A deferred CONSTRAINT that the numeric tier did not satisfy is reported by its own text.
   *
   * These have no row in the fact list of their own — they are equations tier 1 pushed down — so
   * without this an arithmetic sequence that cannot hold would simply draw a figure that ignores it.
   */
  const unsatisfiedRelations = live
    .filter(({ spec }) => {
      const v = spec.values(finalEnv);
      return v === null || v.some((r) => Math.abs(r) > 1e-6);
    })
    .filter(({ spec }) => spec.key.startsWith('deferred'))
    .map(({ spec }) => spec.describe);

  /**
   * STAGE 3e FOR FILTERS — re-verify every stated window against the direction actually DRAWN.
   *
   * Measures have had this backstop since the tier landed; filters had none, and that asymmetry is what
   * let #690 be silent rather than merely wrong. Pruning and window-projection are both *arrangements*
   * to make a filter hold, and an arrangement can fail to reach — a window over two basis coordinates
   * is a half-plane that `projectWindow` honestly declines, and the numeric tier may afterwards move a
   * direction that pruning had settled. Neither may end with a figure that contradicts the student.
   *
   * So the last word is read off the drawn point: whatever route the number took, this asks the
   * student's question about the student's number. Reported through `unsatisfied` rather than a new
   * channel because it is the same sentence — *you stated this and the drawing does not do it* — and
   * because ADR-CX-023's acceptance gate already reads that signal, so the line that breaks an earlier
   * given is now blamed instead of accepted.
   */
  const violatedFilters = t1.inconsistent
    ? []
    : filterList
        .filter((f) => {
          const p = points.find((q) => q.name === f.name);
          return p !== undefined && violatesDeg(f, p.argumentDeg);
        })
        .map((f) => f.src);

  /**
   * #788 — a VIOLATED MEASURE joins `unsatisfied`, the same sentence through the same channel.
   *
   * Stage 3e always computed the verdict, but it reached only the data panel's verdict rows — an
   * opt-in surface — while the always-visible strip and ADR-CX-023's acceptance gate both read
   * `unsatisfied`. So «אורך z1z2 = 99» on a determined 5-length figure was ACCEPTED and listed as an
   * ordinary fact, with its ✗ hidden behind the data toggle — precisely what the B6 ruling forbids,
   * and the opposite of 2-D, which refuses the class at submit (ADR-417). A measure with a stated
   * value is a GIVEN (F7 drive-or-check), not a claim: when it can drive it drives and reads
   * `holds`; when no reachable configuration satisfies it, it refuses like a filter that cannot
   * hold (#690's precedent, one line above). `undecided` stays out — "could not evaluate" is a
   * different sentence from "false", per the gate's own doctrine.
   */
  const violatedMeasures = checkedMeasures
    .filter((m) => m.status === 'violated')
    .map((m) => m.relation.src);

  /**
   * #719 (ADR-CX-035) — an IMPOSSIBLE magnitude given joins the same channel, first.
   *
   * It leads because it is the most fundamental verdict available: «|z1| = -5» is refused by itself,
   * with no reference to any other statement, so naming it before the relational verdicts tells the
   * student the true reason rather than pointing at a conflict that is not the problem.
   */
  const unsatisfied = [...t1.impossible, ...unsatisfiedRelations, ...violatedMeasures, ...violatedFilters, ...unresolvedSelections];

  /**
   * STAGE 5d — the only place a number the engine computed reaches a string.
   *
   * Every row asks {@link knowledgeOf} first — with the asked value evaluated in EVERY configuration
   * of the set (#1427). A measure over a figure that still has freedom, or that differs between
   * configurations, prints no number at all: the answer to «what is the area?» is then «the givens do
   * not determine it yet», which is a real answer and is shown as one.
   */
  const drivenCount = live.length > 0 && !t1.inconsistent ? consumedDimensions(evaluateAt, encode(state)) : 0;
  const closure = {
    remainingDof: Math.max(0, freeDofNames.length - drivenCount),
    configCount,
    completeness,
  };
  /** every configuration's environment, the one on screen included — what "invariant" is asked over */
  const configEnvs: Env[] = valid.length ? valid.map((c) => c.sys.envFor(c.state)) : [];
  /** the one predicate, asked of a quantity given as "its value in this configuration" */
  const judge = (carriedExactly: boolean, valueIn: (env: Env) => Cx | null) =>
    knowledgeOf(carriedExactly, closure, configEnvs.map(valueIn));
  /** #1434 — the same predicate, over SEVERAL values per configuration (a solution set's members) */
  const judgeAll = (valuesIn: (env: Env) => (Cx | null)[]) =>
    knowledgeOf(false, closure, configEnvs.flatMap(valuesIn));
  /**
   * The closure a quantity over SOLVED parameters is judged against: it cannot move with a free
   * direction or a numeric root (neither tier moves a solved parameter), so only the configurations'
   * own values — a branch's sign — decide it.
   */
  const exactClosure = { remainingDof: 0, configCount, completeness: 'complete' as const };
  /**
   * IS THE ONE REMAINING FREEDOM A PURE **GAUGE**? — «הביעו באמצעות r», answered.
   *
   * The corpus asks a whole register of questions the current knowledge gate has to refuse: *express
   * the length of Z₁Z₂ in terms of r*, *express the perimeter in terms of r*. The figure genuinely has
   * a free degree of freedom, so no NUMBER is knowledge — and yet `15r` is knowledge, exactly, and it
   * is the answer the exam wants.
   *
   * The difference is that `r` is not an unknown of the figure, it is its **unit**. If scaling every
   * magnitude and `r` together by λ produces another configuration that satisfies every relation, then
   * the givens describe a one-parameter FAMILY of similar figures, and a length in that family is
   * `c·r` for a single c — a fact about all of them at once.
   *
   * That is checked, never assumed, and it is deliberately not the sampling-variance shape
   * [ADR-421](../../docs/06-decisions.md#adr-421) forbids: the scaled state is *evaluated against every
   * live residual* (the family is valid), and the quantity is required to scale by exactly `λ^degree`
   * (it really is homogeneous). A figure that pins an absolute size somewhere — «|z₁| = 5» beside a
   * free `r` — fails both checks and prints no expression, which is correct: there, `r` is a genuine
   * unknown rather than a unit.
   */
  const GAUGE_LAMBDA = 2;
  const GAUGE_TURN_DEG = 37;

  /** The transformed state, and the environment that reads positions out of it. */
  const transformed = (f: (st: State) => State): { env: Env; moves: boolean } => {
    const next = f(state);
    const env = envFor(next);
    const moves =
      [...next.mod].some(([n, v]) => Math.abs(v - (state.mod.get(n) ?? v)) > 1e-12) ||
      [...next.arg].some(([n, v]) => Math.abs(v - (state.arg.get(n) ?? v)) > 1e-12) ||
      [...next.par].some(([n, v]) => Math.abs(v - (state.par.get(n) ?? v)) > 1e-12);
    return { env, moves };
  };

  const satisfiesEverything = (env: Env): boolean => {
    const reach = Math.max(1, ...[...drawnNames].map((n) => modulusOf(n, state).value)) * GAUGE_LAMBDA;
    const tol = 1e-7 * reach * reach;
    return live.every(({ spec }) => {
      const v = spec.values(env);
      return v !== null && v.every((r) => Math.abs(r) <= tol);
    });
  };

  /** Scale every magnitude and the unit together: the figure becomes a similar one. */
  const scaleAll = (st: State): State => ({
    mod: new Map([...st.mod].map(([n, v]) => [n, v * GAUGE_LAMBDA])),
    arg: st.arg,
    par: new Map([...st.par].map(([n, v]) => [n, freeParamNames.includes(n) ? v * GAUGE_LAMBDA : v])),
  });

  /** Turn every free direction by the same angle: the figure becomes a rotated one. */
  const rotateAll = (st: State): State => ({
    mod: st.mod,
    arg: new Map([...st.arg].map(([n, v]) => [n, v + GAUGE_TURN_DEG])),
    par: st.par,
  });

  const scale = transformed(scaleAll);
  const turn = transformed(rotateAll);
  const symmetries = [
    { kind: 'scale' as const, ...scale },
    { kind: 'turn' as const, ...turn },
  ].filter((s) => s.moves && !t1.inconsistent && satisfiesEverything(s.env));

  /**
   * The remaining freedom is EXACTLY the symmetry group — so a Euclidean measure is determined.
   *
   * `remainingDof` counts directions the figure can still move in; the symmetries are directions along
   * which it moves to a *congruent or similar* figure. When the two counts agree, every valid
   * configuration is the same shape as this one, and a length is `c·r`, an area `c·r²`, for a single c.
   */
  const shapeFixed = symmetries.length > 0 && closure.remainingDof === symmetries.length;
  const gaugeName = symmetries.some((s) => s.kind === 'scale') && freeParamNames.length === 1
    ? freeParamNames[0]
    : null;

  /**
   * A measure over a shape-fixed figure, written the way the exam asks for it.
   *
   * Every symmetry is CHECKED against the measure as well as against the relations: a rotation must
   * leave it alone and a scaling must multiply it by `λ^degree`. If either fails, this is not the
   * quantity's symmetry group after all and nothing is printed — the conservative direction
   * ([ADR-CX-014](../../docs/06d-decisions-complex.md#adr-cx-014)): a withheld truth costs a hint, an
   * asserted falsehood costs the answer.
   */
  const expressMeasure = (
    kind: MeasureQuery['kind'],
    names: readonly string[],
    value: number,
  ): { value: string; approx?: true } | null => {
    if (!shapeFixed) return null;
    const degree = kind === 'area' ? 2 : 1;
    for (const s of symmetries) {
      const pts = names.map((n) => s.env.at(n));
      if (pts.some((p) => p === undefined)) return null;
      const moved = measureOf(kind, pts as Cx[]);
      if (moved === null) return null;
      const want = s.kind === 'scale' ? value * GAUGE_LAMBDA ** degree : value;
      if (Math.abs(moved - want) > 1e-6 * Math.max(1, Math.abs(want))) return null;
    }
    if (!gaugeName) {
      // no unit to express it in: the number itself is the same in every configuration
      return freeParamNames.length === 0 ? numAnswer(value) : null;
    }
    const unit = state.par.get(gaugeName);
    if (!unit || !Number.isFinite(unit)) return null;
    return { value: `${fmtCoefficient(value / unit ** degree)}${gaugeName}${degree === 2 ? '²' : ''}`, ...coeffApprox(value / unit ** degree) };
  };

  const measureAt = (env: Env, q: MeasureQuery): number | null => {
    const pts = q.points.map((n) => env.at(n));
    return pts.some((p) => p === undefined) ? null : measureOf(q.kind, pts as Cx[]);
  };

  /**
   * A BARE EXPRESSION — «|z1-z2|», «im(z1)» — answered by the same rule as everything else.
   *
   * The prototype's calculation panel printed the current sample and called it an answer; this is that
   * capability rebuilt on the honesty contract ([ADR-CX-014](../../docs/06d-decisions-complex.md#adr-cx-014)).
   * The DEGREE of a real-valued expression is measured rather than assumed — `|z1-z2|` comes out
   * degree 1 and `|z1-z2|²` degree 2 — so «הביעו באמצעות r» answers in `r` without anyone declaring
   * what kind of quantity the student wrote.
   *
   * A complex-valued expression is only knowledge over a figure with no rotational freedom, and that is
   * not a limitation to fix: under a free rotation the value genuinely is different in every
   * configuration, and only its modulus is invariant.
   */
  /**
   * The exact answer to an expression over parameters ONLY: `undefined` when the expression names a
   * complex number (the ordinary path answers it), `null` when a parameter it names is still free,
   * else the formatted exact value. It is exact through `linearize`, so `9r` with r = 5/9 prints 5.
   */
  const paramOnlyValue = (e: Expr): { value: string; approx?: true } | null | undefined => {
    if (refsOf(e).length > 0) return undefined;
    const names = paramsOf(e);
    if (names.length === 0) return undefined;
    if (names.some((p) => !solvedParams.has(p) || !t1.paramValues.has(p))) return null;
    const form = linearize(e, signed);
    if (form) {
      // ADR-CX-045 — a sign-free parameter contributes its KNOWN sign; one whose sign differs between
      // configurations (`u^2 = 4`) makes the expression's value differ too, so it is not knowledge
      let dir = form.tConst;
      for (const [n, c] of form.tCoef) {
        const sgn = isSignUnknown(n) ? signKnowledge(paramOfSignUnknown(n)) : null;
        if (sgn === null) return null;
        dir = angAdd(dir, angScale(sgn, c));
      }
      const v = substituteSolvedParams(form.uConst, t1.paramValues);
      if (paramsOf(e).every((p) => !v.has(p))) {
        if (sameDirection(dir, angZero())) return { value: fmtMod(v) };
        if (sameDirection(dir, HALF_TURN)) return { value: `-${fmtMod(v)}` };
      }
    }
    const here = evalComplex(e, finalEnv);
    if (!here) return null;
    // #1427 — the one predicate, over every configuration. A SOLVED parameter is exact and the numeric
    // tier never moves it (it is not in the free basis), so neither the free directions nor the numeric
    // census can change it: only a branch's sign can, and that is what the comparison sees.
    return knowledgeOf(false, exactClosure, configEnvs.map((env) => evalComplex(e, env))).known ? numAnswer(here.re) : null;
  };

  /**
   * #1434 (ADR-CX-050) — a question about a SOLUTION SET's letter: `Re(z)` after `z^2 − 4z + 13 = 0`.
   *
   * The letter names every solution at once, so the question has one answer exactly when every
   * solution gives the same one — the knowledge doctrine asked over the members as well as over the
   * configurations, through the same predicate. `Re(z) = 2` and `|z| = √13` print; `Im(z)` is ±3
   * and says it differs between the solutions, naming the first so the student can ask about one.
   * A question naming two sets at once has no single reading and is not answered.
   */
  const setRow = (q: ExprQuery, letters: readonly string[]): KnowledgeRow => {
    if (letters.length !== 1) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    const members = solutionSets.get(letters[0]) ?? [];
    const each = members.map((m) => substitute(q.expr, letters[0], m));
    const here = each.length ? evalComplex(each[0], finalEnv) : null;
    if (!here) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    const verdict = judgeAll((env) => each.map((e) => evalComplex(e, env)));
    if (verdict.known) {
      const real = Math.abs(here.im) <= 1e-9 * Math.max(1, Math.hypot(here.re, here.im));
      // #1436 — the substituted members carry exact values, so the set's one answer can be exact too
      const ex = exactAnswer(each[0]);
      if (ex !== null) return { label: q.src, value: ex, why: null };
      return { label: q.src, ...cxAnswer(here, real), why: null };
    }
    // the members differ within ONE drawing: that is the set's own spread, not a choice of configuration
    const inOne = each.map((e) => evalComplex(e, finalEnv));
    const spread = inOne.some((v) => !v || Math.hypot(v.re - here.re, v.im - here.im) > 1e-6 * Math.max(1, Math.hypot(here.re, here.im)));
    if (spread) {
      return { label: q.src, value: null, why: { code: 'multi-solution', solutions: members.length, first: members[0] } };
    }
    return { label: q.src, value: null, why: verdict.why };
  };

  /**
   * #1436 — BOUNDED EXACT ARITHMETIC over the Gaussian rationals (operator rulings 2026-09-27 on
   * #1436/#1460: an answer recognised exact prints in exact form alone; otherwise ≈ decimal).
   *
   * When every operand of an ask is a Gaussian RATIONAL — an exactly-carried point (`1+i`), a
   * literal, `i` — sums, differences, products and quotients stay in the field, so the answer is
   * carried exactly with no CAS (the ADR-CX-006 boundary: bounded integer work). `|…|` of such a
   * value is √(rational), spelled by the ONE modulus formatter («2√2», «√5»). Anything outside the
   * field — a parameter, a free point, an angle with no rational cartesian form — answers null and
   * the decimal ≈ path stands. Exactness never bypasses the knowledge gate: this runs only after
   * `verdict.known`.
   */
  type Gauss = { re: Rat; im: Rat };
  const gaussOfRef = (name: string): Gauss | null => {
    if (solutionSets.has(name)) return null;
    const m = modulusOf(name, state);
    const a = argumentOf(name, state);
    return m.exact && a.exact ? gaussianRationalParts(m.exact, a.exact) : null;
  };
  const gaussSqrt = sqrtExact; // exact only when both halves are perfect squares — else the caller keeps ≈
  const evalGauss = (e: Expr): Gauss | null => {
    switch (e.t) {
      case 'num':
        return { re: e.v, im: rat(0) };
      case 'i':
        return { re: rat(0), im: rat(1) };
      case 'val':
        return e.v.kind === 'zero' ? { re: rat(0), im: rat(0) } : e.v.kind === 'exact' ? gaussianRationalParts(e.v.mod, e.v.arg) : null;
      case 'ref':
        return gaussOfRef(e.name);
      case 'param':
        return null;
      case 'neg': {
        const g = evalGauss(e.e);
        return g && { re: ratNeg(g.re), im: ratNeg(g.im) };
      }
      case 'conj': {
        const g = evalGauss(e.e);
        return g && { re: g.re, im: ratNeg(g.im) };
      }
      case 'add':
      case 'sub': {
        const l = evalGauss(e.l);
        const r = evalGauss(e.r);
        if (!l || !r) return null;
        const op = e.t === 'add' ? ratAdd : ratSub;
        return { re: op(l.re, r.re), im: op(l.im, r.im) };
      }
      case 'mul': {
        const l = evalGauss(e.l);
        const r = evalGauss(e.r);
        if (!l || !r) return null;
        return { re: ratSub(ratMul(l.re, r.re), ratMul(l.im, r.im)), im: ratAdd(ratMul(l.re, r.im), ratMul(l.im, r.re)) };
      }
      case 'div': {
        const l = evalGauss(e.l);
        const r = evalGauss(e.r);
        if (!l || !r) return null;
        const s = ratAdd(ratMul(r.re, r.re), ratMul(r.im, r.im));
        if (ratIsZero(s)) return null;
        return {
          re: ratDiv(ratAdd(ratMul(l.re, r.re), ratMul(l.im, r.im)), s),
          im: ratDiv(ratSub(ratMul(l.im, r.re), ratMul(l.re, r.im)), s),
        };
      }
      case 'pow': {
        // small non-negative INTEGER powers only — repeated multiplication; roots keep their ≈
        if (e.exp.d !== 1n || e.exp.n < 0n || e.exp.n > 4n) return null;
        const b = evalGauss(e.base);
        if (!b) return null;
        let acc: Gauss = { re: rat(1), im: rat(0) };
        for (let k = 0n; k < e.exp.n; k++) {
          acc = { re: ratSub(ratMul(acc.re, b.re), ratMul(acc.im, b.im)), im: ratAdd(ratMul(acc.re, b.im), ratMul(acc.im, b.re)) };
        }
        return acc;
      }
      case 'abs': {
        // exact inside a larger expression only when √(re²+im²) is itself rational
        const g = evalGauss(e.e);
        if (!g) return null;
        const root = gaussSqrt(ratAdd(ratMul(g.re, g.re), ratMul(g.im, g.im)));
        return root === null ? null : { re: root, im: rat(0) };
      }
    }
  };
  /** The exact spelling of a whole ask, or null: `|…|` heads go to the modulus formatter (2√2). */
  const exactAnswer = (e: Expr): string | null => {
    if (e.t === 'abs') {
      const g = evalGauss(e.e);
      if (g) {
        const s = ratAdd(ratMul(g.re, g.re), ratMul(g.im, g.im));
        return ratIsZero(s) ? '0' : fmtMod(modPow(modFromRational(s), rat(1, 2)));
      }
      return null;
    }
    const g = evalGauss(e);
    return g ? composeCartesian(ratPart(g.re), ratPart(g.im)) : null;
  };

  const exprRows: KnowledgeRow[] = exprQueries.map((q) => {
    const setLetters = refsOf(q.expr).filter((n) => solutionSets.has(n));
    if (setLetters.length > 0) return setRow(q, setLetters);
    // #1389 — a question about the PARAMETERS alone («r», «9r», «r^2») is answered exactly whenever
    // the givens solve every parameter it mentions, whatever else in the figure is still free
    const exactParam = paramOnlyValue(q.expr);
    if (exactParam !== undefined) {
      return exactParam === null
        ? { label: q.src, value: null, why: whyNotKnowledge(closure) }
        : { label: q.src, ...exactParam, why: null };
    }
    // Knowledge rule 1 (model/knowledge.ts): a modulus CARRIED EXACTLY is knowledge whatever else is
    // free — «|z2|» with |z2| = 18r and r = 5/9 is 10 even while arg z2 is open (#1389 step 3)
    if (q.expr.t === 'abs' && q.expr.e.t === 'ref') {
      const known = t1.knownModulus.get(q.expr.e.name);
      if (known && !isParametric(known) && judge(true, () => null).known) {
        return { label: q.src, value: fmtMod(known), why: null };
      }
    }
    const here = evalComplex(q.expr, finalEnv);
    if (!here) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    const real = Math.abs(here.im) <= 1e-9 * Math.max(1, Math.hypot(here.re, here.im));
    const verdict = judge(false, (env) => evalComplex(q.expr, env));
    if (verdict.known) {
      // #1436 — a recognised-exact answer prints in exact form alone («2√2», «-2+2i»); else ≈ decimal
      const ex = exactAnswer(q.expr);
      if (ex !== null) return { label: q.src, value: ex, why: null };
      return { label: q.src, ...cxAnswer(here, real), why: null };
    }
    if (!shapeFixed || !gaugeName || !real) {
      return { label: q.src, value: null, why: verdict.why };
    }
    const turned = symmetries.find((s) => s.kind === 'turn');
    if (turned) {
      const v = evalComplex(q.expr, turned.env);
      if (!v || Math.abs(v.re - here.re) > 1e-6 * Math.max(1, Math.abs(here.re))) {
        return { label: q.src, value: null, why: whyNotKnowledge(closure) };
      }
    }
    const scaled = symmetries.find((s) => s.kind === 'scale');
    const v = scaled ? evalComplex(q.expr, scaled.env) : null;
    if (!v) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    // the degree is MEASURED: |z1-z2| doubles under λ=2, an area-like expression quadruples
    const degree = Math.round(Math.log(Math.abs(v.re / here.re)) / Math.log(GAUGE_LAMBDA));
    if (!Number.isFinite(degree) || Math.abs(v.re - here.re * GAUGE_LAMBDA ** degree) > 1e-6 * Math.max(1, Math.abs(v.re))) {
      return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    }
    const unit = state.par.get(gaugeName);
    if (!unit || !Number.isFinite(unit)) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    if (degree === 0) return { label: q.src, ...numAnswer(here.re), why: null };
    const power = degree === 1 ? '' : degree === 2 ? '²' : `^${degree}`;
    return {
      label: q.src,
      value: `${fmtCoefficient(here.re / unit ** degree)}${gaugeName}${power}`,
      ...coeffApprox(here.re / unit ** degree),
      why: null,
    };
  });

  /**
   * The parameters section (#1389/#1390): every parameter the figure mentions, in first-seen order.
   * The value comes only from tier 1's exact solve, so a parameter is printed exactly when the givens
   * force it, and reads free otherwise.
   */
  const params: ParamRow[] = [...sample.keys()]
    .filter((p) => !literalSample.has(p))
    .map((p) => {
      const v = solvedParams.has(p) ? t1.paramValues.get(p) : undefined;
      if (!v) return { name: p, value: null };
      // ADR-CX-045 — the sign is part of the value: u = −2 for `u^5 = -32`, u = ±2 for `u^2 = 4`.
      // #1427: asked through the one predicate, over the parameter's value in every configuration
      const sgn = signKnowledge(p);
      const verdict = knowledgeOf(false, exactClosure, configEnvs.map((env) => realValue(env.param(p) ?? null)));
      const differs = !verdict.known && verdict.why.code === 'multi-config';
      const prefix = differs || sgn === null ? '±' : sameDirection(sgn, HALF_TURN) ? '-' : '';
      return { name: p, value: `${prefix}${fmtMod(v)}` };
    });

  const knowledge: KnowledgeRow[] = queries.map((q) => {
    const value = measureAt(finalEnv, q);
    if (value === null) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    const verdict = judge(false, (env) => realValue(measureAt(env, q)));
    if (verdict.known) return { label: q.src, ...numAnswer(value), why: null };
    const expressed = expressMeasure(q.kind, q.points, value);
    if (expressed) return { label: q.src, ...expressed, why: null };
    return { label: q.src, value: null, why: verdict.why };
  });

  /**
   * G8 — a RATIO of two measures, which is knowable where neither half is.
   *
   * «מצאו את היחס בין השטחים» is answerable for a figure with a free unit, because the unit divides
   * out; that is why 2021 קיץ ב can demand every answer «באמצעות a ו-b» and still have determinate
   * ratios. The test is the same one the parameter rows use — the value must be unchanged under every
   * verified symmetry — applied to the quotient rather than to either measure, so a ratio of two
   * lengths passes where each length alone is only knowable in a unit.
   */
  const ratioRows: KnowledgeRow[] = ratios.map((r) => {
    const top = measureAt(finalEnv, r.numerator);
    const bottom = measureAt(finalEnv, r.denominator);
    if (top === null || bottom === null || Math.abs(bottom) < 1e-12) {
      return { label: r.src, value: null, why: whyNotKnowledge(closure) };
    }
    const value = top / bottom;
    const verdict = judge(false, (env) => {
      const a = measureAt(env, r.numerator);
      const b = measureAt(env, r.denominator);
      return a === null || b === null || Math.abs(b) < 1e-12 ? null : realValue(a / b);
    });
    if (verdict.known) return { label: r.src, ...numAnswer(value), why: null };
    const invariant =
      shapeFixed &&
      symmetries.every((s) => {
        const a = measureAt(s.env, r.numerator);
        const b = measureAt(s.env, r.denominator);
        if (a === null || b === null || Math.abs(b) < 1e-12) return false;
        return Math.abs(a / b - value) <= 1e-6 * Math.max(1, Math.abs(value));
      });
    return invariant
      ? { label: r.src, ...numAnswer(value), why: null }
      : { label: r.src, value: null, why: verdict.why };
  });

  return {
    contradiction: t1.inconsistent,
    points,
    objects: t1.inconsistent ? [] : resolveObjects(objects, points, sample, solutionSets),
    sequences: t1.inconsistent ? [] : resolveSequences(sequences, points),
    rotations: t1.inconsistent ? [] : resolveRotations(constraints, points),
    enumeratedConfigCount,
    hasConfiguration,
    configIndex: index,
    freeDof: freeDofNames,
    untranslated,
    deferred: t1.deferred,
    measures: checkedMeasures,
    drivenDof: drivenCount,
    unsatisfied,
    refusalReasons,
    undecided,
    knowledge: [...knowledge, ...ratioRows, ...exprRows],
    params: t1.inconsistent ? [] : params,
    configCount,
    configCompleteness: completeness,
    canCycle: configCount > 1 || closure.remainingDof > 0,
    emptiedBy,
    claims: verifyClaims(assertions, t1, branch),
    formulas: t1.inconsistent ? [] : surfacedFormulas(constraints, enumeratedConfigCount),
  };
}

/**
 * How many free coordinates the residual system actually pins — the numeric rank of its Jacobian.
 *
 * The DOF cue reads one published number ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)),
 * and tier 1's nullspace dimension is the freedom *before* stage 3. Once an area given consumes a
 * direction, reporting the tier-1 count tells a student the figure can still move in a direction their
 * own given has just pinned. Rank is the honest correction, and it is computed rather than tracked so
 * it cannot drift from what the residuals really did.
 */
function consumedDimensions(f: (x: readonly number[]) => number[], x: readonly number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const r0 = f(x);
  if (r0.length === 0) return 0;
  const J: number[][] = r0.map(() => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]));
    const xp = [...x];
    xp[j] += h;
    const rp = f(xp);
    for (let i = 0; i < r0.length; i++) J[i][j] = (rp[i] - r0[i]) / h;
  }
  // row-echelon over the rows, counting pivots; the scale is set by the largest entry so the
  // threshold means "this direction does not move the residual", not "this number is small"
  const scale = Math.max(1e-12, ...J.flat().map(Math.abs));
  let rank = 0;
  const M = J.map((row) => [...row]);
  for (let col = 0; col < n && rank < M.length; col++) {
    let pivot = -1;
    for (let i = rank; i < M.length; i++) {
      if (pivot < 0 || Math.abs(M[i][col]) > Math.abs(M[pivot][col])) pivot = i;
    }
    if (pivot < 0 || Math.abs(M[pivot][col]) < 1e-8 * scale) continue;
    [M[rank], M[pivot]] = [M[pivot], M[rank]];
    for (let i = rank + 1; i < M.length; i++) {
      const factor = M[i][col] / M[rank][col];
      for (let j = col; j < n; j++) M[i][j] -= factor * M[rank][j];
    }
    rank++;
  }
  return Math.min(rank, n);
}

/**
 * Resolve the stated objects against the configuration that was just solved.
 *
 * An object whose vertices are not all on the canvas is DROPPED rather than drawn partially — a
 * triangle missing a corner is not a triangle, and inventing the missing one would be the ADR-052 sin
 * with a straight edge on it. The name is still declared by the parser, so the missing point shows up
 * as a free degree of freedom rather than as silence.
 */
function resolveObjects(
  objects: readonly FigureObject[],
  points: readonly DerivedPoint[],
  sample: ReadonlyMap<string, number>,
  solutionSets: ReadonlyMap<string, readonly string[]> = new Map(),
): DerivedObject[] {
  const solutionMembers = new Set([...solutionSets.values()].flat());
  const at = new Map<string, Cx>([[ORIGIN, { re: 0, im: 0 }]]);
  const forced = new Map<string, boolean>([[ORIGIN, true]]);
  for (const p of points) {
    at.set(p.name, p.z);
    forced.set(p.name, p.modulusKnown && p.argumentKnown);
  }

  const out: DerivedObject[] = [];
  objects.forEach((o, i) => {
    const names = objectPoints(o);
    const spots = names.map((n) => at.get(n));
    if (spots.some((z) => z === undefined)) return;
    const vertices = spots as Cx[];
    const known = names.every((n) => forced.get(n) === true);
    const label = names.map((n) => (n === ORIGIN ? 'O' : n)).join('');
    const key = `${o.kind}-${label}-${i}`;

    if (o.kind === 'segment') {
      out.push({ kind: o.kind, key, label, vertices, known });
      return;
    }
    if (o.kind === 'polygon') {
      out.push({ kind: o.kind, key, label, vertices, known, cornerNames: names.filter((n) => !solutionMembers.has(n)) });
      return;
    }
    if (o.kind === 'circle') {
      const r = radiusValue(o.radius, sample);
      if (r === null || !(r > 0)) return;
      out.push({ kind: 'circle', key, label, vertices: [], center: vertices[0], radius: r, known });
      return;
    }
    const c = circumcircle(vertices[0], vertices[1], vertices[2]);
    if (!c) return; // three collinear points have no circumscribed circle — say nothing, draw nothing
    out.push({ kind: 'circle', key, label, vertices: [], center: c.center, radius: c.r, known });
  });
  return out;
}

/**
 * Resolve the stated sequences against this configuration.
 *
 * A term whose number is not on the canvas drops the WHOLE sequence rather than a link of it: a spiral
 * through two of three stated terms is a different sequence from the one the student stated, and it
 * would be drawn with no sign that a term is missing.
 */
function resolveSequences(
  statements: readonly SequenceStatement[],
  points: readonly DerivedPoint[],
): DerivedSequence[] {
  const at = new Map(points.map((p) => [p.name, p]));
  const out: DerivedSequence[] = [];
  for (const s of statements) {
    const ordered = [...s.terms].sort((a, b) => a.position - b.position);
    const resolved = ordered.map((t) => ({ term: t, point: at.get(t.name) }));
    if (resolved.some((r) => r.point === undefined)) continue;
    const terms = resolved.map((r) => ({
      name: r.term.name,
      position: r.term.position,
      z: r.point!.z,
    }));
    const known = resolved.every((r) => r.point!.modulusKnown && r.point!.argumentKnown);
    /**
     * The step is published only between ADJACENT terms.
     *
     * With a gap of Δ positions the step is a Δ-th root of the ratio the student stated — Δ different
     * values, each a different sequence through the same stated points. Publishing one would put an
     * intermediate term on the screen that the givens do not force, which is what
     * [ADR-052](../../docs/06-decisions.md#adr-052) forbids and what «כל האפשרויות» is about.
     */
    const step =
      terms.length >= 2 && terms[1].position === terms[0].position + 1
        ? s.kind === 'geometric'
          ? cDiv(terms[1].z, terms[0].z)
          : { re: terms[1].z.re - terms[0].z.re, im: terms[1].z.im - terms[0].z.im }
        : null;
    out.push({ kind: s.kind, src: s.src, terms, step, known });
  }
  return out;
}

/** `a / b`, or null at the origin where the ratio has no meaning. */
function cDiv(a: Cx, b: Cx): Cx | null {
  const d = b.re * b.re + b.im * b.im;
  if (d < 1e-18) return null;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/**
 * Which constraints are a MULTIPLICATION between numbers that are both on the canvas.
 *
 * Read structurally — `w = z·u`, in either orientation, with any of the three names possibly the
 * product — and then measured off the RESOLVED points rather than re-evaluated. That ordering matters:
 * an arc computed from the expression could disagree with the two dots it is drawn between, which is
 * the renderer-re-derives-geometry defect (ADR-044/201/380/423) arriving through the engine instead.
 */
function resolveRotations(
  constraints: readonly Constraint[],
  points: readonly DerivedPoint[],
): DerivedRotation[] {
  const at = new Map(points.map((p) => [p.name, p]));
  const out: DerivedRotation[] = [];
  constraints.forEach((c, i) => {
    if (c.kind && c.kind !== 'eq') return;
    const pair =
      productPair(c.lhs, c.rhs) ?? productPair(c.rhs, c.lhs);
    if (!pair) return;
    const from = at.get(pair.from);
    const to = at.get(pair.product);
    if (!from || !to) return;
    const rFrom = Math.hypot(from.z.re, from.z.im);
    const rTo = Math.hypot(to.z.re, to.z.im);
    if (rFrom < 1e-12) return; // a rotation of the origin is not a picture, it is a point
    const raw = to.argumentDeg - from.argumentDeg;
    out.push({
      key: `rot-${pair.from}-${pair.product}-${i}`,
      from: pair.from,
      to: pair.product,
      src: c.src ?? '',
      byDeg: ((((raw + 180) % 360) + 360) % 360) - 180,
      scale: rTo / rFrom,
      known:
        from.modulusKnown && from.argumentKnown && to.modulusKnown && to.argumentKnown,
    });
  });
  return out;
}

/** `product = from · anything` — the naming half of the rotation reading. */
function productPair(product: Expr, rhs: Expr): { product: string; from: string } | null {
  if (product.t !== 'ref' || rhs.t !== 'mul') return null;
  // either factor may be the number being turned; the other is the multiplier, whatever it is
  for (const [a, b] of [
    [rhs.l, rhs.r],
    [rhs.r, rhs.l],
  ]) {
    if (a.t === 'ref' && a.name !== product.name && !mentions(b, product.name)) {
      return { product: product.name, from: a.name };
    }
  }
  return null;
}

const mentions = (e: Expr, name: string): boolean =>
  refNamesOf(e).includes(name);

function refNamesOf(e: Expr): string[] {
  switch (e.t) {
    case 'ref':
      return [e.name];
    case 'mul':
    case 'div':
    case 'add':
    case 'sub':
      return [...refNamesOf(e.l), ...refNamesOf(e.r)];
    case 'pow':
      return refNamesOf(e.base);
    case 'conj':
    case 'neg':
    case 'abs':
      return refNamesOf(e.e);
    default:
      return [];
  }
}

/** A stated radius is a number or a real parameter; anything else is not a length. */
function radiusValue(e: Expr, sample: ReadonlyMap<string, number>): number | null {
  switch (e.t) {
    case 'num':
      return toNumber(e.v);
    case 'param':
      return sample.get(e.name) ?? null;
    case 'mul': {
      const l = radiusValue(e.l, sample);
      const r = radiusValue(e.r, sample);
      return l !== null && r !== null ? l * r : null;
    }
    case 'val': {
      const v = evaluate(e.v);
      return v ? Math.hypot(v.re, v.im) : null;
    }
    default:
      return null;
  }
}

/** The circle through three points, or null when they are collinear. */
function circumcircle(a: Cx, b: Cx, c: Cx): { center: Cx; r: number } | null {
  const d = 2 * (a.re * (b.im - c.im) + b.re * (c.im - a.im) + c.re * (a.im - b.im));
  if (Math.abs(d) < 1e-12) return null;
  const sa = a.re * a.re + a.im * a.im;
  const sb = b.re * b.re + b.im * b.im;
  const sc = c.re * c.re + c.im * c.im;
  const center = {
    re: (sa * (b.im - c.im) + sb * (c.im - a.im) + sc * (a.im - b.im)) / d,
    im: (sa * (c.re - b.re) + sb * (a.re - c.re) + sc * (b.re - a.re)) / d,
  };
  return { center, r: Math.hypot(a.re - center.re, a.im - center.im) };
}

const round2 = (x: number): string => `${Math.round(x * 100) / 100}`;

/**
 * #1436 — the ≈ honesty floor, decided where the number is spelled (the stage-5d readings' own
 * rule): a decimal whose spelling IS the value («5», «2.5») keeps `=`; a rounded spelling
 * («2.83» for 2√2) carries `approx`, and the reading layer prints `≈`.
 */
const numAnswer = (x: number): { value: string; approx?: true } => {
  const text = round2(x);
  return Math.abs(Number(text) - x) <= 1e-9 * Math.max(1, Math.abs(x)) ? { value: text } : { value: text, approx: true };
};

/** The complex twin — the same spelling the decimal path always used, judged part by part. */
const cxAnswer = (z: Cx, real: boolean): { value: string; approx?: true } => {
  if (real) return numAnswer(z.re);
  const re = numAnswer(z.re);
  const im = numAnswer(Math.abs(z.im));
  return { value: `${re.value}${z.im < 0 ? '-' : '+'}${im.value}i`, ...(re.approx || im.approx ? { approx: true as const } : {}) };
};

/**
 * The coefficient of a gauge expression: `15r`, not `15.0000001r`, and `r` rather than `1r`.
 *
 * A whole number that the minimiser reached to within a hair is printed as the whole number — the exam
 * answer is `15r`, and a student who typed the given cannot be shown their own figure as `14.999998r`.
 * The snap is deliberately tight: it corrects float noise, it never rounds a value into a lie.
 */
/** #1436 — approx marker for a gauge coefficient: set only when the 4-decimal print lost value
 *  (the whole-number snap is the established float-noise policy, not a rounding). */
const coeffApprox = (c: number): { approx?: true } => {
  const near = Math.round(c);
  if (Math.abs(c - near) <= 1e-6 * Math.max(1, Math.abs(c))) return {};
  return Math.round(c * 1e4) / 1e4 === c ? {} : { approx: true };
};

function fmtCoefficient(c: number): string {
  const near = Math.round(c);
  const v = Math.abs(c - near) <= 1e-6 * Math.max(1, Math.abs(c)) ? near : Math.round(c * 1e4) / 1e4;
  return v === 1 ? '' : `${v}`;
}

const exactLabelOf = (mod: ExpVec, arg: Angle): string | null => {
  const v = exact(mod, arg);
  return evaluate(v) ? formatPolar(v) : null;
};

// Display typography for the degree read-out comes from the SHARED formatter (shell/format,
// #723): at most two decimals — `53.13°` — by operator rule, for every tool. The angle itself
// stays full-precision in the model; only the reading is trimmed.

/**
 * STAGE 5d — the one place a plotted number becomes the text a student reads.
 *
 * Three things are said, in this order of preference:
 *
 * 1. **A symbolic form, with `=`.** `z₁ = √2·cis45°`. `=` is reserved for a value the givens force
 *    AND that the exact core carries in closed form.
 * 2. **Otherwise the polar decimal, with `≈`.** `z₁ ≈ 5·cis53.1301°`. The value may be perfectly
 *    determined — `3+4i` forces both halves — and still have no closed form, because its argument is
 *    not a rational multiple of π. `≈` then says what is true: the typography is decimal.
 * 3. **`~` on whichever half is a SAMPLE** rather than a given, so «always visualise» (ADR-CX-001 D3)
 *    never costs honesty (ADR-052): the figure is drawn, and the drawn number says which of its two
 *    coordinates the student actually stated.
 *
 * There is deliberately no fourth case in which a point carries only its name. That was the defect:
 * silence read as "nothing to say" when what was missing was only a symbolic rendering.
 */
function readingOf(p: {
  display: string;
  exactLabel: string | null;
  modulus: string;
  modulusKnown: boolean;
  argumentDeg: number;
  argumentKnown: boolean;
}): string {
  const label = p.display;
  if (p.exactLabel) return `${label} = ${p.exactLabel}`;
  /**
   * The NO-GUESS ruling (B6 follow-up, operator 2026-08-18): a numeric value prints only when the
   * givens fully determine it. A sampled magnitude or angle is the DRAWING's freedom, not a value —
   * «z₂ ≈ ~1.81·cis~193.68°» presented a guess as a near-value, and the operator ruled "the system
   * should not guess them; we just say we don't have them". Undetermined → the reading is the bare
   * name (the canvas shows the name; the panel adds its "no value" clause in `v2Labels`). The ~
   * convention for printed numerals dies with this; a partially-known magnitude still surfaces
   * through the measures/knowledge lanes, which gate on knowledge already.
   */
  if (!p.modulusKnown || !p.argumentKnown) return label;
  return `${label} ≈ ${p.modulus}·cis${fmtNum(p.argumentDeg)}°`;
}

/**
 * #703 — the CARTESIAN reading («z₁ = 3+4i» / «z ≈ 1.88+0.68i»), stage 5d's second view of the same
 * point. Three things are said, in this order of preference (#1404, ADR-CX-046):
 *
 * 1. **Exact radical parts, with `=`**, when the exact carriers give them in closed form AND each
 *    part prints at most one root sign (the operator's 2026-09-25 ruling) — `2·cis120°` reads
 *    `-1+√3i`, `z^5 = 100` gives `⁵√100`; `2·cis22.5°` or `⁵√100·cis72°` would need two signs in
 *    a part, so they fall to 3 (`value/cartesian`'s `readableCartesianParts`).
 * 2. **Integers, with `=`**, when both parts land on integers within float noise — every `a+bi`
 *    definition the curriculum types, including those whose argument is an atom (`3+4i`).
 * 3. **Decimals, with `≈`**, at the #723 display precision — cos 20° has no radical form, and the
 *    display never invents one.
 *
 * Composition is the value layer's ONE composer, so a zero part is dropped on every path («-2»,
 * «2i»). The no-guess rule binds identically to the polar reading: undetermined → the bare name.
 */
function readingCartOf(p: {
  display: string;
  z: Cx;
  known: boolean;
  exactParts: ReturnType<typeof readableCartesianParts>;
}): string {
  const label = p.display;
  if (!p.known) return label;
  if (p.exactParts) return `${label} = ${composeCartesian(p.exactParts.re, p.exactParts.im)}`;
  const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
  const exact = isInt(p.z.re) && isInt(p.z.im);
  const fmt = (x: number) => (exact ? `${Math.round(x)}` : fmtNum(x));
  const body = composeCartesian(numericPart(p.z.re, fmt), numericPart(p.z.im, fmt));
  return `${label} ${exact ? '=' : '≈'} ${body}`;
}

function collectParams(c: Constraint): string[] {
  const out: string[] = [];
  const walk = (e: Expr): void => {
    switch (e.t) {
      case 'param':
        out.push(e.name);
        return;
      case 'mul':
      case 'div':
      case 'add':
      case 'sub':
        walk(e.l);
        walk(e.r);
        return;
      case 'pow':
        walk(e.base);
        return;
      case 'conj':
      case 'neg':
      case 'abs':
        walk(e.e);
        return;
      default:
        return;
    }
  };
  walk(c.lhs);
  walk(c.rhs);
  return out;
}



/** #1434 — an expression that names no number and no parameter: a closed constant. */
const isClosed = (e: Expr): boolean => refsOf(e).length === 0 && paramsOf(e).length === 0;
