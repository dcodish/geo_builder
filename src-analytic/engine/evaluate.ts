/**
 * Construction → figure. Pure, deterministic in the seed.
 *
 * The one design decision worth stating: an unpinned parameter is a **free DOF sampled inside its
 * domain**, not a fixed default ([ADR-052](../../docs/06-decisions.md#adr-052) carried over
 * verbatim). The figure must be drawable before `a` is pinned, so a value is chosen — but it
 * changes with the seed, which is what "show another configuration" cycles. A parameter that never
 * moved would be a given the question never gave, which is this codebase's cardinal sin.
 *
 * The domain is honoured HERE, at sampling time, which is D7 kind 1: a value outside it was never
 * a candidate, so `a > 0` never produces a negative sample and never has to report a failure.
 */
import { impliedRange, isDirectionSymbol, narrowedDomain, paramRegister, shapedObjectOf, toolSymbol, usedSymbols } from './carriers';
import { circumcentre, constructionOf, evalRule, footOn, incircleCentre, type Construction as RuleConstruction, type Pt } from './derived';
import { resolveCurve, curveExtent, type Box } from './curves';
import type { ClassifyResult } from './conic';
import { evalExpr, type Env } from './expr';
import { evalLengthExpr, type LengthExpr } from './lengths';
import { lineByName, normalizedLine, type NamedLine } from './lines';
import { provenanceOf, type PointProvenance } from './carriers';
import { minInteriorAngleOf, ringFaultsOf, SPREAD_MIN_DEG, thinRingsOf, type RingFault } from './rings';
import { angleAt, dirVector, equalityResidual, freeRank, residual, resolveChoices, solveLM, solveMultiStart, solvePreferring, SOLVE_RESOLUTION, TIGHT_TOLERANCE_FACTOR, withToleranceFactor, type Constraint, type SolveResult } from './solve';
import { nthHolds, orderedCrossings } from './crossing-order';
import { carryingLines } from './carryingLines';
import { segmentIdOf } from './cevian';
import { offInkExtensions } from '../../shell/offInk';
import { curveByName, inDomain, isFree, objectById, type ArcDef, type Construction, type Domain, type GeoObject, type Id, type CurveLabel, type NumCurve, type OrderSide, type Selector } from './types';

export interface FigurePoint {
  id: Id;
  x: number;
  y: number;
}

export interface FigureCurve {
  id: Id;
  label: CurveLabel;
  curve: NumCurve;
  /**
   * #1076 — a curve minted to CARRY a point is knowledge, not figure. It stays here, because the
   * solve needs it (it is what `on-curve` is measured against) and the data panel names it as the
   * provenance of the point that rides it. The RENDERER is what leaves it undrawn.
   */
  stated: boolean;
}

/**
 * An object that produced no drawable geometry, WITH the reason (#896).
 *
 * The reason is the whole point. `vacant` is not an error — an empty circle at this parameter
 * value is a legitimate state the domain filter needs to observe. The scope reasons are refusals,
 * and `derive` turns exactly those into a fault the student sees. Carrying only the id, as this
 * did, made the two indistinguishable and so made the refusal unreportable.
 */
export interface Vacancy {
  id: Id;
  reason: Extract<ClassifyResult, { ok: false }>['reason'];
  /** For `kind-mismatch`: what the equation actually describes (02c R7, #1514 pre-play). */
  actual?: NumCurve['kind'];
}

/** A drawn straight piece — a stated segment, or one side of a polygon (#1028). Carried as resolved
 *  endpoints so the renderer never looks a vertex up. */
export interface FigureSegment {
  id: Id;
  a: Pt;
  b: Pt;
  /**
   * WHOSE endpoints these are (#1065).
   *
   * The positions above are deliberate — the renderer is handed screen-ready pairs and never looks
   * a vertex up. But a segment that cannot say it is `AB` cannot be given `AB`’s length as a label,
   * and the operator asked for exactly that. The ids ride alongside; the renderer still consumes
   * only what it is handed.
   */
  ends: [Id, Id];
}

/**
 * A DRAWN ARC (#1622 E4, ADR-AG-220) — resolved to its circle and its angular extent, so the renderer projects it and
 * never looks a point up. `start` and `sweep` are in radians in WORLD space (counter-clockwise positive); `radii`
 * also draws the two bounding radii (a sector whose centre has no letter).
 */
export interface FigureArc {
  id: Id;
  cx: number;
  cy: number;
  r: number;
  start: number;
  sweep: number;
  radii: boolean;
}

/** A derived point's own construction — what a student would have to draw to find it (#1030).
 *  Computed always and rendered behind a toggle, so `Figure` stays a complete description of the
 *  figure and showing it is purely a display decision. */
export interface FigureConstruction extends RuleConstruction {
  /** The derived point this scaffolding belongs to. */
  id: Id;
}

export interface Figure {
  env: Env;
  points: FigurePoint[];
  curves: FigureCurve[];
  segments: FigureSegment[];
  /** The drawn arcs (#1622 E4) — absent on a figure built by hand, read as none. */
  arcs?: FigureArc[];
  construction: FigureConstruction[];
  /**
   * #1937/#1971 (ADR-AG-255) — the DASHED stretches that carry a construction point's line out to it when the point
   * lands off the drawn ink (a height's foot beyond its side, a concave quadrilateral's diagonal meet). Decoration,
   * like `construction`: no id, never in the fact list, recomputed per configuration. Absent on a hand-built
   * figure, read as none.
   */
  extensions?: Array<{ a: Pt; b: Pt }>;
  /** Objects that do not exist at this parameter value — named, never silently dropped. */
  vacant: Vacancy[];
  /** Constraints the solve could NOT meet. Non-empty means the figure must not be shown as if it
   *  satisfied its givens — the caller reports instead. */
  unsatisfied: Constraint[];
  /** Do the D7 branch selectors hold in this configuration? `false` asks for a different one. */
  selectorsOk: boolean;
  /** WHICH selectors failed, when `selectorsOk` is false (#1268) — the objects from `construction.selectors`,
   *  so a refusal is blamed on the sentence that stated them. Absent on a figure built by hand. */
  selectorsFailing?: Selector[];
  /**
   * Declared polygons whose drawn ring CONTRADICTS the noun that declared it — crossed, or collapsed
   * (#1158, #1166). Non-empty is the same kind of statement as `unsatisfied`: this configuration must
   * not be shown as though it satisfied its givens. See {@link ringFaultsOf}.
   */
  ringFaults: RingFault[];
  /**
   * Declared polygons whose givens HOLD here only on a COLLAPSED ring (#1849, ADR-AG-247): the thin-ring arm
   * (#1334, ADR-AG-143) met every residual, re-solved under the tightened tolerance, and the ring went flat.
   * That is the givens forcing the polygon flat — not a search that missed — so `derive` refuses the line
   * that completed it as a collapse. Absent when none (and on a figure built by hand).
   */
  collapsedRings?: Id[];
  /**
   * Declared polygons the configuration walk found CROSSED in every valid candidate it evaluated (#1927, ADR-AG-250):
   * `drawableAt` found nothing whole, and among at least {@link FORCED_RING_FLOOR} candidates whose givens, selectors
   * and named objects all held, this ring was crossed in each and simple in none. That is the givens placing its
   * vertices in a crossing order — a ring over a shape's points («ריבוע ABCD · מרובע ACBD») — and `derive` refuses the
   * line that completed it when the ring's `shapeDof` is 0 (samples are evidence; the affine argument is the proof). Set only on the fallback figure `drawableAt` returns; absent otherwise.
   */
  forcedCrossed?: Id[];
  /** Freedom the OBJECT carriers still have after the constraints — what the DOF cue reports. */
  carrierDof: number;
  /**
   * ARE THESE TWO POINTS FORCED ONTO ONE SPOT? (#1938, ADR-AG-254) — the freedom of the SEPARATION
   * `b − a` along the constraints, by {@link freedomOf}: `0` means no configuration the givens allow
   * can move them apart, so a coincidence here is a coincidence for ever. A freedom ELSEWHERE in the
   * figure (an unrelated free point) cancels out of it, which is the whole reason it exists.
   *
   * `undefined` is UNMEASURED — one of the two cannot be placed nearby — and must be read as "not
   * proven forced", never as "forced": the false refusal is the worse defect (ADR-AG-249's rule).
   *
   * **Lazy, memoised per pair, non-enumerable**, exactly like `RingFault.ringDof` and for the same
   * reason (#1874): a rank is paid only for a pair some caller actually asks about, and a figure
   * still compares and serialises as the fields it always had. Absent on a figure built by hand.
   */
  separationDof?: (a: Id, b: Id) => number | undefined;
  /** Per point: what the student's OWN givens fix about it — the canvas label (#1032). */
  provenance: Record<Id, PointProvenance>;
  /** The register symbols some object or constraint reads (#1343) — the ones a configuration is made of. */
  usedSymbols: string[];
  /**
   * The seed the DISCRETE choices of this configuration were resolved at (#1642, ADR-AG-197) — the figure's
   * own seed unless that seed's option contradicted the other givens and another option was taken at the
   * same samples. Absent on a figure built by hand (read as the seed).
   */
  choiceSeed?: number;
}

// ---------------------------------------------------------------------------
// Sampling a parameter inside its domain
// ---------------------------------------------------------------------------

/**
 * A free vertex's coordinate — deterministic in the seed and the point's own NAME, so two unplaced
 * vertices never coincide and each keeps its identity across a reseed.
 */
function freeCoord(seed: number, id: string, axis: 0 | 1, span: Span = DEFAULT_SPAN): number {
  let h = axis * 7919 + 13;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 100003;
  const { lo, hi } = axis === 0 ? span.x : span.y;
  return Math.round((lo + (hi - lo) * jitter(seed, h)) * 1e6) / 1e6;
}

/** Where the search starts, per axis. */
interface Span {
  x: { lo: number; hi: number };
  y: { lo: number; hi: number };
}

/**
 * Does this constraint name any of these points? A structural walk over the constraint's fields — the
 * constraint kinds carry their point ids under different keys (`a`/`b`, `u.a`, `terms[].a`, `id`),
 * and enumerating them per kind is the per-kind growth the residual/solver split exists to prevent.
 * Point ids are the student's labels (a capital letter with an optional digit); no other string field
 * of a constraint takes that shape.
 */
function mentionsAny(value: unknown, ids: ReadonlySet<Id>): boolean {
  if (typeof value === 'string') return ids.has(value);
  if (Array.isArray(value)) return value.some((v) => mentionsAny(v, ids));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some((v) => mentionsAny(v, ids));
  return false;
}

/** With nothing placed, the figure has no scale of its own and this is as good as any. */
const DEFAULT_SPAN: Span = { x: { lo: -6, hi: 6 }, y: { lo: -6, hi: 6 } };

/**
 * The region the solve STARTS its search in — the figure's own, not a fixed box (#1085).
 *
 * Operator, 2026-09-15, on an exam question whose part א says *"find A (two possibilities)"*: the
 * tool found one of them, at every one of forty configurations. The two answers are `(1,3)` and
 * `(11,13)`, and the search started every time inside `[-6, 6]²` — a box that contains the first and
 * not the second. A least-squares descent goes to the basin it starts in, so the second answer was
 * not merely rare, it was **unreachable**.
 *
 * The box was written when every test figure sat near the origin. It is a magnitude the product never
 * stated (ADR-052) and, worse, one that decides which ANSWERS exist. So the search now starts where
 * the figure lives: the box of everything the student has PLACED, grown by half its own size in each
 * direction so the search can reach past the given points, and never smaller than the default.
 */
/** A stated point's position, or null when it is not one (#1168's seeding needs the two ends). */
function pointAtId(c: Construction, env: Env, id: Id): Pt | null {
  const o = c.objects.find((q) => q.kind === 'point' && q.id === id);
  if (!o) return null;
  const x = evalExpr((o as { x: Parameters<typeof evalExpr>[0] }).x, env);
  const y = evalExpr((o as { y: Parameters<typeof evalExpr>[0] }).y, env);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function searchSpan(c: Construction, env: Env): Span {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'point') continue;
    const x = evalExpr(o.x, env);
    const y = evalExpr(o.y, env);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length === 0) return DEFAULT_SPAN;
  const axis = (vs: number[]) => {
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const grow = Math.max((hi - lo) / 2, 6);
    return { lo: lo - grow, hi: hi + grow };
  };
  return { x: axis(xs), y: axis(ys) };
}

/**
 * THE FIGURE'S SPAN, AS THE RESIDUALS' SCALE (#1492, ADR-AG-231) — the larger HALF-side of the arena the seeder
 * samples in (`searchSpan`: the stated points, padded by half their spread and at least 6 a side). That is the stated
 * points' own spread once it passes 12, and 6 + half of it below — so a figure with no stated point measures 6, the
 * scale its free vertices are drawn at. The cap on the `length-eq` operand normaliser (`residualRows`), at 1× as
 * ruled (2026-09-29): measured on the kite, the cap at this span gives 23/24 raw-whole, at twice it 13/24 — the far
 * field flattens again and the runaway seeds stall (round #1510's variant B at 4×: 13/24).
 *
 * Read off the STATED figure and the environment only, never off a free point's current position: a scale
 * that followed the moving point would grow with it, which is exactly the zero at infinity it exists to remove.
 * One function for every site that solves or judges, so the solve and the verdict measure one residual.
 */
export function residualScale(c: Construction, env: Env): number {
  const s = searchSpan(c, env);
  return Math.max(s.x.hi - s.x.lo, s.y.hi - s.y.lo) / 2;
}

/** A tiny deterministic hash → [0,1). Same seed, same figure; different seed, different figure. */
/**
 * Offsets the seed onto a second, disjoint jitter stream so an unbounded parameter's SIGN is drawn
 * independently of its magnitude (#1019). Large enough that no real seed count can reach it, so the
 * two streams cannot alias.
 */
const SIGN_STREAM = 100003;

/**
 * How near zero a residual must be for a given to count as HELD (#1062).
 *
 * Named once because it is now read on two paths — the solved figure and the fully determined one —
 * and a figure whose honesty depended on which path measured it would be worse than no check at all.
 * Residuals are scale-normalised by construction (`solve.ts`), so one absolute threshold is the right
 * shape here.
 */
const SATISFIED_EPS = 1e-6;

/**
 * Where `p` sits along `a → b`, as the projection parameter: 0 at `a`, 1 at `b`, past 1 beyond `b` (#1620).
 * A degenerate base (the two ends coincide) answers NaN, which no range test accepts.
 */
function beyondParam(a: Pt, b: Pt, p: Pt): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const nn = ux * ux + uy * uy;
  if (nn < 1e-24) return Number.NaN;
  return ((p.x - a.x) * ux + (p.y - a.y) * uy) / nn;
}

function jitter(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A value strictly inside the domain. The bounded case takes an interior point; a half-bounded
 * domain steps away from its bound; unbounded lands near 1..4. Excluded values are stepped over.
 */
export function sampleParam(d: Domain, seed: number, salt: number, reach = 1): number {
  const u = jitter(seed, salt);
  let v: number;
  if (d.min !== undefined && d.max !== undefined) {
    // Stay off both ends so an OPEN bound is never hit and a closed one is never sat on. A widened reach (#1939)
    // walks nearly the whole interval: the region a declared ring needs may lie near an end.
    v = reach > 1 ? d.min + (0.02 + 0.96 * u) * (d.max - d.min) : d.min + (0.2 + 0.6 * u) * (d.max - d.min);
  } else if (d.min !== undefined) {
    // reach 1 keeps the exact arithmetic it always had: a last-bit change moves a solve's basin
    v = reach === 1 ? d.min + 1 + 3 * u : d.min + (1 + 3 * u) * reach;
  } else if (d.max !== undefined) {
    v = reach === 1 ? d.max - 1 - 3 * u : d.max - (1 + 3 * u) * reach;
  } else {
    /**
     * UNBOUNDED — the only branch that was inventing a bound (#1019).
     *
     * `1 + 3 * u` is always in `[1, 4)`, so a parameter nobody bounded was asserted positive at every
     * seed: `y² = 2ax` drew a right-opening parabola in every configuration and nothing had said it
     * opens right. That is [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin — a default
     * value masquerading as a given. The bounded and half-bounded branches above are correct; they
     * respect what was stated, and this one did not.
     *
     * **Seed 0 stays positive.** ADR-052 permits a default as a *starting* point so the figure can be
     * drawn, and the familiar right-opening parabola is the better first draw for a student. What it
     * forbids is a default that never moves — so every later configuration may take either sign, and
     * «הציגו תצורה אחרת» reaches the other one.
     *
     * The sign is drawn independently per parameter (the salt rides along), so two unbounded symbols
     * do not march in lockstep and a figure with both can reach all four sign combinations.
     *
     * The magnitude stays in `[1, 4)`, which keeps every configuration away from the degenerate `0`
     * where `y²=2px` collapses to a doubled axis — the documented `vacant`, and the one value that
     * would be reported as "not at this value" rather than drawn.
     */
    const magnitude = (1 + 3 * u) * reach;
    const negative = seed !== 0 && jitter(seed + SIGN_STREAM, salt) < 0.5;
    v = negative ? -magnitude : magnitude;
  }
  for (let guard = 0; guard < 8 && !inDomain(d, v); guard += 1) v += 0.37;
  return v;
}

/**
 * The parameter assignment for a seed — the figure's free DOFs, resampled by "another
 * configuration".
 *
 * The register comes from {@link paramRegister}, which reads the OBJECTS and not only the F11
 * declarations (#1014). Sampling the declarations alone meant `y²=2ax` with no «a הוא פרמטר» — a
 * catalog entry — left `a` unbound, evaluated to `NaN`, and drew nothing while saying nothing. An
 * unstated magnitude is a free DOF ([ADR-052](../../docs/06-decisions.md#adr-052)), so it is
 * sampled; a declaration narrows its domain rather than granting it existence.
 */
export function sampleEnv(c: Construction, seed = 0, reach = 1): Env {
  const env: Record<string, number> = {};
  paramRegister(c).forEach((p, i) => {
    // #1621 (ADR-AG-215): a symbol a stated angle holds is sampled inside the range that angle allows.
    env[p.sym] = sampleParam(narrowedDomain(p.domain, impliedRange(c, p.sym)), seed, i + 1, reach);
  });
  return env;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Place every object, given the environment and an assignment for the FREE vertices.
 *
 * Split out of `evaluate` because the solve needs to run it many times: the residual of a
 * constraint is a function of where the points land, and where they land is a function of the free
 * vertices being searched over. One placement routine, used by both the search and the final
 * answer, so the figure the student sees is the figure the solver judged.
 */
function place(c: Construction, env: Env, free: Map<Id, Pt>): Map<Id, Pt> {
  const at = new Map<Id, Pt>();
  for (const o of c.objects) {
    switch (o.kind) {
      case 'point': {
        const x = evalExpr(o.x, env);
        const y = evalExpr(o.y, env);
        if (Number.isFinite(x) && Number.isFinite(y)) at.set(o.id, { x, y });
        break;
      }
      case 'free': {
        const v = free.get(o.id);
        if (v) at.set(o.id, v);
        break;
      }
      case 'derived': {
        // The curve resolver is handed in for the one rule whose parent is a curve (#1059); every
        // other rule ignores it, exactly as `residual` does with the same argument.
        const v = evalRule(o.rule, (id) => at.get(id) ?? null, curveAtOf(c, env, (id) => at.get(id) ?? null));
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) at.set(o.id, v);
        break;
      }
      default:
        break; // curves, segments and polygons hold no position of their own
    }
  }
  return at;
}

/**
 * THE CARRIER SYSTEM — the free vertices as a vector, and what the constraints say about it.
 *
 * Extracted (#1137) so the SOLVE and the LOCUS TRACER read the same residuals. The tracer walks the
 * null space of this exact Jacobian and re-solves at every step, and a second construction of "what
 * the constraints say" would be two definitions of the figure that drift apart — the failure this
 * codebase names repeatedly. `evaluate`'s own solve is the first caller and
 * [`locus.ts`](./locus.ts) is the second; there is no third way to ask.
 *
 * Pure over `(c, env)`: no seed, no starting point. WHERE the walk starts is the caller's business —
 * `evaluate` samples it, the tracer inherits the solved figure — and keeping that out of here is what
 * makes the system reusable at all.
 */
export interface CarrierSystem {
  /** The free vertices, in the order their coordinates occupy the vector (two entries each). */
  ids: Id[];
  /**
   * The PARAMETERS in the vector, after the vertices — one entry each (#1317, ADR-AG-144).
   *
   * Empty when the caller asked for them FIXED (the locus tracer, which walks a point's freedom at
   * one configuration of the parameters — #1186's question is deliberately left where it was).
   */
  syms: string[];
  /** Positions (and the environment's parameter values) → vector, and back. */
  toVec: (free: Map<Id, Pt>, env?: Env) => number[];
  asMap: (x: number[]) => Map<Id, Pt>;
  /** The environment at these vector values — the sampled one with the solved parameters written in. */
  envAt: (x: number[]) => Env;
  /** Every object's position at these carrier values — derived points included. */
  positionsAt: (x: number[]) => Map<Id, Pt>;
  /** The constraint residuals there. Empty when the figure states none. */
  residualsAt: (x: number[]) => number[];
  /**
   * The EQUATION rows only — `residualsAt` without the one-sided bound rows (#1556, ADR-AG-178). What the
   * freedom count ranks; the solve and the locus walk keep `residualsAt`, where a bound must bite.
   */
  equalitiesAt: (x: number[]) => number[];
}

/**
 * THE SOLVE VECTOR HOLDS EVERY UNKNOWN — free vertices AND parameters (#1317, ADR-AG-144).
 *
 * Before this the unknown vector was the free vertices alone, and a parameter was a constant the seed
 * had drawn: «N על הישר l3» on `(k+1)x+2y-12+5k=0` had a residual that depended on `k`, was evaluated
 * at whatever `k` the seed drew, and could not be driven to zero by any step the solver was able to take
 * — `unsatisfiable` was the honest report of a solve that was never given the unknown. The tree's own
 * contract had said since day one that *"pinning a parameter is a numeric root-find"*; it was simply
 * not wired. The class is *every given that determines a parameter* — an incidence, a slope, an area
 * over a point written `A(-9a, 0)` — so the fix is the vector, not any rule.
 *
 * `params: 'fixed'` keeps the old shape for the locus tracer: it walks a NAMED POINT's freedom at one
 * configuration of the figure's parameters, and letting the walk turn a parameter would make a 1-DOF
 * locus into a 2-DOF surface. Whether a parameterised locus should sweep its parameter is #1186, and
 * it is answered there, not here by accident.
 */
export function carrierSystem(
  c: Construction,
  env: Env,
  opts: { params: 'solve' | 'fixed' } = { params: 'solve' },
): CarrierSystem {
  const ids = freeIds(c);
  const syms = opts.params === 'solve' ? paramRegister(c).map((p) => p.sym) : [];
  const base = 2 * ids.length;
  const asMap = (x: number[]) =>
    new Map<Id, Pt>(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }]));
  const envAt = (x: number[]): Env => {
    if (syms.length === 0) return env;
    const out: Record<string, number> = { ...env };
    syms.forEach((sym, j) => {
      out[sym] = x[base + j];
    });
    return out;
  };
  const positionsAt = (x: number[]) => place(c, envAt(x), asMap(x));
  // Once per system, at the system's own environment (#1492): the scale must not move with the iterate.
  const scale = residualScale(c, env);
  return {
    ids,
    syms,
    asMap,
    envAt,
    toVec: (free, at = env) => [
      ...ids.flatMap((id) => [free.get(id)!.x, free.get(id)!.y]),
      ...syms.map((sym) => at[sym] ?? env[sym] ?? 0),
    ],
    positionsAt,
    /**
     * `lineAtOf` is threaded here, not only at the call sites (#1201 meets #1137).
     *
     * #1201 gave `residual` a line resolver so a stated distance to a line is DRIVEN rather than
     * silently dropped, and threaded it through the two solve call sites that existed then. #1137
     * later lifted those call sites into this system so the locus tracer walks the SAME residuals the
     * solve does — which is the whole point of the abstraction.
     *
     * Merging the two naively would have kept one and lost the other: the branch's `carrierSystem`
     * carried no `lineAtOf`, so a locus figure with a point-to-line distance would have solved against
     * a residual that could not see the line — #1201's defect, restored, inside the one place built to
     * guarantee the tracer and the solver agree. [#1210](https://github.com/dcodish/geo_builder/issues/1210)
     * predicted exactly this: *"the branch predates #1201 — a rebase changes what a locus is."*
     */
    residualsAt: (x) => {
      const e = envAt(x);
      const pos = positionsAt(x);
      const at = (id: Id) => pos.get(id) ?? null;
      return c.constraints.flatMap(
        (k) => residual(k, at, e, curveAtOf(c, e, at), lineAtOf(c, e, at), scale) ?? [0],
      );
    },
    equalitiesAt: (x) => {
      const e = envAt(x);
      const pos = positionsAt(x);
      const at = (id: Id) => pos.get(id) ?? null;
      return c.constraints.flatMap(
        (k) => equalityResidual(k, at, e, curveAtOf(c, e, at), lineAtOf(c, e, at), scale) ?? [0],
      );
    },
  };
}

/**
 * A `circle-thru` as the `NumCurve` it is in this configuration (#1464, #1324, ADR-AG-160).
 *
 * The circumcircle of three placed points, or the circle whose centre is a diameter's midpoint — closed
 * forms, so nothing is solved and the circle carries no freedom. `derived.ts`'s `circumcentre` is the one
 * circumcentre in the tree, so this circle and «O מפגש האנכים האמצעיים» cannot disagree.
 *
 * `null` is a VACANCY, as for the other constructive curves: an unplaced point, three collinear points, or
 * a diameter whose ends coincide has no circle at this configuration.
 */
export function circleThruCurve(o: Extract<GeoObject, { kind: 'circle-thru' }>, at: (id: Id) => Pt | null): NumCurve | null {
  /**
   * THE INSCRIBED CIRCLE (#1619 B2, ADR-AG-194) — centre where the bisectors meet (`incircleCentre`), radius
   * its distance to the first side. A degenerate or non-convex ring has none: a vacancy, as above.
   */
  if (o.def.t === 'incircle') {
    const vs = o.def.pts.map(at);
    if (vs.some((p) => !p)) return null;
    const ctr = incircleCentre(vs as Pt[]);
    if (!ctr) return null;
    const foot = footOn(ctr, vs[0]!, vs[1]!);
    if (!foot) return null;
    const r = Math.hypot(ctr.x - foot.x, ctr.y - foot.y);
    return Number.isFinite(r) && r > 0 ? { kind: 'circle', cx: ctr.x, cy: ctr.y, r } : null;
  }
  if (o.def.t === 'through') {
    const [p, q, s] = o.def.pts.map(at);
    if (!p || !q || !s) return null;
    const ctr = circumcentre(p, q, s);
    if (!ctr) return null;
    const r = Math.hypot(p.x - ctr.x, p.y - ctr.y);
    return Number.isFinite(r) && r > 0 ? { kind: 'circle', cx: ctr.x, cy: ctr.y, r } : null;
  }
  const a = at(o.def.a);
  const b = at(o.def.b);
  if (!a || !b) return null;
  const r = Math.hypot(a.x - b.x, a.y - b.y) / 2;
  if (!(r > 0) || !Number.isFinite(r)) return null;
  return { kind: 'circle', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r };
}

/**
 * A `line-at` as the `NumCurve` it is in this configuration (#1093; #1319 for the free direction).
 *
 * One reading for the object walk AND the curve resolver, so a line constructed through a point can be
 * crossed, measured against and asked about exactly as a stated line is — «A נקודת החיתוך של הישר l4
 * עם הישר 1» needs `curveAtOf` to answer for `l4`, and before this it answered only for equations.
 *
 * `null` is a VACANCY, not an error: the anchor may not be placed yet, and a direction read from
 * something unplaced (or a free angle no environment carries) is a line that does not exist at this
 * configuration.
 */
function lineAtCurve(
  c: Construction,
  env: Env,
  at: (id: Id) => Pt | null,
  o: Extract<GeoObject, { kind: 'line-at' }>,
): NumCurve | null {
  const p0 = at(o.through);
  const along = p0 ? dirVector(o.dir, at, curveAtOf(c, env, at), env) : null;
  // The perpendicular reading is the same construction a quarter turn on. Rotating the RESOLVED
  // vector keeps `Direction` a pure reference to something in the figure — it names an object, and
  // "that object turned 90°" is not an object.
  const v = along && (o.perp ? { x: -along.y, y: along.x } : along);
  if (!p0 || !v) return null;
  // Through `(px, py)` with direction `(vx, vy)`: the normal is `(vy, -vx)`, so the line is
  // `vy·x − vx·y + (vx·py − vy·px) = 0`. NORMALISED — one line, one triple (`normalizedLine`, #1201):
  // a free direction's angle may land on θ or θ + π at different configurations, and the raw triple
  // flips sign with it, which read to the knowledge gate as a line that moves when it does not.
  const n = normalizedLine(v.y, -v.x, v.x * p0.y - v.y * p0.x);
  return n ? { kind: 'line', ...n } : null;
}

/** Carrier freedom left after the constraints — `carriers − rank(J)`, so dependent givens do not
 *  over-count (see `freeRank`). */
/**
 * The figure's resolved CURVES, for the constraints that name one (#1052, #1066).
 *
 * «הישר l1 מקביל לישר l2» relates a direction; «A על הישר AB» relates an incidence. Both name an
 * object the constraint layer cannot see: `solve.ts` resolves points by id and knows nothing about
 * curves. Rather than teach it curves — which would drag the whole classifier into the solver — the
 * caller passes this resolver, and a curve that cannot be resolved reports "cannot be judged",
 * exactly as an absent point does.
 *
 * It hands over the whole `NumCurve` rather than a direction, because an incidence needs the curve's
 * own residual and a direction is only meaningful for a line. Deriving the direction is the caller’s
 * job, in `solve.ts`, where the distinction between the two already lives.
 */
/**
 * The resolver every constraint about a CURVE is measured through.
 *
 * It must know both ways a curve can exist, or a point told to lie on a circle given by its
 * CENTRE (#1060) is simply not judged: the residual answers "cannot be told", the solve has
 * nothing to pull on, and the point is drawn off the circle in silence.
 *
 * A `circle-at` needs the PLACED centre, which is why this takes the placement and not only the
 * environment.
 */
export function curveAtOf(c: Construction, env: Env, at?: (id: Id) => Pt | null): (id: Id) => NumCurve | null {
  return (id) => {
    const o = objectById(c, id);
    if (!o) return null;
    if (o.kind === 'circle-at') {
      const centre = at?.(o.centre);
      const r = evalExpr(o.r, env);
      if (!centre || !Number.isFinite(r) || r <= 0) return null;
      return { kind: 'circle', cx: centre.x, cy: centre.y, r };
    }
    // A line CONSTRUCTED through a point is a curve to every constraint that names one (#1319) — the
    // exam's «A נקודת החיתוך של הישר l4 עם הישר 1» is an incidence on a `line-at`.
    if (o.kind === 'line-at') return at ? lineAtCurve(c, env, at, o) : null;
    // A circle computed from points (#1464): a curve to every constraint and crossing that names one.
    if (o.kind === 'circle-thru') return at ? circleThruCurve(o, at) : null;
    if (o.kind !== 'curve') return null;
    const res = resolveCurve(o.curve, env);
    return res.ok ? res.curve : null;
  };
}

/**
 * The line a NAME denotes, in the configuration currently being judged (#1201).
 *
 * Built beside `curveAtOf` and for the same reason: `solve.ts` knows points by id and nothing else, so
 * anything that needs the CONSTRUCTION to resolve arrives already resolved. The resolution itself is
 * `engine/lines.ts`, shared with the ask lane and the click menu — one object, one answer, which is the
 * rule #1148 established and #1201 found a third caller for.
 *
 * `at` is the live positions, so the two-point reading follows the solver's iterate rather than some
 * earlier figure.
 */
export function lineAtOf(c: Construction, env: Env, at: (id: Id) => Pt | null): (name: string) => NamedLine | null {
  const curves = curveAtOf(c, env, at);
  return (name) =>
    lineByName(
      name,
      (n: string) => {
        // The ONE by-name lookup (ADR-AG-144): a constructed line answers to its name here too.
        const o = curveByName(c, n);
        return o ? curves(o.id) : null;
      },
      at,
    );
}

/**
 * The figure's freedom LEFT after the constraints, over EVERY unknown — free vertices and parameters
 * (#1317, ADR-AG-144) — as `unknowns − rank(J)`, so a parameter a given pins is subtracted exactly as a
 * coordinate is, and a dependent given still over-counts nothing. This is what `reportedDof` reports.
 */
function figureDofOf(c: Construction, sys: CarrierSystem, x: number[]): number {
  const n = 2 * sys.ids.length + sys.syms.length;
  if (n === 0) return 0;
  if (c.constraints.length === 0) return n;
  return freeRank(x, sys.equalitiesAt);
}

/**
 * A HARD ring fault carries the ring's OWN freedom (#1929, ADR-AG-249), so `derive` refuses a ring the givens pin
 * whatever else in the figure is free. A valid ring, or the trapezoid warning, pays nothing.
 *
 * **Measured LAZILY, once** (#1874, *"we cannot slow down anything"*): `drawableAt`'s walk evaluates many candidates
 * that carry a crossed ring and are discarded; ranking each one cost a crossed-parallelogram submit ~2 ms of 5.
 * Only the figure `derive` keeps is ever asked. Non-enumerable, so a fault still compares and serialises as the
 * three fields it always had.
 */
function withRingDof(rf: RingFault, c: Construction, sys: CarrierSystem, x: number[]): RingFault {
  if (!isHardRingFault(rf)) return rf;
  const o = objectById(c, rf.id);
  if (!o || o.kind !== 'polygon') return rf;
  const vertices = o.vertices;
  let memo: { v: number | undefined } | undefined;
  Object.defineProperty(rf, 'ringDof', {
    enumerable: false,
    get: () => {
      if (!memo) {
        const dof = freedomOf(c, sys, x, (pos) =>
          vertices.flatMap((v) => {
            const p = pos.get(v);
            return p ? [p.x, p.y] : [Number.NaN, Number.NaN];
          }),
        );
        memo = { v: dof === null ? undefined : dof };
      }
      return memo.v;
    },
  });
  /**
   * …and the freedom of its SHAPE UP TO AN AFFINE MAP (#1927, ADR-AG-250): `read` = every vertex's affine coordinates
   * over a base triangle of the ring's own vertices (the most spread one at `x`). `0` means every configuration the
   * givens allow is an affine image of this one — a shape's points (square, rectangle, parallelogram, rhombus, a
   * midpoint, a regular polygon) — and an affine map keeps every proper crossing, so a ring crossed here is crossed
   * in all of them: proof, not sampling. A ring whose shape can still change («A(k,0)»'s trapezoid, simple for k > 4
   * though the sampler never draws one) is not proven, and is never refused on the walk's samples alone.
   */
  let shapeMemo: { v: number | undefined } | undefined;
  Object.defineProperty(rf, 'shapeDof', {
    enumerable: false,
    get: () => {
      if (!shapeMemo) {
        const at0 = sys.positionsAt(x);
        const base = affineBase(vertices.map((v) => at0.get(v)));
        // An affine coordinate is dimensionless, so a genuine rate of change is about 1 / the ring's span.
        const span = Math.max(
          0,
          ...vertices.flatMap((u) =>
            vertices.map((w) => {
              const p = at0.get(u);
              const q = at0.get(w);
              return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
            }),
          ),
        );
        const dof =
          base === null || !(span > 0)
            ? null
            : tangentFreedomOf(sys, x, (pos) => {
                const [a, b, cc] = base.map((i) => pos.get(vertices[i]));
                if (!a || !b || !cc) return vertices.flatMap(() => [Number.NaN, Number.NaN]);
                const ux = b.x - a.x, uy = b.y - a.y, vx = cc.x - a.x, vy = cc.y - a.y;
                const det = ux * vy - uy * vx;
                return vertices.flatMap((v) => {
                  const q = pos.get(v);
                  if (!q || det === 0) return [Number.NaN, Number.NaN];
                  const wx = q.x - a.x, wy = q.y - a.y;
                  return [(wx * vy - wy * vx) / det, (ux * wy - uy * wx) / det];
                });
              }, 1 / span);
        shapeMemo = { v: dof === null ? undefined : dof };
      }
      return shapeMemo.v;
    },
  });
  return rf;
}

/**
 * A FIGURE CAN SAY WHETHER TWO OF ITS POINTS ARE FORCED TOGETHER (#1938, ADR-AG-254) — {@link Figure.separationDof}.
 *
 * `read` is the separation `b − a`, so `freedomOf` answers about THAT pair and an unrelated freedom cancels out: the
 * question a coincidence refusal has always been asking («if P and B must be on the same location … it should be
 * refused», the operator's 2026-09-20 T18 ruling) rather than the whole figure's DOF, which only ever approximated it.
 *
 * Lazy, memoised per unordered pair and non-enumerable, like {@link withRingDof} and for the same reasons (#1874): a
 * figure that nothing asks pays nothing, `drawableAt`'s discarded candidates pay nothing, and a figure still compares
 * and serialises as the fields it always had.
 */
function withSeparationDof(f: Figure, c: Construction, sys: CarrierSystem, x: number[]): Figure {
  const memo = new Map<string, number | undefined>();
  Object.defineProperty(f, 'separationDof', {
    enumerable: false,
    value: (a: Id, b: Id): number | undefined => {
      const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
      if (!memo.has(key)) {
        const dof = freedomOf(c, sys, x, (pos) => {
          const p = pos.get(a);
          const q = pos.get(b);
          // A point this configuration cannot place is UNMEASURED, never "held" — `freedomOf`'s own rule.
          return p && q ? [q.x - p.x, q.y - p.y] : [Number.NaN, Number.NaN];
        });
        memo.set(key, dof === null ? undefined : dof);
      }
      return memo.get(key);
    },
  });
  return f;
}

/**
 * How many independent directions the quantities `read` returns move in, ALONG the constraint manifold at `x` (#1927,
 * ADR-AG-250) — `freedomOf`'s question, asked by projection rather than by a stacked rank: the `read` rows' gradients
 * minus their component in the equations' row space, ranked at a tolerance relative to the size `unit` of a genuine change (a constant row is noise, not a scale).
 * Measured: a stacked elimination at `freeRank`'s 1e-9 read a rectangle's (fixed) affine coordinates as free, because
 * the residue of a dependent row is round-off at the scale of the EQUATIONS, not of the read. `null` when `read`
 * cannot place a value nearby.
 */
function tangentFreedomOf(
  sys: CarrierSystem,
  x: number[],
  read: (pos: Map<Id, Pt>, env: Env) => number[],
  /** The size of a GENUINE rate of change of `read`; a residue below a millionth of it is round-off. */
  unit: number,
): number | null {
  const n = x.length;
  if (n === 0) return 0;
  let unplaced = false;
  const jac = (f: (v: number[]) => number[]): number[][] => {
    const rows: number[][] = [];
    for (let j = 0; j < n; j += 1) {
      const h = Math.max(1e-6, Math.abs(x[j]) * 1e-6);
      const up = [...x];
      const dn = [...x];
      up[j] += h;
      dn[j] -= h;
      const fu = f(up);
      const fd = f(dn);
      fu.forEach((u, i) => {
        if (!Number.isFinite(u) || !Number.isFinite(fd[i])) unplaced = true;
        (rows[i] ??= new Array(n).fill(0))[j] = (u - fd[i]) / (2 * h);
      });
    }
    return rows;
  };
  const E = jac(sys.equalitiesAt);
  const R = jac((v) => read(sys.positionsAt(v), sys.envAt(v)));
  if (unplaced) return null;
  const dot = (a: number[], b: number[]) => a.reduce((s, ai, i) => s + ai * b[i], 0);
  /** Modified Gram–Schmidt: the orthonormal basis of `rows` beyond `basis`, keeping a row whose residue exceeds `tol`. */
  const extend = (basis: number[][], rows: number[][], tol: number): number => {
    let added = 0;
    for (const row of rows) {
      const v = [...row];
      for (const q of basis) {
        const k = dot(v, q);
        for (let i = 0; i < n; i += 1) v[i] -= k * q[i];
      }
      const norm = Math.sqrt(dot(v, v));
      if (norm > tol) {
        basis.push(v.map((vi) => vi / norm));
        added += 1;
      }
    }
    return added;
  };
  const scale = (rows: number[][]) => Math.max(1e-12, ...rows.map((row) => Math.sqrt(dot(row, row))));
  const basis: number[][] = [];
  extend(basis, E, 1e-9 * scale(E));
  return extend(basis, R, 1e-6 * Math.max(unit, scale(R)));
}

/** The three vertices (indices) spanning the largest triangle — the ring's own affine frame; `null` when flat. */
function affineBase(pts: ReadonlyArray<Pt | undefined>): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let area = 0;
  for (let i = 0; i < pts.length; i += 1)
    for (let j = i + 1; j < pts.length; j += 1)
      for (let k = j + 1; k < pts.length; k += 1) {
        const a = pts[i], b = pts[j], q = pts[k];
        if (!a || !b || !q) return null;
        const s = Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
        if (s > area) { area = s; best = [i, j, k]; }
      }
  return area > 0 ? best : null;
}

/**
 * THE FREEDOM OF ONE PART OF THE FIGURE (#1929, ADR-AG-249) — how many directions the quantities `read` returns can
 * still move in under the constraints, whatever the rest of the figure does.
 *
 * Computed as the figure's freedom minus its freedom with `read`'s values held as well: `figureDofOf` −
 * `freeRank` over the equations plus `read`'s rows. Rank-aware, so a vertex pinned by two lines, a derived vertex
 * and a parameter-carrying point all count as what they are; and a freedom ELSEWHERE (an unrelated free point, a
 * free circle) cancels out of the difference. `read` is generic: the ring's vertices for #1929, a line's own
 * position for its sibling (#1932). `null` when `read` cannot place a value near `x`.
 */
export function freedomOf(
  c: Construction,
  sys: CarrierSystem,
  x: number[],
  read: (pos: Map<Id, Pt>, env: Env) => number[],
): number | null {
  const all = figureDofOf(c, sys, x);
  if (all === 0) return 0;
  /** A value `read` cannot place in some nearby configuration is UNMEASURED (`null`), never "held": a NaN row would
   *  poison the rank and read as no freedom, which is the false refusal this must never produce. */
  let unplaced = false;
  const held = freeRank(x, (v) => {
    const rows = read(sys.positionsAt(v), sys.envAt(v));
    if (rows.some((n) => !Number.isFinite(n))) unplaced = true;
    return [...sys.equalitiesAt(v), ...rows.map((n) => (Number.isFinite(n) ? n : 0))];
  });
  return unplaced ? null : Math.max(0, all - held);
}

/**
 * Do the branch selectors hold here?
 *
 * They consume no freedom, so they cannot be solved FOR — they are a filter over configurations the
 * solve already produced, and a configuration that fails them asks for a different seed rather than
 * reporting a contradiction (D7 kind 2).
 */
/** A coordinate comparison, whichever spelling stated it (#1462). */
export type CoordCompare = Extract<Selector, { kind: 'coord-compare' }>;

/**
 * ONE COMPARISON, TWO SPELLINGS IN THE DATA (#1462, ADR-AG-161).
 *
 * `axis-side` («B על החלק החיובי של ציר x», «C ברביע השלישי», #1033/#1071) is a coordinate compared with 0,
 * so it is read as exactly that: the judge and the seeding below see one kind. Keeping the old kind in
 * the data costs nothing and moves no lock; growing a third sign mechanism beside it would be the drift
 * the plan forbids.
 */
export function compareOf(s: Selector): CoordCompare | null {
  if (s.kind === 'coord-compare') return s;
  if (s.kind === 'axis-side') {
    return { kind: 'coord-compare', id: s.id, axis: s.axis, greater: s.positive, rhs: { value: { kind: 'num', value: 0 } } };
  }
  return null;
}

/** The right-hand side's value in this configuration — `null` while a named point is unplaced. */
function rhsOf(cmp: CoordCompare, at: (id: Id) => Pt | null, env: Env): number | null {
  if ('point' in cmp.rhs) {
    const q = at(cmp.rhs.point);
    return q ? (cmp.axis === 'x' ? q.x : q.y) : null;
  }
  const v = evalExpr(cmp.rhs.value, env);
  return Number.isFinite(v) ? v : null;
}

/**
 * WHICH selectors fail here (#1268) — so a refusal blames the sentence whose selector failed, not every
 * sentence that happens to carry one. `derive` blamed every selector line when any failed, which named
 * «משולש ABC» (its vertices' `distinct`) beside the crossing sentence that was actually impossible.
 */
/**
 * The scale the DISTINCT test is measured against (#1077).
 *
 * Relative, because an absolute epsilon would be a magnitude this product never stated
 * (ADR-052) and would mean something different on a figure spanning 3 units and one spanning
 * 300.
 *
 * A HUNDREDTH of the span, measured rather than guessed: a thousandth was tried first and let
 * through a parallelogram whose `A` and `B` were 0.009 apart on a figure spanning 5 — about one
 * pixel, which is a collapsed figure to the student even though the numbers differ. The threshold
 * is about what a reader can SEE, so it is set where seeing stops.
 *
 * One function for the judge and for the solve's separation restart (#1463), so the solve moves a
 * point exactly when the judge would have rejected it.
 */
function apartOf(at: Map<Id, Pt>): number {
  return spanOf(at) * VISIBLE_FRACTION;
}

/**
 * WHERE SEEING STOPS, as a fraction of the extent it is measured against (#1077, #1526). One constant for
 * the `distinct` judge and for the display's separation preference, so "these two points read as one" is
 * decided by one number.
 */
export const VISIBLE_FRACTION = 1e-2;

/**
 * THE PAIRS OF NAMED POINTS A STUDENT WOULD SEE ON TOP OF EACH OTHER in this drawing (#1273, #1526,
 * ADR-AG-181) — the one question the display's separation preference asks, exported so its locks CALL it.
 *
 * Measured against the FRAME the figure is drawn in (`viewBox`, unpadded), at {@link VISIBLE_FRACTION}:
 * what reads as "on top" is a fraction of the canvas, not of the points' own spread — a figure of two
 * points has a point spread equal to their distance, so a spread-relative ruler can never flag it, and a
 * circle of radius 5 with two points 0.03 apart shows them stacked whatever the points' spread.
 *
 * #1526 is why it is not `crossings.apart()`: that is the IDENTITY tolerance ("is this the same crossing",
 * a millionth of the span), and borrowed as the display's ruler it let «Y נמצאת על הישר y=x» open 0.025
 * from V on a frame of 4 — two labels on one dot — because 0.025 is not the same point.
 */
export function stackedPairs(f: Figure): Array<[Id, Id]> {
  const b = viewBox(f, 0);
  const near = Math.max(b.maxX - b.minX, b.maxY - b.minY) * VISIBLE_FRACTION;
  const ps = f.points;
  const out: Array<[Id, Id]> = [];
  for (let i = 0; i < ps.length; i += 1)
    for (let j = i + 1; j < ps.length; j += 1)
      if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < near) out.push([ps[i].id, ps[j].id]);
  return out;
}

/** The figure's extent — the larger coordinate spread of its points (1 with fewer than two). */
function spanOf(at: Map<Id, Pt>): number {
  const xs = [...at.values()];
  return xs.length < 2 ? 1 : Math.max(
    1e-9,
    Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x)),
    Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y)),
  );
}

/**
 * HOW CLOSE TO AN OPEN BOUND A SOLVED VALUE MAY SIT AND STILL BE THE BOUND (#1504, ADR-AG-167 amendment 1).
 *
 * «r > 0» judged exactly let a radius the givens force to ZERO through as 8.6e-11 — a contradiction
 * («מבחוץ» then «מבפנים»; a centre on the axis it is tangent to) drawn green, the circle invisible.
 * The bound is judged at the SOLVER'S RESOLUTION instead (`SOLVE_RESOLUTION`, the operator-ruled
 * "indistinguishable by this solver" of ADR-AG-136), relative to the figure's scale — its point spread,
 * or its largest parameter magnitude when that is larger (a circle's radius is part of its extent) —
 * so it states no magnitude (ADR-052) and a value the descent merely APPROACHED the bound with is
 * the bound. One function, so every open bound the solve judges uses the same floor.
 */
export function openBoundFloor(at: Map<Id, Pt>, env: Env, syms: readonly string[], sampled = 0): number {
  return SOLVE_RESOLUTION * Math.max(figureScale(at, env, syms), sampled);
}

/**
 * THE FIGURE'S SCALE — its point spread, or its largest parameter magnitude when that is larger. The ruler
 * {@link openBoundFloor} is relative to.
 *
 * **A ruler measured on the solved figure ALONE collapses with it (#1620 S7, ADR-AG-213).** A figure with no
 * stated magnitude can satisfy a contradiction in the LIMIT of shrinking to a point: «AC קוטר במעגל O» and
 * the two tangents at A and C stated to MEET (they are parallel) drove every point and the radius together
 * toward the centre, and at r ≈ 4·10⁻⁶ the span was 4·10⁻⁶ too — so the floor, a fraction of that span,
 * called the radius positive and the figure was drawn green as one dot. So the solve also passes the scale
 * of the figure it STARTED from (`sampled` — the seeded vertices and the sampled parameters, every one
 * inside its domain): a descent that shrank the whole figure by more than the solver's resolution relative
 * to where it began has reached the bound, not a configuration. It states no magnitude (ADR-052) — the
 * sample's own extent is the reference — and a figure whose givens keep its size never comes near it.
 */
export function figureScale(at: Map<Id, Pt>, env: Env, syms: readonly string[]): number {
  let scale = spanOf(at);
  for (const sym of syms) {
    const v = Math.abs(env[sym]);
    if (Number.isFinite(v) && v > scale) scale = v;
  }
  return scale;
}

/**
 * The points a crossing is a SIBLING of (#1113) — every other point whose incidence signature matches.
 * Shared by the judge and the separation restart (#1463).
 */
function crossingSiblings(c: Construction, id: Id, at: Map<Id, Pt>): Id[] {
  const sig = (q: Id) =>
    JSON.stringify(
      c.constraints
        .filter((k) => 'id' in k && (k as { id?: Id }).id === q)
        .map((k) => JSON.stringify({ ...k, id: '' }))
        .sort(),
    );
  const mine = sig(id);
  return [...at.keys()].filter((other) => other !== id && sig(other) === mine);
}

/**
 * A CIRCLE'S REGION QUANTITY at this configuration (#1619 B1, ADR-AG-193) — the `power` of a point (|PC|² − r²,
 * positive outside) or the `arc-side` product (the point's side of the chord AB times the centre's, positive
 * on the major arc's side). Scale-free in sign, which is all the selector reads; a value within the solver's
 * resolution of zero is ON the boundary and counts as neither side, so a point the givens put ON the circle
 * never reads as "outside" by a rounding error. `null` when something it needs is not placed.
 */
export function circleQuantity(
  q: Extract<Extract<Selector, { kind: 'sign' }>['q'], { k: 'power' | 'arc-side' }>,
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): number | null {
  const k = curveAt(q.circle);
  const p = at(q.p);
  if (!k || k.kind !== 'circle' || !p) return null;
  const scale = Math.max(1, k.r * k.r);
  const zero = (v: number) => (Math.abs(v) <= SOLVE_RESOLUTION * scale ? 0 : v);
  if (q.k === 'power') return zero((p.x - k.cx) ** 2 + (p.y - k.cy) ** 2 - k.r * k.r);
  const a = at(q.a);
  const b = at(q.b);
  if (!a || !b) return null;
  const side = (x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  return zero(side(p.x, p.y)) * zero(side(k.cx, k.cy));
}

/**
 * TWO CIRCLES' QUANTITY at this configuration (#1622 E3, ADR-AG-219) — their mutual position (`circles`) or the
 * sides of a common tangent their centres are on (`centres-side`). Read off the SOLVED circles, so a circle on a
 * centre point, an equation circle and a created circle are one reading. Like {@link circleQuantity}, a value within
 * the solver's resolution of zero is ON the boundary and counts as neither side — two circles the givens make
 * touch are not "apart", a centre ON the tangent is on neither side. `null` when an operand is not placed.
 */
export function circlePairQuantity(
  q: Extract<Extract<Selector, { kind: 'sign' }>['q'], { k: 'circles' | 'centres-side' }>,
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): number | null {
  const a = curveAt(q.a);
  const b = curveAt(q.b);
  if (!a || !b || a.kind !== 'circle' || b.kind !== 'circle') return null;
  const scale = Math.max(1, a.r, b.r);
  const zero = (v: number) => (Math.abs(v) <= SOLVE_RESOLUTION * scale ? 0 : v);
  if (q.k === 'circles') {
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    if (q.rel === 'apart') return zero(d - (a.r + b.r));
    if (q.rel === 'inside') return zero(a.r - b.r - d);
    if (q.rel === 'cross') return zero(d - Math.abs(a.r - b.r));
    return zero(a.r - b.r);
  }
  const p = at(q.p);
  const r = at(q.q);
  if (!p || !r) return null;
  const len = Math.hypot(r.x - p.x, r.y - p.y);
  if (len < 1e-12) return null;
  const side = (x: number, y: number) => ((r.x - p.x) * (y - p.y) - (r.y - p.y) * (x - p.x)) / len;
  return zero(side(a.cx, a.cy)) * zero(side(b.cx, b.cy));
}

/**
 * AN ORDER'S DIFFERENCE at this configuration (#1621 D3, ADR-AG-216) — `left − right`, each side measured by the
 * function its equality twin is measured by: a length expression by `evalLengthExpr` (the `length-eq` residual's own
 * reader), an angle by `angleAt` (the `angle` residual's), in degrees. A difference within the solver's resolution of
 * zero, relative to the two sides, is ON the boundary and reads as 0 — so «AB < BC» on a figure with AB = BC is
 * refused rather than passed on a rounding, and «AB ≤ BC» there holds. `null` when an operand is not placed.
 */
export function orderQuantity(
  q: Extract<Extract<Selector, { kind: 'sign' }>['q'], { k: 'order' }>,
  at: (id: Id) => Pt | null,
  env: Env,
  lineAt?: (name: string) => NamedLine | null,
): number | null {
  const side = (o: OrderSide): number | null => {
    if (o.t === 'value') {
      const v = evalExpr(o.value, env);
      return Number.isFinite(v) ? v : null;
    }
    if (o.t === 'length') return evalLengthExpr(o.le, at, env, lineAt);
    const v = at(o.at.v);
    const a = at(o.at.a);
    const b = at(o.at.b);
    if (!v || !a || !b) return null;
    const theta = angleAt(v, a, b);
    return theta === null ? null : (theta * 180) / Math.PI;
  };
  const l = side(q.left);
  const r = side(q.right);
  if (l === null || r === null) return null;
  const d = l - r;
  return Math.abs(d) <= SOLVE_RESOLUTION * Math.max(1, Math.abs(l), Math.abs(r)) ? 0 : d;
}

/**
 * Which side of the vertex `p` is on, relative to the angle (a, v, b) (#1284, ADR-AG-209): the projection of `p − v`
 * on the internal bisector's direction (the sum of the two unit rays) — positive on the angle's side, negative on the
 * opposite ray's. `null` when an operand is unplaced or a ray has no length (nothing to judge).
 */
function angleSideOf(p: Pt, v: Pt | undefined, a: Pt | undefined, b: Pt | undefined): number | null {
  if (!v || !a || !b) return null;
  const la = Math.hypot(a.x - v.x, a.y - v.y);
  const lb = Math.hypot(b.x - v.x, b.y - v.y);
  if (la < 1e-12 || lb < 1e-12) return null;
  const dx = (a.x - v.x) / la + (b.x - v.x) / lb;
  const dy = (a.y - v.y) / la + (b.y - v.y) / lb;
  return (p.x - v.x) * dx + (p.y - v.y) * dy;
}

/**
 * WHERE A POINT IS AGAINST A RING (#1622, ADR-AG-217) — `boundary` within `near` of a side, else `inside` or
 * `outside` by the even-odd rule (a simple ring, which `rings.ts` holds every declared noun to).
 */
export function ringRegion(p: Pt, ring: readonly Pt[], near: number): 'inside' | 'outside' | 'boundary' {
  const n = ring.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const nn = ux * ux + uy * uy;
    const t = nn > 1e-24 ? Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.y - a.y) * uy) / nn)) : 0;
    if (Math.hypot(p.x - (a.x + t * ux), p.y - (a.y + t * uy)) <= near) return 'boundary';
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

/** The signed side of `p` against the line `ab`, as a distance — `null` when `ab` has no direction (#1622). */
function sideOfLine(p: Pt, a: Pt, b: Pt): number | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 1e-12)) return null;
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

/** Does a sign selector's quantity sit on its named side — the judge's own test, shared with the seeding below. */
const signHolds = (s: Extract<Selector, { kind: 'sign' }>, q: number): boolean =>
  s.positive ? (s.closed ? q >= 0 : q > 0) : s.closed ? q <= 0 : q < 0;

/**
 * Move ONE free point so the order holds at the start (#1621 D3, ADR-AG-216) — see the seeding loop in
 * `evaluateUncached`. The side that moves is the first one with a free point to move: a single length (one end
 * slides along the segment) or an angle (one ray turns about the vertex, keeping its length and its side). Its
 * target is `u` of the way into the region from the other side's value — for a length a factor (1 ± u), for an
 * angle a fraction of the room left before 0° or 180°. A side it cannot move, or a region with no room, is left
 * alone: the judge decides.
 */
function seedOrder(
  s: Extract<Selector, { kind: 'sign' }>,
  q: Extract<Extract<Selector, { kind: 'sign' }>['q'], { k: 'order' }>,
  seeded: Map<Id, Pt>,
  posOf: (id: Id) => Pt | null,
  env: Env,
  u: number,
): void {
  const now = orderQuantity(q, posOf, env);
  if (now === null || signHolds(s, now)) return;
  const valueOf = (o: OrderSide): number | null => {
    const one = { k: 'order' as const, left: o, right: { t: 'value' as const, value: { kind: 'num' as const, value: 0 } } };
    return orderQuantity(one, posOf, env);
  };
  for (const [mine, other, up] of [
    [q.left, q.right, s.positive],
    [q.right, q.left, !s.positive],
  ] as const) {
    const o = valueOf(other);
    if (o === null) continue;
    if (mine.t === 'length') {
      const t = mine.le.terms[0];
      if (mine.le.terms.length !== 1 || mine.le.expr.kind !== 'sym' || !t || (t.kind !== undefined && t.kind !== 'length')) continue;
      const [fixed, mover] = seeded.has(t.b) ? [t.a, t.b] : seeded.has(t.a) ? [t.b, t.a] : [null, null];
      if (!fixed || !mover) continue;
      const f = posOf(fixed);
      const m = seeded.get(mover)!;
      if (!f) continue;
      if (!up && !(o > 0)) continue; // a length below a non-positive value: no room
      const w = up ? Math.max(o, 0) * (1 + u) + (o > 0 ? 0 : u) : o * (1 - u);
      const d = Math.hypot(m.x - f.x, m.y - f.y);
      const [ux, uy] = d > 1e-9 ? [(m.x - f.x) / d, (m.y - f.y) / d] : [1, 0];
      seeded.set(mover, { x: f.x + ux * w, y: f.y + uy * w });
      return;
    }
    if (mine.t === 'angle') {
      const { v, a, b } = mine.at;
      const [fixed, mover] = seeded.has(b) && b !== v ? [a, b] : seeded.has(a) && a !== v ? [b, a] : [null, null];
      if (!fixed || !mover) continue;
      const pv = posOf(v);
      const pf = posOf(fixed);
      const m = seeded.get(mover)!;
      if (!pv || !pf) continue;
      if ((up && o >= 180) || (!up && o <= 0)) continue; // no room on the named side
      const w = ((up ? o + u * (180 - Math.max(o, 0)) : Math.min(o, 180) * (1 - u)) * Math.PI) / 180;
      const r = Math.hypot(m.x - pv.x, m.y - pv.y) || Math.hypot(pf.x - pv.x, pf.y - pv.y) || 1;
      const side = (pf.x - pv.x) * (m.y - pv.y) - (pf.y - pv.y) * (m.x - pv.x) < 0 ? -1 : 1;
      const phi = Math.atan2(pf.y - pv.y, pf.x - pv.x) + side * w;
      seeded.set(mover, { x: pv.x + r * Math.cos(phi), y: pv.y + r * Math.sin(phi) });
      return;
    }
  }
}

function failingSelectors(c: Construction, at: Map<Id, Pt>, env: Env): Selector[] {
  const apart = apartOf(at);

  const holds = (s: Selector): boolean => {
    // A region choice that reaches here unresolved (#1708) holds when one of its options does — the constraint
    // `choice`'s rule (`holds` in the locus check). `evaluate` resolves it first, so this is the raw reading only.
    if (s.kind === 'choice') return s.options.some(holds);
    /**
     * THE SIGN OF A DERIVED QUANTITY (#1323, ADR-AG-144) — «שיפוע הישר l1 שלילי».
     *
     * Judged inside validity, like every selector, so a configuration whose slope has the wrong sign is
     * not a figure this tool draws: `drawableAt` walks past it, and a figure with no freedom left is
     * reported on the sentence (the #1071 predicate `derive` already applies). A VERTICAL direction has
     * no slope, so a sign given about it does not hold — false, never "cannot be judged": the student
     * stated a sign, and a line with no slope contradicts it.
     */
    if (s.kind === 'sign') {
      const atFn = (id: Id) => at.get(id) ?? null;
      // A stated order between parameters («R > r», ADR-AG-219): the expression's value at this configuration.
      if (s.q.k === 'params') {
        const v = evalExpr(s.q.e, env);
        if (!Number.isFinite(v)) return true; // a symbol not in this configuration judges nothing, as below
        const zero = Math.abs(v) <= SOLVE_RESOLUTION * Math.max(1, Math.abs(v));
        return !zero && (s.positive ? v > 0 : v < 0);
      }
      if (s.q.k === 'circles' || s.q.k === 'centres-side') {
        const q = circlePairQuantity(s.q, atFn, curveAtOf(c, env, atFn));
        if (q === null) return true; // an operand not placed judges nothing, as below
        return s.positive ? q > 0 : q < 0;
      }
      /** AN ORDER (#1621 D3, ADR-AG-216) — strict unless the student wrote ≤ / ≥ (`closed`). */
      if (s.q.k === 'order') {
        const q = orderQuantity(s.q, atFn, env, lineAtOf(c, env, atFn));
        if (q === null) return true; // an operand not placed judges nothing, as below
        return signHolds(s, q);
      }
      if (s.q.k !== 'slope') {
        const q = circleQuantity(s.q, atFn, curveAtOf(c, env, atFn));
        if (q === null) return true; // an operand not placed (or a vacant circle) judges nothing, as below
        return s.positive ? q > 0 : q < 0;
      }
      const v = dirVector(s.q.u, atFn, curveAtOf(c, env, atFn), env);
      if (!v) return true; // an operand that is not placed yet judges nothing, as below
      if (Math.abs(v.x) < 1e-9 * Math.hypot(v.x, v.y)) return false;
      const positive = v.x * v.y > 0;
      return s.positive ? positive : !positive;
    }
    /**
     * EVERY ANGLE ACUTE (#1619 B2, ADR-AG-194) — at each vertex the two sides make a positive dot product.
     * A right angle is not acute: judged at the solver's resolution, relative to the sides, so a determined
     * right triangle is refused rather than passed on a rounding.
     */
    if (s.kind === 'acute') {
      const ps = s.ids.map((id) => at.get(id));
      if (ps.some((p) => !p)) return true; // an absent vertex judges nothing, as below
      const n = ps.length;
      for (let i = 0; i < n; i += 1) {
        const v = ps[i]!;
        const p = ps[(i + n - 1) % n]!;
        const q = ps[(i + 1) % n]!;
        const ux = p.x - v.x;
        const uy = p.y - v.y;
        const wx = q.x - v.x;
        const wy = q.y - v.y;
        if (ux * wx + uy * wy <= SOLVE_RESOLUTION * Math.hypot(ux, uy) * Math.hypot(wx, wy)) return false;
      }
      return true;
    }
    /**
     * TWO SEGMENTS CROSS (#1622, ADR-AG-218) — each segment's ends lie strictly on opposite sides of the other's line,
     * judged relative to the segments' own size (a touch at an end, within the solver's resolution, is not a crossing).
     */
    if (s.kind === 'segments-cross') {
      const [a, b, p, q] = [s.a, s.b, s.c, s.d].map((id) => at.get(id));
      if (!a || !b || !p || !q) return true; // an absent point judges nothing, as below
      const side = (u: Pt, v: Pt, w: Pt) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
      const tol = SOLVE_RESOLUTION * Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(q.x - p.x, q.y - p.y);
      const s1 = side(a, b, p);
      const s2 = side(a, b, q);
      const s3 = side(p, q, a);
      const s4 = side(p, q, b);
      return ((s1 > tol && s2 < -tol) || (s1 < -tol && s2 > tol)) && ((s3 > tol && s4 < -tol) || (s3 < -tol && s4 > tol));
    }
    if (s.kind === 'distinct') {
      const ps = s.ids.map((id) => at.get(id));
      // A selector about an absent point judges nothing, as below.
      if (ps.some((p) => !p)) return true;
      for (let i = 0; i < ps.length; i += 1) {
        for (let j = i + 1; j < ps.length; j += 1) {
          if (Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.y - ps[j]!.y) < apart) return false;
        }
      }
      return true;
    }
    /**
     * WHICH SIDE OF A LINE (#1622, ADR-AG-217) — a subject within the visible resolution of the line is ON it, which
     * is neither side, so it fails both readings (2-D's `points-line-side`).
     */
    if (s.kind === 'line-side') {
      const a = at.get(s.a);
      const b = at.get(s.b);
      if (!a || !b) return true;
      const sides: number[] = [];
      for (const id of s.ids) {
        const q = at.get(id);
        if (!q) return true; // an absent subject judges nothing, as below
        const d = sideOfLine(q, a, b);
        if (d === null) return true; // a line with no direction has no sides to judge
        sides.push(Math.abs(d) < apart ? 0 : Math.sign(d));
      }
      if (sides.some((x) => x === 0)) return false;
      return s.same ? sides.every((x) => x === sides[0]) : sides[0] !== sides[1];
    }
    const p = at.get(s.id);
    if (!p) return true; // a selector about an absent point judges nothing
    /**
     * INSIDE OR OUTSIDE A RING (#1622, ADR-AG-217) — the boundary is inside only for a `closed` region (an inscribed
     * vertex on its side); an open «בתוך» / «מחוץ ל» excludes it, as a point on a side is neither.
     */
    if (s.kind === 'in-polygon') {
      const ring = s.ring.map((id) => at.get(id));
      if (ring.some((q) => !q)) return true;
      const where = ringRegion(p, ring as Pt[], apart);
      if (where === 'boundary') return s.closed === true && s.inside;
      return (where === 'inside') === s.inside;
    }
    /**
     * A CROSSING IS NOT ITS SIBLING (#1113).
     *
     * Two sentences naming crossings of the same pair carry identical incidences, so nothing in the
     * solve distinguished them and both settled on the same root. The siblings are found here, from
     * the construction, because the parser is pure over one line: any other point whose incidence
     * SIGNATURE matches this one is a crossing of the same pair, and must be somewhere else.
     *
     * `apart` is the same relative threshold `distinct` uses, for the same reason — an absolute one
     * would state a magnitude the student never gave (ADR-052), and this is the exact epsilon defect
     * that made the ring dedupe re-offer a taken crossing.
     */
    if (s.kind === 'crossing-distinct') {
      for (const other of crossingSiblings(c, s.id, at)) {
        const q = at.get(other)!;
        if (Math.hypot(p.x - q.x, p.y - q.y) < apart) return false;
      }
      return true;
    }
    /**
     * THE SENTENCE NAMED THIS ROOT (#1268, ADR-AG-157) — the pair's crossing in its canonical order
     * (`crossing-order.ts`), judged against the configuration itself so the order follows the figure.
     */
    if (s.kind === 'crossing-nth') {
      const atFn = (id: Id) => at.get(id) ?? null;
      return nthHolds(p, s.nth, s.pair, atFn, curveAtOf(c, env, atFn), s.both === true);
    }
    const cmp = compareOf(s);
    if (cmp) {
      const lhs = cmp.axis === 'x' ? p.x : p.y;
      const rhs = rhsOf(cmp, (id) => at.get(id) ?? null, env);
      if (rhs === null) return true; // an operand that is not placed yet judges nothing, as above
      return cmp.greater ? lhs > rhs : lhs < rhs;
    }
    /** ON THE BISECTOR'S OWN RAY (#1284, ADR-AG-209) — the angle's side of the perpendicular at its vertex. */
    if (s.kind === 'angle-side') {
      const side = angleSideOf(p, at.get(s.v), at.get(s.a), at.get(s.b));
      return side === null || side > 0;
    }
    if (s.kind !== 'between' && s.kind !== 'beyond') return true;
    const a = at.get(s.a);
    const b = at.get(s.b);
    if (!a || !b) return true;
    /**
     * BEYOND `b` (#1620, ADR-AG-208) — the same projection parameter, the other part of the line: past the
     * end, and visibly so (a point AT `b` is on the side, not on its extension). Collinearity is the
     * constraint's job here too.
     */
    if (s.kind === 'beyond') return beyondParam(a, b, p) > 1 && Math.hypot(p.x - b.x, p.y - b.y) >= apart;
    /**
     * BETWEEN, as the projection parameter along `ab` (#1073).
     *
     * The interval is CLOSED, for the same reason [ADR-AG-021] closed the diagonal meet: an endpoint
     * is a legitimate position on a side, and leaving that to a tolerance would make the ruling
     * depend on an epsilon. Collinearity is the CONSTRAINT's job — this judges only the range, so a
     * point off the line is caught by the residual rather than silently filtered here.
     */
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const nn = ux * ux + uy * uy;
    if (nn < 1e-24) return true;
    const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / nn;
    return t >= -1e-9 && t <= 1 + 1e-9;
  };
  return c.selectors.filter((s) => !holds(s));
}

/**
 * THE PAIRS THAT HAVE COLLAPSED, and which member of each may move (#1463).
 *
 * `distinct` (#1077) and `crossing-distinct` (#1113) judge a configuration where two points that must
 * differ sit together. Both describe the same geometry: two points carrying the SAME incidences — the
 * kite's B and D (on the diagonal's line, 6 from A), two crossings of one pair — so the equations have
 * two roots and nothing in them says the points take different ones. A least-squares descent that starts
 * them on the same side sends both to the nearer root, and the collapsed pair is an exact solution of
 * every stated constraint. The LATER-named point is the mover when both are free, so the student's first
 * point keeps its root. Judged with `apartOf`, so a pair is collapsed exactly when `failingSelectors`
 * would reject it.
 */
function collapsedPairs(c: Construction, at: Map<Id, Pt>, free: ReadonlySet<Id>): Array<{ mover: Id; partner: Id }> {
  const apart = apartOf(at);
  const pairs: Array<[Id, Id]> = [];
  for (const s of c.selectors) {
    if (s.kind === 'distinct') {
      for (let i = 0; i < s.ids.length; i += 1) {
        for (let j = i + 1; j < s.ids.length; j += 1) pairs.push([s.ids[i], s.ids[j]]);
      }
    } else if (s.kind === 'crossing-distinct') {
      for (const other of crossingSiblings(c, s.id, at)) pairs.push([other, s.id]);
    }
  }
  const out: Array<{ mover: Id; partner: Id }> = [];
  const moving = new Set<Id>();
  for (const [a, b] of pairs) {
    const pa = at.get(a);
    const pb = at.get(b);
    if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) >= apart) continue;
    const mover = free.has(b) && !moving.has(b) ? b : free.has(a) && !moving.has(a) ? a : null;
    if (mover === null) continue;
    moving.add(mover);
    out.push({ mover, partner: mover === b ? a : b });
  }
  return out;
}

/**
 * DEFLATION — the other root, found without knowing where it is (#1463).
 *
 * Where the partner's other root lies cannot be read off the figure: measured, a restart mirrored through
 * the rest of the figure separated the kite at some seeds and never separated two crossings of `y = 2x`
 * with a circle, and pushes of one figure span fell back into the taken root (the chord is longer than
 * the figure the solver sees). So the restart does not guess a position; it changes the EQUATIONS. The
 * residuals are multiplied by `1 + (s / d)²` for each collapsed pair, `d` the distance between its two
 * points and `s` the figure's span: far from the collapse the factor is 1 and every root of the stated
 * constraints is still a root, while at the collapse it grows faster than the residuals vanish, so the
 * collapsed configuration stops being a solution and the descent is carried to one where the pair differs.
 * That is the classical deflation of a known root, applied to the one thing the selector says —
 * these two points are different — and it states no magnitude (`s` is the figure's own scale).
 *
 * The deflated solve is a START, never a result: its values are polished against the real residuals by
 * the caller, and the selectors judge that. Four starts, the mover nudged a twentieth of the span along
 * each axis, because at exactly `d = 0` the factor has no direction.
 */
const DEFLATION_NUDGE = 0.05;
function deflatedStarts(
  system: CarrierSystem,
  x: number[],
  pairs: ReadonlyArray<{ mover: Id; partner: Id }>,
  maxIter: number,
): number[][] {
  if (pairs.length === 0) return [];
  const pos = system.positionsAt(x);
  const s = apartOf(pos) * 1e2;
  const deflated = (v: number[]): number[] => {
    const r = system.residualsAt(v);
    const p = system.positionsAt(v);
    let m = 1;
    for (const { mover, partner } of pairs) {
      const a = p.get(mover);
      const b = p.get(partner);
      if (!a || !b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      m *= 1 + (s * s) / Math.max(d * d, 1e-24);
    }
    return r.map((q) => q * m);
  };
  const out: number[][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const m = system.asMap(x);
    for (const { mover } of pairs) {
      const p = m.get(mover);
      if (p) m.set(mover, { x: p.x + DEFLATION_NUDGE * s * dx, y: p.y + DEFLATION_NUDGE * s * dy });
    }
    // Only the MOVERS are taken from the deflated solve. Deflation scales every residual, so the rest of
    // the figure can wander in it (measured: the kite's C went to x = −3630, and the radius went negative
    // — a vacant circle whose incidences cannot be judged). The mover's new root is what was sought; the
    // rest restarts from the collapsed solution, which already satisfies everything else.
    const deflatedValues = solveLM(system.toVec(m, system.envAt(x)), deflated, maxIter).values;
    const moved = system.asMap(deflatedValues);
    const start = system.asMap(x);
    for (const { mover } of pairs) {
      const p = moved.get(mover);
      if (p) start.set(mover, p);
    }
    out.push(system.toVec(start, system.envAt(x)));
    // …and the whole deflated solution after it: where the rest of the figure had to move WITH the mover
    // (the plain kite, whose C follows B and D), the transplant alone starts it from a stale place.
    out.push(deflatedValues);
  }
  return out;
}

/** The free vertices, in a stable order — the solver's unknown vector is two entries each. */
const freeIds = (c: Construction): Id[] => c.objects.filter(isFree).map((o) => o.id);

export interface SolveReport {
  /** A constraint that could not be met, named for the student. */
  unsatisfied: Constraint[];
}

/**
 * A SIGN SELECTOR SEEDS THE FREE DIRECTION IT JUDGES (#1323, the #1071 shape for a parameter).
 *
 * «דרך B עובר ישר l5» · «שיפוע הישר l5 שלילי»: the direction is a free angle, and the sign says which
 * half of its range the student meant. Folding the sign into the sample costs nothing, keeps the seed's
 * own magnitude — so «הציגו תצורה אחרת» still turns the line, inside its half — and starts the solve in
 * the basin the sentence names, which is the #818 lesson: a filter that only rejects can be left with
 * nothing but configurations that contradict the given. The post-hoc check is unchanged and still has
 * the last word. Applied to the seed's sample and to every re-sample the solve tries.
 */
/**
 * THE FREE ANGLE A SIGN SELECTOR JUDGES, if it judges one (#1323). «שיפוע הישר l5 שלילי» names the LINE, so
 * the selector's direction is the curve `line-l5` — and that curve is a `line-at` whose direction is a free
 * angle. Seeding and root selection must reach that angle through the name, or they never fire on the
 * exam's own sentence (measured: they did not, and the sign held at 22 of 24 seeds by the walk's luck).
 * A perpendicular construction inverts the sign and is not reached here; the post-hoc check still judges it.
 */
function freeAngleOf(c: Construction, sel: Extract<Selector, { kind: 'sign' }>): string | null {
  if (sel.q.k !== 'slope') return null; // a circle region judges no direction (#1619 B1)
  const u = sel.q.u;
  if (u.k === 'free') return u.sym;
  if (u.k !== 'curve') return null;
  const o = objectById(c, u.id);
  if (!o || o.kind !== 'line-at' || o.dir.k !== 'free' || o.perp) return null;
  return o.dir.sym;
}

function foldSignSelectors(c: Construction, env: Env): Env {
  let out = env;
  for (const sel of c.selectors) {
    if (sel.kind !== 'sign') continue;
    if (sel.q.k === 'order') {
      out = seedOrderParams(c, sel, sel.q, out);
      continue;
    }
    const sym = freeAngleOf(c, sel);
    if (sym === null) continue;
    const theta = out[sym];
    if (theta === undefined || !Number.isFinite(theta)) continue;
    // Reduce to [0, π) — a direction is periodic in π — then put it in the half the sign names: a
    // positive slope is an angle in (0, π/2), a negative one in (π/2, π).
    const reduced = ((theta % Math.PI) + Math.PI) % Math.PI;
    const isPositive = reduced > 0 && reduced < Math.PI / 2;
    if (isPositive !== sel.positive) out = { ...out, [sym]: Math.PI - reduced };
  }
  return out;
}

/**
 * AN ORDER SEEDS A PARAMETER SIDE INTO ITS REGION (#1622 E5, ADR-AG-221) — `seedOrder`'s twin for a VALUE side.
 *
 * «α < β», «α < 30», «20 < α < 60» order angle ALIASES (ADR-AG-215): free parameters, each sampled across the range its
 * angle allows. Sample-and-reject is the wrong mechanism for a region (#1071, ADR-AG-216) — it would refuse a
 * satisfiable figure at every seed whose sample fell on the wrong side. So where the sample breaks the order, the first
 * side that is a lone sampled symbol is moved into the region: RESCALED from its own range onto the part of that range
 * the order allows. The sample's relative position is kept, so the start states no magnitude (ADR-052) and «הציגו
 * תצורה אחרת» still moves it; an unbounded symbol is reflected across the other side instead. A start, never a
 * verdict: the solve may move it and the judge (`orderQuantity`) keeps the last word.
 */
function seedOrderParams(
  c: Construction,
  s: Extract<Selector, { kind: 'sign' }>,
  q: Extract<Extract<Selector, { kind: 'sign' }>['q'], { k: 'order' }>,
  env: Env,
): Env {
  const valueOf = (o: OrderSide): number => (o.t === 'value' ? evalExpr(o.value, env) : NaN);
  const [l, r] = [valueOf(q.left), valueOf(q.right)];
  if (!Number.isFinite(l) || !Number.isFinite(r)) return env;
  const now = orderQuantity(q, () => null, env);
  if (now === null || signHolds(s, now)) return env;
  for (const [mine, other, above] of [
    [q.left, r, s.positive],
    [q.right, l, !s.positive],
  ] as const) {
    if (mine.t !== 'value' || mine.value.kind !== 'sym' || !(mine.value.name in env)) continue;
    const sym = mine.value.name;
    const x = env[sym];
    const declared = paramRegister(c).find((p) => p.sym === sym)?.domain ?? {};
    const d = narrowedDomain(declared, impliedRange(c, sym));
    const [lo, hi] = [d.min ?? -Infinity, d.max ?? Infinity];
    const bounded = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo;
    // The sample's place in its own range, kept off the ends (an open bound is never drawn on).
    const t = bounded ? Math.min(0.95, Math.max(0.05, (x - lo) / (hi - lo))) : 0;
    let want: number;
    if (above) {
      if (!(other < hi)) continue; // no room above
      const from = Math.max(other, lo);
      want = bounded ? from + t * (hi - from) : other + Math.max(Math.abs(other - x), 1);
    } else {
      if (!(other > lo)) continue; // no room below
      const to = Math.min(other, hi);
      want = bounded ? lo + t * (to - lo) : other - Math.max(Math.abs(other - x), 1);
    }
    if (!Number.isFinite(want)) continue;
    return { ...env, [sym]: want };
  }
  return env;
}

/**
 * ONE EVALUATION PER (CONSTRUCTION, SEED) — the drawable walk and the knowledge gates share it (ADR-AG-144).
 *
 * `drawableAt` with the spread preference walks the seeds looking for an open ring, and on a DETERMINED
 * figure whose one triangle is narrow it walks all twenty-four; `distinctConfigSeeds` then evaluates the
 * same twenty-four for the panel. `evaluate` is pure over its two arguments, so the second walk is the
 * first one's work done again. Keyed weakly on the construction, which every consumer of one derivation
 * shares, so the memo lives exactly as long as the figure it describes.
 */
const evaluateMemo = new WeakMap<Construction, Map<number | string, Figure>>();

/**
 * How many evaluations were actually COMPUTED (a memo miss) — the operation count the #1473 perf lock
 * budgets (ADR-AG-180). Counted, never timed: a wall-clock lock is a lock on the machine. Test-visible
 * only; nothing in the product reads it.
 */
export const evaluateStats = { uncached: 0 };

/**
 * `reach` (#1939, ADR-AG-256) scales the magnitudes the sampler draws for the figure's free PARAMETERS (a letter in a
 * coordinate, a stated ratio's unknown) past the default window (`sampleParam`'s 1..4). 1 is every ordinary
 * configuration; only `drawableAt`'s ring search asks for more.
 */
export function evaluate(raw: Construction, seed = 0, reach = 1): Figure {
  let perSeed = evaluateMemo.get(raw);
  if (!perSeed) {
    perSeed = new Map();
    evaluateMemo.set(raw, perSeed);
  }
  const key = reach === 1 ? seed : `${seed}@${reach}`;
  const hit = perSeed.get(key);
  if (hit) return hit;
  const out = evaluateTryingChoices(raw, seed, reach);
  perSeed.set(key, out);
  return out;
}

/**
 * THE SEED'S CHOICE IS A PREFERENCE, NOT A VERDICT (#1642, ADR-AG-197).
 *
 * A `choice` (#1049 — which angle of «משולש ישר זווית» is the right one, which tangency of two circles) is
 * resolved by the seed so «הציגו תצורה אחרת» cycles the options. But an option the OTHER givens contradict
 * is dead at every seed it is drawn at: «משולש AOB ישר זווית» · «AO על ציר ה-x» · «BO על ציר ה-y» seats the
 * right angle at O whatever the seed, and measured on the operator's six lines the seats at A and B left
 * only 1 raw seed of 24 valid — so `drawableAt` walked forward, the configuration pool held two pictures,
 * and the knowledge gates read a 2-DOF figure's coordinates as a two-member option set.
 *
 * So a seed whose option yields no valid figure tries the next option AT THE SAME SAMPLES before the seed is
 * declared invalid. A figure whose every option is valid draws exactly what it drew (the seed's option is
 * tried first and accepted); one whose seed lands on a dead option draws a live one instead of nothing. The
 * options are enumerated in seed order (`seed + k`), so the cycle still reaches every live option.
 */
function choiceCount(c: Construction): number {
  let n = 1;
  for (const k of c.constraints) if (k.t === 'choice' && k.options.length > 1) n = Math.max(n, k.options.length);
  // A region choice («משולש קהה זווית», #1708) is a discrete choice too: tried at the same samples, in seed order.
  for (const s of c.selectors) if (s.kind === 'choice' && s.options.length > 1) n = Math.max(n, s.options.length);
  return n;
}

/**
 * THE REGION CHOICE RESOLVED (#1708, ADR-AG-222) — `resolveChoices`' rule for a selector `choice`: the option the
 * choice seed indexes, so every later stage (validity, seeding, `drawableAt`) sees one ordinary selector.
 */
/** WHICH OPTION each discrete choice takes at a choice seed — constraint and region choices alike (#1719). */
function choiceOptions(c: Construction, choiceSeed: number): string {
  const pick = (n: number) => ((choiceSeed % n) + n) % n;
  const ks = c.constraints.filter((k) => k.t === 'choice' && k.options.length > 1).map((k) => pick((k as { options: unknown[] }).options.length));
  const ss = c.selectors.filter((s) => s.kind === 'choice' && s.options.length > 1).map((s) => pick((s as { options: unknown[] }).options.length));
  return `${ks.join(',')}|${ss.join(',')}`;
}

export function resolveSelectorChoices(selectors: readonly Selector[], seed: number): Selector[] {
  if (!selectors.some((s) => s.kind === 'choice')) return selectors as Selector[];
  return selectors.flatMap((s) => {
    if (s.kind !== 'choice') return [s];
    if (s.options.length === 0) return [];
    return resolveSelectorChoices([s.options[((seed % s.options.length) + s.options.length) % s.options.length]], seed);
  });
}
function admittedFigure(f: Figure): boolean {
  return f.unsatisfied.length === 0 && f.selectorsOk && hardRingFaults(f).length === 0;
}
function evaluateTryingChoices(raw: Construction, seed: number, reach = 1): Figure {
  evaluateStats.uncached += 1;
  const first = evaluateUncached(raw, seed, seed, reach);
  const n = choiceCount(raw);
  if (n <= 1 || admittedFigure(first)) return first;
  for (let k = 1; k < n; k += 1) {
    evaluateStats.uncached += 1;
    const f = evaluateUncached(raw, seed, seed + k, reach);
    if (admittedFigure(f)) return f;
  }
  return first;
}

/**
 * TWO CROSSINGS NAMED IN ONE SENTENCE ARE A DISCRETE CHOICE, AND IT CYCLES (#1539 — operator ruling 2026-10-01,
 * superseding ADR-AG-185's fixed order).
 *
 * «הישר l1 חותך את המעגל I בנקודות A ו-B» lowers to two ordinals (`crossing-nth` with `both`): A the first root,
 * B the second. ADR-AG-185 fixed that order and ruled it never cycled; the operator has since ruled that
 * «הציגו תצורה אחרת» *"should always swap if there are more than 1 option"*. Which letter takes which root is
 * then exactly a `choice` (#1049): resolved per configuration, here, before anything measures a selector. The
 * stated order is configuration 0's (the first drawing is unchanged); the k-th pair of one figure swaps on bit
 * k of the seed, so successive configurations reach every assignment. `both`'s own promise — the pair MEETS
 * twice — is unchanged and still judged in every configuration.
 */
function cycledPairs(selectors: readonly Selector[], seed: number): Selector[] {
  const pairIndex = new Map<string, number>();
  let changed = false;
  const out = selectors.map((s) => {
    if (s.kind !== 'crossing-nth' || !s.both) return s;
    const key = JSON.stringify(s.pair.map((k) => ({ ...k, id: '' })));
    if (!pairIndex.has(key)) pairIndex.set(key, pairIndex.size);
    if (((seed >> pairIndex.get(key)!) & 1) === 0) return s;
    changed = true;
    return { ...s, nth: (1 - s.nth) as 0 | 1 };
  });
  return changed ? out : (selectors as Selector[]);
}

/** The seed this configuration resolved its discrete choices at (#1642) — what the locus walk must resolve them at too. */
/**
 * THE ANGULAR EXTENT OF AN ARC (#1622 E4, ADR-AG-220) — the one reading of an `ArcDef`, exported for its locks.
 * `ccw` runs counter-clockwise from `from` to `to` (2-D's semicircle, B → A); with `away` the half whose middle is
 * on the far side of the chord from that point (2-D's `bulgeRef`). `minor` / `major` are the shorter / longer way.
 */
export function arcOf(
  id: Id,
  def: ArcDef,
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): FigureArc | null {
  const circle = curveAt(def.circle);
  const p = at(def.from);
  const q = at(def.to);
  if (!circle || circle.kind !== 'circle' || !p || !q) return null;
  const { cx, cy, r } = circle;
  if (Math.hypot(p.x - cx, p.y - cy) < 1e-12 || Math.hypot(q.x - cx, q.y - cy) < 1e-12) return null;
  const start = Math.atan2(p.y - cy, p.x - cx);
  const TAU = 2 * Math.PI;
  let ccw = (Math.atan2(q.y - cy, q.x - cx) - start) % TAU;
  if (ccw <= 1e-12) ccw += TAU;
  let sweep = ccw;
  if (def.pick === 'minor') sweep = ccw <= Math.PI ? ccw : ccw - TAU;
  else if (def.pick === 'major') sweep = ccw > Math.PI ? ccw : ccw - TAU;
  else if (def.away || def.toward) {
    const w = at((def.away ?? def.toward)!);
    if (!w) return null;
    // The side of the chord p→q a point is on (the cross product's sign): the arc's middle on the other side of it
    // (`away`), or on the same side (`toward`).
    const side = (x: number, y: number) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
    const mid = start + ccw / 2;
    const same = Math.sign(side(cx + r * Math.cos(mid), cy + r * Math.sin(mid))) === Math.sign(side(w.x, w.y));
    if (same === Boolean(def.away)) sweep = ccw - TAU;
  }
  return { id, cx, cy, r, start, sweep, radii: def.radii === true };
}

export function choiceSeedOf(c: Construction, seed: number): number {
  return evaluate(c, seed).choiceSeed ?? seed;
}

/**
 * THE CONSTRUCTION AS ONE CONFIGURATION JUDGES IT (#1817, ADR-AG-245) — every discrete freedom resolved: the
 * constraint choices (#1049), the region choices (#1708) and the cycled crossing pairs (#1539), at `seed` and its
 * choice seed. `evaluate` resolves here and nowhere else, and so does the locus walk, so the trace is judged against
 * the SAME selector set the canvas was judged with — never a second reading of which option a seed takes.
 */
export function resolvedAt(raw: Construction, seed: number, choiceSeed = seed): Construction {
  return {
    ...raw,
    constraints: resolveChoices(raw.constraints, choiceSeed),
    selectors: resolveSelectorChoices(cycledPairs(raw.selectors, seed), choiceSeed),
  };
}

/** Do the (resolved) selectors of `c` all hold at these positions? The one reading of a region given. */
export function selectorsHold(c: Construction, pos: Map<Id, Pt>, env: Env): boolean {
  return c.selectors.length === 0 || failingSelectors(c, pos, env).length === 0;
}

/** A ring fault that makes a configuration INVALID — every one but the trapezoid-is-parallelogram WARNING. */
function isHardRingFault(r: RingFault): boolean {
  return r.violation !== 'trapezoid-is-parallelogram';
}

/**
 * IS THIS A POSITION OF THE FIGURE THE STUDENT DESCRIBED? (#1817, ADR-AG-245) — validity at positions, for a caller
 * that produces positions without `evaluate`: the selectors hold (`selectorsHold`) and every declared ring keeps the
 * promise its noun makes (`ringFaultsOf`, hard faults only — `admittedFigure`'s two position-level terms). The
 * constraints are the caller's to have solved.
 *
 * `c` must be resolved (`resolvedAt`). The locus walk is the caller it exists for: it paints MANY positions of a point,
 * and each must pass the judge the one drawn configuration passes, or the trace shows places the givens rule out.
 */
export function admissibleAt(c: Construction, pos: Map<Id, Pt>, env: Env): boolean {
  if (!selectorsHold(c, pos, env)) return false;
  return !ringFaultsOf(c, (id) => pos.get(id)).some(isHardRingFault);
}

/**
 * A SHAPE THE TOOL CREATED IS FITTED TO THE FIGURE IT JOINS before the figure is solved (#1647, ADR-AG-202).
 *
 * A tangency sentence with no circle creates one (ADR-AG-198 ruling b): an equation circle whose centre and
 * radius are the tool's own free symbols (`θ_<object>.<part>`). The sampler draws those symbols blind — a circle
 * anywhere, of any size — and the solve then had to make that random circle tangent to the stated sides. When a
 * side's line cannot move to it (a side on an axis), stage one fails and stage two solves EVERYTHING jointly; and
 * the cheapest joint answer is to collapse the side the circle must touch (A or B onto O makes "D on AO" true for
 * any D). Measured on «הצלעות AO ו-BO משיקות למעגל בנקודות D ו-E בהתאמה» after the right triangle on the axes: 4 of
 * 24 raw seeds admitted, ~170 ms per failing seed, 13 evaluations and ~2.1 s per submit.
 *
 * The figure the circle joins was stated FIRST. So the new circle and its touch points (the free points the
 * statements put ON it) are fitted to the figure the earlier givens draw at this seed — the construction without
 * them, evaluated for real, every one of its vertices held where it stands, the constraints that mention the
 * circle, a touch point or anything defined through them as the residuals — and that fit is where the solve
 * starts: the seed's sample of the circle, made consistent with what was said about it. It is the bounded-noun
 * and region seeding's lesson (#1071, #1168) for a created object, and the structural stability rule: adding a
 * statement moves what it introduced, not what was already there.
 *
 * A START, NEVER A VERDICT. The fit is tried from the seeded touch points and then from the quarter points of
 * each bounded piece they lie on (the restarts the solve already uses); a fit the selectors accept is preferred,
 * any converged fit is used, and with none the evaluation starts exactly as it did. The radius stays free: the
 * fit moves the seed's sample as little as the descent must, so another seed draws another circle.
 */
/** The figure a created shape JOINS — the construction without it — evaluated once per (raw construction, seed, choice). */
const priorMemo = new WeakMap<Construction, { prior: Construction; figures: Map<string, Figure> } | null>();
function priorOf(raw: Construction, removed: ReadonlySet<Id>): { prior: Construction; figures: Map<string, Figure> } {
  let hit = priorMemo.get(raw);
  if (!hit) {
    const objects = raw.objects.filter((o) => !removed.has(o.id));
    hit = {
      prior: {
        ...raw,
        objects,
        constraints: raw.constraints.filter((k) => !mentionsAny(k, removed)),
        selectors: raw.selectors.filter((sel) => !mentionsAny(sel, removed)),
      },
      figures: new Map(),
    };
    priorMemo.set(raw, hit);
  }
  return hit;
}

interface CreatedFit {
  env: Env;
  seeded: Map<Id, Pt>;
  /** The figure the shape joins admits no configuration here, so neither does the whole: nothing is searched. */
  dead: boolean;
}

function fitCreatedShapes(raw: Construction, c: Construction, env: Env, seeded: Map<Id, Pt>, seed: number, choiceSeed: number, reach = 1): CreatedFit | null {
  const syms = paramRegister(c)
    .map((q) => q.sym)
    .filter((sym) => shapedObjectOf(sym) !== null && env[sym] !== undefined);
  if (syms.length === 0) return null;
  const shaped = new Set<Id>(syms.map((sym) => shapedObjectOf(sym)!));
  const movers = [...seeded.keys()].filter((id) => c.constraints.some((k) => k.t === 'on-curve' && k.id === id && shaped.has(k.curve)));
  // Everything the new shape brings: the shape, its touch points, and every object defined through them (a centre
  // named «O מרכז המעגל», a polygon over a touch point, a point defined from those) — closed in declaration order.
  const removed = new Set<Id>([...shaped, ...movers]);
  for (const o of c.objects) if (!removed.has(o.id) && mentionsAny({ ...o, id: '' }, removed)) removed.add(o.id);
  const own = c.constraints.filter((k) => mentionsAny(k, removed));
  if (own.length === 0) return null;
  /*
   * THE FIGURE AS IT STOOD. The seed's raw vertices satisfy nothing yet, so the construction WITHOUT the new shape
   * is evaluated first — the real evaluation, its own stages and restarts, at this seed and this choice — and the
   * shape is fitted to that figure. Its givens are a subset of the whole's and mention none of the shape's
   * unknowns, so a seed at which it admits no configuration admits none for the whole either (a dead right-angle
   * seat, #1642): that seed is not searched again with the shape's unknowns added — measured, that search cost
   * 150–500 ms per dead seat, against 20–40 ms for the figure alone. The post-hoc check still judges every given.
   */
  const memo = priorOf(raw, removed);
  const key = reach === 1 ? `${seed}:${choiceSeed}` : `${seed}:${choiceSeed}@${reach}`;
  let before = memo.figures.get(key);
  if (!before) {
    before = evaluateUncached(memo.prior, seed, choiceSeed, reach);
    memo.figures.set(key, before);
  }
  const dead = !admittedFigure(before);
  const base = new Map(seeded);
  for (const q of before.points) if (base.has(q.id)) base.set(q.id, { x: q.x, y: q.y });
  env = { ...before.env, ...Object.fromEntries(syms.map((sym) => [sym, env[sym]])) };
  const unpack = (x: number[]): { e: Env; free: Map<Id, Pt> } => {
    const e: Record<string, number> = { ...env };
    syms.forEach((sym, j) => {
      e[sym] = x[2 * movers.length + j];
    });
    const free = new Map(base);
    movers.forEach((id, i) => free.set(id, { x: x[2 * i], y: x[2 * i + 1] }));
    return { e, free };
  };
  const ownScale = residualScale(c, env); // the whole figure's scale, the one the main solve measures by (#1492)
  const residualsAt = (x: number[]): number[] => {
    const { e, free } = unpack(x);
    const pos = place(c, e, free);
    const at = (id: Id) => pos.get(id) ?? null;
    const curveAt = curveAtOf(c, e, at);
    const lineAt = lineAtOf(c, e, at);
    return own.flatMap((k) => residual(k, at, e, curveAt, lineAt, ownScale) ?? [0]);
  };
  /*
   * THE STARTS. Each touch point first goes onto the piece its noun bounds («הצלע AO»: inside A–O) — at its seed's
   * own position along the piece when that falls inside, else the midpoint (the bounded-noun seeding, #1168), then
   * at the quarter points. The circle then starts THROUGH its touch points — centred at their centroid, the mean
   * distance as its radius — so the descent starts inside the angle the touched sides make, not wherever the blind
   * sample put it (the far quadrant fits the lines and fails every `between`). With one touch point that carries
   * no position for a centre, the seed's own sample is the circle's start; the blind sample is the last start.
   */
  const placed = place(c, env, base);
  const pieces = c.constraints.filter(
    (k): k is Extract<Constraint, { t: 'on-line-2pt' }> => k.t === 'on-line-2pt' && k.bounded === true && movers.includes(k.id),
  );
  const onPieces = (t: number | null): Map<Id, Pt> => {
    const m = new Map(base);
    for (const k of pieces) {
      const pa = placed.get(k.a);
      const pb = placed.get(k.b);
      const q = m.get(k.id);
      if (!pa || !pb || !q) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len2 = dx * dx + dy * dy;
      if (!(len2 > 1e-12)) continue;
      const own = ((q.x - pa.x) * dx + (q.y - pa.y) * dy) / len2;
      const u = t ?? (own > 0 && own < 1 ? own : 0.5);
      m.set(k.id, { x: pa.x + u * dx, y: pa.y + u * dy });
    }
    return m;
  };
  const throughTouches = (m: Map<Id, Pt>): Env => {
    const e: Record<string, number> = { ...env };
    for (const o of shaped) {
      const [sa, sb, sr] = (['a', 'b', 'r'] as const).map((part) => toolSymbol(o, part));
      if (!syms.includes(sa) || !syms.includes(sb) || !syms.includes(sr)) continue;
      const touch = movers
        .filter((id) => c.constraints.some((k) => k.t === 'on-curve' && k.id === id && k.curve === o))
        .map((id) => m.get(id)!);
      if (touch.length < 2) continue;
      const cx = touch.reduce((acc, q) => acc + q.x, 0) / touch.length;
      const cy = touch.reduce((acc, q) => acc + q.y, 0) / touch.length;
      const r = touch.reduce((acc, q) => acc + Math.hypot(q.x - cx, q.y - cy), 0) / touch.length;
      if (!(r > 1e-9)) continue;
      e[sa] = cx;
      e[sb] = cy;
      e[sr] = r;
    }
    return e;
  };
  const vecOf = (m: Map<Id, Pt>, e: Env) => [...movers.flatMap((id) => [m.get(id)!.x, m.get(id)!.y]), ...syms.map((sym) => e[sym])];
  const starts: number[][] = [];
  for (const t of [null, 0.25, 0.75]) {
    const m = onPieces(t);
    starts.push(vecOf(m, throughTouches(m)));
    if (pieces.length === 0) break;
  }
  starts.push(vecOf(base, env));
  const domains = new Map(paramRegister(c).map((q) => [q.sym, q.domain] as const));
  let fallback: CreatedFit | null = null;
  for (const x0 of starts) {
    const r = solveLM(x0, residualsAt, 60);
    if (!r.ok) continue;
    const { e, free } = unpack(r.values);
    const pos = place(c, e, free);
    if (!syms.every((sym) => inDomain(domains.get(sym) ?? {}, e[sym], openBoundFloor(pos, e, syms)))) continue;
    if (failingSelectors(c, pos, e).length === 0) return { env: e, seeded: free, dead };
    fallback ??= { env: e, seeded: free, dead };
  }
  return fallback ?? (dead ? { env, seeded: base, dead } : null);
}

function evaluateUncached(raw: Construction, seed = 0, choiceSeed = seed, paramReach = 1): Figure {
  /**
   * DISCRETE freedom is resolved HERE, once, before anything measures a constraint (#1049).
   *
   * «משולש ישר-זווית ABC» carries a `choice` over its three possible right angles. Successive seeds
   * walk the options in order, so «הציגו תצורה אחרת» cycles the seats rather than resampling into a
   * favourite — 02c R14's *"discrete ones cycle"*. Everything downstream — the solve, the rank
   * count, the satisfaction check, the provenance — then sees an ordinary constraint and never
   * learns that discrete freedom exists.
   */
  /*
   * THE FIGURE IS THE AUTHORITY on a crossing's extent (#1286, ADR-AG-135 ruling (a)) — decided at the M1
   * boundary since ADR-AG-198 (#1640), against the figure AS IT STOOD when the crossing was stated
   * (`apply.ts`, the `constraint` case): resolved here over the whole construction, a piece drawn later
   * narrowed an earlier statement. The constraints arrive already bounded; the solve, the validity check
   * and the knowledge gate still see one truth.
   */
  const c: Construction = resolvedAt(raw, seed, choiceSeed);
  // `paramReach`, never `reach`: this body has locals of that name (a span), and the parameter must not be shadowed
  let env = foldSignSelectors(c, sampleEnv(c, seed, paramReach));
  const points: FigurePoint[] = [];
  const curves: FigureCurve[] = [];
  const segments: FigureSegment[] = [];
  const arcs: FigureArc[] = [];
  const construction: FigureConstruction[] = [];
  const vacant: Vacancy[] = [];

  // One walk over the OBJECTS, in the order the student stated them. Two things make a single
  // forward pass correct:
  //   - the environment is complete before it starts (every parameter assigned) — the
  //     object→parameter layer, `carriers.ts` `symbolDeps`;
  //   - a parent always PRECEDES its dependent, because `apply` refuses a statement naming an
  //     object that does not exist yet — so declaration order is a valid topological order and a
  //     cycle is unreachable (`carriers.ts` `depsPrecedeDependents`, asserted in the suite).
  /**
   * THE SOLVE (#1016). The free vertices start where the sampler puts them and are then moved, all
   * together, until every constraint holds — which is what makes «שטח המשולש ABC הוא 20» a statement
   * that shapes the figure rather than a sentence the tool merely accepts.
   *
   * With no constraints this is the sampler alone, so an unconstrained figure keeps drawing exactly
   * as it did and «הציגו תצורה אחרת» still moves it: the seed remains the starting point, and among
   * several valid configurations it is what chooses between them.
   */
  const ids = freeIds(c);
  const span = searchSpan(c, env);
  const seeded = new Map<Id, Pt>(
    // #1631: hashed from the vertex's SEED NAME — its own letter unless a letter change carried another
    ids.map((id) => {
      const name = c.seedNames?.[id] ?? id;
      return [id, { x: freeCoord(seed, name, 0, span), y: freeCoord(seed, name, 1, span) }];
    }),
  );
  /**
   * A REGION selector SEEDS the point it names, instead of only filtering the result (#1071).
   *
   * «C ברביע השלישי» lowers to two `axis-side` selectors, and `derive` looks for a configuration
   * where every selector holds by advancing the seed. Measured on the operator's own figure, that is
   * not adequate: one sign holds about half the time, a quadrant a quarter, and **four quadrant
   * points about one seed in 256** — against 24 tries. The figure was then drawn with the selectors
   * FALSE and nothing said, which is a figure contradicting its own givens.
   *
   * Sample-and-reject was the right mechanism for a BRANCH (#1033: which of two intersections), where
   * the candidates are enumerable. It is the wrong one for a region, where the answer is a half-plane
   * and the sampler can simply be told which half. Folding the sign costs nothing, keeps the
   * magnitude the seed chose — so «הציגו תצורה אחרת» still moves the point, inside its region — and
   * leaves the solve free to move it afterwards if a constraint says so; the post-hoc check is
   * unchanged and still has the last word.
   */
  /**
   * A BOUNDED noun seeds its crossing INSIDE the drawn piece (#1168).
   *
   * Operator's ruling, 2026-09-19: *«הצלע CA» ⇒ the root on the drawn extent; «הישר CA» ⇒ the first
   * root, as today*. A line meets a circle twice and both roots are valid, so this is a question about
   * which one comes up FIRST — and in this tree that is decided by where the search starts, because a
   * least-squares descent goes to the basin it starts in (#1085, the same lesson that moved the search
   * span onto the figure).
   *
   * So the sampled point is PROJECTED onto the segment it was said to lie on, clamped to the piece the
   * student drew. The projection keeps the seed’s own position along the line, so successive
   * configurations still walk it — and the far root stays reachable, because only the EVEN seeds are
   * pulled in: «הציגו תצורה אחרת» reaches the outside root on the next press. It is a preference, never
   * a filter, which is what #1168 required of it.
   */
  if (seed % 2 === 0) {
    for (const k of c.constraints) {
      if (k.t !== 'on-line-2pt' || !k.bounded) continue;
      const at = seeded.get(k.id);
      const pa = pointAtId(c, env, k.a);
      const pb = pointAtId(c, env, k.b);
      if (!at || !pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len2 = dx * dx + dy * dy;
      if (!(len2 > 1e-12)) continue;
      const t = ((at.x - pa.x) * dx + (at.y - pa.y) * dy) / len2;
      // A sample that already falls ON the piece keeps its own position, so successive configurations
      // still walk it; one that falls outside starts at the MIDPOINT rather than clamped to an end —
      // measured, an endpoint start is degenerate (it satisfies the line and nothing else) and the
      // solve parked there instead of finding the crossing.
      const inside = t >= 0 && t <= 1 ? t : 0.5;
      seeded.set(k.id, { x: pa.x + inside * dx, y: pa.y + inside * dy });
    }
  }
  /**
   * …and a point said to be on an angle's BISECTOR starts on the bisector's own ray (#1284, ADR-AG-209): a seed on
   * the wrong side of the vertex is reflected through it, keeping its distance — the #1071 lesson for a ray, so the
   * descent starts in the basin the sentence names. A start, never a verdict: the judge keeps the last word.
   */
  for (const s0 of c.selectors) {
    if (s0.kind !== 'angle-side') continue;
    const posOf = (id: Id): Pt | null => seeded.get(id) ?? pointAtId(c, env, id);
    const p0 = seeded.get(s0.id);
    const v0 = posOf(s0.v);
    if (!p0 || !v0) continue;
    const side = angleSideOf(p0, v0, posOf(s0.a) ?? undefined, posOf(s0.b) ?? undefined);
    if (side !== null && side < 0) seeded.set(s0.id, { x: 2 * v0.x - p0.x, y: 2 * v0.y - p0.y });
  }
  /**
   * …and the REGIONS #1622 states (ADR-AG-217) seed their points, the #1071 lesson once more — a start, never a verdict:
   *  - a side of a line: a free subject on the wrong side (against the FIRST subject for «באותו צד», the other one
   *    for «בצדדים שונים») is reflected across the line, keeping its distance;
   *  - inside / outside a ring: a free point on the wrong side of the boundary is drawn toward the ring's centroid, or
   *    pushed away from it, along its own ray (so the seed's direction still varies the figure);
   */
  /*
   * …and a ring of FIVE OR MORE free vertices (#1622, ADR-AG-217) starts SIMPLE: the sampled positions are kept and
   * handed to the vertices in angular order about their centroid, so the ring is star-shaped from its first sample.
   * Measured: eight free samples in letter order form a simple ring so rarely that «מתומן ABCDEFGH» exhausted the
   * walk at 16 of 24 seeds and was drawn crossed. Quadrilaterals and triangles keep their old start (the walk finds
   * theirs, and their figures are locked). A start, never a verdict — `rings.ts` still judges the drawn ring.
   */
  for (const o of c.objects) {
    if (o.kind !== 'polygon' || o.vertices.length < 5 || !o.vertices.every((v) => seeded.has(v))) continue;
    const pts = o.vertices.map((v) => seeded.get(v)!);
    const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
    const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
    const sorted = [...pts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    o.vertices.forEach((v, i) => seeded.set(v, sorted[i]));
  }
  {
    const posOf = (id: Id): Pt | null => seeded.get(id) ?? pointAtId(c, env, id);
    const frac =(((seed * 0.6180339887) % 1) + 1) % 1;
    for (const s0 of c.selectors) {
      if (s0.kind === 'line-side') {
        const a = posOf(s0.a);
        const b = posOf(s0.b);
        if (!a || !b) continue;
        const first = posOf(s0.ids[0]);
        const d0 = first ? sideOfLine(first, a, b) : null;
        if (d0 === null || d0 === 0) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        for (const id of s0.ids.slice(1)) {
          const q = seeded.get(id);
          const d = q ? sideOfLine(q, a, b) : null;
          if (!q || d === null) continue;
          const wrong = d === 0 || (s0.same ? Math.sign(d) !== Math.sign(d0) : Math.sign(d) === Math.sign(d0));
          if (!wrong) continue;
          // Reflect across the line (twice the signed distance along the unit normal); ON it, step off to the side.
          const k = d === 0 ? (s0.same ? Math.sign(d0) : -Math.sign(d0)) * len * 0.5 : -2 * d;
          seeded.set(id, { x: q.x + k * nx, y: q.y + k * ny });
        }
      } else if (s0.kind === 'in-polygon' && !s0.closed) {
        const q = seeded.get(s0.id);
        const ring = s0.ring.map(posOf);
        if (!q || ring.some((r) => !r)) continue;
        const pts = ring as Pt[];
        const cx = pts.reduce((t, r) => t + r.x, 0) / pts.length;
        const cy = pts.reduce((t, r) => t + r.y, 0) / pts.length;
        const reach = Math.max(...pts.map((r) => Math.hypot(r.x - cx, r.y - cy)));
        if (!(reach > 1e-9)) continue;
        if (ringRegion(q, pts, 0) === (s0.inside ? 'inside' : 'outside')) continue;
        const r0 = Math.hypot(q.x - cx, q.y - cy);
        const ux = r0 > 1e-9 ? (q.x - cx) / r0 : 1;
        const uy = r0 > 1e-9 ? (q.y - cy) / r0 : 0;
        // Inside: a fraction of the way out from the centroid along this ray; outside: past the farthest vertex.
        const r = s0.inside ? reach * (0.1 + 0.3 * frac) : reach * (1.5 + frac);
        seeded.set(s0.id, { x: cx + r * ux, y: cy + r * uy });
      }
    }
  }
  /**
   * …and a COMPARISON between two points seeds their ORDER (#1462, ADR-AG-161) — the same lesson for a pair.
   *
   * «x_B > x_D»: where both points are free and the seed put them the wrong way round, their seeded
   * positions are SWAPPED — the magnitudes the seed chose are kept, so «הציגו תצורה אחרת» still moves the
   * figure, and the descent starts in the basin the sentence names (the kite's B and D are the two roots
   * of one pair of equations; each goes to the nearer one). Against a VALUE — `axis-side` is the value 0 —
   * the coordinate is folded to the named side of it, keeping its distance, exactly as #1071 did.
   * A start, never a verdict: the post-hoc judge keeps the last word.
   */
  for (const s0 of c.selectors) {
    const sel = compareOf(s0);
    if (!sel) continue;
    const at0 = seeded.get(sel.id);
    if (!at0) continue;
    const coord = (p: Pt) => (sel.axis === 'x' ? p.x : p.y);
    if ('point' in sel.rhs) {
      const other = seeded.get(sel.rhs.point);
      if (!other) continue;
      if (sel.greater ? coord(at0) > coord(other) : coord(at0) < coord(other)) continue;
      seeded.set(sel.id, other);
      seeded.set(sel.rhs.point, at0);
      continue;
    }
    const v = evalExpr(sel.rhs.value, env);
    if (!Number.isFinite(v)) continue;
    // A coordinate that sampled onto the value is on NEITHER side; the comparison is strict, so nudge.
    const d = coord(at0) - v;
    const mag = Math.abs(d) < 1e-6 ? 1 : Math.abs(d);
    const want = v + (sel.greater ? mag : -mag);
    seeded.set(sel.id, sel.axis === 'x' ? { x: want, y: at0.y } : { x: at0.x, y: want });
  }
  /**
   * …and an ORDER seeds its measure INTO ITS REGION (#1621 D3, ADR-AG-216) — the #1071 lesson for a measure.
   *
   * «AB ≥ 10», «∢ABC ≥ 150°», «AB < BC» on a free figure are regions of the measure, and sample-and-reject is the
   * wrong mechanism for a region: measured before this, a free triangle with «∢ABC ≥ 150°» was refused at seeds 0–2
   * (no configuration inside the window held it) while seed 3 drew it — a satisfiable figure refused — and «AB ≥ 10»
   * drew the ONE configuration the walk found at every seed. So where the seed put the measure on the wrong side, the
   * sampler is told which side: one free end of a length moves along its own segment, one free ray of an angle turns
   * about the vertex, to a value a seed-varied fraction into the region — relative to the bound, so it states no
   * magnitude (ADR-052) and «הציגו תצורה אחרת» still moves it. A start, never a verdict: the solve may move it and
   * the judge keeps the last word.
   */
  c.selectors.forEach((s0, i) => {
    if (s0.kind !== 'sign' || s0.q.k !== 'order') return;
    seedOrder(s0, s0.q, seeded, (id) => seeded.get(id) ?? pointAtId(c, env, id), env, 0.15 + 0.5 * jitter(seed, 1621 + i));
  });
  /**
   * AN EXTENSION SEEDS ITS POINT PAST THE END (#1620, ADR-AG-208) — the #1071 lesson for `beyond`.
   *
   * «E על המשך הצלע BC» leaves E one degree of freedom on the line, and the sampler knows nothing of which
   * part of it: a free E starts wherever its letter hashes to, and the descent projects it onto the line at
   * the nearest point — inside the side about half the time. So the point STARTS past `b`: at its own
   * sample's position along the line when that is already beyond, else at a seed-varied distance (a fraction
   * of the base, so the start states no magnitude — ADR-052 — and «הציגו תצורה אחרת» still moves it). A
   * start, never a verdict: the solve may move it and the judge keeps the last word. Two extensions on one
   * point (the meet of two extended sides) are a crossing the solve finds; the first one seeds it.
   */
  if (c.selectors.some((s) => s.kind === 'beyond')) {
    const pos = place(c, env, seeded);
    const done = new Set<Id>();
    for (const sel of c.selectors) {
      if (sel.kind !== 'beyond' || !seeded.has(sel.id) || done.has(sel.id)) continue;
      const pa = pos.get(sel.a);
      const pb = pos.get(sel.b);
      const own = seeded.get(sel.id)!;
      if (!pa || !pb) continue;
      const t = beyondParam(pa, pb, own);
      if (!Number.isFinite(t)) continue;
      const u = t > 1.05 ? t : 1.2 + 0.8 * jitter(seed, 0xe7);
      seeded.set(sel.id, { x: pa.x + u * (pb.x - pa.x), y: pa.y + u * (pb.y - pa.y) });
      done.add(sel.id);
    }
  }

  /**
   * AN ORDINAL SEEDS THE ROOT IT NAMES (#1268, ADR-AG-157) — the #1071 lesson for a branch.
   *
   * «נקודת החיתוך השנייה» is judged by the `crossing-nth` selector, and a filter that only rejects leaves
   * the search to find the named root by luck (measured before: the solve's first converged start took
   * the same root whichever word was written). So the crossing STARTS on the root its sentence names, in
   * the order `crossing-order.ts` states, read off the seeded positions of what it crosses. Where the
   * anchors are themselves free and move in the solve this is a start, not a verdict — the selector still
   * has the last word. It runs after the bounded-noun projection above and overrides it: the ordinal is
   * the more specific statement. Costs one `place` per evaluation, and only when an ordinal exists.
   */
  if (c.selectors.some((s) => s.kind === 'crossing-nth')) {
    const pos = place(c, env, seeded);
    const atSeed = (id: Id) => pos.get(id) ?? null;
    for (const sel of c.selectors) {
      if (sel.kind !== 'crossing-nth' || !seeded.has(sel.id)) continue;
      const o = orderedCrossings(sel.pair, atSeed, curveAtOf(c, env, atSeed));
      const root = o && !o.touching ? o.roots[sel.nth] : undefined;
      if (root) seeded.set(sel.id, { x: root.x, y: root.y });
    }
  }

  // A circle the tool created starts fitted to the figure it joins (#1647) — a start, never a verdict.
  const fitted = fitCreatedShapes(raw, c, env, seeded, seed, choiceSeed, paramReach);
  if (fitted) {
    env = fitted.env;
    for (const [id, p] of fitted.seeded) seeded.set(id, p);
  }

  const unsatisfied: Constraint[] = [];
  /** Declared rings the givens hold on only COLLAPSED (the thin-ring arm below, #1334) — #1849's evidence. */
  const collapsedRings: Id[] = [];
  // The figure as SAMPLED, before any solve moves it — the reference a collapse is measured against (ADR-AG-213).
  const sampledEnv = env;
  let free = seeded;
  // Built unconditionally (#1317): the DOF report is rank over the SAME vector the solve moves, and a
  // figure with parameters and no free vertex still has unknowns to count.
  const sys: CarrierSystem = carrierSystem(c, env);
  let solvedVec: number[] = sys.toVec(seeded, env);

  /**
   * TWO STAGES: the vertices first, the parameters only when the vertices cannot (#1317, ADR-AG-144).
   *
   * A parameter in the vector is a knob, and a least-squares descent reaches for every knob it has.
   * Measured on «A(0,0)» · «B(8a,0)» · «נקודה M» · «MA = MB»: solved jointly from the seed, the descent
   * drove `a` to 0 — B onto A, where |MA| = |MB| holds for every M — and drew the collapsed figure as
   * the configuration. Nothing had asked for `a` to move: M alone satisfies the given. So the first
   * stage is the solve as it always was, over the free vertices with every parameter held at its
   * sample, and a figure that converges there keeps its sampled parameters exactly as before — an
   * unpinned parameter stays the seed's, and «הציגו תצורה אחרת» still moves it. Only when that solve
   * does NOT converge do the parameters join the vector, from the same starts: that is the case the
   * old solve could never reach — a given that DETERMINES a parameter — and it is the only case in
   * which moving one is honest.
   */
  const stageOne = carrierSystem(c, env, { params: 'fixed' });
  let converged = false;

  /**
   * THE SELECTORS STEER WHICH CONVERGED START IS TAKEN (#1463) — the #1071 / #1268 lesson for the
   * judges that are not about one point's region.
   *
   * A selector used to meet the solve only afterwards: the first start that converged was THE figure,
   * and a configuration the selectors rejected was repaired, if at all, by `drawableAt` walking to
   * another seed. Measured on the operator's kite: B and D collapsed at 44 of 64 raw seeds, and with a
   * circle through A, B, D added the forward walk reached ONE configuration in the whole 24-seed window
   * — «הציגו תצורה אחרת» had nothing to show, and the one it kept was the exercise's excluded branch.
   *
   * Now a converged solution the selectors reject is a fallback, not the answer: the search restarts
   * from the other root (`deflatedStarts` — the collapse deflated out of the equations) and then from its remaining starts, and takes the first
   * solution the selectors accept. Nothing is refused that was drawn before — with no preferred
   * solution found, the fallback is today's figure and the post-hoc judge still has the last word.
   */
  const ownFree = new Set(ids);
  const selectorsHoldAt = (system: CarrierSystem, x: number[]): boolean =>
    c.selectors.length === 0 || selectorsHold(c, system.positionsAt(x), system.envAt(x));
  const separatedFrom = (system: CarrierSystem, x: number[]): number[][] => [
    ...swappedStarts(system, x),
    ...chordStarts(system, x),
    ...deflatedStarts(system, x, collapsedPairs(c, system.positionsAt(x), ownFree), 120),
  ];
  /**
   * THE OTHER ROOT OF A STRAIGHT AND A CIRCLE, IN CLOSED FORM (#1619 B1, ADR-AG-193).
   *
   * Two crossings of one circle with one straight («המעגל חותך את ציר ה-x בנקודות B ו-C») that collapsed
   * onto one root have a known other root: the partner reflected through the foot of the centre on the
   * straight — the chord's midpoint. Deflation (below) finds it by changing the equations, and on a circle
   * whose CENTRE AND RADIUS are themselves free it found a different figure instead: the deflated descent
   * grew the circle until the two points were far apart, and 9 of 24 seeds drew a circle of radius 10⁶–10⁹
   * through two crossings a continent apart. The reflection is exact, keeps the circle the collapsed solve
   * found, and is tried first; where the pair is not a circle × straight it proposes nothing and deflation
   * runs as before. A start, never a verdict — the polish and the selectors still judge it.
   */
  const chordStarts = (system: CarrierSystem, x: number[]): number[][] => {
    const pos = system.positionsAt(x);
    const env0 = system.envAt(x);
    const pairs = collapsedPairs(c, pos, ownFree);
    if (pairs.length === 0) return [];
    const atFn = (id: Id) => pos.get(id) ?? null;
    const curveAt = curveAtOf(c, env0, atFn);
    const m = system.asMap(x);
    let moved = false;
    // A pair is listed from BOTH crossings' selectors; moving both members would only swap the collapse.
    const touched = new Set<Id>();
    for (const { mover, partner } of pairs) {
      const p = pos.get(partner);
      if (!p || touched.has(mover) || touched.has(partner)) continue;
      touched.add(mover);
      touched.add(partner);
      let circle: { cx: number; cy: number } | null = null;
      let line: { a: number; b: number; c: number } | null = null;
      for (const k of c.constraints) {
        if (!('id' in k) || (k as { id?: Id }).id !== mover) continue;
        if (k.t === 'on-curve') {
          const cu = curveAt(k.curve);
          if (cu?.kind === 'circle') circle = { cx: cu.cx, cy: cu.cy };
          else if (cu?.kind === 'line') line = { a: cu.a, b: cu.b, c: cu.c };
        } else if (k.t === 'on-line') line = { a: k.a, b: k.b, c: k.c };
        else if (k.t === 'on-line-2pt') {
          const A = pos.get(k.a);
          const B = pos.get(k.b);
          if (A && B) line = { a: B.y - A.y, b: A.x - B.x, c: -((B.y - A.y) * A.x + (A.x - B.x) * A.y) };
        }
      }
      if (!circle || !line) continue;
      const n2 = line.a * line.a + line.b * line.b;
      if (n2 < 1e-24) continue;
      const t = (line.a * circle.cx + line.b * circle.cy + line.c) / n2;
      const foot = { x: circle.cx - line.a * t, y: circle.cy - line.b * t };
      m.set(mover, { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y });
      moved = true;
    }
    return moved ? [system.toVec(m, env0)] : [];
  };
  /**
   * A comparison between two FREE points that holds the wrong way round (#1462): the two points swapped is
   * the configuration the sentence names wherever the pair is interchangeable (the kite's B and D), and
   * it is one polish away. Where they are not interchangeable the polish goes elsewhere and the judge
   * rejects it — a start, never a verdict.
   */
  const swappedStarts = (system: CarrierSystem, x: number[]): number[][] => {
    const pos = system.positionsAt(x);
    const env0 = system.envAt(x);
    const failing = failingSelectors(c, pos, env0);
    const m = system.asMap(x);
    let swapped = false;
    for (const s of failing) {
      const cmp = compareOf(s);
      if (!cmp || !('point' in cmp.rhs)) continue;
      const p = m.get(cmp.id);
      const q = m.get(cmp.rhs.point);
      if (!p || !q) continue;
      m.set(cmp.id, q);
      m.set(cmp.rhs.point, p);
      swapped = true;
    }
    return swapped ? [system.toVec(m, env0)] : [];
  };

  if ((ids.length > 0 || sys.syms.length > 0) && c.constraints.length > 0 && !fitted?.dead) {
    // Through `carrierSystem` (#1137) so the locus tracer walks the SAME residuals this solves.
    const solved = sys;
    /**
     * SEVERAL STARTS, first convergence wins (#1287, ADR-AG-134).
     *
     * The seeded start goes first, so a solve that lands from it costs exactly what it did. Only when it
     * does not converge are the RESTARTS tried: for every bounded crossing, the quarter points of its
     * piece — a symmetric chord's midpoint is the one start on the circle's axis, where the descent
     * cannot leave the axis and parks on neither curve — and then the seeded start pushed off itself,
     * deterministically in the seed, so a start that sat on a symmetry axis or a saddle is moved off it.
     * Every restart is a start, never a result: the point the student sees is the one that CONVERGED,
     * and if none does, the best effort is reported below as unsatisfied, never drawn as if.
     */
    const starts: Map<Id, Pt>[] = [seeded];
    const restartsForBounded: Map<Id, Pt>[] = [];
    for (const k of c.constraints) {
      if (k.t !== 'on-line-2pt' || !k.bounded) continue;
      const pa = pointAtId(c, env, k.a);
      const pb = pointAtId(c, env, k.b);
      if (!pa || !pb) continue;
      for (const t of [0.25, 0.75]) {
        const m = new Map(seeded);
        m.set(k.id, { x: pa.x + t * (pb.x - pa.x), y: pa.y + t * (pb.y - pa.y) });
        restartsForBounded.push(m);
      }
    }
    starts.push(...restartsForBounded);
    const reach = Math.max(span.x.hi - span.x.lo, span.y.hi - span.y.lo, 1);
    for (let salt = 1; salt <= 3; salt += 1) {
      const m = new Map<Id, Pt>();
      for (const [id, p] of seeded) {
        m.set(id, { x: p.x + reach * 0.3 * (jitter(seed, salt * 101 + 7) - 0.5), y: p.y + reach * 0.3 * (jitter(seed, salt * 103 + 11) - 0.5) });
      }
      starts.push(m);
    }
    /**
     * PARAMETER RESTARTS (#1317). A pin with two roots (`a² = 4`) is reached from two basins, and a
     * parameter's basin is decided by where its start sits: the seeded value goes first (a solve that
     * lands from it costs exactly what it did), and only if nothing converges are the parameters
     * re-sampled at other seeds — so a root the first sample cannot reach is still reachable, and
     * successive configurations walk the roots (ADR-AG-047's branch question, answered by the seed
     * exactly as the crossing's is).
     */
    // STAGE ONE — the vertices, parameters fixed at their sample. With no parameters the two vectors
    // are the same vector, and stage one IS the solve.
    let firstEffort: Map<Id, Pt> | null = null;
    let stageOneFallback: SolveResult | null = null;
    if (ids.length > 0) {
      // With parameters in the figure, stage one is a QUESTION — can the vertices alone do it? — and
      // a question with a bounded budget: a vertex-only solve that converges does so in a few dozen
      // steps, and one that cannot (a parameter the givens pin) would otherwise spend the full budget
      // on every start of the multi-start, at every seed. Stage two continues from its effort.
      // …and asked from the SEEDED start alone when parameters exist: the restarts (a bounded crossing's
      // quarter points, the seed pushed off itself) are stage two's attempts, walked in the student's order.
      // A figure with no parameters keeps the multi-start as it always was.
      const budget = solved.syms.length > 0 ? 40 : 120;
      const vertexStarts = solved.syms.length > 0 ? [starts[0]] : starts;
      const first = solvePreferring(
        vertexStarts.map((m) => stageOne.toVec(m)),
        stageOne.residualsAt,
        budget,
        () => true,
        (x) => selectorsHoldAt(stageOne, x),
        // With parameters, stage one is only a question (see below) and stage two — where a parameter can
        // move to fit the other root — does the deflation; paying for it twice cost the page 10× (#1463).
        (x) => (solved.syms.length > 0 ? [] : separatedFrom(stageOne, x)),
      );
      firstEffort = stageOne.asMap(first.values);
      // A converged stage one the selectors reject is not the answer while a parameter could still move
      // (#1463): at the seed's radius only the COLLAPSED kite fits the circle, and the configuration the
      // selectors accept needs the radius to change. Stage two is tried with the parameters free, and this
      // solution is its fallback — so a figure no configuration rescues draws exactly what it drew.
      const stageOneRejected = first.ok && solved.syms.length > 0 && !selectorsHoldAt(stageOne, first.values);
      if (stageOneRejected) stageOneFallback = { ...first, values: solved.toVec(firstEffort, env) };
      if ((first.ok && !stageOneRejected) || solved.syms.length === 0) {
        converged = true;
        free = firstEffort;
        solvedVec = solved.toVec(free, env);
      }
    }
    // STAGE TWO — every unknown, only when the vertices alone could not satisfy the givens.
    if (!converged) {
      const domains = new Map(paramRegister(c).map((p) => [p.sym, p.domain] as const));
      // A DOMAIN filters a pin's roots silently (D7 kind 1): a converged solve that drove a parameter
      // out of its declared domain is not an answer — the next attempt is tried. A SIGN about a free
      // direction is the same kind of preference over attempts (the seeding, applied to the result): a
      // root with the wrong sign is not the one the sentence names; the post-hoc check keeps the last word.
      // The scale the figure was SAMPLED at (#1620 S7, ADR-AG-213): a whole-figure collapse takes a
      // span-relative floor down with it, so the floor is never smaller than the start's.
      const sampledScale = figureScale(solved.positionsAt(solved.toVec(seeded, env)), env, solved.syms);
      const admissible = (x: number[]) => {
        const e = solved.envAt(x);
        // An open bound is judged at the solver's resolution, never exactly (#1504): a radius the
        // givens drive to zero converges to ~1e-10 and must not read as positive.
        const floor = openBoundFloor(solved.positionsAt(x), e, solved.syms, sampledScale);
        if (!solved.syms.every((sym) => inDomain(domains.get(sym) ?? {}, e[sym], floor))) return false;
        for (const sel of c.selectors) {
          if (sel.kind !== 'sign') continue;
          const sym = freeAngleOf(c, sel);
          if (sym === null) continue;
          const theta = e[sym];
          if (theta === undefined || !Number.isFinite(theta)) continue;
          if ((Math.tan(theta) > 0) !== sel.positive) return false;
        }
        return true;
      };
      /**
       * IN THE STUDENT'S ORDER, ONE GIVEN AT A TIME, FROM EACH SAMPLE OF THE PARAMETERS (ADR-AG-144).
       *
       * A joint descent over a dozen unknowns from a compromised start goes to a bad basin at a third of
       * the seeds — measured on the 572 figure: the second free line spun to the far root, the sign filter
       * rejected it, and every restart landed in the valley where C sits far out and the area is nearly
       * met. Each given ADDED to a state consistent with the ones before it is a small perturbation the
       * descent absorbs in a few steps — that is how the figure was typed, and how the 2-D fold replays
       * it. So the constraints are walked in application order from stage one's effort, each solve
       * warm-started from the last, then polished against the whole system; and the walk is repeated
       * from the parameters re-sampled at other seeds (a sign folded into each), so a root the first
       * sample does not reach is still reached. The joint multi-start remains the fallback.
       */
      const attempts: Env[] = [env];
      for (let salt = 1; salt <= 3; salt += 1) {
        attempts.push(foldSignSelectors(c, { ...env, ...sampleEnv(c, seed + 1000 * salt, paramReach) }));
      }
      /**
       * THE BEST EFFORT IS ALWAYS INSIDE THE DECLARED DOMAINS (#1493, ADR-AG-162).
       *
       * When nothing converges admissibly, the figure is the best EFFORT — and the effort used to be the
       * lowest residual found anywhere, including outside a parameter's declared domain. That is exactly
       * where a contradiction goes to hide: «a > 0 · A(a,0) · A על הישר x=-3» drew a = −3 with no fault, and
       * a circle whose incidences could not all hold drove its radius negative, went VACANT, and every
       * «על המעגל» on it read as met (a vacancy judges nothing, ADR-AG-008). A domain filters roots; when it
       * has filtered them all, the given is refused — so the effort drawn is the best one INSIDE the domains,
       * where the check below can see the given fail and name it. The baseline is the attempt's own start:
       * sampled inside every domain, so an admissible effort always exists.
       */
      const baseVec = solved.toVec(firstEffort ?? seeded, env);
      const baseline: SolveResult = {
        values: baseVec,
        ok: false,
        worst: Math.max(0, ...solved.residualsAt(baseVec).map((v) => Math.abs(v))),
      };
      const state: { best: SolveResult | null; accepted: boolean; fallback: SolveResult | null } = {
        best: admissible(baseVec) ? baseline : null,
        accepted: false,
        fallback: stageOneFallback,
      };
      /** Record an unaccepted attempt as the best effort — only if it respects the domains (#1493). */
      const recordEffort = (r: SolveResult) => {
        if (!admissible(r.values)) return;
        if (!state.best || r.worst < state.best.worst) state.best = { ...r, ok: false };
      };
      const resampledInside = (r: SolveResult): SolveResult | null => {
        if (ids.length === 0) return null;
        const at = solved.envAt(r.values);
        const moved = solved.syms.filter((sym) => {
          const d = at[sym] - env[sym];
          return Number.isFinite(d) && Math.abs(d) > 1e-6 * Math.max(1, Math.abs(at[sym]));
        });
        if (moved.length === 0 || figureDofOf(c, solved, r.values) === 0) return null;
        for (const salt of [1, 2]) {
          const factor = 0.25 + 1.5 * jitter(seed, 7717 * salt);
          const pushed: Record<string, number> = { ...at };
          for (const sym of moved) pushed[sym] = at[sym] + (at[sym] - env[sym]) * factor;
          if (!admissible(solved.toVec(solved.asMap(r.values), pushed))) continue;
          const fixed = carrierSystem(c, pushed, { params: 'fixed' });
          const r1 = solveLM(fixed.toVec(solved.asMap(r.values)), fixed.residualsAt, 120);
          if (!r1.ok || !selectorsHoldAt(fixed, r1.values)) continue;
          return { ok: true, worst: r1.worst, values: solved.toVec(fixed.asMap(r1.values), pushed) };
        }
        return null;
      };
      const walk = (start: Map<Id, Pt>, attempt: Env): SolveResult => {
        let x = solved.toVec(start, attempt);
        for (let i = 1; i <= c.constraints.length; i += 1) {
          const prefix = carrierSystem({ ...c, constraints: c.constraints.slice(0, i) }, attempt);
          x = solveLM(x, prefix.residualsAt, 60).values;
        }
        return solveLM(x, solved.residualsAt);
      };
      const consider = (r: SolveResult): boolean => {
        if (r.ok && admissible(r.values)) {
          // The selector preference (#1463): a solution they reject is the fallback, and the other
          // root is tried once from it — one solve, not another walk, so the cost of a figure whose
          // selectors cannot hold here stays what it was.
          let chosen: SolveResult | null = selectorsHoldAt(solved, r.values) ? r : null;
          if (!chosen) {
            state.fallback ??= r;
            for (const x1 of separatedFrom(solved, r.values)) {
              const r1 = solveLM(x1, solved.residualsAt);
              if (r1.ok && admissible(r1.values) && selectorsHoldAt(solved, r1.values)) {
                chosen = r1;
                break;
              }
            }
          }
          if (!chosen) return true; // converged: stop the attempts exactly as before; the fallback stands
          state.best = chosen;
          state.accepted = true;
          return true;
        }
        recordEffort(r);
        return false;
      };
      for (const [j, attempt] of attempts.entries()) {
        // The first walk starts from stage one's effort; a RETRY starts its vertices afresh from the
        // seed. Measured: a retry that kept the effort's vertices kept its far-flung crossing too, and
        // the walk turned the free line parallel to that crossing's line — the pole — at every retry.
        const r = walk(j === 0 ? (firstEffort ?? seeded) : starts[Math.min(j, starts.length - 1)], attempt);
        if (consider(r)) break;
        /**
         * A CONVERGED SOLUTION WITH THE WRONG SIGN is one root away, not one figure away. Re-sampling
         * every parameter throws the rest of the figure back to the seed; what the sign rejected is
         * one angle, so that angle alone is re-seeded at spread points inside its half — the two roots
         * of the exam's part (ג) are slopes −4 and +0.12, and the boundary between their basins falls
         * inside the "negative" half — and the walk resumes from the converged figure.
         */
        if (r.ok) {
          const e = solved.envAt(r.values);
          const wrong: Array<{ sym: string; positive: boolean }> = [];
          for (const sel of c.selectors) {
            if (sel.kind !== 'sign') continue;
            const sym = freeAngleOf(c, sel);
            if (sym === null || !Number.isFinite(e[sym])) continue;
            if ((Math.tan(e[sym]) > 0) !== sel.positive) wrong.push({ sym, positive: sel.positive });
          }
          if (wrong.length > 0) {
            let found = false;
            for (const frac of [0.5, 0.25, 0.75]) {
              let reseeded: Env = e;
              for (const sel of wrong) {
                const half = sel.positive ? 0 : Math.PI / 2;
                reseeded = { ...reseeded, [sel.sym]: half + (Math.PI / 2) * frac };
              }
              if (consider(walk(solved.asMap(r.values), reseeded))) {
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
      }
      if (!state.accepted && state.fallback) {
        state.best = state.fallback;
        state.accepted = true;
      }
      if (!state.accepted) {
        const vecs: number[][] = [];
        if (firstEffort) vecs.push(solved.toVec(firstEffort, env));
        vecs.push(...starts.map((m) => solved.toVec(m, env)));
        const r = solveMultiStart(vecs, solved.residualsAt, 120, admissible);
        // `solveMultiStart` returns its lowest residual whatever its domain; only an admissible one may be drawn.
        if (r.ok && admissible(r.values)) state.best = r;
        else recordEffort(r);
        // Only reachable if even the start left a domain (a sign folded outside one): keep the old answer.
        if (!state.best) state.best = r;
      }
      /**
       * A FREE PARAMETER IS NOT REPAIRED TO ITS BOUNDARY (#1634, ADR-AG-197).
       *
       * Stage two moves a parameter only because the vertices alone could not satisfy the givens at its
       * sample — and a least-squares descent from an INFEASIBLE sample stops at the first feasible value: the
       * boundary of the feasible region. «מעגל שמרכזו M(6,10)» · «B על המעגל» · «B על ציר ה-y»: r sampled in
       * [1, 4), no crossing exists below 6, and the solve stopped at r = 6 — the tangent circle — at 24/24
       * seeds. The radius is free (ADR-052), so that is a default posing as a given, and a degenerate drawing.
       *
       * The infeasible sample says which way the feasible side lies: past the boundary, away from the sample.
       * So a converged stage two that moved a parameter and left the figure with freedom is RESAMPLED inside —
       * the moved parameters pushed on past where the descent stopped, by a seed-drawn fraction of the way it
       * came, and the vertices re-solved with them held there. If that solves, the parameter was free and the
       * boundary was the descent's accident; if not (a parameter a given PINS — `a² = 4` — or a radius the
       * givens force to zero), nothing changes. A start, never a verdict: the solve and the post-hoc check
       * judge the result exactly as before.
       */
      const res = (state.accepted && state.best?.ok ? resampledInside(state.best) : null) ?? state.best!;
      free = solved.asMap(res.values);
      env = solved.envAt(res.values);
      solvedVec = res.values;
    }
  }

  /**
   * THE CHECK IS NOT PART OF THE SOLVE (#1062).
   *
   * This ran only inside `if (ids.length > 0 …)` and only on `!res.ok`, so two false assumptions were
   * baked into the shape:
   *
   *  - **"no carriers means nothing to check"** — no carriers means nothing to *move*. Whether the
   *    givens HOLD is a different question, and it is exactly the one a student asks when they state a
   *    given about points they have already placed. `A(0,0) B(4,0) C(0,3)` with «שטח המשולש ABC הוא
   *    999» was accepted in silence, and so was «B נמצא על ציר ה-x» for a `B` at `y = 5`.
   *  - **"convergence means satisfied"** — `res.ok` is the minimiser's verdict on its own progress.
   *    The figure's honesty is judged by the residuals.
   *
   * So: whether or not a solve ran, every constraint is measured against the configuration that was
   * actually reached. The solve is an attempt to *find* a figure; this is the report on the one found.
   */
  if (c.constraints.length > 0) {
    const pos = place(c, env, free);
    const scale = residualScale(c, sampledEnv);
    for (const k of c.constraints) {
      const r = residual(k, (id) => pos.get(id) ?? null, env, curveAtOf(c, env, (id) => pos.get(id) ?? null), lineAtOf(c, env, (id) => pos.get(id) ?? null), scale);
      // `null` is "cannot be judged", not "false": a constraint naming a point that vanished at this
      // parameter value must not be reported as a given the student got wrong — that would blame the
      // wrong statement, and vacancy is not a fault ([ADR-AG-008]).
      if (r === null) continue;
      if (r.some((v) => Math.abs(v) > SATISFIED_EPS)) unsatisfied.push(k);
    }
  }

  /**
   * A RING THINNER THAN ITS TOLERANCE IS NOT A SOLUTION (#1334, [ADR-AG-143](../../docs/06c-decisions-analytic.md#adr-ag-143)
   * — the analytic port of 2-D's ADR-537, the #1328 P1 one product over).
   *
   * «משולש ABC» · «AB = AC» · «∠ABC = 90» has no triangle in it: the givens hold only in the limit
   * B = C. Measured, the solve met both residuals within `SATISFIED_EPS` with |BC| ≈ 0.005 on 7-unit
   * sides — a needle — and while most seeds put it under the ring collapse floor (`COLLAPSED_SIN_TOL`),
   * the configuration search found seeds where it sat just above the floor and showed it whole, every
   * row green. The needle's thinness is not the geometry's; it is the tolerance's.
   *
   * The accept gate therefore asks not only "are the residuals small" but "is the tolerance what made
   * them small". The TRIGGER is a declared ring that is thin (`thinRingsOf`, min |sin θ| < 5e-2 — an
   * ordinary figure pays nothing). Then the SAME system is re-solved from the converged point under a
   * tightened tolerance: a genuine thin triangle (a stated 1° apex, 89° + 90°) is an EXACT solution and
   * keeps its shape; a needle bought with slack can only meet the tighter bar by collapsing past the
   * floor, where `ringFaultsOf` calls it degenerate — and then it is reported as unsatisfied, never
   * drawn as if. Blame lands on the LAST given that touches the ring (the shortest infeasible prefix
   * rule of ADR-492: the statement that completed the contradiction), so the fold names the student's
   * own sentence. Sound one way only: a re-solve that does not collapse changes nothing.
   */
  if (unsatisfied.length === 0 && c.constraints.length > 0 && (ids.length > 0 || sys.syms.length > 0)) {
    const pos0 = place(c, env, free);
    const thin = thinRingsOf(c, (id) => pos0.get(id));
    if (thin.length > 0) {
      const system = sys;
      const tight = withToleranceFactor(TIGHT_TOLERANCE_FACTOR, () => solveMultiStart([system.toVec(free, env)], system.residualsAt));
      const posT = place(c, system.envAt(tight.values), system.asMap(tight.values));
      const collapsed = new Set(ringFaultsOf(c, (id) => posT.get(id)).filter((f) => f.violation === 'degenerate').map((f) => f.id));
      /**
       * …and is the flat ring a configuration where every given is MEASURED and HOLDS (#1849, ADR-AG-247)? Only then
       * is it the givens forcing the polygon flat. A given that cannot be read on the flat figure — a ratio over an
       * area that is now zero («S_{ABD} / S_{ABC} = 2» with D on BC: 0/0) — was met by nothing, and its contradiction
       * is not a collapse; it keeps the search's words. Nor is an equation of measures that ALL vanish there: «היחס בין
       * שטח המשולש ABD לשטח המשולש ABC הוא 2:1» lowers to S_ABD = 2·S_ABC, which a flat figure meets as 0 = 0 — the
       * statement is not what holds. `span` is the flat figure's own extent, so `vanishes` is scale-free (ADR-AG-021).
       * Recorded as evidence only; the refusal below is unchanged.
       */
      const envT = system.envAt(tight.values);
      const scaleT = residualScale(c, sampledEnv);
      const atT = (id: Id) => posT.get(id) ?? null;
      const lineAtT = lineAtOf(c, envT, atT);
      const span = figureScale(posT, envT, sys.syms);
      const vanishes = (le: LengthExpr, dim: number) => {
        const v = evalLengthExpr(le, atT, envT, lineAtT);
        return v !== null && Math.abs(v) <= SATISFIED_EPS * Math.max(1, span) ** dim;
      };
      const heldFlat = c.constraints.every((k) => {
        const r = residual(k, atT, envT, curveAtOf(c, envT, atT), lineAtT, scaleT);
        if (r === null || !r.every((v) => Number.isFinite(v) && Math.abs(v) <= SATISFIED_EPS)) return false;
        if (k.t !== 'length-eq') return true;
        const dim = [...k.left.terms, ...k.right.terms].some((t) => t.kind === 'area') ? 2 : 1;
        return !(vanishes(k.left, dim) && vanishes(k.right, dim));
      });
      for (const ring of thin) {
        if (!collapsed.has(ring.id)) continue;
        if (heldFlat) collapsedRings.push(ring.id);
        const vertices = new Set<Id>(ring.vertices);
        const k = [...c.constraints].reverse().find((con) => mentionsAny(con, vertices));
        if (k && !unsatisfied.includes(k)) unsatisfied.push(k);
      }
    }
  }
  /**
   * A WHOLE FIGURE SHRUNK TO A POINT IS NOT A SOLUTION (#1620 S7, ADR-AG-213 amendment 1).
   *
   * A figure with no stated magnitude meets a contradiction in the LIMIT of collapsing: «AC קוטר» and the
   * tangents at A and C stated to meet (they are parallel) drove A, C and D onto one point — every residual
   * zero, and every scale-relative judge (the `distinct` selector's `apartOf`, the open-bound floor) measured
   * against the collapsed span, so each one held. The reference those judges lack is the figure the solve
   * STARTED from: a solve that ends with the figure's extent (`figureScale` — its points and its parameters)
   * below the solver's resolution of the extent it was sampled at has reached the degenerate limit, not a
   * configuration. Nothing stated can make that legitimate — two named points on one position is what #1113
   * forbids — and a figure whose sample was already a point (coincident stated coordinates) never triggers.
   * Blame lands on the LAST given (ADR-492's shortest infeasible prefix, as the thin-ring arm above).
   */
  if (unsatisfied.length === 0 && c.constraints.length > 0 && (ids.length > 0 || sys.syms.length > 0)) {
    const startScale = figureScale(place(c, sampledEnv, seeded), sampledEnv, sys.syms);
    const solvedPos = place(c, env, free);
    // Only while the figure still has FREEDOM: a coincidence the givens force (no freedom left) is #1254's
    // `crossing-already-named` arm in derive, which names the point already there.
    if (
      solvedPos.size >= 2 &&
      figureScale(solvedPos, env, sys.syms) < SOLVE_RESOLUTION * startScale &&
      figureDofOf(c, sys, solvedVec) > 0
    ) {
      unsatisfied.push(c.constraints[c.constraints.length - 1]);
    }
  }

  const placed = new Map<Id, Pt>(free);
  const at = (id: Id): Pt | null => placed.get(id) ?? null;

  for (const o of c.objects) {
    switch (o.kind) {
      case 'point': {
        const x = evalExpr(o.x, env);
        const y = evalExpr(o.y, env);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ id: o.id, x, y });
          placed.set(o.id, { x, y });
        }
        // A point whose coordinates do not evaluate is absent at this parameter value, never a
        // scope refusal — there is no such thing as an out-of-scope point.
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'curve': {
        const res = resolveCurve(o.curve, env);
        if (res.ok) curves.push({ id: o.id, label: o.label, curve: res.curve, stated: o.stated });
        else vacant.push({ id: o.id, reason: res.reason, ...(res.reason === 'kind-mismatch' ? { actual: res.actual } : {}) });
        break;
      }
      case 'derived': {
        // `null` means a parent was vacant at this parameter value, or the configuration is
        // degenerate (three collinear points have no circumcentre). Both are honest vacancies —
        // "not at this value" — never a point drawn at NaN and never a fallback position.
        const p = evalRule(o.rule, at, curveAtOf(c, env, at));
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          points.push({ id: o.id, x: p.x, y: p.y });
          placed.set(o.id, p);
          // The scaffolding is recorded only where the point itself exists, so a figure never shows
          // a construction for something that is not there.
          const built = constructionOf(o.rule, at, p);
          if (built) construction.push({ id: o.id, ...built });
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      /**
       * A named but unplaced point (#1017) — 2 DOF, sampled like any other free magnitude.
       *
       * Sampled about the ORIGIN rather than at it: the coordinate plane is the subject here, so a
       * vertex that defaulted to (0,0) would assert a position the question never gave and would
       * make every unplaced triangle degenerate. The spread is deliberately wide enough that three
       * unplaced vertices are not near-collinear at the first seed.
       */
      case 'free': {
        const v = placed.get(o.id);
        if (v) points.push({ id: o.id, x: v.x, y: v.y });
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'segment': {
        const a = at(o.a);
        const b = at(o.b);
        if (a && b) {
          segments.push({
            id: o.id,
            a,
            b,
            ends: [o.a, o.b],
          });
        }
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'polygon': {
        const vs = o.vertices.map(at);
        if (vs.every((v): v is Pt => v !== null)) {
          // Drawn as its closed ring of sides. The renderer stays a pure consumer: it is handed
          // screen-ready pairs, never asked to look a vertex up.
          for (let i = 0; i < vs.length; i += 1) {
            const ends: [Id, Id] = [o.vertices[i], o.vertices[(i + 1) % vs.length]];
            segments.push({
              id: `${o.id}-${i}`,
              a: vs[i],
              b: vs[(i + 1) % vs.length],
              ends,
            });
          }
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      /**
       * A circle ON A POINT (#1060) — the first curve whose shape depends on the figure.
       *
       * Resolved HERE, where the centre has a position, into exactly the `NumCurve` every other
       * circle becomes. So the renderer, the centre mark (ADR-AG-036), the panel row and the
       * `on-curve` carrier all work on it without knowing it arrived differently.
       *
       * A radius that is not a positive number is a VACANCY, not an error: «r» may still be an
       * unbound symbol at this point, and an empty circle is a state the figure already reports.
       */
      case 'circle-at': {
        const c0 = at(o.centre);
        const radius = evalExpr(o.r, env);
        if (c0 && Number.isFinite(radius) && radius > 0) {
          curves.push({
            id: o.id,
            label: { name: '', kind: 'circle' },
            curve: { kind: 'circle', cx: c0.x, cy: c0.y, r: radius },
            // A sector's circle (#1622 E4) carries its points and is not drawn — the arc is.
            stated: !o.hidden,
          });
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }

      /**
       * «דרך P עובר ישר מקביל ל AB» — the line through a placed point, in closed form (#1093).
       *
       * Like `circle-at` above, this reads the PLACED anchor rather than the stated one: the point
       * may be free, or riding a carrier, and where it ended up this configuration is what the line
       * passes through.
       *
       * `dirVector` is the solver's own resolver, exported rather than re-implemented — it already
       * knows all three ways a direction can be named (two points, an axis, a named line) and
       * already returns `null` for a degenerate one. A second copy here would be the drift the
       * `direction()`/relation split exists to prevent.
       *
       * A direction that cannot be resolved is a VACANCY, not an error, for `circle-at`'s reason: the
       * objects it is read from may simply not be placed yet, and an empty line is a state the figure
       * already reports honestly.
       */
      case 'line-at': {
        // One reading with the curve resolver (`lineAtCurve`), so the line drawn is the line the
        // constraints were measured against. The NAME rides on the label (#1319), so the panel lists it
        // and a crossing ring can offer a sentence about it.
        const curve = lineAtCurve(c, env, at, o);
        if (curve) {
          curves.push({ id: o.id, label: { name: o.name ?? '', kind: 'line' }, curve, stated: o.drawn !== false });
        } else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }

      /**
       * «מעגל ABD» · «BD קוטר במעגל» — a circle computed from placed points (#1464, #1324). The same
       * resolver the constraints are measured against (`curveAtOf`), so the circle drawn is the circle judged.
       */
      case 'circle-thru': {
        const curve = circleThruCurve(o, at);
        if (curve) curves.push({ id: o.id, label: { name: o.name ?? '', kind: 'circle' }, curve, stated: !o.hidden });
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }

      /**
       * A DRAWN ARC (#1622 E4, ADR-AG-220) — on the circle the figure resolved (the one the constraints were measured
       * against), between the directions of its two ends. Its circle or an end absent, or an end at the centre, is a
       * vacancy, never an arc drawn through a guess.
       */
      case 'arc': {
        const arc = arcOf(o.id, o.def, at, curveAtOf(c, env, at));
        if (arc) arcs.push(arc);
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }

      default: {
        // EXHAUSTIVE, like every switch in carriers.ts. Without this a new object kind compiles
        // clean and evaluates to NOTHING — silently absent from the figure, which is the #1038
        // class: a switch that enumerates kinds and is not forced to stay complete.
        const unevaluated: never = o;
        throw new Error(`object kind has no evaluation: ${JSON.stringify(unevaluated)}`);
      }
    }
  }
  /*
   * #1937/#1971 (ADR-AG-255, the operator's 2026-10-09/10 rulings): an off-ink construction point gets its carrying
   * line extended, dashed, to meet it. The lines come from the construction (`carryingLines`); the decision is the
   * shared planar one (`shell/offInk`), over the ink this figure draws — its segments and its stated lines.
   */
  const placedAt = new Map(points.map((p) => [p.id, p] as const));
  /*
   * **Ruled 2026-10-10 (#1937, ADR-AG-255):** a diagonal meet that falls OFF its diagonals draws the two diagonals
   * themselves, whichever spelling named it, so «O מפגש האלכסונים» and «אלכסוני המרובע נפגשים בנקודה O» give the
   * same figure there. Inside, #1751 (ADR-AG-241) stands: the noun spelling draws the point only. "Off" is the shared
   * off-ink decision itself, asked over the diagonals' spans alone: a stretch is owed exactly when the meet is beyond one.
   */
  const drawnKeys = new Set(segments.map((s) => [...s.ends].sort().join('|')));
  for (const o of c.objects) {
    if (o.kind !== 'derived' || o.rule.t !== 'diagonals') continue;
    const m = placedAt.get(o.id);
    const [a, b, cc, d] = o.rule.v.map((id) => placedAt.get(id));
    if (!m || !a || !b || !cc || !d) continue;
    const off = offInkExtensions(
      [
        { p: m, a, b: cc },
        { p: m, a: b, b: d },
      ],
      [],
    );
    if (off.length === 0) continue;
    for (const [i, j] of [
      [0, 2],
      [1, 3],
    ] as const) {
      const ends: [Id, Id] = [o.rule.v[i], o.rule.v[j]];
      const key = [...ends].sort().join('|');
      if (drawnKeys.has(key)) continue;
      drawnKeys.add(key);
      const pa = placedAt.get(ends[0])!;
      const pb = placedAt.get(ends[1])!;
      segments.push({ id: segmentIdOf(ends[0], ends[1]), a: { x: pa.x, y: pa.y }, b: { x: pb.x, y: pb.y }, ends });
    }
  }
  const extensions = offInkExtensions(
    carryingLines(c).flatMap((k) => {
      const p = placedAt.get(k.id);
      const a = placedAt.get(k.a);
      const b = placedAt.get(k.b);
      return p && a && b ? [{ p, a, b }] : [];
    }),
    segments.map((s) => ({ a: s.a, b: s.b })),
    curves.flatMap((cv) => {
      if (!cv.stated || cv.curve.kind !== 'line') return [];
      const { a, b, c: c0 } = cv.curve;
      const nn = a * a + b * b;
      return nn > 1e-24 ? [{ anchor: { x: (-a * c0) / nn, y: (-b * c0) / nn }, dir: { x: -b, y: a } }] : [];
    }),
  ).map((e) => ({ a: e.from, b: e.to }));
  const figure: Figure = {
    env,
    points,
    curves,
    segments,
    arcs,
    construction,
    extensions,
    vacant,
    unsatisfied,
    // Reported as the STATED selectors (a cycled pair's ordinal is the sentence's own object), so `derive`
    // blames the line that stated it.
    ...((failing) => ({ selectorsOk: failing.length === 0, selectorsFailing: failing.map((q) => raw.selectors[c.selectors.indexOf(q)] ?? q) }))(
      failingSelectors(c, placed, env),
    ),
    /**
     * Read from the POINTS this evaluation just produced, so the ring judged is the ring drawn
     * (#1158, #1166). A vertex that did not resolve leaves its polygon unjudged — that is a vacancy
     * and belongs to ADR-AG-008.
     */
    ringFaults: ringFaultsOf(
      c,
      (id) => {
        const p = points.find((q) => q.id === id);
        return p ? { x: p.x, y: p.y } : undefined;
      },
    ).map((rf) => withRingDof(rf, c, sys, [...solvedVec])),
    carrierDof: figureDofOf(c, sys, solvedVec),
    ...(collapsedRings.length > 0 ? { collapsedRings } : {}),
    usedSymbols: [...usedSymbols(c)],
    ...(choiceSeed !== seed ? { choiceSeed } : {}),
    provenance: Object.fromEntries(
      points.map((p) => [p.id, provenanceOf(c, p.id, env, curves) ?? { x: { known: false }, y: { known: false } }]),
    ),
  };
  return withSeparationDof(figure, c, sys, [...solvedVec]);
}

// ---------------------------------------------------------------------------
// Knowledge — the honesty gate the data panel binds
// ---------------------------------------------------------------------------

/**
 * Is a quantity KNOWLEDGE, or one sample's accident? Evaluated across several seeds: a value that
 * agrees everywhere is invariant over the free parameters and may be printed; one that moves may
 * not ([ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2 — with values shown in the
 * panel, this gate carries the whole honesty boundary, so it is the one function in the tree that
 * most deserves its tests).
 */
/**
 * How far the DRAWABLE search looks — the same budget `derive` gives the figure it shows.
 */
const DRAWABLE_TRIES = 24;

/**
 * How many valid-but-for-the-ring configurations the walk must have seen before "crossed in every one" is evidence
 * (#1927, ADR-AG-250) — the floor 2-D's `forcedCrossingKeys` uses, so a thin pool fails open (records as before).
 */
const FORCED_RING_FLOOR = 4;

/**
 * How far past the default window the ring search reaches (#1939, ADR-AG-256): each reach multiplies the magnitude a free
 * parameter is drawn at (1..4 becomes 4..16, 16..64, 64..256), `RING_REACH_TRIES` seeds each. A deterministic, bounded
 * search (M3: a work budget, never a clock), paid only by a figure whose walk found a declared ring crossed everywhere.
 */
const RING_REACHES = [4, 16, 64] as const;
const RING_REACH_TRIES = 8;

/**
 * Per construction, the drawable figure at each seed. The panel asks per coordinate per point, and
 * each answer may now cost several evaluations, so the work is done once.
 */
// Keyed by seed AND by whether the spread preference was applied (#1174): the two modes answer
// differently for the same seed, and sharing one cache would let whichever caller ran first
// decide what the other one sees.
const drawableCache = new WeakMap<Construction, Map<string, Figure>>();

/**
 * The figure the tool would SHOW at this seed (#1083).
 *
 * Operator, 2026-09-15: *"on this shape, point C should be able to be positioned"* — on a figure
 * whose `C` was identical at every configuration he could reach, and which the panel called open.
 *
 * The gate was asking a different question from the one the student sees. `derive` advances the
 * seed until the SELECTORS hold, because a configuration that fails them is not a figure this tool
 * draws; `isKnowledge` and `knownOptions` called `evaluate` directly and judged "does this value
 * vary?" across configurations that had been rejected before they ever reached the canvas. Of
 * course it varied there. Measured on his figure: three raw seeds put `C` at three different places
 * and NONE of them satisfied the selectors.
 *
 * **The honesty gate must be measured over the configurations the tool would draw**, or it reports
 * as freedom something the student can never see.
 *
 * Falls back to the raw figure when nothing in the budget holds — the same thing `derive` shows,
 * for the same reason: a figure is still drawn, and the gate must judge THAT one.
 */
export function drawableAt(
  c: Construction,
  seed: number,
  /**
   * Prefer a WELL-SPREAD configuration among the valid ones (#1174).
   *
   * **Default `false`, deliberately.** This preference must never reach `isKnowledge`,
   * `knownOptions` or the locus determinacy gate: those ask what is true across the configurations
   * the tool would ADMIT, and narrowing that pool to the pretty ones would let the tool claim
   * knowledge it does not have — the one way this change can become an honesty bug. Defaulting to
   * off means a caller added later inherits the honest behaviour and has to ask for the other.
   *
   * The DISPLAY callers ask for it: `derive` (the figure on the canvas) and the walk behind
   * «הציגו תצורה אחרת».
   */
  preferSpread = false,
): Figure {
  let perSeed = drawableCache.get(c);
  if (!perSeed) {
    perSeed = new Map();
    drawableCache.set(c, perSeed);
  }
  const key = `${seed}:${preferSpread ? 1 : 0}`;
  const hit = perSeed.get(key);
  if (hit) return hit;

  /**
   * A figure is drawable when its selectors hold AND every object the student NAMED is in it.
   *
   * The second half was found by the operator asking why a figure of his had a second answer
   * (#1083). It did not: in that configuration the point `O` — «אלכסוני המרובע נפגשים בנקודה O» —
   * was VACANT, because `A` and `C` had landed on the same side of `BD` and the diagonals crossed
   * only when extended. (ADR-AG-021 then left `O` out of such a figure; since ADR-AG-255 the diagonals are LINES and
   * `O` exists there, drawn with its dashed extension — the preference below still governs every other vacancy.)
   * What is wrong is SHOWING a figure with a vacancy while another one has every point the student asked for.
   *
   * A vacancy is still not an error (ADR-AG-008) — it is a preference, applied only when a better
   * configuration exists inside the budget.
   */
  /**
   * …and the third term: every polygon the student DECLARED is drawn as the ring its noun promises
   * (#1158, #1166).
   *
   * It belongs exactly here, beside the other two, because this is the one place that chooses which
   * configuration the tool shows — so canvas, data panel, `isKnowledge`, `knownOptions` and
   * «הציגו תצורה אחרת» are all corrected together and no noun has to be taught about it. The
   * operator met the defect through the configuration walk («i later ask for another shape and get
   * this»), and the walk is downstream of this function.
   *
   * Consulted as a PREFERENCE inside the existing budget, like its neighbours: a figure whose givens
   * genuinely force a bad ring still gets drawn rather than vanishing — and `derive` reports it on
   * the line that named the polygon, which is the honest half. Measured across seven quadrilateral
   * figures (#1158), a valid ring was reachable within 7 extra seeds from every start and there were
   * ZERO starts with none inside `DRAWABLE_TRIES`, so the budget did not need raising.
   */
  /**
   * …and the fourth term of VALIDITY: every constraint HOLDS (#1287, ADR-AG-134).
   *
   * A configuration in which the solve stopped at a non-solution — a point on neither of the two
   * curves it was told to lie on — was `whole`: its selectors held, nothing was vacant, no ring was
   * wrong, so it was chosen for display, listed in the data panel and offered by «הציגו תצורה אחרת»
   * while seeds either side of it had the real crossing. Unsatisfied givens are the one thing this
   * product may never draw as if; they are a validity failure, not a preference, and they belong here
   * beside the other three. A figure whose givens hold at NO seed still falls through to the fallback
   * and is reported on the line that stated them — nothing vanishes.
   */
  const whole = (f: Figure) => f.selectorsOk && f.vacant.length === 0 && f.ringFaults.length === 0 && f.unsatisfied.length === 0;
  /**
   * …and, for the display callers only, a FOURTH term above validity (#1174).
   *
   * `whole` answers *may this be drawn*. Among the many configurations that may be, this function
   * used to take the FIRST — so the sampler’s luck was presented as the answer, and the operator
   * twice stopped a play pass to report a near-flat triangle with a 25° one two seeds away.
   *
   * It is a PREFERENCE and never a requirement: every tier below it still applies, so a figure whose
   * givens genuinely force a tight wedge is still drawn (ADR-052 — a valid configuration must stay
   * reachable). It only decides which of several equally valid drawings is opened on.
   */
  const spread = (f: Figure) =>
    minInteriorAngleOf(c, (id) => {
      const p = f.points.find((q) => q.id === id);
      return p ? { x: p.x, y: p.y } : undefined;
    }) >= SPREAD_MIN_DEG;
  /**
   * …and, for the display callers, TWO DISTINCT NAMED POINTS ARE NEVER OPENED ON TOP OF EACH OTHER
   * (#1273, ADR-W-072 / ADR-AG-138 — operator ruling, 2026-09-20, T18: *"even if they do fall on the same
   * point by chance … the system should not show them on top of each other. It should automatically look
   * for a different config and show them differently"*, and cross-product: *"the 2d and 3d tools should
   * follow the same logic"*).
   *
   * The 2-D shape, ported rather than reinvented (ADR-486, `firstSatisfyingSeed`): a separated
   * configuration wins outright; a stacked one is REMEMBERED and used only if nothing else turns up
   * inside the budget. So it is a preference below validity and never a requirement — a figure whose
   * every configuration stacks two labels (the coincidence the givens FORCE) is still drawn, and refusing
   * such a statement at its source is #1254's half. Display only, like `spread`: the knowledge gates must
   * keep every admissible configuration.
   *
   * **The ruler is the SEEING one, {@link stackedPairs} (#1526, ADR-AG-181).** It was `crossings.apart()`,
   * the identity tolerance (a millionth of the span): a free point riding a carrier that passes through an
   * existing point — «Y נמצאת על הישר y=x» beside V(0,0) — was sampled 0.025 from V on a frame of 4, which
   * is not the same point and so passed, while the student saw one dot with two names. Every free point
   * (a line, circle or curve rider, or none) and every derived one is kept apart by this one test, because
   * it judges the drawing, not the sampler that produced it. Still a preference: a coincidence the givens
   * force («שיעור ה-x של Y הוא 0») stacks at every seed and is drawn from the remembered tier.
   */
  const separated = (f: Figure) => stackedPairs(f).length === 0;
  /**
   * …and A DIAGONAL MEET THAT LIES ON BOTH DIAGONALS IS PREFERRED, never required (#1937, ADR-AG-255).
   *
   * The operator ruled on 2026-10-09 that «האלכסונים נפגשים» is where the diagonal LINES meet (`diagonalMeet`), so a
   * concave quadrilateral's meet exists and is drawn with its dashed extension. Under the old SEGMENT reading
   * (ADR-AG-021) such a configuration was VACANT, and the vacancy term above steered every figure that COULD be drawn
   * with crossing diagonals onto one that was. That steering is kept at exactly its old strength, as a tier: a
   * configuration whose meet needs an extension is remembered and drawn only when nothing inside the walk has the
   * diagonals crossing. So a figure HEAD drew with its diagonals crossing — the operator's own kite (#1083), whose C
   * the panel reads as (−5, −5) — is drawn and judged as before, and only a figure with NO crossing configuration
   * (the #1937 concave ring) changes: from a missing O to O with its extension. Both callers apply it, as they
   * applied the vacancy it replaces.
   */
  const meetsOnDiagonals = (f: Figure) => diagonalMeetsCross(c, f);
  const wholeOn = (f: Figure) => whole(f) && meetsOnDiagonals(f);
  const preferred = (f: Figure) => wholeOn(f) && (!preferSpread || (spread(f) && separated(f)));

  const first = evaluate(c, seed);
  let chosen = first;
  // The tiers, weakest last: a whole SEPARATED figure beats a whole stacked one, which is merely narrow
  // or stacked but still beats one with a vacancy, which still beats one that fails a selector outright.
  let wholeSeparated: Figure | null = wholeOn(first) && (!preferSpread || separated(first)) ? first : null;
  let wholeFallback: Figure | null = wholeOn(first) ? first : null;
  // #1937: whole, but a diagonal meet sits on the diagonals' extension — drawn only if no crossing figure turns up.
  let wholeExtended: Figure | null = whole(first) ? first : null;
  let fallback: Figure | null = first.selectorsOk ? first : null;
  /**
   * A DETERMINED figure that is whole but narrow has nowhere to walk TO (ADR-AG-144): with no freedom
   * left, another seed can reach only another ROOT of the same givens, and a prettier root is found
   * within a few seeds or not at all (#1174 measured a valid ring within 7 extra seeds from every
   * start). Walking all twenty-four cost the 572 figure — fifteen lines, three parameters, one narrow
   * triangle the givens fix — two seconds per derivation for a walk that could change nothing. The
   * budget is a PREFERENCE's budget; validity (a non-whole first figure) keeps the full walk.
   */
  const budget = whole(first) && first.carrierDof === 0 ? 8 : DRAWABLE_TRIES;
  /**
   * A PREFERENCE NEVER CROSSES A DISCRETE CHOICE (#1719, ADR-AG-227). The walk below looks for a PRETTIER drawing
   * of the same configuration; a later seed also resolves every \`choice\` afresh, so it could reach another OPTION —
   * and when the seed's own option is legitimately narrow («sin∢ABC = ½»'s 150°, whose other two angles share 30°)
   * the spread preference walked to the acute option at every seed: «הציגו תצורה אחרת» could never show the obtuse
   * one the ruling cycles to. So once the first figure is VALID, a candidate counts only if it took the same options;
   * validity itself (a first figure that is not whole) still walks to any option, as before.
   */
  /**
   * THE WALK'S RING EVIDENCE (#1927, ADR-AG-250) — no new search: every candidate this walk evaluates is read once.
   * A candidate VALID but for its rings (givens hold, selectors hold, nothing vacant) is a configuration the givens
   * allow; per declared ring, did ANY such candidate draw it simple? `noteRings` records it; the fallback figure
   * carries the rings crossed in at least `FORCED_RING_FLOOR` of them and simple in none (`forcedCrossed`). A
   * candidate where the ring is FLAT answers neither way — it is not a simple ring, and flatness is ADR-AG-247's
   * (measured: «משולש ABC · D אמצע BC · E אמצע AC · מרובע ABED» is crossed at 24 seeds and flat at one).
   */
  const validButRings: Figure[] = [];
  const crossedIn = new Map<Id, number>();
  const simpleSomewhere = new Set<Id>();
  const noteRings = (f: Figure) => {
    if (!f.selectorsOk || f.vacant.length > 0 || f.unsatisfied.length > 0) return;
    validButRings.push(f);
    const hard = new Map(f.ringFaults.filter(isHardRingFault).map((rf) => [rf.id, rf.violation]));
    for (const o of c.objects) {
      if (o.kind !== 'polygon') continue;
      const v = hard.get(o.id);
      if (v === 'crossed') crossedIn.set(o.id, (crossedIn.get(o.id) ?? 0) + 1);
      else if (v === undefined) simpleSomewhere.add(o.id);
    }
  };
  noteRings(first);
  const firstOptions = choiceOptions(c, first.choiceSeed ?? seed);
  const sameChoices = (f: Figure, s: number) => !whole(first) || choiceOptions(c, f.choiceSeed ?? s) === firstOptions;
  if (!preferred(first)) {
    for (let extra = 1; extra <= budget; extra += 1) {
      const candidate = evaluate(c, seed + extra);
      if (!sameChoices(candidate, seed + extra)) continue;
      noteRings(candidate);
      if (preferred(candidate)) {
        chosen = candidate;
        fallback = candidate;
        wholeFallback = candidate;
        wholeSeparated = candidate;
        wholeExtended = candidate;
        break;
      }
      if (!wholeSeparated && wholeOn(candidate) && (!preferSpread || separated(candidate))) wholeSeparated = candidate;
      if (!wholeFallback && wholeOn(candidate)) wholeFallback = candidate;
      if (!wholeExtended && whole(candidate)) wholeExtended = candidate;
      // Second best: the selectors hold and something the student named is missing. Remembered, so a
      // figure with a vacancy still beats one that fails a selector outright.
      if (!fallback && candidate.selectorsOk) fallback = candidate;
    }
    if (!preferred(chosen)) chosen = wholeSeparated ?? wholeFallback ?? wholeExtended ?? fallback ?? chosen;
    /**
     * SEARCH FIRST, REFUSE LAST (#1927 / #1939, ADR-AG-256; the operator's ruling of 2026-10-09: *"When a letter in the
     * sentence can move the shape, hunt for a value that makes it valid and DRAW it. Refuse only when nothing the
     * student wrote can save it."*). A ring the walk found crossed everywhere is not yet a verdict when its shape can
     * still change (`shapeDof > 0`) and the figure has a free PARAMETER: the walk drew each parameter inside the
     * sampler's default window, and «A(k,0) · B(4,0) · C(1,3) · D(3,3) · טרפז ABCD» is a genuine trapezoid only for
     * k > 4, outside it. So the same walk runs again with the parameters' reach widened (`RING_REACHES`): a whole
     * figure found there is the figure drawn, and a ring drawn simple anywhere is not forced. An affinely rigid ring
     * (`shapeDof === 0`) is proven crossed in every configuration and needs no search; a figure with no parameter has
     * nothing a reach could move, and its walk already ranged over its free points.
     */
    if (!whole(chosen)) {
      const pending = [...crossedIn].filter(([id, n]) => n >= FORCED_RING_FLOOR && !simpleSomewhere.has(id)).map(([id]) => id);
      const unproven = pending.filter((id) => {
        const host = validButRings.find((f) => f.ringFaults.some((r) => r.id === id && r.violation === 'crossed'));
        return host?.ringFaults.find((r) => r.id === id)?.shapeDof !== 0;
      });
      if (unproven.length > 0 && paramRegister(c).length > 0) {
        search: for (const reach of RING_REACHES) {
          for (let extra = 0; extra < RING_REACH_TRIES; extra += 1) {
            const candidate = evaluate(c, seed + extra, reach);
            noteRings(candidate);
            if (whole(candidate)) {
              chosen = candidate;
              break search;
            }
          }
        }
      }
    }
    if (!whole(chosen)) {
      const forced = [...crossedIn].filter(([id, n]) => n >= FORCED_RING_FLOOR && !simpleSomewhere.has(id)).map(([id]) => id);
      /**
       * A copy: `evaluate`'s figure is memoised and shared, and this is the WALK's finding, not that seed's. And the
       * figure it rides on is one whose GIVENS HOLD (the first valid candidate that draws a forced ring crossed), never a fallback
       * whose solve stopped short: the walk has just shown every given can hold with the ring crossed, so a figure that breaks one would
       * have `derive` blame a given (`unsatisfiable`, or ADR-AG-247's collapse when that stop was flat — measured on
       * «מקבילית ABCD · מרובע ACBD» at seeds 3 and 6) for what is the ring's order.
       */
      const crossedHere = (f: Figure) => f.ringFaults.some((rf) => rf.violation === 'crossed' && forced.includes(rf.id));
      if (forced.length > 0) chosen = { ...(validButRings.find(crossedHere) ?? chosen), forcedCrossed: forced };
    }
  }
  perSeed.set(key, chosen);
  return chosen;
}
/**
 * Does every diagonal meet in this figure lie ON both of its diagonals (#1937, ADR-AG-255)? Closed, relative — the
 * interval ADR-AG-021 used, kept as the PREFERENCE `drawableAt` applies now that the meet is read on the lines.
 */
function diagonalMeetsCross(c: Construction, f: Figure): boolean {
  const at = (id: Id) => f.points.find((p) => p.id === id);
  for (const o of c.objects) {
    if (o.kind !== 'derived' || o.rule.t !== 'diagonals') continue;
    const m = at(o.id);
    if (!m) continue;
    const [a, b, cc, d] = o.rule.v.map(at);
    if (!a || !b || !cc || !d) continue;
    for (const [p, q] of [
      [a, cc],
      [b, d],
    ] as const) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const n2 = dx * dx + dy * dy;
      if (!(n2 > 1e-24)) continue;
      const t = ((m.x - p.x) * dx + (m.y - p.y) * dy) / n2;
      if (t < -1e-9 || t > 1 + 1e-9) return false;
    }
  }
  return true;
}

/**
 * When two INDEPENDENT solves have found the same answer (#1083).
 *
 * Not `SATISFIED_EPS`, and the difference is the point: that is how small a RESIDUAL must be for one
 * configuration to satisfy its givens. This is how far apart two configurations may land and still be
 * the same solution — and two least-squares descents from different starting points agree to rather
 * less than they each satisfy.
 *
 * Measured on the operator's own figure (#1083): twenty-four drawable configurations all found
 * `C = (-5, -5)`, spread over `1.1e-5`. At the residual tolerance that reads as FIVE distinct
 * answers, and the panel offered the student five identical-looking options.
 */
const SAME_VALUE_EPS = 1e-4;

/**
 * What makes two configurations the SAME configuration, for a student looking at them (#1084, #1282).
 *
 * The placed points AND the resolved curves, rounded a hair finer than the canvas can show. Coarser
 * than the solver's own agreement on purpose: two configurations differing in the sixth decimal are
 * one picture. A LINE IS SIGNED NORMALISED — `(a,b,c)` and `(2a,2b,2c)` are the same line and the
 * solve can land on differently scaled triples — via `normalizedLine` (#1201), the one place that
 * decides when two lines are the same line ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 *
 * **It lives HERE, in the engine, because it is the same question three consumers ask.** It began in
 * `app/another.ts` for «הציגו תצורה אחרת» (#1084), and #1282 is what the second consumer cost: the
 * knowledge gate asked for three SEEDS instead of three CONFIGURATIONS, got one picture three times,
 * and read zero spread as certainty. `another.ts` now calls this rather than owning a second copy.
 */
export function figureSignature(f: Figure): string {
  return signatureParts(f)
    .map((g) => `${g.label}${g.values.map(zeroFree).join(',')}`)
    .join('|');
}

/**
 * A NUMBER TO SIGN, WITHOUT ITS SIGNED ZERO (#1539, ADR-AG-197). `(-1e-9).toFixed(4)` is «-0.0000», and the
 * signature read the solver's noise around zero as a second configuration: a fully determined figure counted
 * as three, «הציגו תצורה אחרת» "found" a picture identical to the one on screen, and the walk that should
 * swap two named crossings stopped on the noise instead. Zero has one spelling.
 */
function zeroFree(v: number): string {
  const s = v.toFixed(4);
  return /^-0\.0*$/.test(s) ? s.slice(1) : s;
}

/**
 * The configuration as labelled NUMBERS — one list for the signature and for the tolerance-aware comparison
 * ({@link sameConfiguration}), so "the same picture" has one definition (ADR-W-053). `#` marks the number's
 * place in its label.
 */
function signatureParts(f: Figure): Array<{ label: string; values: number[] }> {
  const out: Array<{ label: string; values: number[] }> = [];
  for (const p of f.points) out.push({ label: `${p.id}:`, values: [p.x, p.y] });
  for (const c of f.curves) {
    const [kind, values] = curveNumbers(c.curve);
    out.push({ label: `${c.id}:${kind} `, values });
  }
  /**
   * …AND THE PARAMETERS THE FIGURE USES (#1343, amending ADR-AG-144). A parameter is part of the
   * configuration exactly as a point is, and a value that lives only in the environment was invisible
   * here: every seed signed identically for a figure whose parameter nothing drew, the knowledge gate saw
   * ONE configuration, and printed its one sample as certainty. Only the USED symbols sign — a declared
   * symbol nothing reads is not part of any configuration a student can see, so «הציגו תצורה אחרת»
   * stays honest about it — and never a free direction, whose line already signs and whose angle has two
   * spellings for one line.
   */
  for (const sym of f.usedSymbols) {
    if (isDirectionSymbol(sym) || !Number.isFinite(f.env[sym])) continue;
    out.push({ label: `${sym}=`, values: [f.env[sym]] });
  }
  return out;
}

/** The resolved shape of one curve as numbers, to compare — a line SIGNED NORMALISED (#1201). */
function curveNumbers(c: NumCurve): [string, number[]] {
  switch (c.kind) {
    case 'line': {
      const k = normalizedLine(c.a, c.b, c.c);
      // A degenerate triple has no line to compare; it signs as itself rather than throwing.
      return ['line', k ? [k.a, k.b, k.c] : [c.a, c.b, c.c]];
    }
    case 'circle':
      return ['circle', [c.cx, c.cy, c.r]];
    case 'parabola':
      return ['parabola', [c.p]];
    case 'ellipse':
      return ['ellipse', [c.a, c.b]];
  }
}

/**
 * ARE THESE TWO CONFIGURATIONS ONE PICTURE? (#1539, ADR-AG-197) — the TOLERANCE-AWARE reading of
 * {@link figureSignature}. A rounded string still splits two solves of one root that straddle a rounding
 * boundary (1.23455 vs 1.23454); this compares the same labelled numbers within the value-identity bar the
 * knowledge gate already uses (`SAME_VALUE_EPS`, relative). What the distinct walk, «הציגו תצורה אחרת» and the
 * pool's starvation test count with.
 */
export function sameConfiguration(a: Figure, b: Figure): boolean {
  const pa = signatureParts(a);
  const pb = signatureParts(b);
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i += 1) {
    if (pa[i].label !== pb[i].label || pa[i].values.length !== pb[i].values.length) return false;
    for (let j = 0; j < pa[i].values.length; j += 1) {
      const x = pa[i].values[j];
      const y = pb[i].values[j];
      if (!(Math.abs(x - y) <= SAME_VALUE_EPS * Math.max(1, Math.abs(x), Math.abs(y)))) return false;
    }
  }
  return true;
}

/** How many different pictures these configurations are. */
function distinctCount(figs: readonly Figure[]): number {
  const reps: Figure[] = [];
  for (const f of figs) if (!reps.some((r) => sameConfiguration(r, f))) reps.push(f);
  return reps.length;
}

/** How far to look for a differing configuration. The same budget the drawable search and the
 *  «תצורה אחרת» button use, for the same reason. */
const DISTINCT_TRIES = 24;

const distinctCache = new WeakMap<Construction, Map<number, number[]>>();

/**
 * The seeds of up to `count` configurations that actually DIFFER (#1282).
 *
 * `drawableAt` repairs a seed whose figure is not whole by walking FORWARD to the next whole one, so
 * consecutive seeds routinely resolve to ONE figure. Measured on the operator's trapezoid: only 4 of
 * 24 seeds are whole, and seeds 0–8 all walk forward to seed 8 — so `[0, 1, 2]` was one sample taken
 * three times, and any test of "does this value vary?" over it is answering about a single picture.
 *
 * Returns fewer than `count` when the figure genuinely has fewer distinct configurations — a
 * determined figure returns one — which is exactly what a caller needs to know.
 *
 * **It is no longer the knowledge gate's sample (#1473, ADR-AG-180, amending the #1282 note).** "The first
 * three configurations that differ" answers *does this vary?*, not *what does the figure admit?*: any
 * continuous DOF — the triangle's own sliding vertex, an unrelated «נקודה Z» — makes every seed a new
 * signature, so all three samples are spent on the continuous family and the DISCRETE choice (which root
 * of an area, which crossing) is never varied. Three seeds in one basin then read a two-root value as
 * invariant. The gates judge the {@link configurationPool} instead; this stays what «הציגו תצורה אחרת»
 * walks, and what the render path already pays for (the pool's synchronous floor).
 */
export function distinctConfigSeeds(c: Construction, count = 3, tries = DISTINCT_TRIES): number[] {
  let perCount = distinctCache.get(c);
  if (!perCount) {
    perCount = new Map();
    distinctCache.set(c, perCount);
  }
  const hit = perCount.get(count);
  if (hit) return hit;

  const seeds: number[] = [];
  const seen: Figure[] = [];
  for (let seed = 0; seed < tries && seeds.length < count; seed += 1) {
    const f = drawableAt(c, seed);
    // Tolerance-aware (#1539): two solves of one root are one configuration whatever their rounding.
    if (seen.some((g) => sameConfiguration(g, f))) continue;
    seen.push(f);
    seeds.push(seed);
  }
  const out = seeds.length > 0 ? seeds : [0];
  perCount.set(count, out);
  return out;
}

// ---------------------------------------------------------------------------
// The configuration pool — ONE set every knowledge gate judges (#1473, ADR-AG-180)
// ---------------------------------------------------------------------------

/**
 * How many drawable configurations the pool holds: the budget `knownOptions` has always read, measured
 * (#1036: a root reached 5 times in 24 seeds), and the same one `derive` and «תצורה אחרת» search. Never
 * shrink it to make a line faster — on the #1473 corpus, 12 seeds still printed a two-root value as
 * fact; the cost belongs off the render path (below), not out of the sample.
 */
export const POOL_SIZE = 24;

/**
 * THE CONFIGURATION POOL (#1473, ADR-AG-180) — the drawable figures at seeds `0..POOL_SIZE−1`, one per
 * construction, shared by every gate that asks "is this knowledge?" or "what options does it take?".
 *
 * Operator, 2026-09-29 (on #1473's measurement): the panel printed `C = (x_C, −4)` for a triangle of area
 * 12 on a base of 6 while «הציגו תצורה אחרת» drew C at y = +4. `isKnowledge` read three *distinct*
 * configurations (#1282), `knownCurve` three *raw* seeds, and `knownOptions` twenty-four — three gates,
 * three pools, and a value could be "known" to one while another listed its second root. **The class: a
 * knowledge gate reads a sample sized for "does it vary?" and treats it as the complete configuration
 * set.** One pool, read by all three, makes "the value" and "the option set" two readings of one set.
 *
 * It is SAMPLED, never proven (analytic has no CAS, ADR-AG-001 D1): a root the seeds reach less than
 * about once in 24 can still hide. Measured 0 such cases over 1154 corpus figures; the escalation path is
 * exact per-object enumeration (as `crossings.ts meetConic` does for curve crossings), never a blanket
 * withhold.
 *
 * ## Filled lazily, and — on the page — AFTER the render (operator ruling, option B′)
 *
 * It shares `drawableAt`'s per-seed cache, so a seed any gate or the distinct walk already evaluated costs
 * nothing. Off the page (tests, the corpus locks, any caller that did not {@link ConfigurationPool.defer}
 * it) the first gate FILLS it and answers the settled verdict. On the page, `App.tsx` defers the pool of
 * the derivation it renders: the gates then judge only the seeds already evaluated, a value those seeds
 * read as invariant answers PENDING (the panel shows «בודק…», never a provisional number), a value they
 * already see differ is open at once, and `app/poolScheduler.ts` completes the pool in idle slices and
 * re-renders. The render path therefore spends no evaluation the pool adds — the #1473 perf lock counts it.
 */
export interface ConfigurationPool {
  /** The seeds already evaluated, ascending. */
  ready(): number[];
  /** Every seed `0..POOL_SIZE−1` is evaluated: the verdicts are settled. */
  complete(): boolean;
  /** Evaluate the next missing seed (one slice of the idle loop). Returns `complete()`. */
  step(): boolean;
  /** Evaluate every missing seed now. */
  fill(): void;
  /** The page's mode: gates answer PENDING from a partial pool instead of filling it. */
  defer(): void;
  readonly deferred: boolean;
  /** A gate answered pending on this pool — the page owes a re-render when it completes. */
  readonly pendingShown: boolean;
}

class Pool implements ConfigurationPool {
  deferred = false;
  pendingShown = false;
  private done = false;
  constructor(private readonly c: Construction) {}
  private has(seed: number): boolean {
    return drawableCache.get(this.c)?.has(`${seed}:0`) ?? false;
  }
  ready(): number[] {
    const out: number[] = [];
    for (let s = 0; s < POOL_SIZE; s += 1) if (this.has(s)) out.push(s);
    return out;
  }
  complete(): boolean {
    if (this.done) return true;
    for (let s = 0; s < POOL_SIZE; s += 1) if (!this.has(s)) return false;
    this.done = true;
    return true;
  }
  step(): boolean {
    for (let s = 0; s < POOL_SIZE; s += 1) {
      if (!this.has(s)) {
        drawableAt(this.c, s);
        return this.complete();
      }
    }
    return this.complete();
  }
  fill(): void {
    if (this.done) return;
    for (let s = 0; s < POOL_SIZE; s += 1) drawableAt(this.c, s);
    this.done = true;
  }
  defer(): void {
    this.deferred = true;
  }
  notePending(): void {
    this.pendingShown = true;
    if (pendingProbe) pendingProbe.hit = true;
  }
}

const poolCache = new WeakMap<Construction, Pool>();

export function configurationPool(c: Construction): ConfigurationPool {
  return poolOf(c);
}
function poolOf(c: Construction): Pool {
  let p = poolCache.get(c);
  if (!p) {
    p = new Pool(c);
    poolCache.set(c, p);
  }
  return p;
}

/**
 * WAS ANY GATE PENDING while this ran? (#1473) — how a surface that composes one row from several gates
 * learns it must show «בודק…» instead of the row. Every gate that answers pending reports it here, so a
 * row cannot forget a gate: the ask lane's dozen arms are wrapped once, at the call, not per arm.
 * Synchronous and re-entrant; a nested probe also marks its enclosing one.
 */
let pendingProbe: { hit: boolean } | null = null;
export function settled<T>(fn: () => T): { value: T; pending: boolean } {
  const outer = pendingProbe;
  const mine = { hit: false };
  pendingProbe = mine;
  try {
    return { value: fn(), pending: mine.hit };
  } finally {
    pendingProbe = outer;
    if (outer && mine.hit) outer.hit = true;
  }
}

/** A caller holding a pending verdict it did not just compute (a point row's `kx`) reports it. */
export function reportPending(c: Construction): void {
  poolOf(c).notePending();
}

/** A knowledge verdict. `pending` is never a value: the pool has not been read to the end. */
/**
 * `options` (#1716, ADR-AG-226): not one value, but exactly {@link MAX_LISTED_VALUES} across the admissible
 * configurations — set only by {@link knownValue}, never by {@link isKnowledge}, which answers the narrower
 * question "is this ONE value".
 */
export type Knowledge = { known: true; value: number } | { known: false; pending?: true; options?: readonly number[] };

/**
 * The seeds a DEFAULT gate reads, or `null` for "fill and read all". On a deferred pool, first the
 * synchronous floor the render path has always paid — `distinctConfigSeeds`, which walks seeds 0..k and
 * so guarantees 0, 1 and 2 — then whatever is already evaluated. Never a seed of its own.
 */
function poolSeeds(c: Construction): { pool: Pool; seeds: number[] } {
  const pool = poolOf(c);
  if (!pool.deferred) {
    pool.fill();
    return { pool, seeds: pool.ready() };
  }
  /**
   * THE FLOOR IS SEEDS 0, 1 AND 2 — not "until three DIFFERENT configurations" (#1539, ADR-AG-197). The two
   * were the same work only while the signature split one picture on «-0.0000»: with zero normalised, a
   * DETERMINED figure has one configuration, and a walk for three different ones evaluated all twenty-four
   * seeds at render — the very cost B′ moved off the render path. Three seeds is the floor the render path
   * has always paid; whatever they cannot settle is pending until the idle loop completes the pool.
   */
  for (let s = 0; s < PENDING_FLOOR; s += 1) drawableAt(c, s);
  return { pool, seeds: pool.ready() };
}

/** The seeds a deferred pool evaluates synchronously, before the render. */
const PENDING_FLOOR = 3;

/** The verdict before it is reported — `knownCurve` asks per coefficient and reports once. */
function knowledgeOf(c: Construction, read: (f: Figure) => number | null): Knowledge {
  const { pool, seeds } = poolSeeds(c);
  const v = judge(c, read, seeds);
  // Invariant over a PARTIAL pool is not knowledge yet; differing already is open for good (a superset
  // of the seeds can only widen the spread). A pool too STARVED to tell (#1642) may yet fill: pending too.
  if ((v.known || ('starved' in v && v.starved)) && !pool.complete()) return { known: false, pending: true };
  return v.known ? v : { known: false };
}

export function isKnowledge(
  c: Construction,
  read: (f: Figure) => number | null,
  seeds?: readonly number[],
): Knowledge {
  if (seeds) return judge(c, read, seeds);
  const v = knowledgeOf(c, read);
  if (!v.known && v.pending) poolOf(c).notePending();
  return v;
}

/**
 * DO THESE CONSTRAINTS HOLD IN EVERY CONFIGURATION OF `c`? (#1629, ADR-AG-188) — the entailment
 * question asked of the {@link configurationPool}, the one set every knowledge gate already judges.
 *
 * "Already follows" is knowledge about a STATEMENT rather than a value, so it is answered the way
 * `isKnowledge` answers: across configurations, never at one seed. The submit gate used to read only
 * the reported FREEDOM, which separates "true here" from "true necessarily" for a continuous DOF and
 * not at all for DISCRETE configurations at 0 DOF: on a square with two mirror drawings, «שיפוע הצלע
 * BC הוא −1/2» holds in one and fails in the other, the freedom does not drop, and the given that
 * SELECTS the drawing was discarded as redundant while the canvas kept the mirror it rules out.
 *
 * Each constraint is measured against the figure the pool already drew — the same residual, the same
 * `SATISFIED_EPS` bar `evaluate` uses for `unsatisfied` — so nothing is sampled here. A `choice` holds
 * when one of its options does (it IS that disjunction). "Cannot be judged" (`null`: a point vacant in
 * some configuration) is NOT entailment: the honest fallback is to record the line, which can only add
 * a row, never drop a given.
 *
 * Fills the pool: the caller is a submit, one action, and a settled answer is the only one it can act on.
 */
/**
 * DOES THIS CONSTRAINT HOLD ON THIS DRAWN FIGURE? — the residual at the figure's own positions, against `evaluate`'s
 * `SATISFIED_EPS` bar. A `choice` holds when one option does. Exported for #1719 (ADR-AG-227): the stated-measure
 * layer reads WHICH option of a choice the drawn figure took off the figure itself, never off a seed it was not drawn at.
 */
export function holdsOn(c: Construction, k: Constraint, f: Figure): boolean {
  if (k.t === 'choice') return k.options.some((o) => holdsOn(c, o, f));
  if (k.t === 'all') return k.of.every((o) => holdsOn(c, o, f));
  const pos = new Map<Id, Pt>(f.points.map((p) => [p.id, { x: p.x, y: p.y }]));
  const at = (id: Id): Pt | null => pos.get(id) ?? null;
  const r = residual(k, at, f.env, curveAtOf(c, f.env, at), lineAtOf(c, f.env, at), residualScale(c, f.env));
  return r !== null && r.every((v) => Math.abs(v) <= SATISFIED_EPS);
}

/**
 * WHICH STATEMENT COMPLETED THE CONTRADICTION? — a DROP-ONE CONFLICT PROBE (#1492 ruling 3, ADR-AG-231; it rebuilds #1334's
 * blame, ADR-AG-143).
 *
 * A refused figure used to be blamed on whatever its RESIDUAL SNAPSHOT showed: the constraints still unmet in the one
 * configuration the solve happened to reach. That is a fact about the basin, not about the givens. «משולש ABC» ·
 * «AB = AC» · «∠ABC = 90» has no triangle in it, and which of the two equalities the stalled descent left unmet moved
 * with the seed — so when #1492's residual cap moved the basins, seed 0 blamed «AB = AC», a sentence that is fine on its
 * own, instead of the line that made the figure impossible.
 *
 * The question asked instead is the student's: **which statement, taken away, lets the figure solve?** A statement is what
 * its line added: the constraints it owns (`groupOf`, positional over `c.constraints`) and the points whose coordinates it
 * PINNED (`pinnedBy`: «O(0,0)» on a centre the figure had left free). Taking it away removes those constraints and leaves
 * those points free — named, with no position given — which is the figure without that sentence. The statements are
 * tried NEWEST FIRST, so the answer is the latest
 * statement whose removal admits a figure: the one that completed the contradiction (ADR-492's shortest infeasible
 * prefix), whatever basin the refused solve reached. `null` when no single removal admits one — two independent
 * contradictions, or a figure the search simply missed — and the caller keeps the snapshot's blame, which still names a
 * genuinely unmet statement.
 *
 * Budgeted by COUNT (docs/17 §7, ADR-AG-180's discipline): at most `CONFLICT_PROBE_SEEDS` seeds per statement and
 * `CONFLICT_PROBE_BUDGET` evaluations in all — one drawable walk's worth, so the refusal path costs at most twice what
 * the refused figure's own search already paid. In a session built line by line the newest line is the culprit and the
 * probe ends on its first evaluation.
 */
export const CONFLICT_PROBE_BUDGET = 24;
const CONFLICT_PROBE_SEEDS = 3;
export function completingStatement(
  c: Construction,
  groupOf: readonly number[],
  seed: number,
  pinnedBy: ReadonlyMap<Id, number> = new Map(),
): number | null {
  const groups = [...new Set([...groupOf, ...pinnedBy.values()].filter((g) => g >= 0))].sort((a, b) => b - a);
  let spent = 0;
  for (const g of groups) {
    const without: Construction = {
      ...c,
      objects: c.objects.map((o): GeoObject => (o.kind === 'point' && pinnedBy.get(o.id) === g ? { kind: 'free', id: o.id } : o)),
      constraints: c.constraints.filter((_, i) => groupOf[i] !== g),
    };
    for (let k = 0; k < CONFLICT_PROBE_SEEDS; k += 1) {
      if (spent >= CONFLICT_PROBE_BUDGET) return null;
      spent += 1;
      if (admittedFigure(evaluate(without, seed + k))) return g;
    }
  }
  return null;
}

/**
 * WHICH DECLARED POLYGONS THE GIVENS FORCE FLAT (#1849, ADR-AG-247) — the rings the thin-ring arm found the givens
 * holding on only collapsed (`Figure.collapsedRings`), over the window `drawableAt` walks from `seed`. In order of
 * first appearance, so the ring a refusal names is a function of the input and the seed alone.
 *
 * Called only on the refusal path, where `drawableAt` found nothing whole and so evaluated this whole window
 * already: every lookup is a memo hit (ADR-AG-144), never a new solve.
 */
export function collapsedByGivens(c: Construction, seed: number): Id[] {
  const out: Id[] = [];
  for (let s = seed; s <= seed + DRAWABLE_TRIES; s += 1) {
    for (const id of evaluate(c, s).collapsedRings ?? []) if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function holdsInEveryConfiguration(c: Construction, ks: readonly Constraint[]): boolean {
  if (ks.length === 0) return true;
  const pool = poolOf(c);
  pool.fill();
  const holds = (k: Constraint, f: Figure): boolean => holdsOn(c, k, f);
  // Only the configurations the pool ADMITS (#1642): a figure that breaks a given entails nothing.
  const admitted = admittedOf(c, pool.ready());
  if (admitted.length === 0) return false;
  for (const f of admitted) {
    if (!ks.every((k) => holds(k, f))) return false;
  }
  return true;
}

/**
 * A ring fault that makes a configuration INVALID — every one but the trapezoid-is-parallelogram WARNING,
 * which is drawn and named rather than refused (ADR-AG-189 Amendment 1).
 */
export function hardRingFaults(f: Figure): RingFault[] {
  return f.ringFaults.filter(isHardRingFault);
}

/**
 * POOL ADMISSION (#1642, ADR-AG-197) — the configurations a knowledge gate may read: every given HOLDS, every
 * selector holds, and the ring is the noun's. `drawableAt` falls back to a configuration that breaks one when
 * nothing in its window is valid — the canvas must still draw something, and `derive` reports it on the line
 * — but a value read off such a configuration is a value the student's own givens contradict (the issue's
 * report: «B = (0, 4.83) או (5.39, 0)», a B on the y-axis printed beside one that is not). A VACANCY is not a
 * fault (ADR-AG-008) and stays admitted: a value that needs the vacant object reads `null`.
 */
export function admittedToPool(f: Figure): boolean {
  return admittedFigure(f);
}

/** The admitted configurations at these seeds. */
function admittedOf(c: Construction, seeds: readonly number[]): Figure[] {
  const out: Figure[] = [];
  for (const s of seeds) {
    const f = drawableAt(c, s);
    if (admittedFigure(f)) out.push(f);
  }
  return out;
}

/**
 * TOO FEW CONFIGURATIONS TO TELL (#1642, ADR-AG-197). A figure with continuous freedom left has a new picture
 * at nearly every seed; when the admitted pool holds fewer than {@link MIN_WITNESSES} different pictures, its
 * agreement says nothing — one picture always agrees with itself (#1282's class, reached through a starved
 * pool rather than a forward walk). A determined figure is never starved: its pictures ARE its roots.
 */
function starved(figs: readonly Figure[]): boolean {
  return figs.some((f) => f.carrierDof > 0) && distinctCount(figs) < MIN_WITNESSES;
}

/** How many different pictures must agree before a figure with freedom left may print a value (#1642). */
const MIN_WITNESSES = 2;

function judge(
  c: Construction,
  read: (f: Figure) => number | null,
  seeds: readonly number[],
): { known: true; value: number } | { known: false; starved?: true } {
  const vals: number[] = [];
  let span = Infinity;
  // Only ADMITTED configurations are evidence (#1642): none admitted is a pool that cannot tell.
  const figs = admittedOf(c, seeds);
  if (figs.length === 0) return { known: false, starved: true };
  for (const f of figs) {
    const v = read(f);
    if (v === null || !Number.isFinite(v)) return { known: false };
    vals.push(v);
    span = Math.min(span, figureSpan(f));
  }
  if (vals.length === 0) return { known: false };
  const verdict = judgeValues(vals, span);
  // Agreement across too few PICTURES of a figure that can still move is not knowledge (#1642).
  if (verdict.known && starved(figs)) return { known: false, starved: true };
  return verdict;
}

function judgeValues(vals: readonly number[], span: number): { known: true; value: number } | { known: false } {
  const scale = Math.max(1, ...vals.map(Math.abs));
  const spread = Math.max(...vals) - Math.min(...vals);
  /**
   * The tolerance is the SOLVE's, not a tighter one (#1078).
   *
   * It was `1e-7`, which is finer than `SATISFIED_EPS` — the accuracy the solve itself promises. A
   * value that comes out of the joint solve therefore carries more wobble than this test allowed,
   * and quantities the givens genuinely FIX were reported as unknown. Measured on the operator's own
   * figure: «AB מקביל לציר ה-x» gives slopes of 1.3e-8, -3.2e-7 and -7.8e-9 across three
   * configurations — invariantly zero by any reading — and a spread of 3.2e-7 failed the gate.
   *
   * **A knowledge test cannot be tighter than the solve that produced the value**, or it reports the
   * solver's own noise as freedom. It stays RELATIVE, so nothing about the honesty rule changes:
   * a quantity that really moves with a free DOF moves by orders of magnitude more than this.
   */
  if (spread <= SAME_VALUE_EPS * scale) return { known: true, value: vals[0] };
  /**
   * …and no tighter than the solver's RESOLUTION either (#1259, ADR-AG-136). At a tangency the solves land
   * within `SOLVE_RESOLUTION` of one another — 7.5e-4 of scale on the operator's figure, above the
   * value-identity bar — so the value the givens fix exactly (M = (4, 0)) read as unknown while
   * `knownOptions` read it as four cases. Two values the solver cannot tell apart are one value; the
   * midpoint of the cluster is the honest number to print, and it rounds to the exact one.
   *
   * **Relative to the FIGURE's scale, as `SOLVE_RESOLUTION` is defined** (#1473, ADR-AG-180 — the same
   * reading `openBoundFloor` already takes). The residuals are scale-normalised, so where a descent stops
   * near a double root is a fraction of the figure's extent, not of the value's own magnitude. The arm
   * scaled by the VALUE, and three samples hid it: over the full pool, M = (4, 0)'s y lands anywhere in
   * ±0.0018 — 4.6e-4 of the figure's span of 8, well inside the resolution, but 1.16× the resolution of a
   * value whose own magnitude is ~0. A value-IDENTITY bar (the arm above) is a different question and
   * stays value-scaled.
   *
   * The SMALLEST span over the configurations read, never the largest: one seed that flings a free point
   * thousands of units out (measured: M at y = −2340 on «MA = MB») must not widen the bar for every other
   * value — a real second root sits O(span) away, 300× this floor at the figure's own scale.
   */
  if (spread <= SOLVE_RESOLUTION * Math.max(scale, span)) return { known: true, value: (Math.max(...vals) + Math.min(...vals)) / 2 };
  return { known: false };
}

/** A figure's extent — the larger coordinate spread of its points (1 with fewer than two); `spanOf` for a drawn figure. */
function figureSpan(f: Figure): number {
  const ps = f.points;
  if (ps.length < 2) return 1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ps) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return Math.max(1e-9, x1 - x0, y1 - y0);
}


/**
 * How many configurations the OPTION SET is looked for across, and the most it may hold.
 *
 * Both measured rather than chosen. On the operator’s own figure — «A(4,0)», «B(0,-2)», «C on
 * 4x-y-9=0», «area 7» — the two roots appear 19 and 5 times in 24 seeds, so a smaller sample can
 * miss the rarer one entirely and report a single answer where there are two, which is worse than
 * reporting none. The CAP is what separates a discrete set from a continuous family: a point free
 * to slide produces a new value at almost every seed, and is not an option set at any size.
 */
const OPTION_SEEDS = 24;
const OPTION_CAP = 4;

/**
 * The DISCRETE POSITIONS a value takes — «הבחן בין שני מקרים» made visible (#1036).
 *
 * Operator, 2026-09-15: *"if the area is given, the options for point C should be shown"*.
 *
 * ## Why this is not a weakening of the honesty gate
 *
 * Neither member of the set is knowledge — cycle the configuration and the point moves — and
 * printing one alone would be the cardinal sin. **The SET is knowledge**: it is the same set at
 * every seed, and cycling permutes which member is drawn and changes the set not at all. So this
 * is a fourth answer beside {@link isKnowledge}, not a loosening of it.
 *
 * ## Discovered by SAMPLING, which is a correction to how #1036 described it
 *
 * That issue says the pin’s root-find "already produces every root". Measured, it does not: the
 * joint solve is a least-squares descent that finds ONE root from one starting point, and the two
 * roots of the operator’s own figure are reached by different SEEDS. So the set is collected the
 * way `isKnowledge` collects its verdict — by evaluating the figure at several configurations —
 * and the feature is the same while the mechanism is not. Nothing new is solved.
 *
 * `null` means "not an option set", which covers both the continuous case (too many distinct
 * values) and the determined one (exactly one — that is `isKnowledge`’s answer, and it should be
 * asked first).
 */
export function knownOptions(
  c: Construction,
  /**
   * Read the whole VALUE, as a vector. A point reads `[x, y]` and not two scalars, and that is
   * load-bearing: asking per component would answer `x ∈ {1, 3}` and `y ∈ {-5, 3}` for a point that
   * is only ever `(1,-5)` or `(3,3)` — four options where there are two, and two of them false.
   */
  read: (f: Figure) => number[] | null,
  seeds = OPTION_SEEDS,
): number[][] | null {
  /**
   * THE POOL (#1473). The default sample IS the configuration pool, so the option set and the
   * `isKnowledge` verdict read one set. On a deferred pool (the page), what is already evaluated is
   * read first: a value absent anywhere is not a set (final); a value that already takes two values
   * is what this walk has always been called for, so the pool is filled — the walk the render path
   * paid before #1473; a value that has so far taken ONE value is pending, and no seed is spent.
   */
  if (seeds === OPTION_SEEDS) {
    const pool = poolOf(c);
    if (pool.deferred && !pool.complete()) {
      const seen: number[][] = [];
      for (const f of admittedOf(c, pool.ready())) {
        const v = read(f);
        if (v === null || v.some((n) => !Number.isFinite(n))) return null;
        seen.push(v);
      }
      const scale0 = Math.max(1, ...seen.flat().map(Math.abs));
      const varies = seen.some((v) => v.some((n, i) => Math.abs(n - seen[0][i]) > SAME_VALUE_EPS * scale0));
      if (!varies) {
        pool.notePending();
        return null;
      }
    }
    pool.fill();
  }
  const samples: number[][] = [];
  // Only ADMITTED configurations (#1642): a member read off a figure that breaks a given is not an option.
  const figs = admittedOf(c, Array.from({ length: seeds }, (_, s) => s));
  for (const f of figs) {
    const v = read(f);
    // A value absent at ANY configuration is not a member of a stable set.
    if (v === null || v.some((n) => !Number.isFinite(n))) return null;
    samples.push(v);
  }
  const scale = Math.max(1, ...samples.flat().map(Math.abs));
  const near = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]) <= SAME_VALUE_EPS * scale);
  const distinct: number[][] = [];
  const witnesses: Figure[][] = [];
  for (const [i, v] of samples.entries()) {
    const at = distinct.findIndex((d) => near(d, v));
    if (at < 0) {
      distinct.push(v);
      witnesses.push([figs[i]]);
    } else witnesses[at].push(figs[i]);
    // More than the cap is a continuous family wearing a set’s clothes — answer NOT a set, early.
    if (distinct.length > OPTION_CAP) return null;
  }
  if (distinct.length < 2) return null;
  /**
   * EACH MEMBER NEEDS ITS OWN WITNESSES when the figure can still move (#1642, ADR-AG-197). On a figure with
   * continuous freedom two configurations ARE two members — a free value sampled twice reads as a two-member
   * "set" whenever the pool holds only two pictures (measured on the operator's six lines, 2 DOF and a
   * starved pool: «A = (−4.16, 0) או (−3.78, 0)»). A member of a genuine discrete set is reached by many
   * different pictures (the other freedom still moves); one witnessed by fewer than {@link MIN_WITNESSES}
   * cannot be told from a free value, so the answer is NOT a set. A determined figure needs no witnesses: its
   * pictures are its roots.
   */
  if (figs.some((f) => f.carrierDof > 0) && witnesses.some((w) => distinctCount(w) < MIN_WITNESSES)) return null;
  /**
   * A CLUSTER INSIDE SOLVER RESOLUTION IS NOT AN OPTION SET (#1259, ADR-AG-136 — operator ruling,
   * 2026-09-20). At a tangency every solve lands within the solver's own resolution of every other and the
   * value-identity dedup above still read four "cases" out of one point, each with a magnitude nobody gave.
   * When every member sits within `SOLVE_RESOLUTION` of every other there is nothing to choose between:
   * answer NOT a set, so the figure routes to `isKnowledge`'s answer and the panel says what it says for a
   * determined point. Never re-sample instead — measured, the noise set is unstable at 12 → 24 seeds and
   * stable at 24 → 36, and this runs per point per render.
   */
  const withinResolution = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]) <= SOLVE_RESOLUTION * scale);
  if (distinct.every((a) => distinct.every((b) => withinResolution(a, b)))) return null;
  // A STABLE order, so the options do not permute as the student cycles and look like new answers.
  return distinct.sort((a, b) => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });
}

/**
 * HOW MANY VALUES A ROW MAY LIST (#1716, ADR-AG-226). Operator ruling, 2026-10-03: *"if there are 2 options, we
 * always show up to 2 options"* — one value prints as one, two as «2 או −2», and more keeps «—».
 */
export const MAX_LISTED_VALUES = 2;

/** A value's verdict for a row: ONE value, up to {@link MAX_LISTED_VALUES} OPTIONS, pending, or open. */
export type Values = { known: true; value: number[] } | { known: false; pending?: true; options?: number[][] };

/**
 * THE ONE VALUE GATE OF THE DATA PANEL (#1716, ADR-AG-226) — every row asks it, never `isKnowledge` and
 * `knownOptions` side by side: a coordinate pair, a slope, a length, a parameter, an equation's coefficients.
 *
 * Operator, playing T6 (#1716): «tan∢BAO = 2» fixes |slope AB| = 2, but the sign depends on the quadrant, which
 * only the exam's printed figure settles — and the panel said «—», hiding what the student DID fix. The two
 * questions were already answered, separately: `isKnowledge` ("one value in every configuration") and the
 * #1036 option set `knownOptions` ("a small stable set") — but only the point rows asked the second, at a cap of
 * four, so a slope, a length or an equation with two values read as open.
 *
 * So one function answers, in order:
 * 1. every component invariant → **known** (the honesty gate, unchanged);
 * 2. some component still awaiting the pool, none seen to move → **pending** (#1473);
 * 3. the value takes a stable discrete set of at most {@link MAX_LISTED_VALUES} → **options** (each is possible,
 *    and the SET is knowledge — `knownOptions`'s argument, #1036);
 * 4. otherwise **open** — the dash.
 *
 * `read` returns the whole value as a vector (`size` components), for the reason `knownOptions` gives: a point
 * is `(1,-5)` or `(3,3)`, never the four products of its per-axis options.
 */
export function knownValues(
  c: Construction,
  read: (f: Figure) => number[] | null,
  size: number,
  /**
   * May the RENDER complete a deferred pool to answer? Only the point rows' option walk — the walk the render
   * path paid before #1473, which the B′ ruling grandfathers (*"we cannot afford 0.5 s addition"*). Every other
   * row answers from what is evaluated: a value already seen to take more than two values is open; one that
   * may still be a two-value set is PENDING («בודק…») until the idle loop completes the pool. The VERDICT is
   * the same either way once the pool is complete; only who pays for completing it differs.
   */
  opts: { fillPool?: boolean } = {},
): Values {
  let pending = false;
  let open = false;
  const value: number[] = [];
  for (let i = 0; i < size; i += 1) {
    const k = isKnowledge(c, (f) => {
      const v = read(f);
      return v === null || v.length <= i ? null : v[i];
    });
    if (k.known) value.push(k.value);
    else if (k.pending) pending = true;
    else open = true;
  }
  if (!open && !pending) return { known: true, value };
  if (!open) return { known: false, pending: true };
  const pool = poolOf(c);
  if (!opts.fillPool && pool.deferred && !pool.complete()) {
    const seen: number[][] = [];
    for (const f of admittedOf(c, pool.ready())) {
      const v = read(f);
      if (v === null || v.some((n) => !Number.isFinite(n))) return { known: false };
      seen.push(v);
    }
    const scale = Math.max(1, ...seen.flat().map(Math.abs));
    const distinct: number[][] = [];
    for (const v of seen) if (!distinct.some((d) => d.every((n, i) => Math.abs(n - v[i]) <= SAME_VALUE_EPS * scale))) distinct.push(v);
    if (distinct.length > MAX_LISTED_VALUES) return { known: false };
    pool.notePending();
    return { known: false, pending: true };
  }
  const options = knownOptions(c, read);
  return options && options.length <= MAX_LISTED_VALUES ? { known: false, options } : { known: false };
}

/** {@link knownValues} for one number — the {@link Knowledge} every scalar row renders, with its `options`. */
export function knownValue(c: Construction, read: (f: Figure) => number | null): Knowledge {
  const v = knownValues(
    c,
    (f) => {
      const x = read(f);
      return x === null ? null : [x];
    },
    1,
  );
  if (v.known) return { known: true, value: v.value[0] };
  if (v.options) return { known: false, options: v.options.map(([x]) => x) };
  return v.pending ? { known: false, pending: true } : { known: false };
}

/**
 * A curve's equation when it takes up to {@link MAX_LISTED_VALUES} values across the configurations (#1716) —
 * `knownCurve`'s twin through the one gate: the coefficients read as ONE vector, so «y = 2x + 6 או y = −2x − 6»
 * is two whole equations, never a mix of their coefficients. `null` when the curve is known (ask `knownCurve`),
 * open, or pending.
 */
export function knownCurveOptions(c: Construction, id: Id): NumCurve[] | null {
  const read = (f: Figure) => f.curves.find((q) => q.id === id)?.curve ?? null;
  const first = read(drawableAt(c, 0));
  if (!first) return null;
  const fields = (Object.keys(first) as Array<keyof NumCurve>).filter((k) => typeof first[k] === 'number');
  const v = knownValues(
    c,
    (f) => {
      const cur = read(f);
      // A curve of a DIFFERENT family at another configuration is no member of a set of equations.
      if (!cur || cur.kind !== first.kind) return null;
      return fields.map((k) => (cur as unknown as Record<string, number>)[k as string]);
    },
    fields.length,
  );
  if (v.known || !v.options) return null;
  return v.options.map((vals) => ({ ...first, ...Object.fromEntries(fields.map((k, i) => [k, vals[i]])) }) as NumCurve);
}
/**
 * Is this curve's SHAPE knowledge — every coefficient invariant across the free DOFs — or is the
 * equation on screen one sample's accident?
 *
 * The point rows have been gated by {@link isKnowledge} since V0; the curve rows were not, and read
 * straight off seed 0. That was survivable only while every drawable curve was fully pinned. It
 * stopped being survivable with #1014: now that a parameter nobody declared is registered and
 * sampled, `y² = 2ax` draws — and an ungated panel printed it as `y² = 6.915870381x`, which is the
 * tool asserting a magnitude the question never gave
 * ([ADR-052](../../docs/06-decisions.md#adr-052)), on the very row
 * [ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) §2 says carries the whole honesty
 * boundary.
 *
 * Built ON `isKnowledge` rather than beside it — one coefficient at a time, through the one gate —
 * so there is no second definition of what "invariant" means.
 *
 * Returns the curve when every coefficient is knowledge, and `null` when any of them moves; the
 * caller shows an open row, exactly as it does for an unpinned coordinate.
 */
export function knownCurve(
  c: Construction,
  id: Id,
  /**
   * Default: the {@link configurationPool} (#1473). It was `[0, 1, 2]` — raw drawable seeds, not even
   * distinct configurations — so a line through a two-root point («דרך P עובר ישר מאונך לציר ה-x», P a
   * circle's crossing with the x-axis) printed `x = 0` from seeds that all resolved to one root.
   */
  seeds?: readonly number[],
): NumCurve | null {
  const read = (f: Figure) => f.curves.find((q) => q.id === id)?.curve ?? null;
  // The SAME figures the gate judges (ADR-AG-126): the value returned is read from the drawable
  // configuration at the first seed, never from a raw seed the tool would not show — measured on the
  // 572 figure, the raw seed 0 had not converged and its slope was 5e-5 off the one every drawable
  // configuration agreed on (#1317).
  const first = read(drawableAt(c, seeds ? seeds[0] : 0));
  if (!first) return null;
  let pending = false;
  for (const field of Object.keys(first) as Array<keyof NumCurve>) {
    if (typeof first[field] !== 'number') continue; // `kind` — the discriminant, not a coefficient
    const readField = (f: Figure) => {
      const cur = read(f);
      // A curve that is a DIFFERENT family at another seed is not knowledge either: the shape
      // itself varies, which is 02c R13's third row and strictly worse than a moving coefficient.
      if (!cur || cur.kind !== first.kind) return null;
      const v = (cur as Record<string, unknown>)[field as string];
      return typeof v === 'number' ? v : null;
    };
    const k = seeds ? isKnowledge(c, readField, seeds) : knowledgeOf(c, readField);
    if (k.known) continue;
    // One coefficient already seen to move makes the whole equation OPEN, whatever the rest still
    // await — so pending is reported only when nothing is open.
    if (!k.pending) return null;
    pending = true;
  }
  if (pending) {
    poolOf(c).notePending();
    return null;
  }
  return first;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const FALLBACK: Box = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

/**
 * The world window to draw. Built from the points and the BOUNDED curves; an unbounded line or
 * parabola contributes nothing (it would otherwise decide the window by where it happens to be
 * sampled). Always includes the origin, because the axes are the subject here.
 */
export function viewBox(
  f: Figure,
  pad = 0.15,
  /**
   * WORLD GEOMETRY THAT IS DRAWN BUT IS NOT IN THE FIGURE (#1198).
   *
   * Operator, playing round #1193 T11: *"pressing on show another config causes the image to jump
   * right and left and the entire shape is not shown."*
   *
   * A traced locus is caller-owned decoration on `SceneKnowledge` — the same seam as `marks` and
   * `crossings` — so it reaches the renderer AFTER the frame has been decided, and the frame was
   * decided from the figure's points and curves alone. Measured on the operator's own figure, the
   * traced circle fell outside the box in **4 of 6 configurations**: the tool clipped the one object
   * the student had asked to see.
   *
   * Nothing was wrong in the tracer. The box was simply fitted to a SUBSET of what gets drawn, and
   * the fix is to let the caller say what else is on the canvas rather than to teach the engine
   * about the ask lane — which would put a question's answer inside the figure it is a question
   * about. The padding and the isotropy stay here, in the one place that owns them, so no caller
   * ever re-derives a frame rule.
   */
  extra: readonly { x: number; y: number }[] = [],
): Box {
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (const p of f.points) {
    xs.push(p.x);
    ys.push(p.y);
  }
  for (const p of extra) {
    xs.push(p.x);
    ys.push(p.y);
  }
  for (const c of f.curves) {
    const e = curveExtent(c.curve);
    if (e) {
      xs.push(e.minX, e.maxX);
      ys.push(e.minY, e.maxY);
    }
  }
  if (xs.length <= 1 && ys.length <= 1) return FALLBACK;
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h, 1) * (1 + 2 * pad);
  // Isotropic: one unit is the same length on both axes, or every circle draws as an ellipse.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  minX = cx - span / 2;
  maxX = cx + span / 2;
  minY = cy - span / 2;
  maxY = cy + span / 2;
  return { minX, minY, maxX, maxY };
}
