import { describe, it, expect } from 'vitest';
import { SCENARIOS, run } from './scenarios-corpus';

// Slice 8/8 of the end-to-end scenario corpus (issue #60): membership is index % 8 === 7.
// Same tests, same assertions as the old single-file loop — sharded so vitest's per-FILE parallelism
// puts every core on the corpus instead of serializing 200+ solver-heavy replays in one worker.
describe('reported scenarios — end-to-end replay of real bug reports (slice 8/8)', () => {
  for (const [i, sc] of SCENARIOS.entries()) {
    if (i % 8 !== 7) continue;
    it(`[${sc.id}] ${sc.title}`, () => {
      const fig = run(sc.steps);
      sc.check(fig);
      // Every scenario must also SATISFY ITS STATED GIVENS (the ADR-053 verifier, now comprehensive):
      // a green figure that silently violates a distance/angle/∥/⟂/collinear/on-circle relation is a bug.
      if (!sc.expectViolations) {
        expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
      }
    });
  }
});
