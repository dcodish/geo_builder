/**
 * A STATED SIDE AND A STATEMENT THAT PUTS THE POINT ELSEWHERE (#1470 + #1487,
 * [ADR-549](../../docs/06-decisions.md#adr-549)) — the fourth stage-0 prover, beside ADR-417's metric,
 * ADR-538's angle-sum and ADR-540's bound provers, with the same one-way soundness: a violation PROVES
 * impossibility, passing proves nothing.
 *
 * Class: a stated SIDE of a region (inside / outside a circle or polygon, the same / different sides of
 * a line) was a requirement the step ladder never saw, so a structural statement contradicting it was
 * never refused — it committed with an amber warning, or (#1487, a point on an edge "outside") silently
 * green. Operator ruling, 2026-09-27: *"we should always reject conflicting inputs that cannot exist"*.
 *
 * STRUCTURAL ONLY. Every member below is decided from what the construction IS — which object a point
 * rides, what defines it, which statements coincide it with what — never from where the current seed
 * happens to draw it. So a satisfiable combination can never be refused: a free point, a rider, a free
 * radius, a later constraint that moves things all leave the structure silent, and the ordinary ladder
 * and verifier run as before (a contradiction only coordinates can show stays the verifier's amber —
 * the residual the ADR records).
 *
 * Members, each against a recorded {@link SideRequirement}:
 *  - circle side: the point is ON the circle (a rider, a crossing, the radius's through-point, a
 *    circumcircle vertex, a membership lowered to a constraint) — contradicts inside and outside; the
 *    point is the circle's CENTRE — contradicts outside; inside and outside both stated;
 *  - polygon side: the point is a VERTEX of the region, on one of its EDGES (a rider within the edge, its
 *    midpoint, a segment meet within it, an in-order statement between its ends) — contradicts strict
 *    inside and strict outside; inside and outside both stated;
 *  - line side: a subject is ON the line (an endpoint, a rider, a foot, a crossing, a collinearity) —
 *    contradicts both relations, which demand strictly off the line; the same pair stated on the same
 *    side and on different sides.
 *
 * The incoming command's OWN claim is read by the same enumerator: `applyCommand` on an EMPTY
 * construction (the structural-probe idiom of `introducedPointIds`) yields the objects the command
 * asserts, whatever the M1 branch later lowers it to on the real figure. So both entry orders, and every
 * spelling that lowers to the same command («E על המעגל», «המעגל עובר דרך E», "E on the circle"), are
 * one case.
 */
import { engineErrorDebugText } from './errors';
import { applyCommand } from './apply';
import { circleName, pairKey, Structure } from './structure';
import { isSideRecord, type SideRecord } from './requirements';
import { ringKey } from './geometry';
import type { Command, Construction, GeoObject, Id, SideRequirement } from './types';

export interface SideImpossibility {
  /** the statement that places the point, as the student would read it — `E on circle O` */
  placed: string;
  /** the side statement it contradicts — `E outside circle O` */
  side: string;
  /** true when the INCOMING command is the side statement, so the message leads with it */
  sideIsNew: boolean;
}

const polyNoun = (poly: Id[]): string => (poly.length === 3 ? 'triangle' : 'polygon');

const sideText = (r: SideRecord): string =>
  r.kind === 'circle-side'
    ? `${r.id} ${r.side} circle ${circleName(r.circle)}`
    : r.kind === 'polygon-side'
      ? `${r.id} ${r.side} ${polyNoun(r.poly)} ${r.poly.join('')}`
      : `${r.subjects.join(', ')} ${r.rel === 'different' ? 'on different sides of' : 'on the same side of'} ${r.a}${r.b}`;

/** The objects a command ASSERTS on its own — its structural probe on an empty construction. */
export function assertedObjects(cmd: Command | undefined): GeoObject[] {
  if (!cmd) return [];
  try {
    return applyCommand({ objects: [], constraints: [] }, cmd).objects;
  } catch {
    return [];
  }
}

/**
 * The first stated side the probed construction structurally contradicts, or null. `probed` is the
 * figure WITH `cmd` applied (so its requirement records include `cmd`'s own side, if it states one);
 * `cmd` is read again only for the claim it asserts about an existing point.
 */
export function sideImpossibility(probed: Construction, cmd?: Command): SideImpossibility | null {
  // the stated SIDES only — a circle-position record (#1709) is no side, and this prover has nothing to say about it
  const reqs = probed.requirements?.filter(isSideRecord);
  if (!reqs?.length) return null;
  const s = new Structure(probed, assertedObjects(cmd));
  const isNew = (r: SideRecord): boolean =>
    !!cmd &&
    ((r.kind === 'circle-side' && cmd.type === 'point-circle-side' && cmd.id === r.id && cmd.circle === r.circle && cmd.side === r.side) ||
      (r.kind === 'polygon-side' && cmd.type === 'point-polygon-side' && cmd.id === r.id && cmd.side === r.side && ringKey(cmd.poly) === ringKey(r.poly)) ||
      (r.kind === 'line-side' && cmd.type === 'points-line-side' && pairKey(cmd.a, cmd.b) === pairKey(r.a, r.b) && cmd.rel === r.rel && cmd.subjects.join() === r.subjects.join()));
  const hit = (placed: string, r: SideRecord): SideImpossibility => ({ placed, side: sideText(r), sideIsNew: isNew(r) });

  for (const r of reqs) {
    if (r.kind === 'circle-side') {
      const on = s.onCircle(r.id, r.circle);
      if (on) return hit(on, r);
      if (r.side === 'outside') {
        const ctr = s.isCentre(r.id, r.circle);
        if (ctr) return hit(ctr, r);
      }
      const other = reqs.find((q) => q.kind === 'circle-side' && q.id === r.id && q.circle === r.circle && q.side !== r.side);
      if (other) return hit(sideText(isNew(r) ? other : r), isNew(r) ? r : other);
    } else if (r.kind === 'polygon-side') {
      const on = s.onBoundary(r.id, r.poly);
      if (on) return hit(on, r);
      const other = reqs.find((q) => q.kind === 'polygon-side' && q.id === r.id && q.side !== r.side && ringKey(q.poly) === ringKey(r.poly));
      if (other) return hit(sideText(isNew(r) ? other : r), isNew(r) ? r : other);
    } else if (r.kind === 'line-side') {
      for (const p of r.subjects) {
        const on = s.onLine(p, r.a, r.b);
        if (on) return hit(on, r);
      }
      // the same two points stated on the same side AND on different sides of one line
      const other = reqs.find(
        (q) =>
          q.kind === 'line-side' &&
          q.rel !== r.rel &&
          pairKey(q.a, q.b) === pairKey(r.a, r.b) &&
          (() => {
            const diff = r.rel === 'different' ? r : q;
            const same = r.rel === 'same' ? r : q;
            return diff.subjects.length === 2 && diff.subjects.every((x) => same.subjects.includes(x));
          })(),
      );
      if (other) return hit(sideText(isNew(r) ? other : r), isNew(r) ? r : other);
    }
  }
  return null;
}

/**
 * The wire message — the same `impossible: X contradicts Y` shape as ADR-540's bound prover, so the one
 * humanize pattern renders both; the NEW statement leads. Both halves are the student's own statements.
 */
export function sideImpossibilityError(m: SideImpossibility): string {
  // Quoted («»): unlike ADR-540's symbolic halves (`|BC| = 4`), these are worded statements, and a
  // sentence joining two unquoted ones reads as one run-on clause.
  const [first, second] = m.sideIsNew ? [m.side, m.placed] : [m.placed, m.side];
  return engineErrorDebugText({ code: 'bound-impossible', value: `«${first}»`, bound: `«${second}»` });
}
