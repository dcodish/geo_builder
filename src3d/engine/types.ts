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
  | { type: 'collinear3'; ids: Id[] }; // E, C, A' on one line

// ---------------------------------------------------------------------------
// Commands (what the parser emits)
// ---------------------------------------------------------------------------

/** V0 solid family. `cube`/`box`: 8 ids (base ABCD then tops A'B'C'D'); `prism3`: 6 ids (right triangular prism, base ABC then tops). */
export type SolidKind = 'cube' | 'box' | 'prism3';

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

export type Command3 =
  | SolidCommand
  | PointOnSegment3Command
  | NameVectorCommand
  | Segment3Command
  | Centroid3Command
  | PointInSpanCommand
  | ClaimCommand;

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
  | { kind: 'in-span'; a: Id; b: Id; vecFrom: Id; span: string[] };

export interface Construction3 {
  solids: SolidObj[];
  /** Insertion-ordered: a point's parents always precede it (enforced at apply). */
  points: Map<Id, PointDef>;
  /** Declared vector names → their ordered pair. */
  vectors: Map<string, { from: Id; to: Id }>;
  /** Auxiliary drawn segments (beyond the solids' own edges). */
  segments: [Id, Id][];
}

export const emptyConstruction3 = (): Construction3 => ({
  solids: [],
  points: new Map(),
  vectors: new Map(),
  segments: [],
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Structured engine errors — humanised by the app layer through i18n. */
export type EngineError3 =
  | { code: 'already-defined'; id: Id }
  | { code: 'unknown-point'; id: Id }
  | { code: 'unknown-vector'; id: string }
  | { code: 'bad-solid'; kind: SolidKind }
  | { code: 'bad-name'; id: string }
  | { code: 'need-basis' } // in-span needs exactly 3 declared vectors (a basis)
  | { code: 'no-solution'; id: Id } // the driven t has no value satisfying the condition
  | { code: 'not-on-segment'; id: Id } // the driven t lands outside the stated segment
  | { code: 'claim-refuted' }; // the stated answer does not hold in the figure

export type ApplyResult3 = { ok: true; next: Construction3 } | { ok: false; error: EngineError3 };

export type Positions3 = Map<Id, Vec3>;
