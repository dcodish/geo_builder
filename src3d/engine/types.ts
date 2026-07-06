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

export type Claim3 =
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
  | { type: 'lateral-area-eq'; solid: string; value: number }; // שטח המעטפת של החרוט = 65π

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
    };

// ---------------------------------------------------------------------------
// Commands (what the parser emits)
// ---------------------------------------------------------------------------

/** The solid family. `cube`/`box`: 8 ids (base then primed tops); `prism3`: 6 ids (right triangular
 *  prism); `pyramid4`/`pyramid3`: base ring then the APEX LAST — a RIGHT pyramid (apex above the
 *  base's circumcentre, so the lateral edges are equal; stated `ישרה` required, ADR-052). */
export type SolidKind = 'cube' | 'box' | 'prism3' | 'pyramid4' | 'pyramid3';

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

/** `הישר A'C` as an object (V5): a named line through two existing points. */
export interface LineThroughCommand {
  type: 'line-through';
  name: string;
  a: Id;
  b: Id;
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

/** `A נמצאת על אחד המישורים` — membership given; with `'any'` it also SELECTS the branch (2022-Q2). */
export interface OnPlanesCommand {
  type: 'on-planes';
  id: Id;
  plane: string | 'any';
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

/** `B על הישר ℓ` — a membership GIVEN on a line (verified; 2024-Q2 ד's investigation). */
export interface OnLineCommand {
  type: 'on-line';
  id: Id;
  line: string;
}

export type Command3 =
  | SolidCommand
  | PointOnSegment3Command
  | NameVectorCommand
  | Segment3Command
  | Centroid3Command
  | PointInSpanCommand
  | ClaimCommand
  | Point3Command
  | Plane3Command
  | PlaneAngleCommand
  | OnPlanesCommand
  | FootOnPlaneCommand
  | PlanePlaneLineCommand
  | FootOnLineCommand
  | Line3Command
  | LinePerpPlaneCommand
  | LinePlanePointCommand
  | OnLineCommand
  | InjectVectorCommand
  | SignGivenCommand
  | PlaneThroughCommand
  | LineThroughCommand
  | RevolutionCommand;

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
  | { kind: 'foot-plane'; from: Id; plane: string }
  | { kind: 'foot-line'; from: Id; line: string }
  | { kind: 'line-plane'; line: string; plane: string }
  | { kind: 'rev-point'; rev: number; role: 'center' | 'apex' };

export interface Construction3 {
  solids: SolidObj[];
  /** Insertion-ordered: a point's parents always precede it (enforced at apply). */
  points: Map<Id, PointDef>;
  /** Declared vector names → their ordered pair. */
  vectors: Map<string, { from: Id; to: Id }>;
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
  /** V6 — solids of revolution. */
  revolutions: RevolutionObj[];
}

export const emptyConstruction3 = (): Construction3 => ({
  solids: [],
  points: new Map(),
  vectors: new Map(),
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
  revolutions: [],
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
  | { code: 'not-on-line'; id: Id } // a stated on-line membership does not hold
  | { code: 'line-misses-plane'; id: Id } // ℓ ∥ π at the chosen parameter — no crossing point
  | { code: 'symbolic-new-point'; id: Id } // a NEW point with symbolic components is under-determined
  | { code: 'injection-unsatisfiable' } // no placement of the figure matches the injected coordinates
  | { code: 'sign-unsatisfiable'; id: Id } // no pivot solution has the stated coordinate sign
  | { code: 'no-such-solid'; id: string } // a volume/area claim names a solid kind the figure doesn't have (or has twice)
  | { code: 'free-size-claim'; id: string } // a numeric volume/area claim on a solid whose dims are unstated
  | { code: 'size-on-solid' } // a numeric size on a free-dim solid figure — not supported yet (honest boundary)
  | { code: 'claim-refuted' }; // the stated answer does not hold in the figure

export type ApplyResult3 = { ok: true; next: Construction3 } | { ok: false; error: EngineError3 };

export type Positions3 = Map<Id, Vec3>;
