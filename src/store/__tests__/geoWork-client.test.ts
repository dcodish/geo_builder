/**
 * 2-D's WORKER CLIENT WHERE A `Worker` EXISTS ([ADR-829](../../../docs/06-decisions.md#adr-829), ADR-W-210 Am. 4).
 *
 * vitest has no `Worker`, so every other test of `geoWork` runs its in-process executor. This file gives the module a
 * `Worker` that records what it is sent, and locks what only a browser otherwise exercises:
 *   - both workers are spawned with the page (`startGeoWork`), before any line is typed;
 *   - an operation is one `run` message carrying everything it needs, on its own lane, and the worker's answer
 *     resolves the call; the units it reports join the page's meter as worker work, before the paint on the
 *     interactive lane and after it on the detect lane;
 *   - the search's ✕ terminates the interactive worker, and the worker that replaces it is handed the fold of the
 *     figure on screen BEFORE anything else, so the next line does not fold that figure again in a cold heap;
 *   - a superseded detection sweep costs only the detect worker.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FromWorker, ToWorker } from '../../../shell/workerProtocol';

class FakeWorker {
  static made: FakeWorker[] = [];
  received: ToWorker[] = [];
  terminated = false;
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(message: ToWorker): void {
    this.received.push(structuredClone(message));
  }
  terminate(): void {
    this.terminated = true;
  }
  answer(message: FromWorker): void {
    this.onmessage?.({ data: structuredClone(message) });
  }
  runs(): Extract<ToWorker, { t: 'run' }>[] {
    return this.received.filter((m): m is Extract<ToWorker, { t: 'run' }> => m.t === 'run');
  }
}

describe('2-D’s worker client where a Worker exists', () => {
  let W: typeof import('../geoWork');
  let core: typeof import('@/replay/core');
  let meter: typeof import('../../../shell/workMeter');
  let facts: import('@/replay/core').Fact[];

  beforeAll(async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('document', {});
    vi.resetModules(); // the client reads the environment when a request is made, and this instance is its own page
    W = await import('../geoWork');
    core = await import('@/replay/core');
    meter = await import('../../../shell/workMeter');
    const { factsOf } = await import('../../__tests__/scenario-pipeline');
    facts = factsOf(['משולש ABC', 'M אמצע AB']);
  }, 60_000);
  afterAll(() => vi.unstubAllGlobals());

  it('both workers start with the page, and are sent nothing until there is something to ask', () => {
    expect(FakeWorker.made).toHaveLength(0);
    W.startGeoWork();
    W.startGeoWork();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made.every((w) => w.received.length === 0)).toBe(true);
  });

  it('an operation is one run message on its lane; the answer resolves it and its units are worker work', async () => {
    const [interactive, detect] = FakeWorker.made;
    const m = meter.meterAction();
    const prefold = W.geoWork.prefold(facts, 0);
    expect(interactive.runs()).toHaveLength(1);
    expect(detect.runs()).toHaveLength(0);
    const sent = interactive.runs()[0];
    expect(sent.op).toBe('prefold');
    expect(sent.args).toEqual({ facts, seed: 0 });
    interactive.answer({ t: 'done', id: sent.id, value: null, units: 40 });
    expect(await prefold).toBeNull();
    // the detect lane is background work: its units are counted, and not before the paint
    const sweep = W.geoWork.detect(facts);
    const asked = detect.runs()[0];
    expect(asked.op).toBe('detect');
    expect((asked.args as { facts: unknown }).facts).toEqual(facts);
    expect(asked.args).toHaveProperty('nouns');
    detect.answer({ t: 'done', id: asked.id, value: { relations: [] } as never, units: 7 });
    await sweep;
    expect(m.end()).toEqual({ total: 47, page: 0, prePaint: 40 });
  });

  it('the search’s ✕ replaces the interactive worker, and the new one is handed the fold of the figure on screen first', async () => {
    const [interactive, detect] = FakeWorker.made;
    // the figure on screen: the store reports it, and the page has folded it
    W.supersedeStaleSearches({ facts, seed: 0 });
    core.replay(facts, 0);
    const fold = core.getFoldFor(facts);
    expect(fold, 'the page holds the fold of the figure on screen').not.toBeNull();
    const search = W.geoWork.resample(facts, 0);
    expect(interactive.runs().at(-1)!.op).toBe('resample');
    W.cancelGeoWork();
    await expect(search).rejects.toMatchObject({ cancelled: true });
    expect(W.isCancelled(await search.catch((e: unknown) => e))).toBe(true);
    expect(interactive.terminated).toBe(true);
    expect(detect.terminated, 'the background lane keeps its worker and its caches').toBe(false);
    const replacement = FakeWorker.made[2];
    expect(replacement, 'spawned at once, not at the next line').toBeDefined();
    expect(replacement.received[0]).toEqual({ t: 'seed', args: { facts, fold } });
    // and the next line's request goes to it
    const next = W.geoWork.prefold(facts, 0);
    expect(replacement.runs()).toHaveLength(1);
    replacement.answer({ t: 'done', id: replacement.runs()[0].id, value: null, units: 0 });
    await next;
  });

  it('a superseded detection sweep is dropped with its worker; the interactive lane is not touched', async () => {
    const detect = FakeWorker.made[1];
    const interactive = FakeWorker.made[2];
    const first = W.geoWork.detect(facts);
    const other = [...facts];
    const second = W.geoWork.detect(other);
    await expect(first).rejects.toMatchObject({ cancelled: true });
    expect(detect.terminated).toBe(true);
    expect(interactive.terminated).toBe(false);
    const replacement = FakeWorker.made[3];
    const asked = replacement.runs()[0];
    expect((asked.args as { facts: unknown }).facts).toEqual(other);
    replacement.answer({ t: 'done', id: asked.id, value: { relations: [] } as never, units: 0 });
    await second;
  });
});
