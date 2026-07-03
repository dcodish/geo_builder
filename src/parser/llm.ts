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
}

/** Fold the points/circles a built step introduced into the running parse context, so a LATER
 *  LLM step that references them ("from A …" where step 1 created A) re-parses WITH that context.
 *  A point id is a capital letter + optional digits (`A`, `O1`, `O2`) — the subscript matters: without
 *  it, `O1`/`O2` from an earlier step never entered the context and a later step that referenced them
 *  degraded (PAR-10). Structured ids (`circle-…`, `bis-…`) are multi-char with a prefix, so the whole-token
 *  test excludes them; a circle's context entry is its CENTRE letter (matching App's `parseCtx`). */
const POINT_ID = /^[A-Z]\d*$/;
export function absorb(cmd: AnyCommand, points: Set<string>, circles: Set<string>): void {
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') continue; // a measure's expression carries a variable/text, never a point id
    if (typeof v === 'string' && POINT_ID.test(v)) points.add(v);
    else if (Array.isArray(v)) for (const e of v) if (typeof e === 'string' && POINT_ID.test(e)) points.add(e);
  }
  // Every circle-introducing command's centre — INCLUDING circumcircle ("circle through A B C"),
  // which was missing, so a later step that named that circle by its centre couldn't resolve it (ADR-046).
  if ((cmd.type === 'circle' || cmd.type === 'circle-through' || cmd.type === 'circumcircle') && typeof cmd.center === 'string') circles.add(cmd.center);
}

/** A circle id is `circle-<centre letter>` (parser convention), so its centre is the suffix. */
const centreOf = (circleId: string): string => circleId.replace(/^circle-/, '');

/**
 * Fold the FIGURE-DERIVED hints a built step introduced into the running parse context — the same
 * hints `buildParseCtx` supplies from the real figure (`onSegment`, `neighbors`, `lines`), derived here
 * at the COMMAND level because mid-decomposition there is no evaluated figure yet. Without this (and
 * without threading the caller's hints at all — they were dropped even for step 1), a decomposition like
 * ["נקודה E על AC", "EG קטע אמצעים"] re-parsed step 2 with no `onSegment` for E, so the baseless-
 * midsegment rule (ADR-199) never fired and the step silently degraded to a bare segment — a WRONG
 * figure with no dropped-step report, while typing the same two lines as separate submissions worked
 * (review 2026-07-03, M1).
 */
function accrueHints(
  cmd: AnyCommand,
  onSegment: Record<string, [string, string]>,
  neighbors: Record<string, string[]>,
  lines: Set<string>,
): void {
  const join = (a: string, b: string) => {
    (neighbors[a] ??= []).includes(b) || neighbors[a].push(b);
    (neighbors[b] ??= []).includes(a) || neighbors[b].push(a);
  };
  switch (cmd.type) {
    case 'point-on-segment':
      onSegment[cmd.id] = [cmd.a, cmd.b];
      break;
    case 'segment':
      join(cmd.a, cmd.b);
      break;
    case 'square':
    case 'rectangle':
    case 'rhombus':
    case 'parallelogram':
    case 'trapezoid':
    case 'quadrilateral':
    case 'triangle':
    case 'right-triangle':
    case 'polygon': {
      const ids = cmd.ids;
      for (let i = 0; i < ids.length; i++) join(ids[i], ids[(i + 1) % ids.length]);
      break;
    }
    case 'bisector':
    case 'perpendicular-line':
    case 'parallel-line':
    case 'line-through':
      lines.add(cmd.id);
      break;
  }
}

/**
 * Fold the on-circle MEMBERSHIP a built step introduced into a running map keyed by circle centre
 * (R9(b)). Without this, a later LLM step like "M is the midpoint of arc BC" can't resolve "arc BC" to
 * the circle an EARLIER step put B,C on (e.g. "circle through A B C") — `circleMembers` was frozen at the
 * pre-escalation figure. Mirrors the kinds the engine's `circleMembers` reads, at the command level (so
 * a point added to a PRIOR circle is captured too, without needing the prior figure's objects here).
 */
function accrueMembers(cmd: AnyCommand, members: Map<string, Set<string>>): void {
  const add = (centre: string, pts: (string | undefined)[]) => {
    const set = members.get(centre) ?? new Set<string>();
    for (const p of pts) if (p) set.add(p);
    members.set(centre, set);
  };
  switch (cmd.type) {
    case 'point-on-circle': add(centreOf(cmd.circle), [cmd.id]); break;
    case 'circle-through': add(cmd.center, [cmd.through]); break;
    case 'circumcircle': add(cmd.center, [cmd.a, cmd.b, cmd.c]); break;
    case 'diameter': add(centreOf(cmd.circle), [cmd.id1, cmd.id2]); break;
    case 'arc': add(cmd.center, [cmd.from, cmd.to]); break;
    case 'arc-midpoint': add(centreOf(cmd.circle), [cmd.from, cmd.to]); break;
    case 'line-circle-intersection': add(centreOf(cmd.circle), [cmd.id]); break;
    case 'circle-circle-intersection': add(centreOf(cmd.circle1), [cmd.id]); add(centreOf(cmd.circle2), [cmd.id]); break;
    case 'tangent': add(centreOf(cmd.circle), [cmd.at]); break;
  }
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
    // Base-relative so it works under the deployed subpath: dev -> /api/parse,
    // prod (base '/geo-builder/') -> /geo-builder/api/parse. BASE_URL has a trailing slash.
    const res = await fetch(`${import.meta.env.BASE_URL}api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance, context }),
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

  // Re-parse each canonical line with the deterministic grammar — only lines that
  // parse become commands; the rest are reported so a partial build is honest. The
  // FULL figure context is threaded (the caller's buildParseCtx hints — neighbors /
  // onSegment / parallels / lines — used to be dropped here entirely, M1) and grows
  // as each step is built, so a later step can reference a point, a carrier, or an
  // adjacency an earlier step introduced.
  const built: BuiltStep[] = [];
  const dropped: string[] = [];
  const points = new Set(figureCtx.points ?? []);
  const circles = new Set(figureCtx.circles ?? []);
  // circleMembers ACCUMULATES across steps (R9(b)): seed from the pre-escalation figure, then fold in the
  // on-circle membership each built step introduces — so "arc BC" in a later step resolves to the circle
  // an earlier step put B,C on, instead of being dropped.
  const members = new Map<string, Set<string>>();
  for (const m of figureCtx.circleMembers ?? []) members.set(m.center, new Set(m.points));
  // The figure-derived hints, seeded from the caller's real-figure context and accrued per built step
  // at the command level (`parallels` needs positions, so it stays the caller's static snapshot).
  const onSegment: Record<string, [string, string]> = { ...(figureCtx.onSegment ?? {}) };
  const neighbors: Record<string, string[]> = Object.fromEntries(
    Object.entries(figureCtx.neighbors ?? {}).map(([k, v]) => [k, [...v]]),
  );
  const lines = new Set(figureCtx.lines ?? []);
  for (const step of steps) {
    const circleMembers = [...members].map(([center, pts]) => ({ center, points: [...pts] }));
    const r = parse(step, {
      points: [...points],
      circles: [...circles],
      circleMembers,
      onSegment,
      neighbors,
      parallels: figureCtx.parallels,
      lines: [...lines],
    });
    if (r.ok && r.commands.length) {
      built.push({ step, commands: r.commands });
      for (const c of r.commands) {
        absorb(c, points, circles);
        accrueMembers(c, members);
        accrueHints(c, onSegment, neighbors, lines);
      }
    } else dropped.push(step);
  }
  return { built, dropped };
}
