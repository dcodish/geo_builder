/**
 * THE way a saved analytic session enters the store — one implementation, both entry points
 * (#1238): the file picker and the restored session offer (ADR-W-068).
 *
 * It was inline in the file handler while there was only one way in. A restore is a LOAD (the
 * operator's ruling), so it must be audited exactly as a file is — and the reliable way to get that
 * is one function, not two that look alike today.
 *
 * What it does NOT own: the envelope check (the caller names its own refusal, and a restored
 * session has no filename to name), and the VIEW reset, which belongs to the component that holds
 * the viewport (#1209).
 */

import { derive } from '../engine/derive';
import { logAnalytic } from '../debug/sessionLogAnalytic';
import { useAnalyticStore } from '../store/useAnalyticStore';

/**
 * Restore a validated envelope's body, then AUDIT it (#1087): the lines are re-parsed on the way
 * in, and a line that no longer builds is reported rather than dropped in silence — which is the
 * whole value of storing lines instead of positions.
 *
 * `fallbackName` names the figure when the envelope carries no name of its own (a file passes the
 * filename, per the #42 rule; a restored session has nothing to pass).
 */
export function loadAnalyticSession(envelope: Record<string, unknown>, fallbackName: string): { lines: string[]; failed: number } {
  const savedLines = Array.isArray(envelope.lines) ? envelope.lines.filter((l): l is string => typeof l === 'string') : [];
  const st = useAnalyticStore.getState();
  st.restore({
    lines: savedLines,
    seed: typeof envelope.seed === 'number' ? envelope.seed : 0,
    name: typeof envelope.name === 'string' ? envelope.name : fallbackName,
  });
  const replayed = derive(savedLines, 0);
  st.setLoadAudit({
    total: savedLines.length,
    failed: replayed.faults.map((f) => ({ line: savedLines[f.index] ?? '', reason: f.code })),
  });
  // #1300 — a load REPLACES the figure, so a replay that misses it continues from the wrong one. The
  // audit's own result rides along: a file that stopped loading is the parser-drift signal this trace
  // exists to make visible.
  logAnalytic({
    kind: 'action',
    action: 'load',
    detail: `${savedLines.length} lines`,
    result: replayed.faults.length ? `${replayed.faults.length} failed` : 'ok',
  });
  return { lines: savedLines, failed: replayed.faults.length };
}
