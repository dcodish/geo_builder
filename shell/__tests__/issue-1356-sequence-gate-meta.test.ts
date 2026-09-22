/**
 * THE META-LOCK (#1356, docs/28 §5c step 5) — the shared rows are run against deliberately BROKEN
 * stubs, and every check is asserted to catch its own defect.
 *
 * A shared suite that silently passes everything is worse than no suite: each product's thin lock
 * would go green and the rule would be held by nothing. This file is what makes the green meaningful.
 * It calls the same `sequenceGateFaults`, never its own copy.
 */
import { describe, it, expect } from 'vitest';
import { sequenceGateFaults, type SequenceGate } from './fixtures/sequence-gate-rows';
import { restoreStatedSequences } from '../llm/sequenceGate';

/** A correct gate, built from the shared algorithm with the simplest possible product options. */
const good: SequenceGate = (utterance, lines) =>
  restoreStatedSequences(utterance, lines, {
    label: () => /[A-Z]\d*/g,
    run: () => /(?<![A-Za-z])(?:[A-Z]\d*){3,}(?![a-z\d])/g,
    normalizeUtterance: (s) => s,
    prepareLine: (line) => ({ match: line, emit: line }),
  });

describe('#1356 — the shared rows actually catch things', () => {
  it('a correct gate has no faults', () => {
    expect(sequenceGateFaults(good)).toEqual([]);
  });

  it('catches a gate that does nothing at all', () => {
    const faults = sequenceGateFaults((_u, lines) => ({ lines, restored: [] }));
    expect(faults.length).toBeGreaterThan(0);
    expect(faults.join(' ')).toMatch(/was not restored/);
  });

  it('catches a gate that restores but does not log', () => {
    const faults = sequenceGateFaults((u, lines) => ({ lines: good(u, lines).lines, restored: [] }));
    expect(faults.join(' ')).toMatch(/not logged/);
  });

  it('catches a gate that rewrites a REVERSAL — the same statement read backwards', () => {
    // «BDA» is «ADB» read from the other end. A gate that "corrects" it is inventing a difference.
    const overEager: SequenceGate = (_u, lines) => ({
      lines: lines.map((l) => l.replace(/BDA/g, 'ADB')),
      restored: ['BDA→ADB'],
    });
    expect(sequenceGateFaults(overEager).join(' ')).toMatch(/reversed run was wrongly rewritten|reversal was logged/);
  });

  it('catches a gate that rewrites an UNSTATED run — restoring must never invent', () => {
    const faults = sequenceGateFaults((_u, lines) => ({
      lines: lines.map((l) => l.replace(/ABD/g, 'ADB')),
      restored: ['ABD→ADB'],
    }));
    expect(faults.join(' ')).toMatch(/unstated run was altered|logged as restored/);
  });

  it('catches a gate that chooses a spelling when the student was AMBIGUOUS', () => {
    const faults = sequenceGateFaults((_u, lines) => ({
      lines: lines.map((l) => l.replace(/ABD/g, 'ADB')),
      restored: ['ABD→ADB'],
    }));
    expect(faults.join(' ')).toMatch(/ambiguous key/);
  });

  // NOTE: there is deliberately no "stateful gate" case. Measured: `matchAll` clones the regex and
  // `match` with /g resets `lastIndex`, so a shared global instance cannot skip matches here. A row
  // asserting it could never fail, and a check that cannot fail checks nothing.
});
