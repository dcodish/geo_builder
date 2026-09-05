/**
 * #908 — tier membership must not oscillate.
 *
 * `classifySlow`'s two conditions are ratios over the whole distribution, so a file near either
 * boundary flips whenever UNRELATED files move: machine load, cache warmth, a test added elsewhere.
 * Measured 2026-09-05 — three green runs of the same tree produced three different memberships, which
 * destroys the artifact's signal (a session cannot tell a real change from noise) and falsifies the
 * invariant docs/08 states outright: *a routine green run leaves the tree clean*.
 *
 * The load-bearing test here is the FIRST one: the same borderline file, under two plausible run-to-run
 * distributions, must not enter and leave. Everything else guards the properties that fix must not cost
 * — a newly-slow file still joins by itself (ADR-394), and a file that genuinely got fast still leaves.
 *
 * Lives in server/__tests__ for the isolation.test.ts reason: the shared-server tests run in EVERY
 * per-product lane, and this script belongs to no product.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — a .mjs script with no type declarations; the tier tests import it the same way.
import { classifySlow, applyHysteresis } from '../../scripts/test-tiers.mjs';

interface Timed {
  file: string;
  ms: number;
}
const names = (slow: Timed[]): string[] => slow.map((s) => s.file).sort();

/** A suite where `border.test.ts` sits just at the entry bar, and the tail shifts between runs. */
const runA: Timed[] = [
  { file: 'heavy1.test.ts', ms: 10_000 },
  { file: 'heavy2.test.ts', ms: 9_000 },
  { file: 'border.test.ts', ms: 4_000 },
  ...Array.from({ length: 20 }, (_, i) => ({ file: `tail${i}.test.ts`, ms: 200 })),
];
/** Same tree, next run: the tail ran slightly warmer, which moves the mean and the share — not `border`. */
const runB: Timed[] = [
  { file: 'heavy1.test.ts', ms: 10_000 },
  { file: 'heavy2.test.ts', ms: 9_000 },
  { file: 'border.test.ts', ms: 4_000 },
  ...Array.from({ length: 20 }, (_, i) => ({ file: `tail${i}.test.ts`, ms: 700 })),
];

describe('#908 — a borderline file does not flip between runs', () => {
  it('the RAW rule is what oscillates (the defect, stated)', () => {
    const a = names(classifySlow(runA) as Timed[]);
    const b = names(classifySlow(runB) as Timed[]);
    expect(
      a.includes('border.test.ts') !== b.includes('border.test.ts'),
      'the fixture no longer reproduces the oscillation this test exists to pin — pick a border ms ' +
        'that sits at the entry bar under runA and below it under runB',
    ).toBe(true);
  });

  it('WITH hysteresis, a member held from the previous run stays put', () => {
    const prev = names(classifySlow(runA) as Timed[]);
    const next = names(applyHysteresis(classifySlow(runB), prev, runB) as Timed[]);
    expect(next).toEqual(prev);
  });

  it('and it is stable in the other direction too — no flap back', () => {
    const prev = names(applyHysteresis(classifySlow(runB), names(classifySlow(runA) as Timed[]), runB) as Timed[]);
    const next = names(applyHysteresis(classifySlow(runA), prev, runA) as Timed[]);
    expect(next).toEqual(prev);
  });
});

describe('#908 — hysteresis does not cost the properties ADR-394 relies on', () => {
  it('a NEWLY-slow file still joins by itself (entry is unchanged)', () => {
    const before = names(classifySlow(runA) as Timed[]);
    const withNewSlow: Timed[] = [...runA, { file: 'newly-slow.test.ts', ms: 12_000 }];
    const after = names(applyHysteresis(classifySlow(withNewSlow), before, withNewSlow) as Timed[]);
    expect(after).toContain('newly-slow.test.ts');
  });

  it('a file that genuinely got FAST still leaves', () => {
    const prev = names(classifySlow(runA) as Timed[]);
    const sped: Timed[] = runA.map((f) => (f.file === 'border.test.ts' ? { ...f, ms: 200 } : f));
    const after = names(applyHysteresis(classifySlow(sped), prev, sped) as Timed[]);
    expect(after).not.toContain('border.test.ts');
  });

  it('a DELETED file is dropped, never resurrected as a stale path', () => {
    const prev = [...names(classifySlow(runA) as Timed[]), 'deleted.test.ts'];
    const after = names(applyHysteresis(classifySlow(runA), prev, runA) as Timed[]);
    expect(after).not.toContain('deleted.test.ts');
  });

  it('the FIRST run (no previous set) is the raw classification', () => {
    const raw = classifySlow(runA);
    expect(applyHysteresis(raw, [], runA)).toEqual(raw);
  });

  it('an empty or zero-time suite is not a crash', () => {
    expect(applyHysteresis([], ['x.test.ts'], [])).toEqual([]);
    expect(applyHysteresis([], ['x.test.ts'], [{ file: 'z.test.ts', ms: 0 }])).toEqual([]);
  });
});
