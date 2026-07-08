/**
 * 3-D session logger — the "one PRODUCTION `submit` per user submission" rule
 * (the COPIED sibling of `src/debug/__tests__/sessionLog.test.ts`; src3d never
 * imports src/).
 *
 * One 3-D submission can log a `not-understood` PARSER step that then escalates to
 * the LLM, which logs the FINAL outcome. Both are `kind:'input'`; `analyticsSubmit3`
 * must count only the final step, or the /admin3 dashboard double-counts the
 * utterance (a phantom gap beside its real LLM outcome).
 */

import { describe, it, expect } from 'vitest';
import { analyticsSubmit3 } from '../sessionLog3';

describe('analyticsSubmit3 — one submit per submission', () => {
  it('ignores the dev-only figure snapshots (not a user action)', () => {
    expect(analyticsSubmit3({ kind: 'figure', facts: [] })).toBeNull();
  });

  it('emits a submit for a final parser success (no result → ok)', () => {
    const s = analyticsSubmit3({ kind: 'input', utterance: 'קובייה ABCDA׳B׳C׳D׳', locale: 'he', source: 'parser' });
    expect(s).toMatchObject({ ev: 'submit', source: 'parser', result: 'ok', utterance: 'קובייה ABCDA׳B׳C׳D׳' });
  });

  it('emits a submit for a reasoned parser refusal, preserving its code', () => {
    expect(analyticsSubmit3({ kind: 'input', source: 'parser', result: 'oblique-prism' })).toMatchObject({
      ev: 'submit',
      source: 'parser',
      result: 'oblique-prism',
    });
  });

  it('emits a submit for a final LLM outcome, preserving its result', () => {
    expect(analyticsSubmit3({ kind: 'input', source: 'llm', result: 'not-understood' })).toMatchObject({
      ev: 'submit',
      source: 'llm',
      result: 'not-understood',
    });
  });

  it('does NOT emit a submit for the intermediate not-understood step (the escalated one)', () => {
    expect(
      analyticsSubmit3({ kind: 'input', source: 'parser', result: 'not-understood', intermediate: true }),
    ).toBeNull();
  });

  it('a not-understood→LLM submission yields exactly ONE submit (the LLM outcome)', () => {
    const parserStep = { kind: 'input', utterance: 'draw a weird tetrahedron', locale: 'en', source: 'parser', result: 'not-understood', intermediate: true };
    const llmFinal = { kind: 'input', utterance: 'draw a weird tetrahedron', locale: 'en', source: 'llm' };
    const submits = [parserStep, llmFinal].map(analyticsSubmit3).filter(Boolean);
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({ source: 'llm', result: 'ok' });
  });
});
