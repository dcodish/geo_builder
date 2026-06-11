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

function addObj(objects: GeoObject[], o: GeoObject): void {
  if (!objects.some((x) => x.id === o.id)) objects.push(o);
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
function placeBase(objects: GeoObject[], template: BaseVertex[], pos: Map<Id, Vec>): void {
  const fit = fitTemplate(template, pos);
  for (const t of template) {
    if (objects.some((o) => o.id === t.id)) continue; // reuse existing
    const v = fit(t);
    objects.push({ kind: 'free-point', id: t.id, x: v.x, y: v.y });
  }
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
      // points of the same id are caught upstream by commandConflict.
      const fp: GeoObject = { kind: 'free-point', id: cmd.id, x: cmd.x, y: cmd.y };
      const i = objects.findIndex((o) => o.id === cmd.id);
      if (i === -1) objects.push(fp);
      else if (objects[i].kind === 'free-point') objects[i] = fp;
      break;
    }

    case 'square': {
      // Two free points (A,B) carry the square's 4 DOF (position, rotation,
      // size); C and D are derived to make it a square for any A,B.
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
      // A,B free base; C,D offset perpendicular to AB by a default height.
      const [a, b, c, d] = cmd.ids;
      const h = 4;
      placeBase(objects, [{ id: a, x: 0, y: 0 }, { id: b, x: 6, y: 0 }], pos);
      addObj(objects, { kind: 'perp-offset', id: c, anchor: b, from: a, to: b, dist: h });
      addObj(objects, { kind: 'perp-offset', id: d, anchor: a, from: a, to: b, dist: h });
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
      addObj(objects, { kind: 'line', id: cmd.id, spec: { via: 'bisector', vertex: cmd.vertex, p: cmd.p, q: cmd.q } });
      break;

    case 'perpendicular-line':
      addObj(objects, { kind: 'line', id: cmd.id, spec: { via: 'perpendicular', through: cmd.through, a: cmd.a, b: cmd.b } });
      break;

    case 'parallel-line':
      addObj(objects, { kind: 'line', id: cmd.id, spec: { via: 'parallel', through: cmd.through, a: cmd.a, b: cmd.b } });
      break;

    case 'line-through':
      addObj(objects, { kind: 'line', id: cmd.id, spec: { via: 'through', a: cmd.a, b: cmd.b } });
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

    case 'set-angle': {
      // If any point the angle references still has a free DOF (an on-segment
      // parameter t), the constraint *drives* it: that point is upgraded to a
      // solved point and the angle places it (ADR-012/ADR-014). The driven
      // point is chosen deterministically — vertex first, then ray1, then ray2.
      // When every referenced point is already determined, the angle is a
      // check (over-constraint detection). A point that is already solved by
      // an earlier constraint has no DOF left, so it counts as determined.
      const con: Constraint = { type: 'angle', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, value: cmd.value };
      const driven = [cmd.vertex, cmd.ray1, cmd.ray2]
        .map((id) => objects.findIndex((o) => o.id === id))
        .find((i) => i >= 0 && objects[i].kind === 'on-segment');
      if (driven !== undefined) {
        const seg = objects[driven] as Extract<GeoObject, { kind: 'on-segment' }>;
        objects[driven] = { kind: 'on-segment-solved', id: seg.id, a: seg.a, b: seg.b, constraint: con, branch: 0 };
      } else {
        constraints.push(con);
      }
      break;
    }
  }

  return { objects, constraints };
}
