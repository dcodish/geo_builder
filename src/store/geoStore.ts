/**
 * Geo store (Phase 3, extended) — the app's source of truth for the build session.
 *
 * The durable state is the **ordered list of facts** the student entered; the
 * figure is *derived* by replaying the enabled ones through the engine. This is
 * what makes facts independently selectable: a fact can be deselected (kept but
 * turned off) or deleted, and the figure re-derives. A fact whose dependencies
 * are gone simply fails to apply and is flagged inactive — re-selecting the
 * dependency brings it back (auto-drop, reversible — ADR-010). Branch choices
 * for alternatives live in the fact's command, so they survive replay too.
 *
 * Positions are not stored — they're part of the derived view (`replay`), so
 * undo history stays minimal and state/coordinates can't drift apart.
 *
 * See docs/04-design.md §executeCommand and docs/09-implementation-plan.md §Phase 3.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import type { AnyCommand, Command, Construction, GivenViolation, Id, RelationsResult, ResolvedCircle, ShapesResult, Vec } from '@/engine';
import { solveBudget, withSolveBudget, applyCommand, applySeed, applyStep, baseSeedOf, branchCount, buildSymTab, checkGivens, circleMembers, classifyShapesFromSamples, constraintRefs, convergedSamples, cyclableVariant, deepEqual, detectRelationsAcross, emptyConstruction, evaluate, expandInscribe, expandShapeVariant, freeDofCount, freeDofs, isGeoPoint, isMeasure, lowerOne, measureLabelText, pinsSoftVariant, reflectableFreePoints, directionHelperFreePoints, reflectAnchors, reflectMaskOf, requirementSamples, residual, variantCountOf, variantVertices, withVariant, withReflectMask } from '@/engine';
import type { FigureFile } from './figureFile';

/** One entered fact. `enabled` is the selected/deselected state. */
export interface Fact {
  id: string;
  /** The natural-language utterance, when it came from text (Phase 4); absent for direct commands. */
  utterance?: string;
  /**
   * Submission id: every command produced by ONE user input (one utterance →
   * possibly many commands, e.g. an inscribed trapezoid = circle + 4 on-circle +
   * quad) shares this, so the UI shows them as a SINGLE step row, not N identical
   * rows. Absent ⇒ the fact is its own group (keyed by its `id`).
   */
  group?: string;
  cmd: AnyCommand;
  enabled: boolean;
}

/** A measure label to print on the figure (ADR-031): a length along a segment, or an angle at a vertex. */
export interface MeasureLabels {
  lengths: { a: Id; b: Id; text: string }[];
  angles: { vertex: Id; ray1: Id; ray2: Id; text: string }[];
  areas: { ids: Id[]; text: string }[]; // a polygon's area label, printed at its centroid (ADR-118)
}

/**
 * An angle MARK the user explicitly asserted — drawn on the figure: a right-angle square (`right`)
 * or an angle arc. Sourced from the FACTS, never from a computed 90° (the operator's rule: mark it
 * only if the student said it). `∠ABC = α/37` → arc; `∠ABC = 90`, `AB ⟂ CD`, a right-triangle → square.
 */
export interface AngleMark {
  vertex: Id;
  ray1: Id;
  ray2: Id;
  right: boolean;
}

/** The angle mark a single fact asserts, or null. */
function angleMarkFor(cmd: AnyCommand): AngleMark | null {
  switch (cmd.type) {
    case 'measure-angle':
      return { vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, right: false };
    case 'set-angle':
      return { vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, right: Math.abs(cmd.value - 90) < 1e-6 };
    case 'right-triangle':
      return { vertex: cmd.ids[2], ray1: cmd.ids[0], ray2: cmd.ids[1], right: true }; // right angle at the last id
    case 'set-perpendicular': {
      if (cmd.implicit) return null; // a tangency's radius⟂line is structural, not a stated right angle — no mark
      const shared = [cmd.a, cmd.b].find((x) => x === cmd.c || x === cmd.d); // AB ⟂ CD with a shared vertex
      if (!shared) return null; // disjoint segments — the ⟂ is at an unnamed crossing; no mark
      return { vertex: shared, ray1: cmd.a === shared ? cmd.b : cmd.a, ray2: cmd.c === shared ? cmd.d : cmd.c, right: true };
    }
    default:
      return null;
  }
}

/** The display key that groups a fact's commands into one step row. */
export const groupKey = (f: Fact): string => f.group ?? f.id;

/** Per-fact outcome after replay: applied, turned off, or why it couldn't apply. */
export type FactStatus = 'ok' | 'disabled' | string;

export interface Derived {
  construction: Construction;
  positions: Map<Id, Vec>;
  /** Every circle's engine-resolved centre + radius (post-solve), so the renderer draws a solver-driven
   *  free radius WITHOUT reconstructing it from a point on the circle (ADR-200/D2 — `evaluate` publishes it,
   *  the renderer is a pure consumer). Empty when the figure failed to evaluate. */
  circles: Map<Id, ResolvedCircle>;
  /** fact id → status. */
  status: Record<string, FactStatus>;
  /** The most recent enabled fact that failed, for the error banner (or null). */
  lastError: string | null;
  /** A constraint is recorded but not yet satisfiable because the figure is still under-determined — it
   *  will resolve once the remaining givens (sizes/angles) are added ([ADR-104](docs/06-decisions.md#adr-104)).
   *  This is an INFO state ("add the remaining givens"), not the red `lastError` (a genuine contradiction). */
  pending: boolean;
  /** Measure labels to print on the figure (ADR-031). */
  labels: MeasureLabels;
  /** Angle marks the student asserted (right-angle squares / angle arcs). */
  angleMarks: AngleMark[];
  /** Stated givens that DON'T actually hold in the final figure (e.g. a point off the circle it was
   *  put on) — empty when the drawing matches every given. "Green" requires this to be empty, not just
   *  no error: a fact can apply cleanly yet leave its relation unsatisfied (the verifier net). */
  violations: GivenViolation[];
  /** Free-radius circles the student can dial directly (a slider per circle) — the first playable DOF. */
  radiusDofs: RadiusDof[];
  /** Pairs of distinct points the geometry drove to the same location — allowed, shown as a notice so the
   *  student knows two labels converged (e.g. a derived point landing on a circle's centre). [ADR-123] */
  coincidences: [Id, Id][];
}

/** A free circle radius the student can drag: `base` is the stable seed radius (for the slider range),
 *  `current` is the radius being drawn right now (seed-varied or dialed). */
export interface RadiusDof {
  circle: Id;
  center: Id;
  base: number;
  current: number;
}

/** Reflect point `p` across the line through `a0`,`a1` (the mirror image). Degenerate axis ⇒ `p` unchanged. */
function reflectAcross(p: Vec, a0: Vec, a1: Vec): Vec {
  const dx = a1.x - a0.x, dy = a1.y - a0.y;
  const L = dx * dx + dy * dy;
  if (L < 1e-12) return p;
  const t = ((p.x - a0.x) * dx + (p.y - a0.y) * dy) / L;
  const fx = a0.x + t * dx, fy = a0.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}

/**
 * Mirror the masked reflectable free points across their anchor line ([ADR-166](docs/06-decisions.md#adr-166)).
 *
 * The discrete "which side of its base an apex sits" DOF (an equilateral/isosceles triangle's apex,
 * equidistant to two anchors) has a mirror solution the continuous solver won't reach from the default
 * seed — so a figure asking two SEGMENTS to meet WITHIN their spans can be drawn with the apexes pointing
 * the wrong way (the meet on the continuation). `mask` selects which {@link reflectableFreePoints} to flip:
 * we evaluate once to learn the anchor positions, then reflect each selected free point's solved position
 * across its anchor line and use that as the solver's seed, so it converges to the mirror configuration.
 * mask 0 (every existing seed/caller) returns the construction unchanged — no extra evaluate, no cost.
 */
function applyReflections(c: Construction, mask: number): Construction {
  if (!mask) return c;
  const pts = reflectableFreePoints(c);
  if (pts.length === 0) return c;
  const e = evaluate(c);
  if (!e.ok) return c; // can't learn the anchor lines — leave it to the continuous sampler
  const objects = c.objects.map((o) => {
    if (o.kind !== 'free-point') return o;
    const idx = pts.indexOf(o.id);
    if (idx < 0 || !(mask & (1 << idx))) return o;
    const anchors = reflectAnchors(c, o.id)
      .map((id) => e.positions.get(id))
      .filter((v): v is Vec => !!v);
    if (anchors.length < 2) return o;
    // Pick the most-separated anchor pair → the most stable mirror line.
    let a0 = anchors[0], a1 = anchors[1], best = -1;
    for (let i = 0; i < anchors.length; i++)
      for (let j = i + 1; j < anchors.length; j++) {
        const d = (anchors[i].x - anchors[j].x) ** 2 + (anchors[i].y - anchors[j].y) ** 2;
        if (d > best) { best = d; a0 = anchors[i]; a1 = anchors[j]; }
      }
    const self = e.positions.get(o.id) ?? { x: o.x, y: o.y };
    const r = reflectAcross(self, a0, a1);
    return { ...o, x: r.x, y: r.y };
  });
  return { ...c, objects };
}

/**
 * Replay memoization (E1 / STO-1). `replay` is pure in `(facts, seed, radiusOverrides)` but was
 * treated as free and called from four layers per user action (dry-run, the commit guard, the debug
 * snapshot, render) — and the config search (`firstSatisfyingSeed`/`findValidConfig`/`meetsRequirements`)
 * re-replays the SAME (facts, seed) pairs across its passes. A tiny cache keyed on the facts array's
 * IDENTITY (every store action builds a new array, so a stale hit is impossible) de-duplicates them.
 * WeakMap ⇒ a dry-run's throwaway trial array releases its entries with the array itself. The inner
 * per-facts map is bounded (a seed sweep can visit hundreds of seeds; past the cap it resets — a cache,
 * not a ledger). `replayStats.computes` counts REAL recomputes (cache misses) for the perf canary (A5).
 */
const replayCache = new WeakMap<Fact[], { snapshot: readonly Fact[]; bySeed: Map<string, Derived> }>();
const REPLAY_CACHE_MAX = 512; // per facts-array — above this the sweep is exploring, not re-checking
export const replayStats = { computes: 0 };

export function replay(facts: Fact[], seed = 0, radiusOverrides: Record<Id, number> = {}): Derived {
  const key = `${seed}|${JSON.stringify(radiusOverrides)}`;
  let entry = replayCache.get(facts);
  // The store never mutates a facts array (every action builds a new one), but TESTS and harnesses
  // legitimately `push` into one between replays — so a ref-keyed hit is only valid while the array
  // still holds the SAME elements. The element-identity check (O(n) ref compares — trivial next to a
  // replay) invalidates on push/splice/toggle-in-place; only a hand-mutation of a Fact object's own
  // fields could evade it, which nothing does (facts are treated as immutable records).
  const fresh = entry && entry.snapshot.length === facts.length && entry.snapshot.every((f, i) => f === facts[i]);
  if (entry && !fresh) entry = undefined;
  const hit = fresh ? entry!.bySeed.get(key) : undefined;
  if (hit) return hit;
  const out = computeReplay(facts, seed, radiusOverrides);
  replayStats.computes++;
  if (!entry) {
    entry = { snapshot: facts.slice(), bySeed: new Map() };
    replayCache.set(facts, entry);
  }
  if (entry.bySeed.size >= REPLAY_CACHE_MAX) entry.bySeed.clear();
  entry.bySeed.set(key, out);
  return out;
}

/**
 * Replay the enabled facts in order; disabled or unsatisfiable facts are flagged,
 * not fatal. `seed` samples the figure's residual freedom (ADR-018): the final
 * figure's non-pinned free points are perturbed deterministically, so the figure
 * is re-drawn while still satisfying every fact. seed 0 = the canonical default.
 * The seed's HIGH bits ({@link reflectMaskOf}) additionally select a reflection of
 * the apex free points (ADR-166); seed < REFLECT_STRIDE ⇒ mask 0 ⇒ no reflection.
 * (Callers use the memoized {@link replay} wrapper above; this is the real build.)
 */
/**
 * The seed-INDEPENDENT half of a replay ([ADR-280](docs/06-decisions.md#adr-280), issue #59): everything
 * derived from the fact list alone — the symbol table, the default-yield pre-scans, the apply fold
 * (`runBuild`, including the failure-path recruiter), the ADR-104 deferral retries, the atomic-group
 * poisoning, and the ADR-231 HOIST rescue. The seed and radius overrides enter only in {@link runTail},
 * which perturbs the finished construction and evaluates once. Statuses and the rtReorder map are stored
 * BY FACT INDEX (not id) so a dry-run trial array and the committed array — same content, different fact
 * ids — share one fold. A HOIST rescue is kept as a `rescue` candidate (build-clean and not pending);
 * the seed-level acceptance the old recursive replay applied (the rescued replay must evaluate clean at
 * the CURRENT seed, else the original fold's error stands) is preserved by {@link tailChoice}, which
 * tries the rescue chain first and falls back per seed.
 */
interface FoldNode {
  cur: Construction;
  statusByIndex: FactStatus[];
  applied: Command[];
  pending: boolean;
  buildError: string | null;
  rtReorderByIndex: [number, [Id, Id, Id]][];
  lens: [string, MeasureLabels['lengths'][number]][];
  angs: [string, MeasureLabels['angles'][number]][];
  areas: [string, MeasureLabels['areas'][number]][];
  /** Tail iteration order over the facts (original indices) — a rescue iterates in ITS (hoisted) order,
   *  so duplicate-keyed angle marks dedupe exactly as the old recursive replay did. */
  iterOrder: number[];
  rescue: FoldNode | null;
}

/**
 * Fold memo, keyed by fact-list CONTENT ([ADR-280](docs/06-decisions.md#adr-280)): enabled flag +
 * group PARTITION (first-occurrence numbering — the atomic-group and softPair semantics depend on which
 * facts share a group, never on the group id's spelling) + the command JSON, order-sensitive. The fold
 * was measured at ~75 s on a hard figure (issue #59) and is identical for every seed, every dry-run
 * trial array, and every sweep candidate — this cache is what turns an 80 s-per-candidate seed search
 * into one fold + a ~1 s tail per candidate.
 */
const foldCache = new Map<string, FoldNode>();
const FOLD_CACHE_MAX = 8;
export const foldStats = { computes: 0 };
function foldKey(facts: Fact[]): string {
  const groupIdx = new Map<string, number>();
  const parts: string[] = [];
  for (const f of facts) {
    const g = groupKey(f);
    if (!groupIdx.has(g)) groupIdx.set(g, groupIdx.size);
    parts.push(`${f.enabled ? 1 : 0}|${groupIdx.get(g)}|${JSON.stringify(f.cmd)}`);
  }
  return parts.join('\n');
}

/** Re-index a (hoisted) fold node from its permuted fact order back to the caller's original indices. */
function translateFold(node: FoldNode, permToOrig: number[]): FoldNode {
  const statusByIndex: FactStatus[] = [];
  node.statusByIndex.forEach((s, permIdx) => { statusByIndex[permToOrig[permIdx]] = s; });
  return {
    ...node,
    statusByIndex,
    rtReorderByIndex: node.rtReorderByIndex.map(([permIdx, ids]) => [permToOrig[permIdx], ids] as [number, [Id, Id, Id]]),
    iterOrder: node.iterOrder.map((permIdx) => permToOrig[permIdx]),
    rescue: node.rescue ? translateFold(node.rescue, permToOrig) : null,
  };
}

/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the Web-Worker seam. The FOLD is seed-independent pure
 * DATA (structured-clone-safe) and the fold cache is keyed by fact-list CONTENT, so a fold computed in a
 * geometry WORKER can be transplanted into this thread's cache: `getFoldFor` reads the node after a worker
 * replay warmed it, `primeFoldFor` inserts a (cloned) node here — after which every main-thread replay of
 * that content runs at TAIL speed and the tab never pays the cold fold.
 */
export type { FoldNode };
export function getFoldFor(facts: Fact[]): FoldNode | null {
  return foldCache.get(foldKey(facts)) ?? null;
}
export function primeFoldFor(facts: Fact[], fold: FoldNode): void {
  if (foldCache.size >= FOLD_CACHE_MAX) foldCache.delete(foldCache.keys().next().value as string);
  foldCache.set(foldKey(facts), fold);
}

/** The dry-run trial fact list for a candidate step — the FIRST content the submit path folds, shared
 *  here so a worker prefold warms exactly the content `dryRunOutcome` (and usually the commit) will use. */
export function trialFacts(facts: Fact[], commands: AnyCommand[]): Fact[] {
  return [...facts, ...commands.map((c, i) => ({ id: `~try.${i}`, group: '~try', enabled: true, cmd: c }))];
}

function computeReplay(facts: Fact[], seed = 0, radiusOverrides: Record<Id, number> = {}): Derived {
  const key = foldKey(facts);
  let fold = foldCache.get(key);
  if (!fold) {
    const abortsBefore = solveBudget.aborts;
    fold = computeFold(facts);
    foldStats.computes++;
    // A fold whose recruit ladder was cut short by the view-search budget is NOT the fold for this
    // content — memoizing it would pin the degraded figure for every later, unbudgeted replay.
    if (solveBudget.aborts === abortsBefore) {
      if (foldCache.size >= FOLD_CACHE_MAX) foldCache.delete(foldCache.keys().next().value as string);
      foldCache.set(key, fold);
    }
  }
  return tailChoice(fold, facts, seed, radiusOverrides);
}

/** Per-seed candidate choice: try the HOIST rescue chain first; a rescue whose tail evaluates clean at
 *  THIS seed wins (exactly the old recursive acceptance `rescued.lastError === null && !rescued.pending`),
 *  else fall back to the fold that failed — its honest error stands. */
function tailChoice(fold: FoldNode, facts: Fact[], seed: number, radiusOverrides: Record<Id, number>): Derived {
  if (fold.rescue) {
    const r = tailChoice(fold.rescue, facts, seed, radiusOverrides);
    if (r.lastError === null && !r.pending) return r;
  }
  return runTail(fold, facts, seed, radiusOverrides);
}

function computeFold(facts: Fact[], hoistDepth = 0): FoldNode {
  // Symbol table over the ENABLED facts, so a value given later (`x = 4`) resolves an
  // earlier `AB = 3x`, and two segments sharing a variable become a proportion (ADR-031).
  const symtab = buildSymTab(facts.filter((f) => f.enabled).map((f) => f.cmd));
  const lenByKey = new Map<string, MeasureLabels['lengths'][number]>();
  const angByKey = new Map<string, MeasureLabels['angles'][number]>();
  const areaByKey = new Map<string, MeasureLabels['areas'][number]>();
  // A named-shape MACRO emits a DEFAULT equal-pair for an isosceles triangle (|AB|=|AC|) tagged `soft`,
  // because "isosceles" only says SOME two sides are equal — which pair is the student's to state, not ours
  // to assume ([ADR-052](docs/06-decisions.md#adr-052)). So the soft default must YIELD to an explicit
  // equality the student gives among the SAME triangle's sides ("AB=BC"): otherwise the two stack into an
  // EQUILATERAL triangle never asked for ([ADR-114](docs/06-decisions.md#adr-114)). Pre-scan (position-
  // independent, so it works whether the explicit pair was typed before or after the shape): drop a soft
  // equality whose 3 vertices wholly contain another enabled, explicit (non-soft) set-equal.
  const softEqVerts = (c: AnyCommand): Set<Id> | null =>
    c.type === 'set-equal' && c.soft ? new Set<Id>([c.a, c.b, c.c, c.d]) : null;
  const explicitEqWithin = (cmds: AnyCommand[], V: Set<Id>): boolean =>
    cmds.some((c) => c.type === 'set-equal' && !c.soft && [c.a, c.b, c.c, c.d].every((id) => V.has(id)));
  const supersededSoft = new Set<string>();
  for (const f of facts) {
    const V = f.enabled ? softEqVerts(f.cmd) : null;
    if (V && facts.some((g) => g !== f && g.enabled && explicitEqWithin(lowerOne(g.cmd, symtab), V))) supersededSoft.add(f.id);
  }
  // "right triangle ABC" pins the right angle at the LAST vertex (C) structurally (B is built ⟂ at C). But
  // WHICH vertex is the right one is UNSTATED, so that default must YIELD to an explicit "∠ABC = 90" the
  // student gives on a different vertex — otherwise the structural ∠C=90 and the stated ∠B=90 collide and the
  // stated angle is refused as over-constrained ([ADR-052](docs/06-decisions.md#adr-052); same shape as the
  // ADR-114 soft equal-pair). Pre-scan (position-independent — works whether the angle is typed before or
  // after the triangle): if an enabled explicit 90° set-angle names one of a right-triangle's vertices,
  // reorder its ids so that vertex is LAST (the structural right-angle vertex); the explicit angle then holds
  // as a passing check, not a conflict.
  const rightAngleVerts = new Set<Id>(
    facts
      .filter((f) => f.enabled)
      .flatMap((f) => lowerOne(f.cmd, symtab))
      .filter((c): c is Extract<Command, { type: 'set-angle' }> => c.type === 'set-angle' && Math.abs(c.value - 90) < 1e-6)
      .map((c) => c.vertex),
  );
  const rtReorder = new Map<string, [Id, Id, Id]>();
  for (const f of facts) {
    if (!f.enabled || f.cmd.type !== 'right-triangle') continue;
    const ids = f.cmd.ids;
    const v = ids.find((id) => rightAngleVerts.has(id) && id !== ids[2]);
    if (v) {
      const [a, b] = ids.filter((id) => id !== v);
      rtReorder.set(f.id, [a, b, v]); // the right-angle vertex LAST (the structural ∠ position)
    }
  }
  // A common-tangent macro's touch↔circle PAIRING is a soft default (`softPair`, ADR-239): "AB משיק
  // משותף" states only that AB touches both circles, never WHICH touch rides WHICH circle — the macro
  // pairs them in stated order. When an explicit membership elsewhere (an untagged point-on-circle of
  // the same touch label — e.g. "tangents from N to circle O1 at M and B" putting B on O1) names the
  // OPPOSITE assignment, SWAP the pair — the two memberships and the group's radius-⟂ centres — so the
  // stated pairing wins (M4 defaults-yield; position-independent, the ADR-163 pre-scan shape). If both
  // assignments are explicitly stated the default stands and any genuine contradiction fails honestly.
  const softPairGroups = new Map<string, { ids: Id[]; circles: Id[] }>();
  const explicitOn = new Set<string>(); // `${point}|${circle}` from untagged memberships
  for (const f of facts) {
    if (!f.enabled) continue;
    for (const c of lowerOne(f.cmd, symtab)) {
      if (c.type !== 'point-on-circle') continue;
      if (c.softPair) {
        const g = groupKey(f);
        const e = softPairGroups.get(g) ?? { ids: [], circles: [] };
        e.ids.push(c.id);
        e.circles.push(c.circle);
        softPairGroups.set(g, e);
      } else explicitOn.add(`${c.id}|${c.circle}`);
    }
  }
  const pairSwapByGroup = new Map<string, Map<Id, Id>>(); // group → circle-id swap map
  for (const [g, e] of softPairGroups) {
    if (e.ids.length !== 2 || e.circles[0] === e.circles[1]) continue;
    const [X, Y] = e.ids;
    const [cA, cB] = e.circles;
    const opposite = explicitOn.has(`${X}|${cB}`) || explicitOn.has(`${Y}|${cA}`);
    const stated = explicitOn.has(`${X}|${cA}`) || explicitOn.has(`${Y}|${cB}`);
    if (opposite && !stated)
      pairSwapByGroup.set(
        g,
        new Map([
          [cA, cB],
          [cB, cA],
        ]),
      );
  }
  // Explicit `set-equal`s the student/LLM gave (NOT a shape-variant macro's own pairs) — they PIN the matching
  // variant of a kite/isosceles `shape-variant` and suppress re-emitting that pair ([ADR-138](docs/06-decisions.md#adr-138)).
  const explicitEqs = facts
    .filter((f) => f.enabled && f.cmd.type !== 'shape-variant')
    .flatMap((f) => lowerOne(f.cmd, symtab))
    .filter((c): c is Extract<Command, { type: 'set-equal' }> => c.type === 'set-equal');
  // Explicit `point-on-segment` givens (NOT an inscribe's own riders) — they PIN the matching variant of an
  // `inscribe` command (which container side a vertex rides), the ADR-262 counterpart of `explicitEqs`.
  const explicitOnSegs = facts
    .filter((f) => f.enabled && f.cmd.type !== 'inscribe')
    .flatMap((f) => lowerOne(f.cmd, symtab))
    .filter((c): c is Extract<Command, { type: 'point-on-segment' }> => c.type === 'point-on-segment')
    .map((c) => ({ id: c.id, a: c.a, b: c.b }));
  // Build the construction by folding the enabled facts. `forced` maps a fact id to a status string that
  // BLOCKS it (an atomic-group casualty — see the poisoning pass below): the fact is neither applied nor
  // measured, only its owned points are claimed so genuine dependents still cascade-fail. Runs at most twice
  // (once clean, once with the poisoned groups blocked), so the label maps are cleared on each entry.
  const runBuild = (forced: Map<string, string>) => {
    let cur = emptyConstruction();
    const status: Record<string, FactStatus> = {};
    const owned = new Set<Id>();
    const applied: Command[] = [];
    // The construction (by REFERENCE) a fact last failed against. `applyStep` is pure, so retrying the
    // same fact against the identical construction re-runs the identical (expensive — the failure-path
    // recruiter) search to the identical failure. The ADR-104 deferral retry below skips a fact whose
    // input hasn't changed since it failed — measured at ~22 s of pure waste per replay on the issue-#59
    // figure, where the failing constraint is the LAST fact so the "now-complete figure" IS the one it
    // already failed against ([ADR-280](docs/06-decisions.md#adr-280)).
    const failedWith = new Map<string, Construction>();
    lenByKey.clear();
    angByKey.clear();
    areaByKey.clear();
    for (const f of facts) {
      // Lower the fact to the engine command(s) it produces (symbolic measures →
      // ratio/distance/angle/[]; engine commands pass through; a `shape-variant` → base shape + the
      // variant-selected equal pairs, with an explicit equality pinning the variant — ADR-138).
      // 0 commands ⇒ a label-only / data-only fact (a free representative or `set-var`) — applied as a no-op.
      let engineCmds =
        f.cmd.type === 'shape-variant' ? expandShapeVariant(f.cmd, explicitEqs)
        : f.cmd.type === 'inscribe' ? expandInscribe(f.cmd, explicitOnSegs)
        : lowerOne(f.cmd, symtab);
      // Re-seat a right-triangle's right angle onto the vertex the student explicitly set to 90° (see pre-scan).
      const reseat = rtReorder.get(f.id);
      if (reseat) engineCmds = engineCmds.map((ec) => (ec.type === 'right-triangle' ? { ...ec, ids: reseat } : ec));
      // Swap a common-tangent group's soft touch↔circle pairing to the explicitly-stated one (ADR-239 pre-scan).
      const pairSwap = pairSwapByGroup.get(groupKey(f));
      if (pairSwap) {
        const letterSwap = new Map([...pairSwap].map(([k, v]) => [k.replace(/^circle-/, ''), v.replace(/^circle-/, '')]));
        engineCmds = engineCmds.map((ec) => {
          if (ec.type === 'point-on-circle' && ec.softPair && pairSwap.has(ec.circle)) return { ...ec, circle: pairSwap.get(ec.circle)! };
          if (ec.type === 'set-perpendicular' && letterSwap.has(ec.a)) return { ...ec, a: letterSwap.get(ec.a)! }; // the radius-⟂'s centre follows its touch
          return ec;
        });
      }
      const intro = engineCmds.flatMap(introducedPointIds);
      const claim = () => intro.forEach((id) => owned.add(id));
      // Blocked by the atomic-group poisoning pass: don't apply/measure it, but claim its points so any
      // dependent of a point ONLY this failed group introduced still cascades honestly.
      if (forced.has(f.id)) {
        status[f.id] = forced.get(f.id)!;
        claim();
        continue;
      }
      if (!f.enabled) {
        status[f.id] = 'disabled';
        claim();
        continue;
      }
      // A SOFT default equal-pair the student's explicit equality overrides (ADR-114) — step aside (no-op).
      // Not pushed to `applied`: |AB|=|AC| was never a stated given, so the verifier must not check it.
      if (supersededSoft.has(f.id)) {
        status[f.id] = 'ok';
        continue;
      }
      // A measure annotates the figure regardless of whether it adds a constraint.
      if (isMeasure(f.cmd)) addMeasureLabel(lenByKey, angByKey, areaByKey, f.cmd, measureLabelText(f.cmd, symtab));
      // A point a lowered command would (re)create that an earlier fact owns but which
      // isn't in the figure now ⇒ its definition is gone, so this fact can't build either.
      const broken = intro.filter((id) => owned.has(id) && !cur.objects.some((o) => o.id === id));
      if (broken.length) {
        status[f.id] = `can't build: ${broken.join(', ')} is no longer available (an earlier step it relies on was removed or failed)`;
        claim();
        continue;
      }
      let ok = true;
      for (const ec of engineCmds) {
        const r = applyStep(cur, ec);
        if (r.ok) cur = r.construction;
        else {
          status[f.id] = r.error; // dependencies gone, contradiction, etc. — keep prior figure
          ok = false;
          failedWith.set(f.id, cur);
          break;
        }
      }
      if (ok) {
        status[f.id] = 'ok';
        applied.push(...(engineCmds as Command[]));
      }
      claim();
    }
    // ORDER-INDEPENDENCE ([ADR-104](docs/06-decisions.md#adr-104)): a CONSTRAINT that couldn't be satisfied
    // at its position — an under-determined solve the engine can't pin down yet — may become solvable once
    // LATER facts add givens that remove the slack (e.g. "CE⟂AB" entered before "CD=36, DE=18": with the
    // sizes the figure is determinate and the ⟂ solves; without them it's an unconstrained coupled solve the
    // solver can't land). So after the in-order pass, RETRY the still-failed constraint-only facts against the
    // now-complete figure, to a fixpoint — applying such a constraint LAST is exactly the working reordering.
    // Only pure constraints (no NEW points) are retried: re-ordering a point-introducing fact to the end would
    // strand its dependents. A genuinely contradictory constraint simply keeps failing. This makes the figure
    // build the same whatever order the constraints were typed (the operator's "order shouldn't matter").
    const deferrable = (f: Fact): boolean => {
      if (forced.has(f.id) || !f.enabled || status[f.id] === 'ok' || status[f.id] === 'disabled') return false;
      const ec = lowerOne(f.cmd, symtab);
      return ec.length > 0 && ec.every((c) => introducedPointIds(c).length === 0);
    };
    for (let pass = 0; pass < facts.length && facts.some(deferrable); pass++) {
      let progressed = false;
      for (const f of facts) {
        if (!deferrable(f)) continue;
        // Purity skip (ADR-280): the figure hasn't changed since this fact failed against it, so the
        // retry would re-run the identical expensive search to the identical failure.
        if (failedWith.get(f.id) === cur) continue;
        const engineCmds = lowerOne(f.cmd, symtab);
        let trial = cur;
        let ok = true;
        for (const ec of engineCmds) {
          const r = applyStep(trial, ec);
          if (r.ok) trial = r.construction;
          else { ok = false; break; }
        }
        if (ok) {
          cur = trial;
          status[f.id] = 'ok';
          applied.push(...(engineCmds as Command[]));
          progressed = true;
        } else failedWith.set(f.id, cur);
      }
      if (!progressed) break;
    }
    return { cur, status, applied };
  };
  // Classify what (if anything) remains unsatisfiable after the retries. A still-failed step that is a
  // DEFERRABLE constraint while the figure is still UNDER-DETERMINED isn't a contradiction — it's just
  // waiting for the givens that pin the figure (ADR-104), so it's a PENDING info state, not a red error.
  // A genuine failure (a non-deferrable step, or any failure once the figure is fully determined) stays a
  // hard `lastError`.
  const classify = (cur: Construction, status: Record<string, FactStatus>) => {
    const failedFacts = facts.filter((f) => f.enabled && status[f.id] !== 'ok' && status[f.id] !== 'disabled');
    const pending = failedFacts.length > 0 && failedFacts.every((f) => {
      const ec = lowerOne(f.cmd, symtab);
      return hasDeferrableConstraint(ec) && constraintIsPending(cur, ec); // a deferrable constraint that still FLEXES (not a rigid contradiction)
    });
    return { failedFacts, pending };
  };
  let { cur, status, applied } = runBuild(new Map());
  let { failedFacts, pending } = classify(cur, status);
  // ATOMIC GROUP: one utterance lowers to a GROUP of commands (e.g. "EF ⟂ BC" → segment EF + segment BC +
  // set-perpendicular). If the constraint HARD-fails (a genuine contradiction, not a pending under-determined
  // solve), the auto-drawn scaffolding segments must NOT survive on their own — the whole utterance failed, so
  // it draws nothing (the operator's rule: "it gave a message but still drew the line — it should not"). Poison
  // any group that has BOTH a hard-failed fact AND a succeeded one, then rebuild with the group blocked (a
  // clean rebuild, not object-deletion, so a segment SHARED with an earlier shape — seg-BC of the square — is
  // still drawn by that shape). Skipped when the figure is PENDING: a constraint that will resolve once more
  // givens arrive keeps its scaffolding (ADR-104).
  //
  // FIXPOINT, not a single round: blocking group A removes the points it owned, which can make a LATER
  // group B — whose members built fine in round 1 — newly MIXED in the rebuild (one member loses its
  // dependency, a sibling survives), i.e. exactly the half-drawn state this pass forbids. Re-scan and
  // re-poison until no newly-mixed group appears (bounded by the number of groups; review 2026-07-03, S3).
  if (!pending && failedFacts.length) {
    const forced = new Map<string, string>(); // accumulated: every poisoned member across rounds
    for (;;) {
      const groupErr = new Map<string, string>(); // poisoned group → the genuine error to show on every member
      for (const f of failedFacts) {
        const g = groupKey(f);
        if (!groupErr.has(g)) groupErr.set(g, status[f.id] as string);
      }
      let grew = false;
      for (const [g, err] of groupErr) {
        const members = facts.filter((m) => groupKey(m) === g);
        if (members.length > 1 && members.some((m) => status[m.id] === 'ok') && !members.every((m) => forced.has(m.id))) {
          for (const m of members) forced.set(m.id, err);
          grew = true;
        }
      }
      if (!grew) break; // no newly-mixed group — the figure is at the atomic fixpoint
      ({ cur, status, applied } = runBuild(forced));
      ({ failedFacts, pending } = classify(cur, status));
      if (pending) break; // a deferral state emerged — keep scaffolding per ADR-104
    }
  }
  // HOIST — the ORDER-INDEPENDENCE dual of the ADR-104 deferral (ADR-231, review F1). Deferral retries a
  // too-EARLY relation LAST; a too-LATE relation — a size given typed after the solver machinery already
  // claimed/froze the DOFs it should have pinned (Q11's "sizes last") — fails at the very end, where no
  // later pass exists. A pure relation's position is presentation, not meaning, so re-fold the whole list
  // with each still-failed relation fact moved to the EARLIEST position where everything it references
  // exists. Bounded (depth-capped recursive re-fold), failure-path only, deterministic; if the hoisted
  // fold builds clean it is simply the correct figure — same facts, same semantics — else the original
  // error stands.
  //
  // Runs from the PENDING state too (ADR-238, the two-tangent-circles corpus): `pending` means "a deferrable
  // constraint still flexes — MAY be waiting for more givens", but when the complete given set is already
  // here and only the ENTRY ORDER starved the carriers, the hoisted fold builds fully clean — proof the
  // figure was never waiting. Acceptance stays strict (clean AND not pending), so a genuinely
  // under-determined figure keeps its pending cue unchanged.
  let rescue: FoldNode | null = null;
  if (failedFacts.length && hoistDepth < 2) {
    const hoistable = failedFacts.filter((f) => {
      if (!f.enabled) return false;
      const ec = lowerOne(f.cmd, symtab);
      return ec.length > 0 && ec.every(isRelationCommand);
    });
    if (hoistable.length) {
      const hoistSet = new Set(hoistable.map((f) => f.id));
      const refsOf = (f: Fact): Id[] => lowerOne(f.cmd, symtab).flatMap((c) => commandObjectIds(c));
      const introduced = new Set<Id>();
      const permuted: Fact[] = [];
      let waiting = [...hoistable];
      for (const f of facts) {
        if (hoistSet.has(f.id)) continue;
        permuted.push(f);
        if (f.enabled) for (const c of lowerOne(f.cmd, symtab)) for (const o of applyCommand(emptyConstruction(), c).objects) introduced.add(o.id);
        const ready = waiting.filter((h) => refsOf(h).every((id) => introduced.has(id)));
        if (ready.length) {
          permuted.push(...ready); // earliest position where every referenced object exists; stable order
          waiting = waiting.filter((h) => !ready.includes(h));
        }
      }
      permuted.push(...waiting); // refs never all appear → keep at the end (unchanged from the failed fold)
      if (permuted.some((f, i) => f !== facts[i])) {
        // Recurse on the FOLD only (ADR-280): build-clean and not-pending is the fold-level pre-filter
        // the old recursion applied regardless of seed; whether the rescue is ACCEPTED at a given seed
        // (its tail must evaluate clean, else the original fold's honest error stands) is decided per
        // seed by {@link tailChoice} — exactly the old `rescued.lastError === null && !rescued.pending`.
        const rescuedFold = computeFold(permuted, hoistDepth + 1);
        // CHAIN-aware pre-filter: a depth-2 double-hoist figure (ADR-238's sizes-last class) is clean
        // only in the recursed fold's OWN rescue — the old recursion returned that accepted rescue as
        // its whole result, so the outer saw "clean". Accept when ANY node on the chain is build-clean
        // and not pending; the per-seed tail acceptance (tailChoice) walks the same chain.
        const chainClean = (n: FoldNode | null): boolean => !!n && ((n.buildError === null && !n.pending) || chainClean(n.rescue));
        if (chainClean(rescuedFold)) {
          const permToOrig = permuted.map((f) => facts.indexOf(f));
          rescue = translateFold(rescuedFold, permToOrig);
        }
      }
    }
  }
  const buildError = !pending && failedFacts.length ? (status[failedFacts[failedFacts.length - 1].id] as string) : null;
  return {
    cur,
    statusByIndex: facts.map((f) => status[f.id]),
    applied,
    pending,
    buildError,
    rtReorderByIndex: [...rtReorder].map(([fid, ids]) => [facts.findIndex((f) => f.id === fid), ids] as [number, [Id, Id, Id]]),
    lens: [...lenByKey],
    angs: [...angByKey],
    areas: [...areaByKey],
    iterOrder: facts.map((_, i) => i),
    rescue,
  };
}

/**
 * The seed-DEPENDENT tail of a replay (ADR-280): reflections + the ADR-018 sample + radius overrides on
 * the fold's finished construction, ONE evaluate, then the per-seed presentation (labels, asserted angle
 * marks, the givens verifier, radius sliders, coincidences). This is all a new seed — a sweep candidate,
 * a "show another configuration" probe, a detection sample — ever pays.
 */
function runTail(fold: FoldNode, facts: Fact[], seed: number, radiusOverrides: Record<Id, number>): Derived {
  const { cur, applied, pending } = fold;
  const status: Record<string, FactStatus> = {};
  facts.forEach((f, i) => { status[f.id] = fold.statusByIndex[i]; });
  const rtReorder = new Map(fold.rtReorderByIndex.map(([i, ids]) => [facts[i].id, ids]));
  const lenByKey = new Map(fold.lens);
  const angByKey = new Map(fold.angs);
  const areaByKey = new Map(fold.areas);
  let lastError = fold.buildError;
  // The seed's high bits select a reflection of certain free points (ADR-166); the low bits are the
  // continuous sample. The reflection is split around the sample by the kind of point being flipped:
  //  • APEX points (equidistant / shared-vertex right angle) reflect BEFORE the sample — their mirror is a
  //    genuine shape alternative the solver must be seeded into, then the spin explores around it.
  //  • DIRECTION HELPERS (the loose end of a "DF ⟂ AB" perpendicular — ADR-227) reflect AFTER the sample:
  //    they aren't shape vertices, so reflecting them before the spin would shift the free-cluster centroid
  //    and re-shape the figure, coupling the (independent) shape DOF to the side choice. Reflecting them
  //    after leaves the sampled shape intact and only flips the side.
  // mask 0 — every ordinary seed — leaves the construction untouched, so this is free for normal figures.
  const helpers = new Set(directionHelperFreePoints(cur));
  const refl = reflectableFreePoints(cur);
  const fullMask = reflectMaskOf(seed);
  let preMask = 0, postMask = 0;
  refl.forEach((id, i) => { if (fullMask & (1 << i)) (helpers.has(id) ? (postMask |= 1 << i) : (preMask |= 1 << i)); });
  const sampled = applyReflections(applySeed(applyReflections(cur, preMask), baseSeedOf(seed)), postMask);
  // A dialed radius (the DOF slider) overrides the sampled value for that free circle — a viewing
  // scratchpad (ADR-048): it's cleared by "show another configuration", never a fixed given (ADR-052).
  const figure =
    Object.keys(radiusOverrides).length === 0
      ? sampled
      : {
          ...sampled,
          objects: sampled.objects.map((o) =>
            o.kind === 'circle' && o.radius.via === 'free' && radiusOverrides[o.id] !== undefined
              ? // FIX the dialed radius (clear any `solve`): the student is choosing it, so the OTHER free
                // DOFs re-solve AROUND it (e.g. a tangent apex moves to keep ∠CAB=90), not the radius.
                { ...o, radius: { via: 'free' as const, value: radiusOverrides[o.id] }, solve: undefined }
              : o,
          ),
        };
  const e = evaluate(figure);
  // A dialed radius override (or a seed) can break a figure that BUILT fine — surface that failure so the
  // error reflects what's actually drawn (and so `setRadius` can reject an impossible dial). `lastError`
  // was build-only, so an override that made `evaluate` fail left it null with the figure silently gone.
  if (!e.ok && !lastError) lastError = e.error;
  // Numeric measures (a plain `AB = 5` / `∠ABC = 37`, and symbolic ones once resolved)
  // surface as distance/angle constraints — label them from the figure, filling any
  // key a symbolic fact didn't already own (FR-RN-2).
  for (const con of figure.constraints) {
    if (con.type === 'distance') addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-length', a: con.a, b: con.b }, fmtMeasure(con.value), true);
    else if (con.type === 'angle') addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-angle', vertex: con.vertex, ray1: con.ray1, ray2: con.ray2 }, `${fmtMeasure(con.value)}°`, true);
    else if (con.type === 'area') addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-area', ids: con.ids }, fmtMeasure(con.value), true);
  }
  const labels: MeasureLabels = { lengths: [...lenByKey.values()], angles: [...angByKey.values()], areas: [...areaByKey.values()] };
  // Angle marks the student ASSERTED (only from facts that applied, and whose points all exist) —
  // a right-angle square or an angle arc. Deduped by vertex + ray pair.
  const angleMarks: AngleMark[] = [];
  const amSeen = new Set<string>();
  for (const fi of fold.iterOrder) {
    const f = facts[fi];
    if (status[f.id] !== 'ok') continue;
    // Mark from the RESEATED right-triangle (ADR-163), so the right-angle knee is drawn at the vertex the
    // figure actually built the right angle at — not the original last id. Without this the knee sits on a
    // now-acute vertex (e.g. a leftover knee at C while ∠B is the real 90°).
    const markCmd = rtReorder.has(f.id) && f.cmd.type === 'right-triangle' ? { ...f.cmd, ids: rtReorder.get(f.id)! } : f.cmd;
    const m = angleMarkFor(markCmd);
    if (!m || ![m.vertex, m.ray1, m.ray2].every((id) => e.ok && e.positions.has(id))) continue;
    // HONESTY GATE (ADR-223 Am.): a right-angle SQUARE (the "knee") is placed by the COMMAND'S INTENT
    // (`right-triangle …` / `∠=90` / `⟂`), NOT by measuring the figure — so if the solver could not
    // realise the declared right angle (an over-constrained / amber figure), the knee would otherwise
    // draw a 90° mark on an angle that isn't 90° (the Q8 symptom, before its root cause was fixed). Only
    // keep the knee when the vertex ACTUALLY measures ~90° in the output coordinates; otherwise drop it
    // (the givens verifier already flags the figure amber — a false knee must never contradict the
    // geometry). An asserted arc (a stated non-90 value) is unaffected.
    if (m.right && e.ok) {
      const V = e.positions.get(m.vertex)!, A = e.positions.get(m.ray1)!, B = e.positions.get(m.ray2)!;
      const u = { x: A.x - V.x, y: A.y - V.y }, w = { x: B.x - V.x, y: B.y - V.y };
      const lu = Math.hypot(u.x, u.y), lw = Math.hypot(w.x, w.y);
      if (lu > 1e-9 && lw > 1e-9) {
        const deg = (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (lu * lw)))) * 180) / Math.PI;
        if (Math.abs(deg - 90) > 1) continue; // declared right angle not realised → draw no knee
      }
    }
    const key = `${m.vertex}-${[m.ray1, m.ray2].sort().join('')}`;
    if (amSeen.has(key)) continue;
    amSeen.add(key);
    angleMarks.push(m);
  }
  // Verify the OUTPUT against the ORIGINAL givens: relations the input asserted that don't actually
  // hold in the final coordinates (a point off its circle, …) — caught even when every step is 'ok'.
  const violations = e.ok ? checkGivens(applied, e.positions, e.circles) : [];
  // Free-radius circles the student can dial (base = stable seed radius for the slider range; current =
  // what's drawn). Read from the pre-seed construction so the range doesn't shift as the value changes.
  // Show a slider only for a FREE, not-currently-driven radius — a radius the solver drives is pinned by
  // a constraint (e.g. |OC|=9), so dialing it would just fight that constraint. (The override above still
  // clears `solve` so a momentarily-recruited radius can be dialed with the rest re-solving around it.)
  const radiusDofs: RadiusDof[] = cur.objects.flatMap((o) =>
    o.kind === 'circle' && o.radius.via === 'free' && o.solve === undefined
      ? [{ circle: o.id, center: o.center, base: o.radius.value, current: e.ok ? e.circles.get(o.id)?.r ?? o.radius.value : o.radius.value }]
      : [],
  );
  // Distinct points the geometry drove onto the same spot — allowed (not an error), surfaced as a notice
  // so the student knows two labels converged ([ADR-123](docs/06-decisions.md#adr-124)).
  const coincidences: [Id, Id][] = e.ok ? e.coincidences ?? [] : [];
  return { construction: figure, positions: e.ok ? e.positions : new Map(), circles: e.ok ? e.circles : new Map(), status, lastError, pending, labels, angleMarks, violations, radiusDofs, coincidences };
}

/** The (a, b, id, circle) triples every enabled `extend-onto-circle` step asserts ("המשך a·b onto `circle` at id"). */
function extensionTriples(facts: Fact[]): { a: Id; b: Id; id: Id; circle: Id }[] {
  return facts.flatMap((f) => (f.enabled && f.cmd.type === 'extend-onto-circle' ? [{ a: f.cmd.a, b: f.cmd.b, id: f.cmd.id, circle: f.cmd.circle }] : []));
}

/** Is a command a pure RELATION (deferrable / hoistable) — it asserts something about existing objects
 *  without introducing a point, so its position in the fact list is presentation, not meaning
 *  ([ADR-104](docs/06-decisions.md#adr-104)). STRUCTURAL, not a hand list: the vocabulary names every
 *  relation `set-*`, and the point-introduction test is derived from apply's own output — the old
 *  hand-maintained set silently omitted `set-radius`/`set-area`/`set-perimeter`, so a size given typed
 *  late could neither defer nor read as pending (the 2026-07-06 review's F1; the ADR-043/R4 list-drift
 *  class again). `set-var` is excluded — it's symbol-table data, resolved position-independently anyway. */
const isRelationCommand = (c: AnyCommand): boolean =>
  c.type.startsWith('set-') && c.type !== 'set-var' && introducedPointIds(c as Command).length === 0;

/**
 * Does this parsed step carry a constraint the engine can DEFER? If so, the input layer should COMMIT it
 * even when it can't be satisfied YET (a dry-run "error") — `replay` retries it after later givens pin the
 * figure (ADR-104) — instead of escalating an unsatisfiable-but-correctly-parsed constraint to the LLM
 * (which would just re-emit it, or drop it). A genuinely contradictory constraint then surfaces honestly
 * as a failing step rather than a misleading "couldn't read that".
 */
export const hasDeferrableConstraint = (commands: AnyCommand[]): boolean => commands.some(isRelationCommand);

/**
 * Is a still-failed constraint merely PENDING (satisfiable once more givens pin the figure) rather than a
 * genuine CONTRADICTION? A constraint is pending iff its value still FLEXES as the figure's free DOFs move
 * — then later givens can drive it to hold (or determine it). If its value is INVARIANT (e.g. ∠DAB on a
 * square is structurally 90°, so "∠DAB = 37" is impossible no matter what else is added), it's a real
 * contradiction → a hard error. We detect this by re-deriving the constraint (`applyCommand` on the
 * figure WITHOUT it) and measuring its residual across a few sampled configurations: a spread ⇒ flexible
 * ⇒ pending; ~constant ⇒ rigid ⇒ contradiction. (ADR-104.)
 */
function constraintIsPending(cur: Construction, cmds: Command[]): boolean {
  const probe = cmds.reduce((c, cmd) => applyCommand(c, cmd), cur);
  const newCons = probe.constraints.slice(cur.constraints.length);
  if (newCons.length === 0) return false;
  return newCons.some((con) => {
    const vals: number[] = [];
    for (const s of [0, 1, 2, 3, 4]) {
      const e = evaluate(applySeed(cur, s));
      if (e.ok) {
        // A constraint referencing a point the figure never defined cannot be flex-probed — skip the
        // sample instead of crashing (`residual` would read a missing position). Such a constraint then
        // reads as NOT pending, so its failure surfaces as the honest hard error it is (ADR-236).
        if (constraintRefs(con).some((id) => !e.positions.has(id))) continue;
        const r = residual(con, (id) => e.positions.get(id)!);
        if (Number.isFinite(r)) vals.push(r);
      }
    }
    return vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 0.05; // the relation flexes ⇒ pending
  });
}

/** The figure's overall scale (bounding-box diagonal of all placed points) — the yardstick a clearance
 *  margin is measured against, so it's robust whether the extension's base segment is long or short. */
function figureSpan(fig: Derived): number {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of fig.positions.values()) {
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
  }
  return Number.isFinite(minx) ? Math.hypot(maxx - minx, maxy - miny) || 1 : 1;
}

/**
 * True when every "המשך" extension reaches the far side of its circle by a CLEAN margin — the new point is
 * beyond the named endpoint (the directional given, ADR-098) AND clear of it by a visible fraction of the
 * figure, so a near-tangent secant whose new point nearly collapses onto the endpoint is rejected. This is
 * the SAMPLING bar (auto-pick + "show another"); the verifier's amber check stays looser (a marginal but
 * genuinely-beyond figure is valid, not "wrong"), so we never flag a figure we'd still draw.
 */
function extensionsClear(facts: Fact[], fig: Derived, relax = false): boolean {
  const margin = 0.05 * figureSpan(fig);
  const triples = extensionTriples(facts);
  if (triples.length === 0) return true;
  // Two bars, both real (ADR-098 vs ADR-142, reconciled by ADR-267): STRICT is the PREFERENCE — the letter
  // order is honoured whenever some configuration achieves it (on a free-DOF figure "המשך CA → D" genuinely
  // SELECTS the placement, ADR-098). RELAXED is the ACCEPTANCE bar for a SHARED-ENDPOINT extension (an
  // endpoint already on the target circle ⇒ the second crossing is UNIQUE): when NO configuration achieves
  // the letter-order side (booklet-571 p.78 Q4: CB tangent to circle P pins C outside P, so E can never land
  // beyond C) the order carries no information and EITHER extension counts — a point genuinely BETWEEN the
  // endpoints still fails. Every consumer that needs "is this config valid at all" passes relax=true;
  // "strict first, relaxed only if strict is unachievable" is the SEARCH's job (`firstSatisfyingSeed`
  // interleaves both bars in ONE budgeted sweep — never a second full pass, issue #19).
  const members = relax ? circleMembers(fig.construction) : [];
  for (const { a, b, id, circle } of triples) {
    const pa = fig.positions.get(a), pb = fig.positions.get(b), pid = fig.positions.get(id);
    if (!pa || !pb || !pid) return false;
    const abx = pb.x - pa.x, aby = pb.y - pa.y;
    const abl = Math.hypot(abx, aby);
    if (abl < 1e-9) return false;
    const beyondB = ((pid.x - pb.x) * abx + (pid.y - pb.y) * aby) / abl; // signed distance of id past b along a→b
    let reach = beyondB;
    if (relax) {
      // Entries are per circle id (ADR-244), so match the extension's target circle exactly.
      const memberPts = members.find((m) => m.id === circle)?.points ?? [];
      if (memberPts.includes(a) || memberPts.includes(b)) {
        const beyondA = -((pid.x - pa.x) * abx + (pid.y - pa.y) * aby) / abl; // signed distance of id past a
        reach = Math.max(beyondB, beyondA);
      }
    }
    if (reach < Math.max(0.5, margin)) return false;
  }
  return true;
}

/** Clearance margin for a segment-meet: the crossing's param on each operand must sit in [margin, 1−margin]
 *  to count as "on the segment" (the sampling bar; the verifier's amber check is looser — see verify.ts). */
const WITHIN_MARGIN = 0.02;

/** The param of `p`'s projection onto segment a→b (0 = at a, 1 = at b), or null if any point is unplaced. */
function segParam(fig: Derived, a: Id, b: Id, p: Id): number | null {
  const pa = fig.positions.get(a), pb = fig.positions.get(b), pp = fig.positions.get(p);
  if (!pa || !pb || !pp) return null;
  const abx = pb.x - pa.x, aby = pb.y - pa.y;
  const L = abx * abx + aby * aby;
  if (L < 1e-12) return null;
  return ((pp.x - pa.x) * abx + (pp.y - pa.y) * aby) / L;
}

/**
 * Does every plain SEGMENT meet land WITHIN both its segments ([ADR-166](docs/06-decisions.md#adr-166))?
 * A `line-line-intersection` flagged `onSeg` (the student named two segments, no "המשך"/"הישר") must have
 * its crossing inside both spans, not on the continuation — the operator's rule "two segments meet ON the
 * segments". A crossing on the backward/forward extension means the figure is the wrong configuration (an
 * apex pointing the wrong way), which the reflection sampler should fix. A still-pending crossing (a ref
 * unplaced) is a different failure mode, skipped here.
 */
export function intersectionsWithinSegments(fig: Derived, margin = WITHIN_MARGIN): boolean {
  for (const o of fig.construction.objects) {
    if (o.kind !== 'line-line-intersection' || !(o.onSeg || o.onSeg1 || o.onSeg2)) continue;
    // Per-operand (issue #22): a single-sided bare operand (`onSeg1`/`onSeg2`) gates only its own segment.
    const t1 = o.onSeg || o.onSeg1 ? segParam(fig, o.a, o.b, o.id) : null;
    const t2 = o.onSeg || o.onSeg2 ? segParam(fig, o.c, o.d, o.id) : null;
    if (t1 !== null && (t1 < margin || t1 > 1 - margin)) return false;
    if (t2 !== null && (t2 < margin || t2 > 1 - margin)) return false;
  }
  return true;
}

/** The reflection mask (over {@link reflectableFreePoints}) that mirrors exactly the apex free points whose
 *  on-segment meet currently lands off the segment — the targeted first guess for the reflection search. */
function reflectMaskForFailing(fig: Derived): number {
  const pts = reflectableFreePoints(fig.construction);
  if (pts.length === 0) return 0;
  const culprits = new Set<Id>();
  for (const o of fig.construction.objects) {
    if (o.kind !== 'line-line-intersection' || !(o.onSeg || o.onSeg1 || o.onSeg2)) continue;
    const t1 = o.onSeg || o.onSeg1 ? segParam(fig, o.a, o.b, o.id) : null;
    const t2 = o.onSeg || o.onSeg2 ? segParam(fig, o.c, o.d, o.id) : null;
    if (t1 !== null && (t1 < WITHIN_MARGIN || t1 > 1 - WITHIN_MARGIN)) { culprits.add(o.a); culprits.add(o.b); }
    if (t2 !== null && (t2 < WITHIN_MARGIN || t2 > 1 - WITHIN_MARGIN)) { culprits.add(o.c); culprits.add(o.d); }
  }
  let mask = 0;
  pts.forEach((id, i) => { if (culprits.has(id)) mask |= 1 << i; });
  return mask;
}

/**
 * Wall-clock budget for the synchronous config searches (E2 / STO-2). The search loops run replay after
 * replay on the UI thread behind a spinner; on a pathologically slow figure (~1.5 s/replay was measured,
 * ADR-123) an unbounded sweep froze the tab for tens of seconds. Past the deadline the search returns
 * what it has — the caller keeps the current figure, honestly amber, instead of freezing. Tests run with
 * NO deadline (vitest sets MODE 'test') so seed choices stay machine-independent and deterministic; the
 * deadline path itself is unit-tested by passing an explicit budget.
 */
const SEARCH_BUDGET_MS: number = import.meta.env?.MODE === 'test' ? Number.POSITIVE_INFINITY : 2500;

/**
 * The first seed whose replay BUILDS and satisfies the configuration requirements — every "המשך" extension
 * reaches its far side cleanly (ADR-098) AND every plain segment-meet lands WITHIN its segments (ADR-166) —
 * else `from`. Two unstated DOFs are searched: the continuous sample (seeds) and the discrete apex
 * REFLECTION (high seed bits, {@link withReflectMask}). A point on a circle whose secant must extend onto
 * another circle, and an apex whose side decides whether two segments cross, are both placements only a
 * subset of configurations satisfies — we SAMPLE one rather than drive across a degeneracy. Used to auto-pick
 * the default configuration after a step and to gate "show another configuration". Bounded by `budgetMs`
 * of wall-clock (E2): past the deadline it returns the best seed seen so far (the relaxed fallback if one
 * was recorded, else `from` — keep the current view, amber if short).
 */
export function firstSatisfyingSeed(facts: Fact[], from = 0, budget = 120, budgetMs = SEARCH_BUDGET_MS): number {
  const deadline = Date.now() + budgetMs;
  const hasExt = extensionTriples(facts).length > 0;
  const base0 = replay(facts, from);
  const reflectable = reflectableFreePoints(base0.construction);
  const hasOnSeg = base0.construction.objects.some((o) => o.kind === 'line-line-intersection' && (o.onSeg || o.onSeg1 || o.onSeg2));
  if (!hasExt && !hasOnSeg) return from; // nothing to satisfy → keep the seed
  const ok = (fig: Derived) => fig.lastError === null && extensionsClear(facts, fig) && intersectionsWithinSegments(fig);
  // The ADR-142 acceptance bar: a SHARED-ENDPOINT extension counts on EITHER side (see extensionsClear).
  const okRelaxed = (fig: Derived) => fig.lastError === null && extensionsClear(facts, fig, true) && intersectionsWithinSegments(fig);
  if (ok(base0)) return from; // the current view already satisfies every requirement
  // Candidate seeds in priority order. When a segment-meet is off its segment the cause is almost always an
  // apex pointing the wrong way, which plain re-seeding rarely fixes — so try the REFLECTION seeds first
  // (targeted mask = mirror exactly the failing apexes, then the other non-empty subsets), each over a small
  // band of continuous seeds (the apex flips inward, the seed varies the rest of the shape so the crossing
  // lands cleanly inside). Then the plain seeds (extensions; also an on-seg figure fixable by re-seed alone).
  const seeds: number[] = [];
  if (hasOnSeg && reflectable.length > 0) {
    const targeted = reflectMaskForFailing(base0);
    const subsets = Array.from({ length: (1 << reflectable.length) - 1 }, (_, i) => i + 1);
    const masks = [targeted, ...subsets].filter((m, i, a) => m > 0 && a.indexOf(m) === i);
    for (const m of masks) for (let s = 0; s < 24; s++) seeds.push(withReflectMask(m, s));
  }
  for (let s = from; s < from + budget; s++) seeds.push(s);
  // ONE interleaved sweep, both bars per seed (issue #19 / ADR-267): STRICT wins the moment it's found (the
  // letter order is honoured whenever achievable, ADR-098); the first RELAXED-only seed is remembered as the
  // fallback and returned when the sweep ends — or the DEADLINE hits — without a strict hit (ADR-142: no
  // configuration achieves the letter-order side, so the order carries no information). The old shape — a
  // full strict pass, THEN a full relaxed pass — burned the entire wall budget on a provably futile strict
  // sweep for the ADR-142 class, so the live app (2500ms) never reached the fallback its tests (∞) always did.
  let fallback = okRelaxed(base0) ? from : -1;
  // The same deadline is ARMED inside the solve ladder (engine/solveBudget.ts): the between-replay check
  // below caps the sweep, and the in-ladder consult caps a single pathological candidate (issue #59 —
  // one replay used to blow through 32 budgets before this line ever ran again).
  return withSolveBudget(deadline, () => {
    for (const s of seeds) {
      if (Date.now() > deadline) break; // out of budget — settle for the best seen so far
      const fig = replay(facts, s);
      if (ok(fig)) return s;
      if (fallback < 0 && okRelaxed(fig)) fallback = s;
    }
    return fallback >= 0 ? fallback : from;
  });
}

/** Branchable derived-point command types — the discrete "alternatives" a figure can have (which of two
 *  intersections, which arc side, which extension root). */
const BRANCHABLE = new Set<AnyCommand['type']>(['point-by-distances', 'arc-midpoint', 'line-circle-intersection', 'circle-circle-intersection', 'point-on-segment']);

/**
 * Does the figure at this (facts, seed) meet EVERY requirement — it BUILDS, the givens verifier is clean,
 * every extension reaches its far side, the points are distinct, and declared polygons draw convex? This is
 * the bar the auto-resolver searches for before drawing ([ADR-106](docs/06-decisions.md#adr-106)). A
 * genuinely under-determined PENDING figure also passes (its unsatisfied constraint is not a violation —
 * it's waiting for more givens, ADR-104 — so there is nothing to search for).
 */
export function meetsRequirements(facts: Fact[], seed = 0, relaxExtensions = false): boolean {
  const fig = replay(facts, seed);
  return (
    fig.lastError === null &&
    fig.violations.length === 0 &&
    // relaxExtensions: the ADR-142 acceptance bar for a config `firstSatisfyingSeed` returned as its
    // shared-endpoint FALLBACK — the letter-order side is unachievable, so either extension counts
    // (issue #19: `findValidConfig` used to strictly reject the very seed the fallback found).
    extensionsClear(facts, fig, relaxExtensions) &&
    intersectionsWithinSegments(fig) &&
    pointsDistinct(fig.construction, fig.positions, fig.coincidences) &&
    polygonsConvex(facts, fig.positions)
  );
}

/**
 * Before drawing, VERIFY the figure meets every requirement and, if not, LOOP over alternative
 * configurations — continuous (seeds) AND discrete (branch choices: which intersection / arc side / root) —
 * for one that does ([ADR-106](docs/06-decisions.md#adr-106)). Returns the chosen facts (branches set) +
 * seed, or null if none is found within budget (the caller keeps the current figure, flagged amber). The
 * CURRENT branch assignment is tried first and most widely; the combinatorics of alternative branches are
 * bounded. Deterministic.
 */
export function findValidConfig(facts: Fact[], fromSeed = 0, budgetMs = SEARCH_BUDGET_MS): { facts: Fact[]; seed: number } | null {
  const deadline = Date.now() + budgetMs;
  const timeLeft = () => Math.max(0, deadline - Date.now());
  // First the targeted extension/reflection search (ADR-098/ADR-166): it explores the discrete apex
  // REFLECTION DOF (high seed bits) that the plain seed sweep below can't reach, so a segment-meet whose
  // apex points the wrong way is brought onto the segments in a handful of tries instead of by luck.
  const s0 = firstSatisfyingSeed(facts, fromSeed, 120, timeLeft());
  if (meetsRequirements(facts, s0)) return { facts, seed: s0 };
  // ADR-142 acceptance (issue #19 / ADR-267): `firstSatisfyingSeed` may have returned its shared-endpoint
  // FALLBACK — every seed it examined failed the strict extension direction, so the RELAXED bar is the right
  // validity test for s0. Checked BEFORE the strict sweep/branch tiers: when s0 is a fallback those tiers are
  // provably futile on the extension bar (the sweep re-covers seeds firstSatisfyingSeed already rejected),
  // and their cold replays would burn the remaining budget and bail to null past the very config in hand —
  // the exact starvation this ADR removes. When s0 simply failed OTHER requirement dimensions (violations,
  // convexity, distinctness), the relaxed check fails identically and the tiers below run as before.
  if (meetsRequirements(facts, s0, true)) return { facts, seed: s0 };
  // The deadline is also ARMED inside the solve ladder (engine/solveBudget.ts, issue #59): the branch
  // tier below builds NEW fact content (branch rewrites), whose folds can hit the expensive recruit
  // ladder — the between-replay checks alone couldn't stop a single 30 s candidate.
  return withSolveBudget(deadline, () => {
    for (let s = fromSeed; s < fromSeed + 40; s++) {
      if (Date.now() > deadline) return null; // out of budget — caller keeps the current figure, amber
      if (meetsRequirements(facts, s)) return { facts, seed: s };
    }
    // Discrete branch alternatives — vary which intersection/side each branchable point takes.
    const base = replay(facts).construction;
    const branchy = facts
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.enabled && BRANCHABLE.has(f.cmd.type) && 'id' in f.cmd)
      .map(({ f, i }) => ({ i, count: Math.max(1, branchCount(base, (f.cmd as { id: Id }).id)) }))
      .filter((x) => x.count > 1)
      .slice(0, 4); // bound the combinatorics — vary the first few branchable points
    if (branchy.length === 0) return null;
    let combos: number[][] = [[]];
    for (const { count } of branchy) combos = combos.flatMap((c) => Array.from({ length: count }, (_, b) => [...c, b]));
    for (const combo of combos.slice(0, 16)) {
      if (Date.now() > deadline) return null;
      // skip the current assignment (already swept above)
      const fc = facts.map((f, idx) => {
        const k = branchy.findIndex((x) => x.i === idx);
        return k >= 0 ? ({ ...f, cmd: { ...f.cmd, branch: combo[k] } } as Fact) : f;
      });
      for (let s = 0; s < 6; s++) if (meetsRequirements(fc, s)) return { facts: fc, seed: s };
    }
    return null;
  });
}

/** Outcome of dry-running a parsed step on top of the current facts (see {@link dryRunOutcome}). */
/**
 * The "show another configuration" SEARCH, extracted PURE (#41 / [ADR-290](docs/06-decisions.md#adr-290))
 * so a geometry worker can run it off the main thread; the store's `resample` action applies its result.
 * Semantics unchanged: a wall-clock budget (2026-07-06 review hotspot #3 — past the deadline, return what
 * we have; tests run deadline-free), the ADR-267 preference ladder (a STRICT-valid view wins outright; a
 * RELAXED-valid one — the ADR-142 shared-endpoint either-side bar — is a fallback offered only when the
 * CURRENT view itself is not strict-valid), the shared `meetsRequirements` acceptance bar, and the
 * similarity-invariant fingerprint (a same-shape-resized view is not "another configuration"). The
 * deadline is also armed inside the solve ladder (engine/solveBudget.ts, issue #59) so a single
 * pathological candidate can't blow through the between-candidate checks. `onProgress` reports the
 * candidate index (the worker forwards it to the UI's "still searching…" cue).
 */
export function searchResample(facts: Fact[], seed: number, onProgress?: (k: number, n: number) => void): number | null {
  const cur = replay(facts, seed);
  if (freeDofs(cur.construction).length === 0) return null; // fully determined — nothing to vary
  const curFp = shapeFingerprint(cur.construction, cur.positions);
  let s = seed;
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const curStrict = meetsRequirements(facts, seed);
  let fallback = -1;
  for (let k = 0; k < 24 && Date.now() <= deadline; k++) {
    onProgress?.(k + 1, 24);
    s += 1;
    const r = withSolveBudget(deadline, () => replay(facts, s));
    // Accept only a view that MEETS EVERY REQUIREMENT — the SAME bar the initial display uses — AND is a
    // genuinely DIFFERENT drawing (see the class notes above; the Q8 two-right-triangles lock).
    if (!shapeDiffers(curFp, shapeFingerprint(r.construction, r.positions))) continue;
    if (meetsRequirements(facts, s)) return s;
    if (!curStrict && fallback < 0 && meetsRequirements(facts, s, true)) fallback = s;
  }
  return fallback >= 0 ? fallback : null;
}

export type StepOutcome = { produced: true } | { produced: false; reason: 'error' | 'empty'; detail?: string };

/**
 * Dry-run a parsed step's engine commands on top of the current facts WITHOUT committing, to decide
 * whether it actually BUILT something. A deterministic parse can "succeed" yet silently fail — apply
 * with an error (kept-prior), or change nothing at all — in which case the input layer gives it a
 * SECOND try through the LLM, and surfaces an honest problem if that also fails (operator request: a
 * step that produces nothing must never be a silent no-op). A *givens violation* is deliberately NOT
 * "produced nothing" — the amber "may not match" cue already flags that, and the figure is still shown.
 */
export function dryRunOutcome(facts: Fact[], commands: AnyCommand[], seed = 0, overrides: Record<Id, number> = {}): StepOutcome {
  const labelCount = (l: MeasureLabels) => l.lengths.length + l.angles.length;
  const before = replay(facts, seed, overrides);
  const all = trialFacts(facts, commands);
  const trial = all.slice(facts.length);
  const after = replay(all, seed, overrides);
  const errored = trial.find((f) => after.status[f.id] !== 'ok');
  if (errored) return { produced: false, reason: 'error', detail: after.status[errored.id] };
  // "Built something" = added a shape/constraint/label, OR RESHAPED the figure — a step like "diameter AB"
  // on a cyclic quad adds no new object (it converts a vertex to an antipode and re-places the others), so
  // a count-only check wrongly reads it as empty. A moved/added point at the SAME seed means it took effect.
  const moved =
    after.positions.size !== before.positions.size ||
    [...after.positions].some(([id, p]) => {
      const q = before.positions.get(id);
      return !q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
    });
  const grew =
    moved ||
    after.construction.objects.length > before.construction.objects.length ||
    after.construction.constraints.length > before.construction.constraints.length ||
    labelCount(after.labels) > labelCount(before.labels);
  // A bare variable binding ("x = 4") legitimately draws nothing — it's data, not a silent fail.
  const dataOnly = commands.length > 0 && commands.every((c) => c.type === 'set-var');
  // `name-center` REVEALS an existing circle's hidden centre — a visible change that adds no object/point
  // and moves nothing, so the geometry checks above miss it. It still "produced" (the centre now shows).
  const reveals = commands.some((c) => c.type === 'name-center');
  if (grew || dataOnly || reveals) return { produced: true };
  // No geometric change — but a `set-equal` NAMING an enabled shape-variant's (kite/isosceles) equal-pair
  // that no explicit equality already asserts is the student CHOOSING which sides are equal: it PINS a
  // previously-SOFT default (ADR-138 / design-rules M4), flipping the relation from "not forced" to
  // reported. That is genuine new information even though the figure — which drew that pair by default —
  // does not move; committing it (not swallowing it as "already drawn") records the student's choice.
  const enabledCmds = facts.filter((f) => f.enabled).map((f) => f.cmd);
  const shapeVariants = enabledCmds.filter((c): c is Extract<AnyCommand, { type: 'shape-variant' }> => c.type === 'shape-variant');
  if (shapeVariants.length > 0) {
    const symtab = buildSymTab([...enabledCmds, ...commands]);
    const setEqualsOf = (cmds: AnyCommand[]) =>
      cmds.flatMap((c) => lowerOne(c, symtab)).filter((c): c is Extract<Command, { type: 'set-equal' }> => c.type === 'set-equal');
    // Existing EXPLICIT equalities — a shape-variant's OWN default pair is excluded (it is the soft guess,
    // not a stated choice), mirroring `replay`'s `explicitEqs`.
    const explicitEqs = setEqualsOf(facts.filter((f) => f.enabled && f.cmd.type !== 'shape-variant').map((f) => f.cmd));
    if (setEqualsOf(commands).some((se) => pinsSoftVariant(se, shapeVariants, explicitEqs))) return { produced: true };
  }
  return { produced: false, reason: 'empty' };
}

const fmtMeasure = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

/** Record a measure label; `fillOnly` writes only if that segment/angle isn't already labelled (numeric fallback). */
function addMeasureLabel(
  lenByKey: Map<string, MeasureLabels['lengths'][number]>,
  angByKey: Map<string, MeasureLabels['angles'][number]>,
  areaByKey: Map<string, MeasureLabels['areas'][number]>,
  m:
    | { type: 'measure-length'; a: Id; b: Id }
    | { type: 'measure-angle'; vertex: Id; ray1: Id; ray2: Id }
    | { type: 'measure-area'; ids: Id[] },
  text: string,
  fillOnly = false,
): void {
  if (m.type === 'measure-area') {
    const key = m.ids.join(''); // the polygon, in boundary order (ABC ≠ ACB — different shape)
    if (fillOnly && areaByKey.has(key)) return;
    areaByKey.set(key, { ids: m.ids, text });
  } else if (m.type === 'measure-angle') {
    const key = `${m.vertex}:${[m.ray1, m.ray2].sort().join('')}`;
    if (fillOnly && angByKey.has(key)) return;
    angByKey.set(key, { vertex: m.vertex, ray1: m.ray1, ray2: m.ray2, text });
  } else {
    const key = [m.a, m.b].sort().join('');
    if (fillOnly && lenByKey.has(key)) return;
    lenByKey.set(key, { a: m.a, b: m.b, text });
  }
}

/**
 * The variant-alternative fact lists of a figure ([ADR-138](docs/06-decisions.md#adr-138)): the current
 * config, plus — for each cyclable `shape-variant` fact (kite 2 axes, isosceles 3 apexes) — the config with
 * that shape stepped to each OTHER variant (the others held at their current value). The relations layer
 * samples across these so the equal-pair of a kite/isosceles isn't reported as FORCED — it is the student's
 * free choice (ADR-052), not a ground truth. Bounded by the SUM of the variant counts, not their product.
 *
 * ONLY `shape-variant` participates — its variant encodes a RELATION choice (which sides are equal), so a
 * relation true in only one variant must not be reported as forced. An `inscribe` variant is a PLACEMENT /
 * mirror choice (which container side hosts a vertex; a rhombus's D↔F relabeling — ADR-262) — it does NOT
 * change the shape's intrinsic relations, and sampling across it would wrongly DROP forced per-label relations
 * when the mirror relabels the vertices (∠CDE at D is real but doesn't survive the D↔F swap). So inscribe is
 * excluded here; it stays cyclable via the "show another configuration" button (`cycleVariant`).
 */
function variantConfigs(facts: Fact[]): Fact[][] {
  const variantFacts = facts.filter((f) => f.enabled && f.cmd.type === 'shape-variant' && variantCountOf(f.cmd) > 1);
  if (variantFacts.length === 0) return [facts];
  const configs: Fact[][] = [facts];
  for (const vf of variantFacts) {
    const count = variantCountOf(vf.cmd);
    const cur = (vf.cmd as { variant: number }).variant;
    for (let v = 0; v < count; v++) {
      if (v === cur) continue; // the current variant is already in `configs`
      configs.push(facts.map((f) => (f === vf ? { ...f, cmd: withVariant(f.cmd, v) } : f)));
    }
  }
  return configs;
}

/**
 * Shared sample core for the detection layers (perf, 2026-07-06 review hotspot #1): ONE facts-ref-keyed
 * sample set consumed by `viewRelations` AND `detectShapes` (which previously ran identical
 * variantConfigs × firstSatisfyingSeed × 16-evaluate loops — pressing both solved the figure twice), with
 * a DETERMINED-figure short-circuit: 0 shape DOF + a single variant draws identically at every seed
 * (ADR-101 — the remaining gauge DOFs only place/rotate/scale, which every detected relation is invariant
 * to), so ONE sample carries the full ground truth instead of 16 identical solves. The async consumer
 * yields to the event loop between small batches (the detectShapes non-blocking contract); the sync one
 * (viewRelations' call sites are synchronous) runs the same jobs inline. Invalidated by facts identity,
 * like the relations/shapes layer caches.
 */
let sampleMemo: { facts: Fact[]; constructions: Construction[]; samples: Map<Id, Vec>[] } | null = null;
function samplingJobs(facts: Fact[]) {
  const constructions = variantConfigs(facts).map((vf) => replay(vf, firstSatisfyingSeed(vf)).construction);
  const N = constructions.length === 1 && freeDofCount(constructions[0]) === 0 ? 1 : 16;
  const raw: Map<Id, Vec>[] = [];
  const jobs = constructions.flatMap((c) =>
    Array.from({ length: N }, (_, s) => () => {
      const r = evaluate(applySeed(c, s));
      if (r.ok) raw.push(r.positions);
    }),
  );
  // Ground truth = VALID configurations only ([ADR-256](docs/06-decisions.md#adr-256)): a sample that
  // violates a stated configuration requirement — a segment-meet's crossing off its segments
  // (`requirementSamples`), or a "המשך" extension not reaching its far side — is not a configuration of
  // the FIGURE, and counting it suppresses relations forced in every valid config (△OMK ~ △CAK vanished
  // because mirror samples put K past segment CO's end, flipping ∠KOM). Falls back to the unfiltered
  // converged pool when fewer than 2 remain: a thin pool over-claims, the unfiltered one only under-claims.
  const finish = () => {
    const c0 = constructions[0];
    const converged = convergedSamples(raw);
    const within = requirementSamples(c0, converged);
    const strict = within.filter((pos) => extensionsClear(facts, { construction: c0, positions: pos } as Derived));
    if (strict.length >= 2) return (sampleMemo = { facts, constructions, samples: strict });
    // The ADR-267 preference ladder: when the letter-order side is unachievable (no strict samples), the
    // RELAXED shared-endpoint bar (ADR-142) is the figure's real validity — filter by it before giving up
    // to the unfiltered converged pool (which would count wrong-side samples as configurations).
    const relaxed = within.filter((pos) => extensionsClear(facts, { construction: c0, positions: pos } as Derived, true));
    return (sampleMemo = { facts, constructions, samples: relaxed.length >= 2 ? relaxed : converged });
  };
  return { jobs, finish };
}
// Sample collection is budgeted like every other search loop (E2): a failing seed's solve costs ~10× a
// converging one (all restarts run to exhaustion) and is then DROPPED by convergedSamples anyway — on the
// ADR-123 heavy figure the unbudgeted loop was ~50 s of mostly-discarded work. Past the deadline, detection
// proceeds on the samples in hand (a smaller ground-truth pool — `samplesUsed` reports it); the FIRST job
// always runs so there is never an empty pool for a buildable figure. Tests run deadline-free (E2).
const SAMPLE_BUDGET_MS: number = import.meta.env?.MODE === 'test' ? Number.POSITIVE_INFINITY : 5000;
function sharedSamples(facts: Fact[]): { constructions: Construction[]; samples: Map<Id, Vec>[] } {
  if (sampleMemo?.facts === facts) return sampleMemo;
  const { jobs, finish } = samplingJobs(facts);
  const deadline = Date.now() + SAMPLE_BUDGET_MS;
  // Armed inside the solve ladder too (engine/solveBudget.ts, issue #59): a variant job builds NEW fact
  // content whose fold can hit the recruit ladder — the between-job check alone couldn't stop it.
  return withSolveBudget(deadline, () => {
    for (let i = 0; i < jobs.length; i++) {
      if (i > 0 && Date.now() > deadline) break;
      jobs[i]();
    }
    return finish();
  });
}
async function sharedSamplesAsync(facts: Fact[]): Promise<{ constructions: Construction[]; samples: Map<Id, Vec>[] }> {
  if (sampleMemo?.facts === facts) return sampleMemo;
  const { jobs, finish } = samplingJobs(facts);
  const deadline = Date.now() + SAMPLE_BUDGET_MS;
  for (let i = 0; i < jobs.length; i++) {
    if (i > 0 && Date.now() > deadline) break;
    // Each job runs under the ladder budget individually (the await below must run OUTSIDE the arm —
    // withSolveBudget's restore is synchronous, and the yield is where other work interleaves).
    withSolveBudget(deadline, jobs[i]);
    if ((i & 3) === 3) await new Promise<void>((res) => setTimeout(res, 0)); // yield every 4 samples
  }
  return finish();
}

/** The object ids a command introduces — used to highlight a selected fact on the canvas. */
export function introducedIds(cmd: AnyCommand): Id[] {
  // A symbolic measure introduces no objects; highlight the points it annotates instead.
  if (cmd.type === 'measure-length') return [cmd.a, cmd.b];
  if (cmd.type === 'measure-angle') return [cmd.vertex, cmd.ray1, cmd.ray2];
  if (cmd.type === 'measure-area') return cmd.ids; // highlight the polygon the area annotates
  if (cmd.type === 'set-var' || cmd.type === 'measure-order') return []; // a relation over variables — no object to highlight
  if (cmd.type === 'shape-variant') return cmd.ids; // the named shape's vertices (ADR-138)
  if (cmd.type === 'inscribe') return variantVertices(cmd); // container + inscribed vertices (ADR-262)
  return applyCommand(emptyConstruction(), cmd).objects.map((o) => o.id);
}

/** The POINT ids a command would introduce (created or auto-created) — for cascade detection. */
function introducedPointIds(cmd: Command): Id[] {
  return applyCommand(emptyConstruction(), cmd).objects.filter(isGeoPoint).map((o) => o.id);
}

/**
 * Every point id that appears in a command, created or referenced. A point id is an uppercase letter
 * plus optional digits (`A`, `O1`, `O2` — the LLM path legitimately produces subscripted centres, and
 * `absorb` was widened for them, PAR-10); line ids ("bis-…") and circle ids ("circle-O") are
 * multi-character with a lowercase prefix, so the whole-token test isolates points cleanly. The old
 * single-letter test made rename/swap/merge refuse a subscripted point ("no-source") — E6/STO-7. The
 * measure `expr` is skipped — it carries a variable/text, never a point id.
 */
export function commandPointIds(cmd: AnyCommand): Id[] {
  const out: Id[] = [];
  const take = (v: unknown) => {
    if (typeof v === 'string' && /^[A-Z]\d*$/.test(v)) out.push(v);
  };
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') continue;
    if (Array.isArray(v)) v.forEach(take);
    else take(v);
  }
  return out;
}

/** Every OBJECT id a command mentions — points (`A`, `O1`) plus prefixed object ids (`circle-O`,
 *  `line-…`, `seg-…`, …) — the dependency set the HOIST pass needs to place a relation fact at the
 *  earliest position where everything it references exists, and the reference set the question
 *  export's scaffolding filter walks (ADR-252). Structural scan like {@link commandPointIds};
 *  the `type`/`expr` fields are skipped (a command type or a measure expression is never an object id). */
export function commandObjectIds(cmd: AnyCommand): Id[] {
  const out: Id[] = [];
  const take = (v: unknown) => {
    if (typeof v === 'string' && (/^[A-Z]\d*$/.test(v) || /^(circle|line|seg|bis|tan|poly)-/.test(v))) out.push(v);
  };
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr' || k === 'type') continue;
    if (Array.isArray(v)) v.forEach(take);
    else take(v);
  }
  return out;
}

/** Flip one display flag (hidden/dashed) on a segment's style entry, keeping only the TRUE flags
 *  (so the entry stays minimal — `{dashed:true}`, not `{dashed:true,hidden:false}`); drop it when empty. */
function setSegFlag(style: Record<Id, { hidden?: boolean; dashed?: boolean }>, id: Id, flag: 'hidden' | 'dashed'): Record<Id, { hidden?: boolean; dashed?: boolean }> {
  const cur = style[id] ?? {};
  const next: { hidden?: boolean; dashed?: boolean } = { ...cur, [flag]: !cur[flag] };
  const clean: { hidden?: boolean; dashed?: boolean } = {};
  if (next.hidden) clean.hidden = true;
  if (next.dashed) clean.dashed = true;
  const out = { ...style };
  if (!clean.hidden && !clean.dashed) delete out[id];
  else out[id] = clean;
  return out;
}

/** Rewrite a seg-id key (`seg-AB`, `seg-O1O2`) under a point rename — TOKENIZE the endpoint run
 *  (`[A-Z]\d*` labels, the same shape `relabelId` uses) and re-derive the renamed, re-sorted key so it
 *  still matches the renderer's id. Subscripted endpoints included (E6/STO-7 — the old 2-char slice
 *  left them stale). */
function renameSegKey(key: Id, from: Id, to: Id): Id {
  if (!key.startsWith('seg-')) return key;
  const eps = key.slice(4).match(/[A-Z]\d*/g);
  if (!eps || eps.length !== 2) return key;
  const [a, b] = eps.map((e) => (e === from ? to : e));
  return `seg-${[a, b].sort().join('')}`;
}

/** Apply a point rename to every seg-id key in a segment-style map. */
function renameSegStyle(style: Record<Id, { hidden?: boolean; dashed?: boolean }>, from: Id, to: Id): Record<Id, { hidden?: boolean; dashed?: boolean }> {
  return Object.fromEntries(Object.entries(style).map(([k, v]) => [renameSegKey(k, from, to), v]));
}

/**
 * Rewrite every WHOLE point label `from`→`to` inside a string — a bare point id ("O"), OR a label EMBEDDED
 * in a structured id ("circle-O", "bis-XOY", "line-O1O2", "tan-O", "sec-EO", "par-T-AB", "chord-AB").
 * TOKENIZE the string into label tokens (`[A-Z]\d*` — a maximal capital+digits run) and replace exact-match
 * tokens: inside a concatenated tail like "bis-ABC" the tokens are A, B, C, so renaming B rewrites the
 * MIDDLE letter too. (The previous lookbehind `(?<![A-Za-z])` could never match a label that follows
 * another label, so "bis-ABC" under rename B→P kept its stale id while the bare fields renamed —
 * deterministic-id idempotency broke into duplicate constructions, the exact PAR-9 class; review
 * 2026-07-03, S1.) Structured-id prefixes are lowercase + "-", so they are never tokens. The swap
 * sentinel (U+0000, not a label shape) falls back to a literal replace.
 */
function relabelId(v: string, from: Id, to: Id): string {
  if (!/^[A-Z]\d*$/.test(from)) return v.split(from).join(to); // the swap TMP sentinel — literal, unique, safe
  return v.replace(/[A-Z]\d*/g, (tok) => (tok === from ? to : tok));
}

/** Rewrite one point letter to another across a single command — bare point fields AND the letters embedded
 *  in structured ids (`circle-O`, `bis-XYZ`, …), via {@link relabelId}. The `expr` measure text is skipped. */
function renameInCommand(cmd: AnyCommand, from: Id, to: Id): AnyCommand {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') out[k] = v; // a measure expr holds a variable/text, not point ids — never rewrite
    else if (typeof v === 'string') out[k] = relabelId(v, from, to);
    else if (Array.isArray(v)) out[k] = v.map((e) => (typeof e === 'string' ? relabelId(e, from, to) : e));
    else out[k] = v;
  }
  return out as AnyCommand;
}

/**
 * Rewrite a point label in the DISPLAYED utterance, matching WHOLE labels only. A label is a capital
 * letter + optional digits (`C`, `C1`, `O1`), so renaming `C`→`D` must NOT touch the `C` inside a `C1`.
 * The previous `utterance.split(from).join(to)` did a substring replace and corrupted multi-char labels
 * (it turned `CC1`→`DD1` during a swap-via-temp dance — operator report 2026-06-25). The `(?!\d)` guard
 * stops the match from eating into a subscripted label; the commands themselves are rewritten by id
 * (`renameInCommand`), so this only keeps the row text in sync.
 */
const relabelUtterance = (utt: string | undefined, from: Id, to: Id): string | undefined =>
  utt ? utt.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\d)', 'g'), to) : utt;

/** Outcome of a relabel request, so the UI can explain a no-op. */
export type RenameResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' };

/** Outcome of a swap request (exchange two existing labels), so the UI can explain a no-op. */
export type SwapResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' };

/** Outcome of a merge request (fold one point into another), so the UI can explain a no-op. */
export type MergeResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'no-target' | 'source-in-shape' };

/**
 * A command that has collapsed to a geometric no-op because two of its required-distinct
 * points became the same id (the typical fallout of folding F into E: a `segment EF` → `EE`,
 * an `angle EFG` → `EEG`). Such facts are dropped during a merge so the figure stays clean.
 */
function collapsedDegenerate(cmd: AnyCommand): boolean {
  const c = cmd as Record<string, Id | undefined>;
  switch (cmd.type) {
    case 'segment':
    case 'set-distance':
    case 'point-on-segment':
    case 'foot':
    case 'midpoint':
      return c.a === c.b;
    case 'set-equal':
    case 'set-ratio':
    case 'set-parallel':
    case 'set-perpendicular':
      return c.a === c.b || c.c === c.d;
    case 'set-angle':
    case 'measure-angle':
      return c.vertex === c.ray1 || c.vertex === c.ray2 || c.ray1 === c.ray2;
    case 'measure-length':
      return c.a === c.b;
    default:
      return false;
  }
}

export interface GeoState {
  facts: Fact[];
  /** The fact currently selected for inspection (highlighted on the canvas); UI-only, not undoable. */
  selectedId: string | null;
  /** Sampling seed for the figure's residual freedom (ADR-018); 0 = canonical. IN the undo history
   *  (E5/STO-5): undo restores the view the student actually saw, not the reverted facts at a later seed. */
  seed: number;
  /** Show measure labels on the figure (ADR-031); UI-only, not undoable. Default true. */
  showMeasures: boolean;
  /** Reveal every circle's centre + label (ADR-059); UI-only, not undoable. Default false.
   *  A display preference grouped with `showMeasures` in the sidebar (was a ⊙ button on the canvas). */
  showCenters: boolean;
  /** Dialed free-circle radii (the DOF sliders): circle id → radius. A viewing scratchpad — UI-only,
   *  not undoable, cleared by "show another configuration". */
  radiusOverrides: Record<Id, number>;
  /** Point ids whose label + vertex dot are hidden on the figure — a DISPLAY preference (the point still
   *  participates in the construction; segments through it still draw). UI-only, not undoable: the student
   *  un-hides by clicking the ghost again. Rewritten by `rename`/`merge` so it tracks the renamed letter. */
  hidden: Id[];
  /** Per-segment display style (keyed by seg id, e.g. `seg-AB`) — hidden and/or dashed. A DISPLAY
   *  preference like {@link hidden}: UI-only, not undoable; rewritten by `rename`/`merge`; reset by `clear`. */
  segStyle: Record<Id, { hidden?: boolean; dashed?: boolean }>;
  /** Circle ids (e.g. `circle-O`) hidden on the figure — a DISPLAY preference like {@link hidden} (the
   *  circle still constrains its points; it's just not drawn). UI-only, not undoable; rewritten by
   *  `rename`/`merge` (the id carries the centre letter); reset by `clear`. (ADR-088) */
  hiddenCircles: Id[];
  /** The "view relations" ground-truth layer ([ADR-134](docs/06-decisions.md#adr-134)): the detected
   *  equalities, cached with the EXACT `facts` array they were computed from. UI-only, not undoable.
   *  Ground truths are invariant across configurations, so the layer survives "show another configuration"
   *  (seed change keeps the same `facts` ref); any FACT change makes a new `facts` array, so a selector that
   *  checks `relations.facts === facts` auto-clears it (no edits to the mutating actions needed). */
  relations: { result: RelationsResult; facts: Fact[] } | null;

  /** The "detect shapes" layer ([FR-SH](docs/02-requirements.md)): the named shapes (kite, rhombus,
   *  isosceles triangle, …) the figure geometrically contains, cached with the EXACT `facts` array they
   *  were computed from — same caching/auto-clear contract as `relations` (a selector checking
   *  `shapes.facts === facts` drops it on any fact change; it survives "show another configuration"). */
  shapes: { result: ShapesResult; facts: Fact[] } | null;

  /** Append a fact (enabled). Commands sharing a `group` display as one step row. */
  execute: (cmd: AnyCommand, utterance?: string, group?: string) => void;
  /** Commit ONE user action's whole command group in ONE set — one undo entry removes the whole step
   *  (E4/STO-4; the per-command `execute` loop recorded N entries, so one undo peeled one command off a
   *  step whose row still showed ✓). Applies the same idempotency/move-in-place policy per command. */
  executeMany: (cmds: AnyCommand[], utterance?: string) => void;
  /** Undo/redo wrappers (E5/STO-5): zundo restores `facts` + `seed` (the figure the student SAW — the
   *  seed is in the temporal state, so an auto-advanced/resampled view rolls back with its facts), and
   *  any dialed radii are cleared (a viewing scratchpad can't outlive the state it annotated). */
  undo: () => void;
  redo: () => void;
  /** Replace a fact's command *in place* (same list position) — an edit (ADR-015). */
  update: (id: string, cmd: AnyCommand, utterance?: string) => void;
  /** Flip a fact's selected/deselected state. */
  toggle: (id: string) => void;
  /** Remove a fact permanently. */
  remove: (id: string) => void;
  /** Enable/disable every fact in a step group at once (one undo entry). */
  setGroupEnabled: (key: string, enabled: boolean) => void;
  /** Delete every fact in a step group. */
  removeGroup: (key: string) => void;
  /** Replace a whole step group with freshly-parsed commands, in place (edit a multi-command step). */
  replaceGroup: (key: string, cmds: AnyCommand[], utterance?: string) => void;
  /** Select a fact for inspection (or clear, if it was already selected). */
  select: (id: string | null) => void;
  /** The figure's NAME (issue #42) — shown on the page, used as the save filename, derived from the
   *  loaded file's name. UI-level session metadata: NOT in the undo history (renaming the diagram is
   *  not a construction step — the partialize slice is facts+seed only); reset by `clear`. */
  figureName: string;
  setFigureName: (name: string) => void;
  /** Compute the ground-truth relations of the current figure and turn the layer ON (ADR-134). Synchronous
   *  (samples the figure); the caller paints a busy state first. A no-op-safe re-press recomputes. */
  viewRelations: () => void;
  /** Turn the relations layer off. */
  clearRelations: () => void;
  /** Detect the named shapes of the current figure and turn the badges layer ON ([FR-SH]). Synchronous
   *  (samples the figure); the caller paints a busy state first. A re-press recomputes. */
  detectShapes: () => Promise<void>;
  /** Turn the shape-badges layer off. */
  clearShapes: () => void;
  /** Advance an intersection point to its next configuration (stored in the fact's command). */
  cycleAlt: (pointId: Id) => void;
  /** Step the equal-pair VARIANT of a kite/isosceles shape ([ADR-138](docs/06-decisions.md#adr-138)) — so
   *  "show another configuration" also cycles WHICH sides are equal. Returns `true` if it stepped a variant
   *  (always a real change), `false` if no cyclable (≥2-variant) shape is present. */
  cycleVariant: () => boolean;
  /** Re-sample the figure's residual freedom — a different valid drawing (ADR-018). Returns `true` if it
   *  found a genuinely DIFFERENT drawing, `false` if the shape is determined (only size/placement vary). */
  resample: () => boolean;
  /** Before drawing, if the figure doesn't meet every requirement, search alternative configurations
   *  (seeds + branches) for one that does and apply it ([ADR-106](docs/06-decisions.md#adr-106)).
   *  Returns `true` if the figure now meets every requirement, `false` if none was found (kept as-is). */
  autoResolve: () => boolean;
  /** #41 (ADR-290): apply a view decided OFF-thread (a worker resample / auto-resolve outcome) as ONE
   *  undo-tracked transition — the async twin of `resample`/`autoResolve`'s own `set` (clears dialed radii
   *  like every fresh view). */
  applyView: (patch: { facts?: Fact[]; seed: number }) => void;
  /** Dial a free circle's radius directly (a DOF slider). Cleared on resample. */
  setRadius: (circle: Id, value: number) => void;
  /** Show/hide measure labels on the figure (ADR-031). */
  setShowMeasures: (show: boolean) => void;
  /** Show/hide every circle's centre + label (ADR-059). */
  setShowCenters: (show: boolean) => void;
  /** Toggle a point's label + dot hidden/shown on the figure (a display preference, not geometry). */
  toggleHidden: (id: Id) => void;
  /** Toggle a segment hidden/shown on the figure (a display preference, not geometry). */
  toggleSegHidden: (id: Id) => void;
  /** Toggle a segment dashed/solid on the figure (a display preference, not geometry). */
  toggleSegDashed: (id: Id) => void;
  /** Toggle a circle hidden/shown on the figure (a display preference, not geometry). */
  toggleCircleHidden: (id: Id) => void;
  /** Relabel a point everywhere (e.g. E → G) — rewrites every fact, one undo entry. */
  rename: (from: Id, to: Id) => RenameResult;
  /** Exchange two existing labels (A ↔ B) everywhere — what rename can't do (taken target). One undo entry. */
  swap: (a: Id, b: Id) => SwapResult;
  /** Fold one point into another (e.g. F → E, both already present) — drops F's definition,
   *  rewrites F→E everywhere, drops facts that collapsed; one undo entry. */
  merge: (from: Id, to: Id) => MergeResult;
  /** Reset to no facts and wipe undo/redo history. */
  clear: () => void;
  /** Replace the whole session with a saved figure file (FR-HS-10): the facts, the seed, the dialed
   *  radii, and any saved display preferences — ONE state transition, so a single undo restores the
   *  session that was open before the load (loading is never destructive). */
  loadFigure: (file: FigureFile) => void;
}

/** Shape commands whose `ids` form a closed polygon that must stay a CLEAN convex drawing. */
const POLYGON_SHAPES = new Set(['square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid', 'quadrilateral']);

/**
 * Every declared polygon (a shape's `ids` cycle) is a valid CONVEX drawing — every turn around the
 * cycle has the same orientation. This rejects both a self-crossing ("tangled" ABCD) **and** a concave
 * ("dart") quad: both are valid point sets but neither is what a student means by the shape, so "show
 * another configuration" must not surface them (ADR-018 — alternatives are valid *drawings*).
 * Triangles (3 vertices, always convex/simple) are skipped — only 4+-gons are checked.
 */
export function polygonsConvex(facts: Fact[], positions: Map<Id, Vec>): boolean {
  for (const f of facts) {
    if (!f.enabled || !POLYGON_SHAPES.has(f.cmd.type)) continue;
    const ids = (f.cmd as { ids?: Id[] }).ids;
    if (!ids || ids.length < 4) continue;
    const pts = ids.map((id) => positions.get(id));
    if (pts.some((p) => !p)) continue; // a vertex that didn't resolve — not this guard's concern
    const n = ids.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const o = pts[i]!, a = pts[(i + 1) % n]!, b = pts[(i + 2) % n]!;
      const turn = Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
      if (turn === 0) return false; // a collinear (degenerate) corner
      if (sign === 0) sign = turn;
      else if (turn !== sign) return false; // a reflex turn → concave (or crossed)
    }
  }
  return true;
}

/**
 * No two DISTINCT named points are pushed together in this draw (within ~1.5% of the figure span),
 * EXCEPT a pair a `coincide` constraint deliberately merges (ADR-028). A resampled "other view" that
 * collapses two points — e.g. a varied free radius ([ADR-051](docs/06-decisions.md#adr-051)) making a
 * secant near-tangent so its crossing lands on another point — is a degenerate/confusing drawing, so the
 * resampler skips it. Hidden helper points (`~…`) are ignored. Only used to vet ALTERNATIVE views.
 */
export function pointsDistinct(c: Construction, positions: Map<Id, Vec>, allowed: [Id, Id][] = []): boolean {
  const pts = c.objects
    .filter((o) => isGeoPoint(o) && !o.id.startsWith('~'))
    .map((o) => ({ id: o.id, p: positions.get(o.id) }))
    .filter((x): x is { id: Id; p: Vec } => !!x.p);
  if (pts.length < 2) return true;
  const xs = pts.map((x) => x.p.x);
  const ys = pts.map((x) => x.p.y);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const minSep = 0.015 * span;
  // A `coincide` constraint deliberately merges a pair; an `allowed` pair is a coincidence the geometry
  // FORCED that the engine now permits (ADR-123) — neither is an avoidable near-collision to reject, so a
  // figure that genuinely requires them still "meets requirements" (no futile auto-resolve search).
  const coincide = new Set([
    ...c.constraints.filter((k) => k.type === 'coincide').map((k) => [k.p, k.q].sort().join('|')),
    ...allowed.map(([p, q]) => [p, q].sort().join('|')),
  ]);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (coincide.has([pts[i].id, pts[j].id].sort().join('|'))) continue;
      if (Math.hypot(pts[i].p.x - pts[j].p.x, pts[i].p.y - pts[j].p.y) < minSep) return false;
    }
  }
  return true;
}

/**
 * A similarity-INVARIANT shape fingerprint: every pairwise distance between named points, normalised by
 * their mean. Translation, rotation, scale and reflection don't change it — so two drawings with the
 * same fingerprint are "the same configuration" even if one is bigger or rotated. Used by `resample` to
 * tell a genuinely DIFFERENT drawing from a mere size/rotation jitter (operator: "5 DOF but every 'show
 * another' gives the same figure" — the remaining DOFs were only similarity transforms, not shape).
 */
function shapeFingerprint(c: Construction, positions: Map<Id, Vec>): number[] {
  const pts = c.objects
    .filter((o) => isGeoPoint(o) && !o.id.startsWith('~'))
    .map((o) => positions.get(o.id))
    .filter((p): p is Vec => !!p);
  const ds: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) ds.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  const mean = ds.reduce((a, b) => a + b, 0) / (ds.length || 1);
  return mean > 1e-9 ? ds.map((d) => d / mean) : ds;
}

/** True if two fingerprints describe a meaningfully different drawing (>3% mean change in the distance ratios). */
function shapeDiffers(a: number[], b: number[]): boolean {
  if (a.length !== b.length || a.length === 0) return a.length !== b.length;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length > 0.03;
}

/**
 * Fold ONE command into the fact list per the execute policy: idempotent duplicate (FR-EN-9 — re-issuing
 * re-enables a deselected twin, never stacks), a free-point move updates its fact in place (ADR-011), and
 * re-stating a STANDALONE circle resizes it in place (a circle inside a bigger step falls through to an
 * override append, keeping that step's label intact). Returns the same array when nothing changed.
 */
function foldFact(facts: Fact[], cmd: AnyCommand, utterance?: string, group?: string): Fact[] {
  const dup = facts.find((f) => deepEqual(f.cmd, cmd));
  if (dup) return dup.enabled ? facts : facts.map((f) => (f.id === dup.id ? { ...f, enabled: true } : f));
  if (cmd.type === 'free-point') {
    const prev = facts.find((f) => f.cmd.type === 'free-point' && f.cmd.id === cmd.id);
    if (prev) return facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f));
  }
  if (cmd.type === 'circle' || cmd.type === 'circle-through') {
    const prev = facts.find((f) => (f.cmd.type === 'circle' || f.cmd.type === 'circle-through') && f.cmd.id === cmd.id);
    if (prev && !facts.some((f) => f.id !== prev.id && groupKey(f) === groupKey(prev)))
      return facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f));
  }
  return [...facts, { id: nanoid(), cmd, utterance, group, enabled: true }];
}

/**
 * Commit a batch of commands as ONE state transition (E4/STO-4): fold each through {@link foldFact}, then
 * a single `set` carrying the new facts AND — when a newly-appended step broke an extension's directional
 * order or a segment-meet (ADR-098/166) — the auto-advanced seed in the SAME transition, so zundo records
 * exactly one entry per user action and undo restores both the facts and the view they were seen at (E5).
 */
function commitCommands(
  get: () => GeoState,
  set: (p: Partial<GeoState>) => void,
  cmds: AnyCommand[],
  utterance?: string,
  group?: string,
): void {
  const facts = get().facts;
  let next = facts;
  for (const cmd of cmds) next = foldFact(next, cmd, utterance, group);
  if (next === facts) return; // every command was an idempotent duplicate — nothing to record
  const patch: Partial<GeoState> = { facts: next };
  // The seed auto-advance applies only when the batch APPENDED a step (matching the old per-command
  // behaviour: a free-point move / circle resize never re-seeds), and only when the current view is
  // actually broken — searching upward from the current seed keeps a valid hand-picked view.
  if (next.length > facts.length) {
    const seed = get().seed;
    const fig = replay(next, seed);
    if (fig.lastError === null && (!extensionsClear(next, fig) || !intersectionsWithinSegments(fig))) {
      const s = firstSatisfyingSeed(next, seed);
      if (s !== seed) {
        patch.seed = s;
        patch.radiusOverrides = {};
      }
    }
  }
  set(patch);
}

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      facts: [],
      selectedId: null,
      figureName: '',
      seed: 0,
      showMeasures: true,
      showCenters: false,
      radiusOverrides: {},
      hidden: [],
      segStyle: {},
      hiddenCircles: [],
      relations: null,
      shapes: null,

      execute: (cmd, utterance, group) => {
        commitCommands(get, set, [cmd], utterance, group);
      },

      executeMany: (cmds, utterance) => {
        // One utterance → one group id → ONE set → one undo entry for the whole step (E4/STO-4).
        commitCommands(get, set, cmds, utterance, cmds.length > 1 ? nanoid() : undefined);
      },

      undo: () => {
        useGeoStore.temporal.getState().undo();
        // A dialed radius is a viewing scratchpad on the state it annotated — never carry it across (E5).
        if (Object.keys(get().radiusOverrides).length) set({ radiusOverrides: {} });
      },

      redo: () => {
        useGeoStore.temporal.getState().redo();
        if (Object.keys(get().radiusOverrides).length) set({ radiusOverrides: {} });
      },

      update: (id, cmd, utterance) => {
        // Replace the fact's command at its existing position. Because replay
        // applies it where it already sits (before any dependents), changing a
        // parameter just re-derives downstream; an incompatible change makes
        // dependents auto-drop, reversibly — no redefinition conflict, since the
        // edited id isn't yet present at its own slot during replay (ADR-015).
        set({ facts: get().facts.map((f) => (f.id === id ? { ...f, cmd, utterance } : f)) });
      },

      toggle: (id) => {
        set({ facts: get().facts.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)) });
      },

      remove: (id) => {
        set({
          facts: get().facts.filter((f) => f.id !== id),
          selectedId: get().selectedId === id ? null : get().selectedId,
        });
      },

      setGroupEnabled: (key, enabled) => {
        set({ facts: get().facts.map((f) => (groupKey(f) === key ? { ...f, enabled } : f)) });
      },

      removeGroup: (key) => {
        set({
          facts: get().facts.filter((f) => groupKey(f) !== key),
          selectedId: get().selectedId === key ? null : get().selectedId,
        });
      },

      replaceGroup: (key, cmds, utterance) => {
        const facts = get().facts;
        const start = facts.findIndex((f) => groupKey(f) === key);
        if (start < 0) return;
        let end = start; // the group's commands are a contiguous run (appended together, edited in place)
        while (end < facts.length && groupKey(facts[end]) === key) end++;
        const group = cmds.length > 1 ? nanoid() : undefined; // multi-command edits stay one step
        const replacement: Fact[] = cmds.map((cmd) => ({ id: nanoid(), cmd, utterance, group, enabled: true }));
        const next = [...facts.slice(0, start), ...replacement, ...facts.slice(end)];
        const patch: Partial<GeoState> = {
          facts: next,
          selectedId: get().selectedId === key ? null : get().selectedId,
        };
        // Edit-path parity with the submit path (commitCommands): an edited command can break an
        // extension's directional order or a segment-meet at the current seed just like an appended one —
        // search upward for a satisfying view in the SAME transition (one undo restores both, ADR-241).
        const seed = get().seed;
        const fig = replay(next, seed);
        if (fig.lastError === null && (!extensionsClear(next, fig) || !intersectionsWithinSegments(fig))) {
          const s = firstSatisfyingSeed(next, seed);
          if (s !== seed) {
            patch.seed = s;
            patch.radiusOverrides = {};
          }
        }
        set(patch);
      },

      select: (id) => {
        set({ selectedId: get().selectedId === id ? null : id });
      },

      setFigureName: (name) => {
        set({ figureName: name });
      },

      viewRelations: () => {
        const facts = get().facts;
        // ONE shared sample set with detectShapes (perf, 2026-07-06 review hotspot #1 — the two layers ran
        // identical variantConfigs × firstSatisfyingSeed × 16-evaluate loops, so pressing both solved the
        // whole figure twice). Sampling contract unchanged (ADR-138 variant configs, requirement-satisfying
        // base seed per ADR-166, facts-ref-keyed invalidation).
        const shared = sharedSamples(facts);
        const result = detectRelationsAcross(shared.constructions, { positions: shared.samples });
        set({ relations: { result, facts } });
      },

      clearRelations: () => set({ relations: null }),

      detectShapes: async () => {
        // Same shared sample core as viewRelations (one solve pass between the two layers).
        //
        // NON-BLOCKING (operator 2026-07-05): a coupled figure's driven-constraint solve is ~15 ms per evaluate
        // (e.g. two right triangles sharing a hypotenuse, whose second right angle is a driven ⟂ constraint —
        // ADR-223), and detection evaluates the figure N× per variant. Run synchronously that froze the main
        // thread for a noticeable beat (the "identify shapes button stuck" report). So sample in small BATCHES,
        // yielding to the event loop between them — the spinner paints and the page stays responsive — then run
        // the fast, pure classification on the collected samples.
        const facts = get().facts;
        const shared = await sharedSamplesAsync(facts);
        if (get().facts !== facts) return; // a step/undo raced us while sampling — don't overwrite with a stale layer
        const result = classifyShapesFromSamples(shared.constructions[0], shared.samples);
        set({ shapes: { result, facts } });
      },

      clearShapes: () => set({ shapes: null }),

      cycleAlt: (pointId) => {
        const facts = get().facts;
        const { construction } = replay(facts);
        const n = branchCount(construction, pointId) || 1;
        // The commands that carry a `branch` index the student can cycle.
        const branchable = new Set(['point-by-distances', 'arc-midpoint', 'line-circle-intersection', 'circle-circle-intersection', 'point-on-segment']);
        set({
          facts: facts.map((f) =>
            f.enabled && branchable.has(f.cmd.type) && 'id' in f.cmd && f.cmd.id === pointId
              ? { ...f, cmd: { ...f.cmd, branch: (((f.cmd as { branch?: number }).branch ?? 0) + 1) % n } }
              : f,
          ),
        });
      },

      cycleVariant: () => {
        const facts = get().facts;
        // Step the FIRST cyclable variant fact (kite: 2 axes; isosceles: 3 apexes; inscribe: side/mirror
        // placements). The variant lives in the fact's command (survives replay/undo — positions are never
        // stored), so this is a pure fact rewrite, like cycleAlt's branch step. Not gated by `shapeDiffers`:
        // a variant step is always a genuine change.
        const target = facts.find((f) => f.enabled && cyclableVariant(f.cmd));
        if (!target) return false;
        const count = variantCountOf(target.cmd);
        const cur = (target.cmd as { variant: number }).variant;
        set({ facts: facts.map((f) => (f === target ? { ...f, cmd: withVariant(f.cmd, (cur + 1) % count) } : f)) });
        return true;
      },

      resample: () => {
        const found = searchResample(get().facts, get().seed);
        if (found === null) return false; // determined (or nothing shape-different in budget)
        set({ seed: found, radiusOverrides: {} }); // a fresh view clears any dialed radii (scratchpad reset)
        return true;
      },

      applyView: (patch) => {
        set({ ...(patch.facts ? { facts: patch.facts } : {}), seed: patch.seed, radiusOverrides: {} });
      },

      autoResolve: () => {
        const { facts, seed } = get();
        if (meetsRequirements(facts, seed)) return true; // already meets every requirement — nothing to search
        const found = findValidConfig(facts, 0);
        if (found) {
          set({ facts: found.facts, seed: found.seed, radiusOverrides: {} });
          return true;
        }
        return false; // no fully-valid configuration found in budget — keep the current figure (shown amber)
      },

      setRadius: (circle, value) => {
        const { facts, seed, radiusOverrides } = get();
        const candidate = { ...radiusOverrides, [circle]: value };
        // A playable DOF must not be draggable into an IMPOSSIBLE figure (operator requirement): only
        // accept a value that still builds (replay has no error). Rejected values leave the override
        // unchanged, so the slider effectively STOPS at the boundary of the constructible range.
        if (replay(facts, seed, candidate).lastError === null) set({ radiusOverrides: candidate });
      },

      setShowMeasures: (show) => set({ showMeasures: show }),
      setShowCenters: (show) => set({ showCenters: show }),

      toggleHidden: (id) => {
        const I = id.toUpperCase();
        const h = get().hidden;
        set({ hidden: h.includes(I) ? h.filter((x) => x !== I) : [...h, I] });
      },

      toggleSegHidden: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'hidden') }),
      toggleSegDashed: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'dashed') }),

      toggleCircleHidden: (id) => {
        const h = get().hiddenCircles;
        set({ hiddenCircles: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] });
      },

      rename: (from, to) => {
        const F = from.toUpperCase();
        const T = to.toUpperCase();
        if (F === T) return { ok: false, reason: 'same' };
        const facts = get().facts;
        const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
        if (!all.has(F)) return { ok: false, reason: 'no-source' };
        if (all.has(T)) return { ok: false, reason: 'target-taken' }; // would merge two distinct points
        set({
          facts: facts.map((f) => ({
            ...f,
            cmd: renameInCommand(f.cmd, F, T),
            // The step row shows the utterance; relabel the letter there too (whole labels only,
            // so a `C1`/`O1` isn't corrupted — Hebrew words and lowercase keywords are untouched).
            utterance: relabelUtterance(f.utterance, F, T),
          })),
          hidden: get().hidden.map((h) => (h === F ? T : h)), // a hidden point keeps its hidden state under the new letter
          segStyle: renameSegStyle(get().segStyle, F, T), // a styled segment keeps its style under the renamed endpoint
          hiddenCircles: get().hiddenCircles.map((c) => (c === `circle-${F}` ? `circle-${T}` : c)), // a hidden circle tracks its renamed centre
          // a dialed radius (keyed `circle-X`) tracks its renamed centre too — else the override orphans
          // and the circle silently snaps back to its seed radius (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [relabelId(k, F, T), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      /**
       * SWAP two EXISTING labels (A↔B) across every fact — the natural "put C where D is, and D where
       * C is" that `rename` can't do (it refuses a taken target, to avoid an accidental merge). Built on
       * the rename primitives via a `\0` sentinel so the two exchanges don't collide. (ADR-122.)
       */
      swap: (a, b) => {
        const A = a.toUpperCase();
        const B = b.toUpperCase();
        if (A === B) return { ok: false, reason: 'same' };
        const facts = get().facts;
        const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
        if (!all.has(A) || !all.has(B)) return { ok: false, reason: 'no-source' }; // both must exist
        const TMP = '\u0000'; // a sentinel that can never be a real label or appear in an utterance
        const swapCmd = (cmd: AnyCommand) => renameInCommand(renameInCommand(renameInCommand(cmd, A, TMP), B, A), TMP, B);
        const swapUtt = (u: string | undefined) => relabelUtterance(relabelUtterance(relabelUtterance(u, A, TMP), B, A), TMP, B);
        const swapKey = (k: string) => relabelId(relabelId(relabelId(k, A, TMP), B, A), TMP, B);
        set({
          facts: facts.map((f) => ({ ...f, cmd: swapCmd(f.cmd), utterance: swapUtt(f.utterance) })),
          hidden: get().hidden.map((h) => (h === A ? B : h === B ? A : h)),
          segStyle: renameSegStyle(renameSegStyle(renameSegStyle(get().segStyle, A, TMP), B, A), TMP, B),
          hiddenCircles: get().hiddenCircles.map((c) => (c === `circle-${A}` ? `circle-${B}` : c === `circle-${B}` ? `circle-${A}` : c)),
          // dialed radii (keyed `circle-X`) swap with their centres (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [swapKey(k), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      merge: (from, to) => {
        const F = from.toUpperCase();
        const T = to.toUpperCase();
        if (F === T) return { ok: false, reason: 'same' };
        const facts = get().facts;
        const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
        if (!all.has(F)) return { ok: false, reason: 'no-source' };
        if (!all.has(T)) return { ok: false, reason: 'no-target' }; // merging into a NEW letter is a rename, not a merge
        // F must have its OWN single-point definition (a command with `id === F`) to fold;
        // a shape vertex (in an `ids[]` tuple) or an auto-created endpoint has none and can't
        // be cleanly absorbed without tearing apart the construct that introduced it.
        const defining = facts.find((f) => (f.cmd as { id?: Id }).id === F);
        if (!defining) return { ok: false, reason: 'source-in-shape' };
        const merged = facts
          .filter((f) => f.id !== defining.id) // drop F's own definition — T survives, F is absorbed
          .map((f) => ({
            ...f,
            cmd: renameInCommand(f.cmd, F, T),
            // token-aware, like rename/swap — the old substring split/join corrupted multi-char labels
            // (`F1`→`E1` when folding F→E), and ✎-edit re-parses this text (STO-6)
            utterance: relabelUtterance(f.utterance, F, T),
          }))
          .filter((f) => !collapsedDegenerate(f.cmd)); // drop facts that collapsed (segment EF → EE, …)
        set({
          facts: merged,
          hidden: [...new Set(get().hidden.map((h) => (h === F ? T : h)))],
          segStyle: renameSegStyle(get().segStyle, F, T),
          hiddenCircles: [...new Set(get().hiddenCircles.map((c) => (c === `circle-${F}` ? `circle-${T}` : c)))],
          // a dialed radius follows the fold (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [relabelId(k, F, T), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      clear: () => {
        set({ facts: [], selectedId: null, figureName: '', seed: 0, radiusOverrides: {}, hidden: [], segStyle: {}, hiddenCircles: [], relations: null, shapes: null });
        useGeoStore.temporal.getState().clear();
      },

      loadFigure: (file) => {
        // ONE `set` — zundo records a single entry (facts + seed are the tracked slice), so undo
        // brings back whatever session was open before the load. The dialed radii are applied but
        // stay a scratchpad (cleared by undo/"show another", exactly as if the student dialed them).
        set({
          facts: file.facts,
          seed: file.seed,
          radiusOverrides: file.radiusOverrides,
          selectedId: null,
          relations: null,
          shapes: null,
          hidden: file.display?.hidden ?? [],
          segStyle: file.display?.segStyle ?? {},
          hiddenCircles: file.display?.hiddenCircles ?? [],
          ...(file.display?.showMeasures !== undefined ? { showMeasures: file.display.showMeasures } : {}),
          ...(file.display?.showCenters !== undefined ? { showCenters: file.display.showCenters } : {}),
        });
      },
    }),
    {
      // The fact list AND the seed participate in undo/redo (E5/STO-5): `execute` can auto-advance the
      // seed and `autoResolve`/`resample` set it, so restoring facts at a DIFFERENT seed showed the
      // student a figure they never saw — undo now rolls the view back with the data. Transient
      // selection and the dialed-radius scratchpad stay out (the store's `undo`/`redo` wrappers clear
      // the overrides instead — a per-drag slider value must not flood the history).
      partialize: (s) => ({ facts: s.facts, seed: s.seed }),
      // Skip history entries when neither changed (e.g. selecting a fact only sets selectedId).
      equality: (a, b) => a.facts === b.facts && a.seed === b.seed,
      limit: 100,
    },
  ),
);
