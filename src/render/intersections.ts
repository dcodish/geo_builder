/**
 * Segment-crossing detection for the "snap to intersection" affordance.
 *
 * Finds where two *declared* segments cross at a point interior to both, so the
 * renderer can offer a hollow dot the student clicks to create a real, named
 * intersection point (a `line-line-intersection` construct). Detection is a
 * pure suggestion — nothing is created until the student acts — so the engine
 * stays constructive: no unnamed points appear on their own (see the ADR).
 *
 * Crossings at a shared endpoint (adjacent segments meeting at a vertex) and
 * crossings that coincide with an existing named point are excluded — the
 * former isn't an intersection to mark, the latter is already on the canvas.
 */

import type { Construction, Id, Vec } from '@/engine/types';
import { isGeoPoint } from '@/engine/types';
import { add, dist, scale, sub } from '@/engine/geometry';

export interface Crossing {
  /** World position of the crossing. */
  pos: Vec;
  /** First segment's endpoints (absent when the first operand is a drawn LINE — `line1`). */
  a?: Id;
  b?: Id;
  /** Second segment's endpoints. */
  c?: Id;
  d?: Id;
  /** A drawn LINE object (a tangent / bisector / perpendicular) as the first operand (#197 Am. 7 —
   *  the touch tangent visibly crosses the two-touch tangent segments; those crossings must offer the
   *  naming dot like any segment crossing). */
  line1?: Id;
}

/** Crossing of segments a→b and c→d strictly interior to both, else null. */
function properCross(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null; // parallel or coincident
  const ac = sub(c, a);
  const t = (ac.x * s.y - ac.y * s.x) / denom;
  const u = (ac.x * r.y - ac.y * r.x) / denom;
  const E = 1e-9; // strictly interior: endpoints (t or u at 0/1) don't count
  if (t <= E || t >= 1 - E || u <= E || u >= 1 - E) return null;
  return add(a, scale(r, t));
}

/** All interior crossings of the construction's segments, deduped, excluding existing points.
 *  `lines` (optional): the scene's resolved DRAWN lines — their crossings with segment interiors are
 *  offered too (#197 Am. 7: the touch tangent visibly crossing the two-touch tangent segments). */
export function findSegmentCrossings(c: Construction, positions: Map<Id, Vec>, lines: { id: Id; anchor: Vec; dir: Vec }[] = []): Crossing[] {
  const segs = c.objects
    .filter((o): o is Extract<typeof o, { kind: 'segment' }> => o.kind === 'segment')
    .map((s) => ({ a: s.a, b: s.b, pa: positions.get(s.a), pb: positions.get(s.b) }))
    .filter((s): s is { a: Id; b: Id; pa: Vec; pb: Vec } => !!s.pa && !!s.pb);

  const named = c.objects.filter(isGeoPoint).map((o) => positions.get(o.id)).filter((p): p is Vec => !!p);

  // Span-relative dedupe epsilon (F7/REN-8): an absolute 1e-6 is scale-dependent — a figure whose free
  // radius grew to hundreds of units could show a duplicate dot at a named point (1e-6 world units is
  // sub-pixel there), while a micro-figure could swallow genuinely distinct crossings.
  const span = (() => {
    if (!named.length) return 1;
    let nx = Infinity, ny = Infinity, xx = -Infinity, xy = -Infinity;
    for (const p of named) {
      nx = Math.min(nx, p.x); ny = Math.min(ny, p.y);
      xx = Math.max(xx, p.x); xy = Math.max(xy, p.y);
    }
    return Math.hypot(xx - nx, xy - ny) || 1;
  })();
  const eps = Math.max(1e-9, 1e-7 * span);

  const out: Crossing[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      // adjacent segments (sharing a vertex) meet at that vertex — not a crossing to mark
      if (s1.a === s2.a || s1.a === s2.b || s1.b === s2.a || s1.b === s2.b) continue;
      const x = properCross(s1.pa, s1.pb, s2.pa, s2.pb);
      if (!x) continue;
      if (named.some((p) => dist(p, x) < eps)) continue; // already a named point here
      if (out.some((o) => dist(o.pos, x) < eps)) continue; // concurrent lines → one dot
      out.push({ pos: x, a: s1.a, b: s1.b, c: s2.a, d: s2.b });
    }
  }
  // Drawn LINES × segment interiors (#197 Am. 7): a tangent/bisector line crossing a segment strictly
  // inside it is a visible crossing the student expects to name — same dot, same dedupe discipline.
  const near = Math.max(1e-9, 2e-2 * span); // a line skimming an endpoint isn't an interior crossing
  for (const ln of lines) {
    for (const s of segs) {
      const r = sub(s.pb, s.pa);
      const denom = ln.dir.x * r.y - ln.dir.y * r.x;
      if (Math.abs(denom) < 1e-12) continue; // parallel
      const ac = sub(s.pa, ln.anchor);
      // Solve anchor + t·dir = pa + u·r for the SEGMENT param u: cross both sides with dir.
      const u2 = (ac.x * ln.dir.y - ac.y * ln.dir.x) / denom;
      const E = 1e-6;
      if (u2 <= E || u2 >= 1 - E) continue; // must land strictly inside the drawn segment
      const x = add(s.pa, scale(r, u2));
      if (named.some((p) => dist(p, x) < near)) continue;
      if (out.some((o) => dist(o.pos, x) < eps)) continue;
      out.push({ pos: x, line1: ln.id, c: s.a, d: s.b });
    }
  }
  return out;
}
