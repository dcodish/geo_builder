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
import { add, dist, lineLineIntersect, reflectAcross, scale, sub } from './geometry';
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
 * Keep a two-circle tangency solvable after a radius is pinned (ADR-228 Am.3 / ADR-230). The free-radius
 * tangency ([circles-tangent]) is a `coincide` of two `radial-toward` witnesses (residual ||O1O2| − (r1±r2)|),
 * driven by whichever circle radius is FREE, with the centre GAP left at its build-time value r1+r2. Pinning a
 * radius makes the gap wrong: once r1 is fixed, the still-free r2 alone can satisfy |O1O2| = r1+r2 ONLY if the
 * (fixed) gap already exceeds r1 — it usually doesn't (gap ≈ the smaller build seed), so the tangency
 * over-constrains. The gap must become a DOF: recruit a free, unpinned CENTRE as a co-driver of the coincide so
 * the solver spreads the centres to r1+r2. Needed as soon as ANY radius is pinned (not only the last). No-op if
 * `con` isn't the tangency device or a centre already drives it. (When every centre is BUSY with another
 * constraint the handoff comes up empty — the FIRST size given on such a figure is then satisfied by the
 * step-level SCALE rescue instead, ADR-237; a later size that pins the remaining radius orphans the coincide
 * into the M2/ADR-231 re-home path.)
 */
function keepTangencyDriven(objects: GeoObject[], con: Constraint): void {
  if (con.type !== 'coincide') return;
  const wit = [con.p, con.q]
    .map((id) => objects.find((o) => o.id === id))
    .filter((o): o is Extract<GeoObject, { kind: 'radial-toward' }> => o?.kind === 'radial-toward');
  if (wit.length !== 2) return; // not the tangency device (an ordinary point-coincidence)
  const key = JSON.stringify(con);
  if (objects.some((o) => o.kind === 'free-point' && JSON.stringify((o as { solve?: { constraint: Constraint } }).solve?.constraint) === key)) return; // a centre already drives it
  const circs = wit.map((w) => objects.find((o) => o.id === w.circle && o.kind === 'circle')) as (Extract<GeoObject, { kind: 'circle' }> | undefined)[];
  // Mark a free, unpinned, not-yet-driving CENTRE as the coincide's carrier (the gap DOF).
  for (const c of circs) {
    if (!c) continue;
    const ci = objects.findIndex(
      (o) => o.id === c.center && o.kind === 'free-point' && !(o as Extract<GeoObject, { kind: 'free-point' }>).pinned && (o as { solve?: unknown }).solve === undefined,
    );
    if (ci >= 0) {
      objects[ci] = { ...(objects[ci] as Extract<GeoObject, { kind: 'free-point' }>), solve: { constraint: con, branch: 0 } };
      return;
    }
  }
}

/** The circle(s) a point structurally lies ON (its distance to their centre IS that circle's radius). */
function circleIdsOfPointOn(o: GeoObject | undefined): Id[] {
  switch (o?.kind) {
    case 'on-circle':
    case 'radial-toward':
    case 'line-circle':
    case 'antipode':
    case 'arc-midpoint':
      return [o.circle];
    case 'circle-circle':
      return [o.circle1, o.circle2];
    default:
      return [];
  }
}

/** `ptId` lies on circle `circleId` — either structurally, or coincident (via a `coincide`, e.g. the tangency
 *  witness `~touch-M` that shares M's position on the OTHER circle) with a point that structurally does. */
function pointLiesOnCircle(objects: GeoObject[], constraints: Constraint[], ptId: Id, circleId: Id): boolean {
  const eq = new Set<Id>([ptId]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const k of constraints) {
      if (k.type !== 'coincide') continue;
      if (eq.has(k.p) !== eq.has(k.q)) { eq.add(k.p); eq.add(k.q); changed = true; }
    }
  }
  for (const id of eq) if (circleIdsOfPointOn(objects.find((o) => o.id === id)).includes(circleId)) return true;
  return false;
}

/** When `|a·b|` is really the RADIUS of a circle whose free radius is BUSY driving a tangency — one endpoint is
 *  the centre, the other lies on that circle, and the radius is `via:'free'` WITH a solve directive — return
 *  that circle's index; else −1. This is the one case the generic path mishandles: a distance-to-a-radial point
 *  can't drive the radial point itself (not a movable carrier), and the free radius is UNAVAILABLE (already
 *  driving the tangency coincide), so `driveOrCheck` falls through to the circle's free CENTRE — which can never
 *  change |centre·P| — injecting a spurious, useless centre DOF into every later solve (the false over-constraint
 *  in two-tangent-circles + size-givens + tangents-from-a-point; ADR-230). Pinning the busy radius here frees the
 *  coincide to a centre (`keepTangencyDriven`). An AVAILABLE free radius (e.g. two INTERSECTING circles, where the
 *  radius must stay a flexible DOF so `circle-circle-intersection` still meets) is deliberately NOT matched — the
 *  recruiter grows it correctly without pinning. */
function radiusCircleForDistance(objects: GeoObject[], constraints: Constraint[], a: Id, b: Id): number {
  for (const [centreId, ptId] of [[a, b], [b, a]] as [Id, Id][]) {
    const i = objects.findIndex(
      (o) =>
        o.kind === 'circle' &&
        o.center === centreId &&
        o.radius.via === 'free' &&
        (o as { solve?: unknown }).solve !== undefined &&
        pointLiesOnCircle(objects, constraints, ptId, o.id),
    );
    if (i >= 0) return i;
  }
  return -1;
}

/** Apply a stated RADIUS to a circle (shared by `set-radius` and a centre-to-on-circle `set-distance`). A
 *  `through` circle's radius is |centre·point| → a distance that flexes the figure; a `free`/`length` radius is
 *  pinned to the value (a stated size is a given, ADR-052), dropping any stale driver — and if that radius drove
 *  a two-circle tangency, recruit a free CENTRE so the tangency survives once no free radius absorbs it (ADR-228 Am.3). */
function applyRadiusGiven(objects: GeoObject[], constraints: Constraint[], idx: number, value: number): void {
  const circ = objects[idx];
  if (circ.kind !== 'circle') return;
  if (circ.radius.via === 'through') {
    driveOrCheck(objects, constraints, { type: 'distance', a: circ.center, b: circ.radius.point, value });
  } else if (circ.radius.via === 'free' || circ.radius.via === 'length') {
    const prevSolve = (circ as { solve?: { constraint: Constraint } }).solve;
    objects[idx] = { ...circ, radius: { via: 'length', value }, solve: undefined } as GeoObject;
    if (prevSolve?.constraint.type === 'coincide') keepTangencyDriven(objects, prevSolve.constraint);
  }
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
  // NOTE: `right-triangle` is deliberately ABSENT. Its vertex order is SEMANTIC — the right
  // angle is at the LAST id — so it is NOT rotation-invariant like the polygons above. Cyclic
  // rotation (to reuse an existing edge) would relocate the right angle to a different vertex
  // (`right-triangle A,B,D` → `[B,D,A]` silently moved ∠90 from D to A — Q8 bug, ADR-223). Composition on
  // existing vertices is instead handled by the right-triangle apply case itself: it SWAPS the two
  // interchangeable hypotenuse endpoints so a fresh one becomes the derived perp-offset, and when the
  // whole hypotenuse pre-exists it asserts the right angle as a CONSTRAINT on the new vertex.
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
/** The figure's extent around `c` (for scale-relative tolerances; floored at 1 for tiny/empty figures). */
function spanAround(c: Vec, existing: Vec[]): number {
  return Math.max(1, ...existing.map((v) => Math.max(Math.abs(v.x - c.x), Math.abs(v.y - c.y))));
}

/**
 * Is any of `pts` in a DEGENERATE spot w.r.t. the existing points ([ADR-253](../../docs/06-decisions.md#adr-253)):
 * within ~1.5% of the span of an existing point (the store's pointsDistinct "too close to draw" bar), or
 * EXACTLY (1e-6·span — template arithmetic produces exact hits) on the infinite line through the anchor
 * `c` and an existing point? Both are measure-zero relations the student never stated: they draw a false
 * coincidence/collinearity (ADR-052) and hard-poison later solves at the one composition the apply gate
 * judges.
 */
function degeneratePlacement(c: Vec, pts: Vec[], existing: Vec[], span: number): boolean {
  const tolPt = 0.015 * span;
  const tolLine = 1e-6 * span;
  return pts.some((p) => {
    const d = sub(p, c);
    const len = Math.hypot(d.x, d.y);
    return existing.some(
      (q) =>
        Math.hypot(p.x - q.x, p.y - q.y) < tolPt ||
        (len > 1e-12 && Math.abs((q.x - c.x) * d.y - (q.y - c.y) * d.x) / len < tolLine),
    );
  });
}

/**
 * Re-seat a GENUINELY LOOSE endpoint of a stated segment-meet so the two segments actually cross
 * ([ADR-255](../../docs/06-decisions.md#adr-255)). "AM חותך את CO ב-K" asserts the crossing exists —
 * that is information about where a free M belongs (M1/M4: defaults yield to statements). Fires only
 * when the crossing currently lies OFF a segment (or the lines are parallel); moves only a non-pinned
 * free point that no constraint references and no directive drives (a constrained endpoint — e.g. an
 * ADR-166 equilateral apex — is owned by its own mechanism); prefers the endpoint with the FEWEST
 * dependents (so a circle-defining point is moved only as a last resort); and the new spot must keep
 * the point on the SAME SIDE of every resolvable circle (a stated "M מחוץ למעגל" survives, ADR-254)
 * and in general position (ADR-253). The point stays a free DOF — this is a better default, not a pin.
 */
function reseatLooseMeetEndpoint(
  objects: GeoObject[],
  constraints: Constraint[],
  pos: Map<Id, Vec>,
  seg1: [Id, Id],
  seg2: [Id, Id],
): void {
  const p = (id: Id) => pos.get(id);
  const [a, b, c, d] = [p(seg1[0]), p(seg1[1]), p(seg2[0]), p(seg2[1])];
  if (!a || !b || !c || !d) return;
  const param = (s: Vec, e: Vec, x: Vec): number => {
    const L = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    return L < 1e-18 ? 0.5 : ((x.x - s.x) * (e.x - s.x) + (x.y - s.y) * (e.y - s.y)) / L;
  };
  const off = (t: number) => t < -0.02 || t > 1.02;
  const hit = lineLineIntersect(a, b, c, d);
  const off1 = !hit || off(param(a, b, hit));
  const off2 = !hit || off(param(c, d, hit));
  if (!off1 && !off2) return; // the stated crossing already holds
  const loose = (id: Id): boolean => {
    const o = objects.find((x) => x.id === id);
    return (
      !!o &&
      o.kind === 'free-point' &&
      !o.pinned &&
      !(o as { solve?: unknown }).solve &&
      !constraints.some((k) => constraintRefs(k).includes(id))
    );
  };
  const refsId = (o: GeoObject, id: Id): boolean =>
    Object.entries(o).some(([k, v]) => k !== 'id' && (v === id || (Array.isArray(v) && (v as unknown[]).includes(id))));
  const deps = (id: Id): number => objects.filter((o) => o.id !== id && refsId(o, id)).length;
  type Cand = { id: Id; mate: Id; other: [Vec, Vec] };
  const cands: Cand[] = [];
  if (off1) cands.push({ id: seg1[0], mate: seg1[1], other: [c, d] }, { id: seg1[1], mate: seg1[0], other: [c, d] });
  if (off2) cands.push({ id: seg2[0], mate: seg2[1], other: [a, b] }, { id: seg2[1], mate: seg2[0], other: [a, b] });
  const picks = cands.filter((x) => loose(x.id)).sort((x, y) => deps(x.id) - deps(y.id));
  const keepsCircleSides = (oldP: Vec, newP: Vec): boolean =>
    objects.every((o) => {
      if (o.kind !== 'circle') return true;
      const ctr = pos.get(o.center);
      if (!ctr) return true;
      const r =
        o.radius.via === 'through'
          ? pos.get(o.radius.point)
            ? dist(ctr, pos.get(o.radius.point)!)
            : null
          : 'value' in o.radius
            ? o.radius.value
            : null;
      if (r == null) return true;
      const so = dist(oldP, ctr) - r;
      const sn = dist(newP, ctr) - r;
      return Math.abs(so) < 1e-9 ? true : so > 0 === sn > 0;
    });
  for (const cand of picks) {
    const S = pos.get(cand.mate)!;
    const old = pos.get(cand.id)!;
    const mid = { x: (cand.other[0].x + cand.other[1].x) / 2, y: (cand.other[0].y + cand.other[1].y) / 2 };
    const dir = sub(mid, S);
    if (dir.x * dir.x + dir.y * dir.y < 1e-12) continue; // the mate sits on the other segment's midpoint — aim elsewhere
    const existing = [...pos.entries()].filter(([id]) => id !== cand.id && id !== cand.mate).map(([, v]) => v);
    const span = spanAround(S, existing.length ? existing : [mid]);
    for (const k of [1.7, 2.0, 2.4, 1.5, 2.9]) {
      const F = add(S, scale(dir, k)); // beyond the other segment ⇒ the crossing lands inside both
      if (degeneratePlacement(S, [F], existing, span)) continue;
      if (!keepsCircleSides(old, F)) continue;
      const i = objects.findIndex((o) => o.id === cand.id);
      objects[i] = { ...(objects[i] as Extract<GeoObject, { kind: 'free-point' }>), x: F.x, y: F.y };
      return;
    }
  }
}

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
  // ── General position ([ADR-253](../../docs/06-decisions.md#adr-253)). With exactly ONE anchor the
  // similarity fit's ROTATION is arbitrary (fitTemplate resolves it to a pure translation), so the naive
  // default can land a NEW vertex in a measure-zero DEGENERATE spot: exactly ON an existing point ("AB
  // קוטר" puts B at A+(5,0); a later bare "AM" then stacks M onto B), or exactly on the LINE through the
  // anchor and an existing point (K = AM∩OC then collapses onto O, and a later constraint hard-fails at
  // the only composition the apply gate ever judges — the seed is applied AFTER the fold, so no seed can
  // rescue it). A default must also not silently DRAW a coincidence/collinearity the student never stated
  // (ADR-052). So: spin the fitted template around the anchor by golden-angle steps until every new
  // vertex is in general position. The identity is kept whenever it is already generic, so healthy
  // figures are placed bit-identically.
  let spin = (v: Vec): Vec => v;
  const anchors = template.filter((t) => pos.get(t.id) !== undefined);
  const news = template.filter((t) => !objects.some((o) => o.id === t.id));
  if (anchors.length === 1 && news.length > 0) {
    const c = pos.get(anchors[0].id)!;
    const existing = [...pos.entries()].filter(([id]) => id !== anchors[0].id).map(([, v]) => v);
    if (existing.length > 0) {
      const span = spanAround(c, existing);
      for (let k = 0; k <= 24; k++) {
        const th = k * GOLDEN_ANGLE;
        const cand = (v: Vec): Vec => {
          const dx = v.x - c.x;
          const dy = v.y - c.y;
          return { x: c.x + Math.cos(th) * dx - Math.sin(th) * dy, y: c.y + Math.sin(th) * dx + Math.cos(th) * dy };
        };
        if (!degeneratePlacement(c, news.map((t) => cand(fit(t))), existing, span)) {
          spin = cand;
          break;
        }
      }
    }
  }
  for (const t of template) {
    if (objects.some((o) => o.id === t.id)) continue; // reuse existing
    const v = spin(fit(t));
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
      // An `ifAbsent` free point is the parser's ensure-exists (a NEW point named onto a line, whose
      // existence the parse context may not know — ADR-236): if the id already exists as ANY object,
      // skip entirely — never move it, never conflict (mirrors the circle command's `ifAbsent`).
      if (cmd.ifAbsent && objects.some((o) => o.id === cmd.id)) break;
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
      // Right angle ALWAYS at c (the last id). Legs c→a and c→b; a and b are interchangeable
      // hypotenuse endpoints. Whichever hypotenuse endpoint is FRESH can be built as the derived
      // perp-offset (0-DOF, exact right angle at c). Swap a,b so the fresh one is the perp-offset even
      // when the as-typed derived slot (b) already exists.
      const [a, b, c] = cmd.ids;
      const has = (id: Id) => objects.some((o) => o.id === id);
      let [pa, pb] = [a, b];
      if (has(pb) && !has(pa)) [pa, pb] = [pb, pa];
      if (!has(pb)) {
        // pb is fresh → build it perpendicular to c→pa at c; the right angle at c is STRUCTURAL.
        placeBase(objects, [{ id: pa, x: 0, y: 0 }, { id: c, x: 0, y: 4 }], pos);
        addObj(objects, { kind: 'perp-offset', id: pb, anchor: c, from: c, to: pa, dist: 5 });
      } else {
        // Both hypotenuse endpoints pre-exist (the shared-hypotenuse case: two right triangles on AB —
        // Q8, ADR-223). No vertex is free to be the derived perp-offset, so enforce the right angle at c as a
        // genuine CONSTRAINT: seg c→a ⟂ seg c→b (∠(a c b)=90). A shape declared over existing points is
        // a constraint, not a rebuild (the ADR-099/ADR-115 family).
        placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }, { id: c, x: 3, y: 3 }], pos);
        const con: Constraint = { type: 'perpendicular', a: c, b: a, c: c, d: b };
        // Drive the NEW right-angle vertex c onto the Thales circle over the fixed hypotenuse — NOT a
        // pre-existing leg's shape DOF (adding this triangle must not reshape the OTHER one built on AB;
        // generic driveOrCheck would grab B's perp-offset `dist` first — a stability violation). Only
        // when c is itself a fresh, movable free vertex; otherwise fall back to driveOrCheck (c
        // pre-exists ⇒ a pure check that the existing triangle is right-angled at c).
        const cObj = objects.find((o) => o.id === c);
        if (cObj && cObj.kind === 'free-point' && !(cObj as Extract<GeoObject, { kind: 'free-point' }>).pinned) {
          (cObj as Extract<GeoObject, { kind: 'free-point' }>).solve = { constraint: con, branch: 0 };
          constraints.push(con);
        } else {
          driveOrCheck(objects, constraints, con);
        }
      }
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
      // A plain SEGMENT meet (`onSeg`) is a STATEMENT that the two segments actually cross — which is
      // information about where an under-determined endpoint belongs (M1/M4: defaults yield to
      // statements, [ADR-255](../../docs/06-decisions.md#adr-255)). When the current defaults put the
      // crossing on a continuation and an endpoint is GENUINELY LOOSE (a non-pinned free point that no
      // constraint references), re-seat its default so the segments really cross: aim it from its fixed
      // mate through the midpoint of the other segment, keeping it on the SAME SIDE of every circle it
      // was on (so a stated "M מחוץ למעגל" survives) and in general position (ADR-253). Without this the
      // figure builds ✓ with the crossing off both segments, and no sampled config can rescue it — the
      // seed jitter explores only a small neighbourhood of the default (session gaawv4fr). Endpoints
      // that carry constraints (e.g. ADR-166's equilateral apexes) are left to their own mechanism
      // (reflection DOFs); a meet with no loose endpoint keeps today's behaviour (verifier amber).
      if (cmd.onSeg) reseatLooseMeetEndpoint(objects, constraints, pos, [cmd.a, cmd.b], [cmd.c, cmd.d]);
      addObj(objects, { kind: 'line-line-intersection', id: cmd.id, a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d, ...(cmd.onSeg ? { onSeg: true } : {}), ...(cmd.onSeg1 ? { onSeg1: true } : {}), ...(cmd.onSeg2 ? { onSeg2: true } : {}) });
      // A "המשך" operand is DIRECTIONAL — A must be BEYOND the named 2nd point (ADR-054). Emit a
      // `collinear-order` (A is already collinear via the crossing); when the current free DOFs put the
      // crossing on the wrong side, recruitFreeDofs DRIVES them (e.g. pulls a free apex closer) so the
      // extensions reach A. The free DOF is solved by the engine — the student never moves a point.
      if (cmd.dir1) constraints.push({ type: 'collinear-order', points: [cmd.a, cmd.b, cmd.id] });
      if (cmd.dir2) constraints.push({ type: 'collinear-order', points: [cmd.c, cmd.d, cmd.id] });
      // A single BARE operand (the other carries "המשך"/"הישר" — issue #22): the crossing must land
      // WITHIN that segment. The within-order twin of dir1/dir2, expressed as `collinear-order [X,id,Y]`
      // (the ADR-077/ADR-127 mechanism — the crossing is already collinear by construction, so ONLY the
      // order is asserted; addCollinearOrder drives a free parametric carrier, else the recruiter flexes
      // the figure). The joint both-bare case stays the sampled ADR-166 `onSeg` requirement above —
      // whether two whole segments cross at all is a DISCRETE configuration choice (apex reflection),
      // not a continuously drivable one.
      if (cmd.onSeg1) addCollinearOrder(objects, constraints, [cmd.a, cmd.id, cmd.b]);
      if (cmd.onSeg2) addCollinearOrder(objects, constraints, [cmd.c, cmd.id, cmd.d]);
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

    case 'point-circle-side': {
      // "M מחוץ למעגל / בתוך המעגל" ([ADR-254](../../docs/06-decisions.md#adr-254)). The command itself
      // is the side REQUIREMENT record — checkGivens re-derives it from the final coordinates
      // (figure.v.circleSide) and meetsRequirements gates sampling/"show another" on it — so nothing is
      // pushed to `constraints` here (an inequality has nothing to drive; the ADR-244 radius-order shape).
      const circ = objects.find((o): o is Extract<GeoObject, { kind: 'circle' }> => o.kind === 'circle' && o.id === cmd.circle);
      const centre = circ ? pos.get(circ.center) : undefined;
      const rr = circ
        ? circ.radius.via === 'through'
          ? centre && pos.get(circ.radius.point)
            ? dist(centre, pos.get(circ.radius.point)!)
            : 5
          : 'value' in circ.radius
            ? circ.radius.value
            : 5 // a tangent-inner radius is internal state with no length at apply time — the seed only needs a scale
        : 5;
      const seedSpot = (): Vec => {
        // Seed on the stated side, in GENERAL POSITION around the centre: θ=0 (the textbook "external
        // point to the right") usually sits exactly on a drawn diameter's line, so the golden spin
        // walks off it (ADR-253). Structural probes (commandConflict / introducedPointIds) apply this
        // on an EMPTY construction where the circle is absent — any spot stands in there.
        const c = centre ?? { x: 0, y: 0 };
        const rad = (cmd.side === 'outside' ? 1.7 : 0.45) * rr;
        // The centre itself is the spin ANCHOR — it sits on every candidate line, so it must not count
        // as an existing point to clear (placeBase excludes its anchor the same way).
        const others = [...pos.entries()].filter(([id]) => id !== circ?.center).map(([, v]) => v);
        const span = spanAround(c, others);
        for (let k = 0; k <= 24; k++) {
          const th = k * GOLDEN_ANGLE;
          const p = { x: c.x + rad * Math.cos(th), y: c.y + rad * Math.sin(th) };
          if (!degeneratePlacement(c, [p], others, span)) return p;
        }
        return { x: c.x + rad, y: c.y };
      };
      const existing = objects.find((o) => o.id === cmd.id);
      if (!existing) {
        const p = seedSpot();
        objects.push({ kind: 'free-point', id: cmd.id, x: p.x, y: p.y }); // a real free DOF (ADR-052) — not pinned
      } else if (existing.kind === 'free-point' && !existing.pinned && centre) {
        // M1: a side statement about an EXISTING point is a statement about that point, never a
        // re-creation. An under-determined (non-pinned) free point currently on the WRONG side gets its
        // DEFAULT re-seated to the stated side — a better default, not a drive; it stays a free DOF. A
        // pinned/derived/parametric point is left where its definition puts it (the verifier reports).
        const d = dist({ x: existing.x, y: existing.y }, centre);
        const wrong = cmd.side === 'outside' ? d <= rr : d >= rr;
        if (wrong) {
          const p = seedSpot();
          const i = objects.findIndex((o) => o.id === cmd.id);
          objects[i] = { ...existing, x: p.x, y: p.y };
        }
      }
      break;
    }

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
        // (c3) The point is DETERMINED ((c2) didn't take it — a derived/pinned vertex, e.g. a square
        // corner) and the circle's radius is a FREE DOF with no other job: the membership makes the
        // radius THROUGH the point — the circle passes through it by construction (r = |centre·P|),
        // its centre still free. A SECOND such membership then lands in (c) and drives the free centre
        // (|centre·Q| = |centre·P|), so a semicircle declared on an existing square side CD is DRIVEN
        // to the side — centre at the midpoint, r = |CD|/2 (issue #28 / ADR-284; the free-radius twin
        // of (c)). A radius BUSY driving another constraint (ADR-230 tangency) is left alone → (d).
        if (circ && circ.radius.via === 'free' && cmd.id !== circ.center && (circ as { solve?: unknown }).solve === undefined) {
          const ci = objects.findIndex((o) => o.id === cmd.circle);
          objects[ci] = { ...circ, radius: { via: 'through', point: cmd.id } };
          break;
        }
        // (c4) A STATED numeric radius must hold instead: the membership is |centre·P| = value — push
        // the distance so the machinery drives the free centre (honest over-constraint when it can't).
        if (circ && circ.radius.via === 'length' && cmd.id !== circ.center) {
          driveOrCheck(objects, constraints, { type: 'distance', a: circ.center, b: cmd.id, value: circ.radius.value });
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

    case 'set-distance': {
      // |centre·P| where P lies on a circle centred at `centre` IS that circle's radius — drive the radius DOF,
      // not the free centre (which can't change the distance). Otherwise a plain positional distance. (ADR-230.)
      const rIdx = radiusCircleForDistance(objects, constraints, cmd.a, cmd.b);
      if (rIdx >= 0) {
        applyRadiusGiven(objects, constraints, rIdx, cmd.value);
        // The student stated a SEGMENT length ("O1M=9") — keep the distance itself on the record as a
        // tautological check (the pinned radius makes it hold by construction), so the on-canvas measure
        // label and the givens verifier still see the stated magnitude (the honesty invariant: everything
        // the student stated stays visible — ADR-231 review F6). No carrier: nothing to drive.
        constraints.push({ type: 'distance', a: cmd.a, b: cmd.b, value: cmd.value });
      } else driveOrCheck(objects, constraints, { type: 'distance', a: cmd.a, b: cmd.b, value: cmd.value });
      break;
    }

    case 'set-radius': {
      // Set a circle's radius BY VALUE, without inventing a point or drawing a radius segment (ADR-087).
      // Resolve per how the circle's radius is defined: a `through` circle (its radius is |centre·point|,
      // e.g. an incircle through its tangent foot) becomes a distance constraint that FLEXES the figure; a
      // `free`-radius DOF and a `length` radius are simply set to the stated value (a stated size is a given,
      // ADR-052). `tangent-inner` (radius derived from another circle) has no own size to pin → leave to the
      // verifier to flag if it cannot hold.
      const idx = objects.findIndex((o) => o.kind === 'circle' && o.id === cmd.circle);
      if (idx >= 0) applyRadiusGiven(objects, constraints, idx, cmd.value);
      break;
    }

    case 'set-radius-order': {
      // Bind a CONCENTRIC pair's roles (ADR-244): mark the inner circle so the parser context can resolve
      // qualifier references ("המעגל הפנימי"). A REQUIREMENT, not a driven constraint — the radii stay free
      // DOFs; the givens verifier checks inner < outer against the final radii, and `meetsRequirements`
      // (which gates the sampler and "show another configuration") skips any order-violating config.
      const idx = objects.findIndex((o) => o.kind === 'circle' && o.id === cmd.inner);
      if (idx >= 0) objects[idx] = { ...objects[idx], innerOf: cmd.outer } as GeoObject;
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

    case 'set-perimeter':
      driveOrCheck(objects, constraints, { type: 'perimeter', ids: cmd.ids, value: cmd.value });
      break;

    case 'set-perimeter-ratio':
      driveOrCheck(objects, constraints, { type: 'perimeter-ratio', ids1: cmd.ids1, ids2: cmd.ids2, k: cmd.k });
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
        if (pts.length >= 3) addCollinearOrder(objects, constraints, pts);
      }
      break;
    }
  }

  return { objects, constraints };
}

/**
 * Push a `collinear-order` over `pts` ("the points lie on one line, in this sequence"), driving it with
 * the free PARAMETRIC carriers (on-circle/on-segment) among them, so the optimizer sequences the figure
 * (slides an anchor until the order holds). Carriers are marked directly rather than leaning on
 * recruitFreeDofs, which would reach a fixed intersection point's parent CIRCLE CENTRES and distort the
 * circles; when none are movable it's a pure check. Shared by `set-line` and by the existing-point
 * reinterpretation of "P on segment a–b" (M1, [ADR-231](../../docs/06-decisions.md#adr-231)).
 */
export function addCollinearOrder(objects: GeoObject[], constraints: Constraint[], pts: Id[]): void {
  const order: Constraint = { type: 'collinear-order', points: [...pts] };
  for (const p of pts) {
    const i = objects.findIndex((o) => o.id === p);
    const o = i >= 0 ? objects[i] : undefined;
    if (o && (o.kind === 'on-circle' || o.kind === 'on-segment') && (o as { solve?: unknown }).solve === undefined) {
      objects[i] = { ...o, solve: { constraint: order, branch: 0 } };
    }
  }
  constraints.push(order);
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
