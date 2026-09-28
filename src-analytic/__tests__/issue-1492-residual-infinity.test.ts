/**
 * A RELATIVE RESIDUAL HAS NO BUSINESS WITH A ZERO AT INFINITY (#1492, ADR-AG-170).
 *
 * The kite (prod session `j73pikxb`): `CB = CD` normalised by `max(1, |l|, |r|)` — for C sliding
 * out along its line the numerator tends to a constant and the denominator grows without bound, so
 * the descent followed the residual outward; measured C = (−3081, 6179), "satisfied" at 3.9e-4,
 * 11 of 24 raw seeds lost. `length-eq` now divides by the STATED figure's own span
 * (`residualScale`, the search span's points), which cannot follow a free point anywhere.
 *
 * Measured at the fix (baseline → after): kite 13/24 → 21/24, kite+circle 13/24 → 21/24. The three
 * surviving seeds are a DIFFERENT class — C finite, a stuck basin with a ring fault — so the locks
 * assert the CLASS (no runaway C at any seed) plus the measured whole-rate, not the plan's guessed
 * 22 (a lock is a hypothesis too; the basin class is not this fix's).
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { applyFact } from '../engine/apply';
import { evaluate } from '../engine/evaluate';
import { derive } from '../engine/derive';
import { EMPTY_CONSTRUCTION, type Construction } from '../engine/types';

const KITE = ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
const KITE_CIRCLE = [...KITE, 'מעגל ABD'];

function buildC(lines: string[]): Construction {
  let c: Construction = EMPTY_CONSTRUCTION;
  for (const l of lines) {
    const r = parseLine(l);
    if (!r.ok) throw new Error(`parse failed: ${l}`);
    for (const f of r.facts) {
      const a = applyFact(c, f);
      if (!a.ok) throw new Error(`apply failed: ${l}`);
      c = a.next;
    }
  }
  return c;
}

const wholeRate = (c: Construction) => {
  let whole = 0;
  let maxC = 0;
  for (let s = 0; s < 24; s += 1) {
    const f = evaluate(c, s);
    const ok = f.unsatisfied.length === 0 && f.ringFaults.length === 0 && f.selectorsOk;
    if (ok) whole += 1;
    // The class assertion holds on the seeds the student can SEE: a failing seed may stall far
    // out (the search rejects it), but a WHOLE seed with C at thousands would be the asymptote
    // drawn green — the original defect.
    const C = f.points.find((p) => p.id === 'C');
    if (ok && C) maxC = Math.max(maxC, Math.hypot(C.x, C.y));
  }
  return { whole, maxC };
};

describe('#1492 — the kite’s C stays home at every seed', () => {
  it('the operator’s kite: the class is GONE — C never runs away, and the whole-rate is at least the measured 21/24', () => {
    const { whole, maxC } = wholeRate(buildC(KITE));
    // Before the fix C reached ~6900 from the origin; the figure itself spans ~20 units. Any C an
    // order of magnitude past the figure is the asymptote back.
    expect(maxC).toBeLessThan(200);
    expect(whole).toBeGreaterThanOrEqual(21);
  });

  it('with the circle through A, B, D likewise', () => {
    const { whole, maxC } = wholeRate(buildC(KITE_CIRCLE));
    expect(maxC).toBeLessThan(200);
    expect(whole).toBeGreaterThanOrEqual(21);
  });

  it('the page’s own path still builds the kite green and fast', () => {
    const t0 = Date.now();
    const d = derive(KITE_CIRCLE, 0);
    expect(d.faults).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('a figure measured in THOUSANDS still converges — the scale follows the figure, never the operand', () => {
    const d = derive(['A(0,0)', 'B(4000,0)', 'נקודה M', 'MA = MB'], 0);
    expect(d.faults).toEqual([]);
    const m = d.figure.points.find((p) => p.id === 'M')!;
    expect(m.x).toBeCloseTo(2000, 0);
  });
});
