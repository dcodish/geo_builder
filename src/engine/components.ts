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
