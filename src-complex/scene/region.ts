/**
 * INSIDE, ON, OUTSIDE — the counting picture (docs/27 §2b ד, family F12).
 *
 * The capstone question ends: *«determine how many of the equation's solutions are inside the
 * quadrilateral OZ₂Z₃Z₄, how many are on it, and how many are outside»* — and the designed answer is
 * **one on, one inside, three outside**. That is the operator's pedagogy ruling at its sharpest: the
 * student states the givens, the figure is drawn, and the locations ARE the calculation.
 *
 * So a stated polygon shades its interior and every plotted number is placed against it. The COUNT is
 * the picture; the exam's claim about the count (F12) is a separate thing this layer does not make —
 * it draws where things are, and a claim about them is checked at stage 4, never here.
 *
 * On-the-boundary is decided with a tolerance relative to the figure's own size, because a vertex of
 * the polygon is a plotted number and must come out `on` rather than as a coin toss between in and out.
 */

import type { Cx } from '../value/value';
import type { DerivedObject, DerivedPoint } from '../replay/derive2';

export type Where = 'in' | 'on' | 'out';

export interface SceneRegion {
  readonly key: string;
  readonly label: string;
  readonly vertices: readonly Cx[];
  readonly members: readonly { readonly name: string; readonly where: Where }[];
  readonly counts: { readonly in: number; readonly on: number; readonly out: number };
  readonly known: boolean;
}

/** Distance from `p` to the segment `a–b`, which is what decides "on the boundary". */
function distanceToSegment(p: Cx, a: Cx, b: Cx): number {
  const vx = b.re - a.re;
  const vy = b.im - a.im;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return Math.hypot(p.re - a.re, p.im - a.im);
  let t = ((p.re - a.re) * vx + (p.im - a.im) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.re - (a.re + t * vx), p.im - (a.im + t * vy));
}

/** Ray casting: odd crossings ⇒ inside. The boundary is decided before this is asked. */
function windsInside(p: Cx, vs: readonly Cx[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const yi = vs[i].im;
    const yj = vs[j].im;
    if (yi > p.im !== yj > p.im) {
      const x = ((vs[j].re - vs[i].re) * (p.im - yi)) / (yj - yi) + vs[i].re;
      if (x > p.re) inside = !inside;
    }
  }
  return inside;
}

export function regionsOf(
  objects: readonly DerivedObject[],
  points: readonly DerivedPoint[],
): SceneRegion[] {
  const scale = Math.max(1e-9, ...points.map((p) => Math.hypot(p.z.re, p.z.im)));
  const tol = 1e-7 * Math.max(1, scale);
  return objects
    .filter((o) => o.kind === 'polygon' && o.vertices.length >= 3)
    .map((o) => {
      const members = points.map((p) => {
        const onEdge = o.vertices.some((v, i) =>
          distanceToSegment(p.z, v, o.vertices[(i + 1) % o.vertices.length]) <= tol,
        );
        const where: Where = onEdge ? 'on' : windsInside(p.z, o.vertices) ? 'in' : 'out';
        return { name: p.name, where };
      });
      return {
        key: `region-${o.key}`,
        label: o.label,
        vertices: o.vertices,
        members,
        counts: {
          in: members.filter((m) => m.where === 'in').length,
          on: members.filter((m) => m.where === 'on').length,
          out: members.filter((m) => m.where === 'out').length,
        },
        known: o.known,
      };
    });
}
