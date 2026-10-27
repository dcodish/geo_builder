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
  return directedPlacements(ids, container).map((d) => d.place);
}

/** The placements with the walk DIRECTION each was laid in: +1 walks the container's own vertex order, so the inner
 *  ring turns the way the container turns; −1 walks it backwards, so the inner ring turns the other way. */
function directedPlacements(ids: Id[], container: Id[]): { place: Placement[]; dir: 1 | -1 }[] {
  const idx = new Map(container.map((c, i) => [c, i]));
  const hasShared = ids.some((l) => idx.has(l));
  const dirs: (1 | -1)[] = [1, -1];
  const rotations = hasShared ? [0] : container.map((_, i) => i);
  const seen = new Set<string>();
  const out: { place: Placement[]; dir: 1 | -1 }[] = [];
  for (const dir of dirs) {
    for (const rot of rotations) {
      const p = assignFor(ids, container, dir, rot);
      if (!p) continue;
      const key = assignKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ place: p, dir });
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
 *  trapezoid is under-determined); its single assertion is the one parallel pair (ADR-052: no more).
 *
 *  `onOneCircle` ([ADR-628](../../docs/06-decisions.md#adr-628), #1913): the ring is ALREADY structurally on one
 *  circle (`ringOnOneCircle`), so a parallelogram-family noun lowers to the member the circle FORCES — a cyclic
 *  parallelogram is exactly the rectangle, a cyclic rhombus (and square) exactly the square. The family's
 *  general relations are weaker than the cyclic member's definition: on a circle their solution set admits the
 *  crossed antiparallelogram (`oppositeEqual`), and misses the forced member whenever it needs the radius to move
 *  (`equalAdjacent` on four riders, which the joint optimizer neither finds nor refutes). Three consecutive right
 *  angles have neither a crossed root (they force both parallel pairs) nor a collapsed one (a perpendicularity is
 *  NaN on a zero side), and each has a closed-form 1-D root for its on-circle carrier. The rectangle and the
 *  trapezoid are untouched; off a circle every shape lowers exactly as before. */
export function shapeConstraints(shape: InscribeShape | 'trapezoid', ids: Id[], onOneCircle = false): Command[] {
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
  const rectangle: Command[] = [rightAt(0), rightAt(1), rightAt(2)]; // three right angles ⇒ the fourth too
  switch (shape) {
    case 'rhombus':
      return onOneCircle ? [...rectangle, equalAdjacent[0]] : equalAdjacent; // all four sides equal; on a circle: the square
    case 'square':
      return onOneCircle ? [...rectangle, equalAdjacent[0]] : [...equalAdjacent, rightAt(0)]; // rhombus + one right angle
    case 'rectangle':
      return rectangle;
    case 'parallelogram':
      return onOneCircle ? rectangle : oppositeEqual; // on a circle: the rectangle
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
  drawn?: ReadonlySet<Id>,
  turn?: 1 | -1,
): Command[] {
  // #2257 (ADR-767): `turn` — the drawn inner ring already turns one way (+1 the container's way, −1 the other), so
  // only the placements walked in that direction can hold it; the cyclable variants are those. Absent: every placement.
  const directed = directedPlacements(cmd.ids, cmd.container);
  const kept = turn === undefined ? directed : directed.filter((d) => d.dir === turn);
  const variants = (kept.length ? kept : directed).map((d) => d.place);
  if (variants.length === 0) return []; // no valid placement (e.g. an impossible container) — nothing to add
  const place = variants[inscribeVariantIndex(cmd, explicitOnSegs, variants)];
  const riders: Command[] = [];
  place.forEach((p, i) => {
    if (p.at === 'side') riders.push({ type: 'point-on-segment', id: cmd.ids[i], a: p.a, b: p.b });
  });
  // #2257 ([ADR-767](../../docs/06-decisions.md#adr-767)) — THE INNER SHAPE IS ALREADY DRAWN: the inscription is a
  // statement ABOUT it, never a re-creation (M1, the polygon-container twin of ADR-753's circle). Each drawn vertex
  // takes its side membership through the existing M1 paths (a free carrier becomes a rider on the side, ADR-384; any
  // other vertex is constrained onto it), and the noun is stated over the drawn vertices as its own shape command —
  // apply's one lowering of a shape over existing points: a restatement of the ring it already is (ADR-711), a
  // refinement of a general ring (ADR-656), or the shape's constraints over loose points (ADR-375). No `polygon` is
  // re-declared over a drawn ring, so the «already defined» re-creation is gone.
  if (drawn && innerDrawn(cmd, drawn)) return [...riders, { type: cmd.shape, ids: [...cmd.ids] } as Command];
  // Riders create the non-shared vertices → the `polygon` DRAWS the inscribed shape's boundary and creates its
  // polygon object (so it renders, is detected as a shape, and its sides are reportable segments) → then the
  // shape's defining constraints flex the vertices into shape.
  const draw: Command = { type: 'polygon', ids: [...cmd.ids] };
  return [...riders, draw, ...shapeConstraints(cmd.shape, cmd.ids)];
}

/** #2257 (ADR-767): every inner vertex that rides a container side is already a point of the figure (`drawn`) — the
 *  inscription is then about the drawn shape. A vertex shared with the container is the container's own (ADR-262). */
export function innerDrawn(cmd: Pick<InscribeCmd, 'ids' | 'container'>, drawn: ReadonlySet<Id>): boolean {
  const riders = cmd.ids.filter((id) => !cmd.container.includes(id));
  return riders.length > 0 && riders.every((id) => drawn.has(id));
}

/** The placement `expandInscribe` takes: an explicit on-segment given on a shape vertex pins the matching variant
 *  (M4), else `cmd.variant` selects. */
function inscribeVariantIndex(cmd: InscribeCmd, explicitOnSegs: { id: Id; a: Id; b: Id }[], variants: Placement[][]): number {
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
  return chosen;
}

/**
 * #1921 ([ADR-657](../../docs/06-decisions.md#adr-657)) — A KITE WHOSE FOUR VERTICES ARE ALREADY ON ONE CIRCLE IS THE
 * RIGHT KITE, lowered as its definition: ADR-628's rule for the parallelogram family (`shapeConstraints`'s
 * `onOneCircle`), for the kite.
 *
 * A cyclic kite has a right angle at each off-axis vertex (its axis is a diameter) and its axis is the
 * perpendicular bisector of the other diagonal. Its two equal adjacent pairs are weaker on a circle: they need the
 * radius to move to the one value the stated sides allow, which the joint optimizer neither found nor refuted —
 * «מעגל O · A, B, C ו-D על המעגל · AB = 3 · BC = 4 · דלתון ABCD» was refused as over-constrained after ≈17 s although
 * the right kite fits. So the two pairs are replaced by the right kite's definition: the right angle at one off-axis
 * vertex (the axis on a diameter — each root closed-form on a circle rider, as ADR-628's right angles) and the axis
 * perpendicular to the other diagonal (the figure symmetric about it, so both pairs hold). The plan's "right angle +
 * the first pair" was measured first and refused: the pair's circle root includes the coincident one (D on B).
 *
 * `cmds` is the kite's expansion (`expandShapeVariant`): the base `quadrilateral` declared «דלתון» and the pairs it
 * emits — a pair the student stated EXPLICITLY is not among them, and then the expansion is returned unchanged
 * (the stated pair is a given of its own; replacing around it would state the right kite twice).
 */
export function cyclicKiteCommands(cmds: readonly Command[]): Command[] {
  const base = cmds.find((c): c is Extract<Command, { type: 'quadrilateral' }> => c.type === 'quadrilateral' && c.declaredAs === 'kite');
  const eqs = cmds.filter((c): c is Extract<Command, { type: 'set-equal' }> => c.type === 'set-equal');
  if (!base || eqs.length !== 2) return [...cmds];
  const ring = base.ids;
  const apex = [eqs[0].a, eqs[0].b].find((p) => p === eqs[0].c || p === eqs[0].d);
  const i = apex === undefined ? -1 : ring.indexOf(apex);
  if (i < 0) return [...cmds];
  const [p, q] = [ring[i], ring[(i + 2) % 4]]; // the axis
  const k = (i + 1) % 4; // an off-axis vertex
  const right: Command = { type: 'set-perpendicular', a: ring[(k + 3) % 4], b: ring[k], c: ring[k], d: ring[(k + 1) % 4] };
  const axisPerp: Command = { type: 'set-perpendicular', a: p, b: q, c: ring[k], d: ring[(k + 2) % 4] };
  return [...cmds.filter((c) => c.type !== 'set-equal'), right, axisPerp];
}
