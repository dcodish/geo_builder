/**
 * #2893 ([ADR-831](../../docs/06-decisions.md#adr-831), ADR-W-210 phase 4) — a search that reaches its work limit is
 * "not decided", never «אין תצורה אחרת» or "no valid configuration"; «המשיכו לחפש» goes on from where it stopped.
 *
 * The regression lines are the corpus figures whose search reaches the limit (measured over the fixtures and the slow
 * corpus, the ADR's table): «הציגו תצורה אחרת» on the #1771 semicircle figure, and the configuration search after the
 * #1768 kite's eighth line. The locks are the ADR's three: the same input gives the same outcome cold or warm; a "not
 * decided" is never served from a memo as a verdict; the next round does not repeat what the first one solved.
 *
 * pipeline-lock: the outcome under test is a SEARCH's, run round by round with what each round leaves in the memos; a
 * fixture locks a figure that builds and verifies, and a corpus scenario replays lines, and neither presses a search twice
 * or measures what the second press solves.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearReplayCaches, findValidConfigRound, meetsRequirements, searchAnotherViewRound, SEARCH_WORK_LIMIT, type Fact } from '@/replay/core';
import { work } from '@/engine/solveBudget';
import { deserializeFigure } from '@/store/figureFile';
import { isNotDecided } from '../../shell/notDecided';
import { factsOf } from './scenarios-corpus';
import { inRounds } from './searchRounds';

const semicircle = (): { facts: Fact[]; seed: number } => {
  const r = deserializeFigure(readFileSync(join(__dirname, 'fixtures/issue-1771-semicircle-three-vertices.geo.json'), 'utf8'));
  if (!r.ok) throw new Error('fixture');
  return { facts: structuredClone(r.file.facts) as Fact[], seed: r.file.seed };
};
const executedBy = <T>(fn: () => T): { value: T; executed: number } => {
  const e0 = work.executed;
  const value = fn();
  return { value, executed: work.executed - e0 };
};

describe('#2893 — «הציגו תצורה אחרת» on «ABC משולש ישר זוית · AC=15 · BC=10 · חצי מעגל ABC»', () => {
  it('the first press reaches its limit and says so; «המשיכו לחפש» finishes the search, and today\'s answer stands', () => {
    clearReplayCaches();
    const { facts, seed } = semicircle();
    const first = searchAnotherViewRound(facts, seed, 0);
    expect(isNotDecided(first), 'not decided: never «אין תצורה אחרת» for a search that did not finish').toBe(true);
    if (!isNotDecided(first)) return;
    expect(first.spent).toBeGreaterThanOrEqual(SEARCH_WORK_LIMIT);
    // the search costs ~6.8 M units: its second round finishes, and finds no other drawing — «אין תצורה אחרת», now
    // said by a search that finished (the browser's 12 s clock used to say it of a search that had not)
    const second = searchAnotherViewRound(facts, seed, (first.resume as { round: number }).round);
    expect(isNotDecided(second), 'the second round decides').toBe(false);
    expect(second, 'and it finished with nothing: today\'s «אין תצורה אחרת»').toBeNull();
    expect(meetsRequirements(facts, seed), 'the figure on screen meets every requirement').toBe(true);
  }, 600_000);

  it('the same outcome cold and warm, and a "not decided" is never served from a memo as a verdict', () => {
    clearReplayCaches();
    const cold = searchAnotherViewRound(semicircle().facts, 0, 0);
    // warm: the same content again, its folds held; the round is asked again and still answers "not decided"
    const warm = searchAnotherViewRound(semicircle().facts, 0, 0);
    expect(isNotDecided(cold) && isNotDecided(warm)).toBe(true);
    expect((warm as { resume: unknown }).resume).toEqual((cold as { resume: unknown }).resume);
  }, 600_000);

  it('«המשיכו לחפש» does not repeat what the first round solved', () => {
    clearReplayCaches();
    const { facts, seed } = semicircle();
    const r0 = executedBy(() => searchAnotherViewRound(facts, seed, 0));
    const r1 = executedBy(() => searchAnotherViewRound(facts, seed, 1));
    clearReplayCaches();
    const alone = executedBy(() => searchAnotherViewRound(semicircle().facts, seed, 1)); // the second round, from nothing
    expect(r1.value).toEqual(alone.value);
    expect(r1.executed, 'the second round solves only what the first did not').toBeLessThan(alone.executed);
    // measured: the rounds together execute 1.25 × the one long search (the candidate fact lists are rebuilt per round,
    // so their seeded tails are solved again; the folds are not)
    expect(r0.executed + r1.executed, 'both rounds together cost little more than one long search').toBeLessThan(alone.executed * 1.35);
  }, 900_000);
});

describe('#2893 — the configuration search after the #1768 kite line «שטח משולש NCE = שטח משולש ACD»', () => {
  it('reaches its limit before it decides, and decides when the student presses «המשיכו לחפש»', () => {
    clearReplayCaches();
    const facts = structuredClone(
      factsOf(['ABCD דלתון חסום במעגל', 'AB=AD', 'CB=CD', 'E על DC', 'BE⊥DC', 'AC', 'N = חיתוך BE ו-AC', 'שטח משולש NCE = שטח משולש ACD']),
    ) as Fact[];
    expect(isNotDecided(findValidConfigRound(facts, 0, 0)), 'the first round: not decided, never "no valid configuration"').toBe(true);
    const { rounds } = inRounds((r) => findValidConfigRound(facts, 0, r));
    expect(rounds).toBeGreaterThan(1);
  }, 1_800_000);
});
