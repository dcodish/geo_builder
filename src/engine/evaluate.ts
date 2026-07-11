/**
 * evaluate: compute positions for every point by resolving the dependency
 * graph in topological order (a fixed-point sweep), then check constraints.
 * Returns positions, or an error (unresolvable deps, impossible construction,
 * non-finite coords, or a contradicted constraint = over-constraint, FR-EN-8).
 */

import type { Circle, Constraint, Construction, GeoObject, GeoPoint, Id, Line, Vec } from './types';
import { LEN_EPS, isGeoPoint, objectParents } from './types';
import { isShapeCarrier } from './carriers';
import {
  add,
  circleCircleIntersect,
  circumcenter,
  dist,
  footOnLine,
  len,
  lineCircleIntersect,
  lineLineIntersect,
  rot90,
  rotate,
  scale,
  sub,
  unit,
} from './geometry';
import { constraintRefs, describeConstraint, isSatisfied, jointCostTerm, residual, residualTolerance, solvedOnSegmentCandidates } from './solve';

/** A resolved line: a point on it (`anchor`) and a unit direction (`dir`). */
export interface ResolvedLine {
  anchor: Vec;
  dir: Vec;
}

/** A resolved circle: its centre position and radius. */
export interface ResolvedCircle {
  center: Vec;
  r: number;
}

export interface EvalOk {
  ok: true;
  positions: Map<Id, Vec>;
  /** Resolved centre + radius of every circle (post-solve), so callers (the givens verifier) can
   *  check on-circle membership without re-resolving. */
  circles: Map<Id, ResolvedCircle>;
  /** Distinct points the geometry drove to the same location — allowed (not a failure), surfaced as a
   *  notice so the student knows two labels converged ([ADR-123](docs/06-decisions.md#adr-124)). Omitted
   *  when none. A `~`-scaffolding / `coincide`-constraint pair is intended and never listed. */
  coincidences?: [Id, Id][];
}
export interface EvalErr {
  ok: false;
  error: string;
  /** True when the failure is two distinct points sharing a location. */
  coincide?: boolean;
}
export type EvalResult = EvalOk | EvalErr;

/**
 * Solve every driven DOF ([ADR-028](docs/06-decisions.md#adr-028)) — a parametric
 * point (on-circle / on-segment) whose `solve` directive says its 1 DOF is fixed
 * so a constraint holds, possibly one referencing *downstream* points. For each,
 * vary the DOF over its range; the residual at a trial value comes from a full
 * `evaluateCore` of the figure with that DOF set; `solveParam` finds the roots
 * (deterministic), and the branch index picks one. Returns the construction with
 * those DOFs resolved to plain parameters (or unchanged if there are none).
 */
/**
 * Append the construction's inequality (order) constraints to a carrier-derived constraint set.
 * An order constraint ("α < β", ADR-039) is satisfied by a whole REGION, so it never gets a
 * dedicated 1-DOF carrier — but it must still be minimised JOINTLY with whatever DOFs are already
 * moving (e.g. the free vertices a |BP|=3|PD| recruited), so the solver picks the part of the
 * existing solution family where the order holds. Dedup against the carriers' own constraints.
 */
function withOrderCons(cons: Constraint[], c: Construction): Constraint[] {
  const seen = new Set(cons.map((k) => JSON.stringify(k)));
  for (const k of c.constraints) {
    if (k.type !== 'angle-order' && k.type !== 'length-order' && k.type !== 'collinear-order' && k.type !== 'angle-acuteness') continue;
    const key = JSON.stringify(k);
    if (seen.has(key)) continue;
    seen.add(key);
    cons.push(k);
  }
  return cons;
}

// Exported for the freeze-and-co-drive recruiter (ADR-229): it BAKES the current valid solution (params
// written, directives cleared) so a failing constraint can be re-solved over a minimal sub-system while
// every already-satisfied subsystem stays frozen at its solved position.
export function resolveDriven(c: Construction): Construction {
  // COUPLED solved-on-segment points: a closed-form `on-segment-solved` whose constraint references
  // ANOTHER solved-on-segment deadlocks the topological evaluator (each needs the other's position —
  // e.g. "AL=LK=KC" makes L solved by AL=LK and K by LK=KC, so L needs K and K needs L). Promote the
  // coupled group back to NUMERIC on-segment carriers (kind 'on-segment' + a solve directive) and
  // re-enter, so they fall into the joint solver below ([ADR-045](docs/06-decisions.md#adr-045)) and
  // solve together — the closed-form path stays for the common uncoupled case.
  {
    const solved = c.objects.filter(
      (o): o is Extract<GeoObject, { kind: 'on-segment-solved' }> => o.kind === 'on-segment-solved',
    );
    const solvedIds = new Set(solved.map((o) => o.id));
    // Does point `target` transitively depend on `source`? (scrape each object's point-id fields). Catches
    // a SELF-coupling: a solved point E whose constraint references a DERIVED point that depends on E —
    // e.g. "EABF concyclic" drives E while F = CE∩DB depends on E, so E's closed-form needs F which needs
    // E (a cycle the topological evaluator reports as "unresolved dependencies"). Route E numerically.
    const byId = new Map(c.objects.map((o) => [o.id, o] as const));
    // Walk the FULL object→references graph (points AND the line/circle intermediaries a point can be
    // coupled through) via the exhaustive `objectParents` — a newly-added kind is a compile error there,
    // not a silently-missed edge (retires the old hand-scraped `PT_FIELDS`, which dropped `to`/`toward`/
    // `line`/`circle1/circle2` and never chased line specs → a line∩circle-mediated cycle went undetected).
    const dependsOn = (target: Id, source: Id): boolean => {
      const seen = new Set<Id>();
      const queue = [target];
      while (queue.length) {
        const id = queue.shift()!;
        if (id === source) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        const o = byId.get(id);
        if (!o) continue;
        queue.push(...objectParents(o));
      }
      return false;
    };
    const coupledIds = new Set<Id>();
    for (const o of solved) {
      const refs = constraintRefs(o.constraint).filter((r) => r !== o.id);
      if (refs.some((r) => solvedIds.has(r) || dependsOn(r, o.id))) {
        coupledIds.add(o.id);
        for (const r of refs) if (solvedIds.has(r)) coupledIds.add(r);
      }
    }
    if (coupledIds.size) {
      const promoted: Construction = {
        ...c,
        objects: c.objects.map((o) =>
          o.kind === 'on-segment-solved' && coupledIds.has(o.id)
            ? { kind: 'on-segment', id: o.id, a: o.a, b: o.b, t: o.t0 ?? 0.5, solve: { constraint: o.constraint, branch: o.branch } }
            : o,
        ),
      };
      return resolveDriven(promoted);
    }
  }

  // Free vertices driven by a constraint (2 DOF each) take a separate, regularised
  // path — they have no bounded parameter range, and a single equation leaves a
  // solution manifold, so we pick the configuration nearest the current one (ADR-028).
  // A driveable SHAPE SCALAR (perp-offset dist / rotated angle / scaled-offset k) present ⇒ the
  // generalized solver, which mixes it with any free-vertex / parametric carriers (ADR-033) — so a
  // rectangle's width (free vertex) and height (perp-offset) solve together.
  const shapeCarriers = c.objects.filter((o) => isShapeCarrier(o) && (o as { solve?: unknown }).solve !== undefined);
  const freeCarriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'free-point' }> => o.kind === 'free-point' && o.solve !== undefined,
  );
  // An on-line marker's offset is UNBOUNDED (it slides along an infinite line), so it
  // can't use the bracketed range-solve below — route it (and anything it must solve
  // jointly with) through the seed/scale optimizer (ADR-036).
  const onLineCarriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'on-line' }> => o.kind === 'on-line' && o.solve !== undefined,
  );
  const paramCarriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'on-circle' | 'on-segment' }> =>
      (o.kind === 'on-circle' || o.kind === 'on-segment') && o.solve !== undefined,
  );
  // Any heterogeneous mix — shape scalars, on-line offsets, OR free vertices together with a
  // parametric (on-segment/on-circle) DOF — must use the generalized joint solver. The pure
  // free-vertex path below IGNORES parametric carriers, so e.g. "|BP|=3|PD|" (which recruits a
  // triangle's vertices AND the on-segment E that actually moves P) would drop E and fail.
  if (shapeCarriers.length > 0 || onLineCarriers.length > 0 || (freeCarriers.length > 0 && paramCarriers.length > 0)) {
    return resolveMixedCarriers(c, [...freeCarriers, ...paramCarriers, ...shapeCarriers, ...onLineCarriers]);
  }
  if (freeCarriers.length > 0) return resolveFreeDriven(c, freeCarriers);

  const carriers = paramCarriers;
  if (carriers.length === 0) return c;
  // An on-circle carrier ranges over the full circle; an on-segment over its interior [0,1] — EXCEPT an
  // EXTENSION point ("E on the extension of DC", t>1), which lives BEYOND the segment by definition, so a
  // constraint that DRIVES it (e.g. ∠CAE=50 driving E) must search t>1, not clamp E back between the
  // endpoints (the operator's "E didn't stay after D/C"). (ADR-105.)
  const range = (o: { kind: string; extension?: boolean }): [number, number] =>
    o.kind === 'on-circle' ? [0, 2 * Math.PI] : o.extension ? [1.02, 12] : [0, 1];

  // ONE driven DOF: a plain 1-D solve, with the branch index choosing among roots
  // (so "show another configuration" can cycle them) — the ADR-028 base case.
  if (carriers.length === 1) {
    const carrier = carriers[0];
    const dir = carrier.solve!;
    const [lo, hi] = range(carrier);
    const f = (v: number): number => {
      const r = evaluateCore(withParam(c, carrier.id, v), { skipConstraints: true });
      if (!r.ok) return NaN;
      for (const id of constraintRefs(dir.constraint)) if (!r.positions.has(id)) return NaN;
      return Math.abs(residual(dir.constraint, (id) => r.positions.get(id)!));
    };
    const roots = drivenRoots(f, lo, hi, residualTolerance(dir.constraint));
    if (roots.length === 0) return c; // unsolvable → keep default; the constraint check fails honestly
    // A one-sided ORDER constraint owns no carrier of its own (it rides the optimizer), so when one
    // references THIS carrier — e.g. an `extend-onto-circle`'s D, driven onto line AC by `collinear`
    // while `collinear-order` pins it BEYOND the 2nd letter — prefer the root that satisfies the order
    // (the FAR crossing) over the near one. This picks the right side at the CURRENT size, so a free
    // radius is grown (by recruitFreeDofs) only when NO root satisfies the order, never to collapse the
    // circle onto a near crossing. branch then cycles the order-sorted roots ("show another config").
    const orderCons = c.constraints.filter(
      (k) =>
        (k.type === 'collinear-order' || k.type === 'angle-order' || k.type === 'length-order' || k.type === 'angle-acuteness') &&
        constraintRefs(k).includes(carrier.id),
    );
    let ordered = roots;
    if (orderCons.length) {
      const orderResid = (v: number): number => {
        const r = evaluateCore(withParam(c, carrier.id, v), { skipConstraints: true });
        if (!r.ok) return Infinity;
        let s = 0;
        for (const k of orderCons) {
          for (const id of constraintRefs(k)) if (!r.positions.has(id)) return Infinity;
          s += residual(k, (id) => r.positions.get(id)!);
        }
        return s;
      };
      ordered = [...roots].sort((a, b) => orderResid(a) - orderResid(b));
    } else {
      // No order preference: keep the figure STABLE — order the roots by NEARNESS to the carrier's
      // current value, so branch 0 is the smallest move. A symmetric constraint like OD⊥AC has two roots
      // (the two arc-midpoints, half a circle apart); without this the solve could fling the point to the
      // FAR root, re-ordering the vertices into a crossed quad. "Show another configuration" then cycles
      // outward to the other roots ([ADR-028](docs/06-decisions.md#adr-028) stability).
      const seed = carrier.kind === 'on-circle' ? carrier.theta : carrier.t;
      const span = hi - lo; // 2π (on-circle) or 1 (on-segment)
      const near = (v: number) => {
        const x = Math.abs(v - seed);
        return carrier.kind === 'on-circle' ? Math.min(x, span - x) : x;
      };
      ordered = [...roots].sort((a, b) => near(a) - near(b));
    }
    return withParam(c, carrier.id, ordered[dir.branch % ordered.length]);
  }

  // SEVERAL coupled driven DOFs (e.g. "C = midpoint of OB" drives E while "|ED| = 7" drives D, and D's
  // chord length depends on where E lands): route through the one generalized joint solver (R5 Pass 2 —
  // [ADR-045](docs/06-decisions.md#adr-045)). resolveMixedCarriers carries the ported NEAR-FIRST local
  // accept + full-range grid-scan seeding for these bounded parametric carriers, and uses the relative
  // residual (un-gameable by collapse) + the coincide-exempt non-degeneracy gate.
  return resolveMixedCarriers(c, carriers);
}

/**
 * ANTI-COLLAPSE BARRIER for the driven basin searches (the degenerate-parking class).
 *
 * A driven carrier with residual manifold slack (e.g. N carrying "O1M ⟂ NM" — every point of the
 * ⟂ line through M satisfies it) is placed by the REGULARISED search at the point nearest its seed —
 * which can be the (near-)DEGENERATE point of its own constraint (N parked ON M: a zero-length ray,
 * the residual's NaN hole). The figure then reads valid but is WEDGED: gradients around the collapse
 * are singular/hypersensitive, so any later given that needs the slack direction (the two-tangent
 * corpus: "tangents from N to the OTHER circle", then sizes) falsely over-constrains. This term makes
 * near-collapse configurations locally expensive in the BASIN SEARCH ONLY: a soft quadratic hinge per
 * pair of referenced/carrier points inside a small margin of the figure's extent, exempting pairs a
 * `coincide` intends to merge (same convention as `solutionAccepted`). It is tie-break-scale — far
 * below any genuine relative residual, so a FORCED coincidence (ADR-123, driven by a real constraint)
 * still wins, and the pure-residual polish (which never sees the barrier) lands solutions exactly.
 * Returns a function of evaluated positions so the callers reuse the positions their cost already
 * computed (no second evaluateCore).
 */
function collapseBarrier(c: Construction, cons: Constraint[], carrierIds: Id[]): (pos: Map<Id, Vec>) => number {
  const refIds = [...new Set([...cons.flatMap((con) => constraintRefs(con)), ...carrierIds])];
  const exempt = new Set(c.constraints.filter((k) => k.type === 'coincide').map((k) => [k.p, k.q].sort().join('|')));
  const pairs: [Id, Id][] = [];
  for (let i = 0; i < refIds.length; i++)
    for (let j = i + 1; j < refIds.length; j++)
      if (!exempt.has([refIds[i], refIds[j]].sort().join('|'))) pairs.push([refIds[i], refIds[j]]);
  // LINEAR hinge, decisively stronger than the λ regulariser near the margin edge — safe because this
  // cost is only ever used by the self-verified RETRY search (a result replaces the base only when
  // accepted AND strictly healthier; a too-aggressive push simply wastes one search).
  const W = 0.5; // per-pair weight at full contact
  return (pos) => {
    let ext = 1;
    for (const id of refIds) {
      const p = pos.get(id);
      if (p) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y));
    }
    const m = 0.05 * ext;
    let s = 0;
    for (const [a, b] of pairs) {
      const p = pos.get(a);
      const q = pos.get(b);
      if (!p || !q) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < m) s += W * (1 - d / m);
    }
    return s;
  };
}

/**
 * Drive one or more FREE vertices (2 DOF each) so their constraints hold, choosing
 * the configuration NEAREST the current one — a shape's free vertex has no bounded
 * parameter, and a single distance/ratio equation leaves a 1-parameter family of
 * solutions, so without this regularisation the figure could jump arbitrarily far
 * (ADR-028, free-point extension). Minimises Σ residual² + λ·Σ‖p−p₀‖² by Nelder–Mead
 * seeded at the current positions, with the simplex step scaled to the figure.
 */
function resolveFreeDriven(c: Construction, freeCarriers: Extract<GeoObject, { kind: 'free-point' }>[]): Construction {
  // Distinct constraints (a constraint shared by several driven vertices counts once).
  const seen = new Set<string>();
  const cons = freeCarriers
    .flatMap((cr) => [cr.solve!.constraint, ...(cr.solve!.also ?? [])]) // `also`: a co-driven 2nd constraint on this vertex's spare DOF (ADR-229)
    .filter((k) => (seen.has(JSON.stringify(k)) ? false : (seen.add(JSON.stringify(k)), true)));
  withOrderCons(cons, c); // also minimise any "α < β" ordering jointly with these vertices (ADR-039)
  const ids = freeCarriers.map((cr) => cr.id);
  const seed = freeCarriers.flatMap((cr) => [cr.x, cr.y]); // [x0,y0, x1,y1, …]
  // A figure-scaled step & regularisation weight: the span of the seed vertices,
  // floored so a degenerate seed still moves. λ is tiny — it only breaks ties on the
  // solution manifold, never competing with driving the residual to ~0.
  const span = Math.max(1, ...seed.map((v) => Math.abs(v)));
  const place = (x: number[]): Construction =>
    setFreePos(c, new Map(ids.map((id, i) => [id, { x: x[2 * i], y: x[2 * i + 1] }])));
  // The pure constraint cost (Σ residual²) and a lightly-regularised variant that
  // adds λ·Σ‖p−seed‖² to prefer the configuration nearest the current one.
  const residFull = (x: number[]): { s: number; pos: Map<Id, Vec> | null } => {
    const r = evaluateCore(place(x), { skipConstraints: true });
    if (!r.ok) return { s: Infinity, pos: null };
    let s = 0;
    for (const con of cons) {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return { s: Infinity, pos: null };
      const get = (id: Id) => r.positions.get(id)!;
      // RELATIVE residual (normalised by the constraint's scale) — one residual convention across the
      // driven solvers (matches resolveMixedCarriers), un-gameable by shrinking a segment toward 0
      // (ADR-033 Am.1 / ADR-045 R5). The zero set is unchanged, so a single constraint lands in the
      // same place; it only rebalances multi-constraint joint solves and the seed tie-breaker.
      // A SATISFIED one-sided order costs 0 (jointCostTerm, ADR-276) — a preference never outweighs
      // a hard constraint's root.
      s += jointCostTerm(con, get);
    }
    return { s, pos: r.positions };
  };
  const resid = (x: number[]): number => residFull(x).s;
  const barrier = collapseBarrier(c, cons, ids);
  const lambda = 1e-3 / (span * span); // scale-free; only breaks ties on the solution manifold
  const regCost = (x: number[]): number => {
    const base = resid(x);
    if (!isFinite(base)) return Infinity;
    let s = base;
    for (let i = 0; i < x.length; i++) s += lambda * (x[i] - seed[i]) * (x[i] - seed[i]);
    return s;
  };
  // The barrier-augmented search cost — used ONLY by the anti-collapse RETRY (never the primary
  // descent, whose basin choice previously-green figures depend on — see `collapseBarrier`).
  const regCostB = (x: number[]): number => {
    const { s: base, pos } = residFull(x);
    if (!isFinite(base) || !pos) return Infinity;
    let s = base + barrier(pos);
    for (let i = 0; i < x.length; i++) s += lambda * (x[i] - seed[i]) * (x[i] - seed[i]);
    return s;
  };
  const barrierAt = (x: number[]): number => {
    const { s, pos } = residFull(x);
    return isFinite(s) && pos ? barrier(pos) : Infinity;
  };
  // Nearest basin (regularised search from the seed) + a few cardinal restarts so a vertex on the
  // far side of a solution circle isn't missed; then polish on the pure residual (shrinking simplex)
  // so the result lands ON the constraint; accept only a genuine, non-degenerate solution else keep
  // the seed so the honest over-constraint check reports it. Shared scaffold — see multiStartSolve.
  const offsets = [1, -1, 0.5].flatMap((d) => [
    seed.map((v, i) => (i % 2 === 0 ? v + d * span : v)),
    seed.map((v, i) => (i % 2 === 1 ? v + d * span : v)),
  ]);
  // Convex-first (ADR-097): prefer a configuration whose declared polygons are convex; fall back to the
  // relaxed accept only if no convex solution is reachable. A no-op when the figure declares no ≥4-gon.
  const finish = (requireConvex: boolean, useBarrier = false): { x: number[]; ok: boolean } => {
    const best = multiStartSolve(seed, offsets, span * 0.2, useBarrier ? regCostB : regCost, resid, [span * 0.05, span * 0.005], 400, (x) =>
      solutionAccepted(c, place, x, cons, span, requireConvex),
    );
    return { x: best, ok: solutionAccepted(c, place, best, cons, span, requireConvex) };
  };
  // Anti-collapse retry (ADR-238): when the plain search FAILED or parked at a near-degenerate spot
  // (barrier > 0 — e.g. a slack carrier hugging its constraint's own collapse point), re-search with the
  // barrier-augmented cost and prefer a strictly-healthier accepted result. A healthy plain result
  // (barrier 0 — the overwhelming case) returns untouched, so previously-green basin choices are
  // preserved bit-for-bit; a forced coincidence (ADR-123) finds no accepted improvement and falls back.
  const pick = (requireConvex: boolean): { x: number[]; ok: boolean } => {
    const base = finish(requireConvex);
    const b0 = base.ok ? barrierAt(base.x) : Infinity;
    if (base.ok && b0 === 0) return base;
    const retry = finish(requireConvex, true);
    if (retry.ok && barrierAt(retry.x) < b0) return retry;
    return base;
  };
  const conv = pick(true);
  return place(conv.ok ? conv.x : pick(false).x);
}

/**
 * Shared multi-start optimiser for the driven solvers (R5/[ADR-045](docs/06-decisions.md#adr-045)):
 * a regularised search from the seed plus the given cardinal `restarts` (so a far basin isn't missed),
 * then a polish that drops the regulariser and shrinks the simplex through `polishSteps` so the result
 * lands tightly on the constraints. Returns the best candidate if `accept` passes, else the seed
 * (honest over-constraint → the caller keeps the prior figure). Pure refactor of the formerly-duplicated
 * basin-search/polish/accept loop in {@link resolveFreeDriven} and {@link resolveMixedCarriers}.
 */
function multiStartSolve(
  seed: number[],
  restarts: number[][],
  searchStep: number,
  regCost: (x: number[]) => number,
  polishCost: (x: number[]) => number,
  polishSteps: number[],
  polishIters: number,
  accept: (x: number[]) => boolean,
): number[] {
  let best = seed;
  let bestReg = regCost(seed);
  // The lowest-residual candidate that ALREADY satisfies every constraint (non-degenerate). The polish
  // below can wander OFF an accepted candidate into a degenerate same-cost basin (e.g. a collinearity has
  // a second root where the driven point collapses onto a referenced one — cost ~0 but rejected), which
  // would make us return the seed and report a false over-constraint. Tracking the best accepted point as
  // we go lets us fall back to it instead of throwing away a solution we already found.
  let accepted: number[] | null = null;
  let acceptedCost = Infinity;
  const consider = (x: number[]) => {
    if (accept(x)) {
      const pc = polishCost(x);
      if (pc < acceptedCost) {
        acceptedCost = pc;
        accepted = x;
      }
    }
  };
  for (const start of [seed, ...restarts]) {
    consider(start); // a seeded restart (e.g. the grid-scan / binding-aware seed) may already be a valid solution
    const x = nelderMead(regCost, start, 400, searchStep);
    const fx = regCost(x);
    if (fx < bestReg) {
      bestReg = fx;
      best = x;
    }
    consider(x);
  }
  for (const st of polishSteps) {
    best = nelderMead(polishCost, best, polishIters, st);
    consider(best);
  }
  if (accept(best)) return best;
  return accepted ?? seed; // keep an accepted solution if the polish ended on a rejected one
}

/**
 * Every declared polygon with ≥4 vertices is CONVEX in its given vertex order under `positions` —
 * the engine's counterpart to the store's `polygonsConvex`, run on a Construction's `polygon` objects.
 * Triangles (and any <4-gon) are trivially convex and skipped; a polygon with an unresolved vertex is
 * ignored (not this gate's concern). The driven solvers use this to PREFER a convex drawing of a
 * declared shape (convex-by-default — FR-EN-16 / [ADR-018](docs/06-decisions.md#adr-018)), so a coupled
 * constraint solve doesn't land on a crossed/concave branch when a convex solution is reachable.
 */
function declaredPolygonsConvex(c: Construction, positions: Map<Id, Vec>): boolean {
  for (const o of c.objects) {
    if (o.kind !== 'polygon' || o.vertices.length < 4) continue;
    const pts = o.vertices.map((id) => positions.get(id));
    if (pts.some((p) => !p)) continue; // a vertex that didn't resolve — not this guard's concern
    const n = pts.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const A = pts[i]!, B = pts[(i + 1) % n]!, C = pts[(i + 2) % n]!;
      const turn = Math.sign((B.x - A.x) * (C.y - B.y) - (B.y - A.y) * (C.x - B.x));
      if (turn === 0) return false; // a collinear (degenerate) corner
      if (sign === 0) sign = turn;
      else if (turn !== sign) return false; // a reflex turn → concave (or crossed)
    }
  }
  return true;
}

/**
 * A candidate `x` (mapped to a Construction by `place`) is accepted iff the figure evaluates, satisfies
 * every constraint within tolerance, and isn't degenerate (no two referenced points collapsed together —
 * a cheat the residual alone would reward) — EXCEPT a pair a `coincide` constraint deliberately merges
 * ([ADR-028](docs/06-decisions.md#adr-028): their meeting is the goal, e.g. "C = midpoint of OB"). When
 * `requireConvex` is set, a candidate whose declared polygon is crossed/concave is also rejected (the
 * convex-preferring first pass — ADR-097). Shared accept gate for both driven solvers; the coincide
 * exemption is ported from the former coupled-param block.
 */
function solutionAccepted(c: Construction, place: (x: number[]) => Construction, x: number[], cons: Constraint[], span: number, requireConvex = false): boolean {
  const r = evaluateCore(place(x), { skipConstraints: true });
  if (!r.ok) return false;
  const satisfied = cons.every((con) => {
    for (const id of constraintRefs(con)) if (!r.positions.has(id)) return false;
    return isSatisfied(con, (id) => r.positions.get(id)!);
  });
  if (!satisfied) return false;
  if (requireConvex && !declaredPolygonsConvex(c, r.positions)) return false;
  // Non-degenerate: no two referenced points collapsed together, skipping any pair a coincide
  // constraint intends to merge. The threshold scales to the figure's ACTUAL extent (the referenced
  // points' coords), floored by the passed `span` — a pure-parametric figure passes span=1 (no free
  // points), so deriving the extent here keeps the gate correct on e.g. an r5 circle where 1e-3·span
  // would be ~200× too small. (Matches the deleted coupled block, which scaled its barrier off the
  // referenced points' coords.) The MOVED CARRIERS join the check (ADR-231): a recruited free vertex
  // that isn't referenced by the driven constraint could otherwise collapse silently — the square whose
  // corner is "driven" to the midpoint of its own base "solves" by shrinking the square to a point,
  // a wrong figure the residual alone rewards.
  const carrierIds = c.objects.filter((o) => (o as { solve?: unknown }).solve !== undefined).map((o) => o.id);
  const refIds = [...new Set([...cons.flatMap((con) => constraintRefs(con)), ...carrierIds])];
  const coincidePairs = new Set(
    c.constraints.filter((k) => k.type === 'coincide').map((k) => [k.p, k.q].sort().join('|')),
  );
  let figSpan = span;
  for (const id of refIds) {
    const p = r.positions.get(id);
    if (p) figSpan = Math.max(figSpan, Math.abs(p.x), Math.abs(p.y));
  }
  const eps = 1e-3 * figSpan;
  for (let i = 0; i < refIds.length; i++) {
    for (let j = i + 1; j < refIds.length; j++) {
      if (coincidePairs.has([refIds[i], refIds[j]].sort().join('|'))) continue;
      const a = r.positions.get(refIds[i]);
      const b = r.positions.get(refIds[j]);
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < eps) return false;
    }
  }
  return true;
}

/** Set free vertices to explicit positions and clear their `solve` directives (now resolved). */
function setFreePos(c: Construction, pos: Map<Id, Vec>): Construction {
  return {
    ...c,
    objects: c.objects.map((o) =>
      o.kind === 'free-point' && pos.has(o.id) ? { ...o, x: pos.get(o.id)!.x, y: pos.get(o.id)!.y, solve: undefined } : o,
    ),
  };
}

// ── Generalized driver: a heterogeneous set of DOFs (free-vertex coords, parametric t/θ,
//    and the driveable SHAPE SCALARS — perp-offset dist, rotated angle, scaled-offset k) —
//    solved jointly. Each DOF is normalised by a per-kind scale so Nelder–Mead copes with the
//    very different magnitudes (a coord ~10, an angle ~60°, a ratio ~0.6). ADR-033. ──

/** One driveable carrier: how many params it contributes, their current values, and a normalising scale. */
interface CarrierSpec {
  id: Id;
  n: number; // 2 for a free vertex (x,y); 1 otherwise
  seed: number[];
  scale: number[];
}
function carrierSpec(o: GeoObject, span: number): CarrierSpec | null {
  const floor = Math.max(1, span * 0.1); // a per-coordinate scale floor so a near-zero coord still gets sane steps
  switch (o.kind) {
    // Each coordinate is normalised by its OWN magnitude (not the global span) so a small leg
    // (CA≈4) next to a long one (CB≈19) still gets fine restart resolution — ADR-033.
    case 'free-point': return o.solve ? { id: o.id, n: 2, seed: [o.x, o.y], scale: [Math.max(Math.abs(o.x), floor), Math.max(Math.abs(o.y), floor)] } : null;
    case 'on-segment': return o.solve ? { id: o.id, n: 1, seed: [o.t], scale: [1] } : null;
    case 'on-circle': return o.solve ? { id: o.id, n: 1, seed: [o.theta], scale: [1] } : null;
    case 'perp-offset': return o.solve ? { id: o.id, n: 1, seed: [o.dist], scale: [Math.max(Math.abs(o.dist), 1)] } : null;
    case 'rotated': return o.solve ? { id: o.id, n: 1, seed: [o.angleDeg], scale: [90] } : null;
    case 'scaled-offset': return o.solve ? { id: o.id, n: 1, seed: [o.k], scale: [Math.max(Math.abs(o.k), 0.5)] } : null;
    case 'on-line': return o.solve ? { id: o.id, n: 1, seed: [o.offset], scale: [Math.max(Math.abs(o.offset), floor)] } : null;
    // A free-radius circle's radius is a shape scalar (ADR-051) — seed at its current value, scaled by it.
    case 'circle': return o.solve && o.radius.via === 'free' ? { id: o.id, n: 1, seed: [o.radius.value], scale: [Math.max(o.radius.value, 1)] } : null;
    default: return null;
  }
}
/** Write a carrier's resolved param(s) into the construction (clearing its solve directive). */
function setCarrierVals(c: Construction, vals: Map<Id, number[]>): Construction {
  return {
    ...c,
    objects: c.objects.map((o) => {
      const v = vals.get(o.id);
      if (!v) return o;
      switch (o.kind) {
        case 'free-point': return { ...o, x: v[0], y: v[1], solve: undefined };
        // An EXTENSION point lives BEYOND the segment (t>1); HARD-clamp it there so the (unbounded) joint
        // optimizer can't pull a driven extension point back between the endpoints to satisfy a constraint —
        // it must keep E on the extension and move the figure's OTHER DOFs instead (ADR-105). A PLAIN
        // on-segment point lives ON the segment BETWEEN its endpoints (t∈[0,1]) BY DEFINITION — clamp it
        // there too, so the unbounded joint search can't slide it off its segment onto the line/extension to
        // satisfy a constraint (a DISTANCE-based ratio like DF:FC=1:10 has an INTERNAL root t=1/11 AND an
        // EXTERNAL one t=−1/9; the point declared "on DC" must take the internal one). It must move the
        // figure's OTHER DOFs instead. The bounded per-DOF seed already searches [0,1]; this enforces it on
        // the final write and through the cost landscape. (ADR-194.)
        case 'on-segment': return { ...o, t: o.extension ? Math.max(v[0], 1.02) : Math.min(1, Math.max(0, v[0])), solve: undefined };
        case 'on-circle': return { ...o, theta: v[0], solve: undefined };
        case 'perp-offset': return { ...o, dist: Math.max(v[0], 1e-3), solve: undefined };
        case 'rotated': return { ...o, angleDeg: v[0], solve: undefined };
        case 'scaled-offset': return { ...o, k: Math.max(v[0], 1e-3), solve: undefined };
        case 'on-line': return { ...o, offset: v[0], solve: undefined };
        case 'circle': return o.radius.via === 'free' ? { ...o, radius: { via: 'free', value: Math.max(v[0], 0.2) }, solve: undefined } : o;
        default: return o;
      }
    }),
  };
}

/**
 * Drive a heterogeneous set of carriers so their constraints hold, choosing the configuration
 * NEAREST the current one (regularised). Generalises {@link resolveFreeDriven} to mix free
 * vertices with the parametric and shape-scalar DOFs — so e.g. a rectangle's width (a free
 * vertex) and height (a perp-offset dist) solve together. Works in normalised coordinates.
 */
function resolveMixedCarriers(c: Construction, carriers: GeoObject[]): Construction {
  // Solve a given carrier list: returns the chosen construction and whether a solution was ACCEPTED
  // (under `requireConvex`). Extra carriers with NO `solve` directive (recruited free polygon vertices)
  // contribute DOF but no constraint — they give the joint solve room to land on a CONVEX branch (ADR-097).
  const solveFor = (carrierList: GeoObject[], requireConvex: boolean): { result: Construction; ok: boolean } => {
    const span = Math.max(1, ...carrierList.flatMap((o) => (o.kind === 'free-point' && o.solve ? [Math.abs(o.x), Math.abs(o.y)] : [])));
    // A spec for each carrier: a constraint-carrier via carrierSpec, or a recruited FREE on-circle vertex
    // (no solve) as a plain bounded θ DOF.
    const specs = carrierList
      .map((o): CarrierSpec | null => carrierSpec(o, span) ?? (o.kind === 'on-circle' ? { id: o.id, n: 1, seed: [o.theta], scale: [1] } : null))
      .filter((s): s is CarrierSpec => s !== null);
    if (specs.length === 0) return { result: c, ok: false };
    // Distinct constraints (one shared by several carriers counts once); only carriers that DRIVE one
    // contribute (recruited free vertices don't).
    const seen = new Set<string>();
    const cons: Constraint[] = carrierList
      .flatMap((o) => { const sv = (o as { solve?: { constraint: Constraint; also?: Constraint[] } }).solve; return sv ? [sv.constraint, ...(sv.also ?? [])] : []; }) // `also`: co-driven 2nd constraint (ADR-229)
      .filter((k) => (seen.has(JSON.stringify(k)) ? false : (seen.add(JSON.stringify(k)), true)));
    withOrderCons(cons, c); // also minimise any "α < β" ordering jointly with these carriers (ADR-039)
    // Flat layout: normalised seed `u` (each carrier's params divided by their scale, so all DOFs ~O(1)).
    const seedU = specs.flatMap((s) => s.seed.map((v, i) => v / s.scale[i]));
    const place = (u: number[]): Construction => {
      const vals = new Map<Id, number[]>();
      let k = 0;
      for (const s of specs) {
        vals.set(s.id, s.scale.map((sc, i) => u[k + i] * sc));
        k += s.n;
      }
      return setCarrierVals(c, vals);
    };
    // The cost is the sum of squared RELATIVE residuals (each constraint's residual ÷ its own scale).
    // This is un-gameable by shrinking: a wrong ratio stays ~1% relative however small you make it, so
    // the solver can't "cheat" a length/ratio by collapsing the constrained part (and a collapse, scale→0,
    // blows the relative residual up). It also normalises constraints of different magnitudes against
    // each other so the joint solve doesn't favour the larger one. (ADR-033.)
    const costFull = (u: number[]): { s: number; pos: Map<Id, Vec> | null } => {
      const r = evaluateCore(place(u), { skipConstraints: true });
      if (!r.ok) return { s: Infinity, pos: null };
      let s = 0;
      for (const con of cons) {
        for (const id of constraintRefs(con)) if (!r.positions.has(id)) return { s: Infinity, pos: null };
        const get = (id: Id) => r.positions.get(id)!;
        // A SATISFIED one-sided order costs 0 (jointCostTerm, ADR-276) — a preference never outweighs
        // a hard constraint's root.
        s += jointCostTerm(con, get);
      }
      return { s, pos: r.positions };
    };
    const cost = (u: number[]): number => costFull(u).s;
    const barrier = collapseBarrier(c, cons, specs.map((s) => s.id));
    const lambda = 1e-3; // tiny tie-breaker toward the seed (normalised space)
    const regCost = (u: number[]): number => {
      const base = cost(u);
      if (!isFinite(base)) return Infinity;
      let s = base;
      for (let i = 0; i < u.length; i++) s += lambda * (u[i] - seedU[i]) * (u[i] - seedU[i]);
      return s;
    };
    // Barrier-augmented search cost for the anti-collapse RETRY only (ADR-238 — see resolveFreeDriven).
    const regCostB = (u: number[]): number => {
      const { s: base, pos } = costFull(u);
      if (!isFinite(base) || !pos) return Infinity;
      let s = base + barrier(pos);
      for (let i = 0; i < u.length; i++) s += lambda * (u[i] - seedU[i]) * (u[i] - seedU[i]);
      return s;
    };
    const barrierAt = (u: number[]): number => {
      const { s, pos } = costFull(u);
      return isFinite(s) && pos ? barrier(pos) : Infinity;
    };
    // The BOUNDED parametric carriers (on-circle θ∈[0,2π], on-segment t∈[0,1]) in u-space (scale 1 ⇒ u == θ/t),
    // each tagged with the constraint IT drives (for the binding-aware sweep below) — a recruited free vertex
    // has no `own`. A FREE-radius circle is included too (ADR-071): its radius is unbounded, but the constraint
    // it drives (|XY| = k·R) has a single sign-change in the radius, so a wide bracket + the per-DOF argMin
    // sweep solves it robustly where the cardinal-restart Nelder–Mead (reaching only ~3× the seed) misses a root.
    const ranges: { ui: number; lo: number; hi: number; own?: Constraint }[] = [];
    let ki = 0;
    for (const s of specs) {
      const car = carrierList.find((o) => o.id === s.id) as (GeoObject & { solve?: { constraint: Constraint } }) | undefined;
      const own = car?.solve?.constraint;
      if (car?.kind === 'on-circle') ranges.push({ ui: ki, lo: 0, hi: 2 * Math.PI, own });
      // An EXTENSION on-segment carrier (t>1, beyond the segment) is searched past 1, not clamped to the
      // interior — so a constraint driving it keeps it on the extension (ADR-105). A plain free on-segment
      // stays in [0,1].
      else if (own && car?.kind === 'on-segment') ranges.push({ ui: ki, lo: car.extension ? 1.02 : 0, hi: car.extension ? 12 : 1, own });
      else if (own && car?.kind === 'circle' && car.radius.via === 'free') {
        // u = radius / scale (scale = seed radius ⇒ seed u = 1). Bracket [tiny, generous] in radius, /scale.
        const sc = s.scale[0];
        ranges.push({ ui: ki, lo: 0.05 / sc, hi: Math.max(sc * 30, span * 5, 200) / sc, own });
      }
      ki += s.n;
    }
    // When bounded parametric carriers are present, two extra steps ported from the former coupled-param
    // solver (R5 Pass 2): (1) NEAR-FIRST — a local solve from the current seed, returned if valid, so a
    // figure needing only a small reshape keeps its current (e.g. convex cyclic-quad) configuration instead
    // of jumping to a far branch; (2) a globally-informed GRID-SCAN seed — coordinate-descent argMin per
    // bounded DOF over its FULL range (all branches considered), the capability the cardinal restarts alone
    // would miss. Both are no-ops when there are no bounded params, so pure shape/on-line figures are unchanged.
    const extraRestarts: number[][] = [];
    let near: number[] | null = null;
    if (ranges.length > 0) {
      near = nelderMead(cost, seedU.slice(), 500, 0.12);
      const gridSeed = seedU.slice();
      for (let iter = 0; iter < 12 && cost(gridSeed) > 1e-12; iter++) {
        let improved = false;
        for (const { ui, lo, hi } of ranges) {
          const before = cost(gridSeed);
          const v = argMin((t) => cost(gridSeed.map((x, j) => (j === ui ? t : x))), lo, hi);
          const trial = gridSeed.slice();
          trial[ui] = v;
          if (cost(trial) < before - 1e-12) {
            gridSeed[ui] = v;
            improved = true;
          }
        }
        if (!improved) break;
      }
      extraRestarts.push(gridSeed);

      // BINDING-AWARE seed (the triangular case the joint sum-of-squares loses): solve each bounded carrier
      // against the constraint IT drives — others held — sweeping Gauss-Seidel style. When carrier D drives
      // "A,D,C collinear" and carrier E drives "D,B,E collinear", D appears in BOTH residuals, so the shared
      // `cost` pulls D toward both and satisfies neither (it returns the seed). Solving D on its OWN constraint
      // (line AC, ignoring E) then E on its own (line DB, with D placed) recovers the exact sequential solution.
      // For genuinely coupled systems this may not converge — it's then just one more restart the search vets.
      const bindSeed = seedU.slice();
      for (let iter = 0; iter < 8; iter++) {
        let moved = false;
        for (const { ui, lo, hi, own } of ranges) {
          if (!own) continue; // a recruited free vertex drives no constraint — skip the Gauss-Seidel sweep
          const ownResid = (t: number): number => {
            const r = evaluateCore(place(bindSeed.map((x, j) => (j === ui ? t : x))), { skipConstraints: true });
            if (!r.ok) return Infinity;
            for (const id of constraintRefs(own)) if (!r.positions.has(id)) return Infinity;
            const v = residual(own, (id) => r.positions.get(id)!);
            return isFinite(v) ? Math.abs(v) : Infinity; // a degenerate root (collinear NaN at a collapsed ray) is skipped
          };
          const v = argMin(ownResid, lo, hi);
          if (Math.abs(v - bindSeed[ui]) > 1e-9) {
            bindSeed[ui] = v;
            moved = true;
          }
        }
        if (!moved) break;
      }
      extraRestarts.push(bindSeed);
    }
    // Nearest basin (regularised search from the seed) + the grid-informed seed + cardinal restarts (each DOF
    // pushed by a range of magnitudes in normalised units); polish on the residual through several decades so
    // a coupled system lands tightly ON the constraints; accept a genuine non-degenerate solution else keep
    // the seed. Shared scaffold.
    const restarts = [
      ...extraRestarts,
      ...[0.5, 1, -1, 2, -2].flatMap((d) => seedU.map((_, j) => seedU.map((v, i) => (i === j ? v + d : v)))),
    ];
    const run = (rc: (u: number[]) => number): { u: number[]; ok: boolean } => {
      const best = multiStartSolve(seedU, restarts, 0.3, rc, cost, [0.1, 0.03, 0.01, 0.003, 0.001, 3e-4, 1e-4], 500, (x) =>
        solutionAccepted(c, place, x, cons, span, requireConvex),
      );
      return { u: best, ok: solutionAccepted(c, place, best, cons, span, requireConvex) };
    };
    if (near && solutionAccepted(c, place, near, cons, span, requireConvex)) {
      // NEAR-FIRST stability: a small reshape keeps the current configuration — unless it parked
      // near-degenerate (barrier > 0), where a barrier-augmented re-search may find a healthy
      // configuration; keep `near` when it doesn't (ADR-238).
      const bn = barrierAt(near);
      if (bn === 0) return { result: place(near), ok: true };
      const retry = run(regCostB);
      return retry.ok && barrierAt(retry.u) < bn ? { result: place(retry.u), ok: true } : { result: place(near), ok: true };
    }
    // Plain search first (previously-green basin choices preserved); the barrier-augmented RETRY runs
    // only when the plain result failed or parked near-degenerate (ADR-238 — see resolveFreeDriven).
    let best = run(regCost);
    const b0 = best.ok ? barrierAt(best.u) : Infinity;
    if (!best.ok || b0 > 0) {
      const retry = run(regCostB);
      if (retry.ok && barrierAt(retry.u) < b0) best = retry;
    }
    return { result: place(best.u), ok: best.ok };
  };

  // Convex-by-default (FR-EN-16 / [ADR-018](docs/06-decisions.md#adr-018)): a declared polygon should read
  // CONVEX in its given vertex order. (1) Try a convex-required solve with the directly-referenced carriers.
  // (2) If no convex solution is reachable that way, RECRUIT the declared polygons' other FREE on-circle
  // vertices (ADR-097: a general inscribed quad's vertices are free DOFs, not fixed) and retry convex — the
  // extra freedom lets a constrained quad reshape to a convex drawing instead of a crossed one. (3) Only if
  // still no convex solution exists fall back to the relaxed accept with the original carriers — so a figure
  // that genuinely has no convex drawing still solves. When no ≥4-gon is declared, `declaredPolygonsConvex`
  // is always true ⇒ step (1) succeeds immediately and behaviour is unchanged.
  const conv = solveFor(carriers, true);
  if (conv.ok) return conv.result;
  const extra = freePolygonVerticesToRecruit(c, carriers);
  if (extra.length) {
    const conv2 = solveFor([...carriers, ...extra], true);
    if (conv2.ok) return conv2.result;
  }
  return solveFor(carriers, false).result;
}

/**
 * Free on-circle vertices (ADR-097: `free` and not yet driven) of any declared polygon (≥4 vertices) that
 * also contains one of `carriers` — candidates to recruit into a convex-failing joint solve so the polygon
 * can reshape to a convex drawing. Excludes vertices already among the carriers.
 */
function freePolygonVerticesToRecruit(c: Construction, carriers: GeoObject[]): GeoObject[] {
  const carrierIds = new Set(carriers.map((o) => o.id));
  const wanted = new Set<Id>();
  for (const o of c.objects) {
    if (o.kind !== 'polygon' || o.vertices.length < 4) continue;
    if (!o.vertices.some((v) => carrierIds.has(v))) continue; // only polygons touched by a current carrier
    for (const v of o.vertices) if (!carrierIds.has(v)) wanted.add(v);
  }
  return c.objects.filter(
    (o): o is GeoObject => o.kind === 'on-circle' && !!(o as { free?: boolean }).free && (o as { solve?: unknown }).solve === undefined && wanted.has(o.id),
  );
}

/** Nelder–Mead downhill simplex — derivative-free joint minimisation of `f` from `x0`. */
function nelderMead(f: (x: number[]) => number, x0: number[], iters = 300, step = 0.15): number[] {
  const n = x0.length;
  let simplex = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => (j === i ? v + step : v)))];
  let fv = simplex.map(f);
  const order = () => {
    const idx = [...fv.keys()].sort((a, b) => fv[a] - fv[b]);
    simplex = idx.map((i) => simplex[i]);
    fv = idx.map((i) => fv[i]);
  };
  for (let it = 0; it < iters; it++) {
    order();
    if (fv[0] < 1e-14) break;
    const cen = x0.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p[j], 0) / n); // centroid sans worst
    const worst = simplex[n];
    const refl = cen.map((cj, j) => cj + (cj - worst[j]));
    const fr = f(refl);
    if (fr < fv[0]) {
      const exp = cen.map((cj, j) => cj + 2 * (cj - worst[j]));
      const fe = f(exp);
      if (fe < fr) [simplex[n], fv[n]] = [exp, fe];
      else [simplex[n], fv[n]] = [refl, fr];
    } else if (fr < fv[n - 1]) {
      [simplex[n], fv[n]] = [refl, fr];
    } else {
      const con = cen.map((cj, j) => cj + 0.5 * (worst[j] - cj));
      const fc = f(con);
      if (fc < fv[n]) [simplex[n], fv[n]] = [con, fc];
      else
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((xj, j) => simplex[0][j] + 0.5 * (xj - simplex[0][j]));
          fv[i] = f(simplex[i]);
        }
    }
  }
  order();
  return simplex[0];
}

/** Argument minimising `f` over [lo,hi]: grid scan for the basin, ternary-refine it. */
function argMin(f: (v: number) => number, lo: number, hi: number, steps = 120): number {
  let bx = lo;
  let bf = Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const fx = f(x);
    if (isFinite(fx) && fx < bf) {
      bf = fx;
      bx = x;
    }
  }
  let a = Math.max(lo, bx - (hi - lo) / steps);
  let b = Math.min(hi, bx + (hi - lo) / steps);
  const val = (x: number) => {
    const r = f(x);
    return isFinite(r) ? r : Infinity;
  };
  for (let k = 0; k < 60; k++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (val(m1) < val(m2)) b = m2;
    else a = m1;
  }
  return (a + b) / 2;
}

/**
 * Roots of a non-negative residual `f` (a |constraint| ≥ 0) over [lo,hi]: scan a
 * grid for local minima, refine each by ternary search, keep those that reach ~0.
 * (sign-change bracketing in `solveParam` can't see a minimum that only *touches*
 * zero.) Deterministic; the list is the solution branches.
 */
function drivenRoots(f: (v: number) => number, lo: number, hi: number, tol: number, steps = 360): number[] {
  const val = (v: number) => {
    const r = f(v);
    return isFinite(r) ? r : Infinity;
  };
  const fs: number[] = [];
  for (let i = 0; i <= steps; i++) fs.push(val(lo + ((hi - lo) * i) / steps));
  const roots: number[] = [];
  for (let i = 1; i < steps; i++) {
    if (fs[i] === Infinity || !(fs[i] <= fs[i - 1] && fs[i] <= fs[i + 1])) continue;
    let a = lo + ((hi - lo) * (i - 1)) / steps;
    let b = lo + ((hi - lo) * (i + 1)) / steps;
    for (let k = 0; k < 80; k++) {
      const m1 = a + (b - a) / 3;
      const m2 = b - (b - a) / 3;
      if (val(m1) < val(m2)) b = m2;
      else a = m1;
    }
    const x = (a + b) / 2;
    if (val(x) < Math.max(tol, 1e-6) * 10 && !roots.some((o) => Math.abs(o - x) < 1e-3)) roots.push(x);
  }
  return roots;
}

/** Replace a carrier's parameter (theta/t) with `v` and drop its `solve` directive (now resolved). */
function withParam(c: Construction, id: Id, v: number): Construction {
  return {
    ...c,
    objects: c.objects.map((o) => {
      if (o.id !== id) return o;
      if (o.kind === 'on-circle') return { ...o, theta: v, solve: undefined };
      if (o.kind === 'on-segment') return { ...o, t: v, solve: undefined };
      return o;
    }),
  };
}

/**
 * Every constraint that DRIVES a carrier (an `on-segment-solved`'s `.constraint`, or any object's
 * `.solve.constraint`), deduplicated. These are the constraints `resolveDriven` is responsible for
 * satisfying by placing the carrier — they are NOT in `c.constraints` (that's the CHECK list), so
 * `evaluateCore`'s final loop never verifies them. Gathered from the ORIGINAL construction, before
 * `resolveDriven` clears the solve directives.
 */
function drivenConstraintsOf(c: Construction): Constraint[] {
  const out: Constraint[] = [];
  const seen = new Set<string>();
  for (const o of c.objects) {
    const con =
      o.kind === 'on-segment-solved'
        ? o.constraint
        : (o as { solve?: { constraint: Constraint } }).solve?.constraint;
    if (!con) continue;
    const key = JSON.stringify(con);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(con);
  }
  return out;
}

/**
 * Evaluate the construction: resolve any driven DOFs, then the constructive sweep + checks.
 *
 * After `resolveDriven` places the carriers, RE-VERIFY the driven constraints actually hold. The joint
 * solvers return a best-effort placement even when a driven-constraint system has NO solution (an
 * impossible perpendicular, an over-constrained ratio) — `resolveMixedCarriers` discards the solve's
 * `ok` flag and the regulariser pulls the carriers back to their seed — and `setCarrierVals` then
 * clears the solve directives, so the unsatisfiable constraint is neither a driver nor a check and
 * would read as `ok`. Verifying it here (the same `isSatisfied` gate `evaluateCore` applies to the
 * check-constraints) makes such a figure honestly over-constrained, so the step hard-fails and the
 * prior figure is kept (a carrier pinned by an EARLIER constraint isn't dragged off by a later
 * impossible one). Consistent with `solutionAccepted`, which uses the same gate — a solve it ACCEPTED
 * passes here unchanged; only a best-effort it rejected is now caught instead of silently accepted.
 */
/**
 * Purity memo (perf, 2026-07-06 review hotspot #3): `evaluate` is pure and deterministic in its input,
 * and the SAME Construction reference is evaluated repeatedly — the replay fold evaluates step N's output
 * as step N+1's `evaluate(prev)` (a flat 2× on every replay), and the recruiter/config searches re-check
 * references they already solved. Keyed by object identity (constructions are immutable by convention —
 * every mutation site builds new arrays), WeakMap so retired constructions are collectable. Measured on
 * the ADR-123 heavy figure this halves a cold replay; it changes NO result, only reuse.
 */
const evalMemo = new WeakMap<Construction, EvalResult>();

export function evaluate(c: Construction): EvalResult {
  const hit = evalMemo.get(c);
  if (hit) return hit;
  const r = evaluateUncached(c);
  evalMemo.set(c, r);
  return r;
}

function evaluateUncached(c: Construction): EvalResult {
  const driven = drivenConstraintsOf(c);
  const res = evaluateCore(resolveDriven(c));
  if (!res.ok || driven.length === 0) return res;
  // Report the whole CONFLICT SET, not one arbitrary member. When a joint solve can't satisfy an
  // impossible constraint it drags its co-drivers off too (here the impossible ⟂ pulls F off the
  // ratio), so several read violated at the best-effort placement. Naming just one is misleading —
  // and picking by residual is biased (a ratio's relative residual is unbounded, while ∥/⟂ is capped
  // at 1). But the regulariser is tiny (λ=1e-3), so a SATISFIABLE driven constraint is still driven to
  // ~0 residual and passes `isSatisfied`; only the genuinely-conflicting ones fail it. So the set that
  // fails `isSatisfied` IS the conflict — report them all ("X and Y cannot hold").
  const violated: string[] = [];
  const seenDesc = new Set<string>();
  for (const con of driven) {
    for (const id of constraintRefs(con)) {
      if (!res.positions.has(id)) return { ok: false, error: `${describeConstraint(con)} references an unknown point` };
    }
    if (!isSatisfied(con, (id) => res.positions.get(id)!)) {
      const d = describeConstraint(con);
      if (!seenDesc.has(d)) { seenDesc.add(d); violated.push(d); }
    }
  }
  if (violated.length) return { ok: false, error: `over-constrained: ${violated.join(' and ')} cannot hold` };
  return res;
}

function evaluateCore(c: Construction, opts?: { skipConstraints?: boolean }): EvalResult {
  const pos = new Map<Id, Vec>();
  const lines = new Map<Id, ResolvedLine>();
  const circles = new Map<Id, ResolvedCircle>();
  const points = c.objects.filter(isGeoPoint);
  const lineObjs = c.objects.filter((o): o is Line => o.kind === 'line');
  const circleObjs = c.objects.filter((o): o is Circle => o.kind === 'circle');
  const remaining = new Set(points.map((p) => p.id));
  const remainingLines = new Set(lineObjs.map((l) => l.id));
  const remainingCircles = new Set(circleObjs.map((o) => o.id));

  // One fixed-point sweep resolves circles, lines, and points together: a circle
  // needs its centre point; a tangent line needs its circle; an on-circle /
  // line∩circle point needs its circle (and line). They interleave until nothing
  // new resolves.
  let progressed = true;
  while ((remaining.size > 0 || remainingLines.size > 0 || remainingCircles.size > 0) && progressed) {
    progressed = false;
    for (const o of circleObjs) {
      if (!remainingCircles.has(o.id)) continue;
      const r = resolveCircle(o, pos, circles);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      circles.set(o.id, r);
      remainingCircles.delete(o.id);
      progressed = true;
    }
    for (const l of lineObjs) {
      if (!remainingLines.has(l.id)) continue;
      const r = resolveLine(l, pos, circles);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      lines.set(l.id, r);
      remainingLines.delete(l.id);
      progressed = true;
    }
    for (const p of points) {
      if (!remaining.has(p.id)) continue;
      const r = tryEval(p, pos, lines, circles);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      pos.set(p.id, r);
      remaining.delete(p.id);
      progressed = true;
    }
  }
  if (remaining.size > 0 || remainingLines.size > 0 || remainingCircles.size > 0) {
    const stuck = [...remaining, ...remainingLines, ...remainingCircles];
    return { ok: false, error: `unresolved dependencies for: ${stuck.join(', ')}` };
  }

  for (const v of pos.values()) {
    if (!isFinite(v.x) || !isFinite(v.y)) return { ok: false, error: 'non-finite position computed' };
  }

  // During a driven trial ([ADR-028](docs/06-decisions.md#adr-028)) we only need
  // positions — the checks below would abort the very search that's looking for
  // where they pass.
  if (opts?.skipConstraints) return { ok: true, positions: pos, circles };

  // Two distinct points sharing a location is normally a degenerate figure — but when the geometry or a
  // constraint genuinely drives them together (e.g. a derived intersection landing on a circle's centre
  // because a stated area/length ratio works out that way), that is a LEGITIMATE configuration, not a
  // contradiction. Per the operator's rule: do NOT hard-fail — ALLOW it and surface a NOTICE ("highlight a
  // possible error but allow it — part of the building experimentation"). Default collisions are avoided
  // UPSTREAM (the sampler seeds points apart, shape composition flips to the non-stacking side), so this
  // only fires on a FORCED coincidence. A `~`-scaffolding point or a `coincide`-constraint pair is fully
  // intended — no notice. ([ADR-123](docs/06-decisions.md#adr-124).)
  const intended = (idA: Id, idB: Id): boolean =>
    idA.startsWith('~') ||
    idB.startsWith('~') ||
    c.constraints.some((k) => k.type === 'coincide' && ((k.p === idA && k.q === idB) || (k.p === idB && k.q === idA)));
  const coincidences: [Id, Id][] = [];
  const placed = [...pos.entries()];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [idA, a] = placed[i];
      const [idB, b] = placed[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < LEN_EPS && !intended(idA, idB)) coincidences.push([idA, idB]);
    }
  }

  for (const con of c.constraints) {
    for (const id of constraintRefs(con)) {
      if (!pos.get(id)) return { ok: false, error: `${describeConstraint(con)} references an unknown point` };
    }
    const get = (id: Id) => pos.get(id)!;
    if (!isSatisfied(con, get)) {
      return { ok: false, error: `over-constrained: ${describeConstraint(con)} cannot hold` };
    }
  }

  return { ok: true, positions: pos, circles, ...(coincidences.length ? { coincidences } : {}) };
}

/** Resolve one circle to its centre and radius: a {@link ResolvedCircle}, 'pending', or an error string. */
export function resolveCircle(c: Circle, pos: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): ResolvedCircle | 'pending' | string {
  const center = pos.get(c.center);
  if (!center) return 'pending';
  if (c.radius.via === 'length' || c.radius.via === 'free') {
    if (c.radius.value <= 0) return `circle ${c.id}: radius must be positive`;
    return { center, r: c.radius.value };
  }
  if (c.radius.via === 'tangent-inner') {
    const outer = circles.get(c.radius.outer); // resolved earlier in the sweep (it's a plain circle)
    if (!outer) return 'pending';
    const r = outer.r - len(sub(center, outer.center)); // largest circle inside `outer`, tangent to it
    if (r < 1e-9) return `circle ${c.id}: its centre is too far from ${c.radius.outer} to sit inside it`;
    return { center, r };
  }
  const p = pos.get(c.radius.point);
  if (!p) return 'pending';
  const r = len(sub(p, center));
  if (r < 1e-9) return `circle ${c.id}: the point on it coincides with the centre`;
  return { center, r };
}

/** Resolve one line to an (anchor, dir): a {@link ResolvedLine}, 'pending', or an error string. */
export function resolveLine(l: Line, pos: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): ResolvedLine | 'pending' | string {
  const s = l.spec;
  switch (s.via) {
    case 'through': {
      const a = pos.get(s.a);
      const b = pos.get(s.b);
      if (!a || !b) return 'pending';
      const dir = sub(b, a);
      if (len(dir) < 1e-9) return `cannot build line ${l.id}: ${s.a} and ${s.b} coincide`;
      return { anchor: a, dir: unit(dir) };
    }
    case 'bisector': {
      const v = pos.get(s.vertex);
      const p = pos.get(s.p);
      const q = pos.get(s.q);
      if (!v || !p || !q) return 'pending';
      const u1 = unit(sub(p, v));
      const u2 = unit(sub(q, v));
      const bis = add(u1, u2); // the internal-bisector direction
      if (len(bis) < 1e-9) return `cannot bisect ∠${s.p}${s.vertex}${s.q}: the rays are opposite`;
      return { anchor: v, dir: unit(bis) };
    }
    case 'perpendicular':
    case 'parallel': {
      const t = pos.get(s.through);
      const a = pos.get(s.a);
      const b = pos.get(s.b);
      if (!t || !a || !b) return 'pending';
      const base = sub(b, a);
      if (len(base) < 1e-9) return `cannot build line ${l.id}: ${s.a} and ${s.b} coincide`;
      const dir = unit(base);
      return { anchor: t, dir: s.via === 'perpendicular' ? rot90(dir) : dir };
    }
    case 'tangent': {
      const c = circles.get(s.circle);
      const at = pos.get(s.at);
      if (!c || !at) return 'pending';
      const radial = sub(at, c.center);
      if (len(radial) < 1e-9) return `cannot take a tangent at the centre of ${s.circle}`;
      return { anchor: at, dir: unit(rot90(radial)) }; // ⟂ to the radius at `at`
    }
  }
}

/**
 * Pick "the OTHER crossing" among `sols` — the intersection to KEEP when a known reference point is one
 * of them. Drops every root coinciding with an already-placed point and returns the fresh root FARTHEST
 * from `avoid`. This is **geometric, not positional**: it stays put as the figure flexes, where a fixed
 * branch index flips root order and intermittently collapses onto the known point ([ADR-045](docs/06-decisions.md#adr-045)
 * R8). Returns null when NO fresh root remains — the figure is tangent at `avoid` (line∩circle) or the two
 * intersections coincide (circle∩circle), so there is no genuinely new point. When `avoid`'s position
 * isn't known yet it falls back to the `branch` index (the pre-R8 line∩circle behaviour, preserved).
 * Shared by line∩circle and circle∩circle, retiring the line-circle-only `avoid` one-off.
 */
/**
 * Order line∩circle crossings by their SIGNED position along the line's direction `dir` from `anchor`
 * — so `branch` selects a stable geometric SIDE (branch 0 = the −dir crossing, branch 1 = the +dir one),
 * not a position in `lineCircleIntersect`'s raw output whose order flips as the figure flexes ([ADR-045](docs/06-decisions.md#adr-045)
 * R8). The ordering depends only on the geometry (projection onto `dir`), never on the array order in.
 */
export function bySide(sols: Vec[], anchor: Vec, dir: Vec): Vec[] {
  const proj = (s: Vec) => (s.x - anchor.x) * dir.x + (s.y - anchor.y) * dir.y;
  return [...sols].sort((p, q) => proj(p) - proj(q));
}

export function otherCrossing(sols: Vec[], placed: Vec[], avoid: Vec | undefined, branch: number): Vec | null {
  const fresh = sols.filter((s) => !placed.some((q) => dist(s, q) < LEN_EPS));
  if (!fresh.length) return null;
  if (!avoid) return fresh[branch % fresh.length];
  return fresh.reduce((far, s) => (dist(s, avoid) > dist(far, avoid) ? s : far), fresh[0]);
}

/** Resolve one point: a Vec, 'pending' (deps not ready yet), or an error string. */
function tryEval(
  p: GeoPoint,
  pos: Map<Id, Vec>,
  lines: Map<Id, ResolvedLine>,
  circles: Map<Id, ResolvedCircle>,
): Vec | 'pending' | string {
  switch (p.kind) {
    case 'free-point':
      return { x: p.x, y: p.y };

    case 'on-segment': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      return add(a, scale(sub(b, a), p.t));
    }

    case 'derived': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      const perp = scale(rot90(sub(b, a)), p.flip ? -1 : 1); // ±R90(B − A)
      return p.rule === 'square-c' ? add(b, perp) : add(a, perp);
    }

    case 'intersection': {
      const c1 = pos.get(p.center1);
      const c2 = pos.get(p.center2);
      if (!c1 || !c2) return 'pending';
      const sols = circleCircleIntersect(c1, p.radius1, c2, p.radius2);
      if (sols.length === 0) {
        return `cannot construct ${p.id}: the two distance circles do not intersect`;
      }
      return sols[p.branch % sols.length];
    }

    case 'parallelogram-vertex': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      const c = pos.get(p.c);
      if (!a || !b || !c) return 'pending';
      return { x: a.x + c.x - b.x, y: a.y + c.y - b.y }; // a + c − b
    }

    case 'line-line-intersection': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      const c = pos.get(p.c);
      const d = pos.get(p.d);
      if (!a || !b || !c || !d) return 'pending';
      const hit = lineLineIntersect(a, b, c, d);
      if (!hit) return `cannot construct ${p.id}: lines ${p.a}${p.b} and ${p.c}${p.d} are parallel`;
      return hit;
    }

    case 'perp-offset': {
      const anchor = pos.get(p.anchor);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!anchor || !from || !to) return 'pending';
      return add(anchor, scale(unit(rot90(sub(to, from))), p.flip ? -p.dist : p.dist)); // anchor ± n̂·dist
    }

    case 'rotated': {
      const pivot = pos.get(p.pivot);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!pivot || !from || !to) return 'pending';
      return add(pivot, scale(rotate(sub(to, from), p.flip ? -p.angleDeg : p.angleDeg), p.scale)); // pivot + s·Rot(±θ)(to−from)
    }

    case 'scaled-offset': {
      const anchor = pos.get(p.anchor);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!anchor || !from || !to) return 'pending';
      return add(anchor, scale(sub(to, from), p.k)); // anchor + k·(to−from)
    }

    case 'on-segment-solved': {
      const ts = solvedOnSegmentCandidates(p, pos);
      if (ts === 'pending') return 'pending';
      if (ts.length === 0) {
        return `cannot place ${p.id} on segment ${p.a}${p.b} so that ${describeConstraint(p.constraint)}`;
      }
      const t = ts[p.branch % ts.length];
      const a = pos.get(p.a)!;
      const b = pos.get(p.b)!;
      return add(a, scale(sub(b, a), t));
    }

    case 'line-intersection': {
      const l1 = lines.get(p.line1);
      const l2 = lines.get(p.line2);
      if (!l1 || !l2) return 'pending';
      const hit = lineLineIntersect(l1.anchor, add(l1.anchor, l1.dir), l2.anchor, add(l2.anchor, l2.dir));
      if (!hit) return `cannot construct ${p.id}: lines ${p.line1} and ${p.line2} are parallel`;
      return hit;
    }

    case 'on-line': {
      const l = lines.get(p.line);
      if (!l) return 'pending';
      return add(l.anchor, scale(l.dir, p.offset)); // anchor + offset·dir (dir is unit)
    }

    case 'foot': {
      const from = pos.get(p.from);
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!from || !a || !b) return 'pending';
      if (len(sub(b, a)) < 1e-9) return `cannot drop a perpendicular to ${p.a}${p.b}: they coincide`;
      return footOnLine(from, a, b);
    }

    case 'midpoint': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      return scale(add(a, b), 0.5);
    }

    case 'circumcenter': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      const c = pos.get(p.c);
      if (!a || !b || !c) return 'pending';
      const o = circumcenter(a, b, c);
      if (!o) return `cannot construct ${p.id}: ${p.a}, ${p.b}, ${p.c} are collinear (no circumscribed circle)`;
      return o;
    }

    case 'on-circle': {
      const c = circles.get(p.circle);
      if (!c) return 'pending';
      if (p.between) {
        // A free point ON the arc between two points (ADR-042): theta is a fraction in [−1,1] of the
        // (minor) half-arc from its midpoint, so F always sits on arc from→to (never the far arc).
        const from = pos.get(p.between[0]);
        const to = pos.get(p.between[1]);
        if (!from || !to) return 'pending';
        const u1 = unit(sub(from, c.center));
        const u2 = unit(sub(to, c.center));
        let bis = add(u1, u2); // points to the midpoint of the minor arc from→to
        if (len(bis) < 1e-9) bis = rot90(u1); // antipodal endpoints → arc midpoint is perpendicular
        const baseAng = Math.atan2(bis.y, bis.x);
        const half = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))) / 2; // half the arc
        const frac = Math.max(-1, Math.min(1, p.theta));
        const ang = baseAng + frac * 0.92 * half; // 0.92 keeps F strictly inside (never onto from/to)
        return add(c.center, { x: c.r * Math.cos(ang), y: c.r * Math.sin(ang) });
      }
      return add(c.center, { x: c.r * Math.cos(p.theta), y: c.r * Math.sin(p.theta) });
    }

    case 'antipode': {
      const c = circles.get(p.circle);
      const of = pos.get(p.of);
      if (!c || !of) return 'pending';
      return sub(scale(c.center, 2), of); // 2·centre − of
    }

    case 'arc-midpoint': {
      const c = circles.get(p.circle);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!c || !from || !to) return 'pending';
      const u1 = unit(sub(from, c.center));
      const u2 = unit(sub(to, c.center));
      let bis = add(u1, u2); // points to the midpoint of the arc between from→to
      if (len(bis) < 1e-9) bis = rot90(u1); // from/to antipodal → arc midpoint is perpendicular
      const dir = unit(bis);
      const sign = p.branch % 2 === 1 ? -1 : 1; // the other arc's midpoint is antipodal
      return add(c.center, scale(dir, sign * c.r));
    }

    case 'line-circle': {
      const l = lines.get(p.line);
      const c = circles.get(p.circle);
      if (!l || !c) return 'pending';
      const sols = lineCircleIntersect(l.anchor, l.dir, c.center, c.r);
      if (sols.length === 0) return `cannot construct ${p.id}: line ${p.line} does not meet circle ${p.circle}`;
      // "The OTHER crossing" (`avoid` set): the secant runs through a KNOWN on-circle point (a line
      // endpoint), so one root is that point — keep the genuinely new one (see {@link otherCrossing}).
      if (p.avoid) {
        const kept = otherCrossing(sols, [...pos.values()], pos.get(p.avoid), p.branch);
        if (kept) return kept;
        // No NEW crossing: the line meets the circle ONLY at points already placed — it is tangent at
        // `avoid` (touches just there), or both its named ends are on the circle (a chord). Report it
        // clearly instead of collapsing the new point onto `avoid` (the tangent-extension crash).
        return `cannot place ${p.id}: line ${p.line} is tangent to circle ${p.circle} at ${p.avoid} — it has no second crossing to extend onto`;
      }
      // No `avoid`: `branch` selects a stable geometric SIDE along the line's direction (R8), so cycling
      // and re-evaluation pick the same physical crossing as the figure flexes (the raw root order flips).
      return bySide(sols, l.anchor, l.dir)[p.branch % sols.length];
    }

    case 'circle-circle': {
      const c1 = circles.get(p.circle1);
      const c2 = circles.get(p.circle2);
      if (!c1 || !c2) return 'pending';
      const sols = circleCircleIntersect(c1.center, c1.r, c2.center, c2.r);
      if (sols.length === 0) return `cannot construct ${p.id}: circles ${p.circle1} and ${p.circle2} do not meet`;
      // "The second intersection" (`avoid` set, the other crossing already placed): keep the root that
      // isn't it — geometric, so it doesn't flip with branch order as the circles move (R8).
      if (p.avoid) {
        const kept = otherCrossing(sols, [...pos.values()], pos.get(p.avoid), p.branch);
        if (kept) return kept;
        return `cannot construct ${p.id}: circles ${p.circle1} and ${p.circle2} meet only at ${p.avoid} (they are tangent)`;
      }
      return sols[p.branch % sols.length];
    }

    case 'radial-toward': {
      const c = circles.get(p.circle);
      const t = pos.get(p.toward);
      if (!c || !t) return 'pending';
      const d = sub(t, c.center);
      if (len(d) < 1e-9) return `cannot place ${p.id}: ${p.toward} is at the centre of ${p.circle}`;
      return add(c.center, scale(unit(d), c.r)); // on the circle, toward `toward`
    }
  }
}
