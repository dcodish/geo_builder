/**
 * 2-D's thin lock over the SHARED sequence-gate rows (#1356, docs/28 §5c).
 *
 * The rows live once in `shell/__tests__/fixtures/sequence-gate-rows.ts` and a meta-lock there proves
 * they catch a broken gate. This file only says: 2-D's gate is one of the subjects. The defect it
 * guards is 2-D's own production P1 (#536) — a respelled point run committed the negation of a given.
 */
import { describe, it, expect } from 'vitest';
import { restoreStatedSequences } from '../parse';
import { sequenceGateFaults } from '../../../shell/__tests__/fixtures/sequence-gate-rows';

describe('#1356 — 2-D honours the shared sequence-gate contract', () => {
  it('has no faults against the shared rows', () => {
    expect(sequenceGateFaults(restoreStatedSequences)).toEqual([]);
  });

  it('still restores the original #536 case, in Hebrew', () => {
    const r = restoreStatedSequences('נקודה D על ישר ADB', ['ישר ABD']);
    expect(r.lines).toEqual(['ישר ADB']);
    expect(r.restored).toEqual(['ABD→ADB']);
  });
});
