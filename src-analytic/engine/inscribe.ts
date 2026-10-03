/**
 * A POLYGON INSCRIBED IN A TRIANGLE — WHICH SIDE EACH VERTEX RIDES (#1622, ADR-AG-217).
 *
 * «מעוין BDEF חסום במשולש ABC» · «מלבן DEFG חסום במשולש ABC». COPIED from 2-D's `src/engine/inscribe.ts`
 * ([ADR-262](../../docs/06-decisions.md#adr-262)) — never imported across trees (BOUNDARIES.json). 2-D's rules:
 *
 *  - a shape vertex whose LABEL is a container vertex (the `B` of rhombus `BDEF` in triangle `ABC`) IS that vertex;
 *  - every other vertex rides a container SIDE, laid around the boundary in the shape's cyclic order, monotone, a
 *    shared vertex anchoring the walk. What the labels do not pin — the mirror direction, and which side hosts the
 *    extra vertex when there are more vertices than sides — is a discrete freedom: 2-D cycles it as the inscribe's
 *    `variant`, analytic as a `choice` over the placements (02c R14: *"discrete ones cycle"*).
 *
 * Pure and deterministic: the placements, most canonical first. The lowering (`parseAnalytic`) turns each into the
 * incidences it states.
 */
import type { Id } from './types';

/** A shape vertex sits AT a container vertex (shared label) or ON a container side (a rider). */
export type Placement = { at: 'vertex'; v: Id } | { at: 'side'; a: Id; b: Id };

/** How to split `n` riders across `L` sides as evenly as possible — the first `n % L` sides host one extra. */
function evenCounts(n: number, L: number): number[] {
  if (L <= 0) return [];
  const base = Math.floor(n / L);
  const rem = n % L;
  return Array.from({ length: L }, (_, i) => base + (i < rem ? 1 : 0));
}

/** The container sides crossed from vertex index `va` to `vb` in `dir` (+1 / −1); the same vertex is the whole loop. */
function sidesBetween(container: readonly Id[], va: number, vb: number, dir: 1 | -1): [Id, Id][] {
  const m = container.length;
  const span = dir === 1 ? (((vb - va) % m) + m) % m : (((va - vb) % m) + m) % m;
  const count = span === 0 ? m : span;
  const out: [Id, Id][] = [];
  for (let s = 0; s < count; s += 1) {
    const j = dir === 1 ? (((va + s) % m) + m) % m : (((va - 1 - s) % m) + m) % m;
    const from = container[j];
    const to = container[(j + 1) % m];
    out.push(dir === 1 ? [from, to] : [to, from]);
  }
  return out;
}

/** One (direction, rotation) candidate's placement of every shape vertex — null when the container has no room. */
function assignFor(ids: readonly Id[], container: readonly Id[], dir: 1 | -1, rotation: number): Placement[] | null {
  const k = ids.length;
  const idx = new Map(container.map((c, i) => [c, i]));
  const anchors = ids
    .map((lbl, i) => (idx.has(lbl) ? { i, v: idx.get(lbl)! } : null))
    .filter((x): x is { i: number; v: number } => x !== null);
  const place: (Placement | null)[] = ids.map(() => null);
  const fill = (riders: number[], sides: [Id, Id][]): boolean => {
    if (riders.length === 0) return true;
    if (sides.length === 0) return false;
    const counts = evenCounts(riders.length, sides.length);
    let r = 0;
    for (let s = 0; s < sides.length; s += 1) {
      for (let c = 0; c < counts[s]; c += 1) place[riders[r++]] = { at: 'side', a: sides[s][0], b: sides[s][1] };
    }
    return true;
  };
  if (anchors.length === 0) {
    const startV = ((rotation % container.length) + container.length) % container.length;
    if (!fill(ids.map((_, i) => i), sidesBetween(container, startV, startV, dir))) return null;
  } else {
    for (const a of anchors) place[a.i] = { at: 'vertex', v: container[a.v] };
    for (let ai = 0; ai < anchors.length; ai += 1) {
      const a = anchors[ai];
      const b = anchors[(ai + 1) % anchors.length];
      const riders: number[] = [];
      for (let step = 1; step < k; step += 1) {
        const i = (a.i + step) % k;
        if (i === b.i) break;
        riders.push(i);
      }
      if (!fill(riders, sidesBetween(container, a.v, b.v, dir))) return null;
    }
  }
  return place.some((p) => p === null) ? null : (place as Placement[]);
}

/** Every DISTINCT placement — the discrete configurations — most canonical first (2-D's `inscribePlacements`). */
export function inscribePlacements(ids: readonly Id[], container: readonly Id[]): Placement[][] {
  const idx = new Set(container);
  const rotations = ids.some((l) => idx.has(l)) ? [0] : container.map((_, i) => i);
  const seen = new Set<string>();
  const out: Placement[][] = [];
  for (const dir of [1, -1] as const) {
    for (const rot of rotations) {
      const p = assignFor(ids, container, dir, rot);
      if (!p) continue;
      const key = p.map((q) => (q.at === 'vertex' ? `@${q.v}` : `${q.a}-${q.b}`)).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}
