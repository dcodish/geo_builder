/**
 * #1937 + #1971 (ADR-W-124; 2-D ADR-612, analytic ADR-AG-255) — AN OFF-INK CONSTRUCTION POINT GETS ITS CARRYING
 * LINE EXTENDED, DASHED, TO MEET IT.
 *
 * Operator, 2026-10-09 (#1937): *"Lines, and show why … extend both diagonals, dashed, out to it"*; and 2026-10-10
 * (#1971), generalising it: **any construction point that lands off the drawn ink gets the carrying line extended,
 * dashed, to meet it.** A height's foot beyond the end of its side, the meet of a concave quadrilateral's diagonals,
 * a line's crossing past the drawn piece: each was a labelled dot floating beside the figure.
 *
 * A point's CARRIER is a line through two named points that the point is defined to lie on (a foot on the side it
 * was dropped to, a diagonal meet on each diagonal). Each builder reads its own carriers from its own dependency
 * graph — that is engine knowledge and stays in the product tree; this module is the shared GEOMETRY of the
 * decision, pure and product-free, so the two planar builders cannot disagree about when a stretch is drawn:
 *
 * - a point inside its carrier's span (between the two named points) gets nothing — the foot on its side, the
 *   convex meet, unchanged;
 * - a point beyond the span gets the stretch from the span's nearer end to the point, **minus whatever ink is
 *   already drawn along that line** (a drawn segment or an infinite drawn line), so a stretch is never drawn over
 *   solid ink and a point the figure already reaches gets nothing;
 * - a point that is not on its carrier at this configuration (an unsatisfied figure) gets nothing — the dashed
 *   stretch never asserts an incidence the figure does not have.
 *
 * DECORATION, not an object: no id, no letter, never in the fact list, recomputed per configuration (whether a foot
 * lands beyond its side is a fact about the configuration, and «הציגו תצורה אחרת» may move it inside).
 */

export interface InkPt {
  x: number;
  y: number;
}

/** One incidence: `p` is defined to lie on the line through `a` and `b`. */
export interface InkCarrier {
  p: InkPt;
  a: InkPt;
  b: InkPt;
}

/** A finite drawn piece. */
export interface InkRun {
  a: InkPt;
  b: InkPt;
}

/** An infinite drawn line: a point on it and a direction (any length). */
export interface InkLine {
  anchor: InkPt;
  dir: InkPt;
}

/** A dashed stretch to draw: from the carrier's ink toward the point. */
export interface InkExtension {
  from: InkPt;
  to: InkPt;
}

/** Relative incidence tolerance — the scale-free test every planar collinearity check in the suite uses. */
const REL = 1e-6;

/**
 * The dashed stretches a figure owes its off-ink construction points. `carriers` may repeat a line (two carriers of
 * one point on the same line, or two points on one line); the result is de-duplicated.
 */
export function offInkExtensions(
  carriers: readonly InkCarrier[],
  runs: readonly InkRun[],
  lines: readonly InkLine[] = [],
): InkExtension[] {
  const out: InkExtension[] = [];
  for (const k of carriers) {
    const dx = k.b.x - k.a.x;
    const dy = k.b.y - k.a.y;
    const L = Math.hypot(dx, dy);
    if (!(L > 1e-12)) continue;
    const u = { x: dx / L, y: dy / L };
    const scale = Math.max(1, L, Math.hypot(k.p.x - k.a.x, k.p.y - k.a.y));
    const tol = REL * scale;
    const along = (q: InkPt) => (q.x - k.a.x) * u.x + (q.y - k.a.y) * u.y;
    const off = (q: InkPt) => Math.abs((q.x - k.a.x) * u.y - (q.y - k.a.y) * u.x);
    if (off(k.p) > tol) continue; // not on its carrier here — never assert an incidence the figure lacks
    const t = along(k.p);
    if (t >= -tol && t <= L + tol) continue; // inside the span: nothing to show
    // The gap, as an interval along the carrier: from the span's nearer end to the point.
    const lo0 = t < 0 ? t : L;
    const hi0 = t < 0 ? 0 : t;
    // Subtract every piece of ink lying ON this line.
    const covered: Array<[number, number]> = [];
    for (const r of runs) {
      if (off(r.a) > tol || off(r.b) > tol) continue;
      const s0 = along(r.a);
      const s1 = along(r.b);
      covered.push([Math.min(s0, s1), Math.max(s0, s1)]);
    }
    for (const l of lines) {
      const dl = Math.hypot(l.dir.x, l.dir.y);
      if (!(dl > 1e-12)) continue;
      const cross = Math.abs((l.dir.x / dl) * u.y - (l.dir.y / dl) * u.x);
      if (cross > REL || off(l.anchor) > tol) continue;
      covered.push([-Infinity, Infinity]);
    }
    covered.sort((p, q) => p[0] - q[0]);
    let cursor = lo0;
    const pieces: Array<[number, number]> = [];
    for (const [c0, c1] of covered) {
      if (c1 <= cursor + tol) continue;
      if (c0 > hi0 - tol) break;
      if (c0 > cursor + tol) pieces.push([cursor, c0]);
      cursor = Math.max(cursor, c1);
      if (cursor >= hi0 - tol) break;
    }
    if (cursor < hi0 - tol) pieces.push([cursor, hi0]);
    const at = (s: number): InkPt => ({ x: k.a.x + s * u.x, y: k.a.y + s * u.y });
    for (const [s0, s1] of pieces) {
      if (s1 - s0 <= tol) continue;
      // Drawn FROM the ink TOWARD the point, so `to` is the point's own position when nothing interrupts it.
      const pt = { x: k.p.x, y: k.p.y };
      const [from, to] = t < 0 ? [at(s1), s0 === lo0 ? pt : at(s0)] : [at(s0), s1 === hi0 ? pt : at(s1)];
      if (!out.some((e) => near(e.from, from, tol) && near(e.to, to, tol))) out.push({ from, to });
    }
  }
  return out;
}

const near = (p: InkPt, q: InkPt, tol: number): boolean => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
