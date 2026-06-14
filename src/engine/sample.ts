/**
 * Seeded sampling of a figure's residual freedom (ADR-018 Stage 1).
 *
 * An underdetermined figure has degrees of freedom the student hasn't fixed yet
 * — a shape's defaulted base vertices. "Show another configuration" should draw
 * a *different valid* figure each time, so the student sees "not yet determined"
 * as the figure wanders, and "determined" when it stops (every point pinned or
 * derived). This perturbs only the **non-pinned free points** (a seeded rotation
 * of the free cluster + independent per-point jitter); derived points recompute
 * from their moved parents, so every shape stays structurally valid (a square is
 * still a square — its corners are derived from the base). Pinned points
 * (explicit "point A at …") never move, so freedom shrinks as facts accumulate.
 *
 * Deterministic: the same (construction, seed) always yields the same figure, so
 * replay/undo stay consistent and it is unit-testable. seed 0 = the canonical
 * default (returns the construction unchanged).
 */

import type { Construction, FreePoint, Id, OnCirclePoint } from './types';

/** A free on-circle vertex the sampler may slide (an arbitrary-angle vertex, not driven/fixed). */
const isFreeOnCircle = (o: { kind: string; free?: boolean; solve?: unknown }): boolean =>
  o.kind === 'on-circle' && !!o.free && o.solve === undefined;

/** mulberry32 — a tiny deterministic PRNG in [0, 1). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string → a 32-bit seed, so each point jitters independently. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Return a construction with its non-pinned free points perturbed by `seed`.
 * seed 0 returns the input unchanged (the canonical figure). The perturbation
 * keeps every shape valid (only free *parents* move; derived points follow).
 */
export function applySeed(c: Construction, seed: number): Construction {
  if (!seed) return c;
  const free = c.objects.filter((o): o is FreePoint => o.kind === 'free-point' && !o.pinned);
  const freeCircle = c.objects.filter((o): o is OnCirclePoint => isFreeOnCircle(o));
  const freeShape = c.objects.some(
    (o) => (o.kind === 'rotated' || o.kind === 'perp-offset' || o.kind === 'scaled-offset') && (o as { solve?: unknown }).solve === undefined,
  );
  if (free.length === 0 && freeCircle.length === 0 && !freeShape) return c; // fully determined → nothing to sample

  // Free-point cluster: seeded spin about its centroid + per-point jitter.
  const cx = free.length ? free.reduce((s, p) => s + p.x, 0) / free.length : 0;
  const cy = free.length ? free.reduce((s, p) => s + p.y, 0) / free.length : 0;
  let span = 1;
  for (const p of free) span = Math.max(span, Math.abs(p.x - cx) * 2, Math.abs(p.y - cy) * 2);
  const jit = span * 0.22;
  const theta = (mulberry32((seed * 2654435761) >>> 0)() * 2 - 1) * Math.PI; // ±180° spin of the free cluster
  const ct = Math.cos(theta);
  const st = Math.sin(theta);

  // Free on-circle vertices: a SHARED seeded rotation (preserves their spread, so
  // the inscribed shape never collapses to a sliver) + a small independent jitter
  // for genuine variety. ±180° independent jitter would cluster vertices.
  const circSpin = (mulberry32((seed * 0x9e3779b1) >>> 0)() * 2 - 1) * Math.PI;
  const circJit = Math.PI / 6; // ±30° per-vertex

  const objects = c.objects.map((o) => {
    if (o.kind === 'free-point' && !o.pinned) {
      const dx = o.x - cx;
      const dy = o.y - cy;
      const rx = cx + (dx * ct - dy * st);
      const ry = cy + (dx * st + dy * ct);
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, x: rx + (jr() * 2 - 1) * jit, y: ry + (jr() * 2 - 1) * jit };
    }
    // Free on-circle vertex: shared rotation keeps the vertices spread (a valid,
    // non-degenerate inscribed figure); small jitter varies its shape.
    if (isFreeOnCircle(o)) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, theta: (o as OnCirclePoint).theta + circSpin + (jr() * 2 - 1) * circJit };
    }
    // Free SHAPE-PARAMETER DOFs (ADR-033) — a rhombus's angle, a rectangle/right-triangle's
    // offset, a trapezoid's top ratio. Varying these lets "show another configuration" reach a
    // genuinely different SHAPE (e.g. an obtuse-angled rhombus), not just jiggled points. Skipped
    // when the scalar is driven by a constraint (solve set) — that shape is already pinned.
    if (o.kind === 'rotated' && o.solve === undefined) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, angleDeg: 40 + jr() * 100 }; // ∠ ∈ [40°, 140°] — acute OR obtuse at the pivot
    }
    if (o.kind === 'perp-offset' && o.solve === undefined) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, dist: o.dist * (0.55 + jr() * 1.3) }; // 0.55×–1.85× the default extent
    }
    if (o.kind === 'scaled-offset' && o.solve === undefined) {
      const jr = mulberry32((seed ^ hashId(o.id)) >>> 0);
      return { ...o, k: 0.3 + jr() * 0.55 }; // a trapezoid's top:base ratio ∈ [0.3, 0.85]
    }
    return o;
  });
  return { ...c, objects };
}

/** The ids of the figure's free DOFs (non-pinned free points, free on-circle vertices, free shape scalars). */
export function freeDofs(c: Construction): Id[] {
  return c.objects
    .filter(
      (o) =>
        (o.kind === 'free-point' && !o.pinned) ||
        isFreeOnCircle(o) ||
        ((o.kind === 'rotated' || o.kind === 'perp-offset' || o.kind === 'scaled-offset') && (o as { solve?: unknown }).solve === undefined),
    )
    .map((o) => o.id);
}
