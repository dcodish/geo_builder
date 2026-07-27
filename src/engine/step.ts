/**
 * Step orchestration: apply a command and evaluate. On failure the PREVIOUS
 * construction is kept (the contradiction is reported, the figure is not
 * corrupted — FR-EN-8). Also: alternative-branch cycling and small helpers.
 *
 * (The full store with history/undo is Phase 3; this is the minimal harness
 * the Phase-1 gate needs.)
 */

import type { AnyCommand, Command, Constraint, Construction, FreePoint, GeoObject, Id, LineSpec, SolveDirective, Vec } from './types';
import { LEN_EPS, isGeoPoint, isOrderConstraint } from './types';
import { addCollinearOrder, applyCommand, mirrorComposition, normalizeShapeComposition, shapeLowersToConstraints, wouldInvertDependency } from './apply';
import { lower } from './lower';
import { evaluate, resolveDriven } from './evaluate';
import type { EvalResult } from './evaluate';
import { circleCircleIntersect, dist, sub } from './geometry';
import { budgetExceeded } from './solveBudget';
import { carrierOf, isShapeCarrier, isParamCarrier } from './carriers';
import { componentOf, minimalComponentOf } from './components';
import { applySeed, freeDofs } from './sample';
import { constraintKey, constraintRefs, describeConstraint, solvedOnSegmentCandidates } from './solve';

export interface StepOk {
  ok: true;
  construction: Construction;
  positions: Map<Id, Vec>;
  /** Ordered trace of the ladder stages traversed (docs/LADDER.md) — diagnostic metadata, never semantics. */
  ladder?: string[];
}
export interface StepErr {
  ok: false;
  error: string;
  construction: Construction; // the previous (kept) construction
  positions: Map<Id, Vec>;
  /** Ordered trace of the ladder stages traversed (docs/LADDER.md) — diagnostic metadata, never semantics. */
  ladder?: string[];
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

/** The kinds a shape command's DERIVED corners are built as (audit 2026-07-20: produced ONLY by
 *  square/rectangle/rhombus/parallelogram/trapezoid/right-triangle) — the M1 reinterpretation key
 *  in {@link commandConflict} (#223 / ADR-375). */
const SHAPE_CORNER_KINDS = new Set(['derived', 'perp-offset', 'parallelogram-vertex', 'rotated', 'scaled-offset']);

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
      // An `ifAbsent` ensure-exists free point never conflicts — apply skips it entirely when the
      // id already exists as anything (ADR-236; the parse context may not know the point exists).
      if (cmd.type === 'free-point' && cmd.ifAbsent) continue;
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
    // A right-triangle's derived leg vertex (perp-offset) landing on an existing point: apply's own
    // case reinterprets it as a right-angle CONSTRAINT (Q8, ADR-223 — semantic vertex order, so it
    // is not in the quad-family DERIVED_SLOTS rotation/lowering machinery).
    if (cmd.type === 'right-triangle' && o.kind === 'perp-offset' && isGeoPoint(existing)) continue;
    // A QUAD-family shape's derived corner (perp-offset / parallelogram-vertex / rotated /
    // scaled-offset / derived, from the empty-construction probe above) landing on an existing point
    // is NOT a redefinition when apply will LOWER the shape to its defining constraints over the
    // existing points (M1 — «FEDG מלבן» over four on-segment riders asserts the rectangle relations
    // and flexes the figure; #223 / ADR-375). The shared predicate excludes a vertex cycle already
    // DECLARED as a shape — ADR-157 immutability: re-declaring a trapezoid's cycle as a square stays
    // THIS refusal, never a silent morph.
    if (SHAPE_CORNER_KINDS.has(o.kind) && isGeoPoint(existing) && shapeLowersToConstraints(prev, cmd)) continue;
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

/**
 * Reject a constraint whose operand is STRUCTURALLY degenerate by id — a zero-length ∥/⟂ segment
 * ("BB"), an angle whose ray repeats its vertex ("∠ABB"), or a collinearity naming the same point
 * twice — so its residual is NaN by construction (`angleDeg` of a zero ray, `unit(0)` of a collapsed
 * direction). Left to the solver this doesn't fail cleanly: `recruitFreeDofs` chases the NaN over
 * every free DOF and the joint optimizer churns for seconds before reporting a bogus over-constraint
 * (and in the app the config search runs that slow replay many times → a UI freeze — the ADR-202
 * class; the set-angle sibling was later PROVEN reachable from typed input, ~20 s per submit, so the
 * guard now covers the whole NaN-by-id class, not just ∥/⟂). The degeneracy is structural (by id),
 * so catch it here — cheaply, before any evaluate — for whatever produced it: a parser typo, the
 * LLM, or a student typing "AA ⟂ BC" / "זווית ABB = 40". A well-formed constraint always names
 * distinct points where a direction/ray needs them, so this never rejects a valid one.
 */
function degenerateConstraintError(cmd: Command): string | null {
  switch (cmd.type) {
    case 'set-perpendicular':
    case 'set-parallel': {
      if (cmd.a !== cmd.b && cmd.c !== cmd.d) return null;
      const rel = cmd.type === 'set-perpendicular' ? '⟂' : '∥';
      const degenerate = cmd.a === cmd.b ? `${cmd.a}${cmd.b}` : `${cmd.c}${cmd.d}`;
      return `${rel} needs two distinct points on each side — "${degenerate}" is a single point, not a segment`;
    }
    // An angle's ray must leave its vertex — vertex === ray ⇒ a zero ray ⇒ angleDeg is NaN.
    case 'set-angle':
    case 'set-angle-acuteness':
    case 'set-angle-bound':
      return cmd.vertex === cmd.ray1 || cmd.vertex === cmd.ray2
        ? `an angle needs three distinct points — "∠${cmd.ray1}${cmd.vertex}${cmd.ray2}" repeats its vertex`
        : null;
    case 'set-angle-ratio':
    case 'set-angle-order': {
      const bad =
        cmd.v1 === cmd.a1 || cmd.v1 === cmd.b1
          ? `∠${cmd.a1}${cmd.v1}${cmd.b1}`
          : cmd.v2 === cmd.a2 || cmd.v2 === cmd.b2
            ? `∠${cmd.a2}${cmd.v2}${cmd.b2}`
            : null;
      return bad ? `an angle needs three distinct points — "${bad}" repeats its vertex` : null;
    }
    // Collinearity through a repeated point has a collapsed ray (NaN residual, see solve.ts `collinear`).
    case 'set-collinear':
      return cmd.a === cmd.b || cmd.a === cmd.c
        ? `collinear points must be distinct — "${cmd.a}" is named twice`
        : null;
    case 'set-line': {
      const dup = cmd.points.find((p, i) => cmd.points.indexOf(p) !== i);
      return dup !== undefined ? `collinear points must be distinct — "${dup}" is named twice` : null;
    }
    // A measure-sum's ANGLE term with vertex === ray is a zero ray (NaN, the set-angle case); a
    // repeated-id LENGTH pair "AA" is honestly 0 there, but in a length-PRODUCT a zero factor makes
    // the LOG residual NaN at every configuration — the exact churn class this guard exists for.
    case 'set-measure-sum': {
      if (cmd.unit === 'length') {
        for (let i = 0; i + 1 < cmd.points.length; i += 2)
          if (cmd.points[i] === cmd.points[i + 1])
            return `a length needs two distinct points — "${cmd.points[i]}${cmd.points[i + 1]}" is a single point, not a segment`;
        return null;
      }
      for (let i = 0; i + 2 < cmd.points.length; i += 3)
        if (cmd.points[i + 1] === cmd.points[i] || cmd.points[i + 1] === cmd.points[i + 2])
          return `an angle needs three distinct points — "∠${cmd.points[i]}${cmd.points[i + 1]}${cmd.points[i + 2]}" repeats its vertex`;
      return null;
    }
    case 'set-length-product': {
      for (const side of [cmd.lhs, cmd.rhs])
        for (let i = 0; i + 1 < side.length; i += 2)
          if (side[i] === side[i + 1])
            return `a length needs two distinct points — "${side[i]}${side[i + 1]}" is a single point, not a segment`;
      return null;
    }
    default:
      return null;
  }
}

/**
 * VACUOUS-SATISFACTION gate at the step-accept boundary (issue #7, the B13 corpus finding): a solve
 * result in which two DISTINCT points referenced by one of THIS step's new constraints coincide has
 * satisfied that constraint by COLLAPSE (0 = 0), not by geometry — B13's "GA = AC" (G the extension
 * point of CA at its default t) was "satisfied" by driving the free on-circle vertex A exactly onto C,
 * zeroing both lengths; `isSatisfied` and the relative residual (0 / max(scale,1e-9)) both read that as
 * perfect. The driven solvers already refuse such roots inside their own accept (`solutionAccepted`,
 * and the closed-form `solvedOnSegmentCandidates` discard), but the FAILURE-PATH accepts — the
 * recruiter's experiments, reinterpret-as-constraint, scale rescue — admitted whatever plain `evaluate`
 * passed. One shared gate at every applyStep accept closes the class. Scoped per-constraint (each new
 * non-`coincide` constraint's OWN refs must be pairwise distinct, at the same 1e-3·extent threshold as
 * `solutionAccepted`), so ADR-123's allowed forced coincidence — a driven point landing on a point the
 * driving constraint does NOT reference (N ≡ O) — is untouched; pairs a declared `coincide` merges are
 * exempt.
 */
function newConstraintsNonVacuous(c: Construction, positions: Map<Id, Vec>, newCons: Constraint[]): boolean {
  const merged = new Set(c.constraints.filter((k) => k.type === 'coincide').map((k) => [k.p, k.q].sort().join('|')));
  for (const con of newCons) {
    if (con.type === 'coincide') continue;
    const refs = [...new Set(constraintRefs(con))];
    const pts = refs.map((id) => positions.get(id));
    let ext = 1;
    for (const p of pts) if (p) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y));
    const eps = 1e-3 * ext;
    for (let i = 0; i < refs.length; i++)
      for (let j = i + 1; j < refs.length; j++) {
        if (merged.has([refs[i], refs[j]].sort().join('|'))) continue;
        const p = pts[i], q = pts[j];
        if (p && q && Math.hypot(p.x - q.x, p.y - q.y) < eps) return false;
      }
  }
  return true;
}

/**
 * Blame honesty (issue #37): an over-constrained refusal names the STUDENT'S new statement, not a
 * collateral casualty. The primary joint solve's violated set can be an EARLIER given the compromise
 * basin broke while satisfying the new one ("ישר BAE" refused as "|GA| = |AC| cannot hold") — the
 * student's last input is the statement being refused, so the message must describe IT. Substituted
 * only for the over-constrained shape (an unknown-point / dependency error stays verbatim) and only
 * when the failure step actually added constraints.
 */
function blameNewStatement(error: string, newCons: Constraint[]): string {
  if (!newCons.length || !error.startsWith('over-constrained')) return error;
  return `over-constrained: ${describeConstraint(newCons[0])} cannot hold`;
}

/**
 * STAGE-0 of the failure path (M2 minimal-first on the PRIMARY seam — ADR-276, issue #37): before
 * recruiting more DOFs, try satisfying the NEW statement's own carriers over the PRIOR figure's solved
 * values FROZEN in place.
 *
 * Why: `evaluate` re-solves EVERY standing directive jointly on each call, so a new constraint whose own
 * carrier could satisfy it alone (E's on-line offset sliding to the tangent∩line crossing) instead
 * re-opens the whole coupled system (a 5-carrier |GA|=|AC| + area-ratio soup) from its seeds — the joint
 * descent lands in a compromise basin, an EARLIER given reads violated, and the step is refused with the
 * blame on the collateral casualty. The committed prior figure was already a valid solution: freeze it
 * (the ADR-229 bake — params written, directives cleared), attach only the new command's directives
 * (seeded from the frozen values), and solve. Succeeds ⇒ the figure moves minimally (the stability
 * principle: existing points don't jump) and the recruiter rampage never runs.
 *
 * Restore law (ADR-229/F2, ADR-231): the freeze is for the experiment, never a permanent ownership
 * strip — after a successful frozen solve, the standing directives are re-attached on top of the solved
 * params (the joint system warm-starts AT a solution and lands back on it), so later givens still find
 * their carriers. Only when the restored form fails does the frozen form commit (never worse than the
 * refusal it replaces).
 */
function settleOnFrozenPrior(
  prev: Construction,
  next: Construction,
  newCons: Constraint[],
): { construction: Construction; positions: Map<Id, Vec> } | null {
  const prevRes = evaluate(prev);
  if (!prevRes.ok) return null; // no valid prior solution to freeze
  const baked = resolveDriven(prev); // prior solved params written, directives cleared
  const bakedById = new Map(baked.objects.map((o) => [o.id, o] as const));
  const prevById = new Map(prev.objects.map((o) => [o.id, o] as const));
  const strip = (o: GeoObject) => JSON.stringify({ ...o, solve: undefined });
  let anyFrozen = false;
  const trialObjects = next.objects.map((o) => {
    const po = prevById.get(o.id);
    const b = bakedById.get(o.id);
    if (!po || !b) return o; // brand-new object — keep as the command built it
    if (o !== po && strip(o) !== strip(po)) return o; // the command REWROTE it (M1 lowering etc.) — not frozen
    const oSolve = (o as { solve?: SolveDirective }).solve;
    const pSolve = (po as { solve?: SolveDirective }).solve;
    if (pSolve !== undefined) anyFrozen = true;
    const solveSame = oSolve === pSolve || JSON.stringify(oSolve ?? null) === JSON.stringify(pSolve ?? null);
    if (solveSame) return b; // frozen at the prior solved value
    return { ...b, solve: oSolve } as GeoObject; // the NEW directive, seeded from the prior solved value
  });
  if (!anyFrozen) return null; // nothing was jointly driven before — the primary attempt already was minimal
  const trial: Construction = { ...next, objects: trialObjects };
  const r = evaluate(trial);
  if (!r.ok || !newConstraintsNonVacuous(trial, r.positions, newCons)) return null;
  // Re-attach the standing directives on top of the SOLVED params (ownership restore).
  const solvedTrial = resolveDriven(trial);
  const stById = new Map(solvedTrial.objects.map((o) => [o.id, o] as const));
  const restoredObjects = next.objects.map((o) => {
    const st = stById.get(o.id);
    if (!st) return o;
    const oSolve = (o as { solve?: SolveDirective }).solve;
    return (oSolve ? { ...st, solve: oSolve } : st) as GeoObject;
  });
  const restored: Construction = { ...next, objects: restoredObjects };
  const r3 = evaluate(restored);
  if (r3.ok && newConstraintsNonVacuous(restored, r3.positions, newCons)) return { construction: restored, positions: r3.positions };
  return { construction: trial, positions: r.positions };
}

/**
 * JOINT-FIRST component solve (S3.2 stage (b), docs/25 §4 — operator-approved 2026-07-25).
 *
 * Before the recruit ladder negotiates ownership rung by rung, solve the NEW statement's constraint
 * COMPONENT as ONE system (ADR-338's semantics promoted from applyCoupledStep's special case to the
 * default failure path): the minimal closed sub-component first (the ADR-281 least-ownership lesson
 * at component granularity), the full component second. The assignment is derived, not negotiated —
 * every component DOF becomes a carrier and every component constraint attaches (one directive
 * carries the set via `solve.also`, the ADR-229 mechanism; `resolveMixedCarriers` already minimises
 * every constraint on every carrier, so attaching all-then-evaluating IS the joint solve). Fully
 * try-and-verify (evaluate + the vacuous gate) with the S1.1 ladder as LIVE FALLBACK — this stage
 * can only widen rescue power; rung retirement is stage (c), evidence-gated per docs/25 §4.
 * Size-guarded (≤16 DOFs, ≤24 constraints) so a pathological whole-figure component falls through
 * to the staged ladder instead of a huge joint descent.
 */
function jointFirst(
  next: Construction,
  newCons: Constraint[],
  trace: string[],
): Construction | null {
  const real = newCons.filter((k) => !isOrderConstraint(k));
  if (!real.length || budgetExceeded()) return null;
  const tried = new Set<string>();
  for (const [tag, comp] of [
    ['minimal', minimalComponentOf(next, real, allDrivableAncestors)],
    ['full', componentOf(next, real, allDrivableAncestors)],
  ] as const) {
    if (!comp || comp.dofs.length === 0) continue;
    if (comp.dofs.length > 16 || comp.constraints.length > 24) continue;
    const key = comp.dofs.join('|') + '§' + comp.constraints.length;
    if (tried.has(key)) continue; // minimal == full — one attempt
    tried.add(key);
    trace.push(`component:${tag}{cons:${comp.constraints.length},dofs:${comp.dofs.length}}`);
    const members = comp.constraints.filter((k) => !isOrderConstraint(k)); // orders ride withOrderCons
    if (!members.length) continue;
    const [head, ...rest] = members;
    let headCarried = false;
    const objects = next.objects.map((o) => {
      if (!comp.dofs.includes(o.id)) return o;
      const carrier = carrierOf(o);
      if (!carrier || carrier.family === 'line') return o;
      if (!headCarried) {
        headCarried = true;
        return { ...o, solve: { constraint: head, branch: 0, ...(rest.length ? { also: rest } : {}) } } as GeoObject;
      }
      return { ...o, solve: { constraint: head, branch: 0 } } as GeoObject;
    });
    if (!headCarried) continue;
    const trial: Construction = { objects, constraints: next.constraints };
    const r = evaluate(trial);
    if (r.ok && newConstraintsNonVacuous(trial, r.positions, newCons)) return trial;
    if (budgetExceeded()) return null;
  }
  return null;
}

/**
 * THE failure ladder (S1.1 of docs/24 — docs/LADDER.md stages 2e–2i), shared by all three entry
 * points (`applyStep`'s main branch, its M1/conflict branch, and `applyCoupledStep`). Before this
 * extraction the ladder existed as THREE divergent inlined copies whose omissions were undocumented
 * (the docs/23 review's L1/L2 findings): the M1 and coupled copies lacked the orphaned-coincide
 * re-home and (M1) the scale rescue. Resolution: DRIFT, not intent — an M1-reinterpreted or coupled
 * command also runs apply's radius routing (`applyRadiusGiven`/`keepTangencyDriven`), so it can
 * orphan a `coincide` exactly like the main path (the sweep was added to the main branch by the
 * 2026-07-06 review's F1 fix and never mirrored); and an M1 lowering emits no positive `distance`
 * today, so the scale rescue is structurally a no-op there — uniform inclusion is free and stays
 * correct if a future reinterpretation ever emits one. Every stage remains try-and-verify
 * (evaluate + the vacuous gate), so unification can only widen rescue power, never corrupt.
 *
 * Order (one statement, one semantics, one solve path — M1/ADR-231):
 *   orphan sweep (M2 law i) → settle-on-frozen-prior (ADR-276; skipped when orphans exist) →
 *   recruit (cases A–F, docs/LADDER.md stage 3) → scale rescue (ADR-237, last resort) →
 *   honest refusal blaming the student's NEW statement (never a collateral casualty).
 */
/**
 * Every constraint OBLIGATION a construction carries, keyed by content ([ADR-402](../../docs/06-decisions.md#adr-402)):
 * the listed `constraints[]`, an `on-segment-solved`'s embedded constraint, every solve directive's
 * constraint, and its `also` co-drive list. A student's given always lives in at least one of these
 * shapes — this enumeration is what "the given still exists" means. Exported for the #258 locks.
 */
export function obligationsOf(c: Construction): Map<string, Constraint> {
  const m = new Map<string, Constraint>();
  for (const k of c.constraints) m.set(constraintKey(k), k);
  for (const o of c.objects) {
    if (o.kind === 'on-segment-solved') m.set(constraintKey(o.constraint), o.constraint);
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv) {
      m.set(constraintKey(sv.constraint), sv.constraint);
      for (const a of sv.also ?? []) m.set(constraintKey(a), a);
    }
  }
  return m;
}

function runFailureLadder(
  prev: Construction,
  next: Construction,
  newCons: Constraint[],
  prevPositions: Map<Id, Vec>,
  primary: EvalResult,
  trace: string[],
  prefix: 'main' | 'm1' | 'coupled',
): StepResult {
  // THE PRESERVATION GATE (issue #258, [ADR-402](../../docs/06-decisions.md#adr-402)) — a rescue stage
  // may not LOSE an obligation `next` carried. The rescue stages bake, replace, and re-point carriers,
  // and an obligation whose ONLY copy lives inside a carrier (driveOrCheck case (1) embeds without
  // listing) is destroyed by a bake whose restore law knows only the `solve`-directive shape — the
  // settle stage annihilated an embedded |BC|=|BE| this way, then ACCEPTED, because dropping a
  // constraint makes the system easier and the acceptance tests only look at the NEW constraints.
  // The gate is measured against NEXT (never `prev`): the apply boundary may deliberately rewrite
  // obligations (the M1 reinterpretations), but a rescue of the apply's own output may not shrink it.
  // On a miss, REPAIR: resurrect the dropped obligations as listed checks and re-verify — accepted only
  // if the whole figure (including them) still evaluates; otherwise the stage's accept FAILS and the
  // ladder falls through to the next stage, which sees `next` intact.
  const baseline = obligationsOf(next);
  const accept = (construction: Construction, positions: Map<Id, Vec>, token: string): StepResult | null => {
    const have = obligationsOf(construction);
    const missing = [...baseline].filter(([k]) => !have.has(k)).map(([, con]) => con);
    if (!missing.length) return { ok: true, construction, positions, ladder: [...trace, token] };
    const repaired: Construction = { ...construction, constraints: [...construction.constraints, ...missing] };
    const r = evaluate(repaired);
    if (r.ok && newConstraintsNonVacuous(repaired, r.positions, newCons)) {
      return { ok: true, construction: repaired, positions: r.positions, ladder: [...trace, token, 'preserve:repair'] };
    }
    trace.push('preserve:reject'); // the stage won by dropping a given — its accept is void; keep climbing
    return null;
  };
  // OWNERSHIP RE-HOME (M2/ADR-231): a `coincide` is a placement obligation the engine always creates
  // WITH an owner; a size given that pins the radius that drove it (applyRadiusGiven drops the stale
  // directive; keepTangencyDriven's free-centre handoff can come up empty when every centre is already
  // claimed) leaves it ORPHANED — unsatisfiable by the topological pass and invisible to the recruiter,
  // whose list held only the NEW constraints (a `set-radius` adds none — the review's F1). Any unowned
  // coincide joins the recruit list so the general machinery (re-point/steal/lend, cases B–F) re-homes
  // it — the general form of the free-centre handoff.
  const owned = new Set<Constraint>();
  for (const o of next.objects) {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv) { owned.add(sv.constraint); for (const k of sv.also ?? []) owned.add(k); }
  }
  const orphans = next.constraints.filter((k) => k.type === 'coincide' && !owned.has(k) && !newCons.includes(k));
  if (orphans.length) trace.push(`${prefix}:orphans`);
  // STAGE-0 (ADR-276, issue #37): before recruiting, try the new statement's own carriers over the
  // FROZEN prior solution — a satisfiable-by-its-own-carrier statement must not re-open (and land in a
  // compromise basin of) the whole already-valid coupled system.
  if (!orphans.length) {
    const settled = settleOnFrozenPrior(prev, next, newCons);
    if (settled) {
      const a = accept(settled.construction, settled.positions, `${prefix}:settle`);
      if (a) return a;
    }
  }
  const recruited = recruitFreeDofs(next, [...newCons, ...orphans], trace);
  if (recruited) {
    const r2 = evaluate(recruited);
    if (r2.ok && newConstraintsNonVacuous(recruited, r2.positions, newCons)) {
      const a = accept(recruited, r2.positions, `${prefix}:recruit`);
      if (a) return a;
    }
  }
  // S3.2 stage (b) — the component-joint solve as a RESCUE TIER after the recruit rungs (docs/25 §4,
  // amended by measurement 2026-07-25): the original joint-BEFORE-rungs placement solved the ADR-103
  // figure but moved a rectangle base vertex ~0.35 where the staged path moved it 0 (the
  // stability-snapshot delta) — the staged rungs embody least-movement, so they keep first claim.
  // Here the component solve adds PURE rescue power for the G2 class (couplings no rung expresses),
  // at zero stability cost to everything the ladder already solves. Promotion to joint-FIRST (the
  // rung-retirement enabler) waits on LM-seeded minimal-movement matching the staged path — solveLM's
  // two-phase regularizer is the landed prerequisite.
  const joint = jointFirst(next, newCons, trace);
  if (joint) {
    const rj = evaluate(joint);
    if (rj.ok && newConstraintsNonVacuous(joint, rj.positions, newCons)) {
      const a = accept(joint, rj.positions, `${prefix}:component`);
      if (a) return a;
    }
  }
  // LAST RESORT — SCALE RESCUE (ADR-237): a figure with no absolute given yet is determined only up
  // to SIMILARITY, so its FIRST size given is a statement about SCALE — satisfiable exactly by scaling
  // every free DOF by k = stated/measured. Runs strictly AFTER the recruiter (least perturbation wins
  // when a minimal solve suffices); try-and-verify, so any other absolute given a global scale would
  // break falls through to the honest error unharmed.
  const scaled = scaleRescue(next, newCons, prevPositions);
  if (scaled) {
    const rs = evaluate(scaled);
    if (rs.ok && newConstraintsNonVacuous(scaled, rs.positions, newCons)) {
      const a = accept(scaled, rs.positions, `${prefix}:scale`);
      if (a) return a;
    }
  }
  // Honest refusal: name the STUDENT'S new statement (blame honesty, issue #37); a solve that "passed"
  // only vacuously (the non-vacuous gate refused it) reports the same over-constraint shape.
  const vacuousErr = newCons.length ? `over-constrained: ${describeConstraint(newCons[0])} cannot hold` : 'over-constrained';
  return { ok: false, error: primary.ok ? vacuousErr : blameNewStatement(primary.error, newCons), construction: prev, positions: prevPositions, ladder: [...trace, `${prefix}:refuse`] };
}

/**
 * OWNERSHIP AT ACCEPT (#150, [ADR-399](../../docs/06-decisions.md#adr-399)) — the M2 twin of the
 * failure ladder, for a constraint the current drawing ALREADY satisfies.
 *
 * `driveOrCheck`'s eager pick and the recruiter assign a consuming constraint its DOF owner only on
 * the FAILURE path; a constraint whose references are all derived and whose residual happens to be 0
 * at the accepted draw committed as an UNOWNED CHECK — the docs/17 §2.2 tripwire verbatim: the
 * routing depended on the OBSERVED RESIDUAL (solver state), not on what the statement means. Default
 * placements are deliberately regular (evenly-spread on-circle points, midpoints, general-position
 * spins), so "accidentally exactly satisfied" is common — Q27's two default chords are symmetric to
 * machine epsilon, so `EF=EG` landed as a check, no DOF was claimed, nothing re-solved per seed, and
 * every sampled configuration violated it: the valid-config space collapsed to the one accidental
 * draw (1/64 seeds), starving the detection pool and making the mirror labeling unreachable (#150).
 *
 * The pass: for new consuming constraints that landed unowned, PROBE with the real sampler
 * (`applySeed`) — the semantic question is "does this constraint restrict the sampled family?", and
 * the sampler IS that family's definition. A probe whose evaluate blames a new constraint (the
 * ADR-398 `violated` attribution) proves it BINDS → run the standard recruiter AT THE PROBE STATE
 * (where it genuinely fails, so the normal self-verifying rungs decide) and transplant ONLY the
 * directive markings back onto the accepted construction — values untouched, verified stable, so the
 * accepted figure does not move (stability is structural). A structurally-implied (redundant)
 * statement survives every probe and honestly stays a check: it consumes no freedom, and claiming a
 * DOF for it would freeze sampling variety (the ADR-139/140 redundant-kite-equality class). Probe
 * seeds' candidate markings are compared and the FEWEST-carrier one wins (M2 least ownership,
 * ADR-281): a single-carrier owner re-solves per seed via the robust full-range 1-D scan, where a
 * wide joint marking re-solves fragilely.
 */
function ensureOwnership(
  next: Construction,
  newCons: Constraint[],
  positions: Map<Id, Vec>,
): { construction: Construction; positions: Map<Id, Vec> } | null {
  const ownedKeys = new Set<string>();
  for (const o of next.objects) {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv) {
      ownedKeys.add(constraintKey(sv.constraint));
      for (const k of sv.also ?? []) ownedKeys.add(constraintKey(k));
    }
    if (o.kind === 'on-segment-solved') ownedKeys.add(constraintKey(o.constraint));
  }
  const unowned = newCons.filter((k) => !isOrderConstraint(k) && !ownedKeys.has(constraintKey(k)));
  if (!unowned.length) return null;
  if (freeDofs(next).length === 0) return null; // rigid figure → a genuine verify; nothing samples
  const unownedKeys = new Set(unowned.map(constraintKey));
  let span = 1;
  for (const p of positions.values()) span = Math.max(span, Math.abs(p.x), Math.abs(p.y));
  let best: { construction: Construction; positions: Map<Id, Vec>; marks: number } | null = null;
  for (const probeSeed of [1, 2, 3]) {
    const probe = applySeed(next, probeSeed);
    const e = evaluate(probe);
    if (e.ok) continue; // the new constraints survived this sample — evidence they don't bind
    if (!(e.violated ?? []).some((v) => unownedKeys.has(constraintKey(v)))) continue; // broke something else — inconclusive
    const marked = recruitFreeDofs(probe, unowned);
    if (!marked) continue;
    // Transplant the MARKING only: each object the recruiter gave a directive gets it on the accepted
    // construction; values stay the accepted (satisfied) ones. A recruiter solution that re-pointed an
    // EXISTING owner is too invasive to graft onto an already-valid figure — skip it (keep today's
    // behavior for that probe).
    const byId = new Map(marked.objects.map((o) => [o.id, o] as const));
    let clash = false;
    let marks = 0;
    const objects = next.objects.map((o) => {
      const m = byId.get(o.id) as { solve?: SolveDirective } | undefined;
      if (!m?.solve) return o;
      if ((o as { solve?: SolveDirective }).solve) {
        if (!deepEqual((o as { solve?: SolveDirective }).solve, m.solve)) clash = true;
        return o;
      }
      marks++;
      return { ...o, solve: m.solve };
    });
    if (clash || !marks || (best && marks >= best.marks)) continue;
    const owned = { ...next, objects };
    const r = evaluate(owned);
    if (!r.ok || !newConstraintsNonVacuous(owned, r.positions, newCons)) continue;
    // The marking must not move the just-accepted figure: the driven re-solve from an exactly-satisfied
    // state keeps its values (nearest-root ordering); verify it actually did.
    if (maxDelta(positions, r.positions, [...positions.keys()]) > 1e-3 * span) continue;
    best = { construction: owned, positions: r.positions, marks };
    if (marks === 1) break; // a single owner can't be beaten
  }
  return best ? { construction: best.construction, positions: best.positions } : null;
}

/**
 * #186 belt-and-braces: a command that would CREATE A NEW POINT riding a circle id that exists nowhere
 * — not in the prior figure and not defined by the command itself — can only produce a dangling object
 * that the topological evaluator reports as the cryptic internal "unresolved dependencies for: X".
 * The parser's `withImplicitCircles` auto-creates every consumed circle, so this fires only for broken
 * external sources (a raw LLM commit, a hand-edited figure file, a direct engine call) — refuse
 * HONESTLY, naming the missing circle, before anything is applied. Scope deliberately narrow: a
 * statement about an EXISTING point keeps its M1 ladder semantics (apply's point-on-circle (a)–(d)
 * reconciliation — incl. the tolerated same-batch creation-after-use order some rules emit, e.g.
 * «נקודות B C D על מעגל שמרכזו O» whose circle command follows its memberships), and line references
 * keep their own lenient design (ADR-236's pending constraints).
 */
function danglingCircleError(prev: Construction, cmd: Command): string | null {
  const own = cmd.type === 'circle' || cmd.type === 'circle-through' || cmd.type === 'circumcircle' ? cmd.id : null;
  const id = (cmd as { id?: Id }).id;
  if (id !== undefined && prev.objects.some((o) => o.id === id)) return null; // an EXISTING-id statement → the M1 ladder owns it
  for (const k of ['circle', 'circle1', 'circle2'] as const) {
    const v = (cmd as Record<string, unknown>)[k];
    if (typeof v !== 'string' || v === own) continue;
    if (!prev.objects.some((o) => o.kind === 'circle' && o.id === v)) {
      const letter = v.startsWith('circle-') ? v.slice('circle-'.length) : v;
      return `circle '${letter}' is not defined`;
    }
  }
  return null;
}

/** Apply one command and evaluate; keep the prior construction on failure. */
export function applyStep(prev: Construction, cmd: Command): StepResult {
  const trace: string[] = []; // the ladder trace (docs/LADDER.md) — diagnostic only
  const prevEval = evaluate(prev);
  const prevPositions = prevEval.ok ? prevEval.positions : new Map<Id, Vec>();

  const tangentErr = circlesTangentError(prev, cmd);
  if (tangentErr) return { ok: false, error: tangentErr, construction: prev, positions: prevPositions, ladder: ['pre:tangent'] };

  // A constraint on a structurally degenerate operand ("BB" ∥/⟂, "∠ABB", a repeated collinear point)
  // has a NaN residual: reject it here, before the solver churns on it (a freeze in the config search).
  const degenErr = degenerateConstraintError(cmd);
  if (degenErr) return { ok: false, error: degenErr, construction: prev, positions: prevPositions, ladder: ['pre:degenerate'] };

  // #186: a reference to a circle that doesn't exist refuses with the circle's NAME, never the
  // topological evaluator's internal "unresolved dependencies" (the student-facing honesty guard).
  const danglingErr = danglingCircleError(prev, cmd);
  if (danglingErr) return { ok: false, error: danglingErr, construction: prev, positions: prevPositions, ladder: ['pre:dangling'] };

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
    let constrained = reinterpretAsConstraint(prev, ncmd);
    if (constrained) trace.push('m1:constraint');
    if (!constrained && (constrained = reinterpretAsCollinear(prev, ncmd, prevPositions))) trace.push('m1:collinear');
    if (!constrained && (constrained = replaceCyclicForDiameter(prev, ncmd))) trace.push('m1:cyclic-diameter');
    if (!constrained && (constrained = reinterpretDiameter(prev, ncmd))) trace.push('m1:diameter');
    if (constrained) {
      const newCons = constrained.constraints.slice(prev.constraints.length);
      const r = evaluate(constrained);
      if (r.ok && newConstraintsNonVacuous(constrained, r.positions, newCons)) {
        const owned = ensureOwnership(constrained, newCons, r.positions); // ADR-399: a satisfied-at-accept binding constraint still claims its DOF
        if (owned) return { ok: true, construction: owned.construction, positions: owned.positions, ladder: [...trace, 'm1:primary', 'm1:own'] };
        return { ok: true, construction: constrained, positions: r.positions, ladder: [...trace, 'm1:primary'] };
      }
      // The reinterpreted statement is a CONSTRAINT — give it the SAME failure path a typed constraint
      // gets. One statement, one semantics, ONE solve path (M1/ADR-231; unified by S1.1 — the honest
      // failure surfaces the RELATION that can't hold, never "already defined").
      return runFailureLadder(prev, constrained, newCons, prevPositions, r, trace, 'm1');
    }
    return { ok: false, error: conflict, construction: prev, positions: prevPositions, ladder: ['m1:conflict-refuse'] };
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
    if (choice) {
      const token = choice.construction === next ? 'main:primary' : 'main:mirror';
      const newConsChoice = choice.construction.constraints.slice(prev.constraints.length);
      const owned = ensureOwnership(choice.construction, newConsChoice, choice.positions); // ADR-399
      if (owned) return { ok: true, construction: owned.construction, positions: owned.positions, ladder: [token, 'main:own'] };
      return { ok: true, construction: choice.construction, positions: choice.positions, ladder: [token] };
    }
    // No coincidence-free placement. If a side merely STACKS (evaluates ok but two nodes coincide), this is
    // a default collision the composition can't dodge → keep prior with a clear message (ADR-123: avoid
    // default collisions; a constraint-DRIVEN coincidence is allowed below, not here). Otherwise fall
    // through to report the default's genuine error.
    const stack = (res.ok && res.coincidences?.length ? res.coincidences : alt.ok && alt.coincidences?.length ? alt.coincidences : null);
    if (stack) return { ok: false, error: `${stack[0][0]} and ${stack[0][1]} would be at the same point`, construction: prev, positions: prevPositions, ladder: ['main:stack-refuse'] };
  }

  // A primary solve that "passed" only VACUOUSLY (a new constraint's own referenced points collapsed —
  // 0 = 0) is not a success: route it through the same failure path as a genuine over-constraint so the
  // recruiter searches for a real configuration (issue #7, the B13 finding).
  const newConsMain = next.constraints.slice(prev.constraints.length);
  const mainVacuous = res.ok && !newConstraintsNonVacuous(next, res.positions, newConsMain);
  if (!res.ok || mainVacuous) {
    // A constraint its direct carrier alone can't satisfy ("cannot place F on AB so |DE|=|DF|" — F is
    // stuck on the segment) may still hold if the figure's OTHER free DOFs move too (ADR-028, extended):
    // the unified failure ladder (S1.1) — orphan re-home → settle → recruit → scale → honest refusal.
    return runFailureLadder(prev, next, newConsMain, prevPositions, res, trace, 'main');
  }
  {
    const owned = ensureOwnership(next, newConsMain, res.positions); // ADR-399: a satisfied-at-accept binding constraint still claims its DOF
    if (owned) return { ok: true, construction: owned.construction, positions: owned.positions, ladder: ['main:primary', 'main:own'] };
  }
  return { ok: true, construction: next, positions: res.positions, ladder: ['main:primary'] };
}

/**
 * Apply N CONSTRAINTS as ONE COUPLED SYSTEM ([ADR-338](docs/06-decisions.md#adr-338), issue #166).
 *
 * A macro's defining constraints are not N independent statements — they are one figure. A square inscribed
 * in a triangle is the coupled system `|DE|=|EF| ∧ |EF|=|FG| ∧ |FG|=|GD| ∧ GD⟂DE`; solving them one at a
 * time reaches the solution only from benign basins, because each `applyStep` EVALUATES (i.e. moves the
 * figure) before the next constraint is even attached, so the last constraint is asked to hold from a basin
 * the earlier ones already committed to. On the operator's right triangle that lands the nearest RHOMBUS
 * (sides 2.000, ∠(GD,DE)=79°) and then reports the ⟂ unsatisfiable; on the hypotenuse variants it goes
 * green on a figure that is not a square.
 *
 * The fix needs NO new numerics. `applyCommand`'s `driveOrCheck` only RECORDS a solve directive — it never
 * solves — and `evaluate`/`resolveMixedCarriers` already minimises `Σ jointCostTerm` over EVERY constraint
 * attached to EVERY carrier (nothing there is arity-limited). So attaching all N first and evaluating ONCE
 * *is* the joint solve, started from the pre-macro basin instead of a greedily-perturbed one. The failure
 * path likewise runs once over the UNION of the N constraints, so the recruiter's own `evaluate` gate can
 * no longer short-circuit on "constraint 1 is satisfied" while 2..N are not.
 *
 * Constraint-only by construction (the caller partitions on the structural `set-*` predicate), so the
 * creation-specific machinery `applyStep` runs — `normalizeShapeComposition`, `commandConflict`/reinterpret,
 * `mirrorComposition` — is deliberately absent: a `set-*` produces no objects, so `commandConflict` (which
 * derives conflicts structurally from apply's produced objects) is a guaranteed no-op on it, and there is no
 * composition to mirror. A run of ONE is just `applyStep`, so nothing outside a multi-constraint macro moves.
 */
export function applyCoupledStep(prev: Construction, cmds: Command[]): StepResult {
  const trace: string[] = []; // the ladder trace (docs/LADDER.md) — diagnostic only
  const prevEval = evaluate(prev);
  const prevPositions = prevEval.ok ? prevEval.positions : new Map<Id, Vec>();
  for (const cmd of cmds) {
    const degenErr = degenerateConstraintError(cmd);
    if (degenErr) return { ok: false, error: degenErr, construction: prev, positions: prevPositions, ladder: ['pre:degenerate'] };
  }
  // ATTACH every constraint before solving once (see above — this is the whole mechanism).
  let next = prev;
  for (const cmd of cmds) next = applyCommand(next, cmd, prevPositions);
  const newCons = next.constraints.slice(prev.constraints.length);
  const res = evaluate(next);
  if (res.ok && newConstraintsNonVacuous(next, res.positions, newCons)) {
    const owned = ensureOwnership(next, newCons, res.positions); // ADR-399: a satisfied-at-accept binding constraint still claims its DOF
    if (owned) return { ok: true, construction: owned.construction, positions: owned.positions, ladder: ['coupled:primary', 'coupled:own'] };
    return { ok: true, construction: next, positions: res.positions, ladder: ['coupled:primary'] };
  }
  // The SAME unified failure ladder as applyStep (S1.1), once, over the UNION of the coupled constraints.
  return runFailureLadder(prev, next, newCons, prevPositions, res, trace, 'coupled');
}

/**
 * SCALE RESCUE (ADR-237) — satisfy a failing SIZE given by scaling the whole figure.
 *
 * A figure with no absolute given yet is determined only up to similarity (the ADR-101 gauge): every
 * relation it states (⟂, ∥, tangency, collinearity, equal, ratios, angles) is scale-invariant. Its
 * first stated LENGTH therefore has an exact closed-form solution — multiply every free world-unit
 * DOF by k = stated/measured — which the per-carrier driven solves cannot discover (the move is spread
 * across every DOF at once). Scales: free-point coordinates, free circle radii, on-line offsets, and
 * perp-offset legs; ratios/angles (on-segment t, on-circle θ) are dimensionless and stay; a `length`
 * radius is a stated given and is HELD (that's what makes the map land the new given exactly).
 *
 * Purely try-and-verify: the caller accepts the result only if the full evaluation then holds, so a
 * figure with any other absolute given — which a global scale would break — simply falls through to
 * the recruiter. Bails when any free point is PINNED (a student-typed coordinate is a given: scale is
 * not a gauge there), or when the failing step carries no positive distance whose endpoints already
 * have positions.
 */
function scaleRescue(next: Construction, newCons: Constraint[], prevPositions: Map<Id, Vec>): Construction | null {
  const distCon = newCons.find((k): k is Extract<Constraint, { type: 'distance' }> => k.type === 'distance' && k.value > 0);
  if (!distCon) return null;
  const pa = prevPositions.get(distCon.a);
  const pb = prevPositions.get(distCon.b);
  if (!pa || !pb) return null;
  const measured = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (!(measured > 1e-9)) return null;
  const k = distCon.value / measured;
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-9) return null;
  // A pinned free point is a stated absolute coordinate — the frame is fixed, scale is not a gauge.
  if (next.objects.some((o) => o.kind === 'free-point' && (o as FreePoint).pinned)) return null;
  const objects = next.objects.map((o): GeoObject => {
    switch (o.kind) {
      case 'free-point':
        return { ...o, x: o.x * k, y: o.y * k };
      case 'circle':
        return o.radius.via === 'free' ? { ...o, radius: { via: 'free', value: o.radius.value * k } } : o;
      case 'on-line':
        return { ...o, offset: o.offset * k };
      case 'perp-offset':
        return { ...o, dist: o.dist * k };
      default:
        return o;
    }
  });
  return { ...next, objects };
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
function ancestors(objects: GeoObject[], start: Id, mode: 'param' | 'drivable', includeStart = true, includeSolving: boolean | 'soft-order' = false): Id[] {
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const seen = new Set<Id>();
  const result: Id[] = [];
  const startObj = byId.get(start);
  const queue: Id[] = includeStart
    ? [start]
    : pointParents(startObj && isGeoPoint(startObj) ? startObj : ({ kind: 'free-point', id: start, x: 0, y: 0 } as GeoObject));
  if (!includeStart) seen.add(start);
  // `includeSolving` also surfaces carriers a constraint ALREADY drives (their `solve` is set) — `true`
  // surfaces ALL (the R7 joint re-bind, ADR-045); `'soft-order'` surfaces only those driven by a SOFT
  // ORDER (collinear-order / angle-order / length-order / angle-acuteness — issue #110), which ride the
  // optimizer and own no dedicated DOF, so a HARD constraint may claim them (the claimer frees the order).
  const avail = (o: GeoObject) => {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv === undefined || includeSolving === true) return true;
    if (includeSolving === 'soft-order') {
      return isOrderConstraint(sv.constraint);
    }
    return false;
  };
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
    // The touch point of two tangent circles lies on its `circle` (radial-toward) — so a constraint on
    // it can reach that circle's free radius / centre (the tangency DOFs, ADR-051/ADR-052). The OTHER
    // circle's radius is surfaced via the hidden witness point (also radial-toward, on the other circle).
    case 'radial-toward':
      return [o.circle];
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
export const freeDrivableAncestors = (objects: GeoObject[], start: Id): Id[] => ancestors(objects, start, 'drivable');

/** The COMPONENT-partition walker (S3.2): like {@link freeDrivableAncestors} but INCLUDING carriers
 *  already claimed by a directive — ownership is what the partition derives, so a currently-claimed
 *  DOF still belongs to its component (excluding it split coupled constraints into false singletons). */
export const allDrivableAncestors = (objects: GeoObject[], start: Id): Id[] => ancestors(objects, start, 'drivable', true, true);

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
function recruitFreeDofs(c: Construction, newCons: Constraint[] = [], trace?: string[]): Construction | null {
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
    trace?.push('recruit:A');
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
    if (budgetExceeded()) break; // armed only around view searches — see engine/solveBudget.ts
    // Once the system already evaluates VALID (an earlier K's recruit fixed the step), STOP: the remaining
    // new constraints are satisfied in that solution too, and case (B)'s last rung still COMMITS its widest
    // marking even on failure (deliberate — docs/LADDER.md L4: downstream cases re-point from it), so
    // running further experiments against an already-valid figure can only wreck it (observed: the (F) fix
    // for a `collinear` was undone by the sibling `collinear-order`'s failed experiments). (ADR-229; the
    // (C)/(D) failed-experiment mutations themselves are RESTORED since S1.1 — M2 law ii.)
    if (changed && evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) break;
    const beforeK = objects; // snapshot for the last-resort (F) rebuild — see below
    
    let verified = false; // the current `objects` already evaluated VALID in a stage below
    // (B) MINIMAL-FIRST, SELF-VERIFIED recruitment (ADR-231): try the NEWEST ref's ancestors alone
    // before the full union of every ref's ancestors. The newest referenced object is the statement's
    // subject ("M on CD" should move M's parents, not tear CD's endpoints loose), and over-recruiting
    // is not merely wasteful — it changes the answer: the joint solve balloons (8-D NM where the
    // minimal 4-D solves cleanly) and diverges into rejection or a compromise basin (the ADR-123
    // over-recruit class, reproduced by the redefine-existing-point M1 tests). Two stages only, each
    // one evaluate, so the failure path pays at most one extra evaluate over the old single-shot mark.
    const objIdx = (id: Id) => objects.findIndex((o) => o.id === id);
    const refs = [...new Set(constraintRefs(K))].sort((p, q) => objIdx(q) - objIdx(p)); // newest first
    const minimal = refs.length > 0 ? freeDrivableAncestors(objects, refs[0]).filter((id) => !isSolving(objects, id)) : [];
    const full = [...new Set(refs.flatMap((ref) => freeDrivableAncestors(objects, ref)))].filter((id) => !isSolving(objects, id));
    // ONE-DOF-AT-A-TIME first ([ADR-281](docs/06-decisions.md#adr-281), issue #51 — the M2 "least
    // ownership" law): a recruit stage COMMITS carrier ownership, and the minimal rung is "the newest
    // ref's ancestor LIST" — on a chained figure that is the whole chain (the measured AG=8 claimed G +
    // the circle's radius + its centre for ONE scalar equation), so the next given (AC=0.5·DC) found
    // every DOF busy (minimal/full EMPTY) and burned the steal/lend/co-drive ladder into a false
    // over-constraint (issue #51) — or, when the HOIST re-fold happened to rescue it, into the 80 s
    // replay of issue #59. Try each candidate DOF ALONE (deterministic base order), then the minimal
    // set, then the full union; every rung is self-verified (accepted only when the WHOLE system
    // evaluates valid), so a singleton that satisfies commits the least ownership and later givens keep
    // their carriers.
    // …EXCEPT for a REGION/ORDER constraint (collinear-order, angle/length-order, acuteness): it removes
    // 0 DOF and its carriers stay free/samplable (ADR-136 Am. 2), so "least ownership" is vacuous for it —
    // and a lone carrier re-solved from a perturbed seed can satisfy an order by DEGENERACY (E collapsing
    // onto A zeroes the collinear-order residual) where the multi-carrier regularised solve stays healthy.
    // Region constraints keep the original minimal→full stages.
    const isRegionK = isOrderConstraint(K);
    const base = minimal.length > 0 ? minimal : full;
    const stages: Id[][] = isRegionK ? [] : base.map((id) => [id]);
    if (base.length > 1 || (isRegionK && base.length > 0)) stages.push(base);
    if (full.length > base.length) stages.push(full);
    for (const cand of stages) {
      if (budgetExceeded()) break;
      const trial = objects.map((o) => (cand.includes(o.id) ? markDriven(o, K) : o));
      if (evaluate({ objects: trial, constraints: [...c.constraints, ...added] }).ok) {
        objects = trial;
        changed = true;
        trace?.push('recruit:B');
        verified = true;
        break;
      }
      if (cand === stages[stages.length - 1]) {
        // No stage verified — keep the widest marking anyway (the pre-staging behavior): the
        // downstream cases (C)–(F) re-point/lend from it, and an honest over-constraint stays honest.
        objects = trial;
        changed = true;
        trace?.push('recruit:B-forced');
      }
    }
    // (D) FREE THE BLOCKER (R7(3) / [ADR-074](docs/06-decisions.md#adr-074)): K needs a free DOF that an
    // EARLIER constraint K1 already CLAIMED (the greedy apply-time pick), and K1 references ANOTHER free
    // DOF it could drive INSTEAD. Re-point K1 → that alternative and release the claimed DOF to K, so both
    // keep a carrier and the joint solver redistributes. Two instances of one pattern: AG⟂AD drives its
    // extension point G, freeing the apex A for ∠ADB (ADR-074); and |AB|=5 drives vertex A, freeing B for
    // |BC|=5 so an equilateral / AAS triangle (every side or two-angles+side stated) solves instead of
    // falsely over-constraining. Runs ONLY on the failure path, so eagerly-satisfied figures (e.g. a
    // stated-extension point a relation must NOT drag, ADR-064) never reach it and are untouched.
    let dDid = false; // case (D) mutated the assignment (verified just below)
    const preD = objects; // TRANSACTIONAL (M2 law ii / S1.1): a failed (D) experiment restores exactly
    if (!verified) {
      const reachable = new Set(constraintRefs(K).flatMap((ref) => ancestors(objects, ref, 'drivable', true, true)));
      for (const x of objects) {
        if (!reachable.has(x.id)) continue;
        const sv = (x as { solve?: SolveDirective }).solve;
        if (!sv || sv.constraint === K) continue; // x must be CLAIMED by a DIFFERENT constraint K1
        const K1 = sv.constraint;
        const alt = objects.find((o) => o.id !== x.id && recruitableFreeDof(o) && constraintRefs(K1).includes(o.id));
        if (!alt) continue;
        // The displaced directive's `also` co-drive list moves WITH K1 to the receiving carrier
        // ([ADR-402](docs/06-decisions.md#adr-402), #258 sibling audit) — dropping it destroyed the
        // co-driven obligations exactly like the settle bake did.
        objects = objects.map((o) =>
          o.id === alt.id
            ? ({ ...o, solve: { constraint: K1, branch: 0, ...(sv.also?.length ? { also: sv.also } : {}) } } as GeoObject)
            : o.id === x.id
              ? markDriven(o, K)
              : o,
        );
        dDid = true;
        break;
      }
    }
    // VERIFY before skipping the redundancy cases ([ADR-139](docs/06-decisions.md#adr-139)). Case (B) can
    // recruit a DECOY free DOF — a free ancestor of K that does NOT free the genuinely-contested carrier
    // (e.g. a kite+tangents figure where the 2nd tangency `OD⟂AD` needs D's θ, but D is double-booked by the
    // REDUNDANT kite `AB=AD`: case (B) grabs the apex `A` instead). That decoy both sets `did` (which would
    // skip the self-verifying redundancy cases (C)/(E)) and CONSUMES the DOF that case (D) needed as its
    // `alt` to free the blocker — so neither redundancy case runs and the figure falsely over-constrains.
    // So `did` only earns a skip when the recruitment ACTUALLY makes the whole system valid; otherwise fall
    // through to (C)/(E), which are self-verifying (a lend is accepted only if `evaluate` passes) and so can
    // never rescue a genuinely-impossible figure. The (B) stages above are already self-verified, so only a
    // case-(D) mutation needs the extra `evaluate` here — on the already-failing path only. A FAILED (D)
    // RESTORES its mutation (M2 law ii / S1.1), so (C)/(E) run from the clean state.
    if (verified) continue;
    if (dDid) {
      if (evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) { changed = true; trace?.push('recruit:D'); continue; }
      objects = preD; // restore exactly — leave no failed-experiment mutation for later cases to compensate for
    }
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
    if (steal && !budgetExceeded()) {
      const preC = objects; // TRANSACTIONAL (M2 law ii / S1.1 — was: the steal PERSISTED on failed
      // verification, and two downstream sites carried compensations for it: the early-stop guard's
      // "failed experiments can wreck a found solution" rationale, and (F)'s beforeK snapshot)
      objects = objects.map((o) => (o.id === steal.id ? markDriven(o, K) : o)); // K already in c.constraints (pushed as a check)
      // VERIFY, as for case (B)/(D) above ([ADR-139](docs/06-decisions.md#adr-139)): a steal that doesn't
      // resolve the over-constraint — e.g. a DEGENERATE self-steal where K is itself the over-subscribed
      // constraint (driveOrCheck gave it a carrier at apply-time AND case (B) added the decoy A, so K has 2
      // carriers and `steal` re-points one of K's own carriers back to K, a no-op) — must NOT pre-empt the
      // self-verifying redundant-lend (E). Fall through RESTORED when it doesn't help — (E) then tries its
      // lends from the clean state (a SUPERSET of candidates: the un-stolen carrier is lendable again) and
      // can only accept a whole-system-valid one.
      if (evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) { changed = true; trace?.push('recruit:C'); continue; }
      objects = preC;
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
      if (budgetExceeded()) break;
      const trial = objects.map((x) => (x.id === o.id ? markDriven(x, K) : x));
      const r = evaluate({ objects: trial, constraints: [...c.constraints, ...added] });
      if (r.ok) { objects = trial; changed = true; trace?.push('recruit:E'); break; }
    }
    // (F) FREEZE-AND-CO-DRIVE ([ADR-229](docs/06-decisions.md#adr-229)): every DOF is claimed and no
    // steal/lend rescued K, but a claimed FREE POINT among K's refs has a SPARE DOF — a free point is
    // 2 DOF and its one scalar constraint pins it only to a 1-D manifold. K can consume that spare DOF:
    // e.g. tangents from B touch a circle at the fixed C and at D; the student then pins "A on the
    // extension of BD" — B must slide ALONG the tangent-at-C line (its ⟂ constraint kept) until line BD
    // passes through A, with D's tangency θ following. The earlier cases can't express this (one
    // constraint per carrier), and re-solving the WHOLE carrier soup jointly destabilises satisfied
    // subsystems far from K (the circles' tangency at E — the observed failure of a naive co-drive). So:
    // (1) BAKE the current valid solution — `resolveDriven` writes every driven carrier's solved params
    //     and clears the directives (its normal output form);
    // (2) re-drive ONLY the carriers K references, restoring each one's ORIGINAL constraint (from the
    //     pre-mutation snapshot — case (B)'s forced last rung still commits its marking on failure) and adding K
    //     via `solve.also` on the free-point host;
    // (3) everything else stays FROZEN at its solved position, so its constraints hold by construction.
    // Self-verifying: kept only if the FULL system then evaluates valid — it can never corrupt a figure,
    // only recover configurations the greedy one-constraint-per-carrier model couldn't reach. Region/order
    // constraints are skipped (they remove no DOF; withOrderCons already folds them into every joint cost).
    const isRegion = isOrderConstraint(K);
    if (!isRegion && !evaluate({ objects, constraints: [...c.constraints, ...added] }).ok) {
      const claimed = new Map<Id, SolveDirective>();
      for (const o of beforeK) {
        const sv = (o as { solve?: SolveDirective }).solve;
        if (sv && sv.constraint !== K) claimed.set(o.id, sv);
      }
      const kept = constraintRefs(K).filter((id) => claimed.has(id));
      const hostId = kept.find((id) => beforeK.find((o) => o.id === id)?.kind === 'free-point');
      if (kept.length && hostId) {
        const baked = resolveDriven({ objects: beforeK, constraints: [...c.constraints, ...added] });
        const bakedHost = baked.objects.find((o) => o.id === hostId) as Extract<GeoObject, { kind: 'free-point' }>;
        // MULTI-START seeds for the host: the co-driven solution can be FAR from the host's current spot
        // (B sat near the tangency point C; the valid B is ~a figure-span away along the tangent line), and
        // the regularised joint solve only descends locally. Try the baked seed first (stability: nearest
        // solution wins when reachable), then a deterministic compass ring scaled to the figure's extent.
        // Every candidate is fully self-verified, so a wrong basin is simply rejected.
        const ext = baked.objects.reduce((m, o) => (o.kind === 'free-point' ? Math.max(m, Math.abs(o.x), Math.abs(o.y)) : m), 10);
        const hostSeeds: [number, number][] = [[bakedHost.x, bakedHost.y]];
        for (const r of [ext * 0.5, ext]) for (let k = 0; k < 8; k++) {
          const a = (Math.PI / 4) * k;
          hostSeeds.push([bakedHost.x + r * Math.cos(a), bakedHost.y + r * Math.sin(a)]);
        }
        for (const [sx, sy] of hostSeeds) {
          if (budgetExceeded()) break;
          const trial = baked.objects.map((o) => {
            if (!kept.includes(o.id)) return o; // frozen at its solved position (directive cleared by the bake)
            const sv = claimed.get(o.id)!;
            if (o.id === hostId) return { ...o, x: sx, y: sy, solve: { ...sv, also: [...(sv.also ?? []), K] } } as GeoObject;
            return { ...o, solve: sv } as GeoObject;
          });
          const r = evaluate({ objects: trial, constraints: [...c.constraints, ...added] });
          if (r.ok) {
            // RESTORE the standing directives the bake cleared (review F2 / ADR-231): the freeze was for
            // THIS solve only, but `trial` becomes the SESSION construction — committing it bare would
            // permanently strip every frozen carrier's ownership (e.g. the tangency's radius/centre
            // driver), so a LATER given that needs a frozen subsystem to flex would find carrier-less
            // checks and falsely over-constrain. Re-attach each frozen carrier's original directive on
            // top of its baked params and keep that form only if the full system still evaluates valid
            // (the driven re-solves land on the baked roots); else keep the frozen form (never worse).
            const restored = trial.map((o) => {
              if (kept.includes(o.id)) return o;
              const sv = claimed.get(o.id);
              return sv ? ({ ...o, solve: sv } as GeoObject) : o;
            });
            objects = evaluate({ objects: restored, constraints: [...c.constraints, ...added] }).ok ? restored : trial;
            changed = true;
            trace?.push('recruit:F');
            break;
          }
        }
      }
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
    case 'radial-toward': return [o.toward]; // continue the walk to the other centre (its free DOF)
    default: return []; // free-point, on-circle (a carrier itself), line/circle-derived points
  }
}

/**
 * The free 1-DOF ancestor (on-circle / on-segment) of `start` to drive, or null — the most-recently-
 * added (highest index) one, the DOF most likely meant to be pinned down. Excludes `start` itself
 * (drive an ANCESTOR). Now via the one `ancestors` walker (R7(1)); unlike the old bespoke walk it skips
 * an already-SOLVING carrier (which couldn't be re-driven anyway) and finds a free one past it.
 */
function freeCarrierAncestor(objects: GeoObject[], start: Id, includeSolving: boolean | 'soft-order' = false): Id | null {
  const cands = ancestors(objects, start, 'param', false, includeSolving);
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
  // An `ifAbsent` ensure-exists free point is NOT a placement statement — when the point exists it
  // must no-op (apply skips it), never spawn a hidden coincide twin (ADR-236).
  if (cmd.type === 'free-point' && cmd.ifAbsent) return null;
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
  // No free 1-DOF carrier in reach is NOT a reason to fall back to the "already defined" conflict
  // (M1/ADR-231): the statement is still a constraint — append the coincidence WITHOUT a directive and
  // let applyStep's failure path recruit the figure's drivable DOFs (shape scalars, radii, free centres —
  // a far richer set than the param-only walk here). The one exception is a bare `free-point` COORDINATE
  // placement: it asserts a location, not a relation — with no carrier there is nothing to solve toward
  // (a hidden free twin would satisfy the coincidence trivially and swallow a real contradiction), so it
  // keeps the ADR-011 semantics (free→free is a move upstream; derived→free is a genuine conflict).
  if (!carrier && cmd.type === 'free-point') return null;
  // "M (existing) is the MIDPOINT of a–b" where M is already COLLINEAR with a,b (its own definition puts
  // it on line ab — the "extension of AE meets OK at M, then M is the midpoint of OK" class, issue #110):
  // the midpoint reduces to the well-conditioned 1-D EQUIDISTANCE |aM| = |Mb|. The generic 2-D
  // `coincide(M, midpoint)` below cannot be zeroed by a 1-D driven carrier (the drivenRoots solver finds
  // no root), so this class over-constrained though a valid config exists. Drive the upstream free carrier
  // toward the equidistance instead — `driveHardOn` also frees competing SOFT-ORDER carriers (a
  // collinear-order that over-recruited O/radii rides the optimizer and must not hold the hard carrier
  // hostage). Falls through to the generic coincide when M is NOT structurally on line ab.
  if (cmd.type === 'midpoint' && collinearByConstruction(prev.objects, cmd.id, cmd.a, cmd.b)) {
    // The carrier may itself be currently driven by a SOFT ORDER (a collinear-order that over-recruited
    // it — issue #110): that's fine, `driveHardOn` frees the order. So look past soft-order-solving
    // carriers when the free walk finds none.
    const midCarrier = carrier ?? freeCarrierAncestor(prev.objects, P, 'soft-order');
    if (midCarrier) {
      const eq: Constraint = { type: 'equal', a: cmd.a, b: cmd.id, c: cmd.id, d: cmd.b };
      return driveHardOn(prev.objects, prev.constraints, midCarrier, eq);
    }
  }
  const withHelper = applyCommand(prev, { ...(cmd as object), id: H } as Command); // the new def under the hidden id
  if (carrier) return driveCoincideOn(withHelper.objects, withHelper.constraints, P, H, carrier);
  return { objects: withHelper.objects, constraints: [...withHelper.constraints, { type: 'coincide', p: P, q: H }] };
}

/** Is `p` collinear with `a`,`b` BY CONSTRUCTION — its definition puts it on line ab (an intersection or
 *  on-line/on-segment point whose line is exactly {a,b})? Lets "M is the midpoint of ab" drop to the 1-D
 *  equidistance when M is already on ab (issue #110), without evaluating coordinates. */
function collinearByConstruction(objects: GeoObject[], p: Id, a: Id, b: Id): boolean {
  const o = objects.find((x) => x.id === p);
  if (!o) return false;
  const onLinePair = (x: Id, y: Id) => (x === a && y === b) || (x === b && y === a);
  if (o.kind === 'line-line-intersection') return onLinePair(o.a, o.b) || onLinePair(o.c, o.d);
  if (o.kind === 'on-segment' || o.kind === 'on-segment-solved') return onLinePair(o.a, o.b);
  return false;
}

/** Drive a free `carrier` toward a HARD constraint (`con`), FREEING every competing SOFT-ORDER carrier
 *  (collinear-order / angle-order / length-order / angle-acuteness) — those ride the optimizer (they own
 *  no dedicated DOF by design) and must not compete with the hard constraint's single driven carrier
 *  (issue #110: a collinear-order had over-recruited O + the radii, turning a solvable 1-DOF drive into a
 *  divergent multi-carrier joint solve). The freed orders stay in `constraints` as checks. */
function driveHardOn(objects: GeoObject[], priorConstraints: Constraint[], carrier: Id, con: Constraint): Construction {
  const objs = objects.map((o) => {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv && isOrderConstraint(sv.constraint) && o.id !== carrier) return { ...o, solve: undefined } as GeoObject;
    if (o.id === carrier && (o.kind === 'on-circle' || o.kind === 'on-segment' || o.kind === 'free-point'))
      return { ...o, solve: { constraint: con, branch: 0 } } as GeoObject;
    return o;
  });
  return { objects: objs, constraints: [...priorConstraints, con] };
}

/**
 * Reinterpret a redefining "P on segment a→b" (incl. the "on the extension of" form) on the EXISTING P
 * (ADR-050, generalized by M1/ADR-231) — instead of erroring "P is already defined":
 *
 * **Conversion first (issue #236, ADR-384 — M2 law (i), the on-segment edition of apply's on-circle
 * (c2)/ADR-140).** A membership statement about a FREE, non-pinned P says P has ONE fewer DOF — so
 * CONVERT it to the parametric rider the statement declares (`on-segment`, t seeded at the projection
 * of where P currently stands — M1 stability), carrying a `solve` directive P already owns onto the
 * rider whole (incl. ADR-229 `also` — the rider's t becomes the directive's carrier, exactly what the
 * membership-first entry order produces). The old lowering kept a phantom 2-DOF P PLUS a generic
 * collinear that claimed some OTHER free point as its carrier, so ownership spread to unrelated points
 * and satisfiability depended on entry order — «BC=BE» then «E על AB» wedged where the reverse order
 * built (the #236 book figure). Betweenness is structural on the rider (t ∈ (0,1)); no order
 * constraint is needed.
 *
 * **Constraint fallback** for everything the conversion can't own: a non-free/pinned/rigid P, a P the
 * segment's endpoints depend on (dependency inversion), and the EXTENSION form (an extension rider's
 * t is not a `free`-sampled DOF — ADR-064/ADR-074 — so the beyond-order constraint remains the honest
 * encoding): keep P and constrain it onto the stated stretch. The statement's DIRECTION is kept, per
 * the bare-segment principle (ADR-077) and directional המשך (ADR-054): "P on a–b" means BETWEEN
 * (order a,P,b); "P on the extension of a–b" means BEYOND b (order a,b,P).
 */
function reinterpretAsCollinear(prev: Construction, cmd: Command, prevPos?: Map<Id, Vec>): Construction | null {
  if (cmd.type !== 'point-on-segment') return null;
  if (cmd.id === cmd.a || cmd.id === cmd.b) return null; // "A on AB" is malformed → the plain conflict
  const existing = prev.objects.find((o) => o.id === cmd.id);
  if (!existing || !isGeoPoint(existing)) return null; // only a *re*definition of an existing point
  if (
    !cmd.extension &&
    existing.kind === 'free-point' &&
    !existing.pinned &&
    !(existing as { rigid?: boolean }).rigid &&
    !wouldInvertDependency(prev.objects, cmd.id, [cmd.a, cmd.b])
  ) {
    const solve = (existing as { solve?: SolveDirective }).solve;
    const P = prevPos?.get(cmd.id);
    const A = prevPos?.get(cmd.a);
    const B = prevPos?.get(cmd.b);
    const L = A && B ? (B.x - A.x) ** 2 + (B.y - A.y) ** 2 : 0;
    const proj = P && A && B && L > 1e-12 ? ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / L : 0.5;
    const t = Math.min(0.88, Math.max(0.12, proj)); // within the span, clear of the endpoints
    const objects = prev.objects.map((o) =>
      o.id === cmd.id ? ({ kind: 'on-segment', id: cmd.id, a: cmd.a, b: cmd.b, t, free: true, ...(solve ? { solve } : {}) } as GeoObject) : o,
    );
    return { objects, constraints: [...prev.constraints] };
  }
  const next = applyCommand(prev, { type: 'set-collinear', a: cmd.id, b: cmd.a, c: cmd.b });
  const objects = [...next.objects];
  const constraints = [...next.constraints];
  addCollinearOrder(objects, constraints, cmd.extension ? [cmd.a, cmd.b, cmd.id] : [cmd.a, cmd.id, cmd.b]);
  return { objects, constraints };
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
 * For each circle in the figure, the point ids KNOWN (structurally) to lie on it — one entry per
 * circle OBJECT, keyed by the circle's id and carrying its centre letter. Lets the parser resolve
 * a phrase like "arc BC" to the circle that actually contains both B and C, disambiguating two
 * circles and correcting a wrongly-named one. Keyed by id (not centre letter) so a CONCENTRIC pair
 * ([ADR-244](../../docs/06-decisions.md#adr-244)) keeps its two member sets apart — the outer's
 * chord endpoints must not read as members of the inner. Membership comes from the object graph
 * (on-circle, circumcentre vertices, antipode/arc/line∩circle/circle∩circle outputs), not constraints.
 */
export function circleMembers(c: Construction): { id: Id; center: string; points: Id[] }[] {
  const entries = new Map<Id, { center: string; points: Set<Id> }>();
  const put = (circleId: Id, center: string, ...pts: Id[]) => {
    const e = entries.get(circleId) ?? { center, points: new Set<Id>() };
    for (const p of pts) e.points.add(p);
    entries.set(circleId, e);
  };
  const add = (circleId: Id | null | undefined, ...pts: Id[]) => {
    const circ = circleId ? c.objects.find((o) => o.id === circleId && o.kind === 'circle') : undefined;
    if (circ && circ.kind === 'circle') put(circ.id, circ.center, ...pts);
  };
  for (const o of c.objects) {
    switch (o.kind) {
      case 'circle': put(o.id, o.center); break; // ensure the circle appears even with no known members yet
      case 'on-circle': add(o.circle, o.id); break;
      case 'circumcenter': {
        // a,b,c lie on the circle centred at o.id — attach to that circle object (synthetic id if absent)
        const circ = c.objects.find((x) => x.kind === 'circle' && x.center === o.id);
        put(circ?.id ?? `circle-${o.id}`, o.id, o.a, o.b, o.c);
        break;
      }
      case 'antipode': add(o.circle, o.id, o.of); break;
      case 'arc-midpoint': add(o.circle, o.id, o.from, o.to); break;
      case 'line-circle': add(o.circle, o.id); break;
      case 'circle-circle': add(o.circle1, o.id); add(o.circle2, o.id); break;
    }
  }
  return [...entries].map(([id, e]) => ({ id, center: e.center, points: [...e.points] }));
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

/**
 * Drawn edges (segments + polygon sides) that are PARALLEL and share NO vertex in `pos` — e.g. a
 * trapezoid's two bases `[['A','B'],['D','C']]`. Lets the parser resolve "height/altitude from a vertex"
 * to the OPPOSITE PARALLEL BASE (the trapezoid case the triangle inference can't reach — the apex's two
 * neighbours are a diagonal, not an edge). Geometry-derived like `circleMembers`; parallelism holds
 * structurally for a trapezoid so one resolved snapshot suffices. Only vertex-disjoint pairs (true
 * opposite sides, not two edges sharing a corner) are returned.
 */
export function parallelEdgePairs(c: Construction, pos: Map<Id, Vec>): [[Id, Id], [Id, Id]][] {
  const edges: [Id, Id][] = [];
  const seen = new Set<string>();
  const addEdge = (a: Id, b: Id) => {
    if (a === b) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
  };
  for (const o of c.objects) {
    if (o.kind === 'segment') addEdge(o.a, o.b);
    else if (o.kind === 'polygon') for (let i = 0; i < o.vertices.length; i++) addEdge(o.vertices[i], o.vertices[(i + 1) % o.vertices.length]);
  }
  const out: [[Id, Id], [Id, Id]][] = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [d, e] = edges[j];
      if (a === d || a === e || b === d || b === e) continue; // share a vertex — not opposite sides
      const pa = pos.get(a), pb = pos.get(b), pd = pos.get(d), pe = pos.get(e);
      if (!pa || !pb || !pd || !pe) continue;
      const u = sub(pb, pa), w = sub(pe, pd);
      const lu = Math.hypot(u.x, u.y), lw = Math.hypot(w.x, w.y);
      if (lu < 1e-9 || lw < 1e-9) continue;
      // |cross of unit directions| ≈ 0 ⇒ parallel (same or opposite sense). ~0.3° tolerance.
      if (Math.abs((u.x * w.y - u.y * w.x) / (lu * lw)) < 5e-3) out.push([edges[i], edges[j]]);
    }
  return out;
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
