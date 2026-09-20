/**
 * #1219 (ADR-AG-121) — a line's row carries its slope and its explicit form, and a VERTICAL line
 * says «אנכי» rather than nothing.
 *
 * **Operator, 2026-09-19, playing T23:** *"when showing a line in the data panel, the slope is not
 * shown under the line equation. i also want to have the 2nd display option for the line - which is
 * the y=mx+b format. this and the slope are below the line collapsable"*.
 *
 * A change request against #1212 (ADR-AG-097), which said *"a LINE has no details: it was already
 * nothing but its equation."* Right about the equation, wrong about everything else a line knows —
 * measured, the slope was already reachable by ASKING («שיפוע l1» → "2") and simply had nowhere to
 * be shown. The «שיפועים» section does not cover it either: that iterates `figure.segments`, and a
 * stated line is a curve with no segment.
 *
 * ## The vertical case is the bug inside the request
 *
 * «שיפוע l2» on `x = 4` answered **null** — understood, unanswered, blank. This tree already had the
 * right rule for the identical situation on a SEGMENT: *"a vertical segment has no slope, and
 * saying so is knowledge too — «אנכי» is an answer, not an absence."* The line was the one surface
 * that had not inherited it, and moving the slope into the row without fixing it would have rendered
 * an empty detail for every vertical line.
 */
import { describe, expect, it } from 'vitest';
import { curveParts, explicitLineText, slopeOf, lineText } from '../app/curveText';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';

/** The word the panel supplies. Spelled out here so the test does not depend on the locale file. */
const W = { vertical: 'אנכי (אין שיפוע)' };

/** What the PANEL would show for the one curve in a figure — the real path, gate included. */
function panelRow(lines: string[]) {
  const d = derive(lines);
  expect(d.faults, lines.join(' | ')).toEqual([]);
  const cu = d.figure.curves[0];
  const known = knownCurve(d.construction, cu.id);
  return known ? curveParts(known, undefined, W) : null;
}

describe('ADR-AG-121 — a line row shows its slope and explicit form (#1219)', () => {
  it.each([
    ['y = 2x + 1', 'נתון הישר l1: y=2x+1', '-2x + y - 1 = 0', 'y = 2x + 1, m = 2'],
    ['horizontal', 'נתון הישר l3: y=3', 'y - 3 = 0', 'y = 3, m = 0'],
    ['through the origin', 'נתון הישר l5: y=0', 'y = 0', 'y = 0, m = 0'],
  ])('%s', (_what, line, equation, details) => {
    expect(panelRow([line])).toEqual({ equation, details });
  });

  /**
   * THE VERTICAL LINE. Its details are the WORD, and specifically not an empty string — an empty
   * detail is what moving the slope into the row would otherwise have produced, and it reads to a
   * student as the tool having nothing to say about a line it knows is vertical.
   */
  it('a vertical line says «אנכי», and offers no explicit form', () => {
    const r = panelRow(['נתון הישר l2: x=4']);
    expect(r).toEqual({ equation: 'x - 4 = 0', details: W.vertical });
    expect(explicitLineText(1, 0, -4)).toBeNull();
    expect(slopeOf(1, 0)).toBeNull();
  });

  /**
   * THE HONESTY GATE, which is not new — the panel already reads a curve only when `knownCurve`
   * vouches for it. Asserted because this change is what gives a line something to print: an open
   * line must gain no slope built from one configuration's numbers (ADR-052).
   */
  it('an OPEN line gains no invented slope', () => {
    expect(panelRow(['נקודה A', 'נקודה B', 'P(1,5)', 'דרך P עובר ישר מקביל ל AB'])).toBeNull();
  });
});

/**
 * A FRACTIONAL SLOPE KEEPS #1180's RULING.
 *
 * `lineText` never prints a fraction coefficient: #1180 scales the whole equation, because `-4/3x`
 * is ambiguous (`4/(3x)`?) and typesets badly. The explicit form cannot use that escape — its `y`
 * coefficient is fixed at 1 — so it writes the fraction AFTER the variable instead, which is how a
 * textbook writes it. Locked, because printing `y = -1/2x` would reintroduce the exact shape an ADR
 * removed, in a row sitting directly beneath one that obeys it.
 */
describe('ADR-AG-121 — a fractional slope is written the textbook way (#1219)', () => {
  it.each([
    ['m = -1/2', 'נתון הישר l4: x+2y=7', 'y = -x/2 + 7/2'],
    ['m = 3/4', 'נתון הישר l6: 3x-4y=0', 'y = 3x/4'],
    ['m = -2/3', 'נתון הישר l7: 2x+3y=6', 'y = -2x/3 + 2'],
  ])('%s', (_what, line, explicit) => {
    expect(panelRow([line])!.details!.startsWith(explicit)).toBe(true);
  });

  it('never a fraction standing directly in front of x', () => {
    for (const [a, b, c] of [
      [1, 2, -7],
      [3, -4, 0],
      [2, 3, -6],
      [1, 3, 1],
      [5, 7, -2],
    ] as const) {
      const s = explicitLineText(a, b, c);
      expect(s, `${a}x + ${b}y + ${c} = 0`).not.toBeNull();
      expect(s!, `${s} — a fraction must not sit in front of x`).not.toMatch(/\d\/\d+x/);
    }
  });

  /** And the GENERAL form is untouched — #1180's own rule still holds in the row above. */
  it('the general form still clears its fractions', () => {
    expect(lineText(1, 2, -7)).toBe('x + 2y - 7 = 0');
    expect(lineText(-4 / 3, 1, 0)).not.toMatch(/\//);
  });
});

/**
 * The other three kinds were given their details by #1212 and must not move. This change touches one
 * branch of a switch, and this is the row that proves it touched only that one.
 */
describe('ADR-AG-121 — the other curve kinds are untouched (#1219)', () => {
  it.each([
    ['circle', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', '(x - 3)² + (y - 4)² = 9', '(3, 4), r = 3'],
    ['parabola', 'y^2=54x', 'y² = 54x', '(27/2, 0), x = -27/2'],
  ])('%s', (_what, line, equation, details) => {
    expect(panelRow([line])).toEqual({ equation, details });
  });

  /** A caller with no locale gets no vertical word rather than an English one in a Hebrew panel. */
  it('without the words, a vertical line simply has no details', () => {
    expect(curveParts({ kind: 'line', a: 1, b: 0, c: -4 })).toEqual({ equation: 'x - 4 = 0' });
  });
});
