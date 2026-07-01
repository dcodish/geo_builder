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
import { figureEdges, convergedSamples } from './relations';
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
  | 'circle';

export interface DetectedShape {
  type: ShapeType;
  /** The vertex ids the shape spans (a polygon's vertices, or a circle's centre id). */
  vertices: Id[];
  /** Human label — e.g. "ABCD" for a quad, "O" for a circle. */
  label: string;
}

export interface ShapesResult {
  shapes: DetectedShape[];
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
  return convergedSamples(out); // drop numerically-diverged solves so a real forced shape isn't masked (ADR-166 Am.)
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
 * Classify one triangle: the most specific of equilateral / isosceles / (general) triangle along the
 * equal-sides axis, plus the orthogonal `right-triangle` when a right angle is forced. Returns the
 * set of badge types (1 or 2 entries) — e.g. a forced right-isosceles triangle → both.
 */
function classifyTriangle(samples: Vec[][], lengthTol: number, angleTol: number): ShapeType[] {
  const all = (pred: (p: Vec[]) => boolean) => samples.every(pred);
  const s = (p: Vec[], i: number, j: number) => dist(p[i], p[j]);

  const e01 = all((p) => approxEq(s(p, 0, 1), s(p, 1, 2), lengthTol)); // |AB| = |BC|
  const e12 = all((p) => approxEq(s(p, 1, 2), s(p, 2, 0), lengthTol)); // |BC| = |CA|
  const e20 = all((p) => approxEq(s(p, 2, 0), s(p, 0, 1), lengthTol)); // |CA| = |AB|
  const equilateral = e01 && e12 && e20;
  const isosceles = e01 || e12 || e20;

  const rightAngle = all((p) => [0, 1, 2].some((i) => isRight(angleAt(p[i], p[(i + 2) % 3], p[(i + 1) % 3]), angleTol)));

  const out: ShapeType[] = [];
  out.push(equilateral ? 'equilateral-triangle' : isosceles ? 'isosceles-triangle' : 'triangle');
  if (rightAngle) out.push('right-triangle');
  return out;
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

/** A cycle is a genuine (non-degenerate, non-self-intersecting) polygon in EVERY sample. */
function isSimpleEverywhere(perSample: Vec[][]): boolean {
  for (const p of perSample) {
    if (polyArea(p) < 1e-6) return false; // degenerate / collinear
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
  'equilateral-triangle', 'isosceles-triangle', 'right-triangle', 'triangle',
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
  const lengthTol = opts.lengthTol ?? 1e-3;
  const angleTol = opts.angleTol ?? (Math.PI / 180) * 0.5;
  const c0 = constructions[0];

  const samples = samplePositions(constructions, N);
  if (samples.length === 0) return { shapes: [], samplesUsed: 0 };

  const shapes: DetectedShape[] = [];
  const seen = new Set<string>(); // dedup by (type | sorted-vertex-set)
  const add = (type: ShapeType, vertices: Id[], label: string) => {
    const key = `${type}|${[...vertices].sort().join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    shapes.push({ type, vertices, label });
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
        for (const t of classifyTriangle(perSample, lengthTol, angleTol)) add(t, poly.vertices, label);
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
  const adj = adjacency(figureEdges(c0));
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
      for (const t of classifyTriangle(per, lengthTol, angleTol)) {
        if (t === 'triangle') continue; // emergent generic triangle → no badge (conservative)
        add(t, tri, tri.join(''));
      }
    }
    for (const quad of quadCycles(adj)) {
      const per = perSampleOf(quad);
      if (!per || !isSimpleEverywhere(per)) continue;
      const t = classifyQuad(per, lengthTol, angleTol);
      if (t) add(t, quad, quad.join(''));
    }
  }

  shapes.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.label.localeCompare(b.label));
  return { shapes, samplesUsed: samples.length };
}
