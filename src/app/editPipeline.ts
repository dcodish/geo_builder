/**
 * The ✎ EDIT commit seam — the second commit path, extracted from `App.tsx` (#782, ADR-461).
 *
 * WHY IT MOVED. CLAUDE.md's module table has said all along that submit-path behaviour lives in
 * `src/app/`, "never inline in the component", and the submit path was extracted for exactly that reason
 * (S0.4 of docs/24 — a 400-line orchestration with zero direct tests). The edit seam stayed behind in the
 * component, and the consequence was #782: it ran NONE of the honesty gates, so an edit producing a
 * partial parse committed silently with the student's stated content gone. A seam nothing can call
 * directly is a seam nothing tests, and a seam nothing tests drifts from its sibling.
 *
 * This is a FAITHFUL move of `App.commitEdit`: the store is the same singleton, and the two UI concerns
 * it has (the aria-live input note and the translator) are injected. Its ordering contracts are preserved
 * verbatim, each with its original comment — the prefix-context parse (ADR-241), the #186/#539 implied
 * binding loops, the unreadable-edit refusal, the #779 convention nudge, and now the honesty battery.
 *
 * The seam REFUSES INLINE and never escalates to the LLM (operator ruling, 2026-08-25): an edit is a
 * student refining a step, not freeform input — and this is the third refusal of the same shape the
 * editor already shipped, not a new behaviour.
 */
import { buildParseCtx, impliedCircleBinding, impliedPointBinding, lowercaseLabelFold, parse } from '@/parser';
import { autoNamedLabels, groupKey, replay, useGeoStore } from '@/store/geoStore';
import { honestyGateReport } from './honestyGates';
import { impliedByPrior } from '@/replay/core';
import { logDebug } from '@/debug/sessionLog';

export interface EditDeps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** The aria-live note under the input — how a refusal reaches the student. */
  setInputNote(msg: string): void;
  /**
   * The POST-COMMIT configuration search (#1041), mirroring `SubmitDeps`.
   *
   * ADR-510 moved the synchronous `firstSatisfyingSeed` search out of both commit seams and into the
   * callers. `commitCommands`' caller — the submit pipeline — was re-armed; this one was not, and the
   * comment left behind in `replaceGroup` asserted a connection that did not exist. So an edit that
   * left the figure violating a requirement stayed broken silently and indefinitely, while
   * `replaceGroup` ALSO reset the seed to 0 (ADR-484) — discarding the student's working configuration
   * and then not searching for another.
   *
   * The class: **when work moves out of a shared callee into its callers, every caller is a seam that
   * must be re-armed**, and the inventory must be taken from the callee's call sites rather than from
   * the path being worked on. See #1132 for the mechanism that makes that inventory checkable.
   */
  resolveAfterCommit(): void;
}

/**
 * Re-parse an edited step and replace its group in place.
 * @returns true when the edit was committed; false leaves the editor open with the note explaining why.
 */
export function runEditCommit(key: string, editText: string, deps: EditDeps): boolean {
  const { t, setInputNote } = deps;
  const store = () => useGeoStore.getState();
  // Parse against the PREFIX context — the figure as it stands BEFORE the edited step — because the
  // replacement is spliced back at the step's original position and replayed there (ADR-015). The
  // end-state context lied: it contains points created by LATER steps (and by the old version of this
  // step), so context-sensitive lowering (M1 existing-id → constraint) chose a constraint form that is
  // wrong at the replay position — editing "AB קוטר"→"AC קוטר" saw the ⊥-step's C "existing" and
  // lowered to a bare collinearity, silently dropping the diameter's circle membership (ADR-241).
  const prefixCtx = () => {
    const facts = store().facts;
    const start = facts.findIndex((f) => groupKey(f) === key);
    const prefix = start >= 0 ? facts.slice(0, start) : facts;
    const before = replay(prefix);
    return buildParseCtx(before.construction, before.positions);
  };
  let ectx = prefixCtx();
  let r = parse(editText, ectx);
  // #186: an edit referencing a circle by a name that matches no circle binds an UNNAMED circle the
  // same way submit does (the prod session's «מעגל O!» → «מעגל O1» edit) — clarify when ambiguous.
  for (let guard = 0; r.ok && guard < 3; guard++) {
    const bind = impliedCircleBinding(r.commands, ectx);
    if (bind && 'clarify' in bind) {
      setInputNote(t('input.unknownCircle', { center: bind.center }));
      return false;
    }
    if (bind) {
      const res = store().nameCentre(bind.from, bind.to);
      if (!res.ok) break;
    } else {
      // #539: the POINT edition, mirroring submit — a fresh set-line label whose slot an auto-named
      // drawn point structurally occupies renames that point (auto-named judged over ALL facts, so a
      // label the student typed anywhere is never grabbed).
      const pbind = impliedPointBinding(r.commands, ectx, autoNamedLabels(store().facts));
      if (!pbind) break;
      const res = store().rename(pbind.from, pbind.to);
      if (!res.ok) break;
    }
    ectx = prefixCtx();
    r = parse(editText, ectx);
  }
  if (!r.ok || r.commands.length === 0) {
    setInputNote(t('steps.editRefused'));
    return false;
  }
  // #779 — the convention nudge holds on the EDIT seam too (a commit seam is a commit seam):
  // an edited step whose parse read a lowercase label refuses with the corrected sentence.
  const fold = lowercaseLabelFold(editText, r.commands);
  if (fold) {
    setInputNote(t('input.scope.lowercase-labels', { corrected: fold.corrected }));
    return false;
  }
  // #782 (ADR-461) — THE HONESTY-GATE BATTERY, on this seam too. Until now the ✎ path ran none of the
  // `dropped*` / span-accounting gates, so a PARTIAL parse committed silently with stated content gone:
  // the exact class the submit gates refuse, one seam over, and bypassable for every gate added since
  // ADR-089. The battery is one function (`honestyGates`) and BOTH seams call it, so the next gate lands
  // here for free (ADR-W-006 — derive, don't duplicate). The note names what was left unread using the
  // student's own tokens, never a gate name (an error names the statement, not the machinery).
  const gates = honestyGateReport(editText, r.commands, ectx);
  if (!gates.clean) {
    logDebug({ kind: 'input', utterance: editText, source: 'parser', result: `edit-dropped:${gates.items.join(',')}`, commands: r.commands });
    setInputNote(t('steps.editDropped', { items: gates.items.join(', ') }));
    return false;
  }
  // #926 (ADR-483, ADR-W-044): an edit that passes every gate can still take OTHER steps from ✓ to ✗ —
  // «∠ABC = α» → «∠ABC = 40» leaves «α = 70» with no letter to bind. The edit is committed (the student
  // asked for it) and the orphaned rows stay in the list, marked; what must not happen is a bare
  // success. The note names them in the student's own wording — the same report the delete path gets
  // from the fold's own banner, made explicit at the seam that returned `true`.
  /**
   * #999 (ADR-542) — THE SAME QUESTION ON THIS SEAM, THROUGH THE SAME FUNCTION.
   *
   * Exactly the `honestyGateReport` shape above (#782 / ADR-461 / ADR-W-006): one predicate, both
   * commit seams, so the next gate lands here for free. Asked against the PREFIX facts — the figure as
   * it stands BEFORE the edited step, the ADR-015 ordering this seam already established — because that
   * is what the replacement is replayed against. Refusing inline and leaving the editor open is this
   * seam's existing convention (`editRefused`, `editDropped`, the #779 nudge all return false with a
   * note); the edit seam never escalates to the LLM (operator ruling, 2026-08-25).
   */
  const prefixFacts = (() => {
    const facts = store().facts;
    const start = facts.findIndex((f) => groupKey(f) === key);
    return start >= 0 ? facts.slice(0, start) : facts;
  })();
  if (impliedByPrior(prefixFacts, r.commands, store().seed)) {
    logDebug({ kind: 'input', utterance: editText, source: 'parser', result: 'edit-implied-restatement', commands: r.commands });
    setInputNote(t('input.alreadyDrawn'));
    return false;
  }
  const wasOk = replay(store().facts, store().seed).status;
  store().replaceGroup(key, r.commands, editText.trim());
  logDebug({ kind: 'action', action: 'edit', detail: `${key} → ${editText.trim()}` }); // #84: so a reported session replays edits
  const after = replay(store().facts, store().seed).status;
  const orphaned = store().facts.filter((f) => wasOk[f.id] === 'ok' && after[f.id] !== 'ok' && after[f.id] !== 'disabled');
  setInputNote(orphaned.length > 0 ? t('steps.editBrokeDependents', { items: orphaned.map((f) => `«${f.utterance ?? f.cmd.type}»`).join(', ') }) : '');
  /**
   * The edit is committed — now search for a configuration that honours it (#1041).
   *
   * ONLY on the success return: every refusal above (unreadable edit, lowercase-label nudge, honesty
   * gate, unknown circle) returns false without launching anything.
   *
   * No condition is tested here on purpose. `runViewResolve` already early-returns when
   * `meetsRequirements` holds, so a clean edit costs nothing; repeating that test at the call site
   * would be a second copy of the trigger — the very shape that let this seam drift.
   *
   * `void`, not `await`: the boolean contract `FactList` depends on stays synchronous, and the search
   * runs off-thread exactly as it does after a submit.
   */
  void deps.resolveAfterCommit();
  return true;
}

/**
 * THE ENABLE SEAMS — flipping a given off and on again searches, exactly as a submit does (#1133).
 *
 * `toggle` and `setGroupEnabled` both reset the seed to 0 (ADR-484) and neither launched the
 * post-commit configuration search, so a student who unticked a given and ticked it back got a figure
 * that could sit there **violating a requirement the list shows as holding**.
 *
 * Measured on «משולש ABC» · «גובה AD במשולש ABC» · «AB = 10» · «AD = 7», through the real submit path:
 *
 * ```
 * after the build    seed 3   meetsRequirements: true    <- the submit's own search found seed 3
 * disable the given  seed 0   meetsRequirements: true       (fewer requirements to meet)
 * re-enable it       seed 0   meetsRequirements: FALSE   <- the defect
 * ```
 *
 * **Re-enabling is not like deleting.** `removeGroup` is exempt from the search because deletion only
 * ever relaxes — a satisfiable remainder was valid at seed 0 every time it was measured. Re-enabling
 * does the opposite: it ADDS a requirement back, which is the same direction as a submit, and submits
 * have always searched. That the two look like one "toggling" concern and behave like opposites is
 * exactly what an un-enumerated inventory hides (#1132).
 *
 * **No condition is tested at the call site**, deliberately and for the same reason `runEditCommit`
 * tests none: `runViewResolve` already early-returns when `meetsRequirements` holds, so disabling costs
 * nothing, and a second copy of the trigger here is the precise shape that produced #1041.
 *
 * `void`, not `await`: these are UI event handlers, and the search runs off-thread exactly as it does
 * after a submit.
 */
export function runToggleFact(id: string, deps: Pick<EditDeps, 'resolveAfterCommit'>): void {
  useGeoStore.getState().toggle(id);
  logDebug({ kind: 'action', action: 'toggle', detail: id }); // #84: so a reported session replays it
  void deps.resolveAfterCommit();
}

/** A whole group's `enabled`, flipped — the same seam, the same search (#1133). */
export function runSetGroupEnabled(
  key: string,
  enabled: boolean,
  deps: Pick<EditDeps, 'resolveAfterCommit'>,
): void {
  useGeoStore.getState().setGroupEnabled(key, enabled);
  logDebug({ kind: 'action', action: 'toggle-group', detail: `${key} → ${enabled}` });
  void deps.resolveAfterCommit();
}

/**
 * Deleting ONE fact of a group — armed, because it was MEASURED to need it (#1133).
 *
 * `removeGroup` is exempt from the search and that exemption is measured (#1041/ADR-518): deletion of
 * a whole statement only ever relaxes, and over 12 deletions across three figures a satisfiable
 * remainder was valid at seed 0 every time.
 *
 * **Removing one fact of a multi-fact group is a different act, and the measurement says so.** On
 * «משולש ABC» · «גובה AD במשולש ABC» · «AB = 10» · «AD = 7», deleting one fact of the altitude group
 * and one of the «AB = 10» group each left a figure that fails `meetsRequirements` at its seed **and
 * that the search can rescue** — the case #1041 looked for and did not find, because it was looking at
 * whole-group deletion. A partial group is not a relaxation; it is a different figure.
 *
 * `remove` has no UI caller today — the step list deletes whole groups. This is the armed path for the
 * day it gains one, and the registry in `issue-1041-edit-resolve.test.ts` is what makes that day
 * visible instead of silent.
 */
export function runRemoveFact(id: string, deps: Pick<EditDeps, 'resolveAfterCommit'>): void {
  useGeoStore.getState().remove(id);
  logDebug({ kind: 'action', action: 'delete', detail: id });
  void deps.resolveAfterCommit();
}
