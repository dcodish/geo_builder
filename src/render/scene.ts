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

import type { Construction, Id, Vec } from '@/engine/types';

export interface ScenePoint {
  id: Id;
  pos: Vec;
  label: string;
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

export interface Scene {
  points: ScenePoint[];
  segments: SceneSegment[];
  polygons: ScenePolygon[];
}

const isPointKind = (kind: string): boolean =>
  kind === 'free-point' || kind === 'on-segment' || kind === 'derived' || kind === 'intersection';

/** Resolve a construction + computed positions into drawable primitives. */
export function buildScene(c: Construction, positions: Map<Id, Vec>): Scene {
  const points: ScenePoint[] = [];
  const segments: SceneSegment[] = [];
  const polygons: ScenePolygon[] = [];

  for (const o of c.objects) {
    if (isPointKind(o.kind)) {
      const pos = positions.get(o.id);
      if (pos) points.push({ id: o.id, pos, label: o.id });
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
    }
  }

  return { points, segments, polygons };
}

/** Every resolved point position in the scene — the input to `fitTransform`. */
export function scenePositions(scene: Scene): Vec[] {
  return scene.points.map((p) => p.pos);
}
