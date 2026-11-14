/**
 * The submit pipeline (S0.4 of docs/24) — the text → command[] orchestration, EXTRACTED from
 * App.tsx so it is directly testable (the docs/23 review found this 400-line path had zero direct
 * tests and was only hand-mirrored by the scenario harness).
 *
 * This is a FAITHFUL move of App's `submit()`: the store is the same singleton (`useGeoStore`),
 * and everything UI-side (notes, text field, the display view the parser context reads, post-commit
 * auto-resolve) is injected via {@link SubmitDeps}, with the work queue the submit runs on as a job (#2874). The pipeline owns the
 * ROUTING: store-ops (swap/rename/merge/name-centre) before the parser; the deterministic grammar
 * with the #186 circle auto-bind loop; the clarification refusals; the honesty-gate battery; the
 * dry-run gates; and the LLM second attempt with the same gate battery on its output (ADR-240).
 *
 * Ordering contracts preserved verbatim (each carries its original ADR/issue comment below):
 *  - store-ops run BEFORE the parser (a swap must never enter the figure as geometry);
 *  - `parseCtx` reads the DISPLAY view (the ADR-293 never-blank fallback), not the raw store;
 *  - the store is RE-READ after every await that can yield to user actions (the stale-commit race);
 *  - the honesty gates run on BOTH commit paths — a partial parse is never committed.
 */
import { buildParseCtx, droppedNewLabels } from '@/parser';
import { llmParse } from '@/parser/llm';
import { laneContext } from './laneContext';
import { askKeepingNames, nameRetryEvent } from '../../shell/llm/retryLostNames';
import { figureContext } from '@/parser/llmShared';
import { circleRefs, isGeoPoint } from '@/engine';
import type { AnyCommand, Construction, Id, Vec } from '@/engine';
import { nameByUseCommands, replay, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { geoJobs, storeData } from '@/store/geoWork';
import { actInWorker, applyActed, basisNow, viewArg } from './workerJobs';
import { type DecideLog, type DecideNote, decidePreParse } from './decideDeterministic';
import { logDebug } from '@/debug/sessionLog';
import { otherUtteranceForError } from './errorSubject';
import { renderNote } from './renderNote';
import { studentVocabulary } from './studentVocabulary';
import { boxAfterSubmit, splitSentences, submitSentences, type BoxUpdate, type SentenceOutcome } from '../../shell/sentences';
import type { Job, WorkQueue } from '../../shell/work';

export interface SubmitUi {
  setInputNote(msg: string): void;
  setRenameNote(msg: string): void;
  setLlmDropped(steps: string[]): void;
  /**
   * #2782 ([ADR-810](../../docs/06-decisions.md#adr-810), ADR-W-198): THE INPUT BOX, written as an update of what it
   * holds NOW — a React state setter fits. When it is given, the pipeline writes the box only through it, and only
   * while the box still holds the submitted text (`boxAfterSubmit`): a line the student typed during the wait is
   * never erased. A caller with an input box passes this; a headless driver passes `clearText`/`setText` instead.
   */
  editText?(update: BoxUpdate): void;
  /** Clear the input field (a successful submission). Unguarded — used only when `editText` is absent. */
  clearText?(): void;
  /**
   * #1611 (ADR-591, ADR-W-030): REPLACE the input text with a taught canonical sentence, so one Enter builds
   * what the note teaches. Optional — a caller with no input box (a headless driver) omits it. Unguarded — used
   * only when `editText` is absent.
   */
  setText?(text: string): void;
  /**
   * #1467 (ADR-769, ADR-W-162): the «נוצרה נקודה חדשה …» notice — the points the committed line created by reference,
   * and the row (its group key) whose removal is the notice's ✕. Null clears it. Optional: a headless driver omits it.
   */
  setCreatedNotice?(notice: CreatedNotice2D | null): void;
}

/** #1467 — what the created-points notice holds in 2-D: the labels, and the row the ✕ removes (in `commitLine.ts` since #2890). */
export type { CreatedNotice2D } from './commitLine';
export { commitVerdict } from './commitLine';
import { type CreatedNotice2D } from './commitLine';

export interface SubmitDeps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: 'he' | 'en';
  ui: SubmitUi;
  /** The DISPLAY view (construction+positions incl. the ADR-293 never-blank fallback) — what the
   *  parser context and the LLM figure context read. NOT necessarily the raw current replay. */
  view(): { construction: Construction; positions: Map<Id, Vec> };
  /**
   * #2874 (ADR-W-210 phase 1): THE WORK QUEUE. A submit is one job on it — the working indicator is the queue's
   * derived state, painted before the solve and released in a `finally`, so no exit of this pipeline can leave the
   * tool busy. While the queue works a submit is not taken (E3; Enter is off, ADR-W-198): chips and Enter cannot
   * race a second one. The App passes the page's queue; a test passes `createWorkQueue()`, whose paint resolves at once.
   */
  work: WorkQueue<unknown>;
  /**
   * #2362 ([ADR-748](../../docs/06-decisions.md#adr-748)): «הציגו מרכזי מעגלים» is on as the line is typed — the store's
   * display preference (ADR-059), read at the seam and written into the line's facts, never read by replay. Optional:
   * absent = off, the product default.
   */
  centresShown?(): boolean;
  /** The post-commit auto-resolve (worker config search + view rewrite, one undo entry). It belongs to the
   *  submit's job (`job.join`): the tool stays working until the search settles. A paragraph's chain awaits it
   *  before its next sentence (#1778), so the next sentence reads the figure the search settled. */
  resolveAfterCommit(): unknown;
  /** Shared abort slot so the UI's cancel button reaches the in-flight LLM call. */
  llmAbortRef: { current: AbortController | null };
  /** Humanized engine error + retry hint (display-layer concern, injected). `said` is the student's
   *  own sentence, which becomes the refusal's SUBJECT where the engine fragment cannot identify the
   *  rejected statement (#943, ADR-487). */
  explainError(raw: string | null | undefined, said?: string, other?: string): string;
}

/**
 * #1778 ([ADR-W-125](../../docs/06w-decisions-workspace.md#adr-w-125)) — THE BOX'S TEXT, which may be a pasted
 * PARAGRAPH. One sentence goes through the one-sentence pipeline exactly as before. Two or more («M אמצע BC. N
 * אמצע AC.») are submitted one at a time through that same pipeline (`shell/sentences`), each its own row,
 * and the chain stops at the first sentence the pipeline leaves in the box; the box then holds that sentence —
 * or its taught canonical — followed by the rest.
 */
export async function runSubmit(utterance: string, submitDeps: SubmitDeps): Promise<void> {
  const deps: BoxDeps = { ...submitDeps, ui: boxUi(submitDeps.ui, utterance) };
  if (deps.work.working()) return; // the tool is working (E3) — chips/enter can't race a second submit; the line stays in the box
  const sentences = splitSentences(utterance);
  if (!sentences) {
    const pre = openSentence(utterance, deps);
    if (pre === 'answered') return; // a format guide: answered at once, no solve, nothing to wait for
    return deps.work.run((job) => runSentence(utterance, deps, job, pre));
  }
  // a pasted paragraph is ONE student action: one job, its sentences in order inside it
  await deps.work.run(async (job) => {
    const box = await submitSentences(sentences, (text, i) => chainSentence(text, i, deps, job));
    if (box) deps.ui.setText?.(box);
    else deps.ui.clearText();
  });
}

/** The UI as the pipeline's sentences write it: the box's two writes always present. */
interface BoxUi extends SubmitUi {
  clearText(): void;
}
type BoxDeps = SubmitDeps & { ui: BoxUi };

/**
 * #2782 (ADR-810, ADR-W-198) — THE ONE PLACE the pipeline's writes reach the real box. Every exit of a submit — a
 * row, an answered store-op, a taught canonical, a paragraph's remainder — clears or replaces the box through here,
 * as an update of what the box holds when the submit FINISHES: only the text that was submitted is replaced. A
 * submit awaits (the geometry worker's first download, the model fallback) and Enter is off while it does, so a line
 * typed meanwhile sits in the box — and the clear that ended the first submit used to erase it.
 */
function boxUi(ui: SubmitUi, submitted: string): BoxUi {
  const edit = ui.editText;
  if (!edit) return { ...ui, clearText: () => ui.clearText?.() };
  return {
    ...ui,
    clearText: () => edit(boxAfterSubmit(submitted, '')),
    setText: (text: string) => edit(boxAfterSubmit(submitted, text)),
  };
}

/**
 * One sentence of a paragraph through {@link runSentence}, its outcome read from what the pipeline did to the
 * box: cleared it (a row, or an answered store-op) → consumed; pre-filled a taught canonical → that; neither →
 * kept. The REAL box is set once, by the chain, at the end. A later sentence reads the figure from the store —
 * the caller's display view is the one painted before the paste — and the post-commit search is awaited, so
 * it never sees a figure mid-rewrite.
 */
async function chainSentence(text: string, i: number, deps: BoxDeps, job: Job): Promise<SentenceOutcome> {
  let outcome: SentenceOutcome = 'kept';
  let settling: unknown = undefined;
  const storeView = () => {
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    return { construction: d.construction, positions: d.positions };
  };
  const own: BoxDeps = {
    ...deps,
    ui: {
      ...deps.ui,
      clearText: () => {
        outcome = 'consumed';
      },
      setText: (prefill: string) => {
        outcome = { prefill };
      },
    },
    view: i === 0 ? deps.view : storeView,
    resolveAfterCommit: () => {
      settling = deps.resolveAfterCommit();
    },
  };
  const pre = openSentence(text, own);
  if (pre !== 'answered') {
    if (i > 0) await job.paint(); // the rows a paragraph has built so far are painted before its next sentence solves
    await runSentence(text, own, job, pre);
  }
  await settling;
  return outcome;
}

/** A store operation the pre-parse read off the sentence (a swap, a rename, a merge, a centre's name). */
type StoreOp = Extract<NonNullable<ReturnType<typeof decidePreParse>>, { kind: 'store-op' }>;

/** The pipeline's log line for one sentence. */
const sentenceLog = (utterance: string, locale: 'he' | 'en') => (e: DecideLog) => logDebug({ kind: 'input', utterance, locale, ...e });

/**
 * #1849 (ADR-602): a refusal at the door names the OTHER side too, when the fold could name one. The dry run's
 * status carries the same `[vs #i]` tail the banner resolves (ADR-508), indexed into the committed facts the
 * trial array shares — so the note says «AC = 8» סותר את «משולש ABC» instead of «AC = 8» against "an earlier given".
 * #2173 (ADR-726): a step's second tip (`also`) is shown after the first, on the same line.
 * #2201 phase 3b (ADR-W-130 Am. 1): one rendering for both kinds of note (`renderNote`), and the key note's params
 * pass the same provenance check as a refusal's values, against the figure the student is looking at.
 */
const sentenceNote =
  (utterance: string, deps: BoxDeps) =>
  (n: DecideNote): string => {
    const facts = useGeoStore.getState().facts;
    return renderNote(n, {
      t: deps.t,
      said: utterance,
      explain: (raw) => deps.explainError(raw, utterance, otherUtteranceForError(useGeoStore.getState().facts, raw)),
      vocab: studentVocabulary(deps.view().construction, [...facts.filter((f) => f.enabled).map((f) => f.utterance), utterance]),
      circles: circleRefs(deps.view().construction), // #2305 M3 (ADR-760): a question's circles named by the seam
    });
  };

/**
 * THE DOOR of one sentence, before any job: the last line's notes are cleared, and the pre-parse runs. A FORMAT
 * guide (LaTeX, a negation) is answered here and now — no solve, so no job and no working indicator — and the
 * door says `'answered'`. Anything else goes on to {@link runSentence} inside a job, carrying the store operation
 * the pre-parse read, if it read one.
 */
function openSentence(utterance: string, deps: BoxDeps): 'answered' | StoreOp | null {
  const { ui } = deps;
  ui.setInputNote('');
  ui.setLlmDropped([]);
  ui.setRenameNote('');
  ui.setCreatedNotice?.(null); // #1467: the notice speaks for the last line only
  const pre = decidePreParse(utterance, deps.view(), deps.centresShown?.());
  if (!pre || pre.kind === 'store-op') return pre;
  // a pre-parse FORMAT guide (LaTeX, a negation): answered before the working indicator is painted
  const log = sentenceLog(utterance, deps.locale);
  for (const e of pre.logs) log(e);
  if (pre.kind === 'refuse') ui.setInputNote(sentenceNote(utterance, deps)(pre.note));
  return 'answered';
}

/**
 * One sentence, INSIDE its job (#2874, ADR-W-210): the queue has already painted the working indicator, and it
 * releases it when this returns or throws, after the post-commit search this joins to the job.
 */
async function runSentence(utterance: string, deps: BoxDeps, job: Job, pre: StoreOp | null): Promise<void> {
  const { t, locale, ui } = deps;
  const store = () => useGeoStore.getState();
  const parseCtxNow = () => {
    const v = deps.view();
    return buildParseCtx(v.construction, v.positions);
  };
  /**
   * #1395: THE DETERMINISTIC LANE IS DECIDED, THEN DISPATCHED. `decideDeterministic.ts` owns every
   * branch up to the model call, as a pure function of the figure; this function applies its verdict
   * — the store operation, the auto-binds, the commit — and shows its note. The branch comments live
   * with the decision now.
   */
  const log = sentenceLog(utterance, locale);
  const noteText = sentenceNote(utterance, deps);

  if (pre) {
    // A store operation is not geometry: it runs here, before the parser, and never enters the figure. It re-solves
    // the figure all the same, so it runs inside the job like any other line (#2874).
    const { op, from, to } = pre;
    // #2890 (ADR-830): the reducer runs in the worker, on its copy of the store; the page puts the result in
    const res = (await actInWorker(op === 'swap' ? 'swap' : op === 'name-centre' ? 'nameCentre' : op === 'rename' ? 'rename' : 'merge', [from, to])) as { ok: boolean; reason?: string };
    // A size-qualified naming («מרכז המעגל הקטן הוא O1», #178) also LOCKS which circle is the small/big
    // one (the #102 ruling: a qualifier both refers and asserts), so sampling can never swap the name.
    if (op === 'name-centre' && res.ok && pre.assert) await actInWorker('execute', [{ type: 'set-radius-order', outer: pre.assert.outer, inner: pre.assert.inner }, utterance]);
    log({
      source: op,
      rename: op === 'name-centre' ? { from, to, ...(pre.assert ? { assert: pre.assert } : {}) } : { from, to },
      result: res.ok ? 'ok' : res.reason,
    });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.${op === 'swap' ? 'swap' : op === 'merge' ? 'merge' : 'rename'}_${res.reason}`, { from, to }));
    return;
  }
  // From here on the path runs SYNCHRONOUS solves — the dry-run, the commit replay, and (last) the
  // LLM call — that can take a few seconds on a hard/over-constrained figure (e.g. an impossible
  // "AD>BC"), freezing the UI. The job's queue painted the working state FIRST (the operator: visible
  // from the moment Submit is pressed until the answer), and it clears it on every exit below, a throw
  // included; the commit paths join `resolveAfterCommit` to the job, so it stays through any auto-resolve.
  // #2890 (ADR-830): THE WHOLE DECISION runs in the geometry worker: the parse (it solves), every gate, the dry run
  // and, when the line commits, the commit itself (ADR-588: `commitVerdict`, the one place a verdict reaches the store),
  // on the worker's copy of the store. The page puts the result in at its one sink, checked against the figure the
  // line was typed on, and adopts the settled view, so its render and the resolve gate below solve nothing.
  const basis = basisNow();
  const decided = await geoJobs.decide({ state: storeData(), utterance, locale, centresShown: deps.centresShown?.(), view: viewArg(deps.view()) });
  applyActed(decided, basis);
  const verdict = decided.value.verdict;
  // #1697 (ADR-588): the #186 / #539 auto-binds (and the #1673 step-aside) the decision simulated are the LINE'S
  // OWN facts — `name-by-use` commands committed in the line's group, ahead of its statements, and applied by
  // `replay`. They used to be store renames applied here whatever the verdict, so the name belonged to no line:
  // erasing, muting or editing the line left it, and a REFUSED line still renamed the circle. Now a line that
  // commits nothing names nothing.
  const bindCmds = verdict.kind === 'store-op' ? [] : nameByUseCommands(verdict.binds);
  /** The facts with this line's naming applied — what the LLM's second attempt reads and is judged against. */
  const withBinds = (facts: Fact[]): Fact[] => (bindCmds.length ? trialFacts(facts, bindCmds) : facts);
  switch (verdict.kind) {
    case 'store-op':
      return; // unreachable: store operations are decided before the parse
    case 'refuse':
      for (const e of verdict.logs) log(e);
      ui.setInputNote(noteText(verdict.note));
      // #1611: a taught sentence that was PROVED to build replaces the text; any other refusal keeps it
      if (verdict.prefill !== undefined) ui.setText?.(verdict.prefill);
      return; // keep the text so the student can edit it
    case 'commit':
      // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
      ui.setCreatedNotice?.(decided.value.created); // committed in the worker, with the decision (#2890)
      for (const e of verdict.logs) log(e);
      if (verdict.note) ui.setInputNote(noteText(verdict.note));
      ui.clearText();
      job.join(deps.resolveAfterCommit());
      return;
    case 'noop':
      // #1697: a naming that changed the figure is a row that owns it (committed in the worker with the decision, #2890)
      for (const e of verdict.logs) log(e);
      if (verdict.note) ui.setInputNote(noteText(verdict.note));
      ui.clearText();
      return;
    case 'escalate':
      for (const e of verdict.logs) log(e);
      break;
  }
  const weak = verdict.weak;
  // out of grammar, OR a deterministic parse that built nothing → ask the LLM (a SECOND try),
  // using the current figure as context. The working state is already up (the job painted it first) and
  // stays up across the network call AND the post-LLM dry-run/commit below; the queue clears it when the
  // job ends — on the not-understood return, and after the joined `resolveAfterCommit` on success.
  const boundView = () => {
    if (!bindCmds.length) return deps.view();
    const st = store();
    const d = replay(withBinds(st.facts), st.seed);
    return { construction: d.construction, positions: d.positions };
  };
  /** The NEW labels a set of commands never carries (ADR-089): the one name gate, read by the retry and by the battery. */
  const lostNewLabels = (cmds: AnyCommand[]): string[] => {
    const fig = replay(withBinds(store().facts)).construction;
    return droppedNewLabels(
      utterance,
      cmds,
      fig.objects.filter(isGeoPoint).map((o) => o.id),
      fig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])), // bound radius letters are measure names, not points (#54)
    );
  };
  const v = boundView();
  const ctx = figureContext(
    v.construction.objects.filter(isGeoPoint).map((o) => o.id),
    v.construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
  );
  // Abortable + bounded (E3/STO-3): a hung proxy aborts after ~15 s, and the student can cancel —
  // either way the job ends and the working state clears instead of hanging forever.
  const controller = new AbortController();
  deps.llmAbortRef.current = controller;
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let out: Awaited<ReturnType<typeof llmParse>>;
  try {
    // #2428 (ADR-741): each canonical line re-parses with the FULL context of its figure — the first with the context
    // the deterministic path read, a later one with the trial figure the earlier lines built (`laneContext`).
    const first = bindCmds.length ? buildParseCtx(v.construction, v.positions) : parseCtxNow();
    const lane = laneContext(first, () => ({ facts: withBinds(store().facts), seed: store().seed }));
    // #2231 (ADR-W-189): an answer that loses a typed name is asked for once more, under the same abort. The battery
    // below judges whichever answer comes back, so a name still lost is refused by `input.labelsDropped`, as ever.
    const kept = await askKeepingNames(
      (keep) => llmParse(utterance, ctx, lane, { signal: controller.signal, ...(keep ? { keep } : {}) }),
      (a) => lostNewLabels(a.built.flatMap((g) => g.commands)),
      (a) => !a.busy && a.built.length + a.dropped.length > 0,
    );
    out = kept.answer;
    if (kept.retry) logDebug(nameRetryEvent(kept.retry));
  } finally {
    clearTimeout(timeout);
    deps.llmAbortRef.current = null;
  }
  // Cancelled (student) — quietly stand down, keeping the text for a retry; timed out — an honest
  // "service busy" (the request may still be running server-side; it isn't the student's fault).
  if (out === null && controller.signal.aborted) {
    logDebug({ kind: 'input', utterance, locale, source: 'limit', result: 'aborted-or-timeout', intermediate: true });
    ui.setInputNote(t('input.serviceBusy'));
    return;
  }
  // The proxy is throttling (global daily cost ceiling or per-IP limit) — NOT a parse failure. Show a
  // "service busy, try again" message (never "couldn't understand your input" — it isn't the student's
  // fault) and tag the analytics so the operator can see how often the ceiling is reached (SEC-2).
  if (out?.busy) {
    logDebug({ kind: 'input', utterance, locale, source: 'limit', result: out.busy });
    ui.setInputNote(t('input.serviceBusy'));
    return;
  }
  // #2890 (ADR-830): the answer is judged and committed in the worker (`llmJudge.ts`: the dry run, ADR-240's battery,
  // the commit), against the store as it is NOW (E3/STO-3: an undo during the network call is not committed onto).
  const judgedOn = basisNow();
  const judged = await geoJobs.judge({
    state: storeData(),
    input: { utterance, locale, out: out ? { built: out.built, dropped: out.dropped, ...(out.restored ? { restored: out.restored } : {}) } : null, bindCmds, weak: Boolean(weak) },
    view: viewArg(deps.view()),
  });
  applyActed(judged, judgedOn);
  const outcome = judged.value;
  if (outcome.kind === 'refuse') {
    ui.setInputNote(t(outcome.note.key, outcome.note.params));
    return; // keep the text so the student can edit it
  }
  ui.setCreatedNotice?.(outcome.created);
  ui.setLlmDropped(outcome.dropped);
  ui.clearText();
  job.join(deps.resolveAfterCommit());
}
