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

import type { Construction, Id, LineSpec, Vec } from './types';
import { isGeoPoint } from './types';
import { evaluate } from './evaluate';
import { applySeed } from './sample';
import { pointNeighbors } from './step';
import { dist, sub, len } from './geometry';

/**
 * Edges from each DRAWN (visible) line — the points that visibly lie on it, pairwise. A tangent drawn from
 * its touch point D to the crossing E is a visible edge D–E even though it's a `line`, not a `segment`; this
 * is what lets the angle universe see the TANGENT-CHORD angle (∠ between the tangent DE and a chord DB).
 * Used for ANGLES only — segment lengths stay the drawn `segment`s. (FR-RV-6 "what appears", ADR-134.)
 */
/**
 * A point that lies ON a segment/line is connected — for ANGLE enumeration ONLY — to that host's two
 * endpoints, so an angle between the host line and another ray from the point is seen. Without this a
 * perpendicular FOOT (or any "F on AB") has only its OFF-line neighbour in the graph (e.g. the altitude
 * AF), so the right angle it makes with the host line (∠AFB = 90°) is never enumerated and the foot's 90°
 * goes unmarked. The endpoints are NOT added to the SEGMENT universe (no fake edge) — only to the angle
 * graph; at the endpoint the collinear ray to this point merges (same direction) with the ray to the far
 * endpoint, so no spurious angle appears there — only the genuine angles AT the on-host point are added.
 */
export function onHostEdges(c: Construction): [Id, Id][] {
  const edges: [Id, Id][] = [];
  for (const o of c.objects) {
    if (o.kind === 'on-segment' || o.kind === 'on-segment-solved' || o.kind === 'midpoint') edges.push([o.id, o.a], [o.id, o.b]);
    else if (o.kind === 'foot') edges.push([o.id, o.a], [o.id, o.b]); // the foot lies on the line (a,b)
    // A SEGMENT-meet crossing ([ADR-166](docs/06-decisions.md#adr-166)) lies WITHIN both its operand segments
    // (that's what `onSeg` asserts), so it SPLITS each — G on AE and BF connects to A,E,B,F. Without this the
    // crossing has no drawn neighbour (the parser draws the whole AE/BF, not stubs to G), so an emergent shape
    // whose sides run THROUGH the crossing (the classic "AE∩BF, DE∩CF ⇒ EGFH rhombus") is invisible to
    // `figureEdges`. Only `onSeg` (within) crossings split cleanly; an extension/infinite meet is skipped.
    else if (o.kind === 'line-line-intersection' && o.onSeg) edges.push([o.id, o.a], [o.id, o.b], [o.id, o.c], [o.id, o.d]);
  }
  return edges;
}

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
 * on-host splits (`onHostEdges` — e.g. `O–A`/`O–B` for a diameter midpoint `O`, `E–B` for `E` on `AB`),
 * and the points sharing a drawn `line` (`visibleLineEdges`). This is the SAME set the equal-angle
 * universe already uses; sharing it lets equal-segment detection and emergent-shape detection see the
 * implicit geometry too (radii of a diameter, a parallelogram between segments), not only declarations.
 */
export function figureEdges(c: Construction): [Id, Id][] {
  const nb = pointNeighbors(c);
  const seen = new Set<string>();
  const out: [Id, Id][] = [];
  const add = (x: Id, y: Id) => {
    if (x === y) return;
    const [lo, hi] = x < y ? [x, y] : [y, x];
    const key = `${lo}|${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([lo, hi]);
  };
  for (const [v, list] of Object.entries(nb)) for (const w of list) add(v, w);
  for (const [x, y] of [...visibleLineEdges(c), ...onHostEdges(c)]) add(x, y);
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
  //    IS the only valid drawing, so every relation in it is a ground truth.
  const rawSamples: Map<Id, Vec>[] = [];
  for (const c of constructions) {
    for (let s = 0; s < N; s++) {
      const r = evaluate(applySeed(c, s));
      if (r.ok) rawSamples.push(r.positions);
    }
  }
  const samples = convergedSamples(rawSamples); // drop numerically-diverged solves (ADR-166 Am.)
  if (samples.length === 0) return { equalSegments: [], equalAngles: [], definiteAngles: [], samplesUsed: 0 };

  const nb = pointNeighbors(c0);

  // 2. The segment universe — the figure's IMPLICIT edges (drawn segments + polygon edges + on-host
  //    splits + visible-line edges), the same universe the angle pass uses. The on-host splits are what
  //    let `OA`/`OB` (the two halves of a diameter through its midpoint `O`) be detected as equal radii.
  const segs: SegmentRef[] = figureEdges(c0);
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
  // The angle universe also uses the DRAWN LINES (a tangent etc.), so a tangent-chord angle is seen; segment
  // lengths above stay on the drawn `segment`s only.
  const nbAng: Record<Id, Set<Id>> = {};
  for (const [k, vs] of Object.entries(nb)) nbAng[k] = new Set(vs);
  for (const [x, y] of [...visibleLineEdges(c0), ...onHostEdges(c0)]) {
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
  const definiteAngles: DefiniteAngle[] = [];
  for (let i = 0; i < angles.length; i++) {
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
