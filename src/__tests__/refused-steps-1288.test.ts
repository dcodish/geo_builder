/**
 * #1288 (ADR-555) — the scenario harness's `refusedSteps` declaration, locked through the harness's OWN
 * entry points (`scenarioFacts`, `factsOf`) — never a re-implementation of the check.
 *
 * The declaration is non-vacuous by construction, and each direction is proved here: a listed step that
 * is ACCEPTED fails; an UNLISTED step that is refused fails; a listed step refused for ANOTHER reason (or
 * with another payload) fails; a malformed row fails. The satisfied declaration replays the rest of the
 * operator's sequence without the refused sentence, exactly as the app commits nothing for it.
 */
import { describe, expect, it } from 'vitest';
import { SCENARIOS, scenarioFacts, factsOf, replayFacts } from './scenarios-corpus';
import type { RefusedStep, Scenario } from './scenarios-corpus';

// The #944 sequence: AB and BC share B, so their crossing IS B — refused by name (ADR-531).
const REFUSED = 'D = חיתוך AB ו-BC';
const row = (over: Partial<RefusedStep> = {}): RefusedStep => ({
  step: 2,
  reason: 'crossing-already-named',
  with: { holder: 'B', id: 'D' },
  why: 'ADR-531',
  ...over,
});
const sc = (steps: Scenario['steps'], refusedSteps?: RefusedStep[]) => ({ id: 'self-test-1288', steps, refusedSteps });

describe('#1288 — a scenario can declare a step the parser must REFUSE', () => {
  it('a satisfied declaration commits nothing for the refused step and replays the rest', () => {
    const facts = scenarioFacts(sc(['משולש ABC', REFUSED, 'E אמצע AB'], [row()]));
    expect(facts.some((f) => f.utterance === REFUSED), 'the refused sentence never becomes a fact').toBe(false);
    expect(facts.some((f) => f.utterance === 'E אמצע AB'), 'the step after it still commits').toBe(true);
    // the refused step keeps its typed-step number: the next step is group g2, not g1
    expect(facts.find((f) => f.utterance === 'E אמצע AB')!.group).toBe('g2');
    const fig = replayFacts(facts);
    expect(fig.positions.has('D')).toBe(false);
    expect(fig.positions.has('E')).toBe(true);
  });

  it('FAILS when a listed step is ACCEPTED — a row cannot outlive the ruling it documents', () => {
    // «E אמצע AB» parses and builds; declaring it refused must turn the scenario red.
    expect(() => scenarioFacts(sc(['משולש ABC', 'E אמצע AB'], [row()]))).toThrow(/now PARSES.*delete the row/);
  });

  it('FAILS when an UNLISTED step is refused — naming the refusal and the remedy', () => {
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED]))).toThrow(/was REFUSED.*crossing-already-named.*refusedSteps/);
    // and a refused step listed at the WRONG position is still an unlisted refusal
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED, 'E אמצע AB'], [row({ step: 3 })]))).toThrow();
  });

  it('FAILS when the step is refused for ANOTHER reason, or with another payload', () => {
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED], [row({ reason: 'alias-taken', with: undefined })]))).toThrow(
      /expected reason alias-taken/,
    );
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED], [row({ with: { holder: 'A' } })]))).toThrow(/expected holder = "A", got "B"/);
  });

  it('an escalation is not a refusal: a not-handled step still fails as before, listed or not', () => {
    const gibberish = 'זה לא משפט גאומטרי בכלל';
    expect(() => scenarioFacts(sc(['משולש ABC', gibberish]))).toThrow(/would escalate to the LLM/);
    expect(() => scenarioFacts(sc(['משולש ABC', gibberish], [row({ with: undefined })]))).toThrow(/expected reason crossing-already-named/);
  });

  it('FAILS on a malformed row: out of range, duplicated, or pointing at a non-typed step', () => {
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED], [row({ step: 3 })]))).toThrow(/outside the sequence/);
    expect(() => scenarioFacts(sc(['משולש ABC', REFUSED], [row(), row()]))).toThrow(/listed twice/);
    expect(() => scenarioFacts(sc(['משולש ABC', { llm: ['E אמצע AB'] }], [row()]))).toThrow(/not a typed \(string\) step/);
  });

  it('a PREFIX of a scenario replays with the scenario\'s own rows (a row past the prefix is inert there)', () => {
    const steps = ['משולש ABC', REFUSED, 'E אמצע AB'];
    expect(() => factsOf(steps.slice(0, 1), [row()])).not.toThrow();
    expect(() => factsOf(steps.slice(0, 2), [row()])).not.toThrow();
  });

  it('the corpus actually USES the declaration (the mechanism is exercised, not only defined)', () => {
    const declaring = SCENARIOS.filter((s) => (s.refusedSteps ?? []).length > 0).map((s) => s.id);
    expect(declaring).toEqual(expect.arrayContaining(['existing-point-statements-lower-to-constraints', 'shared-endpoint-crossing-refused-944']));
  });
});
