/**
 * CONSTRAINT COMPONENTS (S3.2 stage (a) of docs/25 — operator-approved 2026-07-25).
 *
 * The docs/23 G2 diagnosis: solver ownership is negotiated per-constraint over a greedy sequential
 * core, while the geometry is per-COMPONENT — a set of constraints sharing reachable free DOFs is
 * ONE system, and "which DOF belongs to which constraint" is solver bookkeeping, not a fact about
 * the figure. This module computes that partition: the bipartite graph constraint ↔ reachable
 * drivable DOFs (the existing `ancestors(…,'drivable')` walk), with connected components over
 * shared DOFs.
 *
 * Stage (a) is OBSERVABILITY (partition + trace); stage (b) (`jointFirst` in step.ts) solves the
 * new statement's component as one system before the recruit ladder, with the ladder as live
 * fallback. Rung retirement (stage (c)) only happens per docs/25 §4 once the joint path proves
 * itself on the rungs' own tests.
 */
import type { Constraint, Construction, GeoObject, Id } from './types';
import { constraintRefs } from './solve';

/** The drivable-ancestor walker, INJECTED by the caller (step.ts's `freeDrivableAncestors`) — a
 *  parameter rather than an import so components ↔ step never form a module cycle (TDZ hazard). */
export type DrivableWalk = (objects: GeoObject[], start: Id) => Id[];

export interface ConstraintComponent {
  constraints: Constraint[];
  /** The free/drivable DOF ids the component's constraints can reach (deduped, insertion order). */
  dofs: Id[];
}

/** The drivable-DOF set of one constraint (deduped). */
function dofsOf(c: Construction, k: Constraint, walk: DrivableWalk): Set<Id> {
  const out = new Set<Id>();
  for (const ref of new Set(constraintRefs(k))) for (const d of walk(c.objects, ref)) out.add(d);
  return out;
}

/**
 * Partition ALL of the construction's constraints into connected components over shared drivable
 * DOFs. A constraint with NO reachable DOF (fully determined refs) forms its own singleton
 * component with an empty dof list — it is a pure check.
 */
export function constraintComponents(c: Construction, walk: DrivableWalk): ConstraintComponent[] {
  const dofSets = c.constraints.map((k) => dofsOf(c, k, walk));
  const parent = c.constraints.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byDof = new Map<Id, number>();
  dofSets.forEach((dofs, i) => {
    for (const d of dofs) {
      const prev = byDof.get(d);
      if (prev === undefined) byDof.set(d, i);
      else union(prev, i);
    }
  });
  const groups = new Map<number, ConstraintComponent>();
  c.constraints.forEach((k, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { constraints: [], dofs: [] };
    g.constraints.push(k);
    for (const d of dofSets[i]) if (!g.dofs.includes(d)) g.dofs.push(d);
    groups.set(root, g);
  });
  return [...groups.values()];
}

/**
 * The component CONTAINING the given seed constraints (usually a step's new constraints) — the
 * system stage (b) re-opens; every other component stays untouched (the generalization of
 * settle-on-frozen-prior's freeze). Returns null when the seeds reach no DOF at all.
 */
export function componentOf(c: Construction, seeds: Constraint[], walk: DrivableWalk): ConstraintComponent | null {
  const seedSet = new Set(seeds);
  const all = constraintComponents(c, walk);
  const mine = all.filter((g) => g.constraints.some((k) => seedSet.has(k)));
  if (mine.length === 0) return null;
  const merged: ConstraintComponent = { constraints: [], dofs: [] };
  for (const g of mine) {
    for (const k of g.constraints) if (!merged.constraints.includes(k)) merged.constraints.push(k);
    for (const d of g.dofs) if (!merged.dofs.includes(d)) merged.dofs.push(d);
  }
  return merged.dofs.length ? merged : null;
}

/**
 * The MINIMAL closed sub-component: only the constraints reachable from the seeds' own DOFs (one
 * union-find class restricted to seed-reachable DOFs) — the ADR-281 "least ownership" lesson at
 * component granularity: try the smallest coupled system first, the full component second.
 */
export function minimalComponentOf(c: Construction, seeds: Constraint[], walk: DrivableWalk): ConstraintComponent | null {
  const seedDofs = new Set<Id>();
  for (const k of seeds) for (const d of dofsOf(c, k, walk)) seedDofs.add(d);
  if (seedDofs.size === 0) return null;
  const constraints = c.constraints.filter((k) => {
    if (seeds.includes(k)) return true;
    for (const d of dofsOf(c, k, walk)) if (seedDofs.has(d)) return true;
    return false;
  });
  return { constraints, dofs: [...seedDofs] };
}

/**
 * THE INDEPENDENT PARTS OF A FIGURE (#2796, [ADR-853](../../docs/06-decisions.md#adr-853)) — analytic's #2737 /
 * ADR-AG-425 and 3-D's #2764 / ADR-3D-454 mechanism, in this tree (product trees never import each other).
 *
 * A figure whose parts share no unknown was solved, sampled and judged as ONE system: every driven carrier of every
 * shape went to one joint solve (so a kite typed last reshaped two trapezoids), one spin and one jitter width were taken
 * from the whole, and the configuration search needed one number at which every shape was valid at once. A part is
 * solved, sampled and judged on its own; the figure is the union of its parts.
 *
 * **What links.** Two objects are one part when either names the other: every string anywhere inside an object (its
 * parents, its `solve` directive, an `avoid`, a `between`…) that is an object id of the figure, and every id any
 * constraint, stated side or side choice names. A GENERIC walk, never a per-kind list: a new field cannot slip past.
 * A walk that links too much costs speed only; one that missed a link would solve two coupled things apart — so when
 * unsure, it links. A constraint naming no object at all keeps the figure whole.
 *
 * **A part of points only** (a loose «נקודה D», nothing drawn through it) has nothing of its own the configuration
 * shapes: it rides with the first part that draws something, so a figure of one shape plus loose points is one part.
 *
 * **One part ⇒ the construction itself**, so every connected figure takes exactly the path it always took.
 * Pure over the construction, memoised per construction.
 */
export interface Part {
  /** The part's first object id in construction order — stable as lines are added after it. */
  readonly key: Id;
  readonly ids: ReadonlySet<Id>;
  /** The part's own sub-construction (objects in the whole's order, and the constraints/records that name them). */
  readonly construction: Construction;
}

/** The kinds that DRAW something — a part holding none of them rides with the first part that does. */
const DRAWS = new Set<string>(['polygon', 'segment', 'line', 'circle', 'arc']);

const partsMemo = new WeakMap<Construction, readonly Part[]>();

/** Every string anywhere inside `v` (own `id` key skipped at the top level by the caller). */
function strings(v: unknown, out: string[]): void {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
}

/**
 * `links` are the statements of the figure (each the ids one typed line names): a line that names two parts is one
 * figure even when nothing in the construction records it — «שני מעגלים» states one unstated mutual position of its
 * two circles, judged on the facts (ADR-815), so its circles are one part. The replay tail passes the facts' names;
 * the engine's own calls (a step's solve) pass none, which can only split more, never couple what is apart.
 */
export function partsOf(c: Construction, links: readonly (readonly string[])[] = []): readonly Part[] {
  if (links.length === 0) {
    const hit = partsMemo.get(c);
    if (hit) return hit;
  }
  const out = computeParts(c, links);
  if (links.length === 0) partsMemo.set(c, out);
  return out;
}

function computeParts(c: Construction, links: readonly (readonly string[])[]): readonly Part[] {
  const whole: readonly Part[] = [{ key: c.objects[0]?.id ?? '', ids: new Set(c.objects.map((o) => o.id)), construction: c }];
  if (c.objects.length < 2) return whole;
  const index = new Map<Id, number>();
  c.objects.forEach((o, i) => index.set(o.id, i));
  const parent = c.objects.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const idsIn = (v: unknown): number[] => {
    const s: string[] = [];
    strings(v, s);
    const r: number[] = [];
    for (const x of s) { const i = index.get(x); if (i !== undefined) r.push(i); }
    return r;
  };
  c.objects.forEach((o, i) => {
    const { id: _own, ...rest } = o as { id: Id };
    for (const j of idsIn(rest)) union(i, j);
  });
  const records: unknown[] = [...c.constraints, ...(c.requirements ?? []), ...(c.sideChoices ?? [])];
  for (const r of records) {
    const ids = idsIn(r);
    if (ids.length === 0) return whole; // a record naming no object frames the whole figure
    for (const j of ids) union(ids[0], j);
  }
  for (const l of links) {
    const ids = idsIn(l);
    for (const j of ids) union(ids[0], j);
  }
  // a part of points only rides with the first part that draws something
  const draws = new Set<number>();
  c.objects.forEach((o, i) => { if (DRAWS.has(o.kind)) draws.add(find(i)); });
  if (draws.size < 2) return whole;
  const firstDrawn = Math.min(...draws);
  const rootOf = (i: number): number => { const r = find(i); return draws.has(r) ? r : firstDrawn; };
  const groups = new Map<number, Id[]>();
  c.objects.forEach((o, i) => {
    const r = rootOf(i);
    const g = groups.get(r);
    if (g) g.push(o.id); else groups.set(r, [o.id]);
  });
  if (groups.size < 2) return whole;
  const partOfId = new Map<Id, number>();
  for (const [r, ids] of groups) for (const id of ids) partOfId.set(id, r);
  const recordPart = (r: unknown): number => partOfId.get(c.objects[idsIn(r)[0]].id)!;
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, ids]) => {
      const set = new Set(ids);
      const construction: Construction = {
        ...c,
        objects: c.objects.filter((o) => set.has(o.id)),
        constraints: c.constraints.filter((k) => recordPart(k) === r),
        ...(c.requirements ? { requirements: c.requirements.filter((k) => recordPart(k) === r) } : {}),
        ...(c.sideChoices ? { sideChoices: c.sideChoices.filter((k) => recordPart(k) === r) } : {}),
      };
      return { key: ids[0], ids: set, construction };
    });
}

/** The figure with each part's objects replaced by that part's version (`byPart[i]` is `parts[i]`'s new construction). */
export function joinParts(c: Construction, byPart: readonly Construction[]): Construction {
  const byId = new Map<Id, GeoObject>();
  for (const p of byPart) for (const o of p.objects) byId.set(o.id, o);
  return { ...c, objects: c.objects.map((o) => byId.get(o.id) ?? o) };
}

/**
 * #2796 ([ADR-853](../../docs/06-decisions.md#adr-853)) — A CONFIGURATION. A plain number is every part at that number
 * (every figure before this change, and every figure of one part). The structured form records where each part
 * landed: `parts[key]` is the number of the part keyed `key` ({@link Part.key}); a part with no entry sits at `seed`.
 * Each entry is a full configuration number (its base and its reflection mask in the high bits). Canonical form
 * ({@link canonicalSeed}): no entry equal to `seed`, and no entries at all is the plain number.
 */
export type Seed = number | { readonly seed: number; readonly parts: Readonly<Record<string, number>> };

/** The configuration's base number — what «הציגו תצורה אחרת» steps from, and what a part with no entry sits at. */
export const seedNumber = (s: Seed): number => (typeof s === 'number' ? s : s.seed);

/** The number the part keyed `key` is sampled at. */
export const seedOfPart = (s: Seed, key: string): number => (typeof s === 'number' ? s : (s.parts[key] ?? s.seed));

/** The canonical spelling: entries equal to the base dropped, none left ⇒ the plain number. */
export function canonicalSeed(base: number, parts: Readonly<Record<string, number>>): Seed {
  const kept = Object.keys(parts).filter((k) => parts[k] !== base).sort();
  if (kept.length === 0) return base;
  return { seed: base, parts: Object.fromEntries(kept.map((k) => [k, parts[k]])) };
}

/** `s` with the part keyed `key` moved to `n` (every other part where it was). */
export const withPartSeed = (s: Seed, key: string, n: number): Seed =>
  canonicalSeed(seedNumber(s), { ...(typeof s === 'number' ? {} : s.parts), [key]: n });

/** A stable string for a configuration (the replay memo key, equality). A plain number spells as it always did. */
export function seedKey(s: Seed): string {
  const c = typeof s === 'number' ? s : canonicalSeed(s.seed, s.parts);
  if (typeof c === 'number') return String(c);
  return `${c.seed}{${Object.keys(c.parts).map((k) => `${k}:${c.parts[k]}`).join(',')}}`;
}

export const sameSeed = (a: Seed, b: Seed): boolean => a === b || seedKey(a) === seedKey(b);

const isSeedNumber = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * A configuration read from outside (a file, a link, a session): `base` is the saved number (the caller has already
 * made it one); a malformed part entry is dropped, so that part sits at the base.
 */
export function cleanSeed(base: number, parts?: unknown): Seed {
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) return base;
  const kept: Record<string, number> = {};
  for (const [k, v] of Object.entries(parts as Record<string, unknown>)) if (k.length > 0 && isSeedNumber(v)) kept[k] = v;
  return canonicalSeed(base, kept);
}

/** The part entries a configuration records, for the file's `seedParts` field (undefined when there are none). */
export function seedPartsOf(s: Seed): Readonly<Record<string, number>> | undefined {
  if (typeof s === 'number') return undefined;
  const c = canonicalSeed(s.seed, s.parts);
  return typeof c === 'number' ? undefined : c.parts;
}

/**
 * The replay tail builds the figure from its parts' sampled constructions ({@link joinParts}); recording them as the
 * joined figure's parts lets `evaluate` reuse each part's own memoised solve — a candidate that moves one part
 * re-solves that part alone. Sampling changes numbers, never which ids an object names, so these ARE the parts.
 */
export function adoptParts(joined: Construction, parts: readonly Part[]): void {
  partsMemo.set(joined, parts);
}
