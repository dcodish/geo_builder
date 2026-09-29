/**
 * #1475 (ADR-3D-264) — THE ONE DIHEDRAL GEOMETRY.
 *
 * Everything the canvas draws about the angle between two PLANES hangs on the same three facts: where on
 * the seam the mark sits (`foot`), and the two in-plane arms perpendicular to the seam (`u1` in the first
 * plane, `u2` in the second). Before #1475 two lanes computed them, differently — the named-plane arc put
 * the foot at the seam point nearest the figure's centre, the object-angle arc at the midpoint of the
 * shared edge — and the right-angle knee computed them not at all, so «π1 ניצב ל-π2» drew nothing. One
 * function now answers for the arc lanes (`scene3.ts`), the knee (`rightAngles.ts`), and any later
 * dihedral construction (#1476).
 *
 * Pure and operand-level: it takes resolved {@link OperandGeom}s, so a named plane, a point run and a
 * coordinate plane all arrive the same way; which record produced the pair is not its business.
 */

import { intersectPlanes } from '../engine/evaluate';
import type { OperandGeom } from '../engine/operands';
import type { Id, Operand3 } from '../engine/types';
import { add3, centroid3, cross3, dist3, dot3, norm3, normalize3, scale3, sub3, type Vec3 } from '../engine/vec3';
import { projectOntoLine } from './planeGeom';

/** The dihedral between two planes, in WORLD space. */
export interface DihedralGeometry {
  /** The point ON the seam the mark is drawn at. */
  foot: Vec3;
  /** Unit arm lying in the FIRST plane, perpendicular to the seam. */
  u1: Vec3;
  /** Unit arm lying in the SECOND plane, perpendicular to the seam. */
  u2: Vec3;
  /** Unit direction of the seam (the planes' line of intersection). */
  seamDir: Vec3;
  /** A point on the seam other than the foot is `foot + t·seamDir`; the seam's own anchor, for callers that draw it. */
  seamAnchor: Vec3;
}

/** Where to put the foot and which way to point the arms — see {@link dihedralAnchors}. */
export interface DihedralOpts {
  /**
   * Points the two planes SHARE (the common vertices of two point runs, e.g. A and B for ABC and ABB').
   * When present the foot is the seam point nearest their centroid — the shared edge's midpoint, where a
   * textbook draws the mark. Empty ⇒ the seam point nearest `center`.
   */
  shared?: Vec3[];
  /** The fallback anchor for the foot — normally the figure's centroid. */
  center: Vec3;
  /**
   * Each plane's own material (a point-run's centroid): the arm is flipped to point INTO it, so the mark
   * sits on the angle the student can see rather than its vertical opposite. `null` ⇒ left as computed.
   */
  toward?: { a: Vec3 | null; b: Vec3 | null };
}

/**
 * The dihedral geometry of two planar operands, or null when either is not a plane or the two are
 * parallel / coincident (no seam, no dihedral).
 *
 * `u1`/`u2` are the two half-planes' directions away from the seam; the angle between them is the
 * dihedral (or its supplement — a caller drawing a STATED value picks between them; a right angle is
 * the same either way).
 */
export function dihedralGeometry(ga: OperandGeom, gb: OperandGeom, opts: DihedralOpts): DihedralGeometry | null {
  if (!ga.normal || !gb.normal || ga.d === undefined || gb.d === undefined) return null;
  if (ga.dir || gb.dir) return null; // a line-ish operand is not a plane
  const seam = intersectPlanes({ n: ga.normal, d: ga.d }, { n: gb.normal, d: gb.d });
  if (!seam) return null; // parallel or coincident — there is no dihedral
  const seamDir = normalize3(seam.dir);
  const shared = opts.shared ?? [];
  const foot = projectOntoLine(shared.length ? centroid3(shared) : opts.center, seam);
  const c1 = cross3(normalize3(ga.normal), seamDir);
  const c2 = cross3(normalize3(gb.normal), seamDir);
  if (norm3(c1) < 1e-9 || norm3(c2) < 1e-9) return null;
  const orient = (u: Vec3, mat: Vec3 | null | undefined): Vec3 => (mat && dot3(u, sub3(mat, foot)) < 0 ? scale3(u, -1) : u);
  return {
    foot,
    u1: orient(normalize3(c1), opts.toward?.a),
    u2: orient(normalize3(c2), opts.toward?.b),
    seamDir,
    seamAnchor: seam.anchor,
  };
}

/**
 * The {@link DihedralOpts} anchors an OPERAND pair supplies: the vertices two point runs share, and each
 * point run's centroid as its material. A named or coordinate plane has neither (its geometry is the
 * equation alone), so it contributes nothing and the foot falls back to the seam point nearest `center`.
 */
export function dihedralAnchors(
  a: Operand3,
  b: Operand3,
  at: (id: Id) => Vec3 | null,
): { shared: Vec3[]; toward: { a: Vec3 | null; b: Vec3 | null } } {
  const runOf = (op: Operand3): Id[] => (op.kind === 'plane-run' ? op.ids : []);
  const pts = (ids: Id[]) => ids.map(at).filter((p): p is Vec3 => !!p);
  const ra = runOf(a);
  const rb = runOf(b);
  const material = (ids: Id[]) => {
    const p = pts(ids);
    return p.length ? centroid3(p) : null;
  };
  return { shared: pts(ra.filter((id) => rb.includes(id))), toward: { a: material(ra), b: material(rb) } };
}

/**
 * #1476 (ADR-3D-265) — THE CONSTRUCTION THAT MEASURES A DIHEDRAL: a foot F on the seam and two legs
 * perpendicular to it, one in each plane. The angle between the legs IS the dihedral — what the student
 * draws on a bagrut sheet («S → M on BC, then M ⟂ BC in the base»).
 *
 * The seam, the arms and their orientation are {@link dihedralGeometry}'s — this adds only WHERE on the
 * seam the foot goes, chosen from a MEANINGFUL point instead of the shared edge's midpoint:
 *
 *  1. **Point-run planes** — a vertex of either run NOT on the seam (the "third node"). A vertex whose
 *     foot falls strictly INSIDE the shared edge beats one on its endpoints, which beats one outside it;
 *     among equals the FACE beats the BASE (operator ruling 4 — the apex S of «הפאה SBC» over «הבסיס
 *     ABC»), then the first-named plane, then the foot nearest the default focus, then the letter.
 *  2. **Leg 2** is raised at that SAME foot inside the other plane — its own third vertex generally has
 *     a different foot, so both legs cannot come from vertices. Its length matches leg 1.
 *  3. **A named point lying on a plane** that is not a point run (a named or coordinate plane), off the
 *     seam → its foot, ranked the same way.
 *  4. **Fallback** (no such point — equation planes): the foot {@link dihedralGeometry} already uses
 *     (the seam point nearest the figure centre), `point` null and `legLen` null, so the caller sizes
 *     the legs on SCREEN, like every other annotation of this builder.
 */
export interface DihedralConstruction {
  /** The meeting point on the seam. */
  foot: Vec3;
  /** Unit seam direction. */
  seamDir: Vec3;
  /** Unit leg direction in the plane holding the meaningful point (from the foot toward it). */
  armP: Vec3;
  /** Unit leg direction in the OTHER plane, ⟂ seam, oriented into that plane's material. */
  armQ: Vec3;
  /** Which operand `armP` lies in: 0 = the first, 1 = the second. */
  side: 0 | 1;
  /** The meaningful point, or null in the fallback. */
  point: { id: Id; at: Vec3 } | null;
  /** |P F| in world units, or null in the fallback (the caller picks an on-screen length). */
  legLen: number | null;
  /** The shared edge of two point runs, as its two extreme endpoints along the seam; null otherwise. */
  edge: [Vec3, Vec3] | null;
}

export interface DihedralConstructionCtx {
  at: (id: Id) => Vec3 | null;
  /** Every named point of the figure — rule 3's candidates for a plane that is not a point run. */
  points: Iterable<[Id, Vec3]>;
  center: Vec3;
  /** The solids' BASE rings (a solid's `faces[0]`, and a prism's opposite ring) — ruling 4's tie-break. */
  baseRings: Id[][];
}

export function dihedralConstruction(
  a: Operand3,
  b: Operand3,
  ga: OperandGeom,
  gb: OperandGeom,
  ctx: DihedralConstructionCtx,
): DihedralConstruction | null {
  const anchors = dihedralAnchors(a, b, ctx.at);
  const dh = dihedralGeometry(ga, gb, { ...anchors, center: ctx.center });
  if (!dh) return null;
  const { seamDir, seamAnchor } = dh;
  const tOf = (p: Vec3) => dot3(sub3(p, seamAnchor), seamDir);
  const footOf = (p: Vec3) => add3(seamAnchor, scale3(seamDir, tOf(p)));

  // the scale the tolerances are taken against — a figure spanning 10⁴ units is not "off the seam" by 10⁻⁶
  const scaleRef = Math.max(1, norm3(ctx.center), ...anchors.shared.map((p) => dist3(p, ctx.center)));
  const eps = 1e-6 * scaleRef;

  const runA = a.kind === 'plane-run' ? a.ids : null;
  const runB = b.kind === 'plane-run' ? b.ids : null;
  const sharedIds = runA && runB ? runA.filter((id) => runB.includes(id)) : [];
  const sharedPts = sharedIds.map(ctx.at).filter((p): p is Vec3 => !!p);
  let edge: [Vec3, Vec3] | null = null;
  let tLo = 0;
  let tHi = 0;
  if (sharedPts.length >= 2) {
    const ts = sharedPts.map(tOf);
    tLo = Math.min(...ts);
    tHi = Math.max(...ts);
    if (tHi - tLo > eps) edge = [footOf(sharedPts[ts.indexOf(tLo)]), footOf(sharedPts[ts.indexOf(tHi)])];
  }

  // a run naming three of a quad base's four vertices («המישור ABC» in a cube) IS that base plane
  const isBase = (op: Operand3) => op.kind === 'plane-run' && ctx.baseRings.some((r) => op.ids.every((id) => r.includes(id)));
  const onPlane = (g: OperandGeom, p: Vec3) => {
    const nn = norm3(g.normal!);
    return nn > 0 && Math.abs(dot3(g.normal!, p) + g.d!) / nn <= eps * (1 + norm3(p) / scaleRef);
  };
  const pointList = [...ctx.points];
  const tRef = tOf(dh.foot);

  type Cand = { id: Id; at: Vec3; side: 0 | 1; tier: number; vertex: boolean; base: boolean; t: number };
  const cands: Cand[] = [];
  for (const side of [0, 1] as const) {
    const op = side === 0 ? a : b;
    const g = side === 0 ? ga : gb;
    const list: [Id, Vec3][] =
      op.kind === 'plane-run'
        ? op.ids.filter((id) => !sharedIds.includes(id)).flatMap((id) => {
            const p = ctx.at(id);
            return p ? [[id, p] as [Id, Vec3]] : [];
          })
        : pointList.filter(([, p]) => onPlane(g, p));
    for (const [id, p] of list) {
      const f = footOf(p);
      if (dist3(p, f) <= eps) continue; // ON the seam — it spans no leg
      const t = tOf(p);
      const tier = !edge ? 0 : t > tLo + eps && t < tHi - eps ? 0 : t >= tLo - eps && t <= tHi + eps ? 1 : 2;
      cands.push({ id, at: p, side, tier, vertex: op.kind === 'plane-run', base: isBase(op), t });
    }
  }
  cands.sort(
    (x, y) =>
      x.tier - y.tier ||
      Number(y.vertex) - Number(x.vertex) ||
      Number(x.base) - Number(y.base) ||
      x.side - y.side ||
      Math.abs(x.t - tRef) - Math.abs(y.t - tRef) ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  const best = cands[0];
  if (!best) {
    return { foot: dh.foot, seamDir, armP: dh.u1, armQ: dh.u2, side: 0, point: null, legLen: null, edge };
  }
  const foot = footOf(best.at);
  const legLen = dist3(best.at, foot);
  return {
    foot,
    seamDir,
    armP: normalize3(sub3(best.at, foot)),
    armQ: best.side === 0 ? dh.u2 : dh.u1,
    side: best.side,
    point: { id: best.id, at: best.at },
    legLen,
    edge,
  };
}

/**
 * #1476 — the solids' BASE rings, ruling 4's tie-break: `faces[0]` is every solid's base (the sentinel
 * "the base" resolves to, apply.ts `faceIndices`), and a prism's opposite ring — `faces[1]` when it
 * shares no vertex with the first — is a base too. A pyramid's `faces[1]` is a lateral face and shares
 * an edge with its base, so it never qualifies.
 */
export function solidBaseRings(solids: readonly { faces: Id[][] }[]): Id[][] {
  return solids.flatMap((sd) => {
    const f0 = sd.faces[0];
    const f1 = sd.faces[1];
    return f0 ? [f0, ...(f1 && !f1.some((id) => f0.includes(id)) ? [f1] : [])] : [];
  });
}

/**
 * #1491 (ADR-3D-280) — THE CONSTRUCTION THAT MEASURES A LINE × PLANE ANGLE, the operator's words: "take
 * a point on the line (ideally we have a point given) and draw a height to the plane and connect it with
 * the intersection point". The angle PXH at the crossing X, between the line and its projection XH, IS
 * the angle between the line and the plane.
 *
 *  - **X** — the line's crossing with the plane (the point the object-angle arc is centred on).
 *  - **P** — a NAMED point on the line, off the plane: a segment's own endpoint (S for «SA», C' for
 *    «AC'»), else any figure point lying on the line; the nearest to X wins, then the letter. With none
 *    (a bare equation line), P is `fallbackLen` along the line from X, on the side facing `center`.
 *  - **H** — P's foot on the plane.
 *
 * `null` when the pair is not line × plane, the line is parallel to the plane (no crossing), or
 * perpendicular to it (P, H and X collinear: there is nothing to construct, and the right angle is the
 * knee's — operator ruling 2026-09-27).
 */
export interface LinePlaneConstruction {
  cross: Vec3;
  point: { id: Id | null; at: Vec3 };
  foot: Vec3;
}

export function linePlaneConstruction(
  a: Operand3,
  b: Operand3,
  ga: OperandGeom,
  gb: OperandGeom,
  ctx: { at: (id: Id) => Vec3 | null; points: Iterable<[Id, Vec3]>; center: Vec3; fallbackLen: number },
): LinePlaneConstruction | null {
  const lineSide = ga.dir && ga.point && !ga.normal ? 0 : gb.dir && gb.point && !gb.normal ? 1 : -1;
  if (lineSide < 0) return null;
  const ln = lineSide === 0 ? ga : gb;
  const pl = lineSide === 0 ? gb : ga;
  const lineOp = lineSide === 0 ? a : b;
  if (!pl.normal || pl.d === undefined) return null;
  const nn = norm3(pl.normal);
  if (nn < 1e-12) return null;
  const n = scale3(pl.normal, 1 / nn);
  const d = pl.d / nn;
  const L = normalize3(ln.dir!);
  const denom = dot3(n, L);
  if (Math.abs(denom) < 1e-9) return null; // parallel: no crossing, the angle is 0
  if (norm3(sub3(L, scale3(n, denom))) < 1e-9) return null; // perpendicular: the knee's, nothing to construct
  const cross = add3(ln.point!, scale3(L, -(dot3(n, ln.point!) + d) / denom));
  const heightOf = (p: Vec3) => dot3(n, p) + d;
  const footOf = (p: Vec3) => sub3(p, scale3(n, heightOf(p)));

  const pts = [...ctx.points];
  const scaleRef = Math.max(1, norm3(ctx.center), ...pts.map(([, p]) => dist3(p, ctx.center)));
  const eps = 1e-6 * scaleRef;
  const onLine = (p: Vec3) => norm3(cross3(sub3(p, cross), L)) <= eps;
  const own = lineOp.kind === 'segment' ? [lineOp.a, lineOp.b] : [];
  const cands = [
    ...own.flatMap((id) => {
      const p = ctx.at(id);
      return p ? [{ id, at: p, own: true }] : [];
    }),
    ...pts.filter(([id, p]) => !own.includes(id) && onLine(p)).map(([id, p]) => ({ id, at: p, own: false })),
  ].filter((q) => Math.abs(heightOf(q.at)) > eps);
  cands.sort(
    (x, y) =>
      Number(y.own) - Number(x.own) ||
      dist3(x.at, cross) - dist3(y.at, cross) ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  const best = cands[0];
  if (best) return { cross, point: { id: best.id, at: best.at }, foot: footOf(best.at) };
  const dir = dot3(L, sub3(ctx.center, cross)) < 0 ? scale3(L, -1) : L;
  const at = add3(cross, scale3(dir, ctx.fallbackLen));
  return { cross, point: { id: null, at }, foot: footOf(at) };
}
