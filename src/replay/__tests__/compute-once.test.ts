/**
 * COMPUTE ONCE in the 2-D replay layer ([ADR-827](../../../docs/06-decisions.md#adr-827), #2888; phase 2 of
 * [ADR-W-210](../../../docs/06w-decisions-workspace.md#adr-w-210)).
 *
 * Two memos, locked here as memos (the figures they serve ride the fixture net and the work-meter gate):
 *  - the SAMPLED construction of a fold at a seed (and of a pool job) is one object per heap, so a second facts
 *    array of the same content is solved from `evaluate`'s own memo;
 *  - the FOLD memo is least-recently-used with a measured bound, so content a session is still using is not the
 *    first thing a search's candidates push out.
 *
 * And the rule both obey: UNDER A BUDGET NOTHING IS DIFFERENT. Inside a work epoch (ADR-558) and under a clock that has
 * already run out, the code sees what it saw before these memos existed, so a budget counts the same work and cuts at
 * the same point. Each such lock compares the memo ON with the memo OFF (`samples: 0`, or more folds than the old eight).
 *
 * Every lock counts operations or compares results; none times anything. `work.executed` is the unit the work meter
 * counts (one per `evaluateCore` actually run); `work.done` is the unit the budgets read (a memo hit is charged the
 * work it saved). The two are locked apart, on purpose.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearReplayCaches, foldStats, getFoldFor, replay, replayMemoConfig, replayMemoSizes, sharedSamples, type Derived, type Fact } from '@/replay/core';
import { computeWithCell, countWork, servingRepeats, solveBudget, withLadderSpent, withWorkBudget, withWorkEpoch, work } from '@/engine/solveBudget';
import { nelderMead } from '@/engine/evaluate';
import { applyCommand, emptyConstruction, reflectableFreePoints, withReflectMask, type AnyCommand, type Command } from '@/engine';
import { inWorkerLane } from '../../../shell/workMeter';

const F = (id: string, cmd: AnyCommand): Fact => ({ id, cmd, enabled: true });
/** «ריבוע ABCD» · «G על AD» · «∠GBA = 37°»: the angle drives G along AD, so every sampled seed is a real solve. */
const FIGURE: AnyCommand[] = [
  { type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand,
  { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' } as AnyCommand,
  { type: 'set-angle', vertex: 'B', ray1: 'G', ray2: 'A', value: 37 } as AnyCommand,
];
/** An under-determined figure: its sample pool is 16 sampled solves of one construction. */
const LOOSE: AnyCommand[] = [
  { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand,
  { type: 'free-point', id: 'B', x: 6, y: 0, free: true } as AnyCommand,
  { type: 'free-point', id: 'C', x: 2, y: 4, free: true } as AnyCommand,
  { type: 'segment', a: 'A', b: 'B' } as AnyCommand,
  { type: 'segment', a: 'B', b: 'C' } as AnyCommand,
  { type: 'set-distance', a: 'A', b: 'B', value: 6 } as AnyCommand,
];
let serial = 0;
/** A NEW facts array (new fact ids) of a figure's content, as a gate's trial array or a commit builds one. */
const arrayOf = (cmds: AnyCommand[] = FIGURE): Fact[] => {
  serial++;
  return cmds.map((cmd, i) => F(`n${serial}.${i}`, cmd));
};
/** One fact of its own content: a fold nobody else shares. */
const junk = (i: number): Fact[] => [F(`j${i}`, { type: 'free-point', id: `Z${i}`, x: i, y: -i, free: true } as AnyCommand)];
/** Everything a student can see of a derived figure, by fact INDEX (two arrays of one content have different ids). */
const seen = (d: Derived, facts: Fact[]): string =>
  JSON.stringify({
    positions: [...d.positions].sort(([a], [b]) => (a < b ? -1 : 1)),
    circles: [...d.circles].sort(([a], [b]) => (a < b ? -1 : 1)),
    status: facts.map((f) => d.status[f.id]),
    lastError: d.lastError,
    pending: d.pending,
    labels: d.labels,
    angleMarks: d.angleMarks,
    violations: d.violations,
    coincidences: d.coincidences,
    degeneracies: d.degeneracies.map((x) => ({ ...x, statements: x.statements.map((id) => facts.findIndex((f) => f.id === id)) })),
    sampledFailure: d.sampledFailure,
  });
const executedBy = <T>(fn: () => T): { value: T; executed: number } => {
  const e0 = work.executed;
  const value = fn();
  return { value, executed: work.executed - e0 };
};
const SEED = 3;
const saved = { ...replayMemoConfig };

beforeEach(() => {
  Object.assign(replayMemoConfig, saved);
  clearReplayCaches();
});
afterEach(() => Object.assign(replayMemoConfig, saved));

describe('the sampled construction of a fold is built once, so its solve is too (ADR-827)', () => {
  it('a second facts array of the same content, at a seed other than 0, runs no solver work and shows the same figure', () => {
    const a = arrayOf();
    const first = executedBy(() => replay(a, SEED));
    expect(first.value.lastError).toBeNull();
    expect(first.executed, 'the figure really is solved at this seed').toBeGreaterThan(0);
    const b = arrayOf();
    const second = executedBy(() => replay(b, SEED));
    expect(second.executed, 'same content, same seed, another array: nothing is solved again').toBe(0);
    expect(seen(second.value, b)).toBe(seen(first.value, a));
    expect(second.value.construction, 'the two replays hold ONE sampled construction').toBe(first.value.construction);
    expect(second.value.positions, 'but each replay keeps its own positions map').not.toBe(first.value.positions);
  });

  it('with the memo off, the second array is solved again (what every array paid before)', () => {
    replayMemoConfig.samples = 0;
    const cold = executedBy(() => replay(arrayOf(), SEED)).executed;
    const again = executedBy(() => replay(arrayOf(), SEED)).executed;
    expect(again, 'the fold is held, the sampled solve is not').toBeGreaterThan(0);
    expect(again).toBeLessThanOrEqual(cold);
  });

  it('a result is the same with the memo off, cold, warm and cold again, at every seed', () => {
    for (const seed of [0, 1, SEED, 17]) {
      replayMemoConfig.samples = 0;
      clearReplayCaches();
      const off = arrayOf();
      const offSeen = seen(replay(off, seed), off);
      replayMemoConfig.samples = saved.samples;
      clearReplayCaches();
      const cold = arrayOf();
      expect(seen(replay(cold, seed), cold), `seed ${seed}, cold`).toBe(offSeen);
      const warm = arrayOf();
      expect(seen(replay(warm, seed), warm), `seed ${seed}, warm`).toBe(offSeen);
      clearReplayCaches();
      const recold = arrayOf();
      expect(seen(replay(recold, seed), recold), `seed ${seed}, cold again`).toBe(offSeen);
    }
  });

  it('another seed is another sample, and other content is never served a stale one', () => {
    const at3 = replay(arrayOf(), SEED);
    const other = executedBy(() => replay(arrayOf(), SEED + 1));
    expect(other.executed).toBeGreaterThan(0);
    expect(other.value.construction).not.toBe(at3.construction);
    // the same lines with ANOTHER angle: a different fold, so a different sampled construction and a different G
    const changed = FIGURE.map((c) => (c.type === 'set-angle' ? ({ ...c, value: 20 } as AnyCommand) : c));
    const d = executedBy(() => replay(arrayOf(changed), SEED));
    expect(d.executed).toBeGreaterThan(0);
    expect(d.value.construction).not.toBe(at3.construction);
    const ratio = (fig: Derived): number => {
      const [a, b, g] = ['A', 'B', 'G'].map((id) => fig.positions.get(id)!);
      return Math.hypot(g.x - a.x, g.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(ratio(at3), '|AG| / |AB| = tan 37°').toBeCloseTo(Math.tan((37 * Math.PI) / 180), 4);
    expect(ratio(d.value), '|AG| / |AB| = tan 20°').toBeCloseTo(Math.tan((20 * Math.PI) / 180), 4);
  });

  it('the bound holds: past it the least recently used sample is solved again, and a used one is kept', () => {
    replayMemoConfig.samples = 2;
    replay(arrayOf(), 1);
    replay(arrayOf(), 2);
    expect(replayMemoSizes().samples).toBe(2);
    expect(executedBy(() => replay(arrayOf(), 1)).executed, 'seed 1 is still held (and is now the most recent)').toBe(0);
    replay(arrayOf(), 3); // a third sample: seed 2 is the least recently used and goes
    expect(replayMemoSizes().samples, 'never more than the bound').toBe(2);
    expect(executedBy(() => replay(arrayOf(), 1)).executed, 'seed 1 was used, so it stayed').toBe(0);
    expect(executedBy(() => replay(arrayOf(), 2)).executed, 'seed 2 went').toBeGreaterThan(0);
  });

  it('clearReplayCaches forgets it: the next replay is cold', () => {
    const cold = executedBy(() => replay(arrayOf(), SEED)).executed;
    expect(executedBy(() => replay(arrayOf(), SEED)).executed).toBe(0);
    clearReplayCaches();
    expect(replayMemoSizes()).toEqual({ folds: 0, searchFolds: 0, samples: 0 });
    expect(executedBy(() => replay(arrayOf(), SEED)).executed, 'a cold replay costs what the first one did').toBe(cold);
  });

  it('each lane has its own: a sample the worker lane solved is not a hit for the page lane (as in a browser)', () => {
    const inWorker = inWorkerLane(() => executedBy(() => replay(arrayOf(), SEED)).executed);
    expect(inWorker).toBeGreaterThan(0);
    const onPage = executedBy(() => replay(arrayOf(), SEED));
    expect(onPage.executed, 'the page solves its own sample').toBeGreaterThan(0);
    expect(executedBy(() => replay(arrayOf(), SEED)).executed, 'and then holds it').toBe(0);
    // #2893 (ADR-831): the page now folds the content itself (ADR-827's shared 8-entry list is gone), and in this ONE node heap
    // the content's fold is replaced by the page's, so the worker lane's sample, keyed by the fold it was drawn from, is
    // solved once more. In a browser each heap keeps its own fold and this never happens.
    expect(inWorkerLane(() => executedBy(() => replay(arrayOf(), SEED)).executed), 'the worker lane solves at most its one sample again').toBeLessThanOrEqual(1);
  });

  it('the sample pool: a second pool of one figure runs none of its samples again, and holds the same samples', () => {
    const poolOf = () => {
      const facts = arrayOf(LOOSE);
      replay(facts, 0); // the figure on screen
      const e0 = work.executed;
      // the gate's pool: narrow, under its work limit (#2893; it was a clock, none under test), never kept as the knowledge memo
      const pool = sharedSamples(facts, { gate: true });
      return { executed: work.executed - e0, complete: pool.complete, at: pool.samples.map((m) => [...m].map(([id, p]) => `${id}:${p.x.toFixed(9)},${p.y.toFixed(9)}`).join(' ')) };
    };
    const cold = poolOf();
    expect(cold.at.length).toBeGreaterThan(3);
    expect(cold.executed).toBeGreaterThan(0);
    const warm = poolOf();
    expect(warm.executed, 'no sample is solved a second time').toBe(0);
    expect({ complete: warm.complete, at: warm.at }).toEqual({ complete: cold.complete, at: cold.at });
  });
});

describe('under a budget nothing is different: memo on = memo off, cold = warm (ADR-558, ADR-582)', () => {
  /** The counted work (`work.done`), the run work and the figures of replaying `n` new arrays inside ONE work epoch. */
  const epochOf = (n: number, seed = SEED, cmds: AnyCommand[] = FIGURE) =>
    withWorkEpoch(() => {
      const w0 = work.done;
      const e0 = work.executed;
      const figures: string[] = [];
      for (let i = 0; i < n; i++) {
        const facts = arrayOf(cmds);
        figures.push(seen(replay(facts, seed), facts));
      }
      return { done: work.done - w0, executed: work.executed - e0, figures };
    });
  /** `fn` from cleared caches (cold) and again (warm), with the sample memo off and on. */
  const fourWays = <T>(fn: () => T): { off: { cold: T; warm: T }; on: { cold: T; warm: T } } => {
    const twice = () => {
      clearReplayCaches();
      return { cold: fn(), warm: fn() };
    };
    replayMemoConfig.samples = 0;
    const off = twice();
    replayMemoConfig.samples = saved.samples;
    return { off, on: twice() };
  };

  it('one array in an epoch: charged exactly the work a cold run ran, and warm none of it is run', () => {
    const { off, on } = fourWays(() => epochOf(1));
    expect(on.cold.done, 'cold: every unit is run').toBe(on.cold.executed);
    expect(on.warm.done, 'warm: the same counted work').toBe(on.cold.done);
    expect(on.warm.executed, 'warm: none of the sampled solve is run again').toBe(0);
    expect(on.cold.done, 'and it is what was counted before the memo').toBe(off.cold.done);
    expect(on.warm.done).toBe(off.warm.done);
    expect(on.warm.figures).toEqual(off.cold.figures);
  });

  it('two arrays in ONE epoch: the second is served from the table, the same cold and warm (#2893, ADR-831)', () => {
    const one = fourWays(() => epochOf(1));
    const two = fourWays(() => epochOf(2));
    // ADR-827 built a fresh object for the second array so an epoch counted two solves, as before the table existed;
    // #2893 removes that emulation: the second hand-out is free, as a cold run serves it from the table it just filled
    expect(two.on.warm.done, 'cold = warm').toBe(two.on.cold.done);
    expect(two.on.cold.done, 'the table counts no more than two separate solves').toBeLessThanOrEqual(two.off.cold.done);
    expect(two.on.cold.done, 'and the second array costs nothing more').toBe(one.on.cold.done);
    expect(new Set([...two.on.cold.figures, ...two.on.warm.figures, ...two.off.cold.figures]).size, 'one figure throughout').toBe(1);
  });

  it('a mirrored seed: building the sample reads a solve, and a hit is charged that too', () => {
    /** An isosceles triangle on a stated base: its apex has a mirror image the seed's high bits select (ADR-166). */
    const apex: AnyCommand[] = [
      { type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand,
      { type: 'set-distance', a: 'B', b: 'C', value: 6 } as AnyCommand,
    ];
    const probe = arrayOf(apex);
    const reflectable = reflectableFreePoints(replay(probe, 0).construction).length;
    expect(reflectable, 'the figure has a point to mirror').toBeGreaterThan(0);
    for (let mask = 1; mask < 1 << Math.min(reflectable, 2); mask++) {
      const seed = withReflectMask(mask, 2);
      const one = fourWays(() => epochOf(1, seed, apex));
      expect(one.on.cold, 'mask ' + mask + ', one array, cold').toEqual({ ...one.off.cold, executed: one.on.cold.executed });
      expect(one.on.warm.done, 'mask ' + mask + ', one array, warm').toBe(one.off.warm.done);
      expect(one.on.warm.figures).toEqual(one.off.warm.figures);
      const two = fourWays(() => epochOf(2, seed, apex));
      // #2893 (ADR-831): the second array is served from the table (ADR-827's fresh object is gone): cold = warm
      expect(two.on.warm.done, 'mask ' + mask + ', two arrays, cold = warm').toBe(two.on.cold.done);
      expect(two.on.cold.done, 'mask ' + mask + ', two arrays, no more than two solves').toBeLessThanOrEqual(two.off.cold.done);
      expect(two.on.warm.figures).toEqual(two.off.cold.figures);
    }
  });

  it('a work budget one unit short of the solve, and one that covers it: the same verdict and count off, on, cold, warm', () => {
    replay(arrayOf(), 0);
    const need = epochOf(1).done; // the sampled solve, with the fold already held
    expect(need).toBeGreaterThan(1);
    const verdict = (units: number) => () => {
      replay(arrayOf(), 0); // the fold, with no budget armed
      const a0 = solveBudget.aborts;
      const w0 = work.done;
      const facts = arrayOf();
      const d = withWorkBudget(units, () => replay(facts, SEED));
      return { cut: solveBudget.aborts !== a0, done: work.done - w0, figure: seen(d, facts) };
    };
    // A budget is cooperative: it cuts a solve only where the solver consults it, so what is locked is that the memo
    // changes neither whether it was cut nor what was counted nor what is shown.
    const short = fourWays(verdict(need - 1));
    expect(short.on.cold).toEqual(short.off.cold);
    expect(short.on.warm).toEqual(short.off.warm);
    const enough = fourWays(verdict(need));
    expect(enough.off.cold.cut).toBe(false);
    expect(enough.on.cold).toEqual(enough.off.cold);
    expect(enough.on.warm).toEqual(enough.off.warm);
  });

  it('the sample pool is charged the same work off, on, cold and warm, with the same samples', () => {
    const pool = () => {
      const facts = arrayOf(LOOSE);
      replay(facts, 0);
      const w0 = work.done;
      const p = sharedSamples(facts, { gate: true });
      return { done: work.done - w0, complete: p.complete, at: p.samples.map((m) => [...m].map(([id, q]) => `${id}:${q.x.toFixed(9)},${q.y.toFixed(9)}`).join(' ')) };
    };
    const { off, on } = fourWays(pool);
    expect(on.cold).toEqual(off.cold);
    expect(on.warm).toEqual(off.warm);
    expect(on.warm.done, 'cold = warm').toBe(on.cold.done);
  });

  it('under a clock that has already run out the memo is not read: the replay runs, and shows, what it always did', () => {
    const spent = () => {
      replay(arrayOf(), 0);
      replay(arrayOf(), SEED); // the full solve, with no budget: the memo holds it
      const facts = arrayOf();
      const a0 = solveBudget.aborts;
      const r = executedBy(() => withLadderSpent(() => replay(facts, SEED)));
      return { executed: r.executed, cut: solveBudget.aborts - a0, figure: seen(r.value, facts) };
    };
    const { off, on } = fourWays(spent);
    expect(on.cold).toEqual(off.cold);
    expect(on.warm).toEqual(off.warm);
    // a budget with nothing LEFT is spent too (#2893: a work budget of zero units; it was a clock at this millisecond):
    // a zero budget buys no memo hit
    replay(arrayOf(), SEED);
    const none = executedBy(() => withWorkBudget(0, () => replay(arrayOf(), SEED)));
    expect(none.executed, 'solved, as a search on a zero budget always solved its candidates').toBeGreaterThan(0);
    // and with no budget the next replay is the held, whole solve
    const after = arrayOf();
    const whole = arrayOf();
    expect(seen(replay(after, SEED), after)).toBe(seen(replay(whole, SEED), whole));
  });
});

describe('a memo that outlives the action holds nothing a later fold can write into (ADR-624, ADR-827)', () => {
  const TRIANGLE: AnyCommand = { type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand;
  /** «משולש ישר זווית ABC» over the three points «משולש ABC» placed: its right angle seats on a vertex that exists. */
  const RIGHT: AnyCommand = { type: 'right-triangle', ids: ['A', 'B', 'C'] } as AnyCommand;

  it('applyCommand leaves the construction it was given untouched: a right triangle over placed points', () => {
    const prev = applyCommand(emptyConstruction(), TRIANGLE as Command);
    const before = JSON.stringify(prev);
    const next = applyCommand(prev, RIGHT as Command);
    expect(JSON.stringify(next), 'the step did seat the right angle').toContain('"seat":true');
    expect(JSON.stringify(prev), 'and wrote nothing into the construction it started from').toBe(before);
  });

  it('the lines before a right triangle fold the same after it was folded on top of them as before', () => {
    const cold = arrayOf([TRIANGLE]);
    const plain = JSON.stringify(replay(cold, 0).construction);
    replay(arrayOf([TRIANGLE, RIGHT]), 0); // resumes from the held fold of «משולש ABC»
    const warm = arrayOf([TRIANGLE]);
    expect(JSON.stringify(replay(warm, 0).construction), 'the held fold of «משולש ABC» is still a plain triangle').toBe(plain);
    // and a line typed on it folds as it does from nothing: «AB קטן פי 2 מ-AC»
    const ratio = { type: 'set-ratio', a: 'A', b: 'B', c: 'A', d: 'C', k: 0.5 } as AnyCommand;
    const onWarm = arrayOf([TRIANGLE, ratio]);
    const d = replay(onWarm, 0);
    expect({ pending: d.pending, lastError: d.lastError, status: onWarm.map((f) => d.status[f.id]) }).toEqual({ pending: false, lastError: null, status: ['ok', 'ok'] });
    clearReplayCaches();
    const fresh = arrayOf([TRIANGLE, ratio]);
    expect(seen(replay(fresh, 0), fresh)).toBe(seen(d, onWarm));
  });
});

describe('the fold memo is least-recently-used, with a bound (ADR-827)', () => {
  it('never holds more folds than its bound', () => {
    replayMemoConfig.folds = 4;
    for (let i = 0; i < 12; i++) {
      replay(junk(i), 0);
      expect(replayMemoSizes().folds).toBeLessThanOrEqual(4);
    }
    expect(replayMemoSizes().folds).toBe(4);
  });

  it('content a session keeps using survives a search that folds many candidates; unused content is what goes', () => {
    replayMemoConfig.folds = 4;
    replay(arrayOf(), 0);
    replay(junk(100), 0);
    const before = foldStats.computes;
    for (let i = 0; i < 9; i++) {
      replay(junk(i), 0); // a candidate
      replay(arrayOf(), 0); // the figure on screen is read again between candidates
    }
    expect(foldStats.computes - before, 'nine candidates, and the figure itself was never folded again').toBe(9);
    replay(junk(100), 0);
    expect(foldStats.computes - before, 'the content nobody read was evicted, and folds again').toBe(10);
  });

  it('a fold that eight later folds would have pushed out of the old memo is still held, and is not folded again', () => {
    replay(arrayOf(), 0);
    for (let i = 0; i < 12; i++) replay(junk(i), 0);
    const before = foldStats.computes;
    replay(arrayOf(), 0);
    expect(foldStats.computes - before, 'the old 8-entry first-in-first-out memo folded it again here').toBe(0);
  });

  it('each lane holds its own folds, as each heap does in a browser (#2893: the shared old eight are gone too)', () => {
    // ADR-827 let the two lanes of one node process share the old memo's eight folds; #2893 (ADR-831) removes that
    // emulation with the clocks, so a fold the worker lane folded is folded again by the page lane, as in a browser
    inWorkerLane(() => replay(arrayOf(), 0));
    const shared = foldStats.computes;
    replay(arrayOf(), 0);
    expect(foldStats.computes - shared, 'the page lane folds its own').toBe(1);
    clearReplayCaches();
    inWorkerLane(() => {
      replay(arrayOf(), 0);
      for (let i = 0; i < 12; i++) replay(junk(i), 0);
    });
    const before = foldStats.computes;
    replay(arrayOf(), 0);
    expect(foldStats.computes - before, 'the page never held it, and the old memo no longer did: the page folds it').toBe(1);
    replay(arrayOf(), 0);
    expect(foldStats.computes - before, 'now the page holds it').toBe(1);
    for (let i = 20; i < 32; i++) replay(junk(i), 0);
    inWorkerLane(() => replay(arrayOf(), 0));
    expect(foldStats.computes - before - 12, 'and the worker lane still holds its own').toBe(1);
  });

  it('under a budget the larger memo is read and charged what it saved: it counts and shows what folding it again did (#2893)', () => {
    const inEpoch = (folds: number) => {
      replayMemoConfig.folds = folds;
      clearReplayCaches();
      replay(arrayOf(), 0);
      for (let i = 0; i < 12; i++) replay(junk(i), 0);
      const f0 = foldStats.computes;
      const facts = arrayOf();
      const r = withWorkEpoch(() => {
        const w0 = work.done;
        const d = replay(facts, 0);
        return { done: work.done - w0, figure: seen(d, facts) };
      });
      return { ...r, folded: foldStats.computes - f0 };
    };
    const old = inEpoch(8);
    const now = inEpoch(saved.folds);
    expect(old.folded, 'eight entries: the figure was pushed out, and is folded inside the epoch').toBe(1);
    // #2893 (ADR-831): ADR-827 made the larger memo fold it again there too; now the held fold is read, charged its ledger
    expect(now.folded, 'the larger memo holds it: not folded again').toBe(0);
    expect({ done: now.done, figure: now.figure }, 'and it counts and shows exactly what folding it did').toEqual({ done: old.done, figure: old.figure });
  });

  it('getFoldFor answers what the memo holds for this lane (#2893: no longer as the 8-entry memo did)', () => {
    const figure = arrayOf();
    replay(figure, 0);
    expect(getFoldFor(figure)).not.toBeNull();
    for (let i = 0; i < 12; i++) replay(junk(i), 0);
    expect(getFoldFor(figure), 'twelve folds later the larger memo still has it').not.toBeNull();
    replay(arrayOf(), 0); // read again: held, and the old memo would have folded and held it from here
    expect(getFoldFor(figure)).not.toBeNull();
  });

  it('clearReplayCaches empties it', () => {
    replay(arrayOf(), 0);
    expect(replayMemoSizes().folds).toBeGreaterThan(0);
    clearReplayCaches();
    expect(replayMemoSizes()).toEqual({ folds: 0, searchFolds: 0, samples: 0 });
  });

  it('the bounds in force are the measured ones (ADR-827)', () => {
    expect(saved).toEqual({ folds: 64, samples: 1024 });
  });
});

/**
 * #2894 ([ADR-832](../../../docs/06-decisions.md#adr-832), ADR-W-210 phase 5) — AN EXACT REPEAT IS SERVED, AND CHARGED AS
 * IF IT WERE COMPUTED. Inside one `nelderMead` call a point already evaluated is not evaluated again; every counter a
 * budget, a cap or a ledger reads still advances by what the evaluation advanced it. The meter's executed calls fall.
 */
describe('#2894 — an exact repeat is served and charged as computed', () => {
  it('a served repeat advances work.done, work.executed and the open ledger frame exactly as the first evaluation did', () => {
    let calls = 0;
    const f = servingRepeats((x: number[]) => {
      calls++;
      countWork();
      countWork();
      return x[0] * 2;
    });
    const d0 = work.done;
    const e0 = work.executed;
    const { value, cell } = computeWithCell(() => [f([1, -0]), f([1, -0]), f([1, 0]), f([1, -0])]);
    expect(value).toEqual([2, 2, 2, 2]);
    expect(calls, 'the point [1, -0] is evaluated once; [1, 0] is another point').toBe(2);
    expect(work.done - d0, 'charged as if all four were computed').toBe(8);
    expect(work.executed - e0).toBe(8);
    expect(cell.own).toBe(8);
  });

  it('a point with a NaN coordinate is never served', () => {
    let calls = 0;
    const f = servingRepeats(() => ++calls);
    f([NaN]);
    f([NaN]);
    expect(calls).toBe(2);
  });

  it('nelderMead never evaluates one point twice in a call, and the descent is the one a recount reproduces', () => {
    const seen = new Set<string>();
    let repeats = 0;
    let calls = 0;
    const cost = (x: number[]): number => {
      calls++;
      const k = x.map((v) => (Object.is(v, -0) ? '-0' : String(v))).join(',');
      if (seen.has(k)) repeats++;
      seen.add(k);
      return (x[0] - 1) ** 2 + 10 * (x[1] + 2) ** 2 + 1e-3;
    };
    const a = nelderMead(cost, [0, 0], 400, 0.5);
    expect(repeats, 'a contracted simplex re-reads its own points; they are served').toBe(0);
    expect(calls).toBeGreaterThan(0);
    // the same descent again, from scratch: the same point to the last bit (the memo is the call's own)
    expect(nelderMead(cost, [0, 0], 400, 0.5)).toEqual(a);
  });
});
