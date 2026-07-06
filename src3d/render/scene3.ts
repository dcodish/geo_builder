/**
 * Pure scene builder (docs/20 §6.4): Construction3 + positions + camera + viewport
 * → flat 2-D SVG primitives. No React, no DOM — fully unit-testable, and the
 * renderer component is a dumb map over the output (the 2-D tool's proven split).
 *
 * Hidden-edge rule (V0, convex solids): a solid's face is front-facing iff its
 * OUTWARD normal points toward the camera; an edge is drawn dashed iff every face
 * it borders is back-facing. Outward orientation is derived numerically (normal
 * flipped to point away from the solid's centroid) so face-ring order can't be
 * a silent bug source. Exact for convex solids; plane patches come later and
 * never occlude (docs/20 §11).
 */

import type { Construction3, Id, Positions3 } from '../engine/types';
import { centroid3, cross3, dot3, lerp3, normalize3, sub3, type Vec3 } from '../engine/vec3';
import { cameraFrame, project3, type Camera3 } from './camera';

export interface ScenePoint3 {
  id: Id;
  x: number;
  y: number;
  /** Typographic label — prime rendered as ′. */
  label: string;
  labelDx: number;
  labelDy: number;
}

export interface SceneEdge3 {
  id: string;
  a: Id;
  b: Id;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hidden: boolean;
}

/**
 * A named vector's on-figure notation (ADR-3D-003, amended per operator: the
 * ARROWHEAD sits at the HEAD — e.g. at A′ for AA′ — and the vector is drawn in
 * its own colour so tail and head are unmistakable): a coloured overlay line
 * along the full from→to segment ending in an arrowhead at `to`, plus the name
 * label beside the midpoint in the textbook style — the letter with an ARROW
 * ABOVE and an UNDERLINE, in the same colour.
 */
export interface SceneVector3 {
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The vector rides a hidden edge / interior segment — its overlay dashes too (depth cue kept). */
  hidden: boolean;
  labelX: number;
  labelY: number;
  /** Screen-space direction of the vector, degrees (for the arrowhead's rotation at `to`). */
  angleDeg: number;
}

export interface Scene3 {
  points: ScenePoint3[];
  edges: SceneEdge3[];
  vectors: SceneVector3[];
}

export interface Viewport {
  width: number;
  height: number;
}

const MARGIN = 44;
const LABEL_OFFSET = 15;

export const displayLabel = (id: Id): string => id.replace(/'/g, '′');

const edgeKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** World-space face normal (first-two-edges cross), oriented OUTWARD from `center`. */
function outwardNormal(ring: Vec3[], center: Vec3): Vec3 {
  const n = cross3(sub3(ring[1], ring[0]), sub3(ring[2], ring[0]));
  const toFace = sub3(centroid3(ring), center);
  return dot3(n, toFace) >= 0 ? n : { x: -n.x, y: -n.y, z: -n.z };
}

/** Set of edge keys hidden from this camera (both bordering faces back-facing). */
export function hiddenEdgeKeys(c: Construction3, positions: Positions3, cam: Camera3): Set<string> {
  const { eye } = cameraFrame(cam);
  const hidden = new Set<string>();

  for (const solid of c.solids) {
    const center = centroid3(solid.ids.map((id) => positions.get(id)!));
    // edge key → is any bordering face front-facing?
    const anyFront = new Map<string, boolean>();
    for (const face of solid.faces) {
      const ring = face.map((id) => positions.get(id)!);
      const front = dot3(outwardNormal(ring, center), eye) > 1e-12;
      for (let i = 0; i < face.length; i++) {
        const k = edgeKey(face[i], face[(i + 1) % face.length]);
        anyFront.set(k, (anyFront.get(k) ?? false) || front);
      }
    }
    for (const [a, b] of solid.edges) {
      const k = edgeKey(a, b);
      if (anyFront.get(k) === false) hidden.add(k);
    }
  }
  return hidden;
}

/**
 * Is an auxiliary segment drawn DASHED? The textbook convention (docs/20 §6.4):
 * a construction line running through a solid's interior is dashed (the solid
 * body would occlude it), and one lying ON a face is dashed iff every face it
 * lies on is back-facing (e.g. a bottom-face diagonal). Judged at the segment's
 * midpoint — exact for a straight segment against convex solids.
 */
export function auxSegmentHidden(c: Construction3, positions: Positions3, a: Id, b: Id, cam: Camera3): boolean {
  const pa = positions.get(a);
  const pb = positions.get(b);
  if (!pa || !pb) return false;
  const mid = lerp3(pa, pb, 0.5);
  const { eye } = cameraFrame(cam);
  const EPS = 1e-7;

  for (const solid of c.solids) {
    const center = centroid3(solid.ids.map((id) => positions.get(id)!));
    let inside = true;
    let onAnyFrontFace = false;
    let onAnyFace = false;
    for (const face of solid.faces) {
      const ring = face.map((id) => positions.get(id)!);
      const n = normalize3(outwardNormal(ring, center));
      const d = dot3(n, sub3(mid, ring[0]));
      if (d > EPS) {
        inside = false;
        break;
      }
      if (Math.abs(d) <= EPS) {
        onAnyFace = true;
        if (dot3(n, eye) > EPS) onAnyFrontFace = true;
      }
    }
    if (!inside) continue;
    if (!onAnyFace) return true; // strictly interior — always dashed
    if (!onAnyFrontFace) return true; // on hidden face(s) only
  }
  return false;
}

/** Largest-open-wedge label direction (screen space): bisect the widest angular gap between incident edges. */
function labelDir(incident: { dx: number; dy: number }[]): { dx: number; dy: number } {
  const angles = incident
    .filter((d) => Math.hypot(d.dx, d.dy) > 1e-9)
    .map((d) => Math.atan2(d.dy, d.dx))
    .sort((p, q) => p - q);
  if (angles.length === 0) return { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 }; // default NE (SVG y down)
  let bestGap = -1;
  let bestMid = 0;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    if (b - a > bestGap) {
      bestGap = b - a;
      bestMid = (a + b) / 2;
    }
  }
  return { dx: Math.cos(bestMid), dy: Math.sin(bestMid) };
}

export function buildScene3(
  c: Construction3,
  positions: Positions3,
  cam: Camera3,
  viewport: Viewport,
  zoom = 1,
): Scene3 {
  const frame = cameraFrame(cam);

  // Project every point; SVG y grows downward, so flip the camera-up coordinate here.
  const proj = new Map<Id, { x: number; y: number }>();
  for (const [id, p] of positions) {
    const q = project3(p, frame);
    proj.set(id, { x: q.x, y: -q.y });
  }
  if (proj.size === 0) return { points: [], edges: [], vectors: [] };

  // Isotropic fit into the viewport with a margin.
  const xs = [...proj.values()].map((p) => p.x);
  const ys = [...proj.values()].map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const k = zoom * Math.min((viewport.width - 2 * MARGIN) / spanX, (viewport.height - 2 * MARGIN) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (p: { x: number; y: number }) => ({
    x: viewport.width / 2 + (p.x - cx) * k,
    y: viewport.height / 2 + (p.y - cy) * k,
  });

  const screen = new Map<Id, { x: number; y: number }>();
  for (const [id, p] of proj) screen.set(id, toScreen(p));

  // Edges: the solids' own (hidden = both bordering faces back-facing) plus the
  // auxiliary segments (hidden = interior / on a hidden face — `auxSegmentHidden`).
  const hidden = hiddenEdgeKeys(c, positions, cam);
  const edges: SceneEdge3[] = [];
  for (const solid of c.solids) {
    for (const [a, b] of solid.edges) {
      const pa = screen.get(a)!;
      const pb = screen.get(b)!;
      edges.push({ id: `edge-${edgeKey(a, b)}`, a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, hidden: hidden.has(edgeKey(a, b)) });
    }
  }
  for (const [a, b] of c.segments) {
    const pa = screen.get(a);
    const pb = screen.get(b);
    if (!pa || !pb) continue;
    edges.push({ id: `seg-${edgeKey(a, b)}`, a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, hidden: auxSegmentHidden(c, positions, a, b, cam) });
  }
  // Dashed first so solid edges draw over them at crossings.
  edges.sort((e1, e2) => Number(e2.hidden) - Number(e1.hidden));

  // Incident screen directions per point, for label placement.
  const incident = new Map<Id, { dx: number; dy: number }[]>();
  const addIncident = (at: Id, toward: Id) => {
    const p = screen.get(at)!;
    const q = screen.get(toward)!;
    const list = incident.get(at) ?? [];
    list.push({ dx: q.x - p.x, dy: q.y - p.y });
    incident.set(at, list);
  };
  for (const solid of c.solids) {
    for (const [a, b] of solid.edges) {
      addIncident(a, b);
      addIncident(b, a);
    }
  }
  for (const [a, b] of c.segments) {
    if (!screen.has(a) || !screen.has(b)) continue;
    addIncident(a, b);
    addIncident(b, a);
  }
  for (const [id, def] of c.points) {
    if (def.kind === 'on-segment' && screen.has(id)) {
      addIncident(id, def.a);
      addIncident(id, def.b);
    }
  }

  const points: ScenePoint3[] = [];
  for (const [id] of c.points) {
    const p = screen.get(id);
    if (!p) continue;
    const dir = labelDir(incident.get(id) ?? []);
    points.push({
      id,
      x: p.x,
      y: p.y,
      label: displayLabel(id),
      labelDx: dir.dx * LABEL_OFFSET,
      labelDy: dir.dy * LABEL_OFFSET,
    });
  }

  // Named vectors (ADR-3D-003 as amended): a coloured overlay from tail to head
  // with the ARROWHEAD AT THE HEAD (`to`), dashed when its carrier is hidden;
  // the name label sits beside the midpoint on the side facing AWAY from the
  // figure centre (the figure is fit-centred, so the viewport centre stands in).
  const vectors: SceneVector3[] = [];
  for (const [name, def] of c.vectors) {
    const a = screen.get(def.from);
    const b = screen.get(def.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let px = -dy / len;
    let py = dx / len;
    const mx = a.x + dx / 2;
    const my = a.y + dy / 2;
    if ((viewport.width / 2 - mx) * px + (viewport.height / 2 - my) * py > 0) {
      px = -px;
      py = -py;
    }
    const key = edgeKey(def.from, def.to);
    const carrierHidden = hidden.has(key) ? true : auxSegmentHidden(c, positions, def.from, def.to, cam);
    vectors.push({
      name,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      hidden: carrierHidden,
      labelX: mx + px * 17,
      labelY: my + py * 17,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  return { points, edges, vectors };
}
