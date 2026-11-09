/**
 * #2231 ([ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — analytic's one retry, through `runFallback` with a
 * mocked model (standing rule 2: the session is the oracle, no live call).
 *
 * The operator's report sentences need no model any more («MK אנך לציר x» is read as the relation, ADR-AG-421; «l3 הוא אנך אמצעי של EK» since
 * #1138), so they are fed to `runFallback` directly: what is locked is the seam, which any sentence the grammar misses
 * reaches. The first model answers are the ones his two reports logged.
 */
import { describe, expect, it, vi } from 'vitest';
import { fallbackRefusal, runFallback } from '../app/fallback';
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

  it('the transport sends contradicted on the retry only (#2680)', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ steps: [] }) };
    }) as unknown as typeof fetch;
    await llmParseAnalytic('u', 'c', { fetchImpl, keep: [], contradicted: [] });
    await llmParseAnalytic('u', 'c', { fetchImpl, contradicted: ['שמוקדה (2,0)'] });
    expect(bodies[0]).not.toHaveProperty('contradicted');
    expect(bodies[0]).not.toHaveProperty('keep');
    expect(bodies[1]).toMatchObject({ contradicted: ['שמוקדה (2,0)'], tool: 'analytic' });
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

/**
 * #2680 ([ADR-AG-450](../../docs/06c-decisions-analytic.md#adr-ag-450), amending ADR-W-189) — THE OPERATOR'S CASE, the
 * regression lock. Operator, 2026-11-06, on «פרבולה שמוקדה (2,0)» answered `y^2 = 4x`: *"We would want the correct to be
 * accepted and wrong not. Or even go back to llm to get the correct one."* The model is mocked (standing rule 2): the
 * session is the oracle, and the first answer is the wrong one the triage measured.
 */
const asks4 = (...replies: (LlmStepsOutcome | null)[]) =>
  vi.fn(async (_u: string, _c: string, _keep?: readonly string[], _wrong?: readonly string[]): Promise<LlmStepsOutcome | null> => replies.shift() ?? null);

describe('#2680 — an answer whose curve contradicts a stated role is asked for once more, naming the statement', () => {
  it('«פרבולה שמוקדה (2,0)»: y^2 = 4x is retried naming «שמוקדה (2,0)», and y^2 = 8x is recorded', async () => {
    const ask = asks4(steps('y^2 = 4x'), steps('y^2 = 8x'));
    const out = await runFallback('פרבולה שמוקדה (2,0)', [], 0, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0]).toHaveLength(2);
    expect(ask.mock.calls[1][3]).toEqual(['שמוקדה (2,0)']);
    expect(out).toMatchObject({ kind: 'lines', lines: ['y^2 = 8x'], retry: { keep: [], contradicted: ['שמוקדה (2,0)'], recovered: true } });
  });

  it('the retry repeats y^2 = 4x: today\'s refusal naming «2», nothing recorded, exactly two calls', async () => {
    const ask = asks4(steps('y^2 = 4x'), steps('y^2 = 4x'), steps('y^2 = 8x'));
    const out = await runFallback('פרבולה שמוקדה (2,0)', [], 0, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['2'], retry: { recovered: false } });
    if (out.kind !== 'unfaithful') throw new Error('expected an unfaithful answer');
    expect(fallbackRefusal(out, 'פרבולה שמוקדה (2,0)', { key: 'not-handled', detail: '' })).toMatchObject({ key: 'llm-dropped', labels: '2' });
  });

  it.each<[string, string, string, string[]]>([
    ['a diameter', 'מעגל שקוטרו 6 ומרכזו (0,0)', 'x^2 + y^2 = 36', ['6']],
    ['two foci', 'אליפסה שמוקדיה (4,0) ו-(-4,0) וצירה הגדול 10', 'x^2/25 + y^2/16 = 1', ['4', '4']],
  ])('%s, contradicted twice, is refused naming its values', async (_name, utterance, answer, dropped) => {
    const ask = asks4(steps(answer), steps(answer));
    const out = await runFallback(utterance, [], 0, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped });
  });

  it('the right answer first: one call, recorded', async () => {
    const ask = asks4(steps('y^2 = 8x'));
    expect(await runFallback('פרבולה שמוקדה (2,0)', [], 0, ask)).toMatchObject({ kind: 'lines', lines: ['y^2 = 8x'] });
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
