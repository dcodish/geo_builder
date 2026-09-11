/**
 * #863 ([ADR-3D-245](../../docs/06b-decisions-3d.md#adr-3d-245)): a PURE per-seed quantity is derived
 * ONCE per (construction, seed), never inside the solver's residual loop.
 *
 * The operator's slow figure — a right triangular prism, a symbolic pair injection, then a symbolic line
 * equation on the same solid — made **2,042,796** `sample()` calls in ONE `derive3`, over exactly THREE
 * distinct keys (the prism's `alpha`/`beta`/`height` dims): `evaluateSolidsAndPoints` re-sampled the
 * solid's seeded dims on every one of the pivot's ~680 k residual evaluations, only to read their LENGTH
 * (the values themselves were overridden by the solve). The dims are now sampled once in `resolve3` and
 * threaded into the residual (`sampledSolidDims`); the residual closes over figure constants.
 *
 * The lock is a CALL-COUNT ceiling, never a wall-clock one (machine-dependent): the counter in `rng.ts`
 * is the perf canary, the twin of the 2-D `sampleStats.sweeps`. Positions were measured byte-identical
 * before/after on every `fixtures3/` figure at two seeds (57/57) — this is a pure-performance change.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFigure3 } from '../store/figureFile3';
import { derive3 } from '../store/store3';
import { sampleStats } from '../engine/rng';

const DIR = join(__dirname, '..', '..', 'fixtures3');
const load = (file: string) => {
  const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
  if (!r.ok) throw new Error(`${file}: ${(r as { reason: string }).reason}`);
  return r;
};
/** Far above the measured post-fix counts (4–12 per derive, one-shot callers included) and three orders of
 *  magnitude below the pre-fix ones (72 k – 2.04 M). */
const CEILING = 64;

describe('#863 — the pivot residual loop samples nothing', () => {
  it("the operator's figure: one derive3 costs O(distinct keys) sample calls, not O(iterations)", () => {
    const r = load('symbolic-line-equation-863.geo3.json');
    sampleStats.calls = 0;
    const d = derive3(r.facts, r.seed);
    expect(d.positions.size).toBeGreaterThanOrEqual(6); // the prism's six vertices are placed
    expect(sampleStats.calls, 'pre-fix: 2,042,796').toBeLessThanOrEqual(CEILING);
  });

  it('the counter counts — a figure with a solid samples its dims at least once', () => {
    const r = load('symbolic-line-equation-863.geo3.json');
    sampleStats.solidCalls = 0;
    derive3(r.facts, r.seed);
    expect(sampleStats.solidCalls).toBeGreaterThan(0);
  });

  it("every fixtures3 figure: a solid's dims are sampled a handful of times per derive, at two seeds", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.geo3.json'));
    expect(files.length).toBeGreaterThan(10);
    const over: string[] = [];
    for (const f of files) {
      const r = load(f);
      for (const seed of [r.seed, r.seed + 1]) {
        sampleStats.solidCalls = 0;
        derive3(r.facts, seed);
        if (sampleStats.solidCalls > CEILING) over.push(`${f}@${seed}=${sampleStats.solidCalls}`);
      }
    }
    expect(over, 'pre-fix: 12 fixtures between 72 k and 205 k').toEqual([]);
  });
});
