/**
 * THEOREM_TABLE — the v1 (6a) matcher set: the circle block (the corpus's centre of gravity), the
 * tangent family, triangle-basics + isosceles + right-triangle, and the angle-pair backgrounds.
 * Each {@link TheoremDef} authors its own premise-side trigger (plan §3 D3 — authored, not computed
 * from premise-completeness).
 *
 * Statements (`en`/`he`) are copied VERBATIM from [07](docs/07-theorem-reference.md); a guard test
 * (`integrity.test.ts`) asserts byte-equality, so 07 stays the single source.
 *
 * Deliberately EXCLUDED from the 6a table (their premise is DERIVED, never given-announced in v1 — the
 * sharpest no-reveal cases): the SAS/SSS similarity criteria 68/70 and the bisector-ratio 76. Keeping them
 * out of the table makes every corpus `mustNotSurface` assertion hold structurally.
 *
 * ADR-220 (operator 2026-07-04) admits the AA-similarity 69 and its ratio corollary 71 as ENTAILED (L2)
 * help — a stated line PARALLEL to a triangle side structurally forces the cut-off triangle similar (AA),
 * so under the discovery dial the feed may name it above the default worksheet level (see
 * {@link similarityEvidence}). Their premise now has a coordinate-free structural source, so they are no
 * longer "derived-only"; the corpus stays green because Q5–Q7 have no parallels (the matcher never fires).
 */

import type { AnyCommand, Id } from '../engine/types';
import type { Fact } from '../store/geoStore';
import { commandPointIds } from '../store/geoStore';
import type { DiscoveryLevel, MatchCtx, TheoremDef, TheoremMatch } from './types';

// ---------- premise-scan helpers (symbolic; no coordinates) ----------

const cmdOf = (f: Fact): AnyCommand => f.cmd;
const factsWith = (ctx: MatchCtx, pred: (c: AnyCommand) => boolean): Fact[] => ctx.facts.filter((f) => pred(cmdOf(f)));

/** A value read as 90° from either a `set-angle` or a symbolic `measure-angle`. */
const isRightValue = (c: AnyCommand): boolean => {
  if (c.type === 'set-angle') return Math.abs(c.value - 90) < 1e-6;
  if (c.type === 'measure-angle') return 'value' in c.expr && Math.abs(c.expr.value - 90) < 1e-6;
  return false;
};

/** The circle (from ctx.circles) that contains every id in `ids` as a stated member, or null. */
function circleContaining(ctx: MatchCtx, ids: Id[]) {
  return ctx.circles.find((c) => ids.every((id) => c.members.includes(id))) ?? null;
}

/**
 * "Is the circle's CENTRE given?" — operator 2026-07-04 (ADR-210): a central-angle theorem (92/97/98/99)
 * surfaces only when the centre is a STATED object, i.e. the student either NAMED it ("circle O", so it
 * isn't auto-hidden) OR USED it (a segment/radius drawn to it ⇒ it is some point's neighbour). This
 * mirrors the renderer's show-centre rule (FR-RN-8, `scene.ts`) minus the display toggle. An inscribed
 * figure's implicit, unnamed circumscribing circle has no given centre, so the central-angle theorems
 * (which speak about the centre) stay silent for it.
 */
function centerGiven(ctx: MatchCtx, circle: { center: Id; autoCenter: boolean }): boolean {
  return !circle.autoCenter || (ctx.neighbors[circle.center]?.length ?? 0) > 0;
}

/** A circle with ≥`min` stated members whose CENTRE is given — the premise of the central-angle theorems. */
function circleWithGivenCenter(ctx: MatchCtx, min: number) {
  return ctx.circles.find((c) => c.members.length >= min && centerGiven(ctx, c)) ?? null;
}

/** Each stated/detected triangle's three vertex ids (premises that need a WHOLE triangle, not loose points).
 *  `stated` = a typed triangle command (Declared, L1) vs a detected/emergent one (Observed, L3) — ADR-219. */
function triangleVertexSets(ctx: MatchCtx): { ids: Id[]; stated: boolean }[] {
  const sets: { ids: Id[]; stated: boolean }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'triangle' || c.type === 'right-triangle') sets.push({ ids: [...c.ids], stated: true });
    else if (c.type === 'polygon' && c.ids.length === 3) sets.push({ ids: [...c.ids], stated: true });
  }
  for (const s of ctx.shapes) if (s.type.endsWith('triangle')) sets.push({ ids: [...s.vertices], stated: false });
  return sets;
}

/**
 * A circle that CIRCUMSCRIBES a stated/detected triangle (all three of some triangle's vertices are its
 * members) — the premise of 84/91 ("every triangle has a circumscribed circle"). Gating on a real
 * triangle, not a raw ≥3-concyclic-point count, is the operator's "no triangle ⇒ no triangle background"
 * rule (ADR-210): a cyclic quadrilateral has 4 concyclic points but no stated triangle, so 84/91 stay off.
 */
function circumTriangle(ctx: MatchCtx): { circleId: Id; center: Id; vertices: Id[]; level: DiscoveryLevel } | null {
  for (const v of triangleVertexSets(ctx)) {
    const circ = circleContaining(ctx, v.ids);
    if (circ) return { circleId: circ.id, center: circ.center, vertices: v.ids, level: v.stated ? 1 : 3 };
  }
  return null;
}

/**
 * Triangles FORMED BY DRAWN EDGES — every 3-cycle in the neighbour graph (`pointNeighbors`: segments +
 * polygon edges). Coordinate-free, so it counts at Declared level (every edge is a drawn object). This is
 * the general "a triangle is actually on the canvas" signal (ADR-220): the parallelogram-cut triangle FAB
 * (segments FA, FB + the parallelogram edge AB) is a 3-cycle even though no `triangle` command named it,
 * whereas a bare trapezoid/parallelogram is only a 4-cycle. Replaces the old KIND-whitelist for the
 * transversal test (the recurring "make it geometric, not a whitelist" fix, ADR-167). Each triple once.
 */
function structuralTriangles(ctx: MatchCtx): Id[][] {
  const nb = ctx.neighbors;
  const out: Id[][] = [];
  const seen = new Set<string>();
  for (const a of Object.keys(nb)) {
    const na = nb[a] ?? [];
    for (const b of na) {
      if (b <= a) continue;
      for (const c of na) {
        if (c <= b || !(nb[b] ?? []).includes(c)) continue;
        const key = [a, b, c].join('|');
        if (!seen.has(key)) { seen.add(key); out.push([a, b, c]); }
      }
    }
  }
  return out;
}

/**
 * A TRANSVERSAL crossing the stated parallels (premise of 4/6) — operator 2026-07-04 (ADR-210 + ADR-220):
 * an actual line cutting the two parallels, recognised STRUCTURALLY (coordinate-free): a stated/typed
 * triangle, an explicit `line` object, or a triangle FORMED BY DRAWN EDGES (a `structuralTriangles` 3-cycle
 * — the parallelogram-cut triangle FAB whose sides FA, FB cross the parallel base). A bare
 * trapezoid/parallelogram has no such triangle (its edges form only a 4-cycle) ⇒ 4/6 stay off, while the
 * co-interior sum (8) still surfaces on the parallels alone (a trapezoid leg IS its own same-side
 * transversal). `level` is Declared (1) for a stated/structural triangle (all its edges are drawn objects)
 * and Observed (3) when ONLY a coordinate-detected triangle supplies the cut (ADR-219).
 */
function transversalEvidence(ctx: MatchCtx): { present: boolean; level: DiscoveryLevel } {
  const typedTri = ctx.facts.some((f) => {
    const c = cmdOf(f);
    return c.type === 'triangle' || c.type === 'right-triangle' || (c.type === 'polygon' && c.ids.length === 3);
  });
  const lineObj = ctx.construction.objects.some((o) => o.kind === 'line');
  if (typedTri || lineObj || structuralTriangles(ctx).length > 0) return { present: true, level: 1 };
  if (ctx.shapes.some((s) => s.type.endsWith('triangle'))) return { present: true, level: 3 };
  return { present: false, level: 1 };
}

/**
 * SIMILAR TRIANGLES entailed by a line PARALLEL to a side of a triangle (Thales / AA — operator 2026-07-04,
 * ADR-220). Coordinate-free: a stated parallel pair (`parallelPairs`) one of whose edges is a SIDE of a
 * triangle in the figure (typed OR a drawn-edge 3-cycle), with the triangle's apex off the OTHER parallel —
 * the classic "a line parallel to one side cuts the other two", which forces the cut-off triangle similar
 * to the whole (AA). `level` is Entailed (2): the student never typed "similar", the construction
 * guarantees it. (A purely coordinate-observed similar pair — a non-parallel shared-angle config like Q6 —
 * would be Observed/L3; that path needs coordinates plumbed into the pure spine and is deferred, ADR-220.)
 */
function similarityEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
  const tris: Id[][] = [...triangleVertexSets(ctx).map((t) => t.ids), ...structuralTriangles(ctx)];
  if (!tris.length) return null;
  for (const { pair, fact } of parallelPairs(ctx)) {
    const [e1, e2] = pair;
    const trySide = (side: [Id, Id], other: [Id, Id], tri: Id[]) => {
      const [x, y] = side;
      if (!tri.includes(x) || !tri.includes(y)) return null;
      const apex = tri.find((v) => v !== x && v !== y);
      if (apex === undefined || apex === other[0] || apex === other[1]) return null;
      const facts = [fact, ...factsAmong(ctx, tri)];
      return { facts: [...new Map(facts.map((f) => [f.id, f])).values()], vertices: [...tri], level: 2 as DiscoveryLevel };
    };
    for (const tri of tris) {
      const hit = trySide(e1, e2, tri) ?? trySide(e2, e1, tri);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Facts that STATE a diameter, with the circle. Two lowered forms (both are the SAME premise):
 *  - a `diameter` command — "AB is a diameter of circle O" when A,B are fresh;
 *  - a `set-collinear` through the CENTRE — when A,B already lie on the circle, "AB is a diameter"
 *    lowers to "A, O, B collinear" (a chord through the centre IS a diameter). Recognising only the
 *    first form silently dropped the stated diameter of an inscribed figure (Q7).
 */
function statedDiameterFacts(ctx: MatchCtx): { fact: Fact; circleId: Id; ids: Id[] }[] {
  const out: { fact: Fact; circleId: Id; ids: Id[] }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'diameter') {
      out.push({ fact: f, circleId: c.circle, ids: [c.id1, c.id2] });
    } else if (c.type === 'set-collinear') {
      const pts = [c.a, c.b, c.c];
      for (const circ of ctx.circles) {
        if (!pts.includes(circ.center)) continue;
        const ends = pts.filter((p) => p !== circ.center);
        if (ends.length === 2 && ends.every((e) => circ.members.includes(e))) {
          out.push({ fact: f, circleId: circ.id, ids: ends });
          break;
        }
      }
    }
  }
  return out;
}

/** Facts stating a 90° INSCRIBED angle — vertex + both ray ends all on one circle. */
function rightInscribedFacts(ctx: MatchCtx): { fact: Fact; vertex: Id; ray1: Id; ray2: Id; circleId: Id }[] {
  const out: { fact: Fact; vertex: Id; ray1: Id; ray2: Id; circleId: Id }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (!isRightValue(c)) continue;
    if (c.type !== 'set-angle' && c.type !== 'measure-angle') continue;
    const { vertex, ray1, ray2 } = c;
    const circ = circleContaining(ctx, [vertex, ray1, ray2]);
    if (circ) out.push({ fact: f, vertex, ray1, ray2, circleId: circ.id });
  }
  return out;
}

/** The id of any command carrying `id === objId` — the fact that defined an object (for attribution). */
function definingFactIds(ctx: MatchCtx, objId: Id): string[] {
  return ctx.facts.filter((f) => 'id' in cmdOf(f) && (cmdOf(f) as { id: Id }).id === objId).map((f) => f.id);
}

/**
 * Tangencies grouped by circle, read from the structural {@link MatchCtx.tangents} (covers the `tangent`
 * command AND the Thales external-tangent construction). Each entry carries the tangency points and the
 * facts that defined them (for attribution).
 */
function tangentsByCircle(ctx: MatchCtx): Map<Id, { factIds: string[]; ats: Id[] }> {
  const byCircle = new Map<Id, { factIds: string[]; ats: Id[] }>();
  for (const t of ctx.tangents) {
    const e = byCircle.get(t.circle) ?? { factIds: [], ats: [] };
    e.ats.push(t.at);
    e.factIds.push(...definingFactIds(ctx, t.at));
    byCircle.set(t.circle, e);
  }
  return byCircle;
}

/** A stated triangle exists (a `triangle`/`right-triangle` command, a 3-vertex polygon, or a detected one).
 *  `level` is Declared (1) when a stated triangle contributed, else Observed (3) — an emergent triangle the
 *  coordinates revealed (ADR-219). */
function triangleFacts(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } {
  const facts = factsWith(ctx, (c) => c.type === 'triangle' || c.type === 'right-triangle' || (c.type === 'polygon' && c.ids.length === 3));
  const vertices = new Set<Id>();
  for (const f of facts) {
    const c = cmdOf(f);
    if (c.type === 'triangle' || c.type === 'right-triangle') c.ids.forEach((v) => vertices.add(v));
    else if (c.type === 'polygon') c.ids.forEach((v) => vertices.add(v));
  }
  // Emergent/detected triangles (plan §10 B1) also count.
  const detectedTri = ctx.shapes.filter((s) => s.type.endsWith('triangle'));
  return {
    facts,
    vertices: [...vertices, ...detectedTri.flatMap((s) => s.vertices)],
    level: facts.length ? 1 : 3,
  };
}

/** Is the segment x–y drawn (an edge of the neighbour graph)? A coordinate-free "this triangle/quad is
 *  actually on the canvas" gate — so a construction ENTAILMENT (§ radii below) only surfaces when the
 *  student drew the figure, never for every abstract pair a circle could form. */
const drawnEdge = (ctx: MatchCtx, x: Id, y: Id): boolean => (ctx.neighbors[x] ?? []).includes(y);

/** Every fact all of whose points lie within `verts` — the facts that BUILT this sub-figure (its sides,
 *  its defining circle, an equality among its vertices). Used for attribution + highlight of an entailed
 *  shape that no single command names (operator kite/isosceles-from-radii, ADR-218). */
function factsAmong(ctx: MatchCtx, verts: Id[]): Fact[] {
  const set = new Set(verts);
  return ctx.facts.filter((f) => {
    const pts = commandPointIds(cmdOf(f));
    return pts.length > 0 && pts.every((p) => set.has(p));
  });
}

/**
 * An isosceles-triangle premise — the three coordinate-free sources, unioned (a whole CLASS, not one
 * typed form; operator 2026-07-04, ADR-218):
 *  1. **Declared** — an explicit `set-equal` of two legs sharing an apex, or a `shape-variant 'isosceles'`.
 *  2. **Detected** — the shapes layer classified an iso/equilateral/right-iso triangle (stated or emergent).
 *  3. **Entailed by a circle** — two RADII to a drawn triangle: a circle's centre C and two of its members
 *     X,Y drawn as a triangle (all three sides present). |CX| = |CY| = r by the definition of a circle, so
 *     C-X-Y is isosceles with no equality ever typed — the construction already knows it (`ctx.circles`).
 *     This is what makes "two intersecting circles → OAB, PAB isosceles" surface without the student
 *     naming an equal-pair. Gated on the triangle being DRAWN so a circle with many members can't flood.
 */
function isoscelesEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
  const facts: Fact[] = [];
  const vertices = new Set<Id>();
  let declared = false; // (1) typed → Declared (L1)
  let entailed = false; // (3) circle radii → Entailed (L2)
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'set-equal') {
      // |ab| = |cd| with a shared endpoint ⇒ the apex — two equal legs of a triangle.
      const s1 = new Set([c.a, c.b]);
      if ([c.c, c.d].some((x) => s1.has(x))) {
        facts.push(f);
        [c.a, c.b, c.c, c.d].forEach((x) => vertices.add(x));
        declared = true;
      }
    } else if (c.type === 'shape-variant' && c.shape === 'isosceles') {
      facts.push(f);
      c.ids.forEach((x) => vertices.add(x));
      declared = true;
    }
  }
  // (3) Circle-radii entailment.
  for (const circ of ctx.circles) {
    const O = circ.center;
    const mem = circ.members;
    for (let i = 0; i < mem.length; i++)
      for (let j = i + 1; j < mem.length; j++) {
        const X = mem[i], Y = mem[j];
        if (drawnEdge(ctx, O, X) && drawnEdge(ctx, O, Y) && drawnEdge(ctx, X, Y)) {
          [O, X, Y].forEach((v) => vertices.add(v));
          facts.push(...factsAmong(ctx, [O, X, Y]));
          entailed = true;
        }
      }
  }
  const detectedIso = ctx.shapes.filter((s) => s.type === 'isosceles-triangle' || s.type === 'equilateral-triangle' || s.type === 'right-isosceles-triangle');
  detectedIso.forEach((s) => s.vertices.forEach((v) => vertices.add(v)));
  if (facts.length === 0 && detectedIso.length === 0 && vertices.size === 0) return null;
  // Strongest (lowest) contributing level: a typed equal-pair (Declared) beats a radii entailment
  // (Entailed) beats a purely-detected/emergent isosceles (Observed) — ADR-219.
  const level: DiscoveryLevel = declared ? 1 : entailed ? 2 : 3;
  return { facts: [...new Map(facts.map((f) => [f.id, f])).values()], vertices: [...vertices], level };
}

/**
 * A kite premise — DECLARED (`shape-variant 'kite'`) or ENTAILED by two circles (operator 2026-07-04,
 * ADR-218). Two circles sharing two points X,Y give |c1X|=|c1Y| and |c2X|=|c2Y| (two disjoint pairs of
 * equal adjacent sides) — the definition of a kite c1–X–c2–Y, whose axis is the line of centres. Gated on
 * the four kite SIDES being drawn, so it fires on the figure the student actually built (the classic kite
 * OAPB of two intersecting circles), coordinate-free — the kite-ness is a construction entailment, not a
 * measured coincidence.
 */
function kiteEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
  const facts: Fact[] = [];
  const vertices = new Set<Id>();
  let declared = false; // typed `דלתון` → Declared (L1)
  let entailed = false; // two intersecting circles → Entailed (L2)
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'shape-variant' && c.shape === 'kite') {
      facts.push(f);
      c.ids.forEach((x) => vertices.add(x));
      declared = true;
    }
  }
  const cs = ctx.circles;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const shared = cs[i].members.filter((m) => cs[j].members.includes(m));
      if (shared.length < 2) continue;
      const [X, Y] = shared;
      const c1 = cs[i].center, c2 = cs[j].center;
      if (c1 === c2 || [c1, c2].includes(X) || [c1, c2].includes(Y)) continue; // centres distinct from wings
      const sides: [Id, Id][] = [[c1, X], [c1, Y], [c2, X], [c2, Y]];
      if (sides.every(([a, b]) => drawnEdge(ctx, a, b))) {
        [c1, X, c2, Y].forEach((v) => vertices.add(v));
        facts.push(...factsAmong(ctx, [c1, c2, X, Y]));
        entailed = true;
      }
    }
  if (facts.length === 0 && vertices.size === 0) return null;
  const level: DiscoveryLevel = declared ? 1 : entailed ? 2 : 1;
  return { facts: [...new Map(facts.map((f) => [f.id, f])).values()], vertices: [...vertices], level };
}

/**
 * A stated right-angle premise (right-triangle, a 90° angle, a stated ⟂, or a dropped perpendicular
 * FOOT). A `foot` — a height/altitude (`DE גובה על AB`), or a tangency foot — is by definition the foot
 * of a perpendicular, so it creates a genuine right angle at that point and a right triangle with the
 * apex; recognising it lets Pythagoras (#28) surface when a student drops a height (operator 2026-07-04)
 * — the same footing as an explicit `set-perpendicular`, which already triggers #28 unconditionally.
 */
export function rightAngleFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => {
    if (c.type === 'right-triangle') return true;
    if (isRightValue(c)) return true;
    if (c.type === 'set-perpendicular' && !c.implicit) return true;
    if (c.type === 'foot') return true;
    return false;
  });
}


/** Two chords/segments cross at a stated point (a line-line / line-intersection object). */
function crossingFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => c.type === 'line-line-intersection' || c.type === 'line-intersection');
}

/** A stated collinear straight-line datum (linear-pair background). */
function collinearFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => c.type === 'set-line' || c.type === 'set-collinear' || (c.type === 'point-on-segment' && !!c.extension));
}

/** Stated quadrilaterals — a `quadrilateral` command, a 4-vertex `polygon`, or a 4-vertex
 *  `shape-variant` (a kite lowers to its variant macro, ADR-138; the QUAD is stated all the same —
 *  without this, "kite ABCD inscribed in circle O" stopped announcing 87 the moment the kite word
 *  started being honoured, ADR-236). */
function quadFacts(ctx: MatchCtx): { fact: Fact; vertices: Id[] }[] {
  return factsWith(
    ctx,
    (c) => c.type === 'quadrilateral' || (c.type === 'polygon' && c.ids.length === 4) || (c.type === 'shape-variant' && c.ids.length === 4),
  ).map((f) => ({
    fact: f,
    vertices: (cmdOf(f) as { ids: Id[] }).ids,
  }));
}

/** A stated quadrilateral whose four vertices ALL lie on one circle — a CYCLIC quadrilateral (87). */
function inscribedQuads(ctx: MatchCtx): { fact: Fact; circleId: Id; vertices: Id[] }[] {
  const out: { fact: Fact; circleId: Id; vertices: Id[] }[] = [];
  for (const q of quadFacts(ctx)) {
    const circ = circleContaining(ctx, q.vertices);
    if (circ) out.push({ fact: q.fact, circleId: circ.id, vertices: q.vertices });
  }
  return out;
}

/** Shape commands that ENTAIL parallel sides (a transversal cuts them ⇒ the parallels theorems apply). */
const PARALLEL_SIDED = new Set(['trapezoid', 'parallelogram', 'rectangle', 'rhombus', 'square']);

// Special-quadrilateral CLASSES for the property families below. The hierarchy is encoded in the sets:
// a rectangle/rhombus/square IS a parallelogram; a square is both a rectangle and a rhombus. So the
// parallelogram properties fire for all four, the rectangle-diagonal property for rectangle+square, etc.
const PARALLELOGRAM_KIND = new Set(['parallelogram', 'rectangle', 'rhombus', 'square']);
const RECTANGLE_KIND = new Set(['rectangle', 'square']);
const RHOMBUS_KIND = new Set(['rhombus', 'square']);
const ISO_TRAP_KIND = new Set(['isosceles-trapezoid']);
/** The 30-60-90 special right triangle (ADR-215) — detected-only (no stated command word names it). */
const THIRTY_SIXTY_NINETY_KIND = new Set(['30-60-90-triangle']);

/**
 * Shape-command types that NAME a shape class (their `ids` are the polygon vertices) → the class they
 * declare. Covers the special quads and the triangle words; a general `quadrilateral`/`polygon`/`triangle`
 * with no forced property is deliberately absent (a free quad announces no class — its type is only ever
 * DETECTED once constraints force one). Any future stated special-shape word is one row here.
 */
const SHAPE_CMD_TYPE: Record<string, string> = {
  square: 'square', rectangle: 'rectangle', rhombus: 'rhombus',
  parallelogram: 'parallelogram', trapezoid: 'trapezoid',
  'right-triangle': 'right-triangle',
};

/**
 * A named shape CLASS is PRESENT when a matching shape is STATED (a shape command whose declared class is
 * in `kinds`) OR DETECTED (constructed or purely emergent — `ctx.shapes`). Returns the trigger facts, the
 * vertices to highlight, and each matching vertex set, or null. This is the SINGLE, general shape→theorem
 * gate (ADR-216) — the same mechanism for triangles and quads, so a special-shape property theorem is a
 * table ROW keyed to a `kinds` set, never a bespoke matcher. The defining PROPERTIES of a shape the
 * student drew are "help", not a hidden proof step — the shape itself justifies its theorems (operator
 * 2026-07-04); the class hierarchy rides the `kinds` set each family passes (a rhombus IS a parallelogram).
 *
 * Attribution anchors to the shape's DEFINING fact (ADR-216): the STATED shape command when the class was
 * declared (so a plain property leads by the declaration, and a diagonal-property theorem can still fold in
 * the later diagonal-drawing fact to lead by recency — ADR-212 preserved); else, for an EMERGENT-only class
 * (no command — a 30-60-90 forced by `DC=2CE`, an emergent parallelogram), the LATEST fact touching its
 * vertices, so the ● new badge lands on the given that forces the shape rather than "always new".
 * `commandPointIds` is the store's canonical point-refs reader.
 */
function shapeClassPresent(
  ctx: MatchCtx,
  kinds: Set<string>,
): { factIds: string[]; objIds: Id[]; vertexSets: Id[][]; level: DiscoveryLevel } | null {
  const objIds = new Set<Id>();
  const vertexSets: Id[][] = [];
  const statedFactIds: string[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    const cls = SHAPE_CMD_TYPE[c.type];
    if (cls && kinds.has(cls)) {
      statedFactIds.push(f.id);
      const vs = (c as { ids: Id[] }).ids;
      vs.forEach((v) => objIds.add(v));
      vertexSets.push([...vs]);
    }
  }
  for (const s of ctx.shapes)
    if (kinds.has(s.type)) {
      s.vertices.forEach((v) => objIds.add(v));
      vertexSets.push([...s.vertices]);
    }
  if (!objIds.size) return null;
  // Stated → the declaration fact(s); emergent-only → the facts that force the shape (vertex-touching).
  const factIds = statedFactIds.length
    ? statedFactIds
    : ctx.facts.filter((f) => commandPointIds(cmdOf(f)).some((id) => objIds.has(id))).map((f) => f.id);
  // A DECLARED class is Level 1 (help from what you named); a class present ONLY via detection —
  // a purely-emergent parallelogram, a 30-60-90 forced by a size given — is Level 3 Observed (ADR-219).
  const level: DiscoveryLevel = statedFactIds.length ? 1 : 3;
  return { factIds, objIds: [...objIds], vertexSets, level };
}

/**
 * The DRAWN diagonals of this quad — the facts that drew them + the segment objects, for attribution
 * and highlight. A diagonal is a `segment` joining a NON-adjacent vertex pair of the cyclic vertex
 * order (the sides are the adjacent pairs, incl. the wrap). Empty when no diagonal is on the figure.
 * Drives the ADR-212 / Turn-4 relevance boost: once the student DRAWS the diagonals, the diagonal-
 * property theorem attributes to that step, so it leads the quad headlines (recency) and marks ● new —
 * "the diagonal theorems should get more weight".
 */
function quadDiagonals(ctx: MatchCtx, vertices: Id[]): { factIds: string[]; objIds: Id[] } {
  const n = vertices.length;
  const isDiagonal = (a: Id, b: Id): boolean => {
    const i = vertices.indexOf(a);
    const j = vertices.indexOf(b);
    if (i < 0 || j < 0) return false;
    const d = Math.abs(i - j);
    return d !== 1 && d !== n - 1; // not an adjacent pair (a side), incl. the cyclic wrap
  };
  const factIds: string[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'segment' && isDiagonal((c as { a: Id }).a, (c as { b: Id }).b)) factIds.push(f.id);
  }
  const objIds: Id[] = [];
  for (const o of ctx.construction.objects)
    if (o.kind === 'segment' && isDiagonal((o as { a: Id }).a, (o as { b: Id }).b)) objIds.push(o.id);
  return { factIds, objIds };
}

/**
 * Facts that STATE parallel lines: an explicit `set-parallel`, OR a shape whose definition includes a
 * parallel side-pair (trapezoid / parallelogram / rectangle / rhombus / square). Both announce "two
 * parallels cut by a transversal", the premise of the 4/6/8 family.
 */
export function parallelFacts(ctx: MatchCtx): Fact[] {
  return factsWith(ctx, (c) => c.type === 'set-parallel' || PARALLEL_SIDED.has(c.type));
}

/**
 * Parallel side-pairs STATED, coordinate-free (the engine's `parallelEdgePairs` needs coordinates, so it
 * can't serve the symbolic matcher). From a `set-parallel` (AB∥CD) and the parallel-sided shapes: a
 * trapezoid ABCD ⇒ AB∥CD (its one base-pair); a parallelogram/rectangle/rhombus/square ABCD ⇒ AB∥CD and
 * BC∥DA (both opposite-side pairs). Each pair carries the fact that stated it (for attribution).
 */
function parallelPairs(ctx: MatchCtx): { pair: [[Id, Id], [Id, Id]]; fact: Fact }[] {
  const out: { pair: [[Id, Id], [Id, Id]]; fact: Fact }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'set-parallel') {
      out.push({ pair: [[c.a, c.b], [c.c, c.d]], fact: f });
    } else if (PARALLEL_SIDED.has(c.type)) {
      const [A, B, C, D] = (c as { ids: Id[] }).ids;
      out.push({ pair: [[A, B], [C, D]], fact: f }); // AB ∥ DC
      if (c.type !== 'trapezoid') out.push({ pair: [[B, C], [D, A]], fact: f }); // BC ∥ AD (two-pair shapes)
    }
  }
  return out;
}

/**
 * An inscribed TRAPEZOID (cyclic ⇒ isosceles, 201): a trapezoid's one parallel base-pair whose four
 * points are all concyclic. The pair comes from either a `set-parallel` (the inscribe path emits it) or a
 * `trapezoid` command (AB∥CD ≡ its vertices). Parallelogram/rectangle/… are excluded — 201 is the
 * one-parallel-pair (trapezoid) corollary, not the two-pair shapes.
 */
function inscribedTrapezoids(ctx: MatchCtx): { fact: Fact; circleId: Id; pts: Id[] }[] {
  const out: { fact: Fact; circleId: Id; pts: Id[] }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    const pts =
      c.type === 'set-parallel' ? [c.a, c.b, c.c, c.d] : c.type === 'trapezoid' ? [...c.ids] : null;
    if (!pts) continue;
    const circ = circleContaining(ctx, pts);
    if (circ) out.push({ fact: f, circleId: circ.id, pts });
  }
  return out;
}

/**
 * Evidence of EQUAL CHORDS (94, "chords equal ⟺ arcs equal"): an `arc-midpoint` (equal arcs), two chords
 * of ONE circle stated equal (all four endpoints concyclic), OR an inscribed trapezoid (its legs are equal
 * chords). Coordinate-free — never evaluates that lengths happen to match, only that the premise is STATED
 * or STRUCTURALLY forced.
 */
function equalChordFacts(ctx: MatchCtx): Fact[] {
  const out: Fact[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'arc-midpoint') out.push(f);
    else if (c.type === 'set-equal' && circleContaining(ctx, [c.a, c.b, c.c, c.d])) out.push(f);
  }
  for (const t of inscribedTrapezoids(ctx)) out.push(t.fact);
  return out;
}

// ---------- Appendix (supporting-only) premise-scans (ADR-217) ----------
// These feed the practice-only / removed-curriculum theorems the operator asked to keep visible as
// SUPPORTING help (A2–A6, B3). All are coordinate-free, same as the helpers above.

/**
 * Two CHORDS of one circle crossing at a stated interior point (A2): a `line-line-intersection` (the
 * undirected 4-point crossing, not a directed secant/extension meet — `dir1`/`dir2` unset) whose four
 * endpoints all lie on one circle.
 */
function intersectingChordFacts(ctx: MatchCtx): { fact: Fact; circleId: Id; pts: Id[] }[] {
  const out: { fact: Fact; circleId: Id; pts: Id[] }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'line-line-intersection' || c.dir1 || c.dir2) continue;
    const pts = [c.a, c.b, c.c, c.d];
    const circ = circleContaining(ctx, pts);
    if (circ) out.push({ fact: f, circleId: circ.id, pts });
  }
  return out;
}

/**
 * External "hub" points (A3/A4 premise): a `point-on-segment` placed on the EXTENSION of a chord whose
 * two carrier endpoints both lie on one circle — a secant projected to an outside point (the parser's
 * `secantFromExternal` shape). Each carries the hub id + the circle.
 */
function externalSecantHubs(ctx: MatchCtx): { fact: Fact; hub: Id; circleId: Id }[] {
  const out: { fact: Fact; hub: Id; circleId: Id }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'point-on-segment' || !c.extension) continue;
    const circ = circleContaining(ctx, [c.a, c.b]);
    if (circ) out.push({ fact: f, hub: c.id, circleId: circ.id });
  }
  return out;
}

/**
 * Two VISIBLE circles that INTERSECT (B3 premise): a `circle-circle-intersection` command between two
 * non-hidden circles, OR two distinct visible circles sharing ≥2 stated members (their crossing points).
 * The visibility gate matters: the Thales external-tangent construction also emits a
 * `circle-circle-intersection` — but against a HIDDEN auxiliary circle — so an unconditional match would
 * fire B3 on every drawn tangent. B3 must speak only about two circles the student actually drew.
 * Returns the trigger facts + the circle/centre objects to highlight, or null.
 */
function intersectingCircles(ctx: MatchCtx): { factIds: string[]; objIds: Id[] } | null {
  const visible = (id: Id) => ctx.circles.some((c) => c.id === id && !c.hidden);
  const cc = factsWith(ctx, (c) => {
    if (c.type !== 'circle-circle-intersection') return false;
    return visible(c.circle1) && visible(c.circle2);
  });
  if (cc.length) {
    const objIds = cc.flatMap((f) => {
      const c = cmdOf(f) as { circle1: Id; circle2: Id };
      return [c.circle1, c.circle2];
    });
    return { factIds: ids(cc), objIds };
  }
  const vis = ctx.circles.filter((c) => !c.hidden);
  for (let i = 0; i < vis.length; i++)
    for (let j = i + 1; j < vis.length; j++) {
      const shared = vis[i].members.filter((m) => vis[j].members.includes(m));
      if (shared.length >= 2)
        return { factIds: [], objIds: [vis[i].id, vis[i].center, vis[j].id, vis[j].center, ...shared] };
    }
  return null;
}

/**
 * A right triangle with the altitude dropped from its RIGHT-ANGLE vertex to the hypotenuse (A5/A6
 * premise): a `foot` whose `from` is a stated right-angle vertex (a `right-triangle`'s apex, or a stated
 * 90° angle's vertex). The foot's base is then the hypotenuse and the leg/altitude projections appear —
 * the geometric-mean configuration. Returns the stating fact + foot fact and the objects, or null.
 */
function altitudeToHypotenuse(ctx: MatchCtx): { factIds: string[]; objIds: Id[] } | null {
  const rightVertex = new Map<Id, string>(); // right-angle vertex → its stating fact id
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'right-triangle') rightVertex.set(c.ids[2], f.id);
    else if ((c.type === 'set-angle' || c.type === 'measure-angle') && isRightValue(c)) rightVertex.set(c.vertex, f.id);
  }
  if (!rightVertex.size) return null;
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'foot') continue;
    const stated = rightVertex.get(c.from);
    if (stated === undefined) continue;
    return { factIds: [stated, f.id], objIds: [c.from, c.a, c.b, c.id] };
  }
  return null;
}

const ids = (fs: Fact[]) => fs.map((f) => f.id);

// A tiny builder to cut boilerplate. `level` defaults to 1 (Declared) — the vast majority of matchers
// fire off a typed fact; only the structural-entailment (L2) and coordinate-emergent (L3) evidence
// helpers pass an explicit level (ADR-219).
const match = (
  tier: TheoremMatch['tier'],
  triggerFactIds: string[],
  triggerObjectIds: Id[],
  level: DiscoveryLevel = 1,
): TheoremMatch => ({
  tier,
  triggerFactIds,
  triggerObjectIds,
  level,
});

// ---------- the table ----------

export const THEOREM_TABLE: TheoremDef[] = [
  // ===== Angles =====
  {
    id: 1, type: 'P', salience: 'background', family: 'angles',
    en: 'Angles on a straight line (a linear pair) are supplementary — they sum to 180°.',
    he: 'זוויות צמודות משלימות זו את זו ל-180°.',
    match: (ctx) => {
      const fs = collinearFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 2, type: 'P', salience: 'background', family: 'angles',
    en: 'Vertically opposite angles are equal.',
    he: 'זוויות קודקודיות שוות זו לזו.',
    match: (ctx) => {
      const fs = crossingFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },

  // ===== Parallels — a transversal cutting STATED parallel lines (properties 4/6/8) =====
  // Premise = a `set-parallel` (the student stated two lines parallel — a trapezoid's bases, a
  // parallelogram's sides, parallel chords). The alternate/corresponding relations (4,6) fold into the
  // family background; the co-interior sum (8) is the pointed one for a cyclic trapezoid (with the cyclic
  // opposite-angle sum it forces the base angles equal ⇒ isosceles), so it is authored headline.
  ...([
    [4, 'If two parallel lines are cut by a transversal, alternate angles are equal.', 'אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, כל שתי זוויות מתחלפות שוות זו לזו.'],
    [6, 'If two parallel lines are cut by a transversal, corresponding angles are equal.', 'אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, כל שתי זוויות מתאימות שוות זו לזו.'],
  ] as [number, string, string][]).map(([id, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'background', family: 'parallels', en, he,
    match: (ctx) => {
      // 4/6 need a transversal actually cutting the parallels (a triangle — typed, structural, or
      // detected — or a drawn line), not just a stated parallel pair (ADR-210). The transversal's
      // discovery level rides through so the dial gates them correctly (ADR-219/ADR-220).
      const fs = parallelFacts(ctx);
      const t = transversalEvidence(ctx);
      return fs.length && t.present ? match('certain', ids(fs), [], t.level) : null;
    },
  })),
  {
    id: 8, type: 'P', salience: 'headline', family: 'parallels',
    en: 'If two parallel lines are cut by a transversal, each pair of co-interior (same-side) angles sums to 180°.',
    he: 'אם שני ישרים מקבילים נחתכים על ידי ישר שלישי, סכום כל זוג זוויות חד-צדדיות הוא 180°.',
    match: (ctx) => {
      const fs = parallelFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    // A dropped height between two STATED parallels (a trapezoid's base, parallel chords, a
    // parallelogram side) is the "distance between parallels is constant" configuration: the foot's
    // base is one parallel edge and its apex sits on the opposite one — operator 2026-07-04, so a
    // height finally moves a headline. Byte-exact 07 statement (integrity guard).
    id: 3, type: 'P', salience: 'headline', family: 'parallels',
    en: 'The distance between two parallel lines is constant (the perpendicular from any point on one to the other has constant length).',
    he: 'אורך האנך מנקודה על ישר לישר המקביל לו קבוע.',
    match: (ctx) => {
      const pairs = parallelPairs(ctx);
      if (!pairs.length) return null;
      const onEdge = (p: Id, [x, y]: [Id, Id]) => p === x || p === y;
      const sameEdge = (base: [Id, Id], [x, y]: [Id, Id]) =>
        (base[0] === x && base[1] === y) || (base[0] === y && base[1] === x);
      for (const f of ctx.facts) {
        const c = cmdOf(f);
        if (c.type !== 'foot') continue;
        const base: [Id, Id] = [c.a, c.b];
        for (const { pair, fact } of pairs) {
          const [e1, e2] = pair;
          // foot base == one parallel edge AND the apex `from` on the opposite edge (a perpendicular
          // dropped between the two parallels).
          if (sameEdge(base, e1) && onEdge(c.from, e2))
            return match('certain', [fact.id, f.id], [c.id, c.from]);
          if (sameEdge(base, e2) && onEdge(c.from, e1))
            return match('certain', [fact.id, f.id], [c.id, c.from]);
        }
      }
      return null;
    },
  },

  // ===== Triangle basics (background fold) =====
  ...([
    [10, 'The interior angles of a triangle sum to 180°.', 'סכום הזוויות של משולש הוא 180°.'],
    [11, 'An exterior angle of a triangle equals the sum of the two non-adjacent interior angles.', 'זווית חיצונית למשולש שווה לסכום שתי הזוויות הפנימיות שאינן צמודות לה.'],
    [12, 'The sum of any two sides exceeds the third (triangle inequality).', 'סכום כל שתי צלעות במשולש גדול מהצלע השלישית (אי-שוויון המשולש).'],
    [13, 'In a non-equilateral triangle, the larger angle lies opposite the larger side.', 'במשולש (שאינו שווה צלעות), מול הצלע הגדולה יותר מונחת זווית גדולה יותר.'],
    [14, 'In a non-equiangular triangle, the larger side lies opposite the larger angle.', 'במשולש (שאינו שווה זוויות), מול הזווית הגדולה יותר מונחת צלע גדולה יותר.'],
  ] as [number, string, string][]).map(([id, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'background', family: 'triangle', en, he,
    match: (ctx) => {
      const { facts, vertices, level } = triangleFacts(ctx);
      return facts.length || vertices.length ? match('certain', ids(facts), vertices, level) : null;
    },
  })),

  // ===== Isosceles =====
  {
    id: 22, type: 'P', salience: 'headline', family: 'isosceles',
    en: 'In an isosceles triangle, the base angles are equal.',
    he: 'במשולש שווה שוקיים זוויות הבסיס שוות זו לזו.',
    match: (ctx) => {
      const ev = isoscelesEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },

  // ===== Kite (operator 2026-07-04, ADR-218) =====
  // A kite the student DECLARED (`דלתון ABCD`) or ENTAILED by two intersecting circles (the classic
  // OAPB, two radii-pairs). Both properties are RELEVANT to the drawn kite, so they headline. Recognising
  // the entailed form is the "chase the class, not the case" fix: the two-circle kite is a construction
  // entailment the feed can read coordinate-free, not another declared-shape special case.
  ...([
    [37, 'In a kite, the two angles between sides of different lengths are equal.', 'זוויות הצד בדלתון שוות זו לזו.'],
    [38, 'The main diagonal of a kite bisects the apex angles, bisects the secondary diagonal, and is perpendicular to it.', 'האלכסון הראשי בדלתון חוצה את זוויות הראש, חוצה את האלכסון המשני ומאונך לו.'],
  ] as [number, string, string][]).map(([id, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'headline', family: 'kite', en, he,
    match: (ctx) => {
      const ev = kiteEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  })),

  // ===== Similarity — a line parallel to a triangle side (Thales / AA) — operator 2026-07-04, ADR-220 =====
  // Kept OUT of the table until now (their premise is DERIVED — the ADR-208 no-reveal rule). Under the
  // discovery dial they are admissible as ENTAILED (L2) help: a stated parallel to a triangle side
  // STRUCTURALLY forces the cut-off triangle similar (AA), so the feed may name it ABOVE the default
  // worksheet level (L1). #69 (AA — the criterion this configuration announces) leads as a headline; #71
  // (the ratio consequences that follow once similar) folds into the family background. Both ride
  // `similarityEvidence` (parallel-cuts-triangle), so neither surfaces without a stated parallel — the
  // Q5–Q7 corpus (no parallels) never trips them, and the sharper SAS/SSS criteria (68/70) stay excluded.
  {
    id: 69, type: 'P', salience: 'headline', family: 'similarity',
    en: 'Similarity — Angle-Angle (AA).',
    he: 'משפט דמיון: זווית-זווית.',
    match: (ctx) => {
      const ev = similarityEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },
  {
    id: 71, type: 'P', salience: 'background', family: 'similarity',
    en: 'In similar triangles, the ratios of corresponding heights, angle bisectors, medians, perimeters, circumradii, and inradii all equal the similarity ratio; the ratio of areas equals its square.',
    he: 'במשולשים דומים: יחס הגבהים, חוצי הזוויות, התיכונים, ההיקפים, רדיוסי המעגלים החוסמים ורדיוסי המעגלים החסומים — שווה ליחס הדמיון; יחס השטחים שווה לריבוע יחס הדמיון.',
    match: (ctx) => {
      const ev = similarityEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },

  // ===== Right triangle =====
  {
    // A right angle — a right-triangle, a stated 90°, an explicit ⟂, or a dropped height/foot — makes
    // Pythagoras the MAIN theorem to reach for, so it headlines (operator 2026-07-04: a freshly-built
    // height should surface its theorem as a main entry, not fold into the background).
    id: 28, type: 'P', salience: 'headline', family: 'triangle',
    en: 'Pythagoras — in a right triangle, the sum of the squares of the legs equals the square of the hypotenuse.',
    he: 'משפט פיתגורס: במשולש ישר זווית, סכום ריבועי הניצבים שווה לריבוע היתר.',
    match: (ctx) => {
      const fs = rightAngleFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },

  // ===== 30-60-90 special right triangle (operator 2026-07-04, ADR-215) =====
  // Surface whenever a 30-60-90 is DETECTED in the figure — stated OR emergent (a size given like
  // `DC=2CE` forces exactly 30°). The operator chose "always when detected" over stated-only: naming the
  // special triangle and its half-hypotenuse relation is a study aid, not a hidden proof step. Both the
  // forward (#33) and its converse (#34) fire on the same premise (the detected special triangle), so a
  // student sees the two-way relation between the 30° angle and the ½-hypotenuse leg.
  ...([
    [33, 'P', 'In a right triangle with a 30° acute angle, the leg opposite it equals half the hypotenuse.', 'אם במשולש ישר זווית יש זווית חדה של 30°, אז הניצב מול זווית זו שווה למחצית היתר.'],
    [34, 'C', 'In a right triangle, if a leg equals half the hypotenuse, the angle opposite that leg is 30°.', 'אם במשולש ישר זווית ניצב שווה למחצית היתר, אז מול ניצב זה זווית שגודלה 30°.'],
  ] as [number, TheoremDef['type'], string, string][]).map(([id, type, en, he]): TheoremDef => ({
    id, type, salience: 'headline', family: 'triangle', en, he,
    match: (ctx) => {
      const q = shapeClassPresent(ctx, THIRTY_SIXTY_NINETY_KIND);
      return q ? match('certain', q.factIds, q.objIds, q.level) : null;
    },
  })),

  // ===== Circle — circumscribed/points (background) =====
  {
    id: 84, type: 'P', salience: 'background', family: 'circle',
    en: 'Every triangle has a circumscribed circle.',
    he: 'כל משולש ניתן לחסום במעגל.',
    match: (ctx) => {
      // The premise is a TRIANGLE circumscribed by the circle, not merely ≥3 concyclic points — so a
      // cyclic quadrilateral (4 concyclic points, no triangle) never trips it (operator, ADR-210).
      const t = circumTriangle(ctx);
      return t ? match('certain', [], [t.circleId, t.center, ...t.vertices], t.level) : null;
    },
  },
  {
    id: 91, type: 'P', salience: 'background', family: 'circle',
    en: 'Through any three non-collinear points passes exactly one circle.',
    he: 'דרך כל שלוש נקודות שאינן על ישר אחד עובר מעגל אחד ויחיד.',
    match: (ctx) => {
      // Its premise is a circle CONSTRUCTED THROUGH three given points (a `circumcircle`) — the "three
      // points determine a unique circle" existence lemma. Points PLACED ON a pre-existing circle (every
      // inscribe figure) don't invoke it, so it stays dormant there — operator 2026-07-04 (ADR-210 Am.):
      // "this theorem should only appear in rare cases … no use in the questions I remember".
      const cs = factsWith(ctx, (c) => c.type === 'circumcircle');
      if (!cs.length) return null;
      const objIds = cs.flatMap((f) => {
        const c = cmdOf(f) as { a: Id; b: Id; c: Id; center: Id };
        return [`circle-${c.center}`, c.a, c.b, c.c];
      });
      return match('certain', ids(cs), objIds);
    },
  },

  // ===== Cyclic quadrilateral / inscribed trapezoid =====
  // Gated on an actual QUAD (a `quadrilateral`/4-`polygon` command), not raw member count — so a triangle
  // inscribed with a stray 4th concyclic point (Q5's arc-midpoint) never trips it. 87 is premise-announced
  // (the student stated a quad inscribed in a circle); 201 (Appendix C, a composed teaching corollary)
  // fires only when that quad is a trapezoid (a `set-parallel` on its concyclic vertices).
  {
    id: 87, type: 'C', salience: 'headline', family: 'quad',
    en: 'A quadrilateral is cyclic if and only if a pair of opposite angles sums to 180°.',
    he: 'ניתן לחסום מרובע במעגל אם ורק אם סכום זוג זוויות נגדיות שווה ל-180°.',
    match: (ctx) => {
      const qs = inscribedQuads(ctx);
      if (!qs.length) return null;
      return match('certain', ids(qs.map((q) => q.fact)), qs.flatMap((q) => [q.circleId, ...q.vertices]));
    },
  },
  {
    id: 201, type: 'P', salience: 'headline', family: 'quad',
    en: 'A trapezoid inscribed in a circle is isosceles.',
    he: 'טרפז החסום במעגל הוא טרפז שווה שוקיים.',
    match: (ctx) => {
      const ts = inscribedTrapezoids(ctx);
      if (!ts.length) return null;
      return match('certain', ids(ts.map((t) => t.fact)), ts.flatMap((t) => [t.circleId, ...t.pts]));
    },
  },

  // ===== Special-quadrilateral properties (the shape itself justifies them — operator 2026-07-04) =====
  // Each is a defining PROPERTY (type P) of a quadrilateral the student drew — surfaced as "help" the
  // moment the shape lands (a bare מקבילית used to surface only the generic co-interior #8). These are
  // the theorems RELEVANT to the drawn quad, so they surface as MAIN `headline` entries, not folded into
  // the background bundle (operator 2026-07-04 Turn-4: "the relevant quad theorems should be the main
  // theorems, not additional theorems"). The class hierarchy rides each matcher's `kinds` set
  // (rectangle/rhombus/square ARE parallelograms; a square is both). The CONVERSE recognitions
  // (44/45/47/49/51/53/54/57/58/59/60/61, type C) stay OUT — those are Phase-6b converse-recognition
  // prompts (recognise a shape FROM properties), not properties of a drawn shape.
  // The `diag` column marks a theorem ABOUT the diagonals: when the student actually DRAWS the diagonals
  // it also attributes to that drawing step (ADR-212 — "the diagonal theorems should get more weight"),
  // so among the quad headlines it leads by recency and marks ● new, and clicking it highlights the
  // diagonals — without demoting the other properties, which stay main.
  ...([
    [43, PARALLELOGRAM_KIND, false, 'Opposite sides are equal.', 'במקבילית כל שתי צלעות נגדיות שוות זו לזו.'],
    [46, PARALLELOGRAM_KIND, true, 'The diagonals bisect each other.', 'במקבילית האלכסונים חוצים זה את זה.'],
    [48, PARALLELOGRAM_KIND, false, 'Opposite angles are equal.', 'במקבילית כל שתי זוויות נגדיות שוות זו לזו.'],
    [50, PARALLELOGRAM_KIND, false, 'Consecutive angles sum to 180°.', 'במקבילית סכום כל שתי זוויות סמוכות הוא 180°.'],
    [52, RECTANGLE_KIND, true, 'The diagonals of a rectangle are equal.', 'במלבן האלכסונים שווים זה לזה.'],
    [55, RHOMBUS_KIND, true, 'The diagonals of a rhombus bisect its angles.', 'במעוין האלכסונים חוצים את הזוויות.'],
    [56, RHOMBUS_KIND, true, 'The diagonals of a rhombus are perpendicular.', 'במעוין האלכסונים מאונכים זה לזה.'],
    [39, ISO_TRAP_KIND, false, 'In an isosceles trapezoid, the angles at the same base are equal.', 'בטרפז שווה שוקיים הזוויות שליד אותו בסיס שוות זו לזו.'],
    [41, ISO_TRAP_KIND, true, 'In an isosceles trapezoid, the diagonals are equal.', 'בטרפז שווה שוקיים האלכסונים שווים זה לזה.'],
  ] as [number, Set<string>, boolean, string, string][]).map(([id, kinds, diag, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'headline', family: 'quad', en, he,
    match: (ctx) => {
      const q = shapeClassPresent(ctx, kinds);
      if (!q) return null;
      const base = match('certain', q.factIds, q.objIds, q.level);
      if (!diag) return base;
      // A diagonal-property theorem: fold in the diagonal-drawing facts/objects so it leads the quad
      // headlines by recency and highlights the drawn diagonals (ADR-212 relevance boost).
      const dFacts: string[] = [];
      const dObjs: Id[] = [];
      for (const vs of q.vertexSets) {
        const d = quadDiagonals(ctx, vs);
        dFacts.push(...d.factIds);
        dObjs.push(...d.objIds);
      }
      if (!dFacts.length && !dObjs.length) return base;
      return {
        ...base,
        triggerFactIds: [...base.triggerFactIds, ...dFacts],
        triggerObjectIds: [...base.triggerObjectIds, ...dObjs],
      };
    },
  })),

  // ===== Circle — chords/arcs/centre =====
  {
    id: 92, type: 'P', salience: 'headline', family: 'circle',
    en: 'Two central angles are equal if and only if their corresponding arcs are equal.',
    he: 'במעגל, שתי זוויות מרכזיות שוות זו לזו אם ורק אם הקשתות המתאימות להן שוות.',
    match: (ctx) => {
      // A CENTRAL-angle theorem: surfaces only when the arc's circle has a given centre (ADR-210).
      const fs = factsWith(ctx, (c) => c.type === 'arc-midpoint');
      const given = fs.some((f) => {
        const c = cmdOf(f) as { circle: Id };
        const circ = ctx.circles.find((x) => x.id === c.circle || x.center === c.circle);
        return circ ? centerGiven(ctx, circ) : false;
      });
      return fs.length && given ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 94, type: 'P', salience: 'headline', family: 'circle',
    en: 'Chords are equal if and only if their corresponding arcs are equal.',
    he: 'במעגל, מיתרים שווים זה לזה אם ורק אם הקשתות המתאימות להם שוות.',
    match: (ctx) => {
      // Equal chords are announced by an arc-midpoint, two stated-equal chords, OR an inscribed
      // trapezoid (its legs are equal chords) — not only the arc-midpoint case.
      const fs = equalChordFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 97, type: 'P', salience: 'background', family: 'circle',
    en: 'The perpendicular from the center to a chord bisects the chord, its central angle, and its arc.',
    he: 'האנך ממרכז המעגל למיתר חוצה את המיתר, את הזווית המרכזית המתאימה ואת הקשת המתאימה.',
    match: (ctx) => {
      // Speaks about the centre → gate on a given centre (ADR-210).
      const c = circleWithGivenCenter(ctx, 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 98, type: 'P', salience: 'background', family: 'circle',
    en: 'The segment from the center that bisects a chord is perpendicular to it.',
    he: 'קטע ממרכז המעגל החוצה את המיתר מאונך למיתר.',
    match: (ctx) => {
      const c = circleWithGivenCenter(ctx, 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 99, type: 'P', salience: 'headline', family: 'circle',
    en: 'An inscribed angle equals half the central angle subtending the same arc.',
    he: 'במעגל, זווית היקפית שווה למחצית הזווית המרכזית הנשענת על אותה הקשת.',
    match: (ctx) => {
      // "…half the CENTRAL angle" — needs the centre given (ADR-210). A named inscribed triangle (Q5/Q7,
      // "circle O") keeps it; an unnamed inscribed trapezoid's implicit circle does not.
      const c = circleWithGivenCenter(ctx, 3);
      return c ? match('certain', [], [c.id, c.center, ...c.members]) : null;
    },
  },
  {
    id: 102, type: 'P', salience: 'headline', family: 'circle',
    en: 'Inscribed angles subtending the same chord from the same side are equal.',
    he: 'במעגל, כל הזוויות ההיקפיות הנשענות על מיתר מאותו צד של המיתר שוות זו לזו.',
    match: (ctx) => {
      // Two inscribed angles on a chord need ≥4 concyclic points. Authored amber (plan §5, Q6 precedent).
      const c = ctx.circles.find((c) => c.members.length >= 4);
      return c ? match('possible', [], [c.id, ...c.members]) : null;
    },
  },

  // ===== Circle — diameter / Thales =====
  {
    id: 103, type: 'P', salience: 'headline', family: 'circle',
    en: 'An inscribed angle subtending a diameter is a right angle (90°).',
    he: 'זווית היקפית הנשענת על קוטר היא זווית ישרה (90°).',
    match: (ctx) => {
      const ds = statedDiameterFacts(ctx);
      if (!ds.length) return null; // a STATED diameter only — never a bare 90° (keeps Q5's 103 off)
      const objIds = ds.flatMap((d) => [d.circleId, ...d.ids]);
      return match('certain', ids(ds.map((d) => d.fact)), objIds);
    },
  },
  {
    id: 104, type: 'C', salience: 'headline', family: 'circle',
    en: 'A 90° inscribed angle subtends a diameter.',
    he: 'זווית היקפית בת 90° נשענת על קוטר.',
    match: (ctx) => {
      // Bundled with a stated diameter (converse, same footing — plan §9.3) OR announced by a stated
      // 90° inscribed angle (the "diameter moment" — the corpus's canonical case, Q5).
      const ds = statedDiameterFacts(ctx);
      const rs = rightInscribedFacts(ctx);
      if (!ds.length && !rs.length) return null;
      const fs = [...ds.map((d) => d.fact), ...rs.map((r) => r.fact)];
      const objIds = [...ds.flatMap((d) => [d.circleId, ...d.ids]), ...rs.flatMap((r) => [r.circleId, r.vertex, r.ray1, r.ray2])];
      return match('certain', ids(fs), objIds);
    },
  },

  // ===== Circle — tangents =====
  {
    id: 105, type: 'P', salience: 'headline', family: 'tangent',
    en: 'A tangent to a circle is perpendicular to the radius at the point of tangency.',
    he: 'המשיק למעגל מאונך לרדיוס בנקודת ההשקה.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      if (!byCircle.size) return null;
      const factIds = [...byCircle.values()].flatMap((e) => e.factIds);
      const objIds = [...byCircle.entries()].flatMap(([circle, e]) => [circle, ...e.ats]);
      return match('certain', factIds, objIds);
    },
  },
  {
    id: 107, type: 'P', salience: 'headline', family: 'tangent',
    en: 'The tangent–chord angle equals the inscribed angle subtending that chord on the other side.',
    he: 'זווית בין משיק למיתר שווה לזווית ההיקפית הנשענת על מיתר זה מצידו השני.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      // needs a tangent AND a chord (≥2 members) on the same circle.
      for (const [circle, e] of byCircle) {
        const c = ctx.circles.find((c) => c.id === circle);
        if (c && c.members.length >= 2) return match('certain', e.factIds, [circle, ...e.ats, ...c.members]);
      }
      return null;
    },
  },
  {
    id: 108, type: 'P', salience: 'headline', family: 'tangent',
    en: 'Two tangents to a circle from the same external point are equal.',
    he: 'שני משיקים למעגל היוצאים מאותה נקודה שווים זה לזה.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      for (const [circle, e] of byCircle) if (e.ats.length >= 2) return match('certain', e.factIds, [circle, ...e.ats]);
      return null;
    },
  },
  {
    id: 109, type: 'P', salience: 'headline', family: 'tangent',
    en: 'The segment from the center to an external point bisects the angle between the two tangents drawn from it.',
    he: 'הקטע המחבר את מרכז המעגל לנקודה ממנה יוצאים שני משיקים חוצה את הזווית שבין המשיקים.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      for (const [circle, e] of byCircle) if (e.ats.length >= 2) return match('certain', e.factIds, [circle, ...e.ats]);
      return null;
    },
  },

  // ===== Appendix theorems — SUPPORTING ONLY (operator 2026-07-04, ADR-217) =====
  // Practice-only (Appendix A) / removed-curriculum (Appendix B) bagrut theorems. The operator asked to
  // keep A2–A6 and B3 visible as *supporting* help, but "they should never appear in the main theorems,
  // only as supporting". The structural guarantee is `salience: 'background'` on every one (the integrity
  // guard asserts type-O ⇒ background), so each always folds into its family's collapsed background row
  // and can NEVER be a headline. Tier is `possible` (amber) — a secondary aid, never announced as certain.
  // Ids are the 07 Appendix LABELS (strings) so they read as "not a citable bagrut number" wherever shown.
  {
    id: 'A2', type: 'O', salience: 'background', family: 'circle',
    en: 'Intersecting chords — the products of the two segments of each chord are equal.',
    he: 'אם שני מיתרים נחתכים, מכפלת קטעי מיתר אחד שווה למכפלת קטעי המיתר השני.',
    match: (ctx) => {
      const cs = intersectingChordFacts(ctx);
      return cs.length
        ? match('possible', ids(cs.map((c) => c.fact)), cs.flatMap((c) => [c.circleId, ...c.pts]))
        : null;
    },
  },
  {
    id: 'A3', type: 'O', salience: 'background', family: 'circle',
    en: 'Two secants from an external point — each secant times its external part is equal.',
    he: 'משתי חותכים מנקודה חיצונית, מכפלת חותך בחלקו החיצוני שווה למכפלת החותך השני בחלקו החיצוני.',
    match: (ctx) => {
      // Two SECANTS ⇒ the external hub is joined (drawn segments) to ≥2 distinct on-circle points that
      // are secant near-points — NOT tangency points (a tangent touches at one point; counting it would
      // conflate a secant+tangent config (A4) with two secants). Subtract the circle's tangency points.
      const byCircle = tangentsByCircle(ctx);
      for (const h of externalSecantHubs(ctx)) {
        const circ = ctx.circles.find((c) => c.id === h.circleId);
        if (!circ) continue;
        const tangentPts = new Set(byCircle.get(h.circleId)?.ats ?? []);
        const near = [...new Set((ctx.neighbors[h.hub] ?? []).filter((n) => circ.members.includes(n) && !tangentPts.has(n)))];
        if (near.length >= 2) return match('possible', [h.fact.id], [h.circleId, h.hub, ...near]);
      }
      return null;
    },
  },
  {
    id: 'A4', type: 'O', salience: 'background', family: 'tangent',
    en: 'Secant and tangent from an external point — the secant times its external part equals the tangent squared.',
    he: 'מחותך ומשיק מנקודה חיצונית, מכפלת החותך בחלקו החיצוני שווה לריבוע המשיק.',
    match: (ctx) => {
      // An external secant hub also joined to a tangency point of the SAME circle (secant + tangent).
      const byCircle = tangentsByCircle(ctx);
      for (const h of externalSecantHubs(ctx)) {
        const t = byCircle.get(h.circleId);
        if (!t) continue;
        const touch = t.ats.find((at) => (ctx.neighbors[h.hub] ?? []).includes(at));
        if (touch) return match('possible', [h.fact.id, ...t.factIds], [h.circleId, h.hub, touch]);
      }
      return null;
    },
  },
  {
    id: 'A5', type: 'O', salience: 'background', family: 'triangle',
    en: "In a right triangle, each leg is the geometric mean of the hypotenuse and the leg's projection on it.",
    he: 'במשולש ישר זווית, הניצב הוא ממוצע הנדסי של היתר ושל היטל הניצב על היתר.',
    match: (ctx) => {
      const a = altitudeToHypotenuse(ctx);
      return a ? match('possible', a.factIds, a.objIds) : null;
    },
  },
  {
    id: 'A6', type: 'O', salience: 'background', family: 'triangle',
    en: 'In a right triangle, the altitude to the hypotenuse is the geometric mean of the two projections of the legs.',
    he: 'הגובה ליתר במשולש ישר זווית הוא ממוצע הנדסי של היטלי הניצבים על היתר.',
    match: (ctx) => {
      const a = altitudeToHypotenuse(ctx);
      return a ? match('possible', a.factIds, a.objIds) : null;
    },
  },
  {
    id: 'B3', type: 'O', salience: 'background', family: 'circle',
    en: 'The line of centers of two intersecting circles perpendicularly bisects their common chord.',
    he: 'קטע המרכזים של שני מעגלים נחתכים חוצה את המיתר המשותף ומאונך לו.',
    match: (ctx) => {
      const r = intersectingCircles(ctx);
      return r ? match('possible', r.factIds, r.objIds) : null;
    },
  },
];
