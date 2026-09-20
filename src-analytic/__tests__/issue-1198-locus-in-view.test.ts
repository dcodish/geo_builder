/**
 * #1198 (ADR-AG-120) — the frame contains the locus the student asked to see.
 *
 * **Operator, 2026-09-18, playing round #1193 T11:** *"pressing on show another config causes the
 * image to jump right and left and the entire shape is not shown."*
 *
 * ```
 * A(-9a,0) · B(41a,0) · נקודה P · PA מאונך ל-PB     then  «המקום הגיאומטרי של P»
 * ```
 *
 * Measured on `main` before the fix, the traced circle fell outside the view box in **4 of 6**
 * configurations. The box frames the FIGURE, and a trace is not in the figure — it is caller-owned
 * decoration handed to the renderer afterwards, so it was projected into a frame decided without it.
 *
 * ## The lock is CONTAINMENT over a sweep, not numbers
 *
 * Asserting the measured boxes would pin this figure's arithmetic and would go red for any harmless
 * change to padding. The property is *the thing the student asked for is on screen*, and it is
 * asserted as containment across a sweep of configurations — because the defect was configuration-
 * dependent, and a single-seed assertion would have passed on seeds 2 and 4 while the tool clipped
 * the other four.
 *
 * It CALLS `drawnBox`, which is why that composition was extracted from the component
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)): a test that re-computed the union here
 * would stay green through the component forgetting to use it.
 *
 * ## ⚠ Half of #1198 is NOT fixed, and one row says so out loud
 *
 * The frame still lurches between configurations. That is a product ruling about what «הציגו תצורה
 * אחרת» should feel like, and the issue splits it deliberately. The row below pins the lurch as a
 * KNOWN state so that a later change to it is a deliberate act with a ruling behind it, rather than
 * something that drifts in unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { drawnBox } from '../app/drawnBox';
import type { Box } from '../engine/curves';

const LINES = ['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'];
const LOCUS_Q = 'המקום הגיאומטרי של P';
const SEEDS = [0, 1, 2, 3, 4, 5];

/** One configuration: its trace, and the frame the canvas would actually use for it. */
function frameAt(seed: number, shown = true) {
  const d = derive(LINES, seed);
  const a = ask(d, LOCUS_Q, (v) => String(+v.toFixed(4)), (k) => k);
  const answers = [{ shown, locus: a.locus }];
  return { d, trace: a.locus?.points ?? [], box: drawnBox(d.figure, d.box, answers) };
}

const contains = (b: Box, ps: Array<{ x: number; y: number }>) =>
  ps.every((p) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY);

describe('ADR-AG-120 — the traced locus is inside the view (#1198)', () => {
  it.each(SEEDS)('configuration %i contains its whole trace', (seed) => {
    const { trace, box } = frameAt(seed);
    expect(trace.length, `seed ${seed} produced no trace — the figure under test changed`).toBeGreaterThan(0);
    expect(contains(box, trace), `seed ${seed}: the trace is clipped by the frame`).toBe(true);
  });

  /**
   * THE BASELINE, asserted rather than written in a comment: the FIGURE's own box — the frame before
   * this fix — still clips the trace on most of these seeds. If this ever stops being true, the
   * defect went away for some other reason and this lock is no longer measuring what it claims to.
   */
  it('the figure-only box — what the canvas used before — still clips most of them', () => {
    const cut = SEEDS.filter((seed) => {
      const { d, trace } = frameAt(seed);
      return !contains(d.box, trace);
    });
    expect(cut.length, 'the pre-fix frame should still be the clipping one').toBeGreaterThanOrEqual(3);
  });

  /**
   * A COLLAPSED answer is not on the canvas. Framing for a trace the student has hidden would zoom
   * out for something invisible, which is the opposite failure and just as confusing.
   */
  it('a hidden answer does not widen the frame', () => {
    const shown = frameAt(0, true).box;
    const hidden = frameAt(0, false).box;
    const { d } = frameAt(0, false);
    expect(hidden).toEqual(d.box);
    expect(hidden).not.toEqual(shown);
  });

  /**
   * NO TRACE, NO CHANGE — and returned as the SAME box, not an equal one built a second way. The
   * auto-refit effect keys on the box's numbers, so a recomputation differing in the last bit would
   * re-frame the canvas under a student who had deliberately zoomed.
   */
  it('a figure with no locus keeps its own box, identically', () => {
    const d = derive(['A(0,0)', 'B(6,8)', 'משולש ABC']);
    expect(drawnBox(d.figure, d.box, [])).toBe(d.box);
    expect(drawnBox(d.figure, d.box, [{ shown: true }])).toBe(d.box);
  });

  /**
   * ⚠ THE HALF THAT IS NOT FIXED. The frame is still re-fitted from nothing on every press, so its
   * width varies by a large factor across configurations — which is the «jumping right and left»
   * the operator also reported. Pinned as a KNOWN state: when a ruling lands and this improves, the
   * row fails and sends the reader to the ruling rather than letting the change pass unnoticed.
   */
  it('the frame still lurches between configurations — #1198 symptom 2, unfixed on purpose', () => {
    const widths = SEEDS.map((seed) => {
      const { box } = frameAt(seed);
      return box.maxX - box.minX;
    });
    const factor = Math.max(...widths) / Math.min(...widths);
    expect(factor, 'if this dropped, symptom 2 was addressed — read the ruling on #1198').toBeGreaterThan(2);
  });
});
