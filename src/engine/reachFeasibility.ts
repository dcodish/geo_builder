/**
 * A STATED DISTANCE A RIDING POINT CANNOT REACH (#2797, [ADR-817](../../docs/06-decisions.md#adr-817)) — a stage-0
 * prover in the family of ADR-417's metric, ADR-538's angle-sum and ADR-602's flat provers, with the same one-way
 * soundness: a violation PROVES impossibility; passing proves nothing and the ordinary ladder still runs.
 *
 * Class. A point whose givens leave it ONE free parameter rides a fixed locus of the rest of the figure: a stated
 * angle at a fixed vertex with one fixed arm puts it on a RAY («∠CDE = 100°» with |DE| unstated — E rides the ray
 * from D), a stated distance from a fixed point puts it on a CIRCLE. Its distance to any other fixed point is then
 * bounded: at least the point-to-ray distance, or between the two point-to-circle distances. A stated distance
 * outside that range holds in NO configuration. The flex probe (`constraintIsPending`, ADR-104) asks whether the
 * residual MOVES — and on such a rider it does, because the free parameter moves it — so once the driven solver
 * sampled the rider (#2797's LM rescue rung, ADR-816) «… ∠CDE = 100° · EA = 1» read as "waiting for givens", where
 * E can come no closer to A than 2.11. The metric prover cannot see it: |DE| is not pinned, so there is no pinned
 * path from E to A.
 *
 * How it decides — structurally, never from where a seed draws the figure:
 *  1. the RIGID FRAME: from one pinned distance (its two ends placed in a fixed gauge), every point the pinned
 *     distances and stated angles FIX relative to the placed ones is placed, in EVERY configuration those givens
 *     allow — two circles (two distances to placed points), a side and the angle at a placed vertex (SAS), two
 *     angles at placed vertices (ASA). Each rule enumerates all of its solutions (a reflection is a branch), and a
 *     branch the frame's other givens contradict is dropped (it is not a configuration). A degenerate step (a
 *     zero-length arm, parallel rays) places nothing: an infinite family is never enumerated;
 *  2. the RIDERS: an unplaced point with a stated angle at a placed vertex whose other arm is placed (both rays),
 *     or a stated distance from a placed point (the circle);
 *  3. the REACH: a stated distance from a rider to a placed point outside the rider's range — in EVERY surviving
 *     branch — is impossible.
 *
 * Every reading is a subset of the figure's givens, so the bound is sound for any figure that holds them all: more
 * givens only remove configurations, and a later line can never make the distance reachable. Only stated
 * `distance`s and stated angle wedges ({@link pinnedAngleWedges}: a value or a corner ⟂; never a noun's default
 * seat, never an arc measure) are read. A frame whose every branch is contradicted proves nothing here (that is the
 * ladder's own over-constraint), so the verdict needs at least one consistent configuration that still misses.
 *
 * Not the angle twin: a rider closed by an ANGLE («∠DEA = 20°» out of reach) is not read; the general cure — a
 * flex probe that asks "reaches zero" — is #2763's (escalation on #2797, option (b)).
 */
import { pinnedAngleWedges } from './metricFeasibility';
import type { Constraint, Id, Vec } from './types';

export interface ReachImpossibility {
  /** the riding point and the placed point of the stated distance that cannot hold */
  p: Id;
  q: Id;
  value: number;
  /** the closest and farthest the rider can come to q over every configuration (hi = Infinity on a ray) */
  lo: number;
  hi: number;
}

/** Relative slack of the numerics (a zero-length arm, coincident centres, a tangent pair of circles). */
const REL_TOL = 1e-6;
/**
 * The verdict's slack, relative to the figure's largest pinned distance: a reach within it of the bound is never
 * called impossible (the flat or degenerate limit is a real configuration, and the solver accepts a given within its
 * own tolerance, 2e-4 of a length — this sits 5× outside it).
 */
const REACH_SLACK = 1e-3;
/** A frame branch is dropped only when a given misses by more than the solver's own acceptance (a length 2e-4
 *  relative, an angle ANGLE_EPS = 0.5°) with margin — dropping a configuration the solver would accept is unsound. */
const PRUNE_LEN = 1e-3;
const PRUNE_DEG = 1;
/** More configurations than this and the frame is not enumerated (proves nothing) — never a partial search. */
const MAX_BRANCHES = 256;
const RAD = Math.PI / 180;

type Frame = Map<Id, Vec>;
interface Dist { a: Id; b: Id; value: number }
interface Wedge { v: Id; p: Id; q: Id; deg: number }

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Vec): number => Math.hypot(a.x, a.y);
const rot = (v: Vec, t: number): Vec => ({ x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) });
const at = (o: Vec, d: Vec, t: number): Vec => ({ x: o.x + d.x * t, y: o.y + d.y * t });
/** The unsigned angle at v between v→a and v→b, in degrees (NaN on a zero-length arm). */
const angleAt = (v: Vec, a: Vec, b: Vec): number => {
  const u = sub(a, v);
  const w = sub(b, v);
  const n = len(u) * len(w);
  if (!(n > 0)) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / n))) / RAD;
};
/** The two unit directions from v at `deg` to the arm v→u (one per side), or null on a zero-length arm. */
function armRays(v: Vec, u: Vec, deg: number, eps: number): Vec[] | null {
  const d = sub(u, v);
  const n = len(d);
  if (!(n > eps)) return null;
  const e = { x: d.x / n, y: d.y / n };
  return [rot(e, deg * RAD), rot(e, -deg * RAD)];
}

/**
 * The first stated distance from a one-parameter rider to the rigid frame that no configuration reaches, or null.
 * `constraints` is every enforced statement (the stated list plus the driven ones), as the angle-sum prover reads.
 */
export function reachImpossibility(constraints: readonly Constraint[]): ReachImpossibility | null {
  const dists: Dist[] = [];
  for (const con of constraints) {
    if (con.type !== 'distance' || !Number.isFinite(con.value) || con.value <= 0 || con.a === con.b) continue;
    dists.push({ a: con.a, b: con.b, value: con.value });
  }
  if (dists.length < 2) return null;
  const wedges: Wedge[] = pinnedAngleWedges(constraints).filter((w) => w.v !== w.p && w.v !== w.q && w.p !== w.q && w.deg >= 0 && w.deg <= 180);
  const scale = Math.max(...dists.map((d) => d.value));
  const eps = REL_TOL * scale;
  // Each stated distance is judged against the frame the OTHER givens build: the target never places its own rider
  // (it would meet itself, and a miss there is a contradiction among the frame's givens, the ladder's verdict).
  for (const target of dists) {
    const others = dists.filter((d) => d !== target);
    const tried = new Set<string>();
    for (const root of others) {
      if (tried.has(root.a) && tried.has(root.b)) continue; // this root's cluster was already enumerated
      const frames = rigidFrames(root, others, wedges, eps);
      if (!frames || frames.length === 0) continue;
      for (const id of frames[0]!.keys()) tried.add(id);
      const hit = unreachable(frames, target, others, wedges, eps);
      if (hit) return hit;
    }
  }
  return null;
}

/** Every configuration of the rigid cluster grown from `root`, or null when it cannot be enumerated. */
function rigidFrames(root: Dist, dists: Dist[], wedges: Wedge[], eps: number): Frame[] | null {
  let frames: Frame[] = [new Map<Id, Vec>([[root.a, { x: 0, y: 0 }], [root.b, { x: root.value, y: 0 }]])];
  const placed = new Set<Id>([root.a, root.b]);
  const points = new Set<Id>();
  for (const d of dists) points.add(d.a).add(d.b);
  for (const w of wedges) points.add(w.v).add(w.p).add(w.q);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of points) {
      if (placed.has(p)) continue;
      const next = placePoint(p, frames, placed, dists, wedges, eps);
      if (!next) continue;
      placed.add(p);
      frames = next.filter((f) => frameConsistent(f, dists, wedges, eps));
      if (frames.length === 0) return frames; // the frame's givens contradict each other: the ladder's verdict, not this one
      if (frames.length > MAX_BRANCHES) return null;
      grew = true;
    }
  }
  return frames;
}

/** Place p in every frame by the first structural rule that fixes it (null: no rule applies, or one degenerates). */
function placePoint(p: Id, frames: Frame[], placed: Set<Id>, dists: Dist[], wedges: Wedge[], eps: number): Frame[] | null {
  const other = (d: Dist): Id => (d.a === p ? d.b : d.a);
  const toPlaced = dists.filter((d) => (d.a === p || d.b === p) && placed.has(other(d)));
  /** a stated angle at a PLACED vertex whose other arm is placed and whose free arm ends at p */
  const rays = wedges
    .filter((w) => placed.has(w.v) && ((w.p === p && placed.has(w.q)) || (w.q === p && placed.has(w.p))))
    .map((w) => ({ v: w.v, u: w.p === p ? w.q : w.p, deg: w.deg }));
  const each = (fn: (f: Frame) => Vec[] | null): Frame[] | null => {
    const out: Frame[] = [];
    for (const f of frames) {
      const pts = fn(f);
      if (!pts) return null;
      for (const pt of pts) out.push(new Map(f).set(p, pt));
    }
    return out;
  };
  // SAS: a side from a placed vertex and the angle there — two points (one per side of the arm)
  for (const r of rays) {
    const side = toPlaced.find((d) => other(d) === r.v);
    if (!side) continue;
    return each((f) => armRays(f.get(r.v)!, f.get(r.u)!, r.deg, eps)?.map((dir) => at(f.get(r.v)!, dir, side.value)) ?? null);
  }
  // two circles about two distinct placed points
  if (toPlaced.length >= 2) {
    const [d1, d2] = [toPlaced[0]!, toPlaced.find((d) => other(d) !== other(toPlaced[0]!))];
    if (d2) return each((f) => circleMeet(f.get(other(d1))!, d1.value, f.get(other(d2))!, d2.value, eps));
  }
  // ASA: two rays from two distinct placed vertices
  const r2 = rays.find((r) => r.v !== rays[0]?.v);
  if (rays.length >= 2 && r2) {
    const r1 = rays[0]!;
    return each((f) => {
      const o1 = f.get(r1.v)!;
      const o2 = f.get(r2.v)!;
      const a = armRays(o1, f.get(r1.u)!, r1.deg, eps);
      const b = armRays(o2, f.get(r2.u)!, r2.deg, eps);
      if (!a || !b) return null;
      const out: Vec[] = [];
      for (const d1 of a)
        for (const d2 of b) {
          const det = d1.x * -d2.y - d1.y * -d2.x;
          if (Math.abs(det) < 1e-6) return null; // parallel rays: none or a whole family — never enumerated
          const w = sub(o2, o1);
          const t = (w.x * -d2.y - w.y * -d2.x) / det;
          const s = (d1.x * w.y - d1.y * w.x) / det;
          if (t >= -eps && s >= -eps) out.push(at(o1, d1, t));
        }
      return out;
    });
  }
  return null;
}

/** The meets of two circles (0, 1 or 2 points); null when the centres coincide (none, or the whole circle). */
function circleMeet(c1: Vec, r1: number, c2: Vec, r2: number, eps: number): Vec[] | null {
  const d = len(sub(c2, c1));
  if (!(d > eps)) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  let h2 = r1 * r1 - a * a;
  if (h2 < 0) {
    if (h2 < -2 * eps * Math.max(r1, r2, d)) return []; // the circles miss: no configuration in this branch
    h2 = 0;
  }
  const e = { x: (c2.x - c1.x) / d, y: (c2.y - c1.y) / d };
  const m = at(c1, e, a);
  const h = Math.sqrt(h2);
  const n = { x: -e.y, y: e.x };
  return h === 0 ? [m] : [at(m, n, h), at(m, n, -h)];
}

/** Do the frame's givens among its placed points hold here (a branch they contradict is no configuration)? */
function frameConsistent(f: Frame, dists: Dist[], wedges: Wedge[], eps: number): boolean {
  for (const d of dists) {
    const a = f.get(d.a);
    const b = f.get(d.b);
    if (a && b && Math.abs(len(sub(a, b)) - d.value) > Math.max(10 * eps, PRUNE_LEN * d.value)) return false;
  }
  for (const w of wedges) {
    const v = f.get(w.v);
    const p = f.get(w.p);
    const q = f.get(w.q);
    if (!v || !p || !q) continue;
    const got = angleAt(v, p, q);
    if (Number.isFinite(got) && Math.abs(got - w.deg) > PRUNE_DEG) return false;
  }
  return true;
}

/** The stated distance `target` from an unplaced rider to a placed point, when every frame misses it; else null. */
function unreachable(frames: Frame[], target: Dist, dists: Dist[], wedges: Wedge[], eps: number): ReachImpossibility | null {
  const placed = frames[0]!;
  for (const [p, q] of [[target.a, target.b], [target.b, target.a]] as const) {
    if (placed.has(p) || !placed.has(q)) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let reachable = false;
    for (const f of frames) {
      const range = riderRange(p, f.get(q)!, f, dists, wedges, eps);
      if (!range) {
        reachable = true; // no locus bounds p here — nothing proven
        break;
      }
      lo = Math.min(lo, range.lo);
      hi = Math.max(hi, range.hi);
      if (range.within(target.value)) {
        reachable = true;
        break;
      }
    }
    if (!reachable) return { p, q, value: target.value, lo, hi };
  }
  return null;
}

/**
 * The reach of rider p from the placed point q in ONE frame — the intersection of what each of p's loci allows
 * (each locus alone is a sound bound, so a value one of them excludes is excluded) — or null when p rides none.
 */
function riderRange(
  p: Id,
  q: Vec,
  f: Frame,
  dists: Dist[],
  wedges: Wedge[],
  eps: number,
): { lo: number; hi: number; within: (v: number) => boolean } | null {
  const loci: { lo: number; hi: number; within: (v: number) => boolean }[] = [];
  const slack = (v: number): number => REACH_SLACK * Math.max(eps / REL_TOL, v);
  for (const w of wedges) {
    const u = w.p === p ? w.q : w.q === p ? w.p : null;
    if (u === null) continue;
    const v = f.get(w.v);
    const uu = f.get(u);
    if (!v || !uu) continue;
    const dirs = armRays(v, uu, w.deg, eps);
    if (!dirs) continue;
    // the closed ray from v (its apex included: the bound only widens), one per side of the arm
    const lows = dirs.map((d) => {
      const t = Math.max(0, (q.x - v.x) * d.x + (q.y - v.y) * d.y);
      return len(sub(q, at(v, d, t)));
    });
    const lo = Math.min(...lows);
    loci.push({ lo, hi: Infinity, within: (x) => lows.some((l) => x >= l - slack(x)) });
  }
  for (const d of dists) {
    const c = d.a === p ? d.b : d.b === p ? d.a : null;
    if (c === null) continue;
    const cv = f.get(c);
    if (!cv) continue;
    const k = len(sub(q, cv));
    const lo = Math.abs(k - d.value);
    const hi = k + d.value;
    loci.push({ lo, hi, within: (x) => x >= lo - slack(x) && x <= hi + slack(x) });
  }
  if (loci.length === 0) return null;
  return {
    lo: Math.max(...loci.map((l) => l.lo)),
    hi: Math.min(...loci.map((l) => l.hi)),
    within: (x) => loci.every((l) => l.within(x)),
  };
}
