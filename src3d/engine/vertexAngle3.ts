/**
 * #1942 ([ADR-3D-367](../../docs/06b-decisions-3d.md#adr-3d-367)) — WHICH ANGLE A LONE VERTEX NAMES, in 3-D.
 *
 * The one resolver behind «AD חוצה זווית A» (and the place #2060's single-letter value lane reuses). It is 2-D's
 * `resolveVertexAngle` (ADR-590, operator ruling 2026-09-27) read over the 3-D construction:
 *  1. **Exactly one angle at V** — the two edges that meet there (ADR-3D-239, #866, unchanged).
 *  2. **V is a vertex of exactly ONE polygon** of the figure — that polygon's interior angle, its two ring
 *     neighbours: in △ABC, ∠A means ∠CAB however many cevians leave A (the bagrut convention). The reading
 *     is said aloud (`readAs`), never a silent pick — the store surfaces 2-D's «הובן כ-∠CAB» note.
 *  3. **Otherwise** the honest ambiguity, listing every pair of edges at V (#866's candidates).
 *
 * "A polygon of the figure" is a declared flat polygon's ring, or a face of a declared solid, deduplicated by
 * vertex set — so a vertex of a cube, a prism or a pyramid (three or more faces) stays ambiguous, exactly as
 * before, and a triangle stated twice is one triangle. Structural only: never coordinates.
 */
import { FLAT_SOLID_KINDS } from './solve3';
import type { Construction3, Id } from './types';

export type VertexAngle3 =
  | { readonly kind: 'one'; readonly angle: string }
  | { readonly kind: 'polygon'; readonly angle: string }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] };

/** Every unordered pair of distinct neighbours of `v` (segments and solid faces), as three-letter angles. */
export function angleCandidates3(c: Construction3, v: Id): string[] {
  const nb = new Set<string>();
  for (const [a, b] of c.segments) {
    if (a === v) nb.add(b);
    else if (b === v) nb.add(a);
  }
  for (const s of c.solids) for (const f of s.faces) for (let i = 0; i < f.length; i++) {
    const [x, y] = [f[i], f[(i + 1) % f.length]];
    if (x === v) nb.add(y);
    else if (y === v) nb.add(x);
  }
  const ids = [...nb].sort();
  if (ids.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(`${ids[i]}${v}${ids[j]}`);
  return out;
}

/** The polygons of the figure that have `v` as a vertex: flat rings and solid faces, one per vertex set. */
function polygonsAt3(c: Construction3, v: Id): Id[][] {
  const rings = new Map<string, Id[]>();
  for (const s of c.solids) {
    for (const ring of FLAT_SOLID_KINDS.has(s.kind) ? [s.ids] : s.faces) {
      if (!ring.includes(v)) continue;
      const key = [...ring].sort().join(',');
      if (!rings.has(key)) rings.set(key, [...ring]);
    }
  }
  return [...rings.values()];
}

/**
 * The angle «זווית V» names. `exclude` holds the letters the sentence itself uses as an arm — a bisector's own
 * foot — so a ring neighbour that IS that letter never makes the polygon reading (the angle it would bisect
 * would have the bisector as an arm).
 */
export function vertexAngleAt3(c: Construction3, v: Id, exclude: readonly Id[] = []): VertexAngle3 {
  const candidates = angleCandidates3(c, v);
  if (candidates.length === 1) return { kind: 'one', angle: candidates[0] };
  const rings = polygonsAt3(c, v);
  if (rings.length === 1) {
    const ring = rings[0];
    const i = ring.indexOf(v);
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];
    if (prev !== next && !exclude.includes(prev) && !exclude.includes(next)) return { kind: 'polygon', angle: `${prev}${v}${next}` };
  }
  return { kind: 'ambiguous', candidates };
}
