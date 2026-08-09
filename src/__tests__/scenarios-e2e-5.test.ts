import { describe, it, expect } from 'vitest';
import { SCENARIOS, factsOf, replayFacts, sweepSeeds, roundTripProps, newRoundTripCounters, gateProps } from './scenarios-corpus';

// Slice 5/8 of the end-to-end scenario corpus (issue #60): membership is index % 8 === 4.
// Same tests, same assertions as the old single-file loop — sharded so vitest's per-FILE parallelism
// puts every core on the corpus instead of serializing 200+ solver-heavy replays in one worker.
//
// ADR-394: every oracle for a scenario is CO-LOCATED in this one test, against ONE fact list. vitest
// isolates each FILE in its own worker, so an oracle living in a separate file re-paid the whole cold
// solve; within a process the ADR-280 fold memo makes a repeat replay free (measured: 0 ms identical,
// ~5% for a different seed). The seed sweep and the E7 round-trip properties used to be separate
// corpus-wide files costing 601 s and 765 s.
describe('reported scenarios — end-to-end replay of real bug reports (slice 5/8)', () => {
  const rt = newRoundTripCounters();
  const gc = { gateChecked: 0 };

  for (const [i, sc] of SCENARIOS.entries()) {
    if (i % 8 !== 4) continue;
    it(`[${sc.id}] ${sc.title}`, () => {
      const facts = factsOf(sc.steps);
      const fig = replayFacts(facts);
      sc.check(fig);
      // Every scenario must also SATISFY ITS STATED GIVENS (the ADR-053 verifier, now comprehensive):
      // a green figure that silently violates a distance/angle/∥/⟂/collinear/on-circle relation is a bug.
      if (!sc.expectViolations) {
        expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
      }
      // The cross-seed oracle (TST-1): every config the app would DISPLAY must honour this same check,
      // not only the default seed — the dominant historical escape class (ADR-085/098/127/166).
      sweepSeeds(sc, facts);
      // The E7 store-op round-trip properties (ADR-206), against the same facts.
      roundTripProps(sc, facts, rt);
      // The honesty-gate false-positive net (#456/ADR-430): every committed step of a reported-bug
      // scenario is input that must keep working, so the corpus IS the generosity net.
      gateProps(sc, facts, gc);
    });
  }

  // No silent caps: the round-trip properties must have actually run on this slice. If a store-op
  // signature changes so every `swap`/`rename`/`toggle` bails, the properties would pass vacuously —
  // this fails instead. Runs last; vitest executes a file's tests in declaration order.
  it('the round-trip and gate properties were exercised on this slice', () => {
    expect(rt.swapped, 'swap∘swap exercised').toBeGreaterThan(0);
    expect(rt.renamed, 'rename round-trip exercised').toBeGreaterThan(0);
    expect(rt.toggled, 'disable/re-enable exercised').toBeGreaterThan(0);
    expect(gc.gateChecked, 'construct-noun gate net exercised').toBeGreaterThan(0);
  });
});
