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
  /** configuration seed — "show another configuration" bumps it and releases drag overrides */
  seed: number;
  view: 'cart' | 'polar';
  lastError: InputError | null;
  addLine: (raw: string) => boolean;
  removeFact: (id: string) => void;
  setFree: (name: string, z: Cx) => void;
  setView: (v: 'cart' | 'polar') => void;
  nextConfig: () => void;
  clearAll: () => void;
  clearError: () => void;
}

export const useComplexStore = create<ComplexState>((set, get) => ({
  facts: [],
  freePos: {},
  seed: 0,
  view: 'cart',
  lastError: null,

  addLine: (raw) => {
    const res = parseLine(raw);
    if (!res.ok) {
      set({ lastError: { key: res.key, detail: res.detail ?? raw.trim() } });
      return false;
    }
    // One utterance may lower to several facts; stage them ALL, commit only if all pass —
    // a refused half would otherwise silently drop part of what the student stated.
    let working = get().facts;
    for (let fact of res.facts) {
      // stamp the roots mode: an already-existing letter means the equation CONSTRAINS it
      if (fact.kind === 'roots') {
        const names = new Set(working.flatMap(factNames));
        fact = { ...fact, constrains: names.has(fact.varName) };
      }
      const existing = working.find((f) => f.id === fact.id);
      if (existing) {
        // idempotent re-issue; show/rel ids ARE their normalized statements
        if (existing.src === fact.src || existing.kind === 'show' || existing.kind === 'rel')
          continue;
        set({ lastError: { key: 'duplicate-name', detail: existing.src } });
        return false;
      }
      // ADR-CX-004: an implicitly-created free number yields to an explicit definition of its
      // name — replaced IN PLACE, so the name keeps its position in the evaluation order
      // (its consumers come later in the list and must still see it defined).
      let insertAt = working.length;
      if (fact.kind === 'def' || fact.kind === 'free') {
        const idx = working.findIndex(
          (f) => f.kind === 'free' && f.implicit && f.name === fact.name,
        );
        if (idx >= 0) {
          working = working.filter((_, i) => i !== idx);
          insertAt = idx;
        }
      }
      // (0,0) is always O — no statement may claim the name.
      if (factNames(fact).includes('o')) {
        set({ lastError: { key: 'duplicate-name', detail: 'O = (0,0)' } });
        return false;
      }
      // Honesty: a name may be introduced exactly once — the error names the CONFLICTING statement.
      const taken = new Set(working.flatMap(factNames));
      const clash = factNames(fact).find((n) => taken.has(n));
      if (clash) {
        const holder = working.find((f) => factNames(f).includes(clash));
        set({ lastError: { key: 'duplicate-name', detail: holder?.src ?? clash } });
        return false;
      }
      // ADR-CX-004: z*/w* names are complex numbers by convention — an unknown reference
      // auto-creates a visible, draggable free number (the ADR-3D-146 auto-creation idiom).
      const implicitFrees: Fact[] = [];
      const seen = new Set<string>(factNames(fact)); // never implicit-create the fact's own name
      for (const ref of factRefs(fact)) {
        if (!taken.has(ref) && !seen.has(ref) && IMPLICIT_COMPLEX_RE.test(ref)) {
          seen.add(ref);
          implicitFrees.push({ id: `free-${ref}`, kind: 'free', name: ref, src: ref, implicit: true });
        }
      }
      const next = working.slice();
      next.splice(insertAt, 0, ...implicitFrees, fact);
      working = next;
    }
    set({ facts: working, lastError: null });
    return true;
  },

  removeFact: (id) => set(({ facts }) => ({ facts: facts.filter((f) => f.id !== id) })),
  setFree: (name, z) => set(({ freePos }) => ({ freePos: { ...freePos, [name]: z } })),
  setView: (view) => set({ view }),
  // a new configuration = fresh samples for every free DOF; drag overrides are part of the
  // OLD configuration and are released (the sibling "show another configuration" semantics)
  nextConfig: () => set(({ seed }) => ({ seed: seed + 1, freePos: {} })),
  clearAll: () => set({ facts: [], freePos: {}, seed: 0, lastError: null }),
  clearError: () => set({ lastError: null }),
}));
