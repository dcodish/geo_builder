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

describe('#182 — the sink carries what a session replay needs (the 2-D #84/#189 mirror)', () => {
  it('an LLM submit carries the committed canonical LINES as `commands` (capped JSON)', () => {
    const s = analyticsSubmit3({ kind: 'input', utterance: 'freeform', locale: 'he', source: 'llm', commands: ['קוביה ABCDA\'B\'C\'D\'', 'M אמצע AB'] });
    expect(s).toMatchObject({ ev: 'submit', source: 'llm', result: 'ok' });
    expect(JSON.parse((s as { commands: string }).commands)).toEqual(['קוביה ABCDA\'B\'C\'D\'', 'M אמצע AB']);
  });

  it('a parser submit never carries `commands` (grammar steps replay from the utterance itself)', () => {
    const s = analyticsSubmit3({ kind: 'input', utterance: 'קוביה', locale: 'he', source: 'parser', commands: ['x'] });
    expect(s && 'commands' in s).toBe(false);
  });

  it('an LLM submit with NO steps (null) carries no `commands` field', () => {
    const s = analyticsSubmit3({ kind: 'input', utterance: 'freeform', locale: 'he', source: 'llm', commands: null, result: 'not-understood' });
    expect(s && 'commands' in s).toBe(false);
  });

  it('a store interaction emits one lean `action` line', () => {
    expect(analyticsSubmit3({ kind: 'action', action: 'delete', detail: 'f3' })).toEqual({ ev: 'action', action: 'delete', detail: 'f3' });
    expect(analyticsSubmit3({ kind: 'action', action: 'show-another' })).toEqual({ ev: 'action', action: 'show-another' });
    for (const action of ['undo', 'redo', 'clear', 'load']) expect(analyticsSubmit3({ kind: 'action', action })).toEqual({ ev: 'action', action });
  });
});
