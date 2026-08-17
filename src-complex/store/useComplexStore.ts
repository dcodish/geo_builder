/**
 * The session store.
 *
 * **The ordered list of the student's LINES is the source of truth.** The figure and its labels are
 * derived from it, so positions are never stored, undo cannot desync, and a saved session replays
 * through the real parse path.
 *
 * ## What this store does NOT do (ADR-CX-023)
 *
 * It does not decide anything. Whether a line is acceptable is the acceptance gate's question, and the
 * gate needs the fold — reached through `deriveLines`, which composes `parser` with `replay`, which the
 * layer guard permits in `app/` and nowhere else. So the submit path lives in
 * [`app/submit.ts`](../app/submit.ts) and this store exposes the state it writes: `recordLine`,
 * `setError`, `resetSession`, `restoreView`. Session persistence went up with it, because replaying a
 * stored session IS a submit and cannot be a side effect of defining the state container.
 *
 * It held a second, PROTOTYPE submit path until the cutover
 * ([ADR-CX-027](../../docs/06d-decisions-complex.md#adr-cx-027)) — `addLine`, a `Fact[]` beside the
 * lines, and an `engine` flag routing between them. That arrangement made the prototype parser the
 * gatekeeper of the input box: a line it refused never became a fact, so every form the v2 grammar
 * added beyond the prototype's was unreachable in the app (#658). One input path is the fix, and the
 * cutover is what makes it true rather than merely intended.
 */
import { create } from 'zustand';
import type { LoadAudit } from '../../shell/save';
import type { Cx } from '../value/value';

export type InputError =
  | { key: 'not-handled' | 'parse-error'; detail: string }
  | { key: 'duplicate-name'; detail: string }
  /** the loaded file belongs to another builder — its `app` marker is named (shell/save envelope) */
  | { key: 'wrong-app'; detail: string }
  /** the loaded file was saved by a NEWER app version — refused rather than half-loaded */
  | { key: 'newer-version'; detail: string }
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
  freePos: Record<string, Cx>;
  /** configuration seed — "show another configuration" bumps it and releases drag overrides */
  seed: number;
  view: 'cart' | 'polar';
  lastError: InputError | null;
  /** The load audit (ADR-242, via shell/save): what the last load could NOT restore — the report
   *  the App shows so a dropped line is never silent. Null = nothing to report. */
  loadAudit: LoadAudit<InputError> | null;
  /** remove one line by its position — a row owns no fact id */
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
  setLoadAudit: (a: LoadAudit<InputError> | null) => void;
  resetSession: () => void;
  restoreView: (v: { freePos: Record<string, Cx>; seed: number; view: 'cart' | 'polar' }) => void;
}

export const useComplexStore = create<ComplexState>((set, get) => ({
  lines: [],
  freePos: {},
  seed: 0,
  view: 'cart',
  lastError: null,
  loadAudit: null,

  removeLine: (index) => set(({ lines }) => ({ lines: lines.filter((_, i) => i !== index) })),
  setFree: (name, z) => set(({ freePos }) => ({ freePos: { ...freePos, [name]: z } })),
  setView: (view) => set({ view }),
  // a new configuration = fresh samples for every free DOF; drag overrides are part of the
  // OLD configuration and are released (the sibling "show another configuration" semantics)
  nextConfig: () => set(({ seed }) => ({ seed: seed + 1, freePos: {} })),
  clearAll: () => set({ lines: [], freePos: {}, seed: 0, lastError: null, loadAudit: null }),
  clearError: () => set({ lastError: null }),

  serialize: () => {
    const { lines, freePos, seed, view } = get();
    return { app: 'complex-builder', version: 1, lines: [...lines], freePos, seed, view };
  },

  recordLine: (line, seed) =>
    set(({ lines }) => ({ lines: [...lines, line], seed, lastError: null })),
  setError: (lastError) => set({ lastError }),
  setLoadAudit: (loadAudit) => set({ loadAudit }),
  resetSession: () => set({ lines: [], freePos: {}, seed: 0, lastError: null, loadAudit: null }),
  restoreView: ({ freePos, seed, view }) => set({ freePos, seed, view }),
}));
