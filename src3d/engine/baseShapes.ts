/**
 * The QUADRILATERAL BASE registry (#305 / #341 / #358, ADR-3D-090).
 *
 * A solid is a BASE SHAPE × a TOP MODEL (right prism / oblique prism / right apex /
 * free apex). Before this module that cross-product was enumerated by hand: the
 * parallelogram ring was written out three times (`prism4`, `parallelepiped`,
 * `pyramidPar`), the rectangle three times, the square four — and a base that had been
 * written for one top simply did not exist for the other (the rhombus had a prism and
 * no pyramid; the general quad had a prism and no pyramid).
 *
 * Here each base is defined ONCE — its free dims, its ring, and its circumcentre — so
 * any top can mount any base. The ring convention matches what every existing solid
 * already used, so migrating them is bit-identical:
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
import { ringCircumcentre2 } from './vec3';
import type { Command3, Id, SolidKind } from './types';

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
 * #587 (ADR-3D-152): the constraint set a stated FLAT quad shape lowers to, on the ring `[a,b,c,d]`.
 *
 * The flat lane's ring is four FREE points, so — unlike the solid lane, where a stated base selects a
 * KIND whose ring {@link quadBaseRing} generates structurally — the shape has to be stated as ordinary
 * relations. These are authored against `quadBaseRing`'s own definitions above, so the two realisations
 * of "square" cannot drift: each row's constraint count is exactly `4 − QUAD_BASE_DIMS[base]` (the flat
 * `polygon4` carries 4 free dims, A and B being the gauge), and `issue-587-quad-shape.test.ts` asserts
 * that agreement rather than leaving it to inspection.
 *
 * Only proven M1 drivers are used — `length-rel`, `cos-angle`, and `mutual-rel`+`parallel` — so every
 * set DRIVES a free figure and VERIFIES a determined one with no new solver work.
 *
 * The two ∥ families use `mutual-rel` rather than `cos-angle` with `cos = 1`: at cos = 1 the residual
 * sits at a maximum, so its derivative vanishes and the least-squares descent stalls (the ADR-3D-006
 * "signed component, never a magnitude" lesson; `mutualRels` emits signed components). `mutual-rel`
 * DRAWS its operands, which for a polygon's own sides is a no-op — asserted, not assumed.
 */
export function quadShapeConstraints(base: QuadBase, ring: Id[]): Command3[] {
  const [a, b, c, d] = ring;
  /** |xy| = |zw| — the equal-side driver. */
  const eq = (x: Id, y: Id, z: Id, w: Id): Command3 => ({ type: 'length-rel', a1: x, b1: y, rhs: { pair: [z, w] }, c: 1 });
  /** ∠xyz = 90°, stated at the MIDDLE letter like every other angle in this tree. */
  const right = (x: Id, y: Id, z: Id): Command3 => ({
    type: 'cos-angle', u: { kind: 'pair', from: y, to: x }, v: { kind: 'pair', from: y, to: z }, cos: 0,
  });
  /** xy ∥ zw. */
  const par = (x: Id, y: Id, z: Id, w: Id): Command3 => ({
    type: 'mutual-rel', rel: 'parallel', a: { kind: 'segment', a: x, b: y }, b: { kind: 'segment', a: z, b: w },
  });
  switch (base) {
    case 'square':
      return [eq(a, b, b, c), eq(b, c, c, d), eq(c, d, d, a), right(a, b, c)];
    case 'rectangle':
      return [right(d, a, b), right(a, b, c), right(b, c, d)];
    case 'rhombus':
      return [eq(a, b, b, c), eq(b, c, c, d), eq(c, d, d, a)];
    case 'parallelogram':
      return [par(a, b, d, c), par(a, d, b, c)];
    case 'kite':
      return [eq(a, b, a, d), eq(c, b, c, d)];
    case 'trapezoid':
      return [par(d, c, a, b)];
    case 'quad':
      return []; // a general quadrilateral states nothing beyond being one
  }
}

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
 * A ring's CIRCUMCENTRE — where a RIGHT pyramid's apex sits above (ADR-3D-090).
 *
 * «פירמידה ישרה» means all lateral edges are equal, i.e. the apex's foot is equidistant
 * from every base vertex — the base's circumcentre. That exists exactly when the base is
 * CYCLIC, which is why a right pyramid over a non-cyclic family carries the family's
 * `CYCLIC_FIX` constraint (see below): the solver drives the base cyclic, and this centre
 * becomes the true circumcentre.
 *
 * Computed as the algebraic (least-squares) circle fit — solve x²+y² = 2cx·x + 2cy·y + k
 * over the ring. EXACT for any triangle and for any cyclic ring; for a base the solver has
 * not yet driven cyclic it is the best-fit centre, which keeps the apex continuous (and
 * therefore the figure drawable and the residual differentiable) all the way to convergence.
 * This supersedes the old "centroid for a quad" placement, which gave unequal lateral edges
 * on every base but the square and the rectangle.
 */
export const ringCircumcentre = (ring: Pt2[]): Pt2 => ringCircumcentre2(ring);

// ---------------------------------------------------------------------------
// Rightness as a MODIFIER: what «ישרה» adds to a base that is not already cyclic
// ---------------------------------------------------------------------------

/**
 * The extra condition a base must satisfy for a RIGHT pyramid to stand on it — i.e. for it
 * to be CYCLIC (operator ruling, 2026-07-27, issue #305).
 *
 * A right pyramid over a non-cyclic base does not exist, but the honest response is NOT to
 * refuse: `דלתון` + `ישרה` jointly ENTAIL concyclicity, so the added constraint is a
 * consequence of two statements the student made, not an assumption the tool supplied
 * (the ADR-165 / ADR-123 precedent — allowed, with a notice). The base is constrained into
 * the cyclic member of its OWN family, never swapped for a different family, and the build
 * notice names what it became. Contradiction with a STATED value stays an honest
 * over-constraint refusal — the auto-fix consumes free DOFs only (ADR-052 / ADR-114).
 *
 * `vertex` indexes the base ring A→B→C→D.
 */
export type CyclicFix =
  | { kind: 'none' } // already cyclic at every seed
  | { kind: 'right-angle'; vertex: number } // the ring angle at this vertex is 90°
  | { kind: 'equal-legs' } // |AD| = |BC| — the trapezoid's legs
  | { kind: 'concyclic' }; // Ptolemy: |AC|·|BD| = |AB|·|CD| + |BC|·|AD|

/** What each base becomes under «ישרה», and the constraint that takes it there. */
export const CYCLIC_MEMBER: Record<QuadBase, { member: QuadBase; fix: CyclicFix }> = {
  square: { member: 'square', fix: { kind: 'none' } },
  rectangle: { member: 'rectangle', fix: { kind: 'none' } },
  // a cyclic rhombus is a SQUARE (∠DAB = 90° — its one free DOF is consumed)
  rhombus: { member: 'square', fix: { kind: 'right-angle', vertex: 0 } },
  // a cyclic parallelogram is a RECTANGLE (the angle is consumed; the aspect stays free)
  parallelogram: { member: 'rectangle', fix: { kind: 'right-angle', vertex: 0 } },
  // a cyclic kite is a RIGHT KITE — the two vertices off the symmetry axis are right angles
  kite: { member: 'kite', fix: { kind: 'right-angle', vertex: 1 } },
  // a cyclic trapezoid is an ISOSCELES trapezoid (equal legs)
  trapezoid: { member: 'trapezoid', fix: { kind: 'equal-legs' } },
  quad: { member: 'quad', fix: { kind: 'concyclic' } },
};

/** i18n key naming the shape a base becomes under «ישרה» (the build notice, ADR-3D-090). */
export const CYCLIC_MEMBER_NAME: Record<QuadBase, string> = {
  square: 'square',
  rectangle: 'rectangle',
  rhombus: 'square',
  parallelogram: 'rectangle',
  kite: 'rightKite',
  trapezoid: 'isoTrapezoid',
  quad: 'cyclicQuad',
};

// ---------------------------------------------------------------------------
// The quad-pyramid family: BASE × TOP, as one table
// ---------------------------------------------------------------------------

/**
 * Every 4-base pyramid kind, as (base shape, is the apex right-over-the-circumcentre).
 *
 * The five pre-#305 kinds are listed here too and are driven by the SAME composition —
 * their dims and coordinates come out bit-identical (base dims first, then the top's;
 * that is the order they were already written in), so the migration moves no figure.
 * That equivalence is the point: the general path SUBSUMES the special cases rather
 * than sitting beside them (the ADR-3D-069 lesson — a carve-out is what hides the gap).
 *
 * Unlike the pre-#305 model, a `right: true` entry exists for EVERY base: rightness is a
 * modifier of any base, not a property only some bases may carry (ADR-3D-090, the pyramid
 * twin of ADR-3D-089's obliqueness). The base's `CYCLIC_FIX` is what makes it true.
 */
export const QUAD_PYRAMIDS: Partial<Record<SolidKind, { base: QuadBase; right: boolean }>> = {
  // pre-#305 — behaviour-preserving
  pyramid4: { base: 'square', right: true },
  pyramid4g: { base: 'square', right: false },
  pyramid4r: { base: 'rectangle', right: true },
  pyramid4gr: { base: 'rectangle', right: false },
  pyramidPar: { base: 'parallelogram', right: false },
  // #305 / #341 / #358 — the bases and the right forms the pyramid family was missing
  pyramidParR: { base: 'parallelogram', right: true },
  pyramidRhomb: { base: 'rhombus', right: false },
  pyramidRhombR: { base: 'rhombus', right: true },
  pyramidKite: { base: 'kite', right: false },
  pyramidKiteR: { base: 'kite', right: true },
  pyramidTrap: { base: 'trapezoid', right: false },
  pyramidTrapR: { base: 'trapezoid', right: true },
  pyramidQuad: { base: 'quad', right: false },
  pyramidQuadR: { base: 'quad', right: true },
};

/** Is this kind a 4-base pyramid (any base × right/free apex)? The one predicate every
 *  hand-maintained "which kinds are quad pyramids" list in the engine now defers to. */
export const isQuadPyramid = (kind: SolidKind): boolean => Object.prototype.hasOwnProperty.call(QUAD_PYRAMIDS, kind);

/** A quad pyramid's dim count, derived from its base and top — never hand-counted. */
export function quadPyramidDimCount(kind: SolidKind): number | null {
  const spec = QUAD_PYRAMIDS[kind];
  return spec ? QUAD_BASE_DIMS[spec.base] + (spec.right ? 1 : 3) : null;
}

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
export function quadPyramidLayout(
  kind: SolidKind,
  dims: number[],
): { ring: Pt2[]; apex: { x: number; y: number; z: number } } | null {
  const spec = QUAD_PYRAMIDS[kind];
  if (!spec) return null;
  const nb = QUAD_BASE_DIMS[spec.base];
  const ring = quadBaseRing(spec.base, dims.slice(0, nb));
  const top = dims.slice(nb);
  if (spec.right) {
    const c = ringCircumcentre(ring); // equal lateral edges once the base is cyclic
    return { ring, apex: { x: c.x, y: c.y, z: top[0] } };
  }
  const [ax, ay, az] = top;
  return { ring, apex: { x: ax, y: ay, z: az } };
}
