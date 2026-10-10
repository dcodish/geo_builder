/**
 * #1971 + #1937 ([ADR-612](docs/06-decisions.md#adr-612), ADR-W-124) — THE LINES A POINT IS DEFINED TO LIE ON.
 *
 * Operator, 2026-10-10: *any construction point that lands off the drawn ink gets the carrying line extended,
 * dashed, to meet it.* The renderer decides WHEN (the shared geometry in `shell/offInk`); this answers the
 * engine's half — WHICH lines a point carries — from the dependency graph alone, never from where the point
 * happens to sit. A point on a line by accident has no carrier; a foot dropped to DC has DC whatever the
 * configuration.
 *
 * A carrier is named by TWO POINTS, because that is what can be extended: a foot on the line DC, a crossing of AC
 * and BD, a point on the line through A and B. A line with no two named points (a bisector, a perpendicular, a
 * tangent) has no span to extend from, and is drawn infinite when it is drawn at all.
 *
 * EXHAUSTIVE over {@link GeoPointKind}, like `carrierOf`: a new point kind must say what it lies on, or the build
 * fails — the #1038 class (a kind added to the union and silently missing from a list).
 */
import type { Construction, GeoPoint, Id, Line } from './types';
import { isGeoPoint } from './types';

export interface CarryingLine {
  /** The point. */
  id: Id;
  /** The two named points whose line it is defined to lie on. */
  a: Id;
  b: Id;
}

/** The two named points of a `through` line, or null for a line named otherwise. */
function throughPair(c: Construction, lineId: Id): [Id, Id] | null {
  const l = c.objects.find((o): o is Line => o.kind === 'line' && o.id === lineId);
  return l && l.spec.via === 'through' ? [l.spec.a, l.spec.b] : null;
}

function linesOf(c: Construction, o: GeoPoint): Array<[Id, Id]> {
  switch (o.kind) {
    case 'on-segment':
    case 'on-segment-solved':
    case 'foot':
    case 'midpoint':
      return [[o.a, o.b]];
    case 'line-line-intersection':
      return [
        [o.a, o.b],
        [o.c, o.d],
      ];
    case 'line-intersection':
      return [throughPair(c, o.line1), throughPair(c, o.line2)].filter((p): p is [Id, Id] => p !== null);
    case 'on-line':
    case 'line-circle': {
      const p = throughPair(c, o.line);
      return p ? [p] : [];
    }
    // Shape vertices, circle points and centres: defined by a shape scalar, a circle or a free position — no line
    // through two named points carries them.
    case 'free-point':
    case 'derived':
    case 'intersection':
    case 'parallelogram-vertex':
    case 'perp-offset':
    case 'rotated':
    case 'scaled-offset':
    case 'circumcenter':
    case 'on-circle':
    case 'antipode':
    case 'arc-midpoint':
    case 'circle-circle':
    case 'radial-toward':
      return [];
    default: {
      const unhandled: never = o;
      throw new Error(`point kind with no carrying-line answer: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Every (point, line-through-two-named-points) incidence the construction DEFINES. */
export function carryingLines(c: Construction): CarryingLine[] {
  const out: CarryingLine[] = [];
  for (const o of c.objects) {
    if (!isGeoPoint(o)) continue;
    for (const [a, b] of linesOf(c, o)) if (a !== o.id && b !== o.id && a !== b) out.push({ id: o.id, a, b });
  }
  return out;
}
