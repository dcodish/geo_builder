/**
 * #1296 — the 3-D copy's half of the leading-sign lock.
 *
 * The rows are shared (`shell/__tests__/fixtures/issue-1296-rows.ts`) so this copy cannot drift from the
 * shared core's answer; 3-D keeps its own bidi implementation until Track B migrates it (ADR-W-016).
 *
 * This tree is where the defect bit hardest: «וקטור (-1,2,3)» isolated as `וקטור (-⟦1,2,3⟧)`, and a
 * negative component is everyday vocabulary here — vectors are 3-D only, by design.
 */
import { describe, it, expect } from 'vitest';
import { isolateLtrRuns3 } from '../i18n/bidi';
import { iso, leadingSignSuite } from '../../shell/__tests__/fixtures/issue-1296-rows';

leadingSignSuite(isolateLtrRuns3);

describe('#1296 — 3-D SPLITS a declaration, and that is not a regression', () => {
  /**
   * `declSplit` is 3-D's textbook layout for «הישר l: x=…» and a documented parameter of `makeBidi`, not
   * a divergence to iron out. Asserted so the shared table above cannot be read as claiming the kits are
   * identical, and so this answer survives a migration by being stated rather than assumed.
   */
  it('«נתון הישר l1: 2x-y+8=0» becomes a name island and an equation island', () => {
    expect(isolateLtrRuns3('נתון הישר l1: 2x-y+8=0')).toBe(iso('נתון הישר [l1]: [2x-y+8=0]'));
  });

  /** The interaction of the two rules, not just each alone. */
  it('a leading sign is absorbed on the equation side of the split', () => {
    expect(isolateLtrRuns3('נתון הישר l1: -2x+y=0')).toBe(iso('נתון הישר [l1]: [-2x+y=0]'));
  });
});
