/**
 * The QUADRILATERAL BASE registry (#304 / #305, ADR-3D-072).
 *
 * A solid is a BASE SHAPE × a TOP MODEL (right prism / oblique prism / right apex /
 * free apex). Before this module that cross-product was enumerated by hand: the
 * parallelogram ring was written out three times (`prism4`, `parallelepiped`,
 * `pyramidPar`), the rectangle three times, the square four — and a base that had been
 * written for one top simply did not exist for the other (the rhombus had a prism and
 * no pyramid; the general quad had a prism and no pyramid). That gap is what let the
 * parser's base dispatch fall through to its unstated-base default and silently draw a
 * RECTANGLE for a stated מעוין (#304).
 *
 * Here each base is defined ONCE — its free dims, its ring, and its centre of symmetry
 * — so any top can mount any base. The ring convention matches what every existing
 * solid already used, so migrating them is bit-identical:
 *
 *     A = (0,0) and B = (1,0) are the SIMILARITY GAUGE (the base's first edge);
 *     the remaining vertices ride the base's free dims, listed A→B→C→D around the ring.
 *
 * ADR-052 (no fixed assumptions) governs the sampling ranges: a base's default drawing
 * must never LOOK like a special case of itself — a `מקבילית` must not render as a
 * rectangle (#291/ADR-3D-059), a `דלתון` must not render as a rhombus, and a `טרפז`
 * must not render as a parallelogram or a right trapezoid. The ranges below keep every
 * base visibly general at EVERY seed while staying free DOFs that "show another
 * configuration" varies.
 */

import { sample } from './rng';
import type { SolidKind } from './types';

/** The quadrilateral base shapes a solid can stand on. */
export type QuadBase = 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'kite' | 'trapezoid' | 'quad';

export interface Pt2 {
  x: number;
  y: number;
}

/** Deg → rad (local copy — this module is a leaf, it imports no engine internals). */
const rad = (d: number) => (d * Math.PI) / 180;

/** How many free dims each base ring consumes (A,B are the gauge and cost nothing). */
export const QUAD_BASE_DIMS: Record<QuadBase, number> = {
  square: 0,
  rectangle: 1,
  rhombus: 1,
  parallelogram: 2,
  kite: 2,
  trapezoid: 3,
  quad: 4,
};

/**
 * A base's free dims, sampled per (seed, stable key) — the canonical sampling every
 * NEW kind uses. The pre-#305 prism kinds keep their own historical ranges inline in
 * `solidDims` (unifying them would move every locked figure's coordinates); their RINGS
 * still come from `quadBaseRing`, so the geometry has exactly one definition.
 */
export function quadBaseDims(base: QuadBase, key: string, seed: number): number[] {
  switch (base) {
    case 'square':
      return []; // unit square — fully determined by the gauge
    case 'rectangle':
      return [sample(seed, `${key}-aspect`, 0.6, 1.6)];
    case 'rhombus':
      // the base angle at A; bounded away from 90° so a rhombus never renders as a square
      return [rad(sample(seed, `${key}-angle`, 45, 75))];
    case 'parallelogram':
      // #291: dx strictly positive and bounded away from 0 ⇒ ∠DAB stays visibly oblique
      return [sample(seed, `${key}-dx`, 0.3, 0.6), sample(seed, `${key}-dy`, 0.5, 1.0)];
    case 'kite':
      // half-angle at A, and how far the far vertex C rides the symmetry axis.
      // c ≥ 1.2 (with |AB| = 1) keeps it visibly a kite, never a rhombus (c = 1).
      return [rad(sample(seed, `${key}-half`, 22, 48)), sample(seed, `${key}-axis`, 1.2, 2.2)];
    case 'trapezoid':
      // DC ∥ AB. `top` ≠ 1 keeps it off a parallelogram; dx > 0 keeps it off a RIGHT trapezoid.
      return [
        sample(seed, `${key}-dx`, 0.15, 0.45),
        sample(seed, `${key}-dy`, 0.6, 1.1),
        sample(seed, `${key}-top`, 0.3, 0.7),
      ];
    case 'quad':
      return [
        sample(seed, `${key}-cx`, 0.9, 1.5),
        sample(seed, `${key}-cy`, 0.6, 1.2),
        sample(seed, `${key}-dx`, -0.3, 0.4),
        sample(seed, `${key}-dy`, 0.6, 1.2),
      ];
  }
}

/**
 * The base ring A→B→C→D in the z = 0 plane, from the base's free dims.
 * A = (0,0), B = (1,0) are the gauge; `dims.length` must be `QUAD_BASE_DIMS[base]`.
 */
export function quadBaseRing(base: QuadBase, dims: number[]): Pt2[] {
  const A = { x: 0, y: 0 };
  const B = { x: 1, y: 0 };
  switch (base) {
    case 'square':
      return [A, B, { x: 1, y: 1 }, { x: 0, y: 1 }];
    case 'rectangle': {
      const [b] = dims;
      return [A, B, { x: 1, y: b }, { x: 0, y: b }];
    }
    case 'rhombus': {
      // all four sides = |AB| = 1; θ is the base angle at A, so AD = (cos θ, sin θ)
      const [theta] = dims;
      const dx = Math.cos(theta);
      const dy = Math.sin(theta);
      return [A, B, { x: 1 + dx, y: dy }, { x: dx, y: dy }];
    }
    case 'parallelogram': {
      const [dx, dy] = dims; // AD = (dx,dy); C = B + AD
      return [A, B, { x: 1 + dx, y: dy }, { x: dx, y: dy }];
    }
    case 'kite': {
      // |AB| = |AD| and |CB| = |CD|: B and D are mirror images across the axis A→C.
      // half = ∠BAC, so AD is AB rotated by 2·half; C rides the axis at distance `axis`.
      const [half, axis] = dims;
      return [
        A,
        B,
        { x: axis * Math.cos(half), y: axis * Math.sin(half) },
        { x: Math.cos(2 * half), y: Math.sin(2 * half) },
      ];
    }
    case 'trapezoid': {
      // DC ∥ AB (both horizontal); `top` = |DC|, which is free and ≠ |AB|
      const [dx, dy, top] = dims;
      return [A, B, { x: dx + top, y: dy }, { x: dx, y: dy }];
    }
    case 'quad': {
      const [cx, cy, dx, dy] = dims;
      return [A, B, { x: cx, y: cy }, { x: dx, y: dy }];
    }
  }
}

/**
 * Where a RIGHT pyramid's apex sits above — the base's CENTRE OF SYMMETRY (the
 * diagonals' intersection), or `null` when the base has none.
 *
 * "פירמידה ישרה" means the apex projects onto the base's centre. Only a
 * centro-symmetric base HAS one; a kite, a trapezoid and a general quad do not, so
 * `ישרה` over them is not a defined solid and the parser DEFERS rather than inventing
 * a centroid (ADR-052 — a made-up centre is an unstated given). Note that "right" here
 * gives equal lateral edges only when the base is also cyclic (square/rectangle); over
 * a rhombus or parallelogram the lateral edges are equal in opposite PAIRS, which is
 * the standard textbook figure.
 */
export function quadBaseCenter(base: QuadBase, ring: Pt2[]): Pt2 | null {
  if (!CENTRO_SYMMETRIC.has(base)) return null;
  const [a, , c] = ring; // the centre of symmetry is the midpoint of either diagonal
  return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
}

/** The bases with a centre of symmetry — exactly those a RIGHT pyramid can stand on. */
export const CENTRO_SYMMETRIC: ReadonlySet<QuadBase> = new Set<QuadBase>(['square', 'rectangle', 'rhombus', 'parallelogram']);

// ---------------------------------------------------------------------------
// The quad-pyramid family: BASE × TOP, as one table
// ---------------------------------------------------------------------------

/**
 * Every 4-base pyramid kind, as (base shape, is the apex right-over-the-centre).
 *
 * The five pre-#305 kinds are listed here too and are driven by the SAME composition —
 * their dims and coordinates come out bit-identical (base dims first, then the top's;
 * that is the order they were already written in), so the migration moves no figure.
 * That equivalence is the point: the general path SUBSUMES the special cases rather
 * than sitting beside them (the ADR-3D-069 lesson — a carve-out is what hides the gap).
 *
 * A `right: true` entry exists only for a CENTRO_SYMMETRIC base; `ישרה` over a kite,
 * a trapezoid or a general quad has no defined apex and is refused, not guessed.
 */
export const QUAD_PYRAMIDS: Partial<Record<SolidKind, { base: QuadBase; right: boolean }>> = {
  // pre-#305 — behaviour-preserving
  pyramid4: { base: 'square', right: true },
  pyramid4g: { base: 'square', right: false },
  pyramid4r: { base: 'rectangle', right: true },
  pyramid4gr: { base: 'rectangle', right: false },
  pyramidPar: { base: 'parallelogram', right: false },
  // #305 — the bases the pyramid family was missing
  pyramidParR: { base: 'parallelogram', right: true },
  pyramidRhomb: { base: 'rhombus', right: false },
  pyramidRhombR: { base: 'rhombus', right: true },
  pyramidKite: { base: 'kite', right: false },
  pyramidTrap: { base: 'trapezoid', right: false },
  pyramidQuad: { base: 'quad', right: false },
};

/** The free dims a quad pyramid carries: its base's, then its top's (height, or a free apex). */
export function quadPyramidDims(kind: SolidKind, key: string, seed: number): number[] | null {
  const spec = QUAD_PYRAMIDS[kind];
  if (!spec) return null;
  const base = quadBaseDims(spec.base, key, seed);
  if (spec.right) return [...base, sample(seed, `${key}-height`, 0.8, 1.6)];
  return [
    ...base,
    sample(seed, `${key}-ax`, 0.2, 0.8),
    sample(seed, `${key}-ay`, 0.2, 0.8),
    sample(seed, `${key}-az`, 0.8, 1.6),
  ];
}

/** The base ring + apex of a quad pyramid, in `ids` order (base A→B→C→D, then the APEX). */
export function quadPyramidLayout(kind: SolidKind, dims: number[]): { ring: Pt2[]; apex: { x: number; y: number; z: number } } | null {
  const spec = QUAD_PYRAMIDS[kind];
  if (!spec) return null;
  const nb = QUAD_BASE_DIMS[spec.base];
  const ring = quadBaseRing(spec.base, dims.slice(0, nb));
  const top = dims.slice(nb);
  if (spec.right) {
    const c = quadBaseCenter(spec.base, ring)!; // guaranteed: right ⇒ centro-symmetric
    return { ring, apex: { x: c.x, y: c.y, z: top[0] } };
  }
  const [ax, ay, az] = top;
  return { ring, apex: { x: ax, y: ay, z: az } };
}
