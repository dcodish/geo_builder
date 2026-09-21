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
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, evaluate, knownOptions } from '../engine/evaluate';
import { apart } from '../engine/crossings';

const LINES = ['A(3,4)', 'B(0,4)', 'משוואת המעגל x^2+y^2=25', 'P נקודת החיתוך של הישר AB עם המעגל x^2+y^2=25'];
const at = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((p) => p.id === id)!;
const stacked = (f: { points: { x: number; y: number }[] }) => {
  const near = apart(f as never);
  const ps = f.points;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < near) return true;
  return false;
};

describe('#1273 — the figure opens on a configuration that separates its named points', () => {
  it('the raw configuration at seed 2 stacks P on A — the measured baseline this lock protects against', () => {
    const c = derive(LINES, 0).construction;
    const raw = evaluate(c, 2);
    expect(stacked(raw), 'seed 2 alone puts P on A').toBe(true);
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

  it('a preference, not a filter: the knowledge pool still holds both roots — the stacked one is admissible, it is just not what opens', () => {
    const c = derive(LINES, 0).construction;
    const opts = knownOptions(c, (f) => { const p = f.points.find((q) => q.id === 'P'); return p ? [p.x, p.y] : null; });
    expect(opts, 'the honesty gates see every admissible configuration').not.toBeNull();
    expect(opts!.map((o) => Math.round(o[0])).sort()).toEqual([-3, 3]);
  });

  it('a figure where NO configuration separates two named points still draws — refusing the statement is #1254’s half', () => {
    const d = derive(['A(2,2)', 'B(2,2)'], 0);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(stacked(d.figure)).toBe(true);
    const shown = drawableAt(d.construction, 0, true);
    expect(shown.points).toHaveLength(2);
  });

  it('the tolerance is the figure’s own — relative to its span, the ring filter’s ruler (ADR-AG-021)', () => {
    const small = { points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }] };
    const big = { points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3000, y: 0 }] };
    expect(apart(big as never) / apart(small as never)).toBeCloseTo(1000, 6);
  });
});
