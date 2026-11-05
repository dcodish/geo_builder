/**
 * #2231 ([ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — analytic's one retry, through `runFallback` with a
 * mocked model (standing rule 2: the session is the oracle, no live call).
 *
 * The operator's report sentences need no model any more («MK אנך לציר x» is read, ADR-AG-410; «l3 הוא אנך אמצעי של EK» since
 * #1138), so they are fed to `runFallback` directly: what is locked is the seam, which any sentence the grammar misses
 * reaches. The first model answers are the ones his two reports logged.
 */
import { describe, expect, it, vi } from 'vitest';
import { runFallback } from '../app/fallback';
import { llmParseAnalytic, type LlmStepsOutcome } from '../parser/llmAnalytic';

const asks = (...replies: (LlmStepsOutcome | null)[]) =>
  vi.fn(async (_u: string, _c: string, _keep?: readonly string[]): Promise<LlmStepsOutcome | null> => replies.shift() ?? null);
const steps = (...lines: string[]): LlmStepsOutcome => ({ steps: lines });

describe('#2231 — an answer that loses a typed name is asked for once more', () => {
  it('«MK אנך לציר x»: the first answer drops K, the second keeps it, and K is recorded', async () => {
    const ask = asks(steps('האנך מהנקודה M לציר ה-x'), steps('K רגל האנך מ-M לציר ה-x'));
    const out = await runFallback('MK אנך לציר x', ['M(3,4)'], 0, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0]).toHaveLength(2);
    expect(ask.mock.calls[1][2]).toEqual(['K']);
    expect(out).toMatchObject({ kind: 'lines', lines: ['K רגל האנך מ-M לציר ה-x'], retry: { keep: ['K'], recovered: true } });
  });

  it('both answers drop K: today\'s refusal naming K, nothing recorded, two calls', async () => {
    const ask = asks(steps('האנך מהנקודה M לציר ה-x'), steps('האנך מהנקודה M לציר ה-x'), steps('K רגל האנך מ-M לציר ה-x'));
    const out = await runFallback('MK אנך לציר x', ['M(3,4)'], 0, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['K'], retry: { keep: ['K'], recovered: false } });
  });

  it('a LINE name is a name: «l3 הוא אנך אמצעי של EK» answered without l3 retries with keep l3', async () => {
    const ask = asks(steps('אנך אמצעי ל-EK'), steps('l3 אנך אמצעי ל-EK'));
    const out = await runFallback('l3 הוא אנך אמצעי של EK', ['E(1,1)', 'K(3,3)'], 0, ask);
    expect(ask.mock.calls[1][2]).toEqual(['l3']);
    expect(out).toMatchObject({ kind: 'lines', lines: ['l3 אנך אמצעי ל-EK'] });
  });

  it('the retry failed: the first answer meets the gates, and K is named', async () => {
    const out = await runFallback('MK אנך לציר x', ['M(3,4)'], 0, asks(steps('האנך מהנקודה M לציר ה-x'), null));
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['K'], retry: { keep: ['K'], recovered: false } });
  });

  it('a lost NUMBER never retries: one call, today\'s refusal', async () => {
    const ask = asks(steps('מעגל O'), steps('מעגל O ברדיוס 7'));
    const out = await runFallback('מעגל O שמשהו 7', [], 0, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['7'] });
    expect(out.retry).toBeUndefined();
  });

  it('a faithful answer, a throttle and an empty answer: one call each', async () => {
    const fine = asks(steps('K רגל האנך מ-M לציר ה-x'));
    expect((await runFallback('MK אנך לציר x', ['M(3,4)'], 0, fine)).kind).toBe('lines');
    const busy = asks({ steps: [], busy: 'rate-limited' });
    expect((await runFallback('MK אנך לציר x', ['M(3,4)'], 0, busy)).kind).toBe('busy');
    const none = asks(steps());
    expect((await runFallback('MK אנך לציר x', ['M(3,4)'], 0, none)).kind).toBe('none');
    for (const ask of [fine, busy, none]) expect(ask).toHaveBeenCalledTimes(1);
  });

  it('the transport sends keep on the retry only', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ steps: [] }) };
    }) as unknown as typeof fetch;
    await llmParseAnalytic('u', 'c', { fetchImpl });
    await llmParseAnalytic('u', 'c', { fetchImpl, keep: ['K'] });
    expect(bodies[0]).not.toHaveProperty('keep');
    expect(bodies[1]).toMatchObject({ keep: ['K'], tool: 'analytic' });
  });
});
