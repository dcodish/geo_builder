/**
 * STATED SIDES AS REQUIREMENT RECORDS (#1470, [ADR-549](../../docs/06-decisions.md#adr-549)), and two circles'
 * stated mutual position (#1709, [ADR-567](../../docs/06-decisions.md#adr-567)).
 *
 * The ONE definition of which commands state a side and what they record. `applyCommand` calls it for
 * the probe the stage-0 provers read, and `applyStep`/`applyCoupledStep` stamp the committed figure with
 * it — so a record survives every ladder path (M1 conversions, recruiter rebuilds, ownership passes)
 * without each of them having to remember to carry a field they know nothing about.
 */
import type { Command, Construction, Id, SideRequirement, Vec } from './types';
import type { ResolvedCircle } from './evaluate';
import { dist, pointInPolygon, pointOutsidePolygon } from './geometry';

/** The record a command states, or null when it states no side. */
export function sideRequirementOf(cmd: Command): SideRequirement | null {
  if (cmd.type === 'point-circle-side') return { kind: 'circle-side', id: cmd.id, circle: cmd.circle, side: cmd.side };
  if (cmd.type === 'point-polygon-side') return { kind: 'polygon-side', id: cmd.id, poly: [...cmd.poly], side: cmd.side };
  if (cmd.type === 'points-line-side') return { kind: 'line-side', a: cmd.a, b: cmd.b, subjects: [...cmd.subjects], rel: cmd.rel };
  // #1709 (ADR-567): a STATED mutual position of two circles; the unstated bare-pair variant states nothing
  if (cmd.type === 'set-circle-position' && cmd.relation !== 'any') return { kind: 'circle-position', relation: cmd.relation, a: cmd.a, b: cmd.b };
  return null;
}

const same = (a: SideRequirement, b: SideRequirement): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `prior` plus whatever `cmds` state — a re-statement of an identical side is recorded once. */
export function recordRequirement(prior: readonly SideRequirement[] | undefined, ...cmds: Command[]): SideRequirement[] {
  const out = [...(prior ?? [])];
  for (const cmd of cmds) {
    const r = sideRequirementOf(cmd);
    if (r && !out.some((x) => same(x, r))) out.push(r);
  }
  return out;
}

/** The `requirements` field to spread into a construction — omitted when empty, so a figure without a stated side is byte-identical to before. */
export const requirementsField = (reqs: SideRequirement[]): { requirements?: SideRequirement[] } => (reqs.length ? { requirements: reqs } : {});

/** A stated SIDE of a region — the three kinds the ADR-254 family states (a circle's mutual position is not one). */
export type SideRecord = Exclude<SideRequirement, { kind: 'circle-position' }>;
export const isSideRecord = (r: SideRequirement): r is SideRecord => r.kind !== 'circle-position';
/** The construction's stated sides (#1739, ADR-594) — empty for every figure without one. */
export const sideRecordsOf = (c: Construction): SideRecord[] => (c.requirements ?? []).filter(isSideRecord);

/** "On the circle" tolerance — the verifier's (2 % of the radius, a small floor); a side is strict beyond it. */
export const onCircleTol = (r: number): number => Math.max(0.05, r * 0.02);

/**
 * #1739 ([ADR-594](../../docs/06-decisions.md#adr-594)) — the SIGNED CLEARANCE of a stated side, as a fraction of
 * the region's own scale (the circle's radius, the polygon's span, the carrier line's length): > 0 clear of the
 * verifier's margin on the stated side, < 0 short of it. Null when a ref is not placed (a different failure
 * mode — the verifier skips it too). The magnitude only steers; WHETHER the side holds is {@link sideHolds}.
 */
function sideClearance(req: SideRecord, positions: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): number | null {
  if (req.kind === 'circle-side') {
    const c = circles.get(req.circle);
    const p = positions.get(req.id);
    if (!c || !p || !(c.r > 0)) return null;
    const d = dist(p, c.center);
    const tol = onCircleTol(c.r);
    return (req.side === 'outside' ? d - c.r - tol : c.r - tol - d) / c.r;
  }
  if (req.kind === 'polygon-side') {
    const p = positions.get(req.id);
    const verts = req.poly.map((v) => positions.get(v));
    if (!p || verts.some((v) => v === undefined)) return null;
    const vs = verts as Vec[];
    const { rspan, margin } = polygonMargin(vs);
    if (!(rspan > 0)) return null;
    let edge = Infinity;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) edge = Math.min(edge, distToSegment(p, vs[i], vs[j]));
    const inside = pointInPolygon(p, vs);
    return ((req.side === 'inside') === inside ? edge - margin : -(edge + margin)) / rspan;
  }
  const pa = positions.get(req.a);
  const pb = positions.get(req.b);
  if (!pa || !pb) return null;
  const L = dist(pa, pb);
  if (L < 1e-9) return null;
  const offs: number[] = [];
  for (const id of req.subjects) {
    const p = positions.get(id);
    if (!p) return null;
    offs.push(lineOffset(p, pa, pb, L));
  }
  const tol = lineSideTol(L);
  if (req.rel === 'different') {
    if (offs.length !== 2) return null;
    const m = Math.min(Math.abs(offs[0]), Math.abs(offs[1]));
    return (offs[0] * offs[1] < 0 ? m - tol : -(m + tol)) / L;
  }
  const s = Math.sign(offs.reduce((a, b) => a + b, 0)) || 1;
  return (Math.min(...offs.map((o) => o * s)) - tol) / L;
}

/** The polygon-side scale and margin the verifier uses: the span from the centroid, and 1 % of it. */
export function polygonMargin(vs: Vec[]): { cx: number; cy: number; rspan: number; margin: number } {
  const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
  const cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
  const rspan = Math.max(...vs.map((v) => dist(v, { x: cx, y: cy })));
  return { cx, cy, rspan, margin: rspan * 0.01 };
}
/** Signed distance of `p` from the line a→b (length `L`) — the verifier's line-side offset. */
export const lineOffset = (p: Vec, pa: Vec, pb: Vec, L: number): number => ((p.x - pa.x) * (pb.y - pa.y) - (p.y - pa.y) * (pb.x - pa.x)) / L;
/** "Strictly off the line" — above solver noise, below anything visible. */
export const lineSideTol = (L: number): number => 1e-3 * Math.max(1, L);
function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dd = dx * dx + dy * dy;
  const t = dd < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / dd));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Does the stated side HOLD — exactly the verifier's test (`checkGivens` calls it: the circle's strict ring
 * tolerance, the polygon's 1 %-of-span clearance, a strict line side). True when a ref is not placed (that is
 * not a side failure).
 */
export function sideHolds(req: SideRecord, positions: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): boolean {
  if (req.kind === 'circle-side') {
    const c = circles.get(req.circle);
    const p = positions.get(req.id);
    if (!c || !p) return true;
    const d = dist(p, c.center);
    const tol = onCircleTol(c.r);
    return req.side === 'outside' ? d > c.r + tol : d < c.r - tol;
  }
  if (req.kind === 'polygon-side') {
    const p = positions.get(req.id);
    const verts = req.poly.map((v) => positions.get(v));
    if (!p || verts.some((v) => v === undefined)) return true;
    const vs = verts as Vec[];
    const { margin } = polygonMargin(vs);
    // #1487 (ADR-549): the boundary is neither side — outside is STRICT with the same clearance as inside.
    return req.side === 'inside' ? pointInPolygon(p, vs, margin) : pointOutsidePolygon(p, vs, margin);
  }
  const pa = positions.get(req.a);
  const pb = positions.get(req.b);
  if (!pa || !pb) return true;
  const L = dist(pa, pb);
  if (L < 1e-9) return true; // degenerate carrier — not a measurable side
  const offs: number[] = [];
  for (const id of req.subjects) {
    const p = positions.get(id);
    if (!p) return true;
    offs.push(lineOffset(p, pa, pb, L));
  }
  const tol = lineSideTol(L);
  const strict = offs.every((o) => Math.abs(o) > tol);
  return strict && (req.rel === 'different' ? offs.length === 2 && offs[0] * offs[1] < 0 : offs.every((o) => o * offs[0] > 0));
}

/**
 * #1739 ([ADR-594](../../docs/06-decisions.md#adr-594)) — THE ONE DEFINITION OF "THE STATED SIDE HOLDS", as a
 * shortfall: 0 **iff** the verifier accepts the side ({@link sideHolds}, which `checkGivens` calls), else a
 * positive amount, relative to the region's scale, by which it misses. The ADR-547 `boundShortfall` precedent:
 * the solver's target and the verifier's test cannot drift apart, because they are one function.
 *
 * `aim` > 0 asks for that much clearance INSIDE the region (relative units) — the steer's aim, ADR-390's
 * visible-gap idiom — and is a search preference only; `aim` = 0 is the verifier.
 *
 * Read at the four places that place a point: the 1-D root pick and the retry-only side steer (stage 4), the
 * sampler's region seat (stage 5) and the knowledge-pool filter (stage 6).
 */
export function sideShortfall(req: SideRecord, positions: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>, aim = 0): number {
  if (aim > 0) {
    const clear = sideClearance(req, positions, circles);
    return clear === null ? 0 : Math.max(0, aim - clear);
  }
  if (sideHolds(req, positions, circles)) return 0;
  const clear = sideClearance(req, positions, circles);
  return Math.max(1e-9, clear === null ? 0 : -clear);
}

/** The summed shortfall of every stated side of `c` (0 iff every one holds). */
export function sidesShortfall(c: Construction, positions: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>, aim = 0): number {
  let s = 0;
  for (const r of sideRecordsOf(c)) s += sideShortfall(r, positions, circles, aim);
  return s;
}
