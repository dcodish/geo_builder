/**
 * #2890 round 2 ([ADR-3D-493](../../../docs/06b-decisions-3d.md#adr-3d-493); ADR-W-210 invariant 1) — 3-D'S PAGE DOES NOT
 * SOLVE: a job is solved by the worker's heap (here a second module instance, served by the shell's
 * `isolatedExecutor`, every message cloned), the page adopts the figure's journal, runs its own action, and the values
 * follow. The work-meter gate walks every fixture this way; this file locks the mechanism's own rules.
 *
 * pipeline-lock: the check is WHICH HEAP solves (the page's units, derives and resolves are zero; the worker's memo
 * serves a checkpoint), and when the values are marked ready; a fixture or a scenario sees only the figure, which is
 * the same either way. The figures here are inputs to `offPage3`, the module under test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGeo3, clearSolveCaches3, derive3, deriveStats3 } from '../../store/store3';
import { heldJournal3 } from '../../store/journal3';
import { deserializeFigure3 } from '../../store/figureFile3';
import { resolveStats3, freeDofCount3 } from '../../engine/evaluate';
import { dataView } from '../../engine/dataView';
import { readWork } from '../../../shell/workMeter';
import { isolatedExecutor, type Executor } from '../../../shell/workerExecutor';
import { secondInstance } from '../../../shell/__tests__/isolated-ops';
import { offPage3, offPage3Active, offPageAction3, useWork3Executor, values3 } from '../offPage3';
import type { ActArgs3 } from '../ops3';

const FIX = join(__dirname, '..', '..', '..', 'fixtures3');
const text = (name: string): string => readFileSync(join(FIX, `${name}.geo3.json`), 'utf8');

const workerHeap = () =>
  secondInstance(async () => {
    const { ops3, takeCheckpoint3 } = await import('../ops3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const store = await import('../../store/store3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { readWork: units } = await import('../../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    return { ops: ops3(), store, units: () => units().total, seed: takeCheckpoint3 };
  });
let worker: Awaited<ReturnType<typeof workerHeap>>;
/** What the worker was asked, in order. */
const asked: ActArgs3[] = [];
/** A held answer: the figure part is delivered, the values wait for `release()`. */
let hold: { release: () => void } | null = null;
let holding = false;

beforeAll(async () => {
  worker = await workerHeap();
  const inner = isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed });
  const executor: Executor = {
    run: (lane, op, args, hooks) => {
      asked.push(args as ActArgs3);
      const done = inner.run(lane, op, args, hooks);
      if (!holding) return done;
      return new Promise((resolve, reject) => {
        hold = { release: () => void done.then(resolve, reject) };
      });
    },
    seed: inner.seed,
  };
  useWork3Executor(executor);
});
afterAll(() => useWork3Executor(null));
afterEach(() => {
  holding = false;
  hold = null;
});

/** A fresh session in both heaps, the page's store empty. */
function fresh(): void {
  clearSolveCaches3();
  worker.store.clearSolveCaches3();
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null, lastNotice: null });
  asked.length = 0;
}
/** What the page solved during `run`: units, derives and resolves not answered from a memo. */
async function onPage<T>(run: () => Promise<T>): Promise<{ out: T; units: number; derives: number; resolves: number }> {
  const [p, d, r] = [readWork().page, deriveStats3.uncached, resolveStats3.uncached + resolveStats3.images];
  const out = await run();
  return { out, units: readWork().page - p, derives: deriveStats3.uncached - d, resolves: resolveStats3.uncached + resolveStats3.images - r };
}
/** The page's readers of the figure on screen, as App3 renders it with the panel open. */
function readAll(): string {
  const { facts, seed } = useGeo3.getState();
  const d = derive3(facts, seed);
  return JSON.stringify({ status: d.status, dof: freeDofCount3(d.construction, d.resolved), panel: dataView(d.construction, seed) });
}

describe('#2890 round 2 — a job is solved off the page', () => {
  it('a load and a typed line: the page solves nothing, and reads what the worker read', async () => {
    fresh();
    expect(offPage3Active()).toBe(true);
    const load = await onPage(async () => {
      const h = await offPage3([{ kind: 'open', text: text('pyramid-surd-height-1827') }]);
      const r = deserializeFigure3(text('pyramid-surd-height-1827'));
      if (!r.ok) throw new Error('fixture');
      useGeo3.getState().loadFigure(r.facts, r.seed);
      h.after();
      await h.settled;
      return readAll();
    });
    expect({ units: load.units, derives: load.derives, resolves: load.resolves }).toEqual({ units: 0, derives: 0, resolves: 0 });
    // the same reading as the worker's heap gives of its own figure
    const w = worker.store.useGeo3.getState();
    expect(useGeo3.getState().facts.map((f) => f.id)).toEqual(w.facts.map((f) => f.id)); // the row ids are the page's, in both heaps
  });

  it('a new row takes the id the page drew, in both heaps (it is part of the figure\'s content)', async () => {
    fresh();
    await offPageAction3('submit', ['משולש ABC'], () => useGeo3.getState().submit('משולש ABC'));
    const page = useGeo3.getState().facts.map((f) => f.id);
    expect(page).toHaveLength(1);
    expect(asked[0].ids[0]).toBe(page[0]);
    expect(worker.store.useGeo3.getState().facts.map((f) => f.id)).toEqual(page);
  });

  it('THE VALUES FOLLOW: past the threshold the figure is drawn and the values are pending, then in hand together', async () => {
    fresh();
    holding = true;
    const h = await offPage3([{ kind: 'action', name: 'submit', args: ['ריבוע ABCD'] }], { startedAt: -1_000 }); // the threshold has passed
    useGeo3.getState().submit('ריבוע ABCD');
    h.after();
    const { facts, seed } = useGeo3.getState();
    expect(values3(facts, seed).panel).toBe(false);
    expect(values3(facts, seed).pendingFor).not.toBeNull();
    // the figure is in hand already: drawing it solves nothing on the page
    const fig = await onPage(async () => {
      const d = derive3(facts, seed);
      return freeDofCount3(d.construction, d.resolved);
    });
    expect(fig.units).toBe(0);
    hold!.release();
    await h.settled;
    expect(values3(facts, seed).panel).toBe(true);
    expect(values3(facts, seed).pendingFor).toBeNull();
    expect((await onPage(async () => readAll())).units).toBe(0);
  });

  it('a fast job is drawn whole: values that arrive within the threshold are never pending', async () => {
    fresh();
    const h = await offPage3([{ kind: 'action', name: 'submit', args: ['קובייה ABCDA\'B\'C\'D\''] }]);
    useGeo3.getState().submit("קובייה ABCDA'B'C'D'");
    h.after();
    const { facts, seed } = useGeo3.getState();
    expect(values3(facts, seed)).toMatchObject({ panel: true, pendingFor: null });
  });

  it('values that arrive for a figure the student has left are adopted, and never marked ready for the figure on screen', async () => {
    fresh();
    holding = true;
    const h = await offPage3([{ kind: 'action', name: 'submit', args: ['ריבוע ABCD'] }], { startedAt: -1_000 });
    useGeo3.getState().submit('ריבוע ABCD');
    h.after();
    const left = useGeo3.getState();
    useGeo3.setState({ facts: [], seed: 0 }); // the student moved on
    hold!.release();
    await h.settled;
    expect(values3(useGeo3.getState().facts, 0).panel).toBe(false);
    expect(values3(left.facts, left.seed).panel).toBe(false);
  });

  it('THE BASIS: a job solved for a figure that changed before the page could run its action is posted again', async () => {
    fresh();
    await offPageAction3('submit', ['משולש ABC'], () => useGeo3.getState().submit('משולש ABC'));
    asked.length = 0;
    holding = true;
    const job = offPage3([{ kind: 'action', name: 'toggle', args: [useGeo3.getState().facts[0].id] }]);
    await Promise.resolve();
    useGeo3.setState({ seed: 7 }); // another lane's action committed meanwhile
    hold!.release();
    holding = false;
    const h = await job;
    h.after();
    expect(asked.length).toBe(2);
    expect(asked[1].state.seed).toBe(7);
  });

  it('THE CHECKPOINT: a fresh worker handed the page\'s figure does not solve it again', async () => {
    fresh();
    await offPageAction3('submit', ['ריבוע ABCD'], () => useGeo3.getState().submit('ריבוע ABCD'));
    await offPageAction3('submit', ['קטע AS'], () => useGeo3.getState().submit('קטע AS'));
    const { facts, seed } = useGeo3.getState();
    const checkpoint = heldJournal3(facts, seed);
    expect(checkpoint).not.toBeNull();
    worker.store.clearSolveCaches3(); // the worker was replaced: its caches are gone
    worker.seed(structuredClone(checkpoint));
    const u0 = worker.units();
    const h = await offPage3([]);
    h.after();
    await h.settled;
    expect(worker.units() - u0).toBeLessThan(1); // its figure, its panel: all in the checkpoint
  });
});

describe('#2890 round 2 — where there is no worker, nothing changes', () => {
  it('nothing is posted, and the values are always in hand', async () => {
    useWork3Executor(null);
    try {
      fresh();
      expect(offPage3Active()).toBe(false);
      const h = await offPage3([{ kind: 'line', raw: 'משולש ABC' }]);
      useGeo3.getState().submit('משולש ABC');
      h.after();
      await h.settled;
      expect(asked).toHaveLength(0);
      const { facts, seed } = useGeo3.getState();
      expect(values3(facts, seed)).toMatchObject({ panel: true, pendingFor: null });
    } finally {
      useWork3Executor({ run: (l, o, a, hk) => isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed }).run(l, o, a, hk) });
    }
  });
});
