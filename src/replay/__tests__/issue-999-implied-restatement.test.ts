/**
 * #999 ([ADR-542](../../../docs/06-decisions.md#adr-542)) — A RELATION RESTATED IN ANOTHER SPELLING IS
 * A NO-OP WITH THE «כבר קיים» NOTE, NOT A SILENT SECOND CONSTRAINT.
 *
 * Operator, playing round #998 T21: *"works — but the entry «AB ⟂ BC» could have said that this fact is
 * already known (we have such a message)"*, and again on #1264's sheet: *"I would expect the
 * perpendicular statements to say that this already known"*.
 *
 * **The predicate is ENTAILMENT, not satisfaction**, and the two locks that prove the difference are
 * #156 and #883 — both hold at the seed and are NOT entailed, and both must keep committing. They live
 * in `dry-run.test.ts` and `issue-883.test.ts` and are deliberately left byte-identical; this file
 * asserts the new behaviour and the negative controls that make the predicate a class test rather than
 * a perpendicular/right-angle table.
 *
 * **Operator ruling, 2026-09-15:** decline it at the door — the submit-layer half only. The apply-time
 * root (an implied constraint is still APPLIED as an independent one, so the figure jumps and the DOF
 * count over-counts) stays open as #1007, and a loaded file is knowingly not covered.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { dryRunOutcome, impliedByPrior, replay } from '@/replay/core';
import { parse } from '@/parser';
import { freeDofCount } from '@/engine';

const commandsOf = (line: string) => {
  const r = parse(line, {});
  if (!r.ok) throw new Error(`${line} did not parse`);
  return r.commands;
};
const outcome = (pre: string[], line: string) => dryRunOutcome(factsOf(pre as never), commandsOf(line), 0);

describe('#999 — a restatement in another spelling is IMPLIED', () => {
  it.each([
    ['משולש ABC', '∠ABC = 90', 'AB ⟂ BC'],
    ['משולש ABC', 'AB ⟂ BC', 'BC ⟂ AB'],
  ])('«%s» · «%s» · «%s» — the third line adds nothing', (shape, first, restated) => {
    const out = outcome([shape, first], restated);
    expect(out.produced).toBe(false);
    expect(out.produced === false && out.reason).toBe('implied');
  });

  /**
   * `'implied'` is its own reason and NOT `'empty'`: `'empty'` falls through to the LLM escalation, and
   * a sentence the parser read perfectly must never cost a model call.
   */
  it('«implied» is a distinct reason from «empty» — an exact duplicate is still «empty»', () => {
    const dup = outcome(['משולש ABC', '∠ABC = 90'], '∠ABC = 90');
    expect(dup.produced === false && dup.reason).toBe('empty');
  });

  /**
   * The point of proving it at the door: the figure the student is looking at does not move, and the
   * freedom cue does not drop, because the redundant constraint is never applied.
   */
  it('the figure does not move and the DOF cue does not drop', () => {
    const before = replay(factsOf(['משולש ABC', '∠ABC = 90'] as never), 0);
    expect(freeDofCount(before.construction)).toBe(1);
    // the restatement is declined, so the committed figure is the one above — unchanged, by construction
    expect(outcome(['משולש ABC', '∠ABC = 90'], 'AB ⟂ BC').produced).toBe(false);
  });
});

describe('#999 — the negative controls: entailment, not satisfaction', () => {
  it('a relation that genuinely constrains still commits', () => {
    expect(outcome(['משולש ABC'], 'AB ⟂ BC').produced).toBe(true);
    expect(outcome(['משולש ABC'], 'AB = AC').produced).toBe(true);
    expect(outcome(['משולש ABC', 'AB = 5'], 'BC = 5').produced).toBe(true);
    expect(outcome(['משולש ABC', '∠ABC = 90'], '∠ACB = 40').produced).toBe(true);
  });

  /**
   * A STATED VALUE IS NOT A RESTATEMENT, even when the relation it expresses already holds.
   *
   * «∠ABC = 90» after «AB ⟂ BC» puts a **90° value on the figure** that was not there — the ⟂ mark
   * carries no number. Declining it would delete something the student stated from the canvas, which is
   * the honesty invariant's cardinal sin, so it commits. The plan's own mechanism says the same thing
   * ("the step adds ONLY constraints"): this step also adds a measure LABEL. Its lock 4 asked for the
   * opposite and is not honoured — see ADR-542, and #1346 for the display question it raises.
   */
  it('the mirror order COMMITS, because the value label is new on the figure', () => {
    const out = outcome(['משולש ABC', 'AB ⟂ BC'], '∠ABC = 90');
    expect(out.produced).toBe(true);
    const after = replay(factsOf(['משולש ABC', 'AB ⟂ BC', '∠ABC = 90'] as never), 0);
    expect(after.labels.angles.map((a) => a.text)).toContain('90°');
  });

  it('a step that adds an OBJECT is never implied, whatever it also adds', () => {
    expect(impliedByPrior(factsOf(['משולש ABC'] as never), commandsOf('נקודה D'), 0)).toBe(false);
  });

  it('fails open on a step that adds nothing at all', () => {
    expect(impliedByPrior(factsOf(['משולש ABC'] as never), [], 0)).toBe(false);
  });
});
