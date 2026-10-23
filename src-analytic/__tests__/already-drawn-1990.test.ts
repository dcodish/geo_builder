/**
 * #1990 (ADR-AG-330, ADR-W-152; operator ruling 2026-10-10, option A) — analytic's two no-op notes are 2-D's sentence,
 * `suite.notice.alreadyDrawn`: a restated line (`already-known`, was «זה כבר ידוע מהנתונים שכתבתם…») and a line the
 * figure already satisfies in every configuration (`already-follows`, was «זה כבר נובע מהנתונים שכתבתם…»), which is
 * 2-D's `implied-restatement` and answers the same sentence there. The shared assertions:
 * `shell/__tests__/fixtures/already-drawn-1990.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyticI18n } from '../i18n';
import { decideSubmit } from '../app/submit';
import { lockAlreadyDrawn, RULED_ALREADY_DRAWN } from '../../shell/__tests__/fixtures/already-drawn-1990';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe("#1990 — analytic's no-op verdicts, and the one note they are worded with", () => {
  it.each([
    [['ריבוע ABCD'], 'ריבוע ABCD', 'already-known'],
    [['ריבוע ABCD'], 'מרובע ADCB', 'already-known'],
    [['משולש ABC', '∠ABC = 90'], 'AB ⟂ BC', 'already-known'],
    [['A(0,0)', 'B(4,0)', 'AB'], 'AB = 4', 'already-follows'],
  ])('%j · «%s» → %s', (lines, line, kind) => {
    expect(decideSubmit(line, lines, 0).kind).toBe(kind);
  });

  it('both verdicts take the one branch that reads the suite key', () => {
    const at = app.indexOf("case 'already-known':");
    expect(at).toBeGreaterThan(0);
    const branch = app.slice(at, app.indexOf('return sentenceOutcome(verdict);', at));
    expect(branch).toContain("case 'already-follows':");
    expect(branch).toContain(`t('${RULED_ALREADY_DRAWN.key}')`);
  });
});

lockAlreadyDrawn('analytic', (lng) => analyticI18n.getFixedT(lng)(RULED_ALREADY_DRAWN.key) as string, app);
