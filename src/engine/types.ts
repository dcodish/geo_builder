/**
 * Core data model for the constructive engine (Phase 1).
 *
 * The figure is a dependency graph of objects. Each point is classified by its
 * degrees of freedom: free (2), on-object (1), or derived (0). Positions are
 * computed by topological evaluation; nothing here stores coordinates that the
 * evaluator produces — only the *parameters* (a free point's x/y, an
 * on-segment point's t, an intersection's branch index).
 *
 * See docs/04-design.md §3-4.
 */

export interface Vec {
  x: number;
  y: number;
}

export type Id = string;

/** 2 DOF — placed directly; the x/y are its free parameters. */
export interface FreePoint {
  kind: 'free-point';
  id: Id;
  x: number;
  y: number;
}

/** 1 DOF — lies on segment a→b at parameter t (0 = a, 1 = b). */
export interface OnSegmentPoint {
  kind: 'on-segment';
  id: Id;
  a: Id;
  b: Id;
  t: number;
}

/** 0 DOF — computed from parents by a named rule. */
export interface DerivedPoint {
  kind: 'derived';
  id: Id;
  rule: 'square-c' | 'square-d';
  a: Id;
  b: Id;
}

/** 0 DOF — a circle∩circle intersection; `branch` selects which solution. */
export interface IntersectionPoint {
  kind: 'intersection';
  id: Id;
  mode: 'circle-circle';
  center1: Id;
  radius1: number;
  center2: Id;
  radius2: number;
  branch: number;
}

/** 0 DOF — the 4th vertex of parallelogram a→b→c→(this): pos = a + c − b. */
export interface ParallelogramVertex {
  kind: 'parallelogram-vertex';
  id: Id;
  a: Id;
  b: Id;
  c: Id;
}

/** 0 DOF — intersection of line (a,b) with line (c,d). Parallel lines ⇒ unconstructible. */
export interface LineLineIntersection {
  kind: 'line-line-intersection';
  id: Id;
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

export type GeoPoint =
  | FreePoint
  | OnSegmentPoint
  | DerivedPoint
  | IntersectionPoint
  | ParallelogramVertex
  | LineLineIntersection;

/** The object kinds that are points (carry a computed position). Single source of truth. */
const POINT_KINDS: ReadonlySet<string> = new Set([
  'free-point',
  'on-segment',
  'derived',
  'intersection',
  'parallelogram-vertex',
  'line-line-intersection',
]);

export function isGeoPoint(o: GeoObject): o is GeoPoint {
  return POINT_KINDS.has(o.kind);
}

export interface Segment {
  kind: 'segment';
  id: Id;
  a: Id;
  b: Id;
}

export interface Polygon {
  kind: 'polygon';
  id: Id;
  vertices: Id[];
}

export type GeoObject = GeoPoint | Segment | Polygon;

/**
 * Angle constraint. In Phase 1 it is used as a satisfiability *check* for
 * over-constraint detection (the referenced points are already determined by
 * their definitions, so the constraint can only confirm or contradict).
 */
export interface AngleConstraint {
  type: 'angle';
  vertex: Id;
  ray1: Id;
  ray2: Id;
  value: number;
}

export type Constraint = AngleConstraint;

export interface Construction {
  objects: GeoObject[];
  constraints: Constraint[];
}

/** Commands the engine applies. The parser (Phase 4) will produce these. */
export type Command =
  | { type: 'square'; ids: [Id, Id, Id, Id]; side?: number }
  | { type: 'quadrilateral'; ids: [Id, Id, Id, Id] }
  | { type: 'parallelogram'; ids: [Id, Id, Id, Id] }
  | { type: 'free-point'; id: Id; x: number; y: number }
  | { type: 'point-on-segment'; id: Id; a: Id; b: Id; t?: number }
  | { type: 'point-by-distances'; id: Id; from1: Id; dist1: number; from2: Id; dist2: number; branch?: number }
  | { type: 'line-line-intersection'; id: Id; a: Id; b: Id; c: Id; d: Id }
  | { type: 'segment'; a: Id; b: Id }
  | { type: 'set-angle'; vertex: Id; ray1: Id; ray2: Id; value: number };

/** Tolerances. */
export const LEN_EPS = 1e-6; // coordinate closeness (units)
export const ANGLE_EPS = 0.5; // degrees
