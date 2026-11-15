/**
 * #2893 ([ADR-AG-479](../../docs/06c-decisions-analytic.md#adr-ag-479); ADR-W-210 phase 4, invariant 3) — ANALYTIC'S
 * WORK LIMIT: where a search stops when it has worked about ten seconds without deciding.
 *
 * The check sits in the solver's loop, at the one place a unit of work is counted ({@link solverUnit}: every residual
 * evaluation of `solveLM`, `freeRank`, `jacobianRank` and `scanRoots`; {@link chargeUnit} for a repeat `solveLM` serves). When an open limit (`shell/workLimit`) is
 * reached, the unit throws {@link WORK_LIMIT_REACHED}; the throw unwinds the whole search before any memo stores what
 * it was computing (every memo is written after its value is whole), so nothing half-solved is ever kept, and the
 * operation that opened the limit answers "not decided" (`shell/notDecided`, {@link decideWithin}).
 *
 * **From where it stopped.** Everything the round finished is kept, in the content memos that outlive the action
 * (phase 2): each configuration solved, each walk's seeds, each derivation of a prefix. A memo hit costs no unit, so
 * the next round («המשיכו לחפש») spends its whole limit on what the first did not reach, and only the one solve that
 * was cut is solved again. `resume` names the round, for the record; the work already done is in the heap.
 *
 * No clock and no `MODE === 'test'` switch: the suites run this exactly as the browser does.
 */
import { meterWork } from '../../shell/workMeter';
import { limitReached, withWorkLimit } from '../../shell/workLimit';
import { notDecided, type NotDecided } from '../../shell/notDecided';

/**
 * THE LIMIT of one analytic search, in work units (one residual evaluation). Calibrated on the dev PC (2026-11-14,
 * #2893): over the 294 operations of the fixtures and the slow corpus that spend more than 100 000 units, the solver
 * runs about 268 000 units a second (240 000 on the dearest, exam 2379's configuration pool: 3 473 334 units in
 * 14.4 s), so ten seconds is about 2.5 M units. The dearest DECISION in the corpus spends 763 370 (corpus471 #7,
 * line 4, a refusal, 1.9 s): no recorded decision reaches this limit.
 */
export const SEARCH_LIMIT_AN = 2_500_000;

/** The signal a reached limit throws through the solver. Not an `Error`: nothing may report it as one. */
export const WORK_LIMIT_REACHED: unique symbol = Symbol('analytic work limit reached');
export const isLimitSignal = (e: unknown): boolean => e === WORK_LIMIT_REACHED;

/**
 * THE LIMIT'S OWN COUNT: every residual evaluation the solver ASKS for, whether it is computed or served as an exact
 * repeat (ADR-AG-480's `servingRepeatedPoints`). The work meter counts only what is computed; a limit counted on the
 * meter would cut later wherever repeats are served, and its stop would move with an optimisation that changes no
 * answer. Counted here, the same search stops at the same charged unit with or without the repeat table, and the
 * calibration below keeps its unit.
 */
let charged = 0;
/** The limit's count as it stands (a monotone counter, for `withWorkLimit`'s `read`). */
export const readCharged = (): number => charged;

/** One evaluation the solver asked for: charged to the limit, then the limit checked. */
export function chargeUnit(): void {
  charged += 1;
  if (limitReached()) throw WORK_LIMIT_REACHED;
}

/** One unit of solver work computed: metered, and charged to the limit. The solver's loop calls this where it meters. */
export function solverUnit(): void {
  meterWork();
  chargeUnit();
}

/** What a round that stopped carries: which round it was (the work it did is in the heap's memos). */
export interface ResumeAn {
  round: number;
}

/**
 * Run one decision under {@link SEARCH_LIMIT_AN}: its value, or "not decided" when the limit (its own, or one opened
 * around it) was reached first. `round` is the round this is (1 for the first press, 2 for «המשיכו לחפש», …).
 */
export function decideWithin<V>(fn: () => V, round = 1, units = SEARCH_LIMIT_AN): V | NotDecided<ResumeAn> {
  const out = withWorkLimit(
    units,
    () => {
      try {
        return { value: fn() };
      } catch (e) {
        if (isLimitSignal(e)) return null;
        throw e;
      }
    },
    readCharged,
  );
  return out.value ? out.value.value : notDecided({ round }, out.spent);
}
