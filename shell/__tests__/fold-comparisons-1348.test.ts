/** #1348 (ADR-W-095) — the typed comparison is recorded as its mathematical symbol. */
import { describe, expect, it } from 'vitest';
import { foldComparisons, ingestTypedText } from '../bidi';

describe('#1348 — foldComparisons', () => {
  it.each([
    ['BC>=10', 'BC≥10'],
    ['BC >= 10', 'BC ≥ 10'],
    ['∠ABC <= 40', '∠ABC ≤ 40'],
    ['k>=3 and m<=2', 'k≥3 and m≤2'],
  ])('«%s» → «%s»', (a, b) => expect(foldComparisons(a)).toBe(b));

  it.each(['A <=> B', 'x >== 3', 'a =<= b', 'x => y', 'BC ≥ 10', 'x < 3', 'x > 3'])('«%s» is left alone', (u) => {
    expect(foldComparisons(u)).toBe(u);
  });

  it('the ingest strips format controls AND folds', () => {
    expect(ingestTypedText('⁦BC⁩ >= 10')).toBe('BC ≥ 10');
  });
});
