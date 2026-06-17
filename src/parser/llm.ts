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
import { parse, type ParseContext } from './parse';

/** One canonical step the LLM produced that the parser turned into engine commands. */
export interface BuiltStep {
  step: string;
  commands: AnyCommand[];
}

export interface LlmOutcome {
  /** Steps that parsed — each becomes its own visible fact (labelled by the step). */
  built: BuiltStep[];
  /** Steps the LLM produced that the engine can't build (reported, not silently dropped). */
  dropped: string[];
}

/** Fold the points/circles a built step introduced into the running parse context, so a LATER
 *  LLM step that references them ("from A …" where step 1 created A) re-parses WITH that context.
 *  Point ids are single uppercase letters (line/circle ids are multi-char); a circle's context
 *  entry is its CENTRE letter (matching App's `parseCtx`). */
function absorb(cmd: AnyCommand, points: Set<string>, circles: Set<string>): void {
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') continue; // a measure's expression carries a variable/text, never a point id
    if (typeof v === 'string' && /^[A-Z]$/.test(v)) points.add(v);
    else if (Array.isArray(v)) for (const e of v) if (typeof e === 'string' && /^[A-Z]$/.test(e)) points.add(e);
  }
  if ((cmd.type === 'circle' || cmd.type === 'circle-through') && typeof cmd.center === 'string') circles.add(cmd.center);
}

/**
 * Escalate one freeform utterance to the LLM proxy and split its canonical steps
 * into what we could build vs what we couldn't. Returns null only on a proxy
 * failure (network, no key); an empty figure (LLM returned nothing) yields an
 * outcome with empty `built` and `dropped`. The structured `figureCtx` (the same
 * points/circles the deterministic parse used) is threaded into each step's
 * re-parse — without it, context-dependent rules (e.g. "another secant from the
 * existing point E") can't fire and the step is wrongly dropped.
 */
export async function llmParse(utterance: string, context: string, figureCtx: ParseContext = {}): Promise<LlmOutcome | null> {
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
  // parse become commands; the rest are reported so a partial build is honest. The
  // figure context grows as each step is built, so a later step can reference a point
  // an earlier step introduced.
  const built: BuiltStep[] = [];
  const dropped: string[] = [];
  const points = new Set(figureCtx.points ?? []);
  const circles = new Set(figureCtx.circles ?? []);
  for (const step of steps) {
    // circleMembers stays the pre-escalation figure's (steps reference points that already exist),
    // so a canonical "arc BC in circle O" still resolves to the circle that truly holds B and C.
    const r = parse(step, { points: [...points], circles: [...circles], circleMembers: figureCtx.circleMembers });
    if (r.ok && r.commands.length) {
      built.push({ step, commands: r.commands });
      for (const c of r.commands) absorb(c, points, circles);
    } else dropped.push(step);
  }
  return { built, dropped };
}
