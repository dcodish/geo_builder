/**
 * #2893 ([ADR-AG-479](../../docs/06c-decisions-analytic.md#adr-ag-479); ADR-W-210 phase 4, invariant 3) — THE WORK LIMIT'S
 * LOCKS, on real decisions of the corpus, each run cold and then cut by a limit opened around it (`shell/workLimit`
 * nests, so a smaller limit around an operation is reached first, exactly as `SEARCH_LIMIT_AN` would be on a dearer
 * line):
 *
 * 1. a cut decision answers "not decided" (never a verdict, never a refusal), and hands nothing to the page;
 * 2. the same input under the same limit stops at the same unit with the same outcome (no clock, no machine);
 * 3. «המשיכו לחפש» goes on from where the round stopped: the rounds together cost about what one uncut decision costs,
 *    so no round repeats what an earlier one finished — and the verdict they reach is the uncut verdict, wherever the
 *    cuts fell (nothing half-solved was kept);
 * 4. a "not decided" is never served from a memo: asked again with no limit, the decision is the uncut verdict.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withWorkLimit, limitReached } from '../../shell/workLimit';
import { isNotDecided } from '../../shell/notDecided';
import { readWork } from '../../shell/workMeter';
import { opsAn, type BasisAn } from '../app/opsAn';
import { clearAnalyticCaches } from '../engine/derive';
import { settledOf } from '../engine/settle';
import { SEARCH_LIMIT_AN, WORK_LIMIT_REACHED, decideWithin, solverUnit } from '../engine/workLimitAn';
import { sequencesOf } from './work-meter/walkAnalytic';

const CORPUS = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const linesOf = (id: string): string[] => {
  const s = sequencesOf('corpus471.json', CORPUS).find((q) => q.id === `corpus471.json${id}`);
  if (!s) throw new Error(`no sequence ${id}`);
  return [...s.lines];
};
const basisOf = (lines: readonly string[]): BasisAn => ({ lines, disabled: [], seed: 0, seedNames: {}, hosts: {} });
/** The lines before `k` that the tool records, typed in order, as the figure the k-th line is typed on. */
function figureBefore(lines: readonly string[], k: number): string[] {
  const kept: string[] = [];
  for (const line of lines.slice(0, k)) {
    const v = opsAn.submit({ raw: line, basis: basisOf(kept) }).value;
    if (!isNotDecided(v) && v.kind === 'record') kept.push(line);
  }
  return kept;
}
const spentOn = <T,>(fn: () => T): { value: T; units: number } => {
  const at = readWork().total;
  const value = fn();
  return { value, units: readWork().total - at };
};

describe('#2893 the limit itself', () => {
  it('a unit throws only where an open limit is reached, and a decision cut by it answers not-decided with its round', () => {
    expect(() => solverUnit()).not.toThrow();
    expect(limitReached()).toBe(false);
    const cut = decideWithin(() => {
      for (;;) solverUnit();
    }, 3, 50);
    expect(isNotDecided(cut) && cut.resume).toEqual({ round: 3 });
    expect(isNotDecided(cut) && cut.spent).toBe(50);
    expect(decideWithin(() => 7)).toBe(7);
    // any other throw is the caller's
    expect(() => decideWithin(() => { throw new Error('x'); })).toThrow('x');
    expect(typeof WORK_LIMIT_REACHED).toBe('symbol');
    expect(SEARCH_LIMIT_AN).toBe(2_500_000);
  });
});

/** Real decisions: a record, a refusal, and a «הציגו תצורה אחרת» that finds nothing. */
const CASES: Array<{ name: string; run: () => unknown; prepare: () => void }> = [];
{
  const recordLines = linesOf('#3/5');
  let recordFigure: string[] = [];
  CASES.push({
    name: 'corpus471 #3/5, line 4 (recorded)',
    prepare: () => (recordFigure = figureBefore(recordLines, 3)),
    run: () => opsAn.submit({ raw: recordLines[3], basis: basisOf(recordFigure), round: 1 }).value,
  });
  const refusedLines = linesOf('#23/5');
  let refusedFigure: string[] = [];
  CASES.push({
    name: 'corpus471 #23/5, line 8 (refused)',
    prepare: () => (refusedFigure = figureBefore(refusedLines, 7)),
    run: () => opsAn.submit({ raw: refusedLines[7], basis: basisOf(refusedFigure), round: 1 }).value,
  });
  const anotherLines = linesOf('#1/4');
  let anotherFigure: string[] = [];
  CASES.push({
    name: 'corpus471 #1/4, «הציגו תצורה אחרת»',
    prepare: () => (anotherFigure = figureBefore(anotherLines, anotherLines.length)),
    run: () => opsAn.another({ basis: basisOf(anotherFigure) }).value,
  });
}

describe.each(CASES)('#2893 cut and resumed: $name', ({ run, prepare }) => {
  it('stops the same way twice, resumes without repeating, and reaches the uncut verdict wherever the cuts fall', () => {
    clearAnalyticCaches();
    prepare();
    clearAnalyticCaches();
    const whole = spentOn(run);
    expect(isNotDecided(whole.value)).toBe(false);
    const verdict = JSON.stringify(whole.value);
    expect(whole.units).toBeGreaterThan(20_000);

    /*
     * A round goes on from what the last FINISHED: the memos are written per whole piece (a configuration solved, a walk,
     * a derivation), so a cut must leave room for the dearest piece. Measured on #3/5 line 4 (167 k units): a cut at 1/5 or
     * 1/7 never progresses (one piece is 34–56 k units), a cut at 1/3 does. The real limit is 2.5 M units, above every
     * recorded DECISION (763 k at most), and exam 2379's rounds lose 0.16 M of 6.5 M to the cuts (ADR-AG-479).
     */
    for (const share of [3, 2]) {
      const limit = Math.ceil(whole.units / share);
      // (2) the same input under the same limit: the same stop, the same unit
      clearAnalyticCaches();
      const a = withWorkLimit(limit, run).value;
      clearAnalyticCaches();
      const b = withWorkLimit(limit, run).value;
      expect(isNotDecided(a)).toBe(true);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));

      // (3) round after round from where the last stopped: the total stays near one uncut decision
      clearAnalyticCaches();
      let total = 0;
      let rounds = 0;
      let out: unknown;
      do {
        const r = spentOn(() => withWorkLimit(limit, run).value);
        out = r.value;
        total += r.units;
        rounds += 1;
        expect(rounds).toBeLessThanOrEqual(share * 3);
      } while (isNotDecided(out));
      expect(JSON.stringify(out)).toBe(verdict);
      expect(rounds).toBeGreaterThan(1);
      // each cut throws away at most the one solve it interrupted
      expect(total).toBeLessThan(whole.units * 1.6);

      // (4) a stop is never remembered as an answer
      clearAnalyticCaches();
      expect(isNotDecided(withWorkLimit(limit, run).value)).toBe(true);
      expect(JSON.stringify(run())).toBe(verdict);
    }
  }, 300_000);
});

/**
 * THE THIRD OUTCOME ON A REAL FIGURE (CLAUDE.md rule 4; found by this phase's measurement, ADR-AG-479). Exam 2379,
 * question 3, typed to section ג (`fixtures/exam-2379-q3-route-2392.analytic.json`, nine lines): any further line costs
 * more than ten seconds of work today. «P(1,1)» (P is the tangent point on N1) cannot hold, and the search that shows it
 * spends 6.5 M units (25.6 s on the dev PC, 2026-11-14). Under the limit: «עדיין לא נמצא פתרון» twice, and the third
 * round ends in today's refusal, word for word. When phase 5 (#2894) makes this line cheaper, this count changes.
 */
describe('#2893 exam 2379: a tenth line reaches the limit, twice, then is refused', () => {
  it('not decided, not decided, then today\'s refusal', () => {
    const exam = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'exam-2379-q3-route-2392.analytic.json'), 'utf8')) as { lines: string[] };
    clearAnalyticCaches();
    const figure = figureBefore(exam.lines, exam.lines.length);
    expect(figure).toEqual(exam.lines);
    const outcomes: unknown[] = [];
    for (let round = 1; round <= 3; round += 1) outcomes.push(opsAn.submit({ raw: 'P(1,1)', basis: basisOf(figure), round }));
    const [first, second, third] = outcomes as Array<{ value: unknown; settled: unknown }>;
    expect(first.value).toEqual({ kind: 'not-decided', resume: { round: 1 }, spent: SEARCH_LIMIT_AN });
    expect(second.value).toEqual({ kind: 'not-decided', resume: { round: 2 }, spent: SEARCH_LIMIT_AN });
    // a stop hands the page nothing to adopt
    expect(first.settled).toEqual(settledOf([]));
    expect(third.value).toMatchObject({ kind: 'refused', error: { key: 'unsatisfiable' } });
  }, 600_000);
});
