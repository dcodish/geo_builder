/**
 * Session logger — the "one PRODUCTION `submit` per user submission" rule.
 *
 * Regression for the dashboard double-row bug: an utterance the grammar parses only
 * partially logs a `weak` diagnostic step and then escalates to the LLM, which logs
 * the FINAL outcome. Both are `kind:'input'`, so before the fix BOTH became analytics
 * `submit` events and the admin dashboard showed two rows (a phantom "weak / dropped"
 * beside the real "llm-built") for one submission. `analyticsSubmit` must count only
 * the final step.
 */

import { describe, it, expect } from 'vitest';
import { analyticsSubmit } from '../sessionLog';

describe('analyticsSubmit — one submit per submission', () => {
  it('ignores the dev-only figure snapshots (not a user action)', () => {
    expect(analyticsSubmit({ kind: 'figure', facts: [] })).toBeNull();
  });

  it('emits a submit for a final parser success (no result → ok)', () => {
    const s = analyticsSubmit({ kind: 'input', utterance: 'ריבוע ABCD', locale: 'he', source: 'parser' });
    expect(s).toMatchObject({ ev: 'submit', source: 'parser', result: 'ok', utterance: 'ריבוע ABCD' });
  });

  it('emits a submit for a final LLM outcome, preserving its result', () => {
    expect(analyticsSubmit({ kind: 'input', source: 'llm', result: 'not-understood' })).toMatchObject({
      ev: 'submit',
      source: 'llm',
      result: 'not-understood',
    });
  });

  it('does NOT emit a submit for an intermediate weak-parse step (the escalated one)', () => {
    expect(
      analyticsSubmit({ kind: 'input', source: 'parser', result: 'weak:dropped:E', intermediate: true }),
    ).toBeNull();
  });

  it('a weak→LLM submission yields exactly ONE submit (the LLM outcome)', () => {
    // The two events one submission logs when the grammar weak-parses then the LLM succeeds.
    const weakStep = { kind: 'input', utterance: 'F ו E על הצלע AB', locale: 'he', source: 'parser', result: 'weak:dropped:F,E', intermediate: true };
    const llmFinal = { kind: 'input', utterance: 'F ו E על הצלע AB', locale: 'he', source: 'llm' };
    const submits = [weakStep, llmFinal].map(analyticsSubmit).filter(Boolean);
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({ source: 'llm', result: 'ok' });
  });
});

describe('analyticsSubmit — issue #84: LLM commands + action events', () => {
  it('includes the LLM committed COMMANDS on an llm submit (so a session reconstructs)', () => {
    const cmds = [{ type: 'triangle', ids: ['A', 'B', 'C'] }];
    const s = analyticsSubmit({ kind: 'input', utterance: 'משהו חופשי', source: 'llm', commands: cmds });
    expect(s).toMatchObject({ ev: 'submit', source: 'llm' });
    expect(typeof s!.commands).toBe('string');
    expect(s!.commands).toContain('triangle');
  });

  it('does NOT attach commands on a PARSER submit (only the opaque llm path needs them)', () => {
    const s = analyticsSubmit({ kind: 'input', utterance: 'ריבוע ABCD', source: 'parser', commands: [{ type: 'square' }] });
    expect(s!.commands).toBeUndefined();
  });

  it('shapes a store ACTION event (edit / slider / show-another / delete)', () => {
    expect(analyticsSubmit({ kind: 'action', action: 'edit', detail: 'g3 → CK=√63' })).toEqual({
      ev: 'action',
      action: 'edit',
      detail: 'g3 → CK=√63',
    });
    expect(analyticsSubmit({ kind: 'action', action: 'show-another', detail: 'seed=4', result: 'changed' })).toEqual({
      ev: 'action',
      action: 'show-another',
      detail: 'seed=4',
      result: 'changed',
    });
  });
});
