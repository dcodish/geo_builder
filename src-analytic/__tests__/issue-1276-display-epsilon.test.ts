/**
 * #1276 — A DISPLAY DECISION IS MEASURED IN THE FIGURE'S UNITS, NOT IN 1e-12.
 *
 * Operator, playing `prod/2026-09-20`: *"take a look at the equation of AD. first, we dont show a
 * מקדם of 0. so equation should be x-1=0. next, the slope there is completely off"*. The panel showed
 *
 *     משוואת הישר AD:  x + 0y - 1 = 0
 *       איך מגיעים לזה
 *         m = (0 - 6) / (1 - 1) = -274387429.37
 *
 * while the slopes list three rows above said «AD: (אין שיפוע) אנכי» — one line, two answers.
 *
 * Both came from ONE cause: every printer decided "is this zero / is this vertical" with an absolute
 * `1e-12`, and a solved foot carries the solver's residual — measured on that very figure,
 * `D.x − A.x = 3.6e-9`, three and a half orders ABOVE the guard. The functions are correct on exact
 * input, which is why no hand-written test saw it.
 *
 * These locks are therefore written on the DERIVED figure and never on hand-typed coordinates: typed
 * exact input passes against the pre-fix code, so a lock written that way would prove nothing.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';
import { curveParts } from '../app/curveText';
import { knownCurve } from '../engine/evaluate';
import { isVertical, isVerticalLine, verticality, VERTICAL_TOL } from '../engine/lines';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The operator's own figure: the altitude to a horizontal side, so `AD` is vertical and SOLVED. */
const HIS = ['A(1,6)', 'B(-3,0)', 'C(5,0)', 'משולש ABC', 'AD גובה לצלע BC'];

/** The same construction on a scalene figure — `AD` is a real sloped altitude. The control. */
const SLOPED = ['A(1,6)', 'B(-3,0)', 'C(5,2)', 'משולש ABC', 'AD גובה לצלע BC'];

const answer = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic);

/** The body of a general-form equation — everything the student reads before the `= 0`. */
const bodyOf = (eq: string) => eq.split('=')[0].trim();

/**
 * A term that PRINTS as zero, anywhere in a general form: `0`, `0x`, `0y`, with or without a sign in
 * front. This is the class the operator reported, stated once and applied to every row below.
 */
const hasZeroTerm = (eq: string) => /(^|[+\-]\s*)0(\s*[a-z])?(\s|$)/.test(bodyOf(eq));

describe('#1276 — the operator’s own figure', () => {
  it('AD’s equation drops the zero coefficient', () => {
    const a = answer(HIS, 'משוואת הישר AD');
    expect(a.value).toBe('x - 1 = 0'); // was «x + 0y - 1 = 0»
  });

  it('AD’s working says the line is vertical instead of dividing by a printed zero', () => {
    const a = answer(HIS, 'משוואת הישר AD');
    expect(a.trace).toBeDefined();
    expect(a.trace!).toContain('אנכי');
    // the defect in one assertion: no slope may be printed for a line that has none
    expect(a.trace!).not.toMatch(/m\s*=/);
    // and nothing absurd survives anywhere in the working
    expect(a.trace!).not.toMatch(/\d{5,}/);
  });

  it('the noise that caused it is REAL — this figure is why an absolute guard cannot work', () => {
    const d = derive(HIS, 0);
    const A = d.figure.points.find((p) => p.id === 'A')!;
    const D = d.figure.points.find((p) => p.id === 'D')!;
    const noise = Math.abs(D.x - A.x);
    expect(noise).toBeGreaterThan(1e-12); // it survived the old guard …
    expect(isVertical(D.x - A.x, D.y - A.y)).toBe(true); // … and is vertical by the relative one
  });
});

describe('#1276 — the class: no term is printed that reads as zero', () => {
  for (const [name, lines] of [
    ['the operator’s figure', HIS],
    ['a scalene twin', SLOPED],
    ['a figure whose side is the x-axis', ['A(0,0)', 'B(6,0)', 'C(2,5)', 'משולש ABC']],
    ['a figure with a stated line', ['A(0,0)', 'B(4,4)', 'משוואת הישר l1 היא y=x']],
  ] as Array<[string, string[]]>) {
    it(name, () => {
      const d = derive(lines, 0);
      const seen: string[] = [];
      // every segment the figure drew, asked the way the panel asks
      for (const seg of d.figure.segments) {
        const a = ask(d, `משוואת הישר ${seg.ends[0]}${seg.ends[1]}`, fmtAnalytic);
        if (typeof a.value === 'string') seen.push(a.value);
      }
      // and every curve the figure holds, printed the way the panel prints it
      for (const cu of d.figure.curves) {
        const k = knownCurve(d.construction, cu.id);
        if (k) seen.push(curveParts(k).equation);
      }
      expect(seen.length).toBeGreaterThan(0); // a lock that checked nothing would pass silently
      for (const eq of seen) expect(hasZeroTerm(eq), `«${eq}» prints a zero term`).toBe(false);
    });
  }
});

describe('#1276 — one verticality answer, not five', () => {
  it('the pair form and the line form agree, on the real noise magnitude', () => {
    const dx = 3.605854e-9;
    const dy = -6;
    expect(isVertical(dx, dy)).toBe(true);
    // the line through that direction is `ax + by + c = 0` with (a, b) = (dy, −dx)
    expect(isVerticalLine(dy, -dx)).toBe(true);
  });

  it('a genuinely sloped direction is not vertical in either form', () => {
    expect(isVertical(3, 6)).toBe(false);
    expect(isVerticalLine(6, -3)).toBe(false);
  });

  it('the ratio is scale-free — the same shape at 1 unit and at 10 000', () => {
    expect(verticality(1e-9, 6)).toBeCloseTo(verticality(1e-9 * 1e4, 6 * 1e4), 12);
    expect(VERTICAL_TOL).toBeLessThan(1e-4); // a tolerance loose enough to call a real line vertical
  });

  it('the slopes panel asks the SHARED question rather than its own', () => {
    // ADR-W-053: the lock reads the caller, because the defect was two surfaces deciding separately.
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).toContain('verticality(v.dx, v.dy)');
    expect(app).toContain('VERTICAL_TOL');
    expect(app).not.toMatch(/Math\.abs\(v\.dx\) \/ Math\.max/); // the inline copy is gone
  });
});

describe('#1276 — the control: a line that HAS a slope still teaches it', () => {
  it('the scalene twin keeps its m and its point-slope line', () => {
    const a = answer(SLOPED, 'משוואת הישר AD');
    expect(a.trace).toBeDefined();
    expect(a.trace!).toMatch(/m\s*=/);
    expect(a.trace!).not.toContain('אנכי');
    expect(typeof a.value).toBe('string');
    expect(hasZeroTerm(a.value as string)).toBe(false);
  });

  it('a horizontal line prints its own explicit form, unchanged', () => {
    const a = answer(['A(0,0)', 'B(6,0)', 'AB'], 'משוואת הישר AB');
    expect(typeof a.value).toBe('string');
    expect(hasZeroTerm(a.value as string)).toBe(false);
  });
});
