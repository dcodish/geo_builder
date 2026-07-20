/**
 * A polygon INSCRIBED IN ANOTHER POLYGON ([ADR-262](docs/06-decisions.md#adr-262)).
 *
 * "מעוין BDEF חסום במשולש ABC" / "rectangle inscribed in triangle ABC": the inscribed shape's vertices ride
 * the boundary of a container polygon, and the shape's defining relations (equal sides / right angles) flex
 * them into shape. Like the ADR-110 named-shape macros this needs NO new engine construct — it lowers to
 * `point-on-segment` riders + `set-equal`/`set-perpendicular` constraints and lets the solver do the work.
 *
 * The hard part is PLACEMENT: which container side each shape vertex rides. Two rules make it deterministic
 * where the labels pin it and cyclable where they don't ([ADR-052](docs/06-decisions.md#adr-052) / design-rules
 * M4):
 *  - A shape vertex whose LABEL is shared with the container (the `B` in rhombus `BDEF` ∩ triangle `ABC`)
 *    coincides with that container vertex — same id, no rider (M1 reuse).
 *  - Every other shape vertex rides a container SIDE. Vertices are laid around the boundary in the shape's
 *    cyclic order, monotone; a shared vertex anchors the walk. What the labels do NOT pin — the mirror
 *    DIRECTION, and (when there are more vertices than sides) which side hosts the extra — becomes the
 *    cyclable `variant` ("show another configuration" steps it); an explicit `point-on-segment` given on a
 *    shape vertex PINS the matching variant.
 *
 * Pure and deterministic. `expandInscribe` is the expansion (shared by `lowerOne` and `replay`);
 * `inscribeVariantCount` drives the cycle.
 */

import type { Command, Id } from './types';

export type InscribeShape = 'rhombus' | 'rectangle' | 'square' | 'parallelogram';

export interface InscribeCmd {
  shape: InscribeShape;
  ids: Id[];
  container: Id[];
  variant: number;
}

/** A shape vertex sits either AT a container vertex (shared label) or ON a container side (a rider). */
type Placement = { at: 'vertex'; v: Id } | { at: 'side'; a: Id; b: Id };

/** How to split `n` riders across `L` container sides, as evenly as possible: the first `n % L` sides host
 *  one extra. (`n < L` leaves some sides empty — allowed; `n > L` gives a "base" side of 2, the rectangle
 *  case.) */
function evenCounts(n: number, L: number): number[] {
  if (L <= 0) return [];
  const base = Math.floor(n / L);
  const rem = n % L;
  return Array.from({ length: L }, (_, i) => base + (i < rem ? 1 : 0));
}

/** The container sides crossed going from vertex index `va` to `vb` in `dir` (+1 CCW / −1 CW), as ordered
 *  `[from,to]` endpoint pairs. Side `j` joins container vertex `j`→`j+1`. Same vertex ⇒ the whole loop. */
function sidesBetween(container: Id[], va: number, vb: number, dir: 1 | -1): [Id, Id][] {
  const m = container.length;
  const span = dir === 1 ? (((vb - va) % m) + m) % m : (((va - vb) % m) + m) % m;
  const count = span === 0 ? m : span; // one anchor (va==vb) ⇒ the full boundary
  const out: [Id, Id][] = [];
  for (let s = 0; s < count; s++) {
    // dir +1: side leaving va then advancing; dir −1: side arriving at va then retreating.
    const j = dir === 1 ? (((va + s) % m) + m) % m : (((va - 1 - s) % m) + m) % m;
    const from = container[j];
    const to = container[(j + 1) % m];
    out.push(dir === 1 ? [from, to] : [to, from]);
  }
  return out;
}

/** Assign each shape vertex a {@link Placement} for one (direction, rotation) candidate — or null if the
 *  container has no room for the riders between two anchors. */
function assignFor(ids: Id[], container: Id[], dir: 1 | -1, rotation: number): Placement[] | null {
  const k = ids.length;
  const idx = new Map(container.map((c, i) => [c, i]));
  const anchors = ids.map((lbl, i) => (idx.has(lbl) ? { i, v: idx.get(lbl)! } : null)).filter((x): x is { i: number; v: number } => x != null);
  const place: (Placement | null)[] = ids.map(() => null);

  const fill = (riderShapeIdxs: number[], sides: [Id, Id][]): boolean => {
    const n = riderShapeIdxs.length;
    if (n === 0) return true;
    if (sides.length === 0) return false;
    const counts = evenCounts(n, sides.length);
    let r = 0;
    for (let s = 0; s < sides.length; s++) {
      for (let c = 0; c < counts[s]; c++) {
        place[riderShapeIdxs[r++]] = { at: 'side', a: sides[s][0], b: sides[s][1] };
      }
    }
    return true;
  };

  if (anchors.length === 0) {
    // No shared label: the whole shape rides sides. `rotation` chooses which side the walk starts on, so the
    // "extra" (rectangle base) side cycles; `dir` mirrors.
    const startV = ((rotation % container.length) + container.length) % container.length;
    const sides = sidesBetween(container, startV, startV, dir); // full loop
    if (!fill(ids.map((_, i) => i), sides)) return null;
  } else {
    // Anchor the walk at each shared vertex; distribute the riders in each shape-arc between consecutive
    // anchors onto the container sides between their vertices (same direction).
    for (const a of anchors) place[a.i] = { at: 'vertex', v: container[a.v] };
    for (let ai = 0; ai < anchors.length; ai++) {
      const a = anchors[ai];
      const b = anchors[(ai + 1) % anchors.length];
      // shape indices strictly between a.i and b.i, cyclically
      const riders: number[] = [];
      for (let step = 1; step < k; step++) {
        const i = (a.i + step) % k;
        if (i === b.i) break;
        riders.push(i);
      }
      const sides = sidesBetween(container, a.v, b.v, dir);
      if (!fill(riders, sides)) return null;
    }
  }
  if (place.some((p) => p == null)) return null;
  return place as Placement[];
}

/** A stable key for an assignment, so mirror/rotation candidates that yield the SAME side map dedupe. */
function assignKey(place: Placement[]): string {
  return place.map((p) => (p.at === 'vertex' ? `@${p.v}` : `${p.a}-${p.b}`)).join('|');
}

/** All DISTINCT inscribe placements (the cyclable variants), most-canonical first. */
export function inscribePlacements(ids: Id[], container: Id[]): Placement[][] {
  const idx = new Map(container.map((c, i) => [c, i]));
  const hasShared = ids.some((l) => idx.has(l));
  const dirs: (1 | -1)[] = [1, -1];
  const rotations = hasShared ? [0] : container.map((_, i) => i);
  const seen = new Set<string>();
  const out: Placement[][] = [];
  for (const dir of dirs) {
    for (const rot of rotations) {
      const p = assignFor(ids, container, dir, rot);
      if (!p) continue;
      const key = assignKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** How many distinct configurations "show another configuration" cycles for this inscribe (≥1). */
export function inscribeVariantCount(cmd: InscribeCmd): number {
  return Math.max(1, inscribePlacements(cmd.ids, cmd.container).length);
}

/** The shape's defining constraints on its placed vertices (cyclic order `ids`).
 *  EXPORTED as the one authority for "what does this shape word assert" (M1, #223/ADR-375): the inscribe
 *  expansion and the apply-boundary lowering of a shape command over EXISTING points both read it, so the
 *  two can never drift. `trapezoid` exists for the M1 lowering only (not an inscribe shape — inscribing a
 *  trapezoid is under-determined); its single assertion is the one parallel pair (ADR-052: no more). */
export function shapeConstraints(shape: InscribeShape | 'trapezoid', ids: Id[]): Command[] {
  const n = ids.length;
  const side = (i: number): [Id, Id] => [ids[i % n], ids[(i + 1) % n]];
  const equalAdjacent: Command[] = Array.from({ length: n - 1 }, (_, i) => {
    const [a, b] = side(i);
    const [c, d] = side(i + 1);
    return { type: 'set-equal', a, b, c, d } as Command; // |sᵢsᵢ₊₁| = |sᵢ₊₁sᵢ₊₂|
  });
  const oppositeEqual: Command[] = [
    { type: 'set-equal', a: side(0)[0], b: side(0)[1], c: side(2)[0], d: side(2)[1] }, // |s0s1| = |s2s3|
    { type: 'set-equal', a: side(1)[0], b: side(1)[1], c: side(3)[0], d: side(3)[1] }, // |s1s2| = |s3s0|
  ];
  const rightAt = (i: number): Command => {
    const [p, v] = side(i - 1 < 0 ? n - 1 : i - 1); // incoming side …→sᵢ
    const [, q] = side(i); // outgoing side sᵢ→…
    return { type: 'set-perpendicular', a: p, b: v, c: v, d: q } as Command; // right angle at sᵢ
  };
  switch (shape) {
    case 'rhombus':
      return equalAdjacent; // all four sides equal
    case 'square':
      return [...equalAdjacent, rightAt(0)]; // rhombus + one right angle
    case 'rectangle':
      return [rightAt(0), rightAt(1), rightAt(2)]; // three right angles ⇒ the fourth too
    case 'parallelogram':
      return oppositeEqual;
    case 'trapezoid':
      // AB ∥ DC (side 0 ∥ side 2) — the ONE relation the word asserts (ADR-052: leg lengths, the other
      // pair's non-parallelism, and all sizes stay unstated).
      return [{ type: 'set-parallel', a: side(0)[0], b: side(0)[1], c: side(2)[0], d: side(2)[1] } as Command];
  }
}

/**
 * Expand an `inscribe` command into engine commands: a `point-on-segment` rider for every non-shared shape
 * vertex (per the chosen variant's side map) plus the shape's defining constraints. Shared vertices reuse
 * the container vertex (same id) and get no rider. When `explicitOnSegs` name a shape vertex on a specific
 * side, the variant whose placement AGREES is chosen (an explicit given PINS the soft default, M4); else
 * `cmd.variant` selects.
 */
export function expandInscribe(
  cmd: InscribeCmd,
  explicitOnSegs: { id: Id; a: Id; b: Id }[] = [],
): Command[] {
  const variants = inscribePlacements(cmd.ids, cmd.container);
  if (variants.length === 0) return []; // no valid placement (e.g. an impossible container) — nothing to add
  const norm = (v: number) => ((v % variants.length) + variants.length) % variants.length;
  let chosen = norm(cmd.variant);
  // An explicit on-segment given on a shape vertex pins the matching variant.
  const sideEq = (p: Placement, os: { a: Id; b: Id }) =>
    p.at === 'side' && ((p.a === os.a && p.b === os.b) || (p.a === os.b && p.b === os.a));
  for (let v = 0; v < variants.length; v++) {
    const place = variants[v];
    const agrees = explicitOnSegs.some((os) => {
      const i = cmd.ids.indexOf(os.id);
      return i >= 0 && sideEq(place[i], os);
    });
    if (agrees) {
      chosen = v;
      break;
    }
  }
  const place = variants[chosen];
  const riders: Command[] = [];
  place.forEach((p, i) => {
    if (p.at === 'side') riders.push({ type: 'point-on-segment', id: cmd.ids[i], a: p.a, b: p.b });
  });
  // Riders create the non-shared vertices → the `polygon` DRAWS the inscribed shape's boundary and creates its
  // polygon object (so it renders, is detected as a shape, and its sides are reportable segments) → then the
  // shape's defining constraints flex the vertices into shape.
  const draw: Command = { type: 'polygon', ids: [...cmd.ids] };
  return [...riders, draw, ...shapeConstraints(cmd.shape, cmd.ids)];
}
