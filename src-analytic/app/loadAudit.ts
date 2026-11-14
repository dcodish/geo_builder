/**
 * THE AUDIT OF A LOADED SESSION, AS A FUNCTION OF ITS LINES (#1087; split out of `loadSession.ts` for #2890,
 * [ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477)).
 *
 * A saved session stores lines, never positions, so loading one replays them: a line that no longer builds is REPORTED
 * rather than dropped in silence. That replay is the solver work of a load, and phase 3 of ADR-W-210 runs it off the
 * page. It lived inside `loadAnalyticSession`, which also writes the store; so anything that wanted the audit dragged the
 * store, zustand, zundo and React with it (measured: a worker bundle that imported it carried all four). Here it is
 * alone: lines in, failures out. `loadAnalyticSession` restores the store and then calls this; the work meter's driver
 * calls it for its `load`.
 *
 * #1548 — a MUTED line loads muted, so the audit replays the figure the student will actually see: the ACTIVE lines, with
 * each fault translated back to its row. A muted line is not in that figure, but it is still the student's sentence, so
 * one that no longer PARSES is named too: it would be refused the moment they un-mute it.
 */
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { activeOf, activePins, rowOf } from './active';

/** One saved line that no longer builds, with the fault's own code. */
export interface LoadFailure {
  line: string;
  reason: string;
}

/**
 * The saved lines that no longer build: the active ones replayed at the first configuration with the session's recorded
 * hosts (#1973), and every muted one that no longer parses. `disabled` and `hosts` are the restored, range-checked ones.
 */
export function auditLoadedLines(lines: readonly string[], disabled: readonly number[], hosts: Readonly<Record<number, readonly string[]>>): LoadFailure[] {
  const rows = rowOf(lines.length, disabled);
  const replayed = derive(activeOf(lines, disabled), 0, {}, activePins(hosts, lines.length, disabled));
  return [
    ...replayed.faults.map((f) => ({ line: lines[rows[f.index]] ?? '', reason: f.code })),
    ...disabled.flatMap((i) => {
      const r = parseLine(lines[i] ?? '');
      return r.ok ? [] : [{ line: lines[i] ?? '', reason: r.code }];
    }),
  ];
}
