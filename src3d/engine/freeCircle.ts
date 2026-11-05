/**
 * #253 (ADR-3D-419) — the FREE-standing given circle: «נתון מעגל שמרכזו O», stated before its plane or its radius is
 * known. Operator ruling 2026-07-27 (A): it builds at once, and everything unstated is a free DOF (ADR-052).
 *
 * The `resolveFreePlane` shape (ADR-3D-124), the circle's edition: whatever the figure PINS is honoured exactly, the
 * rest is SAMPLED per seed, and the returned `dof` comes from the same reading that did the pinning, so the DOF cue can
 * never disagree with what the sampler varies. The orientation constraints are solved by the free plane's own
 * `unitNormalsFor`.
 *
 * The pins are a RULE over the recorded construction:
 *  - a stated RADIUS (`def.radius`) pins the radius;
 *  - a stated length from the centre to a RIDER of the circle IS a radius given (docs/17 §2.2, the semantic predicate):
 *    apply lowers it here through `radiusLengthCircle3`, so it never reaches the pivot as a drive on the free centre;
 *  - a stated PLANE pins the orientation (its normal arrives as `planeNormal`);
 *  - a placed point stated on the circle (`circleMembers3`, M1) pins the radius when nothing above did, and its chord
 *    from the centre lies in the circle's plane — `n ⟂ chord`, the shape of a free plane's member chord. Extra members
 *    are verified downstream by the store (`not-on-circle` on the offending fact, nothing here refuses).
 *
 * Riders (`on-circle3`) are NOT pins: they are defined BY the circle and are placed after it.
 *
 * Unpinned, the circle is seeded HORIZONTAL at seed 0 so the default drawing reads naturally (the ruling) and sampled
 * beyond it. The sampled tilt stays away from edge-on, where a circle would draw as a line segment.
 */
import { sample } from './rng';
import { unitNormalsFor } from './freePlane';
import { dist3, dot3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';
import type { Circle3Def, Construction3, Id } from './types';

export type FreeCircleDef = Extract<Circle3Def, { kind: 'free' }>;

export interface FreeCircleResolution {
  normal: Vec3;
  radius: number;
  /** How many of the circle's 3 DOFs (radius 1 + orientation 2) remained SAMPLED — the cue's number. */
  dof: number;
}

/**
 * Is |ab| the radius of a free circle: one end its centre, the other a rider of it? One meaning whatever the solver
 * is doing, and it is the same question at apply (the given is not a drive) and at resolve (the radius it pins).
 */
export function radiusLengthCircle3(c: Construction3, a: Id, b: Id): string | null {
  for (const [centre, rider] of [[a, b], [b, a]]) {
    const def = c.points.get(rider);
    if (def?.kind !== 'on-circle3') continue;
    const k = c.circles3.find((x) => x.id === def.circle);
    if (k?.def.kind === 'free' && k.def.center === centre) return k.id;
  }
  return null;
}

/** The radius a stated length gives this circle. */
function statedRadiusLength(c: Construction3, circle: string): number | undefined {
  for (const cl of c.claims) if (cl.type === 'length-eq' && radiusLengthCircle3(c, cl.a, cl.b) === circle) return cl.value;
  return undefined;
}

/** The radius this free circle already HOLDS as a statement, in either spelling: a stated radius or a stated length. */
export const heldRadius3 = (c: Construction3, id: string, def: FreeCircleDef): number | undefined => def.radius ?? statedRadiusLength(c, id);

const VERTICAL = v3(0, 0, 1);

export function resolveFreeCircle(
  c: Construction3,
  id: string,
  def: FreeCircleDef,
  center: Vec3,
  seed: number,
  pos: ReadonlyMap<Id, Vec3>,
  /** The stated plane's normal, resolved by the caller; `null` when no plane is stated. */
  planeNormal: Vec3 | null,
): FreeCircleResolution {
  const members = c.circleMembers3
    .filter((m) => m.circle === id)
    .map((m) => pos.get(m.point))
    .filter((p): p is Vec3 => p !== undefined && dist3(p, center) > 1e-9);

  // ---- the radius -----------------------------------------------------------------------
  const pinned = heldRadius3(c, id, def) ?? (members.length > 0 ? dist3(members[0], center) : undefined);
  const radius = pinned ?? sample(seed, `circle-radius-${id}`, 0.5, 1.2); // the revolution solids' free radius range
  const radiusDof = pinned === undefined ? 1 : 0;

  // ---- the orientation ------------------------------------------------------------------
  if (planeNormal) return { normal: normalize3(planeNormal), radius, dof: radiusDof };
  const chords = members.map((p) => ({ u: normalize3(sub3(p, center)), cos: 0 }));
  const { ns, sampled } = unitNormalsFor(chords, seed, `circle-${id}`);
  if (ns.length > 0) {
    if (sampled === 1 && seed === 0) {
      // one chord: the spin is free, and the default drawing is the one closest to horizontal
      const u = chords[0].u;
      const up = sub3(VERTICAL, scale3(u, dot3(VERTICAL, u)));
      if (dist3(up, v3(0, 0, 0)) > 1e-6) return { normal: normalize3(up), radius, dof: radiusDof + 1 };
    }
    return { normal: normalize3(ns[0]), radius, dof: radiusDof + sampled };
  }
  if (seed === 0) return { normal: VERTICAL, radius, dof: radiusDof + 2 };
  const th = sample(seed, `circle-az-${id}`, 0, Math.PI * 2);
  const z = sample(seed, `circle-el-${id}`, 0.5, 1);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return { normal: v3(r * Math.cos(th), r * Math.sin(th), z), radius, dof: radiusDof + 2 };
}
