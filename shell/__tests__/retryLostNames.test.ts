/**
 * #2231 ([ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — the one retry, on a stub transport.
 * Operator, 2026-10-18: *"Retry once. If K is still missing, keep today's refusal naming K."*
 */
import { describe, expect, it, vi } from 'vitest';
import { askKeepingNames, nameRetryEvent } from '../llm/retryLostNames';

type A = { steps: string[]; busy?: boolean };
const answer = (...steps: string[]): A => ({ steps });
/** The name gate of a stub figure: the student typed K. */
const lost = (a: A) => (a.steps.some((s) => s.includes('K')) ? [] : ['K']);
const usable = (a: A) => !a.busy && a.steps.length > 0;
const transport = (...replies: (A | null | undefined)[]) => {
  const ask = vi.fn(async (_keep?: readonly string[]): Promise<A | null | undefined> => replies.shift());
  return ask;
};

describe('#2231 — askKeepingNames', () => {
  it('no name lost: one call, and the answer goes on', async () => {
    const ask = transport(answer('K here'));
    const out = await askKeepingNames(ask, lost, usable);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBeUndefined();
    expect(out).toEqual({ answer: answer('K here') });
  });

  it('a lost name: a second call that names it, and the recovered answer goes on', async () => {
    const ask = transport(answer('H'), answer('K here'));
    const out = await askKeepingNames(ask, lost, usable);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toEqual(['K']);
    expect(out).toEqual({ answer: answer('K here'), retry: { keep: ['K'], recovered: true } });
  });

  it('the retry loses it too: the SECOND answer goes on (the gates refuse it), and never a third call', async () => {
    const ask = transport(answer('H'), answer('H2'), answer('K here'));
    const out = await askKeepingNames(ask, lost, usable);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ answer: answer('H2'), retry: { keep: ['K'], recovered: false } });
  });

  it.each([
    ['no answer', null],
    ['a stub that returned nothing', undefined],
    ['busy', { steps: [], busy: true }],
    ['empty', { steps: [] }],
  ])('the retry failed (%s): the first answer goes on', async (_name, reply) => {
    const ask = transport(answer('H'), reply);
    const out = await askKeepingNames(ask, lost, usable);
    expect(out).toEqual({ answer: answer('H'), retry: { keep: ['K'], recovered: false } });
  });

  it.each([
    ['no answer', null, null],
    ['busy', { steps: [], busy: true }, { steps: [], busy: true }],
    ['inexpressible', { steps: [] }, { steps: [] }],
  ])('a first answer that is not an answer (%s) is no loss: one call', async (_name, reply, want) => {
    const ask = transport(reply);
    const out = await askKeepingNames(ask, lost, usable);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ answer: want });
  });

  it('at most eight names travel, the proxy\'s bound', async () => {
    const many = 'ABCDEFGHIJ'.split('');
    const ask = transport(answer('x'), answer('K'));
    await askKeepingNames(ask, () => many, usable);
    expect(ask.mock.calls[1][0]).toEqual(many.slice(0, 8));
  });

  it('the log line is an action, so the lean sink carries it', () => {
    expect(nameRetryEvent({ keep: ['K', 'l3'], recovered: false })).toEqual({ kind: 'action', action: 'llm-retry', detail: 'K,l3:lost' });
    expect(nameRetryEvent({ keep: ['K'], recovered: true }).detail).toBe('K:recovered');
  });
});
