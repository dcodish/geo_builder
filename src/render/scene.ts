/**
 * Scene builder (Phase 2).
 *
 * Turns the engine's output — a `Construction` plus the `positions` it computed
 * — into flat, coordinate-resolved render primitives. This is the boundary the
 * SVG component draws from: it carries no React/DOM and is fully unit-testable
 * ("figure → expected nodes"). Objects whose coordinates aren't available
 * (e.g. a segment referencing a point that failed to evaluate) are skipped
 * rather than rendered at a bogus position.
 */

import type { Construction, Id, Circle, Vec } from '@/engine/types';
import { isGeoPoint } from '@/engine/types';
import { len, rot90, sub, unit } from '@/engine/geometry';
import { resolveCircle, resolveLine, type DefiniteAngle, type RelationsResult, type ResolvedCircle } from '@/engine';

export interface ScenePoint {
  id: Id;
  pos: Vec;
  label: string;
  /**
   * Unit vector (world space, y-up) pointing into the largest angular gap
   * between the segments meeting at this vertex — i.e. the most open direction,
   * away from every incident line. The renderer places the label along it so a
   * label never sits on an edge and lands on the outer side of the figure.
   */
  labelDir: Vec;
}
export interface SceneSegment {
  id: Id;
  a: Vec;
  b: Vec;
  /** Endpoint point-ids (a named segment only — a line-derived trimmed segment leaves these unset),
   *  so the segment menu can offer "swap endpoints" (ADR-122). */
  aId?: Id;
  bId?: Id;
}
export interface ScenePolygon {
  id: Id;
  /** Vertex positions in order. */
  points: Vec[];
}

export interface SceneCircle {
  id: Id;
  center: Vec;
  r: number;
}

/** A drawn arc (world, y-up): from `from` to `to` around `center`, radius `r`. The
 *  `largeArc`/`sweep` are SVG arc flags computed for the CCW(world)→CW(screen) arc. */
export interface SceneArc {
  id: Id;
  center: Vec;
  from: Vec;
  to: Vec;
  r: number;
  largeArc: 0 | 1;
  sweep: 0 | 1;
}

/** A visible (infinite) line: a point on it and a unit direction. The renderer clips it to the view. */
export interface SceneLine {
  id: Id;
  anchor: Vec;
  dir: Vec;
}

/** A measure label to print on the figure (ADR-031): a length along a segment, an angle at a vertex. */
export interface SceneMeasure {
  kind: 'length' | 'angle' | 'area';
  /** World anchor (y-up): a segment's midpoint, an angle's vertex, or a polygon's centroid (area). */
  pos: Vec;
  /** Unit direction (y-up) to offset the text along — outward for a length, into the angle for an angle, none for area. */
  dir: Vec;
  text: string;
}

/** The figure context the parser/store provides for measure labels. */
export interface MeasureLabels {
  lengths: { a: Id; b: Id; text: string }[];
  angles: { vertex: Id; ray1: Id; ray2: Id; text: string }[];
  areas?: { ids: Id[]; text: string }[]; // a polygon's area label at its centroid (ADR-118); optional for back-compat
}

/** A user-asserted angle mark to draw: a right-angle square (`right`) or an angle arc, at `vertex`. */
export interface SceneAngleMark {
  vertex: Vec;
  p1: Vec;
  p2: Vec;
  right: boolean;
}

/** A relations-layer EQUAL-SEGMENT mark: draw `count` hatch ticks across the midpoint of segment a–b
 *  (1 tick for the first equality class, 2 for the second, …) — the standard textbook "these are equal". */
export interface SceneEqualTick {
  a: Vec;
  b: Vec;
  count: number;
}

/** A relations-layer EQUAL-ANGLE mark: draw `count` concentric arcs at `vertex` between the rays to p1, p2.
 *  `startArc` is how many arc-rings precede this mark AT THE SAME VERTEX — the renderer offsets the arcs
 *  outward by it so several equal-angle marks at one vertex don't overlap (a different class would otherwise
 *  draw at the same radius and hide the inner one). */
export interface SceneEqualAngle {
  vertex: Vec;
  p1: Vec;
  p2: Vec;
  count: number;
  startArc: number;
}

/** A relations-layer DEFINITIVE-VALUE label: print `text` (e.g. "60°") inside the angle at `vertex`. `rank`
 *  is the label's index AMONG the values sharing this vertex (0,1,2,…) — the renderer pushes higher ranks
 *  further out along the bisector so several angle values at one busy vertex don't overlap. */
export interface SceneAngleValue {
  vertex: Vec;
  p1: Vec;
  p2: Vec;
  text: string;
  rank: number;
}

export interface RelationMarks {
  ticks: SceneEqualTick[];
  angles: SceneEqualAngle[];
  values: SceneAngleValue[];
  /** Forced RIGHT angles (≈90°): drawn as a right-angle SQUARE (the "knee" symbol), the textbook notation,
   *  instead of a "90°" value label (operator request). Reuses the stated-mark square renderer. */
  rightAngles: SceneAngleMark[];
}

export interface Scene {
  points: ScenePoint[];
  segments: SceneSegment[];
  polygons: ScenePolygon[];
  circles: SceneCircle[];
  arcs: SceneArc[];
  lines: SceneLine[];
  measures: SceneMeasure[];
  angleMarks: SceneAngleMark[];
}

/** Resolve an {@link Arc} object to a drawable {@link SceneArc}, or null if a referenced point is missing/degenerate. */
function arcGeometry(center: Vec, from: Vec, to: Vec, id: Id): SceneArc | null {
  const r = len(sub(from, center));
  if (r < 1e-9) return null;
  const angA = Math.atan2(from.y - center.y, from.x - center.x);
  const angB = Math.atan2(to.y - center.y, to.x - center.x);
  let span = (angB - angA) % (2 * Math.PI); // CCW span from `from` to `to` (world, y-up)
  if (span <= 1e-9) span += 2 * Math.PI;
  // The renderer flips Y to screen (y-down), where SVG sweep-flag 1 is *clockwise*. A
  // world-CCW arc traverses right→top→left (visually counter-clockwise on screen) ⇒ sweep 0.
  return { id, center, from, to, r, largeArc: span > Math.PI ? 1 : 0, sweep: 0 };
}

/** Resolve a construction + computed positions into drawable primitives. */
export function buildScene(
  c: Construction,
  positions: Map<Id, Vec>,
  labels?: MeasureLabels,
  angleMarkSpecs?: { vertex: Id; ray1: Id; ray2: Id; right: boolean }[],
  opts?: { showCenters?: boolean; circles?: Map<Id, ResolvedCircle> },
): Scene {
  // "Show circle centres": reveal every circle's centre with its label (O, P, …), even an AUTO one
  // that nothing is drawn from — so the student can tell two unnamed circles apart and address each
  // (operator request). Default off keeps the clean FR-RN-8 behaviour (an unused auto-centre is hidden).
  const showCenters = opts?.showCenters ?? false;
  const points: ScenePoint[] = [];
  const segments: SceneSegment[] = [];
  const polygons: ScenePolygon[] = [];
  const circles: SceneCircle[] = [];
  const arcs: SceneArc[] = [];
  const lines: SceneLine[] = [];

  // Per-vertex directions to every point it shares a segment with — the lines a
  // label must avoid. Built from all segments (edges *and* diagonals) up front.
  const incident = new Map<Id, Vec[]>();
  const addIncident = (id: Id, d: Vec) => {
    const list = incident.get(id);
    if (list) list.push(d);
    else incident.set(id, [d]);
  };
  for (const o of c.objects) {
    if (o.kind !== 'segment') continue;
    const a = positions.get(o.a);
    const b = positions.get(o.b);
    if (!a || !b) continue;
    addIncident(o.a, unit(sub(b, a)));
    addIncident(o.b, unit(sub(a, b)));
  }

  // An AUTO-assigned circle centre (circumcentre, incentre, a defaulted "two circles" centre) is
  // drawn only when other geometry uses it — i.e. something is drawn FROM it (a radius, a central
  // angle's arm). A centre the student NAMED ("circle O") is not auto, so it's always drawn.
  const autoCenters = new Set<Id>();
  for (const o of c.objects) if (o.kind === 'circle' && o.autoCenter) autoCenters.add(o.center);

  // Resolve every circle to centre+radius. Prefer the ENGINE's PUBLISHED map (`evaluate` already solved
  // every free / tangent-inner radius — ADR-200/D2): the renderer is a pure consumer and no longer
  // reconstructs a solver-driven free radius from a point on the circle. The CENTRE is read from the
  // (already view-oriented) positions so it tracks a flip/rotation; the radius is a scalar, so the
  // engine's orientation-invariant value is correct as-is. Direct callers that don't thread the map
  // (some unit tests) fall back to the object's own resolver — correct for a declared `length`/`through`
  // radius; a free radius then draws its seed (those tests supply the map when the solved value matters).
  const resolvedCircles = new Map<Id, ResolvedCircle>();
  {
    const circleObjs = c.objects.filter((o): o is Circle => o.kind === 'circle');
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const o of circleObjs) {
        if (resolvedCircles.has(o.id)) continue;
        const published = opts?.circles?.get(o.id);
        const center = positions.get(o.center);
        if (published && center) {
          resolvedCircles.set(o.id, { center, r: published.r });
          progressed = true;
          continue;
        }
        const rc = resolveCircle(o, positions, resolvedCircles); // fallback: the object's declared radius
        if (rc === 'pending' || typeof rc === 'string') continue; // missing point / invalid → not drawn
        resolvedCircles.set(o.id, rc);
        progressed = true;
      }
    }
  }

  for (const o of c.objects) {
    if (isGeoPoint(o)) {
      if (o.id.startsWith('~')) continue; // hidden helper (a coincidence target, ADR-028) — not drawn
      if (autoCenters.has(o.id) && !incident.has(o.id) && !showCenters) continue; // an unused auto-centre — hidden unless "show centres" is on
      const pos = positions.get(o.id);
      if (pos) points.push({ id: o.id, pos, label: o.id, labelDir: outwardDir(incident.get(o.id)) });
      continue;
    }
    if (o.kind === 'segment') {
      const a = positions.get(o.a);
      const b = positions.get(o.b);
      if (a && b) segments.push({ id: o.id, a, b, aId: o.a, bId: o.b });
      continue;
    }
    if (o.kind === 'polygon') {
      const pts = o.vertices.map((v) => positions.get(v));
      if (pts.every((p): p is Vec => !!p)) {
        polygons.push({ id: o.id, points: pts as Vec[] });
      }
      continue;
    }
    if (o.kind === 'circle') {
      if (o.hidden) continue; // a cyclic polygon's circumcircle: constrains the vertices, not drawn
      const rc = resolvedCircles.get(o.id);
      if (rc && isFinite(rc.r) && rc.r > 0) circles.push({ id: o.id, center: rc.center, r: rc.r });
    }
    if (o.kind === 'arc') {
      const center = positions.get(o.center);
      const from = positions.get(o.from);
      const to = positions.get(o.to);
      if (center && from && to) {
        const a = arcGeometry(center, from, to, o.id);
        if (a) arcs.push(a);
      }
    }
  }

  // Visible lines (a tangent / bisector / perpendicular / parallel), resolved via the engine's
  // own resolver (one source of truth, ADR-044) using the circle map above so a tangent can read
  // its circle. A line with TWO+ named points on it is drawn as the SEGMENT spanning them (trim an
  // infinite line to its useful extent — a tangent from its touch point to where it meets a chord,
  // a bisector from its vertex to the side it hits); with 0–1 points it stays an infinite (clipped)
  // line, since it has no natural endpoints.
  // Span-relative incidence epsilon (F7/REN-8): the old absolute 1e-5 was scale-dependent — a figure whose
  // free radius grew to hundreds of units stopped recognising its own on-line points, while a tiny figure
  // could trim through near-misses. Normalize by the figure's diagonal.
  const spanDiag = (() => {
    if (!points.length) return 1;
    let nx = Infinity, ny = Infinity, xx = -Infinity, xy = -Infinity;
    for (const p of points) {
      nx = Math.min(nx, p.pos.x); ny = Math.min(ny, p.pos.y);
      xx = Math.max(xx, p.pos.x); xy = Math.max(xy, p.pos.y);
    }
    return Math.hypot(xx - nx, xy - ny) || 1;
  })();
  const onLineEps = Math.max(1e-9, 1e-6 * spanDiag);
  for (const o of c.objects) {
    if (o.kind !== 'line' || !o.visible) continue;
    const rl = resolveLine(o, positions, resolvedCircles);
    if (rl === 'pending' || typeof rl === 'string') continue;
    const sl: SceneLine = { id: o.id, anchor: rl.anchor, dir: rl.dir };
    const on: { t: number; p: Vec }[] = [];
    for (const pt of points) {
      const w = sub(pt.pos, sl.anchor);
      const perp = w.x * sl.dir.y - w.y * sl.dir.x; // signed distance from the line
      if (Math.abs(perp) < onLineEps) on.push({ t: w.x * sl.dir.x + w.y * sl.dir.y, p: pt.pos });
    }
    if (on.length >= 2) {
      on.sort((p, q) => p.t - q.t);
      segments.push({ id: sl.id, a: on[0].p, b: on[on.length - 1].p }); // trimmed to the extreme points on it
    } else {
      lines.push(sl); // unbounded → an infinite clipped line
    }
  }

  // Measure labels (ADR-031): a length sits at its segment's midpoint, nudged
  // perpendicular to the OUTSIDE (away from the figure's centroid); an angle sits
  // at its vertex, nudged along the interior bisector of its two rays.
  const measures: SceneMeasure[] = [];
  if (labels) {
    const cen = points.length
      ? { x: points.reduce((s, p) => s + p.pos.x, 0) / points.length, y: points.reduce((s, p) => s + p.pos.y, 0) / points.length }
      : { x: 0, y: 0 };
    for (const L of labels.lengths) {
      const a = positions.get(L.a);
      const b = positions.get(L.b);
      if (!a || !b) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let perp = unit(rot90(sub(b, a)));
      if ((mid.x - cen.x) * perp.x + (mid.y - cen.y) * perp.y < 0) perp = { x: -perp.x, y: -perp.y }; // outward
      measures.push({ kind: 'length', pos: mid, dir: perp, text: L.text });
    }
    for (const A of labels.angles) {
      const v = positions.get(A.vertex);
      const r1 = positions.get(A.ray1);
      const r2 = positions.get(A.ray2);
      if (!v || !r1 || !r2) continue;
      const d1 = unit(sub(r1, v));
      const d2 = unit(sub(r2, v));
      let bis = { x: d1.x + d2.x, y: d1.y + d2.y };
      bis = len(bis) < 1e-9 ? rot90(d1) : unit(bis); // a straight angle → perpendicular
      measures.push({ kind: 'angle', pos: v, dir: bis, text: A.text });
    }
    // An area label sits at the polygon's centroid (ADR-118) — no offset direction.
    for (const Ar of labels.areas ?? []) {
      const verts = Ar.ids.map((id) => positions.get(id)).filter((p): p is Vec => !!p);
      if (verts.length < 3) continue;
      const c = { x: verts.reduce((s, p) => s + p.x, 0) / verts.length, y: verts.reduce((s, p) => s + p.y, 0) / verts.length };
      measures.push({ kind: 'area', pos: c, dir: { x: 0, y: 0 }, text: Ar.text });
    }
  }

  // Angle marks the student asserted — resolve each to its vertex + two ray points (world coords).
  const angleMarks: SceneAngleMark[] = [];
  for (const m of angleMarkSpecs ?? []) {
    const v = positions.get(m.vertex);
    const p1 = positions.get(m.ray1);
    const p2 = positions.get(m.ray2);
    if (v && p1 && p2 && len(sub(p1, v)) > 1e-9 && len(sub(p2, v)) > 1e-9) angleMarks.push({ vertex: v, p1, p2, right: m.right });
  }

  return { points, segments, polygons, circles, arcs, lines, measures, angleMarks };
}

/**
 * The bisector of the widest angular gap between the given directions — the most
 * open direction around a vertex. With no incident lines it defaults to up-right;
 * with one it points opposite; with two collinear it points perpendicular. This
 * is what keeps a label off the figure's edges and on its outer side.
 */
function outwardDir(dirs: Vec[] | undefined): Vec {
  if (!dirs || dirs.length === 0) return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const angles = dirs.map((d) => Math.atan2(d.y, d.x)).sort((p, q) => p - q);
  let bestStart = angles[0];
  let bestGap = -1;
  for (let i = 0; i < angles.length; i++) {
    const a0 = angles[i];
    const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    const gap = a1 - a0;
    if (gap > bestGap) {
      bestGap = gap;
      bestStart = a0;
    }
  }
  const mid = bestStart + bestGap / 2;
  return { x: Math.cos(mid), y: Math.sin(mid) };
}

/**
 * Every position the fit must enclose — the points, plus each circle's extent
 * (centre ± r on both axes) so a circle is never clipped by the viewport even
 * when few points lie on it.
 */
export function scenePositions(scene: Scene): Vec[] {
  const ps = scene.points.map((p) => p.pos);
  for (const c of scene.circles) {
    ps.push({ x: c.center.x - c.r, y: c.center.y }, { x: c.center.x + c.r, y: c.center.y });
    ps.push({ x: c.center.x, y: c.center.y - c.r }, { x: c.center.x, y: c.center.y + c.r });
  }
  // An arc's extent: its endpoints plus any axis-extreme (0/90/180/270°) the arc actually sweeps.
  for (const a of scene.arcs) {
    ps.push(a.from, a.to);
    const angA = Math.atan2(a.from.y - a.center.y, a.from.x - a.center.x);
    let span = (Math.atan2(a.to.y - a.center.y, a.to.x - a.center.x) - angA) % (2 * Math.PI);
    if (span <= 1e-9) span += 2 * Math.PI;
    for (let k = 0; k < 4; k++) {
      const ca = (k * Math.PI) / 2;
      let d = (ca - angA) % (2 * Math.PI);
      if (d < 0) d += 2 * Math.PI;
      if (d <= span + 1e-9) ps.push({ x: a.center.x + a.r * Math.cos(ca), y: a.center.y + a.r * Math.sin(ca) });
    }
  }
  return ps;
}

/**
 * Resolve a {@link RelationsResult} + the current `positions` into world-space marks the renderer draws
 * (the "view relations" layer, [ADR-134](docs/06-decisions.md#adr-134)). The equality-class INDEX picks the
 * tick/arc count — class 0 → 1 mark, class 1 → 2, … — so each equal-group reads as a distinct textbook
 * notation. The relation says WHICH ids are equal; the marks are placed on the CURRENT drawing's positions.
 * A degenerate or missing endpoint is skipped rather than drawn at a bogus spot (mirrors the scene builder).
 */
export function relationMarks(relations: RelationsResult, positions: Map<Id, Vec>): RelationMarks {
  const ticks: SceneEqualTick[] = [];
  relations.equalSegments.forEach((cls, i) => {
    for (const [a, b] of cls) {
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (pa && pb && len(sub(pa, pb)) > 1e-9) ticks.push({ a: pa, b: pb, count: i + 1 });
    }
  });
  // Value labels + right-angle squares FIRST (definite measures), so the equal-angle arcs below can skip any
  // angle whose value is already shown — an angle drawn as "60°" (or a right-angle knee) needs no ALSO-equal
  // arc: two angles both labelled the same number already read as equal, and stacking an arc on top double-
  // marks them (the operator's "DEC and ECB show twice as equal"). Ranked PER VERTEX (smallest first →
  // tightest near the corner) so several values at one busy vertex stagger and don't overlap. A COMPOSITE
  // angle (= the sum of finer definite parts at the same vertex) is dropped first — the student reads it
  // from the parts.
  const values: SceneAngleValue[] = [];
  const rightAngles: SceneAngleMark[] = [];
  const perVertex = new Map<Id, number>();
  // Identify an angle by its WEDGE — the vertex plus its two ray DIRECTIONS (from the drawn positions), not
  // by the point IDS. So two angles that are the SAME corner but named through different collinear points —
  // ∠AFD and ∠GFH when H lies on FA and G on FD — collapse to one wedge, and "60°" is drawn once instead of
  // "60° 60°". Matching is a TOLERANCE predicate (±1.5° per ray, with 360° wrap), not integer-rounded keys:
  // rounding put a hard quantization boundary mid-wedge, so 59.49° vs 59.51° rays of the same corner keyed
  // differently and double-drew (F7/REN-9).
  const wedgeOf = (v: Id, a: Id, b: Id): { v: Id; d1: number; d2: number } | null => {
    const pv = positions.get(v), pa = positions.get(a), pb = positions.get(b);
    if (!pv || !pa || !pb) return null;
    const deg = (p: Vec) => ((Math.atan2(p.y - pv.y, p.x - pv.x) * 180) / Math.PI + 360) % 360;
    const [d1, d2] = [deg(pa), deg(pb)].sort((m, n) => m - n);
    return { v, d1, d2 };
  };
  const angNear = (x: number, y: number): boolean => {
    const d = Math.abs(x - y) % 360;
    return Math.min(d, 360 - d) <= 1.5;
  };
  const shownWedges: { v: Id; d1: number; d2: number }[] = []; // wedges whose definite value/right-angle is displayed
  const isShown = (w: { v: Id; d1: number; d2: number }): boolean =>
    shownWedges.some((s) => s.v === w.v && ((angNear(s.d1, w.d1) && angNear(s.d2, w.d2)) || (angNear(s.d1, w.d2) && angNear(s.d2, w.d1))));
  for (const { vertex, a, b, valueDeg } of atomicDefiniteAngles(relations.definiteAngles).sort((x, y) => x.valueDeg - y.valueDeg)) {
    const pv = positions.get(vertex);
    const pa = positions.get(a);
    const pb = positions.get(b);
    if (pv && pa && pb && len(sub(pa, pv)) > 1e-9 && len(sub(pb, pv)) > 1e-9) {
      const wk = wedgeOf(vertex, a, b);
      if (wk && isShown(wk)) continue; // this corner is already labelled (∠AFD == ∠GFH via collinear points)
      if (wk) shownWedges.push(wk);
      // A forced 90° draws the textbook right-angle SQUARE (the "knee"), not a "90°" number (operator request).
      if (Math.abs(valueDeg - 90) < 0.5) {
        rightAngles.push({ vertex: pv, p1: pa, p2: pb, right: true });
        continue;
      }
      const rank = perVertex.get(vertex) ?? 0;
      perVertex.set(vertex, rank + 1);
      values.push({ vertex: pv, p1: pa, p2: pb, text: formatDeg(valueDeg), rank });
    }
  }
  // Equal-angle arcs, staggered per vertex: each mark starts beyond the rings already drawn at its vertex
  // (its own `count` rings + a 1-ring gap), so two marks at one vertex (e.g. ∠BDE and ∠ADE) never collide.
  // An angle already shown as a definite value/right-angle is dropped (no double-mark); a class left with
  // fewer than two members then carries no equality and is skipped entirely. Classes are renumbered over the
  // SURVIVING ones so the arc-stroke counts stay 1,2,3… (no gaps from fully-suppressed classes).
  const angles: SceneEqualAngle[] = [];
  const perVertexArcs = new Map<Id, number>();
  let drawnClass = 0;
  for (const cls of relations.equalAngles) {
    const visible = cls.filter((r) => { const wk = wedgeOf(r.vertex, r.a, r.b); return !(wk && isShown(wk)); });
    if (visible.length < 2) continue; // every (or all-but-one) member is already shown as a value
    const count = ++drawnClass;
    for (const { vertex, a, b } of visible) {
      const pv = positions.get(vertex);
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (pv && pa && pb && len(sub(pa, pv)) > 1e-9 && len(sub(pb, pv)) > 1e-9) {
        const startArc = perVertexArcs.get(vertex) ?? 0;
        perVertexArcs.set(vertex, startArc + count + 1); // +1 ring of separation before the next mark here
        angles.push({ vertex: pv, p1: pa, p2: pb, count, startArc });
      }
    }
  }
  return { ticks, angles, values, rightAngles };
}

/** A definitive angle value for display: an integer when it's within 0.1° of one (60°), else one decimal. */
function formatDeg(v: number): string {
  const rounded = Math.round(v);
  return `${Math.abs(v - rounded) < 0.1 ? rounded : v.toFixed(1)}°`;
}

// ── Hover-to-focus picking (the "explore equals on the diagram" interaction, ADR-167 Am.) ──────────────
// The relations layer is a firehose when a figure is rich (every equal-length tick + equal-angle arc at once).
// Instead of painting all of it, the canvas lets the student hover a side/angle to reveal ONLY its equality
// class. These pure helpers answer "which relation class is under this world point?" — unit-testable, no DOM.

/** Which relation the student is pointing at: one equality CLASS (its index into equalSegments/equalAngles). */
export interface RelationPick {
  kind: 'segment' | 'angle';
  classIndex: number;
}

/** Distance from point `p` to the segment `a–b` (clamped to the segment, not the infinite line). */
function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether direction to `p` from vertex `v` lies inside the (≤180°) wedge from ray→a to ray→b. */
function inWedge(p: Vec, v: Vec, a: Vec, b: Vec): boolean {
  const norm = (x: number) => { let y = x; while (y <= -Math.PI) y += 2 * Math.PI; while (y > Math.PI) y -= 2 * Math.PI; return y; };
  const av = Math.atan2(a.y - v.y, a.x - v.x);
  const bv = Math.atan2(b.y - v.y, b.x - v.x);
  const pv = Math.atan2(p.y - v.y, p.x - v.x);
  const span = norm(bv - av);
  if (Math.abs(span) > Math.PI - 1e-9) return false; // a straight/reflex wedge carries no angle to point at
  const rel = norm(pv - av);
  return rel >= Math.min(0, span) - 1e-9 && rel <= Math.max(0, span) + 1e-9;
}

/**
 * The equality class nearest to `world` (an oriented-space math point), or null if nothing is within reach.
 * A SEGMENT is picked by perpendicular distance to any of its members (≤ `segReach`); an ANGLE by pointing
 * INTO its wedge near the vertex (≤ `vertReach` from the vertex). When both are candidates the closer wins,
 * so hovering ON a line selects the length class and hovering in an open corner selects the angle class.
 */
export function relationAt(
  relations: RelationsResult,
  positions: Map<Id, Vec>,
  world: Vec,
  segReach: number,
  vertReach: number,
): RelationPick | null {
  let bestD = Infinity;
  let bestPick: RelationPick | null = null;
  const consider = (d: number, reach: number, pick: RelationPick) => {
    if (d <= reach && d < bestD) { bestD = d; bestPick = pick; }
  };
  relations.equalSegments.forEach((cls, i) => {
    for (const [a, b] of cls) {
      const pa = positions.get(a), pb = positions.get(b);
      if (pa && pb) consider(distToSegment(world, pa, pb), segReach, { kind: 'segment', classIndex: i });
    }
  });
  relations.equalAngles.forEach((cls, j) => {
    for (const { vertex, a, b } of cls) {
      const pv = positions.get(vertex), pa = positions.get(a), pb = positions.get(b);
      if (!pv || !pa || !pb) continue;
      if (!inWedge(world, pv, pa, pb)) continue;
      consider(Math.hypot(world.x - pv.x, world.y - pv.y), vertReach, { kind: 'angle', classIndex: j });
    }
  });
  return bestPick;
}

/** Narrow a full RelationsResult to a single hovered class — everything else emptied — so `relationMarks`
 *  draws ONLY that class's marks (the hover-focus render). Definitive angle VALUES are kept (they're facts,
 *  not clutter) so a hovered angle can still show its measure. */
export function relationsForPick(relations: RelationsResult, pick: RelationPick): RelationsResult {
  if (pick.kind === 'segment') {
    const cls = relations.equalSegments[pick.classIndex];
    return { equalSegments: cls ? [cls] : [], equalAngles: [], definiteAngles: [], samplesUsed: relations.samplesUsed };
  }
  const cls = relations.equalAngles[pick.classIndex];
  return { equalSegments: [], equalAngles: cls ? [cls] : [], definiteAngles: relations.definiteAngles, samplesUsed: relations.samplesUsed };
}

/**
 * Keep only the ATOMIC definite angles — drop one that is the SUM of two finer definite angles at the same
 * vertex (∠ABD = ∠ABC + ∠CBD, all three forced), since the student reads the total from the parts. The
 * value-sum test (`vac + vcb ≈ vab`) implies the splitter ray C lies inside the wedge, so no ray directions
 * are needed; a composite tiled into 3+ parts is dropped too (each 2-split it contains is definite). (ADR-134.)
 */
function atomicDefiniteAngles(defs: DefiniteAngle[]): DefiniteAngle[] {
  const key = (x: Id, y: Id) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const byVertex = new Map<Id, DefiniteAngle[]>();
  for (const d of defs) (byVertex.get(d.vertex) ?? byVertex.set(d.vertex, []).get(d.vertex)!).push(d);
  return defs.filter((d) => {
    const sib = byVertex.get(d.vertex)!;
    const val = new Map(sib.map((s) => [key(s.a, s.b), s.valueDeg]));
    const endpoints = new Set(sib.flatMap((s) => [s.a, s.b]));
    for (const c of endpoints) {
      if (c === d.a || c === d.b) continue;
      const vac = val.get(key(d.a, c));
      const vcb = val.get(key(c, d.b));
      if (vac !== undefined && vcb !== undefined && Math.abs(vac + vcb - d.valueDeg) < 0.2) return false; // composite
    }
    return true;
  });
}
