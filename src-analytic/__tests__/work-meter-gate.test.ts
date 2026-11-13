/**
 * THE ANALYTIC WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved sequence in `fixtures/` (a saved figure, or an entry of a corpus file) is walked through the student's
 * actions — typing each line, «הציגו תצורה אחרת», a cold load, an edit, a delete — and each action's solver work is held
 * against `work-meter/baseline.jsonl`. An action that does MORE work than its baseline fails; the message says which
 * figure, which action, the numbers, and what to do. The rule, the tolerance (zero) and the re-record are
 * `shell/__tests__/work-gate.ts`'s; the actions are `work-meter/driverAnalytic.ts`'s, the same driver the timing
 * harness runs.
 *
 * One unit is one residual evaluation of `solveLM`, of the rank beside it (`jacobianRank`) or of a root scan
 * (`scanRoots`). The analytic tree has no worker, so every unit is page work today — the honest starting point of
 * invariant 1; the part after the paint is the pool and the passive effects.
 *
 * test-budget: the gate walks all 208 saved sequences through every student action (1 963 actions): about 11 min alone,
 * 15 min inside the full suite (ADR-W-210 Am. 1). One file, because the baseline is one file.
 *
 * Re-record: `npm run work:record -- analytic` (docs/08, "The work meter").
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sequencesOf, walkSequence, type FixtureSequence, type WalkPlanA } from './work-meter/walkAnalytic';
import { SLOW_CORPUS_ANALYTIC } from './work-meter/slowCorpusAnalytic';
import { firstDifference, openWorkGate, walkOrder, type MeasuredAction } from '../../shell/__tests__/work-gate';

const DIR = join(__dirname, 'fixtures');
/** `WORK_METER_CORPUS=slow` (`npm run work:check -- analytic --slow`): the open speed issues' sequences instead of the fixtures. */
const SLOW = process.env.WORK_METER_CORPUS === 'slow';
const sequences = new Map<string, FixtureSequence>(
  (SLOW
    ? SLOW_CORPUS_ANALYTIC.map((q): FixtureSequence => ({ id: q.id, lines: q.lines }))
    : readdirSync(DIR)
        .sort()
        .flatMap((f) => sequencesOf(f, JSON.parse(readFileSync(join(DIR, f), 'utf8'))))
  ).map((s) => [s.id, s]),
);
const corpus = [...sequences.keys()].sort();

const gate = openWorkGate({
  product: 'analytic',
  title: 'analytic',
  unit: 'one residual evaluation of solveLM, jacobianRank or scanRoots (src-analytic/engine/solve.ts, pinRoots.ts)',
  dir: join(__dirname, 'work-meter'),
  corpus: SLOW ? 'slow' : 'fixtures',
  perfCommand: (figure) => `node scripts/perf/analytic/driver.mjs --only "${figure}"`,
});
/** Every line typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlanA = { submits: 'all', presses: 1 };

function walk(figure: string): MeasuredAction[] {
  const s = sequences.get(figure)!;
  return walkSequence(s.lines, s.seed, PLAN).map((a) => ({ action: a.action, work: a.work, ms: a.ph.total, ...(a.utterance ? { label: a.utterance } : {}) }));
}

describe('work meter — analytic: no recorded student action does more solver work than its baseline', () => {
  for (const figure of walkOrder(corpus).filter(gate.wants)) {
    it(figure, () => {
      gate.check(figure, walk(figure));
    }, SLOW ? 7_200_000 : 900_000);
  }

  // The slow corpus is walked once: it is asked for by hand, and its figures are the dearest ones.
  if (!SLOW) {
    // docs/17 §7: a work count's lock runs a figure again, warm and after other figures, and asserts EQUAL WORK.
    it('the counts are reproducible: a second walk of a figure, after every other figure, counts the same', () => {
      const byCost = gate.walkedByCost();
      const again = [...new Set([byCost[Math.floor(byCost.length * 0.1)], byCost[Math.floor(byCost.length * 0.5)]])].filter(Boolean);
      expect(again.length).toBeGreaterThan(0);
      for (const figure of again) {
        const second = walk(figure);
        const third = walk(figure);
        expect(firstDifference(gate.measured(figure)!, second), `«${figure}», walked again after the whole corpus`).toBeNull();
        expect(firstDifference(second, third), `«${figure}», walked twice in a row`).toBeNull();
      }
    }, 900_000);
  }

  it(gate.recording ? 're-records the baseline' : 'the baseline matches the corpus, and the page-lane total has not risen', () => {
    gate.finish(corpus);
  });
});
