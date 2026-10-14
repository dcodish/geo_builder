/**
 * THE STRUCTURAL READER — what a construction SAYS about a point, read from what the construction IS
 * (which object a point rides, what defines it, which statements coincide it with what), never from where
 * the current seed happens to draw it. Extracted verbatim from the side prover (ADR-549 / ADR-607) so that
 * the apply boundary can read it too without an import cycle (`sideFeasibility.ts` imports `applyCommand`;
 * this module imports nothing that does) — one notion of "on that circle" for the stage-0 provers, the
 * ADR-628 cyclic-member lowering, and the #1899 narrowing notice.
 */
import { drivenConstraintsOf } from './evaluate';
import { carryingLines } from './carryingLines';
import type { Constraint, Construction, GeoObject, Id } from './types';

export const circleName = (id: Id): string => (id.startsWith('circle-') ? id.slice('circle-'.length) : id);
export const pairKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Union-find over `coincide` statements — a point stated to coincide with another shares its incidences. */
export function coincideClasses(c: Construction): (id: Id) => Set<Id> {
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

export type Circle = Extract<GeoObject, { kind: 'circle' }>;

/**
 * Everything the prover asks of a construction, over its objects PLUS the incoming command's asserted
 * objects. A point may appear in both lists (the command re-states an existing point); each list is
 * consulted on its own, so the asserted object never shadows the figure's.
 */
export class Structure {
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
    return this.onLineBy(p, a, b)?.said ?? null;
  }
  /**
   * #2099 ([ADR-651](../../docs/06-decisions.md#adr-651)) — {@link onLine} with its WITNESS: the object (a rider, a
   * midpoint, a crossing …) or the constraint (a lowered collinearity) whose statement puts `p` on line a–b, so a
   * refusal can name the statement that made it so. No witness when `p` is `a` or `b` itself.
   */
  onLineBy(p: Id, a: Id, b: Id): { said: string; obj?: Id; con?: Constraint } | null {
    const mine = this.cls(p);
    const ab = pairKey(a, b);
    const seg = `${a}${b}`;
    if (mine.has(a) || mine.has(b)) return { said: `${p} on line ${seg}` };
    const lineIsAB = (lineId: Id): boolean =>
      this.lists.some((list) => list.some((o) => o.kind === 'line' && o.id === lineId && o.spec.via === 'through' && pairKey(o.spec.a, o.spec.b) === ab));
    for (const o of this.defs(p)) {
      if ((o.kind === 'on-segment' || o.kind === 'on-segment-solved') && pairKey(o.a, o.b) === ab) return { said: o.kind === 'on-segment' && (o.extension || !(o.t >= 0 && o.t <= 1)) ? `${p} on line ${seg}` : `${p} on segment ${seg}`, obj: o.id };
      if (o.kind === 'midpoint' && pairKey(o.a, o.b) === ab) return { said: `${p} is the midpoint of ${seg}`, obj: o.id };
      if (o.kind === 'foot' && pairKey(o.a, o.b) === ab) return { said: `${p} on line ${seg}`, obj: o.id };
      if (o.kind === 'line-line-intersection' && (pairKey(o.a, o.b) === ab || pairKey(o.c, o.d) === ab)) return { said: `${p} on line ${seg}`, obj: o.id };
      if ((o.kind === 'on-line' || o.kind === 'line-circle') && lineIsAB(o.line)) return { said: `${p} on line ${seg}`, obj: o.id };
      if (o.kind === 'line-intersection' && (lineIsAB(o.line1) || lineIsAB(o.line2))) return { said: `${p} on line ${seg}`, obj: o.id };
    }
    for (const con of this.c.constraints) {
      const pts = con.type === 'collinear' ? [con.a, con.b, con.c] : con.type === 'collinear-order' ? con.points : null;
      if (pts && pts.includes(a) && pts.includes(b) && pts.some((x) => mine.has(x))) return { said: `${p} on line ${seg}`, con };
    }
    return null;
  }
}

/**
 * IS THIS RING STRUCTURALLY ON ONE CIRCLE? ([ADR-628](../../docs/06-decisions.md#adr-628), #1913; the exact test
 * ADR-607's not-cyclic prover already made) — a stated concyclicity over every vertex (a `concyclic` constraint,
 * checked or driven), or every vertex structurally on one and the same circle (a rider, the circumcircle's own
 * points, a membership lowered to a constraint — `Structure.onCircle`). `asserted` is the incoming command's own
 * structural probe (the objects it asserts), so the ring the command itself completes reads the same way.
 * A reading of the construction, never of coordinates: four points that merely LOOK concyclic at one seed are
 * not on a circle.
 */
export function ringOnOneCircle(c: Construction, ring: readonly Id[], asserted: GeoObject[] = []): boolean {
  if (ring.length < 3) return false;
  const stated = [...c.constraints, ...drivenConstraintsOf(c)].some((con) => con.type === 'concyclic' && ring.every((v) => con.points.includes(v)));
  if (stated) return true;
  const s = new Structure(c, asserted);
  const circles = [c.objects, asserted].flatMap((list) => list.flatMap((o) => (o.kind === 'circle' ? [o.id] : [])));
  return circles.some((circ) => ring.every((v) => s.onCircle(v, circ) !== null));
}

/**
 * #2099 ([ADR-651](../../docs/06-decisions.md#adr-651)) — ARE THESE THREE POINTS STRUCTURALLY ON ONE LINE? The line
 * is named by two points, and every point is on it by what the construction SAYS — an endpoint of it, a rider on
 * it, its midpoint, a crossing on it, a collinearity lowered to a constraint (`Structure.onLineBy`), read through
 * the coincide classes. The candidate lines are the ones the figure names: the pairs among the three points, every
 * carrying line a point is defined on (`carryingLines`, ADR-612) and every stated collinearity. A reading of the
 * construction, never of coordinates — three points that merely LOOK collinear at one seed are not on a line.
 * Returns the line and the witnesses (objects / constraints whose statements put the points there), or null.
 */
export function threeOnOneLine(c: Construction, pts: readonly [Id, Id, Id], asserted: GeoObject[] = []): { line: [Id, Id]; objs: Id[]; cons: Constraint[] } | null {
  const s = new Structure(c, asserted);
  const cand = new Map<string, [Id, Id]>();
  const add = (a: Id, b: Id) => { if (a !== b) cand.set(pairKey(a, b), [a, b]); };
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) add(pts[i], pts[j]);
  for (const cl of carryingLines({ ...c, objects: [...c.objects, ...asserted] })) add(cl.a, cl.b);
  for (const con of c.constraints) {
    const ps = con.type === 'collinear' ? [con.a, con.b, con.c] : con.type === 'collinear-order' ? con.points : null;
    if (ps) for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) add(ps[i], ps[j]);
  }
  for (const [a, b] of cand.values()) {
    const by = pts.map((p) => s.onLineBy(p, a, b));
    if (by.every((w) => w !== null)) {
      const ws = by as { obj?: Id; con?: Constraint }[];
      return { line: [a, b], objs: ws.flatMap((w) => (w.obj ? [w.obj] : [])), cons: ws.flatMap((w) => (w.con ? [w.con] : [])) };
    }
  }
  return null;
}
