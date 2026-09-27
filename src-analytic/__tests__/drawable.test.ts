/**
 * THE HONESTY GATE MEASURES WHAT THE TOOL WOULD DRAW (#1083).
 *
 * Operator, 2026-09-15: *"on this shape, point C should be able to be positioned"* — on a figure
 * whose `C` was identical at every configuration he could reach, and which the panel called open.
 *
 * `derive` advances the seed until the SELECTORS hold, because a configuration that fails them is not
 * a figure this tool shows. The gates called `evaluate` directly and judged "does this value vary?"
 * across configurations that had been rejected before they ever reached the canvas.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, evaluate, isKnowledge, knownOptions } from '../engine/evaluate';

/** The operator's own figure. */
const KITE = [
  'דלתון ABCD',
  'DB',
  'AC',
  'משוואת האלכסון המשני היא y=-x+2',
  'אלכסוני המרובע נפגשים בנקודה O',
  'שטח משולש BCD גדול פי 3 משטח משולש ABD',
  'AC=8√2',
  'C ברביע השלישי',
  'נקודה C על הישר y=2x+5',
];

const known = (lines: string[], id: string) => {
  const d = derive(lines, 0);
  const x = isKnowledge(d.construction, (f) => f.points.find((p) => p.id === id)?.x ?? null);
  const y = isKnowledge(d.construction, (f) => f.points.find((p) => p.id === id)?.y ?? null);
  return x.known && y.known ? [x.value, y.value] : null;
};
const options = (lines: string[], id: string) => {
  const d = derive(lines, 0);
  return knownOptions(d.construction, (f) => {
    const p = f.points.find((q) => q.id === id);
    return p ? [p.x, p.y] : null;
  });
};

describe('#1083 — the gate samples DRAWABLE configurations', () => {
  it('the operator’s C reads as a position', () => {
    const c = known(KITE, 'C');
    expect(c).not.toBeNull();
    expect(c!.map((n) => Number(n.toFixed(3)))).toEqual([-5, -5]);
  });

  it('and the raw configurations it used to judge were ones the tool rejects', () => {
    // The measurement that found it: three raw seeds (0–2) put C in three different places, and NONE
    // of them was a figure this tool would show.
    //
    // #1463 moved the raw half: the solve now PREFERS a converged configuration the selectors accept
    // (this figure's raw seeds went from 4/24 whole to 23/24 — B and D no longer collapse), so the
    // operator's own figure no longer exhibits it. The claim is kept on a figure whose raw solve still
    // fails at some seeds (a circle through three kite vertices: the other half is a separate basin):
    // wherever the raw attempt is not whole, the gate must judge what the tool DRAWS there.
    const whole = (f: ReturnType<typeof evaluate>) => f.selectorsOk && f.unsatisfied.length === 0;
    const own = derive(KITE, 0).construction;
    let ownWhole = 0;
    for (let seed = 0; seed < 24; seed += 1) if (whole(evaluate(own, seed))) ownWhole += 1;
    expect(ownWhole, 'raw whole seeds on the operator’s figure, since #1463').toBeGreaterThanOrEqual(20);

    const c = derive(
      ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל'],
      0,
    ).construction;
    let exercised = 0;
    for (let seed = 0; seed < 24; seed += 1) {
      if (whole(evaluate(c, seed))) continue;
      exercised += 1;
      // While the drawable figure at that same seed is one the student can see.
      expect(whole(drawableAt(c, seed)), `drawable ${seed}`).toBe(true);
    }
    // An exercised-counter, so the loop cannot pass by checking nothing.
    expect(exercised).toBeGreaterThan(0);
  });

  it('a figure with no selectors is unaffected — the same figure, the same answer', () => {
    const plain = ['A(0,0)', 'B(4,0)', 'C(0,3)'];
    const c = derive(plain, 0).construction;
    expect(JSON.stringify(drawableAt(c, 0).points)).toBe(JSON.stringify(evaluate(c, 0).points));
    expect(known(plain, 'B')!.map(Math.round)).toEqual([4, 0]);
  });
});

describe('#1083 — it did not become permissive', () => {
  it('a value that genuinely varies still reads open', () => {
    expect(known(['משולש ABC'], 'A')).toBeNull();
  });

  it('a point free inside a REGION still reads open', () => {
    // A quadrant consumes no freedom, so every drawable configuration puts C somewhere else.
    expect(known(['C ברביע השלישי'], 'C')).toBeNull();
    expect(options(['C ברביע השלישי'], 'C')).toBeNull();
  });

  it('and two genuine roots are still TWO, not one', () => {
    const opts = options(['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7'], 'C');
    expect(opts).toHaveLength(2);
  });
});

describe('#1083 — two independent solves that found the same answer are ONE answer', () => {
  it('solver noise is not a second option', () => {
    /**
     * The second half of the defect. Twenty-four drawable configurations of the operator's figure all
     * found `C = (-5, -5)`, spread over `1.1e-5` — and at the RESIDUAL tolerance that read as five
     * distinct answers, so the panel offered five identical-looking options.
     *
     * `SATISFIED_EPS` is how small a residual must be for one configuration to satisfy its givens.
     * How far apart two independent least-squares descents may land and still be the same solution is
     * a different question with a larger answer.
     */
    expect(options(KITE, 'C')).toBeNull(); // one answer, so not an option SET
    const c = known(KITE, 'C');
    expect(c).not.toBeNull();
  });
});
