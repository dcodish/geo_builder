/**
 * The 3-D engine's data model (docs/20 §6.1) — V0 + V1 (the geometric-vector lane).
 *
 * Same philosophy as the 2-D engine: commands lower into a Construction (a
 * dependency-ordered object list), `evaluate` derives positions from it plus a
 * seed (free DOFs are sampled, never stored — ADR-052), and the renderer is a
 * pure consumer. Positions are NEVER part of the construction.
 *
 * V1 adds the geometric-vector layer: NAMED VECTORS (`נסמן: AB=u…` — a lowercase
 * letter bound to an ordered point pair), auxiliary drawn SEGMENTS, the centroid,
 * the in-span driven point (2020-Q2's `KP = αu+βv`), and CLAIMS — the student's
 * ANSWERS, verified numerically against the figure across several sampled
 * configurations (docs/20 §6.2: numeric-first, NO CAS — a hard operator boundary).
 * A claim never moves the figure; it is checked, green or refused.
 *
 * Point ids: an uppercase letter + optional digits + optional prime, canonicalised
 * to ASCII `'` (typography renders it as `′` — ADR-3D-001). Vector names: a single
 * lowercase letter (the bagrut idiom is always u, v, w).
 */

import type { Vec3 } from './vec3';

export type Id = string;

// ---------------------------------------------------------------------------
// Vector expressions & claims (V1 — the bounded symbolic layer)
// ---------------------------------------------------------------------------

export type VecAtom =
  | { kind: 'named'; name: string } // a declared vector, e.g. u
  | { kind: 'pair'; from: Id; to: Id }; // AM ≡ M − A

export interface VecTerm {
  coeff: number;
  atom: VecAtom;
}

/** A linear combination Σ coeff·atom — the ONLY expression form (no CAS). */
export type VecExpr = VecTerm[];

/** A term whose coefficient may be linear in ONE scalar symbol (V7: `(k/2)·DB⃗`): coeff = k + p·symbol. */
export interface SymTerm {
  coeff: LinExpr;
  atom: VecAtom;
}

export type Claim3 =
  | { type: 'length-rel'; a1: Id; b1: Id; a2: Id; b2: Id; c: number } // |a1b1| = c·|a2b2|
  | { type: 'volume-eq-poly'; ids1: Id[]; ids2: Id[] } // נפח SENB = נפח CENB (two tetra volumes equal)
  | { type: 'vec-eq'; lhs: VecExpr; rhs: VecExpr } // AM = ½u + ½v + 5/3·w
  | { type: 'perp-plane'; seg: [Id, Id]; plane: [Id, Id, Id] } // CA' ⊥ plane BC'D
  | { type: 'collinear3'; ids: Id[] } // E, C, A' on one line
  | { type: 'length-eq'; a: Id; b: Id; value: number } // AB = 3 (all points pinned ⇒ a CHECK)
  | { type: 'area-eq'; ids: [Id, Id, Id]; value: number } // שטח ABC = 4.5
  | { type: 'coords-eq'; id: Id; x: number; y: number; z: number } // A = (2, 0, -10)
  | { type: 'never-parallel'; line: string; plane: string } // ℓ ∦ π for EVERY parameter value (2024-Q2 א)
  | { type: 'plane-eq'; ids: Id[]; cx: number; cy: number; cz: number; d: number } // המישור KBC: x+2y+3z-26=0
  | { type: 'angle-seg-eq'; a1: Id; b1: Id; a2: Id; b2: Id; deg: number } // הזווית בין A'C לבין BC' היא 90 (between lines, ≤90°)
  | { type: 'length-ratio'; a1: Id; b1: Id; a2: Id; b2: Id; p: number; q: number } // A'K : A'C = 2 : 3
  | { type: 'volume-eq'; solid: string; value: number } // נפח החרוט = 100π (value in world units³, π parsed)
  | { type: 'lateral-area-eq'; solid: string; value: number } // שטח המעטפת של החרוט = 65π
  | { type: 'lines-rel'; a1: Id; b1: Id; a2: Id; b2: Id; rel: 'skew' | 'parallel' | 'intersect' } // NK ו-PL מצטלבים (V7 T3)
  | { type: 'volume-poly'; ids: Id[]; value: number } // נפח הפירמידה ABCD = 64 (tetra: |triple|/6; V7 T2)
  // V8-f (G6/G9/G10) — vector-relation givens VERIFIED on a determined figure. Each
  // operand is a VecAtom (a declared vector or a point pair), so `cos∠ACB` (vertex →
  // pairs) and `cos(u,v)` (named vectors) share one form.
  | { type: 'cos-angle-eq'; u: VecAtom; v: VecAtom; cos: number } // cos∠ACB = 3/4 · cos(w,u) = √35/10
  | { type: 'dot-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // u·v = v·w (a chained-equality link)
  | { type: 'cos-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // ∠(a,b) = ∠(c,d) — AE makes equal angles with AB, AD
  // triage 3-D: the angle between a LINE (a–b) and a PLANE (point-run) — `sin β = |n·u|/(|n||u|)`
  | { type: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg: number };

/** V7 T2 — a SCALAR given that DRIVES the figure (a residual in the global solve). */
export type ScalarPin =
  | { kind: 'length-rel'; a1: Id; b1: Id; a2: Id; b2: Id; c: number } // |a1b1| = c·|a2b2| (similarity-INVARIANT)
  | { kind: 'length'; a: Id; b: Id; value: number } // |DC| = 4
  | { kind: 'vangle'; vertex: Id; p: Id; q: Id; deg: number } // ∠ADC = 120
  | { kind: 'dot'; v1: string; v2: string; value: number } // u·v = 24
  | { kind: 'seg-perp-plane'; a: Id; b: Id; plane: Id[] } // DC ניצב למישור ABC (a driving given)
  | { kind: 'seg-par-plane'; a: Id; b: Id; plane: Id[] }
  // V8-f (G6/G9/G10) — vector-relation givens that DRIVE a free-dim figure. All three
  // are similarity-INVARIANT (angle/cos, and an equality of dot products both scale as
  // s²), so they join the gauge-frozen dims-only solve.
  | { kind: 'cos-angle'; u: VecAtom; v: VecAtom; cos: number } // cos∠ACB = 3/4 · cos(w,u) = √35/10 (G6)
  | { kind: 'dot-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // u·v = v·w (G9 chain link)
  | { kind: 'cos-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // ∠(a,b) = ∠(c,d) — equal angles (G10)
  // triage 3-D: the angle between line a–b and plane (point-run) is `deg` — similarity-invariant
  | { kind: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg: number };

// ---------------------------------------------------------------------------
// The algebraic lane (V2 — docs/20 §6.3): coefficients may carry ONE symbolic
// parameter (the bagrut idiom: `ay + z − 8 = 0`), pinned by a stated relation.
// ---------------------------------------------------------------------------

/** A linear expression in the figure's single parameter: value = k + p·param. */
export interface LinExpr {
  k: number;
  p: number;
}

/** ax+by+cz+d = 0, each coefficient a LinExpr; `src` keeps the student's given form (docs/20 §6.3). */
export interface PlaneDef {
  cx: LinExpr;
  cy: LinExpr;
  cz: LinExpr;
  d: LinExpr;
  src: string;
}

export type Line3Def =
  | { kind: 'plane-plane'; p1: string; p2: string }
  | {
      /** A TYPED parametric line (V3, 2024-Q2): x = anchor + t·dir — components may carry the parameter. */
      kind: 'parametric';
      anchor: [LinExpr, LinExpr, LinExpr];
      dir: [LinExpr, LinExpr, LinExpr];
      src: string;
    }
  | {
      /** A line THROUGH two existing points (V5 — `הישר A'C`), resolved from final positions. */
      kind: 'through';
      a: Id;
      b: Id;
    }
  // V8-h (G8): the COMMON PERPENDICULAR of two lines — dir = dir(line1) × dir(line2) (cross is
  // internal-only, never displayed), anchor = the foot on line1 of the shortest connecting segment.
  | { kind: 'common-perp'; line1: string; line2: string }
  // V8-h (G8): the PROJECTION (`היטל`) of a line onto a plane — each point's ⟂ foot on the plane.
  | { kind: 'line-projection'; line: string; plane: string };

/**
 * V8-b (G1): a plane defined by a ⊥/∥ RELATION to a segment/edge (not by points or an
 * equation), resolved from FINAL positions like a point-run plane.
 *  - `perp`: through one point, normal = the direction of segment a–b (plane ⟂ that edge).
 *  - `par`:  through two points, normal = (through₂−through₁) × dir(a–b) (plane ∥ that edge).
 */
export type RelPlaneDef =
  | { kind: 'perp'; through: Id; a: Id; b: Id }
  | { kind: 'par'; through: [Id, Id]; a: Id; b: Id };

// ---------------------------------------------------------------------------
// Commands (what the parser emits)
// ---------------------------------------------------------------------------

/** The solid family. `cube`/`box`: 8 ids (base then primed tops); `prism3`: 6 ids (right triangular
 *  prism); `pyramid4`/`pyramid3`: base ring then the APEX LAST — a RIGHT pyramid (apex above the
 *  base's circumcentre, so the lateral edges are equal; stated `ישרה` required, ADR-052). */
export type SolidKind =
  | 'cube' | 'box' | 'prism3' | 'pyramid4' | 'pyramid3' | 'tetra' | 'prism4r' | 'pyramid4g' | 'pyramid4r' | 'pyramid4gr'
  // V8-d: equilateral-triangle-base right prism/pyramid, and a free-apex parallelogram-base pyramid
  | 'prism3e' | 'pyramid3e' | 'pyramidPar'
  // V8-g: a FLAT polygon of free points in the z=0 plane (the 2-D vector lane) — triangle /
  // quadrilateral / pentagon. Modelled as a "solid" so it reuses the dims-sampler + the
  // pivot (free case → sampled shape; metric givens → the pivot drives it); double-sided
  // (two opposite faces) so a flat figure never renders fully hidden.
  | 'polygon3' | 'polygon4' | 'polygon5';
// The 4-base pyramid family: rightness (ישרה — apex above the base centre) and base shape
// are INDEPENDENT stated givens (ADR-052). Square must be STATED (שבסיסה ריבוע); an
// unstated base is a free-aspect rectangle DOF. pyramid4: right+square (dims [h]);
// pyramid4r: right+rect (dims [b,h]); pyramid4g: free apex+square (dims [ax,ay,az]);
// pyramid4gr: free apex+rect (dims [b,ax,ay,az]).
// tetra: `פירמידה ABCD` — a GENERAL triangular pyramid (free apex, 5 dims);
// prism4r: `מנסרה ישרה שבסיסה מעוין` — rhombus base (dims: base angle + height).

export interface SolidCommand {
  type: 'solid';
  kind: SolidKind;
  ids: Id[];
}

/**
 * A point on segment a–b: P = a + t·(b−a).
 * `t` given ⇒ determined (midpoint t=½, ratio AK=2·KB ⇒ t=⅔).
 * `t` absent ⇒ a FREE 1-DOF point (sampled per seed, resampled by "show another").
 */
export interface PointOnSegment3Command {
  type: 'point-on-segment3';
  id: Id;
  a: Id;
  b: Id;
  t?: number;
}

/** `נסמן: AB = u` — bind a lowercase name to the ordered pair from→to. */
export interface NameVectorCommand {
  type: 'name-vector';
  name: string;
  from: Id;
  to: Id;
}

/** An auxiliary drawn segment between EXISTING points (idempotent; a solid edge is never duplicated). */
export interface Segment3Command {
  type: 'segment3';
  a: Id;
  b: Id;
}

/** `E מפגש התיכונים של משולש BC'D` — the centroid of three existing points. */
export interface Centroid3Command {
  type: 'centroid3';
  id: Id;
  of: [Id, Id, Id];
}

/**
 * `E מפגש האלכסונים של הפאה ABCD` / `E is the intersection of the diagonals of face
 * ABCD` (V8-a) — the diagonal crossing of a parallelogram face/base = the midpoint of
 * a diagonal (EXACT for the box/cube faces & square/rect/parallelogram bases this
 * curriculum names; a general quad's crossing ≠ midpoint — filed). `face` = the 4
 * cyclic vertices, or `[]` = the "the base" sentinel (resolved by apply to the single
 * solid's base ring, the ADR-3D-011 chokepoint pattern).
 */
export interface DiagIntersectionCommand {
  type: 'diag-intersection';
  id: Id;
  face: Id[];
}

/**
 * 2020-Q2's `P על AM כך ש-KP = αu + βv`: P rides segment a–b, its t DRIVEN so the
 * vector vecFrom→P lies in span{span} of the declared basis — closed-form (the
 * complement coefficient is affine in t), the V1 embodiment of "1-DOF root-find only".
 */
export interface PointInSpanCommand {
  type: 'point-in-span';
  id: Id;
  a: Id;
  b: Id;
  vecFrom: Id;
  span: string[];
}

/** A student's answer to be VERIFIED against the figure (never drives anything). */
export interface ClaimCommand {
  type: 'claim';
  claim: Claim3;
}

// --- V2 (algebraic lane) commands ---

/**
 * `A(2,-2,6)` — a coordinate point. On a NEW id it creates a pinned point (Lane A).
 * On an EXISTING id it is a coordinate INJECTION — the V4 pivot's given (the 2-D M1
 * principle: a statement about an existing point is a constraint). A component may
 * be null (`A(3,n,p)` — a symbolic letter): only the numeric components constrain.
 */
export interface Point3Command {
  type: 'point3';
  id: Id;
  x: number | null;
  y: number | null;
  z: number | null;
  /** ADR-3D-032: the symbol letter behind each null component (`M(k,1,3)` → ['k',null,null]).
   *  On a NEW id with ONE distinct letter the point becomes `coord-sym` (the letter is the
   *  figure's single parameter); an EXISTING id keeps the V4 partial-pin semantics. */
  syms?: [string | null, string | null, string | null];
}

/** ADR-3D-032: `k הוא פרמטר חיובי` — a sign given on the figure's symbolic parameter
 *  (selects among the root branches, the point sign-given's sibling). */
export interface ParamSignCommand {
  type: 'param-sign';
  sym: string;
  positive: boolean;
}

/** `נתון: v = (10,-5,0)` — inject a numeric value for a DECLARED vector (the V4 pivot). */
export interface InjectVectorCommand {
  type: 'inject-vector';
  name: string;
  x: number;
  y: number;
  z: number;
}

/** `שיעור ה-z של C' חיובי` — a SIGN branch given (selects among pivot solutions). */
export interface SignGivenCommand {
  type: 'sign-given';
  id: Id;
  axis: 'x' | 'y' | 'z';
  positive: boolean;
}

/** `המישור BC'D` — a plane through existing points (resolved from their positions). */
export interface PlaneThroughCommand {
  type: 'plane-through';
  name: string;
  ids: Id[];
}

/**
 * V7 — a vector RELATION `X⃗Y = Σ coeff·atom` (coefficients may carry ONE scalar
 * symbol). APPLY decides its meaning (the M1 shape): all points known → a vec-eq
 * CLAIM; exactly one unknown point → a DEFINITION (affine, one 3×3 solve; with a
 * symbol, a 1-parameter family a later condition pins; TWO symbol-relations on the
 * same unknown = the cevian intersection, closed form).
 */
export interface VecRelCommand {
  type: 'vec-rel';
  from: Id;
  to: Id;
  terms: SymTerm[];
  symbol?: string;
}

/**
 * V7 — a segment/vector ∥-or-⟂-to-plane RELATION. APPLY decides: when an endpoint
 * is an unpinned symbolic vec-defined point → the condition PINS its symbol;
 * otherwise it is a claim (⟂ only; ∥-to-plane claims arrive with demand).
 */
export interface SegPlaneRelCommand {
  type: 'seg-plane-rel';
  rel: 'parallel' | 'perp';
  a: Id;
  b: Id;
  plane: Id[];
}

/** `הישר A'C` as an object (V5): a named line through two existing points. */
export interface LineThroughCommand {
  type: 'line-through';
  name: string;
  a: Id;
  b: Id;
}

/**
 * V8-i (G13): a CIRCLE lying in a plane in R³ — center + plane (normal) + radius. Definitions:
 *  - `tangent-line`: centered at `center`, in the plane through the center & the line, TANGENT to it
 *    (normal, radius = dist(center,line), and the touch point are all derived);
 *  - `center-plane-radius`: centered, lying in a named plane, with a given radius.
 */
export type Circle3Def =
  | { kind: 'tangent-line'; center: Id; line: string }
  | { kind: 'center-plane-radius'; center: Id; plane: string; radius: number };

/** `מעגל O במישור π משיק לישר ℓ בנקודה B` — a circle in R³ (id `circle-<centre>` unless named). */
export interface Circle3Command {
  type: 'circle3';
  id: string;
  def: Circle3Def;
  /** For the tangent form: the touch point to create (a foot-line point). */
  touch?: Id;
}

export interface Circle3Obj {
  id: string;
  def: Circle3Def;
}

// --- V6 (solids of revolution — the curriculum's spatial-trig block) ---

export type RevolutionKind = 'cylinder' | 'cone' | 'sphere';

/**
 * `חרוט שקודקודו S ומרכז בסיסו O, רדיוס 5, גובה 12` — a solid of revolution, axis
 * vertical. Unstated radius/height are FREE sampled DOFs (ADR-052); stated ones pin.
 * `center` = base centre (sphere: the centre); `apex` only for a cone.
 */
export interface RevolutionCommand {
  type: 'revolution';
  kind: RevolutionKind;
  center?: Id;
  apex?: Id;
  radius?: number;
  height?: number;
}

export interface RevolutionObj {
  kind: RevolutionKind;
  center?: Id;
  apex?: Id;
  radius?: number;
  height?: number;
}

/** `המישור π1: z-3=0` — a plane by equation; the single parameter rides in the LinExprs. */
export interface Plane3Command {
  type: 'plane3';
  name: string;
  plane: PlaneDef;
  /** The parameter letter used in the coefficients, if any. */
  param?: string;
}

/** `הזווית בין המישורים היא 45°` — PINS the parameter (its roots are the figure's branches). */
export interface PlaneAngleCommand {
  type: 'plane-angle';
  p1: string;
  p2: string;
  deg: number;
  branch?: number;
}

/** `A נמצאת על אחד המישורים` — membership given; with `'any'` it also SELECTS the branch (2022-Q2).
 *  `side` states which side of a NAMED plane the point is on (`E מעל המישור ABC`); "above" is the
 *  +z side, so a vertical plane refuses honestly. APPLY decides by id (M1): an EXISTING point is
 *  a verified given; a NEW id is CREATED as a free point riding (or floating beside) the plane. */
export interface OnPlanesCommand {
  type: 'on-planes';
  id: Id;
  plane: string | 'any';
  side?: 'above' | 'below';
}

/** `מ-A מורידים אנך למישור π1 החותך אותו בנקודה B` — the ⟂ foot on a plane. */
export interface FootOnPlaneCommand {
  type: 'foot-on-plane';
  id: Id;
  from: Id;
  plane: string;
}

/** `ℓ ישר החיתוך בין π1 ל-π2` — the planes' intersection line (drawn; echoed in parametric form). */
export interface PlanePlaneLineCommand {
  type: 'plane-plane-line';
  name: string;
  p1: string;
  p2: string;
}

/** V8-h (G8): `הישר d מאונך לישר ℓ ולישר ℓ'` — the common perpendicular of two lines. */
export interface LineCommonPerpCommand {
  type: 'line-common-perp';
  name: string;
  line1: string;
  line2: string;
}

/** V8-h (G8): `היטל הישר TB על המישור ABCD` — the projection of a line onto a plane. */
export interface LineProjectionCommand {
  type: 'line-projection';
  name: string;
  line: string;
  plane: string;
}

/** `מ-B מעבירים אנך לישר ℓ החותך אותו ב-C` — the ⟂ foot on a line. */
export interface FootOnLineCommand {
  type: 'foot-on-line';
  id: Id;
  from: Id;
  line: string;
}

// --- V3 (parameters in lines) commands ---

/** `הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)` — a typed parametric line. */
export interface Line3Command {
  type: 'line3';
  name: string;
  anchor: [LinExpr, LinExpr, LinExpr];
  dir: [LinExpr, LinExpr, LinExpr];
  src: string;
  /** The parameter letter used in the components, if any. */
  param?: string;
}

/** `הישר ℓ ניצב למישור π` — PINS the parameter (dir ∥ normal; the roots are branches). */
export interface LinePerpPlaneCommand {
  type: 'line-perp-plane';
  line: string;
  plane: string;
  branch?: number;
}

/** `ℓ חותך את π בנקודה A` — the line∩plane point. */
export interface LinePlanePointCommand {
  type: 'line-plane-point';
  id: Id;
  line: string;
  plane: string;
}

/** `B על הישר ℓ` — a membership statement on a line. APPLY decides by id (M1, the
 *  on-planes shape): an EXISTING point is a verified given (2024-Q2 ד's investigation);
 *  a NEW id is CREATED as a free rider on the line (ADR-3D-031). */
export interface OnLineCommand {
  type: 'on-line';
  id: Id;
  line: string;
}

export type Command3 =
  // |EN| = (√6/4)·|w| — a stated LENGTH relation (|a1b1| = c·|rhs|); rhs is a point
  // pair or a NAMED vector (resolved to its pair at apply). Drives a symbol / the
  // dims (similarity-invariant), or verifies as a claim when everything is pinned.
  | { type: 'length-rel'; a1: Id; b1: Id; rhs: { pair: [Id, Id] } | { vec: string }; c: number }
  // |w| = 2 — a numeric magnitude on a NAMED vector; apply resolves the pair and
  // delegates to the ordinary length given (claim when pinned, driving pin when free)
  | { type: 'vec-mag'; name: string; value: number }
  // הציבו k = ½ — assign the named parameter directly (replaces any prior pin on it)
  | { type: 'symbol-value'; symbol: string; value: number }
  | SolidCommand
  | PointOnSegment3Command
  | NameVectorCommand
  | Segment3Command
  | Centroid3Command
  | DiagIntersectionCommand
  | PointInSpanCommand
  | ClaimCommand
  | Point3Command
  | ParamSignCommand
  | Plane3Command
  | PlaneAngleCommand
  | OnPlanesCommand
  | FootOnPlaneCommand
  | PlanePlaneLineCommand
  | LineCommonPerpCommand
  | LineProjectionCommand
  | Circle3Command
  // V8-i: `A נמצאת על המעגל` — verify a point lies on a circle in R³ (checked in the store vs the resolved circle)
  | { type: 'point-on-circle3'; point: Id; circle: string }
  | FootOnLineCommand
  | Line3Command
  | LinePerpPlaneCommand
  | LinePlanePointCommand
  | OnLineCommand
  | InjectVectorCommand
  | SignGivenCommand
  | PlaneThroughCommand
  | LineThroughCommand
  | RevolutionCommand
  | VecRelCommand
  | SegPlaneRelCommand
  | { type: 'rect-complete'; ids: [Id, Id, Id, Id] } // `ABEC מלבן` — completes the single unknown corner (V7 T3)
  | { type: 'dot-given'; v1: string; v2: string; value: number } // u·v = 24 (V7 T2)
  | { type: 'inject-pair'; a: Id; b: Id; x: number; y: number; z: number } // BD = (-4,5,12) — a pair-vector injection (V7 T2)
  | { type: 'rel-plane'; name: string; rel: 'perp' | 'par'; through: Id[]; a: Id; b: Id } // V8-b (G1): plane ⟂/∥ edge a–b
  | { type: 'plane-cut'; id: Id; plane: string; a: Id; b: Id } // V8-b (G2): a point = plane ∩ segment a–b
  | { type: 'height-to-face'; id: Id; from: Id; face: Id[] } // V8-e (G5): `AF גובה … לפאה BDC` — F = foot of ⟂ from A onto plane BDC
  | { type: 'draw-arrow'; from: Id; to: Id } // #72: `חץ A'C` — an UNNAMED ink arrow (draws the segment too)
  | { type: 'perp-to-base'; from: Id } // #72: `אנך יורד מ-M לבסיס` — foot auto-minted at apply (parse3 is context-free)
  // V8-f (G6): cos of the angle between two operands = a value. `cos∠ACB = 3/4`
  // (vertex ⇒ pairs) · `קוסינוס הזווית בין הוקטורים w ו-u הוא √35/10` (named vectors).
  | { type: 'cos-angle'; u: VecAtom; v: VecAtom; cos: number }
  // V8-f (G9): a CHAIN of dot products all equal — `u·v = v·w = u·w`. Apply lowers to
  // pairwise dot-eq relations (drive on a free figure, else verify).
  | { type: 'dot-eq-chain'; ops: [VecAtom, VecAtom][] }
  // V8-f (G10): `base` makes EQUAL ANGLES with `a` and `b` — `AE יוצר זוויות שוות עם AB ו-AD`.
  | { type: 'angle-eq'; base: VecAtom; a: VecAtom; b: VecAtom }
  // V8-f (G11): `D על AC כך ש-OD חוצה-זווית AOC` — D on segment a–b, ray apex→D bisects ∠(a)(apex)(b).
  | { type: 'bisector-point'; id: Id; a: Id; b: Id; apex: Id }
  // triage 3-D: `הזווית בין הישר AC' לבין המישור ABCD היא 30` — the angle between a line and a plane
  | { type: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg: number }
  // V8-j (G12): `T על SC כך ש-TABCD פירמידה ישרה` — T on segment a–b so pyramid(base, apex=T) is right.
  | { type: 'right-pyramid-point'; id: Id; a: Id; b: Id; base: Id[] }
  // V8-g: `גובה המשולש לצלע AB הוא CD` — D = foot of the ⟂ from vertex `from` onto side a–b.
  | { type: 'altitude-foot'; id: Id; from: Id; a: Id; b: Id }
  // triage 3-D: `DE גובה בטטראדר` — altitude from vertex `from` to the OPPOSITE face of the
  // single tetrahedron (apply resolves the face = the tetra's other 3 vertices → a foot-face point).
  | { type: 'tetra-altitude'; id: Id; from: Id };

// ---------------------------------------------------------------------------
// Construction (what apply builds, what evaluate consumes)
// ---------------------------------------------------------------------------

/** A solid instance: its vertex ids in canonical order + its drawn edges + faces (vertex-id rings). */
export interface SolidObj {
  kind: SolidKind;
  ids: Id[];
  edges: [Id, Id][];
  faces: Id[][];
}

export type PointDef =
  | { kind: 'solid-vertex'; solid: number; index: number } // owned by construction.solids[solid]
  | { kind: 'on-segment'; a: Id; b: Id; t?: number }
  | { kind: 'centroid'; of: [Id, Id, Id] }
  | { kind: 'in-span'; a: Id; b: Id; vecFrom: Id; span: string[] }
  | { kind: 'coord'; x: number; y: number; z: number }
  // a free point riding a named plane (2 sampled DOF), or floating on a stated SIDE of
  // it (side ±1 = above/below the +z-oriented normal; 3 sampled DOF) — ADR-3D-015
  | { kind: 'on-plane'; plane: string; side?: 1 | -1 }
  // a free point riding a named line (1 sampled DOF) — the on-plane rider, line edition
  // (ADR-3D-031: `משוואת הישר AB היא (0,7,6)+t(0,2,1)` creates A,B as riders on the line)
  | { kind: 'on-line'; line: string }
  // ADR-3D-032: `M(k,1,3)` — typed coordinates carrying the figure's SINGLE symbolic
  // parameter (LinExpr components; absolute, never gauge). Unpinned k = a sampled free
  // DOF; a recorded given referencing the point (paramGivens) root-finds it post-pivot.
  | { kind: 'coord-sym'; x: LinExpr; y: LinExpr; z: LinExpr }
  | { kind: 'foot-plane'; from: Id; plane: string }
  | { kind: 'foot-line'; from: Id; line: string }
  | { kind: 'line-plane'; line: string; plane: string }
  | { kind: 'plane-cut'; plane: string; a: Id; b: Id } // V8-b (G2): a plane ∩ segment a–b
  | { kind: 'foot-face'; from: Id; face: Id[] } // V8-e (G5): foot of ⟂ from a vertex onto a face's plane
  // V8-f (G11): D on segment a–b, its t root-found so ray apex→D bisects ∠(a)(apex)(b)
  | { kind: 'bisector-seg'; a: Id; b: Id; apex: Id }
  // V8-g: the foot of the ⟂ from `from` onto the line through a,b (a triangle altitude's foot)
  | { kind: 'foot-seg'; from: Id; a: Id; b: Id }
  // V8-j (G12): the apex on segment a–b positioned so pyramid (base, apex) is RIGHT — i.e. the
  // point on a–b that sits directly above the base's centroid (closed-form t; no CAS)
  | { kind: 'right-pyramid-apex'; a: Id; b: Id; base: Id[] }
  | { kind: 'rev-point'; rev: number; role: 'center' | 'apex' }
  | { kind: 'vec-defined'; def: number } // solved from construction.vecDefs[def]
  | { kind: 'vec-pair'; def1: number; def2: number }; // the cevian intersection (two symbol relations)

export interface Construction3 {
  solids: SolidObj[];
  /** Insertion-ordered: a point's parents always precede it (enforced at apply). */
  points: Map<Id, PointDef>;
  /** Declared vector names → their ordered pair. */
  vectors: Map<string, { from: Id; to: Id }>;
  /** #72: UNNAMED ink arrows (`חץ A'C`) — rendered like a named vector, no label, never a basis member. */
  arrows: [Id, Id][];
  /** Auxiliary drawn segments (beyond the solids' own edges). */
  segments: [Id, Id][];
  /** V2 — planes by equation, name → def (insertion-ordered). */
  planes: Map<string, PlaneDef>;
  /** V2 — named lines (plane∩plane), name → def. */
  lines: Map<string, Line3Def>;
  /** V2 — the single symbolic parameter's letter, once one appears. */
  param?: string;
  /** V2 — the stated angle-between-planes givens (they pin the parameter). */
  planeAngles: PlaneAngleCommand[];
  /** V2 — membership givens (verify; `'any'` also selects the parameter branch). */
  memberships: OnPlanesCommand[];
  /** V3 — line ⟂ plane givens (they pin the parameter, like planeAngles). */
  linePerps: LinePerpPlaneCommand[];
  /** V3 — membership givens on lines (verified). */
  onLines: OnLineCommand[];
  /** V4 — coordinate injections on existing points (null components don't constrain). */
  pins: { id: Id; x: number | null; y: number | null; z: number | null }[];
  /** V4 — injected numeric values for declared vectors. */
  vectorPins: { name: string; x: number; y: number; z: number }[];
  /** V4 — sign branch givens (select among pivot solutions). */
  signGivens: SignGivenCommand[];
  /** V4 — planes through points, name → ids (resolved from positions after the pivot). */
  pointPlanes: Map<string, Id[]>;
  /** V5 — named lines through two points, resolved from final positions. */
  pointLines: Map<string, { a: Id; b: Id }>;
  /** V8-b — planes defined by a ⊥/∥ relation to an edge, resolved from final positions. */
  relPlanes: Map<string, RelPlaneDef>;
  /** V6 — solids of revolution. */
  revolutions: RevolutionObj[];
  /** V8-i — circles in R³ (centre + plane + radius), resolved from final positions/lines. */
  circles3: Circle3Obj[];
  /** V7 — vector definitions: `X⃗Y = Σ terms`, solving `unknown` (affine; `symbol` = the free coefficient). */
  vecDefs: { from: Id; to: Id; terms: SymTerm[]; unknown: Id; symbol?: string }[];
  /** V7 — conditions that PIN a vec-def's symbol (∥/⟂ to a plane through points). */
  symbolPins: (
    | { rel: 'parallel' | 'perp'; a: Id; b: Id; plane: Id[]; def: number }
    | { rel: 'length-rel'; a: Id; b: Id; pair2: [Id, Id]; c: number; def: number } // |ab| = c·|pair2| pins the symbol
    | { rel: 'value'; value: number; def: number } // k = ½ — direct assignment
  )[];
  /** Every claim RECORDED by apply (incl. ones composite commands create) — derive3
   *  attributes them to facts by count-delta and verifies them all; a claim can
   *  never escape verification by being created indirectly. */
  claims: Claim3[];
  /** V7 T2 — scalar givens driving the figure (residuals in the global solve). */
  scalarPins: ScalarPin[];
  /** V7 T2 — pair-vector injections (`BD = (-4,5,12)`), residuals like vectorPins. */
  pairPins: { a: Id; b: Id; x: number; y: number; z: number }[];
  /** ADR-3D-030 (M1) — a stated plane EQUATION on a solid-bearing figure is a GIVEN:
   *  each named point must satisfy cx·x + cy·y + cz·z + d = 0 (pivot residuals, like
   *  coordinate injections — it drives the free gauge/dims, verifies when determined). */
  planePins: { ids: Id[]; cx: number; cy: number; cz: number; d: number }[];
  /** ADR-3D-032 — recorded givens (angle/length claims) that reference a `coord-sym`
   *  point: they PIN the figure parameter by a post-pivot 1-DOF root-find (roots =
   *  branches; the D3 numeric-only boundary). */
  paramGivens: Claim3[];
  /** ADR-3D-032 — sign givens on the figure parameter (`k הוא פרמטר חיובי`): select
   *  among the root branches. */
  paramSigns: ParamSignCommand[];
}

export const emptyConstruction3 = (): Construction3 => ({
  solids: [],
  points: new Map(),
  vectors: new Map(),
  arrows: [],
  segments: [],
  planes: new Map(),
  lines: new Map(),
  planeAngles: [],
  memberships: [],
  linePerps: [],
  onLines: [],
  pins: [],
  vectorPins: [],
  signGivens: [],
  pointPlanes: new Map(),
  pointLines: new Map(),
  relPlanes: new Map(),
  revolutions: [],
  circles3: [],
  vecDefs: [],
  symbolPins: [],
  claims: [],
  scalarPins: [],
  pairPins: [],
  planePins: [],
  paramGivens: [],
  paramSigns: [],
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Structured engine errors — humanised by the app layer through i18n. */
export type EngineError3 =
  | { code: 'already-defined'; id: Id }
  | { code: 'unknown-point'; id: Id }
  | { code: 'unknown-vector'; id: string }
  | { code: 'unknown-plane'; id: string }
  | { code: 'unknown-line'; id: string }
  | { code: 'bad-solid'; kind: SolidKind }
  | { code: 'bad-name'; id: string }
  | { code: 'need-basis' } // in-span needs exactly 3 declared vectors (a basis)
  | { code: 'no-solution'; id: Id } // the driven t has no value satisfying the condition
  | { code: 'not-on-segment'; id: Id } // the driven t lands outside the stated segment
  | { code: 'two-params' } // only ONE symbolic parameter per figure (V2 boundary)
  | { code: 'no-roots' } // no parameter value satisfies the stated angle — over-constrained, honestly
  | { code: 'not-on-plane'; id: Id } // a stated membership does not hold in any branch
  | { code: 'not-coplanar'; id: string } // a plane's named points do not determine a single plane
  | { code: 'plane-side-undefined'; id: string } // above/below a (near-)vertical plane is meaningless
  | { code: 'wrong-side-of-plane'; id: Id } // a stated above/below does not hold for the point
  | { code: 'not-on-line'; id: Id } // a stated on-line membership does not hold
  | { code: 'line-misses-plane'; id: Id } // ℓ ∥ π at the chosen parameter — no crossing point
  | { code: 'symbolic-new-point'; id: Id } // a NEW point with symbolic components is under-determined
  | { code: 'injection-unsatisfiable' } // no placement of the figure matches the injected coordinates
  | { code: 'sign-unsatisfiable'; id: Id } // no pivot solution has the stated coordinate sign
  | { code: 'no-such-solid'; id: string } // a volume/area claim names a solid kind the figure doesn't have (or has twice)
  | { code: 'free-size-claim'; id: string } // a numeric volume/area claim on a solid whose dims are unstated
  | { code: 'two-unknowns'; id: Id } // a vector relation with more than one undefined point
  | { code: 'size-on-solid' } // a numeric size on a free-dim solid figure — not supported yet (honest boundary)
  | { code: 'unknown-symbol'; id: string } // a value was assigned to a parameter no relation defines
  | { code: 'claim-refuted' }; // the stated answer does not hold in the figure

export type ApplyResult3 = { ok: true; next: Construction3 } | { ok: false; error: EngineError3 };

export type Positions3 = Map<Id, Vec3>;
