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
 * ## Why there is no production sink here, and why that is deliberate
 *
 * `src/debug/sessionLog.ts` and `src3d/debug/sessionLog3.ts` each carry a SECOND sink: a lean per-submit
 * analytics event posted in production to `server/eventLog.ts` for the admin usage dashboard. This module
 * has none, because **the analytic tool is not deployed** ([ADR-AG-007](../../docs/06c-decisions-analytic.md)).
 * Building that half now would ship an untested path to an endpoint that does not exist, feeding a dashboard
 * with no data — speculative work whose first real exercise would be the day it mattered. So the module
 * returns early outside DEV, full stop. When analytic deploys, the prod sink is separate, sized work;
 * `server/admin.ts` already carries the label it will need.
 *
 * COPIED from `sessionLog3.ts`, not imported: product trees never import each other
 * (`BOUNDARIES.json`, `server/__tests__/isolation.test.ts`).
 *
 * Best-effort everywhere: never throws, never blocks the app. A logger that can break a submit is worse
 * than no logger.
 */

/** One id per page load, so a session's events group without anything being stored between loads. */
const sessionId = Math.random().toString(36).slice(2, 10);
let seq = 0;

// `import.meta.env.BASE_URL` is `/` in dev, so this is the dev plugin's `/api/log`. Written this way rather
// than hard-coded because the siblings' base-relative form is what makes them work under a deployed subpath,
// and a copy that quietly drops it would be wrong the day this one deploys.
const LOG_URL = `${import.meta.env.BASE_URL}api/log`;

/**
 * Append one analytic event to the dev trace.
 *
 * A no-op outside DEV — the single guard the whole production posture rests on, which is why it is the
 * first line and why it has its own lock.
 */
export function logAnalytic(event: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  try {
    void fetch(LOG_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tool: 'analytic',
        session: sessionId,
        seq: seq++,
        clientTs: new Date().toISOString(),
        ...event,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
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
