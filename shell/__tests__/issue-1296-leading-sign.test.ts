/**
 * #1296 — the shared core's half of the leading-sign lock (analytic + complex).
 *
 * Operator, 2026-09-20, typing `(-2,4)` into the analytic tool: *"I cannot enter the coordinates in a
 * normal way. the bidi keeps interfering and i dont know how to get around it"*. There was nothing to get
 * around — the string was always correct and only the display was wrong, which is exactly why he could
 * not type his way out of it.
 *
 * The ROWS are in `fixtures/issue-1296-rows.ts` and are asserted identically by `src/i18n/__tests__` and
 * `src3d/__tests__`, because the span logic is copied three times and a per-tree table would not notice
 * one copy drifting. One test importing all three kits is forbidden — `shell/` may never import a product
 * tree (ADR-W-016 rule 2) — so the table is shared and the assertions are per tree. See the fixture's
 * docblock; `server/__tests__/isolation.test.ts` refused the first draft that got this wrong.
 */
import { describe, it, expect } from 'vitest';
import { makeBidi } from '../bidi';
import { iso, leadingSignSuite } from './fixtures/issue-1296-rows';

const kit = makeBidi();

leadingSignSuite((s) => kit.isolateLtrRuns(s));

describe('#1296 — the shared core keeps a declaration as ONE island', () => {
  /**
   * The counterpart of 3-D's `declSplit` assertion. Stated here so the difference between the kits is
   * recorded on both sides rather than inferred from one side's silence — and so a Track B migration of
   * 3-D onto this core has to decide about the split deliberately.
   */
  it('«נתון הישר l1: 2x-y+8=0» is not split', () => {
    expect(kit.isolateLtrRuns('נתון הישר l1: 2x-y+8=0')).toBe(iso('נתון הישר [l1: 2x-y+8=0]'));
  });

  it('and a leading sign is absorbed inside it', () => {
    expect(kit.isolateLtrRuns('נתון הישר l1: -2x+y=0')).toBe(iso('נתון הישר [l1: -2x+y=0]'));
  });
});
