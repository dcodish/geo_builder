/**
 * THE WORK CEILING of the complex builder ([ADR-CX-091](../../docs/06d-decisions-complex.md#adr-cx-091), ADR-W-210 Am. 4).
 *
 * Complex solves on the page's own thread, by ADR-W-210's stated exception, under a ceiling of `CEILING_CX` units an
 * action. The gate asserts it over the recorded corpus (`work-meter-gate.test.ts`). This file locks the PAGE side:
 * every job of complex's queue is measured whole on the page lane, an action over the ceiling is reported with its
 * count and never cut, one at or under it says nothing, and the routed store actions run on the page lane through
 * the shared executor with the same result as the store called directly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { meterAction, meterWork } from '../../shell/workMeter';
import { CEILING_CX, actCx, armCeilingCx, workCx } from '../app/workCx';
import { useComplexStore } from '../store/useComplexStore';

describe('complex stays on the page under a work ceiling', () => {
  let reports: string[] = [];
  beforeEach(() => {
    reports = [];
    armCeilingCx((message) => reports.push(message));
    useComplexStore.getState().clearAll();
  });
  afterEach(() => armCeilingCx(() => {}));

  it('the ceiling is ten times the dearest recorded action and no more', () => {
    expect(CEILING_CX).toBe(256);
  });

  it('an action that charges more than the ceiling to the page is reported, with its count, and still finishes', async () => {
    const out = await workCx.run(() => (meterWork(CEILING_CX + 1), 'finished'));
    expect(out, 'nothing is cut').toBe('finished');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain(`charged ${CEILING_CX + 1} units to the page`);
    expect(reports[0]).toContain(`ceiling is ${CEILING_CX}`);
  });

  it('an action at the ceiling, and a job of another lane under it, say nothing', async () => {
    await workCx.run(() => meterWork(CEILING_CX));
    await workCx.run(() => meterWork(3), { lane: 'another' });
    expect(reports).toEqual([]);
  });

  it('a routed store action runs on the PAGE lane, through the queue, with the result the store gives', async () => {
    const m = meterAction();
    await actCx.recordLine('z = 3+4i', 0);
    expect(useComplexStore.getState().lines).toEqual(['z = 3+4i']);
    await actCx.removeLine(0);
    expect(useComplexStore.getState().lines).toEqual([]);
    const counts = m.end();
    expect(counts.page, 'complex has no worker: whatever an action charges is page work').toBe(counts.total);
    expect(reports).toEqual([]);
  });
});
