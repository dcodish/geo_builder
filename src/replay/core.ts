/**
 * The REPLAY layer (S1.2 of docs/24) — the engine's top orchestration, moved OUT of the store file
 * so the mechanism boundary matches the module boundary (the docs/23 review found `computeFold` +
 * deferral + HOIST + the config sweeps — the most intricate control flow in the product — living in
 * the 2,717-line Zustand store beside selection highlighting and undo).
 *
 * Everything here is PURE over (facts, seed): the replay/fold memo (ADR-280), the
 * ADR-104 deferral fixpoint, the atomic-group poisoning, the M2 HOIST rescue (ADR-231), the seed &
 * config searches (firstSatisfyingSeed / meetsRequirements / findValidConfig / searchResample /
 * searchAnotherView, ADR-267), the shared detection sample core (M3), and the validity predicates.
 * NOTHING here may import the store (zustand), the parser, the renderer, or React — the layering is
 * engine ← replay ← store, mechanically enforced by src/replay/__tests__/import-direction.test.ts.
 * The store re-exports this module's surface, so existing consumers are untouched.
 */

import type { StatedShapeEquality, VariantShape, AnyCommand, Command, Constraint, Construction, ForcedOffArc, GivenViolation, Id, RelationsResult, ResolvedCircle, ShapesResult, Vec } from '@/engine';
import { metricImpossibility } from '@/engine/metricFeasibility';
import { computeValuesPanel, declaredLengthUnit, type QueryInput, type ValuesPanelResult } from '@/engine/valuesPanel';
import { classifyShapesFromSamples, detectRelationsAcross, statedShapeEqualities } from '@/engine';
import { formatMeasure } from '@/format';
import { solveBudget, withSolveBudget, applyCommand, applySeed, applyStep, applyCoupledStep, baseSeedOf, branchCount, buildSymTab, checkGivens, forcedOffArcs, crossingCounts, drawnCircles, drawnPointIds, findInkCrossings, resolveDrawnLines, constraintKey, constraintRefs, constraintScale, isOrderConstraint, convergedSamples, deepEqual, distinctSamples, emptyConstruction, evaluate, drivenConstraintsOf, expandInscribe, expandShapeVariant, freeDofCount, freeDofs, isGeoPoint, isMeasure, lowerOne, measureLabelText, circleMembers, firstCyclableBranch, cyclableVariant, pinsSoftVariant, reflectableFreePoints, REFLECT_MAX, scalePinned, directionHelperFreePoints, reflectAnchors, reflectMaskOf, requirementSamples, residual, ringSimple, variantCountOf, variantVertices, warmStartCarriers, wellSpread, tightestWedge, withVariant, withReflectMask } from '@/engine';

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
  arcs: { circle: Id; a: Id; b: Id; text: string }[]; // an ARC measure's value, printed ON the arc (ADR-335)
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
export function angleMarkFor(cmd: AnyCommand): AngleMark | null {
  switch (cmd.type) {
    case 'measure-angle':
      return { vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, right: false };
    case 'mark-angle': // #106: a valueless stated-angle mark (a central angle with no value) — an arc, never a knee
      return { vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, right: false };
    case 'angle-alias': // «נסמן זוית BAM כ-A1» (#235) — the named wedge gets its arc; the "A1" text rides the measure-label stream
      return { vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, right: false };
    case 'set-angle':
      if (cmd.arcOf) return null; // an ARC measure — the value prints ON the arc, never a wedge at the (hidden) centre (ADR-335)
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
  /** Pairs of distinct points the geometry drove to the same location — allowed, shown as a notice so the
   *  student knows two labels converged (e.g. a derived point landing on a circle's centre). [ADR-123] */
  coincidences: [Id, Id][];
  /** References the CONSTRUCTION forces off the drawn ink — ADR-423 tier 3: allowed (the departure is
   *  unavoidable and the figure is right), surfaced as a notice so ink appearing where the student drew
   *  none is never silent. Distinct from the amber `point-off-arc` violation, which is tier 2. [#433] */
  forcedOffArc: ForcedOffArc[];
}

/** A free circle radius the student can drag: `base` is the stable seed radius (for the slider range),
 *  `current` is the radius being drawn right now (seed-varied or dialed). */

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
 * Replay memoization (E1 / STO-1). `replay` is pure in `(facts, seed)` but was
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

export function replay(facts: Fact[], seed = 0): Derived {
  const key = `${seed}`;
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
  const out = computeReplay(facts, seed);
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
 * poisoning, and the ADR-231 HOIST rescue. The seed enters only in {@link runTail},
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
  /** #360 ([ADR-398](docs/06-decisions.md#adr-398)): `constraintKey` → the INDEX of the fact whose commit
   *  first introduced that constraint (from `cur.constraints` AND the objects' solve directives, via
   *  `drivenConstraintsOf` — driven constraints are NOT in `c.constraints`). Lets the per-seed tail
   *  attribute an `evaluate` failure to the fact rows that own it. String-keyed on purpose: clone-safe
   *  across the ADR-290 worker transplant, and immune to object re-wrapping in the tail transforms. */
  ownerByConKey: Map<string, number>;
  /** #360: object id → the INDEX of the fact whose commit first put that object in the figure — the
   *  attribution twin for the resolver/stuck failure paths, which name objects rather than constraints. */
  ownerByObjId: Map<Id, number>;
  rtReorderByIndex: [number, [Id, Id, Id]][];
  lens: [string, MeasureLabels['lengths'][number]][];
  angs: [string, MeasureLabels['angles'][number]][];
  areas: [string, MeasureLabels['areas'][number]][];
  /** Tail iteration order over the facts (original indices) — a rescue iterates in ITS (hoisted) order,
   *  so duplicate-keyed angle marks dedupe exactly as the old recursive replay did. */
  iterOrder: number[];
  rescue: FoldNode | null;
  /** #365 (ADR-406): the fold's GLOBAL-pre-scan signature — the symbol table and every default-yield
   *  pre-scan artifact AS APPLIED to this fact list (fact-scoped entries by INDEX, groups by partition
   *  number, so a dry-run trial array and the committed array still share). Appending facts may resume
   *  from this node ONLY when the full list's pre-scans, restricted to the prefix, produce the same
   *  signature — i.e. the appended facts change nothing about how the prefix folded. */
  prescanSig: string;
  /** #365: the point ids claimed by the fold's facts (`owned`) — the resume state a prefix append
   *  needs that isn't derivable from the other fields without re-lowering every prefix fact. */
  ownedIds: Id[];
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
export const foldStats = { computes: 0, resumes: 0 };
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
    // #360: the owner maps carry fact INDICES in the permuted order — translate them like statusByIndex.
    ownerByConKey: new Map([...node.ownerByConKey].map(([k, permIdx]) => [k, permToOrig[permIdx]])),
    ownerByObjId: new Map([...node.ownerByObjId].map(([k, permIdx]) => [k, permToOrig[permIdx]])),
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
 *  here so a worker prefold warms exactly the content `dryRunOutcome` (and usually the commit) will use.
 *  It models what `foldFact` will actually commit: a command that exactly duplicates an ENABLED fact is a
 *  friendly idempotent no-op (FR-EN-9) and is dropped, so the trial's net content matches the committed
 *  figure. Without this a re-stated constraint (re-typing `AB=AC`, or a compound step like an altitude that
 *  re-emits its base `triangle ABC`) would append a redundant copy — two identical `set-equal`s perturb the
 *  solver ~0.75 and read as a phantom "produced" (issue #1 / ADR-234) though the real figure never moves. A
 *  DISABLED twin is kept (the commit re-enables it — a genuine change; the disabled copy is inert in replay). */
export function trialFacts(facts: Fact[], commands: AnyCommand[]): Fact[] {
  const enabled = facts.filter((f) => f.enabled).map((f) => f.cmd);
  const eff = commands.filter((c) => !enabled.some((e) => deepEqual(e, c)));
  return [...facts, ...eff.map((c, i) => ({ id: `~try.${i}`, group: '~try', enabled: true, cmd: c }))];
}

function computeReplay(facts: Fact[], seed = 0): Derived {
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
  return tailChoice(fold, facts, seed);
}

/** Per-seed candidate choice: try the HOIST rescue chain first; a rescue whose tail evaluates clean at
 *  THIS seed wins (exactly the old recursive acceptance `rescued.lastError === null && !rescued.pending`),
 *  else fall back to the fold that failed — its honest error stands. */
function tailChoice(fold: FoldNode, facts: Fact[], seed: number): Derived {
  if (fold.rescue) {
    const r = tailChoice(fold.rescue, facts, seed);
    if (r.lastError === null && !r.pending) return r;
  }
  return runTail(fold, facts, seed);
}

/** #566 (ADR-445): the vertices an enabled EXPLICIT 90° statement names — the right-triangle seat's
 *  PIN set. The ADR-163 reseat pre-scan and the ADR-445 config-search dimension consult this SAME set,
 *  so the yield channel and the search can never disagree about which seats are the student's. */
export function explicitRightAngleVerts(facts: Fact[], symtab?: ReturnType<typeof buildSymTab>): Set<Id> {
  const st = symtab ?? buildSymTab(facts.filter((f) => f.enabled).map((f) => f.cmd));
  return new Set<Id>(
    facts
      .filter((f) => f.enabled)
      .flatMap((f) => lowerOne(f.cmd, st))
      .filter((c): c is Extract<Command, { type: 'set-angle' }> => c.type === 'set-angle' && Math.abs(c.value - 90) < 1e-6)
      .map((c) => c.vertex),
  );
}

/** #566 (ADR-445): a right-triangle's EFFECTIVE ids — the explicit-90° reseat (ADR-163) always wins;
 *  else the solve-chosen `rot` seats the right angle on the flipped vertex (last position). ONE helper
 *  for the lowering and the knee mark, so the built angle and the drawn knee cannot disagree. */
function rtEffectiveIds(cmd: Extract<AnyCommand, { type: 'right-triangle' }>, reseat?: [Id, Id, Id]): [Id, Id, Id] {
  if (reseat) return reseat;
  const [a, b, c] = cmd.ids;
  return cmd.rot === 1 ? [b, c, a] : cmd.rot === 2 ? [a, c, b] : cmd.ids;
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
  const rightAngleVerts = explicitRightAngleVerts(facts, symtab);
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
  // A trapezoid's LONG BASE is an unstated default that yields to an explicit length-order
  // ([ADR-341](docs/06-decisions.md#adr-341), issue #173 — the ADR-163 pre-scan shape, M4). The template
  // draws |DC| = 0.6·|AB| (AB the long base); a stated «AB < CD» — an order over the trapezoid's PARALLEL
  // sides contradicting that default — used to be "repaired" by grinding k just past 1, a boundary-
  // degenerate near-parallelogram. Rotating the ids by two ([C,D,A,B]) names the SAME quad (same edges,
  // same legs — so the iso-trapezoid macro's equal legs stay legs) with the template's long base landing
  // on the stated-long pair: the order then holds AT THE TEMPLATE, with the default's own comfortable
  // margin. Position-independent (typed before or after the shape).
  // SEMANTIC CENTRE-USE promotes an anonymous auto centre to its letter ([ADR-342](docs/06-decisions.md#adr-342),
  // issue #177 ruling (b)): a statement whose WORDS name the centre («רדיוס OB» — the word radius itself
  // asserts O is the centre) carries a `name-center` command with the LETTER; this pre-scan renames the
  // matching anonymous centre id ('@ctr-O' → 'O') across every fact's lowering, so the letter becomes the
  // real, visible centre point — order-independent (typed before or after the circle), pure replay (the
  // corpus and save/load ride it with no store op). Positional/definitional statements never emit the
  // marker, so the reported hijack class ('P על המשך BA') stays closed.
  const centrePromotions = new Map<string, string>(); // '@ctr-O' → 'O'
  for (const f of facts) {
    if (!f.enabled) continue;
    for (const c of lowerOne(f.cmd, symtab)) {
      if (c.type !== 'name-center' || c.center.startsWith('@') || c.center.startsWith('~')) continue;
      centrePromotions.set(`@ctr-${c.center}`, c.center);
    }
  }
  const promoteCentres = (cmds: Command[]): Command[] => {
    if (centrePromotions.size === 0) return cmds;
    return cmds.map((c) => {
      let s = JSON.stringify(c);
      for (const [from, to] of centrePromotions) s = s.split(JSON.stringify(from)).join(JSON.stringify(to));
      return JSON.parse(s) as Command;
    });
  };
  const lengthOrders = facts
    .filter((f) => f.enabled)
    .flatMap((f) => lowerOne(f.cmd, symtab))
    .filter((c): c is Extract<Command, { type: 'set-length-order' }> => c.type === 'set-length-order');
  const trapRotate = new Map<string, [Id, Id, Id, Id]>();
  for (const f of facts) {
    if (!f.enabled || f.cmd.type !== 'trapezoid') continue;
    const [a, b, c, d] = f.cmd.ids;
    const samePair = (x1: Id, y1: Id, x2: Id, y2: Id) => (x1 === x2 && y1 === y2) || (x1 === y2 && y1 === x2);
    // `set-length-order {a,b,c,d}` asserts |ab| < |cd| — a conflict names the template-LONG base (a,b) as
    // the shorter side and the template-short top (c,d) as the longer.
    if (lengthOrders.some((o) => samePair(o.a, o.b, a, b) && samePair(o.c, o.d, c, d))) trapRotate.set(f.id, [c, d, a, b]);
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
  // A base-less midsegment's ANCHOR SIDE is an unstated default that yields to an explicit membership
  // ([ADR-412](docs/06-decisions.md#adr-412), issue #407 — the ADR-163 pre-scan shape, M4). The named-
  // triangle (#71) and implicit-triangle (#405) forms seat the pair's first letter on a DEFAULT side and
  // pin it to that side's midpoint; a later «D על AC» names the side the student MEANT. Stacked as a
  // constraint instead, the system is satisfiable only DEGENERATELY (mid(AB) ∈ AC ⇒ B on line AC — the
  // #408 collapse). Identification is STRUCTURAL: only a rider fact sharing its GROUP with the
  // shape-variant is a rule-made default — a student-stated rider lives in its own group and never moves.
  // Re-seat = rewrite the rider's host to the stated side + re-anchor the variant ids so the free letter
  // cycles over the remaining two sides.
  const msRiderMove = new Map<string, [Id, Id]>(); // default-rider fact id → the stated host side
  const msSvMove = new Map<string, Id[]>(); // shape-variant fact id → re-anchored [P',Q',R',E,G]
  for (const sv of facts) {
    if (!sv.enabled || sv.cmd.type !== 'shape-variant' || sv.cmd.shape !== 'midsegment') continue;
    const [p, q, rr, e, g] = sv.cmd.ids;
    const svGroup = groupKey(sv);
    const rider = facts.find(
      (f) => f.enabled && groupKey(f) === svGroup && f.cmd.type === 'point-on-segment' && f.cmd.id === e && f.cmd.a === p && f.cmd.b === q,
    );
    if (!rider) continue; // the anchor was stated by the student (ADR-199 1-anchored) — no default to yield
    const tri = new Set([p, q, rr]);
    const stated = facts.find((f) => {
      if (!f.enabled || groupKey(f) === svGroup || f.cmd.type !== 'point-on-segment' || f.cmd.id !== e) return false;
      const { a, b } = f.cmd;
      if (a === b || !tri.has(a) || !tri.has(b)) return false;
      return !((a === p && b === q) || (a === q && b === p)); // a DIFFERENT side than the default
    });
    if (!stated || stated.cmd.type !== 'point-on-segment') continue;
    const sa = stated.cmd.a;
    const sb = stated.cmd.b;
    const third = [p, q, rr].find((v) => v !== sa && v !== sb);
    if (!third) continue;
    msRiderMove.set(rider.id, [sa, sb]);
    msSvMove.set(sv.id, [sa, sb, third, e, g]);
  }
  // #365 (ADR-406): the GLOBAL-pre-scan signature, restricted to the first `count` facts. Two facts
  // lists share a prefix fold ONLY when this signature agrees — i.e. the appended facts introduce no
  // symbol binding, centre promotion, soft-supersession, right-triangle reseat, trapezoid rotation,
  // softPair swap, explicit equality or explicit on-segment that would change how a PREFIX fact folds.
  // Fact-scoped entries are keyed by INDEX and groups by partition number (never by fact id), so a
  // dry-run trial array and the committed array — same content, different ids — still share (ADR-280).
  const factIdxById = new Map<string, number>(facts.map((f, i) => [f.id, i]));
  const groupPartition = new Map<string, number>();
  for (const f of facts) {
    const g = groupKey(f);
    if (!groupPartition.has(g)) groupPartition.set(g, groupPartition.size);
  }
  const prescanSigFor = (count: number): string => {
    const inPrefix = (id: string) => (factIdxById.get(id) ?? Infinity) < count;
    const prefixGroups = new Set(facts.slice(0, count).map(groupKey));
    return JSON.stringify({
      sym: { vars: [...symtab.vars.entries()], radiusCircle: symtab.radiusCircle ?? null, radiusOf: [...symtab.radiusOf.entries()] },
      soft: [...supersededSoft].filter(inPrefix).map((id) => factIdxById.get(id)).sort((a, b) => a! - b!),
      rt: [...rtReorder].filter(([id]) => inPrefix(id)).map(([id, ids]) => [factIdxById.get(id), ids]),
      trap: [...trapRotate].filter(([id]) => inPrefix(id)).map(([id, ids]) => [factIdxById.get(id), ids]),
      msr: [...msRiderMove].filter(([id]) => inPrefix(id)).map(([id, v]) => [factIdxById.get(id), v]),
      mss: [...msSvMove].filter(([id]) => inPrefix(id)).map(([id, v]) => [factIdxById.get(id), v]),
      ctr: [...centrePromotions].sort(),
      pair: [...pairSwapByGroup].filter(([g]) => prefixGroups.has(g)).map(([g, m]) => [groupPartition.get(g), [...m].sort()]),
      eqs: explicitEqs,
      ons: explicitOnSegs,
    });
  };
  // #403 (ADR-407): FUTILITY — a failed fact referencing a POINT label that NO fact in the list
  // introduces can never succeed, whatever the order. The deferral retries and HOIST re-folds it
  // used to trigger were pure waste — measured 29.8 s (unbudgeted) to report «references an unknown
  // point» on the #157 figure, against the docs/17 §7 rule that the failure path must be CHEAPER
  // than the success path. The universe is the STATIC `introducedPointIds` over the fold's own
  // command expansion — the same authority the fold's ownership/claim logic trusts — so a point any
  // reorder could make available is always in it (over-approximation-safe: a miss here would also
  // break `owned`). Only point-shaped ids are judged (scaffold `~`/`@` and typed object ids like
  // `circle-O`/`seg-AB` are never "dangling references" in this sense).
  const factCmds = (g: Fact): Command[] =>
    (g.cmd.type === 'shape-variant' ? expandShapeVariant(g.cmd, explicitEqs, explicitOnSegs)
    : g.cmd.type === 'inscribe' ? expandInscribe(g.cmd, explicitOnSegs)
    : lowerOne(g.cmd, symtab)) as Command[];
  let introduciblePts: Set<Id> | null = null;
  const futileCache = new Map<string, boolean>();
  const futileFact = (f: Fact): boolean => {
    const hit = futileCache.get(f.id);
    if (hit !== undefined) return hit;
    if (!introduciblePts) {
      introduciblePts = new Set<Id>();
      for (const g of facts) {
        if (!g.enabled) continue;
        for (const c of factCmds(g)) {
          for (const id of introducedPointIds(c)) introduciblePts.add(id);
          // #402 (ADR-408): a collinearity statement MAY create its new labels as riders — those
          // labels are introducible, so a sibling fact referencing them is never falsely futile
          // (deliberate over-approximation; the safe direction for this predicate).
          if (c.type === 'set-line') for (const id of c.points) introduciblePts.add(id);
          if (c.type === 'set-collinear') for (const id of [c.a, c.b, c.c]) introduciblePts.add(id);
        }
      }
    }
    const dangling = factCmds(f)
      .flatMap((c) => commandObjectIds(c))
      .some((id) => /^[A-Z]/.test(id) && !introduciblePts!.has(id));
    futileCache.set(f.id, dangling);
    return dangling;
  };
  // #365: PREFIX REUSE — the append case (submit, dry-run, edit-at-the-end) re-folded every fact from
  // scratch because the memo is keyed by whole-list content. A cached fold of a strict PREFIX is a valid
  // resume point exactly when (a) it is fully CLEAN — no failure, no pending, no rescue — so the ADR-104
  // deferral, the atomic poisoning and the HOIST rescue all provably did nothing in it, and (b) the
  // pre-scan signature above says the appended facts change nothing about how the prefix folded. Then
  // the fold starts from the cached construction and pays only the NEW facts. Conservative by design:
  // any doubt (a new symbol, a new explicit equality, a mixed group…) falls back to the full fold.
  let resumeFrom: { node: FoldNode; count: number } | null = null;
  if (hoistDepth === 0 && foldCache.size) {
    const fullKey = foldKey(facts);
    for (const [k, node] of foldCache) {
      if (!fullKey.startsWith(`${k}\n`)) continue;
      const count = k.split('\n').length;
      if (resumeFrom && count <= resumeFrom.count) continue;
      if (node.pending || node.buildError !== null || node.rescue !== null) continue;
      if (node.statusByIndex.some((s) => s !== 'ok' && s !== 'disabled')) continue;
      if (node.prescanSig !== prescanSigFor(count)) continue;
      resumeFrom = { node, count };
    }
    if (resumeFrom) foldStats.resumes++;
  }
  // Build the construction by folding the enabled facts. `forced` maps a fact id to a status string that
  // BLOCKS it (an atomic-group casualty — see the poisoning pass below): the fact is neither applied nor
  // measured, only its owned points are claimed so genuine dependents still cascade-fail. Runs at most twice
  // (once clean, once with the poisoned groups blocked), so the label maps are cleared on each entry.
  // #365: `start` resumes from a clean prefix fold — the prefix facts keep their cached statuses and the
  // loop begins at `start.count`. The poisoning rebuild always runs WITHOUT `start` (a forced block can
  // reach prefix groups, so the resumed state would be stale).
  const runBuild = (forced: Map<string, string>, start: { node: FoldNode; count: number } | null = null) => {
    let cur = start ? start.node.cur : emptyConstruction();
    const status: Record<string, FactStatus> = {};
    const owned = new Set<Id>(start ? start.node.ownedIds : []);
    const applied: Command[] = start ? [...start.node.applied] : [];
    // #360 (ADR-398): ownership maps for per-seed failure attribution — filled after each successful
    // commit, first-wins (the fact whose commit first made the constraint/object appear owns it). The
    // constraint harvest mirrors `evaluate`'s own extraction exactly: `cur.constraints` (the check list)
    // PLUS `drivenConstraintsOf` (directive-carried constraints, which are NOT in `c.constraints`).
    const ownerByConKey = start ? new Map(start.node.ownerByConKey) : new Map<string, number>();
    const ownerByObjId = start ? new Map(start.node.ownerByObjId) : new Map<Id, number>();
    const recordOwnership = (fi: number) => {
      for (const o of cur.objects) if (!ownerByObjId.has(o.id)) ownerByObjId.set(o.id, fi);
      for (const con of [...cur.constraints, ...drivenConstraintsOf(cur)]) {
        const k = constraintKey(con);
        if (!ownerByConKey.has(k)) ownerByConKey.set(k, fi);
      }
    };
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
    if (start) {
      // #365: the prefix facts' measure labels and statuses come from the cached node verbatim
      for (const [k, v] of start.node.lens) lenByKey.set(k, v);
      for (const [k, v] of start.node.angs) angByKey.set(k, v);
      for (const [k, v] of start.node.areas) areaByKey.set(k, v);
      for (let i = 0; i < start.count; i++) status[facts[i].id] = start.node.statusByIndex[i];
    }
    for (const [fi, f] of facts.entries()) {
      if (start && fi < start.count) continue; // #365: already folded — resumed from the cached prefix
      // Lower the fact to the engine command(s) it produces (symbolic measures →
      // ratio/distance/angle/[]; engine commands pass through; a `shape-variant` → base shape + the
      // variant-selected equal pairs, with an explicit equality pinning the variant — ADR-138).
      // 0 commands ⇒ a label-only / data-only fact (a free representative or `set-var`) — applied as a no-op.
      let engineCmds =
        f.cmd.type === 'shape-variant' ?
          expandShapeVariant(msSvMove.has(f.id) ? { ...f.cmd, ids: msSvMove.get(f.id)! } : f.cmd, explicitEqs, explicitOnSegs)
        : f.cmd.type === 'inscribe' ? expandInscribe(f.cmd, explicitOnSegs)
        : lowerOne(f.cmd, symtab);
      // Re-seat a right-triangle's right angle onto the vertex the student explicitly set to 90° (see
      // pre-scan), or — #566 (ADR-445) — onto the SOLVE-CHOSEN `rot` seat; the explicit pin always wins.
      const reseat = rtReorder.get(f.id);
      if (reseat || (f.cmd.type === 'right-triangle' && f.cmd.rot))
        engineCmds = engineCmds.map((ec) => (ec.type === 'right-triangle' ? { ...ec, ids: rtEffectiveIds(ec, reseat) } : ec));
      // Re-seat a midsegment default rider onto the side the student explicitly stated (ADR-412 pre-scan).
      const riderMove = msRiderMove.get(f.id);
      if (riderMove) engineCmds = engineCmds.map((ec) => (ec.type === 'point-on-segment' ? { ...ec, a: riderMove[0], b: riderMove[1] } : ec));
      // Rotate a trapezoid whose stated base order contradicts the template's long-base default (ADR-341).
      const trot = trapRotate.get(f.id);
      if (trot) engineCmds = engineCmds.map((ec) => (ec.type === 'trapezoid' ? { ...ec, ids: trot } : ec));
      // Promote anonymous centres a semantic centre-use named (ADR-342, '@ctr-O' → 'O').
      engineCmds = promoteCentres(engineCmds as Command[]);
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
      // An angle ALIAS annotates its wedge with the bound name (#235) — a name, not a value, so it
      // rides the same label stream as a symbolic measure (the arc comes from angleMarkFor). The book
      // convention draws the DIGIT alone when the name is the vertex letter + digits (the vertex's own
      // point label already shows the letter — «A1» next to «A» duplicated it, #263); a name bound at
      // a DIFFERENT letter keeps the full name (unambiguous).
      if (f.cmd.type === 'angle-alias') {
        const digits = f.cmd.name.startsWith(f.cmd.vertex) ? f.cmd.name.slice(f.cmd.vertex.length) : '';
        const text = /^\d+$/.test(digits) ? digits : f.cmd.name;
        addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-angle', vertex: f.cmd.vertex, ray1: f.cmd.ray1, ray2: f.cmd.ray2 }, text);
      }
      // A point a lowered command would (re)create that an earlier fact owns but which
      // isn't in the figure now ⇒ its definition is gone, so this fact can't build either.
      const broken = intro.filter((id) => owned.has(id) && !cur.objects.some((o) => o.id === id));
      if (broken.length) {
        status[f.id] = `can't build: ${broken.join(', ')} is no longer available (an earlier step it relies on was removed or failed)`;
        claim();
        continue;
      }
      // TRANSACTIONAL — a fact's lowering is ALL-OR-NOTHING ([ADR-337](docs/06-decisions.md#adr-337)).
      // ONE fact can lower to MANY engine commands (every macro: `inscribe` ADR-262, `shape-variant`
      // ADR-138, the named shapes ADR-110, regular polygon ADR-111, common tangent ADR-239, the concentric
      // pair ADR-244, any multi-command `lowerOne`). Committing each command into `cur` as it succeeds left
      // a HALF-BUILT expansion behind when a LATER command of the SAME fact failed: the riders rendered and
      // the figure moved although the step is red, and — because the failing constraint never reached
      // `applied` — the verifier read CLEAN on a figure violating the step's own stated relations (docs/17
      // §6 honesty). So build into a `trial` and commit only if EVERY command succeeded; this mirrors the
      // pattern the ADR-104 deferral retry below already uses.
      let trial = cur;
      let ok = true;
      for (const unit of applyUnits(engineCmds as Command[])) {
        const r = unit.length > 1 ? applyCoupledStep(trial, unit) : applyStep(trial, unit[0]);
        if (r.ok) trial = r.construction;
        else {
          status[f.id] = r.error; // dependencies gone, contradiction, etc. — keep prior figure
          ok = false;
          failedWith.set(f.id, cur); // the PRE-fact figure — what the retry must compare against (ADR-280 purity skip)
          break;
        }
      }
      if (ok) {
        cur = trial;
        status[f.id] = 'ok';
        applied.push(...(engineCmds as Command[]));
        recordOwnership(fi); // #360: whatever this commit added, this fact owns
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
      if (futileFact(f)) return false; // #403: a dangling reference can never resolve by retrying
      const ec = lowerOne(f.cmd, symtab);
      return ec.length > 0 && ec.every((c) => introducedPointIds(c).length === 0);
    };
    for (let pass = 0; pass < facts.length && facts.some(deferrable); pass++) {
      let progressed = false;
      for (const [fi, f] of facts.entries()) {
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
          recordOwnership(fi); // #360: a deferral-retry commit owns its additions just like an in-order one
          progressed = true;
        } else failedWith.set(f.id, cur);
      }
      if (!progressed) break;
    }
    return { cur, status, applied, ownerByConKey, ownerByObjId, owned };
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
  let { cur, status, applied, ownerByConKey, ownerByObjId, owned } = runBuild(new Map(), resumeFrom);
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
      ({ cur, status, applied, ownerByConKey, ownerByObjId, owned } = runBuild(forced));
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
      if (futileFact(f)) return false; // #403: no permutation can create a point no fact introduces
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
    ownerByConKey,
    ownerByObjId,
    iterOrder: facts.map((_, i) => i),
    rescue,
    prescanSig: prescanSigFor(facts.length),
    ownedIds: [...owned],
  };
}

/**
 * The seed-DEPENDENT tail of a replay (ADR-280): reflections + the ADR-018 sample on
 * the fold's finished construction, ONE evaluate, then the per-seed presentation (labels, asserted angle
 * marks, the givens verifier, coincidences). This is all a new seed — a sweep candidate,
 * a "show another configuration" probe, a detection sample — ever pays.
 */
function runTail(fold: FoldNode, facts: Fact[], seed: number): Derived {
  const { cur, applied, pending } = fold;
  const status: Record<string, FactStatus> = {};
  facts.forEach((f, i) => { status[f.id] = fold.statusByIndex[i]; });
  const rtReorder = new Map(fold.rtReorderByIndex.map(([i, ids]) => [facts[i].id, ids]));
  const lenByKey = new Map(fold.lens);
  const angByKey = new Map(fold.angs);
  const areaByKey = new Map(fold.areas);
  const arcByKey = new Map<string, MeasureLabels['arcs'][number]>(); // ARC measures (ADR-335) — per-seed constraint values, nothing fold-carried
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
  let figure = sampled;
  let e = evaluate(figure);
  // #359 ([ADR-400](docs/06-decisions.md#adr-400)): per-seed BASIN RETRY. The fold's ladder (recruit /
  // settle / scale, docs/LADDER.md stages 2e–3) runs only at fold time; the tail is one evaluate, so a
  // seed whose sampled solver STARTS fall outside the driven system's convergence basin failed here even
  // though the fold's own committed solution is a start that provably converges — and tailChoice then
  // fell back to a weaker (pending) fold, silently shrinking the valid-configuration space (the
  // two-tangent-circles figure lost half its seeds this way). Retry ONCE with every directive-carrying
  // carrier warm-started from the fold's committed values: the ADR-238 pattern — retry-only, so a seed
  // that evaluates clean never reaches this and previously-green seeds are bit-identical; the sampled
  // non-driven DOFs keep their sampled values, so genuine variety is untouched.
  if (!e.ok) {
    const warmed = warmStartCarriers(figure, cur);
    if (warmed) {
      const w = evaluate(warmed);
      if (w.ok) {
        e = w;
        figure = warmed;
      }
    }
  }
  // A seed can break a figure that BUILT fine — surface that failure so the error reflects what is
  // actually drawn. `lastError` was build-only, so a sample that made `evaluate` fail left it null with
  // the figure silently gone.
  // #855: the accusation is degraded ONCE, here, so `lastError` (the banner) and the per-row status
  // below can never disagree about whose fault the failed sample was.
  const seedErr = e.ok ? '' : sampledConfigError(e.error, e.violated, figure);
  if (!e.ok && !lastError) lastError = seedErr;
  // #360 ([ADR-398](docs/06-decisions.md#adr-398)): attribute a PER-SEED evaluate failure to the fact
  // rows that own the violated constraint / stuck object. `status` came from the seed-independent fold
  // (which is what keeps the ADR-280 memo sound), so a seed where a stated given cannot hold used to show
  // EVERY row green while the banner said the opposite — the step list read `status` as "does this step
  // HOLD in the figure I'm looking at" and the data only ever answered "did it APPLY at fold time"
  // (App.tsx's own contract: "the step list and the error banner must tell the truth about what just
  // happened"). The override lives here, in the tail, where the per-seed truth is discovered; the fold's
  // memoized statusByIndex is never touched. The row shows the SAME error string a fold-time failure
  // would (the operator's taste ruling): to the student, "this given cannot hold in the configuration
  // being attempted" reads identically in both cases.
  if (!e.ok) {
    const owners = new Set<number>();
    for (const con of e.violated ?? []) {
      const fi = fold.ownerByConKey?.get(constraintKey(con)); // `?.` — a node cloned from a pre-ADR-398 worker bundle lacks the maps
      if (fi !== undefined) owners.add(fi);
    }
    for (const id of e.stuckIds ?? []) {
      const fi = fold.ownerByObjId?.get(id);
      if (fi !== undefined) owners.add(fi);
    }
    for (const fi of owners) {
      const f = facts[fi];
      if (f && f.enabled && status[f.id] === 'ok') status[f.id] = seedErr;
    }
  }
  // #474: a stated magnitude labels from the FACT, not only from a SURVIVING constraint.
  //
  // The constraint pass below is the original source, and it silently loses every given the solver
  // CONSUMES. When a stated angle drives a free DOF — «ריבוע ABCD» / «נקודה G על AD» / «זווית GBA = 37»,
  // G sliding along AD until the angle holds — no `angle` constraint remains in the resolved figure, so
  // the value that shaped the whole drawing was the one value the drawing would not show. That breaks the
  // honesty invariant "everything the student stated is visible on the figure", and it broke it on this
  // product's flagship interaction.
  //
  // Sourced exactly like the angle MARK below (facts, `status === 'ok'`), which is why the wedge was drawn
  // but bare — mark from the fact, value from the constraint. `fillOnly` keeps a symbolic label ("2α",
  // an alias name) ahead of the raw number, so this only ever fills a gap.
  for (const fi of fold.iterOrder) {
    const f = facts[fi];
    if (status[f.id] !== 'ok') continue;
    const c = f.cmd;
    if (c.type === 'set-angle') {
      const text = `${fmtMeasure(c.value)}°`;
      if (c.arcOf) {
        const k = `${c.arcOf}:${[c.ray1, c.ray2].sort().join('')}`;
        if (!arcByKey.has(k)) arcByKey.set(k, { circle: c.arcOf, a: c.ray1, b: c.ray2, text });
      } else {
        addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-angle', vertex: c.vertex, ray1: c.ray1, ray2: c.ray2 }, text, true);
      }
    } else if (c.type === 'set-distance') {
      addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-length', a: c.a, b: c.b }, fmtMeasure(c.value), true);
    }
  }
  // Numeric measures (a plain `AB = 5` / `∠ABC = 37`, and symbolic ones once resolved)
  // surface as distance/angle constraints — label them from the figure, filling any
  // key a symbolic fact didn't already own (FR-RN-2).
  for (const con of figure.constraints) {
    if (con.type === 'distance') addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-length', a: con.a, b: con.b }, fmtMeasure(con.value), true);
    else if (con.type === 'angle') {
      // An ARC measure (ADR-335): the value prints ON the arc — never at the (often hidden) centre vertex.
      if (con.arcOf) arcByKey.set(`${con.arcOf}:${[con.ray1, con.ray2].sort().join('')}`, { circle: con.arcOf, a: con.ray1, b: con.ray2, text: `${fmtMeasure(con.value)}°` });
      else addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-angle', vertex: con.vertex, ray1: con.ray1, ray2: con.ray2 }, `${fmtMeasure(con.value)}°`, true);
    }
    else if (con.type === 'area') addMeasureLabel(lenByKey, angByKey, areaByKey, { type: 'measure-area', ids: con.ids }, fmtMeasure(con.value), true);
  }
  const labels: MeasureLabels = { lengths: [...lenByKey.values()], angles: [...angByKey.values()], areas: [...areaByKey.values()], arcs: [...arcByKey.values()] };
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
    const markCmd = f.cmd.type === 'right-triangle' ? { ...f.cmd, ids: rtEffectiveIds(f.cmd, rtReorder.get(f.id)) } : f.cmd;
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
  const violations = e.ok ? checkGivens(applied, e.positions, e.circles, figure) : [];
  // Free-radius circles the student can dial (base = stable seed radius for the slider range; current =
  // what's drawn). Read from the pre-seed construction so the range doesn't shift as the value changes.
  // Distinct points the geometry drove onto the same spot — allowed (not an error), surfaced as a notice
  // so the student knows two labels converged ([ADR-123](docs/06-decisions.md#adr-124)).
  const coincidences: [Id, Id][] = e.ok ? e.coincidences ?? [] : [];
  // ADR-423 tier 3 (#433): a reference the construction FORCES off the drawn ink — a diameter's far end
  // on a semicircle is always on the other half. Allowed, never a violation (flagging it would be
  // unsatisfiable), but said out loud, the way a forced coincidence is.
  const forcedOffArc: ForcedOffArc[] = e.ok ? forcedOffArcs(figure, e.positions, e.circles) : [];
  return { construction: figure, positions: e.ok ? e.positions : new Map(), circles: e.ok ? e.circles : new Map(), status, lastError, pending, labels, angleMarks, violations, coincidences, forcedOffArc };
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
 * Partition ONE fact's lowered commands into APPLY UNITS ([ADR-338](docs/06-decisions.md#adr-338), #166):
 * a maximal run of consecutive RELATION commands is ONE coupled unit, everything else applies alone.
 *
 * A macro's defining constraints are one figure, not N independent statements (`inscribe`'s square is
 * `|DE|=|EF| ∧ |EF|=|FG| ∧ |FG|=|GD| ∧ GD⟂DE`), and applying them one at a time evaluates — i.e. MOVES the
 * figure — between each, so the last is asked to hold from a basin the earlier ones already committed to.
 * Grouped, they reach `evaluate` together and are solved jointly (`applyCoupledStep`).
 *
 * The RUN rule is structural and conservative, not an inscribe special case: it uses the same
 * `isRelationCommand` predicate as the ADR-104 deferral, degenerates to today's behaviour everywhere a fact
 * carries at most one constraint (a plain given, «AB ⟂ CD» → segment+segment+⟂, every single-command fact),
 * and needs no marker threaded through the Command union. Interleaved creations naturally split runs, so a
 * macro that creates between constraints still applies those constraints separately — correct, since a
 * creation in between means they aren't a simultaneous system.
 */
function applyUnits(cmds: Command[]): Command[][] {
  const out: Command[][] = [];
  for (const c of cmds) {
    const last = out[out.length - 1];
    if (isRelationCommand(c) && last && isRelationCommand(last[last.length - 1])) last.push(c);
    else out.push([c]);
  }
  return out;
}

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
  // #420 (ADR-417): a PROVEN metric contradiction is never "waiting for more givens". The flex probe
  // below asks whether the residual MOVES, which is not whether it can reach ZERO — on «AB=4, BC=4,
  // AC=9» the free radius and placement do move |AC|, so the impossibility was reported as a pending
  // info state. Where impossibility is provable, say so.
  if (metricImpossibility(probe.constraints)) return false;
  return newCons.some((con) => {
    const vals: number[] = [];
    for (const s of [0, 1, 2, 3, 4]) {
      const e = evaluate(applySeed(cur, s));
      if (e.ok) {
        // A constraint referencing a point the figure never defined cannot be flex-probed — skip the
        // sample instead of crashing (`residual` would read a missing position). Such a constraint then
        // reads as NOT pending, so its failure surfaces as the honest hard error it is (ADR-236).
        if (constraintRefs(con).some((id) => !e.positions.has(id))) continue;
        const get = (id: Id) => e.positions.get(id)!;
        let r = residual(con, get);
        // #560 (the #420 lesson, ORDER edition): a one-sided REGION residual is SCALE-proportional by
        // construction (`collinear-order` ∝ the line span), so on any figure with a size DOF the raw
        // residual flexes while the VIOLATION FRACTION is invariant — «ישר ABE» over E = mid(AB) read
        // as "pending" though the stated order is impossible in every configuration. Probe the order
        // family by its RELATIVE residual (the ADR-033 Am.1 convention the solver itself minimises);
        // the metric families keep the raw probe untouched (the ADR-104 deferral bet is theirs).
        if (isOrderConstraint(con)) r /= Math.max(constraintScale(con, get), 1e-9);
        if (Number.isFinite(r)) vals.push(r);
      }
    }
    return vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 0.05; // the relation flexes ⇒ pending
  });
}

/**
 * Should a cleanly-parsed statement that FAILED against the current figure be COMMITTED as a deferred
 * constraint (the ADR-104 bet: later givens will pin the figure and the retry will satisfy it) — or
 * refused honestly right now? This is the SAME gate `classify` applies after replay
 * (`hasDeferrableConstraint` + `constraintIsPending`), exported so the App's submit route and the
 * classifier can never diverge (issue #207 / ADR-385 — the route used to consult only the first half,
 * committing a CONCLUDED contradiction as «waiting for givens»: the quarter-circle whose |OC|=|OD| is
 * structurally impossible landed as a parked deferred-constraint instead of the honest refusal).
 */
export function deferralWorthwhile(facts: Fact[], commands: AnyCommand[]): boolean {
  if (!hasDeferrableConstraint(commands)) return false;
  const symtab = buildSymTab([...facts.filter((f) => f.enabled).map((f) => f.cmd), ...commands]);
  const lowered = commands.flatMap((c) => lowerOne(c, symtab)) as Command[];
  return constraintIsPending(replay(facts).construction, lowered);
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
export function extensionsClear(facts: Fact[], fig: Derived, relax = false): boolean {
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

/** The infinite-line crossing params of segments a–b and c–d over a positions map (t1 along a–b, t2 along
 *  c–d), or null when the lines are parallel or an endpoint is unplaced. */
function crossParamsAt(posn: Map<Id, Vec>, a: Id, b: Id, c: Id, d: Id): { t1: number; t2: number } | null {
  const pa = posn.get(a), pb = posn.get(b), pc = posn.get(c), pd = posn.get(d);
  if (!pa || !pb || !pc || !pd) return null;
  const den = (pb.x - pa.x) * (pd.y - pc.y) - (pb.y - pa.y) * (pd.x - pc.x);
  if (Math.abs(den) < 1e-12) return null;
  return {
    t1: ((pc.x - pa.x) * (pd.y - pc.y) - (pc.y - pa.y) * (pd.x - pc.x)) / den,
    t2: ((pc.x - pa.x) * (pb.y - pa.y) - (pc.y - pa.y) * (pb.x - pa.x)) / den,
  };
}

/**
 * Does every point-free CROSSING statement («CD חותך את AB» with no point named — `segments-cross`,
 * issue #241 / [ADR-383](docs/06-decisions.md#adr-383)) hold — the two segments cross WITHIN both spans?
 * The ADR-166 bar without a named point: the same strict margin as {@link intersectionsWithinSegments},
 * computed from the operands' own endpoints since there is no crossing point to read. A still-unplaced
 * operand (pending figure) is a different failure mode, skipped here.
 */
export function segmentsCrossWithin(facts: Fact[], posn: Map<Id, Vec>, margin = WITHIN_MARGIN): boolean {
  for (const f of facts) {
    const cmd = f.cmd;
    if (!f.enabled || cmd.type !== 'segments-cross') continue;
    if (![cmd.a, cmd.b, cmd.c, cmd.d].every((id) => posn.has(id))) continue; // pending — skip
    const t = crossParamsAt(posn, cmd.a, cmd.b, cmd.c, cmd.d);
    if (!t || t.t1 < margin || t.t1 > 1 - margin || t.t2 < margin || t.t2 > 1 - margin) return false;
  }
  return true;
}

/** The reflection mask (over {@link reflectableFreePoints}) that mirrors exactly the apex free points whose
 *  on-segment meet currently lands off the segment — the targeted first guess for the reflection search. */
function reflectMaskForFailing(fig: Derived, facts: Fact[] = []): number {
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
  // The point-free crossing statement (`segments-cross`, ADR-383) has the same discrete apex DOF —
  // a currently-failing one blames its own operand endpoints, exactly like a named `onSeg` meet.
  for (const f of facts) {
    const cmd = f.cmd;
    if (!f.enabled || cmd.type !== 'segments-cross') continue;
    if (!segmentsCrossWithin([f], fig.positions)) for (const id of [cmd.a, cmd.b, cmd.c, cmd.d]) culprits.add(id);
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
 * The budget for a config search that runs OFF the main thread in the geometry worker (issue #87 /
 * [ADR-296](docs/06-decisions.md#adr-296)). `SEARCH_BUDGET_MS` (2500) was sized to protect the MAIN
 * THREAD from the page-unresponsive dialog (E2); since ADR-290 the searches (`resample` / `autoResolve` →
 * `findValidConfig`) run in the worker, where the tab never blocks and the UI already shows a "thinking"
 * state (resample also has progress + a ✕ cancel). So the worker gets a generous budget — a findable
 * configuration on a heavy figure (the CEFO figure's `findValidConfig` returned null cold at ~2743 ms,
 * one bad seed past 2500) is now found on the FIRST submit instead of only after an idempotent re-submit
 * warmed the worker's caches. Finite (not ∞) so the same value is meaningful when a test passes it
 * explicitly; the worker is never instantiated under vitest (no `Worker`/`document`), so the main-thread
 * sync fallback keeps `SEARCH_BUDGET_MS`. */
export const WORKER_SEARCH_BUDGET_MS = 12_000;

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
/**
 * #194 (ADR-474) — the DISPLAY-QUALITY preference, as a predicate over an already-computed figure.
 *
 * A drawing that meets every stated requirement can still be unreadable: on the Q9 two-circle figure
 * about half the seeds place A within ~2° of the secant, so ∠ACE draws at 0.8°. This asks whether the
 * figure in hand is legible, and it is consulted only as a PREFERRED tier — never as a gate. A figure
 * whose givens force a small wedge fails it at every seed, and every caller falls through to today's
 * behaviour, because a valid configuration must stay drawable (ADR-052).
 */
const spreadOk = (fig: Derived): boolean => fig.lastError === null && wellSpread(fig.construction, fig.positions);

/**
 * #194 (ADR-474) — how legible this drawing is, as a number: the tightest wedge anywhere in it.
 *
 * MEASURED on the Q9 figure the issue was filed on (ADR-474): seeds 0–15 range from 0.16° to 5.80° and
 * NONE clears the 7° bar, so a pass/fail preference alone would have found nothing to prefer in that
 * band and returned the 1.29° drawing; the sweep does reach a legible seed at 24 (10.26°). Ranking is
 * what makes the tier honest in between — and it is the whole answer for a figure that has no legible
 * configuration at all, where "best available" is the only improvement available.
 * So the tier is: take the first candidate that clears the bar; failing that, take the BEST one seen.
 */
const spreadScore = (fig: Derived): number => (fig.lastError === null ? tightestWedge(fig.construction, fig.positions) : -1);

/** How many extra candidates a sweep may examine purely to improve spread, once it already holds an
 *  acceptable answer. Bounds the cost the preference can add to a figure that has no legible
 *  configuration — it never searches longer than this beyond the seed it would have returned. */
const SPREAD_EXTRA_TRIES = 24;

export function firstSatisfyingSeed(facts: Fact[], from = 0, budget = 120, budgetMs = SEARCH_BUDGET_MS): number {
  const deadline = Date.now() + budgetMs;
  const hasExt = extensionTriples(facts).length > 0;
  const base0 = replay(facts, from);
  const reflectable = reflectableFreePoints(base0.construction);
  const hasOnSeg = base0.construction.objects.some((o) => o.kind === 'line-line-intersection' && (o.onSeg || o.onSeg1 || o.onSeg2));
  // The point-free crossing statement (`segments-cross`, issue #241 / ADR-383) is the same discrete
  // requirement as a named `onSeg` meet — it joins every bar and the reflection search below.
  const hasCross = facts.some((f) => f.enabled && f.cmd.type === 'segments-cross');
  // #194 (ADR-474): NO new search is opened here. With no discrete requirement this function does one
  // replay and returns, exactly as before — the spread preference rides only the sweeps that already
  // exist (below, and in `findValidConfig`/`searchResample`), so a figure that draws fine never pays
  // for the preference and a figure that does not is re-seeded by the auto-resolver that already runs.
  if (!hasExt && !hasOnSeg && !hasCross) return from; // nothing to satisfy → keep the seed
  const ok = (fig: Derived) => fig.lastError === null && extensionsClear(facts, fig) && intersectionsWithinSegments(fig) && segmentsCrossWithin(facts, fig.positions);
  // The ADR-142 acceptance bar: a SHARED-ENDPOINT extension counts on EITHER side (see extensionsClear).
  const okRelaxed = (fig: Derived) => fig.lastError === null && extensionsClear(facts, fig, true) && intersectionsWithinSegments(fig) && segmentsCrossWithin(facts, fig.positions);
  // #194 (ADR-474): the current view is kept only when it is BOTH satisfying and legible — otherwise it
  // is remembered as the strict fallback and the sweep looks for one that is also well spread.
  if (ok(base0) && spreadOk(base0)) return from;
  // Candidate seeds in priority order. When a segment-meet is off its segment the cause is almost always an
  // apex pointing the wrong way, which plain re-seeding rarely fixes — so try the REFLECTION seeds first
  // (targeted mask = mirror exactly the failing apexes, then the other non-empty subsets), each over a small
  // band of continuous seeds (the apex flips inward, the seed varies the rest of the shape so the crossing
  // lands cleanly inside). Then the plain seeds (extensions; also an on-seg figure fixable by re-seed alone).
  const seeds: number[] = [];
  if ((hasOnSeg || hasCross) && reflectable.length > 0) {
    const targeted = reflectMaskForFailing(base0, facts);
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
  // #194 (ADR-474): the STRICT-but-squashed fallback — the seed today would have returned. Recorded
  // while sweeping (ADR-267: one interleaved pass, never a second) so the preference costs no extra
  // replay: tier 1 is strict AND well spread, tier 2 is strict (today), tier 3 the relaxed fallback.
  let strictOnly = ok(base0) ? from : -1;
  let strictOnlyScore = strictOnly >= 0 ? spreadScore(base0) : -1;
  let sinceStrict = 0; // candidates examined since the first acceptable answer (SPREAD_EXTRA_TRIES)
  // The same deadline is ARMED inside the solve ladder (engine/solveBudget.ts): the between-replay check
  // below caps the sweep, and the in-ladder consult caps a single pathological candidate (issue #59 —
  // one replay used to blow through 32 budgets before this line ever ran again).
  return withSolveBudget(deadline, () => {
    for (const s of seeds) {
      if (Date.now() > deadline) break; // out of budget — settle for the best seen so far
      if (strictOnly >= 0 && ++sinceStrict > SPREAD_EXTRA_TRIES) break; // bounded improvement, then settle
      const fig = replay(facts, s);
      if (ok(fig)) {
        if (spreadOk(fig)) return s; // tier 1 — satisfying AND legible: nothing can beat it, stop here
        // tier 2 — satisfying but tight. Keep the LEAST tight one seen (see spreadScore): on a figure
        // with no legible configuration this is the difference between a 5.8° drawing and a 0.16° one.
        const sc = spreadScore(fig);
        if (strictOnly < 0 || sc > strictOnlyScore) {
          strictOnly = s;
          strictOnlyScore = sc;
        }
      }
      if (fallback < 0 && okRelaxed(fig)) fallback = s;
    }
    // Past the sweep or the deadline: settle for the best tier seen, exactly as before the preference
    // existed. A figure with no well-spread configuration lands on the same seed it used to.
    return strictOnly >= 0 ? strictOnly : fallback >= 0 ? fallback : from;
  });
}

/** Branchable derived-point command types — the discrete "alternatives" a figure can have (which of two
 *  intersections, which arc side, which extension root). */
const BRANCHABLE = new Set<AnyCommand['type']>(['point-by-distances', 'arc-midpoint', 'line-circle-intersection', 'circle-circle-intersection', 'point-on-segment']);

/**
 * THE SAMPLED-VALUE GUARD (#855, [ADR-476](docs/06-decisions.md#adr-476)) — the 2-D port of the 3-D
 * `plane-not-determined` class ([ADR-3D-138](docs/06b-decisions-3d.md), #508/#512).
 *
 * A per-seed evaluate failure can NEVER be a contradiction of the student's givens, and the proof is
 * structural rather than statistical: this seam only ever overrides rows the FOLD marked `ok`, so a
 * configuration in which every one of them holds demonstrably exists. What failed is the tool's own
 * sample of the DOFs nothing drives — «over-constrained: @ctr-OB ⟂ AB cannot hold» is therefore an
 * accusation aimed at a given that is perfectly satisfiable, on the strength of a placement the tool
 * invented (the honesty rule pointed the wrong way, docs/17 §7).
 *
 * So the accusing shape degrades to an honest "not determined yet", NAMING the sampled objects the
 * conflict is really with. Which objects those are is read by a STRUCTURAL walk — `constraintRefs`
 * over the violated constraint, intersected with {@link freeDofs} — and never by a switch over
 * constraint kinds: an enumeration of the kinds that existed today is exactly what ADR-3D-138 warns a
 * later kind would quietly escape.
 *
 * Only the `over-constrained` shape is substituted (the same discipline as `blameNewStatement`): a
 * dependency or unknown-point error is not an accusation and stays verbatim.
 */
function sampledConfigError(error: string, violated: Constraint[] | undefined, figure: Construction): string {
  const m = /^over-constrained: (.+) cannot hold$/.exec(error);
  if (!m) return error;
  const sampled = new Set(freeDofs(figure));
  const names: string[] = [];
  for (const con of violated ?? [])
    for (const id of constraintRefs(con)) if (sampled.has(id) && !names.includes(id)) names.push(id);
  return names.length
    ? `not determined: ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} still free, so ${m[1]} cannot be judged in this configuration`
    : `not determined: ${m[1]} cannot be judged in this configuration`;
}

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
    // #345 (ADR-397): a configuration in which a COMMITTED step did not hold is not displayable.
    // This predicate judged the geometry (orders, sides, convexity) and the verifier's violations, but
    // never asked the most basic question — does the figure satisfy its own commands? So a seed where a
    // stated given settled `over-constrained` was still offered to the student by "show another
    // configuration", with the given silently not applying. The cross-seed escape class
    // (ADR-085/098/127/166), one level up: not a requirement the sampler forgot, but the step statuses
    // themselves. A disabled fact is not part of the figure, so it is exempt by definition.
    facts.every((f) => !f.enabled || fig.status[f.id] === 'ok') &&
    fig.violations.length === 0 &&
    // relaxExtensions: the ADR-142 acceptance bar for a config `firstSatisfyingSeed` returned as its
    // shared-endpoint FALLBACK — the letter-order side is unachievable, so either extension counts
    // (issue #19: `findValidConfig` used to strictly reject the very seed the fallback found).
    extensionsClear(facts, fig, relaxExtensions) &&
    intersectionsWithinSegments(fig) &&
    segmentsCrossWithin(facts, fig.positions) &&
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
/** #566 (ADR-445 Am. 1) — dev instrumentation, the S0.2 `lastLadderStage` pattern: WHICH tier of
 *  `findValidConfig` produced the last returned config. Lets a test assert the tier ORDERING
 *  deterministically — a wall-clock assertion on the real worker budget flaked at 28 s under the
 *  suite's CPU contention (5 s solo), which is exactly why `SEARCH_BUDGET_MS` is Infinity in tests. */
export let lastConfigTier: 'current' | 'relaxed' | 'sweep' | 'seat' | 'reflect' | 'branch' | null = null;

export function findValidConfig(facts: Fact[], fromSeed = 0, budgetMs = SEARCH_BUDGET_MS): { facts: Fact[]; seed: number } | null {
  lastConfigTier = null;
  const deadline = Date.now() + budgetMs;
  const timeLeft = () => Math.max(0, deadline - Date.now());
  // First the targeted extension/reflection search (ADR-098/ADR-166): it explores the discrete apex
  // REFLECTION DOF (high seed bits) that the plain seed sweep below can't reach, so a segment-meet whose
  // apex points the wrong way is brought onto the segments in a handful of tries instead of by luck.
  const s0 = firstSatisfyingSeed(facts, fromSeed, 120, timeLeft());
  // #194 (ADR-474): a requirement-meeting config that draws a squashed wedge is REMEMBERED rather than
  // returned — the sweep below gets a chance to find one that is also legible, and this seed is what it
  // settles for when none exists. Behaviour is therefore identical on every figure that has no
  // better-spread configuration, which is the ADR-052 guarantee: valid stays drawable.
  let meetingOnly: number | null = null;
  let meetingScore = -1;
  if (meetsRequirements(facts, s0)) {
    const fig0 = replay(facts, s0);
    if (spreadOk(fig0)) {
      lastConfigTier = 'current';
      return { facts, seed: s0 };
    }
    meetingOnly = s0;
    meetingScore = spreadScore(fig0);
  }
  // ADR-142 acceptance (issue #19 / ADR-267): `firstSatisfyingSeed` may have returned its shared-endpoint
  // FALLBACK — every seed it examined failed the strict extension direction, so the RELAXED bar is the right
  // validity test for s0. Checked BEFORE the strict sweep/branch tiers: when s0 is a fallback those tiers are
  // provably futile on the extension bar (the sweep re-covers seeds firstSatisfyingSeed already rejected),
  // and their cold replays would burn the remaining budget and bail to null past the very config in hand —
  // the exact starvation this ADR removes. When s0 simply failed OTHER requirement dimensions (violations,
  // convexity, distinctness), the relaxed check fails identically and the tiers below run as before.
  if (meetsRequirements(facts, s0, true)) {
    lastConfigTier = 'relaxed';
    return { facts, seed: s0 };
  }
  // The deadline is also ARMED inside the solve ladder (engine/solveBudget.ts, issue #59): the branch
  // tier below builds NEW fact content (branch rewrites), whose folds can hit the expensive recruit
  // ladder — the between-replay checks alone couldn't stop a single 30 s candidate.
  return withSolveBudget(deadline, () => {
    for (let s = fromSeed; s < fromSeed + 40; s++) {
      if (Date.now() > deadline) {
        // #194: out of budget — a remembered meeting-but-squashed config still beats amber.
        if (meetingOnly !== null) {
          lastConfigTier = 'current';
          return { facts, seed: meetingOnly };
        }
        return null; // caller keeps the current figure, amber
      }
      if (meetsRequirements(facts, s)) {
        const fig = replay(facts, s);
        if (spreadOk(fig)) {
          lastConfigTier = 'sweep';
          return { facts, seed: s };
        }
        // #194: no legible configuration yet — hold the LEAST tight one seen, which is today's answer
        // when the sweep never improves on it.
        const sc = spreadScore(fig);
        if (meetingOnly === null || sc > meetingScore) {
          meetingOnly = s;
          meetingScore = sc;
        }
      }
    }
    // #194: the sweep found nothing better-spread — return what today would have returned.
    if (meetingOnly !== null) {
      lastConfigTier = meetingOnly === s0 ? 'current' : 'sweep';
      return { facts, seed: meetingOnly };
    }
    // #566 (ADR-445, ordering per Am. 1): the RIGHT-ANGLE-SEAT dimension. «משולש ישר זווית ABC»
    // leaves WHICH vertex is right unstated — the lowering defaults to the last id, and ADR-163
    // yields it only to an explicit 90° statement. A later constraint can leave the DEFAULT seat
    // satisfiable only DEGENERATELY (the #566 figure: with ∠C=90 the hypotenuse AB is a diameter, so
    // «קשת AB = קשת BC» forces C onto A — every seed fails pointsDistinct) while another seat admits
    // a real figure. An unstated choice is a discrete config dimension (ADR-052; the ADR-426
    // reflection precedent): try the alternative seats via the solve-chosen `rot` field, returning
    // REWRITTEN facts exactly like the branch tier below. A seat pinned by an explicit 90° (the
    // ADR-163 channel, same pin set) is never flipped.
    //
    // This tier runs BEFORE the reflection tier (ADR-445 Am. 1): a seat-caused failure is
    // seed/mask-INVARIANT (the #566 collapse fails at every seed and every mask), so the mask×seed
    // product — the budget hog on multi-free-point figures — can never rescue it and would eat the
    // worker's 12 s before this tier ran (measured: the rescue arrived at ~13.4 s ordered after,
    // ~5 s ordered here; the suite's Infinity budget masked exactly this, which is why the
    // production-budget lock in scenarios-props-budget.test.ts carries the figure). Cost when no
    // unpinned right-triangle exists: zero (the list is empty).
    const pinnedRA = explicitRightAngleVerts(facts);
    const rtFacts = facts
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.enabled && f.cmd.type === 'right-triangle' && !f.cmd.ids.some((id) => pinnedRA.has(id)))
      .slice(0, 2); // bound the combinatorics, like the branch tier
    for (const { f, i } of rtFacts) {
      const cur = (f.cmd as { rot?: 1 | 2 }).rot ?? 0;
      for (const rot of ([1, 2, 0] as const).filter((r) => r !== cur)) {
        const fc = facts.map((g, idx) => {
          if (idx !== i) return g;
          const { rot: _prev, ...rest } = g.cmd as Extract<typeof g.cmd, { type: 'right-triangle' }>;
          return { ...g, cmd: rot === 0 ? rest : { ...rest, rot } } as Fact;
        });
        for (let s = 0; s < 6; s++) {
          if (Date.now() > deadline) return null;
          if (meetsRequirements(fc, s)) {
            lastConfigTier = 'seat';
            return { facts: fc, seed: s };
          }
        }
      }
    }
    // Discrete REFLECTION alternatives (#441). The sweep above varies only the CONTINUOUS jitter — the
    // base seed — while the reflection mask lives in the seed's HIGH bits (`REFLECT_STRIDE`). So a
    // requirement that needs a MIRROR configuration is unreachable by that sweep however many seeds it
    // burns: a stated-concave kite has ~2% of raw seeds satisfying it (measured), purely the ones whose
    // high bits happen to be set. `firstSatisfyingSeed` does explore masks, but it judges only the
    // extension/segment bars, not the full requirement set — so nothing was searching this dimension
    // against `meetsRequirements`. General, not convexity-specific: the ADR-166 apex-side family gains
    // the same coverage.
    const reflectable = reflectableFreePoints(replay(facts).construction).length;
    for (let m = 1; m < 1 << Math.min(reflectable, REFLECT_MAX); m++) {
      for (let s = fromSeed; s < fromSeed + 6; s++) {
        if (Date.now() > deadline) return null;
        const sm = withReflectMask(m, s);
        if (meetsRequirements(facts, sm)) {
          lastConfigTier = 'reflect';
          return { facts, seed: sm };
        }
      }
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
      for (let s = 0; s < 6; s++)
        if (meetsRequirements(fc, s)) {
          lastConfigTier = 'branch';
          return { facts: fc, seed: s };
        }
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
export function searchResample(facts: Fact[], seed: number, onProgress?: (k: number, n: number) => void, budgetMs = SEARCH_BUDGET_MS): number | null {
  const cur = replay(facts, seed);
  if (freeDofs(cur.construction).length === 0) return null; // fully determined — nothing to vary
  const curFp = shapeFingerprint(cur.construction, cur.positions);
  let s = seed;
  const deadline = Date.now() + budgetMs;
  const curStrict = meetsRequirements(facts, seed);
  let fallback = -1;
  /** #194: the first requirement-meeting but squashed candidate — the answer when nothing better shows. */
  let squashed = -1;
  for (let k = 0; k < 24 && Date.now() <= deadline; k++) {
    onProgress?.(k + 1, 24);
    s += 1;
    const r = withSolveBudget(deadline, () => replay(facts, s));
    // Accept only a view that MEETS EVERY REQUIREMENT — the SAME bar the initial display uses — AND is a
    // genuinely DIFFERENT drawing (see the class notes above; the Q8 two-right-triangles lock).
    if (!shapeDiffers(curFp, shapeFingerprint(r.construction, r.positions))) continue;
    if (meetsRequirements(facts, s)) {
      // #194 (ADR-474): «הצג תצורה אחרת» prefers a legible alternative, per press. A squashed-but-valid
      // candidate is remembered, not discarded — when the valid family is ONLY squashed the student must
      // still be able to reach it (ADR-052), so it is what this press returns.
      if (spreadOk(r)) return s;
      if (squashed < 0) squashed = s;
      continue;
    }
    if (!curStrict && fallback < 0 && meetsRequirements(facts, s, true)) fallback = s;
  }
  return squashed >= 0 ? squashed : fallback >= 0 ? fallback : null;
}

/** The command types whose `branch` a student can cycle — shared by `cycleAlt` and the composite
 *  view search so the two can never drift (the ADR-043 list-drift class). */
export const BRANCH_CYCLE_KINDS = new Set(['point-by-distances', 'arc-midpoint', 'line-circle-intersection', 'circle-circle-intersection', 'point-on-segment']);

/**
 * The "show another configuration" search over the COMPOSITE view — facts × seed × branch × variant —
 * validated as a WHOLE ([ADR-340](docs/06-decisions.md#adr-340), issue #175).
 *
 * The App used to validate only the SEED (via `searchResample`) and then apply `cycleAlt`/`cycleVariant`
 * on top unvalidated — so a figure that was green and satisfied its givens could be silently turned into
 * one that contradicts them by the very button whose contract is "show me another VALID drawing" (ADR-018).
 * Here every candidate IS the final view: a discrete branch/variant step composed with a seed, accepted
 * only when `meetsRequirements` holds on the resulting facts + seed. The caller applies the returned
 * composite via ONE `applyView` — no post-hoc mutation exists to invalidate it.
 *
 * Candidate order preserves the button's intent ("explore the WHOLE configuration space"): the
 * everything-advances composite first (branch+1 & variant+1 & fresh seed — what the old path always
 * applied), then single discrete steps (walking further around a cycle so an invalid neighbour never
 * strands the rest of the family), then the plain seed resample (`searchResample`, shape-diff gated).
 * A discrete step is inherently a different drawing, so it needs no fingerprint check. The ADR-267
 * ladder is kept: strict-valid wins; a relaxed-valid composite is a fallback offered only when the
 * CURRENT view itself is not strict-valid. Returns null when nothing in budget qualifies — the caller
 * keeps the current view ("only configuration"), never applies an unvalidated one.
 */
export function searchAnotherView(
  facts: Fact[],
  seed: number,
  onProgress?: (k: number, n: number) => void,
  budgetMs = SEARCH_BUDGET_MS,
): { facts: Fact[]; seed: number } | null {
  const deadline = Date.now() + budgetMs;
  const cur = replay(facts, seed);
  const branchId = firstCyclableBranch(cur.construction);
  const nBranch = branchId ? Math.max(1, branchCount(cur.construction, branchId)) : 1;
  const variantFact = facts.find((f) => f.enabled && cyclableVariant(f.cmd));
  const nVariant = variantFact ? variantCountOf(variantFact.cmd) : 1;
  const hasDofs = freeDofs(cur.construction).length > 0;
  const curStrict = meetsRequirements(facts, seed);
  // #569 (ADR-445 remainder): the RIGHT-ANGLE SEAT is a discrete configuration dimension too, and
  // «הציגו תצורה אחרת» could not reach it. `findValidConfig`'s seat tier rescues a figure whose
  // DEFAULT seat is unsatisfiable, but that is a post-commit repair the student never asked for; the
  // seat is an unstated choice, and ADR-052's cyclable-choice doctrine says an unstated choice must be
  // reachable ON PURPOSE. Same pin set as the search tier (`explicitRightAngleVerts`), so a seat the
  // student stated with an explicit 90° is never cycled out from under them.
  const seatFact = facts.find(
    (f) => f.enabled && f.cmd.type === 'right-triangle' && !f.cmd.ids.some((id) => explicitRightAngleVerts(facts).has(id)),
  );
  const nSeat = seatFact ? 3 : 1; // rot ∈ {0,1,2} — which of the three vertices carries the angle

  // A candidate's fact rewrite — the SAME steps `cycleAlt`/`cycleVariant` would apply.
  const stepped = (b: number, v: number, r = 0): Fact[] =>
    facts.map((f) => {
      let cmd = f.cmd;
      if (b && f.enabled && branchId && BRANCH_CYCLE_KINDS.has(cmd.type) && 'id' in cmd && (cmd as { id?: Id }).id === branchId)
        cmd = { ...cmd, branch: ((((cmd as { branch?: number }).branch ?? 0) + b) % nBranch) } as AnyCommand;
      if (v && variantFact && f === variantFact) cmd = withVariant(cmd, ((((cmd as { variant: number }).variant ?? 0) + v) % nVariant));
      if (r && seatFact && f === seatFact) {
        const { rot: prev, ...rest } = cmd as Extract<AnyCommand, { type: 'right-triangle' }>;
        const next = (((prev ?? 0) + r) % nSeat) as 0 | 1 | 2;
        cmd = (next === 0 ? rest : { ...rest, rot: next }) as AnyCommand;
      }
      return cmd === f.cmd ? f : { ...f, cmd };
    });

  // Discrete combos: everything-advances first (the legacy intent), then each family walked fully.
  // The seat is walked LAST of the three: it reshapes the figure most drastically, so branch and
  // variant — the cycles a student is likelier to mean — are offered before it.
  const combos: [number, number, number][] = [];
  if (nBranch > 1 && nVariant > 1) combos.push([1, 1, 0]);
  for (let b = 1; b < nBranch; b++) combos.push([b, 0, 0]);
  for (let v = 1; v < nVariant; v++) combos.push([0, v, 0]);
  for (let r = 1; r < nSeat; r++) combos.push([0, 0, r]);

  let fallback: { facts: Fact[]; seed: number } | null = null;
  let k = 0;
  const total = combos.length * (hasDofs ? 4 : 1) + (hasDofs ? 24 : 0);
  for (const [b, v, r] of combos) {
    if (Date.now() > deadline) break;
    const fc = stepped(b, v, r);
    // Fresh seeds first (the legacy press resampled AND flipped), the current seed as the in-combo fallback.
    const seeds = hasDofs ? [seed + 1, seed + 2, seed + 3, seed] : [seed];
    for (const s of seeds) {
      if (Date.now() > deadline) break;
      onProgress?.(++k, total);
      if (withSolveBudget(deadline, () => meetsRequirements(fc, s))) return { facts: fc, seed: s };
      if (!curStrict && !fallback && withSolveBudget(deadline, () => meetsRequirements(fc, s, true))) fallback = { facts: fc, seed: s };
    }
  }
  // The plain seed resample (no discrete step) — shape-diff gated, existing semantics.
  if (hasDofs && Date.now() <= deadline) {
    const s = searchResample(facts, seed, (kk, n) => onProgress?.(Math.min(k + kk, total), Math.max(total, k + n)), Math.max(0, deadline - Date.now()));
    if (s !== null) return { facts, seed: s };
  }
  return fallback;
}

/** #85 ([ADR-293](docs/06-decisions.md#adr-293)) — is this derived state DRAWABLE? Positions exist and
 *  every coordinate is finite (a NaN reaches the isotropic fit as a NaN viewBox = a blank canvas with
 *  green statuses). The App keeps the last usable view when this is false (the never-blank principle). */
export function viewUsable(d: Derived): boolean {
  if (d.positions.size === 0) return false;
  for (const p of d.positions.values()) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  return true;
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
export function dryRunOutcome(facts: Fact[], commands: AnyCommand[], seed = 0): StepOutcome {
  // ALL THREE label kinds (#162): the gate predates ADR-118's `areas`, so a lone symbolic area label
  // («שטח משולש AFO הוא 9b» — correctly no constraint, ADR-031/118) counted as nothing and the
  // student's statement was swallowed as "already drawn". A diff, so an exact re-statement still nets 0.
  const labelCount = (l: MeasureLabels) => l.lengths.length + l.angles.length + l.areas.length;
  const before = replay(facts, seed);
  const all = trialFacts(facts, commands);
  const trial = all.slice(facts.length);
  const after = replay(all, seed);
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
  // A bare variable binding ("x = 4") legitimately draws nothing — it's data, not a silent fail. So is a
  // pure REQUIREMENT/DATA statement (issue #54/#99 play-test): a radius-symbol naming ("רדיוס מעגל O הוא
  // R"), a radius order ("R > r"), and a region/circle SIDE about an EXISTING point that already sits on
  // the stated side ("נקודה E בתוך משולש AKO" re-stated after E exists — zero coordinate delta, but the
  // record gates all future sampling; refusing it as "nothing to add" swallowed the student's statement,
  // the ADR-234 class). An EXACT duplicate of an enabled fact stays a friendly no-op — the statement
  // genuinely IS already on the figure.
  const REQUIREMENT_DATA = new Set(['radius-symbol', 'set-radius-order', 'point-polygon-side', 'point-circle-side', 'points-line-side', 'set-circle-position', 'segments-cross']);
  const enabledCmdList = facts.filter((f) => f.enabled).map((f) => f.cmd);
  const dataOnly =
    commands.length > 0 &&
    commands.every(
      (c) => c.type === 'set-var' || (REQUIREMENT_DATA.has(c.type) && !enabledCmdList.some((e) => deepEqual(e, c))),
    );
  // `name-center` REVEALS an existing circle's hidden centre — a visible change that adds no object/point
  // and moves nothing, so the geometry checks above miss it. It still "produced" (the centre now shows).
  const reveals = commands.some((c) => c.type === 'name-center' || c.type === 'show-circle');
  // A step that REDUCES the figure's free-DOF count took effect even with ZERO coordinate delta (#156 —
  // the ADR-234/272/273 honesty class, driven-parametric edition): «∠EOF=90» on square-side midpoints
  // seeded at t=0.5 already held at the seed (nothing moved) and drives via the carriers' `solve`
  // fields (no constraint object grew), so the given was swallowed as "already set" — and "show
  // another configuration" then resampled E,F independently and broke the angle. `freeDofCount`
  // already folds solve-directive DOF removals, so the before/after delta is the exact general
  // signal; a truly-vacuous re-statement removes no DOF (delta 0) and stays a friendly no-op.
  const dofReduced = freeDofCount(after.construction) < freeDofCount(before.construction);
  /**
   * #883 — a statement that fixes the figure's SCALE produced something, even with zero delta.
   *
   * The sibling of `dofReduced`, and the case it cannot see. `freeDofCount` counts freedom UP TO
   * SIMILARITY — correctly: two circles read 2 (centre distance and radius ratio), and a lone circle
   * reads 0 because its radius IS the gauge. So the FIRST absolute magnitude removes no similarity DOF
   * and the count is unmoved, though the figure has just gone from "determined up to scale" to
   * "determined".
   *
   * Normally the geometry moves and `grew` catches it. It does not when the stated value happens to
   * equal the sampled default — and the first unnamed circle's default radius is exactly 5, so
   * «רדיוס המעגל O הוא 5» moved nothing, registered as empty, and was reported «זה כבר קיים באיור»
   * with the given DROPPED (operator, playing round #878 T8). A stated magnitude vanished, and the
   * radius stayed free, so «הציגו תצורה אחרת» could then resize the circle the student had just fixed.
   *
   * `scalePinned` is the existing question (ADR-237: "a figure with no absolute given yet is determined
   * only up to SIMILARITY, so its FIRST size given is a statement about SCALE"), so this is a reuse
   * rather than a new rule — and it covers every first magnitude (a radius, a length, an area), not the
   * one value that happened to be reported.
   */
  const scaleFixed = !scalePinned(before.construction) && scalePinned(after.construction);
  if (grew || dofReduced || scaleFixed || dataOnly || reveals) return { produced: true };
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

const fmtMeasure = formatMeasure; // THE shared formatter (#164, ADR-393) — stated labels match derived at 2dp

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
export function variantConfigs(facts: Fact[]): Fact[][] {
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
let sampleMemo: { facts: Fact[]; key: string; constructions: Construction[]; samples: Map<Id, Vec>[] } | null = null;
/**
 * The sample sweep counter — the perf canary for the M3 "one sampler" law (the twin of
 * {@link foldStats}). A test can assert that N detection layers over one fact list cost ONE sweep.
 */
export const sampleStats = { sweeps: 0 };
/**
 * The memo is keyed by fact-list CONTENT, not array identity ([ADR-401](docs/06-decisions.md#adr-401)).
 * Identity was enough while every consumer lived on the main thread and shared the store's one facts
 * array; once the sweep runs in the geometry WORKER the facts arrive as a fresh structured CLONE per
 * message, so an identity check misses every time and each detection layer re-sampled the same figure
 * (~9 s each on the #157 figure). Content-keying is the same discipline {@link foldCache} already uses,
 * and it subsumes identity (a re-used array has the same content).
 */
function memoHit(facts: Fact[]): { constructions: Construction[]; samples: Map<Id, Vec>[] } | null {
  if (!sampleMemo) return null;
  if (sampleMemo.facts === facts) return sampleMemo;
  return sampleMemo.key === foldKey(facts) ? sampleMemo : null;
}
/**
 * Each sample's resolved circles, keyed by its OWN positions map (issue #228). A side table rather than a
 * parallel array on purpose: the pool then passes through `convergedSamples` → `distinctSamples` →
 * `requirementSamples` → the extension filters — each of which returns a SUBSET — without any alignment to
 * maintain. A positions map is a unique object, so the lookup survives every filter unchanged.
 */
const circlesOfSample = new WeakMap<Map<Id, Vec>, Map<Id, ResolvedCircle>>();
export function samplingJobs(facts: Fact[]) {
  const constructions = variantConfigs(facts).map((vf) => replay(vf, firstSatisfyingSeed(vf)).construction);
  const N = constructions.length === 1 && freeDofCount(constructions[0]) === 0 ? 1 : 16;
  const raw: Map<Id, Vec>[] = [];
  const jobs = constructions.flatMap((c) =>
    Array.from({ length: N }, (_, s) => () => {
      const r = evaluate(applySeed(c, s));
      if (r.ok) {
        raw.push(r.positions);
        circlesOfSample.set(r.positions, r.circles);
      }
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
    // Drop unforced point-collapse degeneracies before the requirement filter (ADR-295 / issue #50): a seed
    // where two independent points coincide only sometimes is not a configuration of the figure, and would
    // otherwise poison the ground-truth pool the relations/shapes layers share.
    // A point-free crossing statement (`segments-cross`, ADR-383) is fact-level like the extensions, so
    // its sample filter lives HERE (the store core), not in the object-level `requirementSamples`.
    const within = requirementSamples(c0, distinctSamples(c0, converged)).filter((pos) => segmentsCrossWithin(facts, pos));
    const strict = within.filter((pos) => extensionsClear(facts, { construction: c0, positions: pos } as Derived));
    const key = foldKey(facts);
    if (strict.length >= 2) return (sampleMemo = { facts, key, constructions, samples: strict });
    // The ADR-267 preference ladder: when the letter-order side is unachievable (no strict samples), the
    // RELAXED shared-endpoint bar (ADR-142) is the figure's real validity — filter by it before giving up
    // to the unfiltered converged pool (which would count wrong-side samples as configurations).
    const relaxed = within.filter((pos) => extensionsClear(facts, { construction: c0, positions: pos } as Derived, true));
    return (sampleMemo = { facts, key, constructions, samples: relaxed.length >= 2 ? relaxed : converged });
  };
  return { jobs, finish };
}
/**
 * Which crossings of the drawn ink are FORCED — present in EVERY valid configuration of the figure
 * ([ADR-380](docs/06-decisions.md#adr-380), issue #228; operator ruling 2026-07-21).
 *
 * "A dot is offered only if that intersection exists for sure." The renderer proposes candidates from the
 * ONE drawing on screen; this decides which of them are properties of the FIGURE rather than accidents of
 * the current seed. Without it, widening the pair-type universe would make the reported failure — a dot,
 * and the letter given to it, vanishing on "show another configuration" — strictly more frequent.
 *
 * The verdict is per OPERAND PAIR, by crossing COUNT: a pair is forced when it contributes the same
 * non-zero number of crossings in every sample. Matching individual roots across samples would be
 * unreliable — root labelling is not stable as a figure flexes — whereas the count is exactly the question
 * being asked ("do these two things still cross?"). A secant contributing 2 everywhere offers both dots; a
 * pair that is secant in one configuration and tangent or clear in another offers none.
 *
 * A STARVED pool withholds every dot (the operator's confirmed conservative call, following ADR-295's
 * printed-number rule): on an under-determined figure fewer than 4 valid samples cannot establish "in every
 * configuration", and offering a dot that later vanishes is precisely the harm. A determined figure
 * (`freeDofCount === 0`) has ONE configuration, so its single sample IS every configuration.
 */
export function forcedCrossingKeys(samples: { constructions: Construction[]; samples: Map<Id, Vec>[] }): Set<string> {
  const { constructions, samples: pool } = samples;
  const c0 = constructions[0];
  if (!c0 || !pool.length) return new Set();
  if (freeDofCount(c0) !== 0 && pool.length < 4) return new Set(); // starved → withhold (conservative)

  const perSample = pool.map((pos) => {
    const circles = circlesOfSample.get(pos) ?? new Map<Id, ResolvedCircle>();
    const drawn = drawnPointIds(c0, pos);
    const { infinite, trimmed } = resolveDrawnLines(c0, pos, circles, drawn);
    return crossingCounts(findInkCrossings(c0, pos, { lines: infinite, trimmed, circles: drawnCircles(c0, circles) }));
  });

  const forced = new Set<string>();
  for (const [key, n] of perSample[0]) {
    if (n > 0 && perSample.every((m) => m.get(key) === n)) forced.add(key);
  }
  return forced;
}

// Sample collection is budgeted like every other search loop (E2): a failing seed's solve costs ~10× a
// converging one (all restarts run to exhaustion) and is then DROPPED by convergedSamples anyway — on the
// ADR-123 heavy figure the unbudgeted loop was ~50 s of mostly-discarded work. Past the deadline, detection
// proceeds on the samples in hand (a smaller ground-truth pool — `samplesUsed` reports it); the FIRST job
// always runs so there is never an empty pool for a buildable figure. Tests run deadline-free (E2).
const SAMPLE_BUDGET_MS: number = import.meta.env?.MODE === 'test' ? Number.POSITIVE_INFINITY : 5000;
export function sharedSamples(facts: Fact[]): { constructions: Construction[]; samples: Map<Id, Vec>[] } {
  const hit = memoHit(facts);
  if (hit) return hit;
  sampleStats.sweeps++;
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
// `sharedSamplesAsync` — the main-thread BATCHED sampler that yielded to the event loop every 4 samples —
// was DELETED with #157 ([ADR-401](docs/06-decisions.md#adr-401)). Its yield granularity assumed cheap
// samples; on a coupled figure one sample is seconds, so it froze the tab in multi-second chunks while
// looking non-blocking. The sweep now runs in the geometry worker ({@link detectAll}), and leaving a
// main-thread sampler in the module would only invite the next call site back onto the UI thread.

/** The three detection layers' verdicts over ONE shared sample pool — see {@link detectAll}. */
export interface DetectAllResult {
  /** #444 — the equal pairs the DRAWN named shape declares (kite / isosceles / isosceles trapezoid).
   *  Reported SEPARATELY from `relations` because they hold in this configuration, not in every valid
   *  one; the UI marks them distinctly and says so. */
  stated: StatedShapeEquality[];
  relations: RelationsResult;
  shapes: ShapesResult;
  /** The forced ink crossings (ADR-380) — a `Set` so it survives the worker's structured clone as-is. */
  crossings: Set<string>;
}

/**
 * Every detection layer's verdict, from ONE sample sweep ([ADR-401](docs/06-decisions.md#adr-401)).
 *
 * The M3 law says the layers share one sampler; this makes that shareable ACROSS THREADS. Sampling is
 * the dominant per-step cost on a coupled figure (measured on the #157 trapezoid-midsegment figure: one
 * sample ≈ 0–4 s depending on the seed, 16 samples ≈ 9 s), and all three consumers ran it on the main
 * thread — `viewRelations` synchronously, `detectShapes`/`detectCrossings` in main-thread batches whose
 * every-4-samples yield assumed cheap samples. Returning the finished VERDICTS (small, pure data) rather
 * than the pool keeps the boundary narrow: the `circlesOfSample` side table (a `WeakMap` keyed by a
 * positions map) never has to cross a thread, and the heavy classification runs where the samples are.
 */
export function detectAll(facts: Fact[]): DetectAllResult {
  const shared = sharedSamples(facts);
  // #444: the DRAWN variant's declared equal pairs — a SEPARATE channel from the discovered relations
  // (which pool across variants and therefore, correctly, never report a variant-specific pair). The
  // student who typed «דלתון» / «משולש שווה שוקיים» must still see the two equal sides they expect.
  const symtabD = buildSymTab(facts.filter((f) => f.enabled).map((f) => f.cmd));
  const explicitEqs = facts
    .filter((f) => f.enabled && f.cmd.type !== 'shape-variant')
    .flatMap((f) => lowerOne(f.cmd, symtabD))
    .filter((c): c is Extract<Command, { type: 'set-equal' }> => c.type === 'set-equal');
  const variantCmds = facts
    .filter((f) => f.enabled && f.cmd.type === 'shape-variant')
    .map((f) => f.cmd as { shape: VariantShape; ids: Id[]; variant: number });
  return {
    stated: statedShapeEqualities(variantCmds, explicitEqs),
    relations: detectRelationsAcross(shared.constructions, { positions: shared.samples }),
    shapes: classifyShapesFromSamples(shared.constructions[0], shared.samples),
    crossings: forcedCrossingKeys(shared),
  };
}

/**
 * #217 (ADR-410): the VALUES-PANEL rows — a FOURTH consumer of the ONE shared sample pool (M3),
 * computed only on user request (the panel is pull, never push — req 4: zero cost in the submit
 * path; when the detect sweep already ran, the pool memo makes this a pure classification pass).
 * Runs where the samples are (the worker), so the `circlesOfSample` side table stays thread-local.
 */
export function computeValues(facts: Fact[], queries: QueryInput[] = []): ValuesPanelResult {
  const shared = sharedSamples(facts);
  const circles = shared.samples.map((pos) => circlesOfSample.get(pos) ?? new Map<Id, ResolvedCircle>());
  let areaLetter: string | null = null;
  for (const f of facts) {
    if (f.enabled && f.cmd.type === 'measure-area' && 'var' in f.cmd.expr) areaLetter = f.cmd.expr.var;
  }
  // #427: the student's declared length unit («AB = a») — read off the ENABLED facts, so deselecting the
  // statement that named it returns the panel to plain magnitudes.
  const unit = declaredLengthUnit(facts.filter((f) => f.enabled).map((f) => f.cmd));
  return computeValuesPanel(shared.constructions, shared.samples, circles, areaLetter, unit, queries);
}

/** The object ids a command introduces — used to highlight a selected fact on the canvas. */
export function introducedIds(cmd: AnyCommand): Id[] {
  // A symbolic measure introduces no objects; highlight the points it annotates instead.
  if (cmd.type === 'measure-length') return [cmd.a, cmd.b];
  if (cmd.type === 'measure-angle' || cmd.type === 'mark-angle') return [cmd.vertex, cmd.ray1, cmd.ray2];
  if (cmd.type === 'measure-area') return cmd.ids; // highlight the polygon the area annotates
  if (cmd.type === 'set-var' || cmd.type === 'measure-order' || cmd.type === 'measure-bound') return []; // a relation over variables — no object to highlight
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

/**
 * #539 — the point labels the STUDENT never typed: ids introduced by the enabled commands that appear
 * in NO enabled fact's utterance. The parser auto-mints visible labels (a mutual tangency's touch «M»,
 * the ADR-263/270 macro families), and `rename`/`nameCentre` rewrite both commands AND utterances — so
 * "absent from every utterance" is exactly "auto-named as it currently stands", with no per-rule marker
 * to wire or drift. Consumed by the `impliedPointBinding` naming-by-use decision (the #186 pattern,
 * point edition): a student's fresh label may bind to one of THESE, never to a label the student chose.
 */
export function autoNamedLabels(facts: Fact[]): Set<Id> {
  const typed = new Set<string>();
  for (const f of facts) if (f.enabled && f.utterance) for (const m of f.utterance.match(/[A-Z]\d*/g) ?? []) typed.add(m);
  const out = new Set<Id>();
  for (const f of facts) if (f.enabled) for (const id of commandPointIds(f.cmd)) if (!typed.has(id)) out.add(id);
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

/** Shape commands whose `ids` form a closed polygon that must stay a CLEAN convex drawing. */
const POLYGON_SHAPES = new Set(['square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid', 'quadrilateral']);

/**
 * #443 (ADR-479) — EVERY polygon ring a fact DECLARES, macros included.
 *
 * `polygonsConvex` used to read `cmd.ids` off facts whose `cmd.type` is in `POLYGON_SHAPES`. A named
 * shape declared through a MACRO — kite, isosceles, iso-trapezoid, midsegment ([ADR-138](docs/06-decisions.md#adr-138)),
 * and every inscribed shape ([ADR-262](docs/06-decisions.md#adr-262)) — is a `shape-variant` /
 * `inscribe` fact that only becomes a polygon at replay, so the guard never saw its ring. The
 * consequence was that the guarantee the guard's own doc states — *every declared polygon draws convex*
 * — silently held for «מרובע ABCD» and not for «דלתון ABCD», which could therefore draw as a DART
 * (measured: 4 of the first 200 seeds).
 *
 * The fix is not a wider whitelist, which would drift again with the next macro: the rings are read out
 * of the macro's OWN EXPANSION, by the same rule applied to the expanded commands. A macro that lowers
 * to a polygon inherits the guard by construction.
 *
 * A synthesised `polygon` counts only INSIDE an expansion. A bare `polygon` command is the student
 * drawing an arbitrary ring («מצולע ABCDE»), which may legitimately be concave and is a separate
 * question; a macro's `polygon` is the boundary of a shape the student NAMED, which is exactly what this
 * default is about.
 *
 * Memoized on the command object (immutable through the fold), because this runs per candidate
 * configuration inside `meetsRequirements` and `expandInscribe` enumerates placements.
 */
const declaredRingsMemo = new WeakMap<object, Id[][]>();
function declaredRings(cmd: AnyCommand): Id[][] {
  const cached = declaredRingsMemo.get(cmd as object);
  if (cached) return cached;
  const out: Id[][] = [];
  const take = (c: AnyCommand, inExpansion: boolean) => {
    if (!POLYGON_SHAPES.has(c.type) && !(inExpansion && c.type === 'polygon')) return;
    const ids = (c as { ids?: Id[] }).ids;
    if (ids && ids.length >= 4) out.push(ids);
  };
  take(cmd, false);
  // The explicit-equality / on-segment lists only choose WHICH variant is emitted; every variant of a
  // macro declares the same ring, so reading it with empty lists cannot pick a different polygon.
  if (cmd.type === 'shape-variant') for (const e of expandShapeVariant(cmd, [], [])) take(e, true);
  else if (cmd.type === 'inscribe') for (const e of expandInscribe(cmd, [])) take(e, true);
  declaredRingsMemo.set(cmd as object, out);
  return out;
}

/**
 * Every declared polygon (a shape's `ids` cycle) is a valid CONVEX drawing — every turn around the
 * cycle has the same orientation. This rejects both a self-crossing ("tangled" ABCD) **and** a concave
 * ("dart") quad: both are valid point sets but neither is what a student means by the shape, so "show
 * another configuration" must not surface them (ADR-018 — alternatives are valid *drawings*).
 * Triangles (3 vertices, always convex/simple) are skipped — only 4+-gons are checked.
 */
/** A ring's identity, independent of where the cycle starts or which way round it is read. */
export function ringKey(ids: Id[]): string {
  const n = ids.length;
  const rots: string[] = [];
  for (const seq of [ids, [...ids].reverse()])
    for (let i = 0; i < n; i++) rots.push(seq.slice(i).concat(seq.slice(0, i)).join(','));
  return rots.sort()[0];
}

export function polygonsConvex(facts: Fact[], positions: Map<Id, Vec>): boolean {
  // #441: convexity is the default only where the student stated NOTHING. A polygon stated concave is
  // exempt here — otherwise the requirement would be unsatisfiable and the figure could never draw —
  // and `checkGivens` enforces the statement instead. A stated-concave ring must still be SIMPLE, which
  // is the part of this guard that was never about convexity: `ringSimple` keeps rejecting the tangled
  // drawing, so "concave" buys the dart and nothing else.
  const statedConcave = new Set<string>();
  for (const f of facts) {
    if (!f.enabled || f.cmd.type !== 'set-polygon-convexity') continue;
    const c = f.cmd as { ids: Id[]; convex: boolean };
    if (!c.convex) statedConcave.add(ringKey(c.ids));
  }
  for (const f of facts) {
    if (!f.enabled) continue;
    // #443: the rings the fact DECLARES — directly, or through the macro it expands into.
    for (const ids of declaredRings(f.cmd)) {
    if (statedConcave.has(ringKey(ids))) {
      const pts0 = ids.map((id) => positions.get(id));
      if (pts0.some((p) => !p)) continue;
      if (!ringSimple(pts0 as Vec[])) return false;
      continue;
    }
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
 * Settle a NEW cyclable-variant fact's DEFAULT configuration ([ADR-339](docs/06-decisions.md#adr-339),
 * issue #176 — the variant sibling of the ADR-098 seed auto-advance).
 *
 * The parser emits `variant: 0` blindly, but a variant is an UNSTATED configuration choice (ADR-052/M4) and
 * the default must land in general position (ADR-253): a coincidence that variant 0 forces but a SIBLING
 * variant avoids is a DEFAULT collision (ADR-123: avoided), not a given-forced one (allowed + notice) — the
 * "forced" classification's proper scope is the variant FAMILY, not the chosen member. The reported case: a
 * square inscribed in a right triangle at A — variant 0 (base on a leg) forces the corner square D≡A, while
 * the hypotenuse variants put all four vertices genuinely on the sides.
 *
 * Walked from the parsed variant, first candidate on the best achievable tier:
 *   builds + no NEW coincidence among the command's own vertices + fewest verifier violations
 *   ≻ builds + no new coincidence  ≻ builds  ≻ keep the parsed variant (its honest error stands).
 *
 * Settling happens ONCE, at commit — the parser is the only producer of the default, a student can only
 * CYCLE afterwards — so the persisted variant is authoritative from then on, "show another configuration"
 * cycles verbatim from it, and the corner square stays REACHABLE (with its notice), never the default.
 * Returns the SAME array when nothing changed (undo/memo hygiene). Budgeted like the seed search.
 */
export function settleVariantDefaults(facts: Fact[], isNew: (f: Fact) => boolean, seed: number, budgetMs = SEARCH_BUDGET_MS): Fact[] {
  const deadline = Date.now() + budgetMs;
  let out = facts;
  for (let idx = 0; idx < out.length; idx++) {
    const f = out[idx];
    if (!isNew(f) || !cyclableVariant(f.cmd)) continue;
    const n = variantCountOf(f.cmd);
    const v0 = (f.cmd as { variant: number }).variant;
    // A coincidence is NEW iff it touches the command's own vertices and wasn't already in the prefix
    // figure (an inherited coincidence between container vertices must not disqualify every variant).
    const verts = new Set(variantVertices(f.cmd));
    const canon = ([a, b]: [Id, Id]) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const prior = new Set(replay(out.slice(0, idx), seed).coincidences.map(canon));
    const score = (fig: Derived): [number, number, number] => [
      fig.status[f.id] === 'ok' ? 0 : 1,
      fig.coincidences.some((p) => verts.has(p[0]) && verts.has(p[1]) && !prior.has(canon(p))) ? 1 : 0,
      fig.violations.length,
    ];
    const candidate = (v: number) => out.map((x, i) => (i === idx ? { ...x, cmd: withVariant(x.cmd, v) } : x));
    let best = { v: v0, s: score(replay(out, seed)) };
    if (best.s[0] === 0 && best.s[1] === 0 && best.s[2] === 0) continue; // the parsed default is already clean
    for (let dv = 1; dv < n && Date.now() < deadline; dv++) {
      const v = (v0 + dv) % n;
      const s = score(replay(candidate(v), seed));
      // Strictly better lexicographically wins; ties keep the earlier (most-canonical) variant.
      if (s[0] < best.s[0] || (s[0] === best.s[0] && (s[1] < best.s[1] || (s[1] === best.s[1] && s[2] < best.s[2]))))
        best = { v, s };
      if (s[0] === 0 && s[1] === 0 && s[2] === 0) break; // can't do better than clean
    }
    if (best.v !== v0) out = candidate(best.v);
  }
  return out;
}
