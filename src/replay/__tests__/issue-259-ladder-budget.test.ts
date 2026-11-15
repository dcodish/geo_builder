import { describe, it, expect } from 'vitest';
import { replay } from '@/replay/core';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { solveBudget, withLadderSpent } from '@/engine';
import { withWorkBudget, work } from '@/engine/solveBudget';
import { nelderMead } from '@/engine/evaluate';

/**
 * #259 / [ADR-515](../../../docs/06-decisions.md#adr-515) — an armed budget must be able to bind a
 * SINGLE joint solve, not merely the gaps between recruit experiments.
 *
 * The ladder's eight `budgetExceeded()` consults all sit at loop boundaries in `step.ts`, so one
 * experiment's Nelder–Mead descent ran unbounded: on the #207 figure a 12 s budget produced a 32.3 s
 * wall-clock run with `budgetExceeded()` never once true. docs/17 §7 is literal — *"searches check
 * their deadline inside the innermost replay loop"* — and that loop is the descent.
 *
 * What this does NOT change, and must not: the PRIMARY submit fold is never armed (ADR-281), so a
 * solvable figure still builds whatever it costs. Unarmed, `budgetExceeded()` is a null check.
 */

/** The #207 figure — the quarter-circle on the leg, whose infeasibility is CONCLUDED, not cheap. */
const FIGURE_207 = ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על CB', 'רבע מעגל ODC'];

/** The honest refusal this figure has always given (ADR-385). The budget may only move the TIME. */
const REFUSAL = 'cannot place O on segment AC so that |OC| = |OD|';

describe('#259 — the budget reaches inside the joint solve', () => {
  it('UNARMED, the descent is unchanged — it converges to the minimum', () => {
    // The guarantee the whole change rests on: with no budget armed (the default, the submit fold, and
    // every other test in this suite) the consult is a null check and nothing about the engine moves.
    const f = (x: number[]) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2;
    const before = solveBudget.aborts;
    const r = nelderMead(f, [0, 0], 400, 0.5);
    expect(f(r)).toBeLessThan(1e-10);
    expect(r[0]).toBeCloseTo(3, 4);
    expect(r[1]).toBeCloseTo(-1, 4);
    expect(solveBudget.aborts, 'an unarmed run never counts an abort').toBe(before);
  });

  it('with an EXPIRED budget the descent stops at once and records the abort', () => {
    const f = (x: number[]) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2;
    const before = solveBudget.aborts;
    // #2893 (ADR-831): there is no clock; a budget with nothing left is the spent ladder (it was a deadline in the past)
    const r = withLadderSpent(() => nelderMead(f, [0, 0], 400, 0.5));
    expect(solveBudget.aborts, 'the abort is counted, so a truncated fold is never memoized').toBeGreaterThan(before);
    // It returns the best point it had — nowhere near the minimum, and that is the honest report.
    expect(f(r)).toBeGreaterThan(1e-6);
  });

  it('a 3s budget BINDS the #207 ladder, and the refusal is unchanged', () => {
    const facts = factsOf(FIGURE_207);
    const before = solveBudget.aborts;
    const w0 = work.done;
    // #2893 (ADR-831): a budget in work units (it was a 3 s clock). This figure's units are slow (heavy joint solves: about
    // 50 k a second), and a budget much under 1 M cuts the fold before the statement the refusal names: 1 M it is.
    const d = withWorkBudget(1_000_000, () => replay(facts, 0));
    const spent = work.done - w0;

    // The mechanism: the consult fired INSIDE a solve. Machine-independent, so this is the real lock.
    expect(solveBudget.aborts, 'the budget was consulted inside the joint solve').toBeGreaterThan(before);
    // The effect, in the budget's own unit (#2893, ADR-831: a work budget is the same on every machine, so its bound is
    // asserted in units, not seconds; the 3 s clock measured 3.09 s solo against 31.9 s unbudgeted).
    expect(spent, `the ladder honoured the budget (spent ${spent} units)`).toBeLessThan(1_500_000);
    // Only the TIME moved. The figure still refuses, and names the same statement.
    expect(d.lastError).toBe(REFUSAL);
  }, 120_000);
});
