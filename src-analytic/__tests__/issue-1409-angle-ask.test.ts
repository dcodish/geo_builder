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

describe('#1409 — the ruled working, one case per branch, ending on the answer', () => {
  const lastNumber = (t: string) => {
    const ms = [...t.matchAll(/= ([\d.]+)°$/gm)];
    return ms.length ? ms[ms.length - 1][1] : null;
  };

  it('general (slope method): acute angle, tan formula shown', () => {
    const d = derive(['V(0,0)', 'X(4,1)', 'Y(1,4)'], 0);
    const a = ask(d, 'זווית XVY', fmt);
    expect(a.trace).toContain('tan α');
    expect(a.value).toBe(`${lastNumber(a.trace!)}°`);
  });

  it('obtuse: the slope method plus the 180° − α step', () => {
    const d = derive(['V(0,0)', 'X(4,1)', 'Y(-4,1)'], 0);
    const a = ask(d, 'זווית XVY', fmt);
    expect(a.trace).toContain('tan α');
    expect(a.trace).toContain('180°');
    expect(a.value).toBe(`${lastNumber(a.trace!)}°`);
  });

  it('a vertical arm: the law of cosines', () => {
    const d = derive(['V(0,0)', 'X(0,5)', 'Y(3,1)'], 0);
    const a = ask(d, 'זווית XVY', fmt);
    expect(a.trace).toContain('cos ∠XVY');
    expect(a.value).toBe(`${lastNumber(a.trace!)}°`);
  });

  it('perpendicular arms: the law of cosines, answering 90°', () => {
    const d = derive(['V(0,0)', 'X(2,2)', 'Y(-2,2)'], 0);
    const a = ask(d, 'זווית XVY', fmt);
    expect(a.trace).toContain('cos ∠XVY');
    expect(a.value).toBe('90°');
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
