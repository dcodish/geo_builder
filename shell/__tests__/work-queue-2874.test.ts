/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — THE WORK QUEUE.
 *
 * The claims of `shell/work`, each as a lock: a job is counted from the moment it is asked for; an
 * interactive job runs only after a paint and stays counted until the paint after its work; jobs of one
 * lane run one at a time in the order asked; the count is released when a job THROWS; work a job joined
 * belongs to it; a lane is counted on its own; the basis stamp is read when the job's turn starts (#2890); and the
 * basis guard reports a figure that changed outside a job.
 */
import { describe, expect, it } from 'vitest';
import { INTERACTIVE, createWorkQueue, queuedActions, watchBasis, type Paint, type WorkQueue } from '../work';

/** A paint the test releases by hand, and a log of when each was asked for. */
function gatedPaint() {
  const waiting: (() => void)[] = [];
  const paint: Paint = () => new Promise<void>((resolve) => waiting.push(resolve));
  return {
    paint,
    pending: () => waiting.length,
    /** Let the oldest waiting paint through, and let the queue run on it. */
    release: async () => {
      waiting.shift()?.();
      await settle();
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('#2874 — the working state is derived from the queue', () => {
  it('a job is counted at once, before its work has started', async () => {
    const gate = gatedPaint();
    const q = createWorkQueue({ paint: gate.paint });
    expect(q.working()).toBe(false);
    let ran = false;
    const done = q.run(() => {
      ran = true;
    });
    expect(q.working(), 'working from the action itself').toBe(true);
    expect(ran).toBe(false);
    await settle();
    expect(ran, 'the work waits for the paint').toBe(false);
    await gate.release(); // the paint that shows the indicator
    expect(ran, 'the work runs after the paint').toBe(true);
    expect(q.working(), 'still working: the result has not been painted').toBe(true);
    await gate.release(); // the paint that shows the result
    await done;
    expect(q.working()).toBe(false);
  });

  it('with no paint to wait for (node, the suite) a job is one promise', async () => {
    const q = createWorkQueue();
    const out = await q.run(() => 7);
    expect(out).toBe(7);
    expect(q.working()).toBe(false);
  });

  it('subscribers hear every change, and the snapshot they read is already current', async () => {
    const q = createWorkQueue();
    const seen: boolean[] = [];
    const off = q.subscribe(() => seen.push(q.working()));
    await q.run(() => {});
    off();
    await q.run(() => {});
    expect(seen).toEqual([true, false]);
  });
});

describe('#2874 — one job at a time, in the order asked', () => {
  it('interactive jobs never overlap, and run first-asked first', async () => {
    const q = createWorkQueue();
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`${name}+`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name}-`);
    };
    await Promise.all([q.run(job('a', 15)), q.run(job('b', 1)), q.run(job('c', 5))]);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-', 'c+', 'c-']);
  });

  it('the count covers the jobs still waiting their turn', async () => {
    const q = createWorkQueue();
    let release!: () => void;
    const first = q.run(() => new Promise<void>((r) => (release = r)));
    const second = q.run(() => {});
    await settle();
    expect(q.working()).toBe(true);
    release();
    await first;
    await second;
    expect(q.working()).toBe(false);
  });

  it('runIfIdle takes nothing while the lane works (Enter is off, ADR-W-198)', async () => {
    const q = createWorkQueue();
    let release!: () => void;
    const first = q.run(() => new Promise<void>((r) => (release = r)));
    let ran = false;
    expect(q.runIfIdle(() => (ran = true))).toBeNull();
    await settle();
    release();
    await first;
    await q.idle();
    expect(ran, 'the refused job was never queued').toBe(false);
    await q.runIfIdle(() => (ran = true));
    expect(ran).toBe(true);
  });

  it('a lane is counted on its own and does not hold the interactive lane', async () => {
    const q = createWorkQueue();
    let release!: () => void;
    const search = q.run(() => new Promise<void>((r) => (release = r)), { lane: 'another' });
    await settle();
    expect(q.working('another')).toBe(true);
    expect(q.working(), 'the interactive lane is idle').toBe(false);
    expect(await q.run(() => 'ran beside it')).toBe('ran beside it');
    release();
    await search;
    expect(q.working('another')).toBe(false);
  });

  it('a wait nested inside a painted job is counted with no paint of its own', async () => {
    const gate = gatedPaint();
    const q = createWorkQueue({ paint: gate.paint });
    let during = false;
    const answer = await q.run(
      () => {
        during = q.working('model');
        return 'model answer';
      },
      { lane: 'model', paint: false },
    );
    expect(answer).toBe('model answer');
    expect(during, 'counted while it runs').toBe(true);
    expect(q.working('model')).toBe(false);
    expect(gate.pending(), 'no paint was asked for').toBe(0);
  });
});

describe('#2874 — the count is released in a finally', () => {
  it('a job that throws rejects, leaves the queue idle, and the next job runs', async () => {
    const q = createWorkQueue();
    await expect(
      q.run(() => {
        throw new Error('the prefold rejected');
      }),
    ).rejects.toThrow('the prefold rejected');
    expect(q.working(), 'not left working').toBe(false);
    expect(q.inJob()).toBe(false);
    expect(await q.run(() => 'next')).toBe('next');
  });

  it('a job that rejects asynchronously is released too, after its closing paint', async () => {
    const gate = gatedPaint();
    const q = createWorkQueue({ paint: gate.paint });
    const done = q.run(async () => {
      await Promise.resolve();
      throw new Error('late');
    });
    done.catch(() => {});
    await settle();
    await gate.release();
    expect(q.working(), 'held until the paint that follows').toBe(true);
    await gate.release();
    await expect(done).rejects.toThrow('late');
    expect(q.working()).toBe(false);
  });

  it('work a job joined belongs to it: the queue stays working until it settles', async () => {
    const q = createWorkQueue();
    let finishSearch!: () => void;
    const search = new Promise<void>((r) => (finishSearch = r));
    let returned = false;
    const done = q.run((job) => {
      void job.join(search); // started, not awaited — the post-commit search
      returned = true;
    });
    await settle();
    expect(returned).toBe(true);
    expect(q.working(), 'the job is not finished while the search runs').toBe(true);
    expect(q.inJob()).toBe(true);
    finishSearch();
    await done;
    expect(q.working()).toBe(false);
  });

  it('a joined rejection rejects the job and still releases it', async () => {
    const q = createWorkQueue();
    await expect(q.run((job) => void job.join(Promise.reject(new Error('search failed'))))).rejects.toThrow('search failed');
    expect(q.working()).toBe(false);
  });
});

describe('#2874 — the basis stamp and the basis guard', () => {
  // #2890 (ADR-W-210 Am. 4): the stamp is read when the job's TURN starts. Read when the job was asked for, as phase 1
  // built it, every job that waited its turn behind another looked stale, though it acts on the figure as it then is.
  it('a job carries the basis it STARTED on: one that waited its turn is not stale, one whose figure moves meanwhile is', async () => {
    let figure = { facts: ['a'], seed: 0 };
    const q = createWorkQueue({ basis: () => figure, sameBasis: (a, b) => a.facts === b.facts && a.seed === b.seed });
    let release!: () => void;
    const first = q.run(() => new Promise<void>((r) => (release = r)));
    const second = q.run((job) => ({ basis: job.basis, stale: job.stale() }));
    const changed = { facts: ['a', 'b'], seed: 0 };
    figure = changed; // the first job changes the figure while the second waits
    await settle();
    release();
    await first;
    expect(await second, 'the second job acts on the figure the first left').toEqual({ basis: changed, stale: false });
    // and a figure that moves on WHILE a job works makes that job's own result stale
    const third = q.run(async (job) => {
      const before = job.stale();
      figure = { facts: ['a', 'b', 'c'], seed: 0 }; // another lane commits meanwhile
      return { before, after: job.stale(), basis: job.basis };
    });
    expect(await third).toEqual({ before: false, after: true, basis: changed });
  });

  it('the guard reports a figure that changed with no job running, and is quiet inside one', async () => {
    const q = createWorkQueue();
    let changed: () => void = () => {};
    const faults: number[] = [];
    const off = watchBasis(
      q,
      (cb) => {
        changed = cb;
        return () => {
          changed = () => {};
        };
      },
      () => faults.push(1),
    );
    await q.run(() => changed());
    expect(faults, 'inside a job').toEqual([]);
    changed();
    expect(faults, 'outside a job').toEqual([1]);
    off();
    changed();
    expect(faults).toEqual([1]);
  });

  it('queuedActions turns the listed store actions into jobs that read the store when they RUN', async () => {
    const gate = gatedPaint();
    const q = createWorkQueue({ paint: gate.paint });
    let store = { remove: (id: string) => `removed ${id} from the first store`, name: 'x' };
    const act = queuedActions(q, () => store, ['remove'] as const);
    const done = act.remove('r1');
    expect(q.working(INTERACTIVE)).toBe(true);
    store = { remove: (id: string) => `removed ${id} from the current store`, name: 'y' };
    await settle();
    await gate.release();
    await gate.release();
    expect(await done).toBe('removed r1 from the current store');
  });
});

describe('#2890 — ordering across lanes, the span of a job, and the wrapper of a routed action', () => {
  it('a lane declared BEHIND another waits for the jobs that lane had been asked for, and is counted on its own meanwhile', async () => {
    const q = createWorkQueue({ behind: { another: INTERACTIVE } });
    const order: string[] = [];
    let endSubmit!: () => void;
    const submit = q.run(() => new Promise<void>((r) => (endSubmit = r)).then(() => void order.push('the submit ends')));
    const press = q.run(() => void order.push('the press runs'), { lane: 'another' });
    await settle();
    expect(q.working('another'), 'its own button shows it while it waits its turn').toBe(true);
    expect(order).toEqual([]);
    endSubmit();
    await Promise.all([submit, press]);
    expect(order).toEqual(['the submit ends', 'the press runs']);
    expect(q.working('another')).toBe(false);
  });

  it('the other lane does not wait for it: a line entered while a search runs is taken and runs', async () => {
    const q = createWorkQueue({ behind: { another: INTERACTIVE } });
    let endSearch!: () => void;
    const search = q.run(() => new Promise<void>((r) => (endSearch = r)), { lane: 'another' });
    await settle();
    expect(q.working(INTERACTIVE)).toBe(false);
    const line = q.runIfIdle(() => 'committed');
    expect(line).not.toBeNull();
    expect(await line).toBe('committed');
    expect(q.working('another')).toBe(true);
    endSearch();
    await search;
  });

  it('a job reads the figure the job before it left: behind another lane, its stamp is that figure', async () => {
    let figure = { facts: ['a'], seed: 0 };
    const q = createWorkQueue({ basis: () => figure, sameBasis: (a, b) => a.facts === b.facts && a.seed === b.seed, behind: { another: INTERACTIVE } });
    const left = { facts: ['a', 'b'], seed: 0 };
    const submit = q.run(async () => {
      await settle();
      figure = left;
    });
    const press = q.run((job) => ({ basis: job.basis, stale: job.stale() }), { lane: 'another' });
    await submit;
    expect(await press).toEqual({ basis: left, stale: false });
  });

  it('run({ behind }) orders one job, and a lane behind itself is its own order', async () => {
    const q = createWorkQueue();
    const order: string[] = [];
    let end!: () => void;
    const first = q.run(() => new Promise<void>((r) => (end = r)).then(() => void order.push('first')), { lane: 'a' });
    const second = q.run(() => void order.push('second'), { lane: 'b', behind: 'a' });
    const third = q.run(() => void order.push('third'), { lane: 'b', behind: 'b' });
    await settle();
    expect(order).toEqual([]);
    end();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it("a span opens when the job's turn starts and closes after its closing paint, before the job is released", async () => {
    const gate = gatedPaint();
    const log: string[] = [];
    const q: WorkQueue = createWorkQueue({
      paint: gate.paint,
      span: (job) => {
        log.push(`opened on ${job.lane}`);
        return () => void log.push(`closed, working: ${q.working()}`);
      },
    });
    const done = q.run(() => void log.push('work'));
    await settle();
    expect(log, 'not before the opening paint').toEqual([]);
    await gate.release();
    expect(log).toEqual(['opened on interactive', 'work']);
    await gate.release();
    await done;
    expect(log).toEqual(['opened on interactive', 'work', 'closed, working: true']);
    expect(q.working()).toBe(false);
  });

  it('a span is closed when the work throws, and a span that throws still releases the job', async () => {
    const log: string[] = [];
    const q = createWorkQueue({ span: () => () => void log.push('closed') });
    await expect(q.run(() => Promise.reject(new Error('no figure')))).rejects.toThrow('no figure');
    expect(log).toEqual(['closed']);
    const broken = createWorkQueue({
      span: () => () => {
        throw new Error('the meter broke');
      },
    });
    await expect(broken.run(() => 1)).rejects.toThrow('the meter broke');
    expect(broken.working()).toBe(false);
    expect(await broken.run(() => 2).catch(() => 'still runs')).toBe('still runs');
  });

  it("queuedActions hands every routed action to the builder's wrapper, which decides how it reaches the store", async () => {
    const q = createWorkQueue();
    const calls: string[] = [];
    const store = { remove: (key: string) => (calls.push(`store.remove(${key})`), `removed ${key}`), rename: (a: string, b: string) => (calls.push(`store.rename(${a},${b})`), true) };
    const act = queuedActions(q, () => store, ['remove', 'rename'] as const, {
      around: (name, args, job, runLocal) => {
        calls.push(`around ${name}(${args.join(',')}) on ${job.lane}, inside a job: ${q.inJob()}`);
        return name === 'rename' ? 'answered elsewhere' : runLocal();
      },
    });
    expect(await act.remove('g1')).toBe('removed g1');
    expect(await act.rename('A', 'B')).toBe('answered elsewhere');
    expect(calls).toEqual(['around remove(g1) on interactive, inside a job: true', 'store.remove(g1)', 'around rename(A,B) on interactive, inside a job: true']);
  });
});
