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

import { logAnalytic } from '../debug/sessionLogAnalytic';
import { cleanSeed, useAnalyticStore } from '../store/useAnalyticStore';
import { auditLoadedLines, type LoadFailure } from './loadAudit';

/**
 * Who audits a load (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478)). The audit replays the saved
 * lines, which is solving: the page hands it to its worker and passes {@link AUDIT_LATER}, then reports the worker's
 * answer through {@link finishLoadAudit}. Every other caller audits here, as before.
 */
export type LoadAuditor = (lines: readonly string[], disabled: readonly number[], hosts: Readonly<Record<number, readonly string[]>>) => LoadFailure[] | null;
/** The audit is the caller's, after the restore. */
export const AUDIT_LATER: LoadAuditor = () => null;

/**
 * Restore a validated envelope's body, then AUDIT it (#1087): the lines are re-parsed on the way
 * in, and a line that no longer builds is reported rather than dropped in silence — which is the
 * whole value of storing lines instead of positions.
 *
 * `fallbackName` names the figure when the envelope carries no name of its own (a file passes the
 * filename, per the #42 rule; a restored session has nothing to pass).
 */
export function loadAnalyticSession(envelope: Record<string, unknown>, fallbackName: string, audit: LoadAuditor = auditLoadedLines): { lines: string[]; failed: number } {
  const savedLines = Array.isArray(envelope.lines) ? envelope.lines.filter((l): l is string => typeof l === 'string') : [];
  const st = useAnalyticStore.getState();
  st.restore({
    lines: savedLines,
    seed: cleanSeed(envelope.seed),
    name: typeof envelope.name === 'string' ? envelope.name : fallbackName,
    // #1632 (ADR-AG-199) — the AI lane's display sentences. `serialize` wrote them and this call never
    // passed them on, so a loaded file showed the canonical command lines in place of the student's own
    // words. The store's `restore` range-checks them against the lines, as it does `disabled`.
    spokenFor: envelope.spokenFor as Record<number, string> | undefined,
    disabled: Array.isArray(envelope.disabled) ? envelope.disabled.filter((d): d is number => typeof d === 'number') : [],
    // #1631 — where a renamed free vertex is drawn; the store keeps only letter → letter entries
    seedNames: envelope.seedNames as Record<string, string> | undefined,
    // #1653 — the segment display choices; the store keeps only key → {hidden?, dashed?: true}
    segStyle: envelope.segStyle,
    // #2238 — the curve display choices, cleaned by the store the same way
    curveStyle: envelope.curveStyle,
    // #1863 (ADR-AG-375) — the annotation channel (the conic chip's state); the store keeps only known facets
    annotations: envelope.annotations,
    // #2688 — the canvas switches (grid / axis numbers / coordinates); absent = all shown
    display: envelope.display,
    // #1973 (ADR-AG-430) — the hosts the cevian lines were accepted in; the store keeps only rings that name a line
    hosts: envelope.hosts,
  });
  // The audit itself is `loadAudit.ts` (#2890): the lines replayed, with no store in its imports, so it can run off the page.
  const { disabled, hosts } = useAnalyticStore.getState(); // the restored set, already range-checked
  const failed = audit(savedLines, disabled, hosts);
  if (failed === null) return { lines: savedLines, failed: -1 };
  finishLoadAudit(savedLines, failed);
  return { lines: savedLines, failed: failed.length };
}

/** Report a load's audit: the panel's line, and the trace (#1300). */
export function finishLoadAudit(savedLines: readonly string[], failed: LoadFailure[]): void {
  useAnalyticStore.getState().setLoadAudit({ total: savedLines.length, failed });
  // #1300 — a load REPLACES the figure, so a replay that misses it continues from the wrong one. The
  // audit's own result rides along: a file that stopped loading is the parser-drift signal this trace
  // exists to make visible.
  logAnalytic({
    kind: 'action',
    action: 'load',
    detail: `${savedLines.length} lines`,
    result: failed.length ? `${failed.length} failed` : 'ok',
  });
}
