/**
 * THE DRAWN EXTENT of a straight piece — the one predicate that decides which roots EXIST on it
 * (#1286, [ADR-AG-135](../../docs/06c-decisions-analytic.md#adr-ag-135)).
 *
 * Operator ruling, 2026-09-20: *"the carrier's drawn extent decides which roots exist. A root outside the
 * segment is not a lesser configuration — it is not a configuration. A segment that genuinely meets the
 * circle twice offers both."* And, on the noun, *"the figure is the authority"*: `CA` drawn as a triangle
 * side is a segment whatever word the sentence used for it.
 *
 * Three readers share this module so they cannot disagree: the click-path rings (`crossings.ts`, which
 * already filtered roots this way), the solver's bounded incidence residual (`solve.ts`, which now pushes
 * a crossing back inside its piece), and the figure-is-the-authority promotion (`evaluate.ts`, which
 * marks an incidence bounded when the pair names a drawn piece).
 */
import type { Construction, Id } from './types';

/** How far past an end a point may sit and still count as ON the piece — the parameter tolerance the
 *  ring filter has always used. */
export const SEGMENT_EXTENT_TOL = 1e-6;

interface Pt {
  x: number;
  y: number;
}

/** Where `p` projects along `a→b`: 0 at `a`, 1 at `b`. Null when `a` and `b` coincide (no piece). */
export function segmentParam(a: Pt, b: Pt, p: Pt): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 1e-24)) return null;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

/** Does `p` lie within the piece `a→b` (on the line is the caller's question; this is the extent)? */
export function withinSegment(a: Pt, b: Pt, p: Pt): boolean {
  const t = segmentParam(a, b, p);
  return t !== null && t >= -SEGMENT_EXTENT_TOL && t <= 1 + SEGMENT_EXTENT_TOL;
}

/** Are `a` and `b` consecutive vertices of a declared polygon — i.e. does the figure draw the SIDE `ab`? */
export function isPolygonSide(c: Construction, a: Id, b: Id): boolean {
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const ids = o.vertices;
    for (let i = 0; i < ids.length; i += 1) {
      const p1 = ids[i];
      const p2 = ids[(i + 1) % ids.length];
      if ((p1 === a && p2 === b) || (p1 === b && p2 === a)) return true;
    }
  }
  return false;
}

/** Does the figure DRAW a bounded piece over `a` and `b` — a segment object, or a polygon side? */
export function drawnPieceOver(c: Construction, a: Id, b: Id): boolean {
  return (
    c.objects.some((o) => o.kind === 'segment' && ((o.a === a && o.b === b) || (o.a === b && o.b === a))) ||
    isPolygonSide(c, a, b)
  );
}
