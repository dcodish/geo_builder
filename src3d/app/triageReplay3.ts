/**
 * Replaying one PRODUCTION 3-D session through this tool's real submit decision — what `/log-triage`
 * needs to tell "still a gap" from "fixed since the student hit it" (#1692, ADR-3D-305; analytic's
 * `src-analytic/app/triageReplay.ts` is the model).
 *
 * The triage script (`.claude/skills/log-triage/triage.mjs`) re-runs every logged utterance against the
 * CURRENT code, in its session's order. Its 3-D replay used to copy App3's decision by hand — `parse3`,
 * then the guidance register and the lowercase nudge — and so missed every step that lives in the store:
 * #1666's proof-target refusal read as a LIVE grammar gap, #866's one-angle repair as `not-handled`. This
 * file CALLS the decision App3 dispatches ({@link decideDeterministic3}) and the one the LLM lane
 * dispatches ({@link decideSteps3}), so there is nothing left to drift: a new verdict kind cannot be added
 * without this switch seeing it.
 *
 * Lives in the product tree because it is the product's own knowledge — how its events replay. The script
 * imports it; nothing here knows about the script.
 *
 * **Honesty about what cannot be followed.** The prefix stays faithful through recorded lines, restated
 * lines (a muted twin is re-enabled), renames and swaps, `clear` / `undo` / `redo`, and an LLM step whose
 * canonical lines were logged (#182). Anything else — delete / show-another / load, an undo past what
 * this replay tracked, any line this code does not commit and whose LLM lines were not logged or no
 * longer commit — marks the REST of the session
 * `degraded`: the figure here is no longer the student's, so a later failure may be this replay's
 * artifact, and the report files it as unverified, never as a gap.
 */

import { decideSteps3, type Fact3 } from '../store/store3';
import { renameFacts3, swapSession3 } from '../store/rename3';
import { decideDeterministic3, refusalCategory3 } from './decideDeterministic3';

/** One logged event, as the 3-D production sink writes it (`src3d/debug/sessionLog3.ts`). */
export interface LoggedEvent3 {
  readonly ev?: string;
  readonly utterance?: string;
  readonly source?: string;
  readonly result?: string;
  /** LLM path: the canonical lines the model returned (#182) — an array, or that array JSON-encoded. */
  readonly commands?: unknown;
  readonly action?: string;
}

/**
 * The verdict vocabulary `/log-triage` sorts by — the same words as its 2-D replay: `built` (working),
 * `store-op` (a rename/swap — never a grammar gap), `built-nothing` (understood, adds nothing),
 * `guided` (answered on purpose), `clarify` (asks which one), `refused` (a reasoned refusal, for review),
 * `not-handled` (a LIVE gap — the App would escalate it), `skip`, `unverified`, `error`.
 */
export interface ReplayOutcome3 {
  readonly now: 'built' | 'store-op' | 'built-nothing' | 'guided' | 'clarify' | 'refused' | 'not-handled' | 'skip' | 'unverified' | 'error';
  readonly detail: string;
  readonly degraded: boolean;
}

const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The canonical lines an LLM step committed, when the event carries them. */
function llmLines(e: LoggedEvent3): string[] | null {
  if (e.source !== 'llm' || e.result !== 'ok' || !e.commands) return null;
  try {
    const v: unknown = typeof e.commands === 'string' ? JSON.parse(e.commands) : e.commands;
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  } catch {
    return null; // capped mid-array by the sink — honestly unfollowable
  }
}

const errorDetail = (e: unknown): string => (typeof e === 'string' ? e : ((e as { code?: string })?.code ?? JSON.stringify(e))).slice(0, 60);

/**
 * One session, in order, threading ONE `(facts, seed)` forward. Returns an outcome per event index.
 * `budgetMs` bounds a runaway session: past it every remaining submit is `unverified`, never dropped.
 */
export function replay3dSession(events: readonly LoggedEvent3[], budgetMs = 60_000): ReplayOutcome3[] {
  const out: ReplayOutcome3[] = [];
  type St = { facts: Fact3[]; seed: number };
  let st: St = { facts: [], seed: 0 };
  let degraded = false;
  const history: St[] = [];
  let future: St[] = [];
  const advance = (next: St): void => {
    history.push(st);
    future = [];
    st = next;
  };
  let n = 0;
  const newId = (): string => `f${n++}`;
  const t0 = Date.now();

  for (const e of events) {
    if (e.ev === 'action') {
      const a = e.action ?? '';
      if (a === 'clear') advance({ facts: [], seed: 0 });
      else if (a === 'undo' && history.length) {
        future.push(st);
        st = history.pop()!;
      } else if (a === 'redo' && future.length) {
        history.push(st);
        st = future.pop()!;
      } else degraded = true; // delete / show-another / load / an undo or redo past what this replay tracked
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

    let res: ReplayOutcome3['now'];
    let detail = '';
    try {
      const v = decideDeterministic3(st, u, newId);
      switch (v.kind) {
        case 'record':
          advance({ facts: v.facts, seed: v.seed });
          res = 'built';
          detail = v.fact.cmds.map((c) => c.type).join(',');
          break;
        case 'already-stated':
          advance({ facts: v.facts, seed: st.seed });
          res = 'built-nothing';
          detail = 'already-stated';
          break;
        case 'rename': {
          const r = renameFacts3(st.facts, v.from, v.to);
          if (r.ok) advance({ facts: r.facts, seed: st.seed });
          res = r.ok ? 'store-op' : 'refused';
          detail = r.ok ? 'rename' : `rename-refused:${r.reason}`;
          break;
        }
        case 'swap': {
          const r = swapSession3({ facts: st.facts, queries: [], planeDisplay: {} }, v.a, v.b);
          if (r.ok) advance({ facts: r.facts, seed: st.seed });
          res = r.ok ? 'store-op' : 'refused';
          detail = r.ok ? 'swap' : `swap-refused:${r.reason}`;
          break;
        }
        case 'guided':
          res = 'guided';
          detail = v.tag;
          break;
        case 'refused':
          res = refusalCategory3(v.error);
          detail = res === 'guided' ? `scope:${v.error.code}` : errorDetail(v.error);
          break;
        case 'not-understood':
          res = 'not-handled';
          detail = 'not-understood';
          break;
      }
    } catch (err) {
      res = 'error';
      detail = String((err as Error)?.message ?? err).slice(0, 70);
    }
    out.push({ now: res, detail, degraded });
    if (res === 'built' || res === 'built-nothing' || res === 'store-op') continue; // the prefix followed the App

    // Our grammar didn't land this step. If the student's figure advanced through the LLM lane and the
    // log carries the canonical lines (#182), follow THAT through the lane's own decision, so the prefix
    // keeps matching what they saw; the verdict above still reports our coverage honestly.
    const lines = llmLines(e);
    if (!lines) {
      // Kept as conservative as the 2-D replay: without lines to follow, the rest of the session is not
      // claimed as evidence (the student's figure may have moved where ours did not).
      degraded = true;
      continue;
    }
    try {
      const v = decideSteps3(st, u, lines.map(norm), newId);
      if (v.kind === 'record') advance({ facts: v.facts, seed: v.seed });
      else degraded = true; // the logged lines don't commit here — don't pretend they did
    } catch {
      degraded = true;
    }
  }
  return out;
}
