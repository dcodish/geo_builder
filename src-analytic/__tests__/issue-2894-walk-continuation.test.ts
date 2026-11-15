/**
 * #2894 part 2 ([ADR-AG-482](../../docs/06c-decisions-analytic.md#adr-ag-482)) — THE RETRY WALK IS ONE CONTINUATION.
 *
 * The walks of one content (each attempt, each sign re-seed, each discrete option `evaluateTryingChoices` tries at a
 * seed) share their prefix solves: a step solved once from the same start with the same parameters is served, not solved
 * again. The locks: a figure is the same to the last bit with and without the served steps, the work meter counts fewer
 * units with them, and a cold run counts the same twice.
 *
 * pipeline-lock: the check compares one `evaluate` with and without an instrument (`withoutWalkContinuation`) and counts its
 * work; a fixture or a corpus scenario sees only the figure, which is the same either way by design.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearAnalyticCaches, derive } from '../engine/derive';
import { evaluate, withoutWalkContinuation } from '../engine/evaluate';
import { readWork } from '../../shell/workMeter';

const exam = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'exam-2379-q3-route-2392.analytic.json'), 'utf8')) as { lines: string[] };

/** A figure as exact text: every coordinate and parameter by its 64 bits' shortest spelling. */
const exact = (f: ReturnType<typeof evaluate>): string =>
  JSON.stringify({ points: f.points, curves: f.curves, env: f.env, unsatisfied: f.unsatisfied.length, selectorsOk: f.selectorsOk, dof: f.carrierDof, choice: f.choiceSeed ?? null });

function coldEvaluate(seed: number, plain: boolean): { figure: string; units: number } {
  clearAnalyticCaches();
  const c = derive(exam.lines, 0).construction;
  clearAnalyticCaches();
  const at = readWork().total;
  const run = () => evaluate(c, seed, 1, true);
  const f = plain ? withoutWalkContinuation(run) : run();
  return { figure: exact(f), units: readWork().total - at };
}

describe('#2894 the retry walk is one continuation (exam 2379, nine lines)', () => {
  // seed 7: no option holds, so every option's every attempt walks — the walks the tree shares most
  // seed 11: an option that holds after some walks — the drawn configuration itself
  for (const seed of [7, 11]) {
    it(`seed ${seed}: the same figure to the last bit, for fewer evaluations; a cold run counts the same twice`, () => {
      const served = coldEvaluate(seed, false);
      const again = coldEvaluate(seed, false);
      const plain = coldEvaluate(seed, true);
      expect(served.figure).toBe(plain.figure);
      expect(again).toEqual(served);
      expect(served.units).toBeLessThan(plain.units);
    }, 300_000);
  }
});
