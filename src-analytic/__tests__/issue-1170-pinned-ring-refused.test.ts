/**
 * #1170 — A SHAPE NOUN PROMISES A RING, AND PINNED POINTS THAT ARE NOT THAT RING ARE REFUSED.
 *
 * **Operator ruling, 2026-09-17: refuse the line.** He hit this by accident playing round #1169 T5 —
 * typed `D(1,0)` instead of the sheet's `D(0,4)`, which put `D` on segment `AB` — and reported *"a quad
 * should have been rejected for this case"*, not knowing he was looking at a known gap. Offered
 * draw-with-a-notice as the session's recommendation, he chose the refusal and overruled it.
 *
 * ## Why this was not a one-line gate
 *
 * `ringViolation` has SEEN these figures since #1158/#1166; `drawableAt` uses it to CHOOSE a
 * configuration, which is what fixed both of those reports. What was missing is the case with nothing
 * to choose: every figure this fires on has `reportedDof = 0`, because with the preference inside the
 * search a figure that still has freedom never arrives carrying a ring fault. The student pinned the
 * coordinates, and those coordinates are what make the ring collapsed or crossed.
 *
 * That is also why the message is about the RING and not about a failed search — «לא נמצאה תצורה שבה
 * מתקיים» would be false on a determined figure, where only one configuration was ever possible.
 *
 * ## The reconciliation, which is the part that had no uncontested answer
 *
 * «P מפגש האנכים האמצעיים במשולש ABC» on three collinear points declares the triangle AND asks for its
 * circumcentre, so one line carries a ring fault and ADR-AG-008's `does-not-exist` at once.
 * `does-not-exist` names what the student actually asked for and is the truer message; a second,
 * differently-worded refusal on the same line is noise. Asserted below as ONE message, by code.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';

const codesOf = (lines: readonly string[]) => derive(lines).faults.map((f) => f.code);

describe('#1170 — the operator’s own figure', () => {
  /** His exact five lines, with the `D(1,0)` he actually typed. A, D and B are collinear. */
  const HIS = ['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(1,0)', 'מרובע ABCD'];

  it('is refused, on the line that named the shape', () => {
    expect(derive(HIS).faults).toEqual([
      { index: 4, code: 'ring-contradicts-noun', detail: 'מרובע ABCD' },
    ]);
  });

  it('is refused at the SUBMIT gate too — the line is never recorded', () => {
    const verdict = decideSubmit('מרובע ABCD', HIS.slice(0, 4), 0);
    expect(verdict).toMatchObject({ kind: 'refused', error: { key: 'ring-contradicts-noun' } });
  });

  /**
   * The counter-direction, and the lock that keeps this from becoming "the tool refuses quadrilaterals".
   * The sheet's INTENDED `D(0,4)` is a genuine concave quad — a legitimate «מרובע» that the exam draws.
   * It already has a lock in `issue-1158-1166-polygon-noun-validity.test.ts`; it is asserted here too,
   * because this is the fix that could break it.
   */
  it('but the sheet’s intended D(0,4) still builds — concave is not crossed', () => {
    const intended = ['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'מרובע ABCD'];
    expect(derive(intended).faults).toEqual([]);
    expect(decideSubmit('מרובע ABCD', intended.slice(0, 4), 0).kind).toBe('record');
  });
});

/**
 * BOTH MEMBERS, on the ruling's stated reach. He ruled on a DEGENERATE pinned ring; a CROSSED one is
 * the same sentence — *a shape noun promises a ring, and these points are not that ring* — and
 * splitting them would leave that half silent for no reason either of us gave.
 */
describe('#1170 — degenerate and crossed are one ruling', () => {
  it('a pinned crossed quadrilateral is refused', () => {
    expect(codesOf(['A(0,0)', 'B(1,0)', 'C(0,1)', 'D(1,1)', 'מרובע ABCD'])).toEqual([
      'ring-contradicts-noun',
    ]);
  });

  it('a pinned collinear triangle is refused', () => {
    expect(codesOf(['A(0,0)', 'B(1,0)', 'C(2,0)', 'משולש ABC'])).toEqual(['ring-contradicts-noun']);
  });
});

describe('#1170 — one message per line, and the truer one wins', () => {
  /**
   * The three `derived.test.ts` rows that stopped this arm being built. ADR-AG-008 already answers
   * «P מפגש האנכים האמצעיים במשולש ABC» on collinear points with `does-not-exist` — the circumcentre is
   * what the student asked for and it is what does not exist.
   */
  it('a collinear circumcentre keeps does-not-exist and gains NO second refusal', () => {
    expect(
      codesOf(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC']),
    ).toEqual(['does-not-exist']);
  });
});

/**
 * THE GATE CONDITION, asserted as a property rather than trusted from the docblock. A figure that still
 * has FREEDOM must be untouched: with freedom left, 24 exhausted seeds are evidence and not proof
 * (#1071), and refusing there could reject a satisfiable figure — the opposite defect.
 */
describe('#1170 — a figure with freedom is not touched', () => {
  it('a free quadrilateral builds and is recorded', () => {
    expect(derive(['מרובע ABCD']).faults).toEqual([]);
    expect(decideSubmit('מרובע ABCD', [], 0).kind).toBe('record');
  });

  it('a partly-pinned quadrilateral with freedom left builds', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'מרובע ABCD'];
    expect(derive(lines).faults).toEqual([]);
    expect(derive(lines).figure.carrierDof).toBeGreaterThan(0);
  });

  /**
   * And the precondition that keeps the row above meaningful: the freedom is what spares it, not the
   * points happening to be fine. The same shape with every point pinned into a bow-tie IS refused.
   */
  it('…and the same ring, fully pinned into a bow-tie, is refused', () => {
    expect(codesOf(['A(0,0)', 'B(4,0)', 'C(0,4)', 'D(4,4)', 'מרובע ABCD'])).toEqual([
      'ring-contradicts-noun',
    ]);
  });
});
