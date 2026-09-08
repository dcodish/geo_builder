/**
 * #939 (ADR-3D-230) — A SYMBOL THE STUDENT BOUND IS DISPLAYABLE, WHATEVER LANE CONSUMED IT.
 *
 * Found by the #937 design pass, not reported: two symbol lanes of ONE product disagreed about
 * whether a valued symbol still exists. The student wrote «t = 1/2», the figure used it, and the
 * panel then behaved as though no `t` had ever been mentioned — while «p = 3» from the coordinate
 * lane sat there as a closed row.
 *
 * MEASURED before the fix, through the real `parse3 → derive3 → dataView` path at seed 0. The sweep
 * is over every producer that BINDS a symbol, which is what turned a one-lane report into a
 * three-lane defect:
 *
 * | the student typed | owner kind | `figureSymbolsOf` | panel row |
 * | --- | --- | --- | --- |
 * | `c(p²,1,0)` · `p=3` | pin-sym | p | `p = 3` |
 * | `SN = k·SC` | vec-def | k | `k = ?` |
 * | `D(3,p,0)` · `p = 2` (#814) | component | **—** | **—** |
 * | `∠SAB = α` · `α = 70` | angle | **—** | **—** |
 * | `E על SA כך ש-SE = t·SA` · `t = 1/2` (#921) | rider | **—** | **—** |
 *
 * `symbolOwnersOf` — the ADDRESS registry, #902's one resolver for "what does this letter denote" —
 * knew all six kinds. `figureSymbolsOf`, the DISPLAY registry, listed three of them by hand, and its
 * docblock justified the gap as deliberate. It was not: it was three lanes added after #480 that
 * nobody joined up. The display registry is now DERIVED from the address one, so the two cannot drift
 * again, and the pricing lives in one place per owner kind.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { figureSymbolsOf, symbolOwnersOf } from '../engine/types';

function panelOf(steps: string[]) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const u of steps) useGeo3.getState().submit(u);
  expect(useGeo3.getState().lastError, `«${steps[steps.length - 1]}» must build`).toBeNull();
  const d = derive3(useGeo3.getState().facts, 0);
  return { c: d.construction, params: dataView(d.construction, 0).params, syms: figureSymbolsOf(d.construction) };
}

const row = (params: { sym: string; text: string; open: boolean }[], sym: string) => params.find((p) => p.sym === sym);

const PYRAMID = 'פירמידה SABCD שבסיסה ריבוע';
const RIDER = 'E על SA כך ש-SE = t·SA';

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

describe('#939 — the reported lane: a valued rider ratio', () => {
  it('«t = 1/2» is a CLOSED row, the way «p = 3» is', () => {
    const { params } = panelOf([PYRAMID, RIDER, 't = 1/2']);
    expect(row(params, 't')).toEqual({ sym: 't', text: 't = 1/2', open: false });
  });

  it('and an UNVALUED «t» still reads open — this is not "always print something"', () => {
    const { params } = panelOf([PYRAMID, RIDER]);
    expect(row(params, 't')).toEqual({ sym: 't', text: 't = ?', open: true });
  });
});

describe('#939 — the class: every producer that binds a symbol', () => {
  it('a named COMPONENT (#814): «D(3,p,0)» then «p = 2»', () => {
    expect(row(panelOf(['תיבה ABCD', 'D(3,p,0)']).params, 'p')?.open).toBe(true);
    expect(row(panelOf(['תיבה ABCD', 'D(3,p,0)', 'p = 2']).params, 'p')).toEqual({ sym: 'p', text: 'p = 2', open: false });
  });

  it('an ANGLE letter: «∠SAB = α» then «α = 70»', () => {
    expect(row(panelOf([PYRAMID, '∠SAB = α']).params, 'α')?.open).toBe(true);
    expect(row(panelOf([PYRAMID, '∠SAB = α', 'α = 70']).params, 'α')).toEqual({ sym: 'α', text: 'α = 70', open: false });
  });

  it('THE INVARIANT, stated over the registry itself: no owner kind is displayable-by-accident', () => {
    // The lock that makes a SEVENTH lane fail rather than quietly skip: every letter the address
    // registry can resolve must be in the display registry. Asserted on a figure carrying the three
    // kinds that were missing, so it is exercised rather than vacuous.
    const { c, syms } = panelOf([PYRAMID, RIDER, '∠SAB = α']);
    expect(syms.length, 'the figure must carry symbols or this test checks nothing').toBeGreaterThanOrEqual(2);
    for (const sym of syms) expect(symbolOwnersOf(c, sym).length, `${sym} has no owner`).toBeGreaterThan(0);
    // …and the converse, on the letters this figure actually binds.
    for (const sym of ['t', 'α']) {
      expect(symbolOwnersOf(c, sym).length, `${sym} must be addressable`).toBeGreaterThan(0);
      expect(syms, `${sym} must be displayable`).toContain(sym);
    }
  });
});

describe('#939 — the lanes that already worked are BYTE-UNCHANGED', () => {
  it('the coordinate lane: «c(p²,1,0)» · «p=3»', () => {
    expect(row(panelOf(['תיבה ABCD', 'c(p²,1,0)']).params, 'p')).toEqual({ sym: 'p', text: 'p = ?', open: true });
    expect(row(panelOf(['תיבה ABCD', 'c(p²,1,0)', 'p=3']).params, 'p')).toEqual({ sym: 'p', text: 'p = 3', open: false });
  });

  it('the vec-def ratio lane: «SN = k·SC»', () => {
    expect(row(panelOf([PYRAMID, 'SN = k·SC']).params, 'k')).toEqual({ sym: 'k', text: 'k = ?', open: true });
  });
});
