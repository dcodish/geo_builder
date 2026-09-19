/**
 * The analytic tool's LLM-fallback CLIENT (#1251) — the transport half of `llmSharedAnalytic.ts`.
 *
 * Posts to the SAME shared proxy 2-D and 3-D use, tagged `tool: 'analytic'` so the proxy picks this
 * product's prompt from its registry. Returns the canonical command lines the model produced; it does
 * NOT interpret them. Every line is re-parsed through the deterministic `parseLine` by the caller —
 * see `app/fallback.ts` — which is what stops a hallucination reaching the engine.
 *
 * Mirrors `src/parser/llm.ts`'s contract for the two cases that are not parse failures:
 *  - a 429 is a THROTTLE, not a failure to understand — the student must not be told their sentence
 *    was wrong when the service was merely busy;
 *  - any other transport failure returns `null`, and the caller keeps the deterministic refusal it
 *    already had.
 */

export type LlmBusy = 'rate-limited' | 'daily-limit';

export interface LlmStepsOutcome {
  /** The canonical command lines the model produced. Empty when it judged the request inexpressible. */
  steps: string[];
  /** Set when the proxy throttled us; `steps` is then empty and the caller says "busy", not "wrong". */
  busy?: LlmBusy;
}

/** How long the student waits before we give up and keep the deterministic refusal. */
export const LLM_TIMEOUT_MS_ANALYTIC = 15_000;

/**
 * Ask the proxy to normalise one freeform utterance into canonical lines.
 *
 * `null` means "no usable answer" — a transport error, a bad payload, or a disabled proxy. It is not
 * an error the student should see: the caller already has an honest refusal to show them.
 */
export async function llmParseAnalytic(
  utterance: string,
  context: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<LlmStepsOutcome | null> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return null;
  try {
    // Base-relative so it works under the deployed subpath: dev -> /api/parse,
    // prod (base '/analytic-builder/') -> /analytic-builder/api/parse.
    const res = await doFetch(`${import.meta.env.BASE_URL}api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance, context, tool: 'analytic' }),
      signal: opts.signal,
    });
    if (!res.ok) {
      if (res.status === 429) {
        let busy: LlmBusy = 'rate-limited';
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error === 'daily-limit') busy = 'daily-limit';
        } catch {
          /* unparseable body → the per-IP form is the safe assumption */
        }
        return { steps: [], busy };
      }
      return null;
    }
    const data = (await res.json()) as { steps?: unknown };
    if (!Array.isArray(data.steps)) return null;
    // Only strings, only non-empty, and capped: a model that returns a hundred lines is not producing
    // a student's figure, and each one costs a fold.
    const steps = data.steps.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, 24);
    return { steps };
  } catch {
    // Includes the caller's abort. Nothing to say — the deterministic refusal stands.
    return null;
  }
}
