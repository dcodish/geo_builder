/**
 * #1180 — AN EXACT FRACTION IS A VALUE, NOT A COEFFICIENT · #1179 — A REFUSAL NAMES THE RIGHT KIND.
 *
 * Both found by the operator playing round #1173, and both are that round repairing its own output:
 * #1180 is a regression #1120 introduced, and #1179 is a pre-existing defect that #1150 made easy to
 * reach.
 *
 * ## #1180
 *
 * *"the data panel has something weird in the 4/3 display"* — the curve row read `-4/3x + y = 0`.
 * `4/3x` is **ambiguous** (`4/(3x)`?) and the panel typesets it as a stacked fraction wedged
 * mid-equation. Ruling: **clear the fractions**, `-4x + 3y = 0`, the form a textbook prints.
 *
 * The standalone value is untouched and that is the whole distinction being locked here: **`4/3` is
 * right as a value and wrong as a coefficient.** T18 confirmed the exact tier is honest (`1.3333`
 * stays `1.33`), so this is purely about placing a number into an expression.
 *
 * ## #1179
 *
 * *"the message is wrong — הנקודה l7 … it should be **the line** l7"*. One point-shaped sentence served
 * every missing reference. Asserted here on the **rendered** string through the real locale, because a
 * key that exists proves nothing about the sentence a student reads.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { refKindOf } from '../engine/apply';
import { lineText } from '../app/curveText';
import { fmtAnalytic, fractionClearingFactor } from '../format';
import { analyticI18n } from '../i18n';

// ---------------------------------------------------------------------------
// #1180 — the equation row
// ---------------------------------------------------------------------------

describe('#1180 — no fraction survives as a coefficient', () => {
  it('the operator’s figure: the row reads -4x + 3y = 0', () => {
    const d = derive(['A(0,0)', 'B(3,4)', 'משוואת הישר AB היא y=(4/3)x'], 0);
    const o = d.construction.objects.find((x) => x.kind === 'curve')!;
    const k = knownCurve(d.construction, o.id)!;
    expect(k.kind).toBe('line');
    if (k.kind === 'line') expect(lineText(k.a, k.b, k.c)).toBe('-4x + 3y = 0');
  });

  it.each([
    [[-4 / 3, 1, 0], '-4x + 3y = 0'],
    [[1 / 2, 1, -3], 'x + 2y - 6 = 0'],
    [[2, -1, 1 / 3], '6x - 3y + 1 = 0'],
    [[-1 / 3, 1, 5], '-x + 3y + 15 = 0'],
  ] as const)('%s → %s', (coeffs, want) => {
    expect(lineText(coeffs[0], coeffs[1], coeffs[2])).toBe(want);
  });

  /** An integer equation was never the problem and must not be touched — no `2/1`, no rescaling. */
  it('integer coefficients are left exactly alone', () => {
    expect(lineText(2, -1, 0)).toBe('2x - y = 0');
    expect(lineText(1, 0, -4)).toBe('x - 4 = 0');
    expect(lineText(3, -4, 12)).toBe('3x - 4y + 12 = 0');
  });

  /**
   * A coefficient with NO small rational form cannot be cleared, and the equation is left as it is
   * rather than scaled by something meaningless. The honest fallback.
   */
  it('a surd coefficient falls through to decimals', () => {
    expect(fractionClearingFactor([Math.SQRT2, 1, 0])).toBeNull();
    expect(lineText(Math.SQRT2, 1, 0)).toBe('1.41x + y = 0');
  });

  /**
   * THE DISTINCTION THIS ISSUE IS ABOUT — the same number, two positions, two right answers.
   * If this ever collapses into one rule, one of the two surfaces has become wrong.
   */
  it('the STANDALONE value keeps its fraction — 4/3 is a value, not a coefficient', () => {
    expect(fmtAnalytic(4 / 3)).toBe('4/3');
    const d = derive(['A(0,0)', 'B(3,4)', 'משוואת הישר AB היא y=(4/3)x'], 0);
    expect(ask(d, 'שיפוע הישר AB', fmtAnalytic).value).toBe('4/3');
  });

  it('the sign is not normalised — the ruling wrote -4x + 3y = 0, not 4x - 3y = 0', () => {
    expect(lineText(-4 / 3, 1, 0)).toBe('-4x + 3y = 0');
  });
});

// ---------------------------------------------------------------------------
// #1179 — the refusal's noun
// ---------------------------------------------------------------------------

const KEY = {
  point: 'errUnknownRefPoint',
  line: 'errUnknownRefLine',
  circle: 'errUnknownRefCircle',
  curve: 'errUnknownRef',
} as const;

/** The sentence a student actually reads, through the real locale. */
function message(setup: string[], line: string, lng: 'he' | 'en'): { kind?: string; text: string } {
  const v = decideSubmit(line, setup, 0);
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${v.kind}`);
  const e = v.error as { key: string; detail: string; expected?: keyof typeof KEY };
  const t = analyticI18n.getFixedT(lng);
  return { kind: e.expected, text: String(t(KEY[e.expected ?? 'curve'], { detail: e.detail })) };
}

describe('#1179 — the refusal names the kind the statement expected', () => {
  it('a missing LINE is called a line', () => {
    const he = message(['A(0,0)'], 'נקודה D היא חיתוך של l7 ו- l8', 'he');
    expect(he.kind).toBe('line');
    expect(he.text).toContain('הישר');
    expect(he.text).not.toContain('הנקודה');
    expect(he.text).toContain('l7');
    expect(message(['A(0,0)'], 'נקודה D היא חיתוך של l7 ו- l8', 'en').text).toContain('The line');
  });

  it('a missing CIRCLE is called a circle', () => {
    const he = message(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 'O מרכז המעגל Z', 'he');
    expect(he.kind).toBe('circle');
    expect(he.text).toContain('המעגל');
    expect(he.text).not.toContain('הנקודה');
    expect(he.text).toContain('Z');
  });

  it('a missing POINT is still called a point — the row that was always right', () => {
    const he = message(['A(0,0)'], 'M אמצע AB', 'he');
    expect(he.kind).toBe('point');
    expect(he.text).toContain('הנקודה');
    expect(he.text).toContain('B');
  });

  /** The kind comes from the id the parser minted, so no call site has to remember to say. */
  it('refKindOf reads the prefix, and an anonymous curve gets the kind-free wording', () => {
    expect(refKindOf('line-l7')).toBe('line');
    expect(refKindOf('circle-Z')).toBe('circle');
    expect(refKindOf('curve-3f2a')).toBe('curve');
    expect(refKindOf('B')).toBe('point');
    const t = analyticI18n.getFixedT('he');
    // The fallback names no kind at all rather than guessing one.
    const generic = String(t(KEY.curve, { detail: 'x' }));
    expect(generic).not.toContain('הנקודה');
    expect(generic).not.toContain('הישר');
  });

  /** #1145's guarantee, still standing: the detail is the student's word, never an internal id. */
  it('the detail is still the student’s own name', () => {
    expect(message(['A(0,0)'], 'נקודה D היא חיתוך של l7 ו- l8', 'he').text).not.toContain('line-l7');
    expect(message(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 'O מרכז המעגל Z', 'he').text).not.toContain('circle-Z');
  });
});
