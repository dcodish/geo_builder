/**
 * Replaying one PRODUCTION complex session through this tool's real submit decision — what `/log-triage`
 * needs to tell "still a gap" from "fixed since the student hit it" (#2241, ADR-W-150; the analytic
 * shape of #1362).
 *
 * Complex has posted usage events since prod/2026-09-29 (#1243), and nothing read them: the triage had no
 * complex adapter, and its own texts said complex posted nothing. This is the adapter's product half. It
 * calls `decideSubmitCx`, the one function `submitLine` dispatches on, so there is no mirror of the App's
 * submit path to drift (ADR-346's class). A new verdict kind cannot be added without this switch seeing it.
 *
 * Lives in the product tree because it is the product's own knowledge: how its events replay. The script
 * imports it; nothing here knows about the script.
 *
 * **Honesty about what cannot be followed.** The prefix threads `{ lines, disabled, seed }`, the state the
 * decision reads. It stays faithful through a recorded line, `clear`, `delete` (`index:text`), a mute
 * (`toggle` `index:off`), `show-another` (the seed steps by one, as `nextConfig` does) and `undo`/`redo`,
 * which carry the fingerprint of the state they landed on (`stateFingerprintCx`): the replay adopts the
 * state it has seen with that fingerprint, and a fingerprint it has never seen degrades the rest. An edit,
 * a successful un-mute (its new seed is not logged), a load, or any action this file does not know marks
 * the REST of the session `degraded`, until an undo/redo lands on a state the replay can name again.
 *
 * **Sessions from before the action log.** A build that logs only submits (every complex build from
 * prod/2026-09-29 until #2241) leaves a student's undo, delete and clear invisible, so a replay could thread
 * a line the student had removed. Those sessions replay with `actionsLogged: false` and every verdict is
 * `degraded` from the first event: the report lists them as unverified, never as a live gap (ADR-W-083's
 * `load` precedent). The caller decides it per session, from the build the events came from.
 */

import { ingestTypedText } from '../../shell/bidi';
import { decideSubmitCx } from './submit';
import { stateFingerprintCx } from './stateFingerprint';

/** One logged event, as the production sink writes it (`ev`, then the fields `analyticsSubmitComplex` keeps). */
export interface LoggedEventCx {
  readonly ev?: string;
  readonly utterance?: string;
  readonly source?: string;
  readonly result?: string;
  readonly action?: string;
  readonly detail?: string;
}

/**
 * The verdict vocabulary `/log-triage` sorts by, shared with the 2-D, 3-D and analytic replays so one
 * report shape holds all four: `built`, `not-handled` (a LIVE gap), `built-nothing` (understood, adds
 * nothing), `refused` (a reasoned refusal, listed for review), `skip`, `unverified`, `error`.
 */
export interface ReplayOutcomeCx {
  readonly now: 'built' | 'not-handled' | 'built-nothing' | 'refused' | 'skip' | 'unverified' | 'error';
  readonly detail: string;
  readonly degraded: boolean;
}

interface State {
  readonly lines: readonly string[];
  readonly disabled: readonly number[];
  readonly seed: number;
}

const EMPTY: State = { lines: [], disabled: [], seed: 0 };
const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const fingerprint = (s: State): string => stateFingerprintCx(s.lines, s.disabled, s.seed);

/** `index:rest` → [index, rest], or null when the detail is not in that shape. */
function indexed(detail: string | undefined): [number, string] | null {
  const m = /^(\d+):([\s\S]*)$/.exec(detail ?? '');
  return m ? [Number(m[1]), m[2]] : null;
}

export interface ReplayOptionsCx {
  /** Did the build these events came from log its store actions? (`false` degrades the whole session.) */
  readonly actionsLogged: boolean;
  /** Past it, every remaining submit is `unverified` (stated, never a silent drop), as the siblings do. */
  readonly budgetMs?: number;
}

/** One session, in order, threading ONE figure forward. Returns an outcome per event index. */
export function replayComplexSession(events: readonly LoggedEventCx[], opts: ReplayOptionsCx): ReplayOutcomeCx[] {
  const budgetMs = opts.budgetMs ?? 60_000;
  const out: ReplayOutcomeCx[] = [];
  let state: State = EMPTY;
  let degraded = !opts.actionsLogged;
  /** Every state this replay has stood on, by fingerprint: what an undo/redo can land on. */
  const seen = new Map<string, State>([[fingerprint(EMPTY), EMPTY]]);
  const go = (next: State): void => {
    state = next;
    seen.set(fingerprint(next), next);
  };
  const t0 = Date.now();

  for (const e of events) {
    if (e.ev === 'action') {
      const a = e.action ?? '';
      const at = indexed(e.detail);
      if (a === 'clear') go(EMPTY);
      else if (a === 'show-another') go({ ...state, seed: state.seed + 1 });
      else if (a === 'undo' || a === 'redo') {
        const landed = e.detail !== undefined ? seen.get(e.detail) : undefined;
        if (landed && opts.actionsLogged) {
          state = landed;
          degraded = false; // the fingerprint names the student's state: the prefix is theirs again
        } else degraded = true;
      } else if (a === 'delete' && at && state.lines[at[0]] === at[1]) {
        const i = at[0];
        go({
          ...state,
          lines: state.lines.filter((_, k) => k !== i),
          disabled: state.disabled.filter((d) => d !== i).map((d) => (d > i ? d - 1 : d)),
        });
      } else if (a === 'toggle' && at && at[1] === 'off' && at[0] < state.lines.length) {
        if (!state.disabled.includes(at[0])) go({ ...state, disabled: [...state.disabled, at[0]] });
      } else if (a === 'toggle' && at && at[1] === 'on' && e.result !== undefined) {
        // a refused un-mute changes nothing
      } else degraded = true; // edit / load / a successful un-mute / an action this replay does not know
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

    let res: ReplayOutcomeCx;
    try {
      const v = decideSubmitCx(state, u);
      switch (v.kind) {
        case 'record':
          // the store keeps the ingested text (`cleanLine`), and so does the replay: a later delete names it
          go({ ...state, lines: [...state.lines, ingestTypedText(v.line)], seed: v.seed });
          res = { now: 'built', detail: 'record', degraded };
          break;
        case 'ask':
          res = { now: 'built', detail: 'ask', degraded }; // filed in the ask lane: the figure is unchanged
          break;
        case 'known':
          res = { now: 'built-nothing', detail: v.note.key, degraded };
          break;
        case 'refuse':
          res =
            v.error.key === 'not-handled'
              ? { now: 'not-handled', detail: v.error.key, degraded }
              : { now: 'refused', detail: v.error.key, degraded };
          break;
      }
    } catch (err) {
      res = { now: 'error', detail: String((err as Error)?.message ?? err).slice(0, 70), degraded };
    }
    out.push(res);
  }
  return out;
}
