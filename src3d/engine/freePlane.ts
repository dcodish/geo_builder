/**
 * #487 (ADR-3D-124) — the FREE-standing named plane: «מישור π2», declared before anything about it is
 * known. This module owns the two things such a plane needs:
 *
 *  1. `freePlaneDef` — the placeholder `PlaneDef` that puts the plane into `Construction3.planes`, so
 *     every existence check, operand resolver and renderer sees it WITHOUT enumeration edits. The
 *     placeholder's coefficients are never knowledge (`free: true` is the gate consumers must respect).
 *
 *  2. `resolveFreePlane` — the per-seed resolution: whatever the figure PINS is honoured exactly, and
 *     everything beyond the pins is SAMPLED (ADR-052 — an unstated orientation is a free DOF, never a
 *     default). The returned `dof` is derived from the SAME constraint count that did the pinning, so
 *     the DOF cue can never disagree with what the sampler actually varies (the ADR-052 conformance
 *     smell, closed by construction).
 *
 * The pinning inputs, and why each is a pin:
 *  - a MEMBERSHIP of an existing point (M1: a statement about an existing object is a given) — every
 *    member must lie on the plane, so a member pins the offset and every member-chord constrains the
 *    normal. Three non-collinear members determine the plane; extras are verified downstream by the
 *    store's `memberHolds3` pass (`not-on-plane` on the offending fact — nothing here needs to refuse).
 *  - a stated ∥/⟂ RELATION whose other operand resolves (a point-run plane, an equation plane, an
 *    earlier free plane). The relation lands in the claims list (the S3 disposition map is claim-gated
 *    for plane×plane) — resolving the free plane TO the stated relation is what makes the claim verify
 *    green: the M1 duality, where the same sentence drives a free object and verifies a determined one.
 *
 * Riders (`on-plane` points) are NOT pins — they are defined BY the plane and are placed after it.
 */
import { sample } from './rng';
import { add3, centroid3, cross3, dist3, dot3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';
import type { Construction3, Id, PlaneDef } from './types';

/** The token shape a NAMED plane takes (`π`, `π1`, `π12`) — the only shape on-planes may auto-create. */
export const FREE_PLANE_TOKEN = /^π\d*$/;

/** The placeholder entry (`z = 0`); its numbers are never read as knowledge — `free` gates that. */
export const freePlaneDef = (name: string): PlaneDef => ({
  cx: { k: 0, p: 0 },
  cy: { k: 0, p: 0 },
  cz: { k: 1, p: 0 },
  d: { k: 0, p: 0 },
  src: name,
  free: true,
});

export interface FreePlaneResolution {
  n: Vec3;
  d: number;
  /** How many of the plane's 3 DOFs (normal 2 + offset 1) remained SAMPLED — the cue's number. */
  dof: number;
}

/** An orthonormal basis of the plane orthogonal to `axis`. */
const orthoBasis = (axis: Vec3): [Vec3, Vec3] => {
  const seedAxis = Math.abs(axis.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const e1 = normalize3(cross3(axis, seedAxis));
  return [e1, cross3(normalize3(axis), e1)];
};

/** Deterministic sign: the first non-negligible component is made positive, so a pinned normal cannot
 *  flap between `n` and `−n` across seeds (which would read as motion where there is none). */
const orient = (n: Vec3): Vec3 => {
  const lead = Math.abs(n.z) > 1e-9 ? n.z : Math.abs(n.y) > 1e-9 ? n.y : n.x;
  return lead < 0 ? scale3(n, -1) : n;
};

/**
 * Resolve one free plane for this seed. `resolvedNormals` carries the normals of planes already
 * resolved this pass (equation planes and EARLIER free planes, insertion order), so a relation between
 * two free planes reads the earlier one rather than a placeholder.
 */
export function resolveFreePlane(
  c: Construction3,
  name: string,
  seed: number,
  pos: Map<Id, Vec3>,
  resolvedNormals: Map<string, Vec3>,
  lineDirs: Map<string, Vec3>,
): FreePlaneResolution {
  // ---- gather the pins ------------------------------------------------------------------
  // members: existing points STATED on the plane (side statements are inequalities, not pins)
  const members: Vec3[] = [];
  for (const m of c.memberships) {
    if (m.plane !== name || m.side) continue;
    const p = pos.get(m.id);
    const def = c.points.get(m.id);
    if (p && def && !(def.kind === 'on-plane' && def.plane === name)) members.push(p);
  }

  // relations: ∥ fixes the normal outright; ⟂ contributes one direction-constraint
  let parallelTo: Vec3 | null = null;
  const dirConstraints: Vec3[] = [];
  for (const cl of c.claims) {
    if (cl.type !== 'plane-rel') continue;
    if (cl.rel !== 'parallel' && cl.rel !== 'perp') continue;
    const other =
      cl.a.kind === 'plane-named' && cl.a.name === name ? cl.b : cl.b.kind === 'plane-named' && cl.b.name === name ? cl.a : null;
    if (!other) continue;
    const otherN =
      other.kind === 'plane-named'
        ? resolvedNormals.get(other.name)
        : other.kind === 'plane-run'
          ? runNormal(other.ids, pos)
          : undefined;
    if (!otherN || norm3(otherN) < 1e-9) continue;
    if (cl.rel === 'parallel') parallelTo = normalize3(otherN);
    else dirConstraints.push(normalize3(otherN));
  }

  // «ℓ ⊥ π» pins the normal outright (n ∥ dir); «ℓ ∥ π» constrains it (n ⊥ dir). These arrive as
  // `linePerps` entries and S2 `lineRels` — both EXCLUDED from the parameter machinery for a free
  // plane (`paramLinePerps`), because here they pin the PLANE, not the parameter. The recorded claim
  // then verifies green against the pinned resolution: the M1 duality again.
  for (const g of c.linePerps) {
    if (g.plane !== name) continue;
    const dir = lineDirs.get(g.line);
    if (dir && norm3(dir) > 1e-9) parallelTo = normalize3(dir);
  }
  for (const r of c.lineRels) {
    if (r.op.kind !== 'plane-named' || r.op.name !== name) continue;
    const dir = lineDirs.get(r.line);
    if (!dir || norm3(dir) < 1e-9) continue;
    if (r.rel === 'perp') parallelTo = normalize3(dir);
    else if (r.rel === 'parallel') dirConstraints.push(normalize3(dir));
  }

  // member chords constrain the normal exactly like a ⟂ relation does
  for (let i = 1; i < members.length; i++) {
    const u = sub3(members[i], members[0]);
    if (norm3(u) > 1e-9) dirConstraints.push(normalize3(u));
  }

  // ---- the normal -----------------------------------------------------------------------
  let n: Vec3;
  let nSampled: number; // how many of the normal's 2 DOFs stayed free
  if (parallelTo) {
    n = parallelTo;
    nSampled = 0;
  } else {
    // keep only independent constraints (drop near-parallel duplicates)
    const indep: Vec3[] = [];
    for (const u of dirConstraints) {
      if (indep.every((w) => norm3(cross3(w, u)) > 1e-6)) indep.push(u);
      if (indep.length === 2) break;
    }
    if (indep.length >= 2) {
      n = normalize3(cross3(indep[0], indep[1]));
      nSampled = 0;
    } else if (indep.length === 1) {
      const [e1, e2] = orthoBasis(indep[0]);
      const th = sample(seed, `freeplane-spin-${name}`, 0, Math.PI * 2);
      n = add3(scale3(e1, Math.cos(th)), scale3(e2, Math.sin(th)));
      nSampled = 1;
    } else {
      // uniform-ish direction: z from a band that avoids the degenerate poles, spin free
      const th = sample(seed, `freeplane-az-${name}`, 0, Math.PI * 2);
      const z = sample(seed, `freeplane-el-${name}`, -0.85, 0.85);
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      n = v3(r * Math.cos(th), r * Math.sin(th), z);
      nSampled = 2;
    }
  }
  n = orient(normalize3(n));

  // ---- the offset -----------------------------------------------------------------------
  let d: number;
  let dSampled: number;
  if (members.length > 0) {
    d = -dot3(n, members[0]);
    dSampled = 0;
  } else {
    // seat the sampled plane near the figure: through a point offset from the centroid, scaled to
    // the figure's spread (an empty figure gets the unit spread — the patch is still drawable)
    const placed = [...pos.values()];
    const centre = placed.length ? centroid3(placed) : v3(0, 0, 0);
    let spread = 1.2;
    for (const q of placed) spread = Math.max(spread, dist3(q, centre));
    d = -dot3(n, centre) + sample(seed, `freeplane-off-${name}`, -0.7, 0.7) * spread;
    dSampled = 1;
  }

  return { n, d, dof: nSampled + dSampled };
}

/** The normal of a point-run operand (`plane ABC`) from current positions; null when degenerate. */
function runNormal(ids: Id[], pos: Map<Id, Vec3>): Vec3 | undefined {
  const ps = ids.map((id) => pos.get(id)).filter((p): p is Vec3 => p !== undefined);
  if (ps.length < 3) return undefined;
  const nrm = cross3(sub3(ps[1], ps[0]), sub3(ps[2], ps[0]));
  return norm3(nrm) > 1e-9 ? nrm : undefined;
}
