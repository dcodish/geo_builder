/**
 * THE SUBMIT DECISION — what a newly typed line does to the session.
 *
 * `store/useAnalyticStore.ts` has named this file since V0 (*"Whether a line is acceptable is the
 * submit path's question (`app/submit.ts`), because deciding needs the fold"*), and until #1102 it
 * did not exist: the decision lived inline in `App.tsx`, reachable from no test. That is the defect
 * this module exists to close, and it is worth stating plainly because the symptom was invisible.
 *
 * #1063 built a notice for *a given the figure already entails* and shipped it green. #1076 landed
 * fifteen minutes later in the same round with an arm that returned earlier, and the #1063 branch
 * became unreachable for exactly the class it was built for. **The lock stayed green because it
 * REPRODUCED this decision instead of calling it** — its copy had no `created` arm, so it modelled
 * a submit path that no longer existed and would have stayed green through any further change.
 *
 * So the rule this module carries is not "have a function": it is that **the component and the
 * locks call the SAME decision**. A reproduction is not a test of anything but itself.
 *
 * The decision is pure over `(raw, lines, seed, current)` and returns a verdict; rendering,
 * translation and store writes belong to the caller.
 */
import type { InputError } from '../store/useAnalyticStore';
import { parseLine } from '../parser/parseAnalytic';
import { reportedDof } from '../engine/carriers';
import { derive, type Derivation } from '../engine/derive';

/** What the submit path decided. One of these, always — there is no fall-through. */
export type SubmitVerdict =
  /** Blank input. Nothing happens, not even an error. */
  | { kind: 'ignored' }
  /** The line did not parse, or it parsed and the fold refused it. The caller shows the error. */
  | { kind: 'refused'; error: InputError }
  /** #1045 — every fact was structurally absorbed: the student stated this exact thing already. */
  | { kind: 'already-known'; line: string }
  /** #1063 — the line is TRUE and the figure already settled it; it adds nothing to the list. */
  | { kind: 'already-follows'; line: string }
  /** The line contributes. Record it. */
  | { kind: 'record'; line: string };

/**
 * How many CONSTRAINTS the line appended — the measurement that separates #1063 from #1076.
 *
 * Both classes report the line outcome `created`, and both can leave `gained` at zero, so neither
 * of those alone can tell them apart (measured on #1102):
 *
 * | line                                    | outcome | gained | constraints |
 * | --------------------------------------- | ------- | ------ | ----------- |
 * | «AB = 4» on a determined A,B (entailed)  | created | 0      | **1**       |
 * | «שטח המשולש ABC הוא 6» (entailed)        | created | 0      | **1**       |
 * | «y=x» after «נקודה B על הישר y=x» (promotion) | created | 0 | **0**       |
 *
 * `applyFact` reports `created` when it appends a constraint (`engine/apply.ts`), which is why an
 * entailed given reaches the promotion arm at all. A PROMOTION appends none — it restates a carrier
 * the figure already had as a stated curve. So "did this line append a constraint?" is the honest
 * discriminator, and it is a property of the construction rather than a property of this one input.
 */
const constraintsAdded = (before: Derivation, after: Derivation): number =>
  after.construction.constraints.length - before.construction.constraints.length;

/** What the construction GAINED — objects, parameters and selectors. Constraints are not here. */
const objectsGained = (before: Derivation, after: Derivation): number =>
  after.construction.objects.length - before.construction.objects.length +
  (after.construction.params.length - before.construction.params.length) +
  (after.construction.selectors.length - before.construction.selectors.length);

/**
 * Decide what `raw` does, given the lines already accepted.
 *
 * `current` is the caller's existing derivation of `lines` at `seed` — `App.tsx` already memoizes
 * it, so passing it in keeps the submit path at one extra fold rather than two. A test may simply
 * pass `derive(lines, seed)`.
 */
export function decideSubmit(
  raw: string,
  lines: readonly string[],
  seed: number,
  current: Derivation = derive(lines, seed),
): SubmitVerdict {
  const line = raw.trim();
  if (!line) return { kind: 'ignored' };

  const parsed = parseLine(line);
  if (!parsed.ok) {
    return { kind: 'refused', error: { key: parsed.code, detail: parsed.detail } as InputError };
  }

  /**
   * Dry-run the WHOLE list with the new line appended: a statement is acceptable only if the figure
   * still folds. A refusal keeps the prior figure and names the student's own words.
   */
  const trial = derive([...lines, line], seed);
  const fault = trial.faults.find((f) => f.index === lines.length);
  if (fault) {
    return {
      kind: 'refused',
      error: { key: fault.code, detail: fault.detail, existing: fault.existing } as InputError,
    };
  }

  /**
   * The THIRD outcome (#1045): the statement is true, and the figure already held it.
   *
   * `applyFact` has answered this since V0 and nothing read the answer, so the line was recorded
   * anyway — the student saw their sentence listed twice, the counter said «4 נתונים» for three
   * givens, and the tool said nothing at all. Silence reads as failure, so they type it again.
   *
   * A `narrowed` line is deliberately NOT here: «a הוא פרמטר» then «a<13» is also absorbed, but it
   * added information and belongs in the list like any other given.
   */
  if (trial.outcomes[lines.length] === 'known') {
    return { kind: 'already-known', line };
  }

  const gained = objectsGained(current, trial);
  const constraints = constraintsAdded(current, trial);

  /**
   * A line that PROMOTED a carrier to a stated curve (#1076) changes no count — the object was
   * already there — and consumes no freedom, so a count test alone would call «y=x» after
   * «נקודה B על הישר y=x» a given that already follows, while the canvas visibly gained a line.
   *
   * **Narrowed from `outcomes === 'created'` to "created, and appended no constraint" (#1102).**
   * The wider form swallowed the whole #1063 class, because appending a constraint also reports
   * `created`. A promotion states no constraint; an entailed given is nothing BUT a constraint.
   * Anything that both gains an object and states a constraint still records — it fails the
   * entailment test below on `gained === 0` and falls through to the same place.
   */
  if (trial.outcomes[lines.length] === 'created' && constraints === 0) {
    return { kind: 'record', line };
  }

  /**
   * A given the figure ALREADY ENTAILS (#1063) — the operator's B11/B12.
   *
   * #1045 catches a RESTATEMENT: the same fact twice, decided structurally in `applyFact`. This is
   * the larger notion — «שטח המשולש ABC הוא 6» on a determined triangle was never stated before, it
   * is simply *true and already settled*, and structural absorption cannot see that.
   *
   * **Three conditions, and none alone is enough:**
   *
   *  - the given HOLDS (`unsatisfied` is empty), and
   *  - the figure's reported freedom DID NOT DROP, and
   *  - nothing new APPEARED (`gained === 0`).
   *
   * The second is what separates *"true here"* from *"true necessarily"*. On a free triangle,
   * «AB מקביל לציר x» is satisfied at seed 0 only because the sampler put it there — the constraint
   * is real and removes a degree of freedom, and calling it "already known" would silently discard a
   * stated given, which is the defect this whole product exists to avoid.
   *
   * The third is on the construction, not on the fact kinds: a line that mints an object, a
   * parameter or a selector has contributed something whatever the numbers say. Comparing what the
   * figure GAINED rather than what the sentence emitted is what makes «B נמצא על ציר ה-x» work for
   * an already-placed `B` — that sentence declares `B`, the declaration is absorbed because `B`
   * exists, and the line really does add nothing.
   */
  const freedomBefore = reportedDof(current.construction, current.figure.carrierDof);
  const freedomAfter = reportedDof(trial.construction, trial.figure.carrierDof);
  if (
    parsed.facts.length > 0 &&
    gained === 0 &&
    trial.figure.unsatisfied.length === 0 &&
    freedomAfter === freedomBefore
  ) {
    return { kind: 'already-follows', line };
  }

  return { kind: 'record', line };
}
