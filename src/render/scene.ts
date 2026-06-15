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

import type { Construction, Id, Line, Vec } from '@/engine/types';
import { isGeoPoint } from '@/engine/types';
import { add, dist, len, rot90, sub, unit } from '@/engine/geometry';

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

/** A visible (infinite) line: a point on it and a unit direction. The renderer clips it to the view. */
export interface SceneLine {
  id: Id;
  anchor: Vec;
  dir: Vec;
}

/** A measure label to print on the figure (ADR-031): a length along a segment, an angle at a vertex. */
export interface SceneMeasure {
  kind: 'length' | 'angle';
  /** World anchor (y-up): a segment's midpoint, or an angle's vertex. */
  pos: Vec;
  /** Unit direction (y-up) to offset the text along — outward for a length, into the angle for an angle. */
  dir: Vec;
  text: string;
}

/** The figure context the parser/store provides for measure labels. */
export interface MeasureLabels {
  lengths: { a: Id; b: Id; text: string }[];
  angles: { vertex: Id; ray1: Id; ray2: Id; text: string }[];
}

/** A user-asserted angle mark to draw: a right-angle square (`right`) or an angle arc, at `vertex`. */
export interface SceneAngleMark {
  vertex: Vec;
  p1: Vec;
  p2: Vec;
  right: boolean;
}

export interface Scene {
  points: ScenePoint[];
  segments: SceneSegment[];
  polygons: ScenePolygon[];
  circles: SceneCircle[];
  lines: SceneLine[];
  measures: SceneMeasure[];
  angleMarks: SceneAngleMark[];
}

/**
 * Resolve a visible {@link Line} to (anchor, dir) from computed positions —
 * mirrors the engine's `resolveLine` (kept here because lines are a rendering
 * concern; the engine doesn't expose its internal resolution). null if it can't.
 */
function lineGeometry(line: Line, pos: Map<Id, Vec>, circles: Map<Id, SceneCircle>): SceneLine | null {
  const s = line.spec;
  const g = (id: Id) => pos.get(id);
  if (s.via === 'through') {
    const a = g(s.a), b = g(s.b);
    if (!a || !b || len(sub(b, a)) < 1e-9) return null;
    return { id: line.id, anchor: a, dir: unit(sub(b, a)) };
  }
  if (s.via === 'bisector') {
    const v = g(s.vertex), p = g(s.p), q = g(s.q);
    if (!v || !p || !q) return null;
    const bis = add(unit(sub(p, v)), unit(sub(q, v)));
    if (len(bis) < 1e-9) return null;
    return { id: line.id, anchor: v, dir: unit(bis) };
  }
  if (s.via === 'perpendicular' || s.via === 'parallel') {
    const t = g(s.through), a = g(s.a), b = g(s.b);
    if (!t || !a || !b || len(sub(b, a)) < 1e-9) return null;
    const d = unit(sub(b, a));
    return { id: line.id, anchor: t, dir: s.via === 'perpendicular' ? rot90(d) : d };
  }
  // tangent: ⟂ to the radius at the touch point
  const c = circles.get(s.circle);
  const at = g(s.at);
  if (!c || !at || len(sub(at, c.center)) < 1e-9) return null;
  return { id: line.id, anchor: at, dir: unit(rot90(sub(at, c.center))) };
}

/** Resolve a construction + computed positions into drawable primitives. */
export function buildScene(
  c: Construction,
  positions: Map<Id, Vec>,
  labels?: MeasureLabels,
  angleMarkSpecs?: { vertex: Id; ray1: Id; ray2: Id; right: boolean }[],
): Scene {
  const points: ScenePoint[] = [];
  const segments: SceneSegment[] = [];
  const polygons: ScenePolygon[] = [];
  const circles: SceneCircle[] = [];
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

  for (const o of c.objects) {
    if (isGeoPoint(o)) {
      if (o.id.startsWith('~')) continue; // hidden helper (a coincidence target, ADR-028) — not drawn
      const pos = positions.get(o.id);
      if (pos) points.push({ id: o.id, pos, label: o.id, labelDir: outwardDir(incident.get(o.id)) });
      continue;
    }
    if (o.kind === 'segment') {
      const a = positions.get(o.a);
      const b = positions.get(o.b);
      if (a && b) segments.push({ id: o.id, a, b });
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
      const center = positions.get(o.center);
      if (!center) continue;
      let r: number | undefined;
      if (o.radius.via === 'length') r = o.radius.value;
      else if (o.radius.via === 'tangent-inner') {
        // Derived: the largest circle inside `outer`, tangent to it (r = r(outer) − gap).
        const outerSpec = o.radius.outer;
        const outer = c.objects.find((x) => x.id === outerSpec && x.kind === 'circle') as Extract<typeof o, { kind: 'circle' }> | undefined;
        const oc = outer ? positions.get(outer.center) : undefined;
        if (outer && oc && outer.radius.via === 'length') {
          const ri = outer.radius.value - dist(center, oc);
          if (ri > 0) r = ri;
        }
      } else {
        const p = positions.get(o.radius.point);
        if (p) r = dist(center, p);
      }
      if (r !== undefined && isFinite(r) && r > 0) circles.push({ id: o.id, center, r });
    }
  }

  // Visible lines (a tangent / bisector / perpendicular / parallel), resolved
  // after circles so a tangent can read its circle. A line with TWO+ named points
  // on it is drawn as the SEGMENT spanning them (trim an infinite line to its
  // useful extent — a tangent from its touch point to where it meets a chord, a
  // bisector from its vertex to the side it hits); with 0–1 points it stays an
  // infinite (clipped) line, since it has no natural endpoints.
  const circleMap = new Map(circles.map((c) => [c.id, c]));
  for (const o of c.objects) {
    if (o.kind !== 'line' || !o.visible) continue;
    const sl = lineGeometry(o, positions, circleMap);
    if (!sl) continue;
    const on: { t: number; p: Vec }[] = [];
    for (const pt of points) {
      const w = sub(pt.pos, sl.anchor);
      const perp = w.x * sl.dir.y - w.y * sl.dir.x; // signed distance from the line
      if (Math.abs(perp) < 1e-5) on.push({ t: w.x * sl.dir.x + w.y * sl.dir.y, p: pt.pos });
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
  }

  // Angle marks the student asserted — resolve each to its vertex + two ray points (world coords).
  const angleMarks: SceneAngleMark[] = [];
  for (const m of angleMarkSpecs ?? []) {
    const v = positions.get(m.vertex);
    const p1 = positions.get(m.ray1);
    const p2 = positions.get(m.ray2);
    if (v && p1 && p2 && len(sub(p1, v)) > 1e-9 && len(sub(p2, v)) > 1e-9) angleMarks.push({ vertex: v, p1, p2, right: m.right });
  }

  return { points, segments, polygons, circles, lines, measures, angleMarks };
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
  return ps;
}
