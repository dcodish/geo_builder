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
} from '@/parser';
import { llmParse } from '@/parser/llm';
import { figureContext } from '@/parser/llmShared';
import { isGeoPoint } from '@/engine';
import type { Construction, Id, Vec } from '@/engine';
import { dryRunOutcome, primeFoldFor, replay, trialFacts, useGeoStore } from '@/store/geoStore';
import { geoWork, isCancelled } from '@/store/geoWork';
import { unaccountedSpans } from '@/parser/spanAccounting';
import { type DecideLog, type DecideNote, decideFromParse, decidePreParse } from './decideDeterministic';
import { logDebug } from '@/debug/sessionLog';

export interface SubmitUi {
  setInputNote(msg: string): void;
  setRenameNote(msg: string): void;
  setLlmDropped(steps: string[]): void;
  /** Clear the input field (a successful submission). */
  clearText(): void;
  setBusy(busy: boolean): void;
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
  /** Two animation frames so the spinner paints before a heavy synchronous solve. */
  nextPaint(): Promise<void>;
  /** The post-commit auto-resolve (worker config search + view rewrite, one undo entry). */
  resolveAfterCommit(): void;
  /** Shared abort slot so the UI's cancel button reaches the in-flight LLM call. */
  llmAbortRef: { current: AbortController | null };
  /** Humanized engine error + retry hint (display-layer concern, injected). `said` is the student's
   *  own sentence, which becomes the refusal's SUBJECT where the engine fragment cannot identify the
   *  rejected statement (#943, ADR-487). */
  explainError(raw: string | null | undefined, said?: string): string;
}

export async function runSubmit(utterance: string, deps: SubmitDeps): Promise<void> {
  const { t, locale, ui } = deps;
  if (deps.isBusy()) return; // a submit is already in flight (E3) — chips/enter can't race a second one
  ui.setInputNote('');
  ui.setLlmDropped([]);
  ui.setRenameNote('');
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
  const resolveParams = (p?: Record<string, unknown>) =>
    p &&
    Object.fromEntries(
      Object.entries(p).map(([k, v]) => [k, v && typeof v === 'object' && 't' in v ? t((v as { t: string }).t) : v]),
    );
  const noteText = (n: DecideNote) => ('explain' in n ? deps.explainError(n.explain, utterance) : t(n.key, resolveParams(n.params)));

  const pre = decidePreParse(utterance, deps.view());
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
  const verdict = await decideFromParse({ facts: st0.facts, seed: st0.seed, view: deps.view() }, utterance, locale, {
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
  // The #186 / #539 auto-binds the decision simulated are applied to the store first, whatever the
  // verdict — the submission already named a circle or a point, exactly as it did inline before.
  if (verdict.kind !== 'store-op') {
    for (const b of verdict.binds) {
      if (b.op === 'name-centre') store().nameCentre(b.from, b.to);
      else store().rename(b.from, b.to);
    }
  }
  switch (verdict.kind) {
    case 'store-op':
      return; // unreachable: store operations are decided before the parse
    case 'refuse':
      for (const e of verdict.logs) log(e);
      ui.setInputNote(noteText(verdict.note));
      ui.setBusy(false);
      return; // keep the text so the student can edit it
    case 'commit':
      // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
      store().executeMany([...verdict.commands], utterance);
      for (const e of verdict.logs) log(e);
      if (verdict.note) ui.setInputNote(noteText(verdict.note));
      ui.clearText();
      deps.resolveAfterCommit();
      return;
    case 'noop':
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
  const v = deps.view();
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
    out = await llmParse(utterance, ctx, parseCtxNow(), { signal: controller.signal });
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
  // The LLM only counts if its decomposition actually BUILDS something — else it's another silent
  // fail. Dry-run the combined commands; if neither grammar nor LLM built anything, say so plainly.
  const llmCmds = out ? out.built.flatMap((g) => g.commands) : [];
  // #41 (ADR-290): same worker prefold for the LLM decomposition's content before ITS dry-run.
  if (out !== null && out.built.length > 0) {
    try {
      const trial = trialFacts(cur.facts, llmCmds);
      const fold = await geoWork.prefold(trial, cur.seed);
      if (fold) primeFoldFor(trial, fold);
    } catch (err) {
      if (!isCancelled(err)) throw err;
    }
  }
  const llmBuilds =
    out !== null && out.built.length > 0 && dryRunOutcome(cur.facts, llmCmds, cur.seed).produced;
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
    ui.setInputNote(t(weak ? 'input.producedNothing' : 'input.notUnderstood'));
    ui.setBusy(false);
    return;
  }
  // #779 — the convention nudge holds on the LLM path too (the ADR-240 pattern: the second attempt
  // never commits what the first refused). Without it, a lowercase-label utterance the grammar
  // declined would launder its rewrite through the LLM: the model emits uppercase canonical lines,
  // the case-blind gates see every label accounted, and the commit stores labels the student never
  // typed in that case — the silent rewrite again, one seam over.
  {
    const fold = lowercaseLabelFold(utterance, llmCmds);
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
  const llmFig = replay(cur.facts).construction;
  const stillDropped: (string | number)[] = [
    ...droppedNewLabels(
      utterance,
      llmCmds,
      llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      llmFig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])), // bound radius letters are measure names, not points (#54)
    ),
    // the numeric honesty gate holds on the second attempt too (ADR-250): a decomposition that loses a
    // stated magnitude must name it, never commit the partial figure
    ...droppedGivenNumbers(utterance, llmCmds),
    // and the RELATION gate (ADR-264): a decomposition that loses a stated `AB=CD`/`⊥`/`∥` between
    // existing points must name it — its labels all appear on the shape, so the older gates never fire
    ...droppedGivenRelations(utterance, llmCmds),
    // and the VERB gate (ADR-292, the #82 P1): a decomposition that loses a stated tangency/
    // bisection/… verb must name it — never a silent drop on the second attempt either
    ...droppedGivenVerbs(utterance, llmCmds),
    // and the WORD gate (ADR-360, #210): a decomposition that loses a word-stated circle relation
    // (זרים/מוכל) must name it — the exact prod class where two unrelated circles committed green
    ...droppedWordRelations(utterance, llmCmds),
    // and the STRUCTURAL gate (#153/#145): the LLM must not re-introduce a truncated lowering of a
    // compound measure relation — the whole term list lands in one structured constraint, or refuse
    ...droppedCompoundRelation(utterance, llmCmds),
    // and the COMPARISON gate (ADR-390, #277): a decomposition that turns a stated bound into the
    // equality at the bound must refuse — the same silent misparse, arriving by the LLM seam
    ...(droppedComparison(utterance, llmCmds) ? ['<>'] : []),
    // and the MEASURE-SYMBOL gate (issue #53): a decomposition that loses a stated radius symbol
    // ("שרדיוסו r") must name it — a lowercase measure letter trips none of the older gates
    ...droppedRadiusSymbol(utterance, llmCmds),
    // and the REGION-SUBJECT gate (ADR-303; wired here by #266/ADR-387): a decomposition of a
    // region-clause utterance («M בתוך המשולש ABC») that references the subject label nowhere
    // dropped the student's statement about it — the grammar path already held this line
    ...(droppedRegionSubject(utterance, llmCmds) ? ['בתוך/מחוץ'] : []),
    // and the MIDSEGMENT gate (#405/ADR-411): a decomposition of a midsegment-flavoured utterance
    // that carries no midpoint semantics dropped the given — the grammar chokepoint holds this line,
    // so the LLM seam must too (the ADR-240 pattern: the second attempt never commits the same drop)
    ...(droppedMidsegment(utterance, llmCmds) ? ['קטע אמצעים'] : []),
    // and the OBJECT gate (ADR-430, #456): a decomposition that states a shape and a construct on it but
    // emits only the bare shape must name what it lost. Bound to the commit EVENT on both paths, not to a
    // code path — the reported 3-D twins were GRAMMAR drops, where the LLM-seam gates never run at all.
    ...droppedConstructNoun(utterance, llmCmds),
    // and SPAN ACCOUNTING (ADR-453): the enforcing verdict the grammar path takes must hold on the
    // second attempt too — the two seams ask the identical question, or the LLM path becomes the
    // weaker one by drift (the ADR-240 pattern this whole battery exists to keep).
    ...unaccountedSpans(utterance, llmCmds, {
      existingPoints: llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      radiusSymbols: llmFig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])),
    }).map((x) => x.text),
  ];
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
  const invented = introducedNewLabels(
    utterance,
    out!.built.map((g) => g.step),
    llmFig.objects.filter(isGeoPoint).map((o) => o.id),
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
  store().executeMany(llmCmds, utterance); // one batch → one step row AND one undo entry (E4)
  // `commands` carries the LLM's committed canonical commands into the PROD analytics event too (issue
  // #84) — a `source:llm, result:ok` submit is otherwise opaque and a reported session can't reconstruct.
  // `restored` (#536): stated point-runs whose LLM respelling the sequence gate corrected («ABD→ADB») —
  // logged so a `source:llm` submit stays reconstructable, corrections included.
  logDebug({ kind: 'input', utterance, locale, source: 'llm', built: out!.built.map((g) => g.step), dropped: out!.dropped, commands: llmCmds, ...(out!.restored ? { restored: out!.restored } : {}) });
  ui.setLlmDropped(out!.dropped);
  ui.clearText();
  deps.resolveAfterCommit();
}
