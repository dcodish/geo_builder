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

import type { Command } from '@/engine';
import { parse } from './parse';

/** One canonical step the LLM produced that the parser turned into engine commands. */
export interface BuiltStep {
  step: string;
  commands: Command[];
}

export interface LlmOutcome {
  /** Steps that parsed — each becomes its own visible fact (labelled by the step). */
  built: BuiltStep[];
  /** Steps the LLM produced that the engine can't build (reported, not silently dropped). */
  dropped: string[];
}

/**
 * Escalate one freeform utterance to the LLM proxy and split its canonical steps
 * into what we could build vs what we couldn't. Returns null only on a proxy
 * failure (network, no key); an empty figure (LLM returned nothing) yields an
 * outcome with empty `built` and `dropped`.
 */
export async function llmParse(utterance: string, context: string): Promise<LlmOutcome | null> {
  let steps: string[];
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance, context }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { steps?: unknown };
    if (!Array.isArray(data.steps)) return null;
    steps = data.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  } catch {
    return null;
  }

  // Re-parse each canonical line with the deterministic grammar — only lines that
  // parse become commands; the rest are reported so a partial build is honest.
  const built: BuiltStep[] = [];
  const dropped: string[] = [];
  for (const step of steps) {
    const r = parse(step);
    if (r.ok && r.commands.length) built.push({ step, commands: r.commands });
    else dropped.push(step);
  }
  return { built, dropped };
}
