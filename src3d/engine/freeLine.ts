/**
 * #552 — the FREE-standing named LINE: «ישר k» / bare «l1», declared before anything about it is
 * known. The #487 free-plane module, line edition, and deliberately the same shape:
 *
 *  1. `FREE_LINE_TOKEN` — the CONVENTION name shape (canonical `ℓ`, `ℓ1`, …) that relations may
 *     auto-create, exactly as `FREE_PLANE_TOKEN` bounds what an on-planes membership may conjure.
 *     A non-convention name («ישר k») must be declared first — its kind is stated by the noun.
 *
 *  2. `resolveFreeLine` — the per-seed resolution: whatever the figure PINS is honoured exactly,
 *     everything beyond the pins is SAMPLED (ADR-052 — an unstated direction or position is a free
 *     DOF, never a default). The returned `dof` is derived from the SAME constraint count that did
 *     the pinning, so the DOF cue can never disagree with what the sampler varies.
 *
 *  3. The ROUTING filters (`isFreeLine3`, `figurePlaneLinePerps`, `figureLineRels`) — a relation
 *     entry whose line is FREE pins the LINE, never the figure's gauge or the parameter, so every
 *     figure/parameter consumer of `planeLinePerps` / `lineRels` reads the filtered set. One filter,
 *     shared, for the same reason `paramLinePerps` exists on the plane side (#487): a free object's
 *     placeholder must never enter machinery that would read its numbers as knowledge.
 *
 * The pins, and why each is a pin (each the M1 duality — the same sentence drives a free line or
 * verifies a determined one, decided by what the construction knows):
 *  - «l ⊥ π/BCK» pins the DIRECTION outright (dir ∥ the plane's normal) — 2 DOF.
 *  - «l ∥ π/BCK» constrains the direction into the plane's direction space — 1 of 2 DOF.
 *  - «l ∥ AB / ℓ2 / u» pins the direction outright; «l ⊥ AB / ℓ2 / u» constrains it by one.
 *  - a stated line↔plane or line↔line ANGLE puts the direction on a CONE about the operand's axis —
 *    the #534 lesson applied from birth: ⊥ and ∥ are that cone's endpoints, so the general case is
 *    the rule and the endpoints fall out of it rather than standing beside it as an enumeration.
 *  - a MEMBERSHIP of an EXISTING point («A על l», A already placed) pins the anchor; two such
 *    members pin the direction too (the chord IS the line). On-line RIDERS are defined BY the line
 *    and are not pins — the store's not-on-line pass verifies extras downstream.
 *
 * A constraint kind this resolver does not pin must never surface as the student's error — the
 * store's `line-not-determined` guard (the #508 class guard, line edition) turns that worst case
 * into an honest "pin this line first", never a false accusation.
 */
import { sample } from './rng';
import { add3, centroid3, cross3, dist3, dot3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';
import type { Construction3, Id, Operand3 } from './types';

/** The CONVENTION shape a named line takes after canonicalisation (`ℓ`, `ℓ1`, `ℓ12`) — the only
 *  shape relations may auto-create (typed `l1` arrives here canonical, the #69 discipline). */
export const FREE_LINE_TOKEN = /^ℓ\d*$/;

/** Is this name a declared FREE line? THE routing question — a relation about a free line pins the
 *  line, so the figure/parameter machinery must not consume it. */
export const isFreeLine3 = (c: Construction3, name: string): boolean => c.lines.get(name)?.kind === 'free';

/** The `planeLinePerps` entries that drive the FIGURE (their line is determined — parametric or
 *  derived). Every gauge/pivot consumer reads this, never `c.planeLinePerps` raw. */
export const figurePlaneLinePerps = (c: Construction3): Construction3['planeLinePerps'] =>
  c.planeLinePerps.filter((g) => !isFreeLine3(c, g.line));

/** The `lineRels` entries that drive the FIGURE or the parameter — same routing, S2 family. */
export const figureLineRels = (c: Construction3): Construction3['lineRels'] =>
  c.lineRels.filter((r) => !isFreeLine3(c, r.line));

export interface FreeLineResolution {
  anchor: Vec3;
  dir: Vec3;
  /** How many of the line's 4 DOFs (direction 2 + anchor 2) remained SAMPLED — the cue's number. */
  dof: number;
}

/** An orthonormal basis of the plane orthogonal to `axis` (the freePlane helper, shared shape). */
const orthoBasis = (axis: Vec3): [Vec3, Vec3] => {
  const seedAxis = Math.abs(axis.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const e1 = normalize3(cross3(axis, seedAxis));
  return [e1, cross3(normalize3(axis), e1)];
};

/** Deterministic sign so a pinned direction cannot flap between `d` and `−d` across seeds. */
const orient = (n: Vec3): Vec3 => {
  const lead = Math.abs(n.z) > 1e-9 ? n.z : Math.abs(n.y) > 1e-9 ? n.y : n.x;
  return lead < 0 ? scale3(n, -1) : n;
};

/** The normal of a point-run operand (`BCK`) from current positions; undefined when degenerate. */
const runNormal = (ids: Id[], pos: Map<Id, Vec3>): Vec3 | undefined => {
  const ps = ids.map((id) => pos.get(id)).filter((p): p is Vec3 => p !== undefined);
  if (ps.length < 3) return undefined;
  const nrm = cross3(sub3(ps[1], ps[0]), sub3(ps[2], ps[0]));
  return norm3(nrm) > 1e-9 ? nrm : undefined;
};

/** A point ON the point-run operand's plane (for seating the anchor at a visible crossing). */
const runPoint = (ids: Id[], pos: Map<Id, Vec3>): Vec3 | undefined => {
  const ps = ids.map((id) => pos.get(id)).filter((p): p is Vec3 => p !== undefined);
  return ps.length >= 3 ? centroid3(ps) : undefined;
};

const AXIS_DIR: Record<'x' | 'y' | 'z', Vec3> = { x: v3(1, 0, 0), y: v3(0, 1, 0), z: v3(0, 0, 1) };
const COORD_NORMAL: Record<'xy' | 'yz' | 'xz', Vec3> = { xy: v3(0, 0, 1), yz: v3(1, 0, 0), xz: v3(0, 1, 0) };

/**
 * Resolve one free line for this seed. `planes` carries every plane resolved so far (equation
 * planes and free planes — free PLANES resolve first, so a free line related to one reads its real
 * resolution: when both are free the plane leads and the line follows, deterministically, which is
 * why `resolveFreePlanes3`'s own pin-gathering skips free-line directions). `lineDirs` carries the
 * directions of lines already resolved this pass (insertion order), so «ℓ2 ∥ ℓ1» over two free
 * lines reads the earlier one rather than nothing.
 */
export function resolveFreeLine(
  c: Construction3,
  name: string,
  seed: number,
  pos: Map<Id, Vec3>,
  planes: Map<string, { n: Vec3; d: number }>,
  lineDirs: Map<string, Vec3>,
): FreeLineResolution {
  // ---- gather the pins ------------------------------------------------------------------
  // members: EXISTING points stated on the line (M1). Riders of this very line are defined BY it.
  const members: Vec3[] = [];
  for (const m of c.onLines) {
    if (m.line !== name) continue;
    const def = c.points.get(m.id);
    const p = pos.get(m.id);
    if (p && def && !(def.kind === 'on-line' && def.line === name)) members.push(p);
  }

  // the direction of an operand the line is related to, when it resolves (undefined otherwise)
  const opDir = (op: Operand3): Vec3 | undefined => {
    if (op.kind === 'segment') {
      const a = pos.get(op.a);
      const b = pos.get(op.b);
      return a && b && dist3(a, b) > 1e-9 ? sub3(b, a) : undefined;
    }
    if (op.kind === 'line') return lineDirs.get(op.name);
    if (op.kind === 'vector') {
      const vd = c.vectors.get(op.name);
      const a = vd && pos.get(vd.from);
      const b = vd && pos.get(vd.to);
      return a && b && dist3(a, b) > 1e-9 ? sub3(b, a) : undefined;
    }
    if (op.kind === 'axis') return AXIS_DIR[op.axis];
    return undefined;
  };
  // the normal of a plane-kind operand, when it resolves
  const opNormal = (op: Operand3): Vec3 | undefined => {
    if (op.kind === 'plane-named') return planes.get(op.name)?.n;
    if (op.kind === 'plane-run') return runNormal(op.ids, pos);
    if (op.kind === 'plane-coord') return COORD_NORMAL[op.axes];
    return undefined;
  };

  let parallelTo: Vec3 | null = null; // pins the direction outright
  const dirConstraints: Vec3[] = []; // each: dir ⊥ this vector
  let coneAxis: Vec3 | null = null;
  let coneHalfAngle = 0;
  // seat the anchor ON this plane when the line must cross it (⊥ / a non-zero angle): the relation's
  // visible content is the crossing, and the anchor's 2 DOF stay sampled IN the plane either way.
  let seatPlane: { n: Vec3; p: Vec3 } | null = null;

  const seatPlaneOf = (op: Operand3): { n: Vec3; p: Vec3 } | null => {
    if (op.kind === 'plane-named') {
      const pl = planes.get(op.name);
      return pl ? { n: pl.n, p: scale3(pl.n, -pl.d / Math.max(dot3(pl.n, pl.n), 1e-12)) } : null;
    }
    if (op.kind === 'plane-run') {
      const n = runNormal(op.ids, pos);
      const p = runPoint(op.ids, pos);
      return n && p ? { n, p } : null;
    }
    if (op.kind === 'plane-coord') return { n: COORD_NORMAL[op.axes], p: v3(0, 0, 0) };
    return null;
  };

  // «BCK ⊥ l» — the point-run ⟂ family (#375's record, read with the roles swapped: the LINE is free)
  for (const g of c.planeLinePerps) {
    if (g.line !== name) continue;
    const n = runNormal(g.ids, pos);
    if (n) parallelTo = normalize3(n);
    seatPlane = seatPlane ?? seatPlaneOf({ kind: 'plane-run', ids: g.ids });
  }
  // «l ⊥ π» against a NAMED plane (the V3 linePerps record)
  for (const g of c.linePerps) {
    if (g.line !== name) continue;
    const pl = planes.get(g.plane);
    if (pl && norm3(pl.n) > 1e-9) parallelTo = normalize3(pl.n);
    seatPlane = seatPlane ?? seatPlaneOf({ kind: 'plane-named', name: g.plane });
  }
  // the S2 family — ∥ / ⟂ / angle against ANY operand kind. The angle rows are the #534 cone from
  // birth; ⊥ and ∥ are handled as its exact endpoints where that is what they are.
  for (const r of c.lineRels) {
    if (r.line !== name) continue;
    const n = opNormal(r.op);
    if (n && norm3(n) > 1e-9) {
      const nn = normalize3(n);
      if (r.rel === 'perp') {
        parallelTo = nn;
        seatPlane = seatPlane ?? seatPlaneOf(r.op);
      } else if (r.rel === 'parallel') dirConstraints.push(nn);
      else if (r.rel === 'angle' && r.deg !== undefined) {
        const beta = Math.max(0, Math.min(90, r.deg)); // a line↔plane angle is undirected, ≤ 90°
        if (beta >= 90 - 1e-9) parallelTo = nn;
        else if (beta <= 1e-9) dirConstraints.push(nn);
        else {
          coneAxis = nn;
          coneHalfAngle = ((90 - beta) * Math.PI) / 180;
          seatPlane = seatPlane ?? seatPlaneOf(r.op); // a non-zero angle crosses the plane — the crossing is the visible content
        }
      }
      continue;
    }
    const d = opDir(r.op);
    if (!d || norm3(d) < 1e-9) continue;
    const du = normalize3(d);
    if (r.rel === 'parallel') parallelTo = du;
    else if (r.rel === 'perp') dirConstraints.push(du);
    else if (r.rel === 'angle' && r.deg !== undefined) {
      const beta = Math.max(0, Math.min(90, r.deg));
      if (beta <= 1e-9) parallelTo = du;
      else if (beta >= 90 - 1e-9) dirConstraints.push(du);
      else {
        coneAxis = du;
        coneHalfAngle = (beta * Math.PI) / 180;
      }
    }
  }

  // two members: the chord IS the line — direction and anchor both pinned
  if (members.length >= 2 && dist3(members[0], members[1]) > 1e-9) {
    parallelTo = normalize3(sub3(members[1], members[0]));
  }

  // ---- the direction --------------------------------------------------------------------
  let dir: Vec3;
  let dirSampled: number; // how many of the direction's 2 DOFs stayed free
  if (parallelTo) {
    dir = parallelTo;
    dirSampled = 0;
  } else if (coneAxis) {
    // the half-angle is knowledge, the SPIN is not — sampled, so "show another configuration"
    // walks the whole family of lines satisfying the stated angle (the #534 treatment).
    const [e1, e2] = orthoBasis(coneAxis);
    const phi = sample(seed, `freeline-cone-${name}`, 0, Math.PI * 2);
    dir = add3(
      scale3(coneAxis, Math.cos(coneHalfAngle)),
      scale3(add3(scale3(e1, Math.cos(phi)), scale3(e2, Math.sin(phi))), Math.sin(coneHalfAngle)),
    );
    dirSampled = 1;
  } else {
    // keep only independent ⊥ constraints (drop near-parallel duplicates)
    const indep: Vec3[] = [];
    for (const u of dirConstraints) {
      if (indep.every((w) => norm3(cross3(w, u)) > 1e-6)) indep.push(u);
      if (indep.length === 2) break;
    }
    if (indep.length >= 2) {
      dir = normalize3(cross3(indep[0], indep[1]));
      dirSampled = 0;
    } else if (indep.length === 1) {
      const [e1, e2] = orthoBasis(indep[0]);
      const th = sample(seed, `freeline-spin-${name}`, 0, Math.PI * 2);
      dir = add3(scale3(e1, Math.cos(th)), scale3(e2, Math.sin(th)));
      dirSampled = 1;
    } else {
      // uniform-ish direction: z from a band that avoids the degenerate poles, spin free
      const th = sample(seed, `freeline-az-${name}`, 0, Math.PI * 2);
      const z = sample(seed, `freeline-el-${name}`, -0.85, 0.85);
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      dir = v3(r * Math.cos(th), r * Math.sin(th), z);
      dirSampled = 2;
    }
  }
  dir = orient(normalize3(dir));

  // ---- the anchor -----------------------------------------------------------------------
  let anchor: Vec3;
  let anchorSampled: number; // of the anchor's 2 DOFs (position modulo sliding along the line)
  if (members.length > 0) {
    anchor = members[0];
    anchorSampled = 0;
  } else {
    // seat the sampled anchor near the figure: offset from the centroid, scaled to the spread
    // (an empty figure gets the unit spread — the line is still drawable)
    const placed = [...pos.values()];
    const centre = placed.length ? centroid3(placed) : v3(0, 0, 0);
    let spread = 1.2;
    for (const q of placed) spread = Math.max(spread, dist3(q, centre));
    anchor = add3(
      centre,
      v3(
        sample(seed, `freeline-ax-${name}`, -0.7, 0.7) * spread,
        sample(seed, `freeline-ay-${name}`, -0.7, 0.7) * spread,
        sample(seed, `freeline-az2-${name}`, -0.7, 0.7) * spread,
      ),
    );
    if (seatPlane) {
      // a crossing relation (⊥ / angle): project onto the related plane so the stated meeting is
      // visible on the patch — still exactly 2 sampled DOFs, now measured in-plane.
      const nn = normalize3(seatPlane.n);
      anchor = sub3(anchor, scale3(nn, dot3(sub3(anchor, seatPlane.p), nn)));
    }
    anchorSampled = 2;
  }

  return { anchor, dir, dof: dirSampled + anchorSampled };
}
