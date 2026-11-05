/**
 * THE ONE RETRY (#2231, [ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — when the AI's reading of a
 * sentence loses a name the student typed, ask once more, naming what to keep.
 *
 * Operator, 2026-10-16: *"1b"*; 2026-10-18: *"Retry once. If K is still missing, keep today's refusal naming K."*
 *
 * This file decides only WHETHER to ask again and WHICH answer goes on. It refuses nothing and commits nothing: the
 * answer it returns meets the builder's full gate battery, unchanged, so a name still lost is refused by the refusal
 * that names it (2-D ADR-240, 3-D ADR-3D-147, analytic ADR-AG-279). The trigger is NAMES only, and each builder injects
 * its own name gate: a lost number, relation or word keeps today's refusal on the first answer.
 *
 * Exactly one retry, never a loop. No strings, no product knowledge (ADR-W-016).
 */

/** At most this many names travel in one retry: the proxy's own bound (`server/llm/harness.ts`, which `shell/` cannot import). */
const KEEP_MAX = 8;

/** What a retry did, for the session log: the admin dashboard counts retries and how many recovered the name. */
export interface NameRetry {
  keep: string[];
  recovered: boolean;
}

/**
 * The log line of a retry, one spelling for every builder: an `action` event, so the lean production sink and the admin
 * session view carry it as they carry any action, whichever refusal or commit the submit then ends in.
 */
export const nameRetryEvent = (r: NameRetry): { kind: 'action'; action: 'llm-retry'; detail: string } => ({
  kind: 'action',
  action: 'llm-retry',
  detail: `${r.keep.join(',')}:${r.recovered ? 'recovered' : 'lost'}`,
});

export interface KeepingOutcome<A> {
  /** The answer that goes on to the gates. `null` when the first call had none. */
  answer: A | null;
  /** Present when a second call was made. */
  retry?: NameRetry;
}

/**
 * @param ask the transport; `keep` is present on the retry only.
 * @param lostNamesOf the builder's own name gate on an answer.
 * @param usable false for a throttled or empty answer: an inexpressible request loses every name, and is not a loss.
 */
export async function askKeepingNames<A>(
  ask: (keep?: readonly string[]) => Promise<A | null | undefined>,
  lostNamesOf: (answer: A) => readonly string[],
  usable: (answer: A) => boolean,
): Promise<KeepingOutcome<A>> {
  const first = (await ask()) ?? null;
  if (first === null || !usable(first)) return { answer: first };
  const keep = [...lostNamesOf(first)].slice(0, KEEP_MAX);
  if (keep.length === 0) return { answer: first };
  const second = (await ask(keep)) ?? null;
  // A retry that failed (no answer, busy, empty) leaves the first answer: the gates then refuse it, naming the name.
  if (second === null || !usable(second)) return { answer: first, retry: { keep, recovered: false } };
  return { answer: second, retry: { keep, recovered: lostNamesOf(second).length === 0 } };
}
