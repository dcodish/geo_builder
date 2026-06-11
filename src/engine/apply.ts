/**
 * applyCommand: pure reducer turning one Command into a new Construction.
 * Object IDs are deterministic, so re-issuing a command is idempotent
 * (FR-EN-9). No positions are computed here — that is the evaluator's job.
 */

import type { Command, Constraint, Construction, GeoObject, Id } from './types';

function addObj(objects: GeoObject[], o: GeoObject): void {
  if (!objects.some((x) => x.id === o.id)) objects.push(o);
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

export function applyCommand(prev: Construction, cmd: Command): Construction {
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
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: side, y: 0 });
      addObj(objects, { kind: 'derived', id: c, rule: 'square-c', a, b });
      addObj(objects, { kind: 'derived', id: d, rule: 'square-d', a, b });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'quadrilateral': {
      // A general (irregular, convex) quadrilateral: 4 free vertices.
      const [a, b, c, d] = cmd.ids;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: 6, y: 1 });
      addObj(objects, { kind: 'free-point', id: c, x: 5, y: 5 });
      addObj(objects, { kind: 'free-point', id: d, x: 1, y: 4 });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'parallelogram': {
      // A,B,C carry the parallelogram's freedom; D is derived (D = A + C − B),
      // so ABCD stays a parallelogram for any A,B,C.
      const [a, b, c, d] = cmd.ids;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 4 });
      addObj(objects, { kind: 'free-point', id: b, x: 6, y: 4 });
      addObj(objects, { kind: 'free-point', id: c, x: 7, y: 0 });
      addObj(objects, { kind: 'parallelogram-vertex', id: d, a, b, c });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'rectangle': {
      // A,B free base; C,D offset perpendicular to AB by a default height.
      const [a, b, c, d] = cmd.ids;
      const h = 4;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: 6, y: 0 });
      addObj(objects, { kind: 'perp-offset', id: c, anchor: b, from: a, to: b, dist: h });
      addObj(objects, { kind: 'perp-offset', id: d, anchor: a, from: a, to: b, dist: h });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'rhombus': {
      // A,B free (side AB); D rotated off A by a default angle; C closes the rhombus.
      const [a, b, c, d] = cmd.ids;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: 5, y: 0 });
      addObj(objects, { kind: 'rotated', id: d, pivot: a, from: a, to: b, angleDeg: 60, scale: 1 });
      addObj(objects, { kind: 'parallelogram-vertex', id: c, a: b, b: a, c: d }); // C = B + D − A
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'trapezoid': {
      // A,B,D free; C offset from D parallel to AB (so AB ∥ DC), shorter by default.
      const [a, b, c, d] = cmd.ids;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 4 });
      addObj(objects, { kind: 'free-point', id: b, x: 6, y: 4 });
      addObj(objects, { kind: 'free-point', id: d, x: 1, y: 0 });
      addObj(objects, { kind: 'scaled-offset', id: c, anchor: d, from: a, to: b, k: 0.6 });
      quadEdges(objects, a, b, c, d);
      break;
    }

    case 'triangle': {
      const [a, b, c] = cmd.ids;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: 6, y: 0 });
      addObj(objects, { kind: 'free-point', id: c, x: 2, y: 4 });
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
      addObj(objects, segment(cmd.a, cmd.b));
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
