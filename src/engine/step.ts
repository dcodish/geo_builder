/**
 * Step orchestration: apply a command and evaluate. On failure the PREVIOUS
 * construction is kept (the contradiction is reported, the figure is not
 * corrupted — FR-EN-8). Also: alternative-branch cycling and small helpers.
 *
 * (The full store with history/undo is Phase 3; this is the minimal harness
 * the Phase-1 gate needs.)
 */

import type { Command, Construction, Id, Vec } from './types';
import { applyCommand, normalizeShapeComposition } from './apply';
import { evaluate } from './evaluate';
import { circleCircleIntersect, dist } from './geometry';
import { solvedOnSegmentCandidates } from './solve';

export interface StepOk {
  ok: true;
  construction: Construction;
  positions: Map<Id, Vec>;
}
export interface StepErr {
  ok: false;
  error: string;
  construction: Construction; // the previous (kept) construction
  positions: Map<Id, Vec>;
}
export type StepResult = StepOk | StepErr;

export const emptyConstruction = (): Construction => ({ objects: [], constraints: [] });

/** Deep structural equality for plain geo objects/values (commands, objects). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * A command may introduce new objects, but it must not *redefine* an existing
 * one. Re-issuing the identical definition is an idempotent no-op (FR-EN-9);
 * issuing a different definition for an id that already exists is a conflict
 * (e.g. "C is the square's corner" vs "C is 5 from A and 5 from B"). Returns a
 * message describing the first such clash, or null if the command is consistent.
 *
 * The candidate objects are produced against an empty construction so we compare
 * against the command's *canonical* definition, independent of evaluation.
 */
export function commandConflict(prev: Construction, cmd: Command): string | null {
  // A shape (square/quad/parallelogram) may be *built on existing points*: its
  // base corners reference whatever point already carries that id (creating a
  // free point only for new ids), so a base free-point never conflicts — only
  // the shape's own derived corners can (ADR-013). The default coordinates a
  // shape gives a *new* base vertex are an initializer, not a definition.
  const isShape =
    cmd.type === 'square' ||
    cmd.type === 'quadrilateral' ||
    cmd.type === 'parallelogram' ||
    cmd.type === 'rectangle' ||
    cmd.type === 'rhombus' ||
    cmd.type === 'trapezoid' ||
    cmd.type === 'triangle';
  const produced = applyCommand(emptyConstruction(), cmd).objects;
  for (const o of produced) {
    const existing = prev.objects.find((x) => x.id === o.id);
    if (!existing || deepEqual(existing, o)) continue;
    if (o.kind === 'free-point') {
      if (isShape) continue; // base corner reuses any existing point (composition)
      if (existing.kind === 'free-point') continue; // free-point command = move (ADR-011)
    }
    return `'${o.id}' is already defined — it can't be redefined as something different`;
  }
  return null;
}

/** Apply one command and evaluate; keep the prior construction on failure. */
export function applyStep(prev: Construction, cmd: Command): StepResult {
  const prevEval = evaluate(prev);
  const prevPositions = prevEval.ok ? prevEval.positions : new Map<Id, Vec>();

  // Rotate a shape's vertices so an existing edge lands on its free base slots —
  // lets a shape build on an existing edge wherever that edge sits in the name
  // (ADR-013, amendment). Both the conflict check and the build see this order.
  const ncmd = normalizeShapeComposition(prev, cmd);

  // Reject a redefinition conflict before mutating anything (keep prior figure).
  const conflict = commandConflict(prev, ncmd);
  if (conflict) {
    return { ok: false, error: conflict, construction: prev, positions: prevPositions };
  }

  // Pass the prior figure's positions so a shape built on existing points is
  // fitted to them (non-degenerate composition, ADR-013) rather than keeping
  // absolute template defaults.
  const next = applyCommand(prev, ncmd, prevPositions);
  const res = evaluate(next);
  if (!res.ok) {
    return { ok: false, error: res.error, construction: prev, positions: prevPositions };
  }
  return { ok: true, construction: next, positions: res.positions };
}

/** Apply a sequence expecting success; throws on unexpected failure (for fixtures/tests). */
export function build(cmds: Command[], start: Construction = emptyConstruction()): {
  construction: Construction;
  positions: Map<Id, Vec>;
} {
  let cur = start;
  for (const cmd of cmds) {
    const r = applyStep(cur, cmd);
    if (!r.ok) throw new Error(`unexpected failure on '${cmd.type}': ${r.error}`);
    cur = r.construction;
  }
  const e = evaluate(cur);
  if (!e.ok) throw new Error(e.error);
  return { construction: cur, positions: e.positions };
}

/** Number of valid solution branches for a branchable point (0/1/2). */
export function branchCount(c: Construction, id: Id): number {
  const o = c.objects.find((x) => x.id === id);
  if (!o) return 0;
  const e = evaluate(c);
  if (!e.ok) return 0;
  if (o.kind === 'intersection') {
    const c1 = e.positions.get(o.center1);
    const c2 = e.positions.get(o.center2);
    if (!c1 || !c2) return 0;
    return circleCircleIntersect(c1, o.radius1, c2, o.radius2).length;
  }
  if (o.kind === 'on-segment-solved') {
    const ts = solvedOnSegmentCandidates(o, e.positions);
    return ts === 'pending' ? 0 : ts.length;
  }
  return 0;
}

/** Advance a branchable point (intersection or angle-solved) to its next solution branch (wraps). */
export function cycleAlternative(c: Construction, id: Id): Construction {
  const n = branchCount(c, id) || 1;
  const objects = c.objects.map((o) =>
    o.id === id && (o.kind === 'intersection' || o.kind === 'on-segment-solved')
      ? { ...o, branch: (o.branch + 1) % n }
      : o,
  );
  return { ...c, objects };
}

/** Largest Euclidean move of any of `ids` between two position maps (for stability checks). */
export function maxDelta(a: Map<Id, Vec>, b: Map<Id, Vec>, ids: Id[]): number {
  let m = 0;
  for (const id of ids) {
    const pa = a.get(id);
    const pb = b.get(id);
    if (pa && pb) m = Math.max(m, dist(pa, pb));
  }
  return m;
}
