/**
 * #1937 + #1971 (ADR-AG-255, ADR-W-124) — THE LINES A POINT IS DEFINED TO LIE ON.
 *
 * Operator, 2026-10-10: *any construction point that lands off the drawn ink gets the carrying line extended,
 * dashed, to meet it* — generalising his 2026-10-09 ruling on a concave quadrilateral's diagonals (*"Lines, and
 * show why"*). `shell/offInk` decides WHEN a stretch is owed; this answers WHICH lines, from the construction alone
 * — the stated incidences and the derived rules — never from where a point happens to sit, so a point that is on a
 * line by accident earns nothing.
 *
 * A carrier is named by TWO POINTS, because that is what can be extended: a height's foot on its side
 * (`on-line-2pt`, the incidence half of the cevian), a crossing on each of its lines, the diagonal meet on each
 * diagonal. 2-D's `src/engine/carryingLines.ts` is the same question over its own graph (copied, never shared —
 * the engine layer, `BOUNDARIES.json`).
 *
 * EXHAUSTIVE over {@link DerivedRule}: a new rule must say what it lies on, or the build fails (the #1038 class).
 */
import type { DerivedRule } from './derived';
import type { Construction, Id } from './types';

export interface CarryingLine {
  /** The point. */
  id: Id;
  /** The two named points whose line it is defined to lie on. */
  a: Id;
  b: Id;
}

function ruleLines(r: DerivedRule): Array<[Id, Id]> {
  switch (r.t) {
    case 'midpoint':
      return [[r.a, r.b]];
    case 'diagonals':
      return [
        [r.v[0], r.v[2]],
        [r.v[1], r.v[3]],
      ];
    case 'side-touch':
      return [[r.a, r.b]];
    case 'foot':
      return r.onto.k === 'points' ? [[r.onto.a, r.onto.b]] : [];
    // Centres of a triangle or a circle, a conic's focus, a touch of two circles, a regular polygon's vertex: no
    // line through two named points carries them.
    case 'centroid':
    case 'incentre':
    case 'orthocentre':
    case 'circumcentre':
    case 'incircle-centre':
    case 'circle-centre':
    case 'parabola-focus':
    case 'touch-point':
    case 'regular-vertex':
      return [];
    default: {
      const unhandled: never = r;
      throw new Error(`derived rule with no carrying-line answer: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Every (point, line-through-two-named-points) incidence the construction DEFINES. */
export function carryingLines(c: Construction): CarryingLine[] {
  const out: CarryingLine[] = [];
  const add = (id: Id, a: Id, b: Id) => {
    if (a !== id && b !== id && a !== b) out.push({ id, a, b });
  };
  for (const o of c.objects) if (o.kind === 'derived') for (const [a, b] of ruleLines(o.rule)) add(o.id, a, b);
  for (const k of c.constraints) if (k.t === 'on-line-2pt') add(k.id, k.a, k.b);
  return out;
}
