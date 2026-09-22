/**
 * 3-D's thin lock over the SHARED sequence-gate rows (#1356, docs/28 §5c).
 *
 * 3-D copied 2-D's fix by hand (#555 / ADR-3D-173) and the two drifted as separate files for months.
 * They now call one algorithm and are asserted by one row set; the primed-label case below is 3-D's
 * own alphabet, passed as an explicit option rather than excluded.
 */
import { describe, it, expect } from 'vitest';
import { restoreStatedSequences3 } from '../honesty3';
import { sequenceGateFaults } from '../../../shell/__tests__/fixtures/sequence-gate-rows';

describe('#1356 — 3-D honours the shared sequence-gate contract', () => {
  it('has no faults against the shared rows', () => {
    expect(sequenceGateFaults(restoreStatedSequences3)).toEqual([]);
  });

  it('and none with PRIMED labels — this tree\'s own alphabet', () => {
    expect(sequenceGateFaults(restoreStatedSequences3, { run: { stated: "A'DB", respelled: "A'BD" } })).toEqual([]);
  });
});
