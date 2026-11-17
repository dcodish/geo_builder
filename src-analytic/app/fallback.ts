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
 * A HELD line (#2790, ADR-AG-462: a `record` carrying the already-held notice) is NOT a refusal — a model that restates
 * something true has produced a valid line that adds nothing, and the remaining lines still stand. It is dropped, not
 * recorded: ADR-W-200's own row is for a line the STUDENT typed, and a model's restatement is not one.
 *
 * ## No live call in tests
 *
 * `ask` is injected. `docs/08` requires the fallback to be mocked everywhere, and standing rule 2
 * forbids firing a live call without the operator. Nothing in this module reaches the network.
 */

import { decideSubmit, isHeld, type RecordNotice, type SubmitVerdict } from './submit';
import { derive } from '../engine/derive';
import type { Seed } from '../engine/evaluate';
import type { LlmStepsOutcome } from '../parser/llmAnalytic';
import { existingNamesAnalytic, faithfulnessAnalytic, restoreStatedSequencesAnalytic } from '../parser/honestyAnalytic';
import type { InputError } from '../store/useAnalyticStore';
import { askKeepingNames, type NameRetry } from '../../shell/llm/retryLostNames';

export type Judged =
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
  | { kind: 'lines'; lines: string[]; restored?: string[]; notice?: RecordNotice; /** #2039 (ADR-AG-358): the configuration the last line was drawn in. */ configuration?: Seed }
  /**
   * The model answered and at least one line would be refused. Nothing is recorded, and the caller
   * keeps the ORIGINAL refusal rather than reporting the model's line — the student never wrote it,
   * so naming it would be reporting internal state (the honesty invariant on error messages).
   */
  | {
      kind: 'rejected';
      refusedStep: string;
      /**
       * WHY the tool declined the model's line (#1336) — the refusal key of the step's own verdict.
       *
       * Carried so the caller can say the honest middle: the student's sentence WAS understood and
       * the tool could not honour the completion — «not understood» blamed a sentence the tool had
       * read perfectly. The step text itself stays out of the message (#1251: never name a line the
       * student did not write); the key names the CLASS, which is the tool's own state.
       */
      code?: string;
      /** The model's WHOLE answer (after the sequence gate), for the log only (#1355: a rejection logged only its refused step). */
      answer?: string[];
    }
  /**
   * THE ANSWER DOES NOT SAY WHAT THE STUDENT SAID (#1355, ADR-AG-279). Every line re-parsed, but the
   * decomposition lost a name or a number the sentence stated, or wrote a name nobody stated. Nothing is
   * recorded, exactly as for a refused line.
   *
   * `dropped` is the student's OWN tokens as typed (names, then numbers): they may be shown, because the
   * student wrote them. `invented` is only a flag: the model's letter is neither typed by the student nor
   * shown by the figure, so it is never put in front of them (ADR-W-096).
   */
  | {
      kind: 'unfaithful';
      dropped: string[];
      invented: boolean;
      answer: string[];
      /**
       * #2225 (ADR-AG-281): names the FIGURE holds that the answer pulled in though the sentence never named them
       * («ישר l» → «דרך P עובר ישר l»). Shown, because the figure shows them (ADR-W-096).
       */
      inventedExisting?: string[];
    };

/** What came of the fallback, with the one retry (#2231, ADR-W-189) when one was made, for the log. */
export type FallbackOutcome = Judged & { retry?: NameRetry };

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
 *
 * #2231 (ADR-W-189): an answer that loses a name the student typed is asked for once more, naming what to keep
 * (`keep`, the third argument of `ask`, on the retry only). A lost number never retries. Whichever answer comes back
 * meets every gate below, so a name still lost is the `unfaithful` refusal that names it.
 *
 * #2680 (ADR-AG-450): an answer whose curve CONTRADICTS a statement's role (a focus, a diameter, a slope) is asked for
 * once more too, naming the statement (`contradicted`, the fourth argument of `ask`, on the retry only). Operator,
 * 2026-11-06: *"Or even go back to llm to get the correct one."* A retry that still contradicts it meets the same gate,
 * so it is the `unfaithful` refusal naming the value.
 */
/**
 * The two places the fallback SOLVES (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478)): the names the
 * figure holds, and the judging of the model's lines through the submit decision. The page passes its worker's
 * operations; a test, or a caller with no worker, runs them here.
 */
export interface FallbackSolver {
  existing(lines: readonly string[], seed: Seed): Promise<ReadonlySet<string>> | ReadonlySet<string>;
  judge(utterance: string, lines: readonly string[], seed: Seed, answer: LlmStepsOutcome | null, existing: ReadonlySet<string>): Promise<Judged> | Judged;
}
/** The names a figure holds (the fallback's faithfulness gate reads them). */
export const existingNamesOf = (lines: readonly string[], seed: Seed): Set<string> => new Set(existingNamesAnalytic(derive(lines, seed).construction));
const HERE: FallbackSolver = { existing: existingNamesOf, judge: (u, l, s, a, e) => judgeAnswer(u, l, s, a, e) };

export async function runFallback(
  utterance: string,
  lines: readonly string[],
  seed: Seed,
  ask: (utterance: string, context: string, keep?: readonly string[], contradicted?: readonly string[]) => Promise<LlmStepsOutcome | null>,
  solver: FallbackSolver = HERE,
): Promise<FallbackOutcome> {
  const context = fallbackContext(lines);
  const existing = await solver.existing(lines, seed);
  const gate = (a: LlmStepsOutcome) => faithfulnessAnalytic(utterance, restoreStatedSequencesAnalytic(utterance, [...a.steps]).lines, existing);
  const { answer, retry } = await askKeepingNames(
    (keep, contradicted) =>
      contradicted ? ask(utterance, context, keep, contradicted) : keep ? ask(utterance, context, keep) : ask(utterance, context),
    (a) => gate(a).droppedNames,
    (a) => !a.busy && a.steps.length > 0,
    (a) => gate(a).contradicted,
  );
  const out = await solver.judge(utterance, lines, seed, answer, existing);
  return retry ? { ...out, retry } : out;
}

/** The gates, on the one answer that goes on. */
export function judgeAnswer(utterance: string, lines: readonly string[], seed: Seed, answer: LlmStepsOutcome | null, existing: ReadonlySet<string>): Judged {
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
  // #1350 — a line the model named («ישר 3» beside «l3») earns the same notice a typed one does.
  let notice: RecordNotice | undefined;
  // #2039 (ADR-AG-358): each step is decided on the figure the step before it DREW, and the last drawn configuration is recorded
  let at: Seed = seed;
  for (const step of gated.lines) {
    const soFar = [...lines, ...accepted];
    const verdict: SubmitVerdict = decideSubmit(step, soFar, at, derive(soFar, at));
    // #1154 / #1303: a model line that RENAMES or SWAPS is rejected — the fallback adds givens; rewriting the student's
    // history is theirs to ask for, never the model's.
    if (verdict.kind === 'refused' || verdict.kind === 'ignored' || verdict.kind === 'rename' || verdict.kind === 'swap') {
      const code = verdict.kind === 'refused' ? (verdict.error as { key?: string }).key : undefined;
      return { kind: 'rejected', refusedStep: step, ...(code ? { code } : {}), answer: gated.lines };
    }
    // A held line contributes nothing but is not a failure: the model restated something true. Drop the line and keep
    // going rather than recording a duplicate (#2790, ADR-AG-462: the student's own row is for what HE typed).
    if (verdict.kind === 'record' && !isHeld(verdict)) {
      accepted.push(verdict.line);
      if (verdict.configuration !== undefined) at = verdict.configuration;
      notice ??= verdict.notice;
    }
  }

  /**
   * THE FAITHFULNESS GATES (#1355, ADR-AG-279) — after the re-parse, so an unbuildable answer keeps its own
   * refusal (ADR-AG-186), and before anything records. They read the WHOLE answer (`gated.lines`): a line
   * dropped above as already-known still states its given, so it still accounts for a name or a number.
   */
  if (accepted.length) {
    const f = faithfulnessAnalytic(utterance, gated.lines, existing);
    if (f.dropped.length || f.invented.length || f.inventedExisting.length) {
      return {
        kind: 'unfaithful',
        dropped: f.dropped,
        invented: f.invented.length > 0,
        answer: gated.lines,
        ...(f.inventedExisting.length ? { inventedExisting: f.inventedExisting } : {}),
      };
    }
  }

  return accepted.length
    ? { kind: 'lines', lines: accepted, configuration: at, ...(gated.restored.length ? { restored: gated.restored } : {}), ...(notice ? { notice } : {}) }
    : { kind: 'none' };
}

/**
 * WHAT THE STUDENT READS when the fallback recorded nothing (#1278, ADR-AG-186) — the one decision
 * `App.tsx` makes about an outcome, extracted so the app and the lock ask the same function.
 *
 * - `busy`: a throttle, never the student's fault.
 * - `rejected` with a REAL refusal key: the model produced a line the tool READ and declined, so the
 *   sentence was understood and the move is unsupported — the honest middle (#1336, ADR-AG-170).
 * - `rejected` with `not-handled`: the model's "line" is not a command at all (#1278's first live call
 *   answered «a line through (2,3) with slope 4» in English prose). The tool understood NOTHING — neither
 *   the student's sentence nor the model's — and «understood, not supported» would claim both a reading
 *   that never happened and a missing capability that exists. The student keeps the ORIGINAL refusal,
 *   which is about words they actually wrote.
 * - `none`: the model judged it inexpressible, or the transport failed — the original refusal too.
 * - `unfaithful` (#1355, ADR-AG-279): the answer lost what the student stated (`llm-dropped`, naming the
 *   student's own tokens) or named what they did not (`llm-invented`, naming nothing). Dropped first.
 */
export function fallbackRefusal(
  out: Exclude<FallbackOutcome, { kind: 'lines' }>,
  raw: string,
  original: InputError,
): InputError {
  if (out.kind === 'busy') return { key: 'llm-busy', detail: raw };
  // #1355 — dropped first, then invented (2-D's precedence). The dropped tokens are the student's own.
  if (out.kind === 'unfaithful') {
    if (out.dropped.length) return { key: 'llm-dropped', detail: raw, labels: out.dropped.join(', ') };
    if (out.invented || !out.inventedExisting?.length) return { key: 'llm-invented', detail: raw };
    // #2225 (ADR-AG-281): only names the figure already shows were pulled in — they may be named.
    return { key: 'llm-invented-existing', detail: raw, labels: out.inventedExisting.join(', ') };
  }
  if (out.kind === 'rejected' && out.code !== 'not-handled') return { key: 'llm-understood-unsupported', detail: raw };
  return original;
}
