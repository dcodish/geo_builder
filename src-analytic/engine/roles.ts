/**
 * WHICH VERTEX CARRIES A TRIANGLE'S ROLE, AND THE OBJECTS THAT FOLLOW IT (#2018, ADR-AG-298 — 2-D's `roleSides.ts`,
 * ADR-596).
 *
 * An isosceles triangle's base and legs are named by its APEX: the vertex whose two sides are stated equal. The noun
 * alone leaves the apex an open `choice` (one option per vertex, cycled by «הציגו תצורה אחרת»); a stated «AB = AC»
 * settles it. This module is the ONE reading of that, over a list of constraints:
 *
 * - over a construction's raw constraints it answers the apex the student STATED (an equal pair outside any choice);
 * - over a configuration's RESOLVED constraints (`resolveChoices`) it answers the apex THAT configuration draws.
 *
 * `applyRoleSide` (M1) asks the first question to tell a settled role from an open one, and `resolvedAt` (the one
 * configuration seam, ADR-AG-245) asks the second to re-letter every object a role-named cevian minted, so the median
 * «תיכון לבסיס» drew always runs to the side opposite the apex the canvas shows.
 */
import { shapeRow } from './shapes';
import { sameConstraint, type Constraint } from './solve';
import type { GeoObject, Id, RoleBinding } from './types';

/** The constraints a configuration holds, with every `all` opened (a choice stays closed: it holds nothing yet). */
function held(constraints: readonly Constraint[]): Constraint[] {
  return constraints.flatMap((k) => (k.t === 'all' ? held(k.of) : k.t === 'choice' ? [] : [k]));
}

/**
 * The isosceles keys over `ring`, in ring order: option `i` is the equal pair whose apex is `ring[i]` — the noun's own
 * spelling (`shapes.ts`, «משולש שווה שוקיים»), so the two can never disagree about which pair names which apex.
 */
export function isoscelesKeys(ring: readonly Id[]): Constraint[] {
  const given = shapeRow('משולש שווה שוקיים')!.givens([...ring])[0];
  return given.t === 'choice' ? given.options : [given];
}

/**
 * The vertices of `ring` that carry `role` under `constraints` — for the base and the legs, the apex: a vertex whose
 * two sides are equal there. Several (an equilateral by its givens) and none (nothing states a pair) are both
 * answers, and the caller decides what each means.
 */
export function roleVertexOf(constraints: readonly Constraint[], ring: readonly Id[], role: RoleBinding['role']): Id[] {
  void role; // the base and the legs are both read off the apex
  const ks = held(constraints);
  return isoscelesKeys(ring).flatMap((key, i) => (ks.some((k) => sameConstraint(k, key)) ? [ring[i]] : []));
}

/** `x` with every vertex letter of `ring` carried `step` places along it; any other value unchanged. */
function rotated<T>(x: T, ring: readonly Id[], step: number): T {
  const map = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const i = ring.indexOf(v);
      return i < 0 ? v : ring[(i + step) % ring.length];
    }
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, w]) => [k, map(w)]));
    return v;
  };
  return map(x) as T;
}

/**
 * THE OBJECTS AS ONE CONFIGURATION LETTERS THEM — ADR-596's rotation, at analytic's configuration seam.
 *
 * Every object bound to a role is re-lettered against `constraints` (a configuration's resolved constraints):
 * - the bound vertex still carries the role → unchanged (adding a line never moves what is drawn);
 * - exactly one OTHER vertex carries it → the ring letters inside the object rotate by the step between the two, and
 *   the binding records the new vertex. A letter outside the ring (the tool's M or H) never moves, so the point keeps
 *   its name and only its definition follows. The rotation is canonical, so two cevians bound to the two legs stay on
 *   two different legs whatever path the cycling took, and re-resolving an already resolved list changes nothing;
 * - several or none carry it → unchanged.
 * A list with no bound object is returned AS IS (the same array), so every figure without one costs nothing.
 */
export function followObjects(objects: readonly GeoObject[], constraints: readonly Constraint[]): GeoObject[] {
  if (!objects.some((o) => (o.kind === 'derived' || o.kind === 'segment') && o.follows)) return objects as GeoObject[];
  return objects.map((o) => {
    if ((o.kind !== 'derived' && o.kind !== 'segment') || !o.follows) return o;
    const { ring, at, role } = o.follows;
    const now = roleVertexOf(constraints, ring, role);
    if (now.length !== 1 || now[0] === at) return o;
    const step = (ring.indexOf(now[0]) - ring.indexOf(at) + ring.length) % ring.length;
    const follows: RoleBinding = { ...o.follows, at: now[0] };
    return o.kind === 'derived'
      ? { ...o, rule: rotated(o.rule, ring, step), follows }
      : { ...o, a: rotated(o.a, ring, step), b: rotated(o.b, ring, step), follows };
  });
}
