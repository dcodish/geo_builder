/**
 * #1409 — «זווית BMC» IS ASKABLE (ADR-AG-176): sayable ⇒ askable, with the ruled working.
 *
 * Operator: «in data panel, i cannot ask for זווית BMC». #1331 made the three-letter angle a GIVEN;
 * no ask arm existed, and nothing checked that sayable ⇒ askable. The arm reads the SAME parser
 * atoms (`readAngleAsk`) and answers with the SAME `angleAt` the residual constrains, through the
 * same honesty gate as every value arm. The working follows the operator's 2026-09-27 ruling:
 * slope method where it works (obtuse adds the 180°−α step), else the law of cosines.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';

const fmt = (v: number) => `${Math.round(v * 100) / 100}`;
/** The issue's measured figure — fully determined. */
const FIGURE = ['B(0,0)', 'C(6,0)', 'A(2,4)', 'משולש ABC', 'M אמצע AC'];

describe('#1409 — every reported spelling answers on the determined figure', () => {
  const d = derive(FIGURE, 0);
  const expected = ask(d, 'זווית BMC', fmt).value;

  it('the operator’s «זווית BMC» answers a degree value', () => {
    expect(expected).toMatch(/^\d+(\.\d+)?°$/);
  });

  it.each(['הזווית BMC', '∠BMC', 'angle BMC', 'גודל הזווית BMC'])('«%s» answers the same value', (q) => {
    const a = ask(d, q, fmt);
    expect(a.unreadable, JSON.stringify(a)).toBeFalsy();
    expect(a.value).toBe(expected);
  });

  it.each(['זווית ABC', '∠ABC', 'זווית BAC'])('«%s» answers', (q) => {
    const a = ask(d, q, fmt);
    expect(a.unreadable).toBeFalsy();
    expect(a.value).toMatch(/°$/);
  });
});

describe('#1409 — the honesty gates', () => {
  it('an OPEN figure answers open — never a sampled number, never unreadable', () => {
    const a = ask(derive(['משולש ABC', 'M אמצע AC'], 0), 'זווית BMC', fmt);
    expect(a.unreadable).toBeFalsy();
    expect(a.value).toBeNull();
  });

  it('a letter the figure lacks gets the missing outcome (#1111), not unreadable', () => {
    const a = ask(derive(['B(0,0)', 'C(6,0)'], 0), 'זווית BXC', fmt);
    expect(a.missing).toEqual({ name: 'X', kind: 'point' });
  });

  it('the 60° round trip: a stated angle asked back prints exactly 60°', () => {
    const d = derive(['B(0,0)', 'C(6,0)', 'משולש ABC', 'זווית ABC = 60', 'AB = 4'], 0);
    expect(ask(d, 'זווית ABC', fmt).value).toBe('60°');
  });
});

/**
 * #1525 (operator, 2026-09-29, reversing the 2026-09-27 trace ruling): no worked formula — the
 * tan-difference formula is outside the curriculum. A method HINT instead, with the law of cosines
 * offered only when all three vertices are known.
 */
describe('#1525 — a method hint, never a worked formula', () => {
  it('his T26 case: 135°, the full hint, and no formula rows', () => {
    const a = ask(derive(['A(0,0)', 'B(4,0)', 'C(8,4)'], 0), 'זווית ABC', fmt);
    expect(a.value).toBe('135°');
    expect(a.trace).toBeUndefined();
    expect(a.hint).toBe('angle-methods');
  });

  it.each([
    [['V(0,0)', 'X(4,1)', 'Y(1,4)'], 'general'],
    [['V(0,0)', 'X(0,5)', 'Y(3,1)'], 'a vertical arm'],
    [['V(0,0)', 'X(2,2)', 'Y(-2,2)'], 'perpendicular arms'],
  ])('%j (%s): no trace in any geometry', (lines) => {
    const a = ask(derive(lines as string[], 0), 'זווית XVY', fmt);
    expect(a.value).not.toBeNull();
    expect(a.trace).toBeUndefined();
    expect(a.hint).toBe('angle-methods');
  });

  it('a STATED angle asked back: the value, and no hint (operator, 2026-09-29, T33)', () => {
    const d = derive(['B(0,0)', 'C(6,0)', 'משולש ABC', 'זווית ABC = 60'], 0);
    for (const q of ['זווית ABC', 'זווית CBA']) {
      const a = ask(d, q, fmt);
      expect(a.value, q).toBe('60°');
      expect(a.hint, q).toBeUndefined();
      expect(a.trace, q).toBeUndefined();
    }
  });

  it('a COMPUTED angle whose vertex is free: the slopes-only hint (no three known lengths)', () => {
    // Y rides y = x in the first quadrant: ∠XVY is 45° at every configuration, Y itself is not fixed
    const d = derive(['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'Y ברביע הראשון'], 0);
    const a = ask(d, 'זווית XVY', fmt);
    expect(a.value).toBe('45°');
    expect(a.hint).toBe('angle-slopes');
  });
});

/**
 * THE CLASS GUARD (plan step 5): every VALUE measure that is sayable is askable. A new measure
 * that becomes sayable joins this list in the same commit, or its absence here is the review
 * question — the guard that would have caught #1331 shipping without its ask twin.
 */
describe('#1409 — sayable ⇒ askable, over the value measures', () => {
  const d = derive(['B(0,0)', 'C(6,0)', 'A(2,4)', 'משולש ABC', 'M אמצע AC', 'נתון הישר l1: y=9'], 0);
  it.each([
    'BM', // length
    'שטח המשולש ABC', // area
    'המרחק של A מהישר l1', // point-line distance
    'שיפוע BM', // slope
    'הזווית בין הישר BM לציר ה-x', // x-axis angle
    'זווית BMC', // the three-letter angle (#1409)
  ])('«%s» is not unreadable', (q) => {
    expect(ask(d, q, fmt).unreadable).toBeFalsy();
  });
});
