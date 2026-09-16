/**
 * #1108 — a crossing with a CONIC lies on the DRAWN object, not on its supporting line.
 *
 * Operator, playing T11/T12: *"why was point S created?"* — the answer being that `S` sat on the line
 * through side `CA`, past `C`, where nothing is drawn. The student drew a triangle and the tool offered
 * points floating above it with no visible object through them, so the figure could not be read: the
 * thing `S` is a crossing OF is invisible. The offered sentence even said «הישר CA» — *the LINE CA* —
 * for something the student had stated as a side.
 *
 * **Root cause: the new loop did not call the bound the old one already calls.** A segment carries its
 * drawn extent in `Straight.within`, and `meet()` (straight × straight) has honoured it since
 * ADR-AG-021, which fixed exactly this class for the diagonal meet. `meetConic()` — added by #1096 the
 * same day — never referenced `l.within`, so a segment's supporting line was intersected with the conic
 * over its whole infinite extent.
 *
 * So this is ADR-AG-021's class re-opened on a new code path, not a new defect: *"an invented point is
 * the same class of defect as a dropped given"*. The machinery existed and the new loop did not call it.
 *
 * The control case is what makes this a fix rather than a suppression: an explicitly STATED line has
 * `within === null` and is genuinely unbounded, so it must still offer both roots.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingsOf } from '../engine/crossings';

/** The operator's own figure, from the issue. */
const TRIANGLE = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];
const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';

const crossings = (lines: string[]) => {
  const d = derive(lines, 0);
  return crossingsOf(d.figure, d.construction);
};

/** Is `p` inside the triangle's bounding box, with a little slack? Anything outside is off the sides. */
const onTheDrawnFigure = (p: { x: number; y: number }) =>
  p.x >= -0.51 && p.x <= 6.51 && p.y >= -0.51 && p.y <= 5.51;

describe('#1108 — a conic crossing respects the drawn extent', () => {
  it('offers no point beyond the ends of a SIDE — the operator’s reported case', () => {
    const found = crossings([...TRIANGLE, CIRCLE]);
    expect(found.length).toBeGreaterThan(0);

    const offFigure = found.filter((p) => !onTheDrawnFigure(p));
    expect(
      offFigure.map((p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`),
      'a crossing was offered where nothing is drawn',
    ).toEqual([]);
  });

  it('still offers the crossings that ARE on the sides', () => {
    /**
     * The other half, and the reason this is not just "return fewer rings": the circle really does cut
     * the drawn sides, and those crossings are exactly what the feature is for.
     */
    const found = crossings([...TRIANGLE, CIRCLE]);
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) expect(onTheDrawnFigure(p)).toBe(true);
  });

  it('CONTROL — a STATED line is unbounded and still offers both roots', () => {
    /**
     * This is what proves the fix distinguishes a segment from a line rather than simply narrowing
     * everything. «נתון הישר y=2» has no drawn extent (`within === null`), so both its intersections
     * with the circle are real offers, including ones far outside the triangle.
     */
    const withStatedLine = crossings([...TRIANGLE, CIRCLE, 'נתון הישר y=2']);
    const onThatLine = withStatedLine.filter((p) => Math.abs(p.y - 2) < 1e-6);
    expect(onThatLine.length).toBeGreaterThanOrEqual(2);
  });

  it('a stated line’s crossings are NOT clipped to the figure’s box', () => {
    /**
     * Sharper than the case above: a stated line crossing a circle whose intersections lie outside the
     * triangle must still be offered. If `within` were applied to stated lines too, this would be empty
     * — which is the failure mode "just filter harder" would have produced.
     */
    const found = crossings(['A(0,0)', 'B(1,0)', 'הקטע AB', 'נתון מעגל J שמשוואתו x^2+y^2=100', 'נתון הישר y=0']);
    const far = found.filter((p) => Math.abs(p.x) > 5);
    expect(far.length).toBeGreaterThan(0);
  });
});
