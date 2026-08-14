// Session store for the C0 prototype: the ordered fact list is the source of truth;
// the scene is derived in the component (no cached derived state — the ADR-3D-001 §8 idiom).
import { create } from 'zustand';
import type { Cx } from '../engine/complex';
import { factNames, type Fact } from '../engine/model';
import { parseLine } from '../parser/parse';

export type InputError =
  | { key: 'not-handled' | 'parse-error'; detail: string }
  | { key: 'duplicate-name'; detail: string };

interface ComplexState {
  facts: Fact[];
  freePos: Record<string, Cx>;
  view: 'cart' | 'polar';
  lastError: InputError | null;
  addLine: (raw: string) => boolean;
  removeFact: (id: string) => void;
  setFree: (name: string, z: Cx) => void;
  setView: (v: 'cart' | 'polar') => void;
  clearAll: () => void;
  clearError: () => void;
}

export const useComplexStore = create<ComplexState>((set, get) => ({
  facts: [],
  freePos: {},
  view: 'cart',
  lastError: null,

  addLine: (raw) => {
    const res = parseLine(raw);
    if (!res.ok) {
      set({ lastError: { key: res.key, detail: res.detail ?? raw.trim() } });
      return false;
    }
    const { facts } = get();
    const existing = facts.find((f) => f.id === res.fact.id);
    if (existing) {
      if (existing.src === res.fact.src) return true; // idempotent re-issue
      set({ lastError: { key: 'duplicate-name', detail: existing.src } });
      return false;
    }
    // Honesty: a name may be introduced exactly once — the error names the CONFLICTING statement.
    const taken = new Set(facts.flatMap(factNames));
    const clash = factNames(res.fact).find((n) => taken.has(n));
    if (clash) {
      const holder = facts.find((f) => factNames(f).includes(clash));
      set({ lastError: { key: 'duplicate-name', detail: holder?.src ?? clash } });
      return false;
    }
    set({ facts: [...facts, res.fact], lastError: null });
    return true;
  },

  removeFact: (id) => set(({ facts }) => ({ facts: facts.filter((f) => f.id !== id) })),
  setFree: (name, z) => set(({ freePos }) => ({ freePos: { ...freePos, [name]: z } })),
  setView: (view) => set({ view }),
  clearAll: () => set({ facts: [], freePos: {}, lastError: null }),
  clearError: () => set({ lastError: null }),
}));
