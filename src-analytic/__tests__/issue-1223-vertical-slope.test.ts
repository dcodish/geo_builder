/**
 * #1223 — A VERTICAL SLOPE IS AN ANSWER, NOT A FAILURE.
 *
 * **Operator, 2026-09-19:** *"when i ask for שיפוע PB it says it cannot be claculated which is wrong.
 * its just that the slope is not defined"* — on `A(0,0)`, `B(3,4)`, `C(6,0)`, `P(3,0)`, where `B` and
 * `P` share an x.
 *
 * His screenshot carried the proof two rows apart:
 *
 * ```
 * הכול נקבע על-ידי הנתונים          "everything is determined by the givens"
 * שיפוע BP = לא ניתן לחשב מהנתונים   "cannot be computed from the givens"
 * ```
 *
 * ## The code stated the rule and the return value contradicted it
 *
 * ```js
 * // A vertical line HAS no slope, and that is an answer about the figure rather than a failure.
 * if (Math.abs(line.b) < 1e-12) return { question, value: null };
 * ```
 *
 * The comment was right. `null` is the FAILURE channel, and the component chooses its wording from
 * `figureIsOpen` — so on a determined figure it read "your givens are insufficient", which sends a
 * student hunting for a missing given on a figure that has none.
 *
 * `null` was carrying three situations. It now carries two, and `fact: 'vertical'` carries the third —
 * the same move #1111 made when it split `missing` out of `unreadable`.
 *
 * These call `ask` directly, so the lock is on the decision and not on a reproduction of it
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask, figureIsOpen } from '../app/ask';
import { fmtAnalytic } from '../format';

/** The operator's own figure. `BP` is vertical; every point is fixed. */
const FIG = ['A(0,0)', 'B(3,4)', 'C(6,0)', 'משולש ABC', 'P(3,0)'];
const answer = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic);

describe('#1223 — a vertical slope says «אנכי», not that the givens are insufficient', () => {
  it("the operator's own case answers a FACT rather than a failure", () => {
    const a = answer(FIG, 'שיפוע BP');
    expect(a.fact, 'the vertical outcome is carried').toBe('vertical');
    expect(a.unreadable, 'the question was understood').toBeFalsy();
  });

  it('and the figure it says that about is DETERMINED — which is what made the old message false', () => {
    expect(figureIsOpen(derive(FIG, 0))).toBe(false);
  });

  it('a slanted and a horizontal slope are values, and neither is a fact', () => {
    // A horizontal slope is 0 — a number, not an absence. It must not be swept into the new outcome.
    expect(answer(FIG, 'שיפוע AB').value).toBe('4/3');
    expect(answer(FIG, 'שיפוע AC').value).toBe('0');
    expect(answer(FIG, 'שיפוע AC').fact).toBeUndefined();
  });

  it('a stated VERTICAL LINE gets the same answer as a vertical segment', () => {
    // «שיפוע l2» on `x = 4` returned null too — the same defect through the other resolver.
    const a = answer(['נתון הישר l2: x=4'], 'שיפוע l2');
    expect(a.fact).toBe('vertical');
  });

  it('AN OPEN FIGURE STILL SAYS «not fixed yet» — the distinction the fix must not swallow', () => {
    /**
     * The anti-lock. `null` legitimately means *the givens do not fix this*, and that wording is
     * correct; the bug was only ever that a determined-but-undefined answer borrowed it. Two points
     * on two different carriers leave `AB`'s slope genuinely free.
     */
    const lines = ['A על הישר y=x', 'B על הישר y=2x+1'];
    const a = answer(lines, 'שיפוע AB');
    expect(a.value, 'no value').toBeNull();
    expect(a.fact, 'and NOT because it is vertical').toBeUndefined();
    expect(figureIsOpen(derive(lines, 0)), 'so the row says «עדיין לא נקבע»').toBe(true);
  });

  it('a missing object is still its own outcome, not this one', () => {
    // #1111's split must survive #1223's.
    const a = answer(FIG, 'שיפוע ZZ');
    expect(a.fact).toBeUndefined();
    expect(a.missing?.name ?? a.unreadable).toBeTruthy();
  });
});
