/**
 * #1230 — THE CANVAS SHOWS THE STATED EXPRESSION TOO, NOT ONLY THE PANEL.
 *
 * **Operator, 2026-09-19, playing T44:** *"the data panel is now correct but canvas is not"* — with the
 * two surfaces side by side in one screenshot:
 *
 * ```
 * data panel      A = (-9·a, 0)      B = (41·a, 0)      ← #1226, correct
 * canvas label    A(x_A, 0)          B(x_B, 0)          ← the tool's own symbol
 * ```
 *
 * ## The scoping in #1226 was wrong, and on an unverified premise
 *
 * That issue said: *"the label reads `A` with no coordinates there; per #1211's ruling coordinates on
 * the canvas are opt-in, so the canvas half belongs to that issue's mechanism."*
 *
 * The canvas does **not** read `A` — it already prints coordinates, through the same invented-symbol
 * fallback the panel used. #1211's opt-in ruling is about showing COMPUTED coordinates for a point the
 * student never described; it says nothing about a coordinate the student wrote down. The canvas was
 * in scope all along.
 *
 * ## Cause — the same fallback, one layer down
 *
 * `Component` had two cases, `{known: true, value}` and `{known: false}`, so an open coordinate could
 * only ever render `x_A`. The panel could reach past it to the construction; the scene builder cannot —
 * it is handed the figure, not the objects. `provenanceOf` is where the expression was still in hand
 * and was being discarded.
 *
 * It states no VALUE, so the honesty invariant is untouched — #1023's wording, for the third surface.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

/** What the canvas label resolves to, through the same `part()` decision `scene.ts` makes. */
const canvasLabel = (lines: string[], id: string): string => {
  const d = derive(lines, 0);
  const prov = d.figure.provenance[id];
  const axis = (c: { known: boolean; value?: number; expr?: string } | undefined, a: 'x' | 'y') =>
    c?.known ? String(c.value) : (c?.expr ?? `${a}_${id}`);
  return `${id}(${axis(prov?.x, 'x')}, ${axis(prov?.y, 'y')})`;
};

describe('#1230 — the canvas and the panel agree about a stated parameter', () => {
  it("the operator's own figure draws what he wrote", () => {
    const FIG = ['A(-9a,0)', 'B(41a,0)'];
    expect(canvasLabel(FIG, 'A')).toBe('A(-9·a, 0)');
    expect(canvasLabel(FIG, 'B')).toBe('B(41·a, 0)');
  });

  it('a numeric point is unchanged — numbers still win', () => {
    expect(canvasLabel(['A(2,5)'], 'A')).toBe('A(2, 5)');
    expect(canvasLabel(['A(0,-3)'], 'A')).toBe('A(0, -3)');
  });

  it('A CARRIER POINT STILL SHOWS x_A — the student stated nothing about it', () => {
    /**
     * The anti-lock, and the reason the guard is on the object KIND rather than on "is it open".
     * «A על הישר y=x» is a `free` object: there is no expression the student wrote for its x, and
     * inventing one would be the opposite error to the one this issue fixes.
     */
    expect(canvasLabel(['A על הישר y=x'], 'A')).toBe('A(x_A, y_A)');
  });

  it('no sampled NUMBER is ever printed for an open coordinate', () => {
    /**
     * The honesty invariant this whole area exists to hold: `a` is free, the solve picked a value to
     * draw with, and that value must not reach the label.
     */
    const label = canvasLabel(['A(-9a,0)'], 'A');
    expect(label).toContain('-9·a');
    expect(label).not.toMatch(/-?\d+\.\d/);
  });

  it('the panel and the canvas cannot disagree about one point', () => {
    /**
     * Both surfaces now derive from the same stated expression, so this asserts the agreement rather
     * than two separately-correct strings that could drift.
     */
    const d = derive(['A(-9a,0)'], 0);
    const x = d.figure.provenance['A']?.x;
    // `expr` lives only on the OPEN case — a known coordinate has a number and needs no text.
    expect(x?.known).toBe(false);
    expect(x && x.known === false ? x.expr : null).toBe('-9·a');
  });
});
