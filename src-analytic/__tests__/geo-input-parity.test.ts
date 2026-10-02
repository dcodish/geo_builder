/**
 * #1649 (ADR-W-108) — analytic's thin lock on the cross-product geometry-input parity rows
 * (`shell/__tests__/fixtures/geo-input-parity.ts`, docs/28 §5c).
 *
 * For plane geometry 2-D's verdict is the reference (operator ruling 2026-10-02: «analytics and 2d should
 * have same user experience»). Each row's `expect` is 2-D's verdict, asserted by 2-D's own thin lock; this
 * lock asserts analytic gives the same one, so the two agree. A known gap must still differ — a fix that
 * closes one fails here until the row moves to the parity rows.
 *
 * The runner is `decideSubmit`, the function `App.tsx` dispatches; a `record` appends the line, as the
 * store does. `not-handled` is the one refusal `reachesFallback` hands to the model — never called here.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import {
  catalogCoverageFaults,
  parityFaults,
  type StepRunner,
  type StepVerdict,
} from '../../shell/__tests__/fixtures/geo-input-parity';

/** One submit verdict, in the rows' vocabulary. An `ambiguous-*` refusal is a question to the student. */
function verdictOfAnalytic(v: SubmitVerdict): StepVerdict {
  switch (v.kind) {
    case 'record':
      return { verdict: 'builds' };
    case 'already-known':
    case 'already-follows':
      return { verdict: 'builds', code: v.kind };
    case 'refused':
      if (v.error.key === 'not-handled') return { verdict: 'not-handled' };
      return { verdict: /^ambiguous/.test(v.error.key) ? 'asks' : 'refused', code: v.error.key };
    case 'teach':
      return { verdict: 'asks', code: 'teach' };
    case 'ignored':
      return { verdict: 'refused', code: 'ignored' };
    case 'rename':
    case 'swap':
      return { verdict: 'builds', code: v.kind };
  }
}

const runAnalytic: StepRunner = (steps) => {
  const lines: string[] = [];
  return steps.map((line) => {
    const v = decideSubmit(line, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    return verdictOfAnalytic(v);
  });
};

describe('#1649 — analytic gives 2-D’s verdict on every plane-geometry parity row', () => {
  it('every row through decideSubmit', async () => {
    expect(await parityFaults({ analytic: runAnalytic })).toEqual([]);
  }, 120_000);

  it('every construction sentence of the analytic catalog is a parity step, a topic exception, or on the shrinking allowlist', () => {
    const sentences = COMMAND_CATALOG_ANALYTIC.filter((e) => e.lane !== 'rewrite').map((e) => e.he);
    expect(catalogCoverageFaults('analytic', sentences)).toEqual([]);
  });
});
