/**
 * #1315 — THE PARITY SUITE BITES. A meta-lock on the checks the four per-tree locks run.
 *
 * The four locks are green, and a green lock proves nothing until you know it can go red. That matters
 * more than usual here because of what was deleted: the old guard was a source-text scan that could pass
 * while the product was wrong, and the whole case for replacing it is that these checks catch what it
 * could not. So the claims are exercised against deliberately broken stubs.
 *
 * It calls `previewFaults` — the same function the per-tree suites call — rather than re-deriving the
 * checks. A meta-lock with its own copy would prove only that the copy bites, which is the reproduction
 * trap ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)) this entire issue is about.
 *
 * Stubs only: no product imports, so `shell/` stays clean of the trees it may not touch (ADR-W-016 rule 2).
 */
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { MathText } from '../math';
import { makeBidi } from '../bidi';
import { MATH_ROWS, PLAIN_ROWS, previewFaults } from './fixtures/issue-1152-preview-rows';

const kit = makeBidi();
const RTL = { product: 'stub', isolatesFirst: true } as const;

describe('#1315 — the replacement checks catch what the source scan could not', () => {
  /**
   * THE CASE FOR THE REPLACEMENT, in one assertion.
   *
   * This stub is exactly what the OLD guard was blind to: its source would contain the literal
   * `hasMath(s)` and `MathText`, so it passed the scan — while handing `MathText` the raw, unisolated
   * string, which is the RTL defect #1152 was filed about and the one #1215 actually shipped in analytic.
   */
  it('a preview that typesets the RAW string is caught', () => {
    const faults = previewFaults((s) => <MathText text={s} />, RTL);
    expect(faults.length, 'a raw-string preview must not pass an RTL product').toBeGreaterThan(0);
    expect(faults.join('\n')).toMatch(/raw string/);
  });

  it('a preview that never typesets is caught on every math row', () => {
    const faults = previewFaults((s) => s, { product: 'stub', isolatesFirst: false });
    expect(faults).toHaveLength(MATH_ROWS.length);
    expect(faults.join('\n')).toMatch(/must render through MathText/);
  });

  it('a preview that typesets EVERYTHING is caught on the plain rows', () => {
    const faults = previewFaults((s) => <MathText text={kit.isolateLtrRuns(s, true)} />, RTL);
    expect(faults).toHaveLength(PLAIN_ROWS.length);
    expect(faults.join('\n')).toMatch(/no mathematics to typeset/);
  });

  /**
   * A preview that isolates but typesets nothing structural — the subtler miss. It proves the isolate
   * check is not satisfied merely by the presence of isolation somewhere in the pipeline.
   */
  it('a preview that isolates but does not typeset is still caught', () => {
    const faults = previewFaults((s): ReactNode => kit.isolateLtrRuns(s, true), RTL);
    expect(faults.join('\n')).toMatch(/must render through MathText/);
  });

  /** And the correct shape passes, so the checks are not simply failing everything. */
  it('a correct preview reports no faults', () => {
    const correct = (s: string): ReactNode =>
      /\^|²|³/.test(s) ? <MathText text={kit.isolateLtrRuns(s, true)} /> : null;
    expect(previewFaults(correct, RTL)).toEqual([]);
  });
});
