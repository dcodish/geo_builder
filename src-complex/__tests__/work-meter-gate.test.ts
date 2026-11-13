/**
 * THE COMPLEX-NUMBERS WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved session in `fixtures/` is walked through the student's actions — typing each line, «הציגו תצורה אחרת», a
 * cold load, an edit, a delete — and each action's solver work is held against `work-meter/baseline.jsonl`. An action
 * that does MORE work than its baseline fails; the message says which figure, which action, the numbers, and what to
 * do. The rule, the tolerance (zero) and the re-record are `shell/__tests__/work-gate.ts`'s; the actions are
 * `work-meter/driverCx.ts`'s, the same driver the timing harness runs.
 *
 * One unit is one exact solve: every `foldConstraints` makes one, and the entailment gate two. The complex tree has
 * no worker and is the ADR's stated exception — its fold stays on the page under a work ceiling — so every unit is
 * page work, and this baseline is that ceiling.
 *
 * Re-record: `npm run work:record -- complex` (docs/08, "The work meter").
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkFixtureCx, type WalkPlanCx } from './work-meter/walkCx';
import { firstDifference, openWorkGate, walkOrder, type MeasuredAction } from '../../shell/__tests__/work-gate';

const DIR = join(__dirname, 'fixtures');
const corpus = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const gate = openWorkGate({
  product: 'complex',
  title: 'complex numbers',
  unit: 'one exact solve of a fold (src-complex/replay/derive2.ts)',
  dir: join(__dirname, 'work-meter'),
  perfCommand: (figure) => `node scripts/perf/complex/sweep.mjs --only "fixture:${figure.replace('.complex.json', '')}"`,
});
/** Every line typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlanCx = { submits: 'all', presses: 1 };

function walk(figure: string): MeasuredAction[] {
  const file = JSON.parse(readFileSync(join(DIR, figure), 'utf8')) as { lines: string[] };
  return walkFixtureCx(file, file.lines, PLAN).map((a) => ({ action: a.action, work: a.rec.work, ms: a.rec.ms, ...(a.utterance ? { label: a.utterance } : {}) }));
}

describe('work meter — complex: no recorded student action does more solver work than its baseline', () => {
  for (const figure of walkOrder(corpus).filter(gate.wants)) {
    it(figure, () => {
      gate.check(figure, walk(figure));
    }, 900_000);
  }

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

  it(gate.recording ? 're-records the baseline' : 'the baseline matches the corpus, and the page-lane total has not risen', () => {
    gate.finish(corpus);
  });
});
