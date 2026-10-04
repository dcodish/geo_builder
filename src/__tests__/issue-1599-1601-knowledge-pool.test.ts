/**
 * #1599 + #1601 (ADR-558) — the knowledge pool is complete, or it says it is not; never cut by the clock.
 *
 * #1601 (operator, prod 2026-09-30): the same figure showed «AC = 2x» on one run and nothing on the next —
 * the pool was cut by a 5 s wall clock, so the verdict depended on the machine's speed that moment.
 * Ruling: bound the knowledge pool by a WORK count (`POOL_WORK_CAP` evaluateCore calls), so a verdict is a
 * function of the input alone, and say «too complex to check fully» when the cap is reached.
 *
 * #1599 (P1): a DETERMINED figure's pool sampled 3 seeds, so the SSA triangle («AB=5 · AC=4 · ∠ABC=40») —
 * whose second shape the configuration button reaches at a few seeds of its 24 — read «נקבע במלואו» and
 * printed BC as definite. Ruling: sample the button's whole seed range (`CONFIG_SEEDS`).
 *
 * Every lock here counts operations or reads verdicts; none times anything.
 */
import { describe, it, expect } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { CONFIG_SEEDS, POOL_WORK_CAP, computeValues, figureDeterminacy, sampleStats, sharedSamples } from '@/replay/core';
import { figureStatus } from '@/app/figureStatus';
import { freeDofCount } from '@/engine';
import { replay } from '@/store/geoStore';
import { work } from '@/engine/solveBudget';

const SSA = ['משולש ABC', 'AB=5', 'AC=4', 'זווית ABC = 40'];
const OPERATOR_1601 = ['מעגל O', 'נקודה P מחוץ למעגל', 'PA ו PB משיקים למעגל', 'המשך BO חותך את המעגל בנקודה D', 'PO', 'AD', 'C נמצאת על DB', 'AC⊥DB', 'PD חותך את AC בנקודה E', 'EC=x'];
/** A corpus figure whose sampling JOBS measured ~23M work units (ADR-558's sweep) — far above the cap. */
const HEAVY = ['שני מעגלים משיקים מבחוץ', 'היקף מעגל O1 הוא 6π', 'שטח מעגל O2 הוא 81π', 'A על מעגל O1', 'AD משיק למעגל O2 בנקודה D', 'B על המשך AD', 'BC משיק למעגל O2 בנקודה C', 'ישר A O1 E O2 C'];

const statusOf = (lines: string[]) => {
  const facts = factsOf(lines);
  return figureStatus(facts.length, freeDofCount(replay(facts).construction), figureDeterminacy(sharedSamples(facts)));
};

describe('#1599 — a determined figure is sampled over the configuration button\'s whole seed range', () => {
  it('the SSA triangle: the status no longer claims «נקבע במלואו»', () => {
    expect(CONFIG_SEEDS).toBe(24);
    const s = statusOf(SSA);
    expect(s?.key, 'two triangles fit — the status must not say determined').not.toBe('actions.determined');
    expect(s?.key).toBe('actions.dofConfigsMany');
  });

  it('the SSA triangle: BC is NOT printed as a definite value (it is 6.212 in one shape, 1.449 in the other)', () => {
    const v = computeValues(factsOf(SSA));
    expect(v.complete).toBe(true);
    expect(v.rows.some((r) => r.kind === 'length' && r.label === 'BC'), 'BC withheld').toBe(false);
    expect(v.rows.find((r) => r.kind === 'length' && r.label === 'AB')?.value, 'the givens still print').toBeCloseTo(5, 6);
  });

  it('the UI-thread «כבר קיים» gate keeps the NARROW set, and its pool never replaces the knowledge pool', () => {
    // its own figure: a pool already cached (complete, wide) is fair for the gate to reuse, so start cold
    const facts = factsOf(['משולש ABC', 'AB=6', 'AC=5', 'זווית ABC = 35']);
    const narrow = sharedSamples(facts, { deadlineMs: Number.POSITIVE_INFINITY });
    expect(narrow.samples.length, 'three seeds, no extra button seeds on the main thread').toBeLessThanOrEqual(3);
    const wide = sharedSamples(facts);
    expect(wide.samples.length, 'the knowledge pool still spans the button’s range').toBeGreaterThan(3);
  });

  it('a genuinely unique determined figure still reads «נקבע במלואו»', () => {
    expect(statusOf(['משולש ישר זווית ABC', 'AB=5, BC=4, AC=3'])?.key).toBe('actions.determined');
  });
});

describe('#1601 — the pool is bounded by WORK, never by time', () => {
  it('the operator\'s figure: its whole pool is complete, far inside the cap, and prints «AC = 2x»', () => {
    const facts = factsOf(OPERATOR_1601);
    const w0 = work.done;
    const pool = sharedSamples(facts);
    expect(pool.complete).toBe(true);
    expect(work.done - w0, 'work spent on the pool').toBeLessThan(POOL_WORK_CAP / 10);
    const ac = computeValues(facts).rows.find((r) => r.kind === 'length' && r.label === 'AC');
    expect(ac?.unit?.sym).toBe('x');
    expect(ac?.unit?.coef).toBeCloseTo(2, 6);
  });

  it('a figure over the cap: the pool says it is incomplete, the status and the values say so, and the same input gives the same verdict every time', () => {
    const facts = factsOf(HEAVY);
    const w0 = work.done;
    const pool = sharedSamples(facts);
    const spent = work.done - w0;
    expect(pool.complete, 'cut by the work cap').toBe(false);
    expect(spent, 'the cap bounds the work (one job may finish past it)').toBeLessThan(POOL_WORK_CAP * 1.5);
    const verdict = figureDeterminacy(pool);
    expect(verdict.complete).toBe(false);
    // one shape in hand from a cut pool proves nothing → «too complex»; a second shape it DID find is a fact
    expect(figureStatus(facts.length, 0, verdict)?.key).toBe(verdict.configurations > 1 ? 'actions.dofConfigsMany' : 'actions.dofTooComplex');
    expect(computeValues(facts).complete, 'the values panel says so too').toBe(false);
    // determinism: #1605 (ADR-582) charges every memo hit its work, so a cut pool is a function of the input
    // alone and IS served from the memo (one sweep per facts) — the cold = warm recompute is locked in
    // issue-1605-charged-memo-hits.test.ts
    const sweeps0 = sampleStats.sweeps;
    const again = sharedSamples(factsOf(HEAVY));
    expect(sampleStats.sweeps, 'the cut pool is reused, not recomputed').toBe(sweeps0);
    expect(again.samples.length).toBe(pool.samples.length);
    expect(figureDeterminacy(again)).toEqual(verdict);
  }, 120_000);
});
