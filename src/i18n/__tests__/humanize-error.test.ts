import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';

// Use the real configured i18n instance (Hebrew-pinned, as the app runs) so the test
// exercises the actual key → message resolution, not a stub.
const t: Translate = (k, o) => i18n.t(k, o) as string;

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * Every CURRENT engine error shape (catalogued from evaluate.ts / step.ts / geoStore.ts)
 * must humanise to a Hebrew message that still carries its dynamic data. If a new error
 * site is added to the engine, add its raw shape here so coverage stays complete.
 */
const CASES: { raw: string; contains: string[] }[] = [
  // step.ts danglingCircleError (#186) — a reference to a circle that doesn't exist
  { raw: "circle 'O2' is not defined", contains: ['O2'] },
  { raw: 'unresolved dependencies for: A, B, circle-O', contains: ['A, B, circle-O'] },
  { raw: 'non-finite position computed', contains: [] },
  { raw: '|AB| = |AD| references an unknown point', contains: ['|AB| = |AD|'] },
  { raw: 'over-constrained: |AC| = 9 cannot hold', contains: ['|AC| = 9'] },
  { raw: 'over-constrained: ∠DOE = 2·∠COE cannot hold', contains: ['∠DOE = 2·∠COE'] },
  { raw: 'cannot place F on segment AB so that |AC| = 9', contains: ['F', 'AB', '|AC| = 9'] },
  {
    raw: 'cannot place E: line line-CA is tangent to circle circle-O at A — it has no second crossing to extend onto',
    contains: ['E'],
  },
  { raw: 'cannot place E: B is at the centre of circle-O', contains: ['E', 'B'] },
  { raw: 'cannot take a tangent at the centre of circle-O', contains: ['circle-O'] },
  { raw: 'cannot construct A: circles circle-O and circle-P do not meet', contains: ['A', 'circle-O', 'circle-P'] },
  { raw: 'C and E would be at the same point', contains: ['C', 'E'] },
  { raw: "'O' is already defined — it can't be redefined as something different", contains: ['O'] },
  { raw: 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)', contains: [] },
  { raw: "can't build: D is no longer available (an earlier step it relies on was removed or failed)", contains: ['D'] },
  // step.ts degenerateConstraintError (ADR-202 + Am.) — the whole NaN-by-id class
  { raw: '⟂ needs two distinct points on each side — "BB" is a single point, not a segment', contains: ['⟂', 'BB'] },
  { raw: '∥ needs two distinct points on each side — "CC" is a single point, not a segment', contains: ['∥', 'CC'] },
  { raw: 'an angle needs three distinct points — "∠ABB" repeats its vertex', contains: ['∠ABB'] },
  { raw: 'collinear points must be distinct — "A" is named twice', contains: ['A'] },
];

describe('humanizeError', () => {
  for (const { raw, contains } of CASES) {
    it(`humanises: ${raw.slice(0, 50)}…`, () => {
      const out = humanizeError(raw, t);
      expect(out).not.toBe(raw); // it was actually translated, not passed through
      expect(hasHebrew(out)).toBe(true); // …into Hebrew
      expect(out).not.toContain('errors.'); // the i18n key resolved (no missing-key leak)
      for (const frag of contains) expect(out).toContain(frag); // dynamic data preserved
    });
  }

  it('returns an unrecognised string UNCHANGED (never worse than the raw text)', () => {
    const novel = 'some brand-new engine diagnostic we have not mapped yet';
    expect(humanizeError(novel, t)).toBe(novel);
  });

  it('handles null / empty input', () => {
    expect(humanizeError(null, t)).toBe('');
    expect(humanizeError('', t)).toBe('');
  });
});
