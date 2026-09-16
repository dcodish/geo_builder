/**
 * #1114 — a pair of curves has only so many crossings, and a sentence naming one more is refused.
 *
 * Split out of #1113 while fixing it, so the residue was tracked rather than hidden behind a green test.
 * #1113 made the two crossings of one line × conic pair land on the two different roots; a **third**
 * sentence on the same pair still built.
 *
 * **Measured, and worse than the issue recorded.** Naming `R` did not merely stack it on `P` — it
 * dragged `Q` there too:
 *
 * ```
 * P(0.92, 1.84)  Q(3.48, 6.96)                    ← two crossings, correct
 * P(0.92, 1.84)  Q(0.92, 1.84)  R(0.92, 1.84)     ← after naming a third
 * ```
 *
 * ## Why this did not have to wait for #1071
 *
 * `crossing-distinct` DETECTED it — `selectorsOk` was false — but `derive` reports a failing selector
 * only when the figure has no freedom left, and here `A` and `B` are free on the line. That gate is
 * deliberate and its general question is #1071's: with freedom left, 24 exhausted seeds are evidence and
 * not proof, and reporting on them could refuse a satisfiable figure.
 *
 * **This case is a COUNTING argument, not a sampling one.** A straight meets a conic in at most two
 * points at ANY configuration, with any amount of freedom, so three such sentences cannot all hold under
 * any seed — the "vacuously never" reasoning of ADR-AG-008 / #1058. No seed search is involved and no
 * satisfiable figure can be wrongly refused, so the refusal lives beside the construct in `applyFact`
 * and `derive`'s freedom gate is untouched.
 *
 * ## The bound is structural
 *
 * It comes from the curve KINDS alone, never their parameters — which is what lets it run at apply time,
 * before anything is evaluated.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const LINE = 'משוואת הישר AB היא y=2x';
const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const cross = (id: string, which?: 'first' | 'second') =>
  `${id} נקודת החיתוך ${which === 'first' ? 'הראשונה ' : which === 'second' ? 'השנייה ' : ''}של הישר AB עם המעגל I`;

const at = (lines: string[], id: string) => derive(lines, 0).figure.points.find((p) => p.id === id);

describe('#1114 — a third crossing of a two-root pair is refused', () => {
  it('the reported figure: R is refused, naming the student’s own sentence', () => {
    const d = derive([LINE, CIRCLE, cross('P', 'first'), cross('Q', 'second'), cross('R')], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].index).toBe(4);
    expect(d.faults[0].code).toBe('unsatisfiable');
    expect(d.faults[0].detail).toBe(cross('R'));
  });

  it('CONTROL — two crossings still build, at the two DIFFERENT roots', () => {
    /**
     * The half that makes this a bound rather than a blanket refusal. #1113 exists to make these two
     * land on different roots, and a cap that broke it would be a worse defect than the one fixed.
     */
    const lines = [LINE, CIRCLE, cross('P', 'first'), cross('Q', 'second')];
    expect(derive(lines, 0).faults).toHaveLength(0);
    const p = at(lines, 'P');
    const q = at(lines, 'Q');
    expect(p).toBeDefined();
    expect(q).toBeDefined();
    expect(Math.hypot(p!.x - q!.x, p!.y - q!.y)).toBeGreaterThan(1);
  });

  it('CONTROL — one crossing alone is untouched', () => {
    expect(derive([LINE, CIRCLE, cross('P')], 0).faults).toHaveLength(0);
  });

  it('two STRAIGHTS meet once, so a second name on that pair is refused', () => {
    /**
     * The same bound at a different arity, which is what makes it a rule rather than the number two
     * written down twice.
     */
    const base = ['נתון הישר l1: y=2x', 'נתון הישר l2: y=-x+6'];
    const meet = (id: string) => `${id} נקודת החיתוך של הישר l1 עם הישר l2`;
    expect(derive([...base, meet('P')], 0).faults).toHaveLength(0);

    const d = derive([...base, meet('P'), meet('Q')], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].detail).toBe(meet('Q'));
  });

  it('a DIFFERENT pair is unaffected — the cap is per pair, not per point', () => {
    const d = derive(
      [LINE, CIRCLE, 'נתון הישר l9: y=1', cross('P', 'first'), cross('Q', 'second'),
       'S נקודת החיתוך של הישר l9 עם המעגל I'],
      0,
    );
    expect(d.faults).toHaveLength(0);
  });
});
