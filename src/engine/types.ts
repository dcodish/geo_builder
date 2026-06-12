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

/**
 * 2 DOF — placed directly; the x/y are its free parameters. `pinned` marks a
 * point the *student* fixed (an explicit "point A at (x,y)"): it never varies.
 * A point the *engine* defaulted (a shape's unspecified base vertex, a segment's
 * auto-created endpoint) is **not** pinned — it is residual freedom the sampler
 * may re-draw ([ADR-018](docs/06-decisions.md#adr-018)).
 */
export interface FreePoint {
  kind: 'free-point';
  id: Id;
  x: number;
  y: number;
  pinned?: boolean;
}

/** 1 DOF — lies on segment a→b at parameter t (0 = a, 1 = b). */
export interface OnSegmentPoint {
  kind: 'on-segment';
  id: Id;
  a: Id;
  b: Id;
  t: number;
}

/** 0 DOF — computed from parents by a named rule. `flip` mirrors it to the other side of a→b. */
export interface DerivedPoint {
  kind: 'derived';
  id: Id;
  rule: 'square-c' | 'square-d';
  a: Id;
  b: Id;
  flip?: boolean;
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

/** 0 DOF — `anchor` offset perpendicular to from→to by `dist` (rectangle corners). `flip` negates the offset. */
export interface PerpOffsetVertex {
  kind: 'perp-offset';
  id: Id;
  anchor: Id;
  from: Id;
  to: Id;
  dist: number;
  flip?: boolean;
}

/** 0 DOF — `pivot` + scale · Rot(angleDeg) · (to − from) (rhombus / rotated corners). `flip` negates the angle. */
export interface RotatedVertex {
  kind: 'rotated';
  id: Id;
  pivot: Id;
  from: Id;
  to: Id;
  angleDeg: number;
  scale: number;
  flip?: boolean;
}

/** 0 DOF — `anchor` + k · (to − from): a point offset parallel to from→to (trapezoid). */
export interface ScaledOffsetVertex {
  kind: 'scaled-offset';
  id: Id;
  anchor: Id;
  from: Id;
  to: Id;
  k: number;
}

/**
 * A point on segment a→b whose parameter t is **solved** so that the embedded
 * constraint holds (ADR-012/ADR-014 — a constraint driving a free DOF). The
 * constraint references this point's id (as the vertex or a ray endpoint — any
 * role); the solver finds every t ∈ [0,1] satisfying it and `branch` selects
 * among the solutions. This is what a constraint command upgrades a plain
 * on-segment point into: the constraint *places* the point instead of merely
 * checking it. Generic over the constraint type — new constraints add a
 * residual case (solve.ts), not a new point kind.
 */
export interface SolvedOnSegmentPoint {
  kind: 'on-segment-solved';
  id: Id;
  a: Id;
  b: Id;
  constraint: Constraint;
  branch: number;
}

/** 0 DOF — the crossing of two {@link Line} objects (by id). Parallel ⇒ unconstructible. */
export interface LineIntersectionPoint {
  kind: 'line-intersection';
  id: Id;
  line1: Id;
  line2: Id;
}

/** 0 DOF — foot of the perpendicular from `from` onto the (infinite) line a→b. */
export interface FootPoint {
  kind: 'foot';
  id: Id;
  from: Id;
  a: Id;
  b: Id;
}

/** 0 DOF — the midpoint of a→b. */
export interface MidpointPoint {
  kind: 'midpoint';
  id: Id;
  a: Id;
  b: Id;
}

/** 1 DOF — a point on `circle` at angle `theta` (radians) from the centre. Like on-segment, but angular. */
export interface OnCirclePoint {
  kind: 'on-circle';
  id: Id;
  circle: Id;
  theta: number;
}

/** 0 DOF — the antipode of `of` on `circle` (a diameter's far end): 2·centre − of. */
export interface AntipodePoint {
  kind: 'antipode';
  id: Id;
  circle: Id;
  of: Id;
}

/** 0 DOF — midpoint of the arc from `from` to `to` on `circle`; `branch` selects which of the two arcs. */
export interface ArcMidpointPoint {
  kind: 'arc-midpoint';
  id: Id;
  circle: Id;
  from: Id;
  to: Id;
  branch: number;
}

/** 0 DOF — a crossing of `line` with `circle`; 0/1/2 solutions, `branch` selects. */
export interface LineCirclePoint {
  kind: 'line-circle';
  id: Id;
  line: Id;
  circle: Id;
  branch: number;
}

/** 0 DOF — a crossing of two circles; 0/1/2 solutions, `branch` selects. */
export interface CircleCirclePoint {
  kind: 'circle-circle';
  id: Id;
  circle1: Id;
  circle2: Id;
  branch: number;
}

export type GeoPoint =
  | FreePoint
  | OnSegmentPoint
  | DerivedPoint
  | IntersectionPoint
  | ParallelogramVertex
  | LineLineIntersection
  | PerpOffsetVertex
  | RotatedVertex
  | ScaledOffsetVertex
  | SolvedOnSegmentPoint
  | LineIntersectionPoint
  | FootPoint
  | MidpointPoint
  | OnCirclePoint
  | AntipodePoint
  | ArcMidpointPoint
  | LineCirclePoint
  | CircleCirclePoint;

/** The object kinds that are points (carry a computed position). Single source of truth. */
const POINT_KINDS: ReadonlySet<string> = new Set([
  'free-point',
  'on-segment',
  'derived',
  'intersection',
  'parallelogram-vertex',
  'line-line-intersection',
  'perp-offset',
  'rotated',
  'scaled-offset',
  'on-segment-solved',
  'line-intersection',
  'foot',
  'midpoint',
  'on-circle',
  'antipode',
  'arc-midpoint',
  'line-circle',
  'circle-circle',
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

/**
 * How a {@link Line} is constructed. Each variant resolves (in the evaluator) to
 * an `(anchor, dir)` pair — a point on the line and a unit direction. Lines are
 * the constructive scaffolding for crossings (a bisector ∩ a bisector, a
 * perpendicular ∩ its target); they carry no coordinates of their own and are
 * **not drawn** — only the segments the student names render. New line kinds add
 * a case to {@link resolveLine}, not a new object type.
 */
export type LineSpec =
  | { via: 'through'; a: Id; b: Id } // the line through points a and b
  | { via: 'bisector'; vertex: Id; p: Id; q: Id } // internal bisector of ∠(p–vertex–q)
  | { via: 'perpendicular'; through: Id; a: Id; b: Id } // ⟂ to line a→b, through `through`
  | { via: 'parallel'; through: Id; a: Id; b: Id } // ∥ to line a→b, through `through`
  | { via: 'tangent'; circle: Id; at: Id }; // tangent to `circle` at point `at` (⟂ to the radius there)

/**
 * An (infinite) line, defined by a {@link LineSpec}. Scaffolding by default
 * (not rendered) — used to produce crossings. `visible` lines the student asked
 * to *draw* (a standalone tangent / bisector / perpendicular / parallel) are
 * rendered, clipped to the viewport ([ADR-022](docs/06-decisions.md#adr-022)).
 */
export interface Line {
  kind: 'line';
  id: Id;
  spec: LineSpec;
  visible?: boolean;
}

/** How a {@link Circle}'s radius is set: a fixed length, or the distance to a point on it. */
export type RadiusSpec =
  | { via: 'length'; value: number }
  | { via: 'through'; point: Id };

/** A circle: a centre point and a {@link RadiusSpec}. Unlike a line, a circle **is** drawn. */
export interface Circle {
  kind: 'circle';
  id: Id;
  center: Id;
  radius: RadiusSpec;
}

export type GeoObject = GeoPoint | Segment | Polygon | Line | Circle;

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

/** |a→b| = value. */
export interface DistanceConstraint {
  type: 'distance';
  a: Id;
  b: Id;
  value: number;
}

/** |a→b| = |c→d| (two equal segments). */
export interface EqualConstraint {
  type: 'equal';
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

/** a→b ∥ c→d. */
export interface ParallelConstraint {
  type: 'parallel';
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

/** a→b ⟂ c→d. */
export interface PerpendicularConstraint {
  type: 'perpendicular';
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

export type Constraint =
  | AngleConstraint
  | DistanceConstraint
  | EqualConstraint
  | ParallelConstraint
  | PerpendicularConstraint;

export interface Construction {
  objects: GeoObject[];
  constraints: Constraint[];
}

/** Commands the engine applies. The parser (Phase 4) will produce these. */
export type Command =
  | { type: 'square'; ids: [Id, Id, Id, Id]; side?: number }
  | { type: 'quadrilateral'; ids: [Id, Id, Id, Id] }
  | { type: 'parallelogram'; ids: [Id, Id, Id, Id] }
  | { type: 'rectangle'; ids: [Id, Id, Id, Id] }
  | { type: 'rhombus'; ids: [Id, Id, Id, Id] }
  | { type: 'trapezoid'; ids: [Id, Id, Id, Id] }
  | { type: 'triangle'; ids: [Id, Id, Id] }
  | { type: 'right-triangle'; ids: [Id, Id, Id] } // right angle at the last id
  | { type: 'free-point'; id: Id; x: number; y: number }
  | { type: 'point-on-segment'; id: Id; a: Id; b: Id; t?: number }
  | { type: 'point-by-distances'; id: Id; from1: Id; dist1: number; from2: Id; dist2: number; branch?: number }
  | { type: 'line-line-intersection'; id: Id; a: Id; b: Id; c: Id; d: Id }
  | { type: 'segment'; a: Id; b: Id }
  | { type: 'set-angle'; vertex: Id; ray1: Id; ray2: Id; value: number }
  | { type: 'set-distance'; a: Id; b: Id; value: number }
  | { type: 'set-equal'; a: Id; b: Id; c: Id; d: Id }
  | { type: 'set-parallel'; a: Id; b: Id; c: Id; d: Id }
  | { type: 'set-perpendicular'; a: Id; b: Id; c: Id; d: Id }
  // Phase 5b — lines (scaffolding unless `visible`) and the points they produce.
  | { type: 'bisector'; id: Id; vertex: Id; p: Id; q: Id; visible?: boolean }
  | { type: 'perpendicular-line'; id: Id; through: Id; a: Id; b: Id; visible?: boolean }
  | { type: 'parallel-line'; id: Id; through: Id; a: Id; b: Id; visible?: boolean }
  | { type: 'line-through'; id: Id; a: Id; b: Id; visible?: boolean }
  | { type: 'line-intersection'; id: Id; line1: Id; line2: Id }
  | { type: 'foot'; id: Id; from: Id; a: Id; b: Id }
  | { type: 'midpoint'; id: Id; a: Id; b: Id }
  // Phase 5c — circles and the points they produce.
  | { type: 'circle'; id: Id; center: Id; radius: number }
  | { type: 'circle-through'; id: Id; center: Id; through: Id }
  | { type: 'point-on-circle'; id: Id; circle: Id; theta?: number }
  | { type: 'diameter'; id1: Id; id2: Id; circle: Id; theta?: number }
  | { type: 'arc-midpoint'; id: Id; circle: Id; from: Id; to: Id; branch?: number }
  | { type: 'line-circle-intersection'; id: Id; line: Id; circle: Id; branch?: number }
  | { type: 'circle-circle-intersection'; id: Id; circle1: Id; circle2: Id; branch?: number }
  | { type: 'tangent'; id: Id; circle: Id; at: Id; visible?: boolean };

/** Tolerances. */
export const LEN_EPS = 1e-6; // coordinate closeness (units)
export const ANGLE_EPS = 0.5; // degrees
