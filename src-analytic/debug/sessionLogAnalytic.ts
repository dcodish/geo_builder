/**
 * The analytic tool's session logger (#1300) — DEV ONLY, and unlike its siblings that is the whole module.
 *
 * Operator, 2026-09-20: *"why dont we have a log for this tool. this is important for debug so add it"*.
 * He was right, and the cost was concrete an hour earlier: triaging #1297 — *the LLM fallback answered in
 * English* — nothing could establish what he had typed, because the analytic tool left no trace anywhere.
 * The reconstruction had to be inferred from the shape of his fact list and then confirmed by asking him.
 * With 39 open analytic issues, the most active product in the queue was the one whose sessions could not
 * be replayed.
 *
 * Fire-and-forgets each event to the shared Vite dev plugin (`server/logProxy.ts`) at
 * `${BASE_URL}api/log`, tagged `tool:'analytic'` so it routes to `logs/debug-log-analytic.jsonl` and never
 * mixes with the 2-D or 3-D traces. What it records is what a replay needs: every utterance the student
 * submits INCLUDING the refusals, whether the parser or the model answered it, and a snapshot of the line
 * list after every change.
 *
 * ## The production sink (#1243) — and why it was absent until now
 *
 * This module shipped DEV-ONLY on a stated premise: *"the analytic tool is not deployed"*
 * ([ADR-AG-007](../../docs/06c-decisions-analytic.md)), so a prod sink would have been an untested path
 * to an endpoint that did not exist. That premise has expired — analytic is live at `/analytic-builder/`
 * and has had repeated prod deploys — and its absence had a measurable cost: `/log-triage` reports
 * *nothing* for this product, which is indistinguishable from *no failures*, so the most active queue in
 * the repo was being prioritised against data nobody was collecting.
 *
 * So `logAnalytic` is now dual-sink, exactly like its siblings: DEV → the full debug trace; PROD → the
 * lean per-submit usage event. Privacy and retention are INHERITED, not re-decided — the same hashed IP,
 * the same lean payload, the same SEC-7 age-based retention the two live logs already carry. This adds no
 * new category of stored data.
 *
 * The SHAPING rules below were copied from `sessionLog3.ts` rather than imported — product trees never
 * import each other (`BOUNDARIES.json`). The POSTER is not copied: since #1243 it is
 * `shell/usageLog.ts`, which every product may import and which imports none of them.
 *
 * Best-effort everywhere: never throws, never blocks the app. A logger that can break a submit is worse
 * than no logger.
 */

import { makeUsagePoster } from '../../shell/usageLog';

/** One id per page load, so a session's events group without anything being stored between loads. */
const sessionId = Math.random().toString(36).slice(2, 10);
let seq = 0;

// `import.meta.env.BASE_URL` is `/` in dev, so this is the dev plugin's `/api/log`. Written this way rather
// than hard-coded because the siblings' base-relative form is what makes them work under a deployed subpath,
// and a copy that quietly drops it would be wrong the day this one deploys.
const LOG_URL = `${import.meta.env.BASE_URL}api/log`;

// #1243: the poster is `shell/usageLog.ts`, shared with every sibling. The `tool` tag is what files an
// event under this product instead of 2-D — the defect that issue exists for.
const post = makeUsagePoster({ tool: 'analytic', url: LOG_URL });

/** The build this event came from, for the dashboard's release filter. `dev` outside a build. */
const REL = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

/** One `session` line per page load, announced lazily so a visitor who types nothing is not counted. */
let sessionAnnounced = false;

/**
 * What a debug event contributes to PRODUCTION analytics: the lean payload, or `null` when it is not a
 * user submission worth counting. The siblings' rule, in this product's vocabulary.
 *
 * Two kinds are dropped: non-`input`/`action` kinds (the `figure` snapshots are a dev reconstruction
 * trace, never analytics), and INTERMEDIATE input steps — one submit logs the parser's `not-handled`
 * step and then escalates, and the escalation's outcome is logged separately as the final result.
 * Counting both would double-count the utterance and show a phantom refusal beside its real answer.
 *
 * Pure, so "one submit per submission" is unit-testable without a network.
 */
export function analyticsSubmitAnalytic(event: Record<string, unknown>): Record<string, unknown> | null {
  if (event.kind === 'action') {
    return {
      ev: 'action',
      action: event.action,
      ...(event.detail !== undefined ? { detail: event.detail } : {}),
      ...(event.result !== undefined ? { result: event.result } : {}),
    };
  }
  if (event.kind !== 'input') return null;
  if (event.intermediate) return null;
  // On the LLM path, the lines the model actually committed — a `source:llm, result:ok` submit is
  // otherwise opaque, and #1297/#1278 were both invisible without them. Capped so the sink stays lean.
  const commands =
    event.source === 'llm' && event.steps !== undefined && event.steps !== null
      ? JSON.stringify(event.steps).slice(0, 900)
      : undefined;
  return {
    ev: 'submit',
    utterance: event.utterance,
    locale: event.locale,
    source: event.source,
    result: event.result ?? 'ok',
    ...(commands ? { commands } : {}),
  };
}

/**
 * Append one analytic event to the dev trace.
 *
 * A no-op outside DEV — the single guard the whole production posture rests on, which is why it is the
 * first line and why it has its own lock.
 */
export function logAnalytic(event: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    post({ session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event });
    return;
  }
  const lean = analyticsSubmitAnalytic(event); // null unless this is a FINAL user submission
  if (!lean) return;
  const t = new Date().toISOString();
  if (!sessionAnnounced) {
    sessionAnnounced = true;
    post({ ev: 'session', sid: sessionId, t, rel: REL });
  }
  post({ ...lean, sid: sessionId, t, rel: REL });
}

/** The last figure payload actually written, so an unchanged figure is not written twice. */
let lastFigure = '';

/**
 * Append a FIGURE snapshot, but only when the figure differs from the one last logged.
 *
 * **Measured on the operator's own live session, minutes after this module first ran:** three identical
 * snapshots per single change — one pair with the SAME millisecond (React `StrictMode` double-invokes
 * effects in dev, and `main.tsx` mounts under it) and further copies seconds apart from re-renders that did
 * not change the figure at all. A trace that triples its most voluminous event is harder to read than no
 * trace, which is the opposite of why #1300 exists.
 *
 * The dedupe is on the payload's CONTENT rather than on the effect's dependency list, and that choice is the
 * point: a `useMemo` identity is a React implementation detail that StrictMode, a remount, or a discarded
 * memo cache can each churn independently, so a component-side guard would have to be right about all three.
 * *"Is this the same figure I last recorded?"* is the question the log actually has, it is answerable here,
 * and it is answerable once.
 *
 * Deliberately module-scoped, not per-component: there is one log, so there is one last-written state.
 */
export function logAnalyticFigure(figure: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const payload = JSON.stringify(figure);
  if (payload === lastFigure) return;
  lastFigure = payload;
  logAnalytic({ kind: 'figure', ...figure });
}
