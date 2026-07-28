/**
 * RELATION_TABLE — the relations program's disposition map (docs/26 v2 §3.3, #378, S1).
 *
 * One data structure answering, for every (relation × operand-kind × operand-kind) combination: is it
 * supported, planned, out of scope, or meaningless — and when supported, by which ENGINE ACTION. The
 * [ADR-235](../../docs/06-decisions.md#adr-235) pattern: a totality test keeps the classification
 * complete, so a cell nobody thought about reads `planned`-or-`n/a` explicitly instead of failing
 * silently; the battery iterates the `supported` cells; a slice lands by flipping cells.
 *
 * STATUS IS MEASURED, NOT ASPIRED: a cell is `supported` only if the utterance family parses and the
 * engine performs the declared action today. When this file and reality disagree, this file is the bug.
 */

import type { Operand3 } from './types';

export type Rel3 =
  | 'perp'
  | 'parallel'
  | 'skew'
  | 'intersecting'
  | 'coincident'
  | 'contains'
  | 'on'
  | 'angle'
  | 'distance';

export type OperandKind = Operand3['kind'];

/** The engine action(s) a supported cell performs — docs/26 §2.4. */
export type RelAction =
  | 'rider' // creates a free-DOF point (a NEW id on the object)
  | 'drive-dims' // similarity-invariant shape drive (scalar-pin family)
  | 'drive-gauge' // absolute-frame drive — rotates/places the figure (pivot residual)
  | 'param-root' // pins the figure's single parameter (roots = branches)
  | 'requirement' // open condition: sample-and-gate, never least-squares
  | 'claim'; // verified on the (locally) determined figure

export type CellStatus =
  | { status: 'supported'; actions: RelAction[]; note?: string }
  | { status: 'planned'; slice: 'S2' | 'S3' | 'S4' | 'S5'; note?: string }
  | { status: 'out-of-scope'; note: string }
  | { status: 'n/a'; note?: string };

export const REL3: Rel3[] = ['perp', 'parallel', 'skew', 'intersecting', 'coincident', 'contains', 'on', 'angle', 'distance'];
export const OPERAND_KINDS: OperandKind[] = ['point', 'segment', 'vector', 'line', 'plane-run', 'plane-named'];

/** Relations where (lhs, rhs) and (rhs, lhs) are the same cell. */
const SYMMETRIC = new Set<Rel3>(['perp', 'parallel', 'skew', 'intersecting', 'coincident', 'angle', 'distance']);

const key = (rel: Rel3, l: OperandKind, r: OperandKind): string => {
  if (SYMMETRIC.has(rel) && OPERAND_KINDS.indexOf(r) < OPERAND_KINDS.indexOf(l)) return `${rel}|${r}|${l}`;
  return `${rel}|${l}|${r}`;
};

/** A direction-bearing kind (has a `dir`); planes bear normals; points bear neither. */
const DIRECTIONAL = new Set<OperandKind>(['segment', 'vector', 'line']);
const PLANAR = new Set<OperandKind>(['plane-run', 'plane-named']);

/**
 * The explicit cells. Everything not listed falls to the defaults below — which is what keeps the map
 * total without 324 hand-written rows.
 */
const CELLS: Record<string, CellStatus> = {
  // ---- perpendicular ------------------------------------------------------------------
  'perp|segment|segment': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'cos-angle, ADR-3D-035' },
  'perp|segment|vector': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'mixed atoms, ADR-3D-035' },
  'perp|vector|vector': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'u ⊥ v' },
  'perp|segment|plane-run': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'seg-plane-rel / perp-plane claim' },
  'perp|segment|plane-named': { status: 'planned', slice: 'S3', note: 'perpPlaneClaim reads label runs only today' },
  'perp|line|plane-run': { status: 'supported', actions: ['drive-gauge', 'claim'], note: '#375 / ADR-3D-100' },
  'perp|line|plane-named': { status: 'supported', actions: ['param-root', 'claim'], note: 'linePerpPlane pins m (2024-Q2); S2 records the numeric claim + the flipped מישור-first order' },
  'perp|line|segment': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: lineRels pivot residual (ADR-3D-103)' },
  'perp|line|vector': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: lineRels (ADR-3D-103)' },
  'perp|line|line': { status: 'supported', actions: ['param-root', 'claim'], note: 'S2: symbolic dir pins; numeric verifies (ADR-3D-103)' },
  'perp|plane-run|plane-run': { status: 'planned', slice: 'S3' },
  'perp|plane-run|plane-named': { status: 'planned', slice: 'S3' },
  'perp|plane-named|plane-named': { status: 'planned', slice: 'S3' },
  'perp|vector|plane-run': { status: 'planned', slice: 'S3' },
  'perp|vector|plane-named': { status: 'planned', slice: 'S3' },

  // ---- parallel -----------------------------------------------------------------------
  'parallel|segment|segment': {
    status: 'supported',
    actions: ['claim'],
    note: 'PLURAL claim form only (`AB ו-CD מקבילים`, V7-T3); the singular given is S4',
  },
  'parallel|segment|plane-run': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'seg-par-plane' },
  'parallel|segment|plane-named': { status: 'planned', slice: 'S3' },
  'parallel|segment|vector': { status: 'planned', slice: 'S4' },
  'parallel|vector|vector': { status: 'planned', slice: 'S4' },
  'parallel|line|line': { status: 'supported', actions: ['param-root', 'claim'], note: 'S2: symbolic dirs pin m (the 2010-Q3 family); numeric verifies' },
  'parallel|line|segment': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: lineRels (ADR-3D-103)' },
  'parallel|line|vector': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: lineRels (ADR-3D-103)' },
  'parallel|line|plane-run': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: line ∥ point-run plane ⟺ dir ⟂ normal' },
  'parallel|line|plane-named': { status: 'supported', actions: ['param-root', 'claim'], note: 'S2: dir(m)·n(m) = 0 pins; numeric verifies' },
  'parallel|vector|plane-run': { status: 'planned', slice: 'S3' },
  'parallel|vector|plane-named': { status: 'planned', slice: 'S3' },
  'parallel|plane-run|plane-run': { status: 'planned', slice: 'S3' },
  'parallel|plane-run|plane-named': { status: 'planned', slice: 'S3' },
  'parallel|plane-named|plane-named': { status: 'planned', slice: 'S3' },

  // ---- skew / intersecting / coincident (mutual positions) ----------------------------
  'skew|segment|segment': { status: 'supported', actions: ['claim'], note: 'מצטלבים, V7-T3; the GIVEN (requirement) is S4' },
  'intersecting|segment|segment': { status: 'supported', actions: ['claim'], note: 'נחתכים, V7-T3' },

  // ---- contains (an object lying IN a plane / ON a line) ------------------------------
  'contains|plane-run|segment': { status: 'planned', slice: 'S3', note: 'a segment lying in a plane' },
  'contains|plane-named|segment': { status: 'planned', slice: 'S3' },
  'contains|plane-run|line': { status: 'planned', slice: 'S3', note: 'מוכל' },
  'contains|plane-named|line': { status: 'planned', slice: 'S3' },

  // ---- point membership ----------------------------------------------------------------
  'on|point|plane-run': { status: 'supported', actions: ['rider', 'drive-gauge', 'claim'], note: 'ADR-3D-015/033' },
  'on|point|plane-named': { status: 'supported', actions: ['rider', 'claim'], note: 'ADR-3D-015; branch-SELECT on `any`' },
  'on|point|line': { status: 'supported', actions: ['rider', 'drive-gauge', 'claim'], note: 'S2 (#377): `B על l1` — the built on-line (ADR-3D-031), now reachable' },
  'on|point|point': { status: 'n/a', note: 'a point on a point is a coincidence statement, not a membership' },
  'on|point|vector': { status: 'n/a', note: 'a vector is not a carrier — membership lives on segments/lines/planes/circles' },
  'on|point|segment': { status: 'supported', actions: ['rider', 'claim'], note: 'point-on-segment3, V0; numeric t verifies (ADR-3D-047)' },

  // ---- angle with a value --------------------------------------------------------------
  'angle|segment|segment': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'vangle / angle-seg-eq' },
  'angle|segment|vector': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'cos-angle with value (V8-f)' },
  'angle|vector|vector': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'cos∠(u,v), V8-f' },
  'angle|segment|plane-run': { status: 'supported', actions: ['drive-dims', 'claim'], note: 'line-plane-angle, ADR-3D-027' },
  'angle|segment|plane-named': { status: 'planned', slice: 'S3' },
  'angle|line|plane-run': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2: sin β = |cos(n,dir)| (ADR-3D-103)' },
  'angle|line|plane-named': { status: 'supported', actions: ['param-root', 'claim'], note: 'S2 (ADR-3D-103)' },
  'angle|line|segment': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2 (ADR-3D-103)' },
  'angle|line|vector': { status: 'supported', actions: ['drive-gauge', 'claim'], note: 'S2 (ADR-3D-103)' },
  'angle|line|line': { status: 'supported', actions: ['param-root', 'claim'], note: 'S2 (ADR-3D-103)' },
  'angle|plane-named|plane-named': { status: 'supported', actions: ['param-root'], note: 'planeAngles — the 2022-Q2 45°' },
  'angle|plane-run|plane-run': { status: 'planned', slice: 'S3' },
  'angle|plane-run|plane-named': { status: 'planned', slice: 'S3' },

  // ---- distance with a value -----------------------------------------------------------
  'distance|point|plane-run': { status: 'planned', slice: 'S5' },
  'distance|point|plane-named': { status: 'planned', slice: 'S5' },
  'distance|point|line': { status: 'planned', slice: 'S5' },
  'distance|line|line': { status: 'planned', slice: 'S5', note: 'skew-line distance — 2010-Q3' },
  'distance|plane-run|plane-named': { status: 'planned', slice: 'S5' },
  'distance|plane-named|plane-named': { status: 'planned', slice: 'S5' },
  'distance|plane-run|plane-run': { status: 'planned', slice: 'S5' },
  'distance|point|point': {
    status: 'n/a',
    note: 'owned by the magnitude family (|AB| = v, length-rel) — never double-owned here',
  },
};

// S2 (#378, ADR-3D-103): CELLS is written in HUMAN order (`perp|line|segment`), but lookups go
// through the canonical `key()` (symmetric relations sort operands by OPERAND_KINDS index) — so a
// literal in the "wrong" order used to be a DEAD entry that silently fell to the defaults. Re-key
// every literal through `key()` at module init so the written order can never matter. Two literals
// collapsing onto one canonical cell is a self-contradiction — fail loudly, never last-wins.
const CANONICAL_CELLS: Record<string, CellStatus> = {};
for (const [k, v] of Object.entries(CELLS)) {
  const [rel, l, r] = k.split('|') as [Rel3, OperandKind, OperandKind];
  const canon = key(rel, l, r);
  if (CANONICAL_CELLS[canon]) throw new Error(`relationTable: duplicate cell ${k} (canonical ${canon})`);
  CANONICAL_CELLS[canon] = v;
}

/** Total classification: every (rel, l, r) answers. */
export function cellStatus(rel: Rel3, l: OperandKind, r: OperandKind): CellStatus {
  const hit = CANONICAL_CELLS[key(rel, l, r)];
  if (hit) return hit;

  // ---- defaults: the combinatorial floor, stated once ---------------------------------
  if (rel === 'on') {
    return l === 'point'
      ? { status: 'planned', slice: 'S2', note: 'membership on this carrier' }
      : { status: 'n/a', note: 'only a point can lie ON something; containment is `contains`' };
  }
  if (rel === 'contains') {
    return PLANAR.has(l) || l === 'line'
      ? { status: 'planned', slice: 'S3' }
      : { status: 'n/a', note: 'only a plane/line contains' };
  }
  if (l === 'point' || r === 'point') {
    return rel === 'distance'
      ? { status: 'planned', slice: 'S5' }
      : { status: 'n/a', note: 'a point has no direction — this relation needs two directional/planar operands' };
  }
  if (rel === 'skew' || rel === 'intersecting' || rel === 'coincident') {
    if (DIRECTIONAL.has(l) && DIRECTIONAL.has(r)) return { status: 'planned', slice: 'S4' };
    if (PLANAR.has(l) && PLANAR.has(r)) {
      return rel === 'skew'
        ? { status: 'n/a', note: 'two planes are never skew' }
        : { status: 'planned', slice: 'S3' };
    }
    return rel === 'skew'
      ? { status: 'n/a', note: 'a line and a plane are never skew' }
      : { status: 'planned', slice: 'S3' };
  }
  if (rel === 'distance') return { status: 'planned', slice: 'S5' };
  // perp / parallel / angle over directional-or-planar pairs not explicitly listed
  return { status: 'planned', slice: PLANAR.has(l) || PLANAR.has(r) ? 'S3' : 'S4' };
}

/** The supported cells, canonically keyed — the battery's iteration set. */
export function supportedCells(): string[] {
  const out = new Set<string>();
  for (const rel of REL3) {
    for (const l of OPERAND_KINDS) {
      for (const r of OPERAND_KINDS) {
        const c = cellStatus(rel, l, r);
        if (c.status === 'supported') out.add(key(rel, l, r));
      }
    }
  }
  return [...out].sort();
}
