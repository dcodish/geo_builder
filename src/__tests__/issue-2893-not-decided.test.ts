/**
 * #2893 ([ADR-831](../../docs/06-decisions.md#adr-831), ADR-W-210 phase 4) — a search that reaches its work limit is
 * "not decided", never «אין תצורה אחרת» or "no valid configuration"; «המשיכו לחפש» goes on from where it stopped.
 *
 * The regression lines are the corpus figures whose search reaches the limit (measured over the fixtures and the slow
 * corpus, the ADR's table): the configuration search after the #1768 kite's eighth line. (Under the first, 4 M limit
 * the #1771 press and the #566 two-circle search reached it too; at the browser-calibrated 7.7 M they finish.) The locks are the ADR's: the same input gives the same outcome cold or warm; a
 * "not decided" is never served from a memo as a verdict; the next round does not repeat what the first one solved; and
 * a repeat the solver serves (ADR-832) counts against the limit as a computed one does.
 *
 * pipeline-lock: the outcome under test is a SEARCH's, run round by round with what each round leaves in the memos; a
 * fixture locks a figure that builds and verifies, and a corpus scenario replays lines, and neither presses a search twice
 * or measures what the second press solves.
 */
import { describe, expect, it } from 'vitest';
import { clearReplayCaches, findValidConfigRound, meetsRequirements, SEARCH_WORK_LIMIT, type Fact } from '@/replay/core';
import { repeatConfig, work } from '@/engine/solveBudget';
import { readWork } from '../../shell/workMeter';
import { isNotDecided } from '../../shell/notDecided';
import { factsOf } from './scenarios-corpus';

const KITE = ['ABCD דלתון חסום במעגל', 'AB=AD', 'CB=CD', 'E על DC', 'BE⊥DC', 'AC', 'N = חיתוך BE ו-AC', 'שטח משולש NCE = שטח משולש ACD'];
const kite = (): Fact[] => structuredClone(factsOf(KITE)) as Fact[];
const executedBy = <T>(fn: () => T): { value: T; executed: number } => {
  const e0 = work.executed;
  const value = fn();
  return { value, executed: work.executed - e0 };
};

describe('#2893 — the configuration search after the #1768 kite line «שטח משולש NCE = שטח משולש ACD»', () => {
  it('the first round reaches its limit and says so; «המשיכו לחפש» finishes the search', () => {
    clearReplayCaches();
    const facts = kite();
    const first = findValidConfigRound(facts, 0, 0);
    expect(isNotDecided(first), 'not decided: never "no valid configuration" for a search that did not finish').toBe(true);
    if (!isNotDecided(first)) return;
    expect(first.spent).toBeGreaterThanOrEqual(SEARCH_WORK_LIMIT);
    const second = findValidConfigRound(facts, 0, (first.resume as { round: number }).round);
    expect(isNotDecided(second), 'the second round decides').toBe(false);
    // it finished: a view that meets every requirement, or none (today's «לא נמצאה תצורה…», now said of a search that ended)
    if (second !== null) expect(meetsRequirements((second as { facts: Fact[]; seed: number }).facts, (second as { facts: Fact[]; seed: number }).seed)).toBe(true);
  }, 900_000);

  it('the same outcome cold and warm, and a "not decided" is never served from a memo as a verdict', () => {
    clearReplayCaches();
    const cold = findValidConfigRound(kite(), 0, 0);
    const warm = findValidConfigRound(kite(), 0, 0); // the same content again, its folds held
    expect(isNotDecided(cold) && isNotDecided(warm)).toBe(true);
    expect((warm as { resume: unknown }).resume).toEqual((cold as { resume: unknown }).resume);
  }, 900_000);

  it('«המשיכו לחפש» does not repeat what the first round solved', () => {
    clearReplayCaches();
    const facts = kite();
    const r0 = executedBy(() => findValidConfigRound(facts, 0, 0));
    const r1 = executedBy(() => findValidConfigRound(facts, 0, 1));
    clearReplayCaches();
    const alone = executedBy(() => findValidConfigRound(kite(), 0, 1)); // the second round, from nothing
    expect(r1.value).toEqual(alone.value);
    expect(r1.executed, 'the second round solves only what the first did not').toBeLessThan(alone.executed);
    // measured: the two rounds together execute 1.54× one long search on the kite (1.25× on the #1771 press): the candidate
    // fact lists are rebuilt per round, so their seeded tails are solved again, and a fold the first round cut is folded again
    expect(r0.executed + r1.executed, 'both rounds together cost at most about half again one long search').toBeLessThan(alone.executed * 1.65);
  }, 900_000);
});

describe('#2893 with #2894 — a repeat the solver serves counts against the limit as a computed one does', () => {
  it('the round stops at the same charged unit, with the same resume, with and without the repeat table', () => {
    const run = (serve: boolean) => {
      repeatConfig.serve = serve;
      try {
        clearReplayCaches();
        const m0 = readWork().total;
        const r = findValidConfigRound(kite(), 0, 0);
        return { outcome: r, metered: readWork().total - m0 };
      } finally {
        repeatConfig.serve = true;
      }
    };
    const off = run(false);
    const on = run(true);
    expect(isNotDecided(off.outcome), 'the limit cut the search').toBe(true);
    expect(on.outcome, 'the same stop: the same charged units spent, the same round to resume').toEqual(off.outcome);
    expect(on.metered, 'and repeats were served inside it (the meter fell)').toBeLessThan(off.metered);
  }, 900_000);
});
