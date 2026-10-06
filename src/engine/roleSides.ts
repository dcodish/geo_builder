/**
 * SIDE ROLES — «היתר», «הבסיס», «השוק» — and how a statement that names a side BY ITS ROLE follows the
 * configuration (#775 → #1810, [ADR-596](../../docs/06-decisions.md#adr-596)).
 *
 * A triangle's declarations induce roles on its sides: a right angle makes the opposite side the
 * hypotenuse; an equal pair of sides meeting at a vertex makes them the legs and the third side the base.
 * The roles are read off the CONSTRUCTION's declared structure (the right-triangle macro's perp-offset, a
 * ⟂ / 90° constraint at a triangle vertex, an equal-sides constraint) — never off drawn coordinates, so a
 * side that merely MEASURES equal at this seed never becomes «the base» (ADR-052).
 *
 * Every role family hangs off ONE distinguished vertex of the triangle — the right-angle vertex for the
 * hypotenuse, the apex for the base and the legs. When that vertex is an UNSTATED choice (the isosceles
 * apex is a cyclable `shape-variant`; a right angle can be re-seated by a later statement), «show another
 * configuration» moves it, and a side named by its role must move with it. #1810: the parser used to
 * resolve the role to letters ONCE, at parse time, so after one press «תיכון לבסיס» drew the median to a
 * LEG while the row still claimed «the base».
 *
 * So a command lowered from a role noun carries a {@link RoleSideBinding} — the role, the triangle's ring
 * and the distinguished vertex its letters were resolved against — and the fold re-resolves it against
 * the construction in force ({@link bindRoleSide}): when the distinguished vertex has moved, the triangle's
 * letters are ROTATED along the ring by the same step. A rotation (not a swap) is used because it is
 * canonical: two statements bound at different configurations that name the same side always land on the
 * same side again, whatever path the cycling took — so the two legs of «גובה לשוק» twice stay two legs.
 */
import type { AnyCommand, Construction, GeoObject, Id, RoleSideBinding, SideRole } from './types';

/** One role a triangle's declarations induce on one of its sides. */
export interface RoleSide {
  role: SideRole;
  edge: [Id, Id];
  /** the triangle's ring, in its polygon order */
  ring: Id[];
  /** the distinguished vertex the role hangs off: the right-angle vertex (hypotenuse) or the apex (base, leg) */
  at: Id;
}

/** Which family a role belongs to — the family decides which distinguished vertex it hangs off. */
const familyOf = (role: SideRole): 'right' | 'isosceles' => (role === 'hypotenuse' ? 'right' : 'isosceles');

/** Every side role the construction's declarations induce (semantic — never read off coordinates). */
export function roleSidesOf(construction: Construction): RoleSide[] {
  const out: RoleSide[] = [];
  const push = (role: SideRole, edge: [Id, Id], ring: Id[], at: Id): void => {
    if (!out.some((r) => r.role === role && ((r.edge[0] === edge[0] && r.edge[1] === edge[1]) || (r.edge[0] === edge[1] && r.edge[1] === edge[0])))) out.push({ role, edge, ring, at });
  };
  const tris = construction.objects.filter((o): o is Extract<GeoObject, { kind: 'polygon' }> => o.kind === 'polygon' && o.vertices.length === 3);
  /** The vertex both segments share, when segments (a,b) and (c,d) meet at one point. */
  const sharedVertex = (a: Id, b: Id, c: Id, d: Id): Id | null => {
    const shared = [a, b].filter((x) => x === c || x === d);
    return shared.length === 1 ? shared[0] : null;
  };
  for (const t of tris) {
    const vs = t.vertices;
    const inTri = (id: Id): boolean => vs.includes(id);
    const rightAt = new Set<Id>();
    for (const o of construction.objects) {
      // the right-triangle macro's structural build: the perp-offset anchored at the right-angle vertex
      if (o.kind === 'perp-offset' && inTri(o.anchor) && inTri(o.to) && inTri(o.id) && o.anchor === o.from) rightAt.add(o.anchor);
    }
    for (const con of construction.constraints) {
      if (con.type === 'perpendicular') {
        const v = sharedVertex(con.a, con.b, con.c, con.d);
        if (v && inTri(v) && [con.a, con.b, con.c, con.d].every(inTri)) rightAt.add(v);
      }
      if (con.type === 'angle' && con.value === 90 && inTri(con.vertex) && inTri(con.ray1) && inTri(con.ray2)) rightAt.add(con.vertex);
    }
    if (rightAt.size === 1) {
      const [v] = rightAt;
      push('hypotenuse', vs.filter((x) => x !== v) as [Id, Id], [...vs], v);
    }
    for (const con of construction.constraints) {
      const isEq = con.type === 'equal' || (con.type === 'ratio' && con.k === 1 && !con.add);
      if (!isEq) continue;
      const c4 = con as { a: Id; b: Id; c: Id; d: Id };
      if (![c4.a, c4.b, c4.c, c4.d].every(inTri)) continue;
      const apex = sharedVertex(c4.a, c4.b, c4.c, c4.d);
      if (!apex) continue;
      push('leg', [c4.a, c4.b].sort() as [Id, Id], [...vs], apex);
      push('leg', [c4.c, c4.d].sort() as [Id, Id], [...vs], apex);
      push('base', vs.filter((x) => x !== apex) as [Id, Id], [...vs], apex);
    }
  }
  return out;
}

/** Map every whole point label inside a string (a bare id or one embedded in a structured id). */
const relabel = (v: string, map: Map<Id, Id>): string => v.replace(/[A-Z]\d*/g, (tok) => map.get(tok) ?? tok);

/**
 * Re-resolve a role-bound command against the construction in force (#1810). Returns the command
 * unchanged when it carries no binding, when its distinguished vertex still holds (stability: a figure
 * whose role did not move never changes), or when several referents compete and none is the bound one (the
 * parse-time letters stay — nothing better is known). When exactly one other vertex now carries the role,
 * the triangle's letters are rotated along the bound ring by the step from the bound vertex to it; letters
 * outside the triangle (the new foot, the new midpoint) never move. The binding itself is kept as stated,
 * so every re-resolution starts from the parse-time frame and the result is independent of the path the
 * cycling took.
 *
 * Returns `null` when NO vertex carries the role in this construction — the declaration that makes the
 * side «the base» is not in force here (a later «AB = BC» pins the isosceles apex, and the variant then
 * leaves that pair to the later statement). The fold treats that as "not yet": the fact waits for the figure
 * that declares the role (ADR-104's retry), and never draws the parse-time letters as if they were the base.
 */
export function resolveRoleSide<T extends AnyCommand>(cmd: T, construction: Construction, binding: RoleSideBinding | undefined = cmd.roleSide): T | null {
  if (!binding) return cmd;
  const { ring, at } = binding;
  if (ring.length !== 3 || !ring.includes(at)) return cmd;
  const fam = familyOf(binding.role);
  const sameTri = (r: Id[]): boolean => r.length === 3 && ring.every((v) => r.includes(v));
  const ats = [...new Set(roleSidesOf(construction).filter((r) => familyOf(r.role) === fam && sameTri(r.ring)).map((r) => r.at))];
  if (ats.length === 0) return null;
  if (ats.includes(at) || ats.length !== 1) return cmd;
  const k = (ring.indexOf(ats[0]) - ring.indexOf(at) + 3) % 3;
  const map = new Map<Id, Id>(ring.map((v, i) => [v, ring[(i + k) % 3]]));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(cmd)) {
    if (key === 'roleSide' || key === 'consumed' || key === 'expr' || key === 'type') out[key] = v;
    else if (typeof v === 'string') out[key] = relabel(v, map);
    else if (Array.isArray(v)) out[key] = v.map((e) => (typeof e === 'string' ? relabel(e, map) : e));
    else out[key] = v;
  }
  return out as T;
}

/** {@link resolveRoleSide} for a reader that has no "not yet" — the parse-time letters when no role is in force. */
export function bindRoleSide<T extends AnyCommand>(cmd: T, construction: Construction, binding: RoleSideBinding | undefined = cmd.roleSide): T {
  return resolveRoleSide(cmd, construction, binding) ?? cmd;
}
