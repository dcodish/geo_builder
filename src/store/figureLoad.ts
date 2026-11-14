/**
 * THE way a figure enters the session — one implementation, every entry point (#1238).
 *
 * A figure can arrive three ways now: the file picker (FR-HS-10), a restored session offer
 * (ADR-W-068), and a shared link (#1189). The operator's ruling on the offer is *"restore = load"* —
 * a restored session must be refused, audited and refreshed exactly as a stale save file is, or the
 * honesty invariants (ADR-242's load audit, ADR-232's re-lowering) would hold on one path and not
 * the other. The reliable way to get that is not to write them twice: this module owns the sequence
 * and every entry point calls it.
 *
 * The sequence, in order, and why each step is where it is:
 *
 *  1. `deserializeFigure` — envelope + schema. A foreign, truncated or future file refuses here.
 *  2. `refreshLoadedFigure` — re-lower the DETERMINISTIC steps against the current parser
 *     (ADR-232 Am. / issue #120), so a fix that landed since the save reaches an old figure. LLM
 *     steps stay byte-for-byte: an escalated step never re-escalates on load.
 *  3. the caller's `prefold` — the heavy cold fold, off the main thread (#41/ADR-290). Injected, not
 *     imported, so this module stays callable from a test and from a non-React caller; a worker
 *     failure that is not a cancellation refuses the load, the same as a failed replay.
 *  4. a smoke replay — a figure whose derivation THROWS must never become the session; refusing is
 *     the honest outcome, a white screen on the next render is not.
 *  5. `loadFigure` — ONE store transition, so a single undo restores the session that was open
 *     before (loading is never destructive).
 *
 * What stays with the CALLER: the busy cue, the notes, the figure's NAME (the filename wins for a
 * file, the envelope's own `name` for a restored session — a session has no filename), the load
 * audit it shows, and the post-load requirements rescue. Those are presentation and policy; this
 * is the load.
 */

import type { FigureFile, FigureLoadFailure } from './figureFile';
import type { Fact } from './geoStore';
import { adoptSettled, useGeoStore } from './geoStore';
import { geoJobs, isCancelled } from './geoWork';

/** Why a load refused. `replay-failed` covers both the worker and the main-thread derivation. */
export type FigureLoadRefusal = FigureLoadFailure | 'replay-failed';

export type FigureLoadOutcome =
  | {
      ok: true;
      /** The file as loaded — facts already re-lowered. */
      file: FigureFile;
      /** Indices of the steps step 2 re-lowered (issue #120) — the caller notes them. */
      refreshed: number[];
    }
  | { ok: false; reason: FigureLoadRefusal };

export interface FigureLoadOpts {
  /**
   * Compute the fold off the main thread and hand it back to be transplanted (#41/ADR-290). Omit
   * it and the load folds on this thread during the smoke replay — correct, just slower, which is
   * what a test wants.
   */
  prefold?: (facts: Fact[], seed: number) => Promise<unknown>;
  /**
   * Wipe the undo history after committing. A figure that arrives WITHOUT a session behind it — a
   * restored offer (#1238), a shared link (#1189) — has nothing for undo to go back to: a restore
   * is a load, not a replay of the student's keystrokes. The file picker leaves this off, because
   * there one undo must still return the session that was open before the load.
   */
  resetHistory?: boolean;
}

/**
 * Parse, refresh, verify and COMMIT a saved figure's text. Returns before committing on any
 * refusal — a refused load leaves the current session untouched.
 */
export async function loadFigureText(text: string, opts: FigureLoadOpts = {}): Promise<FigureLoadOutcome> {
  // #2890 (ADR-830): steps 1–4 run as ONE operation in the geometry worker (`geoOps.load`): the read, the refresh (it
  // parses and replays every prefix), the fold and the smoke replay. The figure comes back settled and is adopted, so
  // the commit below and the first render solve nothing. `opts.prefold` keeps its meaning: fold first, then replay.
  let read: Awaited<ReturnType<typeof geoJobs.load>>;
  try {
    read = await geoJobs.load(text, opts.prefold !== undefined);
  } catch (err) {
    if (isCancelled(err)) return { ok: false, reason: 'replay-failed' };
    throw err;
  }
  if (!read.ok) return { ok: false, reason: read.reason };
  const { file, refreshed } = read;
  if (read.settled) adoptSettled(read.settled);

  useGeoStore.getState().loadFigure(file);
  if (opts.resetHistory) useGeoStore.temporal.getState().clear();
  return { ok: true, file, refreshed };
}
