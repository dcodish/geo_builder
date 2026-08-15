// Session store for the C0 prototype: the ordered fact list is the source of truth;
// the scene is derived in the component (no cached derived state — the ADR-3D-001 §8 idiom).
import { create } from 'zustand';
import type { Cx } from '../engine/complex';
import { factNames, factRefs, IMPLICIT_COMPLEX_RE, type Fact } from '../engine/model';
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
    let { facts } = get();
    const existing = facts.find((f) => f.id === res.fact.id);
    if (existing) {
      // idempotent re-issue; for anonymous shows the id IS the normalized expression
      if (existing.src === res.fact.src || existing.kind === 'show') return true;
      set({ lastError: { key: 'duplicate-name', detail: existing.src } });
      return false;
    }
    // ADR-CX-004: an implicitly-created free number yields to an explicit definition of its
    // name — replaced IN PLACE, so the name keeps its position in the evaluation order
    // (its consumers come later in the list and must still see it defined).
    let insertAt = facts.length;
    if (res.fact.kind === 'def' || res.fact.kind === 'free') {
      const name = res.fact.name;
      const idx = facts.findIndex((f) => f.kind === 'free' && f.implicit && f.name === name);
      if (idx >= 0) {
        facts = facts.filter((_, i) => i !== idx);
        insertAt = idx;
      }
    }
    // Honesty: a name may be introduced exactly once — the error names the CONFLICTING statement.
    const taken = new Set(facts.flatMap(factNames));
    const clash = factNames(res.fact).find((n) => taken.has(n));
    if (clash) {
      const holder = facts.find((f) => factNames(f).includes(clash));
      set({ lastError: { key: 'duplicate-name', detail: holder?.src ?? clash } });
      return false;
    }
    // ADR-CX-004: z*/w* names are complex numbers by convention — an unknown reference
    // auto-creates a visible, draggable free number (the ADR-3D-146 auto-creation idiom).
    const implicitFrees: Fact[] = [];
    const seen = new Set<string>(factNames(res.fact)); // never implicit-create the fact's own name
    for (const ref of factRefs(res.fact)) {
      if (!taken.has(ref) && !seen.has(ref) && IMPLICIT_COMPLEX_RE.test(ref)) {
        seen.add(ref);
        implicitFrees.push({ id: `free-${ref}`, kind: 'free', name: ref, src: ref, implicit: true });
      }
    }
    const next = facts.slice();
    next.splice(insertAt, 0, ...implicitFrees, res.fact);
    set({ facts: next, lastError: null });
    return true;
  },

  removeFact: (id) => set(({ facts }) => ({ facts: facts.filter((f) => f.id !== id) })),
  setFree: (name, z) => set(({ freePos }) => ({ freePos: { ...freePos, [name]: z } })),
  setView: (view) => set({ view }),
  clearAll: () => set({ facts: [], freePos: {}, lastError: null }),
  clearError: () => set({ lastError: null }),
}));
