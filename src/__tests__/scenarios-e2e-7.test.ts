import { describe, it, expect, vi } from 'vitest';
import { SCENARIOS, scenarioFacts, replayFacts, sweepSeeds, roundTripProps, newRoundTripCounters, gateProps, dofHonesty, degeneracyHonesty, rowImmutability } from './scenarios-corpus';
import { newStepNetCounters, stepNets } from './step-nets';
import { noRoom, noRoomOutsideClass } from './no-room-spy';

// #1936 (ADR-W-191): the no-room prover is watched on this walk; the spy records and never changes a verdict.
vi.mock('@/engine/metricFeasibility', async (importOriginal) => (await import('./no-room-spy')).spyOnProver(await importOriginal()));

// Slice 7/8 of the end-to-end scenario corpus (issue #60): membership is index % 8 === 6.
// Same tests, same assertions as the old single-file loop — sharded so vitest's per-FILE parallelism
// puts every core on the corpus instead of serializing 200+ solver-heavy replays in one worker.
//
// ADR-394: every oracle for a scenario is CO-LOCATED in this one test, against ONE fact list. vitest
// isolates each FILE in its own worker, so an oracle living in a separate file re-paid the whole cold
// solve; within a process the ADR-280 fold memo makes a repeat replay free (measured: 0 ms identical,
// ~5% for a different seed). The seed sweep and the E7 round-trip properties used to be separate
// corpus-wide files costing 601 s and 765 s.
describe('reported scenarios — end-to-end replay of real bug reports (slice 7/8)', () => {
  const rt = newRoundTripCounters();
  const gc = { gateChecked: 0 };
  const dc = { dofChecked: 0 };
  const dg = { degeneracyChecked: 0 };
  const sn = newStepNetCounters();

  for (const [i, sc] of SCENARIOS.entries()) {
    if (i % 8 !== 6) continue;
    it(`[${sc.id}] ${sc.title}`, () => {
      noRoom.current = `scenario:${sc.id}`; // before anything of this scenario folds (#1936)
      const facts = scenarioFacts(sc);
      const fig = replayFacts(facts);
      // #1936: what the old net judged is this scenario's fold; the oracles below (its own check drives a refused line
      // through the gate on purpose) are recorded apart and not judged.
      noRoom.current = `scenario:${sc.id}#oracles`;
      sc.check(fig);
      // Every scenario must also SATISFY ITS STATED GIVENS (the ADR-053 verifier, now comprehensive):
      // a green figure that silently violates a distance/angle/∥/⟂/collinear/on-circle relation is a bug.
      if (!sc.expectViolations) {
        expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
      }
      // ADR-052 DOF honesty (#912): freedom the cue CLAIMS must be freedom the sampler HAS.
      dofHonesty(sc, fig, dc);
      // #945 (ADR-513): a flat declared polygon is said out loud — and an ordinary figure stays SILENT.
      degeneracyHonesty(sc, fig, dg);
      // The cross-seed oracle (TST-1): every config the app would DISPLAY must honour this same check,
      // not only the default seed — the dominant historical escape class (ADR-085/098/127/166).
      sweepSeeds(sc, facts);
      // The E7 store-op round-trip properties (ADR-206), against the same facts.
      roundTripProps(sc, facts, rt);
      // The honesty-gate false-positive net (#456/ADR-430): every committed step of a reported-bug
      // scenario is input that must keep working, so the corpus IS the generosity net.
      gateProps(sc, facts, gc);
      // #2480 (ADR-757): committing the steps one by one never rewrites a row an earlier step committed.
      rowImmutability(facts, `[${sc.id}]`);
      // #1888 / #1906 (ADR-W-191, restoring ADR-394): the step nets ride this walk. Every committed step is a line
      // that works, so no honesty member may refuse it; each prefix replay here is a fold-memo hit.
      expect(stepNets(`scenario:${sc.id}`, facts, new Set(sc.steps.filter((s): s is string => typeof s === 'string')), sn)).toEqual([]);
      // #1936 (ADR-658, ADR-746): the no-room verdict fires only on its class rows, whatever else the corpus holds.
      expect(noRoomOutsideClass(`scenario:${sc.id}`), 'the no-room verdict fired outside the class').toEqual([]);
    });
  }

  // No silent caps: the round-trip properties must have actually run on this slice. If a store-op
  // signature changes so every `swap`/`rename`/`toggle` bails, the properties would pass vacuously —
  // this fails instead. Runs last; vitest executes a file's tests in declaration order.
  it('the degeneracy notice was judged on this slice (no silent vacuum)', () => {
    expect(dg.degeneracyChecked).toBeGreaterThan(0);
  });

  it('the round-trip and gate properties were exercised on this slice', () => {
    expect(rt.swapped, 'swap∘swap exercised').toBeGreaterThan(0);
    expect(rt.renamed, 'rename round-trip exercised').toBeGreaterThan(0);
    expect(rt.toggled, 'disable/re-enable exercised').toBeGreaterThan(0);
    expect(gc.gateChecked, 'construct-noun gate net exercised').toBeGreaterThan(0);
    expect(dc.dofChecked, 'ADR-052 DOF-honesty oracle exercised (#912)').toBeGreaterThan(0);
    expect(sn.checked, 'the step nets judged committed steps (#1888, #1906)').toBeGreaterThan(0);
    expect(sn.withNumber, 'the number member met stated numbers (#2198)').toBeGreaterThan(0);
    expect(sn.withWord, 'the AI-answer word member met property words (#1906)').toBeGreaterThan(0);
    expect(noRoom.calls, 'the angle-sum prover was asked on this slice (#1936)').toBeGreaterThan(0);
    console.info(`step nets, slice 7/8: ${JSON.stringify(sn)}; no-room prover calls ${noRoom.calls}`);
  });
});
