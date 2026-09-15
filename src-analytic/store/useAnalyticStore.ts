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
import type { LoadAudit } from '../../shell/save';

/**
 * WHOSE save file this is, and which format (#1087).
 *
 * The app id is what makes a foreign file refusable BY NAME — a 2-D save says it belongs to the
 * plane builder rather than "not a save file", which is the difference between a message that helps
 * and one that blames the student.
 */
export const ANALYTIC_APP = 'analytic-builder';
export const ANALYTIC_SAVE_VERSION = 1;

/** What a saved session holds — the lines, and the little that is not derivable from them. */
export interface SavedAnalyticSession {
  app: string;
  version: number;
  lines: string[];
  seed: number;
  name?: string;
}

export type InputError =
  /** No rule matched — the LLM-escalation seam. */
  | { key: 'not-handled'; detail: string }
  /** A rule matched and its equation would not parse. */
  | { key: 'bad-equation'; detail: string }
  /** Understood, and deliberately outside this product's scope (a rotated conic, a hyperbola). */
  | { key: 'out-of-scope'; detail: string }
  /** `x` or `y` used as a point's unknown — they are the plane's own variables (#1039). */
  | { key: 'reserved-coordinate'; detail: string }
  /** A shape noun and a vertex count that disagree (#1042). */
  | { key: 'bad-arity'; detail: string }
  /** One label used for two vertices of the same figure (#1042). */
  | { key: 'repeated-vertex'; detail: string }
  /** A relation whose verb was understood and whose operand was not (#1052). */
  | { key: 'bad-operand'; detail: string }
  /** The statement contradicts what an earlier statement already fixed. */
  | { key: 'conflicting-restatement'; detail: string }
  /**
   * One name used for two kinds of object — carrying WHAT the name already holds (#1046), so the
   * message can show the student the collision instead of blaming their choice of letter.
   */
  | { key: 'name-kind-clash'; detail: string; existing?: string }
  /** A construction that refers to a point the figure does not have yet (#1028). */
  | { key: 'unknown-reference'; detail: string }
  /** A construct that cannot exist in this figure, which has no freedom left to try (#1058). */
  | { key: 'does-not-exist'; detail: string; existing?: string }
  /** A vertex that does not name an angle on its own — no shape through it, or several (#1049). */
  | { key: 'ambiguous-angle'; detail: string }
  /** A shape named by its noun alone, where the figure has no such shape or several (#1049). */
  | { key: 'ambiguous-shape'; detail: string }
  /** «האלכסון הראשי» where the shape distinguishes no principal diagonal (#1070). */
  | { key: 'undistinguished-diagonal'; detail: string }
  /** A given the figure cannot satisfy (#1016). */
  | { key: 'unsatisfiable'; detail: string }
  /**
   * A save file this tool will not load (#1087) — and WHICH of the three reasons, because they send
   * the student to three different places: another builder's file, a newer version of this one, or
   * something that is not a save file at all.
   */
  | { key: 'load-foreign'; detail: string }
  | { key: 'load-newer'; detail: string }
  | { key: 'load-unreadable'; detail: string };

interface AnalyticState {
  /** The student's lines, in order. The one source of truth. */
  lines: string[];
  /**
   * The figure's NAME (#1087) — what a save is called, and nothing else.
   *
   * It is not a given and never reaches the parser: naming a drawing is not a statement about it.
   */
  name: string;
  /** What a LOAD did, when it refused or changed something — the banner's content (#1087). */
  loadAudit: LoadAudit | null;
  /** Which sampled configuration is drawn — «הציגו תצורה אחרת» advances it (ADR-052). */
  seed: number;
  error: InputError | null;
  /**
   * An informational answer, not a refusal (#1045) — the student restated something the figure
   * already holds. They were RIGHT; the line simply adds nothing, so it is not recorded and this
   * says so. Kept separate from `error` because rendering it in the error slot would teach a
   * student that a correct restatement is a mistake.
   */
  notice: string | null;

  recordLine: (line: string) => void;
  removeLine: (index: number) => void;
  replaceLine: (index: number, next: string) => void;
  clearAll: () => void;
  /**
   * Move to a configuration the caller has CHOSEN (#1084).
   *
   * It used to increment the seed here, which is the store deciding what "another configuration"
   * means — and it does not have the figure to decide it with. Finding a seed whose figure actually
   * differs needs the derivation, so the submit layer picks and this records.
   */
  goToSeed: (seed: number) => void;
  setError: (e: InputError | null) => void;
  setName: (name: string) => void;
  setLoadAudit: (audit: LoadAudit | null) => void;
  /**
   * The session, for a save file (#1087).
   *
   * **The LINES are the whole of it.** No position and no parameter value is stored — the figure is
   * re-derived by re-parsing them — so a saved file replays through the real parse path and is
   * therefore also a parser-drift net: a save that stops loading is a grammar that changed under a
   * student's own work.
   */
  serialize: () => SavedAnalyticSession;
  /** Replace the session with a loaded one. */
  restore: (session: { lines: string[]; seed?: number; name?: string }) => void;
  setNotice: (n: string | null) => void;
}

export const useAnalyticStore = create<AnalyticState>((set, get) => ({
  lines: [],
  seed: 0,
  name: '',
  loadAudit: null,
  error: null,
  notice: null,

  recordLine: (line) => set((s) => ({ lines: [...s.lines, line], error: null, notice: null })),
  removeLine: (index) => set((s) => ({ lines: s.lines.filter((_, i) => i !== index), error: null, notice: null })),
  replaceLine: (index, next) =>
    set((s) => ({ lines: s.lines.map((l, i) => (i === index ? next : l)), error: null, notice: null })),
  clearAll: () => set({ lines: [], error: null, notice: null, seed: 0, name: '', loadAudit: null }),
  goToSeed: (seed) => set({ seed, error: null, notice: null }),
  setError: (error) => set({ error, notice: null }),
  setNotice: (notice) => set({ notice, error: null }),
  setName: (name) => set({ name }),
  setLoadAudit: (loadAudit) => set({ loadAudit }),

  serialize: () => {
    const { lines, seed, name } = get();
    return {
      app: ANALYTIC_APP,
      version: ANALYTIC_SAVE_VERSION,
      lines: [...lines],
      seed,
      ...(name.trim() ? { name: name.trim() } : {}),
    };
  },

  restore: ({ lines, seed, name }) =>
    set({ lines: [...lines], seed: seed ?? 0, name: name ?? '', error: null, notice: null }),
}));
