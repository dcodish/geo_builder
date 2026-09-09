/**
 * #955 ([ADR-491](../../../docs/06-decisions.md#adr-491)) — the label check is WIRED into every replay.
 *
 * `engine/__tests__/label-honesty.test.ts` proves `checkLabels` does its job on injected labels; this file
 * proves replay actually CALLS it on the figure it is about to publish, with that figure's own labels and
 * positions and the constraint violations it already found (the dedupe input). Without an exercised
 * lock a guard with an early return passes by checking nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import * as engine from '@/engine';
import { factsOf, replayFacts } from '../../__tests__/scenario-pipeline';

vi.mock('@/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/engine')>();
  return { ...real, checkLabels: vi.fn(real.checkLabels) };
});

describe('#955 — replay runs the label check on the published figure', () => {
  it('is called with the assembled labels, the drawn positions and the prior violations', () => {
    const spy = engine.checkLabels as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const fig = replayFacts(factsOf(['משולש ABC', 'AB = 5', 'זווית ABC = 40']));
    expect(fig.lastError).toBeNull();
    expect(spy, 'exercised on this replay').toHaveBeenCalled();
    const [labels, positions, prior] = spy.mock.calls[spy.mock.calls.length - 1];
    expect(labels).toBe(fig.labels);
    expect(positions).toBe(fig.positions);
    expect(Array.isArray(prior)).toBe(true);
    // the check found nothing to add on an honest figure
    expect(fig.violations).toEqual([]);
  });
});
