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
 * #2611 stage B (ADR-3D-420): a circle with NO centre letter (the one «המעגל» creates) has a free centre too. It is placed
 * by {@link placeUnnamedCentre3} from the same pins, so the placed points stated on it are all on it, and the rest of
 * this resolution reads that centre as any other.
 *
 * Riders (`on-circle3`) are NOT pins: they are defined BY the circle and are placed after it.
 *
 * Unpinned, the circle is seeded HORIZONTAL at seed 0 so the default drawing reads naturally (the ruling) and sampled
 * beyond it. The sampled tilt stays away from edge-on, where a circle would draw as a line segment.
 */
import { sample } from './rng';
import { unitNormalsFor } from './freePlane';
import { add3, cross3, dist3, dot3, norm3, normalize3, ringCircumcentre3, scale3, sub3, v3, type Vec3 } from './vec3';
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

/** The placed points stated on this circle. */
const memberPositions3 = (c: Construction3, id: string, pos: ReadonlyMap<Id, Vec3>): Vec3[] =>
  c.circleMembers3
    .filter((m) => m.circle === id)
    .map((m) => pos.get(m.point))
    .filter((p): p is Vec3 => p !== undefined);

/**
 * #2611 stage B ([ADR-3D-420](../../docs/06b-decisions-3d.md#adr-3d-420)) — THE CENTRE OF A CIRCLE WITH NO CENTRE LETTER. A
 * free DOF (ADR-052), sampled per seed, a function of the seed and the circle's pins only: the point pass and the final
 * circle pass read it at different moments of `pos`, and a rider must lie on the circle both of them see.
 *  - no placed point on it: anywhere (in the stated plane, when one is);
 *  - one: a sampled reach from it, or the stated radius;
 *  - two: on their perpendicular bisector, a sampled height off the chord (the stated radius decides the height);
 *  - three or more: their circumcentre, whose plane is the circle's. A fourth off it stays the store's `not-on-circle`.
 * `dof` counts what stayed sampled HERE; the radius and orientation are {@link resolveFreeCircle}'s to count.
 */
export function placeUnnamedCentre3(
  c: Construction3,
  id: string,
  def: FreeCircleDef,
  seed: number,
  pos: ReadonlyMap<Id, Vec3>,
  /** The stated plane, resolved by the caller (`n·x = d`); `null` when no plane is stated. */
  plane: { n: Vec3; d: number } | null,
): { center: Vec3; normal: Vec3 | null; dof: number } {
  const unit = plane ? normalize3(plane.n) : null;
  const flat = (p: Vec3): Vec3 => (plane && unit ? sub3(p, scale3(unit, dot3(p, unit) - plane.d / norm3(plane.n))) : p);
  const comp = (ax: string): number => (sample(seed, `circle-ctrsgn-${ax}-${id}`, -1, 1) >= 0 ? 1 : -1) * sample(seed, `circle-ctr-${ax}-${id}`, 0.3, 1.05) * 1.2;
  const base = flat(v3(comp('x'), comp('y'), comp('z')));
  const all = memberPositions3(c, id, pos);
  const members = all.filter((p, i) => all.slice(0, i).every((q) => dist3(p, q) > 1e-9));
  const held = heldRadius3(c, id, def);
  if (members.length === 0) return { center: base, normal: null, dof: plane ? 2 : 3 };
  /** A unit direction off `from`, in the stated plane and ⟂ `axis`, toward the sampled base; any such one if that degenerates. */
  const toward = (from: Vec3, axis?: Vec3): Vec3 => {
    const reject = (w: Vec3, u: Vec3 | null | undefined): Vec3 => (u ? sub3(w, scale3(u, dot3(w, u))) : w);
    for (const w of [sub3(base, from), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)]) {
      const d = reject(reject(w, unit), axis);
      if (norm3(d) > 1e-6) return normalize3(d);
    }
    return v3(1, 0, 0);
  };
  if (members.length === 1) {
    const reach = held ?? sample(seed, `circle-reach-${id}`, 0.5, 1.2);
    return { center: add3(members[0], scale3(toward(members[0]), reach)), normal: null, dof: (plane ? 1 : 2) + (held === undefined ? 1 : 0) };
  }
  if (members.length === 2) {
    const [a, b] = members;
    const mid = scale3(add3(a, b), 0.5);
    const half = dist3(a, b) / 2;
    const height = held === undefined ? sample(seed, `circle-height-${id}`, 0.4, 1.2) * half : Math.sqrt(Math.max(0, held * held - half * half));
    return { center: add3(mid, scale3(toward(mid, normalize3(sub3(b, a))), height)), normal: null, dof: (plane ? 0 : 1) + (held === undefined ? 1 : 0) };
  }
  for (let k = 2; k < members.length; k++) {
    const trio = [members[0], members[1], members[k]];
    const n = cross3(sub3(trio[1], trio[0]), sub3(trio[2], trio[0]));
    const cc = norm3(n) > 1e-9 ? ringCircumcentre3(trio) : null;
    if (cc) return { center: cc, normal: normalize3(n), dof: 0 };
  }
  return { center: base, normal: null, dof: 0 }; // collinear: no circle holds them, and the store's check says so
}

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
  const members = memberPositions3(c, id, pos).filter((p) => dist3(p, center) > 1e-9);

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
