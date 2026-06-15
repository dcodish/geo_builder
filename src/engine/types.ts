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
  /**
   * A base vertex of a fully-committed regular shape (a square): its equal sides and
   * right angles are intrinsic, so a constraint that contradicts the shape is a real
   * over-constraint — the solver must not drive it (ADR-030). Generic shapes
   * (parallelogram, quad, triangle) leave their vertices drivable.
   */
  rigid?: boolean;
  /**
   * Drive this point's 2 DOF (x,y) so a constraint holds — the free-point analogue
   * of the parametric `solve` directive (ADR-028). A shape's free vertices (e.g. a
   * parallelogram's A,B,C) have no parametric DOF, so a constraint on them reshapes
   * the figure by moving a free vertex to the nearest configuration that satisfies
   * it (`resolveDriven` solves x,y jointly, regularised toward the current spot).
   */
  solve?: SolveDirective;
}

/**
 * A directive that a parametric point's 1 DOF is *solved* so a constraint holds —
 * even when the constraint references DOWNSTREAM points this one only influences
 * indirectly (e.g. an on-circle E driven so the intersection AB∩DE lands on a
 * target). The residual is global: the figure is re-evaluated as the DOF varies
 * ([ADR-028](docs/06-decisions.md#adr-028)). `branch` selects among multiple roots.
 */
export interface SolveDirective {
  constraint: Constraint;
  branch: number;
}

/** 1 DOF — lies on segment a→b at parameter t (0 = a, 1 = b). `solve` drives t (ADR-028). */
export interface OnSegmentPoint {
  kind: 'on-segment';
  id: Id;
  a: Id;
  b: Id;
  t: number;
  solve?: SolveDirective;
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
  /** When set, `dist` is a driveable DOF the solver sizes to satisfy a constraint (a rectangle's
   * height / a right-triangle's leg). Default (unset) keeps `dist` fixed — the figure looks the same. */
  solve?: { constraint: Constraint; branch: number };
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
  /** When set, `angleDeg` is a driveable DOF (a rhombus's angle). Default keeps it fixed. */
  solve?: { constraint: Constraint; branch: number };
}

/** 0 DOF — `anchor` + k · (to − from): a point offset parallel to from→to (trapezoid). */
export interface ScaledOffsetVertex {
  kind: 'scaled-offset';
  id: Id;
  anchor: Id;
  from: Id;
  to: Id;
  k: number;
  /** When set, `k` (the top-base ratio) is a driveable DOF (a trapezoid's short side). Default keeps it fixed. */
  solve?: { constraint: Constraint; branch: number };
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
  /** The point's initial parameter. When it's an EXTENSION point (t<0 or t>1) the solve searches a
   * wider range than [0,1], so a constraint can place it beyond the segment (e.g. the ⟂ foot past D). */
  t0?: number;
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

/** 0 DOF — the circumcentre of triangle a,b,c (equidistant from all three). Collinear ⇒ unconstructible. */
export interface CircumcenterPoint {
  kind: 'circumcenter';
  id: Id;
  a: Id;
  b: Id;
  c: Id;
}

/**
 * 1 DOF — a point on `circle` at angle `theta` (radians) from the centre. `solve`
 * drives theta (ADR-028). `free` marks a vertex placed at an *arbitrary* angle (an
 * inscribed triangle's vertex, a chord end) — one the "show another configuration"
 * sampler may slide around the circle; a point at a *fixed* angle (an inscribed
 * square's corner, an arc endpoint) is not free.
 */
export interface OnCirclePoint {
  kind: 'on-circle';
  id: Id;
  circle: Id;
  theta: number;
  solve?: SolveDirective;
  free?: boolean;
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

/**
 * 0 DOF — the point on `circle` in the direction of `toward`: centre + r·unit(toward − centre).
 * Used for the tangency point of two tangent circles (the touch on the outer circle, on the ray
 * toward the inner centre), so it tracks the figure when a free centre is resampled (ADR-037 A2).
 */
export interface RadialTowardPoint {
  kind: 'radial-toward';
  id: Id;
  circle: Id;
  toward: Id;
}

/**
 * 1 DOF — a marker on a drawn `line`, at signed `offset` along the line's
 * direction from its anchor. Names a drawn line by two points (e.g. a tangent
 * "CD" at T → C, D at ±offset from T along the tangent). Default it just sits at
 * its `offset`; when a later constraint references it, `solve` slides the offset
 * ALONG the line so the constraint holds (ADR-036) — the on-segment analogue for
 * an infinite line. The anchor/direction come from the line's `LineSpec`.
 */
export interface OnLinePoint {
  kind: 'on-line';
  id: Id;
  line: Id;
  offset: number;
  solve?: SolveDirective;
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
  | CircumcenterPoint
  | OnCirclePoint
  | AntipodePoint
  | ArcMidpointPoint
  | LineCirclePoint
  | CircleCirclePoint
  | RadialTowardPoint
  | OnLinePoint;

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
  'circumcenter',
  'on-circle',
  'antipode',
  'arc-midpoint',
  'line-circle',
  'circle-circle',
  'radial-toward',
  'on-line',
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
  | { via: 'through'; point: Id }
  // The largest circle that sits inside `outer` and is internally tangent to it, given
  // wherever this circle's centre lands: r = r(outer) − |centre − centre(outer)|. The
  // radius is thus a DOF the figure flexes (the centre is free), not a fixed pin — so two
  // equal circles CAN be made internally tangent (ADR-037 Amendment 2 / radius-as-DOF).
  | { via: 'tangent-inner'; outer: Id };

/** A circle: a centre point and a {@link RadiusSpec}. Unlike a line, a circle **is** drawn —
 *  unless `hidden`, in which case it constrains its on-circle points but is not rendered (a
 *  "cyclic"/בר-חסימה quad: the vertices are concyclic so opposite angles sum to 180°, with no
 *  circle drawn). */
export interface Circle {
  kind: 'circle';
  id: Id;
  center: Id;
  radius: RadiusSpec;
  hidden?: boolean;
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

/** |a→b| = k·|c→d| + add (a proportion between two segment lengths; equal is k=1, add=0; an affine
 *  relation like "CE = AD + 2" is k=1, add=2 — used to lower a measure `coef·var + const`). */
export interface RatioConstraint {
  type: 'ratio';
  a: Id;
  b: Id;
  c: Id;
  d: Id;
  k: number;
  add?: number;
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

/** ∠(a1·v1·b1) = k·∠(a2·v2·b2) — a proportion between two angles (equal is k = 1). */
export interface AngleRatioConstraint {
  type: 'angle-ratio';
  v1: Id;
  a1: Id;
  b1: Id;
  v2: Id;
  a2: Id;
  b2: Id;
  k: number;
}

/**
 * Point p must coincide with point q (|pq| = 0). Produced when a second statement
 * *places* an already-defined point (e.g. "C is the midpoint of OB", where C is
 * already the intersection AB∩DE): the new placement becomes a hidden target q
 * and this constraint drives a free DOF upstream of p so they meet ([ADR-028](docs/06-decisions.md#adr-028)).
 */
export interface CoincideConstraint {
  type: 'coincide';
  p: Id;
  q: Id;
}

export type Constraint =
  | AngleConstraint
  | DistanceConstraint
  | EqualConstraint
  | RatioConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | AngleRatioConstraint
  | CoincideConstraint;

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
  | { type: 'set-ratio'; a: Id; b: Id; c: Id; d: Id; k: number; add?: number } // |ab| = k·|cd| + add
  | { type: 'set-angle-ratio'; v1: Id; a1: Id; b1: Id; v2: Id; a2: Id; b2: Id; k: number } // ∠1 = k·∠2
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
  | { type: 'circle'; id: Id; center: Id; radius: number; hidden?: boolean }
  | { type: 'circle-through'; id: Id; center: Id; through: Id }
  | { type: 'circumcircle'; id: Id; center: Id; a: Id; b: Id; c: Id } // circle through a,b,c (centre = circumcentre)
  | { type: 'point-on-circle'; id: Id; circle: Id; theta?: number }
  | { type: 'diameter'; id1: Id; id2: Id; circle: Id; theta?: number }
  | { type: 'arc-midpoint'; id: Id; circle: Id; from: Id; to: Id; branch?: number }
  | { type: 'line-circle-intersection'; id: Id; line: Id; circle: Id; branch?: number }
  | { type: 'circle-circle-intersection'; id: Id; circle1: Id; circle2: Id; branch?: number }
  | { type: 'tangent'; id: Id; circle: Id; at: Id; visible?: boolean }
  | { type: 'point-on-line'; id: Id; line: Id; offset: number } // a fixed marker on a drawn line (names it by a point)
  | { type: 'circles-tangent'; circle1: Id; circle2: Id; at: Id; external: boolean }; // two circles touch at one point `at`

/**
 * A measure's value: either a literal number, or `coef · var` where `var` is a
 * named unknown (lowercase latin for lengths, Greek for angles). A bare variable
 * is `coef = 1`. Used by the symbolic-measure layer (ADR-031).
 */
// `pow` is the exponent on the variable: absent/1 = linear (3x), 0.5 = √ (12√x), 2 = squared (x²), n = xⁿ.
// `const` is an additive constant (the affine term): `k + 2` ⇒ {coef:1, var:'k', const:2}; `k − 5/2` ⇒ const:-2.5.
// `text` is an optional faithful display of the original expression (e.g. "12√2", "7k/5") shown on the
// figure while unresolved, so the label matches what the student typed rather than a decimal/derived form.
export type MeasureExpr = { value: number; text?: string } | { coef: number; var: string; pow?: number; const?: number; text?: string };

/**
 * The reserved variable name for a circle's radius (ADR-034). `R`/`r` are never point
 * labels in a size context: "radius R" pins this variable to the circle's (concrete)
 * radius, and "AC = 1.6R" reads as a size relative to it. The symbol stays symbolic on
 * the figure ("1.6R") even once its numeric value is known.
 */
export const RADIUS_VAR = 'R';

/**
 * Store-level commands the parser may emit in addition to engine `Command`s — the
 * symbolic-measure vocabulary ([ADR-031](docs/06-decisions.md#adr-031)). The engine
 * never sees these: the store's `replay` LOWERS them (via a symbol table) into
 * engine commands (`set-distance`/`set-ratio`/`set-angle`/`set-angle-ratio`) and a
 * display-label map. `measure-length`/`measure-angle` annotate a segment/angle with
 * a (possibly symbolic) size; `set-var` binds a variable to a number.
 */
export type SymbolicCommand =
  | { type: 'measure-length'; a: Id; b: Id; expr: MeasureExpr }
  | { type: 'measure-angle'; vertex: Id; ray1: Id; ray2: Id; expr: MeasureExpr }
  | { type: 'set-var'; name: string; value: number };

/** What the parser produces and a `Fact` stores: engine commands plus the symbolic layer. */
export type AnyCommand = Command | SymbolicCommand;

/** Tolerances. */
export const LEN_EPS = 1e-6; // coordinate closeness (units)
export const ANGLE_EPS = 0.5; // degrees
