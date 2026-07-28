/**
 * The RIGHT-ANGLE WITNESS collector (#307, ADR-3D-093).
 *
 * A knee is drawn for every perpendicularity the figure ASSERTS — whether the student
 * stated it (`AB ⊥ AD`, `u ⊥ v`, `∠ABC = 90`, `CA' ⊥ plane BC'D`) or the construction
 * produced it (any foot of a perpendicular).
 *
 * Before #307 the knee was triggered by a two-item whitelist of point KINDS
 * (`foot-plane`, `foot-line`), so every stated ⊥ drew nothing at all — the student had
 * no way to see from the figure that the tool had understood them (docs/17 §6: everything
 * the student stated must be visible) — and even CONSTRUCTED right angles went unmarked
 * when they arrived as a kind nobody had added to the list (`foot-face`, `foot-seg`).
 * That is the 2-D [ADR-167](../../docs/06-decisions.md) shape — a hand-maintained list of
 * node kinds standing in for a geometric fact — and it is replaced here the same way: by
 * enumerating the assertions and deriving the mark from the geometry.
 *
 * **The R³ honesty rule.** Two lines can be perpendicular WITHOUT meeting: `SM ⊥ DB` on
 * skew segments has a well-defined 90° between direction vectors and no intersection.
 * A knee there would draw a crossing that does not exist, so a witness only yields a mark
 * where the two arms genuinely share a point — a shared endpoint, or a true crossing
 * inside both segments (a rhombus's diagonals). A skew ⊥ is left unmarked; the relation
 * still shows in the data panel.
 *
 * Pure: reads the construction + resolved positions, returns world-space geometry. The
 * renderer projects it, which is what makes the knee three-dimensional — it lies in the
 * plane of the two arms and foreshortens with the orbit rather than being a screen-space square.
 */

import type { Resolved3, ResolvedPlane } from '../engine/evaluate';
import type { Construction3, Id, Positions3, VecAtom } from '../engine/types';
import { add3, cross3, dist3, dot3, newellNormal, norm3, normalize3, scale3, sub3, type Vec3 } from '../engine/vec3';
import { planeBasis, projectOntoPlane } from './planeGeom';

/** A right angle to mark: its vertex and the two unit arm directions, in WORLD space. */
export interface RightAngle3 {
  vertex: Vec3;
  u1: Vec3;
  u2: Vec3;
  /**
   * For a ⟂-to-PLANE right angle the second arm is genuinely arbitrary — every direction lying in the
   * plane witnesses the same assertion — so the renderer may rotate it within the plane to whichever
   * reads best from the current camera. `planeN` is that plane's normal; absent for a wedge whose both
   * arms are real objects (a segment pair), where the arms must not be touched.
   */
  planeN?: Vec3;
}

/** A perpendicularity between two SEGMENTS, named by their endpoint ids. */
interface SegPair {
  a: Id;
  b: Id;
  c: Id;
  d: Id;
}

/** A perpendicularity between a segment and a PLANE (given as a point run or a resolved plane). */
interface SegPlane {
  a: Id;
  b: Id;
  plane: ResolvedPlane;
}

const EPS = 1e-9;

/** A VecAtom as the point pair it spans, or null (a named vector resolves through its declaration). */
function atomPair(atom: VecAtom, c: Construction3): [Id, Id] | null {
  if (atom.kind === 'pair') return [atom.from, atom.to];
  const def = c.vectors.get(atom.name);
  return def ? [def.from, def.to] : null;
}

/** The plane a point run spans, or null when the run is degenerate. */
function planeFromIds(ids: Id[], pos: Positions3): ResolvedPlane | null {
  const pts = ids.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p);
  if (pts.length < 3) return null;
  const n = newellNormal(pts);
  if (norm3(n) < 1e-9) return null;
  const nn = normalize3(n);
  return { n: nn, d: -dot3(nn, pts[0]) };
}

/**
 * Where two segments genuinely share a point — a shared endpoint, or a true crossing
 * strictly inside both. Null for skew, parallel, or a crossing off the drawn segments:
 * marking those would assert an intersection the figure does not have.
 */
function meetingPoint(seg: SegPair, pos: Positions3, scale: number): Vec3 | null {
  const shared = [seg.a, seg.b].filter((id) => id === seg.c || id === seg.d);
  if (shared.length === 1) return pos.get(shared[0]) ?? null;
  if (shared.length > 1) return null; // the same segment twice — no angle to mark

  const p1 = pos.get(seg.a);
  const p2 = pos.get(seg.b);
  const q1 = pos.get(seg.c);
  const q2 = pos.get(seg.d);
  if (!p1 || !p2 || !q1 || !q2) return null;

  const d1 = sub3(p2, p1);
  const d2 = sub3(q2, q1);
  const r = sub3(p1, q1);
  const a = dot3(d1, d1);
  const b = dot3(d1, d2);
  const cc = dot3(d2, d2);
  const dd = dot3(d1, r);
  const e = dot3(d2, r);
  const den = a * cc - b * b;
  if (Math.abs(den) < EPS || a < EPS || cc < EPS) return null; // parallel or degenerate
  const s = (b * e - cc * dd) / den;
  const t = (a * e - b * dd) / den;
  const c1 = add3(p1, scale3(d1, s));
  const c2 = add3(q1, scale3(d2, t));
  if (dist3(c1, c2) > scale * 1e-6) return null; // SKEW — perpendicular but never meeting
  const inside = (u: number) => u > 1e-6 && u < 1 - 1e-6;
  if (!inside(s) || !inside(t)) return null; // they cross only off the drawn segments
  return c1;
}

/** The arm direction of segment a–b seen from `vertex`: toward the farther endpoint. */
function armDir(a: Id, b: Id, vertex: Vec3, pos: Positions3): Vec3 | null {
  const pa = pos.get(a);
  const pb = pos.get(b);
  if (!pa || !pb) return null;
  const far = dist3(vertex, pa) >= dist3(vertex, pb) ? pa : pb;
  const dir = sub3(far, vertex);
  return norm3(dir) > 1e-9 ? normalize3(dir) : null;
}

/** Where segment a–b meets the plane: an endpoint already on it, else the crossing inside the segment. */
function segMeetsPlane(a: Id, b: Id, pl: ResolvedPlane, pos: Positions3, scale: number): Vec3 | null {
  const pa = pos.get(a);
  const pb = pos.get(b);
  if (!pa || !pb) return null;
  const fa = dot3(pl.n, pa) + pl.d;
  const fb = dot3(pl.n, pb) + pl.d;
  const tol = scale * 1e-6;
  if (Math.abs(fa) <= tol) return pa;
  if (Math.abs(fb) <= tol) return pb;
  const den = fa - fb;
  if (Math.abs(den) < EPS) return null; // parallel to the plane (can't happen for a true ⊥, but be safe)
  const t = fa / den;
  if (t <= 1e-6 || t >= 1 - 1e-6) return null; // the segment stops short of the plane
  return add3(pa, scale3(sub3(pb, pa), t));
}

/** A rounded wedge key so the same corner asserted twice (stated AND constructed) is marked once. */
function wedgeKey(m: RightAngle3, scale: number): string {
  const q = (v: number) => Math.round(v / (scale * 1e-4));
  const dir = (u: Vec3) => `${q(u.x * scale)},${q(u.y * scale)},${q(u.z * scale)}`;
  const arms = [dir(m.u1), dir(m.u2)].sort().join('/');
  return `${q(m.vertex.x)},${q(m.vertex.y)},${q(m.vertex.z)}|${arms}`;
}

/**
 * Every right angle the figure asserts, deduped, as world-space wedges.
 * `scale` is the figure's radius — tolerances are relative to it so the result is
 * independent of how large the drawing happens to be.
 */
export function rightAngles3(c: Construction3, resolved: Resolved3, scale: number): RightAngle3[] {
  const pos = resolved.positions;
  const s = Math.max(scale, 1e-6);
  const segPairs: SegPair[] = [];
  const segPlanes: SegPlane[] = [];
  const out: RightAngle3[] = [];

  const addAtoms = (u: VecAtom, v: VecAtom) => {
    const p = atomPair(u, c);
    const q = atomPair(v, c);
    if (p && q) segPairs.push({ a: p[0], b: p[1], c: q[0], d: q[1] });
  };
  const addPlaneRun = (a: Id, b: Id, ids: Id[]) => {
    const pl = planeFromIds(ids, pos);
    if (pl) segPlanes.push({ a, b, plane: pl });
  };
  const isRight = (deg: number) => Math.abs(deg - 90) < 1e-6;
  const isPerpCos = (cos: number) => Math.abs(cos) < 1e-9;

  // --- (1) STATED perpendicularity, wherever the assertion was recorded --------------
  for (const sp of c.scalarPins) {
    if (sp.kind === 'cos-angle' && isPerpCos(sp.cos)) addAtoms(sp.u, sp.v);
    else if (sp.kind === 'vangle' && isRight(sp.deg)) segPairs.push({ a: sp.vertex, b: sp.p, c: sp.vertex, d: sp.q });
    else if (sp.kind === 'seg-perp-plane') addPlaneRun(sp.a, sp.b, sp.plane);
  }
  for (const cl of [...c.claims, ...c.paramGivens]) {
    if (cl.type === 'cos-angle-eq' && isPerpCos(cl.cos)) addAtoms(cl.u, cl.v);
    else if (cl.type === 'angle-seg-eq' && isRight(cl.deg)) segPairs.push({ a: cl.a1, b: cl.b1, c: cl.a2, d: cl.b2 });
    else if (cl.type === 'perp-plane') addPlaneRun(cl.seg[0], cl.seg[1], cl.plane);
  }
  for (const sp of c.symbolPins) {
    if (sp.rel === 'seg-perp') segPairs.push({ a: sp.a, b: sp.b, c: sp.c, d: sp.d });
    else if (sp.rel === 'perp') addPlaneRun(sp.a, sp.b, sp.plane);
  }
  // A NAMED LINE stated ⟂ a NAMED PLANE (`הישר ℓ ניצב למישור π`) asserts a right angle exactly like
  // the segment forms above — it was simply a record kind this sweep never read, so the one given
  // whose whole content IS a right angle drew no knee. Its arms come from the resolved geometry
  // rather than point ids: the line's direction, and an in-plane direction at the crossing.
  for (const lp of c.linePerps) {
    const ln = resolved.lines.get(lp.line);
    const pl = resolved.planes.get(lp.plane);
    if (!ln || !pl) continue;
    const denom = dot3(pl.n, ln.dir);
    if (Math.abs(denom) < EPS) continue; // parallel — no crossing to mark
    const t = -(dot3(pl.n, ln.anchor) + pl.d) / denom;
    const vertex = add3(ln.anchor, scale3(ln.dir, t));
    const u1 = normalize3(ln.dir);
    const u2 = inPlaneDir(pl, vertex, pos);
    if (u2) out.push({ vertex, u1, u2, planeN: pl.n });
  }
  // S2 (#378, ADR-3D-103): a STATED ⟂ (or 90°) between a segment/vector operand and a NAMED LINE —
  // the knee sits where the segment genuinely meets the line (an endpoint on it, or a crossing
  // inside the drawn segment); a ⟂ that never meets stays unmarked (the R³ honesty rule above)
  // and is still reported in the data panel.
  for (const r of c.lineRels) {
    const perp = r.rel === 'perp' || (r.rel === 'angle' && isRight(r.deg ?? NaN));
    if (!perp) continue;
    const pair =
      r.op.kind === 'segment' ? ([r.op.a, r.op.b] as [Id, Id])
      : r.op.kind === 'vector' ? atomPair({ kind: 'named', name: r.op.name }, c)
      : null;
    const ln = resolved.lines.get(r.line);
    if (!pair || !ln) continue;
    const pa = pos.get(pair[0]);
    const pb = pos.get(pair[1]);
    if (!pa || !pb) continue;
    const d1 = sub3(pb, pa);
    const d2 = ln.dir;
    const rr = sub3(pa, ln.anchor);
    const a = dot3(d1, d1);
    const b = dot3(d1, d2);
    const cc = dot3(d2, d2);
    const dd = dot3(d1, rr);
    const e = dot3(d2, rr);
    const den = a * cc - b * b;
    if (Math.abs(den) < EPS || a < EPS || cc < EPS) continue; // parallel or degenerate
    const t1 = (b * e - cc * dd) / den; // along the segment
    const t2 = (a * e - b * dd) / den; // along the (unbounded) line
    const c1 = add3(pa, scale3(d1, t1));
    const c2 = add3(ln.anchor, scale3(d2, t2));
    if (dist3(c1, c2) > s * 1e-6) continue; // skew — perpendicular but never meeting
    if (t1 < -1e-6 || t1 > 1 + 1e-6) continue; // the crossing is off the drawn segment
    const u1 = armDir(pair[0], pair[1], c1, pos);
    const u2 = normalize3(ln.dir);
    if (u1 && norm3(cross3(u1, u2)) > 1e-6) out.push({ vertex: c1, u1, u2 });
  }

  // --- (2) CONSTRUCTED perpendicularity: EVERY foot kind, not a whitelist of two -----
  for (const [id, def] of c.points) {
    if (def.kind !== 'foot-plane' && def.kind !== 'foot-line' && def.kind !== 'foot-face' && def.kind !== 'foot-seg') continue;
    const foot = pos.get(id);
    const from = pos.get(def.from);
    if (!foot || !from || dist3(foot, from) < 1e-9) continue;
    const u1 = normalize3(sub3(from, foot));
    let u2: Vec3 | null = null;
    if (def.kind === 'foot-line') {
      const ln = resolved.lines.get(def.line);
      if (ln) u2 = normalize3(ln.dir);
    } else if (def.kind === 'foot-seg') {
      u2 = armDir(def.a, def.b, foot, pos);
    } else {
      const pl = def.kind === 'foot-plane' ? resolved.planes.get(def.plane) ?? null : planeFromIds(def.face, pos);
      if (pl) u2 = inPlaneDir(pl, foot, pos);
    }
    if (u2) out.push({ vertex: foot, u1, u2 });
  }

  // --- (3) turn the stated witnesses into wedges, dropping the ones with no meeting point
  for (const seg of segPairs) {
    const vertex = meetingPoint(seg, pos, s);
    if (!vertex) continue; // SKEW / non-meeting — never invent an intersection
    const u1 = armDir(seg.a, seg.b, vertex, pos);
    const u2 = armDir(seg.c, seg.d, vertex, pos);
    if (u1 && u2 && norm3(cross3(u1, u2)) > 1e-6) out.push({ vertex, u1, u2 });
  }
  for (const sp of segPlanes) {
    const vertex = segMeetsPlane(sp.a, sp.b, sp.plane, pos, s);
    if (!vertex) continue;
    const u1 = armDir(sp.a, sp.b, vertex, pos);
    const u2 = inPlaneDir(sp.plane, vertex, pos);
    if (u1 && u2) out.push({ vertex, u1, u2, planeN: sp.plane.n });
  }

  const seen = new Set<string>();
  return out.filter((m) => {
    const k = wedgeKey(m, s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** An in-plane direction to lay the knee's second leg along: toward the figure's bulk. */
function inPlaneDir(pl: ResolvedPlane, vertex: Vec3, pos: Positions3): Vec3 | null {
  const pts = [...pos.values()];
  if (pts.length) {
    const mid = pts.reduce((acc, p) => add3(acc, p), { x: 0, y: 0, z: 0 });
    const centre = scale3(mid, 1 / pts.length);
    const q = sub3(projectOntoPlane(centre, pl), vertex);
    if (norm3(q) > 1e-6) return normalize3(q);
  }
  return planeBasis(pl.n).e1;
}

/** The stated angles a KNEE already covers — so the arc+"90°" layer does not double-mark them. */
export function isRightAngleValue(deg: number): boolean {
  return Math.abs(deg - 90) < 1e-6;
}
