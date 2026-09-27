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
import { applyCommand } from './apply';
import type { Command, Construction, GeoObject, Id, SideRequirement } from './types';

export interface SideImpossibility {
  /** the statement that places the point, as the student would read it — `E on circle O` */
  placed: string;
  /** the side statement it contradicts — `E outside circle O` */
  side: string;
  /** true when the INCOMING command is the side statement, so the message leads with it */
  sideIsNew: boolean;
}

const circleName = (id: Id): string => (id.startsWith('circle-') ? id.slice('circle-'.length) : id);
const polyNoun = (poly: Id[]): string => (poly.length === 3 ? 'triangle' : 'polygon');
const pairKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** A polygon ring up to rotation and reflection — «ABC» and «BCA» are one region. */
function ringKey(poly: Id[]): string {
  const n = poly.length;
  const cands: string[] = [];
  for (const ring of [poly, [...poly].reverse()]) for (let k = 0; k < n; k++) cands.push([...ring.slice(k), ...ring.slice(0, k)].join(','));
  return cands.sort()[0];
}

/** Union-find over `coincide` statements — a point stated to coincide with another shares its incidences. */
function coincideClasses(c: Construction): (id: Id) => Set<Id> {
  const parent = new Map<Id, Id>();
  const find = (x: Id): Id => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const con of c.constraints) {
    if (con.type !== 'coincide') continue;
    const [ra, rb] = [find(con.p), find(con.q)];
    if (ra !== rb) parent.set(ra, rb);
  }
  const ids = new Set<Id>();
  for (const con of c.constraints) if (con.type === 'coincide') ids.add(con.p).add(con.q);
  return (id: Id) => {
    const root = find(id);
    const out = new Set<Id>([id]);
    for (const x of ids) if (find(x) === root) out.add(x);
    return out;
  };
}

type Circle = Extract<GeoObject, { kind: 'circle' }>;

/**
 * Everything the prover asks of a construction, over its objects PLUS the incoming command's asserted
 * objects. A point may appear in both lists (the command re-states an existing point); each list is
 * consulted on its own, so the asserted object never shadows the figure's.
 */
class Structure {
  private readonly lists: GeoObject[][];
  private readonly cls: (id: Id) => Set<Id>;
  constructor(private readonly c: Construction, asserted: GeoObject[]) {
    this.lists = [c.objects, asserted];
    this.cls = coincideClasses(c);
  }
  private defs(id: Id): GeoObject[] {
    const out: GeoObject[] = [];
    for (const x of this.cls(id)) for (const list of this.lists) for (const o of list) if (o.id === x) out.push(o);
    return out;
  }
  private circle(id: Id): Circle | undefined {
    for (const list of this.lists) {
      const o = list.find((x): x is Circle => x.kind === 'circle' && x.id === id);
      if (o) return o;
    }
    return undefined;
  }
  /** Structurally ON circle `circ` — a statement of that, or null. */
  onCircle(p: Id, circ: Id): string | null {
    const said = `${p} on circle ${circleName(circ)}`;
    const C = this.circle(circ);
    const mine = this.cls(p);
    for (const o of this.defs(p)) {
      if ((o.kind === 'on-circle' || o.kind === 'antipode' || o.kind === 'arc-midpoint' || o.kind === 'line-circle' || o.kind === 'radial-toward') && o.circle === circ) return said;
      if (o.kind === 'circle-circle' && (o.circle1 === circ || o.circle2 === circ)) return said;
    }
    if (C) {
      if (C.radius.via === 'through' && mine.has(C.radius.point)) return said;
      // a circumcircle passes through the three points its centre is the circumcentre of
      for (const list of this.lists) {
        const cc = list.find((o) => o.kind === 'circumcenter' && o.id === C.center);
        if (cc && cc.kind === 'circumcenter' && [cc.a, cc.b, cc.c].some((v) => mine.has(v))) return said;
      }
    }
    // A membership M1 lowered to a CONSTRAINT (apply's point-on-circle (c), (c4), (d)): still a statement
    // that the point is on this circle, recorded in the constraint's own operands.
    if (C) {
      const isCentre = (x: Id) => this.cls(C.center).has(x);
      const onByObject = (x: Id) =>
        this.defs(x).some((o) => (o.kind === 'on-circle' || o.kind === 'antipode' || o.kind === 'arc-midpoint' || o.kind === 'line-circle' || o.kind === 'radial-toward') && o.circle === circ) ||
        (C.radius.via === 'through' && this.cls(C.radius.point).has(x));
      for (const con of this.c.constraints) {
        if (con.type === 'length-radius' && con.circle === circ && con.k === 1 && !con.add && isCentre(con.a) && mine.has(con.b)) return said;
        if (con.type === 'distance' && C.radius.via === 'length' && Math.abs(con.value - C.radius.value) <= 1e-9 * Math.max(1, C.radius.value)) {
          if ((isCentre(con.a) && mine.has(con.b)) || (isCentre(con.b) && mine.has(con.a))) return said;
        }
        if (con.type === 'equal') {
          const pairs: [Id, Id][] = [[con.a, con.b], [con.c, con.d]];
          const radial = (q: [Id, Id]): Id | null => (isCentre(q[0]) ? q[1] : isCentre(q[1]) ? q[0] : null);
          const [r1, r2] = pairs.map(radial);
          if (r1 && r2 && ((mine.has(r1) && onByObject(r2)) || (mine.has(r2) && onByObject(r1)))) return said;
        }
      }
    }
    return null;
  }
  isCentre(p: Id, circ: Id): string | null {
    const C = this.circle(circ);
    return C && this.cls(p).has(C.center) ? `${p} is the centre of circle ${circleName(circ)}` : null;
  }
  /** Structurally on the BOUNDARY of polygon `poly` — a vertex, or within one of its edges. */
  onBoundary(p: Id, poly: Id[]): string | null {
    const mine = this.cls(p);
    const vertex = poly.find((v) => mine.has(v));
    if (vertex !== undefined) return `${p} is a vertex of ${poly.join('')}`;
    const edges = new Map<string, [Id, Id]>();
    poly.forEach((v, i) => edges.set(pairKey(v, poly[(i + 1) % poly.length]), [v, poly[(i + 1) % poly.length]]));
    const edge = (a: Id, b: Id) => edges.get(pairKey(a, b));
    const within = (t: number | undefined) => t === undefined || (t >= 0 && t <= 1);
    for (const o of this.defs(p)) {
      if (o.kind === 'on-segment' && !o.extension && within(o.t) && edge(o.a, o.b)) return `${p} on segment ${o.a}${o.b}`;
      if (o.kind === 'on-segment-solved' && within(o.t0) && edge(o.a, o.b)) return `${p} on segment ${o.a}${o.b}`;
      if (o.kind === 'midpoint' && edge(o.a, o.b)) return `${p} is the midpoint of ${o.a}${o.b}`;
      if (o.kind === 'line-circle' && o.onSegment && edge(o.onSegment[0], o.onSegment[1])) return `${p} on segment ${o.onSegment[0]}${o.onSegment[1]}`;
      if (o.kind === 'line-line-intersection') {
        if ((o.onSeg || o.onSeg1) && edge(o.a, o.b)) return `${p} on segment ${o.a}${o.b}`;
        if ((o.onSeg || o.onSeg2) && edge(o.c, o.d)) return `${p} on segment ${o.c}${o.d}`;
      }
    }
    // «E בין A ל-B» / an M1-lowered «E על AB» on a pinned point: an in-order statement with E between an edge's ends
    for (const con of this.c.constraints) {
      if (con.type !== 'collinear-order') continue;
      const ix = con.points.findIndex((x) => mine.has(x));
      if (ix < 0) continue;
      for (let i = 0; i < ix; i++) for (let j = ix + 1; j < con.points.length; j++) {
        const e = edge(con.points[i], con.points[j]);
        if (e) return `${p} on segment ${e[0]}${e[1]}`;
      }
    }
    return null;
  }
  /** Structurally on the (infinite) LINE a–b. */
  onLine(p: Id, a: Id, b: Id): string | null {
    const mine = this.cls(p);
    const ab = pairKey(a, b);
    const seg = `${a}${b}`;
    if (mine.has(a) || mine.has(b)) return `${p} on line ${seg}`;
    const lineIsAB = (lineId: Id): boolean =>
      this.lists.some((list) => list.some((o) => o.kind === 'line' && o.id === lineId && o.spec.via === 'through' && pairKey(o.spec.a, o.spec.b) === ab));
    for (const o of this.defs(p)) {
      if ((o.kind === 'on-segment' || o.kind === 'on-segment-solved') && pairKey(o.a, o.b) === ab) return o.kind === 'on-segment' && (o.extension || !(o.t >= 0 && o.t <= 1)) ? `${p} on line ${seg}` : `${p} on segment ${seg}`;
      if (o.kind === 'midpoint' && pairKey(o.a, o.b) === ab) return `${p} is the midpoint of ${seg}`;
      if (o.kind === 'foot' && pairKey(o.a, o.b) === ab) return `${p} on line ${seg}`;
      if (o.kind === 'line-line-intersection' && (pairKey(o.a, o.b) === ab || pairKey(o.c, o.d) === ab)) return `${p} on line ${seg}`;
      if ((o.kind === 'on-line' || o.kind === 'line-circle') && lineIsAB(o.line)) return `${p} on line ${seg}`;
      if (o.kind === 'line-intersection' && (lineIsAB(o.line1) || lineIsAB(o.line2))) return `${p} on line ${seg}`;
    }
    for (const con of this.c.constraints) {
      const pts = con.type === 'collinear' ? [con.a, con.b, con.c] : con.type === 'collinear-order' ? con.points : null;
      if (pts && pts.includes(a) && pts.includes(b) && pts.some((x) => mine.has(x))) return `${p} on line ${seg}`;
    }
    return null;
  }
}

const sideText = (r: SideRequirement): string =>
  r.kind === 'circle-side'
    ? `${r.id} ${r.side} circle ${circleName(r.circle)}`
    : r.kind === 'polygon-side'
      ? `${r.id} ${r.side} ${polyNoun(r.poly)} ${r.poly.join('')}`
      : `${r.subjects.join(', ')} ${r.rel === 'different' ? 'on different sides of' : 'on the same side of'} ${r.a}${r.b}`;

/** The objects a command ASSERTS on its own — its structural probe on an empty construction. */
function assertedObjects(cmd: Command | undefined): GeoObject[] {
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
  const reqs = probed.requirements;
  if (!reqs?.length) return null;
  const s = new Structure(probed, assertedObjects(cmd));
  const isNew = (r: SideRequirement): boolean =>
    !!cmd &&
    ((r.kind === 'circle-side' && cmd.type === 'point-circle-side' && cmd.id === r.id && cmd.circle === r.circle && cmd.side === r.side) ||
      (r.kind === 'polygon-side' && cmd.type === 'point-polygon-side' && cmd.id === r.id && cmd.side === r.side && ringKey(cmd.poly) === ringKey(r.poly)) ||
      (r.kind === 'line-side' && cmd.type === 'points-line-side' && pairKey(cmd.a, cmd.b) === pairKey(r.a, r.b) && cmd.rel === r.rel && cmd.subjects.join() === r.subjects.join()));
  const hit = (placed: string, r: SideRequirement): SideImpossibility => ({ placed, side: sideText(r), sideIsNew: isNew(r) });

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
    } else {
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
  return `impossible: «${first}» contradicts «${second}»`;
}
