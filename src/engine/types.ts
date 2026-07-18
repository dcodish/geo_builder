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
  /**
   * EXTRA constraints co-driven on this carrier ([ADR-229](docs/06-decisions.md#adr-229)). A free point has
   * 2 DOF; driving ONE scalar constraint leaves a spare DOF a SECOND scalar constraint can consume — e.g.
   * B on the tangent-at-C line (⟂ constraint) sliding ALONG that line until line BD passes through A
   * (collinear). The greedy model assigns one constraint per carrier, so this class read as over-constrained.
   * Set only by the failure-path freeze-and-co-drive recruiter (self-verifying); the joint solvers fold
   * `also` into their cost alongside the primary constraint.
   */
  also?: Constraint[];
}

/** 1 DOF — lies on segment a→b at parameter t (0 = a, 1 = b). `solve` drives t (ADR-028). */
export interface OnSegmentPoint {
  kind: 'on-segment';
  id: Id;
  a: Id;
  b: Id;
  t: number;
  /**
   * The student gave no ratio ("G on AD", not "G on AD at 40%"), so `t` is a DEFAULT, not a stated
   * position — a free DOF the sampler slides along the segment (ADR-052: no fixed assumptions). A stated
   * ratio (or an extension `t>1`) is not free. Mirrors {@link OnCirclePoint.free}. Meaningless once driven.
   */
  free?: boolean;
  /**
   * Placed "on the extension of a→b" (t>1) with NO stated distance — so its position is an UNSTATED
   * default (ADR-052), but it is NOT eagerly driven like a `free` interior point (that would let an
   * unrelated relation grab a point the student positioned — the ADR-064 trap). Instead it is a
   * RECRUITABLE carrier: only on the failure path (a step already over-constrained) may the joint
   * re-bind drive it, so a constraint whose natural carrier IS this point (e.g. "AG ⟂ AD" with G on
   * the extension) can use it, freeing a shape DOF an unrelated relation needs (ADR-074 / R7(3)).
   */
  extension?: boolean;
  /**
   * Desired solution branch once a constraint upgrades this to `on-segment-solved` (which root of
   * the constraint to pick). Carried from the `point-on-segment` command's `branch` so cycling "show
   * another configuration" on a driven on-segment point survives `replay` (ADR-043/R2). Named apart
   * from `branch` so it doesn't join the `'branch' in o` set of *materialised* branchable points.
   * Meaningless until driven.
   */
  solveBranch?: number;
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

/** 0 DOF — intersection of line (a,b) with line (c,d). Parallel lines ⇒ unconstructible. A DIRECTIONAL
 *  operand ("המשך BD" beyond the 2nd point, ADR-054) is carried by a separate `collinear-order` the
 *  command emits — which DRIVES a free DOF so the extensions reach the crossing (no manual repositioning). */
export interface LineLineIntersection {
  kind: 'line-line-intersection';
  id: Id;
  a: Id;
  b: Id;
  c: Id;
  d: Id;
  /** The student said two SEGMENTS meet (no "המשך"/extension, no "הישר"/infinite-line) — so the crossing
   *  must land WITHIN both segments, not on their continuation (the verifier flags it amber otherwise, and
   *  the sampler reflects free apexes / re-seeds to bring it onto the segments). Absent for an explicit
   *  extension or infinite-line meet, whose crossing is allowed off the drawn segments. */
  onSeg?: boolean;
  /** PER-OPERAND within-segment requirement (issue #22): only THIS operand is a bare segment reference —
   *  the other carries "המשך"/"הישר", so the joint `onSeg` (which asserts both, ADR-166) doesn't apply.
   *  The crossing must land within a–b (`onSeg1`) / c–d (`onSeg2`); a `collinear-order [X,id,Y]` drives
   *  the figure onto it (the ADR-077/ADR-127 mechanism), and verifier + sampler gate it per side. */
  onSeg1?: boolean;
  onSeg2?: boolean;
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
  solve?: SolveDirective;
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
  solve?: SolveDirective;
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
  solve?: SolveDirective;
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
  /**
   * When set, this is a free point ON THE ARC between two points on the circle (`between = [from, to]`,
   * ADR-042): `theta` is then a FRACTION in [−1, 1] of the (minor) half-arc, not an absolute angle —
   * 0 = the arc midpoint, ±1 = near `from`/`to`. The sampler slides it within the arc; a constraint
   * can drive it. "F is on arc BC" with F free, vs `arc-midpoint` which is the fixed midpoint.
   */
  between?: [Id, Id];
  /** With `between`, place F on the MAJOR arc from→to (the far side, reflex span) instead of the minor
   *  arc — "F על הקשת הגדולה BC" / "F on the major arc BC" (issue #90). Ignored without `between`. */
  major?: boolean;
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

/**
 * 0 DOF — a crossing of `line` with `circle`; 0/1/2 solutions, `branch` selects.
 * When `avoid` is set (a point id, typically the line's other, known on-circle end),
 * the solution FARTHEST from it is chosen instead of `branch` — so "the OTHER crossing"
 * is deterministic and stays put under resampling (the two roots' index order flips with
 * the line's direction, so a fixed branch would intermittently collapse onto the known point).
 *
 * `onSegment` (a pair of point ids [a,b]) makes the crossing WITHIN the a–b segment a stable
 * SELECTION — the root whose parameter lies in (0,1) along a→b (ADR-313/issue #119). Used when one
 * endpoint is INSIDE the circle (the extreme case: the centre) so exactly one crossing is within the
 * segment and no driving is needed: a pure pick, never a `collinear-order` CONSTRAINT (so it adds no
 * DOF the recruiter must satisfy — the `order` field is for the flex-the-figure cases). Stable under
 * rescale because "within (0,1)" is scale-invariant, so the crossing can't flip to the far root.
 */
export interface LineCirclePoint {
  kind: 'line-circle';
  id: Id;
  line: Id;
  circle: Id;
  branch: number;
  avoid?: Id;
  onSegment?: [Id, Id];
}

/**
 * 0 DOF — a crossing of two circles; 0/1/2 solutions, `branch` selects. When `avoid` is set (the OTHER
 * intersection, already placed), the crossing FARTHEST from it is chosen instead — so "the second
 * intersection" is geometric, not a branch index that flips order as the circles move ([ADR-045](docs/06-decisions.md#adr-045) R8).
 */
export interface CircleCirclePoint {
  kind: 'circle-circle';
  id: Id;
  circle1: Id;
  circle2: Id;
  branch: number;
  avoid?: Id;
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

/** The discriminant (`o.kind`) of every {@link GeoPoint} variant. */
export type GeoPointKind = GeoPoint['kind'];

/**
 * The object kinds that are points (carry a computed position). Single source of truth.
 * Declared as a `Record<GeoPointKind, true>` so its keys must EXACTLY match the
 * {@link GeoPoint} union: a variant added to the union but forgotten here is a **compile
 * error** (missing property), and a stray key not in the union is rejected too — never a
 * silently-dropped DOF (ADR-043). `POINT_KINDS` is derived from its keys.
 */
const POINT_KIND_FLAGS: Record<GeoPointKind, true> = {
  'free-point': true,
  'on-segment': true,
  'derived': true,
  'intersection': true,
  'parallelogram-vertex': true,
  'line-line-intersection': true,
  'perp-offset': true,
  'rotated': true,
  'scaled-offset': true,
  'on-segment-solved': true,
  'line-intersection': true,
  'foot': true,
  'midpoint': true,
  'circumcenter': true,
  'on-circle': true,
  'antipode': true,
  'arc-midpoint': true,
  'line-circle': true,
  'circle-circle': true,
  'radial-toward': true,
  'on-line': true,
};

const POINT_KINDS: ReadonlySet<string> = new Set(Object.keys(POINT_KIND_FLAGS));

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
  // A FREE radius DOF ([ADR-051](docs/06-decisions.md#adr-051)): `value` is the current/seed radius, but it
  // is a driveable, sampleable degree of freedom — the solver sizes it to satisfy a constraint and the
  // sampler varies it, so a figure with no stated radius (e.g. "two circles intersect at A and B") isn't
  // frozen at an arbitrary number that can't hold the problem's givens. A stated radius stays `length`.
  | { via: 'free'; value: number }
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
  /** The centre was AUTO-assigned (a circumcentre/incentre, or a defaulted "two circles" centre), not
   *  named by the student — so the renderer hides the centre point unless other geometry uses it
   *  (a radius/central angle drawn from it). A named centre ("circle O") is always drawn. */
  autoCenter?: boolean;
  /** This circle is the INNER of a concentric pair whose OUTER is the referenced circle id
   *  ([ADR-244](../../docs/06-decisions.md#adr-244)): set by `set-radius-order`, read by the parser
   *  context so qualifier references ("המעגל הפנימי" / "the inner circle") resolve to this circle. */
  innerOf?: Id;
  /** This circle's radius is ordered STRICTLY BELOW the referenced circle's (`set-radius-order`,
   *  concentric or not — issue #102). Unlike {@link innerOf} (concentric-pair semantics: qualifier
   *  redirects, shared centre), this is the pure SIZE role — read back by the parser context so
   *  «המעגל הגדול/הקטן» between two independent circles resolves consistently once assigned. */
  orderedBelow?: Id;
  /** The letter the student named this circle's radius with — "מעגל שרדיוסו R" / "רדיוס מעגל P הוא r"
   *  (issue #54; the ADR-034 reserved-R auto-bind generalized to per-circle named symbols, bagrut
   *  convention R vs r). Set by `radius-symbol`; read by the parser context (so "R = 1.5r" / "R > r"
   *  resolve each letter to its circle), the symbolic-measure lowering (an "AB = √2R" couples to THIS
   *  circle's radius DOF), and the radius-slider labels. The radius itself stays a free DOF (ADR-052)
   *  until a value/ratio pins it — the symbol is a NAME, not a size. */
  radiusSymbol?: string;
  /** Drive a `via:'free'` radius so a constraint holds — the circle analogue of a shape scalar's
   *  `solve` ([ADR-051](docs/06-decisions.md#adr-051)). Set by `driveOrCheck`/`recruitFreeDofs` when a
   *  constraint on the circle's points can only be met by resizing it; the solver sizes the radius. */
  solve?: SolveDirective;
}

/**
 * A drawn circular arc: the part of the circle centred at `center` running from
 * point `from` to point `to`, the **counter-clockwise** way (world, y-up). `from`
 * and `to` are equidistant from `center` (its radius). Used for a semicircle (a
 * 180° arc on a diameter) and a quarter circle (a 90° arc). Like a segment it
 * carries no position of its own — it is drawn from its referenced points.
 */
export interface Arc {
  kind: 'arc';
  id: Id;
  center: Id;
  from: Id;
  to: Id;
  /** Optional bulge orientation (a semicircle "outside"/"inside" a shape): the renderer flips from↔to so
   *  the arc's apex is on the far side of the diameter from `bulgeRef` (outward, default) or the same side
   *  (`bulgeToward`, inward). Resolved at render time because the side needs coordinates. */
  bulgeRef?: Id;
  bulgeToward?: boolean;
  /** The arc's INTENDED central angle in degrees (90 for a quarter, 180 for a semicircle, a sector's
   *  stated angle). The arc's identity is "the arc of this span between its endpoints" — the renderer
   *  picks whichever traversal direction realises it, so neither a mirrored VIEW (flipX/flipY) nor a
   *  mirrored SOLVE (an unsigned central-angle constraint's other branch) can flip the drawing to the
   *  complement (ADR-356, issue #170). Absent → the legacy model-CCW from→to identity. */
  spanDeg?: number;
}

export type GeoObject = GeoPoint | Segment | Polygon | Line | Circle | Arc;

/** The object ids a {@link LineSpec} references (the points/circle that define the line). */
function lineSpecRefs(spec: LineSpec): Id[] {
  switch (spec.via) {
    case 'through':
      return [spec.a, spec.b];
    case 'bisector':
      return [spec.vertex, spec.p, spec.q];
    case 'perpendicular':
    case 'parallel':
      return [spec.through, spec.a, spec.b];
    case 'tangent':
      return [spec.circle, spec.at];
  }
  const _exhaustive: never = spec;
  return _exhaustive;
}

/**
 * Every object id `o` **directly references** — points, lines, circles, arcs — exhaustive over ALL
 * {@link GeoObject} kinds. The single source of truth for walking the full dependency graph
 * (e.g. coupled-solve cycle detection in `evaluate`), replacing a hand-scraped field list that
 * silently missed edges (`to`, `toward`, `line`, `circle1/circle2`) — the same silent-drop class the
 * point-kind whitelist was built to prevent. The exhaustive `switch` makes a newly-added object kind a
 * **compile error** here until its references are declared.
 *
 * Distinct from {@link pointParents} in `step.ts`, which is a point-only DOF-walk *policy* (it stops at
 * on-circle / line-mediated carriers on purpose). `objectParents` chases through line/circle
 * intermediaries, so a point coupled to another THROUGH a line∩circle / tangent / arc edge is reachable.
 */
export function objectParents(o: GeoObject): Id[] {
  switch (o.kind) {
    // points
    case 'free-point':
      return [];
    case 'segment':
    case 'on-segment':
    case 'on-segment-solved':
    case 'derived':
    case 'midpoint':
      return [o.a, o.b];
    case 'intersection':
      return [o.center1, o.center2];
    case 'parallelogram-vertex':
    case 'circumcenter':
      return [o.a, o.b, o.c];
    case 'line-line-intersection':
      return [o.a, o.b, o.c, o.d];
    case 'perp-offset':
    case 'scaled-offset':
      return [o.anchor, o.from, o.to];
    case 'rotated':
      return [o.pivot, o.from, o.to];
    case 'foot':
      return [o.from, o.a, o.b];
    case 'line-intersection':
      return [o.line1, o.line2];
    case 'on-circle':
      return o.between ? [o.circle, o.between[0], o.between[1]] : [o.circle];
    case 'antipode':
      return [o.circle, o.of];
    case 'arc-midpoint':
      return [o.circle, o.from, o.to];
    case 'line-circle':
      return [o.line, o.circle];
    case 'circle-circle':
      return [o.circle1, o.circle2];
    case 'radial-toward':
      return [o.circle, o.toward];
    case 'on-line':
      return [o.line];
    // non-point objects
    case 'polygon':
      return o.vertices;
    case 'line':
      return lineSpecRefs(o.spec);
    case 'circle':
      return [
        o.center,
        ...(o.radius.via === 'through' ? [o.radius.point] : o.radius.via === 'tangent-inner' ? [o.radius.outer] : []),
      ];
    case 'arc':
      return [o.center, o.from, o.to];
  }
  const _exhaustive: never = o;
  return _exhaustive;
}

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
  /** Set when this angle IS an ARC measure (arc ray1-ray2 on this circle; vertex = its centre, ADR-116):
   *  same constraint semantics, but the DISPLAY differs — no wedge mark/value at the (often hidden)
   *  centre; the value prints ON the arc (the set-perpendicular `implicit` discipline, display-only). */
  arcOf?: Id;
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

/**
 * |a→b| = k·R (+ add), where R is the radius of a free-radius circle ([ADR-071](docs/06-decisions.md#adr-055)).
 * The radius is witnessed as |center→witness| (witness is a point ON the circle, so that distance IS the
 * radius), so the residual is the same length form as {@link RatioConstraint}. What makes this its own type
 * is the DRIVE: `driveOrCheck` drives the circle's free-radius DOF (a robust 1-D solve) rather than a point
 * carrier — coupling a length to a free radius the way "AB = √2R" intends, and making "BO = R" (B on the
 * circle) a structural tautology instead of a joint-solve that fights the radius (the over-constraint bug).
 */
export interface LengthRadiusConstraint {
  type: 'length-radius';
  a: Id;
  b: Id;
  circle: Id;
  center: Id;
  witness: Id; // a point ON the circle, so |center→witness| = the radius
  k: number;
  add?: number;
}

/** area(polygon `ids`) = value — the shoelace area of the named polygon ([ADR-118](docs/06-decisions.md#adr-118)).
 *  A LONE absolute area drives the figure's free SCALE DOF (invisible after the viewport fit, ADR-052/ADR-101);
 *  paired with another given it drives a SHAPE DOF. `ids` are the vertices in boundary order (n ≥ 3). */
export interface AreaConstraint {
  type: 'area';
  ids: Id[];
  value: number;
}

/** area(`ids1`) = k·area(`ids2`) — a DIMENSIONLESS ratio between two polygon areas (always a shape relation). */
export interface AreaRatioConstraint {
  type: 'area-ratio';
  ids1: Id[];
  ids2: Id[];
  k: number;
}

/** perimeter(polygon `ids`) = value — the Σ of edge lengths (ADR-228). A circle's circumference is NOT
 *  this constraint: a circle's size is its radius, so `circumference 6π` lowers to a numeric radius. Like a
 *  lone {@link AreaConstraint} a LONE perimeter pins the figure's free SCALE (invisible after the fit); with
 *  another given it drives a SHAPE DOF. `ids` are the vertices in boundary order (n ≥ 3). */
export interface PerimeterConstraint {
  type: 'perimeter';
  ids: Id[];
  value: number;
}

/** perimeter(`ids1`) = k·perimeter(`ids2`) — a DIMENSIONLESS ratio between two polygon perimeters. */
export interface PerimeterRatioConstraint {
  type: 'perimeter-ratio';
  ids1: Id[];
  ids2: Id[];
  k: number;
}

/**
 * A SIGNED LINEAR COMBINATION of same-unit measures: Σ coefs[i]·m_i = target (issues #153/#154).
 * Each term's measure is read from `points` at a fixed stride — 2 ids per term for `unit:'length'`
 * (|points[2i]·points[2i+1]|), 3 ids per term for `unit:'angle'` (∠ at points[3i+1], i.e. vertex in
 * the MIDDLE, matching ∠ABC reading order). RHS terms arrive NEGATED in `coefs` (the parser moves
 * everything left), so «AB + CD = EF» is coefs [1, 1, −1], target 0, and «∠A + ∠B = 180» is
 * coefs [1, 1], target 180. Arc terms never reach the engine — the parser lowers each arc to its
 * central angle (arc XY on circle O ≡ ∠XOY, the ADR-116 precedent), so an arc-sum is an angle sum.
 * `points` is a FLAT id array on purpose: `renameInCommand`/`commandPointIds`/`commandObjectIds`
 * rewrite/scan only flat string arrays — a nested `{a,b,coef}[]` shape would silently break
 * rename/swap/merge and the HOIST placement.
 */
export interface MeasureSumConstraint {
  type: 'measure-sum';
  unit: 'length' | 'angle';
  coefs: number[];
  points: Id[];
  target: number;
}

/**
 * A MONOMIAL equality between segment-length products: k·∏|lhs pairs| = ∏|rhs pairs| (issues
 * #145/#144 — the power-of-a-point / similar-triangle proportion givens: «DM·ME = BM·DR»,
 * «DM/ME = BM/DM» cross-multiplied at parse to DM·DM = ME·BM, «4·DM² = BM·ME» as a repeated
 * pair). `lhs`/`rhs` are FLAT id arrays, 2 ids per factor (see {@link MeasureSumConstraint} on
 * why flat). The residual lives in LOG space (log k + Σlog|lhsᵢ| − Σlog|rhsⱼ|): signed,
 * sign-changing through the root, naturally scale-free when the factor DEGREES match — which the
 * parser guarantees (unequal-degree forms would pin the figure's scale and are refused for now).
 */
export interface LengthProductConstraint {
  type: 'length-product';
  k: number;
  lhs: Id[];
  rhs: Id[];
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

/**
 * An ORDER (inequality) between two angles — the angle (v1,a1,b1) must be the SMALLER
 * one. Used to enforce a stated assumption like "α < β" (ADR-039). Unlike an equality,
 * an inequality is satisfied by a whole REGION of configurations, so it can't be solved
 * by the bracketing root-finder; it rides the optimizer (resolveMixedCarriers) as a
 * one-sided residual that drives a free DOF toward a visibly-smaller v1 angle. It's
 * accepted as soon as the strict inequality holds with a small gap, but the solver aims
 * for a clearly-visible margin so the figure isn't misleading.
 */
export interface AngleOrderConstraint {
  type: 'angle-order';
  v1: Id;
  a1: Id;
  b1: Id;
  v2: Id;
  a2: Id;
  b2: Id;
}

/** An ORDER (inequality) between two segment lengths — |ab| must be the SHORTER (ADR-039). See {@link AngleOrderConstraint}. */
export interface LengthOrderConstraint {
  type: 'length-order';
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

/**
 * The listed points are CONCYCLIC — they all lie on one circle (ADR-041). Used when a
 * cyclic/inscribed polygon's vertices ALREADY exist (so they can't simply be re-placed on a
 * fresh circle): the constraint drives a free DOF among them until they share a circle. The
 * residual is the (signed, length-unit) deviation of the points beyond the first three from the
 * circle through those three — 0 ⇔ concyclic, and it sign-changes as a point crosses the circle,
 * so a 1-DOF on-segment carrier is solved in closed form. Needs ≥ 4 points to bite (any 3 are
 * trivially concyclic).
 */
export interface ConcyclicConstraint {
  type: 'concyclic';
  points: Id[];
}

/**
 * The three points a, b, c are COLLINEAR — c lies on the (infinite) line through a and b
 * (equivalently all three are on one line). Used to constrain an existing point onto a line
 * named by two others ("E on line AC", "line CE passes through A"): it drives a free DOF among
 * the three (an on-circle / on-segment point slides until they line up) and is a pure CHECK when
 * all three are already determined. The residual is the (scale-free) sine of ∠(b·a·c) — 0 ⇔
 * collinear, and it sign-changes as the third point crosses the line, so a 1-DOF carrier brackets
 * in closed form. A configuration that collapses two of the points together is rejected by the
 * solver's degeneracy gate, so "E on line AC" finds the OTHER crossing of line AC with E's circle,
 * not the trivial E = A. The FIRST point is the one the solver prefers to drive (driveOrCheck).
 */
export interface CollinearConstraint {
  type: 'collinear';
  a: Id;
  b: Id;
  c: Id;
}

/**
 * The points are collinear AND appear IN THE LISTED ORDER along the line (ADR-050 Am.3) — "line ABE"
 * means A, then B, then E, i.e. each interior point lies BETWEEN its neighbours. Like the other order
 * constraints ([ADR-039](docs/06-decisions.md#adr-039)) it is an inequality satisfied by a whole region,
 * so it has no sign change for the bracketing solver — it rides the optimizer as a one-sided residual
 * (the sum of out-of-order overlaps of the points' projections onto the line P0→Pn-1) and is otherwise a
 * pure check. Pairs with a {@link CollinearConstraint} (which makes them collinear); this fixes the
 * SIDE/order, so naming the points in sequence selects the configuration (which crossing, which side).
 */
export interface CollinearOrderConstraint {
  type: 'collinear-order';
  points: Id[];
}

/**
 * The ACUTENESS of an angle — ∠(ray1,vertex,ray2) must be OBTUSE (> 90°) or ACUTE (< 90°). Like the other
 * order/inequality constraints ([ADR-039](docs/06-decisions.md#adr-039)) it is satisfied by a whole region
 * (one side of 90°), so it has no sign change — it rides the optimizer as a one-sided residual and actively
 * reshapes the figure (drives a free DOF) so the angle falls on the requested side. "זווית קהה" = obtuse,
 * "זווית חדה" = acute. ([ADR-108](docs/06-decisions.md#adr-108).)
 */
export interface AngleAcutenessConstraint {
  type: 'angle-acuteness';
  vertex: Id;
  ray1: Id;
  ray2: Id;
  obtuse: boolean; // true = obtuse (>90°); false = acute (<90°)
}

export type Constraint =
  | AngleConstraint
  | DistanceConstraint
  | EqualConstraint
  | RatioConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | AngleRatioConstraint
  | CoincideConstraint
  | AngleOrderConstraint
  | LengthOrderConstraint
  | ConcyclicConstraint
  | CollinearConstraint
  | CollinearOrderConstraint
  | AngleAcutenessConstraint
  | LengthRadiusConstraint
  | AreaConstraint
  | AreaRatioConstraint
  | PerimeterConstraint
  | PerimeterRatioConstraint
  | MeasureSumConstraint
  | LengthProductConstraint;

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
  | { type: 'polygon'; ids: Id[] } // a generic n-gon (n ≥ 3): n boundary segments + the polygon object; its vertices are placed by prior commands (e.g. a regular polygon's on-circle vertices)
  | { type: 'free-point'; id: Id; x: number; y: number; free?: boolean; ifAbsent?: boolean } // free: an AUTO-placed default (a construct's apex) — a free DOF, NOT pinned (ADR-052); a student-typed "A at (x,y)" omits it and pins. ifAbsent: a parser-injected ensure-exists (a NEW point named onto a line, ADR-236) — skipped entirely when the id already exists as ANYTHING (never moves, never conflicts)
  | { type: 'point-on-segment'; id: Id; a: Id; b: Id; t?: number; branch?: number; extension?: boolean } // branch: which root, once a constraint drives it (ADR-043); extension: an unstated t>1 default, recruitable not eager (ADR-073)
  | { type: 'point-by-distances'; id: Id; from1: Id; dist1: number; from2: Id; dist2: number; branch?: number }
  | { type: 'line-line-intersection'; id: Id; a: Id; b: Id; c: Id; d: Id; dir1?: boolean; dir2?: boolean; onSeg?: boolean; onSeg1?: boolean; onSeg2?: boolean } // dir1/dir2: a "המשך" operand — A must be BEYOND the 2nd point (ADR-054). onSeg: a plain SEGMENT meet — the crossing must land WITHIN both segments (ADR-166). onSeg1/onSeg2: only THAT operand is bare — within that segment alone, driven by collinear-order (issue #22)
  | { type: 'segment'; a: Id; b: Id }
  | { type: 'set-angle'; vertex: Id; ray1: Id; ray2: Id; value: number; arcOf?: Id } // arcOf: the value is an ARC measure on that circle (vertex = centre) — constraint identical, display on the arc, no centre wedge (ADR-116/335)
  | { type: 'set-distance'; a: Id; b: Id; value: number }
  | { type: 'set-radius'; circle: Id; value: number } // a circle's radius = value (no segment drawn — ADR-087)
  // Bind a CONCENTRIC pair's roles: `inner` stays strictly inside `outer` (ADR-244). A REQUIREMENT, never a
  // driven constraint — the radii stay free DOFs (ADR-052); the givens verifier flags an order-violating
  // config, so `meetsRequirements` (sampler / "show another") skips it and a real contradiction reads amber.
  | { type: 'set-radius-order'; outer: Id; inner: Id }
  // Bind a LETTER as a circle's radius symbol — "מעגל שרדיוסו R" / "רדיוס מעגל P הוא r" (issue #54, the
  // ADR-034 auto-bind generalized per circle). Pure data: stamps `radiusSymbol` on the circle object; the
  // radius stays a free DOF. Read back by the parser context (relations "R = 1.5r" / "R > r"), the
  // symbolic-measure lowering ("AB = √2R" couples to THIS circle), and the radius-slider labels.
  | { type: 'radius-symbol'; circle: Id; name: string }
  // radius(c1) = k · radius(c2) — a RATIO between two circles' radii ("R = 1.5r", "R/r = 2√7/5"). Lowered
  // at apply to an ordinary `ratio` constraint over (centre, on-circle witness) pairs — a witness point on
  // each circle is resolved from the figure or minted as a hidden pinned `~radw-*` rider — so the existing
  // solver machinery (incl. the ADR-103 free-radius recruitment) drives it; no new solver code.
  | { type: 'set-radius-ratio'; c1: Id; c2: Id; k: number }
  | { type: 'show-circle'; id: Id } // #83 (ADR-291): reveal an EXISTING hidden circle — a circumscription stated about points already riding a circle RESOLVES it (never a coincident duplicate)
  | { type: 'name-center'; center: Id } // reveal/name an EXISTING circle's auto-hidden centre (FR-RN-8): the student said "O is the centre of the circle" — flips the circle's autoCenter off so its centre shows, WITHOUT touching the radius
  | { type: 'set-area'; ids: Id[]; value: number } // area of polygon `ids` = value (ADR-118)
  | { type: 'set-area-ratio'; ids1: Id[]; ids2: Id[]; k: number } // area(ids1) = k·area(ids2)
  | { type: 'set-perimeter'; ids: Id[]; value: number } // perimeter of polygon `ids` = value (ADR-228)
  | { type: 'set-perimeter-ratio'; ids1: Id[]; ids2: Id[]; k: number } // perimeter(ids1) = k·perimeter(ids2)
  // Σ coefs[i]·m_i = target over same-unit measures (#153/#154): stride-2 length pairs or stride-3
  // angles (vertex in the middle) in the FLAT `points`; RHS terms arrive negated; arcs are lowered by
  // the parser to central angles first. See {@link MeasureSumConstraint}.
  | { type: 'set-measure-sum'; unit: 'length' | 'angle'; coefs: number[]; points: Id[]; target: number }
  // k·∏|lhs pairs| = ∏|rhs pairs| (#145/#144, power-of-a-point/proportion): flat 2-id factors,
  // quotients cross-multiplied at parse, squares = repeated pair. See {@link LengthProductConstraint}.
  | { type: 'set-length-product'; k: number; lhs: Id[]; rhs: Id[] }
  | { type: 'set-equal'; a: Id; b: Id; c: Id; d: Id; soft?: boolean } // soft: a DEFAULT equal-pair a named-shape macro picks when the student didn't say which sides are equal (e.g. isosceles |AB|=|AC|); the store drops it if an explicit equality on the same triangle is stated (ADR-114). The engine treats it as an ordinary equality.
  | { type: 'set-ratio'; a: Id; b: Id; c: Id; d: Id; k: number; add?: number } // |ab| = k·|cd| + add
  | { type: 'set-length-radius'; a: Id; b: Id; circle: Id; center: Id; witness: Id; k: number; add?: number } // |ab| = k·R (ADR-071)
  | { type: 'set-angle-ratio'; v1: Id; a1: Id; b1: Id; v2: Id; a2: Id; b2: Id; k: number } // ∠1 = k·∠2
  | { type: 'set-angle-order'; v1: Id; a1: Id; b1: Id; v2: Id; a2: Id; b2: Id } // ∠1 < ∠2 (∠1 is the smaller)
  | { type: 'set-length-order'; a: Id; b: Id; c: Id; d: Id } // |ab| < |cd| (ab is the shorter)
  | { type: 'set-angle-acuteness'; vertex: Id; ray1: Id; ray2: Id; obtuse: boolean } // ∠ obtuse (>90°) / acute (<90°) — "זווית קהה/חדה"
  | { type: 'set-parallel'; a: Id; b: Id; c: Id; d: Id }
  // `implicit` ⇒ the perpendicularity is structurally implied (a radius ⟂ a tangent line), NOT a
  // right angle the student stated; it constrains the figure but draws no right-angle mark (a
  // computed 90° is never marked — only a stated one).
  | { type: 'set-perpendicular'; a: Id; b: Id; c: Id; d: Id; implicit?: boolean }
  | { type: 'set-concyclic'; points: Id[] } // the points are concyclic (drives a DOF so they share a circle)
  | { type: 'set-collinear'; a: Id; b: Id; c: Id } // a, b, c collinear (drives a free DOF so the third lands on the line)
  | { type: 'set-line'; points: Id[] } // "line ABE…": the points are collinear AND in the listed order (B between A and E)
  // Phase 5b — lines (scaffolding unless `visible`) and the points they produce.
  | { type: 'bisector'; id: Id; vertex: Id; p: Id; q: Id; visible?: boolean }
  | { type: 'perpendicular-line'; id: Id; through: Id; a: Id; b: Id; visible?: boolean }
  | { type: 'parallel-line'; id: Id; through: Id; a: Id; b: Id; visible?: boolean }
  | { type: 'line-through'; id: Id; a: Id; b: Id; visible?: boolean }
  // `order` (optional, e.g. [A, B, id]) carries a directional ON-LINE order — "המשך AB meets … at id" puts
  // id BEYOND B — as a `collinear-order` whose residual flexes the figure to keep id on the named side in
  // every config (the ADR-127 mechanism, shared with line-circle-intersection; no sampler search).
  | { type: 'line-intersection'; id: Id; line1: Id; line2: Id; order?: Id[] }
  | { type: 'foot'; id: Id; from: Id; a: Id; b: Id }
  | { type: 'midpoint'; id: Id; a: Id; b: Id }
  // Phase 5c — circles and the points they produce.
  | { type: 'circle'; id: Id; center: Id; radius: number; hidden?: boolean; autoCenter?: boolean; freeRadius?: boolean; ifAbsent?: boolean; implied?: boolean } // freeRadius: radius is a DOF (ADR-051); ifAbsent: a parser-injected implicit circle — skip if it already exists (don't clobber a real one); implied: minted by withImplicitCircles for a NAMED reference that matched no circle (#186 — the App may BIND that name to an unnamed circle instead of committing this creation)
  | { type: 'circle-through'; id: Id; center: Id; through: Id; hidden?: boolean; autoCenter?: boolean }
  | { type: 'circumcircle'; id: Id; center: Id; a: Id; b: Id; c: Id; hidden?: boolean } // circle through a,b,c (centre = circumcentre); hidden for a cyclic (בר-חסימה) figure
  | { type: 'point-on-circle'; id: Id; circle: Id; theta?: number; free?: boolean; between?: [Id, Id]; major?: boolean; softPair?: boolean } // theta = a STARTING angle; free:true keeps it a samplable/drivable DOF even with a start angle (ADR-097); between = a free point on the arc from-to (ADR-042), major = the far/reflex arc (#90); softPair: a common-tangent macro's DEFAULT touch↔circle pairing — the store swaps the pair when a later explicit membership states the opposite assignment (ADR-239, the M4 shape)
  // "M מחוץ למעגל / בתוך המעגל" (ADR-254): a NEW id is created as a FREE point (2 DOF) seeded on the
  // stated side; an EXISTING id is a statement about that point (M1) — a non-pinned free point on the
  // wrong side is re-seated to its stated side, anything else is left to the verifier. The side itself
  // is a REQUIREMENT (like `set-radius-order`): the givens verifier flags a wrong-side config, so
  // `meetsRequirements` (sampler / "show another") skips it — never a driven equality.
  | { type: 'point-circle-side'; id: Id; circle: Id; side: 'inside' | 'outside' }
  // "E … בתוך המשולש KAO" / "inside triangle KAO" (issue #99) — a point's side of a POLYGON region: the
  // ADR-254 circle-side family, polygon edition. `poly` = the region's vertex ids (≥3, cyclic). Same
  // M1 shape: a NEW id becomes a FREE point seeded on the stated side; an EXISTING free point on the
  // wrong side is re-seated (a better default, never a drive) — incl. a free ON-CIRCLE point, whose
  // starting θ is re-seated into the region (the 2025-bagrut "E on the small circle inside △KAO"). The
  // side is a REQUIREMENT: the verifier flags a wrong-side config (figure.v.insideRegion/outsideRegion),
  // so `meetsRequirements` (sampler / "show another") skips it — never a driven equality.
  | { type: 'point-polygon-side'; id: Id; poly: Id[]; side: 'inside' | 'outside' }
  | { type: 'diameter'; id1: Id; id2: Id; circle: Id; theta?: number }
  | { type: 'arc'; id: Id; center: Id; from: Id; to: Id; bulgeRef?: Id; bulgeToward?: boolean; spanDeg?: number } // a drawn arc: semicircle / quarter / sector. spanDeg = the INTENDED central angle (arc identity, ADR-356); bulgeRef+bulgeToward orient a semicircle outside/inside a shape (render-time)
  | { type: 'arc-midpoint'; id: Id; circle: Id; from: Id; to: Id; branch?: number }
  // `order` (e.g. [C, id, E]) keeps the crossing ON the segment between two of the line's points (the
  // circle "cuts CE at D" ⇒ D between C and E), via a `collinear-order` constraint — D is already
  // collinear (it's on the line), so only the side/order is constrained ([ADR-127]).
  // `onSegment` [a,b] (ADR-313/#119): pick the crossing WITHIN the a–b segment as a stable SELECTION (no
  // constraint), for the case where one endpoint is inside the circle (e.g. the centre) so exactly one root
  // is within — a pick, not the flex-the-figure `order`. Distinct from `order` (a driving collinear-order).
  | { type: 'line-circle-intersection'; id: Id; line: Id; circle: Id; branch?: number; avoid?: Id; order?: Id[]; onSegment?: [Id, Id] }
  // "המשך AC חותך מעגל P בנקודה D" — directional extension onto a circle (ADR-054): the NEW point
  // `id` is collinear with `a`,`b` AND beyond `b` (order a→b→id); a free-radius circle adapts so the
  // extension actually reaches it. Distinct from `line-circle-intersection` (order-agnostic chord).
  | { type: 'extend-onto-circle'; id: Id; a: Id; b: Id; circle: Id; branch?: number }
  | { type: 'circle-circle-intersection'; id: Id; circle1: Id; circle2: Id; branch?: number; avoid?: Id }
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
  // A VALUELESS stated-angle MARK ([issue #106], FR-RN-7): draw an angle arc at `vertex` between the rays to
  // `ray1`/`ray2` WITHOUT asserting any value — a highlightable marker (e.g. a valueless central angle). It
  // adds no geometry (the arms are drawn as their own `segment`s) and lowers to nothing for the engine.
  | { type: 'mark-angle'; vertex: Id; ray1: Id; ray2: Id }
  // The (possibly symbolic) AREA of a named polygon ([ADR-118](docs/06-decisions.md#adr-118)). Lowered like
  // `measure-length`: a value → `set-area`; a shared variable → `set-area-ratio` against the representative.
  | { type: 'measure-area'; ids: Id[]; expr: MeasureExpr }
  | { type: 'set-var'; name: string; value: number }
  // An ordering between two named measures — "α < β" / "x > y" (ADR-039). Lowered (lower.ts) to a
  // `set-angle-order`/`set-length-order` once the symbol table says which measure each variable names.
  | { type: 'measure-order'; left: string; op: '<' | '>' | '<=' | '>='; right: string }
  // A named shape whose CONFIGURATION is an ambiguous, cyclable VARIANT ([ADR-138](docs/06-decisions.md#adr-138)):
  // a kite (which diagonal is the axis of symmetry — 2 variants), an isosceles triangle (which vertex is the
  // apex — 3), or a base-less midsegment whose second endpoint rides one of two other sides ([ADR-199](docs/06-decisions.md#adr-199),
  // 2 variants — ids `[P,Q,R,E,G]`: E is the midpoint of side PQ, G the midpoint of PR (v0) or QR (v1)).
  // `replay` EXPANDS it to the base shape + the variant-selected commands; for kite/isosceles an explicit
  // `set-equal` on the shape's sides PINS the matching variant (and that pair is not re-emitted). `variant`
  // is the persisted, cyclable index ("show another configuration" steps it).
  | { type: 'shape-variant'; shape: 'kite' | 'isosceles' | 'midsegment'; ids: Id[]; variant: number }
  // A polygon INSCRIBED IN ANOTHER POLYGON ([ADR-262](docs/06-decisions.md#adr-262)) — "מעוין BDEF חסום
  // במשולש ABC" / "rectangle inscribed in triangle ABC". The inscribed `shape` (rhombus/rectangle/square/
  // parallelogram) has its vertices `ids` (cyclic order) riding the boundary of `container` (cyclic order):
  // a vertex whose LABEL is shared with the container coincides with it; every other vertex becomes a free
  // `point-on-segment` rider on a container side, plus the shape's defining constraints (equal sides /
  // right angles), so the constraint solver flexes it into shape — no new engine construct (the ADR-110
  // macro pattern). `replay` EXPANDS it to those commands per the cyclable `variant`; which side hosts an
  // extra vertex and the mirror direction are genuinely unstated (ADR-052/M4) → the variant "show another
  // configuration" cycles, and an explicit `point-on-segment` given on a shape vertex PINS the matching
  // variant. `containerKind` tells the expansion whether to CREATE the container (labels not yet drawn) or
  // reuse the existing one (M1).
  | { type: 'inscribe'; shape: 'rhombus' | 'rectangle' | 'square' | 'parallelogram'; ids: Id[]; container: Id[]; containerKind: 'triangle' | 'quad'; variant: number };

/** What the parser produces and a `Fact` stores: engine commands plus the symbolic layer. */
export type AnyCommand = Command | SymbolicCommand;

/** Tolerances. */
export const LEN_EPS = 1e-6; // coordinate closeness (units)
export const ANGLE_EPS = 0.5; // degrees

/**
 * Inequality (order) constraint tuning (ADR-039). An ordering like "α < β" is satisfied by a
 * whole region, so two thresholds decouple "looks clearly smaller" from "is at all smaller":
 *  - MARGIN is the *target* gap the optimizer drives toward (so the figure isn't misleadingly close);
 *  - MIN_GAP is the *acceptance* threshold (any strict gap ≥ this passes), so a figure whose geometry
 *    only allows a small gap is still accepted rather than wrongly flagged a contradiction.
 * The order residual is `max(0, smaller − larger + MARGIN)`; its tolerance is `MARGIN − MIN_GAP`, so
 * `residual ≤ tol ⇔ smaller ≤ larger − MIN_GAP`.
 */
export const ORDER_ANGLE_MARGIN_DEG = 8; // degrees — the visible gap the solver aims for
export const ORDER_ANGLE_MIN_GAP_DEG = 1; // degrees — accept any config at least this much in order
export const ORDER_LEN_MARGIN_FRAC = 0.12; // fraction of the longer length — visible target gap
export const ORDER_LEN_MIN_FRAC = 0.02; // fraction — acceptance threshold
