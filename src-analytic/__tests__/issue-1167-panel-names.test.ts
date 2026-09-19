/**
 * #1167 (ADR-AG-115) — a described position is named by the point that OCCUPIES it, never by an
 * invented letter.
 *
 * Operator, 2026-09-17, with a screenshot: *"i see that we now have 2 points on the same location A
 * and O. this should not happen. if a point that we didnt name is now on a given point, it should get
 * the point that is already there"*.
 *
 * **There was never a point `O`.** `O`, `F`, `F₁` and `F₂` were string literals in `curveParts` —
 * four instances of one defect in a single `switch`, which is why fixing the circle alone would have
 * been the patch shape. A figure holding a real `F` and a parabola printed two different `F`s in one
 * panel.
 *
 * The locks below CALL the shipped path — `pointAt` and `curveParts` — rather than re-deriving the
 * description, and the last one pins the two consumers of `pointAt` together, since the whole point
 * of extracting it was that the panel and the centre ring stop disagreeing.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { pointAt, centresOf } from '../engine/crossings';
import { curveParts } from '../app/curveText';

/** The `details` string the panel would print for the figure's first stated curve. */
const details = (seq: string[]): string | undefined => {
  const d = derive(seq, 0) as unknown as {
    figure: { curves: { stated: boolean; curve: Parameters<typeof curveParts>[0] }[] };
  };
  const cu = d.figure.curves.find((c) => c.stated);
  if (!cu) throw new Error('no stated curve in the figure');
  return curveParts(cu.curve, (x, y) => pointAt(d.figure as never, x, y)).details;
};

/** The operator's own sequence. */
const REPORTED = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'x^2+y^2=16'];

describe('ADR-AG-115 — the panel names a position by who is there (#1167)', () => {
  /** THE REPORTED CASE: the circle's centre is where A sits, so it is A. */
  it('a circle centred on an existing point uses THAT point’s name', () => {
    expect(details(REPORTED)).toBe('A(0, 0), r = 4');
  });

  it('and the invented letter is gone', () => {
    expect(details(REPORTED)).not.toContain('O(');
  });

  /**
   * Where nobody sits, NO letter is printed. Falling back to an invented one would be the defect
   * with a different spelling, so this is the row that makes the rule a rule.
   */
  it('a circle centred where no point sits names no letter at all', () => {
    expect(details(['x^2+y^2=16'])).toBe('(0, 0), r = 4');
  });

  /** The same rule at the parabola's focus — one of the three sites that were NOT reported. */
  it('a parabola focus with nobody there names no letter', () => {
    expect(details(['y^2=54x'])).toBe('(27/2, 0), x = -27/2');
  });

  it('a parabola focus occupied by the student’s own F uses F', () => {
    expect(details(['F(13.5,0)', 'y^2=54x'])).toBe('F(27/2, 0), x = -27/2');
  });

  /**
   * THE COLLISION THE ISSUE NAMES: a real `F` elsewhere in the figure must not be confused with the
   * focus. The letter is used only when the point is AT the position.
   */
  it('a real F somewhere else does not get borrowed for the focus', () => {
    const d = details(['F(1,1)', 'y^2=54x']);
    expect(d).toBe('(27/2, 0), x = -27/2');
    expect(d).not.toContain('F(');
  });

  /**
   * Both consumers of the extracted predicate, pinned together — the reason it was extracted rather
   * than copied. If they ever disagree about whether a centre is taken, one of these fails.
   */
  it('the centre ring and the panel agree about an occupied centre', () => {
    const d = derive(REPORTED, 0) as unknown as { figure: never };
    expect(pointAt(d.figure, 0, 0)).toBe('A');
    expect(centresOf(d.figure, 'Q')).toEqual([]); // nothing offered — a point is already there
  });

  it('and about an unoccupied one', () => {
    const d = derive(['x^2+y^2=16'], 0) as unknown as { figure: never };
    expect(pointAt(d.figure, 0, 0)).toBeNull();
  });
});
