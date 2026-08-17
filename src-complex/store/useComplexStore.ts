/**
 * The session store.
 *
 * **The ordered list of the student's LINES is the source of truth.** Everything else — the
 * prototype's fact list, the figure, the labels — is derived from it, so undo cannot desync and a
 * saved session replays through the real parse path.
 *
 * ## Why the lines, and not the facts (#658)
 *
 * The first version kept only the prototype's `Fact[]` and reconstructed the lines from `f.src`. That
 * made the PROTOTYPE parser the gatekeeper of the input box: a line it refused never became a fact, so
 * it never reached v2 at all, and **every form the v2 grammar added beyond the prototype's was
 * unreachable in the app** — the claim families («z1 מדומה טהור») were simply the first to expose it.
 *
 * The class is the one #653 fixed one layer higher: two engines answering for the same surface. There
 * the *canvas* was v2 while the *fact list* was the prototype; here the *engine* is v2 while the
 * *input path* was still the prototype. So the seam moves rather than the symptom: the active engine
 * decides whether a line is accepted, and the line list — which the store now owns outright — is what
 * both engines read. That is also exactly what S7's cutover does when it deletes the prototype input
 * path ([ADR-CX-008](../../docs/06d-decisions-complex.md#adr-cx-008)), arriving early rather than as a
 * separate concern.
 *
 * ## What this store does NOT do (ADR-CX-023)
 *
 * It does not decide whether a v2 line is acceptable. That is the acceptance gate, and it needs the
 * fold — which is reached through `deriveLines`, which composes `parser` with `replay`, which the layer
 * guard permits in `app/` and nowhere else. So the v2 submit path lives in
 * [`app/submit.ts`](../app/submit.ts) and this store exposes the state it writes: `recordLine`,
 * `setError`, `resetSession`, `restoreView`. Session persistence went up with it, because replaying a
 * stored session IS a submit and cannot be a side effect of defining the state container.
 *
 * `addLine` below is the PROTOTYPE path only, and it is deleted whole by the cutover.
 */
import { create } from 'zustand';
import type { Cx } from '../value/value';
import { derive } from '../engine/model';
import { factNames, factRefs, IMPLICIT_COMPLEX_RE, type Fact } from '../model/fact';
import { rootsMode } from '../model/naming';
import { parseLine } from '../parser/parse';

/** Which engine owns the session. `v2` is the rebuild (#616); `proto` is the retiring C0 prototype. */
export type Engine = 'proto' | 'v2';

export type InputError =
  | { key: 'not-handled' | 'parse-error'; detail: string }
  | { key: 'duplicate-name'; detail: string }
  /** the new statement cannot hold together with the named earlier statement (#606) */
  | { key: 'incompatible'; detail: string }
  /**
   * The statement cannot hold at ALL — no earlier line explains it, so there is none to name.
   *
   * `|z1| = -5`, or a claim on the origin. `incompatible` with an empty detail would have printed
   * *"cannot hold together with: «»"*, which is an error message about internal state pretending to be
   * about a statement — the honesty invariant this product is built on forbids exactly that.
   */
  | { key: 'impossible'; detail: string }
  /** v2 read part of the line and could not account for the rest — it names the student's own words */
  | { key: 'unaccounted'; detail: string };

/** Save format (suffix `-complex.json`, the per-product convention): the SOURCE LINES in
 * order — loading replays them through the real parse path, so a saved session doubles as
 * a parser-drift net (the fixtures-first idea). */
export interface SavedSession {
  app: 'complex-builder';
  version: 1;
  lines: string[];
  freePos: Record<string, Cx>;
  seed: number;
  view: 'cart' | 'polar';
}

interface ComplexState {
  /** THE SOURCE OF TRUTH — the student's accepted lines, in entry order. */
  lines: string[];
  facts: Fact[];
  freePos: Record<string, Cx>;
  /** configuration seed — "show another configuration" bumps it and releases drag overrides */
  seed: number;
  view: 'cart' | 'polar';
  engine: Engine;
  lastError: InputError | null;
  setEngine: (e: Engine) => void;
  /** the PROTOTYPE submit path. v2's lives in `app/submit.ts`; this goes with the cutover */
  addLine: (raw: string) => boolean;
  removeFact: (id: string) => void;
  /** remove one line by its position — the v2 delete, which owns no fact ids */
  removeLine: (index: number) => void;
  setFree: (name: string, z: Cx) => void;
  setView: (v: 'cart' | 'polar') => void;
  nextConfig: () => void;
  clearAll: () => void;
  clearError: () => void;
  serialize: () => SavedSession;
  // --- what `app/submit.ts` writes: the store records, it does not decide ---
  /** an ACCEPTED v2 line, with the configuration the gate found for it */
  recordLine: (line: string, seed: number) => void;
  setError: (e: InputError) => void;
  resetSession: () => void;
  restoreView: (v: { freePos: Record<string, Cx>; seed: number; view: 'cart' | 'polar' }) => void;
}

export const useComplexStore = create<ComplexState>((set, get) => ({
  lines: [],
  facts: [],
  freePos: {},
  seed: 0,
  view: 'cart',
  engine: 'proto',
  lastError: null,

  setEngine: (engine) => set({ engine }),

  /**
   * THE PROTOTYPE SUBMIT PATH, and only it.
   *
   * v2's is `app/submit.ts` — it needs the fold to hold ADR-276's acceptance doctrine, and the fold is
   * a layer this store may not reach (ADR-CX-023). A v2 line arriving here would silently bypass the
   * gate, so it refuses to guess: the caller is `submitLine`, which routes by engine.
   */
  addLine: (raw) => {
    if (get().engine === 'v2') {
      throw new Error('addLine is the prototype path; a v2 line goes through app/submit.ts');
    }

    const res = parseLine(raw);
    if (!res.ok) {
      set({ lastError: { key: res.key, detail: res.detail ?? raw.trim() } });
      return false;
    }
    // One utterance may lower to several facts; stage them ALL, commit only if all pass —
    // a refused half would otherwise silently drop part of what the student stated.
    let working = get().facts;
    for (let fact of res.facts) {
      // stamp the roots mode: an already-existing letter means the equation CONSTRAINS it;
      // an enumeration whose indexed names are taken becomes an ANONYMOUS solution set
      if (fact.kind === 'roots') {
        const rf = fact;
        // One question, one answer: the v2 lowering asks `rootsMode` too, so the mode the store stamps
        // for the prototype's `factNames` and the mode the figure is built from cannot drift apart.
        const mentioned = new Set(
          working
            .filter((w) => !(w.kind === 'free' && w.implicit))
            .flatMap((w) => [...factNames(w), ...factRefs(w)]),
        );
        const mode = rootsMode(rf.varName, rf.n, mentioned, factRefs(rf).every((r) => mentioned.has(r)));
        fact = { ...rf, constrains: mode === 'constrain', anon: mode === 'anonymous' || undefined };
      }
      // stamp the sequence mode: exactly ONE unknown listed name becomes the DEFINED term
      if (fact.kind === 'seq') {
        const names = new Set(working.flatMap(factNames));
        const missing = fact.names.filter((n) => n !== 'o' && !names.has(n));
        fact = { ...fact, defines: missing.length === 1 ? missing[0] : undefined };
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
    // Acceptance gate (#606, the ADR-276 doctrine): a new statement must never break an
    // earlier one. If a previously-green check breaks (or an earlier fact newly errors),
    // retry a few configurations (mini config-search); if none satisfies everything, the
    // NEWEST statement is refused, naming the earlier statement it cannot hold with.
    const { facts: oldFacts, freePos, seed } = get();
    const before = derive(oldFacts, freePos, seed);
    const okBefore = Object.entries(before.checks)
      .filter(([, c]) => c.ok)
      .map(([id]) => id);
    const errBefore = new Set(Object.keys(before.errors));
    const oldIds = new Set(oldFacts.map((fc) => fc.id));
    let brokenFirst: string | undefined;
    for (let ds = 0; ds < 8; ds++) {
      const after = derive(working, freePos, seed + ds);
      const broken =
        okBefore.find((id) => after.checks[id] && !after.checks[id].ok) ??
        Object.keys(after.errors).find((id) => oldIds.has(id) && !errBefore.has(id));
      if (!broken) {
        set({ facts: working, lines: [...get().lines, raw.trim()], seed: seed + ds, lastError: null });
        return true;
      }
      if (ds === 0) brokenFirst = oldFacts.find((fc) => fc.id === broken)?.src;
    }
    set({ lastError: { key: 'incompatible', detail: brokenFirst ?? '' } });
    return false;
  },

  // Removing a fact removes the LINE that produced it — otherwise the source of truth would still
  // carry a statement the figure no longer shows, and the next save would resurrect it.
  removeFact: (id) =>
    set(({ facts, lines }) => {
      const gone = facts.find((f) => f.id === id);
      const rest = facts.filter((f) => f.id !== id);
      const orphaned = gone !== undefined && !rest.some((f) => f.src === gone.src);
      const idx = orphaned ? lines.indexOf(gone.src) : -1;
      return { facts: rest, lines: idx >= 0 ? lines.filter((_, i) => i !== idx) : lines };
    }),

  removeLine: (index) => set(({ lines }) => ({ lines: lines.filter((_, i) => i !== index) })),
  setFree: (name, z) => set(({ freePos }) => ({ freePos: { ...freePos, [name]: z } })),
  setView: (view) => set({ view }),
  // a new configuration = fresh samples for every free DOF; drag overrides are part of the
  // OLD configuration and are released (the sibling "show another configuration" semantics)
  nextConfig: () => set(({ seed }) => ({ seed: seed + 1, freePos: {} })),
  clearAll: () => set({ lines: [], facts: [], freePos: {}, seed: 0, lastError: null }),
  clearError: () => set({ lastError: null }),

  serialize: () => {
    const { lines, freePos, seed, view } = get();
    return { app: 'complex-builder', version: 1, lines: [...lines], freePos, seed, view };
  },

  recordLine: (line, seed) =>
    set(({ lines }) => ({ lines: [...lines, line], seed, lastError: null })),
  setError: (lastError) => set({ lastError }),
  resetSession: () => set({ lines: [], facts: [], freePos: {}, seed: 0, lastError: null }),
  restoreView: ({ freePos, seed, view }) => set({ freePos, seed, view }),
}));
