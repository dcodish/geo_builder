/**
 * The 3-D session store (docs/20 §7): the 2-D store's architecture transplanted —
 * the ordered FACT LIST is the source of truth, the figure is DERIVED by replaying
 * the enabled facts through the engine, positions are never stored (undo can't
 * desync), zundo gives temporal undo/redo.
 *
 * Unlike the 2-D store (where replay is expensive and cached in state), V0 figures
 * are tiny and `replay3` is closed-form — so the derived figure is NOT stored at
 * all: `derive3(facts, seed)` is recomputed by the UI (useMemo) and by tests.
 * That removes a whole class of undo/derived-desync bugs by construction: undo
 * restores {facts, seed}, and everything else follows.
 *
 * V0 semantics kept from the 2-D tool:
 *  - submit is all-or-nothing: a fact that errors is NOT added (keep-prior) and
 *    the error surfaces; the figure never breaks.
 *  - toggling a fact off re-derives; a dependent fact that can no longer apply is
 *    flagged in `status` (auto-drop, reversible) rather than deleted.
 *  - "show another configuration" advances the seed → free DOFs resample (box
 *    aspect, prism shape/height, free on-segment t). Stability: samples are keyed
 *    by object identity, so adding a fact never moves existing points.
 */

import { create } from 'zustand';
import type { PlaneDisplayMode3Map } from './figureFile3';
import { buildNotices3, type BuildNotice3 } from '../engine/notices';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import { stripFormatControls } from '../../shell/bidi';
import { applyCommand3, freeDims } from '../engine/apply';
import { scaleGivenActive, scaleGivenPower } from '../engine/scaleGiven';
import { scalePinned } from '../engine/solve3';
import { checkInSpan, componentValue, firstSatisfyingSeed3, memberHolds3, onLineHolds3, pinningGivens, resolve3, solidFaceCollapsed, type Resolved3 } from '../engine/evaluate';
import { verifyClaim } from '../engine/claims';
import { dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { namedPointAt } from '../engine/crossings3';
import { emptyConstruction3, type Command3, type Construction3, type EngineError3, type Id, type Positions3 } from '../engine/types';
import { droppedConstructNoun3, droppedGivenNumbers3, droppedNewLabels3, droppedShapeNoun3, droppedTriShape3 } from '../parser/honesty3';
import { parse3 } from '../parser/parse3';

export interface Fact3 {
  id: string;
  utterance: string;
  cmds: Command3[];
  enabled: boolean;
}

export type FactStatus3 = 'ok' | 'disabled' | EngineError3;

export interface Derived3 {
  construction: Construction3;
  /** The full resolved figure (positions + planes/lines/parameter) — the renderer's input. */
  resolved: Resolved3;
  /** Convenience alias of resolved.positions. */
  positions: Positions3;
  status: Record<string, FactStatus3>;
  /** #305 (ADR-3D-090): non-error "built, and here is what changed" messages, derived from the figure. */
  notices: BuildNotice3[];
}

export type StoreError3 =
  | EngineError3
  | { code: 'not-understood' }
  | { code: 'ambiguous-vector-length' }
  /** #516: one letter as both the running parameter and a figure DOF — a recognized ambiguity
   *  surfaces a clarification and NEVER escalates to the LLM lane (which would guess). */
  | { code: 'param-roles-conflated'; letter: string }
  /** The LLM decomposition lost part of the stated input (docs/24 S2.3 honesty gates) — `items` names
   *  the dropped labels/magnitudes; nothing was committed. */
  | { code: 'dropped-given'; items: string }
  | { code: 'bad-file' }
  | { code: 'newer-schema' }
  | null;

/**
 * Pure replay: fold the enabled facts through the reducer, evaluate — then
 * VERIFY: every claim is checked against the final figure across several
 * sampled configurations (claims.ts), and every span-driven point is
 * post-checked (its closed-form t must actually satisfy the condition ON the
 * stated segment). A fact that fails verification carries the verdict in
 * `status` — and `submit` refuses it (keep-prior), so a wrong answer or an
 * unsatisfiable condition can never silently sit on the figure.
 */
/** The first seed at/after `from` whose figure meets every stated requirement, or null when none does
 *  within budget (ADR-3D-053). Requirement-free figures return `from` immediately — the search costs
 *  nothing for the figures that state no inequality. */
function seedForRequirements(facts: Fact3[], from: number): number | null {
  const d = derive3(facts, from);
  const construction = d.construction;
  // #817 (ADR-3D-176): the short-circuit used to be «no stated requirements ⇒ any seed will do», which
  // is how «הציגו תצורה אחרת» could step straight onto a drawing with a COLLAPSED face — a zero-area
  // parallelogram base — and take the renderer down with it. A solid carries a general-position
  // preference nothing has to state, so the sweep must be consulted whenever the figure has solids.
  // Judged first on the resolution we ALREADY have, so the common (non-degenerate) case still returns
  // `from` without a single extra solve.
  if (construction.requirements.length === 0 && !solidFaceCollapsed(construction, d.positions)) return from;
  return firstSatisfyingSeed3(construction, from);
}

/**
 * #508 — every NAMED plane a claim mentions, wherever it sits in that claim's shape. A STRUCTURAL walk
 * rather than a switch over claim kinds: an enumeration of kinds is exactly what this issue was filed
 * on, and a claim kind added later must not quietly escape the guard that keeps a free plane from
 * producing a false accusation. Callers filter to the planes that are actually still undetermined.
 */
const freePlanesOf = (claim: unknown): string[] => {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-named' && typeof o.name === 'string') out.push(o.name);
    if (typeof o.plane === 'string') out.push(o.plane);
    for (const val of Object.values(o)) walk(val);
  };
  walk(claim);
  return out;
};

/** #552 — every NAMED line a claim mentions: the {@link freePlanesOf} walk, line edition, guarding the
 *  same class (a claim judged against a still-sampled free line is a false accusation, not a refutation). */
const linesOf = (claim: unknown): string[] => {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'line' && typeof o.name === 'string') out.push(o.name);
    if (typeof o.line === 'string') out.push(o.line);
    for (const val of Object.values(o)) walk(val);
  };
  walk(claim);
  return out;
};

/**
 * #512 — does this claim relate the figure to the ABSOLUTE FRAME (a coordinate plane or axis)? Such a
 * claim is a statement about where the figure SITS, so it can only be judged once the placement is
 * fixed. Same structural walk as {@link freePlanesOf}, for the same reason: a claim kind added later
 * must not escape the guard.
 */
const refsCoordFrame = (claim: unknown): boolean => {
  let found = false;
  const walk = (v: unknown): void => {
    if (found) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'plane-coord' || o.kind === 'axis') found = true;
    else for (const val of Object.values(o)) walk(val);
  };
  walk(claim);
  return found;
};

export function derive3(facts: Fact3[], seed: number): Derived3 {
  let c: Construction3 = emptyConstruction3();
  const status: Record<string, FactStatus3> = {};
  const claimOwners: { factId: string; from: number; to: number }[] = [];
  const pinOwnerIds = new Set<string>();
  /** #425: the pins that are COORDINATES (an injected point or vector) — the only pins whose refusal
   *  may speak of «the given coordinates». Tracked apart from the general pin set because the guard
   *  below was deliberately widened to EVERY pin kind while the message it emits stayed the
   *  injection-specific one, so a figure carrying no coordinate at all was told to check its. */
  const coordPinOwnerIds = new Set<string>();
  /** #492: the facts that contributed something CONSTRAINING THE PARAMETER — a pinning given
   *  (`pinningGivens`: plane angles, line⟂plane, S2 line relations) or a `paramGivens` claim. Kept in
   *  fact order, so the LAST is the newest statement: a refusal names what the student just said
   *  (the ADR-276 blame-honesty precedent), not an arbitrary member of the conflicting set. */
  const paramPinOwners: string[] = [];
  // #116 (M4 defaults-yield): a right-triangle's SOFT default right angle (a `cos-angle` cos:0 at the
  // middle vertex) is dropped when an EXPLICIT ∠=90 on the SAME three vertices is stated — the student's
  // choice of right-angle vertex wins over the soft guess (ADR-052/163). Scanned once before the fold.
  // #424 generalizes the same mechanism to the SECOND relation kind that carries a soft default: an
  // isosceles triangle's equal pair. Keyed by the TRIANGLE (not the pair), because ADR-114's whole
  // point is that a soft `|AB|=|AC|` plus an explicit `|AB|=|BC|` would stack into an EQUILATERAL
  // triangle the student never asked for — so any explicit equal pair among the three sides retires
  // the guess. One registry per soft kind, so a third slots in without new branching.
  const key3 = (labels: string[]) => [...labels].sort().join('');
  const explicitRightAngles = new Set<string>();
  const explicitEqualSides = new Set<string>();
  for (const f of facts) {
    if (!f.enabled) continue;
    for (const cmd of f.cmds) {
      if (cmd.type === 'cos-angle' && !cmd.soft && Math.abs(cmd.cos) < 1e-9 && cmd.u.kind === 'pair' && cmd.v.kind === 'pair' && cmd.u.from === cmd.v.from)
        explicitRightAngles.add(key3([cmd.u.from, cmd.u.to, cmd.v.to]));
      if (cmd.type === 'claim' && cmd.claim.type === 'angle-seg-eq' && Math.abs(cmd.claim.deg - 90) < 1e-9 && cmd.claim.a1 === cmd.claim.a2)
        explicitRightAngles.add(key3([cmd.claim.a1, cmd.claim.b1, cmd.claim.b2]));
      // an explicit |xy| = |zw| whose two pairs span exactly THREE labels names a triangle's side pair
      if (cmd.type === 'length-rel' && !cmd.soft && cmd.c === 1 && 'pair' in cmd.rhs) {
        const labels = new Set([cmd.a1, cmd.b1, ...cmd.rhs.pair]);
        if (labels.size === 3) explicitEqualSides.add(key3([...labels]));
      }
    }
  }
  const droppedSoft = (cmd: Command3): boolean => {
    if (cmd.type === 'cos-angle')
      return !!cmd.soft && cmd.u.kind === 'pair' && cmd.v.kind === 'pair' &&
        explicitRightAngles.has(key3([cmd.u.from, cmd.u.to, cmd.v.to]));
    if (cmd.type === 'length-rel' && cmd.soft && 'pair' in cmd.rhs) {
      const labels = new Set([cmd.a1, cmd.b1, ...cmd.rhs.pair]);
      return labels.size === 3 && explicitEqualSides.has(key3([...labels]));
    }
    return false;
  };
  for (const f of facts) {
    if (!f.enabled) {
      status[f.id] = 'disabled';
      continue;
    }
    let st: FactStatus3 = 'ok';
    const claimsBefore = c.claims.length;
    const pinsBefore =
      c.pins.length + c.vectorPins.length + c.pairPins.length + c.scalarPins.length + c.planePins.length + c.coordPlanePins.length;
    const coordPinsBefore = c.pins.length + c.vectorPins.length;
    const paramPinsBefore = pinningGivens(c) + c.paramGivens.length;
    for (const cmd of f.cmds) {
      if (droppedSoft(cmd)) continue; // an explicit ∠=90 on this triangle superseded the soft default
      const r = applyCommand3(c, cmd);
      if (!r.ok) {
        st = r.error;
        break;
      }
      c = r.next;
    }
    // count-delta attribution: EVERY claim recorded while this fact applied belongs to
    // it — including claims composite commands create indirectly (none can escape)
    if (c.claims.length > claimsBefore) claimOwners.push({ factId: f.id, from: claimsBefore, to: c.claims.length });
    // pin ownership (same count-delta discipline): a fact that contributed ANY pivot
    // pin must not read ok when the pivot finds no placement (honesty — no silent seed figure)
    if (
      c.pins.length + c.vectorPins.length + c.pairPins.length + c.scalarPins.length + c.planePins.length + c.coordPlanePins.length >
      pinsBefore
    )
      pinOwnerIds.add(f.id);
    if (c.pins.length + c.vectorPins.length > coordPinsBefore) coordPinOwnerIds.add(f.id);
    if (pinningGivens(c) + c.paramGivens.length > paramPinsBefore) paramPinOwners.push(f.id);
    status[f.id] = st;
  }

  const resolved = resolve3(c, seed);
  const positions = resolved.positions;

  /**
   * #425/#492 — the statements a refusal must NAME. The honesty invariant is that an error names the
   * conflicting STATEMENT, never internal state, so every refusal built here quotes the student's own
   * utterances. Capped at three with a visible «…» rather than a silent truncation.
   */
  const namedStatements = (ids: Iterable<string>, exclude: string): string[] => {
    const want = new Set(ids);
    want.delete(exclude);
    const out = facts.filter((f) => f.enabled && want.has(f.id)).map((f) => f.utterance);
    return out.length > 3 ? [...out.slice(0, 3), '…'] : out;
  };

  /**
   * #492 — the givens admit NO REAL PARAMETER VALUE. This is knowledge the engine already has
   * (`paramRoots` returned nothing while something pinned the parameter), and it is strictly stronger
   * than "the claim fails here": no configuration of this figure can ever satisfy it.
   *
   * It is gated on the PROPERTY — did this fact contribute something that constrains the parameter —
   * and no longer on a LIST of command types. The list («plane-angle», «line-perp-plane») was written
   * when those were the only pinning kinds; S2 (#378) added the line relations and never joined it, so
   * «l ∥ π1» over `d·n = 2((m−1)²+1)` fell through to the claim verifier and was reported as
   * «the claim doesn't hold in the figure — check your computation» — blaming the student's arithmetic
   * for a claim no real m can satisfy. `pinningGivens` is the same count the root-finder itself uses,
   * so a future pinning kind is covered the day it is added (docs/17: an enumeration is not a rule).
   *
   * The claim pass is SKIPPED in this state: with no valid parameter value there is no configuration to
   * verify against, so every param-dependent claim would "fail" and earlier, innocent facts would be
   * marked refuted too. A claim cannot be refuted by a figure that has none.
   */
  const paramContradiction = resolved.param !== null && paramPinOwners.length > 0 && resolved.param.roots.length === 0;
  if (paramContradiction) {
    const blamed = paramPinOwners[paramPinOwners.length - 1];
    if (status[blamed] === 'ok')
      status[blamed] = {
        code: 'no-roots',
        sym: resolved.param!.name,
        stated: facts.find((f) => f.id === blamed)?.utterance ?? '',
        others: namedStatements(paramPinOwners, blamed),
      };
  } else {
    // verify every recorded claim against the FINAL figure, attributed to its fact
    for (const owner of claimOwners) {
      if (status[owner.factId] !== 'ok') continue;
      for (let i = owner.from; i < owner.to; i++) {
        const claim = c.claims[i];
        // V2 honest boundary, narrowed by #754 (ADR-3D-171): a magnitude statement on a solid
        // figure. The FIRST eligible one is the SCALE GIVEN (exempt here — the resolver's uniform
        // rescale makes it hold exactly, and the ordinary verification below confirms it). A LATER
        // magnitude is CHECKED where the check is honest — the scale is stated and no shape DOF is
        // being sampled (a rigid solid, e.g. the cube: «|AB| = 4» then «|AC| = 10» refuses naming
        // that statement, since the face diagonal is 4√2) — and refused `size-on-solid` where it is
        // not (still-free dims: refuting against a sampled proportion would accuse the student of
        // the tool's own choice, the #508 class). A volume claim on a figure whose scale absolute
        // data pins (`scalePinned`) keeps its existing verify-your-answer register untouched.
        const magPower = scaleGivenPower(claim);
        if (
          magPower !== null &&
          !c.paramGivens.includes(claim) &&
          c.solids.length > 0 &&
          !(c.scaleGivens.includes(claim) && scaleGivenActive(c))
        ) {
          const exactlyCheckable = scaleGivenActive(c) && freeDims(c) === 0;
          const pivotLane = claim.type === 'volume-poly' && c.scaleGivens.length === 0 && scalePinned(c);
          if (!exactlyCheckable && !pivotLane) {
            status[owner.factId] = { code: 'size-on-solid' };
            break;
          }
        }
        if (!verifyClaim(claim, c, seed)) {
          // #508 — a claim about a FREE plane whose relevant DOF is still SAMPLED cannot be refuted:
          // the configuration it "fails" in is one the tool invented, not one the student stated.
          // Reporting `claim-refuted` there is a false accusation — «your distance is wrong» about a
          // perfectly good given, purely because nothing had tried to move the plane's offset. The
          // resolver now pins what it can (memberships, ∥/⟂, distance); this guard is the CLASS half,
          // so a constraint kind it does not yet pin degrades to an honest "pin this plane first"
          // instead of blaming the student. Named plane first, so the message can say which.
          const undetermined = freePlanesOf(claim).find((p) => (resolved.freePlaneDofs.get(p) ?? 0) > 0);
          // #552 — the same guard, line edition: a free LINE whose DOFs are still sampled.
          const undeterminedLine = linesOf(claim).find((l) => (resolved.freeLineDofs.get(l) ?? 0) > 0);
          // #512 — the same argument one step out: a claim against the COORDINATE FRAME is a claim
          // about where the figure sits, and the landing funnel SAMPLED that placement (nothing the
          // student stated fixed it). «BD' ⊥ מישור [xy]» is perfectly satisfiable — rotate the box
          // until its diagonal stands vertical — so refuting it would accuse the student on the
          // strength of an arbitrary choice the tool made. Say what is actually missing instead.
          status[owner.factId] =
            undetermined ? { code: 'plane-not-determined', id: undetermined }
            : undeterminedLine ? { code: 'line-not-determined', id: undeterminedLine }
            : resolved.placementSampled && refsCoordFrame(claim) ? { code: 'placement-not-fixed' }
            : { code: 'claim-refuted' };
          break;
        }
      }
    }
  }

  /**
   * A pin-contributing fact with NO pivot placement — an honest refusal, never a silent fallback to
   * the unsolved seed figure (class: any pin kind, not only injections).
   *
   * #425 — the REFUSAL is now split the same way the GUARD is. The guard was deliberately widened to
   * every pin kind (its own comment says so) while the message it emitted stayed the injection-specific
   * «no placement of the solid matches the given coordinates». On the equilateral-base pyramid
   * (∠DAB = 120 then ∠DAC = 53.13 — impossible in R³ by the spherical triangle inequality, and
   * correctly refused) the figure contains no coordinate at all: the student was told to check
   * coordinates they never entered, and NOT told the one thing that mattered — that those two angles
   * cannot both hold on an equilateral base. Only a COORDINATE pin may speak of coordinates; every
   * other pin kind reports the contradiction it actually found and names the statements in conflict.
   *
   * Blame lands on the NEWEST pin owner alone (ADR-276): the earlier givens were satisfiable until
   * this one arrived, so marking all of them red — which the previous loop did — accuses statements
   * that are not at fault. `pinOwnerIds` is insertion-ordered in fact order, so the last is the newest.
   */
  const blamedPinOwner = [...pinOwnerIds].pop();
  if (blamedPinOwner !== undefined && status[blamedPinOwner] === 'ok' && resolved.pivot && resolved.pivot.solutions === 0) {
    const f = facts.find((x) => x.id === blamedPinOwner)!;
    status[blamedPinOwner] = coordPinOwnerIds.has(blamedPinOwner)
      ? { code: 'injection-unsatisfiable' }
      : { code: 'givens-contradict', stated: f.utterance, others: namedStatements(pinOwnerIds, blamedPinOwner) };
  }

  // #769 (ADR-3D-183) — A DERIVED POINT THAT LANDS ON AN EXISTING NAMED POINT IS NOT MINTED. The
  // student made two claims — "there is a crossing of AC' with plane ADE" (true) and "call it G, a new
  // point" (false: it is A, which defines the plane). The refusal affirms the geometry and refuses the
  // name (operator ruling 2026-08-25). Stated over DERIVED points — every 0-DOF kind — not over the one
  // command that surfaced it; provenance is derived from the fact list (the first fact naming the id
  // minted it), never from a list of minting command types. The judgement is the click-offer's own
  // (`namedPointAt`), so the OFFER lane and the TYPED lane answer one question the same way (#653).
  {
    const DERIVED = new Set([
      'on-segment', 'centroid', 'in-span', 'right-apex', 'foot-plane', 'foot-line', 'line-plane', 'plane-cut',
      'foot-face', 'bisector-seg', 'foot-seg', 'right-pyramid-apex', 'vec-defined', 'vec-pair',
    ]);
    const order = [...c.points.keys()];
    const minter = new Map<Id, string>();
    for (const f of facts) for (const cmd of f.cmds) if ('id' in cmd && typeof cmd.id === 'string' && !minter.has(cmd.id)) minter.set(cmd.id, f.id);
    for (const [id, def] of c.points) {
      if (!DERIVED.has(def.kind)) continue;
      if (def.kind === 'on-segment' && def.t === undefined) continue; // a free rider, not a derived point
      const fid = minter.get(id);
      if (fid === undefined || status[fid] !== 'ok') continue;
      const P = positions.get(id);
      if (!P) continue;
      const earlier = order.slice(0, order.indexOf(id)).flatMap((q): [Id, Vec3][] => {
        const Q = positions.get(q);
        return Q ? [[q, Q]] : [];
      });
      const with_ = namedPointAt(P, earlier);
      if (with_ !== null) status[fid] = { code: 'point-coincides', id, with: with_ };
    }
  }

  for (const f of facts) {
    if (status[f.id] !== 'ok') continue;
    for (const cmd of f.cmds) {
      if (cmd.type === 'point-in-span') {
        const def = c.points.get(cmd.id);
        if (def?.kind === 'in-span') {
          const verdict = checkInSpan(c, cmd.id, def, positions);
          if (verdict !== 'ok') {
            status[f.id] = { code: verdict, id: cmd.id };
            break;
          }
        }
      } else if (cmd.type === 'param-sign') {
        // ADR-3D-032: the chosen parameter value must honour the stated sign.
        // #325 (ADR-3D-079): the sign may name a PIN symbol (`B(2t,t,k)` → t) — read the
        // pivot's solved value for it instead of the coord-sym parameter.
        // #814 (ADR-3D-175): ...and the THIRD thing a letter can be — a NAME for a free component
        // («D(3,p,0)» → D's y). Its value is that component's, read from the final positions. The
        // verifier has to know every kind of letter apply routes, or a correctly-applied sign reports
        // `sign-unsatisfiable` against a figure that honours it.
        const bound = c.partialNames.find((b) => b.sym === cmd.sym);
        const v =
          resolved.param?.name === cmd.sym
            ? resolved.param.value
            : (resolved.pivot?.pinSymbols?.[cmd.sym] ??
               (bound ? componentValue(c, bound.target, bound.axis, (id) => positions.get(id)) : undefined));
        if (v === undefined || !Number.isFinite(v) || (cmd.positive ? v <= 1e-9 : v >= -1e-9)) {
          status[f.id] = { code: 'sign-unsatisfiable', id: cmd.sym };
          break;
        }
      } else if (cmd.type === 'vec-rel' || cmd.type === 'seg-plane-rel' || cmd.type === 'length-rel') {
        // a vec-defined/vec-pair point (or a pinned symbol) that found NO position → honest refusal
        const ids =
          cmd.type === 'vec-rel'
            ? [
                cmd.from,
                cmd.to,
                ...cmd.terms.flatMap((t) =>
                  t.atom.kind === 'pair'
                    ? [t.atom.from, t.atom.to]
                    : (() => {
                        const dv = c.vectors.get(t.atom.name);
                        return dv ? [dv.from, dv.to] : [];
                      })(),
                ),
              ]
            : cmd.type === 'length-rel'
              ? [
                  cmd.a1,
                  cmd.b1,
                  ...('pair' in cmd.rhs
                    ? cmd.rhs.pair
                    : (() => {
                        const dv = c.vectors.get((cmd.rhs as { vec: string }).vec);
                        return dv ? [dv.from, dv.to] : [];
                      })()),
                ]
              : [cmd.a, cmd.b];
        const missing = ids.find((id) => {
          const def = c.points.get(id);
          return (def?.kind === 'vec-defined' || def?.kind === 'vec-pair') && !positions.has(id);
        });
        if (missing) {
          status[f.id] = { code: 'no-solution', id: missing };
          break;
        }
        // (claims these relations may have recorded are verified by the count-delta pass above)
      } else if (cmd.type === 'line-plane-point') {
        if (!positions.has(cmd.id)) {
          status[f.id] = { code: 'line-misses-plane', id: cmd.id }; // parallel at the chosen parameter
          break;
        }
      } else if (cmd.type === 'plane-cut') {
        // #780 — BOUND THE CROSSING TO THE INK, matching #756's offer half ("a crossing outside the
        // ink is not on the figure"). The operand is a drawn segment — a solid's edge or an auxiliary
        // segment — so a crossing beyond its endpoints means the plane misses what the student pointed
        // at. The point is still placed (the evaluator solves the line/plane pair); this is the honest
        // status that used to be hidden by lowering the segment to an unbounded line.
        const P = positions.get(cmd.id);
        const A = positions.get(cmd.a);
        const B = positions.get(cmd.b);
        if (!P || !A || !B) {
          status[f.id] = { code: 'line-misses-plane', id: cmd.id }; // ∥ to the plane — no crossing at all
          break;
        }
        const dir = sub3(B, A);
        const len2 = dot3(dir, dir);
        const t = len2 > 1e-18 ? dot3(sub3(P, A), dir) / len2 : -1;
        if (!(t > -1e-9 && t < 1 + 1e-9)) {
          status[f.id] = { code: 'crossing-off-segment', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'on-line') {
        const p = positions.get(cmd.id);
        const ln = resolved.lines.get(cmd.line);
        // #801 (ADR-3D-174): the predicate is `onLineHolds3` — the SAME one the stage-4 drive aims at,
        // so a driven membership can never land inside the drive's bar and outside the verifier's.
        const holds = p !== undefined && ln !== undefined && onLineHolds3(p, ln);
        if (!holds) {
          status[f.id] = { code: 'not-on-line', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'point-on-circle3') {
        // V8-i: on the circle ⟺ |P−centre| = radius AND P lies in the circle's plane
        const p = positions.get(cmd.point);
        const k = cmd.circle === '' ? resolved.circles3[0] : resolved.circles3.find((x) => x.id === cmd.circle);
        const holds =
          p !== undefined &&
          k !== undefined &&
          Math.abs(norm3(sub3(p, k.center)) - k.radius) <= 1e-5 * Math.max(k.radius, 1) &&
          Math.abs(dot3(sub3(p, k.center), k.normal)) <= 1e-5 * Math.max(k.radius, 1);
        if (!holds) {
          status[f.id] = { code: 'not-on-line', id: cmd.point };
          break;
        }
      } else if (cmd.type === 'right-pyramid-point') {
        // V8-j: no point on the segment sits above the base centroid → no right pyramid (honest)
        if (!positions.has(cmd.id)) {
          status[f.id] = { code: 'no-solution', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'inject-vector' || (cmd.type === 'point3' && c.pins.some((p) => p.id === cmd.id))) {
        // an injection with NO satisfying placement — the pivot found nothing (honest refusal)
        if (resolved.pivot && resolved.pivot.solutions === 0) {
          status[f.id] = { code: 'injection-unsatisfiable' };
          break;
        }
      } else if (cmd.type === 'sign-given') {
        const p = positions.get(cmd.id);
        const val = p?.[cmd.axis];
        const holds = val !== undefined && (cmd.positive ? val > 1e-9 : val < -1e-9);
        if (!holds) {
          status[f.id] = { code: 'sign-unsatisfiable', id: cmd.id };
          break;
        }
      } else if (cmd.type === 'on-planes') {
        const p = positions.get(cmd.id);
        if (cmd.side) {
          // above/below (ADR-3D-015): the signed side of the +z-oriented plane — checked on
          // FINAL coordinates, so it holds for a created point AND verifies a stated one
          const pl = cmd.plane === 'any' ? undefined : resolved.planes.get(cmd.plane);
          if (!p || !pl) {
            status[f.id] = { code: 'not-on-plane', id: cmd.id };
            break;
          }
          const nz = pl.n.z / norm3(pl.n);
          if (Math.abs(nz) <= 1e-9) {
            // a vertical plane has no "above"/"below" — refuse rather than guess a side
            status[f.id] = { code: 'plane-side-undefined', id: cmd.plane };
            break;
          }
          let signed = (dot3(pl.n, p) + pl.d) / norm3(pl.n);
          if (nz < 0) signed = -signed;
          if (signed * (cmd.side === 'above' ? 1 : -1) <= 1e-9) {
            status[f.id] = { code: 'wrong-side-of-plane', id: cmd.id };
            break;
          }
        } else {
          const names = cmd.plane === 'any' ? [...resolved.planes.keys()] : [cmd.plane];
          // memberHolds3 (ADR-3D-033): the same predicate the membership DRIVE triggers
          // on, so a driven landing always verifies (no drive/verify tolerance gap)
          const holds =
            p !== undefined &&
            names.some((name) => {
              const pl = resolved.planes.get(name);
              return pl !== undefined && memberHolds3(p, pl);
            });
          if (!holds) {
            status[f.id] = { code: 'not-on-plane', id: cmd.id };
            break;
          }
        }
      } else if (cmd.type === 'plane-through') {
        // a plane named by points must be a REAL plane: 4 named points must be coplanar,
        // 3 must not be collinear — a best-fit patch through off-plane points would lie
        const pl = resolved.planes.get(cmd.name);
        const holds =
          pl !== undefined &&
          cmd.ids.every((q) => {
            const p = positions.get(q);
            return p !== undefined && Math.abs(dot3(pl.n, p) + pl.d) <= 1e-5 * norm3(pl.n) * (1 + norm3(p));
          });
        if (!holds) {
          status[f.id] = { code: 'not-coplanar', id: cmd.name };
          break;
        }
      }
    }
  }

  return { construction: c, resolved, positions, status, notices: buildNotices3(c) };
}

export interface Geo3State {
  facts: Fact3[];
  seed: number;
  lastError: StoreError3;
  /**
   * #613 (ADR-W-031) — the statement SUCCEEDED and added nothing, because the figure already says it.
   * Not an error: the student is not wrong, they repeated themselves, and a refusal for something that
   * is not a mistake reads harshly (option (a), rejected by the operator's ruling). Cleared by every
   * other submit, so it never lingers over an unrelated line.
   */
  lastNotice: { code: 'already-stated'; utterance: string } | null;
  submit: (utterance: string) => void;
  /** Add ONE fact from LLM-normalised canonical lines (each re-parsed deterministically; all-or-nothing). */
  submitSteps: (utterance: string, steps: string[]) => void;
  toggle: (factId: string) => void;
  remove: (factId: string) => void;
  /** Edit a fact IN PLACE (B5 #670, docs/28 §4a D6): re-parse the new text and run it through the
   *  SAME acceptance chain as `submit` (parse → dropped-given honesty gates → candidate derive →
   *  seed search), with the candidate list replacing the fact at its position — order is meaningful
   *  in a construction, so an edit never moves the statement. Returns false on refusal (nothing
   *  changes; `lastError` names why — the shared FactList keeps its editor open on false).
   *  An edit that orphans a DEPENDENT commits and the dependent flags on its own row — the same
   *  reversible auto-drop contract as `toggle`, this product's honesty surface. */
  replaceFact: (factId: string, utterance: string) => boolean;
  clear: () => void;
  /** Data-panel QUERIES (ADR-3D-057, #274): quantities the student asked to see («w·v», «|AB|»…).
   *  NOT facts — never replayed, never on the figure; saved with the file, undoable. */
  queries: string[];
  addQuery: (text: string) => void;
  removeQuery: (index: number) => void;
  /** Per-plane patch display (#318): 'face' = the patch is EXACTLY the defining point-run
   *  polygon (the triangle/quad itself); absent = 'full', today's growing patch. Display
   *  state, not a fact — saved with the file and undoable, like `queries`; reset by `clear`. */
  planeDisplay: PlaneDisplayMode3Map;
  togglePlaneDisplay: (name: string) => void;
  /** The figure's NAME (issue #42) - shown on the page, used as the save filename, derived from the
   *  loaded file's name. Session metadata: NOT in the undo history (partialize is facts+seed only);
   *  reset by `clear`. */
  figureName: string;
  setFigureName: (name: string) => void;
  resample: () => void;
  dismissError: () => void;
  /** Load a deserialised figure — ONE undoable set (never destructive: undo restores the prior session). */
  loadFigure: (facts: Fact3[], seed: number, queries?: string[], planeDisplay?: PlaneDisplayMode3Map) => void;
  /** Surface a file-load refusal through the normal error banner. */
  reportLoadError: (reason: 'bad-file' | 'newer-schema') => void;
}

/**
 * #613 — two facts are the SAME STATEMENT when their lowered commands are structurally equal.
 *
 * Compared on the COMMANDS, never on the utterance: «משולש ABC» and «triangle ABC» are one statement in
 * two languages, and the round-trip serializer already relies on structural equality of commands. Order
 * matters — a command list is a sequence, and two different orderings are not obviously the same claim.
 */
const sameStatement = (a: readonly Command3[], b: readonly Command3[]): boolean =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

export const useGeo3 = create<Geo3State>()(
  temporal(
    (set, get) => ({
      facts: [],
      seed: 0,
      queries: [],
      planeDisplay: {},
      figureName: '',
      lastError: null,
      lastNotice: null,

      submit: (utterance) => {
        utterance = stripFormatControls(utterance); // #751 (ADR-W-029) — the store-side ingest invariant
        const parsed = parse3(utterance);
        if (!parsed.ok) {
          // #516: every TYPED refusal keeps its identity — only a genuine `not-handled` may read as
          // not-understood, because not-understood is what the App escalates to the LLM lane.
          set({
            lastError:
              parsed.reason === 'ambiguous-vector-length'
                ? { code: 'ambiguous-vector-length' }
                : parsed.reason === 'param-roles-conflated'
                  ? { code: 'param-roles-conflated', letter: parsed.letter }
                  : { code: 'not-understood' },
          });
          return;
        }
        const { facts, seed } = get();
        // #424 / #438 / #440 / #535: the honesty gates guard the DETERMINISTIC path too — bound to the
        // EVENT, not to a commit path. The old reasoning ("the rules parse the utterance itself, so
        // nothing can leak") was falsified by #530: a rule CAN match an utterance and still drop part
        // of it — an optional label capture that quietly goes unfilled commits a partial figure with a
        // green ✓, and the label/number gates knew but were only ever asked on the LLM seam
        // (ADR-3D-147). The catalog corpus is asserted gate-clean in honesty3.test.ts, so the canonical
        // phrasings never pay this check with a false refusal.
        const prior3 = derive3(facts, seed).construction;
        const lostDet = [
          ...droppedNewLabels3(utterance, parsed.commands, [...prior3.points.keys()], [...prior3.vectors.keys()]),
          ...droppedGivenNumbers3(utterance, parsed.commands),
          ...droppedShapeNoun3(utterance, parsed.commands), // #587: a stated QUAD noun the flat lane cannot lower
          ...droppedTriShape3(utterance, parsed.commands),
          ...droppedConstructNoun3(utterance, parsed.commands),
        ];
        if (lostDet.length > 0) {
          set({ lastError: { code: 'dropped-given', items: lostDet.join(', ') } });
          return;
        }
        // #613 (ADR-W-031, operator ruling 2026-08-16: "if a fact is already known - it should not be
        // added. this is true to all tools") — a RESTATED fact succeeds and appends no row. M1
        // idempotency is at APPLY, where a statement about existing objects correctly returns the
        // construction unchanged; the STORE then appended anyway, so the fact list — the record of what
        // the student stated, and what `.geo3.json` saves and replays — grew entries that state nothing.
        // This is the store-level rule 2-D has always had in `foldFact`, which is why this is a port and
        // not a new mechanism. A disabled twin is RE-ENABLED rather than duplicated (2-D's FR-EN-9).
        const twin = facts.find((f) => sameStatement(f.cmds, parsed.commands));
        if (twin) {
          set({
            facts: twin.enabled ? facts : facts.map((f) => (f.id === twin.id ? { ...f, enabled: true } : f)),
            lastError: null,
            lastNotice: { code: 'already-stated', utterance: twin.utterance },
          });
          return;
        }
        const fact: Fact3 = { id: nanoid(8), utterance: utterance.trim(), cmds: parsed.commands, enabled: true };
        const candidate = [...facts, fact];
        const st = derive3(candidate, seed).status[fact.id];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st }); // keep-prior: the bad fact is not added
          return;
        }
        // ADR-3D-053 (#273): a stated inequality determines nothing, so it can only be honoured by
        // CHOOSING a configuration that satisfies it. Land on one before drawing; if none exists within
        // budget, refuse and keep the prior figure rather than draw a figure that contradicts the given.
        const found = seedForRequirements(candidate, seed);
        if (found === null) {
          set({ lastError: { code: 'bound-unsatisfiable', id: '' } });
          return;
        }
        set({ facts: candidate, seed: found, lastError: null, lastNotice: null });
      },

      submitSteps: (utterance, steps) => {
        utterance = stripFormatControls(utterance); // #751 (ADR-W-029)
        const all: Command3[] = [];
        for (const step of steps) {
          const p = parse3(step);
          if (!p.ok) {
            set({ lastError: { code: 'not-understood' } }); // an LLM step the parser can't read — refuse whole
            return;
          }
          all.push(...p.commands);
        }
        if (all.length === 0) {
          set({ lastError: { code: 'not-understood' } });
          return;
        }
        const { facts, seed } = get();
        // HONESTY GATES on the LLM seam (docs/24 S2.3 — the 2-D ADR-240/ADR-250 line, copied per
        // docs/20 §12): the decomposition must account for every NEW label and every stated magnitude
        // of the student's ORIGINAL utterance, or the commit refuses NAMING what was lost — a
        // silently-partial figure must never sit on the canvas with a green row. The deterministic
        // path runs the same label/number gates in `submit` (#535, ADR-3D-147) — a rule that matches
        // and still drops part of the sentence leaks exactly as an LLM decomposition can (#530).
        const prior = derive3(facts, seed).construction;
        const lost = [
          ...droppedNewLabels3(utterance, all, [...prior.points.keys()], [...prior.vectors.keys()]),
          ...droppedGivenNumbers3(utterance, all),
          ...droppedShapeNoun3(utterance, all), // ADR-3D-084 (#304): a stated base shape silently changed
          ...droppedTriShape3(utterance, all), // #424: a stated triangle qualifier silently dropped
          ...droppedConstructNoun3(utterance, all), // #438/#440: a stated OBJECT never materialised
        ];
        if (lost.length > 0) {
          set({ lastError: { code: 'dropped-given', items: lost.join(', ') } });
          return;
        }
        const fact: Fact3 = { id: nanoid(8), utterance: utterance.trim(), cmds: all, enabled: true };
        const candidate = [...facts, fact];
        const st = derive3(candidate, seed).status[fact.id];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st });
          return;
        }
        set({ facts: candidate, lastError: null, lastNotice: null });
      },

      toggle: (factId) =>
        set({ facts: get().facts.map((f) => (f.id === factId ? { ...f, enabled: !f.enabled } : f)), lastError: null }),

      remove: (factId) => set({ facts: get().facts.filter((f) => f.id !== factId), lastError: null }),

      replaceFact: (factId, utterance) => {
        utterance = stripFormatControls(utterance); // #751 (ADR-W-029)
        const { facts, seed } = get();
        const old = facts.find((f) => f.id === factId);
        if (!old) return false;
        const parsed = parse3(utterance);
        if (!parsed.ok) {
          // the same #516 identity-preserving refusal mapping as `submit`
          set({
            lastError:
              parsed.reason === 'ambiguous-vector-length'
                ? { code: 'ambiguous-vector-length' }
                : parsed.reason === 'param-roles-conflated'
                  ? { code: 'param-roles-conflated', letter: parsed.letter }
                  : { code: 'not-understood' },
          });
          return false;
        }
        // The honesty gates read "prior" as the OTHER facts — the edited statement's own old
        // labels are exactly what the edit may be renaming, so they must count as new here.
        const rest = facts.filter((f) => f.id !== factId);
        const prior3 = derive3(rest, seed).construction;
        const lostDet = [
          ...droppedNewLabels3(utterance, parsed.commands, [...prior3.points.keys()], [...prior3.vectors.keys()]),
          ...droppedGivenNumbers3(utterance, parsed.commands),
          ...droppedShapeNoun3(utterance, parsed.commands),
          ...droppedTriShape3(utterance, parsed.commands),
          ...droppedConstructNoun3(utterance, parsed.commands),
        ];
        if (lostDet.length > 0) {
          set({ lastError: { code: 'dropped-given', items: lostDet.join(', ') } });
          return false;
        }
        // Same id, same position, same enabled state — only the statement changes. A MUTED fact's
        // candidate status is 'disabled', so its rewrite passes the derive gate by construction
        // (it gates for real when re-enabled, exactly like the complex builder's muted-edit rule).
        const fact: Fact3 = { ...old, utterance: utterance.trim(), cmds: parsed.commands };
        const candidate = facts.map((f) => (f.id === factId ? fact : f));
        const st = derive3(candidate, seed).status[factId];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st }); // keep-prior: the old statement stands
          return false;
        }
        const found = seedForRequirements(candidate, seed);
        if (found === null) {
          set({ lastError: { code: 'bound-unsatisfiable', id: '' } });
          return false;
        }
        set({ facts: candidate, seed: found, lastError: null });
        return true;
      },

      clear: () => set({ facts: [], queries: [], planeDisplay: {}, figureName: '', lastError: null, lastNotice: null }),

      // A query is a QUESTION about the figure, never a fact (ADR-3D-057): it never enters replay.
      // Duplicates are dropped (asking twice adds nothing); trimmed; capped so the panel stays sane.
      addQuery: (text) => {
        const t = text.trim();
        if (!t) return;
        const cur = get().queries;
        if (cur.includes(t) || cur.length >= 30) return;
        set({ queries: [...cur, t] });
      },
      removeQuery: (index) => set({ queries: get().queries.filter((_, i) => i !== index) }),

      // #318 + #395 (ADR-3D-108): cycle a named plane's patch full → face → hidden → full. The
      // record keeps only non-default entries — cycling back to 'full' DELETES the key, so a saved
      // file never carries redundant defaults and "absent = full" stays the single convention.
      togglePlaneDisplay: (name) => {
        const cur = get().planeDisplay;
        const next = { ...cur };
        const mode = cur[name] ?? 'full';
        if (mode === 'full') next[name] = 'face';
        else if (mode === 'face') next[name] = 'hidden';
        else delete next[name];
        set({ planeDisplay: next });
      },

      setFigureName: (name) => set({ figureName: name }),

      // "show another configuration": the next seed whose configuration still satisfies every stated
      // requirement (ADR-3D-053). Was a blind `seed + 1`, which could show a drawing contradicting a
      // stated bound; with no requirements the search accepts the very next seed, so behaviour is
      // unchanged for every figure that states none.
      resample: () => {
        const { facts, seed } = get();
        const next = seedForRequirements(facts, seed + 1);
        set({ seed: next ?? seed + 1 });
      },

      dismissError: () => set({ lastError: null }),

      loadFigure: (facts, seed, queries = [], planeDisplay = {}) => set({ facts, seed, queries, planeDisplay, lastError: null }),

      reportLoadError: (reason) => set({ lastError: { code: reason } }),
    }),
    {
      // History tracks the durable inputs only; lastError is transient UI state,
      // and `equality` keeps error-only sets from pushing duplicate snapshots.
      partialize: (s) => ({ facts: s.facts, seed: s.seed, queries: s.queries, planeDisplay: s.planeDisplay }) as Geo3State,
      equality: (past, current) =>
        past.facts === current.facts && past.seed === current.seed && past.queries === current.queries && past.planeDisplay === current.planeDisplay,
    },
  ),
);

export const undo3 = () => useGeo3.temporal.getState().undo();
export const redo3 = () => useGeo3.temporal.getState().redo();
