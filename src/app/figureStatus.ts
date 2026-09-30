/**
 * #1444 ([ADR-556](../../docs/06-decisions.md#adr-556)) — THE STATUS LINE SAYS WHAT THE POOL SAYS.
 *
 * External review, relayed 2026-09-27: «משולש ישר זווית ABC · AB=3 · BC=4» read «✓ הציור נקבע במלואו» while
 * the values panel, reading the shared sample pool, withheld AC because the pool spans two shapes (AC = √7
 * with the right angle at A, AC = 5 at B). The status read `freeDofCount === 0`, which counts CONTINUOUS
 * freedom only; a discrete choice (a right-angle seat, an SSA branch, a crossing choice, a second root) is
 * invisible to it.
 *
 * Operator rulings 2026-09-30: a note is ADDED to the DOF report, never a replacement for it —
 *   - DOF > 0                         → «דרגות חופש: N» (unchanged);
 *   - DOF 0, more than one shape      → «דרגות חופש: 0 · יש N תצורות אפשריות — …» when the count is STABLE
 *                                       across the pool, else «… יש יותר מתצורה אחת — …» (no number that
 *                                       could be wrong);
 *   - DOF 0, exactly one shape        → «✓ הציור נקבע במלואו על ידי הנתונים».
 * The verdict is the general {@link figureDeterminacy} — nothing here knows why there is a second shape.
 *
 * A DOF-0 pool that could not establish completeness (over the rewrite cap, or cut by the work cap) with one
 * shape in hand is no proof of uniqueness: #1599/#1601 ([ADR-558](../../docs/06-decisions.md#adr-558)) — the
 * line SAYS so («… האיור מורכב מדי כדי לבדוק אם יש לו תצורה נוספת») rather than the bare count, which read as
 * an ordinary answer. A second shape the pool DID find is a fact however the pool ended, so it still reads
 * «יש יותר מתצורה אחת». The verdict arrives a beat after the figure (the always-on detect sweep, ADR-401);
 * until then the line reads «בודק…» — no determinedness is claimed, and the student can see it is coming.
 */
import type { Determinacy } from '@/replay/core';

export type FigureStatus =
  | { key: 'actions.dof'; count: number }
  | { key: 'actions.dofConfigs'; n: number }
  | { key: 'actions.dofConfigsMany' | 'actions.determined' | 'actions.checking' | 'actions.dofTooComplex' };

export function figureStatus(factCount: number, freeDof: number, verdict: Determinacy | null): FigureStatus | null {
  if (factCount === 0) return null;
  if (freeDof > 0) return { key: 'actions.dof', count: freeDof };
  if (!verdict) return { key: 'actions.checking' }; // pending — claim nothing, and say it is coming (ADR-558)
  if (verdict.configurations > 1) {
    return verdict.determined && verdict.stable ? { key: 'actions.dofConfigs', n: verdict.configurations } : { key: 'actions.dofConfigsMany' };
  }
  if (verdict.complete === false) return { key: 'actions.dofTooComplex' };
  return verdict.determined && verdict.configurations === 1 ? { key: 'actions.determined' } : { key: 'actions.dof', count: 0 };
}

/** The status's interpolation options for `t()` — the one place the App and the locks turn a status into text. */
export function figureStatusParams(s: FigureStatus): Record<string, number> | undefined {
  return 'count' in s ? { count: s.count } : 'n' in s ? { n: s.n } : undefined;
}
