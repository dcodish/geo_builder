/**
 * Step orchestration: apply a command and evaluate. On failure the PREVIOUS
 * construction is kept (the contradiction is reported, the figure is not
 * corrupted — FR-EN-8). Also: alternative-branch cycling and small helpers.
 *
 * (The full store with history/undo is Phase 3; this is the minimal harness
 * the Phase-1 gate needs.)
 */

import type { Command, Construction, Id, Vec } from './types';
import { applyCommand } from './apply';
import { evaluate } from './evaluate';
import { circleCircleIntersect, dist } from './geometry';

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

/** Apply one command and evaluate; keep the prior construction on failure. */
export function applyStep(prev: Construction, cmd: Command): StepResult {
  const next = applyCommand(prev, cmd);
  const res = evaluate(next);
  if (!res.ok) {
    const prevEval = evaluate(prev);
    return {
      ok: false,
      error: res.error,
      construction: prev,
      positions: prevEval.ok ? prevEval.positions : new Map(),
    };
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

/** Number of valid solution branches for an intersection point (0/1/2). */
export function branchCount(c: Construction, id: Id): number {
  const o = c.objects.find((x) => x.id === id);
  if (!o || o.kind !== 'intersection') return 0;
  const e = evaluate(c);
  if (!e.ok) return 0;
  const c1 = e.positions.get(o.center1);
  const c2 = e.positions.get(o.center2);
  if (!c1 || !c2) return 0;
  return circleCircleIntersect(c1, o.radius1, c2, o.radius2).length;
}

/** Advance an intersection point to its next solution branch (wraps). */
export function cycleAlternative(c: Construction, id: Id): Construction {
  const n = branchCount(c, id) || 1;
  const objects = c.objects.map((o) =>
    o.id === id && o.kind === 'intersection' ? { ...o, branch: (o.branch + 1) % n } : o,
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
