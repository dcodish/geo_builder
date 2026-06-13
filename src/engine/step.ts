/**
 * Step orchestration: apply a command and evaluate. On failure the PREVIOUS
 * construction is kept (the contradiction is reported, the figure is not
 * corrupted — FR-EN-8). Also: alternative-branch cycling and small helpers.
 *
 * (The full store with history/undo is Phase 3; this is the minimal harness
 * the Phase-1 gate needs.)
 */

import type { Command, Constraint, Construction, GeoObject, Id, Vec } from './types';
import { LEN_EPS, isGeoPoint } from './types';
import { applyCommand, mirrorComposition, normalizeShapeComposition } from './apply';
import { evaluate } from './evaluate';
import type { EvalResult } from './evaluate';
import { circleCircleIntersect, dist } from './geometry';
import { constraintRefs, solvedOnSegmentCandidates } from './solve';

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
    cmd.type === 'triangle' ||
    cmd.type === 'right-triangle' ||
    cmd.type === 'segment' || // a segment reuses (or creates) its endpoints, like a shape's base
    cmd.type === 'circle' ||
    cmd.type === 'circle-through'; // a circle reuses (or creates) its centre
  const produced = applyCommand(emptyConstruction(), cmd).objects;
  for (const o of produced) {
    const existing = prev.objects.find((x) => x.id === o.id);
    if (!existing || deepEqual(existing, o)) continue;
    if (o.kind === 'free-point') {
      if (isShape) continue; // base corner reuses any existing point (composition)
      if (existing.kind === 'free-point') continue; // free-point command = move (ADR-011)
    }
    // A circle-point construct (tangent / arc-midpoint / point-on-circle) creates
    // its point or reuses whatever already carries that id — never a conflict.
    if (o.kind === 'on-circle') continue;
    // Re-stating a circle with a new radius/centre is a RESIZE (override), not a
    // redefinition-as-something-different — "circle O radius 8" over an earlier 5.
    if (o.kind === 'circle' && existing.kind === 'circle') continue;
    // A construction line re-referenced by a later compound (draw the tangent at D,
    // then intersect "the tangent at D" with AB) is the SAME line — its id is its
    // spec — so reuse it instead of conflicting (visibility is kept/merged in apply).
    if (o.kind === 'line' && existing.kind === 'line') continue;
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

  // Reject a redefinition conflict before mutating anything (keep prior figure) —
  // UNLESS the second statement *places* an already-built point, in which case it
  // is really a constraint ("C is the midpoint of OB", where C is already AB∩DE):
  // reinterpret it as a coincidence that drives a free DOF upstream (ADR-028).
  const conflict = commandConflict(prev, ncmd);
  if (conflict) {
    const constrained = reinterpretAsConstraint(prev, ncmd) ?? reinterpretDiameter(prev, ncmd);
    if (constrained) {
      const r = evaluate(constrained);
      if (r.ok) return { ok: true, construction: constrained, positions: r.positions };
    }
    return { ok: false, error: conflict, construction: prev, positions: prevPositions };
  }

  // Pass the prior figure's positions so a shape built on existing points is
  // fitted to them (non-degenerate composition, ADR-013) rather than keeping
  // absolute template defaults.
  const next = applyCommand(prev, ncmd, prevPositions);
  const res = evaluate(next);

  // For a shape built on an existing edge, also consider its mirror (the other
  // side of that edge) and choose the valid placement that sits *away* from
  // existing geometry — a textbook look, and never stacking nodes (ADR-013/017).
  const mirrored = mirrorComposition(prev, ncmd, next, prevPositions);
  if (mirrored) {
    const alt = evaluate(mirrored);
    const choice = chooseComposition(prev, ncmd, prevPositions, next, res, mirrored, alt);
    if (choice) return { ok: true, construction: choice.construction, positions: choice.positions };
    // neither side is valid → fall through and report the default's error
  }

  if (!res.ok) {
    // A constraint its direct carrier alone can't satisfy ("cannot place F on AB
    // so |DE|=|DF|" — F is stuck on the segment) may still hold if the figure's
    // OTHER free DOFs move too. Recruit them and solve jointly before giving up
    // (ADR-028, extended): "find a possible configuration and use it".
    const recruited = recruitFreeDofs(next);
    if (recruited) {
      const r2 = evaluate(recruited);
      if (r2.ok) return { ok: true, construction: recruited, positions: r2.positions };
    }
    return { ok: false, error: res.error, construction: prev, positions: prevPositions };
  }
  return { ok: true, construction: next, positions: res.positions };
}

/**
 * "diameter AB" when A and B are BOTH already on the circle isn't a redefinition of
 * B (its antipode) — it's the constraint that AB *is* a diameter, i.e. its midpoint
 * is the centre. Reinterpret it as `coincide(midpoint(A,B), O)` driving a carrier, so
 * the solver makes A,B antipodal (the recruit-DOFs fallback widens this if needed).
 */
function reinterpretDiameter(prev: Construction, cmd: Command): Construction | null {
  if (cmd.type !== 'diameter') return null;
  const a = prev.objects.find((o) => o.id === cmd.id1 && isGeoPoint(o));
  const b = prev.objects.find((o) => o.id === cmd.id2 && isGeoPoint(o));
  if (!a || !b) return null; // one endpoint is new ⇒ the normal diameter (creates the antipode)
  const circle = prev.objects.find((o): o is Extract<GeoObject, { kind: 'circle' }> => o.kind === 'circle' && o.id === cmd.circle);
  if (!circle) return null;
  const mid = `~dia${cmd.id1}${cmd.id2}`;
  if (prev.objects.some((o) => o.id === mid)) return null; // already reinterpreted
  // a carrier to attach the constraint to — one of the endpoints on the circle.
  const carrier = [cmd.id1, cmd.id2].find((id) => {
    const o = prev.objects.find((x) => x.id === id);
    return o && (o.kind === 'on-circle' || o.kind === 'on-segment');
  });
  if (!carrier) return null;
  const coincide: Constraint = { type: 'coincide', p: mid, q: circle.center };
  const objects: GeoObject[] = [
    ...prev.objects.map((o) =>
      o.id === carrier && (o.kind === 'on-circle' || o.kind === 'on-segment')
        ? { ...o, solve: { constraint: coincide, branch: 0 } }
        : o,
    ),
    { kind: 'midpoint', id: mid, a: cmd.id1, b: cmd.id2 },
    { kind: 'segment', id: `seg-${[cmd.id1, cmd.id2].sort().join('')}`, a: cmd.id1, b: cmd.id2 },
  ];
  return { objects, constraints: [...prev.constraints, coincide] };
}

/** Every free 1-DOF carrier (on-circle / on-segment, not pinned/driven) reachable from `start`. */
function freeCarrierAncestors(objects: GeoObject[], start: Id): Id[] {
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const seen = new Set<Id>();
  const result: Id[] = [];
  const queue: Id[] = [start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const o = byId.get(id);
    if (!o || !isGeoPoint(o)) continue;
    if ((o.kind === 'on-circle' || o.kind === 'on-segment') && (o as { solve?: unknown }).solve === undefined) {
      result.push(id); // a free carrier — its parameter is a DOF we can move
      continue;
    }
    queue.push(...pointParents(o));
  }
  return result;
}

/**
 * Last resort when a constraint can't be met by its direct carrier: turn that
 * carrier and the free DOFs the constraint transitively depends on into a set of
 * joint carriers (all driving the same constraint), so the numeric solver
 * (resolveDriven) can reconfigure the figure to satisfy it. Returns the recruited
 * construction, or null if there's nothing extra to move.
 */
function recruitFreeDofs(c: Construction): Construction | null {
  const solved = c.objects.filter((o): o is Extract<GeoObject, { kind: 'on-segment-solved' }> => o.kind === 'on-segment-solved');
  if (!solved.length) return null;
  let objects = [...c.objects];
  const added: Constraint[] = [];
  let changed = false;
  for (const sp of solved) {
    const K = sp.constraint;
    const recruits = new Set<Id>();
    for (const ref of constraintRefs(K)) for (const a of freeCarrierAncestors(objects, ref)) recruits.add(a);
    recruits.delete(sp.id);
    if (recruits.size === 0) continue;
    changed = true;
    added.push(K);
    objects = objects.map((o) => {
      if (o.id === sp.id) return { kind: 'on-segment', id: sp.id, a: sp.a, b: sp.b, t: 0.5, solve: { constraint: K, branch: 0 } };
      if (recruits.has(o.id) && (o.kind === 'on-circle' || o.kind === 'on-segment') && o.solve === undefined)
        return { ...o, solve: { constraint: K, branch: 0 } };
      return o;
    });
  }
  return changed ? { objects, constraints: [...c.constraints, ...added] } : null;
}

// ── ADR-028: a second placement of an existing point → a coincidence constraint ──

/** Commands that *place a single point* `id` (so a second one is a constraint, not a redefinition). */
const POINT_PLACEMENTS = new Set<Command['type']>([
  'free-point', 'point-on-segment', 'point-by-distances', 'line-line-intersection',
  'midpoint', 'foot', 'line-intersection', 'arc-midpoint', 'circumcircle',
  'line-circle-intersection', 'circle-circle-intersection',
]);

/** The point ids an object directly depends on (for walking back to a free DOF). */
function pointParents(o: GeoObject): Id[] {
  switch (o.kind) {
    case 'on-segment': case 'on-segment-solved': case 'derived': case 'midpoint': return [o.a, o.b];
    case 'intersection': return [o.center1, o.center2];
    case 'parallelogram-vertex': return [o.a, o.b, o.c];
    case 'line-line-intersection': return [o.a, o.b, o.c, o.d];
    case 'perp-offset': case 'rotated': case 'scaled-offset': return [(o as { anchor?: Id; pivot?: Id }).anchor ?? (o as { pivot: Id }).pivot, o.from, o.to];
    case 'foot': return [o.from, o.a, o.b];
    case 'circumcenter': return [o.a, o.b, o.c];
    case 'antipode': return [o.of];
    case 'arc-midpoint': return [o.from, o.to];
    default: return []; // free-point, on-circle (a carrier itself), line/circle-derived points
  }
}

/**
 * The free 1-DOF ancestor (on-circle / on-segment) of `start` to drive, or null.
 * Walks the dependency graph back from `start`; among the parametric points it
 * reaches, picks the most-recently-added (highest index) — the DOF most likely to
 * be the one the new fact is meant to pin down.
 */
function freeCarrierAncestor(objects: GeoObject[], start: Id): Id | null {
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const seen = new Set<Id>([start]);
  const queue = [...pointParents(byId.get(start) as GeoObject ?? { kind: 'free-point', id: start, x: 0, y: 0 })];
  let best = -1;
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const o = byId.get(id);
    if (!o || !isGeoPoint(o)) continue;
    if (o.kind === 'on-circle' || o.kind === 'on-segment') {
      best = Math.max(best, objects.findIndex((x) => x.id === id)); // a carrier; don't recurse past it
    } else {
      queue.push(...pointParents(o));
    }
  }
  return best >= 0 ? objects[best].id : null;
}

/**
 * Reinterpret a redefining placement as a coincidence: keep the existing point P,
 * add the new definition as a HIDDEN target `~P`, constrain P ≡ ~P, and mark a
 * free upstream DOF as solved to satisfy it. Returns the new construction, or null
 * if this can't be expressed (no single-point placement, or no free DOF upstream).
 */
function reinterpretAsConstraint(prev: Construction, cmd: Command): Construction | null {
  if (!POINT_PLACEMENTS.has(cmd.type)) return null;
  const P = (cmd as { id?: Id }).id;
  if (!P) return null;
  const existing = prev.objects.find((o) => o.id === P);
  if (!existing || !isGeoPoint(existing)) return null; // only a *re*definition of an existing point
  const H = `~${P}`;
  if (prev.objects.some((o) => o.id === H)) return null; // already reinterpreted once
  const carrier = freeCarrierAncestor(prev.objects, P);
  if (!carrier) return null; // nothing free to move → a genuine over-constraint
  const withHelper = applyCommand(prev, { ...(cmd as object), id: H } as Command); // the new def under the hidden id
  const coincide: Constraint = { type: 'coincide', p: P, q: H };
  const objects = withHelper.objects.map((o) =>
    o.id === carrier && (o.kind === 'on-circle' || o.kind === 'on-segment')
      ? { ...o, solve: { constraint: coincide, branch: 0 } }
      : o,
  );
  return { objects, constraints: [...withHelper.constraints, coincide] };
}

const centroid = (ps: Vec[]): Vec => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});

/**
 * Pick between a composed shape's default placement and its mirror: take the one
 * that is valid (evaluates, no coincident nodes) and, when both are, sits on the
 * side of the base edge *away* from the existing geometry. Returns null when
 * neither is valid (the caller then surfaces the default's error).
 */
function chooseComposition(
  prev: Construction,
  cmd: Command,
  prevPos: Map<Id, Vec>,
  def: Construction,
  defEval: EvalResult,
  mir: Construction,
  mirEval: EvalResult,
): { construction: Construction; positions: Map<Id, Vec> } | null {
  if (defEval.ok && mirEval.ok) {
    const flip = preferMirror(prev, cmd, prevPos, defEval.positions);
    return flip
      ? { construction: mir, positions: mirEval.positions }
      : { construction: def, positions: defEval.positions };
  }
  if (defEval.ok) return { construction: def, positions: defEval.positions };
  if (mirEval.ok) return { construction: mir, positions: mirEval.positions };
  return null;
}

/** True when the default placement lands on the same side of the base edge as the existing geometry (so flip). */
function preferMirror(prev: Construction, cmd: Command, prevPos: Map<Id, Vec>, defPos: Map<Id, Vec>): boolean {
  if (!('ids' in cmd)) return false;
  const anchors = (cmd.ids as Id[]).filter((id) => prev.objects.some((o) => o.id === id));
  if (anchors.length !== 2) return false;
  const A = prevPos.get(anchors[0]);
  const B = prevPos.get(anchors[1]);
  if (!A || !B) return false;
  const signed = (p: Vec) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x); // side of edge AB

  const existing = prev.objects
    .filter(isGeoPoint)
    .map((o) => prevPos.get(o.id))
    .filter((p): p is Vec => !!p && Math.abs(signed(p)) > LEN_EPS); // off-edge only
  if (existing.length === 0) return false; // nothing to avoid → keep default

  const prevIds = new Set(prev.objects.map((o) => o.id));
  const newPts = [...defPos].filter(([id]) => !prevIds.has(id)).map(([, p]) => p);
  if (newPts.length === 0) return false;

  const sideExisting = Math.sign(signed(centroid(existing)));
  const sideNew = Math.sign(signed(centroid(newPts)));
  return sideNew !== 0 && sideNew === sideExisting;
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
  // Both arcs have a midpoint; a line/another circle meets a circle in up to two points.
  if (o.kind === 'arc-midpoint' || o.kind === 'line-circle' || o.kind === 'circle-circle') return 2;
  return 0;
}

/** The branchable point kinds whose `branch` index "show another configuration" cycles. */
const BRANCHABLE = new Set(['intersection', 'on-segment-solved', 'arc-midpoint', 'line-circle', 'circle-circle']);

/** Advance a branchable point to its next solution branch (wraps). */
export function cycleAlternative(c: Construction, id: Id): Construction {
  const n = branchCount(c, id) || 1;
  const objects = c.objects.map((o) =>
    o.id === id && BRANCHABLE.has(o.kind) && 'branch' in o
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
