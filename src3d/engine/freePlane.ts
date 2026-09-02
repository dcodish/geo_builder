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
 *  - #508: a stated DISTANCE from a known point, which pins the OFFSET (`d = −n·p ± value`, the sign a
 *    sampled branch). Same duality: the given that used to be "refuted" against a sampled offset is
 *    what fixes the offset.
 *
 * Riders (`on-plane` points) are NOT pins — they are defined BY the plane and are placed after it.
 *
 * These are a RULE over the recorded constraints, not the enumeration of kinds that existed when #487
 * landed. A constraint kind this resolver does not yet pin must never reach the claim verifier and be
 * reported as the student's error — the store's `plane-not-determined` guard closes that class, so the
 * worst case of a missing pin is an honest "pin this plane first", never a false accusation.
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
 * #528 (ADR-3D-206) — the unit normals satisfying a set of AFFINE constraints `n̂·û = cos`.
 *
 * Every orientation fact this resolver honours has that one shape: a ⟂ relation and a member chord are
 * it with `cos = 0`, #534's stated line↔plane angle is it with `cos = cos(90° − β)`, and #528's second
 * distance is it with `cos = (σᵢvᵢ − σ₀v₀)/|pᵢ − p₀|`. Solving them together is what turns the pin LIST
 * into a fit, and the answer carries its own DOF count so the cue can never disagree with the sampler
 * (the ADR-3D-124 rule).
 *
 *  - **two or more independent constraints** → the intersection of a line with the unit sphere: 0, 1 or
 *    2 discrete normals. `sampled = 0` — the orientation is determined, up to a branch.
 *  - **exactly one** → a CONE about `û` at that cosine; its SPIN is a genuine free DOF, sampled.
 *  - **none** → no answer here; the caller keeps its own fully-sampled path.
 */
function unitNormalsFor(cons: { u: Vec3; cos: number }[], seed: number, key: string): { ns: Vec3[]; sampled: number } {
  const indep: { u: Vec3; cos: number }[] = [];
  for (const cn of cons) {
    if (indep.every((w) => norm3(cross3(w.u, cn.u)) > 1e-6)) indep.push(cn);
    if (indep.length === 2) break;
  }
  if (indep.length === 0) return { ns: [], sampled: 2 };
  if (indep.length === 1) {
    const [e1, e2] = orthoBasis(indep[0].u);
    const th = sample(seed, `freeplane-spin-${key}`, 0, Math.PI * 2);
    const s = Math.sqrt(Math.max(0, 1 - indep[0].cos * indep[0].cos));
    const n = add3(scale3(indep[0].u, indep[0].cos), scale3(add3(scale3(e1, Math.cos(th)), scale3(e2, Math.sin(th))), s));
    return { ns: [n], sampled: 1 };
  }
  // n = a·u₁ + b·u₂ + t·(u₁×u₂), with (a, b) from the 2×2 Gram system and t from |n| = 1.
  const [c1, c2] = indep;
  const g11 = dot3(c1.u, c1.u), g12 = dot3(c1.u, c2.u), g22 = dot3(c2.u, c2.u);
  const det = g11 * g22 - g12 * g12;
  if (Math.abs(det) < 1e-12) return { ns: [], sampled: 2 };
  const a = (c1.cos * g22 - c2.cos * g12) / det;
  const b = (c2.cos * g11 - c1.cos * g12) / det;
  const p = add3(scale3(c1.u, a), scale3(c2.u, b)); // the point of the line closest to the origin
  const w = cross3(c1.u, c2.u);
  const wl = norm3(w);
  const rem = 1 - dot3(p, p);
  if (wl < 1e-12 || rem < -1e-9) return { ns: [], sampled: 0 }; // the line misses the unit sphere
  const t = Math.sqrt(Math.max(0, rem)) / wl;
  return { ns: t < 1e-9 ? [p] : [add3(p, scale3(w, t)), add3(p, scale3(w, -t))], sampled: 0 };
}

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
  // #534 — a stated line↔plane ANGLE pins the normal onto a CONE about the line's direction. The two
  // cases below are that same relation at its endpoints — «ℓ ⊥ π» is β = 90° (n ∥ û) and «ℓ ∥ π» is
  // β = 0° (n ⊥ û) — so honouring only those two enumerated the ends of a continuum and dropped
  // everything between: «זווית בין ישר ℓ למישור π = 45» left the orientation sampled and was refused,
  // a satisfiable given the engine had every means to honour. With |n̂| = 1, sin β = |n̂·û|, so the
  // angle between n̂ and û is (90° − β): a cone whose SPIN is one genuinely free DOF, sampled.
  let coneAxis: Vec3 | null = null;
  let coneHalfAngle = 0;
  for (const r of c.lineRels) {
    if (r.op.kind !== 'plane-named' || r.op.name !== name) continue;
    const dir = lineDirs.get(r.line);
    if (!dir || norm3(dir) < 1e-9) continue;
    if (r.rel === 'perp') parallelTo = normalize3(dir);
    else if (r.rel === 'parallel') dirConstraints.push(normalize3(dir));
    else if (r.rel === 'angle' && r.deg !== undefined) {
      const beta = Math.max(0, Math.min(90, r.deg)); // a line↔plane angle is undirected, ≤ 90°
      if (beta >= 90 - 1e-9) parallelTo = normalize3(dir); // the ⟂ endpoint, exactly
      else if (beta <= 1e-9) dirConstraints.push(normalize3(dir)); // the ∥ endpoint, exactly
      else {
        coneAxis = normalize3(dir);
        coneHalfAngle = ((90 - beta) * Math.PI) / 180;
      }
    }
  }

  // member chords constrain the normal exactly like a ⟂ relation does
  for (let i = 1; i < members.length; i++) {
    const u = sub3(members[i], members[0]);
    if (norm3(u) > 1e-9) dirConstraints.push(normalize3(u));
  }

  // #508 — a stated DISTANCE from a known POINT to this plane pins the OFFSET exactly. With a unit
  // normal, |n·p + d| = value ⟺ d = −n·p ± value: precisely the one DOF the resolver samples when no
  // member fixes it. Before this, the distance was recorded only as a claim, verified against a plane
  // whose offset nothing had tried to move, and the student was told their perfectly good given was
  // WRONG (`claim-refuted`) — a false accusation, and the missed pin was the reason for it.
  //
  // The pin set is now a RULE over the recorded constraints rather than the list of kinds that existed
  // when #487 landed (docs/17: an enumeration is not a rule). The remaining members of the class are
  // handled by the store's honesty guard rather than silently: a claim about a plane whose relevant DOF
  // is still SAMPLED can never be refuted, because there is nothing yet to refute it against.
  /**
   * #528 (ADR-3D-206) — EVERY stated distance, not just the first.
   *
   * #508 took the first distance and left the rest to be "verified downstream", which for a plane whose
   * normal is still SAMPLED means refused `plane-not-determined`: «המרחק בין A למישור π2 הוא 5» builds
   * and the very next «המרחק בין B למישור π2 הוא 5» is turned away, though it is real information —
   * two equal distances say the plane is parallel to AB or separates A and B symmetrically.
   *
   * With a unit normal, `n·pᵢ + d = σᵢ·vᵢ` for a side branch σᵢ ∈ {−1, +1}. Subtracting the first from
   * the rest ELIMINATES d and leaves one affine constraint on the normal per extra point:
   *
   *     n̂·(pᵢ − p₀)/|pᵢ − p₀| = (σᵢvᵢ − σ₀v₀)/|pᵢ − p₀|
   *
   * — the same shape as every other normal constraint this resolver already honours (a ⟂ relation and a
   * member chord are this with the right-hand side 0; #534's stated line↔plane angle is this with the
   * right-hand side cos(90° − β)). So the pin LIST becomes a FIT, and the offset then follows from the
   * first distance exactly as before.
   */
  const offsetPins: { p: Vec3; value: number }[] = [];
  for (const cl of c.claims) {
    if (cl.type !== 'distance-rel') continue;
    const other =
      cl.a.kind === 'plane-named' && cl.a.name === name ? cl.b : cl.b.kind === 'plane-named' && cl.b.name === name ? cl.a : null;
    if (!other || other.kind !== 'point') continue;
    const p = pos.get(other.id);
    // a RIDER of this plane is at distance 0 by construction — it defines nothing about the offset
    if (!p || c.points.get(other.id)?.kind === 'on-plane') continue;
    offsetPins.push({ p, value: cl.value });
  }

  /**
   * #528 (ADR-3D-206) — the NORMAL as a small fit, once two or more distances are stated.
   *
   * The side pattern σ is a discrete branch set, exactly like #508's single ±: the 2^k patterns are
   * enumerated, the infeasible ones dropped (a demanded cosine outside [−1, 1] is a plane that does not
   * exist), and the seed picks among what survives — ADR-052, a branch the student did not state is
   * sampled and reachable by «show another configuration», never silently chosen. The pattern also
   * fixes the OFFSET, so `n` and `d` come out of the SAME branch and cannot contradict each other.
   *
   * `null` when fewer than two distances name the plane, or when a MEMBER already pins the offset (a
   * member's chords constrain the normal through the existing path, and its `d` would otherwise be read
   * from a different branch than the normal). Every pre-existing figure therefore takes the untouched
   * path below — which is what keeps this widening free of blast radius.
   */
  const fit = ((): { n: Vec3; d: number; sampled: number } | null => {
    if (offsetPins.length < 2 || offsetPins.length > 6 || members.length > 0 || parallelTo) return null;
    const base: { u: Vec3; cos: number }[] = dirConstraints.map((u) => ({ u, cos: 0 }));
    if (coneAxis) base.push({ u: coneAxis, cos: Math.cos(coneHalfAngle) });
    const k = offsetPins.length;
    const out: { n: Vec3; d: number; sampled: number }[] = [];
    for (let mask = 0; mask < 1 << k; mask++) {
      const sgn = (i: number) => ((mask >> i) & 1 ? -1 : 1);
      const cons = [...base];
      let feasible = true;
      for (let i = 1; i < k && feasible; i++) {
        const raw = sub3(offsetPins[i].p, offsetPins[0].p);
        const len = norm3(raw);
        if (len < 1e-9) {
          // two distances to the SAME point: consistent only when they agree, and no orientation news
          feasible = Math.abs(sgn(i) * offsetPins[i].value - sgn(0) * offsetPins[0].value) < 1e-9;
          continue;
        }
        const cos = (sgn(i) * offsetPins[i].value - sgn(0) * offsetPins[0].value) / len;
        if (Math.abs(cos) > 1 + 1e-9) feasible = false; // no unit normal makes this angle
        else cons.push({ u: scale3(raw, 1 / len), cos: Math.max(-1, Math.min(1, cos)) });
      }
      if (!feasible) continue;
      const { ns, sampled } = unitNormalsFor(cons, seed, `${name}-${mask}`);
      for (const n0 of ns) out.push({ n: n0, d: -dot3(n0, offsetPins[0].p) + sgn(0) * offsetPins[0].value, sampled });
    }
    if (out.length === 0) return null; // nothing satisfies the set — leave it to the claim lane to refuse
    return out[Math.min(out.length - 1, Math.floor(sample(seed, `freeplane-fit-${name}`, 0, out.length)))];
  })();

  // ---- the normal -----------------------------------------------------------------------
  let n: Vec3;
  let nSampled: number; // how many of the normal's 2 DOFs stayed free
  if (parallelTo) {
    n = parallelTo;
    nSampled = 0;
  } else if (fit) {
    // #528: the orientation the stated distances (with everything else the figure says) determine.
    n = fit.n;
    nSampled = fit.sampled;
  } else if (coneAxis) {
    // #534: the normal rides a cone about the line — the half-angle is knowledge, the SPIN is not, so
    // the spin is sampled and "show another configuration" walks the whole family of planes that
    // satisfy the stated angle. Exactly the treatment the 1-constraint branch below gives its spin.
    const [e1, e2] = orthoBasis(coneAxis);
    const phi = sample(seed, `freeplane-cone-${name}`, 0, Math.PI * 2);
    n = add3(
      scale3(coneAxis, Math.cos(coneHalfAngle)),
      scale3(add3(scale3(e1, Math.cos(phi)), scale3(e2, Math.sin(phi))), Math.sin(coneHalfAngle)),
    );
    nSampled = 1;
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
  } else if (fit) {
    d = fit.d; // the SAME branch that chose the normal — n and d can never disagree about the side
    dSampled = 0;
  } else if (offsetPins.length > 0) {
    // WHICH SIDE of the point the plane sits on is a genuine free choice the student did not state, so
    // it is a sampled BRANCH (ADR-052) — "show another configuration" flips it — not a silent default.
    const side = sample(seed, `freeplane-side-${name}`, -1, 1) < 0 ? -1 : 1;
    d = -dot3(n, offsetPins[0].p) + side * offsetPins[0].value;
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
