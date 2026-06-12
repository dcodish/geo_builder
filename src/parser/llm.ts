/**
 * LLM fallback — client side (Phase 7).
 *
 * Called only when the deterministic `parse()` returns `not-handled`. Posts the
 * utterance + a short figure context to the server proxy (`/api/parse`), which
 * asks Claude to normalise it into canonical command lines. Each returned line
 * is then run back through the **deterministic parser** — so only commands the
 * engine actually supports ever reach the store. The API key never touches the
 * browser; this module talks only to our own proxy.
 */

import type { Command } from '@/engine';
import { parse } from './parse';

export interface LlmResult {
  commands: Command[];
  /** The canonical lines the model produced (for showing the student what was understood). */
  steps: string[];
}

/**
 * Escalate one freeform utterance to the LLM proxy and convert its canonical
 * steps to engine commands. Returns null on any failure (network, no key,
 * nothing usable) — the caller then shows the "couldn't read that" hint.
 */
export async function llmParse(utterance: string, context: string): Promise<LlmResult | null> {
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
    steps = data.steps.filter((s): s is string => typeof s === 'string');
  } catch {
    return null;
  }

  // Re-parse each canonical line with the deterministic grammar — guarantees the
  // commands are valid even though an LLM produced the phrasing.
  const commands: Command[] = [];
  const used: string[] = [];
  for (const step of steps) {
    const r = parse(step);
    if (r.ok) {
      commands.push(...r.commands);
      used.push(step);
    }
  }
  return commands.length ? { commands, steps: used } : null;
}
