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

export interface Scene {
  points: ScenePoint[];
  segments: SceneSegment[];
  polygons: ScenePolygon[];
  circles: SceneCircle[];
  lines: SceneLine[];
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
export function buildScene(c: Construction, positions: Map<Id, Vec>): Scene {
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
      const center = positions.get(o.center);
      if (!center) continue;
      let r: number | undefined;
      if (o.radius.via === 'length') r = o.radius.value;
      else {
        const p = positions.get(o.radius.point);
        if (p) r = dist(center, p);
      }
      if (r !== undefined && isFinite(r) && r > 0) circles.push({ id: o.id, center, r });
    }
  }

  // Visible lines (a standalone tangent / bisector / perpendicular / parallel) —
  // resolved after circles so a tangent can read its circle.
  const circleMap = new Map(circles.map((c) => [c.id, c]));
  for (const o of c.objects) {
    if (o.kind !== 'line' || !o.visible) continue;
    const sl = lineGeometry(o, positions, circleMap);
    if (sl) lines.push(sl);
  }

  return { points, segments, polygons, circles, lines };
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
