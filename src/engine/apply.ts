/**
 * applyCommand: pure reducer turning one Command into a new Construction.
 * Object IDs are deterministic, so re-issuing a command is idempotent
 * (FR-EN-9). The evaluator computes the figure's positions; the one thing
 * chosen here is the *initial* coordinates of a shape's new free vertices —
 * a parameter of the graph, not a derived position — which is why `pos` (the
 * already-known positions of prior objects) is threaded in: a shape built on
 * existing points is fitted to them, instead of keeping absolute defaults.
 */

import type { Command, Constraint, Construction, GeoObject, Id, SolveDirective, Vec } from './types';
import { add, reflectAcross, sub } from './geometry';
import { constraintRefs } from './solve';

/**
 * A constraint either *drives* a free DOF or *checks* the figure (ADR-012/014).
 * If any point it references still has a free DOF (an on-segment parameter t),
 * the constraint drives it: that point is upgraded to a solved carrier and the
 * constraint places it. The driven point is chosen deterministically — the
 * first referenced point that is a plain on-segment. When every referenced point
 * is already determined, the constraint is pushed as a check (over-constraint
 * detection in `evaluate`). Generic over the constraint type — new constraints
 * add a residual case in solve.ts, not logic here.
 */
function driveOrCheck(objects: GeoObject[], constraints: Constraint[], con: Constraint): void {
  // A trivially-true equal/ratio — the SAME segment on both sides ("DF = DF") —
  // constrains nothing, so it must NOT drive a carrier (which would slide it to a
  // degenerate t, e.g. F → t=0 = A). Push it as a check; its residual is 0, so it
  // simply passes (a ratio with k≠1 on the same segment correctly fails instead).
  if (
    (con.type === 'equal' || con.type === 'ratio') &&
    ((con.a === con.c && con.b === con.d) || (con.a === con.d && con.b === con.c))
  ) {
    constraints.push(con);
    return;
  }
  // A `length-radius` couples a length to a circle's RADIUS: drive that free-radius DOF (|ab| = k·R) plus
  // the witness's on-circle ANGLE when it has one — NOT an arbitrary point carrier (ADR-071). The radius
  // alone is often insufficient: another part of the figure can cap it (a tangent needs A OUTSIDE the
  // circle, so the radius can't grow without bound), but a moderate radius + the right θ still satisfies
  // |ab| = k·R. Driving both (2 DOF) keeps the solve well-posed; recruitFreeDofs widens it only if even
  // that can't hold. A tautology ("BO=R", B on the circle ⇒ |BO| ≡ R) holds for every radius/θ, so the
  // solve just keeps the seed.
  if (con.type === 'length-radius') {
    const ci = objects.findIndex((o) => o.id === con.circle);
    const circ = ci >= 0 ? objects[ci] : undefined;
    if (circ && circ.kind === 'circle' && circ.radius.via === 'free' && (circ as { solve?: unknown }).solve === undefined) {
      objects[ci] = { ...circ, solve: { constraint: con, branch: 0 } } as GeoObject;
    }
    const wi = objects.findIndex((o) => o.id === con.witness);
    const wit = wi >= 0 ? objects[wi] : undefined;
    if (wit && wit.kind === 'on-circle' && (wit as { solve?: unknown }).solve === undefined) {
      objects[wi] = { ...wit, solve: { constraint: con, branch: 0 } };
    }
    constraints.push(con); // verified after the driven solve (and the recruit-DOFs fallback if it can't hold)
    return;
  }
  const idxs = constraintRefs(con).map((id) => objects.findIndex((o) => o.id === id));
  // A point already pinned by another constraint (e.g. F fixed by a coincidence
  // from a second definition) must not be re-driven — that would fight its pin and
  // over-constrain ("DF = DE" should move the free E, not the pinned F).
  const pinned = new Set(constraints.flatMap(constraintRefs));
  // (1) Prefer a FREE on-segment ref as the carrier — the constraint *places* it (its t is solved in
  // closed form). Only `free` on-segment points (no stated ratio) may be driven: a point the student
  // positioned explicitly — "D on the extension of BC" (t=1.3), "E on AC at 40%" — is a GIVEN, not a
  // DOF, so an unrelated later constraint must drive the figure's real freedom (a free vertex) instead
  // of silently relocating D (operator: a central-angle "∠BOC=2α" was dragging the fixed D and failing).
  const onSegs = idxs.filter(
    (i) => i >= 0 && objects[i].kind === 'on-segment' && (objects[i] as Extract<GeoObject, { kind: 'on-segment' }>).free === true,
  );
  const onSeg = onSegs.find((i) => !pinned.has(objects[i].id)) ?? onSegs[0];
  if (onSeg !== undefined) {
    const seg = objects[onSeg] as Extract<GeoObject, { kind: 'on-segment' }>;
    objects[onSeg] = { kind: 'on-segment-solved', id: seg.id, a: seg.a, b: seg.b, constraint: con, branch: seg.solveBranch ?? 0, t0: seg.t };
    // A `concyclic` couples to the whole figure: one on-segment DOF often CAN'T make four points share a
    // circle by itself (a rectangle too short for "EABF cyclic"). Keep it as a check too, so when the
    // single-DOF solve finds no root, `evaluate` reports it unsatisfied and applyStep's recruit-more-DOFs
    // fallback grows a free shape DOF (the rectangle's height) until it holds — no fixed-size assumption.
    if (con.type === 'concyclic') constraints.push(con);
    return;
  }
  // (1.5) Else drive an ON-LINE offset DOF (ADR-036) — a marker on a drawn line (a
  // tangent's named endpoint) is an explicit slider, so it's preferred over a
  // structural point that merely happens to be drivable (an on-circle tangency
  // point, a free vertex): "AC ⟂ TC" moves the marker C, not the tangency point T.
  const onLine = idxs.find(
    (i) => i >= 0 && objects[i].kind === 'on-line' && (objects[i] as Extract<GeoObject, { kind: 'on-line' }>).solve === undefined,
  );
  if (onLine !== undefined) {
    objects[onLine] = { ...(objects[onLine] as Extract<GeoObject, { kind: 'on-line' }>), solve: { constraint: con, branch: 0 } };
    constraints.push(con);
    return;
  }
  // (2) Else drive a free on-circle DOF among the refs (ADR-028) — one not already
  // driven — so a constraint on circle points (e.g. |ED| = 7) repositions them.
  const onCirc = idxs.find(
    (i) => i >= 0 && objects[i].kind === 'on-circle' && (objects[i] as Extract<GeoObject, { kind: 'on-circle' }>).solve === undefined,
  );
  if (onCirc !== undefined) {
    objects[onCirc] = { ...(objects[onCirc] as Extract<GeoObject, { kind: 'on-circle' }>), solve: { constraint: con, branch: 0 } };
    constraints.push(con); // keep it for the final verification after the driven solve
    return;
  }
  // (2.5) Else drive a SHAPE-SCALAR DOF among the refs (ADR-033) — a perp-offset's dist
  // (rectangle height / right-triangle leg), a rotated angle (rhombus), a scaled-offset k
  // (trapezoid top side). These dimensions used to be frozen, so a sizing constraint on them
  // was wrongly an over-constraint; now the solver sizes them.
  const shapeKinds = new Set(['perp-offset', 'rotated', 'scaled-offset']);
  const shapeRefs = idxs.filter((i) => i >= 0 && shapeKinds.has(objects[i].kind) && (objects[i] as { solve?: unknown }).solve === undefined);
  const shapeRef = shapeRefs.find((i) => !pinned.has(objects[i].id)) ?? shapeRefs[0];
  if (shapeRef !== undefined) {
    objects[shapeRef] = { ...(objects[shapeRef] as GeoObject), solve: { constraint: con, branch: 0 } } as GeoObject;
    constraints.push(con);
    return;
  }
  // (3) Else drive a FREE point (2 DOF) among the refs — a shape's free vertex has
  // no parametric DOF, so a constraint on it (e.g. "|AB| = |AC|" on a parallelogram,
  // whose A,B,C are free) reshapes the figure by moving that vertex to the nearest
  // satisfying spot (`resolveDriven`). Prefer a NON-pinned, not-yet-driven vertex,
  // the most-recently-added one (keeps earlier/base vertices stable) — ADR-028.
  const cand = idxs.filter((i) => {
    if (i < 0 || objects[i].kind !== 'free-point') return false;
    const fp = objects[i] as Extract<GeoObject, { kind: 'free-point' }>;
    return !fp.pinned && !fp.rigid && fp.solve === undefined;
  });
  // Prefer a vertex no other constraint references, but fall back to any free one —
  // so a SECOND constraint sharing all its vertices (e.g. two angles of a triangle)
  // still gets a distinct carrier and the two are solved jointly (resolveDriven),
  // rather than the second finding everything "pinned" and failing as a check.
  const notPinned = cand.filter((i) => !pinned.has(objects[i].id));
  const pool = notPinned.length ? notPinned : cand;
  const free = pool.length ? pool.reduce((a, b) => (b > a ? b : a)) : undefined;
  if (free !== undefined) {
    objects[free] = { ...(objects[free] as Extract<GeoObject, { kind: 'free-point' }>), solve: { constraint: con, branch: 0 } };
    constraints.push(con); // verified after the driven solve (honest fail if unsolvable)
    return;
  }
  // (4) Nothing free to move — a pure check (over-constraint detection).
  constraints.push(con);
}

function addObj(objects: GeoObject[], o: GeoObject): void {
  if (!objects.some((x) => x.id === o.id)) objects.push(o);
}

/**
 * Add a circle, or — if one with this id already exists — REPLACE it (a resize /
 * re-centre). Re-stating a circle with a new radius is a legitimate edit, not a
 * conflict (a later "circle O radius 8" overrides an earlier radius 5; the points
 * on it re-evaluate against the new radius). Circle ids are `circle-X`, points are
 * single letters, so this never clobbers a point.
 */
function upsertCircle(objects: GeoObject[], o: GeoObject): void {
  const i = objects.findIndex((x) => x.id === o.id);
  if (i >= 0) objects[i] = o;
  else objects.push(o);
}

/**
 * Add a line, or reuse an existing one of the same id (its id is its spec, so it's
 * the same line). Visibility is OR-merged: re-referencing a drawn line for a
 * crossing keeps it drawn; re-stating a scaffolding line as a *drawn* one upgrades
 * it. (Draw the tangent at D, then intersect "the tangent at D" with AB.)
 */
function addLine(objects: GeoObject[], o: Extract<GeoObject, { kind: 'line' }>): void {
  const existing = objects.find((x) => x.id === o.id);
  if (!existing) {
    objects.push(o);
    return;
  }
  if (existing.kind === 'line' && o.visible) existing.visible = true;
}

/**
 * Which vertex-tuple positions of each shape are *derived* corners (computed
 * from the base edge), as opposed to free base vertices. A composed shape can
 * reuse existing points only at *free* slots (ADR-013), so an existing vertex
 * landing on a derived slot is a conflict. Triangle/quadrilateral have no
 * derived vertices and so never conflict.
 */
const DERIVED_SLOTS: Partial<Record<Command['type'], number[]>> = {
  square: [2, 3],
  rectangle: [2, 3],
  rhombus: [2, 3],
  parallelogram: [3],
  trapezoid: [2],
  'right-triangle': [1], // B is the derived right-angle vertex (legs CA ⟂ CB)
};

/**
 * Pick the cyclic rotation of a shape's vertex list that puts existing points on
 * *free* slots, not derived ones — so a shape built on an existing edge attaches
 * regardless of where that edge sits in the name (ADR-013, amendment). A polygon
 * is a cycle, so rotating the vertex tuple is the *same* shape with a different
 * start vertex; choosing the rotation whose derived slots are all-new lets e.g.
 * `square RTCD` build on the existing edge CD (rotated to base CDRT) instead of
 * failing because C,D fell on the derived corners. Prefers the as-typed order;
 * rotates only when it strictly reduces derived-slot clashes.
 */
export function normalizeShapeComposition(prev: Construction, cmd: Command): Command {
  const slots = DERIVED_SLOTS[cmd.type];
  if (!slots || !('ids' in cmd)) return cmd;
  const ids = cmd.ids as Id[];
  const n = ids.length;
  const exists = (id: Id) => prev.objects.some((o) => o.id === id);
  let bestBad = slots.filter((s) => exists(ids[s])).length;
  if (bestBad === 0) return cmd; // as-typed order already clash-free
  let best = ids;
  for (let r = 1; r < n; r++) {
    const rot = ids.map((_, i) => ids[(i + r) % n]);
    const bad = slots.filter((s) => exists(rot[s])).length;
    if (bad < bestBad) {
      bestBad = bad;
      best = rot;
      if (bad === 0) break;
    }
  }
  return best === ids ? cmd : ({ ...cmd, ids: best } as Command);
}

/**
 * Mirror a composed shape to the *other* side of the edge through its two reused
 * points: reflect its new **free** vertices, and toggle the `flip` of its new
 * **derived** corners (square/rectangle/rhombus, whose side is set by a rule, not
 * a free vertex). Together this flips the whole shape across the edge while
 * keeping vertex labels fixed. Used to put a composed shape on the side away from
 * existing geometry (textbook look) and to dodge coincident nodes (ADR-013/017).
 * Returns null when it doesn't apply (not a shape on exactly two existing points).
 */
export function mirrorComposition(
  prev: Construction,
  cmd: Command,
  next: Construction,
  pos: Map<Id, Vec>,
): Construction | null {
  if (!('ids' in cmd)) return null;
  const existing = (cmd.ids as Id[]).filter((id) => prev.objects.some((o) => o.id === id));
  if (existing.length !== 2) return null;
  const a = pos.get(existing[0]);
  const b = pos.get(existing[1]);
  if (!a || !b) return null;
  const prevIds = new Set(prev.objects.map((o) => o.id));
  let changed = false;
  const objects = next.objects.map((o) => {
    if (prevIds.has(o.id)) return o; // reused — leave alone
    if (o.kind === 'free-point') {
      const r = reflectAcross({ x: o.x, y: o.y }, a, b);
      changed = true;
      return { ...o, x: r.x, y: r.y };
    }
    if (o.kind === 'derived' || o.kind === 'perp-offset' || o.kind === 'rotated') {
      changed = true;
      return { ...o, flip: !o.flip };
    }
    return o; // parallelogram-vertex / scaled-offset / segment / polygon follow their inputs
  });
  return changed ? { ...next, objects } : null;
}

/** A free base vertex of a shape template: its id and canonical coordinates. */
type BaseVertex = { id: Id; x: number; y: number };

/**
 * A similarity transform (rotate + uniform scale + translate) that maps a
 * shape's canonical template onto whatever base vertices already exist (its
 * "anchors"). With ≥2 anchors it is fully determined; with 1 it is a pure
 * translation; with 0 it is the identity (the standalone case → raw template).
 *
 * This is what keeps a shape *built on existing points* (ADR-013) a valid,
 * non-degenerate instance of its template. Without it, new free vertices keep
 * their absolute defaults regardless of where the reused vertices are — e.g. a
 * parallelogram on an existing horizontal edge leaves its third vertex on that
 * same line, collapsing the figure to a segment.
 */
function fitTemplate(template: BaseVertex[], pos: Map<Id, Vec>): (p: BaseVertex) => Vec {
  const anchors = template
    .map((t) => ({ t, p: pos.get(t.id) }))
    .filter((a): a is { t: BaseVertex; p: Vec } => a.p !== undefined);

  if (anchors.length === 0) return (p) => ({ x: p.x, y: p.y });
  if (anchors.length === 1) {
    const d = sub(anchors[0].p, anchors[0].t);
    return (p) => add(p, d);
  }

  // ≥2 anchors: the farthest-apart pair (in template space) defines the frame.
  let a = anchors[0];
  let b = anchors[1];
  let best = -1;
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++) {
      const d2 = (anchors[i].t.x - anchors[j].t.x) ** 2 + (anchors[i].t.y - anchors[j].t.y) ** 2;
      if (d2 > best) {
        best = d2;
        a = anchors[i];
        b = anchors[j];
      }
    }
  const tv = sub(b.t, a.t); // template edge
  const pv = sub(b.p, a.p); // its image in the actual figure
  const tLen2 = tv.x * tv.x + tv.y * tv.y;
  if (tLen2 < 1e-18 || pv.x * pv.x + pv.y * pv.y < 1e-18) {
    const d = sub(a.p, a.t); // coincident anchors → fall back to translation
    return (p) => add(p, d);
  }
  // The complex ratio pv / tv = re + i·im encodes the scale·rotation.
  const re = (pv.x * tv.x + pv.y * tv.y) / tLen2;
  const im = (pv.y * tv.x - pv.x * tv.y) / tLen2;
  return (p) => {
    const dx = p.x - a.t.x;
    const dy = p.y - a.t.y;
    return { x: a.p.x + re * dx - im * dy, y: a.p.y + im * dx + re * dy };
  };
}

/**
 * Add a shape's free base vertices: a new id is placed via the template fitted
 * to the existing anchors; an id that already exists is reused untouched (its
 * own definition stands — ADR-013). Derived vertices are added separately and
 * follow these by their rules.
 */
function placeBase(objects: GeoObject[], template: BaseVertex[], pos: Map<Id, Vec>, rigid = false): void {
  const fit = fitTemplate(template, pos);
  // A shape that shares NO point with the figure (0 anchors) would otherwise land on the
  // raw template coords — exactly where a prior disjoint shape sits, so they'd collide
  // (the ADR-017 coincidence guard then rejects it). Offset such a shape to the right of
  // all existing geometry, so two independent shapes (e.g. the two triangles of a
  // congruence given) can coexist. Composed shapes (≥1 shared point) are unaffected.
  let off: Vec = { x: 0, y: 0 };
  const sharesNone = template.every((t) => !objects.some((o) => o.id === t.id));
  if (sharesNone && pos.size > 0) {
    const xs = [...pos.values()].map((v) => v.x);
    const maxX = Math.max(...xs);
    const tMinX = Math.min(...template.map((t) => t.x));
    off = { x: maxX - tMinX + 4, y: 0 }; // a fixed gap past the existing figure's right edge
  }
  for (const t of template) {
    if (objects.some((o) => o.id === t.id)) continue; // reuse existing
    const v = fit(t);
    // `rigid` base vertices belong to a fully-committed regular shape (a square):
    // a constraint that contradicts the shape is a genuine over-constraint, so the
    // solver must NOT drive them (it would silently rescale/reshape) — ADR-030.
    objects.push({ kind: 'free-point', id: t.id, x: v.x + off.x, y: v.y + off.y, ...(rigid ? { rigid: true } : {}) });
  }
}

/**
 * Is point `id` structurally known to lie on circle `circleId`? (A per-point view of the membership
 * step.ts `circleMembers` computes for the parser.) Used to recognise the "second intersection"
 * pattern: a collinearity whose driven point is on a circle, with the line through another point that
 * is ALSO on that circle, is really a line∩circle crossing — see the `set-collinear` handler.
 */
function pointOnCircle(objects: GeoObject[], id: Id, circleId: Id): boolean {
  const circ = objects.find((o): o is Extract<GeoObject, { kind: 'circle' }> => o.kind === 'circle' && o.id === circleId);
  const center = circ?.center;
  // The through-point that DEFINES this circle's radius (`circle-through`, e.g. a diameter endpoint or an
  // incircle's foot) lies ON the circle by construction — so "P on circle" for that very point is already
  // true. Recognising it makes the apply path idempotent instead of re-adding it as an on-circle point,
  // which would invert the dependency (P → circle → P) and crash with "unresolved dependencies" (ADR-093).
  if (circ && circ.radius.via === 'through' && circ.radius.point === id) return true;
  for (const o of objects) {
    if (o.id === id) {
      if (o.kind === 'on-circle' || o.kind === 'antipode' || o.kind === 'arc-midpoint' || o.kind === 'line-circle') return o.circle === circleId;
      if (o.kind === 'circle-circle') return o.circle1 === circleId || o.circle2 === circleId;
    }
    // a,b,c of a circumcentre lie on the circle centred there.
    if (o.kind === 'circumcenter' && center === o.id && (o.a === id || o.b === id || o.c === id)) return true;
  }
  return false;
}

/** The golden angle — spreads N points around a circle so none coincide and they look even. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * A small bounded asymmetry added to alternate on-circle points (ADR-085). Pure golden-angle steps give
 * 3 points TWO EQUAL gaps → an isosceles triangle with the apex at the arc-midpoint of the opposite side,
 * which (a) asserts AB=BC — a "fixed assumption" the student never stated ([ADR-052]) — and (b) makes the
 * tangent at that apex EXACTLY parallel to the opposite chord, so "tangent at B meets CA" degenerates at
 * the default view. Skewing alternate points breaks the equal gaps → a generic SCALENE default; it is
 * bounded (does not accumulate over many points) so larger inscribed polygons stay well-spread.
 */
const SCALENE_SKEW = 0.35;

/** A default angle for the next point on `circle`, spread from any already on it (top-first), with a
 *  bounded alternating skew so the default is a GENERIC (scalene) figure, not a special symmetric one. */
function nextTheta(objects: GeoObject[], circle: Id): number {
  let n = 0;
  for (const o of objects) if (o.kind === 'on-circle' && o.circle === circle) n++;
  return Math.PI / 2 + n * GOLDEN_ANGLE + (n % 2) * SCALENE_SKEW;
}

/**
 * Seed `t` for a NEW free point on segment a→b that doesn't collide with free points already on it
 * (two "point on AC" both defaulting to 0.5 → "would be at the same point"). Place it in the middle of
 * the largest open gap between the existing parameters (normalised to a→b), so points spread out; the
 * first lands at 0.5. The "show another configuration" sampler still slides each independently.
 */
function freeSegT(objects: GeoObject[], a: Id, b: Id): number {
  const taken = objects
    .filter((o): o is Extract<GeoObject, { kind: 'on-segment' }> => o.kind === 'on-segment' && ((o.a === a && o.b === b) || (o.a === b && o.b === a)))
    .map((o) => (o.a === a ? o.t : 1 - o.t)) // normalise every parameter to the a→b orientation
    .filter((t) => t > 0 && t < 1);
  if (taken.length === 0) return 0.5;
  const xs = [0, ...taken.sort((p, q) => p - q), 1];
  let best = 0.5;
  let widest = -1;
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    if (gap > widest) {
      widest = gap;
      best = (xs[i] + xs[i + 1]) / 2;
    }
  }
  return best;
}

/** A segment is undirected: normalise endpoint order so seg AB === seg BA (idempotent). */
function segment(x: Id, y: Id): GeoObject {
  const [p, q] = [x, y].sort();
  return { kind: 'segment', id: `seg-${p}${q}`, a: p, b: q };
}

/** The 4 boundary segments + the polygon for a quad a→b→c→d. */
function quadEdges(objects: GeoObject[], a: Id, b: Id, c: Id, d: Id): void {
  for (const [x, y] of [[a, b], [b, c], [c, d], [d, a]] as const) addObj(objects, segment(x, y));
  addObj(objects, { kind: 'polygon', id: `poly-${a}${b}${c}${d}`, vertices: [a, b, c, d] });
}

/** The 3 boundary segments + the polygon for a triangle a→b→c. */
function triEdges(objects: GeoObject[], a: Id, b: Id, c: Id): void {
  for (const [x, y] of [[a, b], [b, c], [c, a]] as const) addObj(objects, segment(x, y));
  addObj(objects, { kind: 'polygon', id: `poly-${a}${b}${c}`, vertices: [a, b, c] });
}

/** The n boundary segments + the polygon for an n-gon v0→v1→…→v(n-1)→v0 (generalises quadEdges/triEdges). */
function polyEdges(objects: GeoObject[], ids: Id[]): void {
  for (let i = 0; i < ids.length; i++) addObj(objects, segment(ids[i], ids[(i + 1) % ids.length]));
  addObj(objects, { kind: 'polygon', id: `poly-${ids.join('')}`, vertices: [...ids] });
}

export function applyCommand(prev: Construction, cmd: Command, pos: Map<Id, Vec> = new Map()): Construction {
  const objects = [...prev.objects];
  const constraints = [...prev.constraints];

  switch (cmd.type) {
    case 'free-point': {
      // A free point may be (re)placed: if it already exists as a free point,
      // update its coordinates — a *move* (ADR-011). Conflicts with non-free
      // points of the same id are caught upstream by commandConflict. A student's
      // explicit placement is *pinned* — the sampler never moves it (ADR-018); but a
      // construct's AUTO-placed default (`free`) is a real free DOF the sampler and
      // constraints may move (ADR-052), so the seed coords are just a starting point.
      const fp: GeoObject = { kind: 'free-point', id: cmd.id, x: cmd.x, y: cmd.y, ...(cmd.free ? {} : { pinned: true }) };
      const i = objects.findIndex((o) => o.id === cmd.id);
      if (i === -1) objects.push(fp);
      else if (objects[i].kind === 'free-point') objects[i] = fp;
      break;
    }

    case 'square': {
      // Two free points (A,B) carry the square's 4 DOF (position, rotation,
      // size); C and D are derived to make it a square for any A,B. A,B are
      // driveable (not rigid) so a side constraint resizes it — a shape-violating
      // constraint (e.g. a non-90° angle) is still rejected by the solver's
      // satisfied/degeneracy guards rather than silently distorting (ADR-033).
      const [a, b, c, d] = cmd.ids;
      const side = cmd.side ?? 5;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: side, y: 0 }], pos);
      addObj(objects, { kind: 'derived', id: c, rule: 'square-c', a, b });
      addObj(objects, { kind: 'derived', id: d, rule: 'square-d', a, b });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'quadrilateral': {
      // A general (irregular, convex) quadrilateral: 4 free vertices. Base AB on
      // the x-axis; the top is uneven so it doesn't read as a special quad.
      const [a, b, c, d] = cmd.ids;
      placeBase(
        objects,
        [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }, { id: c, x: 5, y: 5 }, { id: d, x: 1, y: 4 }],
        pos,
      );
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'parallelogram': {
      // A,B,C carry the parallelogram's freedom; D is derived (D = A + C − B),
      // so ABCD stays a parallelogram for any A,B,C. Base AB on the x-axis, body
      // built upward and leaning right (textbook orientation).
      const [a, b, c, d] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }, { id: c, x: 8, y: 4 }], pos);
      addObj(objects, { kind: 'parallelogram-vertex', id: d, a, b, c });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'rectangle': {
      // A,B free base; C offset perpendicular to AB by a (driveable) height; D = A + C − B
      // closes the rectangle (parallelogram closure on the perpendicular side). One height
      // DOF (C's dist) so a side constraint stays consistent (BC and AD can't diverge).
      const [a, b, c, d] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }], pos);
      addObj(objects, { kind: 'perp-offset', id: c, anchor: b, from: a, to: b, dist: 4 });
      addObj(objects, { kind: 'parallelogram-vertex', id: d, a, b, c }); // D = A + C − B
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'rhombus': {
      // A,B free (side AB); D rotated off A by a default angle; C closes the rhombus.
      const [a, b, c, d] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 5, y: 0 }], pos);
      addObj(objects, { kind: 'rotated', id: d, pivot: a, from: a, to: b, angleDeg: 60, scale: 1 });
      addObj(objects, { kind: 'parallelogram-vertex', id: c, a: b, b: a, c: d }); // C = B + D − A
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'trapezoid': {
      // A,B,D free; C offset from D parallel to AB (so AB ∥ DC), shorter by
      // default. Long base AB on the x-axis, shorter top DC above it.
      const [a, b, c, d] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }, { id: d, x: 1, y: 4 }], pos);
      addObj(objects, { kind: 'scaled-offset', id: c, anchor: d, from: a, to: b, k: 0.6 });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'triangle': {
      const [a, b, c] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }, { id: c, x: 2, y: 4 }], pos);
      triEdges(objects, a, b, c);
      break;
    }

    case 'polygon':
      // A generic n-gon. Unlike square/triangle, it does NOT own its vertices' placement — they are created
      // by prior commands (e.g. a regular polygon's on-circle vertices). This case only wires the n boundary
      // segments + the polygon object.
      polyEdges(objects, cmd.ids);
      break;

    case 'right-triangle': {
      // Right angle at C (the last id). Legs CA and CB: A and C are free, B is
      // derived perpendicular to CA at C — so ∠C stays 90° for any A, C.
      const [a, b, c] = cmd.ids;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: c, x: 0, y: 4 }], pos);
      addObj(objects, { kind: 'perp-offset', id: b, anchor: c, from: c, to: a, dist: 5 });
      triEdges(objects, a, b, c);
      break;
    }

    case 'point-on-segment':
      // No ratio stated (cmd.t undefined) ⇒ a FREE position on the segment (ADR-052): the student didn't
      // say WHERE on a→b, so "show another configuration" can slide it. Seed at the midpoint, but DODGE
      // any free point already on this segment so a second "point on AC" doesn't collide with the first
      // ("would be at the same point"). A stated ratio or an extension point (t>1) is a fixed position.
      addObj(objects, {
        kind: 'on-segment',
        id: cmd.id,
        a: cmd.a,
        b: cmd.b,
        t: cmd.t ?? freeSegT(objects, cmd.a, cmd.b),
        ...(cmd.t === undefined ? { free: true } : {}),
        ...(cmd.extension ? { extension: true } : {}),
        ...(cmd.branch !== undefined ? { solveBranch: cmd.branch } : {}),
      });
      break;

    case 'line-line-intersection':
      addObj(objects, { kind: 'line-line-intersection', id: cmd.id, a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      // A "המשך" operand is DIRECTIONAL — A must be BEYOND the named 2nd point (ADR-054). Emit a
      // `collinear-order` (A is already collinear via the crossing); when the current free DOFs put the
      // crossing on the wrong side, recruitFreeDofs DRIVES them (e.g. pulls a free apex closer) so the
      // extensions reach A. The free DOF is solved by the engine — the student never moves a point.
      if (cmd.dir1) constraints.push({ type: 'collinear-order', points: [cmd.a, cmd.b, cmd.id] });
      if (cmd.dir2) constraints.push({ type: 'collinear-order', points: [cmd.c, cmd.d, cmd.id] });
      break;

    case 'segment':
      // A standalone segment creates its endpoints if they don't exist yet (a
      // free segment to start a figure), and reuses them when they do — fitted
      // to the prior figure like a shape's base vertices (ADR-013). Without this
      // a bare "segment AB" would add an unresolvable segment that silently
      // doesn't draw.
      placeBase(objects, [{ id: cmd.a, x: 0, y: 0 }, { id: cmd.b, x: 5, y: 0 }], pos);
      addObj(objects, segment(cmd.a, cmd.b));
      break;

    case 'bisector':
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'bisector', vertex: cmd.vertex, p: cmd.p, q: cmd.q }, visible: cmd.visible });
      break;

    case 'perpendicular-line':
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'perpendicular', through: cmd.through, a: cmd.a, b: cmd.b }, visible: cmd.visible });
      break;

    case 'parallel-line':
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'parallel', through: cmd.through, a: cmd.a, b: cmd.b }, visible: cmd.visible });
      break;

    case 'line-through':
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'through', a: cmd.a, b: cmd.b }, visible: cmd.visible });
      break;

    case 'line-intersection':
      addObj(objects, { kind: 'line-intersection', id: cmd.id, line1: cmd.line1, line2: cmd.line2 });
      // A directional "המשך AB meets … at id" carries an order (id beyond the 2nd point). id is ALREADY
      // collinear (it's the crossing of the two lines), so add ONLY the side/order constraint — its residual
      // folds into the joint solve and flexes the free DOFs to keep id on the named extension (ADR-127).
      if (cmd.order && cmd.order.length >= 3) constraints.push({ type: 'collinear-order', points: [...cmd.order] });
      break;

    case 'foot':
      addObj(objects, { kind: 'foot', id: cmd.id, from: cmd.from, a: cmd.a, b: cmd.b });
      break;

    case 'midpoint':
      addObj(objects, { kind: 'midpoint', id: cmd.id, a: cmd.a, b: cmd.b });
      break;

    case 'circle':
      // An `ifAbsent` circle is the parser's auto-materialised IMPLICIT circle (a decomposition referenced
      // "circle O" without creating it). Skip it when that circle already exists, so it never CLOBBERS a
      // real one with the default free radius (e.g. when a later "chord … in circle O" is parsed without
      // the circle in context). When truly absent, fall through and create it.
      if (cmd.ifAbsent && objects.some((o) => o.kind === 'circle' && o.id === cmd.id)) break;
      placeBase(objects, [{ id: cmd.center, x: 0, y: 0 }], pos); // create the centre if new
      upsertCircle(objects, {
        kind: 'circle',
        id: cmd.id,
        center: cmd.center,
        // freeRadius ⇒ the size is a DOF seeded at `radius` (ADR-051: no stated radius, so don't freeze it).
        radius: cmd.freeRadius ? { via: 'free', value: cmd.radius } : { via: 'length', value: cmd.radius },
        ...(cmd.hidden ? { hidden: true } : {}),
        ...(cmd.autoCenter ? { autoCenter: true } : {}),
      });
      break;

    case 'name-center': {
      // "O is the centre of the circle" — the student NAMED an existing circle's auto-hidden centre, so
      // reveal it (FR-RN-8: a named centre always shows). Flip `autoCenter` off on the circle(s) centred at
      // that label, leaving the radius spec untouched (re-emitting a `circle` would clobber it). No-op if no
      // such circle (the parser only emits this when the centre exists).
      for (const o of objects) if (o.kind === 'circle' && o.center === cmd.center && o.autoCenter) delete o.autoCenter;
      break;
    }

    case 'arc':
      addObj(objects, { kind: 'arc', id: cmd.id, center: cmd.center, from: cmd.from, to: cmd.to });
      break;

    case 'circle-through':
      placeBase(objects, [{ id: cmd.center, x: 0, y: 0 }], pos);
      upsertCircle(objects, { kind: 'circle', id: cmd.id, center: cmd.center, radius: { via: 'through', point: cmd.through }, ...(cmd.hidden ? { hidden: true } : {}), ...(cmd.autoCenter ? { autoCenter: true } : {}) });
      break;

    case 'circumcircle':
      // The centre IS the circumcentre of a,b,c (a derived point); the circle
      // passes through a. Create the three points if new (a non-degenerate
      // spread) so "circle through A B C" also works with no prior triangle.
      placeBase(
        objects,
        [
          { id: cmd.a, x: -3, y: -2 },
          { id: cmd.b, x: 3, y: -2 },
          { id: cmd.c, x: 0, y: 3 },
        ],
        pos,
      );
      addObj(objects, { kind: 'circumcenter', id: cmd.center, a: cmd.a, b: cmd.b, c: cmd.c });
      addObj(objects, { kind: 'circle', id: cmd.id, center: cmd.center, radius: { via: 'through', point: cmd.a }, autoCenter: true, ...(cmd.hidden ? { hidden: true } : {}) }); // circumcentre is auto, hidden unless used; `hidden` for a cyclic (בר-חסימה) figure
      break;

    case 'point-on-circle': {
      // Re-defining an EXISTING point as "on circle C" is a RELATION on that point, not a fresh
      // vertex — and `addObj` would silently no-op it (the "green but E isn't on the circle" bug).
      const existing = objects.find((o) => o.id === cmd.id);
      if (existing) {
        // (a) Already on this circle ⇒ idempotent (re-stating the same fact).
        if (pointOnCircle(objects, cmd.id, cmd.circle)) break;
        // (b) E sits on a segment/line one of whose ends is ALSO on C ⇒ this is the SECOND
        // crossing of that line with C: become a line∩circle avoiding the shared end (the same
        // reinterpretation as `addCollinear`). E.g. "E on extension AC" + "E on circle P", A on P
        // ⇒ E = line(A,C) ∩ P, avoiding A. Drives E onto the circle instead of dropping the fact.
        if (existing.kind === 'on-segment' || existing.kind === 'on-segment-solved') {
          const ends = [existing.a, existing.b];
          const shared = ends.find((id) => pointOnCircle(objects, id, cmd.circle));
          if (shared) {
            const other = ends.find((id) => id !== shared)!;
            const lineId = `line-${shared}${other}`;
            addLine(objects, { kind: 'line', id: lineId, spec: { via: 'through', a: shared, b: other } });
            const i = objects.findIndex((o) => o.id === cmd.id);
            objects[i] = { kind: 'line-circle', id: cmd.id, line: lineId, circle: cmd.circle, branch: 0, avoid: shared };
            break;
          }
        }
        // (c) The point is fixed/derived and can't itself slide onto the circle — but the CIRCLE may
        // have a free SIZE DOF. When its radius is set by a point T on it (`circle-through`, e.g. the
        // inscribed-corner circle whose centre is a free point on a bisector), "P on circle" ⟺
        // |centre·P| = |centre·T|; push that as an `equal` so driveOrCheck grows the circle's free DOF
        // (its centre's slide) until P lands on it — the engine ADJUSTS the circle instead of dropping
        // the relation (operator: "why isn't C adjusted to be on the circle?"). Tangency is preserved
        // because the centre stays on its bisector; only the size changes.
        const circ = objects.find((o) => o.id === cmd.circle && o.kind === 'circle') as Extract<GeoObject, { kind: 'circle' }> | undefined;
        if (circ && circ.radius.via === 'through' && circ.radius.point !== cmd.id) {
          driveOrCheck(objects, constraints, { type: 'equal', a: circ.center, b: cmd.id, c: circ.center, d: circ.radius.point });
          break;
        }
        // (c2) The point is a NON-PINNED free vertex (e.g. a quadrilateral corner) and the circle's size is
        // not pinned by a through-point: model it honestly as a point that SLIDES ON the circle. Convert the
        // free point to an on-circle point so it is genuinely on the circle (0 residual) and the joint solver
        // places its angle — with the free centre/radius and the other free DOFs — to satisfy the accumulated
        // constraints. This is the "shapes carry their true DOF" model: declaring a quad's C,D "on circle O"
        // makes CD a real chord instead of leaving the corners adrift (the verifier's "C is not on circle O").
        // A through-radius circle (handled by (c)) is excluded — there the CIRCLE grows to the fixed vertex.
        if (circ && existing.kind === 'free-point' && !(existing as Extract<GeoObject, { kind: 'free-point' }>).pinned) {
          const i = objects.findIndex((o) => o.id === cmd.id);
          // PRESERVE a `solve` the free vertex already carries ([ADR-140](docs/06-decisions.md#adr-140)): a
          // kite/shape vertex may already DRIVE an equality (e.g. D drives `AB=AD`). Dropping its carrier role
          // on conversion would leave that equality without a carrier, so the conversion's `evaluate` fails and
          // the whole `point-on-circle` fact is rolled back — the point can never reach the circle. Carried
          // over, D still drives `AB=AD`, now via its on-circle θ (it slides on the circle to keep |AD|=|AB|).
          const solve = (existing as { solve?: SolveDirective }).solve;
          objects[i] = { kind: 'on-circle', id: cmd.id, circle: cmd.circle, theta: nextTheta(objects, cmd.circle), free: true, ...(solve ? { solve } : {}) };
          break;
        }
        // (d) Can't reconcile structurally here — do NOT silently drop it; the post-evaluate
        // verifier reports that "E on circle C" doesn't hold, so it can never read as a clean green.
        break;
      }
      // `between` ⇒ a free point ON THE ARC between two points (theta is a fraction of the half-arc,
      // 0 = the arc midpoint — ADR-042). Else: no explicit angle ⇒ a free vertex the sampler may slide
      // (inscribed triangle, chord end); an explicit angle (an inscribed square's corner) is fixed —
      // UNLESS `cmd.free` is set, where the angle is just a STARTING position the figure may sample/drive
      // (a general inscribed quad's convex-default angles, ADR-097): free even though theta is given.
      addObj(
        objects,
        cmd.between
          ? { kind: 'on-circle', id: cmd.id, circle: cmd.circle, theta: 0, free: true, between: cmd.between }
          : { kind: 'on-circle', id: cmd.id, circle: cmd.circle, theta: cmd.theta ?? nextTheta(objects, cmd.circle), free: cmd.free ?? cmd.theta === undefined },
      );
      break;
    }

    case 'diameter': {
      // D on the circle (a free angle — a diameter can rotate), E its antipode, segment DE through the centre.
      addObj(objects, { kind: 'on-circle', id: cmd.id1, circle: cmd.circle, theta: cmd.theta ?? nextTheta(objects, cmd.circle), free: cmd.theta === undefined });
      addObj(objects, { kind: 'antipode', id: cmd.id2, circle: cmd.circle, of: cmd.id1 });
      addObj(objects, segment(cmd.id1, cmd.id2));
      break;
    }

    case 'arc-midpoint':
      // The arc endpoints must lie on the circle — create them there if missing.
      for (const pid of [cmd.from, cmd.to]) {
        if (!objects.some((o) => o.id === pid)) addObj(objects, { kind: 'on-circle', id: pid, circle: cmd.circle, theta: nextTheta(objects, cmd.circle), free: true });
      }
      addObj(objects, { kind: 'arc-midpoint', id: cmd.id, circle: cmd.circle, from: cmd.from, to: cmd.to, branch: cmd.branch ?? 0 });
      break;

    case 'line-circle-intersection':
      addObj(objects, { kind: 'line-circle', id: cmd.id, line: cmd.line, circle: cmd.circle, branch: cmd.branch ?? 0, ...(cmd.avoid ? { avoid: cmd.avoid } : {}) });
      // Keep the crossing ON the segment (the circle "cuts CE at D" ⇒ D between C and E). D is already
      // collinear (it's a point on the line), so we add ONLY the side/order constraint — NOT `addCollinear`
      // (which would mis-drive a free on-circle endpoint, ADR-127). The order's residual is folded into the
      // joint minimisation, so the solver/sampler flexes the free DOFs (the segment's endpoints) to satisfy
      // it across configurations, not just the default seed.
      if (cmd.order && cmd.order.length >= 3) constraints.push({ type: 'collinear-order', points: [...cmd.order] });
      break;

    // "המשך AC חותך מעגל P בנקודה D" (ADR-054): the new point D is on circle P, collinear with A,C, and
    // BEYOND the 2nd named point (order A→C→D). Two structurally different cases:
    case 'extend-onto-circle': {
      const order: Constraint = { type: 'collinear-order', points: [cmd.a, cmd.b, cmd.id] };
      const coll: Constraint = { type: 'collinear', a: cmd.a, b: cmd.b, c: cmd.id };

      // (0) TARGET ALREADY EXISTS — e.g. an earlier "chord A D" placed D as a free on-circle point and the
      // student now pins it with "extend C A onto the circle at D" (asserting the figure THEOREM that C,A,D
      // are collinear). Re-creating D would SILENTLY NO-OP — addObj keeps the first definition and case (1)
      // below pushes no constraints, so the whole directional coupling is dropped and D stays wherever the
      // earlier construction left it (the operator's "C-A-D not respected", ADR-124). So when D exists, the
      // extension is a CONSTRAINT on it — collinear with A,C and BEYOND the 2nd letter — never a re-build.
      // If D is a free on-circle point of THIS circle, drive its θ with the same order-aware far-crossing
      // solve the fresh case (2) uses (so it lands past A, not on the near crossing); for any other carrier
      // the constraints alone flex the figure (the global solver / recruiter owns the DOF).
      const existingIdx = objects.findIndex((o) => o.id === cmd.id);
      if (existingIdx >= 0) {
        const existing = objects[existingIdx];
        if (existing.kind === 'on-circle' && existing.circle === cmd.circle && existing.free) {
          objects[existingIdx] = { ...existing, solve: { constraint: coll, branch: cmd.branch ?? 0 } };
        }
        constraints.push(coll, order);
        addObj(objects, segment(cmd.a, cmd.id)); // the drawn secant A → D
        break;
      }

      // (1) SHARED-ENDPOINT — a line endpoint already lies on the TARGET circle (e.g. A is on circle O
      // because it's an O∩P crossing). The line then meets the circle at that endpoint AND at exactly ONE
      // other point, so the directional extension IS that second crossing — a DETERMINISTIC `line∩circle`
      // that AVOIDS the shared endpoint (the same second-intersection pattern as `addCollinear` / ADR-050
      // Am.2 / `lineMeetsCircle`). No driven solve, no radius change: with only one other crossing the
      // "direction" is forced, and a numeric collinear solve here can collapse the new point onto the
      // shared endpoint ("A and D would be at the same point" — the operator's crash this fixes).
      const shared = [cmd.a, cmd.b].find((id) => pointOnCircle(objects, id, cmd.circle));
      if (shared) {
        const other = shared === cmd.a ? cmd.b : cmd.a;
        const lineId = `line-${other}${shared}`;
        addLine(objects, { kind: 'line', id: lineId, spec: { via: 'through', a: other, b: shared } });
        addObj(objects, { kind: 'line-circle', id: cmd.id, line: lineId, circle: cmd.circle, branch: 0, avoid: shared });
        addObj(objects, segment(cmd.a, cmd.id)); // the drawn secant (through the shared end)
        break;
      }
      // (2) NEITHER endpoint on the circle — the genuinely-directional case. D is a driven free on-circle
      // θ pinned by `collinear` to line AC and by `collinear-order` to the far side. With default radii a
      // line AC often has NO extension crossing beyond C, so applyStep's recruitFreeDofs grabs the
      // circle's FREE radius (via `circlesOfPoint`) and the mixed solver (honouring collinear-order) grows
      // it until an extension root exists (the "adapt the figure" semantics, ADR-052). The radius is left
      // untouched when a root already exists (the 1-DOF order-aware pick) or when it's a fixed size.
      addObj(objects, { kind: 'on-circle', id: cmd.id, circle: cmd.circle, theta: nextTheta(objects, cmd.circle), free: true, solve: { constraint: coll, branch: cmd.branch ?? 0 } });
      constraints.push(coll, order);
      addObj(objects, segment(cmd.a, cmd.id)); // the drawn secant A → D (through B)
      break;
    }

    case 'circle-circle-intersection':
      addObj(objects, { kind: 'circle-circle', id: cmd.id, circle1: cmd.circle1, circle2: cmd.circle2, branch: cmd.branch ?? 0, ...(cmd.avoid ? { avoid: cmd.avoid } : {}) });
      break;

    case 'tangent':
      // The point of tangency lies on the circle — create it there if it doesn't
      // exist yet, so "tangent to circle O at A" works even before A is placed.
      if (!objects.some((o) => o.id === cmd.at)) {
        addObj(objects, { kind: 'on-circle', id: cmd.at, circle: cmd.circle, theta: nextTheta(objects, cmd.circle), free: true });
      }
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'tangent', circle: cmd.circle, at: cmd.at }, visible: cmd.visible });
      break;

    case 'point-on-line': {
      // Create the marker, or — if a LOOSE free point already carries this id (a bare "segment CD"
      // then "CD ⟂ AB at F") — REPOSITION it onto the line, so naming a drawn line by existing
      // points pins them to it (ADR-036). A structural point (derived) is left untouched.
      const onLine: GeoObject = { kind: 'on-line', id: cmd.id, line: cmd.line, offset: cmd.offset };
      const idx = objects.findIndex((o) => o.id === cmd.id);
      if (idx < 0) objects.push(onLine);
      else if (objects[idx].kind === 'free-point') objects[idx] = onLine;
      break;
    }

    case 'circles-tangent': {
      // Two circles tangent at one point: pull the centres to the touching distance
      // (external = r1+r2, internal = |r1−r2|) and place `at` on the centre line.
      const idx1 = objects.findIndex((o) => o.id === cmd.circle1 && o.kind === 'circle');
      const idx2 = objects.findIndex((o) => o.id === cmd.circle2 && o.kind === 'circle');
      if (idx1 >= 0 && idx2 >= 0) {
        const c1 = objects[idx1] as Extract<GeoObject, { kind: 'circle' }>;
        const c2 = objects[idx2] as Extract<GeoObject, { kind: 'circle' }>;
        // FREE-RADIUS path ([ADR-052](docs/06-decisions.md#adr-052)): when a radius is UNSTATED it is a
        // free DOF, so tangency is a CONSTRAINT over the free radii — |OP| = r1+r2 (external) — NOT a
        // pinned centre distance. A `coincide` between the touch point seen from EACH circle (M on circle 1
        // toward c2; a hidden witness on circle 2 toward c1) has residual ||OP| − (r1+r2)|: it forces the
        // EXTERNAL relation and DRIVES the free radii/centres (recruitFreeDofs reaches them through the
        // radial-toward points). So "two tangent circles" then "OP = 4" resizes the radii to sum to 4
        // instead of contradicting the seeds 5/3 the student never gave (the reported over-constraint bug).
        // Both radii STATED ⇒ fall through to the fixed path below, where |OP| is genuinely rigid.
        if (c1.radius.via === 'free' || c2.radius.via === 'free') {
          const rseed = (r: typeof c1.radius): number => (r.via === 'free' || r.via === 'length' ? r.value : 5);
          const r1 = rseed(c1.radius);
          const r2 = rseed(c2.radius);
          // Seed c2's centre at the exact touching distance so the DEFAULT figure is already tangent (the
          // solver re-engages only when a later constraint moves a radius / |OP|). External: r1+r2; internal: |r1−r2|.
          const c1c = objects.find((o) => o.id === c1.center && o.kind === 'free-point') as Extract<GeoObject, { kind: 'free-point' }> | undefined;
          const c2j = objects.findIndex((o) => o.id === c2.center && o.kind === 'free-point');
          const c2c = c2j >= 0 ? (objects[c2j] as Extract<GeoObject, { kind: 'free-point' }>) : undefined;
          if (c1c && c2c && !c2c.pinned) {
            const dx = c2c.x - c1c.x, dy = c2c.y - c1c.y;
            const L = Math.hypot(dx, dy) > 1e-6 ? Math.hypot(dx, dy) : 1;
            const ux = Math.hypot(dx, dy) > 1e-6 ? dx / L : 1;
            const uy = Math.hypot(dx, dy) > 1e-6 ? dy / L : 0;
            const gap = cmd.external ? r1 + r2 : Math.abs(r1 - r2);
            objects[c2j] = { ...c2c, x: c1c.x + ux * gap, y: c1c.y + uy * gap };
          }
          const wit = `~touch-${cmd.at}`;
          if (cmd.external) {
            // M on circle 1 toward c2; the witness on circle 2 toward c1. coincide ⇒ |OP| = r1+r2.
            addObj(objects, { kind: 'radial-toward', id: cmd.at, circle: c1.id, toward: c2.center });
            addObj(objects, { kind: 'radial-toward', id: wit, circle: c2.id, toward: c1.center });
          } else {
            // Internal: the larger (by seed) circle is OUTER; M on the outer toward the inner; the witness
            // on the inner toward M (so the touch lands on the far side of the inner centre). coincide ⇒ |OP| = |r1−r2|.
            const outer = r1 >= r2 ? c1 : c2;
            const inner = r1 >= r2 ? c2 : c1;
            addObj(objects, { kind: 'radial-toward', id: cmd.at, circle: outer.id, toward: inner.center });
            addObj(objects, { kind: 'radial-toward', id: wit, circle: inner.id, toward: cmd.at });
          }
          const tcon: Constraint = { type: 'coincide', p: cmd.at, q: wit };
          // Mark each FREE radius as a PERMANENT driver of the tangency (like length-radius / ADR-071): the
          // touch points carry no DOF themselves, so without this the coincide is only a CHECK, satisfied at
          // build but never re-flexed — and recruitFreeDofs widens DOFs only for a step's OWN new constraint,
          // so a later "OP=4" (which moves a centre) would break the build-time tangency and over-constrain.
          // Marking both radii makes them carriers in every joint solve, so |OP| changes RESHAPE the radii
          // (proportionally) to keep r1+r2 = |OP|. (The reported "two tangent circles then OP=4" bug.)
          for (const ix of [idx1, idx2]) {
            const oc = objects[ix];
            if (oc.kind === 'circle' && oc.radius.via === 'free' && (oc as { solve?: unknown }).solve === undefined) {
              objects[ix] = { ...oc, solve: { constraint: tcon, branch: 0 } };
            }
          }
          constraints.push(tcon);
          break;
        }
        if (c1.radius.via === 'length' && c2.radius.via === 'length') {
          const r1 = c1.radius.value;
          const r2 = c2.radius.value;
          if (!cmd.external && Math.abs(r1 - r2) < 1e-6) {
            // Equal circles can't be internally tangent at a FIXED radius — but a radius is
            // a flexible DOF (operator: "radius should be a DOF and not fixed"). Make the 2nd
            // circle the largest one that fits inside the 1st and touches it (`tangent-inner`),
            // so its radius DERIVES from the centre gap. Seed the 2nd centre at a gap of r1/2
            // (⇒ inner radius r1/2); the centre stays a free DOF the sampler varies, the touch
            // point tracks it, and the drawn radius is honest — no hidden ½. (ADR-037 Amend 2.)
            objects[idx2] = { ...c2, radius: { via: 'tangent-inner', outer: c1.id } };
            const ciIdx = objects.findIndex((o) => o.id === c2.center && o.kind === 'free-point');
            const innerFree = ciIdx >= 0 ? (objects[ciIdx] as Extract<GeoObject, { kind: 'free-point' }>) : undefined;
            if (innerFree && !innerFree.pinned) {
              const oc = objects.find((o) => o.id === c1.center && o.kind === 'free-point') as Extract<GeoObject, { kind: 'free-point' }> | undefined;
              objects[ciIdx] = { ...innerFree, x: (oc?.x ?? 0) + r1 / 2, y: oc?.y ?? 0 };
            }
            // Touch point: on the OUTER circle, on the ray toward the inner centre (tracks resample).
            addObj(objects, { kind: 'radial-toward', id: cmd.at, circle: c1.id, toward: c2.center });
            break;
          }
          if (cmd.external) {
            const d = r1 + r2;
            addObj(objects, { kind: 'on-segment', id: cmd.at, a: c1.center, b: c2.center, t: r1 / d });
            driveOrCheck(objects, constraints, { type: 'distance', a: c1.center, b: c2.center, value: d });
          } else {
            // The bigger circle is the outer one; the touch point lies on the ray from
            // the outer centre through the inner centre, at the outer radius.
            const outerIs1 = r1 >= r2;
            const ro = outerIs1 ? r1 : r2;
            const ri = outerIs1 ? r2 : r1;
            const co = outerIs1 ? c1.center : c2.center;
            const ci = outerIs1 ? c2.center : c1.center;
            const d = ro - ri;
            if (d > 1e-9) {
              addObj(objects, { kind: 'on-segment', id: cmd.at, a: co, b: ci, t: ro / d });
              driveOrCheck(objects, constraints, { type: 'distance', a: co, b: ci, value: d });
            }
          }
        }
      }
      break;
    }

    case 'point-by-distances':
      addObj(objects, {
        kind: 'intersection',
        id: cmd.id,
        mode: 'circle-circle',
        center1: cmd.from1,
        radius1: cmd.dist1,
        center2: cmd.from2,
        radius2: cmd.dist2,
        branch: cmd.branch ?? 0,
      });
      break;

    case 'set-angle':
      driveOrCheck(objects, constraints, { type: 'angle', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, value: cmd.value });
      break;

    case 'set-distance':
      driveOrCheck(objects, constraints, { type: 'distance', a: cmd.a, b: cmd.b, value: cmd.value });
      break;

    case 'set-radius': {
      // Set a circle's radius BY VALUE, without inventing a point or drawing a radius segment (ADR-087).
      // Resolve per how the circle's radius is defined: a `through` circle (its radius is |centre·point|,
      // e.g. an incircle through its tangent foot) becomes a distance constraint that FLEXES the figure; a
      // `free`-radius DOF and a `length` radius are simply set to the stated value (a stated size is a given,
      // ADR-052). `tangent-inner` (radius derived from another circle) has no own size to pin → leave to the
      // verifier to flag if it cannot hold.
      const circ = objects.find((o): o is Extract<GeoObject, { kind: 'circle' }> => o.kind === 'circle' && o.id === cmd.circle);
      if (circ) {
        if (circ.radius.via === 'through') {
          driveOrCheck(objects, constraints, { type: 'distance', a: circ.center, b: circ.radius.point, value: cmd.value });
        } else if (circ.radius.via === 'free' || circ.radius.via === 'length') {
          circ.radius = { via: 'length', value: cmd.value };
        }
      }
      break;
    }

    case 'set-equal':
      driveOrCheck(objects, constraints, { type: 'equal', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      break;

    case 'set-ratio':
      driveOrCheck(objects, constraints, { type: 'ratio', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d, k: cmd.k, ...(cmd.add ? { add: cmd.add } : {}) });
      break;

    case 'set-area':
      driveOrCheck(objects, constraints, { type: 'area', ids: cmd.ids, value: cmd.value });
      break;

    case 'set-area-ratio':
      driveOrCheck(objects, constraints, { type: 'area-ratio', ids1: cmd.ids1, ids2: cmd.ids2, k: cmd.k });
      break;

    case 'set-length-radius':
      driveOrCheck(objects, constraints, {
        type: 'length-radius',
        a: cmd.a, b: cmd.b, circle: cmd.circle, center: cmd.center, witness: cmd.witness, k: cmd.k, ...(cmd.add ? { add: cmd.add } : {}),
      });
      break;

    case 'set-angle-ratio':
      driveOrCheck(objects, constraints, {
        type: 'angle-ratio',
        v1: cmd.v1, a1: cmd.a1, b1: cmd.b1, v2: cmd.v2, a2: cmd.a2, b2: cmd.b2, k: cmd.k,
      });
      break;

    case 'set-parallel':
      driveOrCheck(objects, constraints, { type: 'parallel', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      break;

    case 'set-perpendicular':
      driveOrCheck(objects, constraints, { type: 'perpendicular', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      break;

    // An ORDER (inequality) is satisfied by a whole region, so it has no sign-change for the bracketing
    // carrier path driveOrCheck would pick — push it as a pure CHECK. If the current figure already
    // satisfies it, evaluate passes untouched; if not, applyStep's recruitFreeDofs grabs the free DOFs
    // it transitively depends on and the optimizer reshapes the figure into the satisfying region (ADR-039).
    case 'set-angle-order':
      constraints.push({ type: 'angle-order', v1: cmd.v1, a1: cmd.a1, b1: cmd.b1, v2: cmd.v2, a2: cmd.a2, b2: cmd.b2 });
      break;

    case 'set-length-order':
      constraints.push({ type: 'length-order', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      break;

    // "∠ABC is obtuse/acute" ("זווית קהה/חדה"): a one-sided angle constraint (>90° / <90°) that reshapes the
    // figure (recruitFreeDofs drives a free DOF) until the angle is on the requested side. Its arms are drawn
    // by the parser (segment commands), as for `set-angle`.
    case 'set-angle-acuteness':
      constraints.push({ type: 'angle-acuteness', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, obtuse: cmd.obtuse });
      break;

    // The points are concyclic (ADR-041) — drive a free DOF among them (an on-segment slide, a free
    // vertex) until they share a circle. Generic via driveOrCheck: the residual sign-changes, so an
    // on-segment carrier solves in closed form; a fully-determined set is a pure check (over-constraint).
    case 'set-concyclic':
      driveOrCheck(objects, constraints, { type: 'concyclic', points: cmd.points });
      break;

    // a, b, c collinear (ADR-050): drive a free DOF among them (an on-circle / on-segment point
    // slides onto the line through the other two) — the third point lands on the line. A pure check
    // when all three are determined (e.g. "A, B, C collinear" on fixed points → over-constraint
    // detection). Generic via driveOrCheck + the sin∠ residual in solve.ts; the FIRST point is
    // preferred as the carrier (so "E on line AC" slides E, not A or C).
    case 'set-collinear':
      addCollinear(objects, constraints, cmd.a, cmd.b, cmd.c);
      break;

    // "line ABE…" (ADR-050 Am.3): the points are collinear AND in the listed order (B between A and E).
    // Collinearity puts each later point on the line through the first two (reusing the second-intersection
    // conversion); the order is a one-sided `collinear-order` constraint that pins the SIDE/sequence —
    // pushed as a check that the optimizer drives a free DOF to satisfy (so naming points in order selects
    // the configuration, e.g. which crossing). Also draws the spanning segment.
    case 'set-line': {
      const pts = cmd.points;
      if (pts.length >= 2) {
        addObj(objects, segment(pts[0], pts[pts.length - 1]));
        for (let i = 2; i < pts.length; i++) addCollinear(objects, constraints, pts[i], pts[0], pts[1]);
        if (pts.length >= 3) {
          const order: Constraint = { type: 'collinear-order', points: [...pts] };
          // Drive the order with the free PARAMETRIC carriers (on-circle/on-segment) AMONG the points, so
          // the optimizer sequences the figure (slides an anchor until the order holds). We mark them
          // directly rather than leaning on recruitFreeDofs, which would reach a fixed intersection point's
          // parent CIRCLE CENTRES and distort the circles. When none are movable, it's a pure check.
          for (const p of pts) {
            const i = objects.findIndex((o) => o.id === p);
            const o = i >= 0 ? objects[i] : undefined;
            if (o && (o.kind === 'on-circle' || o.kind === 'on-segment') && (o as { solve?: unknown }).solve === undefined) {
              objects[i] = { ...o, solve: { constraint: order, branch: 0 } };
            }
          }
          constraints.push(order);
        }
      }
      break;
    }
  }

  return { objects, constraints };
}

/**
 * Add a collinearity of a, b, c. When the point to drive is on a circle and the line through the other
 * two passes through a point ALSO on that circle, this is the SECOND-INTERSECTION pattern ([ADR-050](docs/06-decisions.md#adr-050)
 * Am.2): "P on line QR" means the OTHER crossing of line QR with the circle, so it becomes a line∩circle
 * that AVOIDS the shared point — deterministic, never collapsing onto it — instead of a driven collinear
 * (whose numeric solve could land on the degenerate shared-point crossing or the wrong side). E.g. "E on
 * line DB" with E and B on circle O ⇒ E = line(D,B) ∩ O, avoiding B. Otherwise a generic driven collinear.
 */
function addCollinear(objects: GeoObject[], constraints: Constraint[], a: Id, b: Id, c: Id): void {
  const refs: Id[] = [a, b, c];
  const driven = refs.find((id) => {
    const o = objects.find((x) => x.id === id);
    return o?.kind === 'on-circle' && (o as { solve?: unknown }).solve === undefined;
  });
  const dObj = driven ? objects.find((x) => x.id === driven) : undefined;
  const others = refs.filter((id) => id !== driven);
  const shared = dObj && dObj.kind === 'on-circle' && others.length === 2
    ? others.find((id) => pointOnCircle(objects, id, dObj.circle))
    : undefined;
  if (dObj && dObj.kind === 'on-circle' && shared) {
    const lineId = `line-${others[0]}${others[1]}`;
    addLine(objects, { kind: 'line', id: lineId, spec: { via: 'through', a: others[0], b: others[1] } });
    const i = objects.findIndex((x) => x.id === driven);
    objects[i] = { kind: 'line-circle', id: driven!, line: lineId, circle: dObj.circle, branch: 0, avoid: shared };
  } else {
    driveOrCheck(objects, constraints, { type: 'collinear', a, b, c });
  }
}
