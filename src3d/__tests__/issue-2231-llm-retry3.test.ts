/**
 * #2231 ([ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — 3-D's one retry, through `escalate3Flow` with a mocked
 * model (standing rule 2), then the store's own decision on what came back: a label still lost is `dropped-given`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escalate3Flow } from '../app/escalate3Flow';
import { escalate3 } from '../parser/llm3';
import { decideSteps3, decideSubmit3, type Fact3 } from '../store/store3';

const figure = () => {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
  for (const line of ['A(0,0,0)', 'B(4,0,0)', 'M(1,3,0)']) {
    const v = decideSubmit3(st, line);
    if (v.kind !== 'record') throw new Error(`«${line}»: ${v.kind}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
};
const asks = (...replies: (string[] | null)[]) =>
  vi.fn(async (_u: string, _c: string, _keep?: readonly string[]): Promise<string[] | null> => replies.shift() ?? null);

const RAW = 'K היא הנקודה הכי קרובה ל-M על AB';

describe('#2231 — 3-D asks once more when the answer loses a typed label', () => {
  it('the first answer drops K, the second keeps it, and the step records', async () => {
    const ask = asks(['N(1,0,0)'], ['K(1,0,0)']);
    const st = figure();
    const out = await escalate3Flow(st, RAW, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][2]).toEqual(['K']);
    expect(out).toMatchObject({ steps: ['K(1,0,0)'], retry: { keep: ['K'], recovered: true } });
    expect(decideSteps3(st, RAW, out.steps!).kind).toBe('record');
  });

  it('both answers drop K: `dropped-given` naming K, two calls', async () => {
    const ask = asks(['N(1,0,0)'], ['N(1,0,0)'], ['K(1,0,0)']);
    const st = figure();
    const out = await escalate3Flow(st, RAW, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out.retry).toEqual({ keep: ['K'], recovered: false });
    const v = decideSteps3(st, RAW, out.steps!);
    expect(v).toMatchObject({ kind: 'refused', error: { code: 'dropped-given' } });
    expect(JSON.stringify(v)).toContain('K');
  });

  it('an answer that loses only a stated number: one call, the battery refuses it', async () => {
    const ask = asks(['AB = 4'], ['AB = 5']);
    const st = figure();
    const out = await escalate3Flow(st, 'AB הוא בדיוק 5 יחידות', ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(out.retry).toBeUndefined();
  });

  it('no answer: one call, no steps', async () => {
    const ask = asks(null);
    expect(await escalate3Flow(figure(), RAW, ask)).toEqual({ steps: null, restored: [] });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('the sequence gate still restores the student\'s run', async () => {
    const st = figure();
    const out = await escalate3Flow(st, 'משולש ABM', asks(['משולש AMB']));
    expect(out.steps).toEqual(['משולש ABM']);
  });
});

describe('#2231 — the transport sends keep on the retry only', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keep rides the body', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ steps: ['K(1,0,0)'] }) };
    });
    await escalate3('u', 'c');
    await escalate3('u', 'c', ['K']);
    expect(bodies[0]).not.toHaveProperty('keep');
    expect(bodies[1]).toMatchObject({ keep: ['K'], tool: '3d' });
  });
});
