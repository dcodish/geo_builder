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
  impliedCircleBinding,
  impliedPointBinding,
  looksCompound,
  looksLikeLatex,
  teachCanonical,
  statedNegation,
  wordRootMagnitude,
  splitGuidance,
  parse,
  parseMerge,
  parseNameCenter,
  parseRename,
  parseSwap,
} from '@/parser';
import { llmParse } from '@/parser/llm';
import { figureContext } from '@/parser/llmShared';
import { isGeoPoint } from '@/engine';
import type { Construction, Id, Vec } from '@/engine';
import { autoNamedLabels, deferralWorthwhile, dryRunOutcome, primeFoldFor, replay, trialFacts, useGeoStore } from '@/store/geoStore';
import { geoWork, isCancelled } from '@/store/geoWork';
import { spanShadow } from '@/parser/spanAccounting';
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
  /** Humanized engine error + retry hint (display-layer concern, injected). */
  explainError(raw: string | null | undefined): string;
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
  // A swap ("swap C and D" / "החלף בין C ל-D") EXCHANGES two existing labels — a store
  // operation, handled before the parser (and before rename, whose taken-target guard would
  // otherwise reject it). Lets the student flip which end of a chord is C vs D (ADR-122).
  const swp = parseSwap(utterance);
  if (swp) {
    const res = store().swap(swp.a, swp.b);
    logDebug({ kind: 'input', utterance, locale, source: 'swap', rename: { from: swp.a, to: swp.b }, result: res.ok ? 'ok' : res.reason });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.swap_${res.reason}`, { from: swp.a, to: swp.b }));
    return;
  }
  // NAME an auto-assigned circle centre ("מרכז המעגל הוא P" / "the centre of the circle is P") — the
  // student drew an unnamed circle (hidden auto-centre) and now names it. A store-level RENAME of the
  // hidden centre + a reveal, NOT a second circle (issue #112). Before the parser (whose `circle` rule
  // would otherwise mint circle-P) and before rename (parseNameCenter resolves the hidden source letter).
  const nc = parseNameCenter(utterance, parseCtxNow());
  if (nc) {
    const res = store().nameCentre(nc.from, nc.to);
    // A size-qualified naming («מרכז המעגל הקטן הוא O1», #178) also LOCKS which circle is the small/big
    // one (the #102 ruling: a qualifier both refers and asserts), so sampling can never swap the name.
    if (res.ok && nc.assert) store().execute({ type: 'set-radius-order', outer: nc.assert.outer, inner: nc.assert.inner }, utterance);
    logDebug({ kind: 'input', utterance, locale, source: 'name-center', rename: nc, result: res.ok ? 'ok' : res.reason });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.rename_${res.reason}`, { from: nc.from, to: nc.to }));
    return;
  }
  // A relabel ("rename E to G" / "שנה שם E ל-G") is a store operation, not a
  // geometry command — handle it before the parser so it never enters the figure.
  const ren = parseRename(utterance);
  if (ren) {
    const res = store().rename(ren.from, ren.to);
    logDebug({ kind: 'input', utterance, locale, source: 'rename', rename: ren, result: res.ok ? 'ok' : res.reason });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.rename_${res.reason}`, { from: ren.from, to: ren.to }));
    return;
  }
  // A merge ("merge F into E" / "מזג F ל-E") folds two existing points into one — also a
  // store operation, handled before the parser. Distinct from rename (the target survives).
  const mrg = parseMerge(utterance);
  if (mrg) {
    const res = store().merge(mrg.from, mrg.to);
    logDebug({ kind: 'input', utterance, locale, source: 'merge', rename: mrg, result: res.ok ? 'ok' : res.reason });
    if (res.ok) ui.clearText();
    else ui.setRenameNote(t(`input.merge_${res.reason}`, { from: mrg.from, to: mrg.to }));
    return;
  }
  // LaTeX-pasted input ($…$, \triangle, \parallel) — a FORMAT guide (#329, ADR-289 family). Checked
  // PRE-parse because a `$…$` ratio partial-parses to a WRONG figure (so the post-failure register would
  // miss it), and a `$`/`\`-command never appears in real input, so this can never swallow a construction.
  // Points the student at the plain notation / the symbol palette; never a paid LLM call on LaTeX.
  if (looksLikeLatex(utterance)) {
    logDebug({ kind: 'input', utterance, locale, source: 'scope', result: 'scope:latex' });
    ui.setInputNote(t('input.scope.latex'));
    return;
  }
  // A NEGATED statement (#436, the P1) — refused here, PRE-parse, for the LaTeX reason verbatim: every
  // rule stepped over the negation word, so the negated form lowered to the POSITIVE form's commands
  // («זווית A לא ישרה» → `set-angle A = 90`) and committed the opposite of the given with a green ✓.
  // A wrong figure that agrees with nothing the student said is the worst outcome the tool can produce;
  // an honest refusal is strictly better until the requirement lane can represent an exclusion.
  const negated = statedNegation(utterance);
  if (negated) {
    logDebug({ kind: 'input', utterance, locale, source: 'scope', result: 'scope:negation' });
    ui.setInputNote(t('input.scope.negation', { word: negated }));
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
  let pctx = parseCtxNow();
  let r = parse(utterance, pctx);
  // #186: a circle referenced BY NAME that matches no existing circle, while UNNAMED (auto-centre)
  // circles are on canvas, is naming-by-use of one of THEM — the student cannot know the internal
  // names (hidden centres, FR-RN-8) and refers to a drawn circle by a name of their own («D ו F על
  // מעגל O1» after «שני מעגלים נחתכים», prod session hqxbjh0x). Committing the parser's invented
  // circle would silently build a WRONG figure (a third circle). Bind the fresh name to the
  // resolvable unnamed circle (the #112 `nameCentre` machinery) and re-parse; genuinely ambiguous →
  // ask which circle is meant (never a silent pick, never an LLM guess).
  let boundName = false; // a #186 auto-bind happened — the submission already changed the figure (a naming)
  for (let guard = 0; r.ok && guard < 3; guard++) {
    const bind = impliedCircleBinding(r.commands, pctx);
    if (bind && 'clarify' in bind) {
      logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `unknown-circle:${bind.center}` });
      ui.setInputNote(t('input.unknownCircle', { center: bind.center }));
      ui.setBusy(false);
      return;
    }
    if (bind) {
      const res = store().nameCentre(bind.from, bind.to);
      if (!res.ok) break; // can't bind (e.g. letter taken) — the implicit creation stands, as before
      boundName = true;
      logDebug({ kind: 'input', utterance, locale, source: 'name-center', rename: bind, result: 'auto-bind', intermediate: true });
    } else {
      // #539 — the POINT edition: a fresh set-line label whose stated slot an AUTO-NAMED drawn point
      // structurally occupies is that point under the student's name (the touch «M» typed as «E») —
      // rename it instead of minting a duplicate node beside it.
      const pbind = impliedPointBinding(r.commands, pctx, autoNamedLabels(store().facts));
      if (!pbind) break;
      const res = store().rename(pbind.from, pbind.to);
      if (!res.ok) break; // can't bind — the fresh-rider reading stands, as before
      boundName = true;
      logDebug({ kind: 'input', utterance, locale, source: 'rename', rename: pbind, result: 'auto-bind-point', intermediate: true });
    }
    const st = store();
    const d = replay(st.facts, st.seed, st.radiusOverrides);
    pctx = buildParseCtx(d.construction, d.positions);
    r = parse(utterance, pctx);
  }
  // A single-vertex angle ("∠B = 90") the parser flagged as ambiguous (the vertex has ≠2 edges, so WHICH
  // angle is meant is unclear) — ask the student to name all three letters instead of escalating to the LLM
  // (which would only guess). Keep the text so they can edit it into the three-letter form.
  if (!r.ok && r.reason === 'ambiguous-angle') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `ambiguous-angle:${r.vertex}` });
    ui.setInputNote(t('input.ambiguousAngle', { vertex: r.vertex }));
    ui.setBusy(false);
    return;
  }
  // An angle-alias name that is already taken (an existing point, or an alias bound to a different
  // angle) — the student picks another name (#235, ADR-386); never a silent rebind or an LLM guess.
  if (!r.ok && r.reason === 'alias-taken') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `alias-taken:${r.name}` });
    ui.setInputNote(t('input.aliasTaken', { name: r.name }));
    ui.setBusy(false);
    return;
  }
  // A BOUND radius symbol («R» after «רדיוס מעגל O הוא R») reused as a POINT label («מיתר AR») — once bound,
  // the letter IS the parametric radius, never a node (operator ruling, #198). Say so deterministically and
  // keep the text so the student renames the point; never a paid LLM call that would mint the node R.
  if (!r.ok && r.reason === 'reserved-symbol') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `reserved-symbol:${r.symbol}` });
    ui.setInputNote(t('input.reservedSymbol', { symbol: r.symbol }));
    ui.setBusy(false);
    return;
  }
  // A reference to a centre carrying a CONCENTRIC PAIR with no outer/inner qualifier (ADR-244) — ask
  // WHICH circle is meant instead of picking silently or escalating to the LLM (which would only guess).
  if (!r.ok && r.reason === 'ambiguous-circle') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `ambiguous-circle:${r.center}` });
    ui.setInputNote(t('input.ambiguousCircle', { center: r.center }));
    ui.setBusy(false);
    return;
  }
  // #354: a containment whose CONTAINER was not named, on a figure with 2+ circles — which one contains it
  // is the student's to say (ADR-052), so ask instead of escalating to an LLM that could only guess.
  if (!r.ok && r.reason === 'ambiguous-container') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `ambiguous-container:${r.centers.join(',')}` });
    ui.setInputNote(t('input.ambiguousContainer', { circles: r.centers.join(', ') }));
    ui.setBusy(false);
    return;
  }
  // Every common tangent of the requested kind is already drawn (#197 Am. 3) — a further one does not
  // exist; say so plainly instead of escalating or grinding an impossible solve.
  if (!r.ok && r.reason === 'tangents-exhausted') {
    logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `tangents-exhausted:${r.kind}` });
    // Position-accurate refusal (#197 Am. 8): the true tangent count depends on the pair's mutual
    // position — disjoint 4, externally tangent 3, intersecting 2, internally tangent 1, contained 0.
    const msgKey =
      r.hint === 'at-touch' ? 'input.tangentsExhaustedTouch'
      : r.position === 'contained' ? 'input.tangentsExhaustedContained'
      : r.position === 'int-tangent' ? (r.kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntTangent')
      : r.position === 'intersecting' ? (r.kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntersecting')
      : r.position === 'ext-tangent' ? (r.kind === 'external' ? 'input.tangentsExhaustedExternal' : r.kind === 'internal' ? 'input.tangentsExhaustedTouchTaken' : 'input.tangentsExhaustedExtTangent')
      : r.kind === 'external' ? 'input.tangentsExhaustedExternal'
      : r.kind === 'internal' ? 'input.tangentsExhaustedInternal'
      : 'input.tangentsExhaustedAny';
    ui.setInputNote(t(msgKey));
    ui.setBusy(false);
    return;
  }
  // Analytic / coordinate-geometry terminology (axes, coordinates, slope, line equations) — a DIFFERENT
  // tool. This one builds synthetic constructions; a coordinate-geometry tool is planned separately.
  // Refuse immediately with the pedagogical "wrong tool" message and tag it `scope:analytic` — never spend
  // an LLM call on input that can never build. (Runs only on a failed grammar parse; a coordinate free-point
  // like "A = (3,5)" parses via `freePoint` and never reaches here.)
  if (!r.ok) {
    const oos = classifyOutOfScope(utterance);
    // #43 (ADR-289): the whole GUIDANCE register short-circuits BEFORE the LLM — none of these
    // families can ever build, so an LLM call on them is pure cost (the analytic precedent).
    const PRE_LLM = new Set(['analytic', 'cross-app', 'ui-command', 'valueless-query', 'orientation', 'bare-point', 'unnamed-sides', 'compound-relation']);
    if (oos && PRE_LLM.has(oos.category)) {
      logDebug({ kind: 'input', utterance, locale, source: 'scope', result: `scope:${oos.category}` });
      ui.setInputNote(t(oos.messageKey, oos.params));
      ui.setBusy(false);
      return;
    }
  }
  let weak: 'error' | 'empty' | 'dropped' | null = null;
  if (r.ok) {
    const pts = pctx.points ?? [];
    // A typo in a keyword (e.g. "מנוקדה" for "מנקודה") can make a rule match PARTIALLY, silently dropping
    // a NEW label it introduced ("from D …") — committing a wrong/partial figure. When the parse leaves a
    // new input label unused, escalate to the LLM (whose job is freeform/typo input) instead of committing
    // the partial parse (ADR-089). An EXISTING label a command doesn't re-name is fine (context).
    const dropped = droppedNewLabels(utterance, r.commands, pts, (pctx.radiusSymbols ?? []).map((x) => x.name));
    // The NUMERIC sibling (ADR-250): a stated magnitude the commands don't account for means the rule
    // consumed only part of the utterance (usually a typo'd keyword mid-sentence) — escalate, never
    // commit the partial meaning (a "שטח… פי 2.25 משוטח…" typo used to commit as a bare triangle, ✓).
    const droppedNums = droppedGivenNumbers(utterance, r.commands);
    // The RELATION sibling (ADR-264): a stated `AB=CD`/`AB⊥CD`/`AB∥CD` between points that all already
    // appear on the shape trips neither older gate — never commit a figure missing the student's given.
    const droppedRels = droppedGivenRelations(utterance, r.commands);
    // The VERB sibling (ADR-292, the #82 P1): a stated tangency/bisection/… verb entirely absent
    // from the lowering means a rule claimed a compound and dropped a given — never commit it.
    const droppedVerbs = droppedGivenVerbs(utterance, r.commands);
    // The STRUCTURAL sibling (#153/#145): a compound measure relation («X + Y = Z + W», «DM·ME=BM·DR»)
    // whose lowering doesn't carry the FULL term list was truncated to a different, wrong constraint —
    // the labels all land, so the older gates never fire. Never commit it.
    const droppedCompound = droppedCompoundRelation(utterance, r.commands);
    // The WORD sibling (ADR-360, #210): a relation stated as a word between circle nouns («שני
    // מעגלים זרים») that the lowering doesn't encode — never commit the unrelated pair.
    const droppedWordRels = droppedWordRelations(utterance, r.commands);
    // The COMPARISON sibling (ADR-390, the #277 P1): a measure compared to a NUMBER states a REGION.
    // A lowering with no bound/order constraint read it as the EQUALITY at the bound — every label and
    // the number itself land, so no older gate fires. Never commit the student's ">" as an "=".
    const droppedCmp = droppedComparison(utterance, r.commands);
    // The OBJECT sibling (ADR-430, #456 — the 3-D ADR-3D-113 class, ported as a pattern): the utterance
    // states a shape AND a construct on it, and the rule that recognised its own noun emitted only the
    // shape («מלבן ABCD עם אלכסונים» → a bare rectangle, ✓). Every gate above asks about labels, numbers,
    // relations, verbs, compounds, words and comparisons — none asks whether a stated OBJECT materialised.
    const droppedConstruct = droppedConstructNoun(utterance, r.commands);
    if (dropped.length === 0 && droppedNums.length === 0 && droppedRels.length === 0 && droppedVerbs.length === 0 && droppedCompound.length === 0 && droppedWordRels.length === 0 && !droppedCmp && droppedConstruct.length === 0) {
      const st = store();
      // #41 (ADR-290): warm the candidate content's FOLD in the geometry WORKER first — the dry-run,
      // the commit, and every later replay of this content then run at TAIL speed on the main thread
      // (the one unbudgeted cold fold, measured ~26 s on the #59 figure, used to block the tab here).
      try {
        const trial = trialFacts(st.facts, r.commands);
        const fold = await geoWork.prefold(trial, st.seed);
        if (fold) primeFoldFor(trial, fold);
      } catch (err) {
        if (!isCancelled(err)) throw err; // cancelled prefold: fall through — the sync path still works
      }
      // A deterministic parse can "succeed" yet build NOTHING — apply with an error (kept-prior) or
      // change nothing at all. Dry-run before committing so a silent fail isn't shown as success
      // (operator request); a step that builds something commits immediately.
      const outcome = dryRunOutcome(st.facts, r.commands, st.seed, st.radiusOverrides);
      if (outcome.produced) {
        // One utterance → one BATCH commit (one group id, one set, ONE undo entry — E4/STO-4).
        store().executeMany(r.commands, utterance);
        // SPAN-ACCOUNTING SHADOW (S3.1 of docs/24 — never refuses; the enforcing flip is the
        // operator's, §4.2): log what the total accountant WOULD have flagged on this committed
        // parse, so real traffic accumulates the divergence evidence the flip decision needs.
        const shadow = spanShadow(utterance, r.commands, { existingPoints: pctx.points, radiusSymbols: (pctx.radiusSymbols ?? []).map((x) => x.name), angleAliases: (pctx.angleAliases ?? []).map((x) => x.name) });
        logDebug({ kind: 'input', utterance, locale, source: 'parser', commands: r.commands, ...(shadow ? { spanShadow: shadow } : {}) });
        // ADR-428 obligation 2 — TEACH on acceptance. The step committed; if the phrasing was understood
        // but is not the canonical form, show the canonical spelling so the habit the student builds is
        // one we can promise to honour. A note on a SUCCESSFUL step, never a refusal.
        const teach = teachCanonical(utterance, r.commands, locale);
        if (teach) ui.setInputNote(t('input.canonicalHint', { canonical: teach }));
        ui.clearText();
        deps.resolveAfterCommit();
        return;
      }
      // A cleanly-parsed CONSTRAINT that errored only because it can't be satisfied AT THIS POSITION (an
      // under-determined coupled solve before its pinning givens arrive — e.g. "CE⟂AB" before "CD=36,
      // DE=18") is NOT an LLM problem: the LLM would re-emit the same command, or drop it. Commit it so
      // `replay`'s deferral retries it once the later givens pin the figure (ADR-104) — order-independence.
      // A genuine contradiction then surfaces honestly as a failing step instead of "couldn't read that".
      // The gate is the SAME one `classify` applies after replay (issue #207 / ADR-385): a CONCLUDED
      // contradiction — a relation whose residual is invariant or provably one-signed across the free
      // configurations — must take the honest-refusal route below, never park as «waiting for givens».
      if (outcome.reason === 'error' && deferralWorthwhile(st.facts, r.commands)) {
        store().executeMany(r.commands, utterance);
        logDebug({ kind: 'input', utterance, locale, source: 'parser', result: 'deferred-constraint', detail: outcome.detail, commands: r.commands });
        ui.clearText();
        deps.resolveAfterCommit();
        return;
      }
      // A cleanly-PARSED command the engine CAN'T satisfy against the current figure (and not a deferrable
      // constraint) is a CONTRADICTION with the existing data — not a phrasing problem, so the LLM can't fix
      // it (it would re-emit the same in-grammar command). Show the SPECIFIC reason (humanized: "…contradicts
      // an earlier given", "C is already defined — edit/delete the earlier step") instead of the generic
      // "produced nothing". (ADR-156 follow-up — the "impossible with the current data" message.)
      if (outcome.reason === 'error') {
        logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `conflict:${outcome.detail ?? ''}`, commands: r.commands });
        ui.setInputNote(outcome.detail ? deps.explainError(outcome.detail) : t('input.producedNothing'));
        ui.setBusy(false);
        return; // keep the text so the student can edit/delete it
      }
      // A clean RE-ENTRY of things that already exist (re-typing a shape, re-inscribing points already on
      // the circle) parses fine but produces nothing NEW. That's not a failure and must not escalate to the
      // LLM (which would just say "couldn't build"): tell the student it's already drawn. Signal: produced
      // nothing, NOT an error, and the utterance introduces no new label (every label it names already
      // exists). (ADR-156 follow-up — the friendly no-op message.)
      if (outcome.reason === 'empty') {
        // A #186 auto-bind ALREADY changed the figure (an unnamed circle took the student's name and
        // its centre revealed) — geometrically-idempotent leftovers ("D,F on circle O1" when D,F
        // already ride it) are then a SUCCESS, not "already drawn" and never an LLM escalation.
        if (boundName) {
          logDebug({ kind: 'input', utterance, locale, source: 'parser', result: 'bound-circle-name', commands: r.commands });
          ui.clearText();
          ui.setBusy(false);
          return;
        }
        const existing = new Set(pts.map((p) => p.toUpperCase()));
        const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
        if (newLabels.length === 0) {
          logDebug({ kind: 'input', utterance, locale, source: 'parser', result: 'noop-exists', commands: r.commands });
          ui.setInputNote(t('input.alreadyDrawn'));
          ui.clearText();
          ui.setBusy(false);
          return;
        }
      }
      weak = outcome.reason; // parsed but produced nothing → fall through to the LLM second attempt
      // `intermediate`: this weak grammar attempt ALWAYS escalates to the LLM below, whose outcome is
      // logged as the submission's FINAL result — keep this step in the DEV trace but don't let it
      // become a second analytics `submit` (else the dashboard double-counts the utterance). See sessionLog.
      logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `weak:${outcome.reason}`, detail: outcome.detail, commands: r.commands, intermediate: true });
    } else {
      weak = 'dropped'; // a typo dropped a stated label/number/relation/verb/compound-structure/object → escalate rather than commit the partial parse
      logDebug({ kind: 'input', utterance, locale, source: 'parser', result: `weak:dropped:${[...dropped, ...droppedNums, ...droppedRels, ...droppedVerbs, ...droppedCompound, ...droppedConstruct].join(',')}`, commands: r.commands, intermediate: true });
    }
  }
  // A magnitude written with the WORD «שורש N» that reached the escalation seam — the #105 `שורש→√`
  // normalization already builds the forms that CAN (e.g. «AB = שורש 27»), so those never get here; the
  // rest (the area copula «שטח … שווה לשורש 27») get the "use the √ symbol" nudge instead of a paid LLM
  // call that would only re-fail (#246, operator ruling 2026-07-21). Only at the seam, so a working שורש
  // form is never brushed off. The FORMAT twin of the pre-parse LaTeX guard above.
  if (wordRootMagnitude(utterance)) {
    logDebug({ kind: 'input', utterance, locale, source: 'scope', result: 'scope:word-root' });
    ui.setInputNote(t('input.scope.word-root'));
    ui.setBusy(false);
    return;
  }
  // #108 (operator ruling): a COMPOUND line — a shape noun with a property glued on, or several sentences
  // at once — is TAUGHT, not auto-parsed: quote the pieces back as numbered steps. Checked at the seam (like
  // the two guards above) because a SUPPORTED compound (ADR-264's connector form «דלתון ABCD, AB=AD»)
  // matches the same shape and parses — so this must only ever see input the grammar already declined. An
  // LLM call here would be both cost and the wrong answer: it would silently parse what the ruling forbids.
  const split = splitGuidance(utterance);
  if (split) {
    logDebug({ kind: 'input', utterance, locale, source: 'scope', result: `scope:${split.category}` });
    ui.setInputNote(t(split.messageKey, split.params));
    ui.setBusy(false);
    return;
  }
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
    out !== null && out.built.length > 0 && dryRunOutcome(cur.facts, llmCmds, cur.seed, cur.radiusOverrides).produced;
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
  logDebug({ kind: 'input', utterance, locale, source: 'llm', built: out!.built.map((g) => g.step), dropped: out!.dropped, commands: llmCmds });
  ui.setLlmDropped(out!.dropped);
  ui.clearText();
  deps.resolveAfterCommit();
}
