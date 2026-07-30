/**
 * Which part of a circle is actually DRAWN — the arc twin of `resolveDrawnLines` (ADR-380), and for the
 * same reason: the renderer and the engine must resolve "what ink exists" from ONE definition, or they
 * cannot even be compared.
 *
 * #429 (ADR-423). Before this, an arc's drawn extent was **renderer-only knowledge**: `arc` objects were
 * read at exactly one site in the codebase (`render/scene.ts`), and the two decisions that fix which part
 * is drawn — the bulge flip (`bulgeRef`/`bulgeToward`) and the traversal direction that realises the
 * intended span — were both resolved at render time. So the engine's circle was always the FULL circle,
 * every reference to a semicircle resolved against 360°, and no requirement or sampling mechanism could
 * restrict anything to the ink: the engine could not even ask the question. «חצי מעגל» + «משולש CDE חסום
 * במעגל» put E at θ = 280° — floating in empty space below a semicircle's diameter, `lastError: null`.
 *
 * This is the ADR-167 shape ("the node-definition issue, again") in the ARC dimension: the universe of
 * "where may a point on this circle be" was the whole circle when it should be the drawn ink.
 *
 * Generality: arcs are arcs. Semicircles, quarter-circles and sectors (ADR-357) all use the same
 * hidden-circle + `arc` construct family, so everything here is expressed over spans and never
 * special-cased to 180°.
 */
import type { Arc, Id, Vec } from './types';
import { add, len, sub, unit } from './geometry';

const TAU = 2 * Math.PI;

/** A drawn angular interval: `len` radians counter-clockwise from `start`. `len` is always > 0. */
export interface ArcSpan {
  start: number;
  len: number;
}

/** Normalize an angle to [0, 2π). */
export const norm2pi = (a: number): number => ((a % TAU) + TAU) % TAU;

export interface OrientOpts {
  spanDeg?: number;
  minor?: boolean;
  /** The received frame is MIRRORED (the renderer pre-orients world positions; one flip reverses
   *  handedness). Engine callers work in the model frame and leave this false. */
  mirrored?: boolean;
  /** Resolved position of `bulgeRef`, when the arc has one. */
  bulgeRef?: Vec;
  bulgeToward?: boolean;
}

/**
 * The ONE definition of which way an arc goes, extracted verbatim from the renderer so both callers
 * share it (the renderer passes its possibly-mirrored frame; the engine passes model positions).
 *
 * Two decisions, in order:
 *  1. **the bulge flip** — a semicircle "outside"/"inside" a shape swaps from↔to so the apex sits on the
 *     far side of the diameter from `bulgeRef` (outward, default) or the same side (`bulgeToward`);
 *  2. **the traversal** — the arc's IDENTITY is "the arc of the intended central angle" (`spanDeg`),
 *     never "the CCW sweep in whatever frame we were handed" (ADR-356), so we traverse whichever way
 *     realises that span.
 */
export function orientArc(
  center: Vec,
  fromIn: Vec,
  toIn: Vec,
  opts?: OrientOpts,
): { from: Vec; to: Vec; r: number; startAng: number; sweepAng: number; goCcw: boolean } | null {
  const r = len(sub(fromIn, center));
  if (r < 1e-9) return null;
  let from = fromIn;
  let to = toIn;
  // (1) the bulge flip — the apex of the CCW arc from `from` is 90° CCW around the centre; `side()` is
  // the signed half-plane of a point relative to the diameter line (through the centre, along to−from).
  if (opts?.bulgeRef) {
    const u = unit(sub(from, center));
    const apex = { x: center.x - u.y * r, y: center.y + u.x * r }; // centre + r·rot90CCW(u)
    const dia = sub(to, from);
    const side = (p: Vec) => (p.x - center.x) * dia.y - (p.y - center.y) * dia.x;
    const sameSide = side(apex) * side(opts.bulgeRef) > 0;
    if (sameSide !== !!opts.bulgeToward) [from, to] = [to, from]; // wrong side → the other semicircle
  }
  // (2) the traversal
  const angA = Math.atan2(from.y - center.y, from.x - center.x);
  const angB = Math.atan2(to.y - center.y, to.x - center.x);
  let ccw = (angB - angA) % TAU; // CCW span from `from` to `to` in the RECEIVED frame
  if (ccw <= 1e-9) ccw += TAU;
  const intended =
    opts?.spanDeg !== undefined ? (opts.spanDeg * Math.PI) / 180
    : opts?.minor ? Math.min(ccw, TAU - ccw) // the textbook wedge (ADR-357) — parity-invariant
    : opts?.mirrored ? TAU - ccw : ccw;
  // Tie (a semicircle) keeps CCW — the bulge mechanism has already oriented from/to in this frame.
  const goCcw = Math.abs(ccw - intended) <= Math.abs(TAU - ccw - intended);
  const extent = goCcw ? ccw : TAU - ccw;
  return { from, to, r, startAng: angA, sweepAng: goCcw ? extent : -extent, goCcw };
}

/** The drawn interval of one oriented arc, as a CCW `[start, start+len]`. */
function spanOf(startAng: number, sweepAng: number): ArcSpan {
  return sweepAng >= 0
    ? { start: norm2pi(startAng), len: sweepAng }
    : { start: norm2pi(startAng + sweepAng), len: -sweepAng };
}

/**
 * The angular intervals of `circleId` that carry ink, or **null when the circle has no arcs at all** —
 * which every caller must read as "the whole circle is available". That null is the blast-radius
 * guarantee: a figure with no arc objects behaves exactly as it did before #429.
 *
 * An arc belongs to a circle when it shares its centre id and its radius matches.
 */
export function drawnArcSpans(
  /** The figure's `arc` objects (the caller filters — so a command-side consumer can pass its own). */
  arcs: readonly { kind: string }[],
  positions: Map<Id, Vec>,
  circleCenterId: Id,
  radius: number,
): ArcSpan[] | null {
  let spans: ArcSpan[] | null = null;
  for (const o of arcs) {
    if (o.kind !== 'arc') continue;
    const a = o as unknown as Arc;
    if (a.center !== circleCenterId) continue;
    const center = positions.get(a.center);
    const from = positions.get(a.from);
    const to = positions.get(a.to);
    if (!center || !from || !to) continue; // not resolved yet in this sweep — treat as unknown, not empty
    const r = len(sub(from, center));
    if (radius > 1e-9 && Math.abs(r - radius) > 1e-6 * Math.max(1, radius)) continue; // a different circle
    const or = orientArc(center, from, to, {
      spanDeg: a.spanDeg,
      minor: a.minor,
      bulgeRef: a.bulgeRef ? positions.get(a.bulgeRef) : undefined,
      bulgeToward: a.bulgeToward,
    });
    if (!or) continue;
    (spans ??= []).push(spanOf(or.startAng, or.sweepAng));
  }
  return spans;
}

/** Total drawn radians. */
const totalLen = (spans: ArcSpan[]): number => spans.reduce((s, sp) => s + sp.len, 0);

/**
 * Is `ang` on the drawn ink? `tol` is an angular slack (radians) so a point AT an endpoint counts.
 * A null `spans` (no arcs) means the whole circle is drawn, so everything is on it.
 */
export function angleOnSpans(ang: number, spans: ArcSpan[] | null, tol = 1e-9): boolean {
  if (!spans || spans.length === 0) return true;
  const a = norm2pi(ang);
  for (const sp of spans) {
    // distance travelled CCW from the span's start
    const d = norm2pi(a - sp.start);
    if (d <= sp.len + tol || d >= TAU - tol) return true;
  }
  return false;
}

/** How far off the ink `ang` is, in radians (0 when on it) — for a verifier's margin. */
export function angleOffSpans(ang: number, spans: ArcSpan[] | null): number {
  if (!spans || spans.length === 0) return 0;
  const a = norm2pi(ang);
  let best = Math.PI;
  for (const sp of spans) {
    const d = norm2pi(a - sp.start);
    if (d <= sp.len) return 0;
    best = Math.min(best, Math.min(d - sp.len, TAU - d));
  }
  return Math.max(0, best);
}

/**
 * Map an UNCONSTRAINED angle onto the drawn ink — the confinement a free (unstated) on-circle point gets.
 *
 * Proportional and monotone, so varying θ still sweeps the point along the arc and "show another
 * configuration" keeps its variety. `INSET` keeps the point STRICTLY INSIDE the arc endpoints (the
 * operator's ruling, and the `0.92` discipline already used by the ADR-042 `between` rider), so a free
 * point never crowds or silently coincides with a named endpoint like a semicircle's A or B.
 */
const INSET = 0.04; // 4% margin at each end ⇒ the usable 92%, matching `between`

export function angleIntoSpans(theta: number, spans: ArcSpan[] | null): number {
  if (!spans || spans.length === 0) return theta;
  const total = totalLen(spans);
  if (total <= 1e-9) return theta;
  // θ's position around the full circle becomes its position along the drawn ink
  let target = (norm2pi(theta) / TAU) * total;
  for (const sp of spans) {
    if (target > sp.len && sp !== spans[spans.length - 1]) {
      target -= sp.len;
      continue;
    }
    const u = sp.len <= 1e-9 ? 0 : Math.max(0, Math.min(1, target / sp.len));
    return sp.start + sp.len * (INSET + (1 - 2 * INSET) * u);
  }
  return theta;
}

/**
 * Choose between two antipodal candidate directions by which one is DRAWN.
 *
 * A semicircle's endpoints are antipodal, so the arc bisector degenerates and both the `between` rider
 * and `arc-midpoint` fell back to an arbitrary perpendicular (`rot90(u1)`), blind to which half carries
 * ink — which is why «F אמצע הקשת AB» deterministically produced the midpoint of the INVISIBLE arc.
 * Returns `+1` to keep `cand`, `-1` to take its opposite, and `+1` when nothing is drawn (unchanged).
 */
export function drawnSign(candAng: number, spans: ArcSpan[] | null): 1 | -1 {
  if (!spans || spans.length === 0) return 1;
  const on = angleOnSpans(candAng, spans, 1e-6);
  const onOpp = angleOnSpans(candAng + Math.PI, spans, 1e-6);
  if (on === onOpp) return 1; // both or neither drawn — no information, keep the legacy choice
  return on ? 1 : -1;
}

/** The point on a circle at an angle. */
export const atAngle = (center: Vec, r: number, ang: number): Vec =>
  add(center, { x: r * Math.cos(ang), y: r * Math.sin(ang) });
