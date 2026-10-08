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
import { ingestTypedText } from '../../shell/bidi';
import { cleanSegDisplay, toggleSegFlag, type SegDisplayMap } from '../../shell/frame/segmentDisplay';
import type { RefKind } from '../engine/names';

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
  /** Per line INDEX: the student's own sentence, where the line was built by the AI fallback
   *  (#1297). The stored line stays the machine spelling — replay is pure over the lines — and
   *  this is what the row DISPLAYS, so no model output is ever shown as the row. */
  spokenFor?: Record<number, string>;
  /** #1548 — the MUTED lines' indexes (the D6 disable operation). Omitted when none, so a save
   *  from before this field loads unchanged. A muted line is saved and loads muted. */
  disabled?: number[];
  /** #1631 — the seed-name map a letter change leaves (`Construction.seedNames`), so a renamed free
   *  vertex loads where it was drawn. Omitted when empty — every save from before it loads unchanged. */
  seedNames?: Record<string, string>;
  /** #1653 — the per-segment display choices (hidden, dashed), keyed by `segKey` (the endpoint pair).
   *  Omitted when none, so every save from before it loads unchanged. */
  segStyle?: SegDisplayMap;
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
  /**
   * #1888 / #1889 (ADR-AG-251, ADR-W-120) — the line LOSES A PART: a part the reading never read. Refused whole with the
   * one-input-per-line message, `parts` in the student's words; `teach` when the lost part is a right triangle's vertex.
   */
  | { key: 'split-statements'; detail: string; parts: string[]; teach?: { triangle: string; angle: string } }
  /** A rule matched and its equation would not parse. */
  | { key: 'bad-equation'; detail: string }
  /** Understood, and deliberately outside this product's scope (a rotated conic, a hyperbola). */
  | { key: 'out-of-scope'; detail: string }
  /** A claim to PROVE, never a given (#1618; the shared rule since #1666, `shell/proofTarget`) — `detail` is the proof sentence. */
  | { key: 'proof-target'; detail: string }
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
  /** An angle bisector that does not start at its angle's vertex (#1284, ADR-AG-209). */
  | { key: 'bisector-wrong-apex'; detail: string }
  | { key: 'length-xy'; detail: string }
  /** A domain stated for x or y — «y = 2x + 1, x > 0»: a restriction on the curve, which the tool cannot draw (#1832, ADR-AG-246). */
  | { key: 'coordinate-restriction'; detail: string }
  /** A cevian whose target the figure leaves open — the apex (or side) in several triangles (#1240, ADR-AG-209). */
  | { key: 'ambiguous-cevian'; detail: string }
  /** A cevian whose apex (or side) is in no triangle of the figure (#1240, ADR-AG-209). */
  | { key: 'cevian-no-triangle'; detail: string }
  /** «תיכון ליתר» with the right angle open, or several right triangles — asks which side is the hypotenuse (#1222). */
  | { key: 'ambiguous-hypotenuse'; detail: string }
  /** «תיכון ליתר» with no right angle in the figure (#1222). */
  | { key: 'ambiguous-no-right-angle'; detail: string }
  /** A crossing the student named that the figure already names — carrying WHO holds it (#1175). */
  | { key: 'crossing-already-named'; detail: string; holder: string; operands?: [string, string] }
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
  // #1336: the escape ran and the tool declined its completion — understood, not unintelligible.
  | { key: 'llm-understood-unsupported'; detail: string }
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
  /**
   * `nearMiss` (#1750): the figure has a name the student's is a near miss of («l1» for «1»), and the sentence with
   * `suggest` in it records — the message names it. Set by the submit decision only.
   */
  | { key: 'unknown-reference'; detail: string; expected?: RefKind; nearMiss?: { suggest: string; existing: readonly string[] } }
  /**
   * The noun and the equation name different families (02c R7, #1514 pre-play) — «פרבולה I שמשוואתה
   * x^2+y^2=16». `existing` is what the equation describes (`curve:<kind>`), `expected` the noun written.
   */
  | { key: 'kind-mismatch'; detail: string; existing?: string; expected?: RefKind }
  /** A construct that cannot exist in this figure, which has no freedom left to try (#1058). */
  | { key: 'does-not-exist'; detail: string; existing?: string }
  | { key: 'ring-contradicts-noun'; detail: string }
  /** #1849 (ADR-AG-247) — the givens flatten a declared polygon: its name, its noun (registry key) and its declaring sentence. */
  | { key: 'polygon-collapsed'; detail: string; polygon?: string; shape?: string; declared?: string }
  /** #1554 ruling 1 (ADR-AG-198) — a noun no circle can pass around, said to be inscribed: both nouns, registry keys. */
  | { key: 'inscribed-contradicts-noun'; detail: string; shape?: string; forced?: string }
  /** #1918 (ADR-AG-252) — the same, across two sentences: both nouns (registry keys) and the OTHER sentence, as typed. */
  | { key: 'inscribed-contradicts-declared'; detail: string; shape?: string; forced?: string; declared?: string }
  /** A vertex that does not name an angle on its own — no shape through it, or several (#1049). */
  | { key: 'ambiguous-angle'; detail: string; example?: string; options?: string[] }
  /** A shape named by its noun alone, where the figure has no such shape or several (#1049). */
  | { key: 'ambiguous-shape'; detail: string; host?: { kind: string; found: number; need?: number; candidates?: string[] } }
  /** «ישר I» where the figure's line is «ישר 1» (ruling 2026-09-29): typed numeral, the one in use, the kind. */
  | { key: 'numeral-notation'; detail: string; holder?: string; expected?: RefKind }
  /** #1432 am. 1 — a stated value outside its symbol's domain («רדיוס המעגל הוא -3»), with the bound. */
  | { key: 'out-of-domain'; detail: string; domain?: { min?: number; minOpen?: boolean; max?: number; maxOpen?: boolean; exclude?: number[] } }
  /** «האלכסון הראשי» where the shape distinguishes no principal diagonal (#1070). */
  | { key: 'undistinguished-diagonal'; detail: string }
  /** «האלכסונים AB ו-CD» where the quadrilateral makes them sides (#1620, ADR-AG-208). */
  | { key: 'not-a-diagonal'; detail: string }
  /** «מלבן ABCD שצלעו 4» — «its side» on a shape whose sides are not all equal: which side? (#1622, ADR-AG-217). */
  | { key: 'ambiguous-side'; detail: string }
  /** «משובע ABCDEFG» — a polygon noun built only when regular (#1622, ADR-AG-217; 2-D's #835). */
  | { key: 'polygon-not-supported'; detail: string }
  /**
   * A naming of something that already has a name (#1153) — carrying WHO holds it.
   *
   * «P מרכז המעגל I» then «O מרכז המעגל I» used to mint a second point on top of the first.
   * The refusal names the holder so the student sees the collision, not a scolding about their letter.
   */
  | { key: 'already-named'; detail: string; holder?: string }
  /** «נסמן זוית MAC כ-A1» where A1 already names another angle, or a point (#1622 E5, ADR-AG-221) — `holder` is the label. */
  | { key: 'alias-taken'; detail: string; holder?: string }
  /**
   * A RENAME the tool understood and declined (#1154) — each names what the student wrote. `detail` is
   * the letter (or, for `rename-unsafe`, the line that could not be rewritten faithfully; empty when
   * the figure's own tool-chosen names would have shifted). `holder` is the student's line that
   * already holds a taken letter, or the letter being renamed for `rename-unsafe`.
   */
  | { key: 'rename-bad-name'; detail: string }
  | { key: 'rename-same'; detail: string }
  | { key: 'rename-unknown'; detail: string }
  | { key: 'rename-taken'; detail: string; holder?: string }
  | { key: 'rename-not-typed'; detail: string }
  | { key: 'rename-unsafe'; detail: string; holder: string }
  /**
   * A SWAP the tool understood and declined (#1303, #1631) — the rename's refusals, for two letters.
   * `swap-unsafe` carries both letters (`holder`, `other`) and, in `detail`, the line that could not be
   * rewritten faithfully (empty when the figure's own tool-chosen names would have shifted).
   */
  | { key: 'swap-bad-name'; detail: string }
  | { key: 'swap-same'; detail: string }
  | { key: 'swap-unknown'; detail: string }
  | { key: 'swap-not-typed'; detail: string }
  | { key: 'swap-unsafe'; detail: string; holder: string; other: string }
  /** A given the figure cannot satisfy (#1016). #1423: when the refused line RESTATES an existing
   *  letter, `reusedId` names it and `definedBy` carries the student's own line that defines it —
   *  the refusal then says the letter is the problem, with the fresh-letter remedy. */
  | { key: 'unsatisfiable'; detail: string; reusedId?: string; definedBy?: string }
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

/** What a letter change (rename or swap) commits in ONE set — `app/rename.ts` `RelabelCommit`. */
export interface LetterCommit {
  lines: string[];
  queries: AskedQuestion[];
  spokenFor: Record<number, string>;
  seedNames: Record<string, string>;
  /** #1653 — the segment display map under the new letters; absent = unchanged. */
  segStyle?: SegDisplayMap;
}

interface AnalyticState {
  /** The student's lines, in order. The one source of truth. */
  lines: string[];
  /** #1297 — see {@link SavedAnalyticSession.spokenFor}. Keys follow the lines' indices. */
  spokenFor: Record<number, string>;
  /**
   * THE MUTED LINES (#1548, docs/28 D6) — indexes into `lines`, the complex shape.
   *
   * Disable answers *"what if I hadn't said this?"*: the row stays, the figure is folded without it.
   * `lines` stays the whole session and every figure consumer reads the ACTIVE projection
   * (`app/active.ts`), so a muted line can never half-reach the fold. Whether a line may come BACK is
   * the submit path's question (`decideToggle`) — this records the answer.
   */
  disabled: number[];
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

  /**
   * Record an accepted line. `notice` is what the SAME commit shows (#1350): recording clears the
   * transient surfaces, so a notice earned by the line it rides on must travel with it, never be set
   * before it.
   */
  recordLine: (line: string, notice?: string | null) => void;
  removeLine: (index: number) => void;
  replaceLine: (index: number, next: string) => void;
  /** #1548 — record the muted set the submit path decided on. */
  setDisabled: (disabled: number[]) => void;
  /**
   * #1154 — record a RENAME the submit path decided on (`app/rename.ts`): the rewritten lines, the ask
   * rows and the AI-lane display sentences, in ONE commit — so one undo puts back the letter, the
   * givens and the data panel together, and the two can never disagree about what a letter is. The
   * seed and the muted set are untouched: a letter is a name, not a configuration, and no row moved.
   */
  applyRename: (next: LetterCommit) => void;
  /**
   * #1303 / #1631 — record a SWAP the submit path (or the popover) decided on (`app/rename.ts`
   * `decideSwap`): the same one-commit contract as `applyRename` — one undo step, seed kept.
   */
  applySwap: (next: LetterCommit) => void;
  /**
   * #1631 — WHICH NAME SEEDS EACH FREE VERTEX (`Construction.seedNames`): a letter change transposes it,
   * so the renamed vertex is drawn where it was. Empty until a letter changes; saved with the lines.
   */
  seedNames: Record<string, string>;
  /**
   * #1653 — THE STUDENT'S SEGMENT DISPLAY CHOICES (2-D's FR-RN-10 `segStyle`): hidden and/or dashed, keyed
   * by the endpoint pair (`render/scene.ts` `segKey`). A display preference, not a given — a hidden
   * segment is still in the figure for every reference, measurement and question. It rides in the undo
   * slice (one «בטל» restores a hide, as the ask lane's `shown` does) and in the save file.
   */
  segStyle: SegDisplayMap;
  /** Flip one segment's hidden / dashed flag — the shared `toggleSegFlag` (`shell/frame/segmentDisplay`). */
  toggleSegHidden: (key: string) => void;
  toggleSegDashed: (key: string) => void;
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
  restore: (session: { lines: string[]; seed?: number; name?: string; spokenFor?: Record<number, string>; disabled?: number[]; seedNames?: Record<string, string>; segStyle?: unknown }) => void;
  /** Record the fallback's machine lines under the student's OWN sentence (#1297). */
  /** `notice` travels in the commit, as `recordLine`'s does (#1350). */
  recordLlmLines: (spoken: string, lines: string[], notice?: string | null) => void;
  setNotice: (n: string | null) => void;
}

/** One letter change, as one set — lines, ask rows, display sentences, seed names (#1154, #1631). */
const letterCommit = ({ lines, queries, spokenFor, seedNames, segStyle }: LetterCommit) => ({
  lines: lines.map(ingestTypedText),
  queries: [...queries],
  spokenFor: { ...spokenFor },
  seedNames: { ...seedNames },
  ...(segStyle ? { segStyle: { ...segStyle } } : {}),
  error: null,
  notice: null,
});

/** A loaded seed-name map, kept only as letter → letter strings (a hand-edited file cannot inject anything else). */
function cleanSeedNames(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const NAME = /^[A-Z][0-9₀-₉]?$/;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => NAME.test(e[0]) && typeof e[1] === 'string' && NAME.test(e[1])),
  );
}

/**
 * #1632 (ADR-AG-199) — the AI lane's display sentences from a saved file, kept only where they can be
 * true: a key that names a LINE of this file (an integer index in range) and a string value. A
 * hand-edited or truncated file cannot attach a sentence to a ghost row — the #1548 rule for `disabled`.
 */
function cleanSpokenFor(raw: unknown, lineCount: number): Record<number, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const i = Number(k);
    if (/^\d+$/.test(k) && i < lineCount && typeof v === 'string' && v.trim()) out[i] = v;
  }
  return out;
}

export const useAnalyticStore = create<AnalyticState>()(
  temporal(
    (set, get) => ({
  lines: [],
  spokenFor: {},
  disabled: [],
  seedNames: {},
  segStyle: {},
  seed: 0,
  name: '',
  loadAudit: null,
  error: null,
  notice: null,

  queries: [],

  // #1348 (ADR-W-095): the store-side ingest (ADR-W-029) — every line this store records passes it
  recordLine: (line, notice = null) => set((s) => ({ lines: [...s.lines, ingestTypedText(line)], error: null, notice })),
  recordLlmLines: (spoken, ls, notice = null) =>
    set((s) => {
      const spokenFor = { ...s.spokenFor };
      ls.forEach((_, k) => {
        spokenFor[s.lines.length + k] = ls.length > 1 ? `${spoken} (${k + 1}/${ls.length})` : spoken;
      });
      return { lines: [...s.lines, ...ls.map(ingestTypedText)], spokenFor, error: null, notice };
    }),
  removeLine: (index) =>
    set((s) => {
      const spokenFor: Record<number, string> = {};
      for (const [k, v] of Object.entries(s.spokenFor)) {
        const i = Number(k);
        if (i < index) spokenFor[i] = v;
        else if (i > index) spokenFor[i - 1] = v; // keys follow their lines when an earlier row goes
      }
      // #1548: the muted indexes name POSITIONS, so they shift with their lines too (complex's rule)
      const disabled = s.disabled.filter((d) => d !== index).map((d) => (d > index ? d - 1 : d));
      return { lines: s.lines.filter((_, i) => i !== index), spokenFor, disabled, error: null, notice: null };
    }),
  replaceLine: (index, next) =>
    set((s) => {
      // An EDITED row shows what the student typed into the editor — the annotation is stale.
      const { [index]: _gone, ...spokenFor } = s.spokenFor;
      return { lines: s.lines.map((l, i) => (i === index ? ingestTypedText(next) : l)), spokenFor, error: null, notice: null };
    }),
  setDisabled: (disabled) => set({ disabled: [...disabled].sort((a, b) => a - b), error: null, notice: null }),
  applyRename: (next) => set(letterCommit(next)),
  applySwap: (next) => set(letterCommit(next)),
  toggleSegHidden: (key) => set((s) => ({ segStyle: toggleSegFlag(s.segStyle, key, 'hidden') })),
  toggleSegDashed: (key) => set((s) => ({ segStyle: toggleSegFlag(s.segStyle, key, 'dashed') })),
  clearAll: () =>
    // The QUERIES go with the lines (#1110): a reading of a figure that no longer exists is a lie,
    // and «נקה הכל» is the clearest case of the figure no longer existing.
    set({ lines: [], spokenFor: {}, disabled: [], seedNames: {}, segStyle: {}, error: null, notice: null, seed: 0, name: '', loadAudit: null, queries: [] }),

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
    const { lines, seed, name, spokenFor, disabled, seedNames, segStyle } = get();
    return {
      app: ANALYTIC_APP,
      version: ANALYTIC_SAVE_VERSION,
      lines: [...lines],
      seed,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(Object.keys(spokenFor).length ? { spokenFor: { ...spokenFor } } : {}),
      ...(disabled.length ? { disabled: [...disabled] } : {}),
      ...(Object.keys(seedNames).length ? { seedNames: { ...seedNames } } : {}),
      ...(Object.keys(segStyle).length ? { segStyle: JSON.parse(JSON.stringify(segStyle)) as SegDisplayMap } : {}),
    };
  },

  restore: ({ lines, seed, name, spokenFor, disabled, seedNames, segStyle }) =>
    set({
      // #1653 — the segment display map, kept only as key → {hidden?, dashed?: true}
      segStyle: cleanSegDisplay(segStyle),
      lines: lines.map(ingestTypedText),
      spokenFor: cleanSpokenFor(spokenFor, lines.length),
      seedNames: cleanSeedNames(seedNames),
      // #1548: only indexes that name a line survive a restore — a hand-edited file cannot mute a ghost
      disabled: [...new Set(disabled ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d < lines.length).sort((a, b) => a - b),
      seed: seed ?? 0,
      name: name ?? '',
      error: null,
      notice: null,
    }),
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
      // The MUTED set rides along too (#1548): muting is a step the student took, so undo takes it back.
      // #1631: the AI lane's display sentences and the seed-name map ride along too. `spokenFor` is keyed
      // by line INDEX and written in the same set as the lines it annotates (record, remove, edit,
      // rename, swap) — left out, an undo restored the lines and kept the other half: a renamed letter
      // in a row whose given was put back, and after an undone delete every later annotation one row off.
      // `seedNames` is the same argument for where a renamed free vertex is drawn.
      // #1653: the segment display map rides along — a hide is a step the student took on the canvas, and the
      // operator's lock is «one «בטל» restores it» (the ask lane's `shown` is the same kind of choice, and is here).
      partialize: (s) =>
        ({ lines: s.lines, seed: s.seed, queries: s.queries, disabled: s.disabled, spokenFor: s.spokenFor, seedNames: s.seedNames, segStyle: s.segStyle }) as AnalyticState,
      // Without this, setting an error would push a history entry and undo would appear to do nothing.
      equality: (a, b) =>
        a.lines === b.lines && a.seed === b.seed && a.queries === b.queries && a.disabled === b.disabled &&
        a.spokenFor === b.spokenFor && a.seedNames === b.seedNames && a.segStyle === b.segStyle,
      limit: 100,
    },
  ),
);
