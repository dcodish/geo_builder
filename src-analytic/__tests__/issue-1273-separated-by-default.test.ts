/**
 * #1273 ([ADR-W-072](../../docs/06w-decisions-workspace.md#adr-w-072), [ADR-AG-138](../../docs/06c-decisions-analytic.md#adr-ag-138))
 * — TWO DISTINCT NAMED POINTS ARE NEVER OPENED ON TOP OF EACH OTHER.
 *
 * Operator, 2026-09-20 (T18): *"even if they do fall on the same point by chance … the system should not
 * show them on top of each other. It should automatically look for a different config and show them
 * differently"* — and *"the 2d and 3d tools should follow the same logic"*. 2-D already prefers a
 * separating configuration (ADR-486); this is the analytic port of that ranking, as a display preference
 * below validity: a stacked configuration is remembered and used only when nothing else turns up.
 *
 * The figure: the line through A(3,4) and B(0,4) meets x² + y² = 25 at A itself and at (−3, 4). Measured
 * before, the crossing P landed ON A at seeds 2, 3, 4, 6, 7 and was shown there — two labels at one place.
 *
 * ⚠ **Amended by [ADR-AG-263](../../docs/06c-decisions-analytic.md#adr-ag-263) (#1917).** That figure no
 * longer stacks even RAW: a crossing now STARTS on the root no earlier point holds, so the descent never
 * lands on A and P is determined at (−3,4). The display preference this file locks is unchanged and is
 * still exercised — by a crossing of two STRAIGHTS, which has no root order to start on (`orderedCrossings`
 * answers nothing for a pair of straights), so #1917's block proposes nothing there. The baseline and the
 * not-a-filter property move to that figure; the circle figure keeps its "never shown stacked" promise and
 * gains #1917's determined answer.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, evaluate, knownOptions, knownValues, stackedPairs } from '../engine/evaluate';

const LINES = ['A(3,4)', 'B(0,4)', 'משוואת המעגל x^2+y^2=25', 'P נקודת החיתוך של הישר AB עם המעגל x^2+y^2=25'];
/** Two STRAIGHTS crossing inside a free triangle — the pair #1917's start rule has no order for. */
const STRAIGHTS = ['נתון משולש ABC', 'נקודה D', 'P נקודת החיתוך של הישר AB עם הישר CD'];
const at = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((p) => p.id === id)!;
// CALLS the display's own decision (#1526 moved its ruler off `crossings.apart()`, the identity tolerance).
const stacked = (f: Parameters<typeof stackedPairs>[0]) => stackedPairs(f).length > 0;

describe('#1273 — the figure opens on a configuration that separates its named points', () => {
  it('a raw configuration stacks P on a vertex — the measured baseline this lock protects against', () => {
    const c = derive(STRAIGHTS, 0).construction;
    const stacks = [...Array(16).keys()].filter((s) => stacked(evaluate(c, s)));
    expect(stacks, 'some raw seeds alone put P on a vertex').toEqual([1, 3, 12, 14]);
  });

  it('what is SHOWN at every seed 0–7 keeps P off the vertex, for the straights too', () => {
    for (let seed = 0; seed < 8; seed++) {
      const d = derive(STRAIGHTS, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(stacked(d.figure), `seed ${seed}: shown separated`).toBe(false);
    }
  });

  it('what is SHOWN at every seed 0–7 keeps P apart from A, without the student pressing anything', () => {
    for (let seed = 0; seed < 8; seed++) {
      const d = derive(LINES, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(stacked(d.figure), `seed ${seed}: shown separated`).toBe(false);
      const p = at(d, 'P');
      expect(Math.hypot(p.x + 3, p.y - 4), `seed ${seed}: the other root`).toBeLessThan(1e-6);
    }
  });

  it('a preference, not a filter: the pool still holds the stacked configuration — it is just not what opens', () => {
    // `drawableAt` WITHOUT the spread preference is what the honesty gates read; with it is what the canvas
    // shows. The stacked configuration must stay in the first and never be the second.
    const c = derive(STRAIGHTS, 0).construction;
    const pool = [...Array(16).keys()].filter((s) => stacked(drawableAt(c, s)));
    const shown = [...Array(16).keys()].filter((s) => stacked(drawableAt(c, s, true)));
    expect(pool, 'the honesty gates see every admissible configuration').toEqual([1, 3, 12, 14]);
    expect(shown, 'the display opens on none of them').toEqual([]);
  });

  /**
   * #1917 (ADR-AG-263) — on the circle figure the start itself now avoids A, so P has ONE configuration
   * and the panel says so. Before, `knownOptions` offered «(3,4) או (−3,4)» — the first of them P sitting on
   * A, which this very file's ruling says the tool must never show.
   */
  it('a crossing whose other root is taken is DETERMINED, and the panel no longer offers the stacked root', () => {
    const c = derive(LINES, 0).construction;
    const readPt = (f: Parameters<typeof stackedPairs>[0]) => {
      const p = f.points.find((q) => q.id === 'P');
      return p ? [p.x, p.y] : null;
    };
    expect(knownValues(c, readPt, 2, { fillPool: true })).toEqual({ known: true, value: [-3, 4] });
    expect(knownOptions(c, readPt), 'one value is not an option set').toBeNull();
  });

  it('a figure where NO configuration separates two named points still draws — refusing the statement is #1254’s half', () => {
    const d = derive(['A(2,2)', 'B(2,2)'], 0);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(stacked(d.figure)).toBe(true);
    const shown = drawableAt(d.construction, 0, true);
    expect(shown.points).toHaveLength(2);
  });

  it('the tolerance is the figure’s own — relative to its drawn frame, never absolute (ADR-052; #1526 for the ruler)', () => {
    const small = { points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }, { id: 'C', x: 3.01, y: 0 }], curves: [] };
    const big = { points: small.points.map((q) => ({ ...q, x: q.x * 1000 })), curves: [] };
    expect(stacked(small as never)).toBe(true);
    expect(stacked(big as never)).toBe(true);
  });
});
