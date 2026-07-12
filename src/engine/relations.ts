/**
 * Ground-truth relations layer — the engine half of "view relations" (FR-RV / [ADR-134](docs/06-decisions.md#adr-134)).
 *
 * A relation is a GROUND TRUTH iff it holds in EVERY valid drawing of the figure, not just the one on
 * screen. So we SAMPLE the figure across its free DOFs (the same `applySeed` + `evaluate` the "show another
 * configuration" feature uses) and keep only what is invariant across all samples — a relation forced by the
 * givens, never a coincidence of the current drawing. This is the engine-level meaning of "definitive".
 *
 * Equality WITHIN one sample is automatically scale-correct (both objects share that sample's frame); across
 * samples we require it every time. So equal-sides / equal-angles are detected even though the figure floats
 * up to similarity (it never needs an absolute scale). Absolute values are NOT computed here (a later slice).
 *
 * The OBJECT UNIVERSE is "what appears" (FR-RV-6, runtime-conscious): segments are the figure's edges
 * (`pointNeighbors` = segment + polygon edges); angles are at real vertices between two such edges. Pairwise
 * over that universe — not all point pairs/triples — so the cost is bounded.
 *
 * Pure and deterministic (seeds 0..N-1): a read-only consumer of the engine, no engine state is mutated.
 */

import type { Construction, GeoObject, Id, LineSpec, Vec } from './types';
import { isGeoPoint } from './types';
import { evaluate } from './evaluate';
import { applySeed, freeDofCount } from './sample';
import { pointNeighbors } from './step';
import { dist, sub, len } from './geometry';

/** Ids that are NOT part of the student-facing figure, so they must never appear in a detected relation,
 *  split, angle, or shape — the detection universe is "what the student sees" (FR-RV-6). Two families:
 *  `~`-prefixed HIDDEN scaffolding (the Thales auxiliary midpoint `~tanmid-…`, touch witnesses — never
 *  rendered at all), and `@`-prefixed ANONYMOUS PROMOTABLE points ([ADR-297](docs/06-decisions.md#adr-297)
 *  / #32 — a decomposition's touch/tangency point the student didn't name; drawn as a clickable dot but
 *  unnamed, so not yet a relation subject until promoted to a letter). One predicate, used wherever the
 *  detection universe is built ([ADR-295](docs/06-decisions.md#adr-295)). */
export const isScaffoldId = (id: Id): boolean => id.startsWith('~') || id.startsWith('@');

/**
 * GEOMETRIC segment splitting — every point that lies ON a drawn carrier, connected to the carrier's other
 * on-points. This REPLACES the old construction-kind whitelist (`onHostEdges`: on-segment/midpoint/foot/
 * onSeg-intersection) with the principle "**if two nodes have a drawn line between them, they are connected**"
 * ([ADR-167](docs/06-decisions.md#adr-167)). A *carrier* is any drawn 1-D primitive with two endpoint ids —
 * a `segment` or a polygon edge. A point counts as ON a carrier when it is COLLINEAR with the carrier in
 * EVERY sample (a forced fact, so not a coincidence of one drawing) AND lands within the drawn span in at
 * least one valid config (a genuine sub-segment, not a pure extension). Whether the resulting cycle is a
 * FORCED shape is decided downstream by the "holds in every sample" classifier — this only builds the
 * topological edge set. A membership is kept **regardless of how the point was defined**: an intersection (onSeg or not), a
 * foot, a midpoint, a `set-line` collinear point, or a purely emergent coincidence (a rectangle's diagonals
 * bisecting at one point) all split the carrier they land on — no per-kind registration, so a new construct
 * never needs adding here again. Each carrier emits every pair among {its endpoints} ∪ {its interior points},
 * so BOTH the whole segment and every sub-segment (`E–G`, `G–C` for `G` on `EC`) become first-class edges.
 * Used for the segment universe AND the angle graph; at a shared endpoint the collinear rays merge, so no
 * spurious angle appears there — only the genuine angles AT the interior point.
 */
export function collinearSplits(c: Construction, samples: Map<Id, Vec>[]): [Id, Id][] {
  if (samples.length === 0) return [];
  const carriers: [Id, Id][] = [];
  for (const o of c.objects) {
    if (o.kind === 'segment') carriers.push([o.a, o.b]);
    else if (o.kind === 'polygon') for (let i = 0; i < o.vertices.length; i++) carriers.push([o.vertices[i], o.vertices[(i + 1) % o.vertices.length]]);
  }
  const pts = c.objects.filter(isGeoPoint).map((o) => o.id);
  const tolT = 1e-4; // projection parameter this far inside (0,1) counts as interior (not an endpoint)
  const tolPerp = 1e-4; // perpendicular offset, relative to the carrier length, this small counts as "on the line"
  const out: [Id, Id][] = [];
  for (const [a, b] of carriers) {
    const members: Id[] = [a, b];
    for (const p of pts) {
      if (p === a || p === b) continue;
      // A point splits the carrier iff it is COLLINEAR (on the infinite line) in EVERY sample — that is
      // FORCED by the givens, so it can't be a coincidence of one drawing — AND lands WITHIN the drawn span
      // in at least one valid config (so it's a genuine sub-segment, not a pure-extension phantom). The
      // within-span part is deliberately NOT required in every sample: a segment-meet crossing G can sit
      // beyond an endpoint in the mirror configs the sampler also visits (`t>1`) while still being a real
      // interior split in the requirement-satisfying config; whether the resulting cycle is a FORCED shape
      // is then decided downstream by the "holds in every sample" classifier, not here (ADR-167).
      let collinearAll = true;
      let withinSome = false;
      for (let s = 0; s < samples.length; s++) {
        const va = samples[s].get(a), vb = samples[s].get(b), vp = samples[s].get(p);
        if (!va || !vb || !vp) { collinearAll = false; break; }
        const dx = vb.x - va.x, dy = vb.y - va.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < EPS) { collinearAll = false; break; }
        const perp = Math.abs((vp.x - va.x) * dy - (vp.y - va.y) * dx) / Math.sqrt(len2);
        if (perp > tolPerp * Math.sqrt(len2)) { collinearAll = false; break; }
        const t = ((vp.x - va.x) * dx + (vp.y - va.y) * dy) / len2;
        if (t > tolT && t < 1 - tolT) withinSome = true;
      }
      if (collinearAll && withinSome) members.push(p);
    }
    if (members.length <= 2) continue; // no interior point — the whole edge alone is covered by `pointNeighbors`
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) out.push([members[i], members[j]]);
  }
  return out;
}

/**
 * GEOMETRIC segment MERGING — the DUAL of {@link collinearSplits}. Where `collinearSplits` breaks one drawn
 * carrier at an interior point (so a sub-segment `E–D` becomes an edge), this joins TWO+ collinear drawn
 * segments that meet end-to-end into the through-edge spanning them. A point `D` on the straight line between
 * `C` and `E` — with `C–D` and `D–E` both drawn (a polygon edge `CD` + a segment `DE`, say) — makes `C–E` a
 * segment the student visibly sees as one straight line, even though no single object spans it. Without it a
 * polygon whose SIDE has a point sitting on it is never found: the trapezoid `ABCE` (a parallelogram `ABCD`
 * with `CD` extended to `E`, so `AB ∥ CE`) has side `C–E` broken by `D`, so `C` and `E` are not adjacent and
 * the 4-cycle can't be enumerated — the operator's "there is also a trapezoid ABCE" miss.
 *
 * `D` must be STRICTLY BETWEEN `C` and `E` and the three COLLINEAR in EVERY sample (a forced contiguous span,
 * not a coincidence). Runs to a fixpoint over the drawn-edge adjacency (each through-edge becomes a link), so
 * a chain with several interior points (`C–D–E–F` → `C–F`) merges transitively. Emergent shapes decide
 * downstream whether a resulting cycle is a FORCED, simple polygon; this only adds the topological edge.
 */
export function collinearMerges(c: Construction, samples: Map<Id, Vec>[]): [Id, Id][] {
  if (samples.length === 0) return [];
  const atomic: [Id, Id][] = [];
  for (const o of c.objects) {
    if (o.kind === 'segment') atomic.push([o.a, o.b]);
    else if (o.kind === 'polygon') for (let i = 0; i < o.vertices.length; i++) atomic.push([o.vertices[i], o.vertices[(i + 1) % o.vertices.length]]);
  }
  const adj = new Map<Id, Set<Id>>();
  const link = (x: Id, y: Id) => { (adj.get(x) ?? adj.set(x, new Set<Id>()).get(x)!).add(y); };
  for (const [a, b] of atomic) { link(a, b); link(b, a); }

  const kk = (x: Id, y: Id) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const known = new Set<string>(atomic.map(([a, b]) => kk(a, b)));
  const tol = 1e-4;

  // `d` lies strictly between `x` and `y`, and x,d,y are collinear, in EVERY sample (a contiguous straight span).
  const straightThrough = (x: Id, d: Id, y: Id): boolean => {
    for (const s of samples) {
      const vx = s.get(x), vd = s.get(d), vy = s.get(y);
      if (!vx || !vd || !vy) return false;
      const dx = vy.x - vx.x, dy = vy.y - vx.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < EPS) return false;
      const perp = Math.abs((vd.x - vx.x) * dy - (vd.y - vx.y) * dx) / Math.sqrt(len2);
      if (perp > tol * Math.sqrt(len2)) return false;
      const t = ((vd.x - vx.x) * dx + (vd.y - vx.y) * dy) / len2;
      if (!(t > tol && t < 1 - tol)) return false; // strictly interior ⇒ a genuine through-point, not an endpoint
    }
    return true;
  };

  const merges: [Id, Id][] = [];
  for (let pass = 0; pass <= atomic.length; pass++) { // bounded fixpoint (each pass may unlock a longer chain)
    const added: [Id, Id][] = [];
    for (const [d, ns] of adj) {
      const arr = [...ns];
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const x = arr[i], y = arr[j];
        if (known.has(kk(x, y))) continue;
        if (straightThrough(x, d, y)) { known.add(kk(x, y)); added.push([x, y]); merges.push([x, y]); }
      }
    }
    if (added.length === 0) break;
    for (const [x, y] of added) { link(x, y); link(y, x); }
  }
  return merges;
}

/**
 * Edges from each DRAWN (visible) line — the points that visibly lie on it, pairwise. A tangent drawn from
 * its touch point D to the crossing E is a visible edge D–E even though it's a `line`, not a `segment`; this
 * is what lets the angle universe see the TANGENT-CHORD angle (∠ between the tangent DE and a chord DB).
 * (FR-RV-6 "what appears", ADR-134.) Lines are membership-based (their on-points are structural), so they
 * need no geometric pass; the segment/polygon carriers get {@link collinearSplits}.
 */

export function visibleLineEdges(c: Construction): [Id, Id][] {
  const byId = new Map(c.objects.map((o) => [o.id, o] as const));
  const isPt = (id: Id) => byId.has(id) && isGeoPoint(byId.get(id)!);
  const edges: [Id, Id][] = [];
  for (const L of c.objects) {
    if (L.kind !== 'line' || !L.visible) continue;
    const pts = new Set<Id>();
    const spec = L.spec as LineSpec;
    if (spec.via === 'through') { pts.add(spec.a); pts.add(spec.b); }
    else if (spec.via === 'bisector') pts.add(spec.vertex);
    else if (spec.via === 'perpendicular' || spec.via === 'parallel') pts.add(spec.through);
    else if (spec.via === 'tangent') pts.add(spec.at); // the touch point (the line's anchor)
    for (const o of c.objects) {
      if (o.kind === 'line-intersection' && (o.line1 === L.id || o.line2 === L.id)) pts.add(o.id);
      else if (o.kind === 'line-circle' && o.line === L.id) pts.add(o.id);
      else if (o.kind === 'on-line' && o.line === L.id) pts.add(o.id);
    }
    const arr = [...pts].filter(isPt);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) edges.push([arr[i], arr[j]]);
  }
  return edges;
}

/**
 * The figure's **implicit edge universe** — every point-to-point connection a student visibly sees,
 * canonicalised (a ≤ b) and deduped: the drawn `segment`s + polygon edges (`pointNeighbors`), the
 * GEOMETRIC on-carrier splits (`collinearSplits` — e.g. `O–A`/`O–B` for a diameter midpoint `O`, `E–B`
 * for `E` on `AB`, `G–E`/`G–C` for any point `G` that lands on `EC` however it was built), and the
 * points sharing a drawn `line` (`visibleLineEdges`). This is the SAME set the equal-angle universe uses;
 * sharing it lets equal-segment detection and emergent-shape detection see the implicit geometry too
 * (radii of a diameter, a parallelogram between segments), not only declarations. Needs `samples` because
 * the splits are geometric (a point is "on" a carrier only if it is in every sampled configuration).
 */
export function figureEdges(c: Construction, samples: Map<Id, Vec>[]): [Id, Id][] {
  const nb = pointNeighbors(c);
  const seen = new Set<string>();
  const out: [Id, Id][] = [];
  const add = (x: Id, y: Id) => {
    if (x === y) return;
    // Internal scaffolding (`~tanmid-…` and its kin) never enters the universe: the diameter midpoint minted
    // by the tangent Thales construction would otherwise SPLIT AO into two "equal radii" the student sees no
    // point between (ADR-295 / issue #49). One guard here covers segments, splits, and visible-line edges.
    if (isScaffoldId(x) || isScaffoldId(y)) return;
    const [lo, hi] = x < y ? [x, y] : [y, x];
    const key = `${lo}|${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([lo, hi]);
  };
  for (const [v, list] of Object.entries(nb)) for (const w of list) add(v, w);
  for (const [x, y] of [...visibleLineEdges(c), ...collinearSplits(c, samples)]) add(x, y);
  return out;
}

/** An undirected segment by its two endpoints, canonical order (a ≤ b). */
export type SegmentRef = [Id, Id];
/** An angle at `vertex` between the rays to `a` and `b` (a ≤ b). */
export interface AngleRef {
  vertex: Id;
  a: Id;
  b: Id;
}

/** An angle whose MEASURE is forced (the same in every sample) — a definitive value, in degrees. */
export interface DefiniteAngle extends AngleRef {
  valueDeg: number;
}

export interface RelationsResult {
  /** Each inner array is one equality CLASS of segments that are equal in every sample (size ≥ 2). */
  equalSegments: SegmentRef[][];
  /** Each inner array is one equality class of angles equal in every sample (size ≥ 2). */
  equalAngles: AngleRef[][];
  /** Angles whose value is the SAME in every sample — forced by the givens, so a definitive number (degrees).
   *  Scale-invariant, so these appear even when the figure floats in size (a 60° equilateral corner, a forced
   *  90°). A straight (~180°) / degenerate (~0°) angle is excluded. */
  definiteAngles: DefiniteAngle[];
  /** How many valid configurations were actually sampled (a determined figure yields identical samples). */
  samplesUsed: number;
}

export interface DetectOptions {
  /** How many seeded configurations to sample (default 16). A determined figure repeats the same drawing. */
  samples?: number;
  /** Pre-collected sample positions (the store's shared sample core) — skips the internal sampling loop,
   *  so the relations and shapes layers solve the figure ONCE between them instead of once each. */
  positions?: Map<Id, Vec>[];
  /** Relative tolerance for two lengths to count as equal in a sample (default 1e-3). */
  lengthTol?: number;
  /** Absolute tolerance (radians) for two angles to count as equal in a sample (default ~0.1°). */
  angleTol?: number;
}

const EPS = 1e-9;

/** Angle at `v` between the rays to `a` and `b`, in radians (0..π), or null if a ray is degenerate. */
function angleAt(v: Vec, a: Vec, b: Vec): number | null {
  const u = sub(a, v);
  const w = sub(b, v);
  const lu = len(u);
  const lw = len(w);
  if (lu < EPS || lw < EPS) return null;
  const cos = Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (lu * lw)));
  return Math.acos(cos);
}

/** Group indices [0..n) into classes by a "same in every sample" predicate (a transitive equivalence). */
function classesBy(n: number, sameAcrossSamples: (i: number, j: number) => boolean): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (sameAcrossSamples(i, j)) parent[find(i)] = find(j);
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (byRoot.get(r) ?? byRoot.set(r, []).get(r)!).push(i);
  }
  return [...byRoot.values()];
}

/**
 * Drop numerically-DIVERGED samples ([ADR-166](docs/06-decisions.md#adr-166) Am.). A free-driven solve that
 * fails to converge can return absurd coordinates (orders of magnitude beyond the figure's scale) while
 * `evaluate` still reports `ok` — and such a garbage config poisons the "holds in EVERY sample" ground-truth
 * test, so a genuinely-forced relation (an emergent rhombus's equal sides) reads as NOT forced. Robust scale =
 * the median per-sample bounding-box diagonal; a sample whose diagonal exceeds 50× the median is a blown-up
 * solve, not a valid drawing. Surfaced by the equilateral-triangle apex solver diverging at ~2/16 seeds on the
 * bagrut-Q9 figure. Never strips below 2 samples (a robust median needs a few points).
 */
export function convergedSamples(samples: Map<Id, Vec>[]): Map<Id, Vec>[] {
  if (samples.length < 3) return samples;
  const diag = (pos: Map<Id, Vec>) => {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pos.values()) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    return Number.isFinite(minx) ? Math.hypot(maxx - minx, maxy - miny) : 0;
  };
  const ds = samples.map(diag);
  const sorted = ds.filter((d) => d > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return samples;
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = samples.filter((_, i) => ds[i] <= 50 * median);
  return kept.length >= 2 ? kept : samples;
}

/**
 * Drop samples that violate the construction's own STATED configuration requirements
 * ([ADR-256](docs/06-decisions.md#adr-256)): a plain segment-meet (`line-line-intersection` with
 * `onSeg` — "AM חותך את CO ב-K", ADR-166) whose crossing sits OFF a segment in that sample. Such a
 * sample is not a valid configuration of the FIGURE — counting it in the "holds in EVERY sample"
 * ground-truth pool suppresses relations that ARE forced in every valid config (△OMK ~ △CAK vanished
 * because mirror samples put K past segment CO's end, flipping the ray O→K and with it ∠KOM). Same
 * shape as {@link convergedSamples}: never strips below 2 — a thin pool over-claims (coincidences of
 * one drawing read as forced), while the unfiltered pool only under-claims, the safer failure.
 */
export function requirementSamples(c: Construction, samples: Map<Id, Vec>[]): Map<Id, Vec>[] {
  const meets = c.objects.filter(
    (o): o is Extract<GeoObject, { kind: 'line-line-intersection' }> => o.kind === 'line-line-intersection' && !!(o.onSeg || o.onSeg1 || o.onSeg2),
  );
  if (meets.length === 0 || samples.length < 3) return samples;
  const MARGIN = 0.02; // the sampling bar (WITHIN_MARGIN); the verifier's amber check stays looser
  const within = (pos: Map<Id, Vec>, s: Id, e: Id, x: Id): boolean => {
    const ps = pos.get(s), pe = pos.get(e), px = pos.get(x);
    if (!ps || !pe || !px) return true; // unplaced — a different failure mode, not a config violation
    const L = (pe.x - ps.x) ** 2 + (pe.y - ps.y) ** 2;
    if (L < 1e-12) return true;
    const t = ((px.x - ps.x) * (pe.x - ps.x) + (px.y - ps.y) * (pe.y - ps.y)) / L;
    return t >= MARGIN && t <= 1 - MARGIN;
  };
  const kept = samples.filter((pos) =>
    meets.every(
      (m) =>
        (!(m.onSeg || m.onSeg1) || within(pos, m.a, m.b, m.id)) &&
        (!(m.onSeg || m.onSeg2) || within(pos, m.c, m.d, m.id)),
    ),
  );
  return kept.length >= 2 ? kept : samples;
}

/**
 * Drop samples that are DEGENERATE by an unforced point collapse ([ADR-295](docs/06-decisions.md#adr-295),
 * the [ADR-256](docs/06-decisions.md#adr-256) sibling). Two independently-defined points landing on top of
 * each other is a valid drawing ONLY when the givens FORCE it (a derived intersection that provably lands on
 * a centre, the ADR-123 allowed coincidence) — and a forced coincidence shows up in EVERY sample. A collapse
 * that happens in only SOME samples is a degenerate branch (e.g. `C`, the line∩circle crossing, flipping onto
 * `D`'s far root in 3/16 seeds), NOT a configuration of the figure — yet counting it as ground truth poisons
 * the "holds under one consistent correspondence in every sample" test, so a genuinely-forced similarity
 * (△ABD ~ △ACB) never forms (issue #50). Forced coincidences (present in all samples) are KEPT, so the
 * ADR-123 "converge and allow" figures are untouched. Same fallback discipline as its siblings: never strips
 * below 2 — a thin pool over-claims, the unfiltered pool only under-claims.
 */
export function distinctSamples(c: Construction, samples: Map<Id, Vec>[]): Map<Id, Vec>[] {
  if (samples.length < 3) return samples;
  const pts = c.objects.filter((o) => isGeoPoint(o) && !isScaffoldId(o.id)).map((o) => o.id);
  if (pts.length < 2) return samples;
  const coincident = (pos: Map<Id, Vec>): Set<string> => {
    const placed = pts.map((id) => [id, pos.get(id)] as const).filter((x): x is [Id, Vec] => !!x[1]);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [, p] of placed) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    const eps = 1e-3 * Math.max(1e-9, maxx - minx, maxy - miny); // relative to span — figures float in scale
    const set = new Set<string>();
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      if (Math.hypot(placed[i][1].x - placed[j][1].x, placed[i][1].y - placed[j][1].y) < eps) {
        const [a, b] = placed[i][0] < placed[j][0] ? [placed[i][0], placed[j][0]] : [placed[j][0], placed[i][0]];
        set.add(`${a}|${b}`);
      }
    }
    return set;
  };
  const perSample = samples.map(coincident);
  // A pair coincident in EVERY sample is a FORCED coincidence (allowed, ADR-123); one coincident in only some
  // is a degenerate branch. Keep a sample iff it has no coincidence beyond the forced set.
  const forced = new Set<string>([...perSample[0]].filter((k) => perSample.every((s) => s.has(k))));
  const kept = samples.filter((_, i) => [...perSample[i]].every((k) => forced.has(k)));
  return kept.length >= 2 ? kept : samples;
}

/** How many valid samples a DEFINITE VALUE (an angle/length number) needs before it is trusted as forced by
 *  the givens, when the figure still has free shape DOF. Below it — a pool STARVED by the requirement/
 *  distinct filters down to 1–3 samples — "the same in every sample" is vacuous (a handful of samples agree
 *  with themselves), so a configuration-dependent value would print as if fixed (issue #88). Equality
 *  classes/ticks keep the ≥2 discipline; a printed NUMBER may not. A DETERMINED figure (0 shape DOF) is
 *  seed-invariant, so its single configuration IS the figure and the floor does not apply. */
const MIN_DEFINITE_POOL = 4;

/**
 * Detect the ground-truth equalities of `c`: which edges are equal and which vertex-angles are equal,
 * each true across every sampled configuration. `c` should be the figure's construction (e.g.
 * `replay(facts, 0).construction`); this samples it with its own seeds, never mutating it.
 */
export function detectRelations(c: Construction, opts: DetectOptions = {}): RelationsResult {
  return detectRelationsAcross([c], opts);
}

/**
 * Like {@link detectRelations} but samples across SEVERAL constructions — the variant alternatives of an
 * ambiguous named shape ([ADR-138](docs/06-decisions.md#adr-138): a kite's two axes, an isosceles triangle's
 * three apexes). The equal-pair is a FREE choice, so a relation is a ground truth only if it holds across the
 * variants too — sampling each variant config across its own seeds and pooling the positions makes a pair
 * that holds only in the drawn variant (e.g. |AB|=|AD| in a kite's axis-AC config) correctly NOT forced.
 * `constructions[0]` supplies the object UNIVERSE (the variants share the same vertices/edges — only their
 * equalities differ). With one construction this is exactly the original single-config detection.
 */
export function detectRelationsAcross(constructions: Construction[], opts: DetectOptions = {}): RelationsResult {
  const N = opts.samples ?? 16;
  const lengthTol = opts.lengthTol ?? 1e-3;
  const angleTol = opts.angleTol ?? (Math.PI / 180) * 0.1;
  const c0 = constructions[0];

  // 1. Sample valid configurations across every variant config × its own seeds. A determined figure (no free
  //    DOF, single variant) returns the same drawing each seed, which is correct — its single configuration
  //    IS the only valid drawing, so every relation in it is a ground truth. Pre-collected positions (the
  //    store's shared sample core) skip the loop entirely.
  const rawSamples: Map<Id, Vec>[] = [];
  if (!opts.positions) {
    for (const c of constructions) {
      for (let s = 0; s < N; s++) {
        const r = evaluate(applySeed(c, s));
        if (r.ok) rawSamples.push(r.positions);
      }
    }
  }
  // Sample hygiene: drop numerically-diverged solves (ADR-166 Am.) AND configuration-requirement
  // violators (ADR-256) — the store's shared core is already filtered, but the direct engine path
  // (tests/scenarios calling detectRelations on a construction) must apply the same ground-truth bar.
  const samples = requirementSamples(c0, distinctSamples(c0, convergedSamples(opts.positions ?? rawSamples)));
  if (samples.length === 0) return { equalSegments: [], equalAngles: [], definiteAngles: [], samplesUsed: 0 };

  // 2. The IMPLICIT edge universe — drawn segments + polygon edges + GEOMETRIC on-carrier splits +
  //    visible-line edges, the same universe the angle pass uses. The geometric splits (`collinearSplits`
  //    inside `figureEdges`) are what let `OA`/`OB` (the two halves of a diameter through its midpoint `O`)
  //    be detected as equal radii, and any emergent split (a crossing / foot / collinear point ON a drawn
  //    segment) be seen — regardless of the point's construction kind ([ADR-167](docs/06-decisions.md#adr-167)).
  const edges = figureEdges(c0, samples);
  const segs: SegmentRef[] = edges;
  // Length of each segment in each sample (NaN where a point is missing / the segment is degenerate).
  const segLen: number[][] = segs.map(([a, b]) =>
    samples.map((p) => {
      const pa = p.get(a);
      const pb = p.get(b);
      if (!pa || !pb) return NaN;
      const d = dist(pa, pb);
      return d < EPS ? NaN : d;
    }),
  );
  const segUsable = segLen.map((row) => row.every((x) => Number.isFinite(x)));
  const segEqual = (i: number, j: number): boolean => {
    if (!segUsable[i] || !segUsable[j]) return false;
    for (let s = 0; s < samples.length; s++) {
      const li = segLen[i][s];
      const lj = segLen[j][s];
      if (Math.abs(li - lj) > lengthTol * Math.max(li, lj, EPS)) return false;
    }
    return true;
  };
  const equalSegments = classesBy(segs.length, segEqual)
    .filter((cls) => cls.length >= 2)
    .map((cls) => cls.map((i) => segs[i]).sort(cmpSeg));
  equalSegments.sort((x, y) => cmpSeg(x[0], y[0]));

  // 3. The angle universe — at each vertex, the angles between its DISTINCT ray directions. Two neighbours on
  //    the SAME ray from the vertex in every sample (e.g. B and E when E lies on line AB beyond B) are MERGED
  //    to one representative, so ∠DAB and ∠DAE — the same angle — aren't both reported. A DEGENERATE angle
  //    (~0° same ray / ~180° opposite rays, in any sample) carries no information and is dropped.
  const rayTol = (Math.PI / 180) * 0.5; // two rays within 0.5° are the same direction
  const degenTol = (Math.PI / 180) * 2; // an angle within 2° of 0 or 180 is degenerate
  const dirOf = (v: Id, x: Id, s: number): number | null => {
    const pv = samples[s].get(v);
    const px = samples[s].get(x);
    if (!pv || !px) return null;
    const dx = px.x - pv.x;
    const dy = px.y - pv.y;
    return Math.hypot(dx, dy) < EPS ? null : Math.atan2(dy, dx);
  };
  const sameRay = (v: Id, x: Id, y: Id): boolean => {
    for (let s = 0; s < samples.length; s++) {
      const dx = dirOf(v, x, s);
      const dy = dirOf(v, y, s);
      if (dx === null || dy === null) return false;
      const d = Math.abs((((dx - dy + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
      if (d > rayTol) return false;
    }
    return true;
  };
  // The angle universe is the SAME implicit edge set (drawn segments/polygons + geometric splits + drawn
  //  lines), so a tangent-chord angle and any angle AT an on-carrier point are both seen. Built as an
  //  adjacency over `edges` — one source of truth with the segment universe above.
  const nbAng: Record<Id, Set<Id>> = {};
  for (const [x, y] of edges) {
    (nbAng[x] ??= new Set()).add(y);
    (nbAng[y] ??= new Set()).add(x);
  }
  const angles: AngleRef[] = [];
  const angVal: number[][] = [];
  for (const [v, set] of Object.entries(nbAng)) {
    const reps: Id[] = []; // one neighbour per distinct ray direction
    for (const x of [...set].sort()) if (!reps.some((r) => sameRay(v, r, x))) reps.push(x);
    for (let i = 0; i < reps.length; i++) {
      for (let j = i + 1; j < reps.length; j++) {
        const a = reps[i], b = reps[j];
        const vals = samples.map((p) => {
          const pv = p.get(v), pa = p.get(a), pb = p.get(b);
          return pv && pa && pb ? angleAt(pv, pa, pb) ?? NaN : NaN;
        });
        if (vals.some((x) => !Number.isFinite(x))) continue;
        if (vals.some((x) => x < degenTol || x > Math.PI - degenTol)) continue; // degenerate ⇒ no information
        angles.push({ vertex: v, a, b });
        angVal.push(vals);
      }
    }
  }
  const angUsable = angVal.map((row) => row.every((x) => Number.isFinite(x)));
  const angEqual = (i: number, j: number): boolean => {
    if (!angUsable[i] || !angUsable[j]) return false;
    for (let s = 0; s < samples.length; s++) if (Math.abs(angVal[i][s] - angVal[j][s]) > angleTol) return false;
    return true;
  };
  const equalAngles = classesBy(angles.length, angEqual)
    .filter((cls) => cls.length >= 2)
    .map((cls) => cls.map((i) => angles[i]).sort(cmpAngle));
  equalAngles.sort((x, y) => cmpAngle(x[0], y[0]));

  // 4. DEFINITIVE angle values — an angle whose measure is the same (within tolerance) across every sample
  //    is forced by the givens, so its value is a ground truth. Skip a straight/degenerate angle.
  //    A printed NUMBER demands a non-starved pool (issue #88): on a figure that still has free shape DOF,
  //    "same in every sample" is only meaningful over enough valid samples — below the floor the pool has
  //    starved (most seeds failed the requirement/distinct filters) and a handful of survivors agreeing with
  //    themselves is vacuous, so a configuration-dependent value would print as if fixed. A DETERMINED figure
  //    (0 shape DOF) is seed-invariant, so its lone configuration IS the figure and prints regardless.
  const definiteAngles: DefiniteAngle[] = [];
  const trustDefinite = freeDofCount(c0) === 0 || samples.length >= MIN_DEFINITE_POOL;
  for (let i = 0; trustDefinite && i < angles.length; i++) {
    if (!angUsable[i]) continue;
    const vals = angVal[i];
    if (Math.max(...vals) - Math.min(...vals) > angleTol) continue; // it flexes ⇒ not definitive
    const deg = ((vals.reduce((a, b) => a + b, 0) / vals.length) * 180) / Math.PI;
    if (deg < 1 || deg > 179) continue; // a ~180° straight angle / ~0° degenerate carries no information
    definiteAngles.push({ ...angles[i], valueDeg: deg });
  }
  definiteAngles.sort(cmpAngle);

  return { equalSegments, equalAngles, definiteAngles, samplesUsed: samples.length };
}

const cmpSeg = (x: SegmentRef, y: SegmentRef): number => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]);
const cmpAngle = (x: AngleRef, y: AngleRef): number =>
  x.vertex.localeCompare(y.vertex) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b);
