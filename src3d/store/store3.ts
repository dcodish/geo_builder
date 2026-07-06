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
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import { applyCommand3 } from '../engine/apply';
import { checkInSpan, evaluate3 } from '../engine/evaluate';
import { verifyClaim } from '../engine/claims';
import { emptyConstruction3, type Command3, type Construction3, type EngineError3, type Positions3 } from '../engine/types';
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
  positions: Positions3;
  status: Record<string, FactStatus3>;
}

export type StoreError3 = EngineError3 | { code: 'not-understood' } | null;

/**
 * Pure replay: fold the enabled facts through the reducer, evaluate — then
 * VERIFY: every claim is checked against the final figure across several
 * sampled configurations (claims.ts), and every span-driven point is
 * post-checked (its closed-form t must actually satisfy the condition ON the
 * stated segment). A fact that fails verification carries the verdict in
 * `status` — and `submit` refuses it (keep-prior), so a wrong answer or an
 * unsatisfiable condition can never silently sit on the figure.
 */
export function derive3(facts: Fact3[], seed: number): Derived3 {
  let c: Construction3 = emptyConstruction3();
  const status: Record<string, FactStatus3> = {};
  for (const f of facts) {
    if (!f.enabled) {
      status[f.id] = 'disabled';
      continue;
    }
    let st: FactStatus3 = 'ok';
    for (const cmd of f.cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) {
        st = r.error;
        break;
      }
      c = r.next;
    }
    status[f.id] = st;
  }

  const positions = evaluate3(c, seed);

  for (const f of facts) {
    if (status[f.id] !== 'ok') continue;
    for (const cmd of f.cmds) {
      if (cmd.type === 'claim') {
        if (!verifyClaim(cmd.claim, c, seed)) {
          status[f.id] = { code: 'claim-refuted' };
          break;
        }
      } else if (cmd.type === 'point-in-span') {
        const def = c.points.get(cmd.id);
        if (def?.kind === 'in-span') {
          const verdict = checkInSpan(c, cmd.id, def, positions);
          if (verdict !== 'ok') {
            status[f.id] = { code: verdict, id: cmd.id };
            break;
          }
        }
      }
    }
  }

  return { construction: c, positions, status };
}

export interface Geo3State {
  facts: Fact3[];
  seed: number;
  lastError: StoreError3;
  submit: (utterance: string) => void;
  toggle: (factId: string) => void;
  remove: (factId: string) => void;
  clear: () => void;
  resample: () => void;
  dismissError: () => void;
}

export const useGeo3 = create<Geo3State>()(
  temporal(
    (set, get) => ({
      facts: [],
      seed: 0,
      lastError: null,

      submit: (utterance) => {
        const parsed = parse3(utterance);
        if (!parsed.ok) {
          set({ lastError: { code: 'not-understood' } });
          return;
        }
        const { facts, seed } = get();
        const fact: Fact3 = { id: nanoid(8), utterance: utterance.trim(), cmds: parsed.commands, enabled: true };
        const candidate = [...facts, fact];
        const st = derive3(candidate, seed).status[fact.id];
        if (st !== 'ok' && st !== 'disabled') {
          set({ lastError: st }); // keep-prior: the bad fact is not added
          return;
        }
        set({ facts: candidate, lastError: null });
      },

      toggle: (factId) =>
        set({ facts: get().facts.map((f) => (f.id === factId ? { ...f, enabled: !f.enabled } : f)), lastError: null }),

      remove: (factId) => set({ facts: get().facts.filter((f) => f.id !== factId), lastError: null }),

      clear: () => set({ facts: [], lastError: null }),

      resample: () => set({ seed: get().seed + 1 }),

      dismissError: () => set({ lastError: null }),
    }),
    {
      // History tracks the durable inputs only; lastError is transient UI state,
      // and `equality` keeps error-only sets from pushing duplicate snapshots.
      partialize: (s) => ({ facts: s.facts, seed: s.seed }) as Geo3State,
      equality: (past, current) => past.facts === current.facts && past.seed === current.seed,
    },
  ),
);

export const undo3 = () => useGeo3.temporal.getState().undo();
export const redo3 = () => useGeo3.temporal.getState().redo();
