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
import { logDebug } from '@/debug/sessionLog';

export interface EditDeps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** The aria-live note under the input — how a refusal reaches the student. */
  setInputNote(msg: string): void;
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
  store().replaceGroup(key, r.commands, editText.trim());
  logDebug({ kind: 'action', action: 'edit', detail: `${key} → ${editText.trim()}` }); // #84: so a reported session replays edits
  setInputNote('');
  return true;
}
