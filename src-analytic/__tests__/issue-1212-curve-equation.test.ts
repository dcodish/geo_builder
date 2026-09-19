/**
 * #1212 — A CURVE ROW LEADS WITH ITS EQUATION; THE PROPERTIES FOLD BENEATH IT.
 *
 * **Operator, 2026-09-18, playing T18:** *"the circle equation is not an equation. under equations we
 * should see the equation and then we can have the center and radius. these should be collapsable like
 * i requested for the line equations"*, on a panel reading:
 *
 * ```
 * משוואות
 * מעגל I: O(3, 4), r = 3        ← not an equation
 * l1: -2x + y - 1 = 0           ← an equation
 * ```
 *
 * He is right twice: the row is not an equation, and it sits under a heading that #1147 had renamed to
 * «משוואות» hours earlier — which made the defect visible rather than causing it.
 *
 * ## The defect was wider than the circle
 *
 * `describeCurve` rendered each kind its own way, and TWO of the four printed no equation at all:
 *
 * | kind | before | leads with an equation? |
 * | --- | --- | --- |
 * | line | `-2x + y - 1 = 0` | yes |
 * | circle | `O(3, 4), r = 3` | **no — none at all** |
 * | ellipse | `a = 4, b = 3, F₁(…), F₂(…)` | **no — none at all** |
 * | parabola | `y² = 8x, F(2, 0), x = -2` | yes, with the properties run on inline |
 *
 * Root cause is a stated rule that did not survive being played: *"deliberately DESCRIPTIVE (centre,
 * radius, focus) rather than a restatement of the equation the student just typed"*. A circle can only
 * be stated here BY its equation, so the row was not declining to restate the given — it was replacing
 * the given with a consequence of it, under a heading that promises equations.
 *
 * ## These CALL the decision
 *
 * `curveParts` was module-private component code, reachable from the ask lane only by injection, and
 * every test but one injected a stub. It now has one home in `app/`, which is what lets this file assert
 * the real thing rather than a reproduction of it ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { knownCurve } from '../engine/evaluate';
import { curveParts } from '../app/curveText';
import { fmtAnalytic } from '../format';

/**
 * ⚠ THE LETTERS IN THESE EXPECTATIONS CHANGED — #1167 / ADR-AG-115.
 *
 * They read `O(3, 4)`, `F(2, 0)` and `F₁`/`F₂`, which were string literals inside `curveParts` —
 * letters the tool invented for positions. A figure holding a real point `F` and a parabola printed
 * two different `F`s in one panel, and a circle centred on `A` printed `O(0, 0)` directly beneath
 * `A = (0, 0)`.
 *
 * A described position is now named by the point that OCCUPIES it, and by nothing otherwise. These
 * calls pass no figure, so nobody occupies anything and the coordinates stand alone — the correct
 * answer for a bare call, not a loss of coverage. #1167's own suite covers the naming itself.
 *
 * Nothing about #1212 changed: every assertion on the EQUATION is untouched, and the equation is what
 * this file exists to guard.
 */
describe('#1212 — every curve kind states an equation', () => {
  it('a circle writes the centre-radius form, not its centre and radius', () => {
    expect(curveParts({ kind: 'circle', cx: 3, cy: 4, r: 3 })).toEqual({
      equation: '(x - 3)² + (y - 4)² = 9',
      details: '(3, 4), r = 3',
    });
  });

  it('a zero offset writes no bracket, and a negative one flips the sign', () => {
    // `(x - -2)²` is not notation anyone writes, and `(x - 0)²` is not either.
    expect(curveParts({ kind: 'circle', cx: -2, cy: 0, r: 1 }).equation).toBe('(x + 2)² + y² = 1');
    expect(curveParts({ kind: 'circle', cx: 0, cy: 0, r: 5 }).equation).toBe('x² + y² = 25');
  });

  it('an ellipse writes x²/a² + y²/b² = 1, with its axes and foci folded away', () => {
    const p = curveParts({ kind: 'ellipse', a: 4, b: 3 });
    expect(p.equation).toBe('x²/16 + y²/9 = 1');
    // a = 4, b = 3 → c² = 7, so the foci are at (±√7, 0) — present, but no longer the whole row.
    // `ellipseFoci` names the POSITIVE one F₁, which #1212 does not touch; only their home moved.
    expect(p.details).toBe(`a = 4, b = 3, (${fmtAnalytic(Math.sqrt(7))}, 0), (${fmtAnalytic(-Math.sqrt(7))}, 0)`);
  });

  it("a parabola's focus and directrix move out of the equation line", () => {
    expect(curveParts({ kind: 'parabola', p: 4 })).toEqual({ equation: 'y² = 8x', details: '(2, 0), x = -2' });
    // The line terms' magnitude rule applies here too: `y² = x`, never `y² = 1x`.
    expect(curveParts({ kind: 'parabola', p: 0.5 }).equation).toBe('y² = x');
    expect(curveParts({ kind: 'parabola', p: -2 }).equation).toBe('y² = -4x');
  });

  it('a LINE row is unchanged — it was already an equation, and has nothing to fold', () => {
    const p = curveParts({ kind: 'line', a: -2, b: 1, c: -1 });
    expect(p.equation).toBe('-2x + y - 1 = 0');
    expect(p.details).toBeUndefined();
  });

  it("the operator's own circle, end to end: the row now says what he typed", () => {
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    const c = d.figure.curves.find((q) => q.stated);
    expect(c, 'the circle is on the figure').toBeTruthy();
    const known = knownCurve(d.construction, c!.id);
    expect(known?.kind).toBe('circle');
    expect(curveParts(known!).equation).toBe('(x - 3)² + (y - 4)² = 9');
  });

  it('«משוואת המעגל» is answered with the EQUATION, not with the centre and radius', () => {
    /**
     * The question that was silently answered with something else. Asking for an equation and being
     * given `O(3, 4), r = 3` is the ask lane answering a different question than the one asked — and
     * it is the case the injected stub could never have caught, because the stub returned ''.
     */
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    const a = ask(d, 'משוואת מעגל I', fmtAnalytic);
    expect(a.unreadable).toBeFalsy();
    expect(a.value).toBe('(x - 3)² + (y - 4)² = 9');
  });

  it('an UNFIXED curve still shows its open form rather than an invented equation (#1023)', () => {
    // `p` is a free symbol, so there is no number to put in the equation and none is invented.
    const d = derive(['נתונה פרבולה שמשוואתה y^2=2px'], 0);
    const c = d.figure.curves.find((q) => q.stated);
    expect(c, 'the parabola is on the figure').toBeTruthy();
    expect(knownCurve(d.construction, c!.id), 'nothing has fixed p').toBeNull();
  });
});
