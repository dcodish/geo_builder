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
import type { Command, Construction, Id, Vec } from '@/engine';
import { applyCommand, applyStep, branchCount, emptyConstruction, evaluate } from '@/engine';

/** One entered fact. `enabled` is the selected/deselected state. */
export interface Fact {
  id: string;
  /** The natural-language utterance, when it came from text (Phase 4); absent for direct commands. */
  utterance?: string;
  cmd: Command;
  enabled: boolean;
}

/** Per-fact outcome after replay: applied, turned off, or why it couldn't apply. */
export type FactStatus = 'ok' | 'disabled' | string;

export interface Derived {
  construction: Construction;
  positions: Map<Id, Vec>;
  /** fact id → status. */
  status: Record<string, FactStatus>;
  /** The most recent enabled fact that failed, for the error banner (or null). */
  lastError: string | null;
}

/** Replay the enabled facts in order; disabled or unsatisfiable facts are flagged, not fatal. */
export function replay(facts: Fact[]): Derived {
  let cur = emptyConstruction();
  const status: Record<string, FactStatus> = {};
  let lastError: string | null = null;
  for (const f of facts) {
    if (!f.enabled) {
      status[f.id] = 'disabled';
      continue;
    }
    const r = applyStep(cur, f.cmd);
    if (r.ok) {
      cur = r.construction;
      status[f.id] = 'ok';
    } else {
      status[f.id] = r.error; // dependencies gone, contradiction, etc. — keep prior figure
      lastError = r.error;
    }
  }
  const e = evaluate(cur);
  return { construction: cur, positions: e.ok ? e.positions : new Map(), status, lastError };
}

/** The object ids a command introduces — used to highlight a selected fact on the canvas. */
export function introducedIds(cmd: Command): Id[] {
  return applyCommand(emptyConstruction(), cmd).objects.map((o) => o.id);
}

export interface GeoState {
  facts: Fact[];
  /** The fact currently selected for inspection (highlighted on the canvas); UI-only, not undoable. */
  selectedId: string | null;

  /** Append a fact (enabled). */
  execute: (cmd: Command, utterance?: string) => void;
  /** Flip a fact's selected/deselected state. */
  toggle: (id: string) => void;
  /** Remove a fact permanently. */
  remove: (id: string) => void;
  /** Select a fact for inspection (or clear, if it was already selected). */
  select: (id: string | null) => void;
  /** Advance an intersection point to its next configuration (stored in the fact's command). */
  cycleAlt: (pointId: Id) => void;
  /** Reset to no facts and wipe undo/redo history. */
  clear: () => void;
}

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      facts: [],
      selectedId: null,

      execute: (cmd, utterance) => {
        set({ facts: [...get().facts, { id: nanoid(), cmd, utterance, enabled: true }] });
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

      select: (id) => {
        set({ selectedId: get().selectedId === id ? null : id });
      },

      cycleAlt: (pointId) => {
        const facts = get().facts;
        const { construction } = replay(facts);
        const n = branchCount(construction, pointId) || 1;
        set({
          facts: facts.map((f) =>
            f.enabled && f.cmd.type === 'point-by-distances' && f.cmd.id === pointId
              ? { ...f, cmd: { ...f.cmd, branch: ((f.cmd.branch ?? 0) + 1) % n } }
              : f,
          ),
        });
      },

      clear: () => {
        set({ facts: [], selectedId: null });
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
