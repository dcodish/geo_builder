/**
 * #1220 — «הציגו תצורה אחרת» CAN SEE A CURVE CHANGE.
 *
 * **Operator, 2026-09-19, playing T24** on «נתונה פרבולה שמשוואתה y^2=2px»: *"p is unknown but when i
 * ask for another config, there is no other config which is wrong"*.
 *
 * ## The engine was innocent
 *
 * ```
 * seed 1  p =  1.314     seed 3  p = -2.889
 * seed 2  p = -3.400     seed 7  p = -3.754     seed 15  p =  3.491
 * ```
 *
 * Five seeds, five genuinely different parabolas, all drawn. ADR-052 is honoured — `p` is sampled as
 * the free DOF it is, and no default masquerades as fixed.
 *
 * ## The signature could not see it
 *
 * `signature` mapped `figure.points` alone, and that figure has none — one curve and nothing else. So
 * the signature was the empty string at every seed, `anotherConfiguration` exhausted its 24 tries, and
 * the seed never moved.
 *
 * That last part is what makes it wrong rather than merely unhelpful. The function's own comment says
 * *"when nothing differs, saying so is the honest answer. A determined figure has one configuration"* —
 * so `found: false` MEANS "this figure is determined", and it said that about a figure with infinitely
 * many. The reasoning was right; the signature underneath it excluded an entire class of figure.
 *
 * ## The trap in the fix
 *
 * A line's coefficients cannot be signed raw: `(a, b, c)` and `(2a, 2b, 2c)` are the same line, and
 * the solve can land on differently scaled triples across seeds. Signing those raw would make one
 * line look like two and the button would claim "another configuration" while redrawing an identical
 * picture — the failure in the opposite direction the same comment warns about. `normalizedLine`
 * (#1201) is the one place that decides when two lines are the same line, and it is called.
 */
import { describe, expect, it } from 'vitest';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';

/** The operator's figure: one curve, no points, `p` free. */
const PARABOLA = ['נתונה פרבולה שמשוואתה y^2=2px'];

describe('#1220 — a figure whose only freedom is a curve parameter has other configurations', () => {
  it("the operator's parabola finds one", () => {
    const r = anotherConfiguration(PARABOLA, 0);
    expect(r.found, 'the button no longer claims the figure is determined').toBe(true);
    expect(r.seed, 'and it actually moves').not.toBe(0);
  });

  it('and the parabola it moves to is genuinely a different one', () => {
    /**
     * The point of the button, not just the flag it returns. Reading `p` at both seeds proves the
     * student sees a different figure rather than a re-render.
     */
    const r = anotherConfiguration(PARABOLA, 0);
    const pAt = (seed: number) => {
      const c = derive(PARABOLA, seed).figure.curves[0]?.curve;
      return c && c.kind === 'parabola' ? c.p : NaN;
    };
    expect(Math.abs(pAt(0) - pAt(r.seed))).toBeGreaterThan(1e-3);
  });

  it('the figure has no points at all — which is why it was invisible', () => {
    expect(derive(PARABOLA, 0).figure.points).toHaveLength(0);
  });

  it('A DETERMINED FIGURE STILL SAYS THERE IS NO OTHER — the anti-lock', () => {
    /**
     * The fix must not make the button always claim success. A figure with every coordinate stated
     * has exactly one configuration, and saying so is the honest answer.
     */
    const fixed = ['A(0,0)', 'B(3,4)', 'C(6,0)', 'משולש ABC'];
    expect(anotherConfiguration(fixed, 0).found).toBe(false);
  });

  it('a figure with points AND curves still works — the point half is unchanged', () => {
    const mixed = ['A על הישר y=x', 'B על הישר y=2x+1'];
    expect(anotherConfiguration(mixed, 0).found).toBe(true);
  });

  it('a STATED line is determined, and adding one does not invent freedom', () => {
    /**
     * The normalisation guard, from the other side: a stated line is the same line at every seed, so
     * signing it must not make the button claim a new configuration. If `normalizedLine` were dropped
     * and raw coefficients signed, solver scaling could flip this to `true`.
     */
    expect(anotherConfiguration(['נתון הישר l1: y=2x+1'], 0).found).toBe(false);
    expect(anotherConfiguration(['A(0,0)', 'B(8,0)', 'נתון הישר l1: y=2x+1'], 0).found).toBe(false);
  });
});
