/**
 * applyCommand: pure reducer turning one Command into a new Construction.
 * Object IDs are deterministic, so re-issuing a command is idempotent
 * (FR-EN-9). No positions are computed here — that is the evaluator's job.
 */

import type { Command, Construction, GeoObject, Id } from './types';

function addObj(objects: GeoObject[], o: GeoObject): void {
  if (!objects.some((x) => x.id === o.id)) objects.push(o);
}

export function applyCommand(prev: Construction, cmd: Command): Construction {
  const objects = [...prev.objects];
  const constraints = [...prev.constraints];

  switch (cmd.type) {
    case 'free-point':
      addObj(objects, { kind: 'free-point', id: cmd.id, x: cmd.x, y: cmd.y });
      break;

    case 'square': {
      // Two free points (A,B) carry the square's 4 DOF (position, rotation,
      // size); C and D are derived to make it a square for any A,B.
      const [a, b, c, d] = cmd.ids;
      const side = cmd.side ?? 5;
      addObj(objects, { kind: 'free-point', id: a, x: 0, y: 0 });
      addObj(objects, { kind: 'free-point', id: b, x: side, y: 0 });
      addObj(objects, { kind: 'derived', id: c, rule: 'square-c', a, b });
      addObj(objects, { kind: 'derived', id: d, rule: 'square-d', a, b });
      const seg = (x: Id, y: Id): void => addObj(objects, { kind: 'segment', id: `seg-${x}${y}`, a: x, b: y });
      seg(a, b);
      seg(b, c);
      seg(c, d);
      seg(d, a);
      addObj(objects, { kind: 'polygon', id: `poly-${a}${b}${c}${d}`, vertices: [a, b, c, d] });
      break;
    }

    case 'point-on-segment':
      addObj(objects, { kind: 'on-segment', id: cmd.id, a: cmd.a, b: cmd.b, t: cmd.t ?? 0.5 });
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

    case 'set-angle':
      constraints.push({ type: 'angle', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, value: cmd.value });
      break;
  }

  return { objects, constraints };
}
