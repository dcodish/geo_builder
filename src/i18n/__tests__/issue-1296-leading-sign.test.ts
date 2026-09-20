/**
 * #1296 — the 2-D copy's half of the leading-sign lock.
 *
 * The rows are shared (`shell/__tests__/fixtures/issue-1296-rows.ts`) so this copy cannot drift from the
 * shared core's answer; 2-D keeps its own bidi implementation until Track B migrates it (ADR-W-016).
 * Measured broken here before the fix: «הזווית היא -37» isolated as `הזווית היא -⟦37⟧`.
 */
import { describe, it, expect } from 'vitest';
import { isolateLtrRuns } from '../bidi';
import { iso, leadingSignSuite } from '../../../shell/__tests__/fixtures/issue-1296-rows';

leadingSignSuite(isolateLtrRuns);

describe('#1296 — 2-D keeps a declaration as ONE island', () => {
  it('«נתון הישר l1: 2x-y+8=0» is not split', () => {
    expect(isolateLtrRuns('נתון הישר l1: 2x-y+8=0')).toBe(iso('נתון הישר [l1: 2x-y+8=0]'));
  });
});
