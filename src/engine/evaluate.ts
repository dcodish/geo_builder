/**
 * evaluate: compute positions for every point by resolving the dependency
 * graph in topological order (a fixed-point sweep), then check constraints.
 * Returns positions, or an error (unresolvable deps, impossible construction,
 * non-finite coords, or a contradicted constraint = over-constraint, FR-EN-8).
 */

import type { Circle, Constraint, Construction, GeoObject, GeoPoint, Id, Line, Vec } from './types';
import { LEN_EPS, isGeoPoint } from './types';
import {
  add,
  circleCircleIntersect,
  circumcenter,
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
import { constraintRefs, constraintScale, describeConstraint, residual, residualTolerance, solvedOnSegmentCandidates } from './solve';

/** A resolved line: a point on it (`anchor`) and a unit direction (`dir`). */
interface ResolvedLine {
  anchor: Vec;
  dir: Vec;
}

/** A resolved circle: its centre position and radius. */
interface ResolvedCircle {
  center: Vec;
  r: number;
}

export interface EvalOk {
  ok: true;
  positions: Map<Id, Vec>;
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
function resolveDriven(c: Construction): Construction {
  // Free vertices driven by a constraint (2 DOF each) take a separate, regularised
  // path — they have no bounded parameter range, and a single equation leaves a
  // solution manifold, so we pick the configuration nearest the current one (ADR-028).
  // A driveable SHAPE SCALAR (perp-offset dist / rotated angle / scaled-offset k) present ⇒ the
  // generalized solver, which mixes it with any free-vertex / parametric carriers (ADR-033) — so a
  // rectangle's width (free vertex) and height (perp-offset) solve together.
  const shapeCarriers = c.objects.filter(
    (o) => (o.kind === 'perp-offset' || o.kind === 'rotated' || o.kind === 'scaled-offset') && o.solve !== undefined,
  );
  const freeCarriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'free-point' }> => o.kind === 'free-point' && o.solve !== undefined,
  );
  // An on-line marker's offset is UNBOUNDED (it slides along an infinite line), so it
  // can't use the bracketed range-solve below — route it (and anything it must solve
  // jointly with) through the seed/scale optimizer (ADR-036).
  const onLineCarriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'on-line' }> => o.kind === 'on-line' && o.solve !== undefined,
  );
  if (shapeCarriers.length > 0 || onLineCarriers.length > 0) {
    const paramCarriers = c.objects.filter((o) => (o.kind === 'on-segment' || o.kind === 'on-circle') && o.solve !== undefined);
    return resolveMixedCarriers(c, [...freeCarriers, ...paramCarriers, ...shapeCarriers, ...onLineCarriers]);
  }
  if (freeCarriers.length > 0) return resolveFreeDriven(c, freeCarriers);

  const carriers = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'on-circle' | 'on-segment' }> =>
      (o.kind === 'on-circle' || o.kind === 'on-segment') && o.solve !== undefined,
  );
  if (carriers.length === 0) return c;
  const range = (o: { kind: string }): [number, number] => (o.kind === 'on-circle' ? [0, 2 * Math.PI] : [0, 1]);

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
    return withParam(c, carrier.id, roots[dir.branch % roots.length]);
  }

  // SEVERAL coupled DOFs (e.g. "C = midpoint of OB" drives E while "|ED| = 7"
  // drives D, and D's chord length depends on where E lands): coordinate descent
  // on the joint squared residual, each DOF moved to the global minimum along it
  // (so all branches are considered) and iterated until it converges.
  // The distinct constraints the carriers drive (a constraint shared by several
  // carriers — e.g. recruited DOFs all driving "DE=DF" — must count once, so a
  // second constraint on the same DOFs, like "AB is a diameter", isn't outweighed).
  const seen = new Set<string>();
  const cons = carriers
    .map((cr) => cr.solve!.constraint)
    .filter((k) => {
      const key = JSON.stringify(k);
      return seen.has(key) ? false : (seen.add(key), true);
    });
  const ids = carriers.map((cr) => cr.id);
  const totalSq = (x: number[]): number => {
    const p = new Map<Id, number>(ids.map((id, i) => [id, x[i]]));
    const r = evaluateCore(setParams(c, p), { skipConstraints: true });
    if (!r.ok) return Infinity;
    let s = 0;
    for (const con of cons) {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return Infinity;
      const v = residual(con, (id) => r.positions.get(id)!);
      s += v * v;
    }
    return s;
  };
  // 1) coordinate descent for a globally-informed start (grid argMin per DOF
  //    considers all branches); 2) Nelder–Mead to converge out of the valley
  //    coordinate descent stalls in (coupled residuals share a narrow trough).
  const x = carriers.map((cr) => (cr.kind === 'on-circle' ? cr.theta : cr.t));
  for (let iter = 0; iter < 12 && totalSq(x) > 1e-12; iter++) {
    let improved = false;
    for (let i = 0; i < carriers.length; i++) {
      const [lo, hi] = range(carriers[i]);
      const before = totalSq(x);
      const v = argMin((t) => totalSq(x.map((xj, j) => (j === i ? t : xj))), lo, hi);
      const trial = x.slice();
      trial[i] = v;
      if (totalSq(trial) < before - 1e-12) {
        x[i] = v;
        improved = true;
      }
    }
    if (!improved) break;
  }
  const best = nelderMead(totalSq, x);
  return setParams(c, new Map<Id, number>(ids.map((id, i) => [id, best[i]])));
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
    .map((cr) => cr.solve!.constraint)
    .filter((k) => (seen.has(JSON.stringify(k)) ? false : (seen.add(JSON.stringify(k)), true)));
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
  const resid = (x: number[]): number => {
    const r = evaluateCore(place(x), { skipConstraints: true });
    if (!r.ok) return Infinity;
    let s = 0;
    for (const con of cons) {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return Infinity;
      const v = residual(con, (id) => r.positions.get(id)!);
      s += v * v;
    }
    return s;
  };
  const lambda = 1e-3 / (span * span); // scale-free; only breaks ties on the solution manifold
  const regCost = (x: number[]): number => {
    const base = resid(x);
    if (!isFinite(base)) return Infinity;
    let s = base;
    for (let i = 0; i < x.length; i++) s += lambda * (x[i] - seed[i]) * (x[i] - seed[i]);
    return s;
  };
  // 1) Pick the nearest basin: regularised search from the seed and a few cardinal
  //    restarts (so a vertex on the far side of a solution circle isn't missed).
  const offsets = [1, -1, 0.5].flatMap((d) => [
    seed.map((v, i) => (i % 2 === 0 ? v + d * span : v)),
    seed.map((v, i) => (i % 2 === 1 ? v + d * span : v)),
  ]);
  let best = seed;
  let bestReg = regCost(seed);
  for (const start of [seed, ...offsets]) {
    const x = nelderMead(regCost, start, 400, span * 0.2);
    const fx = regCost(x);
    if (fx < bestReg) {
      bestReg = fx;
      best = x;
    }
  }
  // 2) Polish: drop the regulariser and minimise the pure residual from the chosen
  //    basin, with shrinking simplex steps, so the result lands ON the constraint
  //    (the λ term above pulls slightly off it; the check tolerance is 1e-6).
  for (const st of [span * 0.05, span * 0.005]) best = nelderMead(resid, best, 400, st);
  // 3) Accept only a genuine, non-degenerate solution. A constraint like AB∥BC on a
  //    figure that can't satisfy it (or |AB|=k|CD| with no valid config) is driven
  //    toward collapsing a segment to ~0 — a cheat that drives the residual down. If
  //    the best is still off the constraint OR has collapsed a referenced segment,
  //    keep the ORIGINAL figure so the honest over-constraint check reports it.
  const r = evaluateCore(place(best), { skipConstraints: true });
  const refIds = [...new Set(cons.flatMap((con) => constraintRefs(con)))];
  const satisfied =
    r.ok &&
    cons.every((con) => {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return false;
      return Math.abs(residual(con, (id) => r.positions.get(id)!)) <= residualTolerance(con, constraintScale(con, (id) => r.positions.get(id)!));
    }) &&
    !degenerateSpread(refIds.map((id) => r.positions.get(id)).filter((p): p is Vec => !!p), span);
  return satisfied ? place(best) : place(seed);
}

/** True if any two of the constraint's referenced points have collapsed together (a near-degenerate "solution" the solver cheated to). */
function degenerateSpread(pts: Vec[], span: number): boolean {
  const eps = 1e-3 * span;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < eps) return true;
  return false;
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
        case 'on-segment': return { ...o, t: v[0], solve: undefined };
        case 'on-circle': return { ...o, theta: v[0], solve: undefined };
        case 'perp-offset': return { ...o, dist: Math.max(v[0], 1e-3), solve: undefined };
        case 'rotated': return { ...o, angleDeg: v[0], solve: undefined };
        case 'scaled-offset': return { ...o, k: Math.max(v[0], 1e-3), solve: undefined };
        case 'on-line': return { ...o, offset: v[0], solve: undefined };
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
  const span = Math.max(1, ...carriers.flatMap((o) => (o.kind === 'free-point' && o.solve ? [Math.abs(o.x), Math.abs(o.y)] : [])));
  const specs = carriers.map((o) => carrierSpec(o, span)).filter((s): s is CarrierSpec => s !== null);
  if (specs.length === 0) return c;
  // Distinct constraints (one shared by several carriers counts once).
  const seen = new Set<string>();
  const cons: Constraint[] = carriers
    .map((o) => (o as { solve?: { constraint: Constraint } }).solve!.constraint)
    .filter((k) => (seen.has(JSON.stringify(k)) ? false : (seen.add(JSON.stringify(k)), true)));
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
  const refIds = [...new Set(cons.flatMap((con) => constraintRefs(con)))];
  // The cost is the sum of squared RELATIVE residuals (each constraint's residual ÷ its own scale).
  // This is un-gameable by shrinking: a wrong ratio stays ~1% relative however small you make it, so
  // the solver can't "cheat" a length/ratio by collapsing the constrained part (and a collapse, scale→0,
  // blows the relative residual up). It also normalises constraints of different magnitudes against
  // each other so the joint solve doesn't favour the larger one. (ADR-033.)
  const cost = (u: number[]): number => {
    const r = evaluateCore(place(u), { skipConstraints: true });
    if (!r.ok) return Infinity;
    let s = 0;
    for (const con of cons) {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return Infinity;
      const get = (id: Id) => r.positions.get(id)!;
      const v = residual(con, get) / Math.max(constraintScale(con, get), 1e-9);
      s += v * v;
    }
    return s;
  };
  const lambda = 1e-3; // tiny tie-breaker toward the seed (normalised space)
  const regCost = (u: number[]): number => {
    const base = cost(u);
    if (!isFinite(base)) return Infinity;
    let s = base;
    for (let i = 0; i < u.length; i++) s += lambda * (u[i] - seedU[i]) * (u[i] - seedU[i]);
    return s;
  };
  // 1) Nearest basin: regularised search from the seed + cardinal restarts (each DOF pushed by a
  //    range of magnitudes in normalised units, so both a nearby and a far-off basin are tried).
  const restarts = [0.5, 1, -1, 2, -2].flatMap((d) => seedU.map((_, j) => seedU.map((v, i) => (i === j ? v + d : v))));
  let best = seedU;
  let bestReg = regCost(seedU);
  for (const start of [seedU, ...restarts]) {
    const x = nelderMead(regCost, start, 400, 0.3);
    const fx = regCost(x);
    if (fx < bestReg) {
      bestReg = fx;
      best = x;
    }
  }
  // 2) Polish on residual + degeneracy penalty (drop only the seed regulariser), shrinking the simplex
  //    through several decades so a coupled system lands tightly ON the constraints — and stays spread.
  for (const st of [0.1, 0.03, 0.01, 0.003, 0.001, 3e-4, 1e-4]) best = nelderMead(cost, best, 500, st);
  // 3) Accept only a genuine, non-degenerate solution; else keep the seed (honest over-constraint).
  const r = evaluateCore(place(best), { skipConstraints: true });
  const satisfied =
    r.ok &&
    cons.every((con) => {
      for (const id of constraintRefs(con)) if (!r.positions.has(id)) return false;
      return Math.abs(residual(con, (id) => r.positions.get(id)!)) <= residualTolerance(con, constraintScale(con, (id) => r.positions.get(id)!));
    }) &&
    !degenerateSpread(refIds.map((id) => r.positions.get(id)).filter((p): p is Vec => !!p), span);
  return satisfied ? place(best) : place(seedU);
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

/** Set several carriers' parameters at once (each driven param resolved to a value). */
function setParams(c: Construction, params: Map<Id, number>): Construction {
  return {
    ...c,
    objects: c.objects.map((o) => {
      if (!params.has(o.id)) return o;
      const v = params.get(o.id)!;
      if (o.kind === 'on-circle') return { ...o, theta: v, solve: undefined };
      if (o.kind === 'on-segment') return { ...o, t: v, solve: undefined };
      return o;
    }),
  };
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

/** Evaluate the construction: resolve any driven DOFs, then the constructive sweep + checks. */
export function evaluate(c: Construction): EvalResult {
  return evaluateCore(resolveDriven(c));
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
  if (opts?.skipConstraints) return { ok: true, positions: pos };

  // No two distinct points may share a location — that is a degenerate figure
  // (two labels on one spot) — EXCEPT a pair the construction intends to coincide
  // (a `coincide` constraint, ADR-028): their meeting is the goal, not an error.
  const intended = (idA: Id, idB: Id): boolean =>
    c.constraints.some((k) => k.type === 'coincide' && ((k.p === idA && k.q === idB) || (k.p === idB && k.q === idA)));
  const placed = [...pos.entries()];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [idA, a] = placed[i];
      const [idB, b] = placed[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < LEN_EPS && !intended(idA, idB)) {
        return { ok: false, error: `${idA} and ${idB} would be at the same point`, coincide: true };
      }
    }
  }

  for (const con of c.constraints) {
    for (const id of constraintRefs(con)) {
      if (!pos.get(id)) return { ok: false, error: `${describeConstraint(con)} references an unknown point` };
    }
    const get = (id: Id) => pos.get(id)!;
    if (Math.abs(residual(con, get)) > residualTolerance(con, constraintScale(con, get))) {
      return { ok: false, error: `over-constrained: ${describeConstraint(con)} cannot hold` };
    }
  }

  return { ok: true, positions: pos };
}

/** Resolve one circle to its centre and radius: a {@link ResolvedCircle}, 'pending', or an error string. */
function resolveCircle(c: Circle, pos: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): ResolvedCircle | 'pending' | string {
  const center = pos.get(c.center);
  if (!center) return 'pending';
  if (c.radius.via === 'length') {
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
function resolveLine(l: Line, pos: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): ResolvedLine | 'pending' | string {
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
      return sols[p.branch % sols.length];
    }

    case 'circle-circle': {
      const c1 = circles.get(p.circle1);
      const c2 = circles.get(p.circle2);
      if (!c1 || !c2) return 'pending';
      const sols = circleCircleIntersect(c1.center, c1.r, c2.center, c2.r);
      if (sols.length === 0) return `cannot construct ${p.id}: circles ${p.circle1} and ${p.circle2} do not meet`;
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
