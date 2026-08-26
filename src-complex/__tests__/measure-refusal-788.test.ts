/**
 * #788 — A VIOLATED MEASURE GIVEN REACHES THE REFUSAL SURFACES.
 *
 * The operator's report (2026-08-26): «z1 = 3+4i» · «z2 = 3» · «אורך z1z2 = 99» — a length no
 * configuration can satisfy — was ACCEPTED, listed as an ordinary fact row, absent from the
 * always-visible strip, its ✗ visible only in the opt-in data panel. 2-D refuses the same class at
 * submit (ADR-417).
 *
 * Root cause: stage 3e computed the verdict but `unsatisfied` was filtered to `deferred-*`
 * residuals, and both the strip and ADR-CX-023's acceptance gate read `unsatisfied`. The fix sends
 * violated measures through that channel — the #690 filter precedent, same sentence, same
 * chokepoint.
 */
import { describe, expect, it } from 'vitest';

import { acceptLine } from '../app/submit';
import { deriveLines } from '../app/deriveLines';

describe('#788 — the operator’s exact sequence', () => {
  it('the gate REFUSES the impossible length, next to the input like 2-D (ADR-417)', () => {
    const verdict = acceptLine(['z1 = 3+4i', 'z2 = 3'], 'אורך z1z2 = 99', 0);
    expect(verdict.ok).toBe(false);
  });

  it('arriving already-violated (the load path), the given is on the STRIP channel, not only the panel', () => {
    // deriveLines is pure and ungated, which is exactly how a saved file replays
    const d = deriveLines(['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 99'], 0, 0);
    expect(d.measures[0].status).toBe('violated'); // the panel verdict is unchanged…
    expect(d.unsatisfied).toContain('אורך z1z2 = 99'); // …and the refusal surface now carries it too
  });

  it('the English mirror refuses the same way', () => {
    expect(acceptLine(['z1 = 3+4i', 'z2 = 3'], 'length z1z2 = 99', 0).ok).toBe(false);
  });
});

describe('#788 — what must NOT change', () => {
  it('a measure that can DRIVE still drives: accepted, holds, nothing unsatisfied', () => {
    const lines = ['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2 = 6'];
    expect(acceptLine(lines.slice(0, 3), lines[3], 0).ok).toBe(true);
    const d = deriveLines(lines, 0, 0);
    expect(d.measures[0].status).toBe('holds');
    expect(d.unsatisfied).toEqual([]);
  });

  it('a TRUE measure on a determined figure is accepted and satisfied', () => {
    const lines = ['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 4'];
    expect(acceptLine(lines.slice(0, 2), lines[2], 0).ok).toBe(true);
    const d = deriveLines(lines, 0, 0);
    expect(d.measures[0].status).toBe('holds');
    expect(d.unsatisfied).toEqual([]);
  });
});
