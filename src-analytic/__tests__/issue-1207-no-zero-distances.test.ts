/**
 * #1207 — A MENU ENTRY WHOSE ANSWER CAN ONLY BE ZERO IS NOT WORTH OFFERING.
 *
 * Operator, 2026-09-18, playing T2: *"there is no need to show the distance to segments that make up
 * that point since they will be 0 and no one would want to ask that"*.
 *
 * Clicking `C` on the triangle used to offer three distances — to `AB` (the height, the question the
 * student came to ask) and to `BC` and `CA`, which are distances from a point to a line through that
 * point, and therefore **zero by construction** at every configuration of every figure.
 *
 * ## This overrides a deliberate choice, which is why it is locked rather than just changed
 *
 * ADR-AG-088 kept those two and merely ordered the height first, reasoning that the menu's contract is
 * «offered iff the ask lane answers it» and the lane does answer 0. That contract still holds either
 * way — so the ruling is a product judgement, not a bug fix, and a future session reading only the ADR
 * would have every reason to put them back. This file is where it says not to.
 *
 * The exclusion is STRUCTURAL — by the name the line is made of — and the last case here is the one
 * that matters: a named line that merely happens to pass through the point is still offered, because
 * another configuration may move it off and the student may genuinely want to ask.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { measurablesOf } from '../app/measurable';
import { fmtNum } from '../../shell/format';

const TRI = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];
const fmt = (n: number) => fmtNum(n);
const menu = (lines: string[], id: string) =>
  measurablesOf(derive(lines, 0).construction, { kind: 'point', id }).map((m) => m.sentence);

describe('#1207 — the sides through the clicked point are not offered', () => {
  it('clicking a vertex offers its name and the HEIGHT, and nothing else', () => {
    expect(menu(TRI, 'C')).toEqual(['C', 'המרחק מ-C לישר AB']);
  });

  it('it is the same rule at every vertex, not a special case for C', () => {
    expect(menu(TRI, 'A')).toEqual(['A', 'המרחק מ-A לישר BC']);
    expect(menu(TRI, 'B')).toEqual(['B', 'המרחק מ-B לישר CA']);
  });

  it('what remains is still something the ask lane ANSWERS, and not zero', () => {
    /**
     * The menu's original contract survives the narrowing: every option offered is a sentence the lane
     * answers. Asserted by CALLING the lane, and asserted to be non-zero, which is the new half.
     */
    const d = derive(TRI, 0);
    for (const sentence of menu(TRI, 'C').slice(1)) {
      const a = ask(d, sentence, fmt, () => 'curve');
      expect(a.unreadable, `«${sentence}» was not understood`).toBeUndefined();
      expect(a.missing, `«${sentence}» named something absent`).toBeUndefined();
      expect(a.value, `«${sentence}» has no answer`).not.toBeNull();
      expect(Number(a.value), `«${sentence}» answers zero — the thing this issue removes`).not.toBe(0);
    }
  });

  it('a NAMED line that merely passes through the point is STILL offered', () => {
    /**
     * The boundary that keeps the exclusion honest. `l1` is `y = 0`, which passes through `A(0,0)`, so
     * today it answers 0 — but it is not made OF `A`, another configuration may move it off, and a
     * positional "is the answer zero" test would have wrongly removed it.
     */
    const lines = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'נתון הישר l1: y=0'];
    expect(menu(lines, 'A')).toContain('המרחק מ-A לישר l1');
    // ...while the side A is an endpoint of is still gone.
    expect(menu(lines, 'A')).not.toContain('המרחק מ-A לישר AB');
  });

  it('#1048’s guard survives: a point with nothing to measure to offers only its own name', () => {
    expect(menu(['נתונה הנקודה A(2,5)'], 'A')).toEqual(['A']);
  });
});
