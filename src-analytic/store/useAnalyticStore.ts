/**
 * The session store.
 *
 * **The ordered list of the student's LINES is the source of truth** — the sibling invariant,
 * carried over unchanged. The figure is derived by re-parsing and re-folding them, so no position
 * and no parameter value is ever stored, undo cannot desync, and a saved session replays through
 * the real parse path (which makes the save file double as a parser-drift net).
 *
 * The store decides nothing. Whether a line is acceptable is the submit path's question
 * (`app/submit.ts`), because deciding needs the fold; this holds the state that path writes.
 */
import { create } from 'zustand';

export type InputError =
  /** No rule matched — the LLM-escalation seam. */
  | { key: 'not-handled'; detail: string }
  /** A rule matched and its equation would not parse. */
  | { key: 'bad-equation'; detail: string }
  /** Understood, and deliberately outside this product's scope (a rotated conic, a hyperbola). */
  | { key: 'out-of-scope'; detail: string }
  /** The statement contradicts what an earlier statement already fixed. */
  | { key: 'conflicting-restatement'; detail: string }
  /** A second parabola or ellipse — the anonymous conics are one per figure (D6). */
  | { key: 'conic-slot-taken'; detail: string }
  /** One name used for two kinds of object. */
  | { key: 'name-kind-clash'; detail: string };

interface AnalyticState {
  /** The student's lines, in order. The one source of truth. */
  lines: string[];
  /** Which sampled configuration is drawn — «הציגו תצורה אחרת» advances it (ADR-052). */
  seed: number;
  error: InputError | null;

  recordLine: (line: string) => void;
  removeLine: (index: number) => void;
  replaceLine: (index: number, next: string) => void;
  clearAll: () => void;
  nextConfiguration: () => void;
  setError: (e: InputError | null) => void;
}

export const useAnalyticStore = create<AnalyticState>((set) => ({
  lines: [],
  seed: 0,
  error: null,

  recordLine: (line) => set((s) => ({ lines: [...s.lines, line], error: null })),
  removeLine: (index) => set((s) => ({ lines: s.lines.filter((_, i) => i !== index), error: null })),
  replaceLine: (index, next) =>
    set((s) => ({ lines: s.lines.map((l, i) => (i === index ? next : l)), error: null })),
  clearAll: () => set({ lines: [], error: null, seed: 0 }),
  nextConfiguration: () => set((s) => ({ seed: s.seed + 1 })),
  setError: (error) => set({ error }),
}));
