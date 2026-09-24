/**
 * #1362 — replaying a PRODUCTION analytic session through the App's real `decideSubmit`, so
 * `/log-triage` can tell a live gap from one already fixed. The rows are the event shapes the sink
 * really writes (`analyticsSubmitAnalytic`), including the one measured on prod 2026-09-23: a session
 * that is mostly `load` actions.
 */
import { describe, expect, it } from 'vitest';
import { replayAnalyticSession, type LoggedEvent } from '../app/triageReplay';

const submit = (utterance: string, source = 'parser', result = 'record', commands?: string): LoggedEvent => ({
  ev: 'submit',
  utterance,
  source,
  result,
  ...(commands ? { commands } : {}),
});
const action = (a: string, detail?: string): LoggedEvent => ({ ev: 'action', action: a, ...(detail !== undefined ? { detail } : {}) });

describe('#1362 — the replay threads the session forward through decideSubmit', () => {
  it('a line that builds is `built`, and the next line sees it', () => {
    const out = replayAnalyticSession([submit('נקודה A (1,2)'), submit('נקודה B (4,6)'), submit('קטע AB')]);
    expect(out.map((o) => o.now)).toEqual(['built', 'built', 'built']);
    expect(out.every((o) => !o.degraded)).toBe(true);
  });

  it('a line the grammar does not know is a LIVE gap (`not-handled`)', () => {
    const out = replayAnalyticSession([submit('זה בכלל לא משפט גאומטרי קלקלקל', 'parser', 'not-handled')]);
    expect(out[0].now).toBe('not-handled');
  });

  it('an LLM step is judged on OUR grammar, and its committed lines keep the prefix real', () => {
    const out = replayAnalyticSession([
      submit('קלקלקל', 'llm', 'lines', JSON.stringify(['נקודה A (1,2)'])),
      submit('נקודה A (1,2)'), // the model's line is already in the figure → understood, adds nothing
    ]);
    expect(out[0].now).toBe('not-handled');
    expect(out[0].degraded).toBe(false);
    expect(out[1].now).toBe('built-nothing');
  });

  it('clear, undo and delete are FOLLOWED — the prefix stays faithful', () => {
    const out = replayAnalyticSession([
      submit('נקודה A (1,2)'),
      action('delete', 'נקודה A (1,2)'),
      submit('נקודה A (1,2)'), // deleted, so it builds again rather than being already known
      action('clear'),
      submit('נקודה B (4,6)'),
      action('undo'),
    ]);
    expect(out.map((o) => o.now)).toEqual(['built', 'skip', 'built', 'skip', 'built', 'skip']);
    expect(out.some((o) => o.degraded)).toBe(false);
  });

  it('a LOAD cannot be followed (the event carries only a count) — the rest of the session is degraded', () => {
    const out = replayAnalyticSession([action('load', '13 lines'), submit('DMCE מקבילית', 'llm', 'lines')]);
    expect(out[1].degraded).toBe(true);
  });

  it('an LLM step with no logged lines degrades too, rather than pretending the figure advanced', () => {
    const out = replayAnalyticSession([submit('קלקלקל', 'llm', 'lines'), submit('נקודה A (1,2)')]);
    expect(out[1].degraded).toBe(true);
  });

  it('a session over budget reports `unverified`, never a silent drop', () => {
    const out = replayAnalyticSession([submit('נקודה A (1,2)'), submit('נקודה B (4,6)')], -1);
    expect(out.map((o) => o.now)).toEqual(['unverified', 'unverified']);
  });
});
