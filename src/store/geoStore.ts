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
import type { AnyCommand, Command, Construction, GivenViolation, Id, Vec } from '@/engine';
import { applyCommand, applySeed, applyStep, branchCount, buildSymTab, checkGivens, deepEqual, emptyConstruction, evaluate, freeDofs, isGeoPoint, isMeasure, lowerOne, measureLabelText } from '@/engine';

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
  /** fact id → status. */
  status: Record<string, FactStatus>;
  /** The most recent enabled fact that failed, for the error banner (or null). */
  lastError: string | null;
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
}

/** A free circle radius the student can drag: `base` is the stable seed radius (for the slider range),
 *  `current` is the radius being drawn right now (seed-varied or dialed). */
export interface RadiusDof {
  circle: Id;
  center: Id;
  base: number;
  current: number;
}

/**
 * Replay the enabled facts in order; disabled or unsatisfiable facts are flagged,
 * not fatal. `seed` samples the figure's residual freedom (ADR-018): the final
 * figure's non-pinned free points are perturbed deterministically, so the figure
 * is re-drawn while still satisfying every fact. seed 0 = the canonical default.
 */
export function replay(facts: Fact[], seed = 0, radiusOverrides: Record<Id, number> = {}): Derived {
  let cur = emptyConstruction();
  const status: Record<string, FactStatus> = {};
  let lastError: string | null = null;
  // Symbol table over the ENABLED facts, so a value given later (`x = 4`) resolves an
  // earlier `AB = 3x`, and two segments sharing a variable become a proportion (ADR-031).
  const symtab = buildSymTab(facts.filter((f) => f.enabled).map((f) => f.cmd));
  const lenByKey = new Map<string, MeasureLabels['lengths'][number]>();
  const angByKey = new Map<string, MeasureLabels['angles'][number]>();
  // Point ids any earlier fact OWNS (introduces). A later fact must not silently
  // re-create one of these as a default free point (the auto-create-endpoints
  // affordance) when its owner failed/was removed — that would mask the breakage.
  // Instead the dependent fact fails too, so a removed step cascades honestly.
  const owned = new Set<Id>();
  // Engine commands of the facts that applied — the figure's stated givens, fed to the verifier.
  const applied: Command[] = [];
  for (const f of facts) {
    // Lower the fact to the engine command(s) it produces (symbolic measures →
    // ratio/distance/angle/[]; engine commands pass through). 0 commands ⇒ a label-
    // only / data-only fact (a free representative or `set-var`) — applied as a no-op.
    const engineCmds = lowerOne(f.cmd, symtab);
    const intro = engineCmds.flatMap(introducedPointIds);
    const claim = () => intro.forEach((id) => owned.add(id));
    if (!f.enabled) {
      status[f.id] = 'disabled';
      claim();
      continue;
    }
    // A measure annotates the figure regardless of whether it adds a constraint.
    if (isMeasure(f.cmd)) addMeasureLabel(lenByKey, angByKey, f.cmd, measureLabelText(f.cmd, symtab));
    // A point a lowered command would (re)create that an earlier fact owns but which
    // isn't in the figure now ⇒ its definition is gone, so this fact can't build either.
    const broken = intro.filter((id) => owned.has(id) && !cur.objects.some((o) => o.id === id));
    if (broken.length) {
      status[f.id] = `can't build: ${broken.join(', ')} is no longer available (an earlier step it relies on was removed or failed)`;
      lastError = status[f.id];
      claim();
      continue;
    }
    let ok = true;
    for (const ec of engineCmds) {
      const r = applyStep(cur, ec);
      if (r.ok) cur = r.construction;
      else {
        status[f.id] = r.error; // dependencies gone, contradiction, etc. — keep prior figure
        lastError = r.error;
        ok = false;
        break;
      }
    }
    if (ok) {
      status[f.id] = 'ok';
      applied.push(...(engineCmds as Command[]));
    }
    claim();
  }
  const sampled = applySeed(cur, seed);
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
    if (con.type === 'distance') addMeasureLabel(lenByKey, angByKey, { type: 'measure-length', a: con.a, b: con.b }, fmtMeasure(con.value), true);
    else if (con.type === 'angle') addMeasureLabel(lenByKey, angByKey, { type: 'measure-angle', vertex: con.vertex, ray1: con.ray1, ray2: con.ray2 }, `${fmtMeasure(con.value)}°`, true);
  }
  const labels: MeasureLabels = { lengths: [...lenByKey.values()], angles: [...angByKey.values()] };
  // Angle marks the student ASSERTED (only from facts that applied, and whose points all exist) —
  // a right-angle square or an angle arc. Deduped by vertex + ray pair.
  const angleMarks: AngleMark[] = [];
  const amSeen = new Set<string>();
  for (const f of facts) {
    if (status[f.id] !== 'ok') continue;
    const m = angleMarkFor(f.cmd);
    if (!m || ![m.vertex, m.ray1, m.ray2].every((id) => e.ok && e.positions.has(id))) continue;
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
  return { construction: figure, positions: e.ok ? e.positions : new Map(), status, lastError, labels, angleMarks, violations, radiusDofs };
}

/** Outcome of dry-running a parsed step on top of the current facts (see {@link dryRunOutcome}). */
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
  const trial: Fact[] = commands.map((c, i) => ({ id: `~try.${i}`, group: '~try', enabled: true, cmd: c }));
  const after = replay([...facts, ...trial], seed, overrides);
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
  if (!grew && !dataOnly) return { produced: false, reason: 'empty' };
  return { produced: true };
}

const fmtMeasure = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

/** Record a measure label; `fillOnly` writes only if that segment/angle isn't already labelled (numeric fallback). */
function addMeasureLabel(
  lenByKey: Map<string, MeasureLabels['lengths'][number]>,
  angByKey: Map<string, MeasureLabels['angles'][number]>,
  m: { type: 'measure-length'; a: Id; b: Id } | { type: 'measure-angle'; vertex: Id; ray1: Id; ray2: Id },
  text: string,
  fillOnly = false,
): void {
  if (m.type === 'measure-angle') {
    const key = `${m.vertex}:${[m.ray1, m.ray2].sort().join('')}`;
    if (fillOnly && angByKey.has(key)) return;
    angByKey.set(key, { vertex: m.vertex, ray1: m.ray1, ray2: m.ray2, text });
  } else {
    const key = [m.a, m.b].sort().join('');
    if (fillOnly && lenByKey.has(key)) return;
    lenByKey.set(key, { a: m.a, b: m.b, text });
  }
}

/** The object ids a command introduces — used to highlight a selected fact on the canvas. */
export function introducedIds(cmd: AnyCommand): Id[] {
  // A symbolic measure introduces no objects; highlight the points it annotates instead.
  if (cmd.type === 'measure-length') return [cmd.a, cmd.b];
  if (cmd.type === 'measure-angle') return [cmd.vertex, cmd.ray1, cmd.ray2];
  if (cmd.type === 'set-var' || cmd.type === 'measure-order') return []; // a relation over variables — no object to highlight
  return applyCommand(emptyConstruction(), cmd).objects.map((o) => o.id);
}

/** The POINT ids a command would introduce (created or auto-created) — for cascade detection. */
function introducedPointIds(cmd: Command): Id[] {
  return applyCommand(emptyConstruction(), cmd).objects.filter(isGeoPoint).map((o) => o.id);
}

/**
 * Every point id that appears in a command, created or referenced. Point ids are
 * always single uppercase letters; line ids ("bis-…") and circle ids ("circle-O")
 * are multi-character, so a single-letter test isolates points cleanly. The
 * measure `expr` is skipped — it carries a variable/text, never a point id.
 */
function commandPointIds(cmd: AnyCommand): Id[] {
  const out: Id[] = [];
  const take = (v: unknown) => {
    if (typeof v === 'string' && /^[A-Z]$/.test(v)) out.push(v);
  };
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') continue;
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

/** Rewrite a seg-id key (`seg-AB`) under a point rename — re-derive it from the renamed, re-sorted
 *  endpoints so it still matches the renderer's id. Best-effort: only the common single-letter-endpoints
 *  case (a subscripted/multi-char endpoint keeps its old key — a minor cosmetic staleness). */
function renameSegKey(key: Id, from: Id, to: Id): Id {
  if (!key.startsWith('seg-')) return key;
  const ep = key.slice(4);
  if (ep.length !== 2) return key;
  const a = ep[0] === from ? to : ep[0];
  const b = ep[1] === from ? to : ep[1];
  return `seg-${[a, b].sort().join('')}`;
}

/** Apply a point rename to every seg-id key in a segment-style map. */
function renameSegStyle(style: Record<Id, { hidden?: boolean; dashed?: boolean }>, from: Id, to: Id): Record<Id, { hidden?: boolean; dashed?: boolean }> {
  return Object.fromEntries(Object.entries(style).map(([k, v]) => [renameSegKey(k, from, to), v]));
}

/** Rewrite one point letter to another across a single command (exact-match on the single-letter id). */
function renameInCommand(cmd: AnyCommand, from: Id, to: Id): AnyCommand {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') out[k] = v; // a measure expr holds a variable/text, not point ids — never rewrite
    else if (typeof v === 'string') out[k] = v === from ? to : v;
    else if (Array.isArray(v)) out[k] = v.map((e) => (e === from ? to : e));
    else out[k] = v;
  }
  return out as AnyCommand;
}

/** Outcome of a relabel request, so the UI can explain a no-op. */
export type RenameResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' };

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
  /** Sampling seed for the figure's residual freedom (ADR-018); UI-only, not undoable. 0 = canonical. */
  seed: number;
  /** Show measure labels on the figure (ADR-031); UI-only, not undoable. Default true. */
  showMeasures: boolean;
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

  /** Append a fact (enabled). Commands sharing a `group` display as one step row. */
  execute: (cmd: AnyCommand, utterance?: string, group?: string) => void;
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
  /** Advance an intersection point to its next configuration (stored in the fact's command). */
  cycleAlt: (pointId: Id) => void;
  /** Re-sample the figure's residual freedom — a different valid drawing (ADR-018). Returns `true` if it
   *  found a genuinely DIFFERENT drawing, `false` if the shape is determined (only size/placement vary). */
  resample: () => boolean;
  /** Dial a free circle's radius directly (a DOF slider). Cleared on resample. */
  setRadius: (circle: Id, value: number) => void;
  /** Show/hide measure labels on the figure (ADR-031). */
  setShowMeasures: (show: boolean) => void;
  /** Toggle a point's label + dot hidden/shown on the figure (a display preference, not geometry). */
  toggleHidden: (id: Id) => void;
  /** Toggle a segment hidden/shown on the figure (a display preference, not geometry). */
  toggleSegHidden: (id: Id) => void;
  /** Toggle a segment dashed/solid on the figure (a display preference, not geometry). */
  toggleSegDashed: (id: Id) => void;
  /** Relabel a point everywhere (e.g. E → G) — rewrites every fact, one undo entry. */
  rename: (from: Id, to: Id) => RenameResult;
  /** Fold one point into another (e.g. F → E, both already present) — drops F's definition,
   *  rewrites F→E everywhere, drops facts that collapsed; one undo entry. */
  merge: (from: Id, to: Id) => MergeResult;
  /** Reset to no facts and wipe undo/redo history. */
  clear: () => void;
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
export function pointsDistinct(c: Construction, positions: Map<Id, Vec>): boolean {
  const pts = c.objects
    .filter((o) => isGeoPoint(o) && !o.id.startsWith('~'))
    .map((o) => ({ id: o.id, p: positions.get(o.id) }))
    .filter((x): x is { id: Id; p: Vec } => !!x.p);
  if (pts.length < 2) return true;
  const xs = pts.map((x) => x.p.x);
  const ys = pts.map((x) => x.p.y);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const minSep = 0.015 * span;
  const coincide = new Set(
    c.constraints.filter((k) => k.type === 'coincide').map((k) => [k.p, k.q].sort().join('|')),
  );
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

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      facts: [],
      selectedId: null,
      seed: 0,
      showMeasures: true,
      radiusOverrides: {},
      hidden: [],
      segStyle: {},

      execute: (cmd, utterance, group) => {
        const facts = get().facts;
        // Idempotent (FR-EN-9): re-issuing an identical command adds no duplicate
        // fact. If that fact was deselected, re-issuing turns it back on.
        const dup = facts.find((f) => deepEqual(f.cmd, cmd));
        if (dup) {
          if (!dup.enabled) set({ facts: facts.map((f) => (f.id === dup.id ? { ...f, enabled: true } : f)) });
          return;
        }
        // Repositioning a free point already governed by a prior free-point fact
        // updates that fact in place (a move), rather than stacking rows (ADR-011).
        if (cmd.type === 'free-point') {
          const prev = facts.find((f) => f.cmd.type === 'free-point' && f.cmd.id === cmd.id);
          if (prev) {
            set({ facts: facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f)) });
            return;
          }
        }
        // Re-stating a STANDALONE circle (its own one-command step) resizes it in
        // place — like a free-point move. A circle that belongs to a bigger step
        // (an inscribed shape) instead falls through to append an override step,
        // so that step's label stays intact (the engine resizes on replay).
        if (cmd.type === 'circle' || cmd.type === 'circle-through') {
          const prev = facts.find(
            (f) => (f.cmd.type === 'circle' || f.cmd.type === 'circle-through') && f.cmd.id === cmd.id,
          );
          if (prev && !facts.some((f) => f.id !== prev.id && groupKey(f) === groupKey(prev))) {
            set({ facts: facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f)) });
            return;
          }
        }
        set({ facts: [...facts, { id: nanoid(), cmd, utterance, group, enabled: true }] });
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
        set({
          facts: [...facts.slice(0, start), ...replacement, ...facts.slice(end)],
          selectedId: get().selectedId === key ? null : get().selectedId,
        });
      },

      select: (id) => {
        set({ selectedId: get().selectedId === id ? null : id });
      },

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

      resample: () => {
        const facts = get().facts;
        const cur = replay(facts, get().seed);
        if (freeDofs(cur.construction).length === 0) return false; // fully determined — nothing to vary
        const curFp = shapeFingerprint(cur.construction, cur.positions);
        let s = get().seed;
        for (let k = 0; k < 24; k++) {
          s += 1;
          const r = replay(facts, s);
          // Accept a sample only if it evaluates, keeps every declared polygon a clean convex drawing
          // (a self-crossing/concave quad is a valid point set but not a valid drawing of the shape),
          // keeps distinct points apart (a varied free radius must not collapse two points — ADR-051),
          // AND is a genuinely DIFFERENT drawing (not the same shape at another size/rotation) — else the
          // student presses "show another" and sees no change. The fingerprint is similarity-invariant.
          if (
            evaluate(r.construction).ok &&
            polygonsConvex(facts, r.positions) &&
            pointsDistinct(r.construction, r.positions) &&
            shapeDiffers(curFp, shapeFingerprint(r.construction, r.positions))
          ) {
            set({ seed: s, radiusOverrides: {} }); // a fresh view clears any dialed radii (scratchpad reset)
            return true;
          }
        }
        return false; // searched but found no shape-different drawing — the figure is determined up to size/placement
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

      toggleHidden: (id) => {
        const I = id.toUpperCase();
        const h = get().hidden;
        set({ hidden: h.includes(I) ? h.filter((x) => x !== I) : [...h, I] });
      },

      toggleSegHidden: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'hidden') }),
      toggleSegDashed: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'dashed') }),

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
            // The step row shows the utterance; relabel the letter there too (uppercase
            // point letters only — Hebrew words and lowercase keywords are untouched).
            utterance: f.utterance ? f.utterance.split(F).join(T) : f.utterance,
          })),
          hidden: get().hidden.map((h) => (h === F ? T : h)), // a hidden point keeps its hidden state under the new letter
          segStyle: renameSegStyle(get().segStyle, F, T), // a styled segment keeps its style under the renamed endpoint
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
            utterance: f.utterance ? f.utterance.split(F).join(T) : f.utterance,
          }))
          .filter((f) => !collapsedDegenerate(f.cmd)); // drop facts that collapsed (segment EF → EE, …)
        set({ facts: merged, hidden: [...new Set(get().hidden.map((h) => (h === F ? T : h)))], segStyle: renameSegStyle(get().segStyle, F, T), selectedId: null });
        return { ok: true };
      },

      clear: () => {
        set({ facts: [], selectedId: null, seed: 0, radiusOverrides: {}, hidden: [], segStyle: {} });
        useGeoStore.temporal.getState().clear();
      },
    }),
    {
      // Only the fact list participates in undo/redo — not the transient selection.
      partialize: (s) => ({ facts: s.facts }),
      // Skip history entries when the fact list is unchanged (e.g. selecting a
      // fact only sets selectedId); actions that edit facts replace the array.
      equality: (a, b) => a.facts === b.facts,
      limit: 100,
    },
  ),
);
