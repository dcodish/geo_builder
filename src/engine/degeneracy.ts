/**
 * #945 ([ADR-513](../../docs/06-decisions.md#adr-513)) — the 2-D half of the cross-product degeneracy rule
 * ([ADR-W-048](../../docs/06w-decisions-workspace.md#adr-w-048)): a figure whose givens force a NAMED
 * polygon flat is said out loud, never drawn in silence with every fact green.
 *
 * The predicate is COLLINEARITY of a declared polygon's vertices, judged against the polygon's OWN extent:
 * the greatest distance of any vertex from the line through its two most-separated vertices, divided by
 * that separation. Scale-free by construction — a figure drawn ten times bigger is not ten times less
 * degenerate — and per object, so a small polygon in a large figure is judged by its own size.
 *
 * The band this sits in, measured on the 2-D corpus (2026-09-13, the calibration is the ADR's deliverable):
 * a driven solve that flattens a polygon is REFUSED at the accept gate below 1e-4 (`collapsedPolygon`,
 * ADR-413); a construction the givens force flat — «משולש ABC» with sides 5, 3 and 8 — lands between
 * 1e-4 and ~1e-3 and used to draw silently; the thinnest legitimately-constructible corpus triangle sits
 * an order of magnitude above. The notice covers the middle band; the gate keeps the floor.
 */
import type { Construction, Id, Vec } from './types';

/** A declared polygon's vertices are collinear to within this fraction of the polygon's own extent. */
export const DEGENERATE_EXTENT_RATIO = 5e-4;

export interface DegeneratePolygon {
  /** The polygon object id (`poly-ABC`). */
  id: Id;
  vertices: Id[];
  /** max vertex offset from the widest chord, over that chord's length (0 = perfectly flat). */
  ratio: number;
}

/** Every declared polygon whose resolved vertices have collapsed onto a line, with its flatness ratio. */
export function degeneratePolygons(c: Construction, positions: Map<Id, Vec>, tol = DEGENERATE_EXTENT_RATIO): DegeneratePolygon[] {
  const out: DegeneratePolygon[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const pts = o.vertices.map((id) => positions.get(id));
    if (pts.length < 3 || pts.some((p) => !p)) continue;
    let ai = 0, bi = 1, span = -1;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
        if (d > span) { span = d; ai = i; bi = j; }
      }
    if (!(span > 0)) continue; // every vertex on one spot — the coincidence channel's fact (ADR-123), not a flat polygon
    const A = pts[ai]!, B = pts[bi]!;
    const ux = (B.x - A.x) / span, uy = (B.y - A.y) / span;
    const off = pts.reduce((m, p) => Math.max(m, Math.abs((p!.x - A.x) * uy - (p!.y - A.y) * ux)), 0);
    const ratio = off / span;
    if (ratio < tol) out.push({ id: o.id, vertices: [...o.vertices], ratio });
  }
  return out;
}
