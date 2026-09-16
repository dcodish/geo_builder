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
import { paramRegister } from './carriers';
import { constructionOf, evalRule, type Construction as RuleConstruction, type Pt } from './derived';
import { resolveCurve, curveExtent, type Box } from './curves';
import type { ClassifyResult } from './conic';
import { evalExpr, type Env } from './expr';
import { pairKey, pinnedLengths } from './lengths';
import { provenanceOf, type PointProvenance } from './carriers';
import { dirVector, freeRank, residual, resolveChoices, solveLM, type Constraint } from './solve';
import { inDomain, isFree, objectById, type Construction, type Domain, type Id, type CurveLabel, type NumCurve } from './types';

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
  /**
   * The length to draw ON this segment, when the STUDENT’s own given pinned it — as a NUMBER.
   *
   * Decided upstream rather than in `render/`, which keeps the decision beside the honesty gate that
   * answers it — while FORMATTING stays a display concern, so the engine never owns a rounder.
   * Absent means draw nothing: a length the tool merely DERIVED belongs in the data panel, not on
   * the canvas ([ADR-AG-016](../../docs/06c-decisions-analytic.md#adr-ag-016) — the canvas shows the
   * question, the panel shows the answer).
   */
  pinnedLength?: number;
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
  construction: FigureConstruction[];
  /** Objects that do not exist at this parameter value — named, never silently dropped. */
  vacant: Vacancy[];
  /** Constraints the solve could NOT meet. Non-empty means the figure must not be shown as if it
   *  satisfied its givens — the caller reports instead. */
  unsatisfied: Constraint[];
  /** Do the D7 branch selectors hold in this configuration? `false` asks for a different one. */
  selectorsOk: boolean;
  /** Freedom the OBJECT carriers still have after the constraints — what the DOF cue reports. */
  carrierDof: number;
  /** Per point: what the student's OWN givens fix about it — the canvas label (#1032). */
  provenance: Record<Id, PointProvenance>;
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

function jitter(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A value strictly inside the domain. The bounded case takes an interior point; a half-bounded
 * domain steps away from its bound; unbounded lands near 1..4. Excluded values are stepped over.
 */
export function sampleParam(d: Domain, seed: number, salt: number): number {
  const u = jitter(seed, salt);
  let v: number;
  if (d.min !== undefined && d.max !== undefined) {
    // Stay off both ends so an OPEN bound is never hit and a closed one is never sat on.
    v = d.min + (0.2 + 0.6 * u) * (d.max - d.min);
  } else if (d.min !== undefined) {
    v = d.min + 1 + 3 * u;
  } else if (d.max !== undefined) {
    v = d.max - 1 - 3 * u;
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
    const magnitude = 1 + 3 * u;
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
export function sampleEnv(c: Construction, seed = 0): Env {
  const env: Record<string, number> = {};
  paramRegister(c).forEach((p, i) => {
    env[p.sym] = sampleParam(p.domain, seed, i + 1);
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
function curveAtOf(c: Construction, env: Env, at?: (id: Id) => Pt | null): (id: Id) => NumCurve | null {
  return (id) => {
    const o = objectById(c, id);
    if (!o) return null;
    if (o.kind === 'circle-at') {
      const centre = at?.(o.centre);
      const r = evalExpr(o.r, env);
      if (!centre || !Number.isFinite(r) || r <= 0) return null;
      return { kind: 'circle', cx: centre.x, cy: centre.y, r };
    }
    if (o.kind !== 'curve') return null;
    const res = resolveCurve(o.curve, env);
    return res.ok ? res.curve : null;
  };
}

/**
 * The label a drawn segment carries — its length, when the student’s own given pinned it (#1065).
 *
 * The given must PIN this length by itself and the stated value must be KNOWLEDGE — both decided in
 * — «AB = 10», not «AB = AC»), and the resulting length must be KNOWLEDGE: a length stated in terms
 * of a free parameter is stated and still not a number, and printing one sample of it on the canvas
 * would be [#1020](https://github.com/dcodish/geo_builder/issues/1020) in a new place.
 *
 * Returns `undefined` for everything else — including a length the tool DERIVED, which is correct
 * and belongs in the data panel rather than on the figure (ADR-AG-016).
 */
function segmentLabel(
  pinned: Map<string, number>,
  ends: [Id, Id],
): number | undefined {
  return pinned.get(pairKey(ends[0], ends[1]));
}

function carrierDofOf(c: Construction, env: Env, free: Map<Id, Pt>, ids: Id[]): number {
  if (ids.length === 0) return 0;
  if (c.constraints.length === 0) return 2 * ids.length;
  const vec = ids.flatMap((id) => [free.get(id)!.x, free.get(id)!.y]);
  const asMap = (x: number[]) =>
    new Map<Id, Pt>(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }]));
  return freeRank(vec, (x) => {
    const pos = place(c, env, asMap(x));
    return c.constraints.flatMap((k) => residual(k, (id) => pos.get(id) ?? null, env, curveAtOf(c, env, (id) => pos.get(id) ?? null)) ?? [0]);
  });
}

/**
 * Do the branch selectors hold here?
 *
 * They consume no freedom, so they cannot be solved FOR — they are a filter over configurations the
 * solve already produced, and a configuration that fails them asks for a different seed rather than
 * reporting a contradiction (D7 kind 2).
 */
function selectorsHold(c: Construction, at: Map<Id, Pt>): boolean {
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
   */
  const xs = [...at.values()];
  const span = xs.length < 2 ? 1 : Math.max(
    1e-9,
    Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x)),
    Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y)),
  );
  const apart = span * 1e-2;

  return c.selectors.every((s) => {
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
    const p = at.get(s.id);
    if (!p) return true; // a selector about an absent point judges nothing
    if (s.kind === 'axis-side') {
      const v = s.axis === 'x' ? p.x : p.y;
      return s.positive ? v > 0 : v < 0;
    }
    const a = at.get(s.a);
    const b = at.get(s.b);
    if (!a || !b) return true;
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
  });
}

/** The free vertices, in a stable order — the solver's unknown vector is two entries each. */
const freeIds = (c: Construction): Id[] => c.objects.filter(isFree).map((o) => o.id);

export interface SolveReport {
  /** A constraint that could not be met, named for the student. */
  unsatisfied: Constraint[];
}

export function evaluate(raw: Construction, seed = 0): Figure {
  /**
   * DISCRETE freedom is resolved HERE, once, before anything measures a constraint (#1049).
   *
   * «משולש ישר-זווית ABC» carries a `choice` over its three possible right angles. Successive seeds
   * walk the options in order, so «הציגו תצורה אחרת» cycles the seats rather than resampling into a
   * favourite — 02c R14's *"discrete ones cycle"*. Everything downstream — the solve, the rank
   * count, the satisfaction check, the provenance — then sees an ordinary constraint and never
   * learns that discrete freedom exists.
   */
  const c: Construction = { ...raw, constraints: resolveChoices(raw.constraints, seed) };
  const env = sampleEnv(c, seed);
  const points: FigurePoint[] = [];
  const curves: FigureCurve[] = [];
  const segments: FigureSegment[] = [];
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
    ids.map((id) => [id, { x: freeCoord(seed, id, 0, span), y: freeCoord(seed, id, 1, span) }]),
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
  for (const sel of c.selectors) {
    if (sel.kind !== 'axis-side') continue;
    const at0 = seeded.get(sel.id);
    if (!at0) continue;
    const v = sel.axis === 'x' ? at0.x : at0.y;
    // A coordinate that sampled to zero is in NEITHER half-plane; the selector is strict, so nudge.
    const mag = Math.abs(v) < 1e-6 ? 1 : Math.abs(v);
    const want = sel.positive ? mag : -mag;
    seeded.set(sel.id, sel.axis === 'x' ? { x: want, y: at0.y } : { x: at0.x, y: want });
  }

  const unsatisfied: Constraint[] = [];
  let free = seeded;

  if (ids.length > 0 && c.constraints.length > 0) {
    const vec = ids.flatMap((id) => [seeded.get(id)!.x, seeded.get(id)!.y]);
    const asMap = (x: number[]) =>
      new Map<Id, Pt>(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }]));
    const res = solveLM(vec, (x) => {
      const pos = place(c, env, asMap(x));
      return c.constraints.flatMap((k) => residual(k, (id) => pos.get(id) ?? null, env, curveAtOf(c, env, (id) => pos.get(id) ?? null)) ?? [0]);
    });
    free = asMap(res.values);
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
    for (const k of c.constraints) {
      const r = residual(k, (id) => pos.get(id) ?? null, env, curveAtOf(c, env, (id) => pos.get(id) ?? null));
      // `null` is "cannot be judged", not "false": a constraint naming a point that vanished at this
      // parameter value must not be reported as a given the student got wrong — that would blame the
      // wrong statement, and vacancy is not a fault ([ADR-AG-008]).
      if (r === null) continue;
      if (r.some((v) => Math.abs(v) > SATISFIED_EPS)) unsatisfied.push(k);
    }
  }
  const placed = new Map<Id, Pt>(free);
  const at = (id: Id): Pt | null => placed.get(id) ?? null;

  /**
   * Which lengths the student PINNED, computed once for this evaluation (#1065).
   *
   * Read from the constraints rather than from the figure, because the question "did a given say
   * this" is about what was STATED and cannot be recovered from where the points ended up.
   */
  const pinned = pinnedLengths(c.constraints, env);

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
        else vacant.push({ id: o.id, reason: res.reason });
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
            pinnedLength: segmentLabel(pinned, [o.a, o.b]),
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
              pinnedLength: segmentLabel(pinned, ends),
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
            stated: true,
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
        const p0 = at(o.through);
        const along = p0 ? dirVector(o.dir, at, curveAtOf(c, env, at)) : null;
        // The perpendicular reading is the same construction a quarter turn on. Rotating the
        // RESOLVED vector keeps `Direction` a pure reference to something in the figure — it names
        // an object, and "that object turned 90°" is not an object.
        const v = along && (o.perp ? { x: -along.y, y: along.x } : along);
        if (p0 && v) {
          // Through `(px, py)` with direction `(vx, vy)`: the normal is `(vy, -vx)`, so the line is
          // `vy·x − vx·y + (vx·py − vy·px) = 0`.
          curves.push({
            id: o.id,
            label: { name: '', kind: 'line' },
            curve: { kind: 'line', a: v.y, b: -v.x, c: v.x * p0.y - v.y * p0.x },
            stated: true,
          });
        } else vacant.push({ id: o.id, reason: 'vacant' });
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
  return {
    env,
    points,
    curves,
    segments,
    construction,
    vacant,
    unsatisfied,
    selectorsOk: selectorsHold(c, placed),
    carrierDof: carrierDofOf(c, env, free, ids),
    provenance: Object.fromEntries(
      points.map((p) => [p.id, provenanceOf(c, p.id, env, curves) ?? { x: { known: false }, y: { known: false } }]),
    ),
  };
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
 * Per construction, the drawable figure at each seed. The panel asks per coordinate per point, and
 * each answer may now cost several evaluations, so the work is done once.
 */
const drawableCache = new WeakMap<Construction, Map<number, Figure>>();

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
export function drawableAt(c: Construction, seed: number): Figure {
  let perSeed = drawableCache.get(c);
  if (!perSeed) {
    perSeed = new Map();
    drawableCache.set(c, perSeed);
  }
  const hit = perSeed.get(seed);
  if (hit) return hit;

  /**
   * A figure is drawable when its selectors hold AND every object the student NAMED is in it.
   *
   * The second half was found by the operator asking why a figure of his had a second answer
   * (#1083). It did not: in that configuration the point `O` — «אלכסוני המרובע נפגשים בנקודה O» —
   * was VACANT, because `A` and `C` had landed on the same side of `BD` and the diagonals crossed
   * only when extended. ADR-AG-021 is right to leave `O` out of such a figure; what is wrong is
   * SHOWING that figure while another one has every point the student asked for.
   *
   * A vacancy is still not an error (ADR-AG-008) — it is a preference, applied only when a better
   * configuration exists inside the budget.
   */
  const whole = (f: Figure) => f.selectorsOk && f.vacant.length === 0;

  const first = evaluate(c, seed);
  let chosen = first;
  let fallback: Figure | null = first.selectorsOk ? first : null;
  if (!whole(first)) {
    for (let extra = 1; extra <= DRAWABLE_TRIES; extra += 1) {
      const candidate = evaluate(c, seed + extra);
      if (whole(candidate)) {
        chosen = candidate;
        fallback = candidate;
        break;
      }
      // Second best: the selectors hold and something the student named is missing. Remembered, so a
      // figure with a vacancy still beats one that fails a selector outright.
      if (!fallback && candidate.selectorsOk) fallback = candidate;
    }
    if (!whole(chosen) && fallback) chosen = fallback;
  }
  perSeed.set(seed, chosen);
  return chosen;
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

export function isKnowledge(
  c: Construction,
  read: (f: Figure) => number | null,
  seeds: readonly number[] = [0, 1, 2],
): { known: true; value: number } | { known: false } {
  const vals: number[] = [];
  for (const s of seeds) {
    const v = read(drawableAt(c, s));
    if (v === null || !Number.isFinite(v)) return { known: false };
    vals.push(v);
  }
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
  return spread <= SAME_VALUE_EPS * scale ? { known: true, value: vals[0] } : { known: false };
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
  const samples: number[][] = [];
  for (let seed = 0; seed < seeds; seed += 1) {
    const v = read(drawableAt(c, seed));
    // A value absent at ANY configuration is not a member of a stable set.
    if (v === null || v.some((n) => !Number.isFinite(n))) return null;
    samples.push(v);
  }
  const scale = Math.max(1, ...samples.flat().map(Math.abs));
  const near = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]) <= SAME_VALUE_EPS * scale);
  const distinct: number[][] = [];
  for (const v of samples) {
    if (!distinct.some((d) => near(d, v))) distinct.push(v);
    // More than the cap is a continuous family wearing a set’s clothes — answer NOT a set, early.
    if (distinct.length > OPTION_CAP) return null;
  }
  if (distinct.length < 2) return null;
  // A STABLE order, so the options do not permute as the student cycles and look like new answers.
  return distinct.sort((a, b) => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });
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
  seeds: readonly number[] = [0, 1, 2],
): NumCurve | null {
  const read = (f: Figure) => f.curves.find((q) => q.id === id)?.curve ?? null;
  const first = read(evaluate(c, seeds[0]));
  if (!first) return null;
  for (const field of Object.keys(first) as Array<keyof NumCurve>) {
    if (typeof first[field] !== 'number') continue; // `kind` — the discriminant, not a coefficient
    const k = isKnowledge(
      c,
      (f) => {
        const cur = read(f);
        // A curve that is a DIFFERENT family at another seed is not knowledge either: the shape
        // itself varies, which is 02c R13's third row and strictly worse than a moving coefficient.
        if (!cur || cur.kind !== first.kind) return null;
        const v = (cur as Record<string, unknown>)[field as string];
        return typeof v === 'number' ? v : null;
      },
      seeds,
    );
    if (!k.known) return null;
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
export function viewBox(f: Figure, pad = 0.15): Box {
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (const p of f.points) {
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
