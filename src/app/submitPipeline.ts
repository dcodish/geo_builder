/**
 * The submit pipeline (S0.4 of docs/24) — the text → command[] orchestration, EXTRACTED from
 * App.tsx so it is directly testable (the docs/23 review found this 400-line path had zero direct
 * tests and was only hand-mirrored by the scenario harness).
 *
 * This is a FAITHFUL move of App's `submit()`: the store is the same singleton (`useGeoStore`),
 * and everything UI-side (notes, busy spinner, text field, the display view the parser context
 * reads, post-commit auto-resolve) is injected via {@link SubmitDeps}. The pipeline owns the
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
import {
  buildParseCtx,
  classifyOutOfScope,
  droppedComparison,
  droppedCompoundRelation,
  droppedConstructNoun,
  droppedGivenNumbers,
  droppedGivenRelations,
  droppedGivenVerbs,
  droppedMidsegment,
  droppedNewLabels,
  introducedNewLabels,
  droppedRadiusSymbol,
  droppedRegionSubject,
  droppedWordRelations,
  looksCompound,
  lowercaseLabelFold,
  inscribedCircles,
} from '@/parser';
import { llmParse } from '@/parser/llm';
import { laneContext } from './laneContext';
import { droppedPropertyWords } from '@/parser/propertyWords';
import { mergeWordItems } from '../../shell/llm/honestyCore';
import { figureContext } from '@/parser/llmShared';
import { circleMembers, circleRefs, isGeoPoint } from '@/engine';
import type { AnyCommand, Construction, Id, Vec } from '@/engine';
import { createdByReference } from './createdPoints';
import { dryRunOutcome, groupKey, nameByUseCommands, primeFoldFor, replay, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { geoWork, isCancelled } from '@/store/geoWork';
import { unaccountedSpans } from '@/parser/spanAccounting';
import { type DecideLog, type DecideNote, type Verdict2D, decideFromParse, decidePreParse } from './decideDeterministic';
import { unreadItems } from './honestyGates';
import { logDebug } from '@/debug/sessionLog';
import { otherUtteranceForError } from './errorSubject';
import { renderNote } from './renderNote';
import { studentVocabulary } from './studentVocabulary';
import { splitSentences, submitSentences, type SentenceOutcome } from '../../shell/sentences';

export interface SubmitUi {
  setInputNote(msg: string): void;
  setRenameNote(msg: string): void;
  setLlmDropped(steps: string[]): void;
  /** Clear the input field (a successful submission). */
  clearText(): void;
  /**
   * #1611 (ADR-591, ADR-W-030): REPLACE the input text with a taught canonical sentence, so one Enter builds
   * what the note teaches. Optional — a caller with no input box (a headless driver) omits it.
   */
  setText?(text: string): void;
  setBusy(busy: boolean): void;
  /**
   * #1467 (ADR-769, ADR-W-162): the «נוצרה נקודה חדשה …» notice — the points the committed line created by reference,
   * and the row (its group key) whose removal is the notice's ✕. Null clears it. Optional: a headless driver omits it.
   */
  setCreatedNotice?(notice: CreatedNotice2D | null): void;
}

/** #1467 — what the created-points notice holds in 2-D: the labels, and the row the ✕ removes. */
export interface CreatedNotice2D {
  names: Id[];
  groupKey: string;
}

export interface SubmitDeps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: 'he' | 'en';
  ui: SubmitUi;
  /** The DISPLAY view (construction+positions incl. the ADR-293 never-blank fallback) — what the
   *  parser context and the LLM figure context read. NOT necessarily the raw current replay. */
  view(): { construction: Construction; positions: Map<Id, Vec> };
  /** A submit is already in flight (E3) — chips/enter can't race a second one. */
  isBusy(): boolean;
  /**
   * #2362 ([ADR-748](../../docs/06-decisions.md#adr-748)): «הציגו מרכזי מעגלים» is on as the line is typed — the store's
   * display preference (ADR-059), read at the seam and written into the line's facts, never read by replay. Optional:
   * absent = off, the product default.
   */
  centresShown?(): boolean;
  /** Two animation frames so the spinner paints before a heavy synchronous solve. */
  nextPaint(): Promise<void>;
  /** The post-commit auto-resolve (worker config search + view rewrite, one undo entry). A paragraph's chain
   *  awaits it before its next sentence (#1778), so the next sentence reads the figure the search settled. */
  resolveAfterCommit(): void;
  /** Shared abort slot so the UI's cancel button reaches the in-flight LLM call. */
  llmAbortRef: { current: AbortController | null };
  /** Humanized engine error + retry hint (display-layer concern, injected). `said` is the student's
   *  own sentence, which becomes the refusal's SUBJECT where the engine fragment cannot identify the
   *  rejected statement (#943, ADR-487). */
  explainError(raw: string | null | undefined, said?: string, other?: string): string;
}

/**
 * #1697 ([ADR-588](../../docs/06-decisions.md#adr-588)) — THE ONE PLACE a deterministic verdict reaches the store.
 *
 * A `commit` is the line's naming by use (`name-by-use` facts) followed by its statements, ONE batch — one group,
 * one row, one undo entry. A `noop` whose naming changed the figure («D ו-F על מעגל O1» when D, F already ride
 * it) is a row that owns that naming; a step-aside alone is invisible and commits nothing. A refusal or an
 * escalation commits nothing here, naming included. The pipeline calls this, and so do the locks that replay a
 * sequence through `decideDeterministic2D` — four of them used to re-apply the binds by hand.
 */
export function commitVerdict(verdict: Verdict2D, utterance: string): CreatedNotice2D | null {
  const st = useGeoStore.getState();
  if (verdict.kind === 'commit') return commitLine([...nameByUseCommands(verdict.binds), ...verdict.commands], verdict.commands, utterance);
  if (verdict.kind === 'noop' && verdict.binds.some((b) => b.op !== 'step-aside')) st.executeMany(nameByUseCommands(verdict.binds), utterance);
  return null;
}

/**
 * #1467 (ADR-769) — commit one line's batch and say which points it created by reference. Both commit paths (the
 * deterministic verdict above and the LLM's decomposition) come through here, so the notice cannot be wired to one.
 * `statements` is the line's own commands, without its naming by use.
 */
function commitLine(batch: AnyCommand[], statements: readonly AnyCommand[], utterance: string): CreatedNotice2D | null {
  const st = useGeoStore.getState();
  const before = replay(st.facts, st.seed).construction;
  st.executeMany(batch, utterance);
  const now = useGeoStore.getState();
  const last = now.facts[now.facts.length - 1];
  if (!last || now.facts.length === st.facts.length) return null;
  const names = createdByReference(before, replay(now.facts, now.seed).construction, statements, utterance);
  return names.length ? { names, groupKey: groupKey(last) } : null;
}

/**
 * #1778 ([ADR-W-125](../../docs/06w-decisions-workspace.md#adr-w-125)) — THE BOX'S TEXT, which may be a pasted
 * PARAGRAPH. One sentence goes through the one-sentence pipeline exactly as before. Two or more («M אמצע BC. N
 * אמצע AC.») are submitted one at a time through that same pipeline (`shell/sentences`), each its own row,
 * and the chain stops at the first sentence the pipeline leaves in the box; the box then holds that sentence —
 * or its taught canonical — followed by the rest.
 */
export async function runSubmit(utterance: string, deps: SubmitDeps): Promise<void> {
  const sentences = splitSentences(utterance);
  if (!sentences) return runSentence(utterance, deps);
  if (deps.isBusy()) return; // a submit is already in flight (E3)
  const box = await submitSentences(sentences, (text, i) => chainSentence(text, i, deps));
  if (box) deps.ui.setText?.(box);
  else deps.ui.clearText();
}

/**
 * One sentence of a paragraph through {@link runSentence}, its outcome read from what the pipeline did to the
 * box: cleared it (a row, or an answered store-op) → consumed; pre-filled a taught canonical → that; neither →
 * kept. The REAL box is set once, by the chain, at the end. A later sentence reads the figure from the store —
 * the caller's display view is the one painted before the paste — and the post-commit search is awaited, so
 * it never sees a figure mid-rewrite.
 */
async function chainSentence(text: string, i: number, deps: SubmitDeps): Promise<SentenceOutcome> {
  let outcome: SentenceOutcome = 'kept';
  let settling: void | Promise<void> = undefined;
  const storeView = () => {
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    return { construction: d.construction, positions: d.positions };
  };
  await runSentence(text, {
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
    isBusy: () => false,
    view: i === 0 ? deps.view : storeView,
    resolveAfterCommit: () => {
      settling = deps.resolveAfterCommit();
    },
  });
  await settling;
  return outcome;
}

async function runSentence(utterance: string, deps: SubmitDeps): Promise<void> {
  const { t, locale, ui } = deps;
  if (deps.isBusy()) return; // a submit is already in flight (E3) — chips/enter can't race a second one
  ui.setInputNote('');
  ui.setLlmDropped([]);
  ui.setRenameNote('');
  ui.setCreatedNotice?.(null); // #1467: the notice speaks for the last line only
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
  const log = (e: DecideLog) => logDebug({ kind: 'input', utterance, locale, ...e });
  // #1849 (ADR-602): a refusal at the door names the OTHER side too, when the fold could name one. The dry run's
  // status carries the same `[vs #i]` tail the banner resolves (ADR-508), indexed into the committed facts the
  // trial array shares — so the note says «AC = 8» סותר את «משולש ABC» instead of «AC = 8» against "an earlier given".
  // #2173 (ADR-726): a step's second tip (`also`) is shown after the first, on the same line.
  // #2201 phase 3b (ADR-W-130 Am. 1): one rendering for both kinds of note (`renderNote`), and the key note's params
  // pass the same provenance check as a refusal's values, against the figure the student is looking at.
  const noteText = (n: DecideNote): string =>
    renderNote(n, {
      t,
      said: utterance,
      explain: (raw) => deps.explainError(raw, utterance, otherUtteranceForError(store().facts, raw)),
      vocab: studentVocabulary(deps.view().construction, [...store().facts.filter((f) => f.enabled).map((f) => f.utterance), utterance]),
      circles: circleRefs(deps.view().construction), // #2305 M3 (ADR-760): a question's circles named by the seam
    });

  const pre = decidePreParse(utterance, deps.view(), deps.centresShown?.());
  if (pre?.kind === 'store-op') {
    // A store operation is not geometry: it runs here, before the parser, and never enters the figure.
    const { op, from, to } = pre;
    const res =
      op === 'swap' ? store().swap(from, to)
      : op === 'name-centre' ? store().nameCentre(from, to)
      : op === 'rename' ? store().rename(from, to)
      : store().merge(from, to);
    // A size-qualified naming («מרכז המעגל הקטן הוא O1», #178) also LOCKS which circle is the small/big
    // one (the #102 ruling: a qualifier both refers and asserts), so sampling can never swap the name.
    if (op === 'name-centre' && res.ok && pre.assert) store().execute({ type: 'set-radius-order', outer: pre.assert.outer, inner: pre.assert.inner }, utterance);
    log({
      source: op,
      rename: op === 'name-centre' ? { from, to, ...(pre.assert ? { assert: pre.assert } : {}) } : { from, to },
      result: res.ok ? 'ok' : res.reason,
    });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.${op === 'swap' ? 'swap' : op === 'merge' ? 'merge' : 'rename'}_${res.reason}`, { from, to }));
    return;
  }
  if (pre) {
    // a pre-parse FORMAT guide (LaTeX, a negation): answered before the spinner is painted
    for (const e of pre.logs) log(e);
    if (pre.kind === 'refuse') ui.setInputNote(noteText(pre.note));
    return;
  }
  // From here on the path runs SYNCHRONOUS solves — the dry-run, the commit replay, and (last) the
  // LLM call — that can take a few seconds on a hard/over-constrained figure (e.g. an impossible
  // "AD>BC"), freezing the UI. Paint the "thinking" state FIRST and yield a frame so the spinner is
  // visible from the moment Submit is pressed until the answer (operator) — the same treatment the
  // "show another configuration" path already gets. Cleared on every synchronous exit below; the
  // commit paths hand off to `resolveAfterCommit`, which owns the spinner through any auto-resolve.
  ui.setBusy(true);
  await deps.nextPaint();
  const st0 = store();
  const verdict = await decideFromParse({ facts: st0.facts, seed: st0.seed, view: deps.view(), centresShown: deps.centresShown?.() }, utterance, locale, {
    // #41 (ADR-290): warm the candidate content's FOLD in the geometry WORKER first — the dry-run,
    // the commit, and every later replay of this content then run at TAIL speed on the main thread.
    prefold: async (trial, seed) => {
      try {
        const fold = await geoWork.prefold(trial, seed);
        if (fold) primeFoldFor(trial, fold);
      } catch (err) {
        if (!isCancelled(err)) throw err; // cancelled prefold: fall through — the sync path still works
      }
    },
  });
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
      ui.setBusy(false);
      return; // keep the text so the student can edit it
    case 'commit':
      // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
      {
        // evaluated FIRST: an optional call (`ui.setCreatedNotice?.(…)`) skips its arguments when the UI has no notice
        const created = commitVerdict(verdict, utterance);
        ui.setCreatedNotice?.(created);
      }
      for (const e of verdict.logs) log(e);
      if (verdict.note) ui.setInputNote(noteText(verdict.note));
      ui.clearText();
      deps.resolveAfterCommit();
      return;
    case 'noop':
      commitVerdict(verdict, utterance); // #1697: a naming that changed the figure is a row that owns it
      for (const e of verdict.logs) log(e);
      if (verdict.note) ui.setInputNote(noteText(verdict.note));
      ui.clearText();
      ui.setBusy(false);
      return;
    case 'escalate':
      for (const e of verdict.logs) log(e);
      break;
  }
  const weak = verdict.weak;
  // out of grammar, OR a deterministic parse that built nothing → ask the LLM (a SECOND try),
  // using the current figure as context. The spinner is already up (painted at the top of submit) and
  // stays up across the network call AND the post-LLM dry-run/commit below; it's cleared on the
  // not-understood return and by `resolveAfterCommit` on success.
  const boundView = () => {
    if (!bindCmds.length) return deps.view();
    const st = store();
    const d = replay(withBinds(st.facts), st.seed);
    return { construction: d.construction, positions: d.positions };
  };
  const v = boundView();
  const ctx = figureContext(
    v.construction.objects.filter(isGeoPoint).map((o) => o.id),
    v.construction.objects.flatMap((o) => (o.kind === 'circle' ? [o.center] : [])),
  );
  // Abortable + bounded (E3/STO-3): a hung proxy aborts after ~15 s, and the student can cancel —
  // either way the spinner clears instead of hanging forever.
  const controller = new AbortController();
  deps.llmAbortRef.current = controller;
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let out: Awaited<ReturnType<typeof llmParse>>;
  try {
    // #2428 (ADR-741): each canonical line re-parses with the FULL context of its figure — the first with the context
    // the deterministic path read, a later one with the trial figure the earlier lines built (`laneContext`).
    const first = bindCmds.length ? buildParseCtx(v.construction, v.positions) : parseCtxNow();
    out = await llmParse(utterance, ctx, laneContext(first, () => ({ facts: withBinds(store().facts), seed: store().seed })), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    deps.llmAbortRef.current = null;
  }
  // Cancelled (student) — quietly stand down, keeping the text for a retry; timed out — an honest
  // "service busy" (the request may still be running server-side; it isn't the student's fault).
  if (out === null && controller.signal.aborted) {
    logDebug({ kind: 'input', utterance, locale, source: 'limit', result: 'aborted-or-timeout', intermediate: true });
    ui.setInputNote(t('input.serviceBusy'));
    ui.setBusy(false);
    return;
  }
  // The proxy is throttling (global daily cost ceiling or per-IP limit) — NOT a parse failure. Show a
  // "service busy, try again" message (never "couldn't understand your input" — it isn't the student's
  // fault) and tag the analytics so the operator can see how often the ceiling is reached (SEC-2).
  if (out?.busy) {
    logDebug({ kind: 'input', utterance, locale, source: 'limit', result: out.busy });
    ui.setInputNote(t('input.serviceBusy'));
    ui.setBusy(false);
    return;
  }
  // RE-READ the store after the await (E3/STO-3): the dry-run below must run against the CURRENT
  // facts — an undo/canvas action during the network call would otherwise be validated against the
  // pre-await snapshot while `executeMany` commits onto the live list (a stale-commit race).
  const cur = store();
  const curFacts = withBinds(cur.facts); // #1697: the line's naming, applied to the figure the decomposition is judged on
  // The LLM only counts if its decomposition actually BUILDS something — else it's another silent
  // fail. Dry-run the combined commands; if neither grammar nor LLM built anything, say so plainly.
  const llmCmds = out ? out.built.flatMap((g) => g.commands) : [];
  // #41 (ADR-290): same worker prefold for the LLM decomposition's content before ITS dry-run.
  if (out !== null && out.built.length > 0) {
    try {
      const trial = trialFacts(curFacts, llmCmds);
      const fold = await geoWork.prefold(trial, cur.seed);
      if (fold) primeFoldFor(trial, fold);
    } catch (err) {
      if (!isCancelled(err)) throw err;
    }
  }
  const llmBuilds =
    out !== null && out.built.length > 0 && dryRunOutcome(curFacts, llmCmds, cur.seed).produced;
  if (!llmBuilds) {
    // Both the grammar AND the LLM failed to BUILD anything. Distinguish a deliberately OUT-OF-SCOPE
    // concept — a named angle/theorem relationship, a proof or compute request, or pure free text —
    // from a GENUINE construction gap we should still implement. The out-of-scope cases get a tailored,
    // pedagogical message (what to do instead) and a `scope:<category>` analytics tag, so the admin
    // dashboard separates "no need to implement" from "real gap to build" (operator request). A real
    // gap keeps the plain "couldn't read that" message and the `not-understood` tag.
    const scope = classifyOutOfScope(utterance);
    if (scope) {
      logDebug({ kind: 'input', utterance, locale, source: 'scope', result: `scope:${scope.category}` });
      ui.setInputNote(t(scope.messageKey));
      ui.setBusy(false);
      return;
    }
    // A genuine gap — but if the input packed several statements into one line (a shape AND a point AND an
    // angle…), the most actionable advice is to break it into smaller steps: each piece parses far more
    // reliably alone, and the student can see which one is the problem. Tagged distinctly so the operator
    // can measure how often it fires; still a real `not-understood` gap for the dashboard count.
    if (looksCompound(utterance)) {
      logDebug({ kind: 'input', utterance, locale, source: 'llm', result: 'not-understood-compound' });
      ui.setInputNote(t('input.tooManyParts'));
      ui.setBusy(false);
      return;
    }
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: out && out.built.length ? 'built-nothing' : 'not-understood' });
    // "produced nothing even after a retry" gets the explicit problem message; pure out-of-grammar
    // (the grammar never matched) keeps the gentler "couldn't read that — try an example".
    ui.setInputNote(t(weak ? 'input.producedNothing' : 'suite.refusal.notUnderstood'));
    ui.setBusy(false);
    return;
  }
  // #779 — the convention nudge holds on the LLM path too (the ADR-240 pattern: the second attempt
  // never commits what the first refused). Without it, a lowercase-label utterance the grammar
  // declined would launder its rewrite through the LLM: the model emits uppercase canonical lines,
  // the case-blind gates see every label accounted, and the commit stores labels the student never
  // typed in that case — the silent rewrite again, one seam over.
  {
    const fold = lowercaseLabelFold(utterance, llmCmds, parseCtxNow().points ?? []); // #2195: the teaching criterion, on this lane too
    if (fold) {
      logDebug({ kind: 'input', utterance, locale, source: 'scope', result: 'scope:lowercase-labels', commands: llmCmds });
      ui.setInputNote(t('input.scope.lowercase-labels', { corrected: fold.corrected }));
      ui.setBusy(false);
      return;
    }
  }
  // HONESTY GATE on the LLM path (ADR-240): the grammar path refuses to commit a parse that leaves a
  // NEW input label unused (droppedNewLabels, ADR-089) — the second attempt must hold the same line.
  // Without it, a decomposition that loses a stated point commits a silently-partial figure: the LLM's
  // canonical line is re-parsed by the SAME grammar that just dropped the label, so the round-trip can
  // return the identical partial lowering ("A ו C נמצאות על המעגל" committed as A alone — the
  // operator's saved-figure C floating off its circle). Name the lost label and keep the text to edit.
  const llmFig = replay(curFacts).construction;
  // #1898 (ADR-627): the gates OVERLAP by design and the accountant reports one span per OCCURRENCE, so
  // the concatenation named a lost label once per gate and once per occurrence («D, D»). The list is
  // assembled through the battery's one merge (`unreadItems`) — the same merge `honestyGateReport.items`
  // uses, so a gate added to either seam is de-duplicated the day it is written. The superset of gates
  // and the order of distinct items are unchanged; only repeats go.
  const lostVerbs = droppedGivenVerbs(utterance, llmCmds);
  // #1906 (ADR-722 / ADR-W-144): every shape and role word the student typed must survive into the answer — per
  // occurrence, a misspelt word included («שווה צלעת» answered «משולש ABC»). The bisect verb gate names its own
  // statement in its own words, so the member does not repeat it.
  const lostWords = droppedPropertyWords(
    utterance,
    llmCmds,
    {
      points: llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
      circles: llmFig.objects.flatMap((o) => (o.kind === 'circle' ? [o.id] : [])),
      // #2545 (ADR-768): which circle a relation word («המעגל החוסם») describes — the answer must bind that one
      circleMembers: circleMembers(llmFig),
      inscribedCircles: inscribedCircles(llmFig),
    },
    { skip: lostVerbs.includes('חוצה/bisect') ? ['angle-bisector', 'bisect'] : [] },
  );
  const stillDropped: string[] = mergeWordItems(unreadItems(
    droppedNewLabels(
      utterance,
      llmCmds,
      llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      llmFig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])), // bound radius letters are measure names, not points (#54)
    ),
    // the numeric honesty gate holds on the second attempt too (ADR-250): a decomposition that loses a
    // stated magnitude must name it, never commit the partial figure
    droppedGivenNumbers(utterance, llmCmds),
    // and the RELATION gate (ADR-264): a decomposition that loses a stated `AB=CD`/`⊥`/`∥` between
    // existing points must name it — its labels all appear on the shape, so the older gates never fire
    droppedGivenRelations(utterance, llmCmds),
    // and the VERB gate (ADR-292, the #82 P1): a decomposition that loses a stated tangency/
    // bisection/… verb must name it — never a silent drop on the second attempt either
    lostVerbs,
    // and the WORD gate (ADR-360, #210): a decomposition that loses a word-stated circle relation
    // (זרים/מוכל) must name it — the exact prod class where two unrelated circles committed green
    droppedWordRelations(utterance, llmCmds),
    // and the STRUCTURAL gate (#153/#145): the LLM must not re-introduce a truncated lowering of a
    // compound measure relation — the whole term list lands in one structured constraint, or refuse
    droppedCompoundRelation(utterance, llmCmds),
    // and the COMPARISON gate (ADR-390, #277): a decomposition that turns a stated bound into the
    // equality at the bound must refuse — the same silent misparse, arriving by the LLM seam
    droppedComparison(utterance, llmCmds) ? ['<>'] : [],
    // and the MEASURE-SYMBOL gate (issue #53): a decomposition that loses a stated radius symbol
    // ("שרדיוסו r") must name it — a lowercase measure letter trips none of the older gates
    droppedRadiusSymbol(utterance, llmCmds),
    // and the REGION-SUBJECT gate (ADR-303; wired here by #266/ADR-387): a decomposition of a
    // region-clause utterance («M בתוך המשולש ABC») that references the subject label nowhere
    // dropped the student's statement about it — the grammar path already held this line
    droppedRegionSubject(utterance, llmCmds) ? ['בתוך/מחוץ'] : [],
    // and the MIDSEGMENT gate (#405/ADR-411): a decomposition of a midsegment-flavoured utterance
    // that carries no midpoint semantics dropped the given — the grammar chokepoint holds this line,
    // so the LLM seam must too (the ADR-240 pattern: the second attempt never commits the same drop)
    droppedMidsegment(utterance, llmCmds) ? ['קטע אמצעים'] : [],
    // and the OBJECT gate (ADR-430, #456): a decomposition that states a shape and a construct on it but
    // emits only the bare shape must name what it lost. Bound to the commit EVENT on both paths, not to a
    // code path — the reported 3-D twins were GRAMMAR drops, where the LLM-seam gates never run at all.
    droppedConstructNoun(utterance, llmCmds),
    // and SPAN ACCOUNTING (ADR-453): the enforcing verdict the grammar path takes must hold on the
    // second attempt too — the two seams ask the identical question, or the LLM path becomes the
    // weaker one by drift (the ADR-240 pattern this whole battery exists to keep).
    // #1795 (ADR-597): an existing label is context only when the decomposition refers to it — the figure's
    // circles and polygons say what a reference reaches, exactly as on the grammar seam.
    unaccountedSpans(utterance, llmCmds, {
      existingPoints: llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      radiusSymbols: llmFig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])),
      circleMembers: circleMembers(llmFig),
      polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
    }).map((x) => x.text),
  ), lostWords); // #1906: the word items first; an ADR-430 «מעגל» inside «מעגל חסומ» is named once, as the phrase
  if (stillDropped.length > 0) {
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: `dropped-labels:${stillDropped.join(',')}`, commands: llmCmds });
    ui.setInputNote(t('input.labelsDropped', { labels: stillDropped.join(', ') }));
    ui.setBusy(false);
    return;
  }
  // The MIRROR gate (#255): every gate above asks what the decomposition LOST. None asked what it
  // ADDED, so an LLM that invents a label — «AB חותך את CD» normalised to «M חיתוך AB ו-CD», session
  // i1mt2us8 — put a node into the student's namespace with `dropped: []` and a green row. Read off the
  // LLM's own canonical lines, so a label the GRAMMAR mints while lowering them (a foot, a midpoint,
  // the ADR-263/270 auto-label family) is never mistaken for an invention. Refuse and keep the text:
  // naming a point is the student's, and a silent commit is the one outcome that cannot be undone by
  // reading the figure.
  // #2228 (ADR-695): an EXISTING point the sentence never refers to is an invention too — the decomposition
  // attached a relation to it («… דרך P») that the student never stated. The figure's polygons and circles say
  // which existing points a noun in the sentence reaches («המשולש», «הצלע», «המעגל», «הקטע»).
  const invented = introducedNewLabels(
    utterance,
    out!.built.map((g) => g.step),
    llmFig.objects.filter(isGeoPoint).map((o) => o.id),
    {
      polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
      circleMembers: circleMembers(llmFig),
      segments: llmFig.objects.flatMap((o) => (o.kind === 'segment' ? [[o.a, o.b]] : [])),
    },
  );
  if (invented.length > 0) {
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: `invented-labels:${invented.join(',')}`, commands: llmCmds });
    ui.setInputNote(t('input.labelsInvented', { labels: invented.join(', ') }));
    ui.setBusy(false);
    return;
  }
  // The LLM understood the (often Hebrew) input and decomposed it into canonical steps; show it as
  // ONE step row labelled by the STUDENT'S ORIGINAL utterance — not the LLM's English canonical lines
  // (a Hebrew input must never surface as an English row). All built commands share one group, exactly
  // like a deterministic multi-command parse, so editing the row re-runs the original wording. The
  // canonical decomposition + any unbuildable steps stay in the debug log / `dropped` report.
  const created = commitLine([...bindCmds, ...llmCmds], llmCmds, utterance); // one batch → one step row AND one undo entry (E4)
  ui.setCreatedNotice?.(created);
  // `commands` carries the LLM's committed canonical commands into the PROD analytics event too (issue
  // #84) — a `source:llm, result:ok` submit is otherwise opaque and a reported session can't reconstruct.
  // `restored` (#536): stated point-runs whose LLM respelling the sequence gate corrected («ABD→ADB») —
  // logged so a `source:llm` submit stays reconstructable, corrections included.
  logDebug({ kind: 'input', utterance, locale, source: 'llm', built: out!.built.map((g) => g.step), dropped: out!.dropped, commands: llmCmds, ...(out!.restored ? { restored: out!.restored } : {}) });
  ui.setLlmDropped(out!.dropped);
  ui.clearText();
  deps.resolveAfterCommit();
}
