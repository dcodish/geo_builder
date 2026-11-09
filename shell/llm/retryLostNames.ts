/**
 * THE ONE RETRY (#2231, [ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — when the AI's reading of a
 * sentence loses a name the student typed, ask once more, naming what to keep.
 *
 * Operator, 2026-10-16: *"1b"*; 2026-10-18: *"Retry once. If K is still missing, keep today's refusal naming K."*
 *
 * A SECOND TRIGGER (#2680, ADR-W-189 am. by [ADR-AG-450](../../docs/06c-decisions-analytic.md#adr-ag-450)): a builder whose
 * gate can tell that the answer CONTRADICTS a statement the student made (a focus (2,0) answered by a parabola whose focus
 * is (1,0)) injects `contradictedOf`, and the retry names those statements too. Operator, 2026-11-06: *"Or even go back to
 * llm to get the correct one."* A builder that injects nothing keeps the names-only retry, byte for byte.
 *
 * This file decides only WHETHER to ask again and WHICH answer goes on. It refuses nothing and commits nothing: the
 * answer it returns meets the builder's full gate battery, unchanged, so a name still lost is refused by the refusal
 * that names it (2-D ADR-240, 3-D ADR-3D-147, analytic ADR-AG-279). A lost plain number, relation or word never
 * triggers it: it keeps today's refusal on the first answer.
 *
 * Exactly one retry, never a loop. No strings, no product knowledge (ADR-W-016).
 */

/** At most this many names travel in one retry: the proxy's own bound (`server/llm/harness.ts`, which `shell/` cannot import). */
const KEEP_MAX = 8;
/** At most this many contradicted statements travel in one retry: the proxy's own bound (`CONTRADICTED_MAX`). */
const CONTRADICTED_MAX = 4;
/** A longer statement would make the proxy ignore the whole field (`CONTRADICTED_STATEMENT`): it does not travel. */
const STATEMENT_MAX = 40;

/** What a retry did, for the session log: the admin dashboard counts retries and how many recovered the name. */
export interface NameRetry {
  keep: string[];
  /** #2680 (ADR-AG-450): the contradicted statements the retry named. Present only when there were some. */
  contradicted?: string[];
  recovered: boolean;
}

/**
 * The log line of a retry, one spelling for every builder: an `action` event, so the lean production sink and the admin
 * session view carry it as they carry any action, whichever refusal or commit the submit then ends in. A retry for a
 * contradicted statement appends ` | <statements>` (#2680); a names-only retry's line is unchanged.
 */
export const nameRetryEvent = (r: NameRetry): { kind: 'action'; action: 'llm-retry'; detail: string } => ({
  kind: 'action',
  action: 'llm-retry',
  detail: `${r.keep.join(',')}:${r.recovered ? 'recovered' : 'lost'}${r.contradicted?.length ? ` | ${r.contradicted.join('; ')}` : ''}`,
});

export interface KeepingOutcome<A> {
  /** The answer that goes on to the gates. `null` when the first call had none. */
  answer: A | null;
  /** Present when a second call was made. */
  retry?: NameRetry;
}

/**
 * @param ask the transport; `keep` (and `contradicted`) are present on the retry only.
 * @param lostNamesOf the builder's own name gate on an answer.
 * @param usable false for a throttled or empty answer: an inexpressible request loses every name, and is not a loss.
 * @param contradictedOf the builder's own role gate (#2680): the student's statements the answer contradicts, as typed.
 */
export async function askKeepingNames<A>(
  ask: (keep?: readonly string[], contradicted?: readonly string[]) => Promise<A | null | undefined>,
  lostNamesOf: (answer: A) => readonly string[],
  usable: (answer: A) => boolean,
  contradictedOf?: (answer: A) => readonly string[],
): Promise<KeepingOutcome<A>> {
  const first = (await ask()) ?? null;
  if (first === null || !usable(first)) return { answer: first };
  const keep = [...lostNamesOf(first)].slice(0, KEEP_MAX);
  const contradicted = (contradictedOf?.(first) ?? []).filter((s) => s.length <= STATEMENT_MAX).slice(0, CONTRADICTED_MAX);
  if (keep.length === 0 && contradicted.length === 0) return { answer: first };
  const second = (await (contradicted.length ? ask(keep, contradicted) : ask(keep))) ?? null;
  const record = (recovered: boolean): NameRetry => ({ keep, ...(contradicted.length ? { contradicted } : {}), recovered });
  // A retry that failed (no answer, busy, empty) leaves the first answer: the gates then refuse it, naming the name.
  if (second === null || !usable(second)) return { answer: first, retry: record(false) };
  const recovered = lostNamesOf(second).length === 0 && (contradictedOf?.(second) ?? []).length === 0;
  return { answer: second, retry: record(recovered) };
}
