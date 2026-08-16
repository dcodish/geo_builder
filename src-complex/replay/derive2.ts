/**
 * REPLAY (v2) — the ordered fact list folded into a figure, through the tier-1 solver.
 *
 * Same discipline as every sibling: **the fact list is the source of truth and the figure is derived**,
 * so positions are never stored and undo cannot desync. What is new is what sits in the middle — the
 * exact linear solve ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)) instead of per-fact
 * iteration, which is why the systems in #607's family reach a figure at all.
 *
 * ## The bridge, and why it is deliberately throwaway
 *
 * The v2 engine has no parser yet — that is S4 (#621), and it must be built with span accounting and
 * the lexicon from its first rule ([ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009)).
 * Writing a second parser here to get something on screen sooner would be exactly the shortcut that
 * plan forbids. So this module instead **reads the prototype parser's own facts** and translates them,
 * which lets the new engine be played through the existing input box today and leaves nothing to
 * un-learn later: `bridgeFacts` is deleted whole when S4 lands, and the solver below is untouched.
 *
 * A form the bridge cannot translate is REPORTED, never silently skipped — an untranslated fact would
 * otherwise vanish from a figure that still looked plausible, which is the silent-drop class the
 * siblings paid for 33 times over.
 */

import type { Cx } from '../value/value';
import { cPolar, evaluate, exact, formatPolar, fromCartesian } from '../value/value';
import { type Rat, fromNumber, rat, toNumber } from '../value/rational';
import { type ExpVec, evaluate as evalMod, format as fmtMod } from '../value/modulus';
import { type Angle, toDegrees } from '../value/angle';
import { type Expr, abs, conj, div, mul, neg, num, param, paramsOf, pow, ref, val } from '../model/expr';
import { type Branch, isTurnUnknown, solveTier1 } from '../solve/tier1';
import type { Claim as Assertion, CheckedClaim } from '../model/claim';
import { type FigureObject, ORIGIN, objectPoints } from '../model/figure';
import { type CheckedMeasure, type MeasureQuery, type MeasureRelation, measureOf } from '../model/measure';
import { type KnowledgeRow, isKnowledge, whyNotKnowledge } from '../model/knowledge';
import { type Bound, solveResiduals } from '../solve/tier2';
import { type Env, type ResidualSpec, deferredResidual, evalReal, measureResidual } from '../solve/residuals';
import { verifyClaims } from '../solve/claims';
import { filterBranches, quadrant } from '../solve/filter';
import type { BranchFilter, Constraint } from '../model/constraint';

// The prototype's fact/expression types — the ONLY import from the retiring engine, and the whole
// surface the deletion in S4 has to touch.
import type { Expr as ProtoExpr, Fact as ProtoFact } from '../engine/model';

/** A fact the bridge could not translate, with the reason — surfaced, never swallowed. */
export interface Untranslated {
  readonly factId: string;
  readonly src: string;
  readonly why: string;
}

export interface BridgeResult {
  readonly constraints: Constraint[];
  readonly filters: BranchFilter[];
  /** free numbers: named, unconstrained, two degrees of freedom each */
  readonly freeNames: string[];
  /** angle atoms a cartesian literal introduced, with the degrees they stand for */
  readonly sample: Map<string, number>;
  readonly untranslated: Untranslated[];
}

const asRat = (x: number): Rat | null => fromNumber(x, 10_000, 1e-9);

/**
 * The numeric value of a REF-FREE subtree, or null if it mentions a number the student named.
 *
 * This exists because `3+4i` reaches the bridge as an ADDITION — the prototype parses the cartesian
 * form structurally — and a naive "no addition ⇒ monomial" test would push every cartesian literal to
 * the numeric tier. But a constant expression is a *literal* whatever its syntax: `3+4i` is one number
 * with modulus exactly 5. Folding constants before classifying is what keeps the syntax of a literal
 * from deciding whether the engine can be exact about it.
 */
function literalValue(e: ProtoExpr): Cx | null {
  switch (e.t) {
    case 'lit':
      return e.v;
    case 'bin': {
      const l = literalValue(e.l);
      const r = literalValue(e.r);
      if (!l || !r) return null;
      switch (e.op) {
        case '+':
          return { re: l.re + r.re, im: l.im + r.im };
        case '-':
          return { re: l.re - r.re, im: l.im - r.im };
        case '*':
          return { re: l.re * r.re - l.im * r.im, im: l.re * r.im + l.im * r.re };
        case '/': {
          const d = r.re * r.re + r.im * r.im;
          if (d === 0) return null;
          return { re: (l.re * r.re + l.im * r.im) / d, im: (l.im * r.re - l.re * r.im) / d };
        }
      }
      return null;
    }
    case 'neg': {
      const x = literalValue(e.e);
      return x ? { re: -x.re, im: -x.im } : null;
    }
    case 'conj': {
      const x = literalValue(e.e);
      return x ? { re: x.re, im: -x.im } : null;
    }
    case 'abs': {
      const x = literalValue(e.e);
      return x ? { re: Math.hypot(x.re, x.im), im: 0 } : null;
    }
    case 'pow': {
      const x = literalValue(e.base);
      if (!x || !Number.isInteger(e.exp) || e.exp < 0) return null;
      let acc = { re: 1, im: 0 };
      for (let i = 0; i < e.exp; i++) acc = { re: acc.re * x.re - acc.im * x.im, im: acc.re * x.im + acc.im * x.re };
      return acc;
    }
    default:
      return null;
  }
}

/** A prototype expression → a v2 expression, or null when it has no exact reading. */
function bridgeExpr(e: ProtoExpr, sample: Map<string, number>, label: string): Expr | null {
  // constants first, whatever their syntax — see literalValue
  const konst = literalValue(e);
  if (konst) {
    const re = asRat(konst.re);
    const im = asRat(konst.im);
    if (re === null || im === null) return null;
    const lit = fromCartesian(re, im, label);
    if (lit.atomBinding) sample.set(lit.atomBinding.atom, lit.atomBinding.degrees);
    return val(lit.value);
  }

  switch (e.t) {
    case 'lit':
      return null; // unreachable: a literal is always constant, and was folded above
    case 'ref':
      return ref(e.name);
    case 'bin': {
      const l = bridgeExpr(e.l, sample, label);
      const r = bridgeExpr(e.r, sample, label);
      if (!l || !r) return null;
      return e.op === '*' ? mul(l, r) : e.op === '/' ? div(l, r) : null; // + and − are not monomial
    }
    case 'pow': {
      const b = bridgeExpr(e.base, sample, label);
      return b ? pow(b, rat(e.exp)) : null;
    }
    case 'neg': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? neg(x) : null;
    }
    case 'conj': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? conj(x) : null;
    }
    case 'abs': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? abs(x) : null;
    }
    default:
      return null; // re/im are additive projections — the numeric tier's business
  }
}

/** Prototype facts → the tier-1 inputs. Anything untranslatable is listed, not dropped. */
export function bridgeFacts(facts: readonly ProtoFact[]): BridgeResult {
  const constraints: Constraint[] = [];
  const filters: BranchFilter[] = [];
  const freeNames: string[] = [];
  const sample = new Map<string, number>();
  const untranslated: Untranslated[] = [];

  const give = (f: ProtoFact, why: string): void => {
    untranslated.push({ factId: f.id, src: f.src, why });
  };

  for (const f of facts) {
    switch (f.kind) {
      case 'free':
        freeNames.push(f.name);
        break;
      case 'def': {
        const rhs = bridgeExpr(f.expr, sample, f.name);
        if (!rhs) give(f, 'the definition is not multiplicative — it belongs to the numeric tier');
        else constraints.push({ lhs: ref(f.name), rhs, src: f.src });
        break;
      }
      case 'roots': {
        const rhs = bridgeExpr(f.rhs, sample, f.varName);
        if (!rhs) give(f, 'the equation’s right-hand side is not multiplicative');
        else constraints.push({ lhs: pow(ref(f.varName), rat(f.n)), rhs, src: f.src });
        break;
      }
      case 'eq': {
        const lhs = bridgeExpr(f.lhs, sample, 'eq');
        const rhs = bridgeExpr(f.rhs, sample, 'eq');
        if (!lhs || !rhs) give(f, 'the equation is not multiplicative on both sides');
        else constraints.push({ lhs, rhs, src: f.src });
        break;
      }
      case 'rel': {
        const r = f.rel;
        if (r.type === 'quad') {
          filters.push(quadrant(r.name, r.q));
        } else if (r.type === 'mod') {
          const k = asRat(r.k);
          if (k === null) {
            give(f, 'the magnitude factor has no exact reading');
            break;
          }
          const rhs = r.other
            ? mul(num(k), abs(ref(r.other)))
            : r.param
              ? mul(num(k), param(r.param))
              : num(k);
          if (r.cmp && r.cmp !== '=') give(f, 'a modulus INEQUALITY is a numeric-tier bound, not a linear row');
          else constraints.push({ kind: 'mod', lhs: abs(ref(r.name)), rhs, src: f.src });
        } else {
          // Σ sign·arg(name) = rhsDeg. Two signed terms is the corpus form (F4).
          const plus = r.terms.filter((t) => t.sign === 1);
          const minus = r.terms.filter((t) => t.sign === -1);
          const delta = asRat(r.rhsDeg / 360);
          if (r.cmp && r.cmp !== '=') {
            filters.push(
              r.cmp === '<' || r.cmp === '<='
                ? { kind: 'range', name: r.terms[0]?.name ?? '', maxDeg: rat(Math.round(r.rhsDeg)) }
                : { kind: 'range', name: r.terms[0]?.name ?? '', minDeg: rat(Math.round(r.rhsDeg)) },
            );
          } else if (delta === null || plus.length !== 1 || minus.length > 1) {
            give(f, 'only one-or-two-term argument equations are linearised so far');
          } else {
            constraints.push({
              kind: 'arg',
              lhs: ref(plus[0].name),
              rhs: minus.length ? ref(minus[0].name) : num(rat(1)),
              deltaTurns: delta,
              src: f.src,
            });
          }
        }
        break;
      }
      default:
        give(f, `“${f.kind}” has no v2 form yet`);
    }
  }

  return { constraints, filters, freeNames, sample, untranslated };
}

// ---------------------------------------------------------------------------

export interface DerivedPoint {
  readonly name: string;
  readonly z: Cx;
  readonly modulus: string;
  readonly argumentDeg: number;
  /** the exact polar text, when the whole value is carried exactly */
  readonly exactLabel: string | null;
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

export interface Derived2 {
  /** null when the givens contradict each other, with which system found it */
  readonly contradiction: null | 'modulus' | 'argument';
  readonly points: DerivedPoint[];
  /** the figure's non-numeric objects, resolved to this configuration (F6) */
  readonly objects: readonly DerivedObject[];
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
  /** answers to what the student ASKED to see — a number only when the givens force one (stage 5d) */
  readonly knowledge: readonly KnowledgeRow[];
  /** the filter that emptied the configuration set, when one did */
  readonly emptiedBy: BranchFilter | null;
  /** the student's ANSWERS, checked against the figure the givens produced — never drivers */
  readonly claims: readonly CheckedClaim[];
}

/** A deterministic positive sample for a parameter the student never valued (ADR-052: a START, not a fixed value). */
const paramSample = (name: string, seed: number): number => {
  let h = 2166136261;
  for (const ch of `${name}@${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 0.6 + ((h >>> 0) % 181) / 100;
};

/**
 * Fold the facts into a figure.
 *
 * `configIndex` selects among the enumerated branches — this is what "show another configuration"
 * advances, and because the branches come out of the integer turn-unknowns it is the exam's
 * «כל האפשרויות» rather than a separate feature.
 */
export function derive2(facts: readonly ProtoFact[], configIndex = 0, seed = 0): Derived2 {
  const bridged = bridgeFacts(facts);
  return foldConstraints(
    bridged.constraints,
    bridged.filters,
    bridged.freeNames,
    bridged.sample,
    bridged.untranslated,
    configIndex,
    seed,
  );
  // the bridge carries no objects: the prototype's `shape` facts are exactly what S4's grammar
  // replaces, and translating them would keep the retiring path alive one slice longer
}

/**
 * The one derivation both entry points share.
 *
 * Extracted rather than duplicated: two folds that must agree are two folds that will drift, and the
 * sibling trees paid for that repeatedly (ADR-346's mirror class). The bridge and the v2 parser differ only
 * in how they PRODUCE constraints; what happens to them afterwards is identical.
 */
export function foldConstraints(
  constraints: readonly Constraint[],
  filterList: readonly BranchFilter[],
  declaredNames: readonly string[],
  literalSample: ReadonlyMap<string, number>,
  untranslated: readonly Untranslated[],
  configIndex: number,
  seed: number,
  assertions: readonly Assertion[] = [],
  objects: readonly FigureObject[] = [],
  measures: readonly MeasureRelation[] = [],
  queries: readonly MeasureQuery[] = [],
): Derived2 {
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
   */
  const windows = new Map<string, { min: number; max: number }>();
  const narrow = (name: string, min: number, max: number): void => {
    const prev = windows.get(name);
    windows.set(name, { min: Math.max(prev?.min ?? -Infinity, min), max: Math.min(prev?.max ?? Infinity, max) });
  };
  for (const f of filterList) {
    if (f.kind === 'quadrant') narrow(f.name, (f.q - 1) * 90, f.q * 90);
    else if (f.kind === 'range') {
      if (f.minDeg) narrow(f.name, Number(f.minDeg.n) / Number(f.minDeg.d), Infinity);
      if (f.maxDeg) narrow(f.name, -Infinity, Number(f.maxDeg.n) / Number(f.maxDeg.d));
    } else narrow(f.name, Number(f.deg.n) / Number(f.deg.d), Number(f.deg.n) / Number(f.deg.d));
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
    return { at: (n) => pos.get(n), param: (p) => st.par.get(p) };
  };

  // --- TIER 2: drive the free basis to satisfy what tier 1 could not read ----
  const specs: ResidualSpec[] = [
    ...t1.deferred.map((c, i) => deferredResidual(c, i)),
    ...measures.map((m, i) => measureResidual(m, i)),
  ];
  // Only relations that can be EVALUATED join the residual vector; its length has to be constant for
  // the minimiser. One that cannot is `undecided` — a distinct answer from unsatisfied, and reported
  // as one rather than counted as a failure.
  const initialEnv = envFor(initial);
  const live: { spec: ResidualSpec; width: number }[] = [];
  for (const spec of specs) {
    const v = spec.values(initialEnv);
    if (v !== null) live.push({ spec, width: v.length });
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
      points.push({
        name,
        z: cPolar(m.value, a.deg),
        modulus: m.exact ? fmtMod(m.exact) : round2(m.value),
        /**
         * A DIRECTION, folded into one turn — not a winding.
         *
         * Tier 1 deliberately does not reduce turns, because `z⁵` genuinely winds five times and
         * `smallestPower` solves over the winding count. But that is a property of the exact ANGLE
         * carrier; a drawn point has a direction and nothing else. Passing the raw value through
         * printed «z₂ ≈ 3·cis-190440°» for a number sitting on the positive real axis — arithmetically
         * true, and useless. The exact carriers keep the winding; the plotted point does not.
         */
        argumentDeg: ((a.deg % 360) + 360) % 360,
        exactLabel: m.exact && a.exact ? exactLabelOf(m.exact, a.exact) : null,
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
  const unsatisfied = live
    .filter(({ spec }) => {
      const v = spec.values(finalEnv);
      return v === null || v.some((r) => Math.abs(r) > 1e-6);
    })
    .filter(({ spec }) => spec.key.startsWith('deferred'))
    .map(({ spec }) => spec.describe);

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
  const knowledge: KnowledgeRow[] = queries.map((q) => {
    const pts = q.points.map((n) => finalEnv.at(n));
    const value = pts.some((p) => p === undefined) ? null : measureOf(q.kind, pts as Cx[]);
    if (value === null || !isKnowledge(false, closure)) {
      return { label: q.src, value: null, why: whyNotKnowledge(closure) };
    }
    return { label: q.src, value: round2(value), why: '' };
  });

  return {
    contradiction: t1.inconsistent,
    points,
    objects: t1.inconsistent ? [] : resolveObjects(objects, points, sample),
    configCount,
    configIndex: index,
    freeDof: freeDofNames,
    untranslated,
    deferred: t1.deferred,
    measures: checkedMeasures,
    drivenDof: drivenCount,
    unsatisfied,
    knowledge,
    emptiedBy,
    claims: verifyClaims(assertions, t1, branch),
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

const exactLabelOf = (mod: ExpVec, arg: Angle): string | null => {
  const v = exact(mod, arg);
  return evaluate(v) ? formatPolar(v) : null;
};

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


