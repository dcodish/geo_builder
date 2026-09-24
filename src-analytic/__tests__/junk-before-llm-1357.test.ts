/**
 * #1357 (defect 1), analytic — junk never reaches the paid call.
 *
 * Analytic escalated every `not-handled` refusal (`reachesFallback`, #1251). The seam now also asks the
 * shared POSITIVE test (`shell/llm/constructionSignal.ts`) with this builder's vocabulary, so a sentence
 * with no construction signal keeps the deterministic refusal and costs nothing. `App.tsx` asks the same
 * predicate (ADR-AG-139), so these locks call it rather than reproduce it.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, reachesFallback } from '../app/submit';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const verdictOf = (line: string) => decideSubmit(line, [], 0);

const JUNK = [
  'asdkjh', 'qqqqqqqq', '....', 'aaaa bbbb cccc', 'lorem ipsum dolor sit', 'סתם משהו', 'אבגדהוז', '!!!!',
  'hello there friend', 'שלום מה נשמע', '12345', 'xkcd 42 zz', 'Hello there', 'Lorem Ipsum',
];

describe('#1357 — analytic junk keeps its refusal and never escalates', () => {
  it.each(JUNK)('«%s» is refused not-handled, and the seam does not fire', (u) => {
    const v = verdictOf(u);
    expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
    expect(reachesFallback(v)).toBe(false);
  });

  it.each(['משוואת ישר 1 היא 2x-y+8=0', 'הישר l1 מאונך לישר l2 ועובר דרך (2,3)', 'draw a circle through the origin'])(
    'an analytic sentence the grammar may lack still escalates: «%s»',
    (u) => {
      const v = verdictOf(u);
      if (v.kind === 'refused' && v.error.key === 'not-handled') expect(reachesFallback(v)).toBe(true);
    },
  );

  it('no catalog line, in either language, is below the signal floor', () => {
    const brushed = COMMAND_CATALOG_ANALYTIC.flatMap((c) => [c.he, c.en]).filter(
      (u) => !reachesFallback({ kind: 'refused', error: { key: 'not-handled', detail: u } }),
    );
    expect(brushed).toEqual([]);
  });
});
