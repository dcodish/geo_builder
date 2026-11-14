/**
 * #2890 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477); ADR-W-210 invariant 4) — THE LOCUS CHIPS AND A
 * TRACED LOCUS ARE KEPT BY CONTENT.
 *
 * Two readers of the page solved again what the session had already solved. `locusChips` took a rank per point on every
 * render of a figure (89 924 units in 1 212 of the 1 963 recorded actions). The ask lane walked a traced locus again on
 * every render that followed the question (the 34 locus chips of the saved figures: 3 386 703 units to answer once, and
 * the same again each time a row was ticked, an undo pressed or another question asked).
 *
 * The locks are of the two memos themselves: the same content is answered once; different content is never answered by
 * a remembered one; what a caller gets is its own; a remembered answer leaves a reader's configuration pool as a
 * computed one does (so what a page shows as «בודק…» does not depend on what is kept); the bounds; and the clear.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAnalyticCaches, derive, type Derivation } from '../engine/derive';
import { configurationPool, drawableAt, type Configuration } from '../engine/evaluate';
import { LOCI_KEPT, locusOf } from '../engine/locus';
import { LOCUS_CHIPS_KEPT, askLocus, locusChips } from '../app/locusChip';
import { askSettled } from '../app/ask';
import { readWork } from '../../shell/workMeter';

const fmt = (v: number) => String(Math.round(v * 1e6) / 1e6);
function units(fn: () => void): number {
  const before = readWork().total;
  fn();
  return readWork().total - before;
}

/** The 2024 summer-B exam's locus (#1138): G rides a parabola as E slides on its line. One chip, a traced curve. */
const LINES = ['M(1,2)', 'K(1,0)', 'נקודה E', 'E על הישר x = -1', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'l2 אנך אמצעי ל-EK', 'G נקודת החיתוך של הישר l1 עם הישר l2'];
/** What a deferred page has read of its pool after `fn` (the seeds asked through the derivation's own view). */
const readAfter = (d: Derivation, fn: () => void): number[] => {
  const pool = configurationPool(d.construction);
  pool.defer();
  fn();
  return pool.ready();
};

beforeEach(() => clearAnalyticCaches());

describe('#2890 — the locus chips of a figure are computed once', () => {
  it('a second reading of the same figure costs no solver work and answers the same chips', () => {
    const d = derive(LINES, 0);
    let first: ReturnType<typeof locusChips> = [];
    expect(units(() => (first = locusChips(d)))).toBeGreaterThan(0);
    expect(first.map((c) => c.id)).toEqual(['G']);
    let second: ReturnType<typeof locusChips> = [];
    expect(units(() => (second = locusChips(d)))).toBe(0);
    expect(second).toEqual(first);
  });

  it('whichever derivation of the same lines asked: another call, another array', () => {
    locusChips(derive(LINES, 0));
    expect(units(() => locusChips(derive([...LINES], 0)))).toBe(0);
  });

  it('what a caller gets is its own: writing into it changes no later answer', () => {
    const d = derive(LINES, 0);
    const mine = locusChips(d);
    mine[0].sentence = 'changed';
    mine.length = 0;
    expect(locusChips(d).map((c) => c.sentence)).toEqual(locusChips(derive(LINES, 0)).map((c) => c.sentence));
    expect(locusChips(d)).toHaveLength(1);
    expect(locusChips(d)[0].sentence).not.toBe('changed');
  });

  it('another configuration of the figure is asked again', () => {
    const d0 = derive(LINES, 0);
    locusChips(d0);
    const d1 = derive(LINES, 1);
    expect(d1.configuration).not.toEqual(d0.configuration);
    expect(units(() => locusChips(d1))).toBeGreaterThan(0);
    expect(units(() => locusChips(d1))).toBe(0);
    expect(units(() => locusChips(d0))).toBe(0);
  });

  it('other lines are never answered by a remembered figure', () => {
    locusChips(derive(LINES, 0));
    const fixed = derive([...LINES.slice(0, 3), 'E(-1,3)', ...LINES.slice(4)], 0);
    expect(locusChips(fixed)).toEqual([]);
  });

  it('a derivation built by hand around another figure is not answered by the kept one', () => {
    const d = derive(LINES, 0);
    const kept = locusChips(d);
    const other = derive(LINES, 1);
    const byHand: Derivation = { ...d, figure: other.figure };
    expect(units(() => locusChips(byHand))).toBeGreaterThan(0);
    expect(locusChips(d)).toEqual(kept);
  });

  it('a remembered answer leaves the reader\'s pool as a computed one does', () => {
    const cold = readAfter(derive(LINES, 0), () => locusChips(derive(LINES, 0)));
    const d = derive(LINES, 0);
    const first = readAfter(d, () => locusChips(d));
    const again = derive(LINES, 0);
    const warm = readAfter(again, () => locusChips(again));
    expect(warm).toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(cold.length);
  });

  it(`at most ${LOCUS_CHIPS_KEPT} configurations are kept per figure, the oldest dropped first`, () => {
    const d = derive(LINES, 0);
    const at = (seed: number): Derivation => {
      const configuration: Configuration = { seed, reach: 1, wide: seed !== 0 };
      return { ...d, configuration, figure: drawableAt(d.construction, configuration, true) };
    };
    const first = at(0);
    locusChips(first);
    for (let seed = 1; seed < LOCUS_CHIPS_KEPT; seed += 1) locusChips(at(seed));
    expect(units(() => locusChips(first)), 'the bound is not reached: the first is still kept').toBe(0);
    locusChips(at(LOCUS_CHIPS_KEPT));
    expect(units(() => locusChips(first)), 'one over the bound: the first was dropped').toBeGreaterThan(0);
  });

  it('clearAnalyticCaches empties it', () => {
    locusChips(derive(LINES, 0));
    clearAnalyticCaches();
    expect(units(() => locusChips(derive(LINES, 0)))).toBeGreaterThan(0);
  });
});

describe('#2890 — a locus is traced once per figure', () => {
  it('the same question asked again of the same figure costs no solver work and answers the same', () => {
    const d = derive(LINES, 0);
    configurationPool(d.construction).fill();
    let first: unknown;
    expect(units(() => (first = askLocus(d, 'G', fmt)))).toBeGreaterThan(1000);
    let second: unknown;
    expect(units(() => (second = askLocus(d, 'G', fmt)))).toBe(0);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('as the page asks it: every stored question on every render, through another view of the same lines', () => {
    const sentence = locusChips(derive(LINES, 0))[0].sentence;
    const first = askSettled(derive(LINES, 0), sentence, fmt, undefined, 'chip');
    expect(first.pending).toBeFalsy();
    let again: unknown;
    expect(units(() => (again = askSettled(derive([...LINES], 0), sentence, fmt, undefined, 'chip')))).toBe(0);
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it('the trace is one frozen object, shared by every caller', () => {
    const d = derive(LINES, 0);
    const a = locusOf(d.construction, 'G', [d.configuration, d.configuration.seed + 1], d.box);
    const b = locusOf(derive(LINES, 0).construction, 'G', [d.configuration, d.configuration.seed + 1], d.box);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a!.components)).toBe(true);
  });

  it('another point, another configuration and another frame are each traced', () => {
    const d = derive(LINES, 0);
    const at: [Configuration, number] = [d.configuration, d.configuration.seed + 1];
    locusOf(d.construction, 'G', at, d.box);
    expect(units(() => locusOf(d.construction, 'E', at, d.box)), 'another point').toBeGreaterThan(0);
    const d1 = derive(LINES, 1);
    expect(units(() => locusOf(d1.construction, 'G', [d1.configuration, d1.configuration.seed + 1], d.box)), 'another configuration').toBeGreaterThan(0);
    expect(units(() => locusOf(d.construction, 'G', at, { ...d.box, maxX: d.box.maxX + 1 })), 'another frame').toBeGreaterThan(0);
    expect(units(() => locusOf(d.construction, 'G', at, d.box)), 'and the first is still kept').toBe(0);
  });

  it('a point with no locus is remembered as having none', () => {
    const d = derive(LINES, 0);
    const at: [Configuration, number] = [d.configuration, d.configuration.seed + 1];
    expect(locusOf(d.construction, 'M', at, d.box)).toBeNull();
    expect(units(() => expect(locusOf(d.construction, 'M', at, d.box)).toBeNull())).toBe(0);
  });

  it('a remembered trace leaves the reader\'s pool as a walked one does', () => {
    const d = derive(LINES, 0);
    const walked = readAfter(d, () => askLocus(d, 'G', fmt));
    const again = derive(LINES, 0);
    const remembered = readAfter(again, () => askLocus(again, 'G', fmt));
    expect(remembered).toEqual(walked);
    expect(walked.length).toBeGreaterThan(0);
  });

  it(`at most ${LOCI_KEPT} traces are kept per figure, the oldest dropped first`, () => {
    const d = derive(LINES, 0);
    const at: [Configuration, number] = [d.configuration, d.configuration.seed + 1];
    const frame = (k: number) => ({ ...d.box, maxY: d.box.maxY + k });
    for (let k = 0; k < LOCI_KEPT; k += 1) locusOf(d.construction, 'M', at, frame(k));
    expect(units(() => locusOf(d.construction, 'G', at, d.box)), 'the last slot is taken by a real trace').toBeGreaterThan(0);
    expect(units(() => locusOf(d.construction, 'G', at, d.box))).toBe(0);
    // frame(0) was the oldest and is gone; asking it again drops frame(1), never the trace just kept
    locusOf(d.construction, 'M', at, frame(0));
    expect(units(() => locusOf(d.construction, 'G', at, d.box)), 'a newer entry outlives an older one').toBe(0);
  });

  it('clearAnalyticCaches empties it', () => {
    const d = derive(LINES, 0);
    askLocus(d, 'G', fmt);
    clearAnalyticCaches();
    const fresh = derive(LINES, 0);
    configurationPool(fresh.construction).fill();
    expect(units(() => askLocus(fresh, 'G', fmt))).toBeGreaterThan(1000);
  });
});
