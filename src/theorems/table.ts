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
import type { Fact } from '../replay/core';
import { commandPointIds } from '../replay/core';
import type { DiscoveryLevel, MatchCtx, Salience, TheoremDef, TheoremMatch } from './types';
import {
  bisectorStatements, circleContaining, cmdOf, congruenceEvidence, definingFactIds, drawnEdge, ek,
  externalSecantHubs, factsAmong, factsWith, isRightValue, isoscelesEvidence, kiteEvidence, medianFacts,
  midsegmentFacts, parallelFacts, parallelPairs, rightAngleFacts, similarityEvidence, statedDiameterFacts,
  tangentsByCircle, transversalEvidence, triangleVertexSets,
} from './evidence';
// The shared evidence predicates now live in ./evidence (docs/24 S4.2b); re-export them so existing
// consumers of this module keep working unchanged.
export {
  bisectorStatements, externalSecantHubs, medianFacts, midsegmentFacts, parallelFacts, rightAngleFacts,
  statedDiameterFacts, structuralTriangles, tangentsByCircle, triangleVertexSets,
} from './evidence';

// ---------- premise-scan helpers (symbolic; no coordinates) ----------

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

// ===== T2 evidence helpers (ADR-243) — medians, midsegments, bisectors, congruence =====

/** Medians grouped by their triangle (vertex set) — ≥2 in one triangle announce the centroid family. */
function medianGroups(ctx: MatchCtx): { facts: Fact[]; objIds: Id[] }[] {
  const groups = new Map<string, { facts: Fact[]; objIds: Id[]; n: number }>();
  for (const m of medianFacts(ctx)) {
    const key = [m.apex, ...m.base].sort().join('|');
    const g = groups.get(key) ?? { facts: [], objIds: [m.apex, ...m.base], n: 0 };
    g.facts.push(...m.facts);
    if (!g.objIds.includes(m.mid)) g.objIds.push(m.mid);
    g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.n >= 2);
}

/** ≥2 stated bisectors at DISTINCT vertices of one stated triangle — the incenter concurrency (80). */
function bisectorConcurrency(ctx: MatchCtx): { facts: Fact[]; objIds: Id[] } | null {
  const bs = bisectorStatements(ctx);
  for (const t of triangleVertexSets(ctx)) {
    const inTri = bs.filter((b) => t.ids.includes(b.vertex));
    if (new Set(inTri.map((b) => b.vertex)).size >= 2) {
      return { facts: [...inTri.map((b) => b.fact), ...factsAmong(ctx, t.ids)], objIds: [...t.ids] };
    }
  }
  return null;
}

// ===== Stage-2 evidence helpers (ADR-245) — right triangles, ⟂-bisectors, altitudes, quad relations =====

/** Stated RIGHT triangles — the `right-triangle` command (right vertex LAST) or a stated 90°
 *  `set-angle` at a typed triangle's vertex. Returns the right vertex + the hypotenuse. */
function rightTriangleFacts(ctx: MatchCtx): { fact: Fact; ids: Id[]; rightVertex: Id; hyp: [Id, Id] }[] {
  const out: { fact: Fact; ids: Id[]; rightVertex: Id; hyp: [Id, Id] }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'right-triangle') out.push({ fact: f, ids: [...c.ids], rightVertex: c.ids[2], hyp: [c.ids[0], c.ids[1]] });
  }
  for (const t of triangleVertexSets(ctx)) {
    for (const f of ctx.facts) {
      const c = cmdOf(f);
      if (c.type !== 'set-angle' || Math.abs(c.value - 90) > 1e-6) continue;
      if (!t.ids.includes(c.vertex)) continue;
      const others = t.ids.filter((v) => v !== c.vertex);
      if (others.length === 2 && [c.ray1, c.ray2].every((r) => others.includes(r))) {
        out.push({ fact: f, ids: [...t.ids], rightVertex: c.vertex, hyp: [others[0], others[1]] });
      }
    }
  }
  return out;
}

/** Stated ⟂-BISECTORS — a stated midpoint + a `perpendicular-line` through it ⟂ its own segment
 *  (the named construct's lowering, and the ADR-236 LINE_CUT compound's scaffolding). */
function perpBisectorFacts(ctx: MatchCtx): { facts: Fact[]; seg: [Id, Id]; through: Id }[] {
  const out: { facts: Fact[]; seg: [Id, Id]; through: Id }[] = [];
  for (const mf of factsWith(ctx, (c) => c.type === 'midpoint')) {
    const m = cmdOf(mf) as Extract<AnyCommand, { type: 'midpoint' }>;
    for (const pf of ctx.facts) {
      const c = cmdOf(pf);
      if (c.type !== 'perpendicular-line' || c.through !== m.id) continue;
      if (!((c.a === m.a && c.b === m.b) || (c.a === m.b && c.b === m.a))) continue;
      out.push({ facts: [mf, pf], seg: [m.a, m.b], through: m.id });
    }
  }
  return out;
}

/** Stated ALTITUDES — `foot` facts (a vertex dropped ⟂ onto a side). */
function altitudeFootFacts(ctx: MatchCtx): { fact: Fact; foot: Id; from: Id; base: [Id, Id] }[] {
  return factsWith(ctx, (c) => c.type === 'foot').map((f) => {
    const c = cmdOf(f) as Extract<AnyCommand, { type: 'foot' }>;
    return { fact: f, foot: c.id, from: c.from, base: [c.a, c.b] as [Id, Id] };
  });
}

/** Stated 4-gon SHAPE facts whose command type is in `types` (each carries `ids`). */
function statedQuadShapes(ctx: MatchCtx, types: string[]): { fact: Fact; ids: Id[] }[] {
  return ctx.facts
    .filter((f) => types.includes(cmdOf(f).type) && Array.isArray((cmdOf(f) as { ids?: Id[] }).ids))
    .map((f) => ({ fact: f, ids: [...(cmdOf(f) as { ids: Id[] }).ids] }));
}

/**
 * The stated relations a quad's converse-recognition prompts read (D2): for a 4-gon V (cyclic
 * order), which extra facts the student stated about ITS sides/diagonals/angles. Everything here is
 * a stated fact — never a derived measurement.
 */
function quadStatedRelations(ctx: MatchCtx, V: Id[]) {
  const sides = [ek(V[0], V[1]), ek(V[1], V[2]), ek(V[2], V[3]), ek(V[3], V[0])];
  const diags = [ek(V[0], V[2]), ek(V[1], V[3])];
  const oppPairs = [[sides[0], sides[2]], [sides[1], sides[3]]];
  const inV = (p: Id) => V.includes(p);
  const out = {
    oppositeSideEqs: [] as Fact[],
    parallelAndEqual: [] as Fact[],
    adjacentSideEqs: [] as Fact[],
    diagEqual: [] as Fact[],
    diagPerp: [] as Fact[],
    diagBisect: [] as Fact[],
    oppositeAngleEqs: [] as Fact[],
    baseAngleEqs: [] as Fact[], // equal angles at ADJACENT vertices (a trapezoid's same-base pair)
    rightAngle: [] as Fact[],
    consecutiveSum180: [] as Fact[],
  };
  const parallels = new Set<string>();
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'set-parallel') {
      const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
      if (sides.includes(p) && sides.includes(q)) parallels.add([p, q].sort().join('~'));
    }
  }
  const numericAngles: { v: Id; value: number; fact: Fact }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'set-equal' && !c.soft) {
      const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
      if (oppPairs.some(([x, y]) => (p === x && q === y) || (p === y && q === x))) {
        out.oppositeSideEqs.push(f);
        if (parallels.has([p, q].sort().join('~'))) out.parallelAndEqual.push(f);
      }
      if (sides.includes(p) && sides.includes(q) && p !== q && p.split('|').some((v) => q.split('|').includes(v))) out.adjacentSideEqs.push(f);
      if ((p === diags[0] && q === diags[1]) || (p === diags[1] && q === diags[0])) out.diagEqual.push(f);
    } else if (c.type === 'set-perpendicular') {
      const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
      if ((p === diags[0] && q === diags[1]) || (p === diags[1] && q === diags[0])) out.diagPerp.push(f);
    } else if (c.type === 'set-angle-ratio' && c.k === 1 && c.v1 !== c.v2 && inV(c.v1) && inV(c.v2)) {
      if ([c.a1, c.b1, c.a2, c.b2].every(inV)) {
        const i1 = V.indexOf(c.v1), i2 = V.indexOf(c.v2);
        if ((i1 + 2) % 4 === i2) out.oppositeAngleEqs.push(f);
        else out.baseAngleEqs.push(f);
      }
    } else if (c.type === 'set-angle' && inV(c.vertex) && [c.ray1, c.ray2].every(inV)) {
      if (Math.abs(c.value - 90) < 1e-6) out.rightAngle.push(f);
      numericAngles.push({ v: c.vertex, value: c.value, fact: f });
    }
  }
  // Both diagonals sharing ONE stated midpoint = "the diagonals bisect each other" (47).
  const midsOf = new Map<Id, Set<string>>();
  for (const mf of factsWith(ctx, (c) => c.type === 'midpoint')) {
    const m = cmdOf(mf) as Extract<AnyCommand, { type: 'midpoint' }>;
    const key = ek(m.a, m.b);
    if (diags.includes(key)) {
      (midsOf.get(m.id) ?? midsOf.set(m.id, new Set()).get(m.id)!).add(key);
      if (midsOf.get(m.id)!.size === 2) out.diagBisect.push(mf);
    }
  }
  for (let i = 0; i < numericAngles.length; i++) {
    for (let j = i + 1; j < numericAngles.length; j++) {
      const [x, y] = [numericAngles[i], numericAngles[j]];
      const adjacent = Math.abs(V.indexOf(x.v) - V.indexOf(y.v)) % 2 === 1;
      if (adjacent && Math.abs(x.value + y.value - 180) < 1e-6) out.consecutiveSum180.push(x.fact, y.fact);
    }
  }
  return out;
}

/** The shape `quadStatedRelations` returns (the quad-converse prompts pick from it). */
type QuadRelations = ReturnType<typeof quadStatedRelations>;

/**
 * A stated angle EQUALITY whose two vertices are joined by a drawn TRANSVERSAL and whose angles
 * each open toward the other vertex — the classic Z/F configuration. The OTHER arms split the class:
 * coinciding other-arms = two equal angles of ONE triangle (the isosceles converse, 23); distinct
 * other-arms = the parallels-converse prompt (5/7).
 */
function transversalAngleEqualities(ctx: MatchCtx): { fact: Fact; v1: Id; v2: Id; sharedApex: Id | null }[] {
  const out: { fact: Fact; v1: Id; v2: Id; sharedApex: Id | null }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'set-angle-ratio' || c.k !== 1 || c.v1 === c.v2) continue;
    if (!drawnEdge(ctx, c.v1, c.v2)) continue;
    if (![c.a1, c.b1].includes(c.v2) || ![c.a2, c.b2].includes(c.v1)) continue;
    const other1 = c.a1 === c.v2 ? c.b1 : c.a1;
    const other2 = c.a2 === c.v1 ? c.b2 : c.a2;
    out.push({ fact: f, v1: c.v1, v2: c.v2, sharedApex: other1 === other2 ? other1 : null });
  }
  return out;
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
    id: 1, type: 'P', salience: 'background', pointedness: 'generic', family: 'angles',
    en: 'Angles on a straight line (a linear pair) are supplementary — they sum to 180°.',
    he: 'זוויות צמודות משלימות זו את זו ל-180°.',
    match: (ctx) => {
      const fs = collinearFacts(ctx);
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 2, type: 'P', salience: 'background', pointedness: 'generic', family: 'angles',
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
    id, type: 'P', salience: 'background', pointedness: 'generic', family: 'parallels', en, he,
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
    id: 8, type: 'P', salience: 'headline', pointedness: 'standard', family: 'parallels',
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
    id: 3, type: 'P', salience: 'headline', pointedness: 'standard', family: 'parallels',
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
    id, type: 'P', salience: 'background', pointedness: 'generic', family: 'triangle', en, he,
    match: (ctx) => {
      const { facts, vertices, level } = triangleFacts(ctx);
      return facts.length || vertices.length ? match('certain', ids(facts), vertices, level) : null;
    },
  })),

  // ===== Isosceles =====
  {
    id: 22, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'isosceles',
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
    id, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'kite', en, he,
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
    id: 69, type: 'P', salience: 'headline', pointedness: 'standard', family: 'similarity',
    en: 'Similarity — Angle-Angle (AA).',
    he: 'משפט דמיון: זווית-זווית.',
    match: (ctx) => {
      const ev = similarityEvidence(ctx);
      if (ev) return match('certain', ids(ev.facts), ev.vertices, ev.level);
      // OBSERVED (T4): an ADR-224 similar class forced in every sample — the tool noticed for you,
      // so L3, amber, opt-in via the dial (never the L1 default view).
      const cls = ctx.observed?.similar?.find((s) => s.kind === 'similar');
      return cls ? match('possible', [], cls.triangles.flat(), 3) : null;
    },
  },
  {
    id: 71, type: 'P', salience: 'background', pointedness: 'standard', family: 'similarity',
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
    id: 28, type: 'P', salience: 'headline', pointedness: 'standard', family: 'triangle',
    en: 'Pythagoras — in a right triangle, the sum of the squares of the legs equals the square of the hypotenuse.',
    he: 'משפט פיתגורס: במשולש ישר זווית, סכום ריבועי הניצבים שווה לריבוע היתר.',
    match: (ctx) => {
      const fs = rightAngleFacts(ctx);
      if (fs.length) return match('certain', ids(fs), []);
      // OBSERVED (T4): a right angle FORCED in every sampled configuration (never stated) — the
      // classic emergent Thales/inscribed 90°. L3, amber, dial-gated.
      const forced = ctx.observed?.relations?.definiteAngles.find((a) => Math.abs(a.valueDeg - 90) < 0.5);
      return forced ? match('possible', [], [forced.vertex, forced.a, forced.b], 3) : null;
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
    id, type, salience: 'headline', pointedness: 'standard', family: 'triangle', en, he,
    match: (ctx) => {
      const q = shapeClassPresent(ctx, THIRTY_SIXTY_NINETY_KIND);
      return q ? match('certain', q.factIds, q.objIds, q.level) : null;
    },
  })),

  // ===== Circle — circumscribed/points (background) =====
  {
    id: 84, type: 'P', salience: 'background', pointedness: 'generic', family: 'circle',
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
    id: 91, type: 'P', salience: 'background', pointedness: 'generic', family: 'circle',
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
  // 87 is premise-announced two ways: a stated QUAD on a circle (`inscribedQuads`), OR — the operator's
  // B2c ruling (2026-07-03, ground-truth review): **≥4 points STATED on one circle**, a drawn quad NOT
  // required ("detectShapes also emits מרובע חסום במעגל for the concyclic set"). The old quad-only gate
  // ("a stray 4th concyclic point never trips it") predated that ruling and made 87 miss B9/B13/B17/B21
  // (two-circle figures whose members are all stated but never drawn as a quad) — the T1 wiring's widest
  // gap (ADR-243). 201 (Appendix C, a composed teaching corollary) stays quad-gated: it fires only when
  // the inscribed quad is a trapezoid (a `set-parallel` on its concyclic vertices).
  {
    id: 87, type: 'C', salience: 'headline', pointedness: 'pointed', subsumes: [99, 102], family: 'quad',
    en: 'A quadrilateral is cyclic if and only if a pair of opposite angles sums to 180°.',
    he: 'ניתן לחסום מרובע במעגל אם ורק אם סכום זוג זוויות נגדיות שווה ל-180°.',
    match: (ctx) => {
      const qs = inscribedQuads(ctx);
      if (qs.length) return match('certain', ids(qs.map((q) => q.fact)), qs.flatMap((q) => [q.circleId, ...q.vertices]));
      // B2c: ≥4 stated concyclic members announce the cyclic quad even with no quad drawn.
      const bare = ctx.circles.filter((c) => c.members.length >= 4);
      if (!bare.length) return null;
      const factIds = [...new Set(bare.flatMap((c) => c.members.flatMap((m) => definingFactIds(ctx, m))))];
      return match('certain', factIds, bare.flatMap((c) => [c.id, ...c.members]));
    },
  },
  {
    id: 201, type: 'P', salience: 'headline', pointedness: 'pointed', subsumes: [8], family: 'quad',
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
    id, type: 'P', salience: 'headline', pointedness: 'standard', family: 'quad', en, he,
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
    id: 92, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'circle',
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
      if (fs.length && given) return match('certain', ids(fs), []);
      // A stated ARC EQUALITY ("arc CA = arc AF") lowers to equal CENTRAL angles (ADR-116:
      // set-angle-ratio k=1 with both vertices at the centre) — the announcement 92 exists for,
      // missed until ADR-244 (B6's gap). Gated on a GIVEN centre like the arc-midpoint path.
      const arcEq = ctx.facts.filter((f) => {
        const c = cmdOf(f);
        if (c.type !== 'set-angle-ratio' || c.k !== 1 || c.v1 !== c.v2) return false;
        const circ = ctx.circles.find((x) => x.center === c.v1);
        return !!circ && centerGiven(ctx, circ) && [c.a1, c.b1, c.a2, c.b2].every((p) => circ.members.includes(p));
      });
      return arcEq.length ? match('certain', ids(arcEq), []) : null;
    },
  },
  {
    id: 94, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'circle',
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
    id: 97, type: 'P', salience: 'background', pointedness: 'generic', family: 'circle',
    en: 'The perpendicular from the center to a chord bisects the chord, its central angle, and its arc.',
    he: 'האנך ממרכז המעגל למיתר חוצה את המיתר, את הזווית המרכזית המתאימה ואת הקשת המתאימה.',
    match: (ctx) => {
      // Speaks about the centre → gate on a given centre (ADR-210).
      const c = circleWithGivenCenter(ctx, 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 98, type: 'P', salience: 'background', pointedness: 'generic', family: 'circle',
    en: 'The segment from the center that bisects a chord is perpendicular to it.',
    he: 'קטע ממרכז המעגל החוצה את המיתר מאונך למיתר.',
    match: (ctx) => {
      const c = circleWithGivenCenter(ctx, 2);
      return c ? match('certain', [], [c.id, c.center]) : null;
    },
  },
  {
    id: 99, type: 'P', salience: 'headline', pointedness: 'standard', family: 'circle',
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
    id: 102, type: 'P', salience: 'headline', pointedness: 'standard', family: 'circle',
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
    id: 103, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'circle',
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
    id: 104, type: 'C', salience: 'headline', pointedness: 'pointed', family: 'circle',
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
    id: 105, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'tangent',
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
    id: 107, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'tangent',
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
    id: 108, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'tangent',
    en: 'Two tangents to a circle from the same external point are equal.',
    he: 'שני משיקים למעגל היוצאים מאותה נקודה שווים זה לזה.',
    match: (ctx) => {
      const byCircle = tangentsByCircle(ctx);
      for (const [circle, e] of byCircle) if (e.ats.length >= 2) return match('certain', e.factIds, [circle, ...e.ats]);
      return null;
    },
  },
  {
    id: 109, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'tangent',
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
    id: 'A2', type: 'O', salience: 'background', pointedness: 'generic', family: 'circle',
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
    id: 'A3', type: 'O', salience: 'background', pointedness: 'generic', family: 'circle',
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
    id: 'A4', type: 'O', salience: 'background', pointedness: 'generic', family: 'tangent',
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
    id: 'A5', type: 'O', salience: 'background', pointedness: 'generic', family: 'triangle',
    en: "In a right triangle, each leg is the geometric mean of the hypotenuse and the leg's projection on it.",
    he: 'במשולש ישר זווית, הניצב הוא ממוצע הנדסי של היתר ושל היטל הניצב על היתר.',
    match: (ctx) => {
      const a = altitudeToHypotenuse(ctx);
      return a ? match('possible', a.factIds, a.objIds) : null;
    },
  },
  {
    id: 'A6', type: 'O', salience: 'background', pointedness: 'generic', family: 'triangle',
    en: 'In a right triangle, the altitude to the hypotenuse is the geometric mean of the two projections of the legs.',
    he: 'הגובה ליתר במשולש ישר זווית הוא ממוצע הנדסי של היטלי הניצבים על היתר.',
    match: (ctx) => {
      const a = altitudeToHypotenuse(ctx);
      return a ? match('possible', a.factIds, a.objIds) : null;
    },
  },
  {
    id: 'B3', type: 'O', salience: 'background', pointedness: 'generic', family: 'circle',
    en: 'The line of centers of two intersecting circles perpendicularly bisects their common chord.',
    he: 'קטע המרכזים של שני מעגלים נחתכים חוצה את המיתר המשותף ומאונך לו.',
    match: (ctx) => {
      const r = intersectingCircles(ctx);
      return r ? match('possible', r.factIds, r.objIds) : null;
    },
  },

  // ===== T2 fill (ADR-243) — medians/centroid, midsegments, congruence, bisectors =====
  // Statements byte-exact from 07 (the integrity guard enforces). Priority per the measured fill
  // order (reports/theorem-fill-order.md): 80/15-17/62/78 top the absent-id demand; 18-21 realise
  // the operator's own motivating example ("3 equal segments → probably congruent triangles").

  // ----- Medians / centroid (15-17; family 'triangle' — no separate fold, T3 may re-family) -----
  {
    id: 15, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'The three medians of a triangle meet at one point (the centroid).',
    he: 'שלושת התיכונים במשולש נחתכים בנקודה אחת.',
    match: (ctx) => {
      // ≥2 stated medians of ONE triangle announce the concurrency (the two-bisectors→80 precedent).
      const g = medianGroups(ctx)[0];
      return g ? match('certain', ids(g.facts), g.objIds) : null;
    },
  },
  {
    id: 16, type: 'P', salience: 'background', pointedness: 'generic', family: 'triangle',
    en: 'A median divides a triangle into two triangles of equal area.',
    he: 'תיכון במשולש מחלק את המשולש לשני משולשים שווי שטח.',
    match: (ctx) => {
      const ms = medianFacts(ctx);
      if (!ms.length) return null;
      return match('certain', ids(ms.flatMap((m) => m.facts)), ms.flatMap((m) => [m.apex, m.mid, ...m.base]));
    },
  },
  {
    id: 17, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'The centroid divides each median in ratio 2:1 (the part nearer the vertex is twice the other).',
    he: 'נקודת חיתוך התיכונים מחלקת כל תיכון ביחס 2:1 (החלק הקרוב לקודקוד ארוך פי 2 מהחלק האחר).',
    match: (ctx) => {
      // Same premise as 15: the centroid exists once two medians of one triangle are stated.
      const g = medianGroups(ctx)[0];
      return g ? match('certain', ids(g.facts), g.objIds) : null;
    },
  },

  // ----- Congruence criteria (18-21) -----
  // One constellation matcher: stated equalities/angle-equalities distributed over two triangles
  // (+ any shared side). A stated "△ABC ≅ △DEF" lowers to exactly 3 side equalities, so it lands as
  // a full SSS (certain); a PARTIAL constellation surfaces the specific criterion it suggests, amber.
  {
    id: 18, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'congruence',
    en: 'Congruence — Side-Angle-Side (SAS).',
    he: 'משפט חפיפה: צלע-זווית-צלע.',
    match: (ctx) => {
      const e = congruenceEvidence(ctx).find((x) => x.kind === 18);
      return e ? match(e.tier, ids(e.facts), e.objIds) : null;
    },
  },
  {
    id: 19, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'congruence',
    en: 'Congruence — Angle-Side-Angle (ASA).',
    he: 'משפט חפיפה: זווית-צלע-זווית.',
    match: (ctx) => {
      const e = congruenceEvidence(ctx).find((x) => x.kind === 19);
      return e ? match(e.tier, ids(e.facts), e.objIds) : null;
    },
  },
  {
    id: 20, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'congruence',
    en: 'Congruence — Side-Side-Side (SSS).',
    he: 'משפט חפיפה: צלע-צלע-צלע.',
    match: (ctx) => {
      const e = congruenceEvidence(ctx).find((x) => x.kind === 20);
      if (e) return match(e.tier, ids(e.facts), e.objIds);
      // OBSERVED (T4): an ADR-224 CONGRUENT class — detection verified equal corresponding sides in
      // every sample, which is precisely SSS's premise. L3, amber, dial-gated.
      const cls = ctx.observed?.similar?.find((s) => s.kind === 'congruent');
      return cls ? match('possible', [], cls.triangles.flat(), 3) : null;
    },
  },
  {
    id: 21, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'congruence',
    en: 'Congruence — two sides and the angle opposite the larger of the two.',
    he: 'משפט חפיפה: שתי צלעות והזווית שמול הצלע הגדולה מבין השתיים.',
    match: (ctx) => {
      const e = congruenceEvidence(ctx).find((x) => x.kind === 21);
      return e ? match(e.tier, ids(e.facts), e.objIds) : null;
    },
  },

  // ----- Midsegments (62-67) -----
  {
    id: 62, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'midsegment',
    en: 'A triangle midsegment is parallel to the third side and equals half of it.',
    he: 'קטע אמצעים במשולש מקביל לצלע השלישית ושווה למחציתה.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'triangle');
      return m ? match('certain', ids(m.facts), m.objIds, m.level) : null;
    },
  },
  {
    id: 63, type: 'P', salience: 'background', pointedness: 'standard', family: 'midsegment',
    en: 'A line bisecting one side of a triangle and parallel to a second side bisects the third side.',
    he: 'ישר החוצה צלע אחת במשולש ומקביל לצלע שנייה חוצה את הצלע השלישית.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'triangle');
      return m ? match('certain', ids(m.facts), m.objIds, m.level) : null;
    },
  },
  {
    id: 64, type: 'C', salience: 'background', pointedness: 'standard', family: 'midsegment',
    en: 'A segment with endpoints on two sides, parallel to the third and half its length, is a midsegment.',
    he: 'קטע שקצותיו על שתי צלעות משולש, מקביל לצלע השלישית ושווה למחציתה, הוא קטע אמצעים.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'triangle');
      return m ? match('possible', ids(m.facts), m.objIds, m.level) : null;
    },
  },
  {
    id: 65, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'midsegment',
    en: 'The trapezoid midsegment is parallel to the bases and equals half their sum.',
    he: 'קטע האמצעים בטרפז מקביל לבסיסים ושווה למחצית סכומם.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'trapezoid');
      return m ? match('certain', ids(m.facts), m.objIds, m.level) : null;
    },
  },
  {
    id: 66, type: 'P', salience: 'background', pointedness: 'standard', family: 'midsegment',
    en: 'In a trapezoid, a line bisecting one leg and parallel to the bases bisects the other leg.',
    he: 'בטרפז, ישר החוצה שוק אחת ומקביל לבסיסים חוצה את השוק השנייה.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'trapezoid');
      return m ? match('certain', ids(m.facts), m.objIds, m.level) : null;
    },
  },
  {
    id: 67, type: 'C', salience: 'background', pointedness: 'standard', family: 'midsegment',
    en: 'A segment joining the two legs of a trapezoid, parallel to the bases and equal to half their sum, is the midsegment.',
    he: 'קטע המחבר שתי שוקיים בטרפז, מקביל לבסיסים ושווה למחצית סכומם, הוא קטע אמצעים.',
    match: (ctx) => {
      const m = midsegmentFacts(ctx).find((x) => x.kind === 'trapezoid');
      return m ? match('possible', ids(m.facts), m.objIds, m.level) : null;
    },
  },

  // ----- Angle bisectors (75, 78, 80; family 'triangle' — T3 may re-family) -----
  {
    id: 75, type: 'P', salience: 'background', pointedness: 'generic', family: 'triangle',
    en: 'The angle bisector is the locus of all points equidistant from the sides of the angle.',
    he: 'חוצה הזווית הוא המקום הגיאומטרי של כל הנקודות הנמצאות במרחקים שווים משוקי הזווית.',
    match: (ctx) => {
      const bs = bisectorStatements(ctx);
      if (!bs.length) return null;
      return match('certain', ids(bs.map((b) => b.fact)), bs.map((b) => b.vertex));
    },
  },
  {
    id: 78, type: 'P', salience: 'headline', pointedness: 'standard', family: 'triangle',
    en: "Every point on an angle bisector is equidistant from the angle's sides.",
    he: 'כל נקודה על חוצה זווית נמצאת במרחקים שווים משוקי הזווית.',
    match: (ctx) => {
      const bs = bisectorStatements(ctx);
      if (!bs.length) return null;
      return match('certain', ids(bs.map((b) => b.fact)), bs.map((b) => b.vertex));
    },
  },
  {
    id: 80, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'The three angle bisectors of a triangle meet at one point — the incenter (center of the inscribed circle).',
    he: 'שלושת חוצי הזוויות של משולש נחתכים בנקודה אחת, שהיא מרכז המעגל החסום.',
    match: (ctx) => {
      const c = bisectorConcurrency(ctx);
      return c ? match('certain', ids(c.facts), c.objIds) : null;
    },
  },

  // ===== Stage-2 fill (ADR-245) — right triangle, isosceles, Thales, parallels-converses,
  // circle remainder, quad converses, sums & loci. Converses (type C) surface as AMBER recognition
  // prompts the moment their property side is STATED (operator ruling D2). =====

  // ----- Right triangle (30-32) -----
  {
    id: 31, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'In a right triangle, the median to the hypotenuse equals half the hypotenuse.',
    he: 'במשולש ישר זווית התיכון ליתר שווה למחצית היתר.',
    match: (ctx) => {
      // A stated right triangle + a stated median TO ITS HYPOTENUSE.
      for (const rt of rightTriangleFacts(ctx)) {
        const m = medianFacts(ctx).find((x) => ek(x.base[0], x.base[1]) === ek(rt.hyp[0], rt.hyp[1]) && x.apex === rt.rightVertex);
        if (m) return match('certain', ids([rt.fact, ...m.facts]), [...rt.ids, m.mid]);
      }
      return null;
    },
  },
  {
    id: 30, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'congruence',
    en: 'Two right triangles with an equal leg and an equal hypotenuse are congruent.',
    he: 'שני משולשים ישרי זווית שלהם ניצב שווה ויתר שווה חופפים זה לזה.',
    match: (ctx) => {
      // TWO stated right triangles + a stated hypotenuse-pair equality + a stated leg equality.
      const rts = rightTriangleFacts(ctx);
      for (let i = 0; i < rts.length; i++) {
        for (let j = i + 1; j < rts.length; j++) {
          const [r1, r2] = [rts[i], rts[j]];
          const hyp1 = ek(r1.hyp[0], r1.hyp[1]), hyp2 = ek(r2.hyp[0], r2.hyp[1]);
          const legs1 = [ek(r1.rightVertex, r1.hyp[0]), ek(r1.rightVertex, r1.hyp[1])];
          const legs2 = [ek(r2.rightVertex, r2.hyp[0]), ek(r2.rightVertex, r2.hyp[1])];
          let hypEq: Fact | null = null;
          let legEq: Fact | null = null;
          for (const f of ctx.facts) {
            const c = cmdOf(f);
            if (c.type !== 'set-equal' || c.soft) continue;
            const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
            if ((p === hyp1 && q === hyp2) || (p === hyp2 && q === hyp1)) hypEq = f;
            if ((legs1.includes(p) && legs2.includes(q)) || (legs1.includes(q) && legs2.includes(p))) legEq = f;
          }
          if (hypEq && legEq) return match('possible', ids([r1.fact, r2.fact, hypEq, legEq]), [...new Set([...r1.ids, ...r2.ids])]);
        }
      }
      return null;
    },
  },
  {
    id: 32, type: 'C', salience: 'headline', pointedness: 'standard', family: 'triangle',
    en: 'A triangle in which a median equals half the side it bisects is right-angled.',
    he: 'משולש בו התיכון שווה למחצית הצלע אותה הוא חוצה הוא ישר זווית.',
    match: (ctx) => {
      // Property side stated: a median + a stated |median| = ½·|base| ratio (k=0.5 or the reverse).
      for (const m of medianFacts(ctx)) {
        const med = ek(m.apex, m.mid), base = ek(m.base[0], m.base[1]);
        for (const f of ctx.facts) {
          const c = cmdOf(f);
          if (c.type !== 'set-ratio' || c.add) continue;
          const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
          if ((p === med && q === base && Math.abs(c.k - 0.5) < 1e-9) || (p === base && q === med && Math.abs(c.k - 2) < 1e-9)) {
            return match('possible', ids([...m.facts, f]), [m.apex, m.mid, ...m.base]);
          }
        }
      }
      return null;
    },
  },

  // ----- Isosceles converses / coincidences (23-27) -----
  {
    id: 23, type: 'C', salience: 'headline', pointedness: 'standard', family: 'isosceles',
    en: 'A triangle with two equal angles is isosceles.',
    he: 'משולש שבו שתי זוויות שוות הוא משולש שווה שוקיים.',
    match: (ctx) => {
      // Two stated equal angles SHARING their third arm (one triangle's base angles).
      const hit = transversalAngleEqualities(ctx).find((e) => e.sharedApex !== null);
      return hit ? match('possible', [hit.fact.id], [hit.v1, hit.v2, hit.sharedApex!]) : null;
    },
  },
  {
    id: 24, type: 'P', salience: 'background', pointedness: 'generic', family: 'isosceles',
    en: 'In an isosceles triangle, the apex-angle bisector, the median to the base, and the altitude to the base coincide.',
    he: 'במשולש שווה שוקיים, חוצה זווית הראש, התיכון לבסיס והגובה לבסיס מתלכדים.',
    match: (ctx) => {
      const ev = isoscelesEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },
  {
    id: 25, type: 'C', salience: 'background', pointedness: 'standard', family: 'isosceles',
    en: 'If an angle bisector is also an altitude, the triangle is isosceles.',
    he: 'אם במשולש חוצה זווית הוא גובה, אז המשולש שווה שוקיים.',
    match: (ctx) => {
      // A stated bisector at V + a stated altitude FROM V (a foot dropped from the same vertex).
      for (const b of bisectorStatements(ctx)) {
        const alt = altitudeFootFacts(ctx).find((a) => a.from === b.vertex);
        if (alt) return match('possible', ids([b.fact, alt.fact]), [b.vertex, alt.foot]);
      }
      return null;
    },
  },
  {
    id: 26, type: 'C', salience: 'background', pointedness: 'standard', family: 'isosceles',
    en: 'If an angle bisector is also a median, the triangle is isosceles.',
    he: 'אם במשולש חוצה זווית הוא תיכון, אז המשולש שווה שוקיים.',
    match: (ctx) => {
      // A stated bisector at V + a stated median FROM V.
      for (const b of bisectorStatements(ctx)) {
        const med = medianFacts(ctx).find((m) => m.apex === b.vertex);
        if (med) return match('possible', ids([b.fact, ...med.facts]), [b.vertex, med.mid]);
      }
      return null;
    },
  },
  {
    id: 27, type: 'C', salience: 'background', pointedness: 'standard', family: 'isosceles',
    en: 'If an altitude is also a median, the triangle is isosceles.',
    he: 'אם במשולש גובה הוא תיכון, אז המשולש שווה שוקיים.',
    match: (ctx) => {
      // A stated altitude whose FOOT is a stated midpoint of its base.
      for (const a of altitudeFootFacts(ctx)) {
        const mid = factsWith(ctx, (c) => c.type === 'midpoint').find((mf) => {
          const m = cmdOf(mf) as Extract<AnyCommand, { type: 'midpoint' }>;
          return m.id === a.foot && ek(m.a, m.b) === ek(a.base[0], a.base[1]);
        });
        if (mid) return match('possible', ids([a.fact, mid]), [a.from, a.foot, ...a.base]);
      }
      return null;
    },
  },

  // ----- Thales / proportion (72-74; family 'similarity' — the proportion band) -----
  {
    id: 73, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'similarity',
    en: 'Extended Thales — a line parallel to one side of a triangle cuts the other two sides (or their extensions) in proportional segments.',
    he: 'משפט תאלס המורחב: ישר המקביל לאחת מצלעות המשולש חותך את שתי הצלעות האחרות (או את המשכיהן) בקטעים פרופורציוניים.',
    match: (ctx) => {
      // The ADR-220 parallel-cut evidence IS extended-Thales's premise (a stated ∥ to a side).
      const ev = similarityEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },
  {
    id: 72, type: 'P', salience: 'background', pointedness: 'generic', family: 'similarity',
    en: 'Thales — two parallel lines cutting the sides of an angle cut off proportional segments.',
    he: 'משפט תאלס: שני ישרים מקבילים החותכים שוקי זווית מקצים עליהם קטעים פרופורציוניים.',
    match: (ctx) => {
      const ev = similarityEvidence(ctx);
      return ev ? match('certain', ids(ev.facts), ev.vertices, ev.level) : null;
    },
  },
  {
    id: 74, type: 'C', salience: 'background', pointedness: 'standard', family: 'similarity',
    en: 'Converse of Thales — two lines that cut off four proportional segments on the sides of an angle are parallel.',
    he: 'משפט הפוך לתאלס: שני ישרים המקצים על שוקי זווית ארבעה קטעים פרופורציוניים הם ישרים מקבילים.',
    match: (ctx) => {
      // Property side stated: two set-ratio facts with the SAME k whose segments share an apex.
      const ratios = ctx.facts.filter((f) => cmdOf(f).type === 'set-ratio');
      for (let i = 0; i < ratios.length; i++) {
        for (let j = i + 1; j < ratios.length; j++) {
          const c1 = cmdOf(ratios[i]) as Extract<AnyCommand, { type: 'set-ratio' }>;
          const c2 = cmdOf(ratios[j]) as Extract<AnyCommand, { type: 'set-ratio' }>;
          if (c1.add || c2.add || Math.abs(c1.k - c2.k) > 1e-9) continue;
          const shared = [c1.a, c1.b].filter((v) => [c2.a, c2.b].includes(v));
          if (shared.length === 1) return match('possible', ids([ratios[i], ratios[j]]), [shared[0]]);
        }
      }
      return null;
    },
  },

  // ----- Parallels converses (5/7/9) — amber prompts on the stated Z/F configuration -----
  {
    id: 5, type: 'C', salience: 'headline', pointedness: 'standard', family: 'parallels',
    en: 'If a transversal creates a pair of equal alternate angles, the two lines are parallel.',
    he: 'שני ישרים נחתכים על ידי ישר שלישי; אם נוצרו זוג זוויות מתחלפות שוות, אז שני הישרים מקבילים.',
    match: (ctx) => {
      // A stated angle equality across a drawn transversal whose other arms are DISTINCT (the Z
      // configuration). Alternate-vs-corresponding needs side-of-line info the symbolic layer lacks,
      // so 5 and 7 both prompt on this evidence (T3's authoring may split them).
      const hit = transversalAngleEqualities(ctx).find((e) => e.sharedApex === null);
      return hit ? match('possible', [hit.fact.id], [hit.v1, hit.v2]) : null;
    },
  },
  {
    id: 7, type: 'C', salience: 'background', pointedness: 'standard', family: 'parallels',
    en: 'If a transversal creates a pair of equal corresponding angles, the two lines are parallel.',
    he: 'שני ישרים נחתכים על ידי ישר שלישי; אם נוצרו זוג זוויות מתאימות שוות, אז שני הישרים מקבילים.',
    match: (ctx) => {
      const hit = transversalAngleEqualities(ctx).find((e) => e.sharedApex === null);
      return hit ? match('possible', [hit.fact.id], [hit.v1, hit.v2]) : null;
    },
  },
  {
    id: 9, type: 'C', salience: 'background', pointedness: 'standard', family: 'parallels',
    en: 'If a transversal creates co-interior angles summing to 180°, the two lines are parallel.',
    he: 'שני ישרים נחתכים על ידי ישר שלישי; אם סכום זוג זוויות חד-צדדיות הוא 180°, אז שני הישרים מקבילים.',
    match: (ctx) => {
      // Two stated NUMERIC angles at the ends of a drawn transversal summing to 180°.
      const angles = ctx.facts
        .map((f) => ({ f, c: cmdOf(f) }))
        .filter((x): x is { f: Fact; c: Extract<AnyCommand, { type: 'set-angle' }> } => x.c.type === 'set-angle');
      for (let i = 0; i < angles.length; i++) {
        for (let j = i + 1; j < angles.length; j++) {
          const [x, y] = [angles[i], angles[j]];
          if (Math.abs(x.c.value + y.c.value - 180) > 1e-6) continue;
          if (x.c.vertex === y.c.vertex || !drawnEdge(ctx, x.c.vertex, y.c.vertex)) continue;
          if ([x.c.ray1, x.c.ray2].includes(y.c.vertex) && [y.c.ray1, y.c.ray2].includes(x.c.vertex)) {
            return match('possible', ids([x.f, y.f]), [x.c.vertex, y.c.vertex]);
          }
        }
      }
      return null;
    },
  },

  // ----- Circle remainder (93/95/100/101/106) -----
  {
    id: 93, type: 'P', salience: 'headline', pointedness: 'standard', family: 'circle',
    en: 'Two central angles are equal if and only if their corresponding chords are equal.',
    he: 'במעגל, שתי זוויות מרכזיות שוות זו לזו אם ורק אם המיתרים המתאימים להן שווים.',
    match: (ctx) => {
      // A CENTRAL-angle theorem → gated on a given centre (ADR-210), over the equal-chords evidence.
      const fs = equalChordFacts(ctx);
      if (!fs.length) return null;
      const anyGiven = ctx.circles.some((c) => centerGiven(ctx, c));
      return anyGiven ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 95, type: 'P', salience: 'background', pointedness: 'generic', family: 'circle',
    en: 'Equal chords are equidistant from the center.',
    he: 'מיתרים השווים זה לזה נמצאים במרחקים שווים ממרכז המעגל.',
    match: (ctx) => {
      const fs = equalChordFacts(ctx);
      if (!fs.length) return null;
      const anyGiven = ctx.circles.some((c) => centerGiven(ctx, c));
      return anyGiven ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 100, type: 'P', salience: 'headline', pointedness: 'standard', family: 'circle',
    en: 'Equal inscribed angles subtend equal arcs and equal chords.',
    he: 'במעגל, לזוויות היקפיות שוות קשתות שוות ומיתרים שווים.',
    match: (ctx) => {
      // Stated equal INSCRIBED angles: both vertices and all arms are members of one circle.
      for (const f of ctx.facts) {
        const c = cmdOf(f);
        if (c.type !== 'set-angle-ratio' || c.k !== 1 || c.v1 === c.v2) continue;
        const circ = circleContaining(ctx, [c.v1, c.v2, c.a1, c.b1, c.a2, c.b2]);
        if (circ) return match('certain', [f.id], [circ.id, c.v1, c.v2]);
      }
      return null;
    },
  },
  {
    id: 101, type: 'P', salience: 'headline', pointedness: 'standard', family: 'circle',
    en: 'Equal arcs subtend equal inscribed angles.',
    he: 'במעגל, לקשתות שוות מתאימות זוויות היקפיות שוות.',
    match: (ctx) => {
      // Equal ARCS stated — an arc-midpoint construct, or the ADR-116 central-angle equality form.
      const arcs = factsWith(ctx, (c) => c.type === 'arc-midpoint');
      const arcEq = ctx.facts.filter((f) => {
        const c = cmdOf(f);
        if (c.type !== 'set-angle-ratio' || c.k !== 1 || c.v1 !== c.v2) return false;
        const circ = ctx.circles.find((x) => x.center === c.v1);
        return !!circ && [c.a1, c.b1, c.a2, c.b2].every((p) => circ.members.includes(p));
      });
      const fs = [...arcs, ...arcEq];
      return fs.length ? match('certain', ids(fs), []) : null;
    },
  },
  {
    id: 106, type: 'C', salience: 'headline', pointedness: 'standard', family: 'tangent',
    en: 'A line perpendicular to a radius at its endpoint is tangent to the circle.',
    he: 'ישר המאונך לרדיוס בקצהו הוא משיק למעגל.',
    match: (ctx) => {
      // The student THEMSELVES stated the ⟂-to-a-radius (a non-`implicit` set-perpendicular fact —
      // the tangent-word lowerings mark theirs `implicit`, so a stated TANGENT doesn't echo its own
      // converse back).
      for (const f of ctx.facts) {
        const c = cmdOf(f);
        if (c.type !== 'set-perpendicular' || c.implicit) continue;
        const sides: [Id, Id, Id, Id][] = [[c.a, c.b, c.c, c.d], [c.c, c.d, c.a, c.b]];
        for (const [ra, rb, ta, tb] of sides) {
          const circ = ctx.circles.find((k) => k.center === ra && k.members.includes(rb));
          if (circ && (rb === ta || rb === tb)) return match('possible', [f.id], [circ.id, rb]);
        }
      }
      return null;
    },
  },

  // ----- Quadrilateral converses (40/42/44/45/47/49/51/53/54/57-61) — amber recognition (D2) -----
  ...([
    [44, 'headline', 'A quadrilateral with both pairs of opposite sides equal is a parallelogram.', 'מרובע שבו כל שתי צלעות נגדיות שוות זו לזו הוא מקבילית.',
      (r: QuadRelations) => (r.oppositeSideEqs.length >= 2 ? r.oppositeSideEqs : null)],
    [45, 'headline', 'A quadrilateral with one pair of sides both parallel and equal is a parallelogram.', 'מרובע שבו זוג צלעות מקבילות ושוות הוא מקבילית.',
      (r: QuadRelations) => (r.parallelAndEqual.length ? r.parallelAndEqual : null)],
    [47, 'headline', 'A quadrilateral whose diagonals bisect each other is a parallelogram.', 'מרובע שבו האלכסונים חוצים זה את זה הוא מקבילית.',
      (r: QuadRelations) => (r.diagBisect.length ? r.diagBisect : null)],
    [49, 'background', 'A quadrilateral with both pairs of opposite angles equal is a parallelogram.', 'מרובע שבו כל שתי זוויות נגדיות שוות הוא מקבילית.',
      (r: QuadRelations) => (r.oppositeAngleEqs.length >= 2 ? r.oppositeAngleEqs : null)],
    [51, 'background', 'A quadrilateral in which every pair of consecutive angles sums to 180° is a parallelogram.', 'מרובע שבו הסכום של כל שתי זוויות סמוכות הוא 180° הוא מקבילית.',
      (r: QuadRelations) => (r.consecutiveSum180.length ? r.consecutiveSum180 : null)],
  ] as [number, Salience, string, string, (r: QuadRelations) => Fact[] | null][]).map(
    ([id, salience, en, he, pick]): TheoremDef => ({
      id, type: 'C', salience, pointedness: 'standard', family: 'quad', en, he,
      match: (ctx) => {
        // A GENERAL stated quad (not already a declared parallelogram — the converse prompt is
        // pointless on a shape already stated to be one).
        for (const q of quadFacts(ctx)) {
          const r = quadStatedRelations(ctx, q.vertices);
          const fs = pick(r);
          if (fs) return match('possible', ids([q.fact, ...fs]), q.vertices);
        }
        return null;
      },
    }),
  ),
  ...([
    [53, 'A parallelogram with equal diagonals is a rectangle.', 'מקבילית שבה האלכסונים שווים זה לזה היא מלבן.',
      (r: QuadRelations) => (r.diagEqual.length ? r.diagEqual : null)],
    [54, 'A parallelogram with a right angle is a rectangle.', 'מקבילית שבה יש זווית ישרה היא מלבן.',
      (r: QuadRelations) => (r.rightAngle.length ? r.rightAngle : null)],
    [58, 'A parallelogram with perpendicular diagonals is a rhombus.', 'מקבילית שבה האלכסונים מאונכים זה לזה היא מעוין.',
      (r: QuadRelations) => (r.diagPerp.length ? r.diagPerp : null)],
    [59, 'A parallelogram with two equal adjacent sides is a rhombus.', 'מקבילית שבה שתי צלעות סמוכות שוות היא מעוין.',
      (r: QuadRelations) => (r.adjacentSideEqs.length ? r.adjacentSideEqs : null)],
  ] as [number, string, string, (r: QuadRelations) => Fact[] | null][]).map(
    ([id, en, he, pick]): TheoremDef => ({
      id, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad', en, he,
      match: (ctx) => {
        // The property stated ON a declared PARALLELOGRAM (not one already declared the target shape).
        for (const q of statedQuadShapes(ctx, ['parallelogram'])) {
          const r = quadStatedRelations(ctx, q.ids);
          const fs = pick(r);
          if (fs) return match('possible', ids([q.fact, ...fs]), q.ids);
        }
        return null;
      },
    }),
  ),
  {
    id: 57, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad',
    en: 'A parallelogram in which a diagonal bisects an angle is a rhombus.',
    he: 'מקבילית שבה אלכסון הוא חוצה זווית היא מעוין.',
    match: (ctx) => {
      // A declared parallelogram + a stated bisector AT one of its vertices.
      for (const q of statedQuadShapes(ctx, ['parallelogram'])) {
        for (const b of bisectorStatements(ctx)) {
          if (q.ids.includes(b.vertex)) return match('possible', ids([q.fact, b.fact]), q.ids);
        }
      }
      return null;
    },
  },
  {
    id: 60, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad',
    en: 'A rhombus with equal diagonals is a square.',
    he: 'מעוין שבו האלכסונים שווים הוא ריבוע.',
    match: (ctx) => {
      for (const q of statedQuadShapes(ctx, ['rhombus'])) {
        const r = quadStatedRelations(ctx, q.ids);
        if (r.diagEqual.length) return match('possible', ids([q.fact, ...r.diagEqual]), q.ids);
      }
      return null;
    },
  },
  {
    id: 61, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad',
    en: 'A rectangle with equal adjacent sides is a square.',
    he: 'מלבן בו הצלעות הסמוכות שוות הוא ריבוע.',
    match: (ctx) => {
      for (const q of statedQuadShapes(ctx, ['rectangle'])) {
        const r = quadStatedRelations(ctx, q.ids);
        if (r.adjacentSideEqs.length) return match('possible', ids([q.fact, ...r.adjacentSideEqs]), q.ids);
      }
      return null;
    },
  },
  {
    id: 40, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad',
    en: 'A trapezoid in which the angles at the same base are equal is isosceles.',
    he: 'טרפז בו הזוויות שליד אותו בסיס שוות זו לזו הוא טרפז שווה שוקיים.',
    match: (ctx) => {
      for (const q of statedQuadShapes(ctx, ['trapezoid'])) {
        const r = quadStatedRelations(ctx, q.ids);
        if (r.baseAngleEqs.length) return match('possible', ids([q.fact, ...r.baseAngleEqs]), q.ids);
      }
      return null;
    },
  },
  {
    id: 42, type: 'C', salience: 'headline', pointedness: 'standard', family: 'quad',
    en: 'A trapezoid with equal diagonals is isosceles.',
    he: 'טרפז בו האלכסונים שווים זה לזה הוא טרפז שווה שוקיים.',
    match: (ctx) => {
      for (const q of statedQuadShapes(ctx, ['trapezoid'])) {
        const r = quadStatedRelations(ctx, q.ids);
        if (r.diagEqual.length) return match('possible', ids([q.fact, ...r.diagEqual]), q.ids);
      }
      return null;
    },
  },

  // ----- Angle sums (35/36) -----
  {
    id: 35, type: 'P', salience: 'background', pointedness: 'generic', family: 'quad',
    en: 'The interior angles of a quadrilateral sum to 360°.',
    he: 'סכום הזוויות במרובע הוא 360°.',
    match: (ctx) => {
      const qs = [...quadFacts(ctx), ...statedQuadShapes(ctx, ['parallelogram', 'rectangle', 'rhombus', 'square', 'trapezoid'])];
      return qs.length ? match('certain', ids(qs.map((q) => q.fact)), []) : null;
    },
  },
  {
    id: 36, type: 'P', salience: 'background', pointedness: 'generic', family: 'quad',
    en: 'The interior angles of a convex n-gon sum to (n−2)·180°.',
    he: 'סכום הזוויות הפנימיות של מצולע קמור הוא (n−2)·180°.',
    match: (ctx) => {
      const ps = factsWith(ctx, (c) => c.type === 'polygon' && c.ids.length >= 5);
      return ps.length ? match('certain', ids(ps), []) : null;
    },
  },

  // ----- Perpendicular bisector, concurrency, incircle, regular polygons (82/83/85/86/81/89/90/77) -----
  {
    id: 82, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'Every point on the perpendicular bisector of a segment is equidistant from its endpoints.',
    he: 'כל נקודה על האנך האמצעי של קטע נמצאת במרחקים שווים מקצות הקטע.',
    match: (ctx) => {
      const bs = perpBisectorFacts(ctx);
      if (!bs.length) return null;
      return match('certain', ids(bs.flatMap((b) => b.facts)), bs.flatMap((b) => [b.through, ...b.seg]));
    },
  },
  {
    id: 83, type: 'C', salience: 'background', pointedness: 'standard', family: 'triangle',
    en: "A point equidistant from a segment's endpoints lies on its perpendicular bisector.",
    he: 'כל נקודה הנמצאת במרחקים שווים מקצות קטע נמצאת על האנך האמצעי.',
    match: (ctx) => {
      // A stated |XA| = |XB| (shared first endpoint X) with the segment A–B drawn.
      for (const f of ctx.facts) {
        const c = cmdOf(f);
        if (c.type !== 'set-equal' || c.soft) continue;
        const pairs: [Id, Id, Id, Id][] = [[c.a, c.b, c.c, c.d], [c.b, c.a, c.c, c.d], [c.a, c.b, c.d, c.c], [c.b, c.a, c.d, c.c]];
        for (const [x1, e1, x2, e2] of pairs) {
          if (x1 === x2 && e1 !== e2 && drawnEdge(ctx, e1, e2)) return match('possible', [f.id], [x1, e1, e2]);
        }
      }
      return null;
    },
  },
  {
    id: 85, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'The three perpendicular bisectors of a triangle meet at one point — the circumcenter.',
    he: 'במשולש, שלושת האנכים האמצעיים נחתכים בנקודה אחת, שהיא מרכז המעגל החוסם.',
    match: (ctx) => {
      // ≥2 stated ⟂-bisectors of two DIFFERENT sides of one stated triangle.
      const bs = perpBisectorFacts(ctx);
      for (const t of triangleVertexSets(ctx)) {
        const inTri = bs.filter((b) => b.seg.every((v) => t.ids.includes(v)));
        if (new Set(inTri.map((b) => ek(b.seg[0], b.seg[1]))).size >= 2) {
          return match('certain', ids(inTri.flatMap((b) => b.facts)), [...t.ids]);
        }
      }
      return null;
    },
  },
  {
    id: 86, type: 'P', salience: 'headline', pointedness: 'pointed', family: 'triangle',
    en: 'The three altitudes of a triangle meet at one point (the orthocenter).',
    he: 'שלושת הגבהים במשולש נחתכים בנקודה אחת.',
    match: (ctx) => {
      // ≥2 stated altitudes from DISTINCT vertices of one stated triangle.
      const alts = altitudeFootFacts(ctx);
      for (const t of triangleVertexSets(ctx)) {
        const inTri = alts.filter((a) => t.ids.includes(a.from) && a.base.every((v) => t.ids.includes(v)));
        if (new Set(inTri.map((a) => a.from)).size >= 2) return match('certain', ids(inTri.map((a) => a.fact)), [...t.ids]);
      }
      return null;
    },
  },
  {
    id: 81, type: 'P', salience: 'background', pointedness: 'standard', family: 'circle',
    en: 'Every triangle has an inscribed circle.',
    he: 'בכל משולש אפשר לחסום מעגל.',
    match: (ctx) => {
      // The INCIRCLE fingerprint, two construction forms: (a) one circle carrying ≥3 tangencies
      // (the ADR-115 dual, and any circle a student made tangent to three sides); (b) the fresh
      // "circle inscribed in triangle ABC" lowering — a circle whose CENTRE rides a BISECTOR line
      // (the ADR-020 incenter construction).
      for (const [circleId, t] of tangentsByCircle(ctx)) {
        if (new Set(t.ats).size >= 3) return match('certain', t.factIds, [circleId, ...t.ats]);
      }
      const isBisector = (lineId: Id): boolean => {
        const line = ctx.construction.objects.find((x) => x.id === lineId);
        return line?.kind === 'line' && (line as { spec: { via: string } }).spec.via === 'bisector';
      };
      for (const o of ctx.construction.objects) {
        if (o.kind !== 'circle') continue;
        const centre = ctx.construction.objects.find((x) => x.id === o.center);
        // The incenter: bisector ∩ bisector (`line-intersection` of two bisector-spec lines), or a
        // centre sliding on a single bisector (the ADR-115 corner-tangent scaffolding).
        const onBisectors =
          (centre?.kind === 'line-intersection' && isBisector((centre as { line1: Id }).line1) && isBisector((centre as { line2: Id }).line2)) ||
          (centre?.kind === 'on-line' && isBisector((centre as { line: Id }).line));
        if (onBisectors) return match('certain', definingFactIds(ctx, o.id), [o.id, o.center]);
      }
      return null;
    },
  },
  ...([
    [89, 'Every regular polygon has a circumscribed circle.', 'כל מצולע משוכלל אפשר לחסום במעגל.'],
    [90, 'Every regular polygon has an inscribed circle.', 'בכל מצולע משוכלל אפשר לחסום מעגל.'],
  ] as [number, string, string][]).map(([id, en, he]): TheoremDef => ({
    id, type: 'P', salience: 'background', pointedness: 'generic', family: 'quad', en, he,
    match: (ctx) => {
      // The ADR-111 regular-polygon construct: a `polygon` (n ≥ 5) whose vertices ride one circle.
      for (const f of factsWith(ctx, (c) => c.type === 'polygon' && c.ids.length >= 5)) {
        const c = cmdOf(f) as Extract<AnyCommand, { type: 'polygon' }>;
        if (circleContaining(ctx, c.ids)) return match('certain', [f.id], [...c.ids]);
      }
      return null;
    },
  })),
  {
    id: 77, type: 'C', salience: 'background', pointedness: 'standard', family: 'triangle',
    en: 'A line through a vertex that divides the opposite side (internally) in the ratio of the other two sides is the angle bisector.',
    he: 'ישר העובר דרך קודקוד וחוצה את הצלע שמולו ביחס שתי הצלעות האחרות הוא חוצה זווית המשולש.',
    match: (ctx) => {
      // Property side stated: a set-ratio pairing a side's two SPLITS (segments sharing a non-vertex
      // foot) with the triangle's two OTHER sides.
      for (const f of ctx.facts) {
        const c = cmdOf(f);
        if (c.type !== 'set-ratio' || c.add) continue;
        for (const t of triangleVertexSets(ctx)) {
          const p = [c.a, c.b], q = [c.c, c.d];
          const isSidePair = (pr: Id[]) => pr.every((v) => t.ids.includes(v));
          if (isSidePair(p) === isSidePair(q)) continue;
          const splitPr = isSidePair(p) ? q : p;
          const feet = splitPr.filter((v) => !t.ids.includes(v));
          if (feet.length === 1) return match('possible', [f.id], [...t.ids, feet[0]]);
        }
      }
      return null;
    },
  },
];
