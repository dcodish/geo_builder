/**
 * THE submit gate, extracted once (#960, [ADR-495](../../docs/06-decisions.md#adr-495)).
 *
 * `factsOf`/`replayFacts` ({@link ./scenario-pipeline}) drive `parse → replay`, which is the right path
 * for asking *"what figure do these facts make?"* — and the wrong one for asking *"would the app have
 * accepted this line?"*. They differ on exactly one thing, and it is the thing that matters: **the app
 * refuses some lines BEFORE they become facts**, while `factsOf` commits every step unconditionally.
 * `submitPipeline.ts` says so in its own words on the reported path:
 *
 * > *a contradicting line is refused BEFORE it becomes a fact, so the fact-list lookup the banner uses
 * > has nothing to find here* … `ui.setInputNote(…); return; // keep the text so the student can edit it`
 *
 * A scenario built with `factsOf` can therefore lock a state the UI cannot reach. That is not
 * hypothetical: two of the #955 play cases died at line 3 on the operator's canvas because the sequences
 * were authored headlessly and never driven through this gate.
 *
 * This module is the deterministic half of `App.submit`, in ONE place. It was previously copied inline
 * twice inside `scenarios-props-submit-gate.test.ts` (as `submit` and as `classify`), which is the
 * ADR-346 mirror-drift shape: two hand-copies of a decision that lives somewhere else.
 *
 * **Deterministic half only, deliberately.** The LLM lane is not modelled — it is mocked in tests and
 * is not deterministic — so {@link gateVerdict} answers *"does the DETERMINISTIC path commit this?"*.
 * A `refused` verdict is exactly the point where the app either escalates to the LLM or shows a note.
 *
 * No `vitest` import, on purpose: `run-sequence.mjs` runs under vite-node, where importing `expect`
 * throws (the #567 layering split that created `scenario-pipeline.ts`).
 */
import { parse, droppedNewLabels, droppedGivenNumbers } from '@/parser';
import { useGeoStore, dryRunOutcome, deferralWorthwhile } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { ctxOf } from './scenario-pipeline';

/** Why the deterministic path did not commit — the app's own branch, named. */
export type GateRefusal =
  /** the grammar could not read it: the app escalates to the LLM */
  | 'parse'
  /** parsed, but a stated label or magnitude would be silently dropped — never committed */
  | 'honesty-gate'
  /** parsed and lowered, but the engine cannot satisfy it here and it is not deferral-worthy:
   *  refused pre-commit with a note, the line stays in the box, no fact and no red row */
  | 'error'
  /** parsed and committed nothing NEW: a re-entry ("already drawn") or an unreadable no-op */
  | 'empty';

export type GateVerdict =
  | { kind: 'commit'; commands: AnyCommand[] }
  /** a clean RE-ENTRY of things that already exist — friendly, and NOT an escalation (ADR-156) */
  | { kind: 'noop' }
  | { kind: 'refused'; reason: GateRefusal; detail?: string };

/**
 * Would `App.submit`'s deterministic path commit `utterance` against `facts`?
 *
 * Mirrors `src/app/submitPipeline.ts`: parse → the dropped-label/dropped-number honesty gates →
 * `dryRunOutcome` → commit when it PRODUCED something, or when it errored and the constraint is
 * deferral-worthy (ADR-104's order-independence), else refuse.
 */
export function gateVerdict(facts: Fact[], utterance: string, seed = 0): GateVerdict {
  const ctx = ctxOf(facts);
  const r = parse(utterance, ctx);
  if (!r.ok) return { kind: 'refused', reason: 'parse', detail: r.reason };
  if (droppedNewLabels(utterance, r.commands, ctx.points ?? []).length > 0 || droppedGivenNumbers(utterance, r.commands).length > 0) {
    return { kind: 'refused', reason: 'honesty-gate' };
  }
  const outcome = dryRunOutcome(facts, r.commands, seed);
  if (outcome.produced || (outcome.reason === 'error' && deferralWorthwhile(facts, r.commands))) {
    return { kind: 'commit', commands: r.commands };
  }
  if (outcome.reason === 'empty') {
    // ADR-156: re-typing something already drawn is a friendly no-op, never an LLM escalation. The
    // signal is "produced nothing, not an error, and every label it names already exists".
    const existing = new Set((ctx.points ?? []).map((p) => p.toUpperCase()));
    const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
    if (newLabels.length === 0) return { kind: 'noop' };
  }
  return { kind: 'refused', reason: outcome.reason === 'error' ? 'error' : 'empty', detail: outcome.detail };
}

/**
 * Drive a sequence through the gate, committing what the app would commit — so the resulting fact list
 * is **what the UI would actually hold**, and a refused line is reported rather than silently folded in.
 *
 * Uses the live store because `dryRunOutcome` is defined against it, exactly as the app does; callers
 * are expected to `useGeoStore.getState().clear()` first (this does it for them).
 */
export function driveThroughGate(utterances: string[]): { facts: Fact[]; refused: { index: number; utterance: string; verdict: GateVerdict }[] } {
  const store = useGeoStore.getState();
  store.clear();
  const refused: { index: number; utterance: string; verdict: GateVerdict }[] = [];
  utterances.forEach((utterance, index) => {
    const v = gateVerdict(useGeoStore.getState().facts, utterance, useGeoStore.getState().seed);
    if (v.kind === 'commit') {
      const group = `g${useGeoStore.getState().facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, utterance, group);
      return;
    }
    if (v.kind === 'noop') return; // nothing to commit, and nothing wrong
    refused.push({ index, utterance, verdict: v });
  });
  return { facts: useGeoStore.getState().facts, refused };
}
