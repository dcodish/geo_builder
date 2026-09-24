/**
 * Replaying one PRODUCTION session through this tool's real submit decision — what `/log-triage`
 * needs to tell "still a gap" from "fixed since the student hit it" (#1362).
 *
 * The triage script (`.claude/skills/log-triage/triage.mjs`) re-runs every logged utterance against the
 * CURRENT code, in its session's order, so a row that builds today drops off the worklist on its own.
 * For 2-D and 3-D that replay lives in the script and mirrors each App's submit path by hand, and the
 * mirror drifting is a documented class there (ADR-346). Analytic does not need a mirror: its App
 * already DISPATCHES on `decideSubmit` and decides nothing itself (#1102), so this calls that one
 * function and reads its verdict. A new verdict kind cannot be added without this switch seeing it.
 *
 * Lives in the product tree because it is the product's own knowledge — how its events replay. The
 * script imports it; nothing here knows about the script.
 *
 * **Honesty about what cannot be followed.** A session's prefix stays faithful through `record`,
 * `clear`, `undo`/`redo` and `delete` (whose detail is the deleted line's text), and through an LLM step
 * whose accepted lines were logged. Anything else — an edit, a load, a configuration change, an LLM step
 * with no lines — marks the REST of the session `degraded`: the figure here is no longer the student's,
 * so a later failure may be this replay's artifact, and the report files it as unverified, never as a gap.
 */

import { derive } from '../engine/derive';
import { decideSubmit } from './submit';

/** One logged event, as the production sink writes it (`ev`, then the fields `analyticsSubmitAnalytic` keeps). */
export interface LoggedEvent {
  readonly ev?: string;
  readonly utterance?: string;
  readonly source?: string;
  readonly result?: string;
  /** LLM path: the accepted lines, JSON-encoded and capped (`analyticsSubmitAnalytic`). */
  readonly commands?: string;
  readonly action?: string;
  readonly detail?: string;
}

/**
 * The verdict vocabulary `/log-triage` sorts by — shared with its 2-D / 3-D replays so one report
 * shape holds all three: `built` (fixed / working), `not-handled` (a LIVE gap), `guided` (answered on
 * purpose — declined or taught), `built-nothing` (understood, adds nothing), `refused` (a reasoned
 * refusal, reported for review), `skip`, `unverified`, `error`.
 */
export interface ReplayOutcome {
  readonly now: 'built' | 'not-handled' | 'guided' | 'built-nothing' | 'refused' | 'skip' | 'unverified' | 'error';
  readonly detail: string;
  readonly degraded: boolean;
}

const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The lines an LLM step committed, when the event carries them (`commands` is a JSON string array). */
function llmLines(e: LoggedEvent): string[] | null {
  if (e.source !== 'llm' || e.result !== 'lines' || !e.commands) return null;
  try {
    const v: unknown = JSON.parse(e.commands);
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  } catch {
    return null; // capped mid-array by the sink's 900-character limit — honestly unfollowable
  }
}

/**
 * One session, in order, threading ONE line list forward. Returns an outcome per event index.
 *
 * `budgetMs` bounds a runaway session: past it every remaining submit is `unverified` (stated, never a
 * silent drop), matching the siblings' `--session-budget-ms`.
 */
export function replayAnalyticSession(events: readonly LoggedEvent[], budgetMs = 60_000): ReplayOutcome[] {
  const out: ReplayOutcome[] = [];
  let lines: string[] = [];
  let degraded = false;
  const history: string[][] = [];
  let future: string[][] = [];
  const advance = (next: string[]): void => {
    history.push(lines);
    future = [];
    lines = next;
  };
  const t0 = Date.now();

  for (const e of events) {
    if (e.ev === 'action') {
      const a = e.action ?? '';
      if (a === 'clear') advance([]);
      else if (a === 'undo' && history.length) {
        future.push(lines);
        lines = history.pop()!;
      } else if (a === 'redo' && future.length) {
        history.push(lines);
        lines = future.pop()!;
      } else if (a === 'delete' && e.detail !== undefined && lines.includes(e.detail)) {
        const at = lines.indexOf(e.detail);
        advance([...lines.slice(0, at), ...lines.slice(at + 1)]);
      } else degraded = true; // edit / load / show-another / an undo past what this replay tracked
      out.push({ now: 'skip', detail: `action:${a}`, degraded });
      continue;
    }

    const u = norm(e.utterance);
    if (!u) {
      out.push({ now: 'skip', detail: '', degraded });
      continue;
    }
    if (Date.now() - t0 > budgetMs) {
      out.push({ now: 'unverified', detail: 'session budget', degraded: true });
      continue;
    }

    let res: ReplayOutcome;
    try {
      const v = decideSubmit(u, lines, 0, derive(lines, 0));
      switch (v.kind) {
        case 'ignored':
          res = { now: 'skip', detail: '', degraded };
          break;
        case 'record':
          advance([...lines, v.line]);
          res = { now: 'built', detail: 'record', degraded };
          break;
        case 'already-known':
        case 'already-follows':
          res = { now: 'built-nothing', detail: v.kind, degraded };
          break;
        case 'teach':
          res = { now: 'guided', detail: `teach:${v.verb}`, degraded };
          break;
        case 'refused': {
          const key = v.error.key;
          res =
            key === 'not-handled'
              ? { now: 'not-handled', detail: key, degraded }
              : key === 'out-of-scope'
                ? { now: 'guided', detail: 'scope:out-of-scope', degraded }
                : { now: 'refused', detail: key, degraded };
          break;
        }
      }
    } catch (err) {
      res = { now: 'error', detail: String((err as Error)?.message ?? err).slice(0, 70), degraded };
    }
    out.push(res);
    if (res.now === 'built' || res.now === 'skip' || res.now === 'built-nothing') continue;

    // Our grammar did not land it, but the student's figure may still have advanced: follow what the
    // model committed, re-decided line by line so parser drift is caught rather than assumed away.
    const committed = llmLines(e);
    if (!committed) {
      if (e.source === 'llm') degraded = true; // an LLM step we cannot reproduce
      continue;
    }
    let next = lines;
    for (const l of committed) {
      const v = decideSubmit(l, next, 0, derive(next, 0));
      if (v.kind === 'record') next = [...next, v.line];
      else if (v.kind !== 'already-known' && v.kind !== 'already-follows') {
        degraded = true;
        break;
      }
    }
    if (!degraded) advance(next);
  }
  return out;
}
