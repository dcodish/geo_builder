/**
 * Analytic's thin lock over the SHARED sequence-gate rows (#1356, docs/28 §5c).
 *
 * This tree had NO sequence gate: whatever the model wrote was what got parsed. The live case is on
 * #1297 — the model renamed the student's «ישר 1» to `l1`, and they were refused when they referred to
 * their own line by the name they gave it.
 */
import { describe, it, expect } from 'vitest';
import { restoreStatedSequencesAnalytic } from '../parser/honestyAnalytic';
import { sequenceGateFaults } from '../../shell/__tests__/fixtures/sequence-gate-rows';

describe('#1356 — analytic honours the shared sequence-gate contract', () => {
  it('has no faults against the shared rows', () => {
    expect(sequenceGateFaults(restoreStatedSequencesAnalytic)).toEqual([]);
  });

  it('restores a respelled run in this product\'s own sentences', () => {
    const r = restoreStatedSequencesAnalytic('משולש ACB', ['משולש ABC']);
    expect(r.lines).toEqual(['משולש ACB']);
    expect(r.restored).toEqual(['ABC→ACB']);
  });
});
