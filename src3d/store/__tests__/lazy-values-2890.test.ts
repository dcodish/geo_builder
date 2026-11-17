/**
 * #2890 ([ADR-3D-492](../../../docs/06b-decisions-3d.md#adr-3d-492); ADR-W-210 phase 3) — THE PIVOT'S LAZY VALUES ARE
 * PLAIN CELLS: a resolved figure crosses `structuredClone`, and a value read on the other side is the one the solving
 * heap computes — sent beside the figure, following it later, or solved again and counted. Never a default.
 *
 * Before this the pivot's outcome held three closures, and `structuredClone` threw on every figure the pivot had run
 * on (82 of the 176 fixtures).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearSolveCaches3, derive3 } from '../store3';
import { deserializeFigure3 } from '../figureFile3';
import { freeDofCount3, keepLazyValue3, keepResolved3, lazyStats3, peekLazy3, pinOrigins3, placementFreedom3, resolve3, resolveStats3, scalarConsumed3, writePinOrigins3, type Resolved3 } from '../../engine/evaluate';
import { computeHere3, computesHere3, forgetLazy3, lazy3, lazyHeld3 } from '../../engine/lazy3';
import type { Construction3 } from '../../engine/types';
import { seedNumber3 } from '../../engine/components3';
import { dataView } from '../../engine/dataView';
import { readWork } from '../../../shell/workMeter';

const DIR = join(__dirname, '..', '..', '..', 'fixtures3');
const RAW = { solvedFrame: true } as const;

/** A saved figure as the App holds it after a load. */
function figure(name: string) {
  const r = deserializeFigure3(readFileSync(join(DIR, `${name}.geo3.json`), 'utf8'));
  if (!r.ok) throw new Error(`fixture ${name} does not load`);
  const d = derive3(r.facts, r.seed);
  return { facts: r.facts, seed: r.seed, d, c: d.construction };
}

/** What crosses with a figure: the figure, its construction, and the construction's pin origins beside it. */
function crossed(c: Construction3, r: Resolved3) {
  return structuredClone({ c, r, origins: pinOrigins3(c) });
}

/** The other heap, in this process: nothing solved, then the crossed figure put in its memo at its home. */
function arrive(x: ReturnType<typeof crossed>, seed: number): void {
  clearSolveCaches3();
  writePinOrigins3(x.c, x.origins);
  keepResolved3(x.c, `${seed}|raw`, { key: `${seed}|raw`, seed, opts: RAW, parts: false }, x.r);
  resolveStats3.uncached = resolveStats3.hits = resolveStats3.images = 0;
}

beforeEach(() => clearSolveCaches3());

describe('#2890 — a lazy cell', () => {
  it('is a marker that holds no value: the value is computed once, in the heap that made the cell, and kept beside it', () => {
    let runs = 0;
    const cell = lazy3(() => ({ n: ++runs }));
    expect(cell).toEqual({ lazy: true });
    expect(lazyHeld3(cell)).toBeUndefined();
    expect(computesHere3(cell)).toBe(true);
    expect(computeHere3(cell)).toEqual({ n: 1 });
    expect(lazyHeld3(cell)).toEqual({ n: 1 });
    expect(cell).toEqual({ lazy: true }); // asking changed nothing a comparison can see
    expect(runs).toBe(1);
    forgetLazy3(cell);
    expect(lazyHeld3(cell)).toBeUndefined();
  });

  it('a clone is the same marker, with no value and no way to compute one', () => {
    const cell = lazy3(() => 7);
    computeHere3(cell);
    const copy = structuredClone(cell);
    expect(copy).toEqual(cell);
    expect(lazyHeld3(copy)).toBeUndefined();
    expect(computesHere3(copy)).toBe(false);
  });
});

describe('#2890 — a resolved figure is plain data', () => {
  // each ran the pivot; between them every lazy is read by the page: the DOF line, the panel's read-back, the held release
  it.each(['pyramid-surd-height-1827', 'cube-turn-about-ab-2378', 'two-triangle-lengths-1855', 'length-letter-2092', 'nine-separate-shapes-2764'])(
    '%s: the derived figure clones, and it is the same data before and after its readers have asked for its lazy values',
    (name) => {
      const { d, c, seed } = figure(name);
      expect(d.resolved.pivot).not.toBeNull();
      const before = structuredClone(d);
      freeDofCount3(c, d.resolved);
      dataView(c, seed);
      expect(d).toEqual(before); // what was read is not on the figure
      const after = structuredClone(d);
      expect(after.resolved).toEqual(d.resolved);
      expect(after.construction).toEqual(c);
    },
  );

  it('a copy of the pivot shares the cell, as it shared the closure', () => {
    const { d } = figure('pyramid-surd-height-1827');
    const pivot = d.resolved.pivot!;
    const other: Resolved3 = { ...d.resolved, pivot: { ...pivot, solutions: pivot.solutions } };
    expect(peekLazy3(other, 'scalarConsumed')).toBeNull();
    const sc = scalarConsumed3(d.resolved);
    expect(sc).toBeDefined();
    expect(peekLazy3(other, 'scalarConsumed')).toBe(sc);
    expect(scalarConsumed3(other)).toBe(sc);
  });

  it('a pivot that found no solution holds no cell, and its readers answer undefined (the count is then the fallback)', () => {
    const { d } = figure('pyramid-surd-height-1827');
    const none: Resolved3 = { ...d.resolved, pivot: { solutions: 0, chosen: -1, err: Infinity } };
    expect(scalarConsumed3(none)).toBeUndefined();
    expect(placementFreedom3(none)).toBeUndefined();
    expect(scalarConsumed3({ ...d.resolved, pivot: null })).toBeUndefined();
  });
});

describe('#2890 — a figure that crossed answers what the solving heap answers', () => {
  const NAME = 'pyramid-surd-height-1827';
  const solvedFigure = () => {
    const { c, seed } = figure(NAME);
    const at = seedNumber3(seed);
    return { c, at, r: resolve3(c, at, RAW) };
  };

  it('a value sent beside the figure, addressed by its content, is read on the other side with no solve', () => {
    const { c, at, r } = solvedFigure();
    const sc = scalarConsumed3(r);
    const pf = placementFreedom3(r);
    const x = crossed(c, r);
    const beside = structuredClone({ scalarConsumed: peekLazy3(r, 'scalarConsumed'), placementFreedom: peekLazy3(r, 'placementFreedom') });
    arrive(x, at);
    keepLazyValue3(x.c, `${at}|raw`, 'scalarConsumed', beside.scalarConsumed);
    keepLazyValue3(x.c, `${at}|raw`, 'placementFreedom', beside.placementFreedom);
    const before = readWork().total;
    const back = resolve3(x.c, at, RAW);
    expect(back).toBe(x.r);
    expect(scalarConsumed3(back)).toEqual(sc);
    expect(placementFreedom3(back)).toEqual(pf);
    expect(resolveStats3.uncached).toBe(0);
    expect(lazyStats3.solvedAgain).toBe(0);
    expect(readWork().total).toBe(before);
  });

  it('a value computed AFTER the figure crossed FOLLOWS it by content, and is found by every object that stands for the figure', () => {
    const { c, at, r } = solvedFigure();
    const x = crossed(c, r); // crosses first: nothing has been asked
    const sc = scalarConsumed3(r); // computed afterwards, in the solving heap
    arrive(x, at);
    expect(peekLazy3(x.r, 'scalarConsumed')).toBeNull();
    // the value arrives beside ANOTHER object of the same construction (its pin origins written, as every arrival's are)
    const late = structuredClone({ c: x.c, origins: pinOrigins3(x.c) });
    writePinOrigins3(late.c, late.origins);
    expect(late.c).not.toBe(x.c);
    keepLazyValue3(late.c, `${at}|raw`, 'scalarConsumed', structuredClone(sc));
    const before = readWork().total;
    expect(peekLazy3(x.r, 'scalarConsumed')).toEqual(sc);
    expect(scalarConsumed3(resolve3(x.c, at, RAW))).toEqual(sc);
    expect(lazyStats3.solvedAgain).toBe(0);
    expect(readWork().total).toBe(before);
  });

  it('ABSENT: a value that never arrived is solved here and counted, and it is the same value', () => {
    const { c, at, r } = solvedFigure();
    const x = crossed(c, r);
    const sc = scalarConsumed3(r);
    const pf = placementFreedom3(r);
    arrive(x, at);
    const before = readWork().total;
    const back = resolve3(x.c, at, RAW);
    expect(scalarConsumed3(back)).toEqual(sc);
    expect(lazyStats3.solvedAgain).toBe(1);
    expect(readWork().total).toBeGreaterThan(before); // the solve is counted: the meter sees a value that did not follow
    expect(scalarConsumed3(back)).toEqual(sc);
    expect(lazyStats3.solvedAgain).toBe(1); // once: the heap keeps it
    expect(placementFreedom3(back)).toEqual(pf);
    expect(lazyStats3.solvedAgain).toBe(2); // each value that did not follow is its own solve
  });

  it('a figure in no memo of this heap cannot be asked: it throws, never a default', () => {
    const { r } = solvedFigure();
    expect(() => scalarConsumed3(structuredClone(r))).toThrow(/in no memo of this heap/);
  });
});
