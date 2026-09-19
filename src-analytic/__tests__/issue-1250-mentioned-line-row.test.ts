/**
 * #1250 (ADR-AG-113) — a MENTIONED line keeps its equation row; an incidental one does not.
 *
 * Operator, 2026-09-19, playing round #1244:
 *   T15 *"משוואת הצלע CE היא x-3y=0 should appear in the data panel under lines"*
 *   T16 *"משוואת הישר CE היא x-3y=0 does add it do the data panel"*
 *
 * Two sentences stating the same equation about the same object, and only one put it in the panel.
 *
 * The panel filtered on `stated`, carrying the #1078 ruling — but **that objection was about an
 * ORPHANED row, not an undrawn one**: *"there is no way to know what it belongs to"*. Those two
 * coincided until ADR-AG-111 made a mentioned line undrawn for the first time.
 *
 * His ruling: *"if we say that a point is on a line, we dont draw the line but if we specifically
 * mention a line, we should have its equation."* So the panel asks whether the line was **mentioned**
 * and the canvas keeps asking `stated`.
 *
 * The lock is written against the SAME predicate the panel uses, applied to a real derivation, so it
 * cannot pass by re-implementing the filter. `#1078`'s row is the regression guard for the earlier
 * ruling and is the reason the predicate is the NAME rather than `!stated`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { panelListsCurve } from '../app/panelRows';

/** The panel's own question, asked of a real figure. */
const panelRows = (seq: string[]): { name: string; drawn: boolean }[] => {
  const { figure } = derive(seq, 0) as unknown as {
    figure: { curves: { stated: boolean; label: { name: string } }[] };
  };
  // CALLS the panel’s own decision — never a copy of it (ADR-W-053).
  return figure.curves.filter(panelListsCurve).map((c) => ({ name: c.label.name, drawn: c.stated }));
};

/** The canvas's question — deliberately a DIFFERENT one, and it must stay different. */
const drawnCurves = (seq: string[]): string[] => {
  const { figure } = derive(seq, 0) as unknown as { figure: { id: string; stated: boolean }[] } & {
    figure: { curves: { id: string; stated: boolean }[] };
  };
  return figure.curves.filter((c) => c.stated).map((c) => c.id);
};

const BASE = ['משולש ABC', 'BD תיכון לצלע AC', 'CE תיכון לצלע AB'];
const HEISHAR = 'משוואת הישר CE היא x-3y=0';
const HATZELA = 'משוואת הצלע CE היא x-3y=0';
const BARE = 'משוואת CE היא x-3y=0';

describe('ADR-AG-113 — the panel lists a line the student MENTIONED (#1250)', () => {
  it.each([
    ['«משוואת הצלע CE» — T15, the reported case', HATZELA],
    ['«משוואת הישר CE» — T16, already worked', HEISHAR],
    ['«משוואת CE» — T17, the bare form', BARE],
  ])('%s leaves an equation row naming CE', (_n, line) => {
    expect(panelRows([...BASE, line]).map((r) => r.name)).toEqual(['CE']);
  });

  /** ONE row, not two — a wider predicate must not double-count the drawn case. */
  it('the drawn case still gets exactly one row', () => {
    expect(panelRows([...BASE, HEISHAR])).toHaveLength(1);
  });

  /**
   * #1078's RULING, preserved. An incidental line — scaffolding to place a point — has no name and
   * gets no row. This is why the predicate is `label.name` and not `!stated`.
   */
  it('an incidental carrier still gets NO row', () => {
    expect(panelRows(['B על הישר y=x'])).toEqual([]);
  });

  /**
   * THE CANVAS IS UNTOUCHED. The operator's other 2026-09-19 ruling — *"only draws CE"* — depends on
   * the two questions staying different, so a bounded noun must still draw nothing extra.
   */
  it('a bounded noun still draws no line', () => {
    expect(drawnCurves([...BASE, HATZELA])).toEqual([]);
  });

  it('a line noun still draws the line', () => {
    expect(drawnCurves([...BASE, HEISHAR])).toEqual(['line-CE']);
  });

  /** The row knows which of the two it is, so the panel can say so rather than sit unlabelled. */
  it('the row records whether the line is drawn', () => {
    expect(panelRows([...BASE, HATZELA])[0].drawn).toBe(false);
    expect(panelRows([...BASE, HEISHAR])[0].drawn).toBe(true);
  });
});
