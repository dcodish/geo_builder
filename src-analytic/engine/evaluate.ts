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
import { provenanceOf, type PointProvenance } from './carriers';
import { freeRank, residual, solveLM, type Constraint } from './solve';
import { inDomain, isFree, type Construction, type Domain, type Id, type CurveLabel, type NumCurve } from './types';

export interface FigurePoint {
  id: Id;
  x: number;
  y: number;
}

export interface FigureCurve {
  id: Id;
  label: CurveLabel;
  curve: NumCurve;
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
function freeCoord(seed: number, id: string, axis: 0 | 1): number {
  let h = axis * 7919 + 13;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 100003;
  return Math.round((-6 + 12 * jitter(seed, h)) * 1e6) / 1e6;
}

/** A tiny deterministic hash → [0,1). Same seed, same figure; different seed, different figure. */
/**
 * Offsets the seed onto a second, disjoint jitter stream so an unbounded parameter's SIGN is drawn
 * independently of its magnitude (#1019). Large enough that no real seed count can reach it, so the
 * two streams cannot alias.
 */
const SIGN_STREAM = 100003;

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
        const v = evalRule(o.rule, (id) => at.get(id) ?? null);
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
function carrierDofOf(c: Construction, env: Env, free: Map<Id, Pt>, ids: Id[]): number {
  if (ids.length === 0) return 0;
  if (c.constraints.length === 0) return 2 * ids.length;
  const vec = ids.flatMap((id) => [free.get(id)!.x, free.get(id)!.y]);
  const asMap = (x: number[]) =>
    new Map<Id, Pt>(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }]));
  return freeRank(vec, (x) => {
    const pos = place(c, env, asMap(x));
    return c.constraints.flatMap((k) => residual(k, (id) => pos.get(id) ?? null, env) ?? [0]);
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
  return c.selectors.every((s) => {
    const p = at.get(s.id);
    if (!p) return true; // a selector about an absent point judges nothing
    const v = s.axis === 'x' ? p.x : p.y;
    return s.positive ? v > 0 : v < 0;
  });
}

/** The free vertices, in a stable order — the solver's unknown vector is two entries each. */
const freeIds = (c: Construction): Id[] => c.objects.filter(isFree).map((o) => o.id);

export interface SolveReport {
  /** A constraint that could not be met, named for the student. */
  unsatisfied: Constraint[];
}

export function evaluate(c: Construction, seed = 0): Figure {
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
  const seeded = new Map<Id, Pt>(
    ids.map((id) => [id, { x: freeCoord(seed, id, 0), y: freeCoord(seed, id, 1) }]),
  );
  const unsatisfied: Constraint[] = [];
  let free = seeded;

  if (ids.length > 0 && c.constraints.length > 0) {
    const vec = ids.flatMap((id) => [seeded.get(id)!.x, seeded.get(id)!.y]);
    const asMap = (x: number[]) =>
      new Map<Id, Pt>(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }]));
    const res = solveLM(vec, (x) => {
      const pos = place(c, env, asMap(x));
      return c.constraints.flatMap((k) => residual(k, (id) => pos.get(id) ?? null, env) ?? [0]);
    });
    free = asMap(res.values);
    if (!res.ok) {
      // HONEST FAILURE: the figure is not quietly shown as if it satisfied its givens. Which
      // constraints failed is recorded so the caller can name the statement, not internal state.
      const pos = place(c, env, free);
      for (const k of c.constraints) {
        const r = residual(k, (id) => pos.get(id) ?? null, env);
        if (r === null || r.some((v) => Math.abs(v) > 1e-6)) unsatisfied.push(k);
      }
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
        if (res.ok) curves.push({ id: o.id, label: o.label, curve: res.curve });
        else vacant.push({ id: o.id, reason: res.reason });
        break;
      }
      case 'derived': {
        // `null` means a parent was vacant at this parameter value, or the configuration is
        // degenerate (three collinear points have no circumcentre). Both are honest vacancies —
        // "not at this value" — never a point drawn at NaN and never a fallback position.
        const p = evalRule(o.rule, at);
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
        if (a && b) segments.push({ id: o.id, a, b });
        else vacant.push({ id: o.id, reason: 'vacant' });
        break;
      }
      case 'polygon': {
        const vs = o.vertices.map(at);
        if (vs.every((v): v is Pt => v !== null)) {
          // Drawn as its closed ring of sides. The renderer stays a pure consumer: it is handed
          // screen-ready pairs, never asked to look a vertex up.
          for (let i = 0; i < vs.length; i += 1) {
            segments.push({ id: `${o.id}-${i}`, a: vs[i], b: vs[(i + 1) % vs.length] });
          }
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
      points.map((p) => [p.id, provenanceOf(c, p.id, env) ?? { x: { known: false }, y: { known: false } }]),
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
export function isKnowledge(
  c: Construction,
  read: (f: Figure) => number | null,
  seeds: readonly number[] = [0, 1, 2],
): { known: true; value: number } | { known: false } {
  const vals: number[] = [];
  for (const s of seeds) {
    const v = read(evaluate(c, s));
    if (v === null || !Number.isFinite(v)) return { known: false };
    vals.push(v);
  }
  const scale = Math.max(1, ...vals.map(Math.abs));
  const spread = Math.max(...vals) - Math.min(...vals);
  return spread <= 1e-7 * scale ? { known: true, value: vals[0] } : { known: false };
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
