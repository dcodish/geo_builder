/**
 * Shape-detection layer — "what named shapes does this figure contain, and which one is each?"
 *
 * The companion to {@link detectRelations}: where the relations layer reports equal sides / angles,
 * this layer classifies each polygon and circle into a NAMED shape (kite, rhombus, isosceles
 * triangle, …) so the UI can surface a badge per shape that links out to the geometry book
 * ([FR-REF-1](docs/02-requirements.md), [FR-SH](docs/02-requirements.md)).
 *
 * A type is reported only if it is FORCED — its defining properties hold in EVERY sampled
 * configuration, not just the drawing on screen. So a general quad that accumulated constraints
 * have pinned into a kite IS detected as a kite (emergent), while a quad that merely happens to look
 * square in the current drawing (but flexes away in another valid config) is NOT reported square.
 * This mirrors the relations layer's "ground truth across samples" and reuses the same sampler
 * (`evaluate(applySeed(c, s))`).
 *
 * Pure and deterministic (seeds 0..N-1): a read-only consumer of the engine, no state is mutated.
 */

import type { Construction, Id, Vec, Polygon, Circle } from './types';
import { evaluate } from './evaluate';
import { applySeed } from './sample';
import { figureEdges, collinearMerges, convergedSamples, requirementSamples } from './relations';
import { dist, sub, len } from './geometry';

/** Every named shape the layer can detect; each maps to one geometry-book page (see shapeCatalog). */
export type ShapeType =
  | 'square'
  | 'rectangle'
  | 'rhombus'
  | 'parallelogram'
  | 'kite'
  | 'trapezoid'
  | 'isosceles-trapezoid'
  | 'right-trapezoid'
  | 'triangle'
  | 'isosceles-triangle'
  | 'equilateral-triangle'
  | 'right-triangle'
  | 'right-isosceles-triangle'
  | '30-60-90-triangle'
  | 'circle';

export interface DetectedShape {
  type: ShapeType;
  /** The vertex ids the shape spans (a polygon's vertices, or a circle's centre id). */
  vertices: Id[];
  /** Human label — e.g. "ABCD" for a quad, "O" for a circle. */
  label: string;
}

/**
 * A class of triangles that are SIMILAR (or, tighter, CONGRUENT) to each other in EVERY sampled
 * configuration — a structural relation, not a coincidence of one drawing (the same forced-across-samples
 * discipline as the shape badges). Reported as a CLASS (not per-pair) so a figure with many mutually
 * similar triangles — a square's diagonals give eight right-isosceles triangles — is one legible row, not
 * O(n²) pairs. Every member's vertex ids are listed in CORRESPONDING order (`triangles[m][k]` ↔
 * `triangles[0][k]`), so "△DEG ~ △CEF" reads off directly. Surfaced only in the OPT-IN "detect shapes"
 * panel (the same student-initiated reveal boundary as the shape badges) — NOT the always-on theorem feed,
 * whose no-reveal rule stands (ADR-208). Naming a pair similar still leaves the PROOF to the student
 * (operator 2026-07-05).
 */
export interface SimilarClass {
  kind: 'similar' | 'congruent';
  /** Each member triangle's 3 vertex ids, all in mutually-corresponding order. */
  triangles: Id[][];
}

export interface ShapesResult {
  shapes: DetectedShape[];
  /** Similar/congruent triangle classes forced across every sample (ADR-224). */
  similar: SimilarClass[];
  /** How many valid configurations were sampled (a determined figure yields identical samples). */
  samplesUsed: number;
}

export interface ShapeDetectOptions {
  /** How many seeded configurations to sample (default 16). */
  samples?: number;
  /** Relative tolerance for two lengths to count as equal in a sample (default 1e-3). */
  lengthTol?: number;
  /** Absolute tolerance (radians) for an angle to count as right / two directions parallel (default ~0.5°). */
  angleTol?: number;
}

const EPS = 1e-9;

/** Angle at `v` between the rays to `a` and `b`, radians (0..π), or null if a ray is degenerate. */
function angleAt(v: Vec, a: Vec, b: Vec): number | null {
  const u = sub(a, v);
  const w = sub(b, v);
  const lu = len(u);
  const lw = len(w);
  if (lu < EPS || lw < EPS) return null;
  const cos = Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (lu * lw)));
  return Math.acos(cos);
}

/** Sample valid configurations across the variant constructions × seeds (same path as the relations layer). */
function samplePositions(constructions: Construction[], N: number): Map<Id, Vec>[] {
  const out: Map<Id, Vec>[] = [];
  for (const c of constructions) {
    for (let s = 0; s < N; s++) {
      const r = evaluate(applySeed(c, s));
      if (r.ok) out.push(r.positions);
    }
  }
  // Drop numerically-diverged solves (ADR-166 Am.) and stated-requirement violators (ADR-256 — a sample
  // with a segment-meet's crossing off its segments is not a valid configuration of the figure).
  return requirementSamples(constructions[0], convergedSamples(out));
}

/** Per-vertex coordinates of a polygon in one sample, or null if any vertex is missing/degenerate. */
function polyPoints(verts: Id[], pos: Map<Id, Vec>): Vec[] | null {
  const pts: Vec[] = [];
  for (const v of verts) {
    const p = pos.get(v);
    if (!p) return null;
    pts.push(p);
  }
  return pts;
}

/** Two directions are parallel (same or opposite) within `tol` radians. `0` for a degenerate edge. */
function parallel(a: Vec, b: Vec, c: Vec, d: Vec, tol: number): boolean {
  const u = sub(b, a);
  const w = sub(d, c);
  const lu = len(u);
  const lw = len(w);
  if (lu < EPS || lw < EPS) return false;
  // |sin θ| via the normalised cross product.
  const cross = Math.abs(u.x * w.y - u.y * w.x) / (lu * lw);
  return cross < Math.sin(tol);
}

const approxEq = (a: number, b: number, relTol: number) => Math.abs(a - b) <= relTol * Math.max(Math.abs(a), Math.abs(b), EPS);
const isRight = (ang: number | null, tol: number) => ang !== null && Math.abs(ang - Math.PI / 2) < tol;

/**
 * Classify one quadrilateral from its per-sample geometry: return the MOST-SPECIFIC named type that
 * is FORCED (holds in every sample), or null for a general quad (no book page).
 *
 * Side i is the edge (v_i → v_{i+1}); the opposite-side pairs are (0,2) and (1,3).
 */
function classifyQuad(samples: Vec[][], lengthTol: number, angleTol: number): ShapeType | null {
  // A predicate is FORCED iff it holds in every sample.
  const all = (pred: (p: Vec[]) => boolean) => samples.every(pred);

  const sideLen = (p: Vec[], i: number) => dist(p[i], p[(i + 1) % 4]);
  const interior = (p: Vec[], i: number) => angleAt(p[i], p[(i + 3) % 4], p[(i + 1) % 4]);

  const allSidesEqual = all((p) => {
    const s0 = sideLen(p, 0);
    return [1, 2, 3].every((i) => approxEq(sideLen(p, i), s0, lengthTol));
  });
  const allRight = all((p) => [0, 1, 2, 3].every((i) => isRight(interior(p, i), angleTol)));
  const par02 = all((p) => parallel(p[0], p[1], p[2], p[3], angleTol)); // side0 ∥ side2
  const par13 = all((p) => parallel(p[1], p[2], p[3], p[0], angleTol)); // side1 ∥ side3
  const bothParallel = par02 && par13;
  const oneParallel = par02 !== par13;

  // Kite: two pairs of ADJACENT equal sides — (s0=s1 & s2=s3) or (s1=s2 & s3=s0) — in every sample.
  const kiteA = all((p) => approxEq(sideLen(p, 0), sideLen(p, 1), lengthTol) && approxEq(sideLen(p, 2), sideLen(p, 3), lengthTol));
  const kiteB = all((p) => approxEq(sideLen(p, 1), sideLen(p, 2), lengthTol) && approxEq(sideLen(p, 3), sideLen(p, 0), lengthTol));
  const isKite = kiteA || kiteB;

  // For a trapezoid the legs are the NON-parallel pair; isosceles ⇔ the legs are equal.
  const legsEqual = par02
    ? all((p) => approxEq(sideLen(p, 1), sideLen(p, 3), lengthTol))
    : all((p) => approxEq(sideLen(p, 0), sideLen(p, 2), lengthTol));
  const hasRight = all((p) => [0, 1, 2, 3].some((i) => isRight(interior(p, i), angleTol)));

  if (allSidesEqual && allRight) return 'square';
  if (allRight) return 'rectangle';
  if (allSidesEqual) return 'rhombus';
  if (bothParallel) return 'parallelogram';
  if (isKite) return 'kite';
  if (oneParallel && legsEqual) return 'isosceles-trapezoid';
  if (oneParallel && hasRight) return 'right-trapezoid';
  if (oneParallel) return 'trapezoid';
  return null;
}

/**
 * Classify one triangle into the SINGLE most-specific named type, composing the equal-sides axis
 * (equilateral / isosceles / general) with the right-angle axis into one badge — a forced
 * right-isosceles triangle is `right-isosceles-triangle`, a single named concept, not two separate
 * `isosceles-triangle` + `right-triangle` badges (a right isosceles is one thing a student names,
 * mirroring how `isosceles-trapezoid` / `right-trapezoid` are each their own type). Equilateral is
 * never right (a 60-60-60 triangle has no right angle), so only isosceles pairs with the right axis.
 *
 * The right axis carries a MAGNITUDE sub-type too: a 30-60-90 triangle (a right triangle with a 30°
 * acute angle ⇒ the third is 60°) is its own named concept the student learns as a unit — the leg
 * opposite the 30° is half the hypotenuse (07 #33/#34). It is never isosceles (its acute angles differ),
 * so it slots between right-isosceles and plain right (operator 2026-07-04, "always surface the special
 * type + its theorems"). Its emergence is legitimate — a size given like `DC=2CE` forces exactly 30°.
 */
function classifyTriangle(samples: Vec[][], lengthTol: number, angleTol: number): ShapeType {
  const all = (pred: (p: Vec[]) => boolean) => samples.every(pred);
  const s = (p: Vec[], i: number, j: number) => dist(p[i], p[j]);

  const e01 = all((p) => approxEq(s(p, 0, 1), s(p, 1, 2), lengthTol)); // |AB| = |BC|
  const e12 = all((p) => approxEq(s(p, 1, 2), s(p, 2, 0), lengthTol)); // |BC| = |CA|
  const e20 = all((p) => approxEq(s(p, 2, 0), s(p, 0, 1), lengthTol)); // |CA| = |AB|
  const equilateral = e01 && e12 && e20;
  const isosceles = e01 || e12 || e20;

  const rightAngle = all((p) => [0, 1, 2].some((i) => isRight(angleAt(p[i], p[(i + 2) % 3], p[(i + 1) % 3]), angleTol)));
  // A 30° interior angle in every sample — combined with the right angle it pins the 30-60-90 type.
  const has30 = all((p) => [0, 1, 2].some((i) => {
    const a = angleAt(p[i], p[(i + 2) % 3], p[(i + 1) % 3]);
    return a !== null && Math.abs(a - Math.PI / 6) < angleTol;
  }));

  if (equilateral) return 'equilateral-triangle';
  if (isosceles && rightAngle) return 'right-isosceles-triangle';
  if (rightAngle && has30) return '30-60-90-triangle';
  if (isosceles) return 'isosceles-triangle';
  if (rightAngle) return 'right-triangle';
  return 'triangle';
}

// ---- Emergent shapes: polygons that exist on the page but were never declared as a `polygon` ----
// (e.g. a parallelogram EBCD whose sides are a sub-piece of AB plus drawn segments). We enumerate
// triangle/quad cycles over the figure's IMPLICIT edge graph (`figureEdges`) and classify each.

/** Undirected adjacency from the implicit edge list. */
function adjacency(edges: [Id, Id][]): Map<Id, Set<Id>> {
  const adj = new Map<Id, Set<Id>>();
  const link = (x: Id, y: Id) => (adj.get(x) ?? adj.set(x, new Set()).get(x)!).add(y);
  for (const [a, b] of edges) { link(a, b); link(b, a); }
  return adj;
}

/** Simple 3-cycles as sorted vertex triples (deduped). */
function triangleCycles(adj: Map<Id, Set<Id>>): Id[][] {
  const out: Id[][] = [];
  const verts = [...adj.keys()].sort();
  for (const a of verts) for (const b of adj.get(a)!) {
    if (b <= a) continue;
    for (const c of adj.get(b)!) {
      if (c <= b) continue;
      if (adj.get(a)!.has(c)) out.push([a, b, c]);
    }
  }
  return out;
}

/** Candidate 4-cycles as boundary orders [a,b,c,d]: opposite corners {a,c} share two neighbours {b,d}
 *  → boundary a-b-c-d, diagonals a–c and b–d. NOT deduped by vertex-set on purpose — several orderings
 *  of the same four points may be generated; the caller keeps the SIMPLE (non-self-intersecting) one
 *  (a bowtie ordering must not shadow the convex one), then dedups the final classified shapes. */
function quadCycles(adj: Map<Id, Set<Id>>): Id[][] {
  const out: Id[][] = [];
  const verts = [...adj.keys()].sort();
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const a = verts[i], c = verts[j];
      const common = [...adj.get(a)!].filter((x) => x !== c && adj.get(c)!.has(x));
      for (let m = 0; m < common.length; m++)
        for (let n = m + 1; n < common.length; n++) out.push([a, common[m], c, common[n]]);
    }
  }
  return out;
}

/** Proper intersection of open segments p1p2 and p3p4 (shared endpoints don't count). */
function segmentsProperlyCross(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** Unsigned area of a polygon (shoelace) in one sample. */
function polyArea(p: Vec[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    s += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(s) / 2;
}

/**
 * `sin` threshold below which a corner counts as STRAIGHT (collinear). This is deliberately MUCH tighter
 * than the shape-classification `angleTol` (~0.5°): a "straight vertex" means the vertex is genuinely
 * COLLINEAR with its neighbours — a phantom corner where a point sits ON the edge between them (a crossing
 * on a diagonal, collinear to solver precision ~1e-10). At 0.5° it also rejected a *legitimately thin*
 * corner: a sampler-perturbed trapezoid can have a real ~0.3° corner (`sin ≈ 5e-3`) in one unlucky config,
 * which is a valid (if narrow) quadrilateral, not a degenerate one — rejecting the whole shape for it made
 * detection flaky per base seed (the emergent trapezoid ABCE missed at seed 2). `1e-4` (~0.006°) cleanly
 * separates a phantom (collinear to ~1e-10) from a genuine narrow corner (≥ a few milliradians), and matches
 * `collinearSplits`' own on-carrier `tolPerp` so the two agree on "on the line".
 */
const STRAIGHT_SIN_TOL = 1e-4;

/**
 * A vertex is "straight" when its two incident edges are collinear (interior angle ≈ 0 or π) — a
 * degenerate corner that makes an n-gon really an (n−1)-gon. This is the case the shoelace-area test
 * MISSES: a "quad" A-B-E-D where E lies on diagonal BD keeps triangle ABD's full area, yet B,E,D are
 * collinear so it is not a genuine quadrilateral (it would classify as a phantom kite). Drawing both
 * diagonals of any polygon plants their crossing point on every diagonal, spawning exactly these.
 */
function hasStraightVertex(p: Vec[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const b = p[i];
    const u = sub(p[(i + n - 1) % n], b); // b → prev
    const w = sub(p[(i + 1) % n], b); // b → next
    const lu = len(u), lw = len(w);
    if (lu < EPS || lw < EPS) return true; // coincident consecutive vertices
    // |sin θ| via the normalised cross product; ~0 ⇒ the corner is collinear (a phantom vertex on the edge
    // between its neighbours), NOT merely narrow — a real thin corner stays well above STRAIGHT_SIN_TOL.
    if (Math.abs(u.x * w.y - u.y * w.x) / (lu * lw) < STRAIGHT_SIN_TOL) return true;
  }
  return false;
}

/** A cycle is a genuine (non-degenerate, non-self-intersecting) polygon in EVERY sample. */
function isSimpleEverywhere(perSample: Vec[][]): boolean {
  for (const p of perSample) {
    if (polyArea(p) < 1e-6) return false; // degenerate / collinear
    if (hasStraightVertex(p)) return false; // a vertex on the edge between its neighbours ⇒ lower-order polygon
    if (p.length === 4) {
      // The two non-adjacent edge pairs must not cross (a bowtie ordering).
      if (segmentsProperlyCross(p[0], p[1], p[2], p[3]) || segmentsProperlyCross(p[1], p[2], p[3], p[0])) return false;
    }
  }
  return true;
}

/** Order for stable badge listing (most-specific quad first, then triangles, then circle). */
const TYPE_ORDER: ShapeType[] = [
  'square', 'rectangle', 'rhombus', 'parallelogram', 'kite',
  'isosceles-trapezoid', 'right-trapezoid', 'trapezoid',
  'equilateral-triangle', 'right-isosceles-triangle', '30-60-90-triangle', 'isosceles-triangle', 'right-triangle', 'triangle',
  'circle',
];

/**
 * Detect the named shapes of `c`. Pass the figure's construction (e.g. `replay(facts, 0).construction`);
 * it samples with its own seeds, never mutating it.
 */
export function detectShapes(c: Construction, opts: ShapeDetectOptions = {}): ShapesResult {
  return detectShapesAcross([c], opts);
}

/**
 * Like {@link detectShapes} but samples across SEVERAL constructions — the variant alternatives of an
 * ambiguous named shape (a kite's two axes, an isosceles triangle's three apexes; see
 * [ADR-138](docs/06-decisions.md#adr-138)). A type is forced only if it holds across the variants
 * too. `constructions[0]` supplies the object universe.
 */
export function detectShapesAcross(constructions: Construction[], opts: ShapeDetectOptions = {}): ShapesResult {
  const N = opts.samples ?? 16;
  return classifyShapesFromSamples(constructions[0], samplePositions(constructions, N), opts);
}

/** The three interior angles of a triangle [p0,p1,p2], indexed by vertex (angle AT vertex k). */
function triAnglesOf(p: Vec[]): [number, number, number] {
  return [angleAt(p[0], p[1], p[2]) ?? NaN, angleAt(p[1], p[0], p[2]) ?? NaN, angleAt(p[2], p[0], p[1]) ?? NaN];
}
/** Side lengths opposite each vertex k of a triangle [p0,p1,p2]. */
function triSidesOf(p: Vec[]): [number, number, number] {
  return [dist(p[1], p[2]), dist(p[0], p[2]), dist(p[0], p[1])];
}
const PERMS3: number[][] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
interface TriSample { verts: Id[]; per: Vec[][] }

/**
 * Group triangles similar/congruent across EVERY sample into classes ([ADR-224](docs/06-decisions.md#adr-224)).
 * Two triangles are SIMILAR iff, under some vertex correspondence, their three interior angles agree (within
 * tol) in every sampled configuration (AA — forced, not a coincidence of one drawing); CONGRUENT iff the
 * corresponding sides also agree. Similarity is transitive, so the "forced-similar" relation partitions the
 * triangles into cliques (union-find); each clique of ≥2 is one class, its members re-ordered to correspond
 * to the first (so "△DEG ~ △CEF" reads off positionally). A class is `congruent` only when every member is
 * congruent to that reference; otherwise `similar` (the weaker statement that is still true of all).
 */
function detectSimilarClasses(tris: TriSample[], angleTol: number, lengthTol: number): SimilarClass[] {
  const n = tris.length;
  if (n < 2) return [];
  const angles = tris.map((t) => t.per.map(triAnglesOf));
  const sides = tris.map((t) => t.per.map(triSidesOf));
  const usable = angles.map((rows) => rows.every((a) => a.every(Number.isFinite)));
  // The vertex permutation of triangle j whose angles align to i across ALL samples (preferring one that
  // fixes shared vertices, for a natural label), or null when they are not forced-similar.
  const corr = (i: number, j: number): number[] | null => {
    if (!usable[i] || !usable[j]) return null;
    let best: number[] | null = null;
    let bestScore = -1;
    for (const perm of PERMS3) {
      const ok = angles[i].every((ai, s) => [0, 1, 2].every((k) => Math.abs(ai[k] - angles[j][s][perm[k]]) <= angleTol));
      if (!ok) continue;
      let score = 0;
      for (let k = 0; k < 3; k++) if (tris[i].verts[k] === tris[j].verts[perm[k]]) score++;
      if (score > bestScore) { bestScore = score; best = perm; }
    }
    return best;
  };
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (corr(i, j)) parent[find(i)] = find(j);
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = byRoot.get(r) ?? [];
    g.push(i);
    byRoot.set(r, g);
  }
  const congruentTo = (ref: number, m: number, perm: number[]): boolean =>
    sides[ref].every((sr, s) => [0, 1, 2].every((k) => {
      const a = sr[k];
      const b = sides[m][s][perm[k]];
      return Math.abs(a - b) <= lengthTol * Math.max(a, b, 1e-9);
    }));
  const classes: SimilarClass[] = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    const ref = members[0];
    const triangles: Id[][] = [tris[ref].verts.slice()];
    let allCongruent = true;
    for (const m of members) {
      if (m === ref) continue;
      const perm = corr(ref, m);
      if (!perm) continue; // transitivity guarantees a direct correspondence; stay defensive at tol boundaries
      triangles.push(perm.map((k) => tris[m].verts[k]));
      if (!congruentTo(ref, m, perm)) allCongruent = false;
    }
    if (triangles.length < 2) continue;
    classes.push({ kind: allCongruent ? 'congruent' : 'similar', triangles });
  }
  classes.sort((a, b) => a.triangles[0].join('').localeCompare(b.triangles[0].join('')));
  return classes;
}

/**
 * Classify the named shapes forced across a PRE-COMPUTED set of samples. Split out from
 * {@link detectShapesAcross} so a caller that needs the UI to stay responsive can sample in chunks
 * (yielding to the event loop between batches — a coupled figure's driven-constraint solve is ~15 ms
 * per evaluate, and 16+ of them would otherwise freeze the main thread) and then run this pure, fast
 * classification. `samples` must already be `convergedSamples`-filtered by the caller.
 */
export function classifyShapesFromSamples(c0: Construction, samples: Map<Id, Vec>[], opts: ShapeDetectOptions = {}): ShapesResult {
  const lengthTol = opts.lengthTol ?? 1e-3;
  const angleTol = opts.angleTol ?? (Math.PI / 180) * 0.5;
  if (samples.length === 0) return { shapes: [], similar: [], samplesUsed: 0 };

  const shapes: DetectedShape[] = [];
  const seen = new Set<string>(); // dedup by (type | sorted-vertex-set)
  const add = (type: ShapeType, vertices: Id[], label: string) => {
    const key = `${type}|${[...vertices].sort().join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    shapes.push({ type, vertices, label });
  };
  // Every non-degenerate triangle in the figure (declared + emergent), deduped by vertex SET — the candidate
  // pool for similar/congruent-class detection (ADR-224). Collected regardless of whether the triangle earns
  // a shape badge (a GENERIC triangle earns no badge but can still be similar to another). Capped so a very
  // dense figure can't blow up the O(n²) pairing (the emergent enumeration is already gated by adj.size ≤ 16).
  const triList: TriSample[] = [];
  const triSeen = new Set<string>();
  const TRI_CAP = 64;
  const addTri = (verts: Id[], per: Vec[][]) => {
    if (verts.length !== 3 || triList.length >= TRI_CAP) return;
    const key = [...verts].sort().join(',');
    if (triSeen.has(key)) return;
    triSeen.add(key);
    triList.push({ verts, per });
  };

  for (const o of c0.objects) {
    if (o.kind === 'polygon') {
      const poly = o as Polygon;
      const perSample: Vec[][] = [];
      let usable = true;
      for (const pos of samples) {
        const pts = polyPoints(poly.vertices, pos);
        if (!pts) { usable = false; break; }
        perSample.push(pts);
      }
      if (!usable) continue;
      const label = poly.vertices.join('');
      if (poly.vertices.length === 4) {
        const t = classifyQuad(perSample, lengthTol, angleTol);
        if (t) add(t, poly.vertices, label);
      } else if (poly.vertices.length === 3) {
        // A generic triangle (no forced equal side / right / special angle) gets no badge — same
        // conservative rule as the emergent path below. A figure sprouts many incidental triangles
        // (diagonals, cevians, midsegments); badging every plain one floods the panel and buries the
        // shapes that carry a specific theorem. The general triangle-family theorems still surface from
        // the FACT (`table.ts` reads typed `triangle` commands directly), so nothing is lost by dropping
        // the redundant generic badge (operator 2026-07-04).
        const t = classifyTriangle(perSample, lengthTol, angleTol);
        if (t !== 'triangle') add(t, poly.vertices, label);
        addTri(poly.vertices, perSample); // collect for similar/congruent-class detection (badge or not)
      }
      // n > 4 (e.g. a regular pentagon): no book page yet — TODO when those pages exist.
    } else if (o.kind === 'circle') {
      const circ = o as Circle;
      if (circ.hidden) continue; // a hidden "cyclic" circle isn't drawn → no badge
      add('circle', [circ.center], circ.center);
    }
  }

  // Emergent polygons — triangle/quad cycles over the implicit edge graph that were never declared as
  // a `polygon` (e.g. a parallelogram between segments). Conservative: only keep a NAMED special type
  // (a generic quad classifies to null and is dropped; a generic emergent triangle is dropped too).
  // The emergent-cycle universe also gets collinear MERGES (through-edges across a point sitting on a side,
  // e.g. `C–E` when `D` is on the straight line C–D–E) so a polygon whose side has a point on it — the
  // trapezoid ABCE of a parallelogram with CD extended to E — is enumerable. Scoped to shape enumeration
  // (not the shared `figureEdges`) because a through-edge duplicates an existing ray in the angle universe.
  const adj = adjacency([...figureEdges(c0, samples), ...collinearMerges(c0, samples)]);
  if (adj.size <= 16) { // perf guard: skip enumeration on a very dense figure
    const perSampleOf = (verts: Id[]): Vec[][] | null => {
      const rows: Vec[][] = [];
      for (const pos of samples) {
        const pts = polyPoints(verts, pos);
        if (!pts) return null;
        rows.push(pts);
      }
      return rows;
    };
    for (const tri of triangleCycles(adj)) {
      const per = perSampleOf(tri);
      if (!per || !isSimpleEverywhere(per)) continue;
      const t = classifyTriangle(per, lengthTol, angleTol);
      if (t !== 'triangle') add(t, tri, tri.join('')); // emergent generic triangle → no badge (conservative)
      addTri(tri, per); // collect for similar/congruent-class detection (badge or not)
    }
    for (const quad of quadCycles(adj)) {
      const per = perSampleOf(quad);
      if (!per || !isSimpleEverywhere(per)) continue;
      const t = classifyQuad(per, lengthTol, angleTol);
      if (t) add(t, quad, quad.join(''));
    }
  }

  shapes.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.label.localeCompare(b.label));
  // Similar/congruent-class detection uses a slightly looser angle tol than the shape-badge classifier: it
  // compares two INDEPENDENTLY-solved triangles' angles, so a hair of solver noise mustn't hide a real match.
  const similar = detectSimilarClasses(triList, Math.max(angleTol, (Math.PI / 180) * 1), lengthTol);
  return { shapes, similar, samplesUsed: samples.length };
}
