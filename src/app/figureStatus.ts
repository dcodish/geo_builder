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
 * A DOF-0 pool that could not establish completeness (over the rewrite cap, or cut by the sample budget)
 * with one shape in hand is no proof of uniqueness: the line then reads the bare count «דרגות חופש: 0» —
 * true, and claiming nothing more. The verdict arrives a beat after the figure (the always-on detect sweep,
 * ADR-401); until then no determinedness is CLAIMED — the line is blank rather than a claim the pool may
 * contradict a moment later.
 */
import type { Determinacy } from '@/replay/core';

export type FigureStatus =
  | { key: 'actions.dof'; count: number }
  | { key: 'actions.dofConfigs'; n: number }
  | { key: 'actions.dofConfigsMany' | 'actions.determined' };

export function figureStatus(factCount: number, freeDof: number, verdict: Determinacy | null): FigureStatus | null {
  if (factCount === 0) return null;
  if (freeDof > 0) return { key: 'actions.dof', count: freeDof };
  if (!verdict) return null; // pending — claim nothing yet
  if (verdict.configurations > 1) {
    return verdict.determined && verdict.stable ? { key: 'actions.dofConfigs', n: verdict.configurations } : { key: 'actions.dofConfigsMany' };
  }
  return verdict.determined && verdict.configurations === 1 ? { key: 'actions.determined' } : { key: 'actions.dof', count: 0 };
}

/** The status's interpolation options for `t()` — the one place the App and the locks turn a status into text. */
export function figureStatusParams(s: FigureStatus): Record<string, number> | undefined {
  return 'count' in s ? { count: s.count } : 'n' in s ? { n: s.n } : undefined;
}
