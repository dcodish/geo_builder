/**
 * applyCommand: pure reducer turning one Command into a new Construction.
 * Object IDs are deterministic, so re-issuing a command is idempotent
 * (FR-EN-9). The evaluator computes the figure's positions; the one thing
 * chosen here is the *initial* coordinates of a shape's new free vertices —
 * a parameter of the graph, not a derived position — which is why `pos` (the
 * already-known positions of prior objects) is threaded in: a shape built on
 * existing points is fitted to them, instead of keeping absolute defaults.
 */

import type { Command, Constraint, Construction, GeoObject, Id, Vec } from './types';
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
  const idxs = constraintRefs(con).map((id) => objects.findIndex((o) => o.id === id));
  // A point already pinned by another constraint (e.g. F fixed by a coincidence
  // from a second definition) must not be re-driven — that would fight its pin and
  // over-constrain ("DF = DE" should move the free E, not the pinned F).
  const pinned = new Set(constraints.flatMap(constraintRefs));
  // (1) Prefer an on-segment ref as the carrier — the constraint *places* it (its t
  // is solved in closed form). Pick a NON-pinned carrier first.
  const onSegs = idxs.filter((i) => i >= 0 && objects[i].kind === 'on-segment');
  const onSeg = onSegs.find((i) => !pinned.has(objects[i].id)) ?? onSegs[0];
  if (onSeg !== undefined) {
    const seg = objects[onSeg] as Extract<GeoObject, { kind: 'on-segment' }>;
    objects[onSeg] = { kind: 'on-segment-solved', id: seg.id, a: seg.a, b: seg.b, constraint: con, branch: 0, t0: seg.t };
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

/** The golden angle — spreads N points around a circle so none coincide and they look even. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A default angle for the next point on `circle`, spread from any already on it (top-first). */
function nextTheta(objects: GeoObject[], circle: Id): number {
  let n = 0;
  for (const o of objects) if (o.kind === 'on-circle' && o.circle === circle) n++;
  return Math.PI / 2 + n * GOLDEN_ANGLE;
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

export function applyCommand(prev: Construction, cmd: Command, pos: Map<Id, Vec> = new Map()): Construction {
  const objects = [...prev.objects];
  const constraints = [...prev.constraints];

  switch (cmd.type) {
    case 'free-point': {
      // A free point may be (re)placed: if it already exists as a free point,
      // update its coordinates — a *move* (ADR-011). Conflicts with non-free
      // points of the same id are caught upstream by commandConflict. An explicit
      // placement is *pinned* — the sampler never moves it (ADR-018).
      const fp: GeoObject = { kind: 'free-point', id: cmd.id, x: cmd.x, y: cmd.y, pinned: true };
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
      addObj(objects, { kind: 'on-segment', id: cmd.id, a: cmd.a, b: cmd.b, t: cmd.t ?? 0.5 });
      break;

    case 'line-line-intersection':
      addObj(objects, { kind: 'line-line-intersection', id: cmd.id, a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
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
      break;

    case 'foot':
      addObj(objects, { kind: 'foot', id: cmd.id, from: cmd.from, a: cmd.a, b: cmd.b });
      break;

    case 'midpoint':
      addObj(objects, { kind: 'midpoint', id: cmd.id, a: cmd.a, b: cmd.b });
      break;

    case 'circle':
      placeBase(objects, [{ id: cmd.center, x: 0, y: 0 }], pos); // create the centre if new
      upsertCircle(objects, { kind: 'circle', id: cmd.id, center: cmd.center, radius: { via: 'length', value: cmd.radius } });
      break;

    case 'circle-through':
      placeBase(objects, [{ id: cmd.center, x: 0, y: 0 }], pos);
      upsertCircle(objects, { kind: 'circle', id: cmd.id, center: cmd.center, radius: { via: 'through', point: cmd.through } });
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
      addObj(objects, { kind: 'circle', id: cmd.id, center: cmd.center, radius: { via: 'through', point: cmd.a } });
      break;

    case 'point-on-circle':
      // No explicit angle ⇒ a free vertex the sampler may slide (inscribed triangle,
      // chord end); an explicit angle (an inscribed square's corner) is fixed.
      addObj(objects, { kind: 'on-circle', id: cmd.id, circle: cmd.circle, theta: cmd.theta ?? nextTheta(objects, cmd.circle), free: cmd.theta === undefined });
      break;

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
      addObj(objects, { kind: 'line-circle', id: cmd.id, line: cmd.line, circle: cmd.circle, branch: cmd.branch ?? 0 });
      break;

    case 'circle-circle-intersection':
      addObj(objects, { kind: 'circle-circle', id: cmd.id, circle1: cmd.circle1, circle2: cmd.circle2, branch: cmd.branch ?? 0 });
      break;

    case 'tangent':
      // The point of tangency lies on the circle — create it there if it doesn't
      // exist yet, so "tangent to circle O at A" works even before A is placed.
      if (!objects.some((o) => o.id === cmd.at)) {
        addObj(objects, { kind: 'on-circle', id: cmd.at, circle: cmd.circle, theta: nextTheta(objects, cmd.circle), free: true });
      }
      addLine(objects, { kind: 'line', id: cmd.id, spec: { via: 'tangent', circle: cmd.circle, at: cmd.at }, visible: cmd.visible });
      break;

    case 'point-on-line':
      addObj(objects, { kind: 'on-line', id: cmd.id, line: cmd.line, offset: cmd.offset });
      break;

    case 'circles-tangent': {
      // Two circles tangent at one point: pull the centres to the touching distance
      // (external = r1+r2, internal = |r1−r2|) and place `at` at the touch point on
      // the centre line (a fraction r1/d from centre1). Needs concrete radii.
      const c1 = objects.find((o) => o.id === cmd.circle1 && o.kind === 'circle') as Extract<GeoObject, { kind: 'circle' }> | undefined;
      const c2 = objects.find((o) => o.id === cmd.circle2 && o.kind === 'circle') as Extract<GeoObject, { kind: 'circle' }> | undefined;
      if (c1 && c2 && c1.radius.via === 'length' && c2.radius.via === 'length') {
        const r1 = c1.radius.value;
        const r2 = c2.radius.value;
        const denom = cmd.external ? r1 + r2 : r1 - r2; // signed; internal needs r1≠r2
        if (denom !== 0) {
          addObj(objects, { kind: 'on-segment', id: cmd.at, a: c1.center, b: c2.center, t: r1 / denom });
          driveOrCheck(objects, constraints, { type: 'distance', a: c1.center, b: c2.center, value: Math.abs(denom) });
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

    case 'set-equal':
      driveOrCheck(objects, constraints, { type: 'equal', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      break;

    case 'set-ratio':
      driveOrCheck(objects, constraints, { type: 'ratio', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d, k: cmd.k, ...(cmd.add ? { add: cmd.add } : {}) });
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
  }

  return { objects, constraints };
}
