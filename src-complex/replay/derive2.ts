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

import type { Cx } from '../value/value';
import { cPolar, evaluate, exact, formatPolar } from '../value/value';
import { toNumber } from '../value/rational';
import { type ExpVec, evaluate as evalMod, format as fmtMod, isOne as modIsOne } from '../value/modulus';
import { type Angle, period as anglePeriod, toDegrees } from '../value/angle';
import { type Expr, paramsOf } from '../model/expr';
import { type Branch, isTurnUnknown, solveTier1 } from '../solve/tier1';
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
import { type KnowledgeRow, isKnowledge, whyNotKnowledge } from '../model/knowledge';
import { prettyName } from '../model/naming';
import type { SequenceKind, SequenceStatement } from '../model/sequence';
import { type SurfacedFormula, surfacedFormulas } from '../formulas/table';
import { type Bound, solveResiduals } from '../solve/tier2';
import {
  type Env,
  type ResidualSpec,
  deferredResidual,
  evalComplex,
  evalReal,
  measureResidual,
} from '../solve/residuals';
import { verifyClaims } from '../solve/claims';
import { filterBranches } from '../solve/filter';
import { type AffineArg, describeFilter, projectWindow, statedWindow, violatesDeg } from '../solve/window';
import type { BranchFilter, Constraint } from '../model/constraint';

/** A statement the fold could not use, with the reason — surfaced, never swallowed. */
export interface Untranslated {
  readonly factId: string;
  readonly src: string;
  readonly why: string;
}

export interface DerivedPoint {
  readonly name: string;
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
  /** how many valid configurations the givens leave — what "show another" cycles */
  readonly configCount: number;
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
  } = input;
  const t1 = solveTier1(constraints);

  const sample = new Map(literalSample);
  for (const c of constraints) {
    for (const p of collectParams(c)) if (!sample.has(p)) sample.set(p, paramSample(p, seed));
  }
  // An OBJECT or a MEASURE can be the only mention of a parameter — «המעגל שמרכזו O ורדיוסו r» and
  // «אורך z1z2 = 15r» each name `r` where no constraint does. Sampling only what the constraints
  // mention left the circle with no radius (it silently did not draw) and the measure undecidable
  // (it silently did not drive): the same omission, surfacing two different ways.
  for (const o of objects) {
    if (o.kind !== 'circle') continue;
    for (const p of paramsOf(o.radius)) if (!sample.has(p)) sample.set(p, paramSample(p, seed));
  }
  for (const m of measures) {
    for (const p of paramsOf(m.rhs)) if (!sample.has(p)) sample.set(p, paramSample(p, seed));
  }

  const { kept, emptiedBy } = filterBranches(t1.branches, filterList, sample);
  const configCount = kept.length;
  const index = configCount ? ((configIndex % configCount) + configCount) % configCount : 0;
  const branch: Branch | undefined = kept[index];

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
  const freeModNames = [
    ...new Set([...t1.modulus.free, ...drawnNames.filter((n) => !t1.modulus.determined.has(n))]),
  ];
  const freeArgNames = [
    ...new Set([
      ...t1.argument.free.filter((n) => !isTurnUnknown(n)),
      ...drawnNames.filter((n) => !t1.argument.determined.has(n) && !branch?.angles.has(n)),
    ]),
  ].filter((n) => !isTurnUnknown(n));
  const freeParamNames = [...sample.keys()].filter((p) => !literalSample.has(p));

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
    const d = t1.modulus.determined.get(name);
    if (!d) return { value: st.mod.get(name) ?? sampleModulus(name), exact: null };
    const base = evalMod(d.konst, st.par);
    if (base === null) return { value: sampleModulus(name), exact: null };
    let v = base;
    for (const [fn, c] of d.coefs) v *= Math.pow(st.mod.get(fn) ?? 1, toNumber(c));
    return { value: v, exact: d.coefs.size === 0 ? d.konst : null };
  };

  const argumentOf = (name: string, st: State): { deg: number; exact: Angle | null } => {
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
    // a real parameter of the exam's kind (`r`, `d`) is a positive magnitude
    ...freeParamNames.map(() => ({ lo: 1e-6 })),
  ];

  const solved =
    live.length > 0 && !t1.inconsistent
      ? solveResiduals(evaluateAt, encode(initial), { bounds })
      : null;

  const state = solved ? decode(solved.x) : initial;
  // the solved parameter values must reach everything downstream, objects included
  for (const [k, v] of state.par) sample.set(k, v);

  const points: DerivedPoint[] = [];
  if (!t1.inconsistent) {
    // the union: names the constraints mention PLUS bare declarations, so a number the student merely
    // named is still on the canvas (always-visualise) rather than waiting for a constraint to earn it
    for (const name of drawnNames) {
      const m = modulusOf(name, state);
      const a = argumentOf(name, state);
      if (!Number.isFinite(m.value) || !Number.isFinite(a.deg)) continue;
      const modulus = m.exact ? fmtMod(m.exact) : round2(m.value);
      // a cycle needs BOTH halves exact: unit modulus, and an argument that is a rational part of a turn
      const cycle = m.exact && a.exact && modIsOne(m.exact) ? anglePeriod(a.exact) : null;
      // a DIRECTION, folded into one turn — see the note on `argumentDeg` below
      const argumentDeg = ((a.deg % 360) + 360) % 360;
      const exactLabel = m.exact && a.exact ? exactLabelOf(m.exact, a.exact) : null;
      points.push({
        name,
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
          name,
          exactLabel,
          modulus,
          modulusKnown: m.exact !== null,
          argumentDeg,
          argumentKnown: a.exact !== null,
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
    if (v === null) return { relation: m, status: 'undecided', why: `לא ניתן לחשב את «${m.src}»` };
    // RELATIVE, because an area of 150r² and a length of 15r are not accurate to the same absolute
    // amount — a fixed epsilon would call the big one violated and the small one satisfied for the
    // same quality of solve.
    const want = evalReal(m.rhs, finalEnv) ?? 1;
    return Math.abs(v[0]) <= 1e-6 * Math.max(1, Math.abs(want))
      ? { relation: m, status: 'holds', why: `«${m.src}» — מתקיים בציור` }
      : { relation: m, status: 'violated', why: `«${m.src}» — אינו מתקיים בתצורה הזו` };
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
        .map((f) => f.src ?? describeFilter(f));

  const unsatisfied = [...unsatisfiedRelations, ...violatedFilters];

  /**
   * STAGE 5d — the only place a number the engine computed reaches a string.
   *
   * Every row asks {@link isKnowledge} first. A measure over a figure that still has freedom, or that
   * differs between configurations, prints no number at all: the answer to «what is the area?» is then
   * «the givens do not determine it yet», which is a real answer and is shown as one.
   */
  const drivenCount = solved ? consumedDimensions(evaluateAt, solved.x) : 0;
  const closure = {
    remainingDof: Math.max(0, freeDofNames.length - drivenCount),
    configCount,
  };
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
  ): string | null => {
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
      return freeParamNames.length === 0 ? round2(value) : null;
    }
    const unit = state.par.get(gaugeName);
    if (!unit || !Number.isFinite(unit)) return null;
    return `${fmtCoefficient(value / unit ** degree)}${gaugeName}${degree === 2 ? '²' : ''}`;
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
  const exprRows: KnowledgeRow[] = exprQueries.map((q) => {
    const here = evalComplex(q.expr, finalEnv);
    if (!here) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    const real = Math.abs(here.im) <= 1e-9 * Math.max(1, Math.hypot(here.re, here.im));
    const show = (z: Cx): string =>
      real ? round2(z.re) : `${round2(z.re)}${z.im < 0 ? '-' : '+'}${round2(Math.abs(z.im))}i`;
    if (isKnowledge(false, closure)) return { label: q.src, value: show(here), why: '' };
    if (!shapeFixed || !gaugeName || !real) {
      return { label: q.src, value: null, why: whyNotKnowledge(closure) };
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
    if (degree === 0) return { label: q.src, value: round2(here.re), why: '' };
    const power = degree === 1 ? '' : degree === 2 ? '²' : `^${degree}`;
    return {
      label: q.src,
      value: `${fmtCoefficient(here.re / unit ** degree)}${gaugeName}${power}`,
      why: '',
    };
  });

  const knowledge: KnowledgeRow[] = queries.map((q) => {
    const value = measureAt(finalEnv, q);
    if (value === null) return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    if (isKnowledge(false, closure)) return { label: q.src, value: round2(value), why: '' };
    const expressed = expressMeasure(q.kind, q.points, value);
    if (expressed) return { label: q.src, value: expressed, why: '' };
    return { label: q.src, value: null, why: whyNotKnowledge(closure) };
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
    if (isKnowledge(false, closure)) return { label: r.src, value: round2(value), why: '' };
    const invariant =
      shapeFixed &&
      symmetries.every((s) => {
        const a = measureAt(s.env, r.numerator);
        const b = measureAt(s.env, r.denominator);
        if (a === null || b === null || Math.abs(b) < 1e-12) return false;
        return Math.abs(a / b - value) <= 1e-6 * Math.max(1, Math.abs(value));
      });
    return invariant
      ? { label: r.src, value: round2(value), why: '' }
      : { label: r.src, value: null, why: whyNotKnowledge(closure) };
  });

  return {
    contradiction: t1.inconsistent,
    points,
    objects: t1.inconsistent ? [] : resolveObjects(objects, points, sample),
    sequences: t1.inconsistent ? [] : resolveSequences(sequences, points),
    rotations: t1.inconsistent ? [] : resolveRotations(constraints, points),
    configCount,
    configIndex: index,
    freeDof: freeDofNames,
    untranslated,
    deferred: t1.deferred,
    measures: checkedMeasures,
    drivenDof: drivenCount,
    unsatisfied,
    undecided,
    knowledge: [...knowledge, ...ratioRows, ...exprRows],
    canCycle: configCount > 1 || closure.remainingDof > 0,
    emptiedBy,
    claims: verifyClaims(assertions, t1, branch),
    formulas: t1.inconsistent ? [] : surfacedFormulas(constraints, configCount),
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
): DerivedObject[] {
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

    if (o.kind === 'segment' || o.kind === 'polygon') {
      out.push({ kind: o.kind, key, label, vertices, known });
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
 * The coefficient of a gauge expression: `15r`, not `15.0000001r`, and `r` rather than `1r`.
 *
 * A whole number that the minimiser reached to within a hair is printed as the whole number — the exam
 * answer is `15r`, and a student who typed the given cannot be shown their own figure as `14.999998r`.
 * The snap is deliberately tight: it corrects float noise, it never rounds a value into a lie.
 */
function fmtCoefficient(c: number): string {
  const near = Math.round(c);
  const v = Math.abs(c - near) <= 1e-6 * Math.max(1, Math.abs(c)) ? near : Math.round(c * 1e4) / 1e4;
  return v === 1 ? '' : `${v}`;
}

const exactLabelOf = (mod: ExpVec, arg: Angle): string | null => {
  const v = exact(mod, arg);
  return evaluate(v) ? formatPolar(v) : null;
};

/** four places, so `53.1301°` reads as a measurement and not as a claim to more precision than that */
const round4 = (x: number): number => {
  const r = Math.round(x * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};

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
  name: string;
  exactLabel: string | null;
  modulus: string;
  modulusKnown: boolean;
  argumentDeg: number;
  argumentKnown: boolean;
}): string {
  const label = prettyName(p.name);
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
  return `${label} ≈ ${p.modulus}·cis${round4(p.argumentDeg)}°`;
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


