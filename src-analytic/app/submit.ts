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
import { VOCABULARY_ANALYTIC, imperativeCandidates } from '../parser/scopeAnalytic';
import { hasConstructionSignal } from '../../shell/llm/constructionSignal';
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
  | { kind: 'record'; line: string }
  /**
   * #1353 / ADR-W-030 — the line is an IMPERATIVE WRAPPER over a sentence the tool does understand.
   *
   * Nothing is recorded. The caller pre-fills the input with `canonical` and shows the teaching line,
   * so the student reads the textbook form and presses Enter once. What ends up in the fact list is
   * therefore a sentence they submitted, not a rewrite done on their behalf (ADR-W-029).
   *
   * `canonical` is a string `parseLine` has just accepted, so this verdict can never teach a form the
   * tool would reject.
   */
  | { kind: 'teach'; verb: string; canonical: string };

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

  /**
   * NON-CANONICAL INPUT IS TAUGHT, NEVER SILENTLY ACCEPTED (#1353, ADR-W-030) — and it is checked
   * FIRST, because the defect is that the wrapped form currently succeeds.
   *
   * 42 of the 1,470 wrapper x catalog pairs built silently before this: «הוסף C מחלקת את AB ביחס 3:2»
   * was recorded verbatim, so the fact list taught the imperative back to the student. Placing this
   * after `parseLine` would leave exactly those 42 untouched, which is the whole issue.
   *
   * A candidate becomes a lesson ONLY when the remainder parses. That is what keeps a sentence which
   * merely opens with a verb-like word from being dismembered: if nothing underneath the wrapper is a
   * real sentence, this returns nothing and the original line takes its ordinary path — refusal, and
   * the LLM seam if it is `not-handled`.
   */
  for (const candidate of imperativeCandidates(line)) {
    /**
     * TWO GATES, and the second one is the one that matters.
     *
     * `parseLine` is the cheap filter. It is NOT the promise: measured on an empty canvas,
     * «הוסף C מחלקת את AB ביחס 3:2» has a remainder the PARSER accepts and the FOLD refuses
     * (`unknown-reference` — there is no A and no B yet). Teaching on the parser alone would put a
     * sentence in the box, tell the student to press Enter, and refuse them for doing it — worse than
     * the silent acceptance this feature exists to remove.
     *
     * So the lesson is offered only when this same function would RECORD the sentence as it stands.
     * What is pre-filled is therefore not merely grammatical: it is a line that will be accepted, in
     * this figure, right now. Where it would not be, the wrapper falls through and the student gets
     * the honest refusal about the real problem — that A and B do not exist yet.
     *
     * The recursion terminates: each candidate drops at least the leading verb, and a remainder with
     * no verb in front yields no candidates at all.
     */
    if (!parseLine(candidate.remainder).ok) continue;
    if (decideSubmit(candidate.remainder, lines, seed, current).kind === 'record') {
      return { kind: 'teach', verb: candidate.verb, canonical: candidate.remainder };
    }
  }

  const parsed = parseLine(line);
  if (!parsed.ok) {
    // #1175 — a refusal that carries WHO is already there must not lose them on the way to the UI.
    // Spread rather than listed field-by-field, so the next code that carries context arrives intact.
    return { kind: 'refused', error: { ...parsed, ok: undefined, key: parsed.code } as unknown as InputError };
  }

  /**
   * Dry-run the WHOLE list with the new line appended: a statement is acceptable only if the figure
   * still folds. A refusal keeps the prior figure and names the student's own words.
   */
  const trial = derive([...lines, line], seed);
  /**
   * WHICH fault is this line's (#1334, ADR-AG-143 — ADR-492's rule, at the one chokepoint every typed
   * line passes)? Its own, first. But a solver that cannot meet the whole set blames whichever
   * constraint it fell short on — «משולש ABC» · «AB = AC» · «∠ABC = 90» at some seeds lands the blame
   * on «AB = AC» — and looking only for a fault ON the new line then RECORDED the sentence that
   * completed the contradiction and painted an earlier, true statement red. Before this line the
   * figure was whole; after it something is red; so a fault that APPEARED with this line (absent from
   * the current figure, by line and code) is this line's, and the refusal names this sentence.
   */
  const appeared = (f: Derivation['faults'][number]) => !current.faults.some((g) => g.index === f.index && g.code === f.code);
  const fault =
    trial.faults.find((f) => f.index === lines.length) ??
    trial.faults.filter(appeared).map((f) => ({ ...f, index: lines.length, detail: line }))[0];
  if (fault) {
    return {
      kind: 'refused',
      error: { key: fault.code, detail: fault.detail, existing: fault.existing, expected: fault.expected, holder: fault.holder, example: fault.example } as InputError,
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
   * A NARROWED line RECORDS (#1342) — the promotion shape, one door over.
   *
   * «נתון הישר 2x-y+8=0» then «נתון הישר 1: 2x-y+8=0» gives an anonymous line the student's own name,
   * and the panel now calls it «ישר 1». No object appeared, no constraint was stated and no freedom
   * was consumed, so the entailment gate below saw all three of its conditions met and answered
   * «זה כבר נובע מהנתונים שכתבתם» — *it already follows*. That sentence is false: a NAME does not
   * follow from anything, and the line is the only reason the figure has one.
   *
   * This file already states the rule for the other `narrowed` member two branches up — *"«a הוא
   * פרמטר» then «a<13» is also absorbed, but it added information and belongs in the list like any
   * other given"* — which reached `record` only because a parameter happens to be COUNTED. Read the
   * effect instead of inferring it from a count, and both members are one rule.
   */
  if (trial.outcomes[lines.length] === 'narrowed') {
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
  /**
   * A LINE THAT PINNED THE TOOL'S OWN ASSUMPTION RECORDS (#1159) — checked before the entailment gate,
   * because the entailment gate is exactly what gets it wrong.
   *
   * «טרפז ABCD» then «AB מקביל ל-CD» satisfies all three of that gate's conditions: the given holds,
   * nothing appeared, and the freedom did not drop. So it answered *«זה כבר נובע מהנתונים שכתבתם»* —
   * **it already follows from what you wrote**. The sentence is false. It follows from a pair the
   * TOOL picked by lettering, and the student has just turned that guess into a given. Telling them
   * their own statement is redundant, when the redundancy is the tool's assumption, is ADR-052's
   * cardinal sin wearing an honesty notice — and it is what the operator objected to.
   *
   * Measured rather than assumed, as the plan required: displacing the assumption (arm 1) does NOT
   * deliver this on its own, because pinning changes neither the count nor the freedom. The signal is
   * that an assumption stopped being one.
   */
  const assumptions = (d: Derivation) =>
    d.construction.constraints.filter((k) => k.t === 'relation' && k.assumed).length;
  if (assumptions(trial) < assumptions(current)) return { kind: 'record', line };

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

/**
 * THE LLM SEAM'S ONE QUESTION (#1251, #1272).
 *
 * `not-handled` means no rule matched — the one code that means "I do not know this sentence" rather
 * than "this sentence is wrong". Every other refusal is an OWNED answer (a degenerate role, a reserved
 * coordinate, a name clash) and stands: the tool understood the student and disagreed, and handing
 * that to a model would replace a correct explanation with a guess. The seam is therefore exactly as
 * wide as the parser's honesty about ownership — #1272 fixed the claiming end, never this predicate.
 *
 * Extracted so `App.tsx` and the lock ask the same function ([ADR-AG-139](../../docs/06c-decisions-analytic.md#adr-ag-139)).
 */
export const reachesFallback = (verdict: SubmitVerdict): boolean =>
  verdict.kind === 'refused' &&
  verdict.error.key === 'not-handled' &&
  // #1357: a sentence with NO construction signal (gibberish, a greeting) cannot build whatever the model
  // answers, so it keeps the deterministic refusal and never costs a call. `not-handled` carries the
  // student's own line as its detail (the #1272 lock), so the predicate needs nothing more.
  hasConstructionSignal(verdict.error.detail ?? '', VOCABULARY_ANALYTIC);
