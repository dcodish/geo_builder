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
// #587: the quad-base vocabulary is defined ONCE, in the base registry — the flat `quad-shape` command
// names the same seven families the solid lane's bases do. Type-only, so the cycle is erased at compile.
import type { QuadBase } from './baseShapes';

export type Id = string;

// ---------------------------------------------------------------------------
// Vector expressions & claims (V1 — the bounded symbolic layer)
// ---------------------------------------------------------------------------

/**
 * S1 of the relations program (docs/26 v2 §3.1, #378): the CLOSED operand set every line/plane relation
 * draws from. A relation names its operands as atoms; the parser classifies text into them
 * (`parser/operandToken.ts`) and the engine gives them geometry (`engine/operands.ts`) — so a new
 * operand kind is wired once, never per rule (the ADR-3D-100 class, closed at the mechanism).
 */
export type Operand3 =
  | { kind: 'point'; id: Id }
  | { kind: 'segment'; a: Id; b: Id }
  | { kind: 'vector'; name: string }
  | { kind: 'line'; name: string }
  | { kind: 'plane-run'; ids: Id[] }
  | { kind: 'plane-named'; name: string }
  // #512: the ABSOLUTE-frame operands. A coordinate plane was legal in exactly ONE grammatical
  // position — the #324 rule's private tail, whose subject must be a point-ring — so «A על מישור [xy]»,
  // «BD' ⊥ מישור [xy]» and the plane-angle operand all refused, ~8 unrelated-looking failures that are
  // one missing member of this set. Unlike every other kind these resolve to a FIXED geometry, so they
  // cannot fail to resolve; `axes` is stored normalised, so «[yx]» and «[xy]» are the same operand.
  | { kind: 'plane-coord'; axes: 'xy' | 'yz' | 'xz' }
  | { kind: 'axis'; axis: 'x' | 'y' | 'z' };

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
  /**
   * #833 (ADR-3D-193): AB ∥ plane A'B'C'D'. The `perp` twin above has existed since #380; this one
   * did not, so on a DETERMINED figure a TRUE ∥ statement fell off the end of `seg-plane-rel` into a
   * bare `no-solution` — the relation table advertised `claim` for `parallel|segment|plane-run` and
   * nothing implemented it.
   */
  | { type: 'par-plane'; seg: [Id, Id]; plane: [Id, Id, Id] }
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
  // #766/#765 (ADR-3D-169): the SUBJECT is resolved against the declared figure, not assumed from the
  // letter count. `noun` is the definite noun the student wrote ('any' when they wrote none); `ids` is
  // their letter run and may be EMPTY («נפח הפירמידה = 11» on a figure with exactly one pyramid).
  | { type: 'volume-poly'; noun: SolidNoun; ids: Id[]; value: number } // נפח הפירמידה ABCD = 64 (V7 T2)
  // V8-f (G6/G9/G10) — vector-relation givens VERIFIED on a determined figure. Each
  // operand is a VecAtom (a declared vector or a point pair), so `cos∠ACB` (vertex →
  // pairs) and `cos(u,v)` (named vectors) share one form.
  | { type: 'cos-angle-eq'; u: VecAtom; v: VecAtom; cos: number } // cos∠ACB = 3/4 · cos(w,u) = √35/10
  // #305 (ADR-3D-090): the four ids lie on ONE circle — Ptolemy on the ring order A,B,C,D
  | { type: 'concyclic'; ids: Id[] }
  | { type: 'dot-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // u·v = v·w (a chained-equality link)
  | { type: 'cos-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom } // ∠(a,b) = ∠(c,d) — AE makes equal angles with AB, AD
  // triage 3-D: the angle between a LINE (a–b) and a PLANE (point-run) — `sin β = |n·u|/(|n||u|)`
  | { type: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg: number }
  // #324 (ADR-3D-079): the ring's relation to a coordinate plane/axis (see coordPlanePins)
  | { type: 'coord-plane-rel'; ids: Id[]; axis: 'x' | 'y' | 'z'; mode: 'share' | 'zero' | 'perp' | 'contains' }
  // #375: a POINT-RUN plane stated ⟂ a named LINE (see planeLinePerps)
  | { type: 'plane-line-perp'; ids: Id[]; line: string }
  // S2 (#378): ∥/⟂/angle where one side is a NAMED LINE — the claim twin of lineRels
  | { type: 'line-rel'; rel: 'perp' | 'parallel' | 'angle' | 'contained'; deg?: number; label?: string; op: Operand3; line: string }
  // S4 (#378): the MUTUAL POSITION of two located objects, over the general operand pair — the
  // claim twin of `mutualRels`. (`lines-rel` above is the frozen V7-T3 segment-pair spelling; both
  // verdicts come from the one `mutualPosition` classifier, so they cannot disagree.)
  | { type: 'mutual-rel'; rel: MutualRel3; a: Operand3; b: Operand3 }
  // S3 (#378): a DIRECTION relation (⟂ / ∥ / a stated angle / coincident) where at least one side is
  // a PLANE — the claim twin of `planeRels`. Directional-only pairs keep their frozen owners.
  | { type: 'plane-rel'; rel: PlaneRel3; deg?: number; label?: string; a: Operand3; b: Operand3 }
  // S5 (#378): a stated DISTANCE between two operands — «המרחק בין A למישור ABC הוא 6».
  | { type: 'distance-rel'; a: Operand3; b: Operand3; value: number }
  // #393/#335 (ADR-3D-107): magnitude of a vector EXPRESSION — |e1| = c·|e2| (a ratio,
  // similarity-invariant) and |e| = value (an absolute size). Simple-atom instances are
  // normalized onto vec-mag/length-eq/length-rel at apply; only genuine expressions land here.
  | { type: 'mag-rel'; e1: VecExpr; e2: VecExpr; c: number }
  | { type: 'mag-val'; e: VecExpr; value: number };

/** S3 (#378) — the relations a PLANE takes part in. `coincident` is the plane twin of S4's. */
export type PlaneRel3 = 'perp' | 'parallel' | 'angle' | 'coincident' | 'contained';

/**
 * S4 (#378) — the four mutually exclusive positions two located directions can occupy in R³.
 * Mirrors `MutualRel` in engine/operands (which owns the geometry); declared here so commands,
 * claims and requirements can name it without importing the resolver.
 */
export type MutualRel3 = 'coincident' | 'parallel' | 'intersecting' | 'skew';

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
  | { kind: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg: number }
  // #305 (ADR-3D-090): the base of a RIGHT pyramid over a general quad must be CYCLIC.
  // A convex quad is cyclic iff opposite angles are supplementary (cos A + cos C = 0) — a
  // scale-free, SIGN-CHANGING residual, so it needs no new solver machinery.
  | { kind: 'concyclic'; ids: Id[] }
  // S4 (#378): a CLOSED mutual position between two GAUGE operands — ∥ / meeting / coincident.
  // The residual is `mutualDeviation`, normalized to be scale-free, so it is similarity-invariant
  // and joins the gauge-frozen dims-only solve like every other ScalarPin. `skew` is deliberately
  // not representable here: it is an inequality, and belongs to the requirement lane.
  | { kind: 'mutual'; rel: 'coincident' | 'parallel' | 'intersecting'; a: Operand3; b: Operand3 }
  // S3 (#378): a plane-bearing direction relation between two GAUGE operands. Every residual is
  // an angle between characteristic vectors (or a size-normalized offset), so it is scale-free.
  | { kind: 'plane-rel'; rel: PlaneRel3; deg?: number; a: Operand3; b: Operand3 }
  // S5 (#378): |a b| = value. The ONE ScalarPin kind besides `length`/`dot` that is NOT
  // similarity-invariant — a distance is an absolute size, so it fixes the scale.
  | { kind: 'distance'; a: Operand3; b: Operand3; value: number }
  // #393/#335 (ADR-3D-107): |e1| = c·|e2| over vector EXPRESSIONS — a ratio of magnitudes,
  // similarity-invariant (both sides scale together), the expression twin of `length-rel`.
  | { kind: 'mag-rel'; e1: VecExpr; e2: VecExpr; c: number }
  // #393/#335: |e| = value — an absolute size on an expression magnitude; fixes the scale
  // exactly like `length`/`distance`.
  | { kind: 'mag-val'; e: VecExpr; value: number };

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
  /**
   * #487 (ADR-3D-124) — a FREE plane: declared by name only, no equation stated. The coefficients above
   * are placeholders (never knowledge); `resolve3` overwrites the resolved entry per seed via
   * `resolveFreePlane`, pinned by whatever memberships/relations exist and SAMPLED beyond them. Living
   * inside `planes` (rather than a fourth map) is deliberate: every existence check, operand resolver
   * and renderer sees the plane without enumeration edits — consumers that need the plane's numbers as
   * KNOWLEDGE (the equation claim, the parameter machinery, printing) must gate on this flag instead.
   */
  free?: true;
  /** #801 (ADR-3D-174) — the pin-symbol lane marker, exactly as on a parametric line: present ⇒ the
   *  `p` coefficients are in this PIN symbol (pivot-solved), absent ⇒ in `c.param` (root-found). */
  sym?: string;
}

export type Line3Def =
  // #333: `requested` is the name the STUDENT wrote when it differed from the one the line got
  // (a bare `ℓ` already taken by another intersection line). Stored so the auto-naming notice is
  // DERIVED from the construction like every other notice, never a one-shot event the reload loses.
  | { kind: 'plane-plane'; p1: string; p2: string; requested?: string }
  | {
      /** A TYPED parametric line (V3, 2024-Q2): x = anchor + t·dir — components may carry the parameter. */
      kind: 'parametric';
      anchor: [LinExpr, LinExpr, LinExpr];
      dir: [LinExpr, LinExpr, LinExpr];
      src: string;
      /** #422 — the student's own running-parameter letter, when not `t`. Display only. */
      runner?: string;
      /**
       * #801 (ADR-3D-174) — WHICH LANE owns the letter the `p` coefficients are in. Absent: the
       * algebraic lane's single figure parameter (`c.param`, root-found by `chooseParam`). Present:
       * a PIN SYMBOL, solved jointly inside the pivot (`pinSymsOf`) — so the line's numbers are the
       * pivot's to supply, and reading them at the other lane's value would draw the student's own
       * equation at a value the same figure denies.
       */
      sym?: string;
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
  | { kind: 'line-projection'; line: string; plane: string }
  // #552 — a FREE line: declared by name only («ישר k», bare «l1»), nothing yet known about it.
  // The #487 free-plane idea, line edition: direction (2 DOF) and anchor (2 DOF) are genuine ADR-052
  // free DOFs, sampled per seed and pinned as memberships/relations accumulate (`resolveFreeLine`).
  // Living inside `lines` is deliberate for the same reason the free plane lives in `planes`: every
  // existence check, operand resolver and renderer sees it without enumeration edits — consumers that
  // need the line's numbers as KNOWLEDGE (the parametric echo, the parameter machinery) gate on the kind.
  | { kind: 'free' };

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
/**
 * The definite noun a student writes in front of a solid's letter run («נפח **הפירמידה** ABCD»).
 * `'any'` means no noun was stated. Resolution against the declared figure lives in `solidSubject.ts`
 * (#766/#765, ADR-3D-169); the vocabulary lives here because the CLAIM carries it.
 */
export type SolidNoun = 'pyramid' | 'tetra' | 'cube' | 'box' | 'prism' | 'any';

export type SolidKind =
  | 'cube' | 'box' | 'prism3' | 'pyramid4' | 'pyramid3' | 'tetra' | 'prism4r' | 'pyramid4g' | 'pyramid4r' | 'pyramid4gr'
  // V8-d: equilateral-triangle-base right prism/pyramid, and a free-apex parallelogram-base pyramid
  | 'prism3e' | 'pyramid3e' | 'pyramidPar'
  // #305/#341/#358 (ADR-3D-090): the rest of the BASE × TOP cross-product for quad-base pyramids.
  // These names are LABELS for (base, right?) pairs in `baseShapes.QUAD_PYRAMIDS` — the geometry
  // is defined once in that registry, never per kind. `…R` = a RIGHT apex (over the base's
  // circumcentre); the base's `CYCLIC_FIX` constraint is what makes that circumcentre exist.
  | 'pyramidParR' | 'pyramidRhomb' | 'pyramidRhombR' | 'pyramidKite' | 'pyramidKiteR'
  | 'pyramidTrap' | 'pyramidTrapR' | 'pyramidQuad' | 'pyramidQuadR'
  // V8-g: a FLAT polygon of free points in the z=0 plane (the 2-D vector lane) — triangle /
  // quadrilateral / pentagon. Modelled as a "solid" so it reuses the dims-sampler + the
  // pivot (free case → sampled shape; metric givens → the pivot drives it); double-sided
  // (two opposite faces) so a flat figure never renders fully hidden.
  | 'polygon3' | 'polygon4' | 'polygon5'
  // #117: prisms over more bases — parallelogram / general quad / square / regular pentagon+hexagon.
  // Each is RIGHT on its own and OBLIQUE with `oblique` (#349) — the tilt is the modifier, not the kind.
  // `parallelepiped` (מקבילון) is the legacy spelling of `prism4` + `oblique`, normalized at apply.
  | 'prism4' | 'prism4g' | 'prism4sq' | 'prismReg5' | 'prismReg6' | 'parallelepiped';
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
  /**
   * #349 (ADR-3D-089): OBLIQUE — the top ring is the base translated by a FREE lateral vector w
   * instead of straight up by a height. Obliqueness is a MODIFIER of any prism kind, not a base-specific
   * template: the base ring is computed identically either way, so `prism3` + `oblique` is a general
   * oblique triangular prism, `prism4` + `oblique` is the מקבילון, and so on. A prism the student did
   * not state "right" is oblique (ADR-052 — rightness is a given, never assumed); `make-right-prism`
   * clears the flag. The legacy `parallelepiped` kind is normalized to `prism4` + `oblique` at apply,
   * so exactly ONE oblique code path exists in the engine.
   */
  oblique?: true;
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

/**
 * #251 (ADR-3D-049): `זוית O ישרה` / `זווית O = 90` — a stated angle named by its VERTEX alone.
 * The two arms are resolved at APPLY from the figure's edges at the vertex (parse3 is
 * context-free); exactly two distinct neighbors ⇒ the ordinary angle-seg-eq lowering,
 * otherwise the honest `ambiguous-angle` refusal (the 2-D ADR-164 pattern, apply-time edition).
 */
export interface VertexAngleCommand {
  type: 'vertex-angle';
  vertex: Id;
  deg: number;
}

/**
 * #225 (ADR-3D-048): `אמצע BB'` with NO student-given name — the midpoint of segment a–b,
 * auto-labeled at APPLY (parse3 is context-free, so the free-letter pick must happen where the
 * taken ids are known). Lowers to `point-on-segment3` t=½ under the picked label.
 */
export interface MidpointAutoCommand {
  type: 'midpoint-auto';
  a: Id;
  b: Id;
}

/** `נסמן: AB = u` — bind a lowercase name to the ordered pair from→to. */
export interface NameVectorCommand {
  type: 'name-vector';
  name: string;
  from: Id;
  to: Id;
}

/** An auxiliary drawn segment (idempotent; a solid edge is never duplicated). */
export interface Segment3Command {
  type: 'segment3';
  a: Id;
  b: Id;
  /**
   * #840 — the DRAWING register: the student's whole sentence is this segment («קטע BE»), so an
   * unstated endpoint is theirs to introduce and is minted free.
   *
   * A `segment3` emitted as another command's CARRIER never sets it — «נסמן: AB = u, AC = v» draws
   * the vector's segment before naming it, and naming needs points that already exist (`v7-t1`).
   */
  bare?: true;
}

/** A named-angle MARKER (#94): `∠SDB` / `∠SDB = α` — a pedagogical highlight, NOT a driver. Draws the arc
 *  at `vertex` between rays vertex→p and vertex→q (and the two arms); consumes no DOF, verifies nothing.
 *  `label` (a Greek/letter name from `∠SDB = α`) is drawn on the arc; the numeric measure is a seed-invariant
 *  panel derivation (never a single-seed number on the arc — ADR-3D-030). */
export interface AngleMark3Command {
  type: 'angle-mark';
  vertex: Id;
  p: Id;
  q: Id;
  label?: string;
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
/** #325 (ADR-3D-079): an AFFINE symbolic component of a typed coordinate — `2t` / `t` / `k` /
 *  `2t-3` is k·sym + c. The symbol is an OPEN unknown until data determines it. */
export interface SymComp {
  sym: string;
  k: number;
  c: number;
}

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
  /** #325 (ADR-3D-079): the full affine expression behind each symbolic component
   *  (`B(2t,t,k)` → [{sym:'t',k:2,c:0},{sym:'t',k:1,c:0},{sym:'k',k:1,c:0}]). On an EXISTING
   *  id these become symbolic pivot pins (each distinct symbol an extra pivot unknown, left
   *  OPEN until data determines it); a NEW id supports one distinct symbol (coord-sym). */
  symExprs?: [SymComp | null, SymComp | null, SymComp | null];
}

/** ADR-3D-032: `k הוא פרמטר חיובי` — a sign given on the figure's symbolic parameter
 *  (selects among the root branches, the point sign-given's sibling). */
export interface ParamSignCommand {
  type: 'param-sign';
  sym: string;
  positive: boolean;
}

/** `נתון: v = (10,-5,0)` — inject a value for a DECLARED vector (the V4 pivot).
 *  #794 (ADR-3D-168): components take the SAME grammar as point3 — a number, a null
 *  (a bare placeholder letter: that component does not constrain), or an affine
 *  symbolic expression via `symExprs` (`v = (k-1, k, 3)` — the symbol joins the pivot
 *  as an open unknown, exactly like a `B(2t,t,k)` pin). */
export interface InjectVectorCommand {
  type: 'inject-vector';
  name: string;
  x: number | null;
  y: number | null;
  z: number | null;
  symExprs?: [SymComp | null, SymComp | null, SymComp | null];
  /** #814 (ADR-3D-175): the letters, NAME-ONLY — the channel `point3` always had (`syms`). A bare
   *  letter still lowers to a null (free) component; this only records what the student CALLED it,
   *  so `param-sign` can address it. Emitting `symExprs` instead would change how it solves. */
  syms?: [string | null, string | null, string | null];
}

/** `שיעור ה-z של C' חיובי` — a SIGN branch given (selects among pivot solutions). */
export interface SignGivenCommand {
  type: 'sign-given';
  id: Id;
  axis: 'x' | 'y' | 'z';
  positive: boolean;
}

/**
 * #814 (ADR-3D-175) — a letter bound to one free component of one injected object. The three
 * injection lanes share one target vocabulary so the sign check is written once (`componentValue`),
 * never enumerated per lane.
 */
export type ComponentTarget =
  | { kind: 'point'; id: Id }
  | { kind: 'vector'; name: string }
  | { kind: 'pair'; a: Id; b: Id };

export interface PartialName {
  sym: string;
  target: ComponentTarget;
  axis: 'x' | 'y' | 'z';
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
  | { kind: 'center-plane-radius'; center: Id; plane: string; radius: number }
  // #442: the circle of a POLYGON — `circum` passes through the ring's vertices (the polygon is
  // inscribed IN it), `incircle` is tangent to the ring's sides (it is inscribed in the POLYGON).
  // Both live in the ring's OWN plane, so the same definition serves a flat V8-g polygon and a solid's
  // face. Neither carries a `center` point id: the centre is DERIVED, and inventing a label for it
  // would assert a name the student never gave (the V6 unnamed-centre rule).
  | { kind: 'circum'; ring: Id[] }
  | { kind: 'incircle'; ring: Id[] };

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

/**
 * #487 (ADR-3D-124) — «מישור π2»: a FREE-standing named plane, declared before anything about it is
 * known. Its orientation (unit normal, 2 DOF) and offset (1 DOF) are genuine ADR-052 free DOFs: sampled
 * per seed, resampled on "show another configuration", pinned as memberships and stated relations
 * accumulate. The declaration requires the NOUN (operator ruling: a bare «π2» line stays not-understood);
 * a membership on an undeclared named plane AUTO-creates one through this same command (ruling 1 —
 * the M1 duality, creation edition).
 */
export interface FreePlaneCommand {
  type: 'free-plane';
  name: string;
}

/**
 * #552 — «ישר k» / «line l1» / bare «l»: a FREE line declared before anything about it is known
 * (the #487 shape, line edition). Convention names (`l`, `l1` → canonical `ℓ`, `ℓ1`) may stand bare —
 * the ℓ-prefix is what marks them as lines, exactly as the π-prefix marks planes (#487 Am. 1); any
 * other single-letter name REQUIRES the noun («ישר k»), which is what states the kind — the parser
 * stays context-free. A relation naming an undeclared CONVENTION line auto-creates it through this
 * same duality (the on-planes ruling-1 shape); a non-convention name must be declared first.
 */
export interface FreeLineCommand {
  type: 'free-line';
  name: string;
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
  /** #333 (ADR-3D-153): OPTIONAL — students name the RELATION, not the result («ישר החיתוך בין …»).
   *  Absent, or taken by a differently-defined line, and apply auto-indexes to the next free `ℓN`
   *  (operator ruling 2026-07-25) — resolved there because `parse3` cannot know which names are taken. */
  name?: string;
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
  /** #422 — the RUNNING parameter the student wrote (`m` in «x=(4,5,-1)+m(k,1,0)»), when it is not the
   *  conventional `t`. A BOUND variable: it names nothing in the figure, so nothing reads it as
   *  geometry — it exists so the echo can show the student their own textbook form. Optional and
   *  absent when it IS `t`, so every existing `.geo3.json` loads and re-saves byte-identically. */
  runner?: string;
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
  // `soft` (#424): a named-shape macro's DEFAULT equal pair — an isosceles triangle's apex, which the
  // student did not choose. Dropped in derive3 when an EXPLICIT equal pair on the same triangle is
  // stated, so the stated pair wins instead of stacking into an equilateral (M4 / ADR-114).
  | { type: 'length-rel'; a1: Id; b1: Id; rhs: { pair: [Id, Id] } | { vec: string }; c: number; soft?: boolean }
  // |w| = 2 — a numeric magnitude on a NAMED vector; apply resolves the pair and
  // delegates to the ordinary length given (claim when pinned, driving pin when free)
  | { type: 'vec-mag'; name: string; value: number }
  // #393/#335 (ADR-3D-107): magnitude equality over vector EXPRESSIONS — |e1| = c·|e2| and
  // |e| = value (a chain link lowers to these per adjacent pair / per stated value). Apply
  // NORMALIZES simple unit-coefficient atoms onto the existing owners (vec-mag / length-eq /
  // length-rel — the parallelepiped-normalization precedent), so only genuine expressions
  // reach the mag-* pin/claim lanes; M1 routes drive-vs-verify like every scalar given.
  | { type: 'mag-rel'; e1: VecExpr; e2: VecExpr; c: number }
  | { type: 'mag-val'; e: VecExpr; value: number }
  // הציבו k = ½ — assign the named parameter directly (replaces any prior pin on it)
  | { type: 'symbol-value'; symbol: string; value: number }
  | SolidCommand
  | AngleMark3Command
  | PointOnSegment3Command
  | MidpointAutoCommand
  | VertexAngleCommand
  | NameVectorCommand
  | Segment3Command
  | Centroid3Command
  | DiagIntersectionCommand
  | PointInSpanCommand
  | ClaimCommand
  | Point3Command
  // #324 (ADR-3D-079): a named ring's relation to a COORDINATE plane/axis — lowered to a
  // coordPlanePins entry (drives the free gauge/dims) + a recorded claim (the final arbiter)
  | { type: 'coord-plane-rel'; ids: Id[]; axis: 'x' | 'y' | 'z'; mode: 'share' | 'zero' | 'perp' | 'contains' }
  // #375: a POINT-RUN plane ⟂ a named LINE — lowered to a planeLinePerps entry (drives the free
  // gauge rotation) + a recorded claim (the final arbiter, per the ADR-3D-079 shape)
  | { type: 'plane-line-perp'; ids: Id[]; line: string; statedAsPlane?: true }
  // S2 (#378, ADR-3D-103): ∥/⟂/angle where one side is a NAMED LINE and `op` is the other side.
  // Lowered to a lineRels entry + a recorded claim; the FRAME CLASSIFIER routes each instance at
  // evaluate by its operands (docs/26 §2.3) — a gauge op (segment/vector/plane-run) makes it a pivot
  // residual that rotates the figure; an absolute op (line/plane-named) makes it a parameter
  // root-find when a symbolic direction is present, else a pure claim. `statedAsPlane` records the
  // ADR-3D-100 noun slip (the student called the line a plane) for the build-notice correction.
  | { type: 'line-rel'; rel: 'perp' | 'parallel' | 'angle' | 'contained'; deg?: number; label?: string; op: Operand3; line: string; statedAsPlane?: true }
  // S4 (#378): the MUTUAL POSITION of two located objects — «AB ו-CD מצטלבים» (skew), «נחתכים»
  // (intersecting), «מקבילים» (parallel), «מתלכדים» (coincident) over the general operand pair.
  // Lowered to a recorded claim ALWAYS (the final arbiter) plus, per the frame classifier:
  //   · a REQUIREMENT for the open half — `skew` entirely, and the non-parallel / within-extent
  //     half of the closed relations. An inequality has no residual; it is sample-and-gated.
  //   · a similarity-invariant DRIVE (`mutual` ScalarPin) for the closed half when both operands
  //     ride the gauge, so a free-dim figure is flexed into the stated position (M1 duality).
  | { type: 'mutual-rel'; rel: MutualRel3; a: Operand3; b: Operand3 }
  // S3 (#378): ⟂ / ∥ / angle / coincident with a PLANE on at least one side — «המישור ABC מקביל
  // למישור A'B'C'», «π1 ניצב ל-π2», «AB מקביל למישור π». Lowered to a recorded claim ALWAYS plus,
  // per the frame classifier: a similarity-invariant DRIVE when both sides ride the gauge, a pivot
  // residual when one is absolute, and the parameter root-find when both are (docs/26 §2.3).
  | { type: 'plane-rel'; rel: PlaneRel3; deg?: number; label?: string; a: Operand3; b: Operand3 }
  // S5 (#378): a stated DISTANCE. Unlike every other relation in the program it carries UNITS, so
  // it PINS THE SCALE — a free-dim figure is driven to it, a determined one verifies (M1).
  | { type: 'distance-rel'; a: Operand3; b: Operand3; value: number }
  | ParamSignCommand
  | Plane3Command
  | FreePlaneCommand
  | FreeLineCommand
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
  | { type: 'rect-complete'; ids: [Id, Id, Id, Id] } // `ABEC מלבן` — the rectangle instance of `quad-shape` (V7 T3)
  // #587 (ADR-3D-152): a stated FLAT quad SHAPE on a ring — `ABCD ריבוע`, `המרובע ABCD הוא ריבוע`.
  // Applied in three arms dispatched on how many of `ids` already exist, because the parse is
  // context-free and only apply knows: all-new ⇒ declare + lower `quadShapeConstraints`; exactly one
  // unknown ⇒ complete that corner from the family's definition, then lower; all known ⇒ a STATEMENT
  // about existing points, lowered the same way and M1-routed to verification.
  | { type: 'quad-shape'; base: QuadBase; ids: [Id, Id, Id, Id] }
  | { type: 'dot-given'; v1: string; v2: string; value: number } // u·v = 24 (V7 T2)
  // BD = (-4,5,12) — a pair-vector injection (V7 T2). #794 (ADR-3D-168): components take the same
  // grammar as point3 — number | null (placeholder letter) | affine symbolic via symExprs
  // (`AA' = (k-1, k-7, k+1)` — the symbol joins the pivot as an open unknown).
  | { type: 'inject-pair'; a: Id; b: Id; x: number | null; y: number | null; z: number | null; symExprs?: [SymComp | null, SymComp | null, SymComp | null]; syms?: [string | null, string | null, string | null] } // #814: `syms` is name-only (see InjectVectorCommand)
  | { type: 'rel-plane'; name: string; rel: 'perp' | 'par'; through: Id[]; a: Id; b: Id } // V8-b (G1): plane ⟂/∥ edge a–b
  | { type: 'plane-cut'; id: Id; plane: string; a: Id; b: Id } // V8-b (G2): a point = plane ∩ segment a–b
  | { type: 'height-to-face'; id: Id; from: Id; face: Id[] } // V8-e (G5): `AF גובה … לפאה BDC` — F = foot of ⟂ from A onto plane BDC
  | { type: 'draw-arrow'; from: Id; to: Id } // #72: `חץ A'C` — an UNNAMED ink arrow (draws the segment too)
  // #72 / #448: `אנך יורד מ-M לבסיס`, `גובה הפירמידה מנקודה D`, `גובה מנקודה D לבסיס ABC` — the ⟂ from a
  // point onto a base plane; the foot is auto-minted at apply (parse3 is context-free). `face` is the
  // STATED base when the student named one — without it apply resolves the figure's single solid, and
  // honouring a named base is what keeps «לבסיס ABC» from silently using a different face (ADR-3D-115).
  // #503 (ADR-3D-142): `from` is optional — the APEX-LESS «גובה הפירמידה» derives the apex at apply
  // from the single solid's vertex layout (base ids first, apex LAST — the baseRingOf convention);
  // a solid with no derivable apex (prism/box) refuses `bad-solid`, never a guess.
  | { type: 'perp-to-base'; from?: Id; face?: Id[] }
  // V8-f (G6): cos of the angle between two operands = a value. `cos∠ACB = 3/4`
  // (vertex ⇒ pairs) · `קוסינוס הזווית בין הוקטורים w ו-u הוא √35/10` (named vectors).
  | { type: 'cos-angle'; u: VecAtom; v: VecAtom; cos: number; soft?: boolean }
  | { type: 'concyclic'; ids: Id[] } // #305: A,B,C,D on one circle (the right-pyramid base fix) // `soft` (issue #116): a right-triangle's DEFAULT right-angle vertex, dropped in derive3 when an explicit ∠=90 on the same triangle is stated (M4 defaults-yield)
  // V8-f (G9): a CHAIN of dot products all equal — `u·v = v·w = u·w`. Apply lowers to
  // pairwise dot-eq relations (drive on a free figure, else verify).
  | { type: 'dot-eq-chain'; ops: [VecAtom, VecAtom][] }
  // V8-f (G10): `base` makes EQUAL ANGLES with `a` and `b` — `AE יוצר זוויות שוות עם AB ו-AD`.
  | { type: 'angle-eq'; base: VecAtom; a: VecAtom; b: VecAtom }
  // A general angle EQUALITY between two independently-named angles — "∠SAB = ∠SAD", "זווית ABC =
  // זווית DEF" (ADR-3D-052, issue #271). The four atoms are independent, so a shared vertex/arm is a
  // special case rather than a requirement; `angle-eq` above stays for the "X makes equal angles with
  // Y and Z" CONSTRUCTION phrasing. M1-routed like every other relation: it drives a free-dim solid
  // and verifies a determined figure. Also what a REUSED angle label means (α on two angles).
  | { type: 'angle-pair-eq'; a: VecAtom; b: VecAtom; c: VecAtom; d: VecAtom }
  // A stated numeric BOUND on an angle — "∠SAB > 60", "60 < α < 90" (ADR-3D-053, issue #273). A `label`
  // names the angle instead of spelling its three letters; it is resolved at APPLY (parse3 is context-free).
  | { type: 'angle-bound3'; vertex?: Id; p?: Id; q?: Id; label?: string; min?: number; max?: number }
  // V8-f (G11): `D על AC כך ש-OD חוצה-זווית AOC` — D on segment a–b, ray apex→D bisects ∠(a)(apex)(b).
  | { type: 'bisector-point'; id: Id; a: Id; b: Id; apex: Id }
  // triage 3-D: `הזווית בין הישר AC' לבין המישור ABCD היא 30` — the angle between a line and a plane
  | { type: 'line-plane-angle'; a: Id; b: Id; plane: Id[]; deg?: number; label?: string } // #319: a Greek value NAMES the measure (never a driver); the panel derives its degrees
  // V8-j (G12): `T על SC כך ש-TABCD פירמידה ישרה` — T on segment a–b so pyramid(base, apex=T) is right.
  | { type: 'right-pyramid-point'; id: Id; a: Id; b: Id; base: Id[] }
  // V8-g: `גובה המשולש לצלע AB הוא CD` — D = foot of the ⟂ from vertex `from` onto side a–b.
  | { type: 'altitude-foot'; id: Id; from: Id; a: Id; b: Id }
  // triage 3-D: `DE גובה בטטראדר` — altitude from vertex `from` to the OPPOSITE face of the
  // single tetrahedron (apply resolves the face = the tetra's other 3 vertices → a foot-face point).
  | { type: 'tetra-altitude'; id: Id; from: Id }
  // #289 (M1): `[ה]מנסרה [היא] ישרה` — a statement that THE existing solid is a RIGHT prism. No target
  // (parse3 is context-free); apply resolves the one prism-like solid and, if it is the oblique
  // `parallelepiped`, converts it to `prism4` (lateral vector pinned ⟂ base); already-right prisms are
  // an idempotent no-op; no prism → an honest refusal (never a re-construction that re-declares vertices).
  // (#271 general angle equality is `angle-pair-eq` above — the version wired to the α-label/bound system.)
  | { type: 'make-right-prism' };

// ---------------------------------------------------------------------------
// Construction (what apply builds, what evaluate consumes)
// ---------------------------------------------------------------------------

/** A solid instance: its vertex ids in canonical order + its drawn edges + faces (vertex-id rings). */
export interface SolidObj {
  kind: SolidKind;
  ids: Id[];
  edges: [Id, Id][];
  faces: Id[][];
  /** #349: this prism is OBLIQUE — see {@link SolidCommand.oblique}. Topology is identical to the
   *  right prism of the same kind (same ring), so only the dims and positions differ. */
  oblique?: true;
}

export type PointDef =
  | { kind: 'solid-vertex'; solid: number; index: number } // owned by construction.solids[solid]
  | { kind: 'on-segment'; a: Id; b: Id; t?: number }
  | { kind: 'centroid'; of: [Id, Id, Id] }
  | { kind: 'in-span'; a: Id; b: Id; vecFrom: Id; span: string[] }
  | { kind: 'coord'; x: number; y: number; z: number }
  // ADR-3D-094 (#276): a NEW point stated with PARTIALLY-known numeric coordinates and no
  // symbols («הקודקוד D על החלק החיובי של ציר ה-x» → y=z=0, x free): each null component is
  // a free sampled DOF (ADR-052), Lane-A absolute like `coord`. A sign-given on a null axis
  // SELECTS the sample's sign, so the stated side holds in every seed by construction.
  | { kind: 'partial'; x: number | null; y: number | null; z: number | null }
  // a free point riding a named plane (2 sampled DOF), or floating on a stated SIDE of
  // it (side ±1 = above/below the +z-oriented normal; 3 sampled DOF) — ADR-3D-015
  | {
      kind: 'on-plane';
      plane: string;
      side?: 1 | -1;
      /**
       * #841 — the rider was IMPLIED by a relation (#839's containment re-homing), not stated by the
       * student. It is a placeholder: it records that the point has no position yet beyond its
       * carrier, so a later real definition REPLACES it. A rider the student stated («B על מישור π2»)
       * never sets this and is never replaced — discarding it would drop a given.
       */
      implied?: true;
    }
  // a free point riding a named line (1 sampled DOF) — the on-plane rider, line edition
  // (ADR-3D-031: `משוואת הישר AB היא (0,7,6)+t(0,2,1)` creates A,B as riders on the line)
  | { kind: 'on-line'; line: string }
  // ADR-3D-032: `M(k,1,3)` — typed coordinates carrying the figure's SINGLE symbolic
  // parameter (LinExpr components; absolute, never gauge). Unpinned k = a sampled free
  // DOF; a recorded given referencing the point (paramGivens) root-finds it post-pivot.
  | { kind: 'coord-sym'; x: LinExpr; y: LinExpr; z: LinExpr }
  // ADR-3D-080: the RIGHT-pyramid apex seated on its carrier plane — the ⊥ line through the
  // base's centre (triangle: circumcentre; quad: centroid) cut with the point-run plane.
  | { kind: 'right-apex'; base: Id[]; plane: string }
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
  | { kind: 'vec-pair'; def1: number; def2: number } // the cevian intersection (two symbol relations)
  // #774 (ADR-3D-172): a point minted by a MIXED shape-declaration run («משולש SEC» where S, C
  // exist and E does not) — genuinely free: 3 sampled DOFs (ADR-052), counted by freeDofCount3,
  // moving on «show another configuration», riding the gauge like every figure-side point.
  | { kind: 'free3' };

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
  /** #94 — named-angle MARKERS (`∠SDB` / `∠SDB = α`): pedagogical arc highlights, no DOF, no verification. */
  angleMarks: { vertex: Id; p: Id; q: Id; label?: string }[];
  /** #319 — LABELED line↔plane angle measures («זוית בין SB ומישור ABC היא α»): pedagogical naming,
   *  never a driver; the panel prints `label = X°` when the angle is seed-stable (angles are
   *  scale-free, so no scale gate — the ADR-3D-054 taxonomy). */
  linePlaneMarks: { a: Id; b: Id; plane: Id[]; label: string }[];
  /** #523 — a NAMED angle between any two operands («הזווית בין המישור ABC למישור SBC היא α»). The
   *  general twin of `linePlaneMarks`, whose (segment × point-run) lowering is frozen: a Greek name
   *  states WHICH measure the question is about, never a value, so it marks and the panel derives its
   *  degrees when the angle is seed-stable. */
  relMarks: { a: Operand3; b: Operand3; label: string }[];
  /** Stated inequalities the DISPLAYED configuration must satisfy (ADR-3D-053) — see {@link Requirement3}. */
  requirements: Requirement3[];
  /** #612 (ADR-3D-158): the quad shapes the figure is KNOWN to have, as stated — the structural
   *  record the naming-error check reads. Never a measurement of one drawing. */
  quadShapes: { base: QuadBase; ids: Id[] }[];
  /** #612: shape statements that were TRUE and already known, so they changed nothing. Recorded so
   *  the notice is DERIVED from the construction like every other one, surviving reload and undo. */
  redundantShapes: { base: QuadBase; ids: Id[] }[];
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
  /** V4 — coordinate injections on existing points (null components don't constrain).
   *  #325 (ADR-3D-079): a component may be a symbolic AFFINE expression (`B(2t,t,k)`) —
   *  each distinct symbol joins the pivot as an extra unknown, OPEN until data pins it. */
  pins: { id: Id; x: number | null | SymComp; y: number | null | SymComp; z: number | null | SymComp }[];
  /** V4 — injected values for declared vectors. #794 (ADR-3D-168): a component is a number,
   *  null (placeholder — does not constrain), or a symbolic AFFINE expression, exactly as in
   *  `pins` — the #325 widening reaching the vector lane. */
  vectorPins: { name: string; x: number | null | SymComp; y: number | null | SymComp; z: number | null | SymComp }[];
  /** V4 — sign branch givens (select among pivot solutions). */
  signGivens: SignGivenCommand[];
  /**
   * #814 (ADR-3D-175) — WHICH LETTER NAMES WHICH FREE COMPONENT.
   *
   * «D(3,p,0)» on an existing D means "D's y is unknown" — the exam idiom, lowered (correctly, per
   * ADR-3D-032 / ADR-3D-094) to a null pin component: a free sampled DOF, resampled by "show another
   * configuration" and selectable by a sign given. What was missing is that the student NAMED it: the
   * letter was discarded, so «p חיובי» refused «הפרמטר p לא הוגדר בסרטוט» — the tool denying a
   * statement it had just been given.
   *
   * This records the name and nothing else. The component still solves exactly as before (that is the
   * point — promoting these letters to pivot unknowns instead breaks the partial-injection exam gates),
   * so the binding is INERT until a `param-sign` addresses the letter, at which point it lowers to the
   * component branch selection the engine already performs for a coordinate sign given.
   */
  partialNames: PartialName[];
  /** #814 (ADR-3D-175) — a sign stated on a NAMED free component («p חיובי» after «D(3,p,0)»). The
   *  coordinate sign given (`signGivens`) one lane wider: the same branch selection, keyed on the
   *  component the letter names rather than on a point+axis, so the vector and pair lanes are not a
   *  second mechanism. Evaluated by `componentValue`. */
  componentSigns: { target: ComponentTarget; axis: 'x' | 'y' | 'z'; positive: boolean }[];
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
    // ADR-3D-056 (#286): a ⊥/∥ between two SEGMENTS where one endpoint is this symbol-defined point.
    // «EO⊥AS» with E = A+t·AS pins t to the foot of the perpendicular — one root-find, not a dims drive
    // (the ⊥ was being pushed onto the free solid dims, so it held only at lucky seeds). seg(a,b) is the
    // arm carrying the unknown; seg(c,d) is the fixed reference.
    | { rel: 'seg-perp' | 'seg-par'; a: Id; b: Id; c: Id; d: Id; def: number }
  )[];
  /** Every claim RECORDED by apply (incl. ones composite commands create) — derive3
   *  attributes them to facts by count-delta and verifies them all; a claim can
   *  never escape verification by being created indirectly. */
  claims: Claim3[];
  /** #754 (ADR-3D-171) — the stated MAGNITUDE that pins a gauge-frozen figure's SCALE
   *  («|AB| = 4» on a cube, «נפח הפירמידה ABCD = 11»). The first eligible magnitude
   *  statement lands here (by reference — it is ALSO in `claims`, which stays the final
   *  arbiter); the resolver applies it as ONE uniform factor k per configuration
   *  (length k, area k², volume k³), so the shape DOFs stay free and sampled while the
   *  stated size holds exactly. Gated everywhere by `scaleGivenActive` (engine/scaleGiven.ts). */
  scaleGivens: Claim3[];
  /** V7 T2 — scalar givens driving the figure (residuals in the global solve). */
  scalarPins: ScalarPin[];
  /** V7 T2 — pair-vector injections (`BD = (-4,5,12)`), residuals like vectorPins.
   *  #794 (ADR-3D-168): components carry the same number | null | SymComp grammar as `pins`. */
  pairPins: { a: Id; b: Id; x: number | null | SymComp; y: number | null | SymComp; z: number | null | SymComp }[];
  /** ADR-3D-030 (M1) — a stated plane EQUATION on a solid-bearing figure is a GIVEN:
   *  each named point must satisfy cx·x + cy·y + cz·z + d = 0 (pivot residuals, like
   *  coordinate injections — it drives the free gauge/dims, verifies when determined). */
  planePins: { ids: Id[]; cx: number; cy: number; cz: number; d: number }[];
  /** ADR-3D-032 — recorded givens (angle/length claims) that reference a `coord-sym`
   *  point: they PIN the figure parameter by a post-pivot 1-DOF root-find (roots =
   *  branches; the D3 numeric-only boundary). */
  paramGivens: Claim3[];
  /** ADR-3D-032 — sign givens on the figure parameter (`k הוא פרמטר חיובי`): select
   *  among the root branches. #325: also on a pin symbol (selects among pivot solutions). */
  paramSigns: ParamSignCommand[];
  /** #324 (ADR-3D-079) — a named ring's relation to a COORDINATE plane/axis, as pivot
   *  residuals (absolute-frame, like injections): `share` = the ring shares its `axis`
   *  coordinate (∥ the coordinate plane ⟂ axis / ⟂ that axis), `zero` = that coordinate is 0
   *  (lies ON the coordinate plane), `perp` = the ring's normal ⟂ e_axis (⟂ that coordinate
   *  plane / ∥ that axis), `contains` = perp + the ring's plane passes through the origin. */
  coordPlanePins: { ids: Id[]; axis: 'x' | 'y' | 'z'; mode: 'share' | 'zero' | 'perp' | 'contains' }[];
  /** #375: a POINT-RUN plane stated ⟂ a named LINE («מישור ACD אנך לישר ℓ1»). ABSOLUTE-frame like
   *  `coordPlanePins`: one operand is figure-derived and the other is not, so satisfying it ROTATES
   *  the figure — it must never be solved with the gauge frozen. `statedAsPlane` records that the
   *  student called the line a plane, so the build notice can correct the wording (issue #375, A). */
  planeLinePerps: { ids: Id[]; line: string; statedAsPlane?: true }[];
  /** S2 (#378, ADR-3D-103): ∥/⟂/angle relations with a NAMED LINE on one side. Routed per instance
   *  by the frame classifier over `op` (`isAbsolute`, engine/operands.ts): gauge op → a pivot residual
   *  (the planeLinePerps stage); absolute op → a parameter root-find when a direction carries the
   *  figure parameter, else verify-only (the recorded claim is always the final arbiter). */
  lineRels: { rel: 'perp' | 'parallel' | 'angle' | 'contained'; deg?: number; op: Operand3; line: string; statedAsPlane?: true }[];
}

export const emptyConstruction3 = (): Construction3 => ({
  solids: [],
  points: new Map(),
  vectors: new Map(),
  arrows: [],
  segments: [],
  angleMarks: [],
  linePlaneMarks: [],
  relMarks: [],
  requirements: [],
  quadShapes: [],
  redundantShapes: [],
  planes: new Map(),
  lines: new Map(),
  planeAngles: [],
  memberships: [],
  linePerps: [],
  onLines: [],
  pins: [],
  vectorPins: [],
  signGivens: [],
  partialNames: [],
  componentSigns: [],
  pointPlanes: new Map(),
  pointLines: new Map(),
  relPlanes: new Map(),
  revolutions: [],
  circles3: [],
  vecDefs: [],
  symbolPins: [],
  claims: [],
  scaleGivens: [],
  scalarPins: [],
  pairPins: [],
  planePins: [],
  paramGivens: [],
  paramSigns: [],
  coordPlanePins: [],
  planeLinePerps: [],
  lineRels: [],
});

/** #325 (ADR-3D-079): the distinct OPEN symbols carried by the pins' affine components. */
/**
 * #480 — EVERY symbol the figure carries, in one place. Three kinds exist and they live in three
 * different fields: a vec-def's ratio symbol (`t` from `AE = t·AS`), a pin's open coordinate symbol
 * (`B(2t, t, k)`), and the algebraic lane's single figure parameter (`c.param`, the `m` in
 * `x + (m-2)y + (m-1)z - 5 = 0`). Each surface that shows symbols to a student used to consult
 * whichever subset its author had in mind — the query lane knew the first, the data panel the second,
 * and neither knew the third, so asking for `m` answered «לא זוהה» while the engine held its value.
 *
 * Derived rather than enumerated, so a fourth symbol kind reaches every surface by adding it here
 * (`src3d/CLAUDE.md`: *an enumeration is not a rule*).
 */
export function figureSymbolsOf(c: Construction3): string[] {
  const out = new Set<string>();
  for (const vd of c.vecDefs) if (vd.symbol) out.add(vd.symbol);
  for (const s of pinSymsOf(c)) out.add(s);
  if (c.param) out.add(c.param);
  return [...out];
}

/**
 * #517 — the figure's ABSOLUTE points: fresh coordinate injections (`C(2,1,0)` → kind 'coord'; the
 * coord-sym `M(k,1,3)`, absolute like a coord point per ADR-3D-032). They anchor the frame exactly as
 * `c.pins` do, but they live in `c.points`, not in a pin list — so any gate that asks "did something
 * absolute anchor this?" by enumerating pin lists alone is blind to them. That blindness suppressed
 * the canvas coordinate labels, the data panel and the query lane for a figure of bare injected
 * points (operator, 2026-08-11). Derived rather than enumerated — the `figureSymbolsOf` discipline
 * (`src3d/CLAUDE.md`: *an enumeration is not a rule*).
 */
export function absolutePointCount(c: Construction3): number {
  let n = 0;
  for (const def of c.points.values()) if (def.kind === 'coord' || def.kind === 'coord-sym') n++;
  return n;
}

export function pinSymsOf(c: Construction3): string[] {
  const out: string[] = [];
  // #794 (ADR-3D-168): every pin family with symbolic components contributes — point pins,
  // vector pins and pair pins share one component grammar, so they must share one symbol
  // derivation (the `figureSymbolsOf` discipline: an enumeration one list short is how a
  // param-sign on a pair symbol would refuse `unknown-symbol` while the figure carries it).
  const lists: { x: number | null | SymComp; y: number | null | SymComp; z: number | null | SymComp }[] = [
    ...c.pins, ...c.vectorPins, ...c.pairPins,
  ];
  for (const pin of lists) {
    for (const comp of [pin.x, pin.y, pin.z]) {
      if (comp !== null && typeof comp === 'object' && !out.includes(comp.sym)) out.push(comp.sym);
    }
  }
  // #815: an EQUATION written in a pin symbol carries that symbol too. After the re-homing (#801's
  // injection door, #815's membership door) the letter may live in no pin at all — only in the line or
  // plane whose numbers are in it — and it is a pivot unknown all the same: the membership residual
  // against that carrier is what determines it. Derived here so the pivot's unknown layout, the DOF
  // count, the symbol surfaces and the one-owner guards all see one namespace.
  for (const def of c.lines.values()) if (def.kind === 'parametric' && def.sym !== undefined && !out.includes(def.sym)) out.push(def.sym);
  for (const def of c.planes.values()) if (def.sym !== undefined && !out.includes(def.sym)) out.push(def.sym);
  return out;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Structured engine errors — humanised by the app layer through i18n. */
/**
 * A REQUIREMENT — a stated INEQUALITY the drawn configuration must satisfy ([ADR-3D-053](docs/06b-decisions-3d.md),
 * issue #273). Unlike every other 3-D given it is not an equation: it determines nothing, so it can neither
 * be a `ScalarPin` residual (there is no target to reach) nor a `Claim3` (a whole REGION satisfies it).
 * It restricts WHICH sampled configuration may be shown — the ADR-052 discipline: the measure stays a free
 * DOF, "show another configuration" varies it INSIDE the bound, and no value is ever reported for it.
 *
 * The 2-D app enforces the same idea through `meetsRequirements` + a seed search (ADR-106/244/254);
 * `src3d` had no such layer at all (its `resample` was a blind `seed + 1`), so this is that layer, with
 * angle bounds as its first client. Patterns are COPIED from `src/`, never imported (docs/20 §12).
 */
export type Requirement3 =
  | { kind: 'angle-bound'; vertex: Id; p: Id; q: Id; min?: number; max?: number }
  // S4 (#378): the displayed configuration must actually show the stated mutual position. This is
  // the ONLY mechanism for `skew` (an inequality: not parallel AND not meeting), and it carries the
  // open half of the closed relations too — that `intersecting` really crosses WITHIN both segments
  // rather than out on their continuations, which no least-squares residual can express.
  | { kind: 'mutual'; rel: MutualRel3; a: Operand3; b: Operand3 }
  // #615 (ADR-3D-158): a declared quad shape must not DRAW as a special case of itself — ADR-052's
  // "a מקבילית must not render as a rectangle" applied to the flat lane. An inequality, so it belongs
  // here (sample-and-gate) and never in the solver: the shape's own dims keep their freedom and
  // «show another configuration» varies them, but the seeds that look like a MORE SPECIFIC shape are
  // not shown while a general one is reachable.
  | { kind: 'quad-general'; base: QuadBase; ids: [Id, Id, Id, Id] };

export type EngineError3 =
  | { code: 'already-defined'; id: Id }
  // #612 (ADR-3D-158): the ring is already known to be a MORE SPECIFIC shape than the noun stated —
  // «ABCD מלבן» on a base the figure knows is a square. Operator ruling: a naming error, not a
  // redundancy. Carries both shapes so the message can name them.
  | { code: 'shape-less-specific'; stated: QuadBase; actual: QuadBase }
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
  // #492: NO REAL parameter value satisfies the pinning givens — strictly stronger than "the claim
  // fails in this drawing", so the message says so and names the statements in conflict.
  | { code: 'no-roots'; sym: string; stated: string; others: string[] }
  | { code: 'not-on-plane'; id: Id } // a stated membership does not hold in any branch
  | { code: 'not-coplanar'; id: string } // a plane's named points do not determine a single plane
  | { code: 'plane-side-undefined'; id: string } // above/below a (near-)vertical plane is meaningless
  | { code: 'wrong-side-of-plane'; id: Id } // a stated above/below does not hold for the point
  | { code: 'not-on-line'; id: Id } // a stated on-line membership does not hold
  // #769 (ADR-3D-183): a DERIVED point (a crossing, a foot, a midpoint…) lands on a point the figure
  // already names — the geometry the student asked for is right, the NAME is not: it is `with`.
  | { code: 'point-coincides'; id: Id; with: Id }
  | { code: 'line-misses-plane'; id: Id } // ℓ ∥ π at the chosen parameter — no crossing point
  // #780: the plane crosses the LINE through the stated segment, but outside the drawn ink. The
  // student pointed at an edge, so a crossing beyond its endpoints is not on the figure — refuse
  // honestly rather than silently extending their segment into a line (which is what used to happen).
  | { code: 'crossing-off-segment'; id: Id }
  | { code: 'symbolic-new-point'; id: Id } // a NEW point with symbolic components is under-determined
  | { code: 'injection-unsatisfiable' } // no placement of the figure matches the injected COORDINATES
  // #425: the same "no placement" finding on a figure whose pins are not coordinates (angles, equal
  // sides, plane equations) — the givens contradict each other, and the message names which.
  | { code: 'givens-contradict'; stated: string; others: string[] }
  | { code: 'sign-unsatisfiable'; id: Id } // no pivot solution has the stated coordinate sign
  | { code: 'no-such-solid'; id: string } // a volume/area claim names a solid kind the figure doesn't have (or has twice)
  | { code: 'free-size-claim'; id: string } // a numeric volume/area claim on a solid whose dims are unstated
  | { code: 'two-unknowns'; id: Id } // a vector relation with more than one undefined point
  | { code: 'size-on-solid' } // a numeric size on a free-dim solid figure — not supported yet (honest boundary)
  | { code: 'unknown-symbol'; id: string } // a value was assigned to a parameter no relation defines
  | { code: 'ambiguous-angle'; id: Id } // #251: a single-vertex angle whose arms cannot be resolved (≠2 edges at the vertex)
  | { code: 'no-prism-to-make-right' } // #289: `המנסרה ישרה` but the figure has no prism-like solid to make right
  | { code: 'ambiguous-prism' } // #289: `המנסרה ישרה` with more than one oblique prism — "the prism" is ambiguous
  // #766: «נפח הפירמידה = 11» where the figure holds more than one pyramid — the operator's ruling is
  // to ASK for more specific letters, never to pick one (ADR-052: picking asserts an unstated given).
  | { code: 'ambiguous-solid'; id: string; count: number }
  | { code: 'bound-unsatisfiable'; id: Id } // #273: no sampled configuration puts the measure inside the stated bound
  | { code: 'vacuous-relation' } // S4 (#378): a mutual position stated between an object and itself
  | { code: 'plane-not-determined'; id: string } // #487: this construct needs a plane with a stated equation — π is still free
  | { code: 'line-not-determined'; id: string } // #552: a claim judged against a free line whose relevant DOF is still sampled — pin it first, never accuse
  | { code: 'claim-refuted' } // the stated answer does not hold in the figure
  // #512: a relation to the COORDINATE FRAME judged against a placement the funnel sampled — the
  // statement may well be satisfiable; what is missing is a given that fixes where the figure sits.
  | { code: 'placement-not-fixed' }
  // #442: only a TANGENTIAL polygon has an incircle, and every triangle is one. A best-fit circle for a
  // general quad would be tangent to nothing — refuse rather than draw a figure that lies.
  | { code: 'incircle-needs-triangle' };

export type ApplyResult3 = { ok: true; next: Construction3 } | { ok: false; error: EngineError3 };

export type Positions3 = Map<Id, Vec3>;
