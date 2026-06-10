/**
 * Geo store (Phase 3) — the app's single source of truth for the build session.
 *
 * Wraps the pure engine in Zustand + zundo: a command pipeline (apply →
 * evaluate → keep-prior-on-error → log), temporal undo/redo, alternatives
 * cycling, and clear. The engine stays pure; this layer holds session state and
 * history. Positions are *not* stored — they're a pure function of the
 * construction (`evaluate`) and derived in the view, so history stays minimal
 * and there's no chance of state and coordinates drifting apart.
 *
 * See docs/04-design.md §executeCommand and docs/09-implementation-plan.md §Phase 3.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Command, Construction, Id } from '@/engine';
import { applyStep, cycleAlternative, emptyConstruction } from '@/engine';

/** One entry in the step log: the fact issued and how the engine answered. */
export interface StepEntry {
  /** The natural-language utterance, when it came from text (Phase 4); absent for direct commands. */
  utterance?: string;
  cmd: Command;
  /** 'ok' if applied; otherwise the engine's rejection message (the figure was kept). */
  status: 'ok' | string;
}

export interface GeoState {
  construction: Construction;
  steps: StepEntry[];
  /** Last rejection to surface to the student; cleared by the next successful step. */
  lastError: string | null;

  /** Apply one command through the pipeline. On contradiction the prior figure is kept. */
  execute: (cmd: Command, utterance?: string) => void;
  /** Advance an intersection point to its next valid configuration (undoable). */
  cycleAlt: (id: Id) => void;
  /** Reset to an empty construction and wipe undo/redo history. */
  clear: () => void;
}

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      construction: emptyConstruction(),
      steps: [],
      lastError: null,

      execute: (cmd, utterance) => {
        const { construction, steps } = get();
        const r = applyStep(construction, cmd);
        if (r.ok) {
          set({
            construction: r.construction,
            steps: [...steps, { utterance, cmd, status: 'ok' }],
            lastError: null,
          });
        } else {
          // Keep the prior construction; record the contradiction (FR-EN-8/-10).
          set({
            steps: [...steps, { utterance, cmd, status: r.error }],
            lastError: r.error,
          });
        }
      },

      cycleAlt: (id) => {
        set({ construction: cycleAlternative(get().construction, id) });
      },

      clear: () => {
        set({ construction: emptyConstruction(), steps: [], lastError: null });
        useGeoStore.temporal.getState().clear();
      },
    }),
    {
      // Only the durable session state participates in undo/redo — not the
      // transient error banner (which is recomputed by the pipeline).
      partialize: (s) => ({ construction: s.construction, steps: s.steps }),
      limit: 100,
    },
  ),
);
