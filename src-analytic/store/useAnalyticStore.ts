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
import { temporal } from 'zundo';
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
/** The envelope spec every analytic loader reads with — file, link and restored session alike, so the
 *  shared statement ceiling (#1379) cannot be forgotten by one of them. */
export const ANALYTIC_ENVELOPE = { app: ANALYTIC_APP, maxVersion: ANALYTIC_SAVE_VERSION, statements: 'lines' } as const;

/** What a saved session holds — the lines, and the little that is not derivable from them. */
export interface SavedAnalyticSession {
  app: string;
  version: number;
  lines: string[];
  seed: number;
  name?: string;
}

/**
 * A QUESTION THE STUDENT ASKED (#1110) — the record, not the reading.
 *
 * The ask lane used to hold `Answer` objects in component state: a value computed once against one
 * `(facts, seed)` and then kept verbatim. Nothing invalidated them, so a length and an area survived
 * deleting every given AND «נקה הכל» — a stale measurement presented as current fact, which is the
 * honesty class this product exists to avoid.
 *
 * **An answer is a READING of a particular figure.** The moment the figure changes, the reading is
 * either stale or must be recomputed, and keeping it verbatim is the one option that is never right.
 * So what persists is the QUESTION; the answer is derived by the same fold as everything else, which
 * is the sibling invariant the rest of this store already obeys (complex does exactly this — its
 * `askRows` come from `queries`, which is why #1110 was analytic's alone).
 *
 * `shown` is the canvas half of ADR-AG-067's three gestures: the row is a record, the drawing is a
 * view of it, and hiding the drawing does not withdraw the question.
 */
export interface AskedQuestion {
  /** The student's own words — the key throughout, and what the measure menu offers. */
  sentence: string;
  /** Is this measurement's drawing on the canvas right now? */
  shown: boolean;
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
  /** A cevian whose apex lies on the side it is drawn to, or is its own foot (#1231). */
  | { key: 'degenerate-role'; detail: string }
  /** A cevian named by its triangle whose apex is not a vertex of that triangle (#1165). */
  | { key: 'apex-not-a-vertex'; detail: string }
  /** A crossing the student named that the figure already names — carrying WHO holds it (#1175). */
  | { key: 'crossing-already-named'; detail: string; holder: string }
  /** A crossing of a line with itself — «הישר AB עם הישר BA» names no point (#1255). */
  | { key: 'self-crossing'; detail: string }
  /**
   * The LLM fallback was THROTTLED, not confused (#1251) — a per-IP or daily cap.
   *
   * Its own key because it is not a statement about the student's sentence at all: telling them the
   * tool did not understand, when the tool never got to look, is the wrong thing in the one place
   * they find out what happened.
   */
  | { key: 'llm-busy'; detail: string }
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
  | { key: 'unknown-reference'; detail: string; expected?: 'point' | 'line' | 'circle' | 'curve' }
  /** A construct that cannot exist in this figure, which has no freedom left to try (#1058). */
  | { key: 'does-not-exist'; detail: string; existing?: string }
  | { key: 'ring-contradicts-noun'; detail: string }
  /** A vertex that does not name an angle on its own — no shape through it, or several (#1049). */
  | { key: 'ambiguous-angle'; detail: string; example?: string }
  /** A shape named by its noun alone, where the figure has no such shape or several (#1049). */
  | { key: 'ambiguous-shape'; detail: string }
  /** «האלכסון הראשי» where the shape distinguishes no principal diagonal (#1070). */
  | { key: 'undistinguished-diagonal'; detail: string }
  /**
   * A naming of something that already has a name (#1153) — carrying WHO holds it.
   *
   * «P מרכז המעגל I» then «O מרכז המעגל I» used to mint a second point on top of the first.
   * The refusal names the holder so the student sees the collision, not a scolding about their letter.
   */
  | { key: 'already-named'; detail: string; holder?: string }
  /** A given the figure cannot satisfy (#1016). */
  | { key: 'unsatisfiable'; detail: string }
  /**
   * A save file this tool will not load (#1087) — and WHICH of the three reasons, because they send
   * the student to three different places: another builder's file, a newer version of this one, or
   * something that is not a save file at all.
   */
  | { key: 'load-foreign'; detail: string }
  | { key: 'load-newer'; detail: string }
  /** #1379 — over `shell/save`'s statement ceiling; `detail` is the file name */
  | { key: 'load-too-large'; detail: string }
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
  /**
   * THE ASK LANE'S RECORD (#1110) — the questions, newest first. The ANSWERS are derived from these
   * and the current derivation, never stored, so they cannot outlive the figure they describe.
   */
  queries: AskedQuestion[];

  recordLine: (line: string) => void;
  removeLine: (index: number) => void;
  replaceLine: (index: number, next: string) => void;
  clearAll: () => void;
  /**
   * Replace the question list. The GESTURES are decided in `app/answers.ts` and this records the
   * result — the store decides nothing, which is the invariant its own docblock opens with.
   */
  setQueries: (next: AskedQuestion[]) => void;
  /**
   * Move to a configuration the caller has CHOSEN (#1084).
   *
   * It used to increment the seed here, which is the store deciding what "another configuration"
   * means — and it does not have the figure to decide it with. Finding a seed whose figure actually
   * differs needs the derivation, so the submit layer picks and this records.
   */
  goToSeed: (seed: number) => void;
  /**
   * UNDO / REDO (#1098) — the row member this builder was missing.
   *
   * Cheaper here than anywhere else in the suite, and for the reason that also makes the save file a
   * drift net (ADR-AG-055): **the session IS the ordered line list and the figure is derived from
   * it.** There is no position, parameter value or solver state to roll back, so a history entry is
   * a list of strings plus the seed, and an undone figure is re-derived rather than restored.
   *
   * The seed rides along because it is what the student SAW — «הציגו תצורה אחרת» then undo must put
   * back the configuration they were looking at, not merely the facts (the E5/STO-5 lesson 2-D
   * records).
   */
  undo: () => void;
  redo: () => void;
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

export const useAnalyticStore = create<AnalyticState>()(
  temporal(
    (set, get) => ({
  lines: [],
  seed: 0,
  name: '',
  loadAudit: null,
  error: null,
  notice: null,

  queries: [],

  recordLine: (line) => set((s) => ({ lines: [...s.lines, line], error: null, notice: null })),
  removeLine: (index) => set((s) => ({ lines: s.lines.filter((_, i) => i !== index), error: null, notice: null })),
  replaceLine: (index, next) =>
    set((s) => ({ lines: s.lines.map((l, i) => (i === index ? next : l)), error: null, notice: null })),
  clearAll: () =>
    // The QUERIES go with the lines (#1110): a reading of a figure that no longer exists is a lie,
    // and «נקה הכל» is the clearest case of the figure no longer existing.
    set({ lines: [], error: null, notice: null, seed: 0, name: '', loadAudit: null, queries: [] }),

  /**
   * The three gestures, as store actions (ADR-AG-067's decisions, now over the stored record).
   *
   * Asking is IDEMPOTENT and always shows: typing a sentence means *tell me this*, and answering that
   * by hiding the answer would be the opposite of what was asked. Only clicking a lit menu entry is
   * the toggle. Neither one evaluates anything here — the value is derived — so hiding a drawing
   * cannot cost a solve, which ADR-AG-067 had to assert and this shape makes structural.
   */
  setQueries: (next) => set({ queries: next }),
  goToSeed: (seed) => set({ seed, error: null, notice: null }),

  /**
   * The temporal wrappers. They clear the transient surfaces too: an error or notice is about the
   * line the student just typed, and stepping away from that line must not leave its message behind.
   */
  undo: () => {
    useAnalyticStore.temporal.getState().undo();
    set({ error: null, notice: null });
  },
  redo: () => {
    useAnalyticStore.temporal.getState().redo();
    set({ error: null, notice: null });
  },
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
    }),
    {
      /**
       * The history slice is the SESSION and nothing else (#1098).
       *
       * `lines` is the source of truth and `seed` is the configuration the student was looking at;
       * everything else here is transient UI — an error, a notice, a load audit — and rolling those
       * back would make undo restore a message about a line that no longer exists.
       *
       * `name` is deliberately OUT: naming a drawing is not a construction step, which is the same
       * call 2-D made for `figureName`.
       */
      // The QUERIES ride along (#1110): undo must put back what the student was reading, not only the
      // figure — the same argument that puts `seed` here (E5/STO-5).
      partialize: (s) => ({ lines: s.lines, seed: s.seed, queries: s.queries }) as AnalyticState,
      // Without this, setting an error would push a history entry and undo would appear to do nothing.
      equality: (a, b) => a.lines === b.lines && a.seed === b.seed && a.queries === b.queries,
      limit: 100,
    },
  ),
);
