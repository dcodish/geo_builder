/**
 * LLM fallback — client side (Phase 7).
 *
 * Called only when the deterministic `parse()` returns `not-handled`. Posts the
 * utterance + a short figure context to the server proxy (`/api/parse`), which
 * asks Claude to normalise it into canonical command lines. Each returned line
 * is then run back through the **deterministic parser** — so only commands the
 * engine actually supports ever reach the store, and the student sees the
 * decomposition (the separate canonical steps), not the opaque original. Steps
 * the engine still can't build are reported as `dropped`, so a partial result is
 * honest instead of silent. The API key never touches the browser.
 */

import type { AnyCommand } from '@/engine';
import { parse, restoreStatedSequences, type ParseContext } from './parse';

/** One canonical step the LLM produced that the parser turned into engine commands. */
export interface BuiltStep {
  step: string;
  commands: AnyCommand[];
}

/** The proxy is throttling: `daily-limit` = the global cost ceiling was hit (SEC-2); `rate-limited` = the
 *  per-IP limit. Both mean "service busy, try again", NOT "couldn't understand". */
export type LlmBusy = 'daily-limit' | 'rate-limited';

export interface LlmOutcome {
  /** Steps that parsed — each becomes its own visible fact (labelled by the step). */
  built: BuiltStep[];
  /** Steps the LLM produced that the engine can't build (reported, not silently dropped). */
  dropped: string[];
  /** Set when the proxy THROTTLED instead of parsing (`built`/`dropped` empty) — the caller shows a
   *  "service busy" message and tags the analytics so the operator can track how often the ceiling is hit. */
  busy?: LlmBusy;
  /** #536 — stated point-runs whose LLM respelling was restored to the student's sequence (`ABD→ADB`),
   *  for the analytics log: a `source:llm` submit must be reconstructable, corrections included. */
  restored?: string[];
}

/**
 * #2428 ([ADR-741](../../docs/06-decisions.md#adr-741)) — THE PARSE CONTEXT OF EACH CANONICAL STEP. Given the commands
 * the earlier steps built (empty for the first step), it returns the context the deterministic grammar would read on
 * THAT figure: `buildParseCtx` of the trial figure (the student's facts plus the commands built so far), supplied by
 * the caller, which owns the figure (`src/app/laneContext.ts`). The first step's context is the one the deterministic
 * path just read, so a line the model echoes back reads exactly as it read when the student typed it.
 *
 * It replaced a hand-picked SUBSET of the context (8 of its fields, accrued per step at the command level): every
 * field added after the subset was last widened was missing here, so a rule that reads one (the pair's position, a
 * stated tangency, the drawn tangents, a stated collinearity…) decided differently in this lane than on the same
 * figure typed — the internally tangent pair's common tangent built as a degenerate A ≈ B ≈ T figure, green.
 */
export type LaneContext = (built: readonly AnyCommand[]) => ParseContext;

/**
 * Escalate one freeform utterance to the LLM proxy and split its canonical steps
 * into what we could build vs what we couldn't. Returns null only on a proxy
 * failure (network, no key); an empty figure (LLM returned nothing) yields an
 * outcome with empty `built` and `dropped`. `ctxFor` gives each step's re-parse the
 * full context of its figure ({@link LaneContext}) — without it, context-dependent rules
 * (e.g. "another secant from the existing point E") can't fire and the step is wrongly dropped.
 */
export async function llmParse(
  utterance: string,
  context: string,
  ctxFor: LaneContext = () => ({}),
  opts: { signal?: AbortSignal } = {},
): Promise<LlmOutcome | null> {
  let steps: string[];
  try {
    // Base-relative so it works under the deployed subpath: dev -> /api/parse,
    // prod (base '/geo-builder/') -> /geo-builder/api/parse. BASE_URL has a trailing slash.
    // `signal` (E3/STO-3): the caller aborts on its ~15 s timeout or the student's cancel —
    // a hung proxy must never leave a permanent spinner.
    const res = await fetch(`${import.meta.env.BASE_URL}api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance, context }),
      signal: opts.signal,
    });
    if (!res.ok) {
      // A 429 is a THROTTLE, not a parse failure — return an empty outcome tagged `busy` so the caller
      // shows "service busy" instead of "couldn't understand your input" (it isn't the student's fault).
      if (res.status === 429) {
        let busy: LlmBusy = 'rate-limited';
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error === 'daily-limit') busy = 'daily-limit';
        } catch {
          /* unparseable body → default to the per-IP form */
        }
        return { built: [], dropped: [], busy };
      }
      return null;
    }
    const data = (await res.json()) as { steps?: unknown };
    if (!Array.isArray(data.steps)) return null;
    steps = data.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  } catch {
    return null;
  }

  // #536 — the SEQUENCE honesty gate: a stated point-run is an ORDERED statement («ADB» = D between
  // A and B), and the model can respell it (prod: alphabetized to «ישר ABD», committing the negation
  // of the stated betweenness with a green ✓). Restore the student's own letter order on the canonical
  // lines BEFORE the re-parse, so the tested grammar derives the semantics from the student's spelling.
  const seq = restoreStatedSequences(utterance, steps);
  steps = seq.lines;

  // Re-parse each canonical line with the deterministic grammar — only lines that parse become commands; the rest
  // are reported so a partial build is honest. Each line reads the FULL context of the figure the earlier steps
  // built (#2428, ADR-741): the caller's `ctxFor`, never a context assembled here.
  const built: BuiltStep[] = [];
  const dropped: string[] = [];
  const builtCmds: AnyCommand[] = [];
  for (const step of steps) {
    const r = parse(step, ctxFor([...builtCmds]));
    if (r.ok && r.commands.length) {
      built.push({ step, commands: r.commands });
      builtCmds.push(...r.commands);
    } else dropped.push(step);
  }
  return { built, dropped, ...(seq.restored.length ? { restored: seq.restored } : {}) };
}
