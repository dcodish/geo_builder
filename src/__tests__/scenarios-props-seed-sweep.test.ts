import { describe, it, expect } from 'vitest';
import { replay, meetsRequirements } from '@/store/geoStore';
import { freeDofs } from '@/engine';
import { SCENARIOS, factsOf, SEED_SWEEP_EXEMPT, SEED_SWEEP_HEAVY } from './scenarios-corpus';
import type { Fact } from '@/store/geoStore';

describe('reported scenarios — seed-sweep oracle (every displayable config honours the scenario check)', () => {
  it('each free-DOF scenario passes its own check at every seed the app would display', () => {
    const deep = !!process.env.SEED_SWEEP_MULT;
    const N = Number(process.env.SEED_SWEEP_MULT) || 3; // seeds 0..N-1; a cross-seed bug shows at a low seed. Deep pass via env.
    const THRESHOLD_MS = 700; // a seed-0 replay slower than this ⇒ a heavy coupled figure; skip-and-log (backstop for NEW heavies)
    const failures: string[] = [];
    const slowSkipped: string[] = [];
    let determined = 0;
    let swept = 0;
    for (const sc of SCENARIOS) {
      if (sc.expectViolations || SEED_SWEEP_EXEMPT[sc.id]) continue; // intentional-flag / config-specific → not this oracle
      if (!deep && SEED_SWEEP_HEAVY.has(sc.id)) { slowSkipped.push(`${sc.id} (known-heavy)`); continue; } // pre-skip without measuring
      let facts: Fact[];
      try {
        facts = factsOf(sc.steps);
      } catch {
        continue; // a step that doesn't parse is the `run` test's concern, not the sweep's
      }
      const t0 = performance.now();
      const base = replay(facts, 0);
      const elapsed = performance.now() - t0;
      if (freeDofs(base.construction).length === 0) {
        determined++;
        continue; // seed-invariant — the single-seed test already covers it
      }
      if (elapsed > THRESHOLD_MS) {
        slowSkipped.push(`${sc.id} (${Math.round(elapsed)}ms/replay)`);
        continue; // too heavy to sweep in CI — surfaced below, never silently dropped
      }
      swept++;
      for (let s = 0; s < N; s++) {
        if (!meetsRequirements(facts, s)) continue; // the app would not display this config
        const fig = replay(facts, s);
        try {
          sc.check(fig);
        } catch (e) {
          failures.push(`[${sc.id}] seed ${s}: ${(e as Error).message.split('\n')[0]}`);
        }
      }
    }
    // No silent caps: report coverage + what was skipped and why.
    // eslint-disable-next-line no-console
    console.log(
      `seed-sweep: swept ${swept} free-DOF scenario(s) × up to ${N} seeds; ${determined} determined (seed-invariant) skipped` +
        (slowSkipped.length ? `; ${slowSkipped.length} heavy skipped: ${slowSkipped.join(', ')}` : ''),
    );
    expect(failures, `configs the app would display but that fail their scenario check:\n${failures.join('\n')}`).toEqual([]);
  }, 300_000);
});
