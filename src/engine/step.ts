/**
 * Step orchestration: apply a command and evaluate. On failure the PREVIOUS
 * construction is kept (the contradiction is reported, the figure is not
 * corrupted — FR-EN-8). Also: alternative-branch cycling and small helpers.
 *
 * (The full store with history/undo is Phase 3; this is the minimal harness
 * the Phase-1 gate needs.)
 */

import type { AnyCommand, Command, Constraint, Construction, FreePoint, GeoObject, Id, LineSpec, Vec } from './types';
import { LEN_EPS, isGeoPoint } from './types';
import { applyCommand, mirrorComposition, normalizeShapeComposition } from './apply';
import { lower } from './lower';
import { evaluate } from './evaluate';
import type { EvalResult } from './evaluate';
import { circleCircleIntersect, dist } from './geometry';
import { carrierOf, isShapeCarrier, isParamCarrier } from './carriers';
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
  const produced = applyCommand(emptyConstruction(), cmd).objects;
  // A command "reuses or creates" its base points when applying it CREATES free-points — a shape's
  // base vertices, a segment's endpoints, a circle's centre, a circumcircle's three points (all
  // funnel through apply's `placeBase`). Those base corners reference whatever point already carries
  // that id, so a base free-point never conflicts — only the structure's own *derived* corners can
  // (ADR-013). This is derived STRUCTURALLY from apply's own output, not a hand-maintained
  // command-type list: that list drifted once and caused the circumcircle false-conflict, so any new
  // reuse-or-create command is now covered automatically (ADR-043/R4). The standalone `free-point`
  // command is the exception — re-placing it is a MOVE (ADR-011), handled below.
  const reusesBase = cmd.type !== 'free-point' && produced.some((o) => o.kind === 'free-point');
  for (const o of produced) {
    const existing = prev.objects.find((x) => x.id === o.id);
    if (!existing || deepEqual(existing, o)) continue;
    if (o.kind === 'free-point') {
      if (reusesBase) continue; // base corner reuses any existing point (composition)
      if (existing.kind === 'free-point') continue; // free-point command = move (ADR-011)
    }
    // A circle-point construct (tangent / arc-midpoint / point-on-circle) creates
    // its point or reuses whatever already carries that id — never a conflict.
    if (o.kind === 'on-circle') continue;
    // A line-marker (on-line) may REPOSITION an existing loose point onto its line — naming a
    // drawn perpendicular/tangent "CD" after a free "segment CD" pins C,D to the line (ADR-011
    // spirit; the actual move happens in apply, which replaces a free point with the marker).
    if (o.kind === 'on-line' && (!existing || existing.kind === 'free-point')) continue;
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

/**
 * Reject a `circles-tangent` the engine genuinely can't size — only the
 * radius-through-a-point case (its radius isn't known at apply time). Equal-radii
 * internal tangency is NOT rejected: a radius is a flexible DOF, so the apply step
 * shrinks a circle to make it work (ADR-037 Amendment 1). Returns a message or null.
 */
function circlesTangentError(prev: Construction, cmd: Command): string | null {
  if (cmd.type !== 'circles-tangent') return null;
  const circ = (id: Id) => prev.objects.find((o) => o.id === id && o.kind === 'circle') as Extract<GeoObject, { kind: 'circle' }> | undefined;
  const c1 = circ(cmd.circle1);
  const c2 = circ(cmd.circle2);
  if (!c1 || !c2) return null; // a missing circle is handled by the normal flow
  // A radius-through-a-point circle has no length known at apply time, so it can't be sized
  // for tangency. A `tangent-inner` radius is our own internal state (a re-applied tangency) —
  // allow it. Only `through` is the genuinely unsupported case.
  if (c1.radius.via === 'through' || c2.radius.via === 'through') {
    return 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)';
  }
  return null;
}

/** Apply one command and evaluate; keep the prior construction on failure. */
export function applyStep(prev: Construction, cmd: Command): StepResult {
  const prevEval = evaluate(prev);
  const prevPositions = prevEval.ok ? prevEval.positions : new Map<Id, Vec>();

  const tangentErr = circlesTangentError(prev, cmd);
  if (tangentErr) return { ok: false, error: tangentErr, construction: prev, positions: prevPositions };

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
    const constrained =
      reinterpretAsConstraint(prev, ncmd) ??
      reinterpretAsCollinear(prev, ncmd) ??
      replaceCyclicForDiameter(prev, ncmd) ??
      reinterpretDiameter(prev, ncmd);
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
    // No coincidence-free placement. If a side merely STACKS (evaluates ok but two nodes coincide), this is
    // a default collision the composition can't dodge → keep prior with a clear message (ADR-123: avoid
    // default collisions; a constraint-DRIVEN coincidence is allowed below, not here). Otherwise fall
    // through to report the default's genuine error.
    const stack = (res.ok && res.coincidences?.length ? res.coincidences : alt.ok && alt.coincidences?.length ? alt.coincidences : null);
    if (stack) return { ok: false, error: `${stack[0][0]} and ${stack[0][1]} would be at the same point`, construction: prev, positions: prevPositions };
  }

  if (!res.ok) {
    // A constraint its direct carrier alone can't satisfy ("cannot place F on AB
    // so |DE|=|DF|" — F is stuck on the segment) may still hold if the figure's
    // OTHER free DOFs move too. Recruit them and solve jointly before giving up
    // (ADR-028, extended): "find a possible configuration and use it".
    const newCons = next.constraints.slice(prev.constraints.length);
    const recruited = recruitFreeDofs(next, newCons);
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
/**
 * "diameter AD" where A and D are two vertices of a CYCLIC polygon (≥3 on-circle
 * points on the same circle): re-place ALL the polygon's vertices so A and D are
 * antipodal (AD becomes a diameter) while preserving their cyclic order and relative
 * spacing — a clean convex figure. This replaces the generic driven path, which
 * could only move ONE vertex and would shove it onto a neighbour (a degenerate quad).
 * Returns the reshaped construction, or null to fall through to the normal handling.
 */
function replaceCyclicForDiameter(prev: Construction, cmd: Command): Construction | null {
  if (cmd.type !== 'diameter') return null;
  type OnC = Extract<GeoObject, { kind: 'on-circle' }>;
  const verts = prev.objects.filter((o): o is OnC => o.kind === 'on-circle' && o.circle === cmd.circle);
  if (verts.length < 3) return null; // not a cyclic polygon → let reinterpretDiameter handle it
  if (!verts.some((v) => v.id === cmd.id1) || !verts.some((v) => v.id === cmd.id2)) return null;
  // If any vertex is already driven by another constraint (e.g. a chord with |DE|=|DF|),
  // re-placing it would break that — defer to the generic coupled driven path instead.
  const ids = new Set(verts.map((v) => v.id));
  if (prev.constraints.some((c) => constraintRefs(c).some((id) => ids.has(id)))) return null;

  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sorted = [...verts].sort((p, q) => norm(p.theta) - norm(q.theta));
  const iA = sorted.findIndex((v) => v.id === cmd.id1);
  const N = sorted.length;
  const order = Array.from({ length: N }, (_, k) => sorted[(iA + k) % N]); // A first, then CCW
  const pD = order.findIndex((v) => v.id === cmd.id2);
  if (pD <= 0) return null;
  const gaps = Array.from({ length: N }, (_, i) => norm(order[(i + 1) % N].theta - order[i].theta)); // order[i] → order[i+1]
  const arc1Span = gaps.slice(0, pD).reduce((s, g) => s + g, 0); // A → D (carries B, C, …)
  const arc2Span = gaps.slice(pD).reduce((s, g) => s + g, 0); // D → A (the other arc, wrapping)

  // Anchor A; put D antipodal; redistribute each arc's interior vertices across a
  // half-circle in proportion to their original gaps (keeps the figure's character).
  const theta = new Map<Id, number>();
  const a0 = norm(order[0].theta);
  theta.set(order[0].id, a0);
  let acc = 0;
  for (let i = 1; i < pD; i++) {
    acc += gaps[i - 1];
    theta.set(order[i].id, a0 + Math.PI * (arc1Span ? acc / arc1Span : i / pD));
  }
  theta.set(order[pD].id, a0 + Math.PI);
  acc = 0;
  for (let i = pD + 1; i < N; i++) {
    acc += gaps[i - 1];
    theta.set(order[i].id, a0 + Math.PI + Math.PI * (arc2Span ? acc / arc2Span : (i - pD) / (N - pD)));
  }

  const objects: GeoObject[] = prev.objects.map((o) => {
    // D becomes the ANTIPODE of A — so the diameter is PERSISTENT: if a later constraint
    // (e.g. ∠BDA = 24°) moves a vertex, D still sits diametrically opposite A, and D is no
    // longer a free on-circle vertex such a constraint could grab and scramble.
    if (o.id === cmd.id2 && o.kind === 'on-circle') return { kind: 'antipode', id: o.id, circle: o.circle, of: cmd.id1 };
    if (o.kind === 'on-circle' && theta.has(o.id)) return { ...o, theta: theta.get(o.id)!, solve: undefined };
    return o;
  });
  // Draw the diameter AD (dedupe — the polygon edge may already be present).
  const segId = `seg-${[cmd.id1, cmd.id2].sort().join('')}`;
  if (!objects.some((o) => o.id === segId)) objects.push({ kind: 'segment', id: segId, a: cmd.id1, b: cmd.id2 });
  return { objects, constraints: prev.constraints };
}

/**
 * The shared "reinterpret as a driven coincidence" tail (R7(2)): add `coincide(p, q)` and mark the
 * 1-DOF `carrier` (an on-circle / on-segment point) as the DOF that solves it, so the engine moves the
 * figure until p ≡ q instead of erroring. Used by both {@link reinterpretAsConstraint} (a redefined point
 * ≡ its hidden re-definition) and {@link reinterpretDiameter} (a diameter's midpoint ≡ the circle centre).
 */
function driveCoincideOn(objects: GeoObject[], priorConstraints: Constraint[], p: Id, q: Id, carrier: Id): Construction {
  const coincide: Constraint = { type: 'coincide', p, q };
  const objs = objects.map((o) =>
    o.id === carrier && (o.kind === 'on-circle' || o.kind === 'on-segment' || o.kind === 'free-point')
      ? ({ ...o, solve: { constraint: coincide, branch: 0 } } as GeoObject)
      : o,
  );
  return { objects: objs, constraints: [...priorConstraints, coincide] };
}

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
  // The diameter holds when the midpoint of AB coincides with the centre — drive a carrier to make it so.
  const objects: GeoObject[] = [
    ...prev.objects,
    { kind: 'midpoint', id: mid, a: cmd.id1, b: cmd.id2 },
    { kind: 'segment', id: `seg-${[cmd.id1, cmd.id2].sort().join('')}`, a: cmd.id1, b: cmd.id2 },
  ];
  return driveCoincideOn(objects, prev.constraints, mid, circle.center, carrier);
}

/**
 * THE ancestor walker (R7(1) — replaces the three near-duplicate walkers `freeCarrierAncestors` /
 * `freeDrivableAncestors` / `freeCarrierAncestor`). Walks the dependency graph back from `start`,
 * collecting the free DOFs it can reach:
 *  - mode `'param'`    — free 1-DOF parametric carriers only (on-circle / on-segment, not already solving).
 *  - mode `'drivable'` — the SUPERSET: also free vertices (2-DOF), shape scalars, and a free circle
 *    RADIUS ([ADR-051](docs/06-decisions.md#adr-051)), traversing through `line` / `line-intersection`
 *    definitions to reach the DOFs behind a constructed point ([ADR-032](docs/06-decisions.md#adr-032)).
 * `includeStart` (default true) considers `start` itself; pass false to drive an ANCESTOR, not `start`.
 * `param` mode stops at a free carrier; `drivable` mode records a free on-segment carrier but keeps
 * walking PAST it to the shape DOFs behind its segment (ADR-113). A SOLVING carrier is walked through.
 */
function ancestors(objects: GeoObject[], start: Id, mode: 'param' | 'drivable', includeStart = true, includeSolving = false): Id[] {
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const seen = new Set<Id>();
  const result: Id[] = [];
  const startObj = byId.get(start);
  const queue: Id[] = includeStart
    ? [start]
    : pointParents(startObj && isGeoPoint(startObj) ? startObj : ({ kind: 'free-point', id: start, x: 0, y: 0 } as GeoObject));
  if (!includeStart) seen.add(start);
  // `includeSolving` also surfaces carriers a constraint ALREADY drives (their `solve` is set) — used by
  // the R7 joint re-bind to find a CLAIMED-but-shareable DOF when no free one is reachable (ADR-045).
  const avail = (o: GeoObject) => (o as { solve?: unknown }).solve === undefined || includeSolving;
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const o = byId.get(id);
    if (!o) continue;
    if (mode === 'drivable') {
      // A point on a circle can be moved by RESIZING the circle (its free radius — ADR-051) OR by MOVING
      // its centre (a free, non-pinned centre point — ADR-103). The latter matters when a constraint needs
      // more reach than resizing gives: e.g. |CD|=36 where C,D ride two circles whose centres sit a fixed
      // gap apart — growing the radii alone caps |CD| (the circle∩circle geometry is bounded by the centre
      // gap), so the centres must spread. Surfacing the centre here is the targeted form of the ADR-095
      // gap (a constraint on a circle∩circle/derived-circle point couldn't reach the upstream circle DOFs);
      // the joint solver's regulariser keeps a surfaced-but-unneeded centre near its seed, so this doesn't
      // perturb figures that don't need it.
      for (const cid of circlesOfPoint(o)) {
        const circ = byId.get(cid);
        if (circ?.kind !== 'circle') continue;
        if (circ.radius.via === 'free' && avail(circ) && !seen.has(cid)) {
          seen.add(cid);
          result.push(cid);
        }
        const ctr = byId.get(circ.center);
        if (ctr && ctr.kind === 'free-point' && !ctr.pinned && !ctr.rigid && avail(ctr) && !seen.has(ctr.id)) {
          seen.add(ctr.id);
          result.push(ctr.id);
        }
      }
      if (o.kind === 'line') { queue.push(...lineSpecPoints(o.spec)); continue; }
      // Traverse a SECANT crossing (line∩circle) to the DOFs behind it — its line's points — so a constraint
      // on such a derived point can reach the free apex upstream (ADR-095): e.g. "∠CAE = 45" on the secant
      // point A (= line BE ∩ circle) must reach the external point B to be driven; without this the walk
      // dead-ended (pointParents has no case for it) and the angle falsely over-constrained. (A circle∩circle
      // crossing is deliberately NOT traversed: its Thales-aux chain reaches too many DOFs and over-recruits,
      // breaking sibling constraints — the secant path already reaches the apex.)
      if (o.kind === 'line-circle') {
        queue.push(o.line);
        continue;
      }
    }
    if (!isGeoPoint(o)) continue;
    const free1 = isParamCarrier(o) && avail(o);
    if (mode === 'param') {
      if (free1) { result.push(id); continue; } // a free 1-DOF carrier — stop here
      queue.push(...pointParents(o));
      continue;
    }
    const fp = o as FreePoint;
    const free2 = o.kind === 'free-point' && !fp.pinned && !fp.rigid && avail(fp);
    // A free 1-DOF param carrier is itself drivable, but an on-segment point also RIDES a segment whose
    // ENDPOINTS may carry free shape DOFs — so in the joint-solve `drivable` mode, surface BOTH: push the
    // carrier AND keep walking past it to its parents ([ADR-113](docs/06-decisions.md#adr-113)). Without
    // this the walk stopped at the carrier and a constraint needing an upstream shape to flex could only
    // slide the point and falsely over-constrained — e.g. GE⟂AB with G on the EXTENSION of a rhombus
    // diagonal BD: the only solution at the rigid rhombus is the degenerate G=D, so the rhombus angle
    // (carried by D, G's parent) must flex for G to land strictly beyond D. (`pointParents` of an
    // on-circle carrier is [], so this is effectively scoped to on-segment/extension points; the circle
    // DOFs behind an on-circle point are already surfaced above. Only the failure path uses `drivable`,
    // and the joint solver's regulariser keeps a surfaced-but-unneeded parent at its seed.)
    if (free1) { result.push(id); queue.push(...pointParents(o)); continue; }
    if (free2) { result.push(id); continue; } // a free vertex (2 DOF) is terminal — no parents
    if (isShapeCarrier(o) && avail(o)) result.push(id); // shape scalar — keep walking past it too
    if (o.kind === 'line-intersection') { queue.push(o.line1, o.line2); continue; }
    queue.push(...pointParents(o));
  }
  return result;
}

/** Every free 1-DOF carrier (on-circle / on-segment, not pinned/driven) reachable from `start`. */
const freeCarrierAncestors = (objects: GeoObject[], start: Id): Id[] => ancestors(objects, start, 'param');

/** The circle ids a point structurally lies on — so a constraint on it can reach a free-radius DOF (ADR-051). */
function circlesOfPoint(o: GeoObject): Id[] {
  switch (o.kind) {
    case 'on-circle':
    case 'line-circle':
    case 'antipode':
    case 'arc-midpoint':
      return [o.circle];
    case 'circle-circle':
      return [o.circle1, o.circle2];
    default:
      return [];
  }
}

/** The points a line is built from — so a `line-intersection` can be walked back to its DOFs. */
function lineSpecPoints(spec: LineSpec): Id[] {
  switch (spec.via) {
    case 'through': return [spec.a, spec.b];
    case 'bisector': return [spec.vertex, spec.p, spec.q];
    case 'perpendicular':
    case 'parallel': return [spec.through, spec.a, spec.b];
    case 'tangent': return [spec.at];
  }
}

/**
 * Every free, drivable DOF reachable from `start` — a free vertex (2 DOF), a free on-segment/on-circle
 * carrier (1 DOF), a shape scalar, or a free circle radius — walking through derived points AND through
 * a `line-intersection`'s defining lines, so a constraint whose points are all fixed by a construction
 * (e.g. |BD| with D = bisector∩bisector) still reaches the free triangle legs (FR-EN-11 / ADR-032).
 */
const freeDrivableAncestors = (objects: GeoObject[], start: Id): Id[] => ancestors(objects, start, 'drivable');

/**
 * A reference a blocked constraint's claimer can be RE-POINTED to instead (the "free the blocker"
 * alternative): an unclaimed, movable, non-`line` carrier — a free vertex, an extension/free on-segment,
 * a free on-circle, or a shape scalar / free-radius circle. A PINNED point or a STATED-ratio on-segment
 * (a position the student fixed) is NOT recruitable (ADR-064). Generalises the ADR-074 extension-only case.
 */
function recruitableFreeDof(o: GeoObject): boolean {
  const c = carrierOf(o);
  if (!c || c.family === 'line' || (o as { solve?: unknown }).solve !== undefined) return false;
  switch (o.kind) {
    case 'free-point':
      return !o.pinned && !o.rigid;
    case 'on-segment':
      return o.free === true || o.extension === true;
    case 'on-circle':
      return o.free === true;
    default:
      return true; // perp-offset / rotated / scaled-offset / free-radius circle
  }
}

/** Mark a free vertex / parametric / shape-scalar carrier as driving `K`. (An on-line marker is
 *  driven directly by `driveOrCheck`, not recruited here, so the `line` family is excluded.) */
function markDriven(o: GeoObject, K: Constraint): GeoObject {
  const carrier = carrierOf(o);
  if (carrier && carrier.family !== 'line') return { ...o, solve: { constraint: K, branch: 0 } } as GeoObject;
  return o;
}

/**
 * Last resort when a constraint can't be met by its direct carrier: turn the free DOFs
 * the constraint transitively depends on into joint carriers, so the numeric solver
 * (resolveDriven) can reconfigure the figure to satisfy it. Two cases:
 *  (A) an on-segment-solved carrier exists but can't satisfy alone → recruit its other free ancestors;
 *  (B) a just-added constraint has NO carrier (all its refs are derived — e.g. |BD| where B,D are
 *      construction points) → recruit ONE distinct free ancestor per constraint, so each gets its own
 *      carrier and the joint solver sizes the figure. The constraint is already present as a check.
 * Returns the recruited construction, or null if there's nothing extra to move.
 */
function recruitFreeDofs(c: Construction, newCons: Constraint[] = []): Construction | null {
  let objects = [...c.objects];
  const added: Constraint[] = [];
  let changed = false;
  // (A)
  const solved = objects.filter((o): o is Extract<GeoObject, { kind: 'on-segment-solved' }> => o.kind === 'on-segment-solved');
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
  // (B) — recruit MORE free ancestors for each new constraint (this only runs after evaluate
  // already failed). driveOrCheck may have picked a carrier that can't actually move the
  // constraint (a rectangle's |AD| drives A, but |AD| is the height behind D); so we don't skip
  // an "already-driven" constraint — we add its other reachable, not-yet-driving DOFs (the height
  // `C`, a rhombus's `rotated` angle behind C). The joint solver moves only the ones that matter
  // (the regulariser keeps the rest near their seed).
  for (const K of newCons) {
    let did = false;
    const cand = [...new Set(constraintRefs(K).flatMap((ref) => freeDrivableAncestors(objects, ref)))].filter((id) => !isSolving(objects, id));
    if (cand.length > 0) {
      changed = true;
      did = true;
      objects = objects.map((o) => (cand.includes(o.id) ? markDriven(o, K) : o));
    }
    // (D) FREE THE BLOCKER (R7(3) / [ADR-074](docs/06-decisions.md#adr-074)): K needs a free DOF that an
    // EARLIER constraint K1 already CLAIMED (the greedy apply-time pick), and K1 references ANOTHER free
    // DOF it could drive INSTEAD. Re-point K1 → that alternative and release the claimed DOF to K, so both
    // keep a carrier and the joint solver redistributes. Two instances of one pattern: AG⟂AD drives its
    // extension point G, freeing the apex A for ∠ADB (ADR-074); and |AB|=5 drives vertex A, freeing B for
    // |BC|=5 so an equilateral / AAS triangle (every side or two-angles+side stated) solves instead of
    // falsely over-constraining. Runs ONLY on the failure path, so eagerly-satisfied figures (e.g. a
    // stated-extension point a relation must NOT drag, ADR-064) never reach it and are untouched.
    const reachable = new Set(constraintRefs(K).flatMap((ref) => ancestors(objects, ref, 'drivable', true, true)));
    for (const x of objects) {
      if (!reachable.has(x.id)) continue;
      const sv = (x as { solve?: { constraint: Constraint } }).solve;
      if (!sv || sv.constraint === K) continue; // x must be CLAIMED by a DIFFERENT constraint K1
      const K1 = sv.constraint;
      const alt = objects.find((o) => o.id !== x.id && recruitableFreeDof(o) && constraintRefs(K1).includes(o.id));
      if (!alt) continue;
      objects = objects.map((o) =>
        o.id === alt.id ? ({ ...o, solve: { constraint: K1, branch: 0 } } as GeoObject) : o.id === x.id ? markDriven(o, K) : o,
      );
      changed = true;
      did = true;
      break;
    }
    // VERIFY before skipping the redundancy cases ([ADR-139](docs/06-decisions.md#adr-139)). Case (B) can
    // recruit a DECOY free DOF — a free ancestor of K that does NOT free the genuinely-contested carrier
    // (e.g. a kite+tangents figure where the 2nd tangency `OD⟂AD` needs D's θ, but D is double-booked by the
    // REDUNDANT kite `AB=AD`: case (B) grabs the apex `A` instead). That decoy both sets `did` (which would
    // skip the self-verifying redundancy cases (C)/(E)) and CONSUMES the DOF that case (D) needed as its
    // `alt` to free the blocker — so neither redundancy case runs and the figure falsely over-constrains.
    // So `did` only earns a skip when the recruitment ACTUALLY makes the whole system valid; otherwise fall
    // through to (C)/(E), which are self-verifying (a lend is accepted only if `evaluate` passes) and so can
    // never rescue a genuinely-impossible figure. Costs one extra `evaluate` per recruited constraint, on
    // the already-failing path only — recruitFreeDofs runs only after `evaluate` already failed once.
    if (did && evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) continue;
    // (C) R7 JOINT RE-BIND ([ADR-045](docs/06-decisions.md#adr-045) step 3): no FREE DOF is reachable —
    // every DOF K could move is already CLAIMED by an earlier constraint (e.g. HF=4/GE=5 took a
    // parallelogram's free vertices, so a later "ABHD concyclic" finds them all busy). The figure can
    // still flex IF some claimed DOF's constraint is OVER-SUBSCRIBED (≥2 carriers = slack): re-point one
    // such DOF to K so K joins the joint solve while every existing constraint keeps a carrier. If no
    // reachable DOF has slack, the system is genuinely over-constrained — leave it to fail honestly.
    const carrierCount = new Map<Constraint, number>();
    for (const o of objects) {
      const sv = (o as { solve?: { constraint: Constraint } }).solve;
      if (sv) carrierCount.set(sv.constraint, (carrierCount.get(sv.constraint) ?? 0) + 1);
    }
    const reach = new Set(constraintRefs(K).flatMap((ref) => ancestors(objects, ref, 'drivable', true, true)));
    const steal = objects.find((o) => {
      const sv = (o as { solve?: { constraint: Constraint } }).solve;
      return reach.has(o.id) && sv && (carrierCount.get(sv.constraint) ?? 0) >= 2;
    });
    if (steal) {
      changed = true;
      objects = objects.map((o) => (o.id === steal.id ? markDriven(o, K) : o)); // K already in c.constraints (pushed as a check)
      // VERIFY, as for case (B)/(D) above ([ADR-139](docs/06-decisions.md#adr-139)): a steal that doesn't
      // resolve the over-constraint — e.g. a DEGENERATE self-steal where K is itself the over-subscribed
      // constraint (driveOrCheck gave it a carrier at apply-time AND case (B) added the decoy A, so K has 2
      // carriers and `steal` re-points one of K's own carriers back to K, a no-op) — must NOT pre-empt the
      // self-verifying redundant-lend (E). Fall through when it doesn't help.
      if (evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) continue;
    }
    // (E) REDUNDANT-CARRIER LEND: no free DOF and no over-subscribed carrier — yet the figure may still be
    // solvable when an earlier constraint K1 is REDUNDANT (already implied by the rest, e.g. a kite's `AB=AD`
    // implied by two tangencies AB,AD to the circle). The greedy assignment gave K1 a private carrier it
    // doesn't actually need, exhausting the DOF the new constraint K wants. Try LENDING each reachable claimed
    // carrier to K (K1 stays a check) and accept the FIRST lend under which the WHOLE system — every
    // constraint, K and K1 included — evaluates valid. Self-verifying: a lend that breaks K1 fails `evaluate`
    // and is rejected, so this never yields a wrong figure; it only recovers a real configuration the greedy
    // carrier model couldn't reach. Runs last, only on the failure path.
    const lendable = objects
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => {
        const sv = (o as { solve?: { constraint: Constraint } }).solve;
        return reach.has(o.id) && sv && sv.constraint !== K;
      })
      .sort((a, b) => b.i - a.i); // try the most-recently-added carrier first (keeps base geometry stable)
    for (const { o } of lendable) {
      const trial = objects.map((x) => (x.id === o.id ? markDriven(x, K) : x));
      const r = evaluate({ objects: trial, constraints: [...c.constraints, ...added] });
      if (r.ok) { objects = trial; changed = true; break; }
    }
  }
  return changed ? { objects, constraints: [...c.constraints, ...added] } : null;
}

/** Is point `id` already driving some constraint? */
function isSolving(objects: GeoObject[], id: Id): boolean {
  const o = objects.find((x) => x.id === id);
  return !!o && (o as { solve?: unknown }).solve !== undefined;
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
 * The free 1-DOF ancestor (on-circle / on-segment) of `start` to drive, or null — the most-recently-
 * added (highest index) one, the DOF most likely meant to be pinned down. Excludes `start` itself
 * (drive an ANCESTOR). Now via the one `ancestors` walker (R7(1)); unlike the old bespoke walk it skips
 * an already-SOLVING carrier (which couldn't be re-driven anyway) and finds a free one past it.
 */
function freeCarrierAncestor(objects: GeoObject[], start: Id): Id | null {
  const cands = ancestors(objects, start, 'param', false);
  if (!cands.length) return null;
  const idx = (id: Id) => objects.findIndex((x) => x.id === id);
  return cands.reduce((best, id) => (idx(id) > idx(best) ? id : best), cands[0]);
}

/**
 * Reinterpret a redefining placement as a coincidence: keep the existing point P,
 * add the new definition as a HIDDEN target `~P`, constrain P ≡ ~P, and mark a
 * free upstream DOF as solved to satisfy it. Returns the new construction, or null
 * if this can't be expressed (no single-point placement, or no free DOF upstream).
 */
function reinterpretAsConstraint(prev: Construction, cmd: Command): Construction | null {
  if (!POINT_PLACEMENTS.has(cmd.type)) return null;
  if (cmd.type === 'point-on-segment') return null; // a "P on segment" redefinition is a COLLINEARITY → reinterpretAsCollinear owns it
  const P = (cmd as { id?: Id }).id;
  if (!P) return null;
  const existing = prev.objects.find((o) => o.id === P);
  if (!existing || !isGeoPoint(existing)) return null; // only a *re*definition of an existing point
  const H = `~${P}`;
  if (prev.objects.some((o) => o.id === H)) return null; // already reinterpreted once
  // GENERAL "use the existing point" rule: a second statement that would re-place an EXISTING point P
  // ("A is the midpoint of CD", "F is the foot from C to AB", "P is the intersection of …") is a
  // CONSTRAINT on P, not a redefinition. Prefer P's OWN free 1-DOF as the carrier — a non-extension
  // on-segment `t` or an on-circle `θ` — so P slides to the stated spot directly (an EXTENSION point is
  // excluded: its t>1 clamp can't reach an interior target — drive an ancestor instead). A DERIVED P (an
  // intersection with no own DOF) falls back to a free ancestor (the ADR-028 "C = midpoint of OB" case).
  const ownFree =
    (existing as { solve?: unknown }).solve === undefined &&
    ((existing.kind === 'on-segment' && !(existing as { extension?: boolean }).extension) ||
      existing.kind === 'on-circle' ||
      (existing.kind === 'free-point' && !(existing as { pinned?: boolean }).pinned && !(existing as { rigid?: boolean }).rigid));
  const carrier = (ownFree ? P : null) ?? freeCarrierAncestor(prev.objects, P);
  if (!carrier) return null; // nothing free to move → a genuine over-constraint
  const withHelper = applyCommand(prev, { ...(cmd as object), id: H } as Command); // the new def under the hidden id
  return driveCoincideOn(withHelper.objects, withHelper.constraints, P, H, carrier);
}

/**
 * Reinterpret a redefining "P on segment a→b" (incl. the "on the extension of" form) as a
 * COLLINEARITY constraint when P already exists as a free carrier: instead of erroring "P is
 * already defined", keep P where it is and slide its own DOF until P lies on line a→b (ADR-050).
 * This is the on-line analogue of {@link reinterpretAsConstraint} (which handles a fixed second
 * *placement* via a coincidence): "E on line AC" where E is already a free point on a circle should
 * move E onto the line, not redefine it at a fixed t. Returns null (→ the genuine conflict) when P
 * isn't an existing point, has no free DOF of its own, or is already driving another constraint.
 */
function reinterpretAsCollinear(prev: Construction, cmd: Command): Construction | null {
  if (cmd.type !== 'point-on-segment') return null;
  const existing = prev.objects.find((o) => o.id === cmd.id);
  if (!existing || !isGeoPoint(existing)) return null; // only a *re*definition of an existing point
  // P must still carry a free 1-DOF (on-circle / on-segment) to slide onto the line; a determined
  // or already-driven P falls through to the normal conflict (a genuine over-constraint).
  const carrier = carrierOf(existing);
  if (!carrier || carrier.family !== 'param' || (existing as { solve?: unknown }).solve !== undefined) return null;
  return applyCommand(prev, { type: 'set-collinear', a: cmd.id, b: cmd.a, c: cmd.b });
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
  // A composition must not default two nodes onto each other — a placement that COINCIDES is not "clean"
  // even though `evaluate` now allows a coincidence (a constraint-DRIVEN one is fine, but a default-placement
  // one is avoidable: flip to the other side). So prefer a coincidence-free side; if neither is clean, this
  // composition can't avoid a collision → null (applyStep keeps prior). ([ADR-123](docs/06-decisions.md#adr-124).)
  const clean = (e: EvalResult): e is Extract<EvalResult, { ok: true }> => e.ok && !(e.coincidences && e.coincidences.length > 0);
  if (clean(defEval) && clean(mirEval)) {
    const flip = preferMirror(prev, cmd, prevPos, defEval.positions);
    return flip
      ? { construction: mir, positions: mirEval.positions }
      : { construction: def, positions: defEval.positions };
  }
  if (clean(defEval)) return { construction: def, positions: defEval.positions };
  if (clean(mirEval)) return { construction: mir, positions: mirEval.positions };
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
export function build(cmds: AnyCommand[], start: Construction = emptyConstruction()): {
  construction: Construction;
  positions: Map<Id, Vec>;
} {
  let cur = start;
  for (const cmd of lower(cmds)) {
    const r = applyStep(cur, cmd);
    if (!r.ok) throw new Error(`unexpected failure on '${cmd.type}': ${r.error}`);
    cur = r.construction;
  }
  const e = evaluate(cur);
  if (!e.ok) throw new Error(e.error);
  return { construction: cur, positions: e.positions };
}

/**
 * For each circle in the figure, the point ids KNOWN (structurally) to lie on it — keyed by the
 * circle's CENTRE letter (matching the parser's `ParseContext.circles`). Lets the parser resolve
 * a phrase like "arc BC" to the circle that actually contains both B and C, disambiguating two
 * circles and correcting a wrongly-named one. Membership comes from the object graph (on-circle,
 * circumcentre vertices, antipode/arc/line∩circle/circle∩circle outputs), not from constraints.
 */
export function circleMembers(c: Construction): { center: string; points: Id[] }[] {
  const byCenter = new Map<string, Set<Id>>();
  const centerOf = (circleId: Id): string | null => {
    const circ = c.objects.find((o) => o.id === circleId && o.kind === 'circle');
    return circ && circ.kind === 'circle' ? circ.center : null;
  };
  const add = (center: string | null, ...pts: Id[]) => {
    if (!center) return;
    const set = byCenter.get(center) ?? new Set<Id>();
    for (const p of pts) set.add(p);
    byCenter.set(center, set);
  };
  for (const o of c.objects) {
    switch (o.kind) {
      case 'circle': add(o.center); break; // ensure the circle appears even with no known members yet
      case 'on-circle': add(centerOf(o.circle), o.id); break;
      case 'circumcenter': add(o.id, o.a, o.b, o.c); break; // a,b,c lie on the circle centred at o.id
      case 'antipode': add(centerOf(o.circle), o.id, o.of); break;
      case 'arc-midpoint': add(centerOf(o.circle), o.id, o.from, o.to); break;
      case 'line-circle': add(centerOf(o.circle), o.id); break;
      case 'circle-circle': add(centerOf(o.circle1), o.id); add(centerOf(o.circle2), o.id); break;
    }
  }
  return [...byCenter].map(([center, points]) => ({ center, points: [...points] }));
}

/**
 * For each point, the points it is directly joined to — by a drawn segment OR a polygon edge. Lets the
 * parser resolve a SINGLE-VERTEX angle ("∠C") to its two arms (the two points C is connected to), so
 * "∠C קהה" (obtuse) / "∠C חדה" (acute) can name the interior angle without spelling all three letters.
 */
export function pointNeighbors(c: Construction): Record<Id, Id[]> {
  const nb = new Map<Id, Set<Id>>();
  const add = (x: Id, y: Id) => {
    (nb.get(x) ?? nb.set(x, new Set()).get(x)!).add(y);
    (nb.get(y) ?? nb.set(y, new Set()).get(y)!).add(x);
  };
  for (const o of c.objects) {
    if (o.kind === 'segment') add(o.a, o.b);
    else if (o.kind === 'polygon') for (let i = 0; i < o.vertices.length; i++) add(o.vertices[i], o.vertices[(i + 1) % o.vertices.length]);
  }
  return Object.fromEntries([...nb].map(([k, set]) => [k, [...set]]));
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
  // A crossing pinned to "the OTHER one" (avoid) is determined — not cyclable (line∩circle or circle∩circle).
  if ((o.kind === 'line-circle' || o.kind === 'circle-circle') && o.avoid) return 1;
  // Both arcs have a midpoint; a line/another circle meets a circle in up to two points.
  if (o.kind === 'arc-midpoint' || o.kind === 'line-circle' || o.kind === 'circle-circle') return 2;
  return 0;
}

/** The branchable point kinds whose `branch` index "show another configuration" cycles. */
const BRANCHABLE = new Set(['intersection', 'on-segment-solved', 'arc-midpoint', 'line-circle', 'circle-circle']);

/**
 * True when two branchable points index branches of the SAME underlying multi-solution
 * intersection (two circles crossing, a line cutting a circle, a circle∩circle pair). When
 * both branches of such a source are already materialised as two distinct points, cycling
 * either one's branch just collides it onto its sibling (or relabels the pair) — not a new
 * configuration.
 */
function sameBranchSource(a: GeoObject, b: GeoObject): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'circle-circle' && b.kind === 'circle-circle')
    return (a.circle1 === b.circle1 && a.circle2 === b.circle2) || (a.circle1 === b.circle2 && a.circle2 === b.circle1);
  if (a.kind === 'line-circle' && b.kind === 'line-circle') return a.line === b.line && a.circle === b.circle;
  if (a.kind === 'intersection' && b.kind === 'intersection')
    return (a.center1 === b.center1 && a.center2 === b.center2) || (a.center1 === b.center2 && a.center2 === b.center1);
  return false;
}

/**
 * Whether cycling `id`'s branch reaches a configuration not already drawn by a sibling point.
 * For a two-circle figure where A and B are the SAME crossing at branches 0 and 1, every branch
 * is already on screen — cycling would only collide A onto B — so this returns false and "show
 * another configuration" resamples the circles instead of stepping a meaningless branch (ADR-022).
 */
export function cyclableBranch(c: Construction, id: Id): boolean {
  const o = c.objects.find((x) => x.id === id);
  if (!o || !('branch' in o)) return false;
  const n = branchCount(c, id);
  if (n <= 1) return false;
  const occupied = new Set<number>([o.branch % n]);
  for (const s of c.objects) if (s.id !== id && 'branch' in s && sameBranchSource(o, s)) occupied.add(s.branch % n);
  return occupied.size < n; // an unshown branch remains
}

/**
 * The first object whose discrete `branch` can be stepped to a still-unshown configuration —
 * the single source of truth for "is there an alternative to cycle?" The UI and tests call this
 * instead of re-listing the branchable kinds (which had drifted out of sync, ADR-043). Includes
 * `on-segment-solved`, so a driven on-segment point is offered as cyclable (R2).
 */
export function firstCyclableBranch(c: Construction): Id | undefined {
  return c.objects.find((o) => BRANCHABLE.has(o.kind) && cyclableBranch(c, o.id))?.id;
}

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
