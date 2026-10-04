/**
 * #1770 ([ADR-586](../../docs/06-decisions.md#adr-586)) — A CHECK THAT READ A CUT RE-ATTEMPT DID NOT FINISH.
 *
 * ADR-583 runs every RE-attempt of a failed fact under a deterministic executed-work cap, and a cut re-attempt
 * restores `solveBudget.aborts` (the cut is part of what the fold IS). The configuration pool decided
 * «complete» by that abort count alone, so a configuration whose fold carried a cut re-attempt — rejected
 * without being examined to the end — read as an ordinary failure, and the status could claim
 * «✓ הציור נקבע במלואו» on a check that skipped work. The cut is now carried on the fold (`reattemptCut`) and
 * observed by every check that concludes from folds it reads: the pool (→ `complete:false`, so the status says
 * «מורכב מדי…» and the values panel says incomplete) and the gate's seat sweep (→ not `complete`, so no
 * «no seat cures it» refusal rests on it).
 *
 * The cut is FORCED through the cap's own test seam (`reattemptConfig.cap`), on a right triangle whose two
 * other right-angle seats genuinely fail — their folds re-attempt the failed side, and a 1 000-unit cap cuts
 * those re-attempts. Every lock reads verdicts or counts operations; none times anything.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { clearReplayCaches, computeValues, figureDeterminacy, reattemptConfig, reattemptStats, REATTEMPT_WORK_CAP, seatSweep, sharedSamples, seatSweepConfig } from '@/replay/core';
import { figureStatus } from '@/app/figureStatus';
import { freeDofCount } from '@/engine';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** Right-angle seat unstated; 3-4-5 holds only with the right angle at C — the A and B seats fail. */
const RIGHT_345 = ['ABC משולש ישר זוית', 'AB=5', 'BC=3', 'AC=4'];
/** Round #1767's T12 — two externally tangent circles and a tangent pair (its pool runs no re-attempt). */
const T12 = ['שני מעגלים O1 ו O2 משיקים מבחוץ', 'A על מעגל O1', 'C על מעגל O2', 'AC עובר דרך O1 ו O2', 'היקף מעגל O1 הוא 6π', 'שטח מעגל O2 = 81π', 'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D', 'A נמצא על המשך BD'];
const FORCED_CAP = 1_000;

const statusOf = (facts: Fact[]) => figureStatus(facts.length, freeDofCount(replay(facts).construction), figureDeterminacy(sharedSamples(facts)));
/** Evict the one-entry pool memo (folds and replays stay warm) — a tiny other figure's pool replaces it. */
const evictPoolMemo = () => sharedSamples(factsOf(['משולש ABC', 'AB=3', 'BC=4', 'AC=5']));

afterEach(() => {
  reattemptConfig.cap = REATTEMPT_WORK_CAP;
});

describe('#1770 — a pool that read a cut re-attempt is not complete', () => {
  it('forced cap: the 3-4-5 pool reads complete:false and the status is «מורכב מדי», not «נקבע במלואו» — cold = warm', () => {
    reattemptConfig.cap = FORCED_CAP;
    clearReplayCaches();
    const facts = factsOf(RIGHT_345);
    const e0 = reattemptStats.exhausted;
    const cold = sharedSamples(facts);
    expect(reattemptStats.exhausted - e0, 'the cap cut a re-attempt inside the pool').toBeGreaterThan(0);
    expect(Object.values(replay(facts).status).every((s) => s === 'ok' || s === 'disabled'), 'the student’s own figure is clean').toBe(true);
    expect(cold.complete).toBe(false);
    expect(figureDeterminacy(cold).complete).toBe(false);
    const coldStatus = statusOf(facts)?.key;
    expect(coldStatus).not.toBe('actions.determined');
    expect(coldStatus).toBe('actions.dofTooComplex');
    expect(computeValues(facts).complete, 'the values panel reads the same verdict').toBe(false);

    // warm through the REPLAY memo (same array — the cut folds are served as replay hits)
    evictPoolMemo();
    const warmReplay = sharedSamples(facts);
    expect(warmReplay.complete).toBe(false);
    expect(statusOf(facts)?.key).toBe(coldStatus);
    // warm through the FOLD memo (same content, fresh arrays — the cut folds are served as fold hits)
    evictPoolMemo();
    const clone = facts.map((f) => ({ ...f }));
    const warmFold = sharedSamples(clone);
    expect(warmFold.complete).toBe(false);
    expect(statusOf(clone)?.key).toBe(coldStatus);
  }, 600_000);

  it('the real cap: the same figure is complete and reads «נקבע במלואו» (nothing cut)', () => {
    clearReplayCaches();
    const facts = factsOf(RIGHT_345);
    const e0 = reattemptStats.exhausted;
    expect(sharedSamples(facts).complete).toBe(true);
    expect(reattemptStats.exhausted - e0).toBe(0);
    expect(statusOf(facts)?.key).toBe('actions.determined');
  }, 600_000);

  it('T12 (two tangent circles): complete:true, «נקבע במלואו», no re-attempt capped or cut', () => {
    clearReplayCaches();
    const facts = factsOf(T12);
    const c0 = reattemptStats.capped;
    const e0 = reattemptStats.exhausted;
    const pool = sharedSamples(facts);
    expect(reattemptStats.capped - c0, 'capped').toBe(0);
    expect(reattemptStats.exhausted - e0, 'exhausted').toBe(0);
    expect(pool.complete).toBe(true);
    expect(statusOf(facts)?.key).toBe('actions.determined');
  }, 600_000);
});

describe('#1770 — the gate’s seat sweep that read a cut re-attempt did not finish', () => {
  // 2 + 3 < 6: no triangle at all, so every seat fails and the rotations' folds re-attempt the failed sides
  const ALL_FAIL = ['ABC משולש ישר זוית', 'AB=2', 'BC=3', 'AC=6'];
  it('forced cap: no cure, and the sweep is NOT complete (no «no seat cures it» refusal rests on it)', () => {
    reattemptConfig.cap = FORCED_CAP;
    clearReplayCaches();
    const facts = factsOf(ALL_FAIL);
    const e0 = reattemptStats.exhausted;
    const r = seatSweep(facts, { workCap: seatSweepConfig.cap });
    expect(reattemptStats.exhausted - e0, 'the cap cut a re-attempt inside the sweep').toBeGreaterThan(0);
    expect(r.cured).toBe(null);
    expect(r.complete).toBe(false);
    expect(seatSweep(facts, { workCap: seatSweepConfig.cap }).complete, 'warm').toBe(false);
  }, 600_000);

  it('the real cap: the same sweep finishes without a cure', () => {
    clearReplayCaches();
    const r = seatSweep(factsOf(ALL_FAIL), { workCap: seatSweepConfig.cap });
    expect(r.cured).toBe(null);
    expect(r.complete).toBe(true);
  }, 600_000);
});
