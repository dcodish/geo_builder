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
import { parseLine } from '../parser/parseAnalytic';
import { activeOf, rowOf } from './active';

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
    // #1632 (ADR-AG-199) — the AI lane's display sentences. `serialize` wrote them and this call never
    // passed them on, so a loaded file showed the canonical command lines in place of the student's own
    // words. The store's `restore` range-checks them against the lines, as it does `disabled`.
    spokenFor: envelope.spokenFor as Record<number, string> | undefined,
    disabled: Array.isArray(envelope.disabled) ? envelope.disabled.filter((d): d is number => typeof d === 'number') : [],
    // #1631 — where a renamed free vertex is drawn; the store keeps only letter → letter entries
    seedNames: envelope.seedNames as Record<string, string> | undefined,
    // #1653 — the segment display choices; the store keeps only key → {hidden?, dashed?: true}
    segStyle: envelope.segStyle,
  });
  /**
   * #1548 — a MUTED line loads muted, so the audit replays the figure the student will actually see:
   * the ACTIVE lines, with each fault translated back to its row. A muted line is not in that figure,
   * but it is still the student's sentence, so one that no longer PARSES is named too — it would be
   * refused the moment they un-mute it, and the drift net is exactly for that.
   */
  const { disabled } = useAnalyticStore.getState(); // the restored set, already range-checked
  const rows = rowOf(savedLines.length, disabled);
  const replayed = derive(activeOf(savedLines, disabled), 0);
  const failed = [
    ...replayed.faults.map((f) => ({ line: savedLines[rows[f.index]] ?? '', reason: f.code })),
    ...disabled.flatMap((i) => {
      const r = parseLine(savedLines[i] ?? '');
      return r.ok ? [] : [{ line: savedLines[i] ?? '', reason: r.code }];
    }),
  ];
  st.setLoadAudit({ total: savedLines.length, failed });
  // #1300 — a load REPLACES the figure, so a replay that misses it continues from the wrong one. The
  // audit's own result rides along: a file that stopped loading is the parser-drift signal this trace
  // exists to make visible.
  logAnalytic({
    kind: 'action',
    action: 'load',
    detail: `${savedLines.length} lines`,
    result: failed.length ? `${failed.length} failed` : 'ok',
  });
  return { lines: savedLines, failed: failed.length };
}
