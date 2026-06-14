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
import type { AnyCommand, Command, Construction, Id, Vec } from '@/engine';
import { applyCommand, applySeed, applyStep, branchCount, buildSymTab, deepEqual, emptyConstruction, evaluate, freeDofs, isGeoPoint, isMeasure, lowerOne, measureLabelText } from '@/engine';

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
}

/**
 * Replay the enabled facts in order; disabled or unsatisfiable facts are flagged,
 * not fatal. `seed` samples the figure's residual freedom (ADR-018): the final
 * figure's non-pinned free points are perturbed deterministically, so the figure
 * is re-drawn while still satisfying every fact. seed 0 = the canonical default.
 */
export function replay(facts: Fact[], seed = 0): Derived {
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
    if (ok) status[f.id] = 'ok';
    claim();
  }
  const figure = applySeed(cur, seed);
  const e = evaluate(figure);
  // Numeric measures (a plain `AB = 5` / `∠ABC = 37`, and symbolic ones once resolved)
  // surface as distance/angle constraints — label them from the figure, filling any
  // key a symbolic fact didn't already own (FR-RN-2).
  for (const con of figure.constraints) {
    if (con.type === 'distance') addMeasureLabel(lenByKey, angByKey, { type: 'measure-length', a: con.a, b: con.b }, fmtMeasure(con.value), true);
    else if (con.type === 'angle') addMeasureLabel(lenByKey, angByKey, { type: 'measure-angle', vertex: con.vertex, ray1: con.ray1, ray2: con.ray2 }, `${fmtMeasure(con.value)}°`, true);
  }
  const labels: MeasureLabels = { lengths: [...lenByKey.values()], angles: [...angByKey.values()] };
  return { construction: figure, positions: e.ok ? e.positions : new Map(), status, lastError, labels };
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
  if (cmd.type === 'set-var') return [];
  return applyCommand(emptyConstruction(), cmd).objects.map((o) => o.id);
}

/** The POINT ids a command would introduce (created or auto-created) — for cascade detection. */
function introducedPointIds(cmd: Command): Id[] {
  return applyCommand(emptyConstruction(), cmd).objects.filter(isGeoPoint).map((o) => o.id);
}

export interface GeoState {
  facts: Fact[];
  /** The fact currently selected for inspection (highlighted on the canvas); UI-only, not undoable. */
  selectedId: string | null;
  /** Sampling seed for the figure's residual freedom (ADR-018); UI-only, not undoable. 0 = canonical. */
  seed: number;

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
  /** Re-sample the figure's residual freedom — a different valid drawing (ADR-018). */
  resample: () => void;
  /** Reset to no facts and wipe undo/redo history. */
  clear: () => void;
}

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      facts: [],
      selectedId: null,
      seed: 0,

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
        const branchable = new Set(['point-by-distances', 'arc-midpoint', 'line-circle-intersection', 'circle-circle-intersection']);
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
        if (freeDofs(replay(facts).construction).length === 0) return; // fully determined — nothing to vary
        let s = get().seed;
        for (let k = 0; k < 16; k++) {
          s += 1;
          if (evaluate(replay(facts, s).construction).ok) {
            set({ seed: s });
            return;
          }
        }
        set({ seed: s }); // give up gracefully after a few degenerate draws
      },

      clear: () => {
        set({ facts: [], selectedId: null, seed: 0 });
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
