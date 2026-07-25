/**
 * The shared EVIDENCE-PREDICATE library (docs/18 T2; docs/24 S4.2b — extracted verbatim from
 * `table.ts`, which the docs/23 review flagged for hosting the library it was meant to sit on):
 * pure, coordinate-free premise scans over {@link MatchCtx} / the fact list / the dependency graph.
 * Both the theorem matchers (`./table`'s THEOREM_TABLE) and the principles lane (`./principles`)
 * read these predicates; the library never depends on the tables. Matcher-table internals
 * (TheoremDef rows, salience/rank logic) deliberately do NOT live here.
 */

import type { AnyCommand, Id } from '../engine/types';
import type { Fact } from '../replay/core';
import { commandPointIds } from '../replay/core';
import type { DiscoveryLevel, MatchCtx, TheoremMatch } from './types';

// ---------- premise-scan helpers (symbolic; no coordinates) ----------
export const cmdOf = (f: Fact): AnyCommand => f.cmd;
export const factsWith = (ctx: MatchCtx, pred: (c: AnyCommand) => boolean): Fact[] => ctx.facts.filter((f) => pred(cmdOf(f)));

/** A value read as 90° from either a `set-angle` or a symbolic `measure-angle`. */
export const isRightValue = (c: AnyCommand): boolean => {
  if (c.type === 'set-angle') return Math.abs(c.value - 90) < 1e-6;
  if (c.type === 'measure-angle') return 'value' in c.expr && Math.abs(c.expr.value - 90) < 1e-6;
  return false;
};

/** The circle (from ctx.circles) that contains every id in `ids` as a stated member, or null. */
export function circleContaining(ctx: MatchCtx, ids: Id[]) {
  return ctx.circles.find((c) => ids.every((id) => c.members.includes(id))) ?? null;
}

/** Each stated/detected triangle's three vertex ids (premises that need a WHOLE triangle, not loose points).
 *  `stated` = a typed triangle command (Declared, L1) vs a detected/emergent one (Observed, L3) — ADR-219. */
export function triangleVertexSets(ctx: MatchCtx): { ids: Id[]; stated: boolean }[] {
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
 * Triangles FORMED BY DRAWN EDGES — every 3-cycle in the neighbour graph (`pointNeighbors`: segments +
 * polygon edges). Coordinate-free, so it counts at Declared level (every edge is a drawn object). This is
 * the general "a triangle is actually on the canvas" signal (ADR-220): the parallelogram-cut triangle FAB
 * (segments FA, FB + the parallelogram edge AB) is a 3-cycle even though no `triangle` command named it,
 * whereas a bare trapezoid/parallelogram is only a 4-cycle. Replaces the old KIND-whitelist for the
 * transversal test (the recurring "make it geometric, not a whitelist" fix, ADR-167). Each triple once.
 */
export function structuralTriangles(ctx: MatchCtx): Id[][] {
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
export function transversalEvidence(ctx: MatchCtx): { present: boolean; level: DiscoveryLevel } {
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
export function similarityEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
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
export function statedDiameterFacts(ctx: MatchCtx): { fact: Fact; circleId: Id; ids: Id[] }[] {
  const out: { fact: Fact; circleId: Id; ids: Id[] }[] = [];
  // A stated LINE THROUGH THE CENTRE cutting the circle at two points IS a stated diameter ("the
  // line AO cuts circle O at C and D" — B15's 103 gap, ADR-244): a `line-through` with the centre as
  // an endpoint + two `line-circle-intersection`s of that line with the circle.
  const lineThroughCentre = new Map<string, Id>(); // line id → the circle whose centre it passes through
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'line-through') continue;
    for (const circ of ctx.circles) {
      if (c.a === circ.center || c.b === circ.center) lineThroughCentre.set(c.id, circ.id);
    }
  }
  const crossingsByLine = new Map<string, { fact: Fact; pts: Id[] }>();
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'line-circle-intersection') continue;
    const circId = lineThroughCentre.get(c.line);
    if (!circId) continue;
    const circ = ctx.circles.find((x) => x.id === circId);
    if (!circ || (circ.id !== c.circle && circ.center !== c.circle)) continue;
    const e = crossingsByLine.get(c.line) ?? { fact: f, pts: [] };
    e.fact = f; // the LATEST crossing completes the diameter (attribution)
    e.pts.push(c.id);
    crossingsByLine.set(c.line, e);
  }
  for (const [line, e] of crossingsByLine) {
    if (e.pts.length >= 2) out.push({ fact: e.fact, circleId: lineThroughCentre.get(line)!, ids: e.pts.slice(0, 2) });
  }
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

/** The id of any command carrying `id === objId` — the fact that defined an object (for attribution). */
export function definingFactIds(ctx: MatchCtx, objId: Id): string[] {
  return ctx.facts.filter((f) => 'id' in cmdOf(f) && (cmdOf(f) as { id: Id }).id === objId).map((f) => f.id);
}

/**
 * Tangencies grouped by circle, read from the structural {@link MatchCtx.tangents} (covers the `tangent`
 * command AND the Thales external-tangent construction). Each entry carries the tangency points and the
 * facts that defined them (for attribution).
 */
export function tangentsByCircle(ctx: MatchCtx): Map<Id, { factIds: string[]; ats: Id[] }> {
  const byCircle = new Map<Id, { factIds: string[]; ats: Id[] }>();
  for (const t of ctx.tangents) {
    const e = byCircle.get(t.circle) ?? { factIds: [], ats: [] };
    e.ats.push(t.at);
    e.factIds.push(...definingFactIds(ctx, t.at));
    byCircle.set(t.circle, e);
  }
  return byCircle;
}

/** Is the segment x–y drawn (an edge of the neighbour graph)? A coordinate-free "this triangle/quad is
 *  actually on the canvas" gate — so a construction ENTAILMENT (§ radii below) only surfaces when the
 *  student drew the figure, never for every abstract pair a circle could form. */
export const drawnEdge = (ctx: MatchCtx, x: Id, y: Id): boolean => (ctx.neighbors[x] ?? []).includes(y);

/** Every fact all of whose points lie within `verts` — the facts that BUILT this sub-figure (its sides,
 *  its defining circle, an equality among its vertices). Used for attribution + highlight of an entailed
 *  shape that no single command names (operator kite/isosceles-from-radii, ADR-218). */
export function factsAmong(ctx: MatchCtx, verts: Id[]): Fact[] {
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
export function isoscelesEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
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
  // OBSERVED (T4): an equal-SEGMENT class forced in every sample whose two members share an
  // endpoint (the apex) — an isosceles the coordinates revealed, with no equality typed.
  let observedRel = false;
  for (const cls of ctx.observed?.relations?.equalSegments ?? []) {
    for (let i = 0; i < cls.length; i++)
      for (let j = i + 1; j < cls.length; j++) {
        const [s1, s2] = [cls[i], cls[j]];
        const shared = s1.filter((v) => s2.includes(v));
        if (shared.length === 1) {
          [...s1, ...s2].forEach((v) => vertices.add(v));
          observedRel = true;
        }
      }
  }
  if (facts.length === 0 && detectedIso.length === 0 && !observedRel && vertices.size === 0) return null;
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
export function kiteEvidence(ctx: MatchCtx): { facts: Fact[]; vertices: Id[]; level: DiscoveryLevel } | null {
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
  // OBSERVED (L3): an EMERGENT kite-family shape — `detectShapes` classifies the most specific type,
  // so B14's forced BEGD reports as a RHOMBUS and the kite matchers never saw it (the kite ⊇ rhombus
  // hierarchy gap, ADR-244). A shape the student TYPED as rhombus/square is excluded: its own family
  // bundle (55/56…) owns it — the kite lens adds value only for the emergent discovery.
  let observed = false;
  const typedQuads = new Set(
    ctx.facts
      .map((f) => cmdOf(f))
      .filter((c): c is Extract<AnyCommand, { type: 'square' | 'rhombus' }> => c.type === 'square' || c.type === 'rhombus')
      .map((c) => [...c.ids].sort().join('|')),
  );
  for (const s of ctx.shapes) {
    if (s.type !== 'kite' && s.type !== 'rhombus' && s.type !== 'square') continue;
    if (typedQuads.has([...s.vertices].sort().join('|'))) continue;
    s.vertices.forEach((v) => vertices.add(v));
    facts.push(...factsAmong(ctx, [...s.vertices]));
    observed = true;
  }
  if (!declared && !entailed && !observed) return null;
  const level: DiscoveryLevel = declared ? 1 : entailed ? 2 : 3;
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

/** Shape commands that ENTAIL parallel sides (a transversal cuts them ⇒ the parallels theorems apply). */
const PARALLEL_SIDED = new Set(['trapezoid', 'parallelogram', 'rectangle', 'rhombus', 'square']);

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
export function parallelPairs(ctx: MatchCtx): { pair: [[Id, Id], [Id, Id]]; fact: Fact }[] {
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
 * External "hub" points (A3/A4 premise): a `point-on-segment` placed on the EXTENSION of a chord whose
 * two carrier endpoints both lie on one circle — a secant projected to an outside point (the parser's
 * `secantFromExternal` shape). Each carries the hub id + the circle.
 */
export function externalSecantHubs(ctx: MatchCtx): { fact: Fact; hub: Id; circleId: Id }[] {
  const out: { fact: Fact; hub: Id; circleId: Id }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type !== 'point-on-segment' || !c.extension) continue;
    const circ = circleContaining(ctx, [c.a, c.b]);
    if (circ) out.push({ fact: f, hub: c.id, circleId: circ.id });
  }
  return out;
}

/** Unordered edge key. */
export const ek = (a: Id, b: Id): string => [a, b].sort().join('|');

/**
 * Stated MEDIANS — a `midpoint` fact + a drawn segment from an opposite apex to the midpoint, with the
 * triangle's own sides drawn (the ADR-218 DRAWN gate). Covers the named-median lowering ("AK תיכון")
 * AND a hand-built "M is the midpoint of BC" + "segment AM" (§3's entailed row — same definitional
 * certainty, so both read as declared-strength evidence).
 */
export function medianFacts(ctx: MatchCtx): { facts: Fact[]; apex: Id; mid: Id; base: [Id, Id] }[] {
  const out: { facts: Fact[]; apex: Id; mid: Id; base: [Id, Id] }[] = [];
  for (const mf of factsWith(ctx, (c) => c.type === 'midpoint')) {
    const m = cmdOf(mf) as Extract<AnyCommand, { type: 'midpoint' }>;
    for (const sf of factsWith(ctx, (c) => c.type === 'segment')) {
      const s = cmdOf(sf) as { a: Id; b: Id };
      const apex = s.a === m.id ? s.b : s.b === m.id ? s.a : null;
      if (!apex || apex === m.a || apex === m.b) continue;
      if (!drawnEdge(ctx, apex, m.a) || !drawnEdge(ctx, apex, m.b)) continue; // a median OF a drawn triangle
      if (!out.some((e) => e.apex === apex && e.mid === m.id)) out.push({ facts: [mf, sf], apex, mid: m.id, base: [m.a, m.b] });
    }
  }
  return out;
}

/**
 * MIDSEGMENTS — declared (the ADR-199/222 `shape-variant` construct) or entailed (§7a L2: a drawn
 * segment JOINING two STATED midpoints; hosts sharing one vertex = a triangle midsegment, disjoint
 * hosts whose four ends are a stated 4-gon = a trapezoid midsegment).
 */
export function midsegmentFacts(ctx: MatchCtx): { facts: Fact[]; kind: 'triangle' | 'trapezoid'; objIds: Id[]; level: DiscoveryLevel }[] {
  const out: { facts: Fact[]; kind: 'triangle' | 'trapezoid'; objIds: Id[]; level: DiscoveryLevel }[] = [];
  for (const f of factsWith(ctx, (c) => c.type === 'shape-variant' && c.shape === 'midsegment')) {
    out.push({ facts: [f], kind: 'triangle', objIds: [...(cmdOf(f) as { ids: Id[] }).ids], level: 1 });
  }
  const mids = factsWith(ctx, (c) => c.type === 'midpoint').map((f) => ({ f, c: cmdOf(f) as Extract<AnyCommand, { type: 'midpoint' }> }));
  for (let i = 0; i < mids.length; i++) {
    for (let j = i + 1; j < mids.length; j++) {
      const M1 = mids[i], M2 = mids[j];
      if (!drawnEdge(ctx, M1.c.id, M2.c.id)) continue;
      const hosts1 = [M1.c.a, M1.c.b], hosts2 = [M2.c.a, M2.c.b];
      const shared = hosts1.filter((x) => hosts2.includes(x));
      if (shared.length === 1) {
        out.push({ facts: [M1.f, M2.f], kind: 'triangle', objIds: [M1.c.id, M2.c.id, ...new Set([...hosts1, ...hosts2])], level: 2 });
      } else if (shared.length === 0) {
        const all = [...hosts1, ...hosts2];
        // the four host ends form ONE stated 4-gon (trapezoid/quad/shape-variant) ⇒ the legs' midsegment
        const quad = ctx.facts.find((f) => {
          const c = cmdOf(f) as { ids?: Id[] };
          return Array.isArray(c.ids) && c.ids.length === 4 && all.every((v) => c.ids!.includes(v));
        });
        if (quad) out.push({ facts: [M1.f, M2.f, quad], kind: 'trapezoid', objIds: [M1.c.id, M2.c.id, ...all], level: 2 });
      }
    }
  }
  return out;
}

/**
 * Stated ANGLE BISECTORS — a `bisector` line spec ("bisector of angle ABC", the bisector∩bisector
 * compound) or the "AD bisects ∠BAC" lowering (a `set-angle-ratio` k=1 whose two angles share the
 * vertex AND one arm — the bisector arm). A shared vertex that is a circle CENTRE is excluded: that
 * form is ARC talk (the ADR-116 arc-equality lowering — equal central angles), not a stated bisector.
 */
export function bisectorStatements(ctx: MatchCtx): { fact: Fact; vertex: Id }[] {
  const out: { fact: Fact; vertex: Id }[] = [];
  for (const f of ctx.facts) {
    const c = cmdOf(f);
    if (c.type === 'bisector') out.push({ fact: f, vertex: c.vertex });
    else if (c.type === 'set-angle-ratio' && c.k === 1 && c.v1 === c.v2) {
      if (ctx.circles.some((cc) => cc.center === c.v1)) continue; // central angles = arcs, not a bisector
      if ([c.a1, c.b1].some((a) => [c.a2, c.b2].includes(a))) out.push({ fact: f, vertex: c.v1 });
    }
  }
  return out;
}

/**
 * CONGRUENCE constellations (the operator's "3 equal segments → חפיפה" example, docs/18 R1): STATED
 * equalities/angle-equalities distributed over two triangles (typed or structural). The stated
 * "△ABC ≅ △DEF" lowering (3 side equalities) lands here as a full SSS — one matcher covers both
 * paths. Returns the SPECIFIC criterion each triangle pair matches.
 *
 * A SHARED side deliberately does NOT count toward the constellation: its equality is the student's
 * own observation — in B8 (the kite halves over the drawn diagonal) and B13 (△ABG/△ABC over AB) the
 * shared-side congruence IS the proof step the feed must not gift (both are ground-truth
 * mustNotSurface; the never-guard caught the breach when a first draft auto-paired it).
 */
export function congruenceEvidence(ctx: MatchCtx): { kind: 18 | 19 | 20 | 21; tier: TheoremMatch['tier']; facts: Fact[]; objIds: Id[] }[] {
  const tris: { ids: Id[] }[] = [];
  const addTri = (idsIn: Id[]) => {
    if (!tris.some((t) => t.ids.length === idsIn.length && idsIn.every((v) => t.ids.includes(v)))) tris.push({ ids: [...idsIn] });
  };
  for (const v of triangleVertexSets(ctx)) addTri(v.ids);
  for (const s of structuralTriangles(ctx)) addTri(s);
  if (tris.length < 2) return [];
  const eqs = ctx.facts.filter((f) => { const c = cmdOf(f); return c.type === 'set-equal' && !c.soft; });
  const angs = ctx.facts.filter((f) => { const c = cmdOf(f); return c.type === 'set-angle-ratio' && c.k === 1; });
  const out: { kind: 18 | 19 | 20 | 21; tier: TheoremMatch['tier']; facts: Fact[]; objIds: Id[] }[] = [];
  for (let i = 0; i < tris.length; i++) {
    for (let j = i + 1; j < tris.length; j++) {
      const [T1, T2] = [tris[i].ids, tris[j].ids];
      const sides = (T: Id[]) => [ek(T[0], T[1]), ek(T[1], T[2]), ek(T[2], T[0])];
      const [s1, s2] = [sides(T1), sides(T2)];
      const paired1 = new Set<string>(), paired2 = new Set<string>();
      const facts: Fact[] = [];
      for (const f of eqs) {
        const c = cmdOf(f) as Extract<AnyCommand, { type: 'set-equal' }>;
        const [p, q] = [ek(c.a, c.b), ek(c.c, c.d)];
        if ((s1.includes(p) && s2.includes(q)) || (s1.includes(q) && s2.includes(p))) {
          paired1.add(s1.includes(p) ? p : q);
          paired2.add(s2.includes(q) ? q : p);
          facts.push(f);
        }
      }
      const anglePairs: { v1: Id; v2: Id; fact: Fact }[] = [];
      for (const f of angs) {
        const c = cmdOf(f) as Extract<AnyCommand, { type: 'set-angle-ratio' }>;
        const within = (T: Id[], v: Id, a: Id, b: Id) => T.includes(v) && T.includes(a) && T.includes(b);
        if (within(T1, c.v1, c.a1, c.b1) && within(T2, c.v2, c.a2, c.b2)) anglePairs.push({ v1: c.v1, v2: c.v2, fact: f });
        else if (within(T2, c.v1, c.a1, c.b1) && within(T1, c.v2, c.a2, c.b2)) anglePairs.push({ v1: c.v2, v2: c.v1, fact: f });
      }
      const nS = Math.min(paired1.size, paired2.size);
      const objIds = [...new Set([...T1, ...T2])];
      const allFacts = [...facts, ...anglePairs.map((a) => a.fact), ...factsAmong(ctx, T1), ...factsAmong(ctx, T2)];
      const dedup = [...new Map(allFacts.map((f) => [f.id, f])).values()];
      if (nS >= 3) out.push({ kind: 20, tier: 'certain', facts: dedup, objIds });
      else if (nS === 2 && anglePairs.length >= 1) {
        // Included angle ⇒ SAS (18); a non-included angle pair reads as the side-side-larger-angle (21).
        const sharedVertexOf = (T: Id[], covered: Set<string>): Id | null => {
          const cnt = new Map<Id, number>();
          for (const e of covered) for (const v of e.split('|')) if (T.includes(v)) cnt.set(v, (cnt.get(v) ?? 0) + 1);
          return [...cnt].find(([, n]) => n === 2)?.[0] ?? null;
        };
        const [sv1, sv2] = [sharedVertexOf(T1, paired1), sharedVertexOf(T2, paired2)];
        const included = anglePairs.some((a) => a.v1 === sv1 && a.v2 === sv2);
        out.push({ kind: included ? 18 : 21, tier: 'possible', facts: dedup, objIds });
      } else if (anglePairs.length >= 2 && nS >= 1) {
        out.push({ kind: 19, tier: 'possible', facts: dedup, objIds });
      }
    }
  }
  return out;
}
