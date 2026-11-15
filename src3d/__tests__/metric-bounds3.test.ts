/**
 * #2894 part 2 C ([ADR-3D-495](../../docs/06b-decisions-3d.md#adr-3d-495)) — `metricConflict3`, the closed-form reading of
 * stated lengths: one length per segment, and the triangle inequality on every three points whose sides are fixed. Pure
 * over `scalarPins`; the margin keeps every case the solver could still meet with the solver.
 */
import { describe, expect, it } from 'vitest';
import { CONFLICT_MARGIN, metricConflict3 } from '../engine/metricBounds3';
import type { ScalarPin } from '../engine/types';

const len = (a: string, b: string, value: number): ScalarPin => ({ kind: 'length', a, b, value });
const rel = (a1: string, b1: string, a2: string, b2: string, c = 1): ScalarPin => ({ kind: 'length-rel', a1, b1, a2, b2, c });
const at = (scalarPins: ScalarPin[]) => metricConflict3({ scalarPins });

describe('metricConflict3', () => {
  it('three stated sides against the triangle inequality, naming the three pins', () => {
    expect(at([len('A', 'B', 5), len('B', 'C', 3), len('A', 'C', 9)])).toMatchObject({ kind: 'triangle', long: ['A', 'C'], longLen: 9, sum: 8, pins: [0, 1, 2] });
  });
  it('a side carried by a relation: a square side and its diagonal', () => {
    const square = [rel('A', 'B', 'B', 'C'), rel('B', 'C', 'C', 'D'), rel('C', 'D', 'D', 'A')];
    expect(at([...square, len('A', 'B', 3), len('A', 'C', 10)])).toMatchObject({ kind: 'triangle', long: ['A', 'C'], sum: 6 });
    expect(at([...square, len('A', 'B', 3), len('A', 'C', 10)])!.pins).toEqual(expect.arrayContaining([3, 4]));
    expect(at([...square, len('A', 'B', 3), len('A', 'C', 4)])).toBeNull(); // 4 < 6: the triangle allows it
  });
  it('one segment, two lengths — through a ratio', () => {
    expect(at([rel('A', 'B', 'B', 'C'), len('A', 'B', 3), len('B', 'C', 4)])).toMatchObject({ kind: 'value', seg: ['B', 'C'], forced: 3, stated: 4 });
    expect(at([rel('A', 'B', 'C', 'D', 2), len('C', 'D', 2), len('A', 'B', 4)])).toBeNull(); // |AB| = 2·|CD| holds
  });
  it('a ratio cycle alone is no conflict: every length zero satisfies it', () => {
    expect(at([rel('A', 'B', 'C', 'D', 2), rel('C', 'D', 'A', 'B', 1), len('E', 'F', 1)])).toBeNull();
  });
  it('the equality case and anything within the margin is left to the solver', () => {
    expect(at([len('A', 'B', 5), len('B', 'C', 3), len('A', 'C', 8)])).toBeNull();
    expect(at([len('A', 'B', 5), len('B', 'C', 3), len('A', 'C', 8 + CONFLICT_MARGIN * 4)])).toBeNull();
    expect(at([len('A', 'B', 5), len('B', 'C', 3), len('A', 'C', 8 + CONFLICT_MARGIN * 20)])).not.toBeNull();
  });
  it('lengths that never close a triangle, or no length at all, are no conflict', () => {
    expect(at([len('A', 'B', 5), len('C', 'D', 100)])).toBeNull();
    expect(at([rel('A', 'B', 'B', 'C')])).toBeNull();
    expect(at([])).toBeNull();
  });
});
