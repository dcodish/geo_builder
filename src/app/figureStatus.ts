/**
 * #1444 ([ADR-556](../../docs/06-decisions.md#adr-556)) — THE STATUS LINE SAYS WHAT THE POOL SAYS.
 *
 * External review, relayed 2026-09-27: «משולש ישר זווית ABC · AB=3 · BC=4» moved the right angle to A and
 * the status read «✓ הציור נקבע במלואו» — while the values panel, reading the shared sample pool, withheld
 * AC because the pool spans two seats (AC = √7 at A, AC = 5 at B). The status read `freeDofCount === 0`,
 * which counts CONTINUOUS freedom only; a discrete choice (a right-angle seat, a branch) is invisible to it.
 *
 * Operator ruling 2026-09-27 ("Announce + honest status"): the determined status reads the pool's verdict
 * (`sharedSamples.determined`, discrete configurations included). One configuration → the ruled #1453
 * wording; more than one (or a pool that could not establish completeness) → «נקבע עד כדי בחירת תצורה».
 *
 * Pure: the App hands in the count and the facts-matched verdict. The verdict arrives a beat after the
 * figure (the always-on detect sweep, ADR-401); until then no determinedness is CLAIMED — the line is
 * blank rather than a claim the pool may contradict a moment later.
 */
import type { Determinacy } from '@/replay/core';

export type FigureStatus = { key: 'actions.dof'; count: number } | { key: 'actions.determined' | 'actions.determinedUpToConfig'; count?: undefined };

export function figureStatus(factCount: number, freeDof: number, verdict: Determinacy | null): FigureStatus | null {
  if (factCount === 0) return null;
  if (freeDof > 0) return { key: 'actions.dof', count: freeDof };
  if (!verdict) return null; // pending — claim nothing yet
  return verdict.determined && verdict.configurations === 1 ? { key: 'actions.determined' } : { key: 'actions.determinedUpToConfig' };
}
