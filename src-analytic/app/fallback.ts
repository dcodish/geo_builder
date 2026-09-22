/**
 * THE LLM FALLBACK'S DECISION (#1251) — pure, injectable, and the reason a hallucination is harmless.
 *
 * Operator ruling, 2026-09-19 (round #1244, T19): *"we should have an llm fallback like we have in 2d
 * and 3d. this is true to all tools"*. Analytic had none — `not-handled` rendered and stopped, so
 * every gap in the grammar was a hard wall and every refusal was the student's final answer.
 *
 * ## The safety argument, and it is structural
 *
 * The model does not emit facts. It returns **canonical command lines**, and every one of them is put
 * back through {@link decideSubmit} — the same gate a student's own typing meets, including the
 * deterministic parser, the fold, and the refusal codes. So the model cannot reach the engine with
 * anything the grammar would not have accepted from a person, and it cannot commit a figure the fold
 * rejects. A hallucinated line is simply refused, exactly as a typo is.
 *
 * ## ALL-OR-NOTHING, deliberately
 *
 * If any returned line is refused, **nothing is recorded**. A partial construction is the honesty
 * failure this repo treats as cardinal: the student asked for one figure and would silently get part
 * of one, with no indication which part went missing. 2-D reaches the same conclusion by a different
 * route (its honesty battery refuses a fallback that drops a stated given); here the rule is simpler
 * because the unit is a whole utterance.
 *
 * `already-known` and `already-follows` are NOT refusals — a model that restates something true has
 * produced a valid line that adds nothing, and the remaining lines still stand.
 *
 * ## No live call in tests
 *
 * `ask` is injected. `docs/08` requires the fallback to be mocked everywhere, and standing rule 2
 * forbids firing a live call without the operator. Nothing in this module reaches the network.
 */

import { decideSubmit, type SubmitVerdict } from './submit';
import { derive } from '../engine/derive';
import type { LlmStepsOutcome } from '../parser/llmAnalytic';
import { restoreStatedSequencesAnalytic } from '../parser/honestyAnalytic';

export type FallbackOutcome =
  /** The proxy was throttled. The caller says "busy", never "I did not understand". */
  | { kind: 'busy'; why: 'rate-limited' | 'daily-limit' }
  /** No usable answer, or the model judged the request inexpressible. Keep the deterministic refusal. */
  | { kind: 'none' }
  /**
   * Every line was accepted. Record them, in order.
   *
   * `restored` lists any `WAS→WANT` point-run corrections the sequence gate made (#1356). Carried out
   * so the caller can log them: both siblings do, and it is how #536 was diagnosed at all — without it
   * a `source:'llm'` submit that was silently corrected is indistinguishable from one that was not.
   */
  | { kind: 'lines'; lines: string[]; restored?: string[] }
  /**
   * The model answered and at least one line would be refused. Nothing is recorded, and the caller
   * keeps the ORIGINAL refusal rather than reporting the model's line — the student never wrote it,
   * so naming it would be reporting internal state (the honesty invariant on error messages).
   */
  | { kind: 'rejected'; refusedStep: string };

/** What the model is told the figure already holds. Kept short — the proxy caps it at 1000 chars. */
export function fallbackContext(lines: readonly string[]): string {
  if (!lines.length) return 'The figure is empty.';
  return ['The student has already stated, in order:', ...lines.map((l, i) => `${i + 1}. ${l}`)].join('\n');
}

/**
 * Run the fallback for one refused utterance.
 *
 * `ask` is the transport (`llmParseAnalytic` in the app, a stub in tests). `lines` is the figure as
 * accepted so far; `seed` is the configuration on screen.
 */
export async function runFallback(
  utterance: string,
  lines: readonly string[],
  seed: number,
  ask: (utterance: string, context: string) => Promise<LlmStepsOutcome | null>,
): Promise<FallbackOutcome> {
  const answer = await ask(utterance, fallbackContext(lines));
  if (!answer) return { kind: 'none' };
  if (answer.busy) return { kind: 'busy', why: answer.busy };
  if (!answer.steps.length) return { kind: 'none' };

  /**
   * THE SEQUENCE GATE (#1356), before anything re-parses — the siblings' rule, reached here at last.
   *
   * *Never reorder the letters of a point sequence: the sequence IS the statement.* 2-D #536 was a
   * production P1 for exactly this — the model alphabetised a stated betweenness and the figure
   * committed the NEGATION of the given. The system prompt asks the model not to; a prompt is a
   * request, and #1251's own ADR argues this lane's safety must not rest on one.
   *
   * It runs BEFORE `decideSubmit` because the restored spelling is what must be parsed, recorded and
   * read back — restoring afterwards would fix the text and leave the figure wrong.
   */
  const gated = restoreStatedSequencesAnalytic(utterance, [...answer.steps]);

  // Re-decide each line against the figure as it would stand after the ones before it — the same
  // incremental path the student walks, so a later line may legitimately depend on an earlier one.
  const accepted: string[] = [];
  for (const step of gated.lines) {
    const soFar = [...lines, ...accepted];
    const verdict: SubmitVerdict = decideSubmit(step, soFar, seed, derive(soFar, seed));
    if (verdict.kind === 'refused' || verdict.kind === 'ignored') {
      return { kind: 'rejected', refusedStep: step };
    }
    // `already-known` / `already-follows` contribute nothing but are not failures: the model restated
    // something true. Drop the line and keep going rather than recording a duplicate.
    if (verdict.kind === 'record') accepted.push(verdict.line);
  }

  return accepted.length ? { kind: 'lines', lines: accepted, ...(gated.restored.length ? { restored: gated.restored } : {}) } : { kind: 'none' };
}
