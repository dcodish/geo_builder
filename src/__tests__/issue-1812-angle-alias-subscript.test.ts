/**
 * #1812 (ADR-782, ADR-AG-394) — 2-D's half of "Both show A₁" (operator ruling 2026-10-06): an angle alias is written
 * on its wedge as the book writes it, «A₁», replacing #263's bare digit. Analytic's half, over the same sentences, is
 * `src-analytic/__tests__/issue-1812-angle-label-subscript.test.ts` (product trees never import each other).
 */
import { describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';

describe('#1812 — 2-D writes «A₁», as analytic does', () => {
  it.each([
    ['נסמן ∠CAB=A1', 'A₁'],
    ['נסמן זוית CAB כ-A1', 'A₁'],
    ['נסמן זוית CAB כ 1', 'A₁'],
    ['נסמן זוית ABC כ-B2', 'B₂'],
  ])('«%s» → «%s»', (line, shown) => {
    const fig = replayFacts(factsOf(['משולש ABC', line] as never));
    expect(fig.labels.angles.map((a) => a.text)).toEqual([shown]);
  });
});
